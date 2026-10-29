import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { CreateGuestDto, Guest, TipoDocumento } from '../types';
import { validateGuest } from '../services/guestService';

interface GuestFormModalProps {
  isOpen: boolean;
  guestToEdit?: Guest | null;
  onClose: () => void;
  onSubmit: (dto: CreateGuestDto, guestId?: string) => Promise<void>;
}

export const GuestFormModal: React.FC<GuestFormModalProps> = ({
  isOpen,
  guestToEdit,
  onClose,
  onSubmit,
}) => {
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | undefined>('DNI');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [nacionalidad, setNacionalidad] = useState('');
  const [notas, setNotas] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const isEditing = !!guestToEdit;

  useEffect(() => {
    if (guestToEdit) {
      setNombreCompleto(guestToEdit.nombreCompleto);
      setTelefono(guestToEdit.telefono || '');
      setEmail(guestToEdit.email || '');
      setTipoDocumento(guestToEdit.tipoDocumento || 'DNI');
      setNumeroDocumento(guestToEdit.numeroDocumento || '');
      setNacionalidad(guestToEdit.nacionalidad || '');
      setNotas(guestToEdit.notas || '');
    } else {
      setNombreCompleto('');
      setTelefono('');
      setEmail('');
      setTipoDocumento('DNI');
      setNumeroDocumento('');
      setNacionalidad('');
      setNotas('');
    }
    setErrors({});
    setGeneralError(null);
  }, [guestToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const dto: CreateGuestDto = {
      nombreCompleto,
      telefono: telefono.trim(),
      email: email.trim(),
      tipoDocumento,
      numeroDocumento: numeroDocumento.trim(),
      nacionalidad: nacionalidad.trim(),
      notas: notas.trim(),
    };

    const validation = validateGuest(dto);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(dto, guestToEdit?.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Ocurrió un error inesperado al guardar el huésped.');
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
        aria-labelledby="guest-modal-title"
      >
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-6">
          <div>
            <h2 id="guest-modal-title" className="text-xl font-bold tracking-tight text-stone-900">
              {isEditing ? 'Editar Datos del Huésped' : 'Registrar Nuevo Huésped'}
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              {isEditing
                ? `Actualizando ficha para código: ${guestToEdit.id}`
                : 'Módulo RF04 / HU-04: Nombre y al menos un medio de contacto obligatorio.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {generalError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
            <span>{generalError}</span>
          </div>
        )}

        {errors.contacto && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-amber-700" aria-hidden="true" />
            <span>{errors.contacto}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre Completo */}
          <div>
            <label htmlFor="guest-nombre" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              id="guest-nombre"
              type="text"
              value={nombreCompleto}
              onChange={(e) => {
                setNombreCompleto(e.target.value);
                if (errors.nombreCompleto) setErrors({ ...errors, nombreCompleto: '' });
              }}
              placeholder="Ej. Juan Carlos Quispe Morales"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden ${
                errors.nombreCompleto ? 'border-red-500 bg-red-50/30' : 'border-stone-300 focus:border-[#183b32]'
              }`}
            />
            {errors.nombreCompleto && (
              <p className="mt-1 text-xs text-red-600 font-medium">{errors.nombreCompleto}</p>
            )}
          </div>

          {/* Medios de Contacto */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="guest-telefono" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Teléfono
              </label>
              <input
                id="guest-telefono"
                type="tel"
                value={telefono}
                onChange={(e) => {
                  setTelefono(e.target.value);
                  if (errors.telefono || errors.contacto) {
                    setErrors({ ...errors, telefono: '', contacto: '' });
                  }
                }}
                placeholder="Ej. +51 987 654 321"
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden ${
                  errors.telefono ? 'border-red-500 bg-red-50/30' : 'border-stone-300 focus:border-[#183b32]'
                }`}
              />
              {errors.telefono && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.telefono}</p>
              )}
            </div>

            <div>
              <label htmlFor="guest-email" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Correo Electrónico
              </label>
              <input
                id="guest-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email || errors.contacto) {
                    setErrors({ ...errors, email: '', contacto: '' });
                  }
                }}
                placeholder="Ej. cliente@example.invalid"
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden ${
                  errors.email ? 'border-red-500 bg-red-50/30' : 'border-stone-300 focus:border-[#183b32]'
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600 font-medium">{errors.email}</p>
              )}
            </div>
          </div>
          <p className="text-[11px] text-stone-400 -mt-2">
            * Se requiere obligatoriamente al menos uno: teléfono o correo electrónico.
          </p>

          {/* Documento Opcional */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="guest-tipo-doc" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Tipo de Documento (Opcional)
              </label>
              <select
                id="guest-tipo-doc"
                value={tipoDocumento || ''}
                onChange={(e) =>
                  setTipoDocumento(
                    e.target.value ? (e.target.value as TipoDocumento) : undefined
                  )
                }
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden"
              >
                <option value="">-- Sin especificar --</option>
                <option value="DNI">DNI (Nacional)</option>
                <option value="PASAPORTE">Pasaporte</option>
                <option value="CARNET_EXTRANJERIA">Carnet de Extranjería</option>
                <option value="OTRO">Otro documento</option>
              </select>
            </div>

            <div>
              <label htmlFor="guest-num-doc" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                Número de Documento (Opcional)
              </label>
              <input
                id="guest-num-doc"
                type="text"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                placeholder="Ej. 44556677 / AB123456"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Nacionalidad */}
          <div>
            <label htmlFor="guest-nacionalidad" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Nacionalidad (Opcional)
            </label>
            <input
              id="guest-nacionalidad"
              type="text"
              value={nacionalidad}
              onChange={(e) => setNacionalidad(e.target.value)}
              placeholder="Ej. Peruana, Francesa, Chilena..."
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
            />
          </div>

          {/* Notas */}
          <div>
            <label htmlFor="guest-notas" className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
              Notas u Observaciones Operativas
            </label>
            <textarea
              id="guest-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Preferencias de estancia, requerimientos especiales o referencias..."
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
            />
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
              {isSubmitting ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Huésped'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
