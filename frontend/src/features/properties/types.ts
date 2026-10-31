export type EstadoOperativo = 'OPERATIVA' | 'EN_MANTENIMIENTO' | 'INACTIVA';

/**
 * Propuesta técnica para estados de publicación de propiedades.
 * Sujeto a validación contra la documentación aprobada del negocio.
 */
export type EstadoPublicacion = 'PUBLICADA' | 'BORRADOR' | 'PAUSADA';

export interface Propietario {
  id: string;
  nombre: string;
  email: string;
  telefono?: string;
}

export interface CreatePropietarioDto {
  nombre: string;
  email: string;
  telefono?: string;
}

export interface Property {
  id: string;
  nombre: string;
  propietarioId: string;
  propietarioNombre: string;
  estadoOperativo: EstadoOperativo;
  estadoPublicacion: EstadoPublicacion;
  direccion: string;
  activa: boolean;
  capacidadHuespedes?: number;
  precioBaseNoche?: number;
  moneda: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface CreatePropertyDto {
  nombre: string;
  propietarioId: string;
  direccion: string;
  estadoOperativo?: EstadoOperativo;
  estadoPublicacion?: EstadoPublicacion;
  capacidadHuespedes?: number;
  precioBaseNoche?: number;
  moneda?: string;
}

export interface UpdatePropertyDto {
  nombre?: string;
  propietarioId?: string;
  direccion?: string;
  estadoOperativo?: EstadoOperativo;
  estadoPublicacion?: EstadoPublicacion;
  activa?: boolean;
  capacidadHuespedes?: number;
  precioBaseNoche?: number;
  moneda?: string;
}

export interface PropertyFilterParams {
  search?: string;
  estadoOperativo?: EstadoOperativo | 'TODOS';
  estadoPublicacion?: EstadoPublicacion | 'TODOS';
  soloActivas?: boolean;
}

export type PropertyFilters = PropertyFilterParams;

export interface PropertyValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
