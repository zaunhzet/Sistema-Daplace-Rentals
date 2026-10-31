import type { InternalAlert, InternalAlertsResponse } from '../types';
import { apiClient } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

export const MOCK_ALERTS: InternalAlert[] = [
  {
    id: 'notif-mock-hu11-1',
    fuente: 'NOTIFICACION_INTERNA',
    tipoAviso: 'NUEVA_RESERVA',
    estado: 'PENDIENTE',
    titulo: 'Nueva reserva registrada',
    mensaje: 'Reserva para Departamento San Isidro Golf del 2026-11-10 al 2026-11-15 (Gabriel Garcia)',
    canal: 'SISTEMA',
    plantilla: 'alerta-nueva-reserva',
    reservaId: 'res-mock-103',
    propiedadId: 'prop-mock-01',
    programadoPara: new Date(Date.now() - 600000).toISOString(),
    venceEnSnapshot: new Date(Date.now() + 86400000).toISOString(),
    enviadoEn: null,
    creadoEn: new Date(Date.now() - 600000).toISOString(),
    reserva: {
      id: 'res-mock-103',
      estado: 'SOLICITADA',
      propiedadNombre: 'Departamento San Isidro Golf',
      huespedNombre: 'Gabriel Garcia',
      venceEn: new Date(Date.now() + 86400000).toISOString(),
      montoAcordado: 1500,
      moneda: 'PEN',
    },
  },
  {
    id: 'notif-mock-hu17-1',
    fuente: 'NOTIFICACION_INTERNA',
    tipoAviso: 'ORDEN_TRABAJO_ASIGNADA',
    estado: 'PENDIENTE',
    titulo: 'Nueva orden de trabajo asignada: Pintura y resane de sala',
    mensaje: 'Se le ha asignado la orden "Pintura y resane de sala" en la propiedad "Departamento Miraflores Frente al Mar". Prioridad: ALTA. Tipo: REPARACION.',
    canal: 'SISTEMA',
    plantilla: 'alerta-orden-asignada',
    ordenTrabajoId: 'ord-mock-01',
    propiedadId: 'prop-mock-02',
    programadoPara: new Date(Date.now() - 1200000).toISOString(),
    venceEnSnapshot: new Date(Date.now() + 43200000).toISOString(),
    enviadoEn: null,
    creadoEn: new Date(Date.now() - 1200000).toISOString(),
    ordenTrabajo: {
      id: 'ord-mock-01',
      titulo: 'Pintura y resane de sala',
      tipo: 'REPARACION',
      prioridad: 'ALTA',
      estado: 'PENDIENTE',
      propiedadNombre: 'Departamento Miraflores Frente al Mar',
    },
  },
  {
    id: 'aviso-mock-1',
    fuente: 'AVISO_RESERVA',
    reservaId: 'res-mock-101',
    tipoAviso: 'EXPIRACION_PROXIMA',
    estado: 'PROGRAMADO',
    titulo: 'Vencimiento Próximo de Reserva',
    mensaje: 'Reserva para Departamento Miraflores Frente al Mar próxima a vencer',
    canal: 'SISTEMA',
    plantilla: 'alerta-expiracion-interna',
    programadoPara: new Date(Date.now() + 3600000).toISOString(),
    venceEnSnapshot: new Date(Date.now() + 7200000).toISOString(),
    enviadoEn: null,
    creadoEn: new Date().toISOString(),
    reserva: {
      id: 'res-mock-101',
      estado: 'SOLICITADA',
      propiedadNombre: 'Departamento Miraflores Frente al Mar',
      huespedNombre: 'Carlos Silva',
      venceEn: new Date(Date.now() + 7200000).toISOString(),
      montoAcordado: 1200,
      moneda: 'PEN',
    },
  },
  {
    id: 'aviso-mock-2',
    fuente: 'AVISO_RESERVA',
    reservaId: 'res-mock-102',
    tipoAviso: 'SOLICITUD_EXPIRADA',
    estado: 'ENVIADO',
    titulo: 'Solicitud de Reserva Expirada',
    mensaje: 'Reserva para Loft Barranco Bohemio expirada',
    canal: 'SISTEMA',
    plantilla: 'alerta-reserva-expirada',
    programadoPara: new Date(Date.now() - 3600000).toISOString(),
    venceEnSnapshot: new Date(Date.now() - 3600000).toISOString(),
    enviadoEn: new Date(Date.now() - 3600000).toISOString(),
    atendidaEn: new Date(Date.now() - 3600000).toISOString(),
    creadoEn: new Date(Date.now() - 86400000).toISOString(),
    reserva: {
      id: 'res-mock-102',
      estado: 'EXPIRADA',
      propiedadNombre: 'Loft Barranco Bohemio',
      huespedNombre: 'Lucía Fernández',
      venceEn: new Date(Date.now() - 3600000).toISOString(),
      montoAcordado: 950,
      moneda: 'PEN',
    },
  },
];

class AlertService {
  private alerts: InternalAlert[] = [...MOCK_ALERTS];

  public async getAlerts(limite = 20): Promise<InternalAlertsResponse> {
    if (isMockMode()) {
      const pendingCount = this.alerts.filter((a) => a.estado === 'PROGRAMADO' || a.estado === 'PENDIENTE').length;
      return {
        data: this.alerts.slice(0, limite),
        meta: { totalPendientes: pendingCount },
      };
    }

    try {
      return await apiClient<InternalAlertsResponse>(`/api/alertas?limite=${limite}`);
    } catch (err) {
      if (isMockMode()) {
        const pendingCount = this.alerts.filter((a) => a.estado === 'PROGRAMADO' || a.estado === 'PENDIENTE').length;
        return {
          data: this.alerts.slice(0, limite),
          meta: { totalPendientes: pendingCount },
        };
      }
      throw err;
    }
  }

  public async attendAlert(id: string): Promise<void> {
    if (isMockMode()) {
      const found = this.alerts.find((a) => a.id === id);
      if (found) {
        found.estado = 'ATENDIDA';
        found.atendidaEn = new Date().toISOString();
        found.enviadoEn = new Date().toISOString();
      }
      return;
    }

    await apiClient(`/api/alertas/${encodeURIComponent(id)}/atender`, {
      method: 'POST',
    });
  }

  public async markAsRead(id: string): Promise<void> {
    if (isMockMode()) {
      const found = this.alerts.find((a) => a.id === id);
      if (found && found.estado === 'PENDIENTE') {
        found.estado = 'LEIDA';
        found.leidaEn = new Date().toISOString();
      }
      return;
    }

    await apiClient(`/api/alertas/${encodeURIComponent(id)}/leer`, {
      method: 'POST',
    });
  }
}

export const alertService = new AlertService();
