import type {
  AddEvidenceDto,
  CancelExpenseDto,
  CreateExpenseDto,
  Expense,
  ExpenseEvidence,
  ExpenseFilterParams,
  ExpenseValidationResult,
  UpdateExpenseDto,
} from '../types';
import { INITIAL_EXPENSES_MOCK } from './mockExpenses';
import { apiClient, ApiError } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';
import { validateMoneyInput } from '../../../shared/money';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida minuciosamente los datos de entrada para registrar o modificar un gasto.
 */
export function validateExpensePayload(dto: Partial<CreateExpenseDto>): ExpenseValidationResult {
  const errors: Record<string, string> = {};

  if (!dto.propiedadId || dto.propiedadId.trim() === '') {
    errors.propiedadId = 'Debe seleccionar una propiedad válida.';
  }

  if (!dto.titulo || dto.titulo.trim().length < 3) {
    errors.titulo = 'El título descriptivo es obligatorio (mínimo 3 caracteres).';
  }

  if (!dto.categoria || dto.categoria.trim() === '') {
    errors.categoria = 'Debe especificar una categoría para el gasto.';
  }

  const moneyValidation = validateMoneyInput(dto.monto || '');
  if (!moneyValidation.isValid) {
    errors.monto = moneyValidation.error || 'Monto inválido.';
  }

  if (dto.moneda && dto.moneda.toUpperCase().trim() !== 'PEN') {
    errors.moneda = 'En este incremento únicamente se admiten gastos en moneda PEN.';
  }

  if (!dto.fechaGasto || !DATE_REGEX.test(dto.fechaGasto.trim())) {
    errors.fechaGasto = 'La fecha del gasto es requerida en formato YYYY-MM-DD.';
  }

  if (dto.periodoMes === undefined || Number(dto.periodoMes) < 1 || Number(dto.periodoMes) > 12) {
    errors.periodoMes = 'El mes del periodo debe ser un número entre 1 y 12.';
  }

  if (dto.periodoAnio === undefined || Number(dto.periodoAnio) < 2000 || Number(dto.periodoAnio) > 2100) {
    errors.periodoAnio = 'El año del periodo debe ser un año válido de 4 dígitos.';
  }

  if (!dto.pagadoPor || dto.pagadoPor.trim() === '') {
    errors.pagadoPor = 'Debe indicar quién asumió el pago (ej: DAPLACE, PROPIETARIO, etc.).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface IExpenseService {
  getExpenses(filters?: ExpenseFilterParams): Promise<Expense[]>;
  getExpenseById(id: string): Promise<Expense | null>;
  createExpense(dto: CreateExpenseDto): Promise<Expense>;
  updateExpense(id: string, dto: UpdateExpenseDto): Promise<Expense>;
  cancelExpense(id: string, dto: CancelExpenseDto): Promise<Expense>;
  addEvidence(gastoId: string, dto: AddEvidenceDto): Promise<ExpenseEvidence>;
  getEvidences(gastoId: string): Promise<ExpenseEvidence[]>;
  deleteEvidence(gastoId: string, sustentoId: string): Promise<void>;
  reset(): void;
}

class MockExpenseService implements IExpenseService {
  private expenses: Expense[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.expenses = JSON.parse(JSON.stringify(INITIAL_EXPENSES_MOCK));
  }

  public async getExpenses(filters?: ExpenseFilterParams): Promise<Expense[]> {
    let list = [...this.expenses];

    if (filters?.propiedadId && filters.propiedadId !== 'TODAS') {
      list = list.filter((e) => e.propiedadId === filters.propiedadId);
    }

    if (filters?.categoria && filters.categoria !== 'TODAS') {
      list = list.filter((e) => e.categoria.toLowerCase() === filters.categoria!.toLowerCase());
    }

    if (filters?.estado && filters.estado !== 'TODOS') {
      list = list.filter((e) => e.estado === filters.estado);
    }

    if (filters?.mes !== undefined && String(filters.mes) !== 'TODOS') {
      list = list.filter((e) => e.periodoMes === Number(filters.mes));
    }

    if (filters?.anio !== undefined && String(filters.anio) !== 'TODOS') {
      list = list.filter((e) => e.periodoAnio === Number(filters.anio));
    }

    if (filters?.fechaDesde) {
      list = list.filter((e) => e.fechaGasto >= filters.fechaDesde!);
    }

    if (filters?.fechaHasta) {
      list = list.filter((e) => e.fechaGasto <= filters.fechaHasta!);
    }

    if (filters?.pagadoPor) {
      const term = filters.pagadoPor.toLowerCase();
      list = list.filter((e) => e.pagadoPor.toLowerCase().includes(term));
    }

    if (filters?.search) {
      const term = filters.search.toLowerCase();
      list = list.filter(
        (e) =>
          e.titulo.toLowerCase().includes(term) ||
          (e.notas && e.notas.toLowerCase().includes(term)) ||
          e.categoria.toLowerCase().includes(term) ||
          e.pagadoPor.toLowerCase().includes(term)
      );
    }

    list.sort((a, b) => new Date(b.fechaGasto).getTime() - new Date(a.fechaGasto).getTime());
    return list;
  }

  public async getExpenseById(id: string): Promise<Expense | null> {
    const found = this.expenses.find((e) => e.id === id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async createExpense(dto: CreateExpenseDto): Promise<Expense> {
    const val = validateExpensePayload(dto);
    if (!val.isValid) {
      throw new Error(`Error de validación: ${Object.values(val.errors).join(' ')}`);
    }

    const now = new Date().toISOString();
    const newId = `gas-${Date.now().toString().slice(-5)}`;
    const newExpense: Expense = {
      id: newId,
      propiedadId: dto.propiedadId,
      propiedadNombre: 'Propiedad de demostración',
      fechaGasto: dto.fechaGasto,
      periodoMes: Number(dto.periodoMes),
      periodoAnio: Number(dto.periodoAnio),
      titulo: dto.titulo.trim(),
      categoria: dto.categoria.trim(),
      notas: dto.notas?.trim() || undefined,
      monto: Number(dto.monto).toFixed(2),
      moneda: 'PEN',
      pagadoPor: dto.pagadoPor.trim(),
      repartido: dto.repartido?.trim() || undefined,
      usoRucDaplace: dto.usoRucDaplace === undefined || dto.usoRucDaplace === null ? null : Boolean(dto.usoRucDaplace),
      estado: 'REGISTRADO',
      sustentos: (dto.sustentos || []).map((s, idx) => ({
        id: `sus-mock-${Date.now()}-${idx}`,
        gastoId: newId,
        tipo: s.tipo || 'COMPROBANTE',
        nombreArchivo: s.nombreArchivo,
        url: s.url,
        origen: s.origen || 'MANUAL',
        registradoPor: 'operador@daplace.com',
        creadoEn: now,
      })),
      creadoEn: now,
      actualizadoEn: now,
    };

    this.expenses.unshift(newExpense);
    return JSON.parse(JSON.stringify(newExpense));
  }

  public async updateExpense(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const index = this.expenses.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error(`El gasto "${id}" no existe.`);
    }

    const current = this.expenses[index];
    if (current.estado === 'ANULADO') {
      throw new Error('No se puede modificar un gasto anulado.');
    }

    const updated: Expense = {
      ...current,
      propiedadId: dto.propiedadId ?? current.propiedadId,
      fechaGasto: dto.fechaGasto ?? current.fechaGasto,
      periodoMes: dto.periodoMes !== undefined ? Number(dto.periodoMes) : current.periodoMes,
      periodoAnio: dto.periodoAnio !== undefined ? Number(dto.periodoAnio) : current.periodoAnio,
      titulo: dto.titulo?.trim() ?? current.titulo,
      categoria: dto.categoria?.trim() ?? current.categoria,
      notas: dto.notas !== undefined ? (dto.notas?.trim() || undefined) : current.notas,
      monto: dto.monto !== undefined ? Number(dto.monto).toFixed(2) : current.monto,
      pagadoPor: dto.pagadoPor?.trim() ?? current.pagadoPor,
      repartido: dto.repartido !== undefined ? (dto.repartido?.trim() || undefined) : current.repartido,
      usoRucDaplace: dto.usoRucDaplace !== undefined ? (dto.usoRucDaplace === null ? null : Boolean(dto.usoRucDaplace)) : current.usoRucDaplace,
      actualizadoEn: new Date().toISOString(),
    };

    this.expenses[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  public async cancelExpense(id: string, dto: CancelExpenseDto): Promise<Expense> {
    const index = this.expenses.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error(`El gasto "${id}" no existe.`);
    }

    const current = this.expenses[index];
    const updated: Expense = {
      ...current,
      estado: 'ANULADO',
      motivoAnulacion: dto.motivo.trim(),
      anuladoEn: new Date().toISOString(),
      anuladoPor: 'operador@daplace.com',
      actualizadoEn: new Date().toISOString(),
    };

    this.expenses[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  public async addEvidence(gastoId: string, dto: AddEvidenceDto): Promise<ExpenseEvidence> {
    const expense = this.expenses.find((e) => e.id === gastoId);
    if (!expense) {
      throw new Error(`El gasto "${gastoId}" no existe.`);
    }

    const newEvidence: ExpenseEvidence = {
      id: `sus-mock-${Date.now()}`,
      gastoId,
      tipo: dto.tipo || 'COMPROBANTE',
      nombreArchivo: dto.nombreArchivo.trim(),
      url: dto.url.trim(),
      origen: dto.origen || 'MANUAL',
      registradoPor: 'operador@daplace.com',
      creadoEn: new Date().toISOString(),
    };

    expense.sustentos.unshift(newEvidence);
    return newEvidence;
  }

  public async getEvidences(gastoId: string): Promise<ExpenseEvidence[]> {
    const expense = this.expenses.find((e) => e.id === gastoId);
    return expense ? [...expense.sustentos] : [];
  }

  public async deleteEvidence(gastoId: string, sustentoId: string): Promise<void> {
    const expense = this.expenses.find((e) => e.id === gastoId);
    if (!expense) return;
    expense.sustentos = expense.sustentos.filter((s) => s.id !== sustentoId);
  }
}

class ApiExpenseService implements IExpenseService {
  public async getExpenses(filters?: ExpenseFilterParams): Promise<Expense[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.propiedadId && filters.propiedadId !== 'TODAS') params.append('propiedadId', filters.propiedadId);
    if (filters?.categoria && filters.categoria !== 'TODAS') params.append('categoria', filters.categoria);
    if (filters?.estado && filters.estado !== 'TODOS') params.append('estado', filters.estado);
    if (filters?.mes !== undefined && String(filters.mes) !== 'TODOS') params.append('mes', String(filters.mes));
    if (filters?.anio !== undefined && String(filters.anio) !== 'TODOS') params.append('anio', String(filters.anio));
    if (filters?.fechaDesde) params.append('fechaDesde', filters.fechaDesde);
    if (filters?.fechaHasta) params.append('fechaHasta', filters.fechaHasta);
    if (filters?.pagadoPor) params.append('pagadoPor', filters.pagadoPor);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient<{ data: Expense[] }>(`/api/gastos${query}`);
    return res.data;
  }

  public async getExpenseById(id: string): Promise<Expense | null> {
    try {
      const res = await apiClient<{ data: Expense }>(`/api/gastos/${encodeURIComponent(id)}`);
      return res.data;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  public async createExpense(dto: CreateExpenseDto): Promise<Expense> {
    const val = validateExpensePayload(dto);
    if (!val.isValid) {
      const errorMsg = Object.values(val.errors).join(' ');
      throw new Error(`Error de validación: ${errorMsg}`);
    }

    const res = await apiClient<{ data: Expense }>('/api/gastos', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async updateExpense(id: string, dto: UpdateExpenseDto): Promise<Expense> {
    const res = await apiClient<{ data: Expense }>(`/api/gastos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async cancelExpense(id: string, dto: CancelExpenseDto): Promise<Expense> {
    const res = await apiClient<{ data: Expense }>(`/api/gastos/${encodeURIComponent(id)}/anular`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async addEvidence(gastoId: string, dto: AddEvidenceDto): Promise<ExpenseEvidence> {
    const res = await apiClient<{ data: ExpenseEvidence }>(`/api/gastos/${encodeURIComponent(gastoId)}/sustentos`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async getEvidences(gastoId: string): Promise<ExpenseEvidence[]> {
    const res = await apiClient<{ data: ExpenseEvidence[] }>(`/api/gastos/${encodeURIComponent(gastoId)}/sustentos`);
    return res.data;
  }

  public async deleteEvidence(gastoId: string, sustentoId: string): Promise<void> {
    await apiClient(`/api/gastos/${encodeURIComponent(gastoId)}/sustentos/${encodeURIComponent(sustentoId)}`, {
      method: 'DELETE',
    });
  }

  public reset(): void {
    // No-op en modo API real
  }
}

export const expenseService: IExpenseService = isMockMode()
  ? new MockExpenseService()
  : new ApiExpenseService();
