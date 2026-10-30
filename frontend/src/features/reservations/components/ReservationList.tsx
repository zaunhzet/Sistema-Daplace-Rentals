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
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-600 shrink-0" aria-hidden="true" />
            Confirmada
          </span>
        );
      case 'SOLICITADA':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <span className="size-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
            Solicitada
          </span>
        );
      case 'COMPLETADA':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-800">
            <span className="size-1.5 rounded-full bg-sky-500 shrink-0" aria-hidden="true" />
            Completada
          </span>
        );
      case 'CANCELADA':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <span className="size-1.5 rounded-full bg-stone-400 shrink-0" aria-hidden="true" />
            Cancelada
          </span>
        );
      case 'EXPIRADA':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md">
            <span className="size-1.5 rounded-full bg-rose-600 shrink-0" aria-hidden="true" />
            Expirada
          </span>
        );
      default:
        return <span className="text-xs text-stone-600">{estado}</span>;
    }
  };

  const isOverduePending = (r: Reservation) => {
    if (r.estado !== 'SOLICITADA' || !r.venceEn) return false;
    return new Date(r.venceEn).getTime() <= Date.now();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-2xs">
      <div className="overflow-x-auto min-w-0">
        <table className="w-full text-left text-xs text-stone-600 min-w-[700px] lg:min-w-0">
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
                  <div className="flex flex-col gap-0.5">
                    <div>{getStatusBadge(r.estado)}</div>
                    {isOverduePending(r) && (
                      <span className="text-[10px] text-amber-700 font-medium">
                        Actualización pendiente
                      </span>
                    )}
                  </div>
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
                    {r.estado !== 'CANCELADA' && r.estado !== 'EXPIRADA' && (
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
