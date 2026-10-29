import React from 'react';
import { X, CheckCircle2, AlertCircle, Ban } from 'lucide-react';
import type { Payment } from '../types';
import { formatMoney } from '../../../shared/money';

interface PaymentDetailModalProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenReconcile?: (payment: Payment) => void;
  onOpenReject?: (payment: Payment) => void;
}

export const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  payment,
  isOpen,
  onClose,
  onOpenReconcile,
  onOpenReject,
}) => {
  if (!isOpen || !payment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xl">
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
              COMPROBANTE DE ABONO
            </span>
            <span className="font-mono text-xs text-stone-400">• {payment.id}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-2xl font-bold font-mono text-stone-900">
              {formatMoney(payment.importe, payment.moneda)}
            </div>

            {/* Badge de estado */}
            {payment.estado === 'CONCILIADO' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 size={13} />
                Conciliado
              </span>
            )}
            {payment.estado === 'PENDIENTE_CONCILIACION' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                <AlertCircle size={13} />
                Pendiente Conciliación
              </span>
            )}
            {payment.estado === 'RECHAZADO' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                <Ban size={13} />
                Rechazado
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* Datos de Reserva */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-2">
            <h4 className="font-bold text-stone-800 text-[11px] uppercase tracking-wider">
              VINCULACIÓN OPERATIVA
            </h4>
            <div className="grid grid-cols-2 gap-2 text-stone-700">
              <div>
                <span className="text-stone-500">Reserva:</span>{' '}
                <strong className="text-stone-900 font-mono">{payment.reservaId}</strong>
              </div>
              <div>
                <span className="text-stone-500">Huésped:</span>{' '}
                <strong className="text-stone-900">{payment.huespedNombre}</strong>
              </div>
              <div className="col-span-2">
                <span className="text-stone-500">Inmueble:</span>{' '}
                <strong className="text-stone-900">{payment.propiedadNombre}</strong>
              </div>
            </div>
          </div>

          {/* Datos de Transacción */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-2">
            <h4 className="font-bold text-stone-800 text-[11px] uppercase tracking-wider">
              DATOS DE LA TRANSACCIÓN
            </h4>
            <div className="grid grid-cols-2 gap-3 text-stone-700">
              <div>
                <span className="text-stone-500 block">Concepto:</span>
                <span className="font-semibold text-stone-800">{payment.concepto}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Medio de pago:</span>
                <span className="font-semibold text-stone-800">{payment.metodoPago}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Referencia / Voucher:</span>
                <span className="font-mono font-semibold text-stone-800">{payment.referencia}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Fecha de abono:</span>
                <span className="font-semibold text-stone-800">{payment.fechaPago}</span>
              </div>
              {payment.idempotencyKey && (
                <div className="col-span-2">
                  <span className="text-stone-500 block">Clave de idempotencia:</span>
                  <span className="font-mono text-[11px] text-stone-600">{payment.idempotencyKey}</span>
                </div>
              )}
            </div>
          </div>

          {/* Trazabilidad y Auditoría */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 space-y-2">
            <h4 className="font-bold text-stone-800 text-[11px] uppercase tracking-wider">
              REGISTRO Y AUDITORÍA
            </h4>
            <div className="space-y-1.5 text-stone-600 text-[11px]">
              <div>
                <span className="text-stone-500">Registrado en sistema:</span>{' '}
                <span className="font-mono">{payment.registradoEn}</span>
              </div>
              {payment.conciliadoEn && (
                <div>
                  <span className="text-stone-500">Conciliado el:</span>{' '}
                  <span className="font-mono font-medium text-emerald-800">{payment.conciliadoEn}</span>
                  {payment.conciliadoPor && (
                    <span className="text-stone-600"> por {payment.conciliadoPor}</span>
                  )}
                </div>
              )}
              {payment.rechazadoEn && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-800">
                  <span className="font-semibold">Rechazado el:</span> {payment.rechazadoEn}
                  <div className="mt-0.5">
                    <span className="font-semibold">Motivo:</span> {payment.motivoRechazo}
                  </div>
                </div>
              )}
              {payment.notas && (
                <div className="pt-1">
                  <span className="text-stone-500">Observaciones:</span>{' '}
                  <span className="text-stone-800">{payment.notas}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-stone-200">
          {payment.estado === 'PENDIENTE_CONCILIACION' && (
            <>
              {onOpenReject && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenReject(payment);
                  }}
                  className="rounded-xl border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  Rechazar Abono
                </button>
              )}
              {onOpenReconcile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenReconcile(payment);
                  }}
                  className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 transition-colors cursor-pointer"
                >
                  Conciliar Pago
                </button>
              )}
            </>
          )}

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
