import type { LiquidationFilterParams, LiquidationReport } from '../types';
import { apiClient } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const MOCK_LIQUIDATION_REPORT: LiquidationReport = {
  propiedad: {
    id: 'prop-01',
    nombre: 'Departamento Miraflores Frente al Mar',
    direccion: 'Malecón de la Reserva 1035, Dpto. 802',
    propietarioId: 'usr-102',
    propietarioNombre: 'Carlos Morales Inversiones',
    moneda: 'PEN',
  },
  periodo: {
    mes: 10,
    anio: 2026,
    etiqueta: 'Octubre 2026',
  },
  moneda: 'PEN',
  resumen: {
    totalIngresos: 4800.0,
    totalGastos: 620.0,
    balanceNeto: 4180.0,
    garantiasEnCustodia: 800.0,
    cantidadPagosConciliados: 3,
    cantidadGastosAprobados: 2,
  },
  ingresos: [
    {
      pagoId: 'pago-mock-1',
      reservaId: 'res-mock-101',
      fechaPago: '2026-10-05',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referenciaOperacion: 'BBVA-TR-884920',
      monto: 2400.0,
    },
    {
      pagoId: 'pago-mock-2',
      reservaId: 'res-mock-101',
      fechaPago: '2026-10-18',
      concepto: 'SALDO',
      metodoPago: 'TRANSFERENCIA',
      referenciaOperacion: 'BCP-OP-102938',
      monto: 1400.0,
    },
    {
      pagoId: 'pago-mock-3',
      reservaId: 'res-mock-102',
      fechaPago: '2026-10-24',
      concepto: 'ADELANTO',
      metodoPago: 'BILLETERA_DIGITAL',
      referenciaOperacion: 'YAPE-552910',
      monto: 1000.0,
    },
  ],
  gastos: [
    {
      gastoId: 'gasto-mock-1',
      fechaGasto: '2026-10-08',
      titulo: 'Mantenimiento Preventivo Aire Acondicionado',
      categoria: 'MANTENIMIENTO',
      pagadoPor: 'DAPLACE',
      monto: 380.0,
    },
    {
      gastoId: 'gasto-mock-2',
      fechaGasto: '2026-10-16',
      titulo: 'Reposición juego de sábanas y toallas premium',
      categoria: 'LIMPIEZA',
      pagadoPor: 'DAPLACE',
      monto: 240.0,
    },
  ],
  garantias: [
    {
      garantiaId: 'gar-mock-1',
      reservaId: 'res-mock-101',
      estado: 'EN_CUSTODIA',
      monto: 500.0,
    },
    {
      garantiaId: 'gar-mock-2',
      reservaId: 'res-mock-102',
      estado: 'EN_CUSTODIA',
      monto: 300.0,
    },
  ],
};

class ReportService {
  /**
   * Obtiene la liquidación mensual consolidada por propiedad y período.
   */
  public async getLiquidacion(params: LiquidationFilterParams): Promise<LiquidationReport> {
    if (isMockMode()) {
      return this.getMockLiquidacion(params);
    }

    try {
      const query = new URLSearchParams({
        propiedadId: params.propiedadId,
        mes: String(params.mes),
        anio: String(params.anio),
      });

      const data = await apiClient<LiquidationReport>(`/api/reportes/propietario?${query.toString()}`);
      return data;
    } catch (error) {
      if (isMockMode()) {
        return this.getMockLiquidacion(params);
      }
      throw error;
    }
  }

  /**
   * Descarga la liquidación en formato CSV estructurado (HU-12).
   */
  public async downloadLiquidacionCsv(params: LiquidationFilterParams): Promise<{ blob: Blob; filename: string }> {
    const mesNombre = NOMBRES_MESES[params.mes - 1] || `Mes-${params.mes}`;
    const filename = `liquidacion-${params.propiedadId}-${params.anio}-${String(params.mes).padStart(2, '0')}.csv`;

    if (isMockMode()) {
      const mock = await this.getMockLiquidacion(params);
      const csvLines: string[] = [];
      csvLines.push('LIQUIDACION DE PROPIETARIO - DAPLACE RENTALS');
      csvLines.push(`Inmueble,"${mock.propiedad.nombre}" (${mock.propiedad.id})`);
      csvLines.push(`Propietario,"${mock.propiedad.propietarioNombre}"`);
      csvLines.push(`Periodo,${params.mes}/${params.anio} (${mesNombre} ${params.anio})`);
      csvLines.push(`Moneda,${mock.moneda}`);
      csvLines.push('');
      csvLines.push('RESUMEN FINANCIERO');
      csvLines.push(`Total Ingresos Conciliados,${mock.resumen.totalIngresos.toFixed(2)}`);
      csvLines.push(`Total Gastos Deducibles,${mock.resumen.totalGastos.toFixed(2)}`);
      csvLines.push(`Balance Neto a Transferir,${mock.resumen.balanceNeto.toFixed(2)}`);
      csvLines.push(`Garantias en Custodia (Fondos no computables como ingreso),${mock.resumen.garantiasEnCustodia.toFixed(2)}`);
      csvLines.push('');
      csvLines.push('DETALLE DE INGRESOS CONCILIADOS');
      csvLines.push('Fecha Pago,ID Reserva,Concepto,Metodo Pago,Referencia,Monto');
      for (const i of mock.ingresos) {
        csvLines.push(`${i.fechaPago},${i.reservaId},${i.concepto},${i.metodoPago},"${i.referenciaOperacion}",${i.monto.toFixed(2)}`);
      }
      csvLines.push('');
      csvLines.push('DETALLE DE GASTOS DEDUCIBLES');
      csvLines.push('Fecha Gasto,Categoria,Titulo,Pagado Por,Monto');
      for (const g of mock.gastos) {
        csvLines.push(`${g.fechaGasto},${g.categoria},"${g.titulo}",${g.pagadoPor},${g.monto.toFixed(2)}`);
      }
      csvLines.push('');
      csvLines.push('GARANTIAS EN CUSTODIA (INFORMATIVO)');
      csvLines.push('ID Garantia,ID Reserva,Estado,Monto');
      for (const gar of mock.garantias) {
        csvLines.push(`${gar.garantiaId},${gar.reservaId},${gar.estado},${gar.monto.toFixed(2)}`);
      }

      const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      return { blob, filename };
    }

    const query = new URLSearchParams({
      propiedadId: params.propiedadId,
      mes: String(params.mes),
      anio: String(params.anio),
      format: 'csv',
    });

    const response = await fetch(`/api/reportes/propietario?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('daplace_access_token') || ''}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error al exportar CSV: ${response.statusText}`);
    }

    const blob = await response.blob();
    return { blob, filename };
  }

  private getMockLiquidacion(params: LiquidationFilterParams): LiquidationReport {
    const mesNombre = NOMBRES_MESES[params.mes - 1] || `Mes ${params.mes}`;
    return {
      ...MOCK_LIQUIDATION_REPORT,
      propiedad: {
        ...MOCK_LIQUIDATION_REPORT.propiedad,
        id: params.propiedadId,
      },
      periodo: {
        mes: params.mes,
        anio: params.anio,
        etiqueta: `${mesNombre} ${params.anio}`,
      },
    };
  }
}

export const reportService = new ReportService();
