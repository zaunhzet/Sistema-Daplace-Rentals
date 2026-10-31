export type TipoTrabajoMantenimiento = 'LIMPIEZA' | 'REPARACION' | 'INSPECCION' | 'PINTURA' | 'OTRO';
export type PrioridadTrabajo = 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type EstadoOrdenTrabajo = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | 'CANCELADA';

export interface MaintenanceOrder {
  id: string;
  propiedadId: string;
  propiedadNombre: string;
  propiedadEstadoOperativo?: string;
  reservaId?: string | null;
  titulo: string;
  descripcion: string;
  tipo: TipoTrabajoMantenimiento;
  prioridad: PrioridadTrabajo;
  estado: EstadoOrdenTrabajo;
  asignadoA: {
    id: string;
    nombre: string;
    email: string;
    rol?: string;
  } | null;
  creadoPor: {
    id: string;
    nombre: string;
    email: string;
  };
  costoEstimado?: number | null;
  costoReal?: number | null;
  notasResolucion?: string | null;
  completadoEn?: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface CreateOrderDto {
  propiedadId: string;
  reservaId?: string;
  titulo: string;
  descripcion: string;
  tipo?: TipoTrabajoMantenimiento;
  prioridad?: PrioridadTrabajo;
  asignadoAId?: string;
  costoEstimado?: number;
  cambiarEstadoPropiedad?: boolean;
}

export interface CheckoutInspectionDto {
  reservaId: string;
  conforme: boolean;
  observaciones?: string;
  generarOrdenMantenimiento?: boolean;
  tipoTrabajo?: TipoTrabajoMantenimiento;
  prioridad?: PrioridadTrabajo;
  asignadoAId?: string;
  descripcionTrabajo?: string;
}

export interface UpdateOrderStatusDto {
  estado: EstadoOrdenTrabajo;
  costoReal?: number;
  notasResolucion?: string;
  restablecerPropiedadOperativa?: boolean;
}

export interface MaintenanceOrdersResponse {
  data: MaintenanceOrder[];
}

export interface MaintenanceSingleResponse {
  data: MaintenanceOrder;
}

export interface CheckoutResponse {
  data: {
    reservaId: string;
    estadoReserva: string;
    conforme: boolean;
    ordenTrabajo?: {
      id: string;
      titulo: string;
      tipo: TipoTrabajoMantenimiento;
      prioridad: PrioridadTrabajo;
      estado: EstadoOrdenTrabajo;
    } | null;
  };
}
