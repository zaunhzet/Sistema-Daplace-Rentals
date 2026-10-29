import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { Guarantee, RegisterGuaranteeMovementDto } from '../types';
import { formatMoney, validateMoneyInput } from '../../../shared/money';

interface GuaranteeMovementModalProps {
  guarantee: Guarantee | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (garantiaId: string, dto: RegisterGuaranteeMovementDto) => Promise<void>;
  defaultType?: 'RETENCION' | 'DEVOLUCION_PARCIAL' | 'DEVOLUCION_TOTAL';
}

export const GuaranteeMovementModal: React.FC<GuaranteeMovementModalProps> = ({
  guarantee,
  isOpen,
  onClose,
  onSubmit,
  defaultType = 'DEVOLUCION_TOTAL',
}) => {
  const [tipo, setTipo] = useState<'RETENCION' | 'DEVOLUCION_PARCIAL' | 'DEVOLUCION_TOTAL'>(defaultType);
  const [importe, setImporte] = useState<string>('');
  const [motivo, setMotivo] = useState<string>('');
  const [documentoSoporte, setDocumentoSoporte] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && guarantee) {
      setTipo(defaultType);
      if (defaultType === 'DEVOLUCION_TOTAL') {
        setImporte(guarantee.saldoDisponible);
        setMotivo('Devolución total de la garantía tras inspección conforme de check-out.');
      } else if (defaultType === 'RETENCION') {
        setImporte('');
        setMotivo('Retención justificada por rotura o daño comprobado durante la inspección.');
      } else {
        setImporte('');
        setMotivo('Devolución parcial acordada con el huésped.');
      }
      setDocumentoSoporte('');
      setError(null);
    }
  }, [isOpen, guarantee, defaultType]);

  const handleTipoChange = (newTipo: 'RETENCION' | 'DEVOLUCION_PARCIAL' | 'DEVOLUCION_TOTAL') => {
    setTipo(newTipo);
    if (!guarantee) return;

    if (newTipo === 'DEVOLUCION_TOTAL') {
      setImporte(guarantee.saldoDisponible);
      setMotivo('Devolución total de la garantía tras inspección conforme de check-out.');
    } else if (newTipo === 'RETENCION') {
      setMotivo('Retención justificada por rotura o daño comprobado durante la inspección.');
    } else {
      setMotivo('Devolución parcial acordada con el huésped.');
    }
  };

  if (!isOpen || !guarantee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const moneyCheck = validateMoneyInput(importe);
    if (!moneyCheck.isValid) {
      setError(moneyCheck.error || 'Importe inválido.');
      return;
    }

    if (!motivo.trim() || motivo.trim().length < 3) {
      setError('Debe detallar el motivo del movimiento (mínimo 3 caracteres).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit(guarantee.id, {
        tipo,
        importe: importe.trim(),
        motivo: motivo.trim(),
        documentoSoporte: documentoSoporte.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al registrar el movimiento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>

        <div className="mb-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5E6C5B]">
            MOVIMIENTO CONTABLE DE GARANTÍA
          </span>
          <h3 className="text-lg font-bold text-stone-900 mt-1">Registrar Movimiento</h3>
          <p className="text-xs text-stone-600 mt-0.5">
            Garantía {guarantee.id} • Reserva {guarantee.reservaId}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Resumen del Saldo Disponible */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50/80 p-3.5 text-xs text-stone-700">
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Saldo Disponible en Custodia:</span>
            <span className="font-mono font-bold text-sm text-[#183b32]">
              {formatMoney(guarantee.saldoDisponible, guarantee.moneda)}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1 text-[11px] text-stone-500">
            <span>Huésped: {guarantee.huespedNombre}</span>
            <span>Recibido inicial: {formatMoney(guarantee.importeRecibido, guarantee.moneda)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de Movimiento */}
          <div>
            <label htmlFor="mov-tipo" className="block text-xs font-semibold text-stone-700 mb-1">
              TIPO DE MOVIMIENTO *
            </label>
            <select
              id="mov-tipo"
              value={tipo}
              onChange={(e) =>
                handleTipoChange(e.target.value as 'RETENCION' | 'DEVOLUCION_PARCIAL' | 'DEVOLUCION_TOTAL')
              }
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="DEVOLUCION_TOTAL">Devolución Total (Cierre de Custodia)</option>
              <option value="DEVOLUCION_PARCIAL">Devolución Parcial</option>
              <option value="RETENCION">Retención por Daños / Penalidad</option>
            </select>
          </div>

          {/* Importe del Movimiento */}
          <div>
            <label htmlFor="mov-importe" className="block text-xs font-semibold text-stone-700 mb-1">
              IMPORTE ({guarantee.moneda}) *
            </label>
            <input
              id="mov-importe"
              type="text"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="Ej. 100.00"
              readOnly={tipo === 'DEVOLUCION_TOTAL'}
              className={`w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono text-stone-800 focus:border-[#183b32] focus:outline-hidden ${
                tipo === 'DEVOLUCION_TOTAL' ? 'bg-stone-100 cursor-not-allowed' : 'bg-stone-50 focus:bg-white'
              }`}
            />
            <p className="mt-1 text-[11px] text-stone-500">
              No puede superar el saldo disponible ({formatMoney(guarantee.saldoDisponible, guarantee.moneda)}).
            </p>
          </div>

          {/* Motivo del Movimiento */}
          <div>
            <label htmlFor="mov-motivo" className="block text-xs font-semibold text-stone-700 mb-1">
              MOTIVO / JUSTIFICACIÓN *
            </label>
            <textarea
              id="mov-motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Detalle la justificación del reembolso o daño..."
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden resize-none"
            />
          </div>

          {/* Documento de Soporte */}
          <div>
            <label htmlFor="mov-soporte" className="block text-xs font-semibold text-stone-700 mb-1">
              DOCUMENTO DE SOPORTE / ACTA (OPCIONAL)
            </label>
            <input
              id="mov-soporte"
              type="text"
              value={documentoSoporte}
              onChange={(e) => setDocumentoSoporte(e.target.value)}
              placeholder="Ej. ACTA-INSPECCION-402 / FACTURA-REP-91"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
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
              className={`rounded-xl px-5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
                tipo === 'RETENCION'
                  ? 'bg-amber-800 hover:bg-amber-900'
                  : 'bg-emerald-800 hover:bg-emerald-900'
              }`}
            >
              {loading
                ? 'Registrando...'
                : tipo === 'RETENCION'
                ? 'Aplicar Retención'
                : 'Confirmar Devolución'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
