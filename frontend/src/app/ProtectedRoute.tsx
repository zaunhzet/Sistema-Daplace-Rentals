import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../features/auth';
import { canAccessPath, getDefaultAuthorizedPath } from '../shared/auth/permissions';
import { ForbiddenPage } from './ForbiddenPage';
import daplaceIcon from '../assets/daplace-icon.png';

interface ProtectedRouteProps {
  children: React.ReactElement;
  path: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, path }) => {
  const { session, isRestoringSession } = useAuth();

  // Mientras se restaura la sesión con el refresh token, evitar redirección prematura al login
  if (isRestoringSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="flex flex-col items-center gap-3">
          <img
            src={daplaceIcon}
            alt="Cargando Daplace"
            className="size-12 animate-pulse rounded-2xl border border-stone-200/80 bg-white p-2 shadow-xs"
          />
          <p className="text-xs font-medium text-stone-500">Restaurando sesión segura...</p>
        </div>
      </div>
    );
  }

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
