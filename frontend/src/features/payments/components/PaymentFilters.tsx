import React, { useEffect, useRef, useState } from 'react';
import type { EstadoPago, PaymentFilterParams } from '../types';
import type { Property } from '../../properties';
import type { Reservation } from '../../reservations';
import { reservationService } from '../../reservations/services/reservationService';

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
      ? `${resolvedExtraReservation.codigo || resolvedExtraReservation.id} — ${resolvedExtraReservation.huespedNombre} (${resolvedExtraReservation.ingreso} al ${resolvedExtraReservation.salida})`
      : `Reserva filtrada (${activeReservaId})`;
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
            {activeReservaId && !isActiveInList && (
              <option value={activeReservaId}>{extraOptionLabel}</option>
            )}
            {reservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.codigo || r.id} — {r.huespedNombre} ({r.ingreso} al {r.salida})
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
