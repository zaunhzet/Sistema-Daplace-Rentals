import React, { useState } from 'react';
import { X, Ban, AlertTriangle } from 'lucide-react';
import type { Expense } from '../types';

interface ExpenseCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  onConfirmCancel: (id: string, motivo: string) => Promise<void>;
}

export const ExpenseCancelModal: React.FC<ExpenseCancelModalProps> = ({
  isOpen,
  onClose,
  expense,
  onConfirmCancel,
}) => {
  const [motivo, setMotivo] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !expense) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!motivo.trim() || motivo.trim().length < 3) {
      setErrorMsg('Debe indicar un motivo de anulación justificado (mínimo 3 caracteres).');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirmCancel(expense.id, motivo.trim());
      setMotivo('');
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al anular el gasto.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-stone-200">
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <div className="flex items-center gap-2 text-rose-700">
            <Ban className="h-5 w-5" />
            <h2 className="text-base font-bold text-stone-900">Anular Gasto Operativo</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold">Atención</p>
              <p className="mt-0.5">
                La anulación es irreversible y no elimina físicamente el registro. Se conservará la trazabilidad completa en la auditoría del sistema.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">Gasto a anular</span>
            <p className="font-semibold text-stone-900 mt-0.5">{expense.titulo}</p>
            <p className="text-stone-600 mt-0.5">
              Monto: <span className="font-mono font-bold">S/ {expense.monto}</span> | Inmueble: {expense.propiedadNombre || expense.propiedadId}
            </p>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              {errorMsg}
            </p>
          )}

          <div>
            <label htmlFor="cancel-motivo" className="block text-xs font-semibold text-stone-700 mb-1">
              Motivo o justificación de anulación <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="cancel-motivo"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Describa la razón de la anulación (ej: comprobante duplicado, compra devuelta, monto incorrecto...)"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-rose-600 focus:outline-hidden resize-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Ban className="h-4 w-4" />
              <span>{submitting ? 'Anulando...' : 'Confirmar Anulación'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
