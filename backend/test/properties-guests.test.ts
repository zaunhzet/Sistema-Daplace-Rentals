import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app/app.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { seedDatabase } from '../src/scripts/seed.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('Hito 2 — API Fastify para Propiedades y Huéspedes (PostgreSQL)', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: ReturnType<typeof buildApp>;

  before(async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    await safeResetTestDatabase(testDbUrl);
    db = createDatabase(testDbUrl);
    await db.check();
    await seedDatabase(db.prisma);
    app = buildApp({ prisma: db.prisma, checkDatabase: db.check });
  });

  after(async () => {
    await app.close();
    await db.close();
  });

  // --- SEGURIDAD Y AUTORIZACIÓN ---
  describe('Seguridad y Capa de Autorización', () => {
    it('rechaza acceso con 401 a endpoints administrativos si no hay identidad ni bypass', async () => {
      // Crear app sin bypass
      const originalBypass = process.env.ENABLE_DEMO_AUTH_BYPASS;
      try {
        process.env.ENABLE_DEMO_AUTH_BYPASS = 'false';
        const secureApp = buildApp({ prisma: db.prisma, checkDatabase: db.check });

        const unauthRes = await secureApp.inject({ method: 'GET', url: '/api/propiedades' });
        assert.equal(unauthRes.statusCode, 401);
        assert.equal(unauthRes.json().error.code, 'UNAUTHORIZED');

        const unauthPost = await secureApp.inject({
          method: 'POST',
          url: '/api/propiedades',
          payload: { nombre: 'Test Sin Auth' },
        });
        assert.equal(unauthPost.statusCode, 401);

        await secureApp.close();
      } finally {
        process.env.ENABLE_DEMO_AUTH_BYPASS = originalBypass;
      }
    });
  });

  // --- PROPIEDADES ---
  describe('Endpoints de Propiedades', () => {
    it('1. GET /api/propiedades — lista todas las propiedades con sus propietarios', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/propiedades' });
      assert.equal(res.statusCode, 200);

      const items = res.json();
      assert.ok(Array.isArray(items), 'Debe devolver un arreglo de propiedades');
      assert.ok(items.length >= 5, 'Debe haber al menos 5 propiedades del seed');

      const p1 = items.find((p: any) => p.id === 'prop-01');
      assert.ok(p1, 'prop-01 debe estar presente');
      assert.equal(p1.propietarioNombre, 'Carlos Eduardo Méndez');
      assert.equal(typeof p1.precioBaseNoche, 'number');
    });

    it('2. GET /api/propiedades — filtra por búsqueda y estado operativo', async () => {
      // Filtrar por término de búsqueda
      const searchRes = await app.inject({ method: 'GET', url: '/api/propiedades?search=Miraflores' });
      assert.equal(searchRes.statusCode, 200);
      const searchItems = searchRes.json();
      assert.ok(searchItems.every((p: any) => p.nombre.includes('Miraflores') || p.direccion.includes('Miraflores')));

      // Filtrar solo activas
      const activeRes = await app.inject({ method: 'GET', url: '/api/propiedades?soloActivas=true' });
      assert.equal(activeRes.statusCode, 200);
      assert.ok(activeRes.json().every((p: any) => p.activa === true));
    });

    it('3. GET /api/propiedades/:id — consulta detalle y maneja 404', async () => {
      const okRes = await app.inject({ method: 'GET', url: '/api/propiedades/prop-01' });
      assert.equal(okRes.statusCode, 200);
      assert.equal(okRes.json().nombre, 'Departamento Miraflores Malecón Balta');

      const notFoundRes = await app.inject({ method: 'GET', url: '/api/propiedades/prop-inexistente' });
      assert.equal(notFoundRes.statusCode, 404);
      assert.equal(notFoundRes.json().error.code, 'PROPERTY_NOT_FOUND');
    });

    it('4. POST /api/propiedades — crea propiedad con validación estricta y auditoría atómica', async () => {
      // Rechazar nombre corto
      const badRes = await app.inject({
        method: 'POST',
        url: '/api/propiedades',
        payload: {
          nombre: 'AB',
          propietarioId: 'usr-102',
          direccion: 'Av. Test 1234',
        },
      });
      assert.equal(badRes.statusCode, 400);

      // Rechazar precio base no finito o negativo
      const badPriceRes = await app.inject({
        method: 'POST',
        url: '/api/propiedades',
        payload: {
          nombre: 'Propiedad Precio Inválido',
          propietarioId: 'usr-102',
          direccion: 'Av. Test 1234',
          precioBaseNoche: -50,
        },
      });
      assert.equal(badPriceRes.statusCode, 400);

      // Crear válida
      const validRes = await app.inject({
        method: 'POST',
        url: '/api/propiedades',
        payload: {
          id: 'prop-test-01',
          nombre: 'Penthouse San Isidro Club',
          propietarioId: 'usr-102',
          direccion: 'Av. Las Palmas 800, Dpto 1501, San Isidro',
          estadoOperativo: 'OPERATIVA',
          estadoPublicacion: 'PUBLICADA',
          capacidadHuespedes: 6,
          precioBaseNoche: 500,
        },
      });
      assert.equal(validRes.statusCode, 201);
      const created = validRes.json();
      assert.equal(created.id, 'prop-test-01');
      assert.equal(created.propietarioNombre, 'Carlos Eduardo Méndez');

      // Verificar persistencia real en PostgreSQL
      const inDb = await db.prisma.propiedad.findUnique({ where: { id: 'prop-test-01' } });
      assert.ok(inDb, 'La propiedad debe existir en PostgreSQL');
      assert.equal(inDb.nombre, 'Penthouse San Isidro Club');

      // Verificar auditoría
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidad: 'Propiedad', entidadId: 'prop-test-01', accion: 'CREAR_PROPIEDAD' },
      });
      assert.ok(audit, 'Debe existir registro de auditoría');
      assert.equal(audit.actor, 'admin@daplace.example.invalid', 'El actor debe corresponder al email del usuario autenticado');
    });

    it('5. PATCH /api/propiedades/:id — actualiza propiedad', async () => {
      const updateRes = await app.inject({
        method: 'PATCH',
        url: '/api/propiedades/prop-test-01',
        payload: {
          nombre: 'Penthouse San Isidro Club Exclusivo',
          precioBaseNoche: 550,
        },
      });
      assert.equal(updateRes.statusCode, 200);
      assert.equal(updateRes.json().nombre, 'Penthouse San Isidro Club Exclusivo');
      assert.equal(updateRes.json().precioBaseNoche, 550);

      // Verificar en BD
      const inDb = await db.prisma.propiedad.findUnique({ where: { id: 'prop-test-01' } });
      assert.equal(inDb?.nombre, 'Penthouse San Isidro Club Exclusivo');
    });

    it('6. PATCH /api/propiedades/:id/activa — desactivación lógica sin borrado físico', async () => {
      const deactivateRes = await app.inject({
        method: 'PATCH',
        url: '/api/propiedades/prop-test-01/activa',
        payload: { activa: false },
      });
      assert.equal(deactivateRes.statusCode, 200);
      assert.equal(deactivateRes.json().activa, false);
      assert.equal(deactivateRes.json().estadoOperativo, 'INACTIVA');

      // Verificar que el registro NO fue eliminado físicamente
      const inDb = await db.prisma.propiedad.findUnique({ where: { id: 'prop-test-01' } });
      assert.ok(inDb, 'El registro sigue existiendo en PostgreSQL para trazabilidad');
      assert.equal(inDb.activa, false);
    });

    it('7. GET /api/propietarios — lista propietarios para formularios', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/propietarios' });
      assert.equal(res.statusCode, 200);
      const propietarios = res.json();
      assert.ok(propietarios.length >= 4);
      assert.ok(propietarios.find((p: any) => p.id === 'usr-102'));
    });

    it('7b. POST /api/propietarios — valida datos obligatorios y formato de email', async () => {
      // Nombre muy corto
      const resShortName = await app.inject({
        method: 'POST',
        url: '/api/propietarios',
        payload: { nombre: 'Al', email: 'alberto@example.com' },
      });
      assert.equal(resShortName.statusCode, 400);

      // Email inválido
      const resBadEmail = await app.inject({
        method: 'POST',
        url: '/api/propietarios',
        payload: { nombre: 'Alberto Flores', email: 'no-es-correo' },
      });
      assert.equal(resBadEmail.statusCode, 400);
    });

    it('7c. POST /api/propietarios — crea propietario de dominio y audita', async () => {
      const payload = {
        nombre: 'Raúl Montenegro García',
        email: 'raul.montenegro@propietarios.example.invalid',
        telefono: '+51 988 777 666',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/propietarios',
        payload,
      });

      assert.equal(res.statusCode, 201);
      const data = res.json();
      assert.ok(data.id);
      assert.equal(data.nombre, payload.nombre);
      assert.equal(data.email, payload.email);

      // Verificar persistencia en base de datos
      const inDb = await db.prisma.usuario.findUnique({
        where: { id: data.id },
      });
      assert.ok(inDb);
      assert.equal(inDb.rol, 'PROPIETARIO');
      assert.equal(inDb.activo, true);

      // Verificar auditoría
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidadId: data.id, accion: 'CREAR_PROPIETARIO' },
      });
      assert.ok(audit);
    });

    it('7d. POST /api/propietarios — rechaza email duplicado con 409 DUPLICATE_OWNER_EMAIL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/propietarios',
        payload: {
          nombre: 'Carlos Clon',
          email: 'carlos.mendez@propietarios.example.invalid', // Ya existe en seed
        },
      });

      assert.equal(res.statusCode, 409);
      const data = res.json();
      assert.equal(data.error.code, 'DUPLICATE_OWNER_EMAIL');
    });
  });

  // --- HUÉSPEDES ---
  describe('Endpoints de Huéspedes', () => {
    it('8. GET /api/huespedes — lista huéspedes con búsqueda', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/huespedes' });
      assert.equal(res.statusCode, 200);
      const guests = res.json();
      assert.ok(guests.length >= 4);

      // Búsqueda por documento
      const searchDoc = await app.inject({ method: 'GET', url: '/api/huespedes?search=44556677' });
      assert.equal(searchDoc.statusCode, 200);
      assert.equal(searchDoc.json()[0].nombreCompleto, 'Alejandro Silva Rivas');
    });

    it('9. GET /api/huespedes/:id — consulta huésped con reservas relacionadas', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/huespedes/hue-01' });
      assert.equal(res.statusCode, 200);
      const guest = res.json();
      assert.equal(guest.nombreCompleto, 'Alejandro Silva Rivas');
      assert.ok(Array.isArray(guest.reservasRelacionadas));
      assert.ok(guest.reservasRelacionadas.length >= 2, 'hue-01 debe tener al menos res-01 y res-04');
    });

    it('10. POST /api/huespedes — valida contacto obligatorio (RF04) y crea huésped', async () => {
      // Rechazar sin ningún medio de contacto
      const noContactRes = await app.inject({
        method: 'POST',
        url: '/api/huespedes',
        payload: {
          nombreCompleto: 'Juan Sin Contacto',
        },
      });
      assert.equal(noContactRes.statusCode, 400);

      // Crear con correo válido
      const validRes = await app.inject({
        method: 'POST',
        url: '/api/huespedes',
        payload: {
          id: 'hue-test-01',
          nombreCompleto: 'Beatriz Morales Salcedo',
          email: 'beatriz.morales@example.invalid',
          telefono: '+51 988 777 666',
          tipoDocumento: 'DNI',
          numeroDocumento: '88776655',
          nacionalidad: 'Peruana',
        },
      });
      assert.equal(validRes.statusCode, 201);
      assert.equal(validRes.json().id, 'hue-test-01');

      // Verificar en BD
      const inDb = await db.prisma.huesped.findUnique({ where: { id: 'hue-test-01' } });
      assert.ok(inDb, 'El huésped debe persistir en PostgreSQL');
      assert.equal(inDb.nombreCompleto, 'Beatriz Morales Salcedo');
    });

    it('11. PATCH /api/huespedes/:id — actualiza datos de huésped y audita', async () => {
      const updateRes = await app.inject({
        method: 'PATCH',
        url: '/api/huespedes/hue-test-01',
        payload: {
          notas: 'Huésped VIP. Requiere cuna para bebé.',
        },
      });
      assert.equal(updateRes.statusCode, 200);
      assert.equal(updateRes.json().notas, 'Huésped VIP. Requiere cuna para bebé.');

      // Verificar auditoría
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidad: 'Huesped', entidadId: 'hue-test-01', accion: 'ACTUALIZAR_HUESPED' },
      });
      assert.ok(audit, 'Debe registrarse evento de auditoría');
      assert.equal(audit.actor, 'admin@daplace.example.invalid');
    });
  });
});
