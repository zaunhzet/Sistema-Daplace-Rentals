import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { buildApp } from '../src/app/app.js';

describe('health endpoints', () => {
  let app: ReturnType<typeof buildApp> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns liveness without requiring PostgreSQL', async () => {
    app = buildApp(async () => { throw new Error('database should not be checked'); });
    const response = await app.inject({ method: 'GET', url: '/health' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  });

  it('reports database readiness when the dependency check succeeds', async () => {
    app = buildApp(async () => undefined);
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ready', dependencies: { database: 'available' } });
  });

  it('returns a standardized 503 when PostgreSQL is unavailable', async () => {
    app = buildApp(async () => { throw new Error('private connection detail'); });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error.code, 'DEPENDENCY_UNAVAILABLE');
    assert.ok(response.json().error.requestId);
    assert.equal(response.body.includes('private connection detail'), false);
  });

  it('returns a standardized validation error', async () => {
    app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health?unexpected=true' });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION_ERROR');
    assert.ok(response.json().error.requestId);
  });

  it('returns a standardized not found response', async () => {
    app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/not-a-route' });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'NOT_FOUND');
  });
});
