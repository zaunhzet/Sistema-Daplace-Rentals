import React from 'react';

export const CalendarLegend: React.FC = () => {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-600 shadow-xs">
      <p className="font-semibold text-stone-700 uppercase tracking-wider text-[11px] mb-3">
        Leyenda de Disponibilidad
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-emerald-500 border border-emerald-600" />
          <span>Disponible para reserva</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-blue-600 border border-blue-700" />
          <span>Confirmada / Ocupada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-amber-500 border border-amber-600" />
          <span>Solicitud pendiente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-purple-600 border border-purple-700" />
          <span>Transición (Salida y Entrada consecutiva)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-orange-400 border border-orange-500" />
          <span>En Mantenimiento</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-stone-300 border border-stone-400" />
          <span>Inactiva</span>
        </div>
      </div>
    </div>
  );
};
