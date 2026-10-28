import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NAVIGATION_ITEMS } from '../src/shared/navigation';

describe('Navigation Catalog — Unit Tests (UI-NAV-001)', () => {
  it('contains exactly the 10 scheduled routes of the MVP', () => {
    const paths = NAVIGATION_ITEMS.map((item) => item.path);
    const expectedPaths = [
      '/dashboard',
      '/propiedades',
      '/huespedes',
      '/reservas',
      '/calendario',
      '/pagos',
      '/garantias',
      '/reportes',
      '/mantenimiento',
      '/personal',
    ];

    assert.equal(NAVIGATION_ITEMS.length, 10);
    for (const expected of expectedPaths) {
      assert.ok(paths.includes(expected), `Missing path: ${expected}`);
    }
  });

  it('does NOT include /login in business navigation', () => {
    const loginItem = NAVIGATION_ITEMS.find((it) => it.path.includes('login'));
    assert.equal(loginItem, undefined, 'Login should not be a navigation business item');
  });

  it('marks Propiedades and Huéspedes as DISPONIBLE', () => {
    const propiedades = NAVIGATION_ITEMS.find((it) => it.path === '/propiedades');
    const huespedes = NAVIGATION_ITEMS.find((it) => it.path === '/huespedes');

    assert.ok(propiedades);
    assert.equal(propiedades?.status, 'DISPONIBLE');
    assert.equal(propiedades?.responsible, 'André');

    assert.ok(huespedes);
    assert.equal(huespedes?.status, 'DISPONIBLE');
    assert.equal(huespedes?.responsible, 'André');
  });

  it('marks other routes as PENDIENTE without simulating non-existent features', () => {
    const pendingItems = NAVIGATION_ITEMS.filter(
      (it) => it.path !== '/propiedades' && it.path !== '/huespedes'
    );

    assert.equal(pendingItems.length, 8);
    for (const item of pendingItems) {
      assert.equal(item.status, 'PENDIENTE', `Item ${item.name} should be PENDIENTE`);
      assert.ok(item.description.length > 5);
      assert.ok(item.responsible);
    }
  });

  it('groups items into valid architectural groups', () => {
    const validGroups = ['Principal', 'Gestión Inmobiliaria', 'Finanzas', 'Operaciones'];
    for (const item of NAVIGATION_ITEMS) {
      assert.ok(validGroups.includes(item.group), `Item ${item.name} has invalid group: ${item.group}`);
    }
  });
});
