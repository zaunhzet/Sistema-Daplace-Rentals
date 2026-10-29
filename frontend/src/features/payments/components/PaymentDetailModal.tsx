import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Ban, FileText, ExternalLink, Plus } from 'lucide-react';
import type { Payment, PaymentEvidence } from '../types';
import { formatMoney } from '../../../shared/money';
import { paymentService } from '../services/paymentService';

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
  const [evidencias, setEvidencias] = useState<PaymentEvidence[]>([]);
  const [showAddEvidence, setShowAddEvidence] = useState<boolean>(false);
  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [referenciaDoc, setReferenciaDoc] = useState<string>('');
  const [urlDoc, setUrlDoc] = useState<string>('');
  const [evidenceLoading, setEvidenceLoading] = useState<boolean>(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceIdempotencyKey, setEvidenceIdempotencyKey] = useState<string>('');

  useEffect(() => {
    if (payment) {
      setEvidencias(payment.evidencias || []);
      setShowAddEvidence(false);
      setNombreArchivo('');
      setReferenciaDoc('');
      setUrlDoc('');
      setEvidenceError(null);
      setEvidenceIdempotencyKey('');
    }
  }, [payment]);

  if (!isOpen || !payment) return null;

  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreArchivo.trim()) {
      setEvidenceError('El nombre del documento es obligatorio.');
      return;
    }

    setEvidenceLoading(true);
    setEvidenceError(null);

    // Mantener clave estable durante reintentos del mismo envío (H6)
    const keyToUse =
      evidenceIdempotencyKey ||
      `idem-ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (!evidenceIdempotencyKey) {
      setEvidenceIdempotencyKey(keyToUse);
    }

    try {
      const nuevaEv = await paymentService.addEvidence(
        payment.id,
        {
          nombreArchivo: nombreArchivo.trim(),
          referenciaDocumental: referenciaDoc.trim() || undefined,
          url: urlDoc.trim() || undefined,
          idempotencyKey: keyToUse,
        },
        keyToUse
      );

      setEvidencias((prev) => [nuevaEv, ...prev]);
      setNombreArchivo('');
      setReferenciaDoc('');
      setUrlDoc('');
      setEvidenceIdempotencyKey('');
      setShowAddEvidence(false);
    } catch (err: unknown) {
      setEvidenceError(err instanceof Error ? err.message : 'Error al adjuntar evidencia.');
    } finally {
      setEvidenceLoading(false);
    }
  };

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
              {payment.beneficiarioTipo && (
                <div>
                  <span className="text-stone-500 block">Beneficiario:</span>
                  <span className="font-semibold text-stone-800">
                    {payment.beneficiarioTipo}
                    {payment.beneficiarioNombre ? ` — ${payment.beneficiarioNombre}` : ''}
                  </span>
                </div>
              )}
              {payment.bancoReceptor && (
                <div>
                  <span className="text-stone-500 block">Banco receptor:</span>
                  <span className="font-semibold text-stone-800">{payment.bancoReceptor}</span>
                </div>
              )}
              {payment.cuentaReferencia && (
                <div className="col-span-2">
                  <span className="text-stone-500 block">Cuenta restringida:</span>
                  <span className="font-mono font-semibold text-stone-800">{payment.cuentaReferencia}</span>
                </div>
              )}
              {payment.idempotencyKey && (
                <div className="col-span-2">
                  <span className="text-stone-500 block">Clave de idempotencia:</span>
                  <span className="font-mono text-[11px] text-stone-600">{payment.idempotencyKey}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sección DR-01: Evidencias Documentales */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-stone-800 text-[11px] uppercase tracking-wider">
                <FileText size={14} className="text-[#183b32]" />
                <span>EVIDENCIAS DOCUMENTALES ({evidencias.length})</span>
              </div>
              {payment.estado !== 'RECHAZADO' && !showAddEvidence && (
                <button
                  type="button"
                  onClick={() => setShowAddEvidence(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  <Plus size={12} />
                  Adjuntar Voucher
                </button>
              )}
            </div>

            {showAddEvidence && (
              <form onSubmit={handleAddEvidence} className="rounded-xl border border-stone-200 bg-white p-3 space-y-2.5">
                <div className="text-[11px] font-bold text-stone-800">Nueva Referencia Documental</div>
                {evidenceError && (
                  <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                    {evidenceError}
                  </div>
                )}
                <div>
                  <input
                    type="text"
                    value={nombreArchivo}
                    onChange={(e) => setNombreArchivo(e.target.value)}
                    placeholder="Nombre del archivo (ej: voucher_pago.pdf) *"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-800 focus:outline-hidden"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={referenciaDoc}
                    onChange={(e) => setReferenciaDoc(e.target.value)}
                    placeholder="Referencia u operación"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-800 focus:outline-hidden"
                  />
                  <input
                    type="text"
                    value={urlDoc}
                    onChange={(e) => setUrlDoc(e.target.value)}
                    placeholder="URL (opcional)"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs text-stone-800 focus:outline-hidden"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddEvidence(false)}
                    className="rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={evidenceLoading}
                    className="rounded-lg bg-[#183b32] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#142e27] disabled:opacity-50"
                  >
                    {evidenceLoading ? 'Guardando...' : 'Guardar Evidencia'}
                  </button>
                </div>
              </form>
            )}

            {evidencias.length === 0 ? (
              <p className="text-[11px] text-stone-500 italic">No hay evidencias documentales vinculadas a este abono.</p>
            ) : (
              <div className="space-y-2">
                {evidencias.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-700 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-stone-900 text-xs">
                        <FileText size={13} className="text-stone-400 shrink-0" />
                        <span>{ev.nombreArchivo}</span>
                        {ev.url && (
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#183b32] hover:underline inline-flex items-center gap-0.5 ml-1"
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        {ev.estado}
                      </span>
                    </div>
                    {ev.referenciaDocumental && (
                      <div className="text-[11px] text-stone-600 font-mono">
                        Ref: {ev.referenciaDocumental}
                      </div>
                    )}
                    <div className="text-[10px] text-stone-400">
                      Registrado el {ev.creadoEn.slice(0, 10)} {ev.registradoPor ? `por ${ev.registradoPor}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
