import React from 'react';
import { CalendarCheck, Plus } from 'lucide-react';
import type { Reservation } from '../types';

interface ReservationListProps {
  reservations: Reservation[];
  onViewDetail: (reservation: Reservation) => void;
  onOpenEditDates: (reservation: Reservation) => void;
  onConfirm: (id: string) => Promise<void>;
  onCreateNew: () => void;
}

export const ReservationList: React.FC<ReservationListProps> = ({
  reservations,
  onViewDetail,
  onOpenEditDates,
  onConfirm,
  onCreateNew,
}) => {
  if (reservations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center shadow-2xs">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-stone-100 text-stone-500 mb-3">
          <CalendarCheck size={20} aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-stone-900">No se encontraron reservas</h3>
        <p className="mt-1 text-xs text-stone-500 max-w-md mx-auto">
          No hay reservas registradas que coincidan con los filtros o parámetros de búsqueda actuales.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#183b32] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#122e27] cursor-pointer"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Registrar Nueva Solicitud</span>
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'CONFIRMADA':
        return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Confirmada</span>;
      case 'SOLICITADA':
        return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Solicitada</span>;
      case 'COMPLETADA':
        return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Completada</span>;
      case 'CANCELADA':
        return <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-700">Cancelada</span>;
      default:
        return <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">{estado}</span>;
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm text-stone-600">
          <thead className="border-b border-stone-200 bg-stone-50/75 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            <tr>
              <th scope="col" className="px-4 py-2.5">Código / Origen</th>
              <th scope="col" className="px-4 py-2.5">Propiedad</th>
              <th scope="col" className="px-4 py-2.5">Huésped</th>
              <th scope="col" className="px-4 py-2.5">Estancia [ingreso, salida)</th>
              <th scope="col" className="px-4 py-2.5">Estado</th>
              <th scope="col" className="px-4 py-2.5 text-right">Monto</th>
              <th scope="col" className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {reservations.map((r) => (
              <tr key={r.id} className="hover:bg-stone-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono font-bold text-stone-900">{r.id}</div>
                  <div className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">
                    {r.origen} {r.referenciaCanal ? `(${r.referenciaCanal})` : ''}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-stone-800">
                  {r.propiedadNombre}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-stone-900">{r.huespedNombre}</div>
                  {r.huespedContacto && (
                    <div className="text-xs text-stone-400 truncate max-w-[180px]">{r.huespedContacto}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs font-medium text-stone-800">
                    {r.ingreso} <span className="text-stone-400">→</span> {r.salida}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    {r.noches} noche{r.noches > 1 ? 's' : ''}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(r.estado)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-stone-900">
                  {r.moneda === 'USD' ? '$' : 'S/'} {r.montoAcordado.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewDetail(r)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                    >
                      Detalle
                    </button>
                    {r.estado === 'SOLICITADA' && (
                      <button
                        type="button"
                        onClick={() => onConfirm(r.id)}
                        className="rounded-lg bg-[#183b32] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#122e27] cursor-pointer"
                      >
                        Confirmar
                      </button>
                    )}
                    {r.estado !== 'CANCELADA' && (
                      <button
                        type="button"
                        onClick={() => onOpenEditDates(r)}
                        className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer"
                      >
                        Fechas
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
