import React from 'react';
import type { CalendarDay } from '../types';
import type { Reservation } from '../../reservations/types';

interface CalendarGridProps {
  days: CalendarDay[];
  onSelectReservation: (reservation: Reservation) => void;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  days,
  onSelectReservation,
}) => {
  const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const getCellClasses = (day: CalendarDay) => {
    if (!day.isCurrentMonth) {
      return 'bg-stone-50/50 text-stone-300 border-stone-100';
    }

    switch (day.status) {
      case 'CONFIRMADA':
        return 'bg-blue-50/60 border-blue-200 text-blue-950';
      case 'SOLICITADA':
        return 'bg-amber-50/60 border-amber-200 text-amber-950';
      case 'TRANSICION':
        return 'bg-purple-50/70 border-purple-200 text-purple-950';
      case 'MANTENIMIENTO':
        return 'bg-orange-50/50 border-orange-200 text-orange-950';
      case 'INACTIVA':
        return 'bg-stone-100 border-stone-200 text-stone-500';
      case 'DISPONIBLE':
      default:
        return 'bg-white border-stone-200 text-stone-800 hover:border-emerald-300';
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50/80 text-center text-xs font-bold uppercase tracking-wider text-stone-600">
        {weekDays.map((wd) => (
          <div key={wd} className="py-3 border-r border-stone-200 last:border-r-0">
            {wd}
          </div>
        ))}
      </div>

      {/* Grid Cells */}
      <div className="grid grid-cols-7 divide-x divide-y divide-stone-200">
        {days.map((day, idx) => {
          const mainRes = day.reservation || day.checkinReservation || day.checkoutReservation;

          return (
            <div
              key={`${day.date}-${idx}`}
              className={`min-h-[105px] p-2 sm:p-2.5 transition-colors flex flex-col justify-between ${getCellClasses(
                day
              )}`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    day.isToday
                      ? 'grid size-6 place-items-center rounded-full bg-[#183b32] text-white shadow-xs'
                      : day.isCurrentMonth
                      ? 'text-stone-800'
                      : 'text-stone-400'
                  }`}
                >
                  {day.dayNumber}
                </span>

                {day.isCurrentMonth && day.status === 'DISPONIBLE' && (
                  <span className="size-1.5 rounded-full bg-emerald-500" title="Disponible" />
                )}
              </div>

              {/* Day Body Content */}
              <div className="mt-1 flex-1 flex flex-col justify-end">
                {day.status === 'MANTENIMIENTO' && day.isCurrentMonth && (
                  <div className="rounded-lg bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-800 uppercase tracking-tight text-center">
                    Mantenimiento
                  </div>
                )}

                {day.status === 'INACTIVA' && day.isCurrentMonth && (
                  <div className="rounded-lg bg-stone-200 px-2 py-1 text-[10px] font-bold text-stone-600 uppercase tracking-tight text-center">
                    Inactiva
                  </div>
                )}

                {day.status === 'TRANSICION' && day.isCurrentMonth && (
                  <div className="space-y-1">
                    {day.checkoutReservation && (
                      <button
                        type="button"
                        onClick={() => onSelectReservation(day.checkoutReservation!)}
                        className="w-full text-left rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-700 truncate hover:bg-stone-200 cursor-pointer"
                        title={`Check-out mañana: ${day.checkoutReservation.id} (${day.checkoutReservation.huespedNombre})`}
                      >
                        Salida: {day.checkoutReservation.id}
                      </button>
                    )}
                    {day.checkinReservation && (
                      <button
                        type="button"
                        onClick={() => onSelectReservation(day.checkinReservation!)}
                        className="w-full text-left rounded-md bg-purple-200 px-1.5 py-0.5 text-[10px] font-bold text-purple-900 truncate hover:bg-purple-300 cursor-pointer"
                        title={`Check-in tarde: ${day.checkinReservation.id} (${day.checkinReservation.huespedNombre})`}
                      >
                        Ingreso: {day.checkinReservation.huespedNombre}
                      </button>
                    )}
                  </div>
                )}

                {(day.status === 'CONFIRMADA' || day.status === 'SOLICITADA') &&
                  day.isCurrentMonth &&
                  mainRes && (
                    <button
                      type="button"
                      onClick={() => onSelectReservation(mainRes)}
                      title={`Reserva ${mainRes.id}: ${mainRes.huespedNombre} (${mainRes.estado}). Clic para ver detalle.`}
                      className={`w-full text-left rounded-lg p-1.5 text-xs font-semibold shadow-2xs transition-transform hover:scale-[1.02] cursor-pointer ${
                        day.status === 'CONFIRMADA'
                          ? 'bg-blue-600 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      <div className="truncate text-[11px] font-bold">{mainRes.huespedNombre}</div>
                      <div className="text-[9px] opacity-90 font-mono mt-0.5 flex items-center justify-between">
                        <span>{mainRes.id}</span>
                        <span>{day.status === 'CONFIRMADA' ? 'Conf.' : 'Sol.'}</span>
                      </div>
                    </button>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
