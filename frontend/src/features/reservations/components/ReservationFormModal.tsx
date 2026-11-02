import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { CreateReservationDto, OrigenReserva } from '../types';
import type { Property } from '../../properties/types';
import type { Guest } from '../../guests/types';
import { calculateNights, validateReservationPayload } from '../services/reservationService';

interface ReservationFormModalProps {
  isOpen: boolean;
  properties: Property[];
  guests: Guest[];
  onClose: () => void;
  onSubmit: (dto: CreateReservationDto) => Promise<void>;
}

export const ReservationFormModal: React.FC<ReservationFormModalProps> = ({
  isOpen,
  properties,
  guests,
  onClose,
  onSubmit,
}) => {
  const [propiedadId, setPropiedadId] = useState('');
  const [huespedId, setHuespedId] = useState('');
  const [ingreso, setIngreso] = useState('');
  const [salida, setSalida] = useState('');
  const [cantidadHuespedes, setCantidadHuespedes] = useState<number>(2);
  const [horaCheckIn, setHoraCheckIn] = useState('15:00');
  const [horaCheckOut, setHoraCheckOut] = useState('11:00');
  const [montoAcordado, setMontoAcordado] = useState<number>(0);
  const [isManualPrice, setIsManualPrice] = useState(false);
  const [moneda, setMoneda] = useState('PEN');
  const [origen, setOrigen] = useState<OrigenReserva>('WEB');
  const [referenciaCanal, setReferenciaCanal] = useState('');
  const [notas, setNotas] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter properties to highlight valid operational ones
  const activeProperties = properties.filter(
    (p) => p.activa && p.estadoOperativo === 'OPERATIVA'
  );

  useEffect(() => {
    if (isOpen) {
      setPropiedadId(activeProperties.length > 0 ? activeProperties[0].id : '');
      setHuespedId(guests.length > 0 ? guests[0].id : '');
      setIngreso('');
      setSalida('');
      setCantidadHuespedes(2);
      setHoraCheckIn('15:00');
      setHoraCheckOut('11:00');
      setMontoAcordado(0);
      setIsManualPrice(false);
      setMoneda('PEN');
      setOrigen('WEB');
      setReferenciaCanal('');
      setNotas('');
      setErrors({});
      setGeneralError(null);
    }
  }, [isOpen]);

  const selectedProp = properties.find((p) => p.id === propiedadId);
  const nights = calculateNights(ingreso, salida);
  const tarifaNoches = (selectedProp?.precioBaseNoche || 0) * (nights > 0 ? nights : 0);
  const tarifaLimpieza = selectedProp?.precioLimpieza || 0;
  const calculatedTotal = nights > 0 ? tarifaNoches + tarifaLimpieza : 0;

  // Recalcular cotización automática cuando cambian fechas o propiedad, a menos que se haya fijado precio manual
  useEffect(() => {
    if (selectedProp) {
      setMoneda(selectedProp.moneda || 'PEN');
      if (!isManualPrice && nights > 0) {
        setMontoAcordado(calculatedTotal);
      }
    }
  }, [propiedadId, ingreso, salida, selectedProp, isManualPrice, calculatedTotal, nights]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (selectedProp && selectedProp.capacidadHuespedes && cantidadHuespedes > selectedProp.capacidadHuespedes) {
      setErrors({
        cantidadHuespedes: `La cantidad de huéspedes (${cantidadHuespedes}) excede la capacidad máxima de la propiedad (${selectedProp.capacidadHuespedes}).`,
      });
      return;
    }

    const dto: CreateReservationDto = {
      propiedadId,
      huespedId,
      ingreso,
      salida,
      cantidadHuespedes: Number(cantidadHuespedes),
      horaCheckIn: horaCheckIn || undefined,
      horaCheckOut: horaCheckOut || undefined,
      montoAcordado: Number(montoAcordado),
      moneda,
      origen,
      referenciaCanal: referenciaCanal.trim() || undefined,
      notas: notas.trim() || undefined,
    };

    const validation = validateReservationPayload(dto);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(dto);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Ocurrió un error inesperado al procesar la reserva.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl sm:p-8 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="new-reservation-title"
      >
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-6">
          <div>
            <h2 id="new-reservation-title" className="text-xl font-bold tracking-tight text-stone-900">
              Registrar Solicitud de Reserva
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Inicia en estado preliminar SOLICITADA. Comprueba disponibilidad e intervalos [ingreso, salida).
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

        {generalError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900 leading-relaxed flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Propiedad */}
          <div>
            <label htmlFor="res-propiedad" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Propiedad <span className="text-red-500">*</span>
            </label>
            <select
              id="res-propiedad"
              value={propiedadId}
              onChange={(e) => {
                setPropiedadId(e.target.value);
                if (errors.propiedadId) setErrors({ ...errors, propiedadId: '' });
              }}
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
            >
              <option value="">-- Seleccione una propiedad --</option>
              {properties.map((p) => {
                const isUnavailable = !p.activa || p.estadoOperativo !== 'OPERATIVA';
                return (
                  <option key={p.id} value={p.id} disabled={isUnavailable}>
                    {p.nombre} {isUnavailable ? `(${p.estadoOperativo})` : `(${p.moneda} S/ ${p.precioBaseNoche}/noche)`}
                  </option>
                );
              })}
            </select>
            {errors.propiedadId && (
              <p className="mt-1 text-xs text-red-600 font-medium">{errors.propiedadId}</p>
            )}
          </div>

          {/* Huésped */}
          <div>
            <label htmlFor="res-huesped" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Huésped Principal <span className="text-red-500">*</span>
            </label>
            <select
              id="res-huesped"
              value={huespedId}
              onChange={(e) => {
                setHuespedId(e.target.value);
                if (errors.huespedId) setErrors({ ...errors, huespedId: '' });
              }}
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
            >
              <option value="">-- Seleccione un huésped --</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombreCompleto} ({g.telefono || g.email || 'Sin contacto'})
                </option>
              ))}
            </select>
            {errors.huespedId && (
              <p className="mt-1 text-xs text-red-600 font-medium">{errors.huespedId}</p>
            )}
          </div>

          {/* Fechas de Estancia */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="res-ingreso" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Fecha de Ingreso (Check-in) <span className="text-red-500">*</span>
              </label>
              <input
                id="res-ingreso"
                type="date"
                value={ingreso}
                onChange={(e) => {
                  setIngreso(e.target.value);
                  if (errors.fechas || errors.ingreso) {
                    setErrors({ ...errors, fechas: '', ingreso: '' });
                  }
                }}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
              {errors.ingreso && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.ingreso}</p>
              )}
            </div>

            <div>
              <label htmlFor="res-salida" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Fecha de Salida (Check-out) <span className="text-red-500">*</span>
              </label>
              <input
                id="res-salida"
                type="date"
                value={salida}
                onChange={(e) => {
                  setSalida(e.target.value);
                  if (errors.fechas || errors.salida) {
                    setErrors({ ...errors, fechas: '', salida: '' });
                  }
                }}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
              {errors.salida && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.salida}</p>
              )}
            </div>
          </div>

          {errors.fechas && (
            <p className="text-xs text-red-600 font-medium -mt-2 flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0 text-red-600" aria-hidden="true" />
              <span>{errors.fechas}</span>
            </p>
          )}

          {nights > 0 && (
            <div className="rounded-xl bg-stone-100 p-2.5 text-xs text-stone-700 flex items-center justify-between">
              <span>Intervalo semiabierto [ingreso, salida):</span>
              <span className="font-bold text-[#183b32]">{nights} noche{nights > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Cantidad de Huéspedes */}
          <div>
            <label htmlFor="res-huespedes" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Cantidad de Huéspedes <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                id="res-huespedes"
                type="number"
                min="1"
                max={selectedProp?.capacidadHuespedes || 100}
                value={cantidadHuespedes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 1;
                  setCantidadHuespedes(val);
                  if (errors.cantidadHuespedes) setErrors({ ...errors, cantidadHuespedes: '' });
                }}
                className="w-32 rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
              <span className="text-xs text-stone-500">
                Capacidad máxima de la propiedad:{' '}
                <strong className="text-stone-800">{selectedProp?.capacidadHuespedes || 2} personas</strong>
              </span>
            </div>
            {errors.cantidadHuespedes && (
              <p className="mt-1 text-xs text-red-600 font-medium">{errors.cantidadHuespedes}</p>
            )}
          </div>

          {/* Horarios Operativos de Check-in y Check-out */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="res-hora-checkin" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Hora Estimada de Check-in
              </label>
              <input
                id="res-hora-checkin"
                type="time"
                value={horaCheckIn}
                onChange={(e) => setHoraCheckIn(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="res-hora-checkout" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Hora Estimada de Check-out
              </label>
              <input
                id="res-hora-checkout"
                type="time"
                value={horaCheckOut}
                onChange={(e) => setHoraCheckOut(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Desglose de Cotización Automática */}
          {nights > 0 && selectedProp && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs space-y-2">
              <p className="font-semibold text-stone-700 uppercase tracking-wider text-[11px]">
                Desglose de Cotización Sugerida
              </p>
              <div className="flex justify-between text-stone-600">
                <span>{nights} noche{nights > 1 ? 's' : ''} × {moneda} {selectedProp.precioBaseNoche || 0}:</span>
                <span className="font-mono font-medium">{moneda} {tarifaNoches.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Tarifa de Limpieza:</span>
                <span className="font-mono font-medium">{moneda} {tarifaLimpieza.toFixed(2)}</span>
              </div>
              <div className="border-t border-stone-200 pt-1.5 flex justify-between font-bold text-stone-900 text-sm">
                <span>Total Cotizado:</span>
                <span className="font-mono text-[#183b32]">{moneda} {calculatedTotal.toFixed(2)}</span>
              </div>

              {isManualPrice && montoAcordado !== calculatedTotal && (
                <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between text-amber-900 bg-amber-50 rounded-lg p-2.5">
                  <span className="text-[11px]">
                    Precio manual: <strong>{moneda} {montoAcordado.toFixed(2)}</strong> (sugerido: {moneda} {calculatedTotal.toFixed(2)}).
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMontoAcordado(calculatedTotal);
                      setIsManualPrice(false);
                    }}
                    className="text-[11px] font-semibold text-[#183b32] underline hover:text-[#0f2721] cursor-pointer shrink-0 ml-2"
                  >
                    Usar precio calculado
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Precio Acordado y Moneda */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="res-monto" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Precio Acordado Total <span className="text-red-500">*</span>
              </label>
              <input
                id="res-monto"
                type="number"
                step="0.01"
                min="1"
                value={montoAcordado || ''}
                onChange={(e) => {
                  setMontoAcordado(parseFloat(e.target.value) || 0);
                  setIsManualPrice(true);
                  if (errors.montoAcordado) setErrors({ ...errors, montoAcordado: '' });
                }}
                placeholder="0.00"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
              {errors.montoAcordado && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.montoAcordado}</p>
              )}
            </div>

            <div>
              <label htmlFor="res-moneda" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Moneda
              </label>
              <select
                id="res-moneda"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              >
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {/* Origen y Referencia */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="res-origen" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Canal de Origen
              </label>
              <select
                id="res-origen"
                value={origen}
                onChange={(e) => setOrigen(e.target.value as OrigenReserva)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              >
                <option value="WEB">Web Directa</option>
                <option value="DIRECTO">Gestión Directa / Telefónica</option>
                <option value="AIRBNB">Airbnb (Registro Manual)</option>
              </select>
            </div>

            <div>
              <label htmlFor="res-referencia" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Referencia de Canal (Opcional)
              </label>
              <input
                id="res-referencia"
                type="text"
                value={referenciaCanal}
                onChange={(e) => setReferenciaCanal(e.target.value)}
                placeholder="Ej. HM-AB123 o Cód. Externo"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label htmlFor="res-notas" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Notas u Observaciones
            </label>
            <textarea
              id="res-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Requerimientos de huésped, horas de check-in..."
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
            />
          </div>

          {/* Acciones */}
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
              {isSubmitting ? 'Validando...' : 'Crear Solicitud de Reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
