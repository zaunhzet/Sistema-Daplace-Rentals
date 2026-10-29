/**
 * Daplace Rentals — Servicio de Lectura Financiera Compartido
 * 
 * PROPÓSITO ARQUITECTÓNICO:
 * Diseñado específicamente para que Diego pueda construir el Dashboard y la pantalla de Reportes
 * de liquidación sin replicar lógica ni cálculos financieros, y garantizando la estricta
 * separación entre ingresos por alquiler y fondos de garantías en custodia.
 * 
 * AVISO: Los filtros por fecha y criterios de devengo temporal se consideran provisionales
 * hasta que el negocio apruebe la política definitiva de imputación (criterio caja vs estancia).
 */

import { paymentService } from './paymentService';
import { guaranteeService } from '../../guarantees/services/guaranteeService';
import { reservationService } from '../../reservations';
import { propertyService } from '../../properties';
import { fromCents, toCents } from '../../../shared/money';
import type { ReservationFinancialSummary } from '../types';

export interface PropertyFinancialSummary {
  propiedadId: string;
  propiedadNombre: string;
  moneda: string;
  /** Ingresos confirmados y validados de alquiler (únicamente pagos CONCILIADOS) */
  totalIngresosConciliados: string;
  /** Pagos registrados que aún no reducen saldo ni cuentan como ingreso */
  totalPagosPendientes: string;
  /** Fondos de garantía actualmente en custodia (separados de ingresos de alquiler) */
  totalGarantiasEnCustodia: string;
  /** Garantías retenidas por penalidades/daños */
  totalGarantiasRetenidas: string;
  /** Garantías devueltas formalmente a los huéspedes */
  totalGarantiasDevueltas: string;
  /** Número total de reservas registradas para esta propiedad */
  reservasCount: number;
}

export interface GlobalFinancialMetrics {
  resumenPorMoneda: {
    moneda: string;
    totalIngresosConciliados: string;
    totalPagosPendientes: string;
    totalGarantiasEnCustodia: string;
  }[];
  totalPagosPendientesConciliacionCount: number;
  totalGarantiasActivasEnCustodiaCount: number;
}

export interface FinancialLedgerEntry {
  id: string;
  rubro: 'INGRESO_ALQUILER' | 'FONDO_GARANTIA';
  reservaId: string;
  propiedadId: string;
  propiedadNombre: string;
  huespedNombre: string;
  concepto: string;
  importe: string;
  moneda: string;
  estado: string;
  referencia: string;
  fecha: string;
  esIngresoValidado: boolean;
}

export interface IFinancialReadService {
  /** Resumen de saldo y pagos conciliados por reserva */
  getReservationSummary(reservaId: string): Promise<ReservationFinancialSummary>;

  /** Resumen financiero consolidado por propiedad (separa alquileres de garantías) */
  getPropertySummary(propiedadId: string, moneda?: string): Promise<PropertyFinancialSummary>;

  /** Métricas de alto nivel para el Dashboard de Diego */
  getGlobalMetrics(): Promise<GlobalFinancialMetrics>;

  /** Libro mayor unificado de movimientos con trazabilidad para reportes */
  getFinancialLedger(filters?: {
    propiedadId?: string;
    reservaId?: string;
    desde?: string;
    hasta?: string;
  }): Promise<FinancialLedgerEntry[]>;
}

class FinancialReadService implements IFinancialReadService {
  public async getReservationSummary(reservaId: string): Promise<ReservationFinancialSummary> {
    return paymentService.getReservationFinancialSummary(reservaId);
  }

  public async getPropertySummary(
    propiedadId: string,
    moneda = 'PEN'
  ): Promise<PropertyFinancialSummary> {
    const property = await propertyService.getPropertyById(propiedadId);
    const propiedadNombre = property?.nombre || 'Propiedad no encontrada';

    const payments = await paymentService.getPayments({ propiedadId });
    const guarantees = await guaranteeService.getGuarantees({ propiedadId });
    const reservations = await reservationService.getReservations({ propiedadId });

    // Filtrar por la moneda solicitada para no mezclar importes
    const filteredPayments = payments.filter((p) => p.moneda === moneda);
    const filteredGuarantees = guarantees.filter((g) => g.moneda === moneda);

    let ingresosConciliadosCents = 0;
    let pagosPendientesCents = 0;

    for (const p of filteredPayments) {
      if (p.estado === 'CONCILIADO') {
        ingresosConciliadosCents += toCents(p.importe);
      } else if (p.estado === 'PENDIENTE_CONCILIACION') {
        pagosPendientesCents += toCents(p.importe);
      }
    }

    let garantiasCustodiaCents = 0;
    let garantiasRetenidasCents = 0;
    let garantiasDevueltasCents = 0;

    for (const g of filteredGuarantees) {
      garantiasCustodiaCents += toCents(g.saldoDisponible);
      garantiasRetenidasCents += toCents(g.totalRetenido);
      garantiasDevueltasCents += toCents(g.totalDevuelto);
    }

    return {
      propiedadId,
      propiedadNombre,
      moneda,
      totalIngresosConciliados: fromCents(ingresosConciliadosCents),
      totalPagosPendientes: fromCents(pagosPendientesCents),
      totalGarantiasEnCustodia: fromCents(garantiasCustodiaCents),
      totalGarantiasRetenidas: fromCents(garantiasRetenidasCents),
      totalGarantiasDevueltas: fromCents(garantiasDevueltasCents),
      reservasCount: reservations.length,
    };
  }

  public async getGlobalMetrics(): Promise<GlobalFinancialMetrics> {
    const payments = await paymentService.getPayments();
    const guarantees = await guaranteeService.getGuarantees();

    const monedas = Array.from(
      new Set([...payments.map((p) => p.moneda), ...guarantees.map((g) => g.moneda)])
    );

    const resumenPorMoneda = monedas.map((m) => {
      const pMoneda = payments.filter((p) => p.moneda === m);
      const gMoneda = guarantees.filter((g) => g.moneda === m);

      const ingresosCents = pMoneda
        .filter((p) => p.estado === 'CONCILIADO')
        .reduce((acc, cur) => acc + toCents(cur.importe), 0);

      const pendientesCents = pMoneda
        .filter((p) => p.estado === 'PENDIENTE_CONCILIACION')
        .reduce((acc, cur) => acc + toCents(cur.importe), 0);

      const custodiaCents = gMoneda.reduce((acc, cur) => acc + toCents(cur.saldoDisponible), 0);

      return {
        moneda: m,
        totalIngresosConciliados: fromCents(ingresosCents),
        totalPagosPendientes: fromCents(pendientesCents),
        totalGarantiasEnCustodia: fromCents(custodiaCents),
      };
    });

    const totalPagosPendientesConciliacionCount = payments.filter(
      (p) => p.estado === 'PENDIENTE_CONCILIACION'
    ).length;

    const totalGarantiasActivasEnCustodiaCount = guarantees.filter(
      (g) => toCents(g.saldoDisponible) > 0
    ).length;

    return {
      resumenPorMoneda,
      totalPagosPendientesConciliacionCount,
      totalGarantiasActivasEnCustodiaCount,
    };
  }

  public async getFinancialLedger(filters?: {
    propiedadId?: string;
    reservaId?: string;
    desde?: string;
    hasta?: string;
  }): Promise<FinancialLedgerEntry[]> {
    const payments = await paymentService.getPayments(filters);
    const guarantees = await guaranteeService.getGuarantees(filters);

    const entries: FinancialLedgerEntry[] = [];

    // 1. Mapear pagos de alquiler
    for (const p of payments) {
      entries.push({
        id: p.id,
        rubro: 'INGRESO_ALQUILER',
        reservaId: p.reservaId,
        propiedadId: p.propiedadId,
        propiedadNombre: p.propiedadNombre,
        huespedNombre: p.huespedNombre,
        concepto: `Alquiler: ${p.concepto}`,
        importe: p.importe,
        moneda: p.moneda,
        estado: p.estado,
        referencia: p.referencia,
        fecha: p.fechaPago,
        esIngresoValidado: p.estado === 'CONCILIADO',
      });
    }

    // 2. Mapear movimientos de garantía (separados de ingresos)
    for (const g of guarantees) {
      for (const mov of g.movimientos) {
        entries.push({
          id: mov.id,
          rubro: 'FONDO_GARANTIA',
          reservaId: g.reservaId,
          propiedadId: g.propiedadId,
          propiedadNombre: g.propiedadNombre,
          huespedNombre: g.huespedNombre,
          concepto: `Garantía: ${mov.tipo}`,
          importe: mov.importe,
          moneda: g.moneda,
          estado: g.estado,
          referencia: mov.documentoSoporte || mov.id,
          fecha: mov.registradoEn.substring(0, 10),
          esIngresoValidado: false, // Las garantías NUNCA son ingresos de alquiler
        });
      }
    }

    // Ordenar cronológicamente descendente
    return entries.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
}

export const financialReadService: IFinancialReadService = new FinancialReadService();
