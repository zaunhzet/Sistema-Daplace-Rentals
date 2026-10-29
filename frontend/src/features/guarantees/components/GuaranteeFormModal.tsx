import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { CreateGuaranteeDto } from '../types';
import type { Reservation } from '../../reservations';
import { formatMoney, validateMoneyInput } from '../../../shared/money';

interface GuaranteeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateGuaranteeDto) => Promise<void>;
  reservations: Reservation[];
  preselectedReservaId?: string;
}

export const GuaranteeFormModal: React.FC<GuaranteeFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  reservations,
  preselectedReservaId,
}) => {
  const [reservaId, setReservaId] = useState<string>('');
  const [importe, setImporte] = useState<string>('');
  const [moneda, setMoneda] = useState<string>('PEN');
  const [metodoRecepcion, setMetodoRecepcion] = useState<string>('Depósito Bancario / Preautorización');
  const [motivo, setMotivo] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initialReserva = preselectedReservaId || (reservations.length > 0 ? reservations[0]?.id : '');
      setReservaId(initialReserva || '');
      setImporte('');
      setMetodoRecepcion('Depósito Bancario / Preautorización');
      setMotivo('Depósito de garantía recibido en custodia previo al ingreso.');
      setErrors({});

      const found = reservations.find((r) => r.id === initialReserva);
      if (found) {
        setMoneda(found.moneda || 'PEN');
      }
    }
  }, [isOpen, preselectedReservaId, reservations]);

  const selectedReservation = reservations.find((r) => r.id === reservaId);

  const handleReservaChange = (newReservaId: string) => {
    setReservaId(newReservaId);
    const found = reservations.find((r) => r.id === newReservaId);
    if (found) {
      setMoneda(found.moneda || 'PEN');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!reservaId) {
      newErrors.reservaId = 'Debe seleccionar una reserva.';
    }

    const moneyValidation = validateMoneyInput(importe);
    if (!moneyValidation.isValid) {
      newErrors.importe = moneyValidation.error || 'Importe inválido.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      await onSubmit({
        reservaId,
        importe: importe.trim(),
        moneda,
        metodoRecepcion: metodoRecepcion.trim() || undefined,
        motivo: motivo.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : 'Error al registrar la garantía.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-stone-900">Registrar Garantía en Custodia</h3>
          <p className="text-xs text-stone-600 mt-0.5">
            Los fondos de garantía se registran bajo un balance independiente y no se computan como ingresos de alquiler.
          </p>
        </div>

        {errors.form && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{errors.form}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selección de Reserva */}
          <div>
            <label htmlFor="gar-reserva" className="block text-xs font-semibold text-stone-700 mb-1">
              RESERVA VINCULADA *
            </label>
            <select
              id="gar-reserva"
              value={reservaId}
              onChange={(e) => handleReservaChange(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="">Seleccione una reserva...</option>
              {reservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.huespedNombre} ({r.propiedadNombre})
                </option>
              ))}
            </select>
            {errors.reservaId && <p className="mt-1 text-[11px] text-rose-600">{errors.reservaId}</p>}
          </div>

          {/* Contexto de la reserva */}
          {selectedReservation && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3 text-xs text-stone-700">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-stone-500">Inmueble:</span>{' '}
                  <strong className="text-stone-800">{selectedReservation.propiedadNombre}</strong>
                </div>
                <div>
                  <span className="text-stone-500">Huésped:</span>{' '}
                  <strong className="text-stone-800">{selectedReservation.huespedNombre}</strong>
                </div>
                <div>
                  <span className="text-stone-500">Pactado alquiler:</span>{' '}
                  <span className="font-mono text-stone-800">
                    {formatMoney(selectedReservation.montoAcordado, selectedReservation.moneda)}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500">Estancia:</span>{' '}
                  <span className="text-stone-700">
                    {selectedReservation.ingreso} al {selectedReservation.salida}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Importe y Moneda */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="gar-importe" className="block text-xs font-semibold text-stone-700 mb-1">
                MONTO DE GARANTÍA *
              </label>
              <input
                id="gar-importe"
                type="text"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="Ej. 300.00"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden font-mono"
              />
              {errors.importe && <p className="mt-1 text-[11px] text-rose-600">{errors.importe}</p>}
            </div>

            <div>
              <label htmlFor="gar-moneda" className="block text-xs font-semibold text-stone-700 mb-1">
                MONEDA
              </label>
              <input
                id="gar-moneda"
                type="text"
                value={moneda}
                readOnly
                className="w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Método de Recepción / Comprobante */}
          <div>
            <label htmlFor="gar-metodo" className="block text-xs font-semibold text-stone-700 mb-1">
              MÉTODO DE RECEPCIÓN / SOPORTE
            </label>
            <input
              id="gar-metodo"
              type="text"
              value={metodoRecepcion}
              onChange={(e) => setMetodoRecepcion(e.target.value)}
              placeholder="Ej. Tarjeta de crédito preautorizada / Transferencia BCP"
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            />
          </div>

          {/* Motivo o Detalle */}
          <div>
            <label htmlFor="gar-motivo" className="block text-xs font-semibold text-stone-700 mb-1">
              OBSERVACIONES O CONDICIONES
            </label>
            <textarea
              id="gar-motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Detalles sobre política de devolución o custodia..."
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden resize-none"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-3">
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
              className="rounded-xl bg-[#162A2C] px-5 py-2 text-xs font-semibold text-white hover:bg-[#183b32] transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Registrando...' : 'Recibir Garantía'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
