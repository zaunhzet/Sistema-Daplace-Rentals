import React from 'react';
import { X, ShieldCheck, ShieldAlert, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { Guarantee } from '../types';
import { formatMoney, toCents } from '../../../shared/money';

interface GuaranteeDetailModalProps {
  guarantee: Guarantee | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenMovement?: (guarantee: Guarantee, type: 'RETENCION' | 'DEVOLUCION_TOTAL' | 'DEVOLUCION_PARCIAL') => void;
}

export const GuaranteeDetailModal: React.FC<GuaranteeDetailModalProps> = ({
  guarantee,
  isOpen,
  onClose,
  onOpenMovement,
}) => {
  if (!isOpen || !guarantee) return null;

  const hasAvailableBalance = toCents(guarantee.saldoDisponible) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5E6C5B]">
              LIBRO DE MOVIMIENTOS DE GARANTÍA
            </span>
            <span className="font-mono text-xs text-stone-400">• {guarantee.id}</span>
          </div>

          <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-xs text-stone-500">Saldo Disponible en Custodia:</span>
              <div className="text-2xl font-bold font-mono text-[#183b32]">
                {formatMoney(guarantee.saldoDisponible, guarantee.moneda)}
              </div>
            </div>

            {/* Badges de Estado */}
            <div>
              {guarantee.estado === 'EN_CUSTODIA' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <ShieldCheck size={14} />
                  En Custodia Total
                </span>
              )}
              {guarantee.estado === 'PARCIALMENTE_RETENIDA' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  <ShieldAlert size={14} />
                  Parcialmente Retenida
                </span>
              )}
              {guarantee.estado === 'DEVUELTA_TOTAL' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                  Devuelta Total
                </span>
              )}
              {guarantee.estado === 'RETENIDA_TOTAL' && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                  Retenida Total
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Resumen de Valores */}
        <div className="grid grid-cols-3 gap-3 mb-6 text-center">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <span className="text-[11px] text-stone-500 uppercase font-semibold block">Recibido</span>
            <span className="font-mono font-bold text-stone-900 text-sm mt-0.5 block">
              {formatMoney(guarantee.importeRecibido, guarantee.moneda)}
            </span>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <span className="text-[11px] text-stone-500 uppercase font-semibold block">Retenido</span>
            <span className="font-mono font-bold text-rose-800 text-sm mt-0.5 block">
              {formatMoney(guarantee.totalRetenido, guarantee.moneda)}
            </span>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <span className="text-[11px] text-stone-500 uppercase font-semibold block">Devuelto</span>
            <span className="font-mono font-bold text-stone-700 text-sm mt-0.5 block">
              {formatMoney(guarantee.totalDevuelto, guarantee.moneda)}
            </span>
          </div>
        </div>

        {/* Datos Operativos */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5 mb-6 text-xs text-stone-700 space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-stone-500">Inmueble:</span>{' '}
              <strong className="text-stone-900">{guarantee.propiedadNombre}</strong>
            </div>
            <div>
              <span className="text-stone-500">Huésped:</span>{' '}
              <strong className="text-stone-900">{guarantee.huespedNombre}</strong>
            </div>
            <div>
              <span className="text-stone-500">Reserva vinculada:</span>{' '}
              <span className="font-mono font-semibold text-stone-800">{guarantee.reservaId}</span>
            </div>
            <div>
              <span className="text-stone-500">Fecha registro:</span>{' '}
              <span className="font-mono text-stone-700">{guarantee.creadaEn.substring(0, 10)}</span>
            </div>
          </div>
        </div>

        {/* Historial Inmutable de Movimientos */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider">
              HISTORIAL INMUTABLE DE MOVIMIENTOS ({guarantee.movimientos.length})
            </h4>
            {hasAvailableBalance && onOpenMovement && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMovement(guarantee, 'RETENCION');
                  }}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  + Retener
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMovement(guarantee, 'DEVOLUCION_TOTAL');
                  }}
                  className="rounded-lg bg-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-900 transition-colors cursor-pointer"
                >
                  Devolver Total
                </button>
              </div>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {guarantee.movimientos.map((mov) => (
              <div
                key={mov.id}
                className="rounded-2xl border border-stone-200 bg-white p-3 text-xs flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 rounded-full p-1 bg-stone-100 text-stone-600">
                    {mov.tipo === 'RECEPCION' && <ArrowDownLeft size={14} className="text-emerald-700" />}
                    {mov.tipo === 'RETENCION' && <ShieldAlert size={14} className="text-amber-700" />}
                    {(mov.tipo === 'DEVOLUCION_PARCIAL' || mov.tipo === 'DEVOLUCION_TOTAL') && (
                      <ArrowUpRight size={14} className="text-stone-700" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900 text-xs">{mov.tipo}</span>
                      <span className="text-[10px] font-mono text-stone-400">
                        {mov.registradoEn.substring(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                    <p className="text-stone-600 mt-0.5 text-xs">{mov.motivo}</p>
                    {mov.documentoSoporte && (
                      <span className="inline-block mt-1 font-mono text-[10px] rounded-md bg-stone-100 px-1.5 py-0.5 text-stone-600">
                        Soporte: {mov.documentoSoporte}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right font-mono font-bold shrink-0">
                  <span
                    className={
                      mov.tipo === 'RECEPCION'
                        ? 'text-emerald-700'
                        : mov.tipo === 'RETENCION'
                        ? 'text-amber-700'
                        : 'text-stone-700'
                    }
                  >
                    {mov.tipo === 'RECEPCION' ? '+' : '-'} {formatMoney(mov.importe, guarantee.moneda)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end pt-3 border-t border-stone-200">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
