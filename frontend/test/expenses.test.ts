import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpenseKpis } from '../src/features/expenses/pages/ExpensesPage';
import type { Expense } from '../src/features/expenses/types';

describe('Expenses Module & Monetary KPIs — Unit Tests (BACKEND-003-FIX)', () => {
  const createMockExpense = (overrides: Partial<Expense> = {}): Expense => ({
    id: 'gasto-test-1',
    propiedadId: 'prop-01',
    propiedadNombre: 'Departamento Miraflores',
    fechaGasto: '2026-05-10',
    periodoMes: 5,
    periodoAnio: 2026,
    titulo: 'Mantenimiento de cerradura',
    categoria: 'Mantenimiento',
    monto: '100.00',
    moneda: 'PEN',
    pagadoPor: 'DAPLACE',
    estado: 'REGISTRADO',
    sustentos: [],
    creadoEn: '2026-05-10T10:00:00.000Z',
    actualizadoEn: '2026-05-10T10:00:00.000Z',
    ...overrides,
  });

  it('calculates KPIs as 0.00 when the list of expenses is empty', () => {
    const kpis = calculateExpenseKpis([]);
    assert.equal(kpis.totalActivo, '0.00');
    assert.equal(kpis.cantActivos, 0);
    assert.equal(kpis.totalAnulado, '0.00');
    assert.equal(kpis.cantAnulados, 0);
    assert.equal(kpis.promedio, '0.00');
  });

  it('sums active expenses using integer cents, preventing float precision roundoff', () => {
    // 0.10 + 0.20 in JavaScript float is 0.30000000000000004
    const expenses: Expense[] = [
      createMockExpense({ id: 'g1', monto: '0.10', estado: 'REGISTRADO' }),
      createMockExpense({ id: 'g2', monto: '0.20', estado: 'REGISTRADO' }),
      createMockExpense({ id: 'g3', monto: '19.99', estado: 'APROBADO' }),
      createMockExpense({ id: 'g4', monto: '29.99', estado: 'REGISTRADO' }),
      createMockExpense({ id: 'g5', monto: '49.99', estado: 'APROBADO' }),
    ];

    const kpis = calculateExpenseKpis(expenses);

    // 0.10 + 0.20 + 19.99 + 29.99 + 49.99 = 100.27
    assert.equal(kpis.totalActivo, '100.27');
    assert.equal(kpis.cantActivos, 5);
    assert.equal(kpis.totalAnulado, '0.00');
    assert.equal(kpis.cantAnulados, 0);
    // Average: 100.27 / 5 = 20.054 -> rounded to 20.05
    assert.equal(kpis.promedio, '20.05');
  });

  it('keeps annulled expenses strictly separated from active total in a dedicated indicator', () => {
    const expenses: Expense[] = [
      createMockExpense({ id: 'g1', monto: '150.50', estado: 'REGISTRADO' }),
      createMockExpense({ id: 'g2', monto: '250.25', estado: 'APROBADO' }),
      createMockExpense({ id: 'g3', monto: '80.00', estado: 'ANULADO', motivoAnulacion: 'Error en monto' }),
      createMockExpense({ id: 'g4', monto: '120.75', estado: 'ANULADO', motivoAnulacion: 'Factura duplicada' }),
    ];

    const kpis = calculateExpenseKpis(expenses);

    // Activos: 150.50 + 250.25 = 400.75
    assert.equal(kpis.totalActivo, '400.75');
    assert.equal(kpis.cantActivos, 2);

    // Anulados: 80.00 + 120.75 = 200.75
    assert.equal(kpis.totalAnulado, '200.75');
    assert.equal(kpis.cantAnulados, 2);

    // Promedio por activo: 400.75 / 2 = 200.375 -> rounded to 200.38
    assert.equal(kpis.promedio, '200.38');
  });

  it('handles scenario where all expenses are annulled without returning NaN', () => {
    const expenses: Expense[] = [
      createMockExpense({ id: 'g1', monto: '350.00', estado: 'ANULADO' }),
      createMockExpense({ id: 'g2', monto: '150.00', estado: 'ANULADO' }),
    ];

    const kpis = calculateExpenseKpis(expenses);

    assert.equal(kpis.totalActivo, '0.00');
    assert.equal(kpis.cantActivos, 0);
    assert.equal(kpis.totalAnulado, '500.00');
    assert.equal(kpis.cantAnulados, 2);
    assert.equal(kpis.promedio, '0.00');
  });

  it('safely handles empty or missing amount string gracefully', () => {
    const expenses: Expense[] = [
      createMockExpense({ id: 'g1', monto: '' }),
      createMockExpense({ id: 'g2', monto: '45.50' }),
    ];

    const kpis = calculateExpenseKpis(expenses);

    assert.equal(kpis.totalActivo, '45.50');
    assert.equal(kpis.cantActivos, 2);
    assert.equal(kpis.promedio, '22.75');
  });
});
