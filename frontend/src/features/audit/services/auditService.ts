import type { AuditEvent, AuditFilterParams, AuditResponse } from '../types';
import { apiClient } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

export const MOCK_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: 'aud-mock-1',
    entidad: 'Pago',
    entidadId: 'pago-101',
    accion: 'CONCILIAR_PAGO',
    actor: 'admin@daplace.pe',
    motivo: 'Comprobante bancario validado contra extracto',
    detalles: { monto: 1500, moneda: 'PEN', metodo: 'TRANSFERENCIA' },
    requestId: 'req-mock-1',
    creadoEn: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'aud-mock-2',
    entidad: 'Reserva',
    entidadId: 'res-102',
    accion: 'CONFIRMAR_RESERVA',
    actor: 'operador@daplace.pe',
    motivo: 'Adelanto contractual acreditado y sin solapes',
    detalles: { ingreso: '2026-11-05', salida: '2026-11-10', noches: 5 },
    requestId: 'req-mock-2',
    creadoEn: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'aud-mock-3',
    entidad: 'Gasto',
    entidadId: 'gasto-103',
    accion: 'APROBAR_GASTO',
    actor: 'admin@daplace.pe',
    motivo: 'Sustento tributario con RUC revisado',
    detalles: { categoria: 'MANTENIMIENTO', monto: 350 },
    requestId: 'req-mock-3',
    creadoEn: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'aud-mock-4',
    entidad: 'Usuario',
    entidadId: 'usr-104',
    accion: 'CREAR_PROPIETARIO',
    actor: 'admin@daplace.pe',
    motivo: 'Registro de nuevo propietario de dominio',
    detalles: { nombre: 'Inversiones San Isidro', email: 'contacto@sanisidro.pe' },
    requestId: 'req-mock-4',
    creadoEn: new Date(Date.now() - 172800000).toISOString(),
  },
];

class AuditService {
  private events: AuditEvent[] = [...MOCK_AUDIT_EVENTS];

  public async getAuditEvents(filters: AuditFilterParams = {}): Promise<AuditResponse> {
    if (isMockMode()) {
      let filtered = [...this.events];

      if (filters.entidad && filters.entidad !== 'TODAS') {
        filtered = filtered.filter((e) => e.entidad.toLowerCase() === filters.entidad!.toLowerCase());
      }
      if (filters.accion && filters.accion !== 'TODAS') {
        filtered = filtered.filter((e) => e.accion.toLowerCase() === filters.accion!.toLowerCase());
      }
      if (filters.search && filters.search.trim() !== '') {
        const q = filters.search.toLowerCase().trim();
        filtered = filtered.filter(
          (e) =>
            e.entidadId.toLowerCase().includes(q) ||
            e.actor.toLowerCase().includes(q) ||
            (e.motivo && e.motivo.toLowerCase().includes(q)) ||
            e.accion.toLowerCase().includes(q)
        );
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const skip = (page - 1) * limit;

      return {
        data: filtered.slice(skip, skip + limit),
        meta: { total, page, limit, totalPages },
      };
    }

    const query = new URLSearchParams();
    if (filters.entidad) query.set('entidad', filters.entidad);
    if (filters.accion) query.set('accion', filters.accion);
    if (filters.actor) query.set('actor', filters.actor);
    if (filters.search) query.set('search', filters.search);
    if (filters.desde) query.set('desde', filters.desde);
    if (filters.hasta) query.set('hasta', filters.hasta);
    if (filters.page) query.set('page', String(filters.page));
    if (filters.limit) query.set('limit', String(filters.limit));

    try {
      return await apiClient<AuditResponse>(`/api/auditoria?${query.toString()}`);
    } catch (err) {
      if (isMockMode()) {
        return this.getAuditEvents(filters);
      }
      throw err;
    }
  }
}

export const auditService = new AuditService();
