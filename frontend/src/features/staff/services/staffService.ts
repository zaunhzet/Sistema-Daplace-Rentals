import type { CreateStaffDto, StaffListResponse, StaffRole, StaffSingleResponse, StaffUser } from '../types';
import { apiClient } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

export const MOCK_STAFF_USERS: StaffUser[] = [
  {
    id: 'staff-user-1',
    email: 'admin@daplace.pe',
    nombre: 'André Administrador',
    cargo: 'Líder de Operaciones y TI',
    rol: 'ADMINISTRADOR',
    isActive: true,
    usuarioId: 'usr-admin-mock-1',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-30T15:00:00.000Z',
    usuario: {
      id: 'usr-admin-mock-1',
      nombre: 'André Administrador',
      email: 'admin@daplace.pe',
      telefono: '+51 999 888 777',
      rol: 'ADMIN',
      activo: true,
    },
  },
  {
    id: 'staff-user-2',
    email: 'operador@daplace.pe',
    nombre: 'Carlos Operador',
    cargo: 'Coordinador de Check-ins y Mantenimiento',
    rol: 'OPERADOR',
    isActive: true,
    usuarioId: 'usr-op-mock-2',
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-28T09:30:00.000Z',
    usuario: {
      id: 'usr-op-mock-2',
      nombre: 'Carlos Operador',
      email: 'operador@daplace.pe',
      telefono: '+51 988 777 666',
      rol: 'OPERADOR',
      activo: true,
    },
  },
  {
    id: 'staff-user-3',
    email: 'lucia.turno@daplace.pe',
    nombre: 'Lucía Mendoza',
    cargo: 'Asistente de Reservas y Pagos',
    rol: 'OPERADOR',
    isActive: false,
    usuarioId: 'usr-op-mock-3',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-10-20T17:00:00.000Z',
    usuario: {
      id: 'usr-op-mock-3',
      nombre: 'Lucía Mendoza',
      email: 'lucia.turno@daplace.pe',
      telefono: '+51 977 666 555',
      rol: 'OPERADOR',
      activo: false,
    },
  },
];

class StaffService {
  private users: StaffUser[] = [...MOCK_STAFF_USERS];

  public async getStaffUsers(): Promise<StaffUser[]> {
    if (isMockMode()) {
      return [...this.users];
    }

    try {
      const response = await apiClient<StaffListResponse>('/api/usuarios/internos');
      return response.data;
    } catch (err) {
      if (isMockMode()) {
        return [...this.users];
      }
      throw err;
    }
  }

  public async createStaffUser(dto: CreateStaffDto): Promise<StaffUser> {
    if (isMockMode()) {
      const existing = this.users.find((u) => u.email.toLowerCase() === dto.email.toLowerCase());
      if (existing) {
        throw new Error(`Ya existe una cuenta con el correo ${dto.email}`);
      }

      const domainRol = dto.rol === 'ADMINISTRADOR' ? 'ADMIN' : 'OPERADOR';
      const newDomainId = `usr-domain-${Date.now()}`;
      const newUser: StaffUser = {
        id: `staff-user-${Date.now()}`,
        email: dto.email.toLowerCase(),
        nombre: dto.nombre,
        cargo: dto.cargo || null,
        rol: dto.rol,
        isActive: true,
        usuarioId: newDomainId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usuario: {
          id: newDomainId,
          nombre: dto.nombre,
          email: dto.email.toLowerCase(),
          telefono: dto.telefono || null,
          rol: domainRol,
          activo: true,
        },
      };

      this.users.unshift(newUser);
      return newUser;
    }

    const response = await apiClient<StaffSingleResponse>('/api/usuarios/internos', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return response.data;
  }

  public async updateStaffStatus(id: string, activo: boolean): Promise<StaffUser> {
    if (isMockMode()) {
      const user = this.users.find((u) => u.id === id);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      user.isActive = activo;
      if (user.usuario) {
        user.usuario.activo = activo;
      }
      user.updatedAt = new Date().toISOString();
      return { ...user };
    }

    const response = await apiClient<StaffSingleResponse>(`/api/usuarios/internos/${encodeURIComponent(id)}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ activo }),
    });
    return response.data;
  }

  public async updateStaffRole(id: string, rol: StaffRole): Promise<StaffUser> {
    if (isMockMode()) {
      const user = this.users.find((u) => u.id === id);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }
      user.rol = rol;
      if (user.usuario) {
        user.usuario.rol = rol === 'ADMINISTRADOR' ? 'ADMIN' : 'OPERADOR';
      }
      user.updatedAt = new Date().toISOString();
      return { ...user };
    }

    const response = await apiClient<StaffSingleResponse>(`/api/usuarios/internos/${encodeURIComponent(id)}/rol`, {
      method: 'PATCH',
      body: JSON.stringify({ rol }),
    });
    return response.data;
  }
}

export const staffService = new StaffService();
