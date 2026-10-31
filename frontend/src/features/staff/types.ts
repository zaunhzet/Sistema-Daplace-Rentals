export type StaffRole = 'ADMINISTRADOR' | 'OPERADOR';

export interface DomainUsuarioSummary {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: 'ADMIN' | 'OPERADOR' | 'PROPIETARIO';
  activo: boolean;
}

export interface StaffUser {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  rol: StaffRole;
  isActive: boolean;
  usuarioId: string | null;
  createdAt: string;
  updatedAt: string;
  usuario: DomainUsuarioSummary | null;
}

export interface CreateStaffDto {
  nombre: string;
  email: string;
  password: string;
  rol: StaffRole;
  cargo?: string;
  telefono?: string;
}

export interface StaffListResponse {
  data: StaffUser[];
}

export interface StaffSingleResponse {
  data: StaffUser;
}
