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

export interface DemoUser {
  id: string;
  nombre: string;
  correo: string;
  cargo: string;
  rol: UserRole;
}

export interface DemoSession {
  isAuthenticated: boolean;
  user: DemoUser | null;
  ingresoEn: string | null;
  modoDemo: boolean;
}

export const USUARIOS_DEMO_PREDEFINIDOS: DemoUser[] = [
  {
    id: 'demo-admin',
    nombre: 'Valeria Méndez',
    correo: 'valeria.mendez@daplace.pe',
    cargo: 'Administradora General',
    rol: 'ADMINISTRADOR',
  },
  {
    id: 'demo-operador',
    nombre: 'Diego Navarro',
    correo: 'diego.navarro@daplace.pe',
    cargo: 'Operador de Turno',
    rol: 'OPERADOR',
  },
  {
    id: 'demo-propietario',
    nombre: 'Carlos Eduardo Méndez',
    correo: 'carlos.mendez@daplace.pe',
    cargo: 'Propietario Anfitrión',
    rol: 'PROPIETARIO',
  },
  {
    id: 'demo-cliente',
    nombre: 'Cliente Huésped',
    correo: 'cliente.demo@daplace.pe',
    cargo: 'Huésped Registrado',
    rol: 'CLIENTE',
  },
];
