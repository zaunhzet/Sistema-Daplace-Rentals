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
      '/gastos',
      '/reportes',
      '/mantenimiento',
      '/personal',
    ];

    assert.equal(NAVIGATION_ITEMS.length, expectedPaths.length);
    for (const expected of expectedPaths) {
      assert.ok(paths.includes(expected), `Missing path: ${expected}`);
    }
  });

  it('does NOT include /login in business navigation', () => {
    const loginItem = NAVIGATION_ITEMS.find((it) => it.path.includes('login'));
    assert.equal(loginItem, undefined, 'Login should not be a navigation business item');
  });

  it('marks all 10 completed modules as DISPONIBLE with responsible André', () => {
    const availablePaths = [
      '/propiedades',
      '/huespedes',
      '/reservas',
      '/calendario',
      '/pagos',
      '/garantias',
      '/gastos',
      '/reportes',
      '/mantenimiento',
      '/personal',
    ];
    for (const path of availablePaths) {
      const item = NAVIGATION_ITEMS.find((it) => it.path === path);
      assert.ok(item, `Path ${path} should exist in navigation`);
      assert.equal(item?.status, 'DISPONIBLE', `Item ${path} should be DISPONIBLE`);
      assert.equal(item?.responsible, 'André');
    }
  });

  it('marks Dashboard as PENDIENTE while displaying PendingModuleView', () => {
    const availablePaths = [
      '/propiedades',
      '/huespedes',
      '/reservas',
      '/calendario',
      '/pagos',
      '/garantias',
      '/gastos',
      '/reportes',
      '/mantenimiento',
      '/personal',
    ];
    const pendingItems = NAVIGATION_ITEMS.filter((it) => !availablePaths.includes(it.path));

    assert.equal(pendingItems.length, 1);
    const dashboardItem = pendingItems[0];
    assert.equal(dashboardItem.path, '/dashboard');
    assert.equal(dashboardItem.status, 'PENDIENTE', 'Dashboard should be PENDIENTE');
    assert.ok(dashboardItem.description.length > 5);
    assert.equal(dashboardItem.responsible, 'Diego');
  });

  it('groups items into valid architectural groups', () => {
    const validGroups = ['Principal', 'Gestión Inmobiliaria', 'Finanzas', 'Operaciones'];
    for (const item of NAVIGATION_ITEMS) {
      assert.ok(validGroups.includes(item.group), `Item ${item.name} has invalid group: ${item.group}`);
    }
  });
});
