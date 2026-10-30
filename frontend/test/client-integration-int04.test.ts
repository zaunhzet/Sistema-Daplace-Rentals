import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { apiClient, ApiError } from '../src/shared/api/client';
import { setAccessToken } from '../src/features/auth/authClient';

describe('Gate INT-04 — Integración Frontend, Cliente Unificado y Preservación de Detalles', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it('1. apiClient inyecta Authorization Bearer y X-Requested-With cuando hay token activo', async () => {
    setAccessToken('token_de_prueba_activo_123');

    let capturedHeaders: HeadersInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const res = await apiClient<{ status: string }>('/api/propiedades');
      assert.equal(res.status, 'ok');
      assert.ok(capturedHeaders);
      assert.equal((capturedHeaders as any)['Authorization'], 'Bearer token_de_prueba_activo_123');
      assert.equal((capturedHeaders as any)['X-Requested-With'], 'XMLHttpRequest');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('2. apiClient preserva encabezados de Idempotency-Key enviados por el cliente', async () => {
    setAccessToken('token_operativo');

    let capturedHeaders: HeadersInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ id: 'pago-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      await apiClient('/api/pagos', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'idemp-uuid-key-555',
        },
        body: JSON.stringify({ monto: 500 }),
      });

      assert.ok(capturedHeaders);
      assert.equal((capturedHeaders as any)['Idempotency-Key'], 'idemp-uuid-key-555');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('3. apiClient preserva ApiError estructurado con code, status y details (DR-02 / DR-01)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'CONTRACT_PREREQUISITES_NOT_MET',
            message: 'No cumple los requisitos comerciales.',
            motivos: ['Falta validar contrato', 'Monto de adelanto insuficiente'],
            requestId: 'req-error-777',
          },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }) as any;

    try {
      await assert.rejects(
        async () => {
          await apiClient('/api/reservas/res-1/confirmar', { method: 'POST' });
        },
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, 'CONTRACT_PREREQUISITES_NOT_MET');
          assert.equal(err.requestId, 'req-error-777');
          assert.deepEqual(err.details, ['Falta validar contrato', 'Monto de adelanto insuficiente']);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('4. Descarte estricto de respuestas tardías si el usuario cierra sesión durante la petición en vuelo (epoch)', async () => {
    setAccessToken('token_valido_inicial');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      // Simular que el usuario hace logout mientras la petición viaja por la red
      setAccessToken(null);
      return new Response(JSON.stringify({ datosSensibles: 'propiedad privada' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      // Importante: Simular logout real cambiando el epoch
      const { bumpAuthEpoch } = await import('../src/features/auth/authClient');

      const fetchPromise = apiClient('/api/propiedades');
      bumpAuthEpoch(); // Logout ejecutado en paralelo

      await assert.rejects(
        async () => {
          await fetchPromise;
        },
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.code, 'STALE_SESSION_RESPONSE');
          assert.equal(err.statusCode, 499);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('5. Reintento único ante 401 conservando Idempotency-Key del cliente', async () => {
    setAccessToken('token_expirado');

    let callCount = 0;
    const capturedIdempotencyKeys: (string | null)[] = [];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      callCount++;
      const urlStr = String(input);

      if (urlStr.includes('/auth/refresh')) {
        return new Response(
          JSON.stringify({
            accessToken: 'token_nuevo_renovado',
            user: { id: 'u1', email: 'u1@daplace.pe', nombre: 'U1', rol: 'OPERADOR' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const headers = init?.headers as Record<string, string>;
      capturedIdempotencyKeys.push(headers?.['Idempotency-Key'] || null);

      if (callCount === 1) {
        // Primera llamada falla con 401
        return new Response(JSON.stringify({ error: 'Token expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Segunda llamada (reintento) tiene éxito
      return new Response(JSON.stringify({ success: true, pagoId: 'pago-retried' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const result = await apiClient<{ success: boolean; pagoId: string }>('/api/pagos', {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'key-idemp-12345',
        },
        body: JSON.stringify({ monto: 100 }),
      });

      assert.equal(result.success, true);
      assert.equal(result.pagoId, 'pago-retried');
      // Debe haberse reintentado una sola vez y conservado la idempotency key
      assert.deepEqual(capturedIdempotencyKeys, ['key-idemp-12345', 'key-idemp-12345']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
