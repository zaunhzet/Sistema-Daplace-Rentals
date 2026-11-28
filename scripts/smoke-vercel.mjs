import assert from 'node:assert/strict';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5193');
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
assert(base.protocol === 'https:' || (loopback && base.protocol === 'http:'));
assert(!base.username && !base.password, 'Usa una URL sin credenciales');

async function request(path, options = {}) {
  return fetch(new URL(path, base), {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    ...options,
  });
}

for (const path of ['/', '/calendario', '/login']) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(await response.text(), /id="root"/, path);
}

const health = await request('/health');
assert.equal(health.status, 200, '/health');
assert.equal((await health.json()).status, 'ok');

const ready = await request('/health/ready');
assert.equal(ready.status, 200, '/health/ready');
assert.equal((await ready.json()).status, 'ready');

for (const path of ['/auth/me', '/api/reservas']) {
  const response = await request(path);
  assert.equal(response.status, 401, path);
  assert.match(response.headers.get('content-type') || '', /application\/json/, path);
}

const missingApi = await request('/api/__daplace_smoke_missing__');
assert.equal(missingApi.status, 404);
assert.match(missingApi.headers.get('content-type') || '', /application\/json/);

const csrf = await request('/auth/refresh', {
  method: 'POST',
  headers: { Origin: 'https://foreign-origin.invalid', 'X-Requested-With': 'XMLHttpRequest' },
});
assert.equal(csrf.status, 403);
assert.equal((await csrf.json()).error.code, 'CSRF_VIOLATION');

console.log('PASS: SPA, health, readiness, auth, API, JSON 404 y CSRF.');
