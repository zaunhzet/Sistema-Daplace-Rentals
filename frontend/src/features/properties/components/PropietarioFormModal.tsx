import React, { useState } from 'react';
import { UserPlus, AlertCircle } from 'lucide-react';
import type { CreatePropietarioDto, Propietario } from '../types';
import { propertyService } from '../services/propertyService';

interface PropietarioFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOwnerCreated: (propietario: Propietario) => void;
}

export const PropietarioFormModal: React.FC<PropietarioFormModalProps> = ({
  isOpen,
  onClose,
  onOwnerCreated,
}) => {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedNombre = nombre.trim();
    if (trimmedNombre.length < 3) {
      setError('El nombre del propietario es obligatorio (mínimo 3 caracteres).');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setError('Debe ingresar un correo electrónico válido para el propietario.');
      return;
    }

    const trimmedTel = telefono.trim() || undefined;
    if (trimmedTel && trimmedTel.length < 6) {
      setError('El teléfono debe tener al menos 6 caracteres.');
      return;
    }

    const dto: CreatePropietarioDto = {
      nombre: trimmedNombre,
      email: trimmedEmail,
      telefono: trimmedTel,
    };

    try {
      setIsSubmitting(true);
      const created = await propertyService.createPropietario(dto);
      onOwnerCreated(created);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocurrió un error al registrar el propietario.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-7"
        role="dialog"
        aria-labelledby="modal-owner-title"
      >
        <div className="flex items-center justify-between border-b border-stone-200 pb-3.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-[#183b32] border border-emerald-200">
              <UserPlus size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 id="modal-owner-title" className="text-base font-bold text-stone-900">
                Registrar Nuevo Propietario
              </h2>
              <p className="text-[11px] text-stone-500">
                Actor de dominio transaccional (rol PROPIETARIO)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="owner-nombre"
              className="block text-[11px] font-semibold uppercase tracking-wider text-stone-700 mb-1"
            >
              Nombre Completo / Razón Social <span className="text-red-500">*</span>
            </label>
            <input
              id="owner-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Inversiones San Isidro o Carlos Echevarría"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
              required
            />
          </div>

          <div>
            <label
              htmlFor="owner-email"
              className="block text-[11px] font-semibold uppercase tracking-wider text-stone-700 mb-1"
            >
              Correo Electrónico de Contacto <span className="text-red-500">*</span>
            </label>
            <input
              id="owner-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contacto@propietario.pe"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
              required
            />
          </div>

          <div>
            <label
              htmlFor="owner-telefono"
              className="block text-[11px] font-semibold uppercase tracking-wider text-stone-700 mb-1"
            >
              Teléfono (opcional)
            </label>
            <input
              id="owner-telefono"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+51 999 888 777"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
            />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900">
            <strong>Aviso de seguridad:</strong> El registro de un propietario de dominio no genera credenciales de acceso al sistema ni crea cuentas de autenticación.
          </div>

          <div className="mt-5 flex items-center justify-end gap-2.5 pt-2 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[#183b32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#122e27] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Guardando...' : 'Crear Propietario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
