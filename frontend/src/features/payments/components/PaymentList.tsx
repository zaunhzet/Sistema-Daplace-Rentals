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
      <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center shadow-xs">
        <p className="text-sm font-semibold text-stone-700">No se encontraron pagos con los filtros seleccionados.</p>
        <p className="text-xs text-stone-500 mt-1">
          Intente restablecer los filtros o registrar un nuevo abono para una reserva activa.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/80 text-[11px] font-bold text-stone-600 uppercase tracking-wider">
              <th className="py-3.5 px-4">CÓDIGO / FECHA</th>
              <th className="py-3.5 px-4">RESERVA / PROPIEDAD</th>
              <th className="py-3.5 px-4">HUÉSPED</th>
              <th className="py-3.5 px-4">CONCEPTO / MEDIO</th>
              <th className="py-3.5 px-4">REFERENCIA</th>
              <th className="py-3.5 px-4 text-right">IMPORTE</th>
              <th className="py-3.5 px-4 text-center">ESTADO</th>
              <th className="py-3.5 px-4 text-center">ACCIONES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                {/* Código y Fecha */}
                <td className="py-3.5 px-4">
                  <div className="font-mono font-bold text-stone-800">{p.id}</div>
                  <div className="text-[11px] text-stone-500">{p.fechaPago}</div>
                </td>

                {/* Reserva y Propiedad */}
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-stone-900">{p.propiedadNombre}</div>
                  <div className="font-mono text-[11px] text-stone-500">Reserva: {p.reservaId}</div>
                </td>

                {/* Huésped */}
                <td className="py-3.5 px-4">
                  <div className="font-medium text-stone-800">{p.huespedNombre}</div>
                </td>

                {/* Concepto y Medio */}
                <td className="py-3.5 px-4">
                  <span className="inline-block rounded-md bg-stone-100 px-2 py-0.5 font-semibold text-stone-700 text-[11px]">
                    {p.concepto}
                  </span>
                  <div className="text-[11px] text-stone-500 mt-0.5">{p.metodoPago}</div>
                </td>

                {/* Referencia */}
                <td className="py-3.5 px-4">
                  <div className="font-mono text-stone-700">{p.referencia}</div>
                </td>

                {/* Importe */}
                <td className="py-3.5 px-4 text-right font-mono font-bold text-stone-900">
                  {formatMoney(p.importe, p.moneda)}
                </td>

                {/* Estado */}
                <td className="py-3.5 px-4 text-center">
                  {p.estado === 'CONCILIADO' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                      <CheckCircle2 size={12} />
                      Conciliado
                    </span>
                  )}
                  {p.estado === 'PENDIENTE_CONCILIACION' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200">
                      <AlertCircle size={12} />
                      Pendiente
                    </span>
                  )}
                  {p.estado === 'RECHAZADO' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 border border-rose-200">
                      <Ban size={12} />
                      Rechazado
                    </span>
                  )}
                </td>

                {/* Acciones */}
                <td className="py-3.5 px-4 text-center">
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
                          className="flex items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-900 transition-colors cursor-pointer"
                          title="Conciliar pago bancario"
                        >
                          <Check size={12} />
                          Conciliar
                        </button>
                        <button
                          type="button"
                          onClick={() => onRejectPayment(p)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
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
