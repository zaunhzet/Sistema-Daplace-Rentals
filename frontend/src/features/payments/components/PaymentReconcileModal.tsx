import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Payment, ReconcilePaymentDto } from '../types';
import { formatMoney } from '../../../shared/money';

interface PaymentReconcileModalProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string, dto?: ReconcilePaymentDto) => Promise<void>;
}

export const PaymentReconcileModal: React.FC<PaymentReconcileModalProps> = ({
  payment,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [referencia, setReferencia] = useState<string>('');
  const [notas, setNotas] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (payment) {
      setReferencia(payment.referencia || '');
      setNotas('');
      setError(null);
    }
  }, [payment]);

  if (!isOpen || !payment) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onConfirm(payment.id, {
        referencia: referencia.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al conciliar el pago.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-900">Conciliar Abono Bancario</h3>
            <p className="text-xs text-stone-600">
              Transición formal a <strong className="text-emerald-800">CONCILIADO</strong>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-5 rounded-2xl border border-stone-200 bg-stone-50/80 p-4 text-xs text-stone-700 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-stone-500">Abono:</span>
            <span className="font-mono font-bold text-stone-800">{payment.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Reserva:</span>
            <span className="font-semibold text-stone-800">{payment.reservaId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Huésped:</span>
            <span className="font-medium text-stone-800">{payment.huespedNombre}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-stone-200 text-sm">
            <span className="font-semibold text-stone-700">Importe a validar:</span>
            <span className="font-bold text-emerald-800 font-mono">
              {formatMoney(payment.importe, payment.moneda)}
            </span>
          </div>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label htmlFor="conciliar-ref" className="block text-xs font-semibold text-stone-700 mb-1">
              REFERENCIA / NÚMERO DE OPERACIÓN EXTRACTO
            </label>
            <input
              id="conciliar-ref"
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. BCP-77610 / EXT-009"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="conciliar-notas" className="block text-xs font-semibold text-stone-700 mb-1">
              NOTAS DE AUDITORÍA
            </label>
            <textarea
              id="conciliar-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Confirmado con extracto cuenta corriente..."
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-900 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Conciliando...' : 'Confirmar Conciliación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
