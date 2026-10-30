import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  authenticatedFetch,
  getAccessToken,
  logoutApi,
  refreshApi,
  setAccessToken,
} from '../../frontend/src/features/auth/authClient.js';

describe('Frontend Auth Client & Coordination Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setAccessToken(null);
  });

  // Fix 4: Deduplicación y coordinación de refreshApi
  it('coordina llamadas concurrentes a refreshApi en una única petición de red', async () => {
    let networkFetchCount = 0;

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/auth/refresh')) {
        networkFetchCount++;
        // Simula retraso de red
        await new Promise((r) => setTimeout(r, 20));
        return new Response(
          JSON.stringify({
            accessToken: 'new_rotated_jwt_token',
            user: { id: 'u1', email: 'valeria@daplace.pe', nombre: 'Valeria', rol: 'ADMINISTRADOR', cargo: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    }) as any;

    // Disparamos 3 llamadas concurrentes a refreshApi (como ocurre con StrictMode o llamadas paralelas)
    const [res1, res2, res3] = await Promise.all([
      refreshApi(),
      refreshApi(),
      refreshApi(),
    ]);

    assert.equal(networkFetchCount, 1, 'Exactamente una petición HTTP debe salir a la red');
    assert.equal(res1.accessToken, 'new_rotated_jwt_token');
    assert.equal(res2.accessToken, 'new_rotated_jwt_token');
    assert.equal(res3.accessToken, 'new_rotated_jwt_token');
    assert.equal(getAccessToken(), 'new_rotated_jwt_token');
  });

  // Fix 5: Logout fallido no oculta el error ni finge éxito
  it('logoutApi lanza ApiError y no limpia el token en memoria si el servidor falla', async () => {
    setAccessToken('valid_in_memory_token');

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Error al procesar la revocación en la base de datos.',
          },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    await assert.rejects(
      async () => {
        await logoutApi();
      },
      (err: any) => {
        assert.equal(err.name, 'ApiError');
        assert.equal(err.statusCode, 500);
        return true;
      }
    );

    // El token en memoria NO debe borrarse si la revocación remota falló, permitiendo al usuario reintentar
    assert.equal(getAccessToken(), 'valid_in_memory_token');
  });

  // Fix 6: Vencimiento de access token y reintento único coordinado
  it('authenticatedFetch renueva token y reintenta automáticamente ante un 401', async () => {
    setAccessToken('expired_jwt_token');
    let apiCallAttempts = 0;
    let refreshAttempts = 0;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('/auth/refresh')) {
        refreshAttempts++;
        return new Response(
          JSON.stringify({
            accessToken: 'freshly_renewed_jwt_token',
            user: { id: 'u1', email: 'valeria@daplace.pe', nombre: 'Valeria', rol: 'ADMINISTRADOR', cargo: null },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/api/test-data')) {
        apiCallAttempts++;
        const authHeader = (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization || (init?.headers as Headers)?.get?.('Authorization');

        if (authHeader === 'Bearer expired_jwt_token') {
          return new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expirado' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (authHeader === 'Bearer freshly_renewed_jwt_token') {
          return new Response(JSON.stringify({ success: true, data: 'secure_data' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response('Not found', { status: 404 });
    }) as any;

    const response = await authenticatedFetch('http://127.0.0.1:3000/api/test-data');

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { success: true, data: 'secure_data' });
    assert.equal(apiCallAttempts, 2, 'Debe haber llamado 2 veces (intento original fallido y reintento exitoso)');
    assert.equal(refreshAttempts, 1, 'Debe haber llamado 1 sola vez a /auth/refresh');
    assert.equal(getAccessToken(), 'freshly_renewed_jwt_token', 'El token en memoria debe actualizarse');
  });
});
