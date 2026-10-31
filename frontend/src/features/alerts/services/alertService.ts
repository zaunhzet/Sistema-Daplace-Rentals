import type { InternalAlert, InternalAlertsResponse } from '../types';
import { apiClient } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

export const MOCK_ALERTS: InternalAlert[] = [
  {
    id: 'aviso-mock-1',
    reservaId: 'res-mock-101',
    tipoAviso: 'EXPIRACION_PROXIMA',
    estado: 'PROGRAMADO',
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
    reservaId: 'res-mock-102',
    tipoAviso: 'SOLICITUD_EXPIRADA',
    estado: 'ENVIADO',
    canal: 'SISTEMA',
    plantilla: 'alerta-reserva-expirada',
    programadoPara: new Date(Date.now() - 3600000).toISOString(),
    venceEnSnapshot: new Date(Date.now() - 3600000).toISOString(),
    enviadoEn: new Date(Date.now() - 3600000).toISOString(),
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
        found.estado = 'ENVIADO';
        found.enviadoEn = new Date().toISOString();
      }
      return;
    }

    await apiClient(`/api/alertas/${encodeURIComponent(id)}/atender`, {
      method: 'POST',
    });
  }
}

export const alertService = new AlertService();
