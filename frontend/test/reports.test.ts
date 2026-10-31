import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reportService, MOCK_LIQUIDATION_REPORT } from '../src/features/reports';

describe('Reports & Liquidations Module (HU-07 & HU-12) — Frontend Tests', () => {
  it('1. Obtiene la liquidación mensual consolidada con desglose contable y totales reproducibles', async () => {
    const report = await reportService.getLiquidacion({
      propiedadId: 'prop-01',
      mes: 10,
      anio: 2026,
    });

    assert.ok(report);
    assert.equal(report.propiedad.id, 'prop-01');
    assert.equal(report.periodo.mes, 10);
    assert.equal(report.periodo.anio, 2026);

    // Verificación de integridad matemática:
    // Balance Neto = Ingresos Conciliados - Gastos Aprobados
    const expectedNet = report.resumen.totalIngresos - report.resumen.totalGastos;
    assert.equal(report.resumen.balanceNeto, expectedNet);

    assert.ok(report.ingresos.length > 0);
    assert.ok(report.gastos.length > 0);
  });

  it('2. Garantiza que las garantías en custodia NO se sumen a los ingresos conciliados', async () => {
    const report = await reportService.getLiquidacion({
      propiedadId: 'prop-01',
      mes: 10,
      anio: 2026,
    });

    // Suma manual de items de ingresos
    const sumIngresos = report.ingresos.reduce((acc, curr) => acc + curr.monto, 0);
    assert.equal(report.resumen.totalIngresos, sumIngresos);

    // La garantía en custodia se reporta pero no modifica el total de ingresos
    assert.ok(report.resumen.garantiasEnCustodia > 0);
    assert.equal(
      report.resumen.balanceNeto,
      report.resumen.totalIngresos - report.resumen.totalGastos,
      'Garantías no deben sumarse a ingresos ni al balance neto transferible'
    );
  });

  it('3. HU-12: Exportación CSV genera un archivo estructurado con cabeceras y resumen determinístico', async () => {
    const result = await reportService.downloadLiquidacionCsv({
      propiedadId: 'prop-01',
      mes: 10,
      anio: 2026,
    });

    assert.ok(result);
    assert.ok(result.filename.startsWith('liquidacion-prop-01-2026-10'));
    assert.ok(result.filename.endsWith('.csv'));
    assert.ok(result.blob);
    assert.equal(result.blob.type, 'text/csv;charset=utf-8;');

    const text = await result.blob.text();
    assert.ok(text.includes('LIQUIDACION DE PROPIETARIO - DAPLACE RENTALS'));
    assert.ok(text.includes('Total Ingresos Conciliados'));
    assert.ok(text.includes('Total Gastos Deducibles'));
    assert.ok(text.includes('Balance Neto a Transferir'));
    assert.ok(text.includes('Garantias en Custodia (Fondos no computables como ingreso)'));
  });

  it('4. HU-07/HU-12: PROPIETARIO tiene permiso view:reports para acceder al módulo y visualizar reportes', async () => {
    const { hasPermission, canAccessPath } = await import('../src/shared/auth/permissions');
    assert.equal(hasPermission('PROPIETARIO', 'view:reports'), true);
    assert.equal(canAccessPath('PROPIETARIO', '/reportes'), true);

    // PROPIETARIO no tiene permisos de administración de gastos ni finanzas ajenas
    assert.equal(hasPermission('PROPIETARIO', 'manage:expenses'), false);
    assert.equal(hasPermission('PROPIETARIO', 'manage:payments'), false);
  });
});
