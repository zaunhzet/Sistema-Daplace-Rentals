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
  const [montoAcordado, setMontoAcordado] = useState<number>(0);
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
      setMontoAcordado(0);
      setMoneda('PEN');
      setOrigen('WEB');
      setReferenciaCanal('');
      setNotas('');
      setErrors({});
      setGeneralError(null);
    }
  }, [isOpen]);

  // Recalculate estimated price when dates or property change
  useEffect(() => {
    const selectedProp = properties.find((p) => p.id === propiedadId);
    if (selectedProp) {
      setMoneda(selectedProp.moneda || 'PEN');
      const nights = calculateNights(ingreso, salida);
      if (nights > 0 && selectedProp.precioBaseNoche) {
        setMontoAcordado(nights * selectedProp.precioBaseNoche);
      }
    }
  }, [propiedadId, ingreso, salida, properties]);

  if (!isOpen) return null;

  const nights = calculateNights(ingreso, salida);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const dto: CreateReservationDto = {
      propiedadId,
      huespedId,
      ingreso,
      salida,
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
              HU-02 / RF02: Inicia en estado SOLICITADA. Comprueba disponibilidad e intervalos [ingreso, salida).
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
