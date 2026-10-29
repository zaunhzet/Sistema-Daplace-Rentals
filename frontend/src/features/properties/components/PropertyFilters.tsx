import React from 'react';
import type { EstadoOperativo, EstadoPublicacion, PropertyFilterParams } from '../types';

interface PropertyFiltersProps {
  filters: PropertyFilterParams;
  onFilterChange: (newFilters: PropertyFilterParams) => void;
  onReset: () => void;
}

export const PropertyFilters: React.FC<PropertyFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
}) => {
  return (
    <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-4 shadow-2xs">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Search */}
        <div>
          <label htmlFor="search-input" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Buscar por texto
          </label>
          <input
            id="search-input"
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            placeholder="Nombre, dirección, propietario..."
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Estado Operativo */}
        <div>
          <label htmlFor="estado-operativo-select" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Estado Operativo
          </label>
          <select
            id="estado-operativo-select"
            value={filters.estadoOperativo || 'TODOS'}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                estadoOperativo: e.target.value as EstadoOperativo | 'TODOS',
              })
            }
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden cursor-pointer"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="OPERATIVA">Operativa</option>
            <option value="EN_MANTENIMIENTO">En Mantenimiento</option>
            <option value="INACTIVA">Inactiva</option>
          </select>
        </div>

        {/* Estado Publicación */}
        <div>
          <label htmlFor="estado-publicacion-select" className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Publicación
          </label>
          <select
            id="estado-publicacion-select"
            value={filters.estadoPublicacion || 'TODOS'}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                estadoPublicacion: e.target.value as EstadoPublicacion | 'TODOS',
              })
            }
            className="w-full rounded-xl border border-stone-300 bg-stone-50/50 px-3 py-1.5 text-xs sm:text-sm text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden cursor-pointer"
          >
            <option value="TODOS">Todas las publicaciones</option>
            <option value="PUBLICADA">Publicada</option>
            <option value="BORRADOR">Borrador</option>
            <option value="PAUSADA">Pausada</option>
          </select>
        </div>

        {/* Checkbox & Reset */}
        <div className="flex flex-col justify-end gap-1.5 sm:col-span-2 lg:col-span-1">
          <label className="flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={!!filters.soloActivas}
              onChange={(e) =>
                onFilterChange({ ...filters, soloActivas: e.target.checked })
              }
              className="size-4 rounded border-stone-300 text-[#183b32] focus:ring-[#183b32] cursor-pointer"
            />
            <span>Solo propiedades activas</span>
          </label>

          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-semibold text-stone-500 hover:text-stone-800 underline text-left cursor-pointer"
          >
            Limpiar filtros
          </button>
        </div>
      </div>
    </div>
  );
};
