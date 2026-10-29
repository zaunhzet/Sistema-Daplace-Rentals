import React from 'react';
import type { GuestFilterParams } from '../types';

interface GuestFiltersProps {
  filters: GuestFilterParams;
  onFilterChange: (newFilters: GuestFilterParams) => void;
  onReset: () => void;
}

export const GuestFilters: React.FC<GuestFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
}) => {
  return (
    <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <label htmlFor="guest-search" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Buscar huésped
          </label>
          <input
            id="guest-search"
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            placeholder="Buscar por nombre, correo, teléfono, documento o ID..."
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          />
        </div>

        {filters.search && (
          <div className="sm:self-end">
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer"
            >
              Limpiar búsqueda
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
