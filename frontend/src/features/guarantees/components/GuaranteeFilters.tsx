import React from 'react';
import type { EstadoGarantia, GuaranteeFilterParams } from '../types';
import type { Property } from '../../properties';
import type { Reservation } from '../../reservations';

interface GuaranteeFiltersProps {
  filters: GuaranteeFilterParams;
  onFilterChange: (newFilters: Partial<GuaranteeFilterParams>) => void;
  properties: Property[];
  reservations: Reservation[];
  onReset: () => void;
}

export const GuaranteeFilters: React.FC<GuaranteeFiltersProps> = ({
  filters,
  onFilterChange,
  properties,
  reservations,
  onReset,
}) => {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Búsqueda */}
        <div>
          <label htmlFor="search-guarantee" className="block text-xs font-semibold text-stone-600 mb-1">
            BÚSQUEDA GENERAL
          </label>
          <input
            id="search-guarantee"
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder="Código, inmueble, huésped..."
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Propiedad */}
        <div>
          <label htmlFor="filter-propiedad-gar" className="block text-xs font-semibold text-stone-600 mb-1">
            PROPIEDAD
          </label>
          <select
            id="filter-propiedad-gar"
            value={filters.propiedadId || 'TODAS'}
            onChange={(e) => onFilterChange({ propiedadId: e.target.value })}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          >
            <option value="TODAS">Todas las propiedades</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Reserva */}
        <div>
          <label htmlFor="filter-reserva-gar" className="block text-xs font-semibold text-stone-600 mb-1">
            RESERVA
          </label>
          <select
            id="filter-reserva-gar"
            value={filters.reservaId || 'TODAS'}
            onChange={(e) => onFilterChange({ reservaId: e.target.value })}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          >
            <option value="TODAS">Todas las reservas</option>
            {reservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.huespedNombre}
              </option>
            ))}
          </select>
        </div>

        {/* Estado */}
        <div>
          <label htmlFor="filter-estado-gar" className="block text-xs font-semibold text-stone-600 mb-1">
            ESTADO DE CUSTODIA
          </label>
          <div className="flex gap-2">
            <select
              id="filter-estado-gar"
              value={filters.estado || 'TODOS'}
              onChange={(e) => onFilterChange({ estado: e.target.value as EstadoGarantia | 'TODOS' })}
              className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="TODOS">Todos los estados</option>
              <option value="EN_CUSTODIA">En Custodia Total</option>
              <option value="PARCIALMENTE_RETENIDA">Parcialmente Retenida</option>
              <option value="DEVUELTA_TOTAL">Devuelta Total</option>
              <option value="RETENIDA_TOTAL">Retenida Total</option>
            </select>

            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-stone-200 bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
