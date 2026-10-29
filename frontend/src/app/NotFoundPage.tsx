import React from 'react';
import { useNavigate, useLocation } from 'react-router';
import { AlertCircle, ArrowLeft, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="w-full max-w-xl mx-auto py-8 sm:py-12 text-center">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-10 shadow-2xs">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-stone-100 text-[#183b32] mb-4">
          <AlertCircle size={24} strokeWidth={1.8} aria-hidden="true" />
        </div>

        <span className="rounded-full bg-stone-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-stone-600">
          Error 404
        </span>

        <h1 className="mt-3 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
          Página no encontrada
        </h1>

        <p className="mt-2 text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
          La ruta <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-stone-700">{location.pathname}</code> no coincide con ningún módulo operativo ni ruta registrada en el sistema.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer transition-colors"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Volver atrás</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/propiedades')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#162A2C] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#243f42] cursor-pointer transition-colors"
          >
            <Home size={16} aria-hidden="true" />
            <span>Ir a Propiedades</span>
          </button>
        </div>
      </div>
    </div>
  );
};
