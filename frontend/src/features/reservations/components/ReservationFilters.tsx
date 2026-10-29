import React from 'react';
import type { EstadoReserva, ReservationFilterParams } from '../types';
import type { Property } from '../../properties/types';
import type { Guest } from '../../guests/types';

interface ReservationFiltersProps {
  filters: ReservationFilterParams;
  properties: Property[];
  guests: Guest[];
  onFilterChange: (newFilters: ReservationFilterParams) => void;
  onReset: () => void;
}

export const ReservationFilters: React.FC<ReservationFiltersProps> = ({
  filters,
  properties,
  guests,
  onFilterChange,
  onReset,
}) => {
  return (
    <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-4 shadow-2xs">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Búsqueda por texto */}
        <div>
          <label htmlFor="res-search" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Búsqueda general
          </label>
          <input
            id="res-search"
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            placeholder="Código, propiedad o huésped..."
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Filtro Propiedad */}
        <div>
          <label htmlFor="filter-propiedad" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Propiedad
          </label>
          <select
            id="filter-propiedad"
            value={filters.propiedadId || 'TODAS'}
            onChange={(e) => onFilterChange({ ...filters, propiedadId: e.target.value })}
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden cursor-pointer"
          >
            <option value="TODAS">Todas las propiedades</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro Huésped */}
        <div>
          <label htmlFor="filter-huesped" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Huésped
          </label>
          <select
            id="filter-huesped"
            value={filters.huespedId || 'TODOS'}
            onChange={(e) => onFilterChange({ ...filters, huespedId: e.target.value })}
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden cursor-pointer"
          >
            <option value="TODOS">Todos los huéspedes</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombreCompleto}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro Estado */}
        <div>
          <label htmlFor="filter-estado" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Estado de Reserva
          </label>
          <select
            id="filter-estado"
            value={filters.estado || 'TODOS'}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                estado: e.target.value as EstadoReserva | 'TODOS',
              })
            }
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden cursor-pointer"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="SOLICITADA">Solicitada</option>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="COMPLETADA">Completada</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>

        {/* Reset */}
        <div className="flex flex-col justify-end">
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            Limpiar Filtros
          </button>
        </div>
      </div>
    </div>
  );
};
