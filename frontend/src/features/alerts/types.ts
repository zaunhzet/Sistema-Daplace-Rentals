export interface InternalAlert {
  id: string;
  fuente?: 'NOTIFICACION_INTERNA' | 'AVISO_RESERVA' | string;
  reservaId?: string;
  ordenTrabajoId?: string;
  propiedadId?: string;
  usuarioId?: string | null;
  tipoAviso:
    | 'EXPIRACION_PROXIMA'
    | 'SOLICITUD_EXPIRADA'
    | 'NUEVA_RESERVA'
    | 'ORDEN_TRABAJO_ASIGNADA'
    | string;
  estado:
    | 'PROGRAMADO'
    | 'PENDIENTE'
    | 'LEIDA'
    | 'ATENDIDA'
    | 'EN_ENVIO'
    | 'ENVIADO'
    | 'FALLIDO'
    | 'CANCELADO';
  titulo?: string;
  mensaje?: string;
  canal?: string;
  plantilla?: string;
  programadoPara?: string;
  venceEnSnapshot?: string;
  enviadoEn?: string | null;
  leidaEn?: string | null;
  atendidaEn?: string | null;
  creadoEn: string;
  reserva?: {
    id: string;
    estado: string;
    propiedadNombre: string;
    huespedNombre: string;
    venceEn: string | null;
    montoAcordado: number;
    moneda: string;
  };
  ordenTrabajo?: {
    id: string;
    titulo: string;
    tipo: string;
    prioridad: string;
    estado: string;
    propiedadNombre: string;
  };
}

export interface InternalAlertsResponse {
  data: InternalAlert[];
  meta: {
    totalPendientes: number;
  };
}
