import React from 'react';
import { ShieldCheck, ShieldAlert, Eye, PlusCircle, RotateCcw } from 'lucide-react';
import type { Guarantee } from '../types';
import { formatMoney, toCents } from '../../../shared/money';

interface GuaranteeListProps {
  guarantees: Guarantee[];
  onSelectGuarantee: (guarantee: Guarantee) => void;
  onOpenMovement: (guarantee: Guarantee, type: 'RETENCION' | 'DEVOLUCION_TOTAL' | 'DEVOLUCION_PARCIAL') => void;
}

export const GuaranteeList: React.FC<GuaranteeListProps> = ({
  guarantees,
  onSelectGuarantee,
  onOpenMovement,
}) => {
  if (guarantees.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-2xs">
        <p className="text-sm font-semibold text-stone-700">No se encontraron garantías registradas con los filtros actuales.</p>
        <p className="text-xs text-stone-500 mt-1">
          Haga clic en "+ Recibir Garantía" para registrar un depósito en custodia asociado a una reserva.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xs">
      <div className="overflow-x-auto min-w-0">
        <table className="w-full text-left border-collapse text-xs min-w-[800px] lg:min-w-0">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/80 text-[11px] font-bold text-stone-600 uppercase tracking-wider">
              <th className="py-2.5 px-3">CÓDIGO / FECHA</th>
              <th className="py-2.5 px-3">RESERVA / INMUEBLE</th>
              <th className="py-2.5 px-3">HUÉSPED</th>
              <th className="py-2.5 px-3 text-right">RECIBIDO</th>
              <th className="py-2.5 px-3 text-right">RETENIDO</th>
              <th className="py-2.5 px-3 text-right">DEVUELTO</th>
              <th className="py-2.5 px-3 text-right">SALDO DISPONIBLE</th>
              <th className="py-2.5 px-3 text-center">ESTADO</th>
              <th className="py-2.5 px-3 text-center">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {guarantees.map((g) => {
              const hasBalance = toCents(g.saldoDisponible) > 0;

              return (
                <tr key={g.id} className="hover:bg-stone-50/60 transition-colors">
                  {/* Código y Fecha */}
                  <td className="py-2.5 px-3">
                    <div className="font-mono font-bold text-stone-800">{g.id}</div>
                    <div className="text-[11px] text-stone-500">{g.creadaEn.substring(0, 10)}</div>
                  </td>

                  {/* Reserva y Propiedad */}
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-stone-900 truncate max-w-[140px]">{g.propiedadNombre}</div>
                    <div className="font-mono text-[11px] text-stone-500">Reserva: {g.reservaId}</div>
                  </td>

                  {/* Huésped */}
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-stone-800 truncate max-w-[130px]">{g.huespedNombre}</div>
                  </td>

                  {/* Recibido */}
                  <td className="py-2.5 px-3 text-right font-mono font-medium text-stone-800 whitespace-nowrap">
                    {formatMoney(g.importeRecibido, g.moneda)}
                  </td>

                  {/* Retenido */}
                  <td className="py-2.5 px-3 text-right font-mono font-medium text-amber-800 whitespace-nowrap">
                    {formatMoney(g.totalRetenido, g.moneda)}
                  </td>

                  {/* Devuelto */}
                  <td className="py-2.5 px-3 text-right font-mono font-medium text-stone-600 whitespace-nowrap">
                    {formatMoney(g.totalDevuelto, g.moneda)}
                  </td>

                  {/* Saldo Disponible */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#183b32] whitespace-nowrap">
                    {formatMoney(g.saldoDisponible, g.moneda)}
                  </td>

                  {/* Estado */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    {g.estado === 'EN_CUSTODIA' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                        <ShieldCheck size={13} className="text-emerald-600" />
                        En Custodia
                      </span>
                    )}
                    {g.estado === 'PARCIALMENTE_RETENIDA' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                        <ShieldAlert size={13} className="text-amber-600" />
                        Parcial
                      </span>
                    )}
                    {g.estado === 'DEVUELTA_TOTAL' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600">
                        Devuelta Total
                      </span>
                    )}
                    {g.estado === 'RETENIDA_TOTAL' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800">
                        Retenida Total
                      </span>
                    )}
                    {g.estado === 'LIQUIDADA_MIXTA' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800">
                        Liquidada Mixta
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="py-2.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectGuarantee(g)}
                        className="rounded-lg border border-stone-200 bg-white p-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
                        title="Ver detalle y movimientos"
                        aria-label="Ver detalle"
                      >
                        <Eye size={14} />
                      </button>

                      {hasBalance && (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenMovement(g, 'DEVOLUCION_TOTAL')}
                            className="flex items-center gap-1 rounded-lg bg-[#183b32] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#122e27] transition-colors cursor-pointer"
                            title="Devolver saldo disponible al huésped"
                          >
                            <RotateCcw size={12} />
                            Devolver
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenMovement(g, 'RETENCION')}
                            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                            title="Retener por daños documentados"
                          >
                            <PlusCircle size={12} />
                            Retener
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
