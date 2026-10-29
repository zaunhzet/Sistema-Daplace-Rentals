import React from 'react';
import { CheckCircle2, AlertCircle, Ban, Eye, Check } from 'lucide-react';
import type { Payment } from '../types';
import { formatMoney } from '../../../shared/money';

interface PaymentListProps {
  payments: Payment[];
  onSelectPayment: (payment: Payment) => void;
  onReconcilePayment: (payment: Payment) => void;
  onRejectPayment: (payment: Payment) => void;
}

export const PaymentList: React.FC<PaymentListProps> = ({
  payments,
  onSelectPayment,
  onReconcilePayment,
  onRejectPayment,
}) => {
  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-2xs">
        <p className="text-sm font-semibold text-stone-700">No se encontraron pagos con los filtros seleccionados.</p>
        <p className="text-xs text-stone-500 mt-1">
          Intente restablecer los filtros o registrar un nuevo abono para una reserva activa.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xs">
      <div className="overflow-x-auto min-w-0">
        <table className="w-full text-left border-collapse text-xs min-w-[760px] lg:min-w-0">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/80 text-[11px] font-bold text-stone-600 uppercase tracking-wider">
              <th className="py-2.5 px-3">CÓDIGO / FECHA</th>
              <th className="py-2.5 px-3">RESERVA / PROPIEDAD</th>
              <th className="py-2.5 px-3">HUÉSPED</th>
              <th className="py-2.5 px-3">CONCEPTO / MEDIO</th>
              <th className="py-2.5 px-3">REFERENCIA</th>
              <th className="py-2.5 px-3 text-right">IMPORTE</th>
              <th className="py-2.5 px-3 text-center">ESTADO</th>
              <th className="py-2.5 px-3 text-center">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                {/* Código y Fecha */}
                <td className="py-2.5 px-3">
                  <div className="font-mono font-bold text-stone-800">{p.id}</div>
                  <div className="text-[11px] text-stone-500">{p.fechaPago}</div>
                </td>

                {/* Reserva y Propiedad */}
                <td className="py-2.5 px-3">
                  <div className="font-semibold text-stone-900 truncate max-w-[140px]">{p.propiedadNombre}</div>
                  <div className="font-mono text-[11px] text-stone-500">Reserva: {p.reservaId}</div>
                </td>

                {/* Huésped */}
                <td className="py-2.5 px-3">
                  <div className="font-medium text-stone-800 truncate max-w-[130px]">{p.huespedNombre}</div>
                </td>

                {/* Concepto y Medio */}
                <td className="py-2.5 px-3">
                  <span className="inline-block rounded-md bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-700 text-[11px]">
                    {p.concepto}
                  </span>
                  <div className="text-[11px] text-stone-500 mt-0.5">{p.metodoPago}</div>
                </td>

                {/* Referencia */}
                <td className="py-2.5 px-3">
                  <div className="font-mono text-stone-700 truncate max-w-[100px]">{p.referencia}</div>
                </td>

                {/* Importe */}
                <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900 whitespace-nowrap">
                  {formatMoney(p.importe, p.moneda)}
                </td>

                {/* Estado */}
                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                  {p.estado === 'CONCILIADO' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      Conciliado
                    </span>
                  )}
                  {p.estado === 'PENDIENTE_CONCILIACION' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                      <AlertCircle size={13} className="text-amber-600" />
                      Pendiente
                    </span>
                  )}
                  {p.estado === 'RECHAZADO' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800">
                      <Ban size={13} className="text-rose-600" />
                      Rechazado
                    </span>
                  )}
                </td>

                {/* Acciones */}
                <td className="py-2.5 px-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectPayment(p)}
                      className="rounded-lg border border-stone-200 bg-white p-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors cursor-pointer"
                      title="Ver detalle y auditoría"
                      aria-label="Ver detalle"
                    >
                      <Eye size={14} />
                    </button>

                    {p.estado === 'PENDIENTE_CONCILIACION' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onReconcilePayment(p)}
                          className="flex items-center gap-1 rounded-lg bg-[#183b32] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#122e27] transition-colors cursor-pointer"
                          title="Conciliar pago bancario"
                        >
                          <Check size={12} />
                          Conciliar
                        </button>
                        <button
                          type="button"
                          onClick={() => onRejectPayment(p)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                          title="Rechazar pago"
                        >
                          Rechazar
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
