import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Home,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import type { CalendarDay } from '../types';
import type { Property } from '../../properties/types';
import type { Reservation } from '../../reservations/types';
import { TechnicalIdBadge } from '../../../shared/components/TechnicalIdBadge';
import {
  formatDisplayDate,
  formatTimeHHmm,
  formatNights,
  formatChannelLabel,
} from '../../../shared/utils/stayFormatters';

interface CalendarDayViewProps {
  currentDateStr?: string; // YYYY-MM-DD
  selectedDate?: string;   // alias
  day?: CalendarDay;
  days?: CalendarDay[];
  property?: Property;
  onSelectReservation: (reservation: Reservation) => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  onToday?: () => void;
}

export const CalendarDayView: React.FC<CalendarDayViewProps> = ({
  currentDateStr,
  selectedDate,
  day: directDay,
  days,
  property,
  onSelectReservation,
  onPrevDay,
  onNextDay,
  onToday,
}) => {
  const effectiveDateStr = currentDateStr || selectedDate || new Date().toISOString().slice(0, 10);
  const day = directDay || days?.find((d) => d.date === effectiveDateStr);
  const isToday = day?.isToday || effectiveDateStr === new Date().toISOString().slice(0, 10);
  const status = day?.status || 'DISPONIBLE';

  const reservationsList: { type: 'OCUPANTE' | 'CHECKIN' | 'CHECKOUT'; res: Reservation }[] = [];
  if (day?.reservation) {
    reservationsList.push({ type: 'OCUPANTE', res: day.reservation });
  }
  if (day?.checkinReservation && day.checkinReservation.id !== day.reservation?.id) {
    reservationsList.push({ type: 'CHECKIN', res: day.checkinReservation });
  }
  if (day?.checkoutReservation && day.checkoutReservation.id !== day.reservation?.id) {
    reservationsList.push({ type: 'CHECKOUT', res: day.checkoutReservation });
  }

  return (
    <div className="space-y-4">
      {/* Barra de navegación de fecha por día */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevDay}
            className="rounded-xl border border-stone-200 p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            aria-label="Día anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center sm:text-left px-2">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-stone-900">
                {formatDisplayDate(currentDateStr)}
              </h3>
              {isToday && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Hoy
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-stone-500">{currentDateStr}</p>
          </div>
          <button
            type="button"
            onClick={onNextDay}
            className="rounded-xl border border-stone-200 p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
            aria-label="Día siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToday}
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            Ir a Hoy
          </button>
          <div className="text-xs text-stone-600">
            Inmueble: <strong className="text-stone-900">{property?.nombre || 'Seleccione propiedad'}</strong>
          </div>
        </div>
      </div>

      {/* Tarjeta de estado del día */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Condición Operativa del Inmueble
            </span>
            <h4 className="text-lg font-bold text-stone-900 mt-0.5">
              {status === 'DISPONIBLE' && 'Inmueble Disponible'}
              {status === 'CONFIRMADA' && 'Ocupado con Reserva Confirmada'}
              {status === 'SOLICITADA' && 'Bloqueado con Reserva Solicitada'}
              {status === 'TRANSICION' && 'Día de Transición (Check-in / Check-out)'}
              {status === 'MANTENIMIENTO' && 'Propiedad en Mantenimiento'}
              {status === 'INACTIVA' && 'Propiedad Inactiva'}
            </h4>
          </div>

          <div>
            {status === 'DISPONIBLE' && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Disponible
              </span>
            )}
            {status === 'CONFIRMADA' && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                Confirmada
              </span>
            )}
            {status === 'SOLICITADA' && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                Solicitada
              </span>
            )}
            {status === 'TRANSICION' && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-900">
                Transición
              </span>
            )}
            {status === 'MANTENIMIENTO' && (
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">
                Mantenimiento
              </span>
            )}
            {status === 'INACTIVA' && (
              <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-bold text-stone-700">
                Inactiva
              </span>
            )}
          </div>
        </div>

        {/* Si no hay reservas para este día */}
        {reservationsList.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-[#183b32] mb-3">
              <Home size={22} />
            </div>
            <p className="text-sm font-semibold text-stone-800">
              No hay reservas programadas para este día
            </p>
            <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
              La noche del {formatDisplayDate(currentDateStr)} se encuentra liberada en el álgebra de intervalos semiabiertos [ingreso, salida) para registrar una nueva reserva.
            </p>
          </div>
        )}

        {/* Fichas de reservas asociadas al día */}
        {reservationsList.length > 0 && (
          <div className="space-y-4">
            {reservationsList.map(({ type, res }) => (
              <div
                key={`${type}-${res.id}`}
                className="rounded-2xl border border-stone-200 bg-stone-50/50 p-5 hover:border-stone-300 transition-all shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <TechnicalIdBadge id={res.id} code={res.codigo} />
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-mono text-stone-600">
                      Canal: {formatChannelLabel(res.origen)}
                    </span>
                    {type === 'CHECKIN' && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Entrada Hoy
                      </span>
                    )}
                    {type === 'CHECKOUT' && (
                      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                        Salida Hoy
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectReservation(res)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#183b32] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#132f28] transition-colors cursor-pointer self-start sm:self-auto"
                  >
                    <span>Ver detalle completo</span>
                    <ExternalLink size={12} />
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 mt-4 text-xs">
                  <div>
                    <span className="text-stone-400 font-semibold uppercase text-[10px]">Huésped Titular</span>
                    <p className="text-sm font-bold text-stone-900 mt-0.5">{res.huespedNombre}</p>
                    {res.huespedContacto && (
                      <p className="text-stone-500 font-mono text-[11px] mt-0.5">{res.huespedContacto}</p>
                    )}
                  </div>

                  <div>
                    <span className="text-stone-400 font-semibold uppercase text-[10px]">Horarios Operativos</span>
                    <div className="space-y-1 mt-0.5 font-mono text-stone-800">
                      <p className="flex items-center gap-1.5">
                        <span className="text-stone-400">Check-in:</span>
                        <strong>{formatTimeHHmm(res.horaCheckIn, '15:00')}</strong>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <span className="text-stone-400">Check-out:</span>
                        <strong>{formatTimeHHmm(res.horaCheckOut, '11:00')}</strong>
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="text-stone-400 font-semibold uppercase text-[10px]">Estancia y Capacidad</span>
                    <p className="mt-0.5 text-stone-800 font-mono">
                      {formatDisplayDate(res.ingreso)} al {formatDisplayDate(res.salida)}
                    </p>
                    <p className="text-stone-600 mt-1 flex items-center gap-1">
                      <Users size={12} className="text-stone-400" />
                      <span>{res.cantidadHuespedes ? `${res.cantidadHuespedes} personas` : 'No especificado'}</span>
                      <span className="text-stone-400">•</span>
                      <span>{formatNights(res.noches, res.ingreso, res.salida)}</span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
