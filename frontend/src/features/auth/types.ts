export type UserRole = 'ADMINISTRADOR' | 'OPERADOR' | 'PROPIETARIO' | 'CLIENTE';

export interface User {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  rol: UserRole;
}

export interface AuthSession {
  isAuthenticated: boolean;
  user: User | null;
  ingresoEn: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
  user: User;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; code?: string }>;
    requestId?: string;
  };
}
