import React from 'react';
import { Home, Plus } from 'lucide-react';
import type { Property } from '../types';

interface PropertyListProps {
  properties: Property[];
  onViewDetail: (property: Property) => void;
  onEdit: (property: Property) => void;
  onToggleActive: (id: string, newActive: boolean) => Promise<void>;
  onCreateNew: () => void;
  canManage?: boolean;
}

export const PropertyList: React.FC<PropertyListProps> = ({
  properties,
  onViewDetail,
  onEdit,
  onToggleActive,
  onCreateNew,
  canManage = true,
}) => {
  if (properties.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center shadow-2xs">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-stone-100 text-stone-500 mb-3">
          <Home size={20} aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-stone-900">No se encontraron propiedades</h3>
        <p className="mt-1 text-xs text-stone-500 max-w-md mx-auto">
          No hay propiedades registradas con los filtros seleccionados o la búsqueda actual.
        </p>
        {canManage && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onCreateNew}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#183b32] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#122e27] cursor-pointer"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Registrar Primera Propiedad</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'OPERATIVA':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-600 shrink-0" aria-hidden="true" />
            Operativa
          </span>
        );
      case 'EN_MANTENIMIENTO':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
            En mantenimiento
          </span>
        );
      case 'INACTIVA':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <span className="size-1.5 rounded-full bg-stone-400 shrink-0" aria-hidden="true" />
            Inactiva
          </span>
        );
      default:
        return <span className="text-xs text-stone-600">{estado}</span>;
    }
  };

  const getPubBadge = (estado: string) => {
    switch (estado) {
      case 'PUBLICADA':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-50 text-sky-800 border border-sky-200">
            Publicada
          </span>
        );
      case 'BORRADOR':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
            Borrador
          </span>
        );
      case 'PAUSADA':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            Pausada
          </span>
        );
      default:
        return <span className="text-xs text-stone-600">{estado}</span>;
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-2xs">
      <div className="overflow-x-auto min-w-0">
        <table className="w-full text-left text-xs text-stone-600 min-w-[680px] lg:min-w-0">
          <thead className="border-b border-stone-200 bg-stone-50/75 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 w-[28%]">Propiedad</th>
              <th scope="col" className="px-4 py-2.5 w-[17%]">Propietario</th>
              <th scope="col" className="px-4 py-2.5 w-[16%]">Estado Operativo</th>
              <th scope="col" className="px-4 py-2.5 w-[13%]">Publicación</th>
              <th scope="col" className="px-4 py-2.5 w-[10%]">Condición</th>
              <th scope="col" className="px-4 py-2.5 w-[16%] text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {properties.map((property) => (
              <tr key={property.id} className="hover:bg-stone-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold text-stone-900 truncate">{property.nombre}</div>
                  <div className="text-xs text-stone-500 mt-0.5 truncate max-w-xs">{property.direccion}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-stone-400">{property.id}</div>
                </td>
                <td className="px-4 py-3 font-medium text-stone-800 truncate">
                  {property.propietarioNombre}
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(property.estadoOperativo)}
                </td>
                <td className="px-4 py-3">
                  {getPubBadge(property.estadoPublicacion)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${property.activa ? 'text-stone-700' : 'text-stone-400'}`}>
                    <span className={`size-1.5 rounded-full ${property.activa ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                    {property.activa ? 'Activa' : 'Desactivada'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onViewDetail(property)}
                      className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                    >
                      Detalle
                    </button>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(property)}
                          className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleActive(property.id, !property.activa)}
                          title={property.activa ? 'Desactivar lógicamente (no borra registro)' : 'Reactivar'}
                          className={`rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer ${
                            property.activa
                              ? 'text-stone-500 hover:text-amber-800 hover:bg-amber-50'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {property.activa ? 'Desactivar' : 'Reactivar'}
                        </button>
                      </>
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
