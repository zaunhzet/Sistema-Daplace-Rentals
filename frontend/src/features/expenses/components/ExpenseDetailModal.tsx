import React, { useState } from 'react';
import { X, ExternalLink, Paperclip, Plus, Trash2, AlertCircle } from 'lucide-react';
import type { AddEvidenceDto, Expense } from '../types';

interface ExpenseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  onAddEvidence: (gastoId: string, dto: AddEvidenceDto) => Promise<void>;
  onDeleteEvidence: (gastoId: string, sustentoId: string) => Promise<void>;
}

export const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({
  isOpen,
  onClose,
  expense,
  onAddEvidence,
  onDeleteEvidence,
}) => {
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !expense) return null;

  const isAnnulled = expense.estado === 'ANULADO';

  const handleAddEvidenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nombreArchivo.trim()) {
      setErrorMsg('El nombre del sustento es obligatorio.');
      return;
    }

    try {
      new URL(url.trim());
    } catch {
      setErrorMsg('La URL debe ser un enlace HTTP o HTTPS válido.');
      return;
    }

    setSubmitting(true);
    try {
      await onAddEvidence(expense.id, {
        nombreArchivo: nombreArchivo.trim(),
        url: url.trim(),
        tipo: 'COMPROBANTE',
        origen: url.includes('drive.google.com') ? 'DRIVE' : 'MANUAL',
      });
      setNombreArchivo('');
      setUrl('');
      setShowAddForm(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al adjuntar sustento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvidence = async (sustentoId: string) => {
    if (!window.confirm('¿Está seguro de desvincular este sustento? Se conservará la trazabilidad en auditoría.')) {
      return;
    }
    try {
      await onDeleteEvidence(expense.id, sustentoId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el sustento.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900">{expense.titulo}</h2>
              {isAnnulled ? (
                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                  ANULADO
                </span>
              ) : (
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                  {expense.estado}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-0.5">ID: {expense.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Alerta si está anulado */}
          {isAnnulled && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div className="text-xs text-rose-800">
                  <p className="font-bold">Gasto anulado</p>
                  <p className="mt-0.5"><span className="font-semibold">Motivo:</span> {expense.motivoAnulacion || 'Sin motivo registrado'}</p>
                  <p className="text-[11px] text-rose-600 mt-0.5">
                    Anulado en: {expense.anuladoEn || 'Fecha no registrada'} por {expense.anuladoPor || 'Administrador'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Grid de Información Principal */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-xl border border-stone-200 bg-stone-50/40 p-4 text-xs">
            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Inmueble</span>
              <span className="font-semibold text-stone-900 mt-0.5 block">
                {expense.propiedadNombre || expense.propiedadId}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Fecha Comprobante</span>
              <span className="font-semibold text-stone-900 mt-0.5 block">{expense.fechaGasto}</span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Periodo Declarado</span>
              <span className="font-semibold text-stone-900 mt-0.5 block">
                Mes {expense.periodoMes.toString().padStart(2, '0')} / {expense.periodoAnio}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Monto Total</span>
              <span className="font-mono font-bold text-stone-900 text-sm mt-0.5 block">
                S/ {expense.monto}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Categoría</span>
              <span className="font-semibold text-stone-900 mt-0.5 block">{expense.categoria}</span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Pagado por</span>
              <span className="font-semibold text-stone-900 mt-0.5 block">{expense.pagadoPor}</span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">RUC DAPLACE</span>
              <span className="mt-0.5 block">
                {expense.usoRucDaplace === true && <span className="font-semibold text-emerald-700">Sí</span>}
                {expense.usoRucDaplace === false && <span className="font-semibold text-stone-600">No</span>}
                {expense.usoRucDaplace === null && <span className="text-stone-400 italic">Sin información</span>}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Repartido</span>
              <span className="mt-0.5 block text-stone-800">
                {expense.repartido ? (
                  <span className="font-medium text-amber-800">{expense.repartido}</span>
                ) : (
                  <span className="text-stone-400 italic">No especificado</span>
                )}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider">Registrado Por</span>
              <span className="text-stone-800 mt-0.5 block">{expense.registradoPor || 'Sistema'}</span>
            </div>
          </div>

          {/* Notas */}
          {expense.notas && (
            <div>
              <span className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                Notas u Observaciones
              </span>
              <p className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-700 whitespace-pre-wrap">
                {expense.notas}
              </p>
            </div>
          )}

          {/* Sección de Sustentos y Evidencias */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-stone-500" />
                Sustentos y Comprobantes ({expense.sustentos?.length || 0})
              </span>
              {!isAnnulled && !showAddForm && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Adjuntar Enlace</span>
                </button>
              )}
            </div>

            {/* Formulario rápido para adjuntar sustento */}
            {showAddForm && !isAnnulled && (
              <form onSubmit={handleAddEvidenceSubmit} className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 space-y-3 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800">Nuevo Enlace de Sustento</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setErrorMsg(null);
                    }}
                    className="text-stone-400 hover:text-stone-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {errorMsg && (
                  <p className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-md border border-rose-200">
                    {errorMsg}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={nombreArchivo}
                    onChange={(e) => setNombreArchivo(e.target.value)}
                    placeholder="Nombre o descripción (ej: Factura BCP.pdf)"
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
                    required
                  />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="URL del comprobante (Google Drive / HTTP)"
                    className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-lg border border-stone-200 px-3 py-1 text-xs text-stone-600 hover:bg-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-[#183b32] px-3 py-1 text-xs font-semibold text-white hover:bg-[#122c25] disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'Vinculando...' : 'Vincular'}
                  </button>
                </div>
              </form>
            )}

            {/* Lista de sustentos */}
            {(!expense.sustentos || expense.sustentos.length === 0) ? (
              <p className="text-xs text-stone-400 italic py-2">
                No hay sustentos ni comprobantes adjuntos a este gasto.
              </p>
            ) : (
              <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white overflow-hidden">
                {expense.sustentos.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 hover:bg-stone-50/50 transition-colors">
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                        <span className="text-xs font-semibold text-stone-800 truncate" title={s.nombreArchivo}>
                          {s.nombreArchivo}
                        </span>
                        <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[9px] font-semibold text-stone-500 uppercase">
                          {s.origen || 'DRIVE'}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-400 truncate mt-0.5 ml-5" title={s.url}>
                        {s.url}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-[#183b32] hover:bg-stone-50 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Abrir</span>
                      </a>

                      {!isAnnulled && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEvidence(s.id)}
                          title="Desvincular sustento"
                          className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-stone-100 px-6 py-3 bg-stone-50/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
