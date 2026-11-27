import React, { useEffect, useRef, useState } from 'react';
import type { EstadoGarantia, GuaranteeFilterParams } from '../types';
import type { Property } from '../../properties';
import type { Reservation } from '../../reservations';
import { reservationService } from '../../reservations/services/reservationService';

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
  const activeReservaId =
    filters.reservaId && filters.reservaId !== 'TODAS' ? filters.reservaId : null;
  const isActiveInList = activeReservaId
    ? reservations.some((r) => r.id === activeReservaId)
    : false;

  const [resolvedExtraReservation, setResolvedExtraReservation] = useState<Reservation | null>(null);
  const lookupSeqRef = useRef(0);

  useEffect(() => {
    if (!activeReservaId || isActiveInList) {
      lookupSeqRef.current += 1;
      setResolvedExtraReservation(null);
      return;
    }

    let active = true;
    const seq = ++lookupSeqRef.current;
    setResolvedExtraReservation((prev) => (prev?.id === activeReservaId ? prev : null));

    reservationService
      .getReservationById(activeReservaId)
      .then((res) => {
        if (!active || seq !== lookupSeqRef.current) return;
        setResolvedExtraReservation(res && res.id === activeReservaId ? res : null);
      })
      .catch(() => {
        if (!active || seq !== lookupSeqRef.current) return;
        setResolvedExtraReservation(null);
      });

    return () => {
      active = false;
    };
  }, [activeReservaId, isActiveInList]);

  const extraOptionLabel =
    resolvedExtraReservation && resolvedExtraReservation.id === activeReservaId
      ? `${resolvedExtraReservation.codigo || resolvedExtraReservation.id} — ${resolvedExtraReservation.huespedNombre}`
      : `Reserva filtrada (${activeReservaId})`;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4 shadow-2xs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Búsqueda */}
        <div>
          <label htmlFor="search-guarantee" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Búsqueda general
          </label>
          <input
            id="search-guarantee"
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            placeholder="Código, inmueble, huésped..."
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          />
        </div>

        {/* Propiedad */}
        <div>
          <label htmlFor="filter-propiedad-gar" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Propiedad
          </label>
          <select
            id="filter-propiedad-gar"
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

        {/* Reserva */}
        <div>
          <label htmlFor="filter-reserva-gar" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Reserva
          </label>
          <select
            id="filter-reserva-gar"
            value={filters.reservaId || 'TODAS'}
            onChange={(e) => onFilterChange({ reservaId: e.target.value })}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
          >
            <option value="TODAS">Todas las reservas</option>
            {activeReservaId && !isActiveInList && (
              <option value={activeReservaId}>{extraOptionLabel}</option>
            )}
            {reservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.codigo || r.id} — {r.huespedNombre}
              </option>
            ))}
          </select>
          {activeReservaId && !isActiveInList && (
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-stone-600">
              <span className="truncate">
                Filtro activo:{' '}
                <strong className="font-mono text-stone-800">
                  {resolvedExtraReservation?.id === activeReservaId
                    ? resolvedExtraReservation.codigo || resolvedExtraReservation.id
                    : activeReservaId}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => onFilterChange({ reservaId: 'TODAS' })}
                className="shrink-0 font-semibold text-[#183b32] underline cursor-pointer"
              >
                Quitar filtro
              </button>
            </div>
          )}
        </div>

        {/* Estado */}
        <div>
          <label htmlFor="filter-estado-gar" className="block text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Estado de custodia
          </label>
          <div className="flex gap-2">
            <select
              id="filter-estado-gar"
              value={filters.estado || 'TODOS'}
              onChange={(e) => onFilterChange({ estado: e.target.value as EstadoGarantia | 'TODOS' })}
              className="flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800 focus:border-[#183b32] focus:bg-white focus:outline-hidden"
            >
              <option value="TODOS">Todos los estados</option>
              <option value="EN_CUSTODIA">En Custodia Total</option>
              <option value="PARCIALMENTE_RETENIDA">Parcialmente Retenida</option>
              <option value="DEVUELTA_TOTAL">Devuelta Total</option>
              <option value="RETENIDA_TOTAL">Retenida Total</option>
              <option value="LIQUIDADA_MIXTA">Liquidada Mixta</option>
            </select>

            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
