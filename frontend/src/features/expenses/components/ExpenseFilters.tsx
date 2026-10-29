import React from 'react';
import type { EstadoGasto, ExpenseFilterParams } from '../types';
import type { Property } from '../../properties';

interface ExpenseFiltersProps {
  filters: ExpenseFilterParams;
  onFilterChange: (newFilters: Partial<ExpenseFilterParams>) => void;
  properties: Property[];
  categories: string[];
  onReset: () => void;
}

const MESES = [
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const ANIOS = ['2025', '2026', '2027'];

export const ExpenseFilters: React.FC<ExpenseFiltersProps> = ({
  filters,
  onFilterChange,
  properties,
  categories,
  onReset,
}) => {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4 shadow-2xs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {/* Búsqueda general */}
        <div className="sm:col-span-2">
          <label htmlFor="search-expense" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Búsqueda
          </label>
          <input
            id="search-expense"
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder="Título, notas, pagador..."
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Propiedad */}
        <div>
          <label htmlFor="filter-propiedad-exp" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Propiedad
          </label>
          <select
            id="filter-propiedad-exp"
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

        {/* Categoría */}
        <div>
          <label htmlFor="filter-categoria-exp" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Categoría
          </label>
          <select
            id="filter-categoria-exp"
            value={filters.categoria || 'TODAS'}
            onChange={(e) => onFilterChange({ categoria: e.target.value })}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          >
            <option value="TODAS">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Periodo Mes / Año */}
        <div>
          <label htmlFor="filter-mes-exp" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Periodo (Mes / Año)
          </label>
          <div className="flex gap-1.5">
            <select
              id="filter-mes-exp"
              value={filters.mes ? String(filters.mes) : 'TODOS'}
              onChange={(e) => onFilterChange({ mes: e.target.value })}
              className="w-1/2 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="TODOS">Mes</option>
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              id="filter-anio-exp"
              value={filters.anio ? String(filters.anio) : 'TODOS'}
              onChange={(e) => onFilterChange({ anio: e.target.value })}
              className="w-1/2 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="TODOS">Año</option>
              {ANIOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Estado y Limpiar */}
        <div>
          <label htmlFor="filter-estado-exp" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Estado
          </label>
          <div className="flex gap-2">
            <select
              id="filter-estado-exp"
              value={filters.estado || 'TODOS'}
              onChange={(e) => onFilterChange({ estado: e.target.value as EstadoGasto | 'TODOS' })}
              className="flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="TODOS">Todos</option>
              <option value="REGISTRADO">Registrado</option>
              <option value="ANULADO">Anulado</option>
            </select>

            <button
              type="button"
              onClick={onReset}
              title="Restablecer filtros"
              className="rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition-colors cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
