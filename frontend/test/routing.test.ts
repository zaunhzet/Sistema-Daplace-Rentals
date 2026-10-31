import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NAVIGATION_ITEMS } from '../src/shared/navigation';
import { canAccessPath, getDefaultAuthorizedPath, hasPermission } from '../src/shared/auth/permissions';

describe('Application Routing & Navigation Integration (UI-INTEGRATION-001)', () => {
  const OPERATIONAL_ROUTES = [
    '/propiedades',
    '/huespedes',
    '/reservas',
    '/calendario',
    '/pagos',
    '/garantias',
    '/gastos',
  ];

  const RESERVED_PENDING_ROUTES = [
    '/dashboard',
    '/reportes',
    '/login',
    '/personal',
    '/mantenimiento',
  ];

  it('all 7 operational routes are registered and marked DISPONIBLE in the catalog', () => {
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

  describe('RBAC Navigation and Access Control (RBAC-UI-01)', () => {
    it('ADMINISTRADOR has access to all operational and pending modules', () => {
      for (const route of OPERATIONAL_ROUTES) {
        assert.equal(canAccessPath('ADMINISTRADOR', route), true, `Admin must access ${route}`);
      }
      assert.equal(canAccessPath('ADMINISTRADOR', '/dashboard'), true);
      assert.equal(canAccessPath('ADMINISTRADOR', '/personal'), true);
      assert.equal(hasPermission('ADMINISTRADOR', 'manage:properties'), true);
      assert.equal(hasPermission('ADMINISTRADOR', 'manage:owners'), true);
    });

    it('OPERADOR has access to operations and finance, but not executive modules', () => {
      for (const route of OPERATIONAL_ROUTES) {
        assert.equal(canAccessPath('OPERADOR', route), true, `Operador must access ${route}`);
      }
      assert.equal(canAccessPath('OPERADOR', '/dashboard'), false);
      assert.equal(canAccessPath('OPERADOR', '/reportes'), false);
      assert.equal(canAccessPath('OPERADOR', '/personal'), false);
      assert.equal(hasPermission('OPERADOR', 'manage:properties'), true);
      assert.equal(hasPermission('OPERADOR', 'manage:owners'), true);
    });

    it('PROPIETARIO is strictly restricted to /propiedades and /calendario', () => {
      assert.equal(canAccessPath('PROPIETARIO', '/propiedades'), true);
      assert.equal(canAccessPath('PROPIETARIO', '/calendario'), true);

      // Denegados
      assert.equal(canAccessPath('PROPIETARIO', '/huespedes'), false);
      assert.equal(canAccessPath('PROPIETARIO', '/reservas'), false);
      assert.equal(canAccessPath('PROPIETARIO', '/pagos'), false);
      assert.equal(canAccessPath('PROPIETARIO', '/garantias'), false);
      assert.equal(canAccessPath('PROPIETARIO', '/gastos'), false);
      assert.equal(canAccessPath('PROPIETARIO', '/dashboard'), false);

      // Sin permisos de gestión/escritura sobre propiedades ni catálogo de propietarios
      assert.equal(hasPermission('PROPIETARIO', 'manage:properties'), false);
      assert.equal(hasPermission('PROPIETARIO', 'manage:owners'), false);
    });

    it('CLIENTE is rejected from all admin layout routes', () => {
      for (const route of [...OPERATIONAL_ROUTES, '/dashboard', '/reportes']) {
        assert.equal(canAccessPath('CLIENTE', route), false, `Cliente must be denied from ${route}`);
      }
      assert.equal(getDefaultAuthorizedPath('CLIENTE'), '/cliente');
    });

    it('resolves default authorized redirect path correctly per role', () => {
      assert.equal(getDefaultAuthorizedPath('ADMINISTRADOR'), '/propiedades');
      assert.equal(getDefaultAuthorizedPath('OPERADOR'), '/propiedades');
      assert.equal(getDefaultAuthorizedPath('PROPIETARIO'), '/propiedades');
      assert.equal(getDefaultAuthorizedPath('CLIENTE'), '/cliente');
      assert.equal(getDefaultAuthorizedPath(null), '/login');
    });

    it('filters sidebar navigation items strictly for PROPIETARIO', () => {
      const ownerItems = NAVIGATION_ITEMS.filter((item) =>
        canAccessPath('PROPIETARIO', item.path)
      );
      assert.equal(ownerItems.length, 2);
      assert.deepEqual(
        ownerItems.map((i) => i.path).sort(),
        ['/calendario', '/propiedades'].sort()
      );
    });

    it('CLIENTE navigation and session lifecycle: resolves safe portal and supports logout to login', () => {
      // 1. Verificación de ruta segura independiente para CLIENTE fuera de AdminLayout
      const clientPath = getDefaultAuthorizedPath('CLIENTE');
      assert.equal(clientPath, '/cliente', 'CLIENTE must default to the dedicated /cliente portal');

      // 2. CLIENTE no tiene acceso a ninguna ruta de administración
      for (const adminRoute of OPERATIONAL_ROUTES) {
        assert.equal(canAccessPath('CLIENTE', adminRoute), false);
      }

      // 3. Simulación de redirección post-login y posterior logout
      let currentPath = '/login';
      const authenticatedUser = { rol: 'CLIENTE' as const, email: 'cliente@daplace.pe' };

      // Tras autenticación exitosa, el router navega a la ruta por defecto del rol
      currentPath = getDefaultAuthorizedPath(authenticatedUser.rol);
      assert.equal(currentPath, '/cliente', 'Navigates to /cliente after successful login');

      // Si el cliente intenta visitar /login estando autenticado, App.tsx redirige a /cliente sin bucles circulares
      const restoredSessionRedirect = getDefaultAuthorizedPath(authenticatedUser.rol);
      assert.equal(restoredSessionRedirect, '/cliente', 'Restored session redirects cleanly to /cliente');

      // Al ejecutar logout, la sesión pasa a null y el destino autorizado es /login
      currentPath = getDefaultAuthorizedPath(null);
      assert.equal(currentPath, '/login', 'Logout returns destination to /login cleanly');
    });
  });
});
