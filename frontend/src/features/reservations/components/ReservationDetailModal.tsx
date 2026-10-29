import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { Reservation } from '../types';

interface ReservationDetailModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
  onCancel: (id: string, motivo: string) => Promise<void>;
  onOpenEditDates: (reservation: Reservation) => void;
}

export const ReservationDetailModal: React.FC<ReservationDetailModalProps> = ({
  reservation,
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  onOpenEditDates,
}) => {
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !reservation) return null;

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'CONFIRMADA':
        return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Confirmada</span>;
      case 'SOLICITADA':
        return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Solicitada (Pendiente)</span>;
      case 'COMPLETADA':
        return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Completada</span>;
      case 'CANCELADA':
        return <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">Cancelada</span>;
      default:
        return <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{estado}</span>;
    }
  };

  const handleConfirmClick = async () => {
    try {
      setIsProcessing(true);
      setActionError(null);
      await onConfirm(reservation.id);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Error al confirmar la reserva.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsProcessing(true);
      setActionError(null);
      await onCancel(reservation.id, cancelMotivo);
      setIsCanceling(false);
      setCancelMotivo('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Error al cancelar la reserva.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-8 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="detail-res-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs font-bold text-stone-700">
                {reservation.id}
              </span>
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600 font-mono">
                Canal: {reservation.origen}
              </span>
            </div>
            <h2 id="detail-res-title" className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
              {reservation.propiedadNombre}
            </h2>
            <p className="text-sm text-stone-500 mt-0.5">
              Huésped: <span className="font-semibold text-stone-800">{reservation.huespedNombre}</span>
              {reservation.huespedContacto && ` (${reservation.huespedContacto})`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {actionError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="mt-6 space-y-6">
          {/* Status and Stay Summary */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Estado Transaccional</p>
              <div>{getStatusBadge(reservation.estado)}</div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Importe Acordado</p>
              <p className="text-xl font-bold text-stone-900">
                {reservation.moneda === 'USD' ? '$' : 'S/'} {reservation.montoAcordado.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Dates Interval */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Intervalo Semiabierto de Estancia [ingreso, salida)
            </h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-stone-400 uppercase font-semibold">Check-in</p>
                <p className="text-base font-bold text-stone-800 font-mono mt-0.5">{reservation.ingreso}</p>
              </div>
              <div className="text-center px-4 py-1.5 rounded-full bg-stone-100 text-xs font-bold text-stone-600">
                → {reservation.noches} noche{reservation.noches > 1 ? 's' : ''} →
              </div>
              <div>
                <p className="text-xs text-stone-400 uppercase font-semibold">Check-out</p>
                <p className="text-base font-bold text-stone-800 font-mono mt-0.5">{reservation.salida}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-stone-400">
              * El día de check-out ({reservation.salida}) queda disponible para un nuevo check-in en la tarde (consecutivas permitidas).
            </p>
          </div>

          {/* Reference & Notes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Origen / Referencia</p>
              <p className="mt-1 text-sm font-semibold text-stone-800">
                {reservation.origen} {reservation.referenciaCanal ? `(${reservation.referenciaCanal})` : ''}
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Última Actualización</p>
              <p className="mt-1 text-xs text-stone-600 font-mono">
                {new Date(reservation.actualizadaEn).toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          {reservation.notas && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Notas u Observaciones</p>
              <p className="text-sm text-stone-700 leading-relaxed">{reservation.notas}</p>
            </div>
          )}

          {reservation.estado === 'CANCELADA' && (
            <div className="rounded-2xl border border-stone-300 bg-stone-100 p-4 text-xs text-stone-800">
              <p className="font-semibold text-stone-900 mb-1">Motivo de Cancelación</p>
              <p>{reservation.motivoCancelacion || 'Cancelación registrada en el sistema.'}</p>
              <p className="mt-1.5 text-stone-500 font-medium">
                ✓ Disponibilidad liberada en el calendario según la regla de negocio.
              </p>
            </div>
          )}

          {/* Formulario de Cancelación */}
          {isCanceling && (
            <form onSubmit={handleCancelSubmit} className="rounded-2xl border border-red-200 bg-red-50/60 p-4 space-y-3">
              <p className="text-xs font-bold text-red-900 uppercase tracking-wide">
                Confirmar Cancelación de Reserva
              </p>
              <p className="text-xs text-red-800 leading-relaxed">
                Esta acción cambiará el estado a CANCELADA y liberará inmediatamente los días ocupados en el calendario de disponibilidad.
              </p>
              <input
                type="text"
                required
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                placeholder="Motivo de la cancelación (obligatorio)..."
                className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-hidden"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCanceling(false)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="rounded-lg bg-red-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-800 cursor-pointer"
                >
                  {isProcessing ? 'Cancelando...' : 'Confirmar Cancelación'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-200 pt-5">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {reservation.estado !== 'CANCELADA' && !isCanceling && (
              <button
                type="button"
                onClick={() => setIsCanceling(true)}
                className="rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              >
                Cancelar Reserva
              </button>
            )}

            {reservation.estado !== 'CANCELADA' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditDates(reservation);
                }}
                className="rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                Modificar Fechas
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
            >
              Cerrar
            </button>

            {reservation.estado === 'SOLICITADA' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmClick}
                className="rounded-xl bg-[#183b32] px-5 py-2 text-sm font-semibold text-white hover:bg-[#122e27] cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Validando...' : 'Confirmar Reserva'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
