import React from 'react';
import { NavLink } from 'react-router';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

interface ForbiddenPageProps {
  onBackPath?: string;
  message?: string;
}

export const ForbiddenPage: React.FC<ForbiddenPageProps> = ({
  onBackPath = '/propiedades',
  message = 'No dispone de los permisos necesarios para acceder a este módulo operativo.',
}) => {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 text-stone-900">
      <div className="w-full max-w-md rounded-3xl border border-stone-200/90 bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-700 border border-amber-200">
          <ShieldAlert size={24} aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-stone-900">
          403 — Acceso Denegado
        </h1>

        <p className="mt-2 text-xs leading-relaxed text-stone-500">
          {message}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <NavLink
            to={onBackPath}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#183b32] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#122e27] cursor-pointer"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Volver al módulo permitido</span>
          </NavLink>
        </div>
      </div>
    </div>
  );
};
