import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Receipt, AlertCircle, CheckCircle2, DollarSign, FileText, Ban, RefreshCw, X } from 'lucide-react';
import type { AddEvidenceDto, CreateExpenseDto, Expense, ExpenseFilterParams, UpdateExpenseDto } from '../types';
import { expenseService } from '../services/expenseService';
import { propertyService, type Property } from '../../properties';
import { ExpenseFilters } from '../components/ExpenseFilters';
import { ExpenseList } from '../components/ExpenseList';
import { ExpenseFormModal } from '../components/ExpenseFormModal';
import { ExpenseDetailModal } from '../components/ExpenseDetailModal';
import { ExpenseCancelModal } from '../components/ExpenseCancelModal';

export const ExpensesPage: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filtros
  const [filters, setFilters] = useState<ExpenseFilterParams>({
    search: '',
    propiedadId: 'TODAS',
    categoria: 'TODAS',
    estado: 'TODOS',
    mes: 'TODOS',
    anio: 'TODOS',
  });

  // Modales
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [cancelExpense, setCancelExpense] = useState<Expense | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedExpenses, fetchedProps] = await Promise.all([
        expenseService.getExpenses(filters),
        propertyService.getProperties(),
      ]);
      setExpenses(fetchedExpenses);
      setProperties(fetchedProps);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar los gastos operativos.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lista única de categorías derivadas de los gastos reales
  const categories = useMemo(() => {
    const defaultCats = [
      'Mantenimiento',
      'Limpieza',
      'Lavandería y Blancos',
      'Servicios Básicos (Luz/Agua/Gas)',
      'Telecomunicaciones e Internet',
      'Suministros y Amenities',
      'Reparaciones y Cerrajería',
      'Administración',
      'Otros Gastos Operativos',
    ];
    const fromExpenses = expenses.map((e) => e.categoria);
    return Array.from(new Set([...defaultCats, ...fromExpenses])).sort();
  }, [expenses]);

  // Tarjetas de indicadores
  const metrics = useMemo(() => {
    let totalActivo = 0;
    let cantActivos = 0;
    let totalAnulado = 0;
    let cantAnulados = 0;

    for (const e of expenses) {
      const montoNum = parseFloat(e.monto) || 0;
      if (e.estado === 'ANULADO') {
        totalAnulado += montoNum;
        cantAnulados++;
      } else {
        totalActivo += montoNum;
        cantActivos++;
      }
    }

    const promedio = cantActivos > 0 ? (totalActivo / cantActivos).toFixed(2) : '0.00';

    return {
      totalActivo: totalActivo.toFixed(2),
      cantActivos,
      totalAnulado: totalAnulado.toFixed(2),
      cantAnulados,
      promedio,
    };
  }, [expenses]);

  const handleFilterChange = (newFilters: Partial<ExpenseFilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      propiedadId: 'TODAS',
      categoria: 'TODAS',
      estado: 'TODOS',
      mes: 'TODOS',
      anio: 'TODOS',
    });
  };

  const handleCreateExpense = async (dto: CreateExpenseDto) => {
    try {
      await expenseService.createExpense(dto);
      setFeedback({
        type: 'success',
        message: 'Gasto operativo registrado exitosamente con trazabilidad y sustentos.',
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar el gasto.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  const handleUpdateExpense = async (id: string, dto: UpdateExpenseDto) => {
    try {
      await expenseService.updateExpense(id, dto);
      setFeedback({
        type: 'success',
        message: 'Gasto operativo actualizado exitosamente con registro de auditoría.',
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar el gasto.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  const handleConfirmCancel = async (id: string, motivo: string) => {
    try {
      await expenseService.cancelExpense(id, { motivo });
      setFeedback({
        type: 'success',
        message: 'Gasto anulado formalmente. El motivo y el estado quedan registrados en la auditoría.',
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al anular el gasto.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  const handleAddEvidence = async (gastoId: string, dto: AddEvidenceDto) => {
    try {
      await expenseService.addEvidence(gastoId, dto);
      setFeedback({
        type: 'success',
        message: 'Sustento documental vinculado correctamente al gasto.',
      });
      await loadData();
      if (detailExpense && detailExpense.id === gastoId) {
        const updated = await expenseService.getExpenseById(gastoId);
        setDetailExpense(updated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al vincular el sustento.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  const handleDeleteEvidence = async (gastoId: string, sustentoId: string) => {
    try {
      await expenseService.deleteEvidence(gastoId, sustentoId);
      setFeedback({
        type: 'success',
        message: 'Sustento desvinculado con éxito conservando trazabilidad.',
      });
      await loadData();
      if (detailExpense && detailExpense.id === gastoId) {
        const updated = await expenseService.getExpenseById(gastoId);
        setDetailExpense(updated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al desvincular el sustento.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#183b32] text-white shadow-2xs">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-900">
                Gastos Operativos y Trazabilidad
              </h1>
              <p className="text-xs text-stone-500">
                Control de desembolsos, sustentos documentales, pagadores y RUC DAPLACE (Anexo A.2)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            title="Refrescar datos"
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setExpenseToEdit(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[#183b32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#122c25] transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Registrar Gasto</span>
          </button>
        </div>
      </div>

      {/* Banner de Feedback */}
      {feedback && (
        <div
          className={`flex items-start justify-between rounded-xl p-3.5 text-xs border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-stone-400 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tarjetas de Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Gastos Activos</span>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl font-mono font-bold text-stone-900">
            S/ {metrics.totalActivo}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            {metrics.cantActivos} registro{metrics.cantActivos === 1 ? '' : 's'} operativos
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Comprobantes</span>
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-stone-900">
            {expenses.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Registros totales filtrados
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Gastos Anulados</span>
            <Ban className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-xl font-mono font-bold text-rose-700">
            S/ {metrics.totalAnulado}
          </div>
          <div className="text-[11px] text-rose-500 mt-0.5">
            {metrics.cantAnulados} anulado{metrics.cantAnulados === 1 ? '' : 's'} (con trazabilidad)
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Promedio / Gasto</span>
            <Receipt className="h-4 w-4 text-[#183b32]" />
          </div>
          <div className="text-xl font-mono font-bold text-stone-900">
            S/ {metrics.promedio}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Por registro activo en PEN
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <ExpenseFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        properties={properties}
        categories={categories}
        onReset={handleResetFilters}
      />

      {/* Tabla de Gastos */}
      <ExpenseList
        expenses={expenses}
        loading={loading}
        onViewDetail={(exp) => setDetailExpense(exp)}
        onEdit={(exp) => {
          setExpenseToEdit(exp);
          setIsFormOpen(true);
        }}
        onCancel={(exp) => setCancelExpense(exp)}
        onAddEvidence={(exp) => setDetailExpense(exp)}
      />

      {/* Modales */}
      <ExpenseFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setExpenseToEdit(null);
        }}
        onSubmitCreate={handleCreateExpense}
        onSubmitUpdate={handleUpdateExpense}
        expenseToEdit={expenseToEdit}
        properties={properties}
      />

      <ExpenseDetailModal
        isOpen={Boolean(detailExpense)}
        onClose={() => setDetailExpense(null)}
        expense={detailExpense}
        onAddEvidence={handleAddEvidence}
        onDeleteEvidence={handleDeleteEvidence}
      />

      <ExpenseCancelModal
        isOpen={Boolean(cancelExpense)}
        onClose={() => setCancelExpense(null)}
        expense={cancelExpense}
        onConfirmCancel={handleConfirmCancel}
      />
    </div>
  );
};
