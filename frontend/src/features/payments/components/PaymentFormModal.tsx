import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { ConceptoPago, CreatePaymentDto, MetodoPago } from '../types';
import type { Reservation } from '../../reservations';
import { formatMoney, validateMoneyInput } from '../../../shared/money';

interface PaymentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dto: CreatePaymentDto) => Promise<void>;
  reservations: Reservation[];
  preselectedReservaId?: string;
}

export const PaymentFormModal: React.FC<PaymentFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  reservations,
  preselectedReservaId,
}) => {
  const [reservaId, setReservaId] = useState<string>('');
  const [importe, setImporte] = useState<string>('');
  const [moneda, setMoneda] = useState<string>('PEN');
  const [concepto, setConcepto] = useState<ConceptoPago>('ADELANTO');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('TRANSFERENCIA');
  const [referencia, setReferencia] = useState<string>('');
  const [fechaPago, setFechaPago] = useState<string>(new Date().toISOString().substring(0, 10));
  const [notas, setNotas] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initialReserva = preselectedReservaId || (reservations.length > 0 ? reservations[0]?.id : '');
      setReservaId(initialReserva || '');
      setImporte('');
      setConcepto('ADELANTO');
      setMetodoPago('TRANSFERENCIA');
      setReferencia('');
      setFechaPago(new Date().toISOString().substring(0, 10));
      setNotas('');
      setIdempotencyKey(`idem-${Date.now().toString(36)}`);
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

    if (!referencia.trim()) {
      newErrors.referencia = 'La referencia de la transacción es obligatoria.';
    }

    if (!fechaPago) {
      newErrors.fechaPago = 'La fecha de pago es obligatoria.';
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
        concepto,
        metodoPago,
        referencia: referencia.trim(),
        fechaPago,
        idempotencyKey: idempotencyKey.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrors({ form: err instanceof Error ? err.message : 'Error inesperado al registrar el pago.' });
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
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5E6C5B]">
            MÓDULO HU-05 / RF05
          </span>
          <h3 className="text-xl font-bold text-stone-900 mt-1">Registrar Abono o Adelanto</h3>
          <p className="text-xs text-stone-600 mt-0.5">
            El pago se registrará en estado inicial <strong className="text-amber-800">PENDIENTE_CONCILIACION</strong>{' '}
            hasta su conciliación formal con el extracto bancario.
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
            <label htmlFor="pago-reserva" className="block text-xs font-semibold text-stone-700 mb-1">
              RESERVA ASOCIADA *
            </label>
            <select
              id="pago-reserva"
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

          {/* Información contextual de la reserva */}
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
                  <span className="text-stone-500">Monto pactado:</span>{' '}
                  <strong className="text-stone-800">
                    {formatMoney(selectedReservation.montoAcordado, selectedReservation.moneda)}
                  </strong>
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
              <label htmlFor="pago-importe" className="block text-xs font-semibold text-stone-700 mb-1">
                IMPORTE DEL ABONO *
              </label>
              <input
                id="pago-importe"
                type="text"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="Ej. 500.00"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden font-mono"
              />
              {errors.importe && <p className="mt-1 text-[11px] text-rose-600">{errors.importe}</p>}
            </div>

            <div>
              <label htmlFor="pago-moneda" className="block text-xs font-semibold text-stone-700 mb-1">
                MONEDA
              </label>
              <input
                id="pago-moneda"
                type="text"
                value={moneda}
                readOnly
                className="w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Concepto y Medio de Pago */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pago-concepto" className="block text-xs font-semibold text-stone-700 mb-1">
                CONCEPTO *
              </label>
              <select
                id="pago-concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value as ConceptoPago)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
              >
                <option value="ADELANTO">Adelanto (Reserva)</option>
                <option value="SALDO">Saldo Restante</option>
                <option value="PAGO_TOTAL">Pago Total</option>
                <option value="PENALIDAD">Penalidad / Extra</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            <div>
              <label htmlFor="pago-metodo" className="block text-xs font-semibold text-stone-700 mb-1">
                MEDIO DE PAGO *
              </label>
              <select
                id="pago-metodo"
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
              >
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="TARJETA">Tarjeta de Débito / Crédito</option>
                <option value="BILLETERA_DIGITAL">Billetera Digital (Yape/Plin)</option>
                <option value="DEPOSITO">Depósito en Ventanilla</option>
                <option value="EFECTIVO">Efectivo en Recepción</option>
                <option value="OTRO">Otro Medio</option>
              </select>
            </div>
          </div>

          {/* Referencia y Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pago-referencia" className="block text-xs font-semibold text-stone-700 mb-1">
                REFERENCIA / VOUCHER *
              </label>
              <input
                id="pago-referencia"
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Ej. BCP-998822"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
              />
              {errors.referencia && <p className="mt-1 text-[11px] text-rose-600">{errors.referencia}</p>}
            </div>

            <div>
              <label htmlFor="pago-fecha" className="block text-xs font-semibold text-stone-700 mb-1">
                FECHA DEL ABONO *
              </label>
              <input
                id="pago-fecha"
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
              />
              {errors.fechaPago && <p className="mt-1 text-[11px] text-rose-600">{errors.fechaPago}</p>}
            </div>
          </div>

          {/* Clave de idempotencia (avanzada) */}
          <div>
            <label htmlFor="pago-idempotency" className="block text-[11px] font-semibold text-stone-500 mb-1">
              CLAVE DE IDEMPOTENCIA (MOCK TRACER)
            </label>
            <input
              id="pago-idempotency"
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-100 px-3 py-1.5 text-[11px] font-mono text-stone-600"
            />
          </div>

          {/* Notas */}
          <div>
            <label htmlFor="pago-notas" className="block text-xs font-semibold text-stone-700 mb-1">
              NOTAS O OBSERVACIONES
            </label>
            <textarea
              id="pago-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalles adicionales sobre la verificación o constancia..."
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden resize-none"
            />
          </div>

          {/* Botones de acción */}
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
              {loading ? 'Registrando...' : 'Registrar Abono'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
