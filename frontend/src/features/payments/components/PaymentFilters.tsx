import React from 'react';
import type { EstadoPago, PaymentFilterParams } from '../types';
import type { Property } from '../../properties';
import type { Reservation } from '../../reservations';

interface PaymentFiltersProps {
  filters: PaymentFilterParams;
  onFilterChange: (newFilters: Partial<PaymentFilterParams>) => void;
  properties: Property[];
  reservations: Reservation[];
  onReset: () => void;
}

export const PaymentFilters: React.FC<PaymentFiltersProps> = ({
  filters,
  onFilterChange,
  properties,
  reservations,
  onReset,
}) => {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4 shadow-2xs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Búsqueda general */}
        <div>
          <label htmlFor="search-payments" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Búsqueda general
          </label>
          <input
            id="search-payments"
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder="Código, ref, propiedad o huésped..."
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Filtrar por Propiedad */}
        <div>
          <label htmlFor="filter-propiedad" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Propiedad
          </label>
          <select
            id="filter-propiedad"
            value={filters.propiedadId || 'TODAS'}
            onChange={(e) => onFilterChange({ propiedadId: e.target.value })}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          >
            <option value="TODAS">Todas las propiedades</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Filtrar por Reserva */}
        <div>
          <label htmlFor="filter-reserva" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Reserva específica
          </label>
          <select
            id="filter-reserva"
            value={filters.reservaId || 'TODAS'}
            onChange={(e) => onFilterChange({ reservaId: e.target.value })}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          >
            <option value="TODAS">Todas las reservas</option>
            {reservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.huespedNombre} ({r.ingreso} al {r.salida})
              </option>
            ))}
          </select>
        </div>

        {/* Filtrar por Estado */}
        <div>
          <label htmlFor="filter-estado" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Estado conciliación
          </label>
          <div className="flex gap-2">
            <select
              id="filter-estado"
              value={filters.estado || 'TODOS'}
              onChange={(e) => onFilterChange({ estado: e.target.value as EstadoPago | 'TODOS' })}
              className="flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="TODOS">Todos los estados</option>
              <option value="PENDIENTE_CONCILIACION">Pendiente Conciliación</option>
              <option value="CONCILIADO">Conciliado</option>
              <option value="RECHAZADO">Rechazado</option>
            </select>

            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
              title="Limpiar filtros"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
