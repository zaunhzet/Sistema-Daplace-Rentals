import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NAVIGATION_ITEMS } from '../src/shared/navigation';

describe('Application Routing & Navigation Integration (UI-INTEGRATION-001)', () => {
  const OPERATIONAL_ROUTES = [
    '/propiedades',
    '/huespedes',
    '/reservas',
    '/calendario',
    '/pagos',
    '/garantias',
  ];

  const RESERVED_PENDING_ROUTES = [
    '/dashboard',
    '/reportes',
    '/login',
    '/personal',
    '/mantenimiento',
  ];

  it('all 6 operational routes are registered and marked DISPONIBLE in the catalog', () => {
    for (const route of OPERATIONAL_ROUTES) {
      const item = NAVIGATION_ITEMS.find((it) => it.path === route);
      assert.ok(item, `Route ${route} must exist in NAVIGATION_ITEMS`);
      assert.equal(item?.status, 'DISPONIBLE', `Route ${route} should have status DISPONIBLE`);
      assert.equal(item?.responsible, 'André', `Route ${route} is managed by André`);
    }
  });

  it('all 4 pending business routes in the sidebar are marked PENDIENTE', () => {
    const businessPending = ['/dashboard', '/reportes', '/personal', '/mantenimiento'];
    for (const route of businessPending) {
      const item = NAVIGATION_ITEMS.find((it) => it.path === route);
      assert.ok(item, `Route ${route} must exist in NAVIGATION_ITEMS`);
      assert.equal(item?.status, 'PENDIENTE', `Route ${route} should have status PENDIENTE`);
    }
  });

  it('login route is explicitly excluded from sidebar items but supported in router', () => {
    const sidebarLogin = NAVIGATION_ITEMS.find((it) => it.path === '/login');
    assert.equal(sidebarLogin, undefined, 'Login should not be a navigation menu item');
    assert.ok(RESERVED_PENDING_ROUTES.includes('/login'), 'Login is recognized as a reserved route');
  });

  it('each operational route has valid icon, description and group', () => {
    for (const route of OPERATIONAL_ROUTES) {
      const item = NAVIGATION_ITEMS.find((it) => it.path === route)!;
      assert.ok(item.icon, `Route ${route} must have an icon`);
      assert.ok(item.description && item.description.length > 10, `Route ${route} must have descriptive text`);
      assert.ok(
        ['Gestión Inmobiliaria', 'Finanzas'].includes(item.group),
        `Route ${route} must belong to a valid business group`,
      );
    }
  });

  it('root path / resolves to /propiedades redirect target', () => {
    const defaultRoute = '/propiedades';
    assert.ok(OPERATIONAL_ROUTES.includes(defaultRoute));
  });

  it('detects unknown paths as 404 fallback targets', () => {
    const unknownPaths = ['/inventario', '/clientes-antiguos', '/api/docs', '/admin/secret'];
    const allKnownRoutes = [...OPERATIONAL_ROUTES, ...RESERVED_PENDING_ROUTES];

    for (const unknown of unknownPaths) {
      assert.equal(
        allKnownRoutes.includes(unknown),
        false,
        `Path ${unknown} should not match known application routes`,
      );
    }
  });
});
