export type UserRole = 'ADMINISTRADOR' | 'OPERADOR' | 'PROPIETARIO' | 'CLIENTE';

export interface DemoUser {
  nombre: string;
  correo: string;
  rol: UserRole;
  cargo: string;
}

export interface DemoSession {
  isAuthenticated: boolean;
  user: DemoUser | null;
  ingresoEn: string | null;
  modoDemo: true;
}

export const USUARIOS_DEMO_PREDEFINIDOS: DemoUser[] = [
  {
    nombre: 'Valeria Méndez',
    correo: 'valeria.mendez@daplace.pe',
    rol: 'ADMINISTRADOR',
    cargo: 'Administradora General',
  },
  {
    nombre: 'Diego Navarro',
    correo: 'diego.operaciones@daplace.pe',
    rol: 'OPERADOR',
    cargo: 'Operador de Turno',
  },
  {
    nombre: 'Carlos Echevarría',
    correo: 'carlos.propietario@daplace.pe',
    rol: 'PROPIETARIO',
    cargo: 'Propietario de Inmuebles',
  },
  {
    nombre: 'Ana Sofía Rivas',
    correo: 'ana.cliente@daplace.pe',
    rol: 'CLIENTE',
    cargo: 'Cliente / Huésped',
  },
];
