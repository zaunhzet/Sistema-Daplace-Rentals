import React from 'react';
import { Users, Clock, ArrowRight, ArrowLeft } from 'lucide-react';
import type { CalendarDay } from '../types';
import type { Reservation } from '../../reservations/types';
import { formatDisplayDate, formatTimeHHmm } from '../../../shared/utils/stayFormatters';

interface CalendarWeekViewProps {
  days: CalendarDay[];
  currentDateStr?: string; // YYYY-MM-DD
  selectedDate?: string;   // alias
  onSelectReservation: (reservation: Reservation) => void;
  onSelectDate: (dateStr: string) => void;
}

export const CalendarWeekView: React.FC<CalendarWeekViewProps> = ({
  days,
  currentDateStr,
  selectedDate,
  onSelectReservation,
  onSelectDate,
}) => {
  const effectiveDateStr = currentDateStr || selectedDate || new Date().toISOString().slice(0, 10);
  // Encontrar el día de referencia en los días cargados o calcular la semana
  const dayIndex = days.findIndex((d) => d.date === effectiveDateStr);
  const targetDay = dayIndex >= 0 ? days[dayIndex] : days.find((d) => d.isCurrentMonth) || days[0];

  if (!targetDay) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-xs text-stone-500">
        No hay datos de calendario disponibles para la semana seleccionada.
      </div>
    );
  }

  // Hallar el lunes de la semana que contiene a targetDay
  const [year, month, day] = targetDay.date.split('-').map(Number);
  const targetDateObj = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = targetDateObj.getUTCDay(); // 0 es domingo, 1 es lunes...
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const mondayDate = new Date(targetDateObj);
  mondayDate.setUTCDate(targetDateObj.getUTCDate() + distanceToMonday);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setUTCDate(mondayDate.getUTCDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }

  const weekDaysLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
      <div className="overflow-x-auto w-full">
        <div className="min-w-[760px] grid grid-cols-7 divide-x divide-stone-200">
          {weekDates.map((dateStr, idx) => {
            const calDay = days.find((d) => d.date === dateStr);
            const isSelected = dateStr === currentDateStr;
            const isToday = calDay?.isToday || dateStr === new Date().toISOString().slice(0, 10);
            const mainRes = calDay?.reservation;
            const checkinRes = calDay?.checkinReservation;
            const checkoutRes = calDay?.checkoutReservation;

            return (
              <div
                key={dateStr}
                onClick={() => onSelectDate(dateStr)}
                className={`flex flex-col min-h-[320px] transition-colors cursor-pointer ${
                  isSelected ? 'bg-emerald-50/30' : 'bg-white hover:bg-stone-50/60'
                }`}
              >
                {/* Cabecera del día */}
                <div
                  className={`border-b p-3 text-center transition-colors ${
                    isToday
                      ? 'bg-[#183b32] text-white'
                      : isSelected
                      ? 'bg-stone-100/90 text-stone-900 border-stone-200'
                      : 'bg-stone-50/70 text-stone-700 border-stone-200'
                  }`}
                >
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-emerald-100' : 'text-stone-500'}`}>
                    {weekDaysLabels[idx]}
                  </p>
                  <p className="text-base font-bold font-mono mt-0.5">
                    {dateStr.slice(8, 10)}
                  </p>
                  <p className={`text-[9px] ${isToday ? 'text-emerald-200' : 'text-stone-400'}`}>
                    {formatDisplayDate(dateStr)}
                  </p>
                </div>

                {/* Contenido del día */}
                <div className="flex-1 p-2 space-y-2 flex flex-col justify-start">
                  {/* Status badge */}
                  <div className="flex justify-center">
                    {calDay?.status === 'DISPONIBLE' && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                        Disponible
                      </span>
                    )}
                    {calDay?.status === 'TRANSICION' && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-bold text-purple-900">
                        Transición (Check-in/out)
                      </span>
                    )}
                    {calDay?.status === 'MANTENIMIENTO' && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-orange-800">
                        Mantenimiento
                      </span>
                    )}
                    {calDay?.status === 'INACTIVA' && (
                      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[9px] font-bold text-stone-600">
                        Inactiva
                      </span>
                    )}
                  </div>

                  {/* Transición: salida y entrada */}
                  {calDay?.status === 'TRANSICION' && (
                    <div className="space-y-2 mt-1">
                      {checkoutRes && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectReservation(checkoutRes);
                          }}
                          className="rounded-xl border border-stone-200 bg-stone-50 p-2 text-stone-800 shadow-2xs hover:border-stone-300 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[10px] font-bold text-stone-600">
                            <span className="flex items-center gap-1">
                              <ArrowRight size={10} className="text-rose-600" /> Salida
                            </span>
                            <span className="font-mono text-stone-500">{formatTimeHHmm(checkoutRes.horaCheckOut, '11:00')}</span>
                          </div>
                          <p className="mt-1 font-semibold truncate text-[11px] text-stone-900">
                            {checkoutRes.huespedNombre}
                          </p>
                          <div className="mt-0.5 flex items-center justify-between text-[9px] font-mono text-stone-500">
                            <span>{checkoutRes.codigo || 'RSV'}</span>
                            <span>{checkoutRes.estado === 'CONFIRMADA' ? 'Conf.' : 'Sol.'}</span>
                          </div>
                        </div>
                      )}

                      {checkinRes && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectReservation(checkinRes);
                          }}
                          className="rounded-xl border border-purple-200 bg-purple-50 p-2 text-purple-950 shadow-2xs hover:border-purple-300 transition-all cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[10px] font-bold text-purple-800">
                            <span className="flex items-center gap-1">
                              <ArrowLeft size={10} className="text-emerald-600" /> Ingreso
                            </span>
                            <span className="font-mono text-purple-700">{formatTimeHHmm(checkinRes.horaCheckIn, '15:00')}</span>
                          </div>
                          <p className="mt-1 font-semibold truncate text-[11px] text-purple-950">
                            {checkinRes.huespedNombre}
                          </p>
                          <div className="mt-0.5 flex items-center justify-between text-[9px] font-mono text-purple-700">
                            <span>{checkinRes.codigo || 'RSV'}</span>
                            <span>{checkinRes.cantidadHuespedes ? `${checkinRes.cantidadHuespedes}p` : ''}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reserva ocupante regular */}
                  {(calDay?.status === 'CONFIRMADA' || calDay?.status === 'SOLICITADA') && mainRes && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectReservation(mainRes);
                      }}
                      className={`rounded-xl border p-2.5 shadow-2xs transition-all hover:scale-[1.02] cursor-pointer ${
                        calDay.status === 'CONFIRMADA'
                          ? 'border-blue-200 bg-blue-50/90 text-blue-950'
                          : 'border-amber-200 bg-amber-50/90 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-[#183b32] px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow-2xs">
                          {mainRes.codigo || mainRes.id.slice(0, 8)}
                        </span>
                        <span className="text-[10px] font-semibold">
                          {mainRes.estado === 'CONFIRMADA' ? 'Confirmada' : 'Solicitada'}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs font-bold truncate text-stone-900">
                        {mainRes.huespedNombre}
                      </p>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-stone-600">
                        {mainRes.cantidadHuespedes ? (
                          <span className="flex items-center gap-1">
                            <Users size={11} className="text-stone-500" /> {mainRes.cantidadHuespedes} pers.
                          </span>
                        ) : (
                          <span className="text-stone-400">Estancia</span>
                        )}

                        {mainRes.ingreso === dateStr && (
                          <span className="flex items-center gap-0.5 font-mono text-emerald-700 font-semibold">
                            <Clock size={10} /> {formatTimeHHmm(mainRes.horaCheckIn, '15:00')}
                          </span>
                        )}
                        {mainRes.salida === dateStr && (
                          <span className="flex items-center gap-0.5 font-mono text-stone-600">
                            <Clock size={10} /> {formatTimeHHmm(mainRes.horaCheckOut, '11:00')}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
