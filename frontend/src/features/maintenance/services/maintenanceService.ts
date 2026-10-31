import type {
  CheckoutInspectionDto,
  CheckoutResponse,
  CreateOrderDto,
  MaintenanceOrder,
  MaintenanceOrdersResponse,
  MaintenanceSingleResponse,
  UpdateOrderStatusDto,
} from '../types';
import { apiClient } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

export const MOCK_ORDERS: MaintenanceOrder[] = [
  {
    id: 'ord-mock-01',
    propiedadId: 'prop-01',
    propiedadNombre: 'Departamento Miraflores Frente al Mar',
    propiedadEstadoOperativo: 'OPERATIVA',
    reservaId: 'res-mock-101',
    titulo: 'Limpieza y sanitización post-salida',
    descripcion: 'Acondicionamiento integral para ingreso del siguiente huésped.',
    tipo: 'LIMPIEZA',
    prioridad: 'MEDIA',
    estado: 'COMPLETADA',
    asignadoA: {
      id: 'usr-op-02',
      nombre: 'Carlos Operador',
      email: 'operador@daplace.pe',
    },
    creadoPor: {
      id: 'usr-admin-01',
      nombre: 'André Administrador',
      email: 'admin@daplace.pe',
    },
    costoEstimado: 120,
    costoReal: 120,
    notasResolucion: 'Limpieza entregada conforme a checklist de calidad.',
    completadoEn: new Date(Date.now() - 86400000).toISOString(),
    creadoEn: new Date(Date.now() - 172800000).toISOString(),
    actualizadoEn: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'ord-mock-02',
    propiedadId: 'prop-02',
    propiedadNombre: 'Loft Barranco Bohemio',
    propiedadEstadoOperativo: 'EN_MANTENIMIENTO',
    reservaId: null,
    titulo: 'Reparación de chapa inteligente y picaporte',
    descripcion: 'Cerradura digital presenta desgaste en baterías y sensor bluetooth.',
    tipo: 'REPARACION',
    prioridad: 'ALTA',
    estado: 'EN_PROGRESO',
    asignadoA: {
      id: 'usr-op-02',
      nombre: 'Carlos Operador',
      email: 'operador@daplace.pe',
    },
    creadoPor: {
      id: 'usr-admin-01',
      nombre: 'André Administrador',
      email: 'admin@daplace.pe',
    },
    costoEstimado: 180,
    costoReal: null,
    notasResolucion: null,
    completadoEn: null,
    creadoEn: new Date(Date.now() - 43200000).toISOString(),
    actualizadoEn: new Date(Date.now() - 21600000).toISOString(),
  },
  {
    id: 'ord-mock-03',
    propiedadId: 'prop-03',
    propiedadNombre: 'Penthouse San Isidro Club',
    propiedadEstadoOperativo: 'OPERATIVA',
    reservaId: null,
    titulo: 'Inspección periódica de detectores de humo y extintor',
    descripcion: 'Revisión técnica de seguridad reglamentaria de Defensa Civil.',
    tipo: 'INSPECCION',
    prioridad: 'BAJA',
    estado: 'PENDIENTE',
    asignadoA: null,
    creadoPor: {
      id: 'usr-admin-01',
      nombre: 'André Administrador',
      email: 'admin@daplace.pe',
    },
    costoEstimado: 80,
    costoReal: null,
    notasResolucion: null,
    completadoEn: null,
    creadoEn: new Date(Date.now() - 10800000).toISOString(),
    actualizadoEn: new Date(Date.now() - 10800000).toISOString(),
  },
];

class MaintenanceService {
  private orders: MaintenanceOrder[] = [...MOCK_ORDERS];

  public async getOrders(filters: { propiedadId?: string; estado?: string } = {}): Promise<MaintenanceOrder[]> {
    if (isMockMode()) {
      let filtered = [...this.orders];
      if (filters.propiedadId) {
        filtered = filtered.filter((o) => o.propiedadId === filters.propiedadId);
      }
      if (filters.estado && filters.estado !== 'TODAS') {
        filtered = filtered.filter((o) => o.estado === filters.estado);
      }
      return filtered;
    }

    try {
      const params = new URLSearchParams();
      if (filters.propiedadId) params.append('propiedadId', filters.propiedadId);
      if (filters.estado) params.append('estado', filters.estado);
      const qs = params.toString() ? `?${params.toString()}` : '';

      const res = await apiClient<MaintenanceOrdersResponse>(`/api/mantenimiento/ordenes${qs}`);
      return res.data;
    } catch (err) {
      if (isMockMode()) {
        return [...this.orders];
      }
      throw err;
    }
  }

  public async createOrder(dto: CreateOrderDto): Promise<MaintenanceOrder> {
    if (isMockMode()) {
      const newOrder: MaintenanceOrder = {
        id: `ord-mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        propiedadId: dto.propiedadId,
        propiedadNombre: dto.propiedadId === 'prop-01' ? 'Departamento Miraflores' : 'Inmueble Seleccionado',
        reservaId: dto.reservaId || null,
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        tipo: dto.tipo || 'INSPECCION',
        prioridad: dto.prioridad || 'MEDIA',
        estado: 'PENDIENTE',
        asignadoA: dto.asignadoAId
          ? { id: dto.asignadoAId, nombre: 'Colaborador Asignado', email: 'staff@daplace.pe' }
          : null,
        creadoPor: {
          id: 'usr-admin-01',
          nombre: 'Administrador Activo',
          email: 'admin@daplace.pe',
        },
        costoEstimado: dto.costoEstimado || null,
        costoReal: null,
        notasResolucion: null,
        completadoEn: null,
        creadoEn: new Date().toISOString(),
        actualizadoEn: new Date().toISOString(),
      };
      this.orders.unshift(newOrder);
      return newOrder;
    }

    const res = await apiClient<MaintenanceSingleResponse>('/api/mantenimiento/ordenes', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async registerCheckout(dto: CheckoutInspectionDto): Promise<CheckoutResponse['data']> {
    if (isMockMode()) {
      let createdOrder: MaintenanceOrder | null = null;
      if (!dto.conforme || dto.generarOrdenMantenimiento) {
        createdOrder = await this.createOrder({
          propiedadId: 'prop-01',
          reservaId: dto.reservaId,
          titulo: !dto.conforme ? 'Incidencia Reportada en Salida' : 'Acondicionamiento Post-Salida',
          descripcion: dto.descripcionTrabajo || dto.observaciones || 'Inspección de salida',
          tipo: !dto.conforme ? 'REPARACION' : dto.tipoTrabajo || 'LIMPIEZA',
          prioridad: !dto.conforme ? 'ALTA' : dto.prioridad || 'MEDIA',
          asignadoAId: dto.asignadoAId,
          cambiarEstadoPropiedad: !dto.conforme,
        });
      }
      return {
        reservaId: dto.reservaId,
        estadoReserva: 'COMPLETADA',
        conforme: dto.conforme,
        ordenTrabajo: createdOrder
          ? {
              id: createdOrder.id,
              titulo: createdOrder.titulo,
              tipo: createdOrder.tipo,
              prioridad: createdOrder.prioridad,
              estado: createdOrder.estado,
            }
          : null,
      };
    }

    const res = await apiClient<CheckoutResponse>('/api/mantenimiento/check-out', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async updateOrderStatus(id: string, dto: UpdateOrderStatusDto): Promise<MaintenanceOrder> {
    if (isMockMode()) {
      const order = this.orders.find((o) => o.id === id);
      if (!order) throw new Error('Orden no encontrada');

      order.estado = dto.estado;
      if (dto.costoReal !== undefined) order.costoReal = dto.costoReal;
      if (dto.notasResolucion) order.notasResolucion = dto.notasResolucion;
      if (dto.estado === 'COMPLETADA') order.completadoEn = new Date().toISOString();
      order.actualizadoEn = new Date().toISOString();
      return { ...order };
    }

    const res = await apiClient<MaintenanceSingleResponse>(`/api/mantenimiento/ordenes/${encodeURIComponent(id)}/estado`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async assignOrder(id: string, asignadoAId: string): Promise<MaintenanceOrder> {
    if (isMockMode()) {
      const order = this.orders.find((o) => o.id === id);
      if (!order) throw new Error('Orden no encontrada');

      order.asignadoA = {
        id: asignadoAId,
        nombre: 'Carlos Operador',
        email: 'operador@daplace.pe',
      };
      if (order.estado === 'PENDIENTE') order.estado = 'EN_PROGRESO';
      order.actualizadoEn = new Date().toISOString();
      return { ...order };
    }

    const res = await apiClient<MaintenanceSingleResponse>(`/api/mantenimiento/ordenes/${encodeURIComponent(id)}/asignar`, {
      method: 'PATCH',
      body: JSON.stringify({ asignadoAId }),
    });
    return res.data;
  }
}

export const maintenanceService = new MaintenanceService();
