export interface InternalAlert {
  id: string;
  reservaId: string;
  tipoAviso: 'EXPIRACION_PROXIMA' | 'SOLICITUD_EXPIRADA' | string;
  estado: 'PROGRAMADO' | 'PENDIENTE' | 'EN_ENVIO' | 'ENVIADO' | 'FALLIDO' | 'CANCELADO';
  canal: string;
  plantilla: string;
  programadoPara: string;
  venceEnSnapshot: string;
  enviadoEn: string | null;
  creadoEn: string;
  reserva: {
    id: string;
    estado: string;
    propiedadNombre: string;
    huespedNombre: string;
    venceEn: string | null;
    montoAcordado: number;
    moneda: string;
  };
}

export interface InternalAlertsResponse {
  data: InternalAlert[];
  meta: {
    totalPendientes: number;
  };
}
