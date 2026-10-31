export interface AuditEvent {
  id: string;
  entidad: string;
  entidadId: string;
  accion: string;
  actor: string;
  motivo: string | null;
  detalles: any;
  requestId: string | null;
  creadoEn: string;
}

export interface AuditFilterParams {
  entidad?: string;
  accion?: string;
  actor?: string;
  search?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  limit?: number;
}

export interface AuditResponse {
  data: AuditEvent[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
