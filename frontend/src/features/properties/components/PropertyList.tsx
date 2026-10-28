import React from 'react';
import type { Property } from '../types';

interface PropertyListProps {
  properties: Property[];
  onViewDetail: (property: Property) => void;
  onEdit: (property: Property) => void;
  onToggleActive: (id: string, newActive: boolean) => Promise<void>;
  onCreateNew: () => void;
}

export const PropertyList: React.FC<PropertyListProps> = ({
  properties,
  onViewDetail,
  onEdit,
  onToggleActive,
  onCreateNew,
}) => {
  if (properties.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-12 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 mb-4 text-xl">
          🏢
        </div>
        <h3 className="text-base font-semibold text-stone-900">No se encontraron propiedades</h3>
        <p className="mt-1 text-sm text-stone-500 max-w-md mx-auto">
          No hay propiedades registradas con los filtros seleccionados o la búsqueda actual.
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={onCreateNew}
            className="rounded-xl bg-[#183b32] px-4 py-2 text-sm font-semibold text-white hover:bg-[#122e27] cursor-pointer"
          >
            + Registrar Primera Propiedad
          </button>
        </div>
      </div>
    );
  }

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'OPERATIVA':
        return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Operativa</span>;
      case 'EN_MANTENIMIENTO':
        return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">En Mantenimiento</span>;
      case 'INACTIVA':
        return <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700">Inactiva</span>;
      default:
        return <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{estado}</span>;
    }
  };

  const getPubBadge = (estado: string) => {
    switch (estado) {
      case 'PUBLICADA':
        return <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">Publicada</span>;
      case 'BORRADOR':
        return <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">Borrador</span>;
      case 'PAUSADA':
        return <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">Pausada</span>;
      default:
        return <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{estado}</span>;
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-stone-600">
          <thead className="border-b border-stone-200 bg-stone-50/75 text-xs font-semibold uppercase tracking-wider text-stone-500">
            <tr>
              <th scope="col" className="px-6 py-3.5">Propiedad</th>
              <th scope="col" className="px-6 py-3.5">Propietario</th>
              <th scope="col" className="px-6 py-3.5">Estado Operativo</th>
              <th scope="col" className="px-6 py-3.5">Publicación</th>
              <th scope="col" className="px-6 py-3.5">Condición</th>
              <th scope="col" className="px-6 py-3.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {properties.map((property) => (
              <tr key={property.id} className="hover:bg-stone-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-semibold text-stone-900">{property.nombre}</div>
                  <div className="text-xs text-stone-500 mt-0.5 truncate max-w-xs">{property.direccion}</div>
                  <div className="mt-1 font-mono text-[11px] text-stone-400">{property.id}</div>
                </td>
                <td className="px-6 py-4 font-medium text-stone-800">
                  {property.propietarioNombre}
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(property.estadoOperativo)}
                </td>
                <td className="px-6 py-4">
                  {getPubBadge(property.estadoPublicacion)}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${property.activa ? 'text-emerald-700' : 'text-stone-400'}`}>
                    <span className={`size-2 rounded-full ${property.activa ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                    {property.activa ? 'Activa' : 'Desactivada'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onViewDetail(property)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                    >
                      Ver Detalle
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(property)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleActive(property.id, !property.activa)}
                      title={property.activa ? 'Desactivar lógicamente (no borra registro)' : 'Reactivar'}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                        property.activa
                          ? 'text-stone-500 hover:text-amber-800 hover:bg-amber-50'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {property.activa ? 'Desactivar' : 'Reactivar'}
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
