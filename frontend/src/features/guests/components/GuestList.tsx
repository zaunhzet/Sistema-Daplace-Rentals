import React from 'react';
import { Users, Plus } from 'lucide-react';
import type { Guest } from '../types';

interface GuestListProps {
  guests: Guest[];
  onViewDetail: (guestId: string) => void;
  onEdit: (guest: Guest) => void;
  onCreateNew: () => void;
}

export const GuestList: React.FC<GuestListProps> = ({
  guests,
  onViewDetail,
  onEdit,
  onCreateNew,
}) => {
  if (guests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center shadow-2xs">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-stone-100 text-stone-500 mb-3">
          <Users size={20} aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-stone-900">No se encontraron huéspedes</h3>
        <p className="mt-1 text-xs text-stone-500 max-w-md mx-auto">
          No hay huéspedes registrados que coincidan con el término de búsqueda actual.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#183b32] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#122e27] cursor-pointer"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Registrar Primer Huésped</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm text-stone-600">
          <thead className="border-b border-stone-200 bg-stone-50/75 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            <tr>
              <th scope="col" className="px-4 py-2.5">Huésped</th>
              <th scope="col" className="px-4 py-2.5">Teléfono</th>
              <th scope="col" className="px-4 py-2.5">Correo Electrónico</th>
              <th scope="col" className="px-4 py-2.5">Documento</th>
              <th scope="col" className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {guests.map((guest) => (
              <tr key={guest.id} className="hover:bg-stone-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold text-stone-900">{guest.nombreCompleto}</div>
                  <div className="font-mono text-[10px] text-stone-400 mt-0.5">{guest.id}</div>
                </td>
                <td className="px-4 py-3">
                  {guest.telefono ? (
                    <span className="font-mono text-stone-700">{guest.telefono}</span>
                  ) : (
                    <span className="text-stone-400 italic text-xs">Sin teléfono</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {guest.email ? (
                    <span className="text-stone-700">{guest.email}</span>
                  ) : (
                    <span className="text-stone-400 italic text-xs">Sin email</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {guest.tipoDocumento && guest.numeroDocumento ? (
                    <div className="text-xs">
                      <span className="font-semibold text-stone-700">{guest.tipoDocumento}: </span>
                      <span className="font-mono text-stone-600">{guest.numeroDocumento}</span>
                    </div>
                  ) : (
                    <span className="text-stone-400 italic text-xs">No consignado</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewDetail(guest.id)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                    >
                      Detalle
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(guest)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                    >
                      Editar
                    </button>
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
