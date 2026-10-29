import React from 'react';

export const CalendarLegend: React.FC = () => {
  return (
    <div className="rounded-xl border border-stone-200/90 bg-white p-3 text-xs text-stone-600 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <span className="font-bold text-stone-700 uppercase tracking-wider text-[10px] shrink-0">
          Leyenda de Disponibilidad:
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500 border border-emerald-600" />
            <span>Disponible</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-600 border border-blue-700" />
            <span>Confirmada</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500 border border-amber-600" />
            <span>Solicitud preliminar</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-purple-600 border border-purple-700" />
            <span>Transición (Check-out/in)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-orange-400 border border-orange-500" />
            <span>Mantenimiento</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-stone-300 border border-stone-400" />
            <span>Inactiva</span>
          </div>
        </div>
      </div>
    </div>
  );
};
