import React from 'react';
import { Eye, Edit3, Ban, Paperclip, ExternalLink } from 'lucide-react';
import type { Expense } from '../types';

interface ExpenseListProps {
  expenses: Expense[];
  loading: boolean;
  onViewDetail: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onCancel: (expense: Expense) => void;
  onAddEvidence: (expense: Expense) => void;
}

export const ExpenseList: React.FC<ExpenseListProps> = ({
  expenses,
  loading,
  onViewDetail,
  onEdit,
  onCancel,
  onAddEvidence,
}) => {
  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-2xs">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-[#183b32]" />
        <p className="mt-2 text-xs font-medium text-stone-500">Cargando gastos operativos...</p>
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-12 text-center shadow-2xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400">
          <Paperclip className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-stone-800">No se encontraron gastos</h3>
        <p className="mt-1 text-xs text-stone-500 max-w-sm mx-auto">
          No hay gastos que coincidan con los filtros aplicados. Registre un nuevo gasto o modifique los criterios de búsqueda.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/75 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              <th className="py-3 px-4">Fecha / Periodo</th>
              <th className="py-3 px-4">Inmueble</th>
              <th className="py-3 px-4">Título y Categoría</th>
              <th className="py-3 px-4">Pagador</th>
              <th className="py-3 px-4">RUC DAPLACE</th>
              <th className="py-3 px-4">Repartido</th>
              <th className="py-3 px-4">Sustentos</th>
              <th className="py-3 px-4 text-right">Monto (S/)</th>
              <th className="py-3 px-4 text-center">Estado</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
            {expenses.map((expense) => {
              const isAnnulled = expense.estado === 'ANULADO';

              return (
                <tr
                  key={expense.id}
                  className={`transition-colors hover:bg-stone-50/60 ${
                    isAnnulled ? 'bg-stone-50/40 text-stone-400' : ''
                  }`}
                >
                  {/* Fecha y Periodo */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className={`font-semibold ${isAnnulled ? 'line-through text-stone-400' : 'text-stone-900'}`}>
                      {expense.fechaGasto}
                    </div>
                    <div className="text-[10px] text-stone-400">
                      Periodo: {expense.periodoMes.toString().padStart(2, '0')}/{expense.periodoAnio}
                    </div>
                  </td>

                  {/* Propiedad */}
                  <td className="py-3 px-4 max-w-[180px] truncate">
                    <span className="font-medium text-stone-800" title={expense.propiedadNombre || expense.propiedadId}>
                      {expense.propiedadNombre || expense.propiedadId}
                    </span>
                  </td>

                  {/* Título y Categoría */}
                  <td className="py-3 px-4 max-w-[240px]">
                    <div
                      className={`font-medium truncate ${isAnnulled ? 'line-through text-stone-400' : 'text-stone-900'}`}
                      title={expense.titulo}
                    >
                      {expense.titulo}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="inline-block rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                        {expense.categoria}
                      </span>
                      {expense.notas && (
                        <span className="truncate text-[10px] text-stone-400 max-w-[120px]" title={expense.notas}>
                          {expense.notas}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Pagador */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700">
                      {expense.pagadoPor}
                    </span>
                  </td>

                  {/* ¿Uso RUC DAPLACE? */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {expense.usoRucDaplace === true && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        Sí
                      </span>
                    )}
                    {expense.usoRucDaplace === false && (
                      <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600 border border-stone-200">
                        No
                      </span>
                    )}
                    {expense.usoRucDaplace === null && (
                      <span className="text-[11px] text-stone-400 italic">Sin info</span>
                    )}
                  </td>

                  {/* Repartido (semántica pendiente) */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {expense.repartido ? (
                      <span
                        className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200"
                        title="Semántica pendiente de definición formal de liquidación"
                      >
                        {expense.repartido}
                      </span>
                    ) : (
                      <span className="text-[11px] text-stone-400 italic">—</span>
                    )}
                  </td>

                  {/* Sustentos */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {expense.sustentos && expense.sustentos.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
                          <Paperclip className="h-3 w-3 text-stone-400" />
                          {expense.sustentos.length}
                        </span>
                        {expense.sustentos.length === 1 && (
                          <a
                            href={expense.sustentos[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#183b32] hover:text-[#0e241f] transition-colors"
                            title={`Abrir sustento: ${expense.sustentos[0].nombreArchivo}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-stone-400 italic">Sin archivo</span>
                    )}
                  </td>

                  {/* Monto (S/) */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span
                      className={`font-mono text-xs font-bold ${
                        isAnnulled ? 'line-through text-stone-400' : 'text-stone-900'
                      }`}
                    >
                      S/ {expense.monto}
                    </span>
                  </td>

                  {/* Estado */}
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    {expense.estado === 'REGISTRADO' && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                        Registrado
                      </span>
                    )}
                    {expense.estado === 'APROBADO' && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        Aprobado
                      </span>
                    )}
                    {expense.estado === 'ANULADO' && (
                      <span
                        className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200"
                        title={expense.motivoAnulacion || 'Gasto anulado'}
                      >
                        Anulado
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {/* Ver detalle */}
                      <button
                        type="button"
                        onClick={() => onViewDetail(expense)}
                        title="Ver detalle completo y trazabilidad"
                        className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      {/* Adjuntar sustento */}
                      {!isAnnulled && (
                        <button
                          type="button"
                          onClick={() => onAddEvidence(expense)}
                          title="Adjuntar nuevo sustento"
                          className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                      )}

                      {/* Editar (solo activos) */}
                      {!isAnnulled && (
                        <button
                          type="button"
                          onClick={() => onEdit(expense)}
                          title="Editar gasto"
                          className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      )}

                      {/* Anular (solo activos) */}
                      {!isAnnulled && (
                        <button
                          type="button"
                          onClick={() => onCancel(expense)}
                          title="Anular gasto con justificación"
                          className="rounded-md p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-800 transition-colors cursor-pointer"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
