import type { UserRole } from '../../features/auth/types';

/**
 * Catálogo central de capacidades y permisos del frontend de Daplace Rentals.
 * Se alinea con los guards y preHandlers efectivos del backend Fastify.
 * El frontend filtra visibilidad y navegación para UX, pero la autoridad definitiva es el backend.
 */
export type AppPermission =
  // Módulos de primer nivel
  | 'view:properties'
  | 'view:guests'
  | 'view:reservations'
  | 'view:calendar'
  | 'view:payments'
  | 'view:guarantees'
  | 'view:expenses'
  | 'view:dashboard'
  | 'view:reports'
  | 'view:staff'
  | 'view:maintenance'
  // Acciones sobre propiedades y propietarios
  | 'manage:properties'        // Crear, editar, cambiar estado de propiedades
  | 'manage:owners'            // Consultar catálogo global y registrar nuevos propietarios
  // Acciones operativas y financieras
  | 'manage:guests'
  | 'manage:reservations'
  | 'manage:payments'
  | 'manage:guarantees'
  | 'manage:expenses';

/**
 * Matriz estricta de permisos por rol.
 * Si un rol no está definido o es CLIENTE, carece de permisos administrativos.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly AppPermission[]> = {
  ADMINISTRADOR: [
    'view:properties',
    'view:guests',
    'view:reservations',
    'view:calendar',
    'view:payments',
    'view:guarantees',
    'view:expenses',
    'view:dashboard',
    'view:reports',
    'view:staff',
    'view:maintenance',
    'manage:properties',
    'manage:owners',
    'manage:guests',
    'manage:reservations',
    'manage:payments',
    'manage:guarantees',
    'manage:expenses',
  ],
  OPERADOR: [
    'view:properties',
    'view:guests',
    'view:reservations',
    'view:calendar',
    'view:payments',
    'view:guarantees',
    'view:expenses',
    'manage:properties',
    'manage:owners',
    'manage:guests',
    'manage:reservations',
    'manage:payments',
    'manage:guarantees',
    'manage:expenses',
  ],
  PROPIETARIO: [
    'view:properties', // Solo consulta de propiedades propias
    'view:calendar',   // Solo disponibilidad de propiedades propias
    // Excluido terminantemente: manage:properties, manage:owners, view:guests, view:payments, view:guarantees, view:expenses
  ],
  CLIENTE: [
    // CLIENTE no tiene ningún permiso de interfaz dentro del panel administrativo
  ],
};

/**
 * Determina si un rol cuenta con un permiso específico.
 */
export function hasPermission(role: UserRole | undefined | null, permission: AppPermission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Determina si un rol tiene autorización para ver un módulo según su ruta.
 */
export function canAccessPath(role: UserRole | undefined | null, path: string): boolean {
  if (!role || role === 'CLIENTE') return false;

  switch (path) {
    case '/propiedades':
      return hasPermission(role, 'view:properties');
    case '/huespedes':
      return hasPermission(role, 'view:guests');
    case '/reservas':
      return hasPermission(role, 'view:reservations');
    case '/calendario':
      return hasPermission(role, 'view:calendar');
    case '/pagos':
      return hasPermission(role, 'view:payments');
    case '/garantias':
      return hasPermission(role, 'view:guarantees');
    case '/gastos':
      return hasPermission(role, 'view:expenses');
    case '/dashboard':
      return hasPermission(role, 'view:dashboard');
    case '/reportes':
      return hasPermission(role, 'view:reports');
    case '/personal':
      return hasPermission(role, 'view:staff');
    case '/mantenimiento':
      return hasPermission(role, 'view:maintenance');
    default:
      return false;
  }
}

/**
 * Devuelve la primera ruta autorizada para redirigir tras inicio de sesión o acceso a '/'.
 */
export function getDefaultAuthorizedPath(role: UserRole | undefined | null): string {
  if (!role) return '/login';
  if (role === 'CLIENTE') return '/cliente';

  const orderedPaths = [
    '/propiedades',
    '/calendario',
    '/huespedes',
    '/reservas',
    '/pagos',
    '/garantias',
    '/gastos',
    '/dashboard',
  ];

  for (const path of orderedPaths) {
    if (canAccessPath(role, path)) {
      return path;
    }
  }

  return '/login';
}
