import React, { useState, useEffect } from 'react';
import { UserPlus } from 'lucide-react';
import type {
  CreatePropertyDto,
  EstadoOperativo,
  EstadoPublicacion,
  Property,
  Propietario,
} from '../types';
import { validateProperty } from '../services/propertyService';
import { PropietarioFormModal } from './PropietarioFormModal';

interface PropertyFormModalProps {
  isOpen: boolean;
  propertyToEdit?: Property | null;
  propietarios: Propietario[];
  onClose: () => void;
  onSubmit: (dto: CreatePropertyDto, propertyId?: string) => Promise<void>;
  onOwnerCreated?: (propietario: Propietario) => void;
}

export const PropertyFormModal: React.FC<PropertyFormModalProps> = ({
  isOpen,
  propertyToEdit,
  propietarios,
  onClose,
  onSubmit,
  onOwnerCreated,
}) => {
  const [nombre, setNombre] = useState('');
  const [propietarioId, setPropietarioId] = useState('');
  const [direccion, setDireccion] = useState('');
  const [estadoOperativo, setEstadoOperativo] = useState<EstadoOperativo>('OPERATIVA');
  const [estadoPublicacion, setEstadoPublicacion] = useState<EstadoPublicacion>('BORRADOR');
  const [capacidadHuespedes, setCapacidadHuespedes] = useState<number>(2);
  const [precioBaseNoche, setPrecioBaseNoche] = useState<number>(250);
  const [moneda, setMoneda] = useState('PEN');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);

  const isEditing = !!propertyToEdit;

  useEffect(() => {
    if (propertyToEdit) {
      setNombre(propertyToEdit.nombre);
      setPropietarioId(propertyToEdit.propietarioId);
      setDireccion(propertyToEdit.direccion);
      setEstadoOperativo(propertyToEdit.estadoOperativo);
      setEstadoPublicacion(propertyToEdit.estadoPublicacion);
      setCapacidadHuespedes(propertyToEdit.capacidadHuespedes ?? 2);
      setPrecioBaseNoche(propertyToEdit.precioBaseNoche ?? 250);
      setMoneda(propertyToEdit.moneda || 'PEN');
    } else {
      setNombre('');
      setPropietarioId(propietarios.length > 0 ? propietarios[0].id : '');
      setDireccion('');
      setEstadoOperativo('OPERATIVA');
      setEstadoPublicacion('BORRADOR');
      setCapacidadHuespedes(2);
      setPrecioBaseNoche(250);
      setMoneda('PEN');
    }
    setErrors({});
    setGeneralError(null);
  }, [propertyToEdit, propietarios, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const dto: CreatePropertyDto = {
      nombre,
      propietarioId,
      direccion,
      estadoOperativo,
      estadoPublicacion,
      capacidadHuespedes,
      precioBaseNoche,
      moneda,
    };

    const validation = validateProperty(dto);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(dto, propertyToEdit?.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Ocurrió un error inesperado al guardar la propiedad.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl sm:p-8 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-6">
          <div>
            <h2 id="modal-title" className="text-xl font-bold tracking-tight text-stone-900">
              {isEditing ? 'Editar Propiedad' : 'Registrar Nueva Propiedad'}
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              {isEditing
                ? `Actualizando datos para código: ${propertyToEdit.id}`
                : 'Complete los datos obligatorios para vincular la propiedad al sistema.'}
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

        {generalError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800">
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label htmlFor="prop-nombre" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Nombre de la Propiedad <span className="text-red-500">*</span>
            </label>
            <input
              id="prop-nombre"
              type="text"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (errors.nombre) setErrors({ ...errors, nombre: '' });
              }}
              placeholder="Ej. Departamento Miraflores Vista Mar"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden ${
                errors.nombre ? 'border-red-500 bg-red-50/30' : 'border-stone-300 focus:border-[#183b32]'
              }`}
            />
            {errors.nombre && <p className="mt-1 text-xs text-red-600 font-medium">{errors.nombre}</p>}
          </div>

          {/* Propietario */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="prop-propietario" className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
                Propietario Asociado <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsOwnerModalOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#183b32] hover:text-[#122e27] hover:underline cursor-pointer"
              >
                <UserPlus size={13} aria-hidden="true" />
                <span>+ Agregar Propietario</span>
              </button>
            </div>
            <select
              id="prop-propietario"
              value={propietarioId}
              onChange={(e) => {
                setPropietarioId(e.target.value);
                if (errors.propietarioId) setErrors({ ...errors, propietarioId: '' });
              }}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 focus:outline-hidden ${
                errors.propietarioId ? 'border-red-500 bg-red-50/30' : 'border-stone-300 focus:border-[#183b32]'
              }`}
            >
              <option value="">-- Seleccione un propietario --</option>
              {propietarios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.email})
                </option>
              ))}
            </select>
            {errors.propietarioId && (
              <p className="mt-1 text-xs text-red-600 font-medium">{errors.propietarioId}</p>
            )}
          </div>

          {/* Dirección */}
          <div>
            <label htmlFor="prop-direccion" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Dirección Operativa Mínima <span className="text-red-500">*</span>
            </label>
            <input
              id="prop-direccion"
              type="text"
              value={direccion}
              onChange={(e) => {
                setDireccion(e.target.value);
                if (errors.direccion) setErrors({ ...errors, direccion: '' });
              }}
              placeholder="Ej. Malecón Balta 740, Dpto 802, Miraflores, Lima"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden ${
                errors.direccion ? 'border-red-500 bg-red-50/30' : 'border-stone-300 focus:border-[#183b32]'
              }`}
            />
            {errors.direccion && (
              <p className="mt-1 text-xs text-red-600 font-medium">{errors.direccion}</p>
            )}
          </div>

          {/* Estado Operativo y Publicación */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="prop-estado-operativo" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Estado Operativo
              </label>
              <select
                id="prop-estado-operativo"
                value={estadoOperativo}
                onChange={(e) => setEstadoOperativo(e.target.value as EstadoOperativo)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              >
                <option value="OPERATIVA">Operativa</option>
                <option value="EN_MANTENIMIENTO">En Mantenimiento</option>
                <option value="INACTIVA">Inactiva</option>
              </select>
            </div>

            <div>
              <label htmlFor="prop-estado-pub" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Estado Publicación <span className="text-stone-400 text-[10px] lowercase font-normal">(propuesta técnica)</span>
              </label>
              <select
                id="prop-estado-pub"
                value={estadoPublicacion}
                onChange={(e) => setEstadoPublicacion(e.target.value as EstadoPublicacion)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              >
                <option value="PUBLICADA">Publicada</option>
                <option value="BORRADOR">Borrador</option>
                <option value="PAUSADA">Pausada</option>
              </select>
            </div>
          </div>

          {/* Capacidad y Precio Base */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="prop-capacidad" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Capacidad (Huéspedes)
              </label>
              <input
                id="prop-capacidad"
                type="number"
                min={1}
                value={capacidadHuespedes}
                onChange={(e) => setCapacidadHuespedes(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
              {errors.capacidadHuespedes && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.capacidadHuespedes}</p>
              )}
            </div>

            <div>
              <label htmlFor="prop-precio" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Precio Base / Noche
              </label>
              <input
                id="prop-precio"
                type="number"
                min={1}
                value={precioBaseNoche}
                onChange={(e) => setPrecioBaseNoche(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              />
              {errors.precioBaseNoche && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.precioBaseNoche}</p>
              )}
            </div>

            <div>
              <label htmlFor="prop-moneda" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Moneda
              </label>
              <select
                id="prop-moneda"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              >
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {/* Acciones */}
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-stone-200 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[#183b32] px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#122e27] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Propiedad'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal secundario para registro rápido de propietario */}
      <PropietarioFormModal
        isOpen={isOwnerModalOpen}
        onClose={() => setIsOwnerModalOpen(false)}
        onOwnerCreated={(newOwner) => {
          setPropietarioId(newOwner.id);
          if (errors.propietarioId) {
            setErrors({ ...errors, propietarioId: '' });
          }
          onOwnerCreated?.(newOwner);
        }}
      />
    </div>
  );
};
