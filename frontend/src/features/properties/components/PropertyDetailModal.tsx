import React from 'react';
import type { Property, Propietario } from '../types';

interface PropertyDetailModalProps {
  property: Property | null;
  propietario?: Propietario | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (property: Property) => void;
  onToggleActive: (id: string, newActive: boolean) => Promise<void>;
}

export const PropertyDetailModal: React.FC<PropertyDetailModalProps> = ({
  property,
  propietario,
  isOpen,
  onClose,
  onEdit,
  onToggleActive,
}) => {
  if (!isOpen || !property) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-8 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="detail-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs font-bold text-stone-700">
                {property.id}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${property.activa ? 'text-emerald-700' : 'text-stone-400'}`}>
                <span className={`size-2 rounded-full ${property.activa ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                {property.activa ? 'Activa' : 'Desactivada'}
              </span>
            </div>
            <h2 id="detail-title" className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
              {property.nombre}
            </h2>
            <p className="text-sm text-stone-500 mt-0.5">{property.direccion}</p>
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
          {/* Status & publication summary */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Estado Operativo</p>
              <div>{getStatusBadge(property.estadoOperativo)}</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                Estado Publicación <span className="font-normal text-[10px] lowercase">(propuesta técnica)</span>
              </p>
              <div>{getPubBadge(property.estadoPublicacion)}</div>
            </div>
          </div>

          {/* Propietario Info */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Propietario Asociado (Vínculo RF01 / HU-18)
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-stone-900">{property.propietarioNombre}</p>
                <p className="text-xs text-stone-500 font-mono mt-0.5">ID: {property.propietarioId}</p>
              </div>
              {propietario && (
                <div className="text-xs text-stone-600 sm:text-right">
                  <p>📧 {propietario.email}</p>
                  {propietario.telefono && <p className="mt-0.5">📞 {propietario.telefono}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Commercial / Operating details */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Capacidad</p>
              <p className="mt-1 text-lg font-bold text-stone-800">
                {property.capacidadHuespedes ?? '—'} <span className="text-xs font-normal text-stone-500">huéspedes</span>
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Precio Base Noche</p>
              <p className="mt-1 text-lg font-bold text-stone-800">
                {property.moneda === 'USD' ? '$' : 'S/'} {property.precioBaseNoche ?? '—'}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Última Actualización</p>
              <p className="mt-1 text-xs text-stone-600 font-mono">
                {new Date(property.actualizadoEn).toLocaleDateString('es-PE', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Governance Invariant Note */}
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 text-xs text-emerald-950">
            <p className="font-semibold text-emerald-900 flex items-center gap-1.5 mb-1">
              <span>🛡️</span> Regla de Inmunidad y Trazabilidad (Gobernanza)
            </p>
            <p className="leading-5 text-emerald-900/90">
              Las propiedades no se eliminan físicamente para proteger el histórico transaccional de reservas, pagos y
              garantías asociadas. Si el inmueble deja de estar en operación comercial, utilice la desactivación lógica.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-200 pt-5">
          <button
            type="button"
            onClick={async () => {
              await onToggleActive(property.id, !property.activa);
            }}
            className={`w-full sm:w-auto rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
              property.activa
                ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                : 'border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
            }`}
          >
            {property.activa ? 'Desactivar Propiedad' : 'Reactivar Propiedad'}
          </button>

          <div className="flex w-full sm:w-auto items-center justify-end gap-3">
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
                onEdit(property);
              }}
              className="rounded-xl bg-[#183b32] px-5 py-2 text-sm font-semibold text-white hover:bg-[#122e27] cursor-pointer"
            >
              Editar Datos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
