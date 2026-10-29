import React from 'react';
import type { GuestWithReservations } from '../types';

interface GuestDetailModalProps {
  guest: GuestWithReservations | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (guest: GuestWithReservations) => void;
}

export const GuestDetailModal: React.FC<GuestDetailModalProps> = ({
  guest,
  isOpen,
  onClose,
  onEdit,
}) => {
  if (!isOpen || !guest) return null;

  const getReservationBadge = (estado: string) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-8 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="guest-detail-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs font-bold text-stone-700">
                {guest.id}
              </span>
              {guest.nacionalidad && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  {guest.nacionalidad}
                </span>
              )}
            </div>
            <h2 id="guest-detail-title" className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
              {guest.nombreCompleto}
            </h2>
            <p className="text-xs text-stone-500 font-mono mt-0.5">
              Registrado el: {new Date(guest.creadoEn).toLocaleDateString('es-PE')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-6 space-y-6">
          {/* Contact and Document Information */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Medios de Contacto</p>
              <div className="space-y-1.5 text-sm text-stone-800">
                <p className="flex items-center gap-2">
                  <span>📧</span>
                  {guest.email ? <span>{guest.email}</span> : <span className="text-stone-400 italic">No registrado</span>}
                </p>
                <p className="flex items-center gap-2">
                  <span>📞</span>
                  {guest.telefono ? <span>{guest.telefono}</span> : <span className="text-stone-400 italic">No registrado</span>}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Documento de Identidad</p>
              <div className="text-sm text-stone-800">
                {guest.tipoDocumento && guest.numeroDocumento ? (
                  <div>
                    <span className="font-semibold text-stone-900">{guest.tipoDocumento}: </span>
                    <span className="font-mono">{guest.numeroDocumento}</span>
                  </div>
                ) : (
                  <span className="text-stone-400 italic">Sin documento consignado</span>
                )}
                {guest.nacionalidad && (
                  <p className="mt-1 text-xs text-stone-600">Nacionalidad: {guest.nacionalidad}</p>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {guest.notas && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Notas u Observaciones</p>
              <p className="text-sm text-stone-700 leading-relaxed">{guest.notas}</p>
            </div>
          )}

          {/* Related Reservations Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">
                Historial de Reservas Relacionadas ({guest.reservasRelacionadas.length})
              </h3>
              <span className="text-xs text-stone-400 font-medium">Historial de estancias</span>
            </div>

            {guest.reservasRelacionadas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/50 p-6 text-center text-sm text-stone-500">
                Este huésped aún no cuenta con reservas registradas en el sistema.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs">
                <table className="w-full text-left text-sm text-stone-600">
                  <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-4 py-2.5">Código</th>
                      <th className="px-4 py-2.5">Propiedad</th>
                      <th className="px-4 py-2.5">Estancia</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-xs">
                    {guest.reservasRelacionadas.map((res) => (
                      <tr key={res.id} className="hover:bg-stone-50/50">
                        <td className="px-4 py-3 font-mono font-medium text-stone-900">{res.id}</td>
                        <td className="px-4 py-3 font-medium text-stone-800">{res.propiedadNombre}</td>
                        <td className="px-4 py-3 font-mono text-stone-600">
                          {res.ingreso} <span className="text-stone-400">→</span> {res.salida}
                        </td>
                        <td className="px-4 py-3">{getReservationBadge(res.estado)}</td>
                        <td className="px-4 py-3 text-right font-medium text-stone-900">
                          {res.moneda === 'USD' ? '$' : 'S/'} {res.montoTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex items-center justify-end gap-3 border-t border-stone-200 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(guest);
            }}
            className="rounded-xl bg-[#183b32] px-5 py-2 text-sm font-semibold text-white hover:bg-[#122e27] cursor-pointer"
          >
            Editar Ficha
          </button>
        </div>
      </div>
    </div>
  );
};
