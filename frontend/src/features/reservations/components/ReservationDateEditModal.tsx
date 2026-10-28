import React, { useState, useEffect } from 'react';
import type { Reservation, UpdateReservationDatesDto } from '../types';
import { calculateNights, validateReservationDates } from '../services/reservationService';

interface ReservationDateEditModalProps {
  isOpen: boolean;
  reservation: Reservation | null;
  onClose: () => void;
  onSubmit: (id: string, dto: UpdateReservationDatesDto) => Promise<void>;
}

export const ReservationDateEditModal: React.FC<ReservationDateEditModalProps> = ({
  isOpen,
  reservation,
  onClose,
  onSubmit,
}) => {
  const [ingreso, setIngreso] = useState('');
  const [salida, setSalida] = useState('');
  const [montoAcordado, setMontoAcordado] = useState<number>(0);
  const [notas, setNotas] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (reservation) {
      setIngreso(reservation.ingreso);
      setSalida(reservation.salida);
      setMontoAcordado(reservation.montoAcordado);
      setNotas(reservation.notas || '');
      setError(null);
    }
  }, [reservation, isOpen]);

  if (!isOpen || !reservation) return null;

  const nights = calculateNights(ingreso, salida);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const dateCheck = validateReservationDates(ingreso, salida);
    if (!dateCheck.isValid) {
      setError(dateCheck.error || 'Fechas inválidas.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(reservation.id, {
        ingreso,
        salida,
        montoAcordado: Number(montoAcordado),
        notas: notas.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocurrió un error al modificar las fechas.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl sm:p-8"
        role="dialog"
        aria-labelledby="edit-dates-title"
      >
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-6">
          <div>
            <h2 id="edit-dates-title" className="text-xl font-bold tracking-tight text-stone-900">
              Modificar Fechas de Reserva
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Reserva: <span className="font-mono font-semibold text-stone-700">{reservation.id}</span> · {reservation.propiedadNombre}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900 leading-relaxed">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-ingreso" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Nueva Fecha de Ingreso <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-ingreso"
                type="date"
                value={ingreso}
                onChange={(e) => setIngreso(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
            </div>

            <div>
              <label htmlFor="edit-salida" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Nueva Fecha de Salida <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-salida"
                type="date"
                value={salida}
                onChange={(e) => setSalida(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
            </div>
          </div>

          {nights > 0 && (
            <div className="rounded-xl bg-stone-100 p-2.5 text-xs text-stone-700 flex items-center justify-between">
              <span>Nueva duración calculada:</span>
              <span className="font-bold text-[#183b32]">{nights} noche{nights > 1 ? 's' : ''}</span>
            </div>
          )}

          <div>
            <label htmlFor="edit-monto" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Precio Acordado ({reservation.moneda})
            </label>
            <input
              id="edit-monto"
              type="number"
              step="0.01"
              min="1"
              value={montoAcordado || ''}
              onChange={(e) => setMontoAcordado(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="edit-notas" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Motivo o Notas del Cambio
            </label>
            <textarea
              id="edit-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Indique el motivo de la reprogramación..."
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-stone-200 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[#183b32] px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#122e27] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Revalidando disponibilidad...' : 'Actualizar Fechas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
