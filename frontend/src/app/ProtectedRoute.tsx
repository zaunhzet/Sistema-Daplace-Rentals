import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../features/auth';
import { canAccessPath, getDefaultAuthorizedPath } from '../shared/auth/permissions';
import { ForbiddenPage } from './ForbiddenPage';

interface ProtectedRouteProps {
  children: React.ReactElement;
  path: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, path }) => {
  const { session } = useAuth();

  if (!session.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const userRole = session.user?.rol;

  // Si el rol es CLIENTE, no tiene acceso alguno al panel administrativo
  if (userRole === 'CLIENTE') {
    return <ForbiddenPage onBackPath="/cliente" message="Las cuentas de tipo CLIENTE no tienen acceso a la consola administrativa de Daplace." />;
  }

  // Verificar si el rol tiene permiso para la ruta actual
  if (!canAccessPath(userRole, path)) {
    const fallbackPath = getDefaultAuthorizedPath(userRole);
    return <ForbiddenPage onBackPath={fallbackPath} />;
  }

  return children;
};
