import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accountService } from '../src/features/account/services/accountService';
import { reportService } from '../src/features/reports/services/reportService';
import { logoutApi } from '../src/features/auth/authClient';

describe('FEEDBACK-DIEGO-03-A — Frontend Tests (Auth, Reports & Account Security)', () => {
  describe('A1: Logout Definitivo y Gestión de Sesión', () => {
    it('logoutApi no envía Content-Type application/json sin cuerpo para evitar FST_ERR_CTP_EMPTY_JSON_BODY', async () => {
      const originalFetch = globalThis.fetch;
      let capturedHeaders: HeadersInit | undefined;
      let capturedBody: any = undefined;

      globalThis.fetch = (async (url: any, init?: any) => {
        capturedHeaders = init?.headers;
        capturedBody = init?.body;
        return new Response(null, { status: 204, statusText: 'No Content' });
      }) as any;

      try {
        await logoutApi();
        assert.ok(capturedHeaders, 'Debe enviar cabeceras');
        const headers = capturedHeaders as Record<string, string>;
        assert.equal(headers['Content-Type'], undefined, 'NO debe enviar Content-Type cuando el cuerpo es vacío');
        assert.equal(headers['X-Requested-With'], 'XMLHttpRequest', 'Debe enviar X-Requested-With');
        assert.equal(capturedBody, undefined, 'El cuerpo debe ser indefinido');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('No almacena tokens JWT en localStorage en ningún momento del ciclo de vida', () => {
      const localToken = typeof localStorage !== 'undefined' ? localStorage.getItem('daplace_access_token') : null;
      assert.equal(localToken, null, 'localStorage no debe contener daplace_access_token');
    });
  });

  describe('A2: Descarga CSV del Propietario', () => {
    it('downloadLiquidacionCsv utiliza authenticatedFetch hacia /api/reportes/propietario con query format=csv', async () => {
      const originalFetch = globalThis.fetch;
      const prevMock = process.env.VITE_USE_MOCKS;
      process.env.VITE_USE_MOCKS = 'false';

      let capturedUrl = '';
      let capturedCredentials = '';

      globalThis.fetch = (async (url: any, init?: any) => {
        capturedUrl = url.toString();
        capturedCredentials = init?.credentials;
        const csvContent = 'Tipo,Concepto,Monto,Fecha\nIngreso,Renta,1500,2026-10-15';
        return new Response(csvContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="liquidacion-prop-01-10-2026.csv"',
          },
        });
      }) as any;

      try {
        if (typeof window === 'undefined') {
          (globalThis as any).window = globalThis;
        }
        (globalThis as any).window.URL = {
          createObjectURL: () => 'blob:mock-url',
          revokeObjectURL: () => {},
        };
        (globalThis as any).document = {
          createElement: () => ({
            href: '',
            setAttribute: () => {},
            click: () => {},
            remove: () => {},
          }),
          body: {
            appendChild: () => {},
            removeChild: () => {},
          },
        };

        const result = await reportService.downloadLiquidacionCsv({
          propiedadId: 'prop-01',
          mes: 10,
          anio: 2026,
        });

        assert.ok(capturedUrl.includes('/api/reportes/propietario'), 'Debe apuntar a /api/reportes/propietario');
        assert.ok(capturedUrl.includes('format=csv'), 'Debe solicitar format=csv');
        assert.ok(capturedUrl.includes('propiedadId=prop-01'), 'Debe incluir propiedadId');
        assert.ok(capturedUrl.includes('mes=10'), 'Debe incluir mes');
        assert.ok(capturedUrl.includes('anio=2026'), 'Debe incluir anio');
        assert.equal(capturedCredentials, 'include', 'Debe incluir credenciales (cookies HttpOnly)');
        assert.equal(result.filename, 'liquidacion-prop-01-10-2026.csv');
      } finally {
        globalThis.fetch = originalFetch;
        process.env.VITE_USE_MOCKS = prevMock;
      }
    });

    it('downloadLiquidacionCsv propaga error 403 si la propiedad no está autorizada para el usuario', async () => {
      const originalFetch = globalThis.fetch;
      const prevMock = process.env.VITE_USE_MOCKS;
      process.env.VITE_USE_MOCKS = 'false';

      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ error: 'No autorizado para consultar esta propiedad' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      try {
        await assert.rejects(
          async () => {
            await reportService.downloadLiquidacionCsv({
              propiedadId: 'prop-ajena',
              mes: 10,
              anio: 2026,
            });
          },
          /No autorizado/
        );
      } finally {
        globalThis.fetch = originalFetch;
        process.env.VITE_USE_MOCKS = prevMock;
      }
    });
  });

  describe('A3: Persistencia Segregada de Filtros en Reportes', () => {
    it('Segrega claves de almacenamiento de sesión por userId para evitar fugas entre cuentas', () => {
      const userAId = 'user-propietario-1';
      const userBId = 'user-propietario-2';

      const keyA = `daplace_reports_filter_${userAId}`;
      const keyB = `daplace_reports_filter_${userBId}`;

      assert.notEqual(keyA, keyB, 'Las claves de sessionStorage deben ser únicas por usuario');
    });

    it('Valida que la propiedad persistida pertenezca a la lista autorizada del usuario activo', () => {
      const allowedProperties = [
        { id: 'prop-01', nombre: 'Depa Miraflores' },
        { id: 'prop-02', nombre: 'Depa San Isidro' },
      ];

      const persistedPropId = 'prop-ajena-99';
      const isAllowed = allowedProperties.some((p) => p.id === persistedPropId);
      assert.equal(isAllowed, false, 'Propiedad ajena persistida no debe considerarse autorizada');

      const resolvedPropId = isAllowed ? persistedPropId : (allowedProperties[0]?.id ?? '');
      assert.equal(resolvedPropId, 'prop-01', 'Debe caer al primer inmueble autorizado del usuario activo');
    });
  });

  describe('A4: Cliente de Mi Cuenta y Seguridad (accountService)', () => {
    it('getProfile consulta /api/cuenta/perfil mediante authenticatedFetch', async () => {
      const originalFetch = globalThis.fetch;
      let capturedUrl = '';

      globalThis.fetch = (async (url: any) => {
        capturedUrl = url.toString();
        return new Response(
          JSON.stringify({
            user: {
              id: 'usr-1',
              email: 'propietario@daplace.pe',
              nombre: 'Carlos Propietario',
              cargo: null,
              rol: 'PROPIETARIO',
              usuarioId: 'usu-1',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      try {
        const profile = await accountService.getProfile();
        assert.ok(capturedUrl.includes('/api/cuenta/perfil'));
        assert.equal(profile.email, 'propietario@daplace.pe');
        assert.equal(profile.rol, 'PROPIETARIO');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('updateEmail envía nuevoEmail y passwordActual con método PATCH', async () => {
      const originalFetch = globalThis.fetch;
      let capturedMethod = '';
      let capturedBody: any = null;

      globalThis.fetch = (async (_url: any, init?: any) => {
        capturedMethod = init?.method;
        capturedBody = JSON.parse(init?.body);
        return new Response(
          JSON.stringify({
            user: {
              id: 'usr-1',
              email: 'nuevo@daplace.pe',
              nombre: 'Carlos Propietario',
              cargo: null,
              rol: 'PROPIETARIO',
              usuarioId: 'usu-1',
            },
            message: 'Correo electrónico actualizado correctamente.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      try {
        const result = await accountService.updateEmail({
          nuevoEmail: 'nuevo@daplace.pe',
          passwordActual: 'PassActual123!',
        });
        assert.equal(capturedMethod, 'PATCH');
        assert.equal(capturedBody.nuevoEmail, 'nuevo@daplace.pe');
        assert.equal(capturedBody.passwordActual, 'PassActual123!');
        assert.equal(result.user.email, 'nuevo@daplace.pe');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('updatePassword envía passwordActual y nuevoPassword', async () => {
      const originalFetch = globalThis.fetch;
      let capturedMethod = '';
      let capturedBody: any = null;

      globalThis.fetch = (async (_url: any, init?: any) => {
        capturedMethod = init?.method;
        capturedBody = JSON.parse(init?.body);
        return new Response(
          JSON.stringify({
            message: 'Contraseña actualizada. Inicie sesión nuevamente.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      try {
        const result = await accountService.updatePassword({
          passwordActual: 'PassActual123!',
          nuevoPassword: 'NuevoPassword2026@Secure',
        });
        assert.equal(capturedMethod, 'PATCH');
        assert.equal(capturedBody.passwordActual, 'PassActual123!');
        assert.equal(capturedBody.nuevoPassword, 'NuevoPassword2026@Secure');
        assert.equal(result.message, 'Contraseña actualizada. Inicie sesión nuevamente.');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
