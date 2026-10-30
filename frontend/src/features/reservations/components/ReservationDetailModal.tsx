import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, FileText, Plus, ShieldAlert, X } from 'lucide-react';
import type {
  ConfirmationRequirementsResult,
  Reservation,
  ReservationContract,
} from '../types';
import { reservationService } from '../services/reservationService';
import { ApiError } from '../../../shared/api/client';

interface ReservationDetailModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
  onCancel: (id: string, motivo: string) => Promise<void>;
  onOpenEditDates: (reservation: Reservation) => void;
}

export interface ModalAsyncLoadHandlers {
  setContracts: (contracts: ReservationContract[]) => void;
  setRequirements: (requirements: ConfirmationRequirementsResult | null) => void;
  setRequirementsError: (err: string | null) => void;
  setIsLoadingContracts: (loading: boolean) => void;
  setIsLoadingRequirements: (loading: boolean) => void;
}

export function evaluateDirectCannotConfirm(
  origen: string,
  estado: string,
  state: {
    isLoadingRequirements: boolean;
    requirements: ConfirmationRequirementsResult | null;
    requirementsError: string | null;
  },
  currentReservationId: string
): boolean {
  return (
    origen === 'DIRECTO' &&
    estado === 'SOLICITADA' &&
    (state.isLoadingRequirements ||
      state.requirements === null ||
      state.requirements.reservaId !== currentReservationId ||
      !state.requirements.puedeConfirmar ||
      Boolean(state.requirementsError))
  );
}

export function createModalLoadCoordinator(
  service: Pick<typeof reservationService, 'getContracts' | 'getConfirmationRequirements'>,
  handlers: ModalAsyncLoadHandlers
) {
  let activeGeneration = 0;
  let activeReservationId: string | null = null;

  return {
    async startLoad(reservaId: string, origen: string) {
      const generation = ++activeGeneration;
      activeReservationId = reservaId;

      handlers.setContracts([]);
      handlers.setRequirements(null);
      handlers.setRequirementsError(null);
      handlers.setIsLoadingContracts(true);
      handlers.setIsLoadingRequirements(origen === 'DIRECTO');

      const pContracts = service
        .getContracts(reservaId)
        .then((fetched) => {
          if (activeGeneration === generation && activeReservationId === reservaId) {
            handlers.setContracts(fetched);
          }
        })
        .catch(() => {
          if (activeGeneration === generation && activeReservationId === reservaId) {
            handlers.setContracts([]);
          }
        })
        .finally(() => {
          if (activeGeneration === generation && activeReservationId === reservaId) {
            handlers.setIsLoadingContracts(false);
          }
        });

      let pReq: Promise<void> | undefined;
      if (origen === 'DIRECTO') {
        pReq = service
          .getConfirmationRequirements(reservaId)
          .then((fetched) => {
            if (
              activeGeneration === generation &&
              activeReservationId === reservaId &&
              fetched.reservaId === reservaId
            ) {
              handlers.setRequirements(fetched);
              handlers.setRequirementsError(null);
            }
          })
          .catch((err: unknown) => {
            if (activeGeneration === generation && activeReservationId === reservaId) {
              const msg =
                err instanceof Error
                  ? err.message
                  : 'No se pudieron consultar los requisitos de confirmación.';
              handlers.setRequirements(null);
              handlers.setRequirementsError(msg);
            }
          })
          .finally(() => {
            if (activeGeneration === generation && activeReservationId === reservaId) {
              handlers.setIsLoadingRequirements(false);
            }
          });
      }

      await Promise.all([pContracts, pReq]);
    },
    cancel() {
      activeGeneration++;
      activeReservationId = null;
      handlers.setContracts([]);
      handlers.setRequirements(null);
      handlers.setRequirementsError(null);
      handlers.setIsLoadingContracts(false);
      handlers.setIsLoadingRequirements(false);
    },
    getActiveGeneration: () => activeGeneration,
    getActiveReservationId: () => activeReservationId,
  };
}

export const ReservationDetailModal: React.FC<ReservationDetailModalProps> = ({
  reservation,
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  onOpenEditDates,
}) => {
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Estados DR-02: Contratos y Requisitos de Confirmación
  const [contracts, setContracts] = useState<ReservationContract[]>([]);
  const [requirements, setRequirements] = useState<ConfirmationRequirementsResult | null>(null);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(false);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [isRegisteringContract, setIsRegisteringContract] = useState(false);
  const [newContractName, setNewContractName] = useState('');
  const [newContractUrl, setNewContractUrl] = useState('');
  const [contractError, setContractError] = useState<string | null>(null);

  // DR02-06: Clave idempotente por borrador de envío contractual
  const [contractIdempotencyKey, setContractIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // FIX 3: Mecanismo de generación / invalidación para evitar condiciones de carrera entre reservas
  const handlersRef = useRef<ModalAsyncLoadHandlers>({
    setContracts,
    setRequirements,
    setRequirementsError,
    setIsLoadingContracts,
    setIsLoadingRequirements,
  });
  handlersRef.current = {
    setContracts,
    setRequirements,
    setRequirementsError,
    setIsLoadingContracts,
    setIsLoadingRequirements,
  };

  const coordinatorRef = useRef<ReturnType<typeof createModalLoadCoordinator> | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createModalLoadCoordinator(reservationService, {
      setContracts: (c) => handlersRef.current.setContracts(c),
      setRequirements: (r) => handlersRef.current.setRequirements(r),
      setRequirementsError: (e) => handlersRef.current.setRequirementsError(e),
      setIsLoadingContracts: (l) => handlersRef.current.setIsLoadingContracts(l),
      setIsLoadingRequirements: (l) => handlersRef.current.setIsLoadingRequirements(l),
    });
  }

  useEffect(() => {
    if (isOpen && reservation) {
      setActionError(null);
      setContractError(null);
      setRequirementsError(null);
      setIsCanceling(false);
      setIsRegisteringContract(false);
      setContractIdempotencyKey(crypto.randomUUID());

      coordinatorRef.current?.startLoad(reservation.id, reservation.origen);

      return () => {
        coordinatorRef.current?.cancel();
      };
    } else {
      coordinatorRef.current?.cancel();
    }
  }, [isOpen, reservation?.id, reservation?.origen]);

  const handleRegisterContractSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation) return;

    if (!newContractName || newContractName.trim().length < 3) {
      setContractError('El nombre del archivo de contrato debe tener al menos 3 caracteres.');
      return;
    }

    try {
      setIsProcessing(true);
      setContractError(null);

      // DR02-06: Conservar la misma clave durante reintentos de ese envío
      await reservationService.createContract(reservation.id, {
        nombreOriginal: newContractName.trim(),
        urlReferencia: newContractUrl.trim() || undefined,
        idempotencyKey: contractIdempotencyKey,
      });

      // Renovarla SOLAMENTE tras éxito
      setContractIdempotencyKey(crypto.randomUUID());
      setNewContractName('');
      setNewContractUrl('');
      setIsRegisteringContract(false);
      await coordinatorRef.current?.startLoad(reservation.id, reservation.origen);
    } catch (err: unknown) {
      // Si falla, se conserva contractIdempotencyKey para que el reintento use la misma clave
      if (err instanceof Error) {
        setContractError(err.message);
      } else {
        setContractError('Error al registrar la referencia del contrato.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !reservation) return null;

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'CONFIRMADA':
        return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Confirmada</span>;
      case 'SOLICITADA':
        return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Solicitada (Pendiente)</span>;
      case 'COMPLETADA':
        return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Completada</span>;
      case 'CANCELADA':
        return <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">Cancelada</span>;
      case 'EXPIRADA':
        return <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">Expirada</span>;
      default:
        return <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{estado}</span>;
    }
  };

  const getContractBadge = (estadoFirma: string) => {
    switch (estadoFirma) {
      case 'VALIDADA':
        return <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Firma Validada</span>;
      case 'RECHAZADA':
        return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Rechazada</span>;
      case 'REFERENCIADA':
      default:
        return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Referenciada (Pendiente)</span>;
    }
  };

  const formatMotivoPendiente = (motivo: string): string => {
    switch (motivo) {
      case 'CONTRATO_NO_VALIDADO':
        return 'Contrato firmado por el cliente aún no ha sido validado por el coordinador.';
      case 'CONTRATO_VIGENCIA_PENDIENTE':
        return 'Existen múltiples versiones de contrato vigentes sin relación de reemplazo inequívoca.';
      case 'PAGO_ADELANTO_FALTANTE':
        return 'No se ha registrado ningún pago correspondiente al adelanto.';
      case 'EVIDENCIA_ADELANTO_FALTANTE':
        return 'Falta registrar el voucher documental del adelanto.';
      case 'EVIDENCIA_NO_REVISADA':
        return 'El voucher del adelanto fue recibido pero aún no ha sido revisado/validado por el coordinador.';
      case 'POLITICA_ADELANTO_PENDIENTE':
        return 'La base o porcentaje de cálculo del adelanto está pendiente de aprobación comercial.';
      case 'EXCEPCION_NO_AUTORIZADA':
        return 'La política de adelanto excepcional requiere autorización explícita de Gerencia.';
      case 'ADELANTO_INSUFICIENTE':
        return 'El monto de los pagos con voucher revisado no cubre el porcentaje exigido.';
      case 'MONEDA_INCONSISTENTE':
        return 'Existen pagos en monedas distintas que no pueden sumarse (Inmunidad Financiera).';
      case 'DISPONIBILIDAD_NO_VALIDA':
        return 'Las fechas solicitadas ya no están disponibles en el calendario.';
      case 'RESERVA_NO_APTA':
        return 'La reserva no se encuentra en estado SOLICITADA.';
      default:
        return motivo;
    }
  };

  const handleConfirmClick = async () => {
    try {
      setIsProcessing(true);
      setActionError(null);
      await onConfirm(reservation.id);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const details = err.details as any;
        const motivos = details?.motivosPendientes || (err as any).motivosPendientes;
        if (Array.isArray(motivos) && motivos.length > 0) {
          setActionError(`${err.message} Motivos pendientes: ${motivos.map(formatMotivoPendiente).join('; ')}`);
        } else {
          setActionError(err.message);
        }
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Error al confirmar la reserva.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsProcessing(true);
      setActionError(null);
      await onCancel(reservation.id, cancelMotivo);
      setIsCanceling(false);
      setCancelMotivo('');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const details = err.details as any;
        const motivos = details?.motivosPendientes || (err as any).motivosPendientes;
        if (Array.isArray(motivos) && motivos.length > 0) {
          setActionError(`${err.message} Motivos: ${motivos.map(formatMotivoPendiente).join('; ')}`);
        } else {
          setActionError(err.message);
        }
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Error al cancelar la reserva.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // DR02-04: Bloqueo estricto del botón confirmar si es DIRECTO:
  // Se mantiene deshabilitada mientras se cargan requisitos, si la evaluación falla o no está disponible,
  // o si no cumple con los requisitos obligatorios.
  const isDirectAndCannotConfirm = evaluateDirectCannotConfirm(
    reservation.origen,
    reservation.estado,
    { isLoadingRequirements, requirements, requirementsError },
    reservation.id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-8 max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="detail-res-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs font-bold text-stone-700">
                {reservation.id}
              </span>
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600 font-mono">
                Canal: {reservation.origen}
              </span>
            </div>
            <h2 id="detail-res-title" className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
              {reservation.propiedadNombre}
            </h2>
            <p className="text-sm text-stone-500 mt-0.5">
              Huésped: <span className="font-semibold text-stone-800">{reservation.huespedNombre}</span>
              {reservation.huespedContacto && ` (${reservation.huespedContacto})`}
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

        {actionError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="mt-6 space-y-6">
          {/* Status and Stay Summary */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Estado Transaccional</p>
              <div>{getStatusBadge(reservation.estado)}</div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Importe Acordado</p>
              <p className="text-xl font-bold text-stone-900">
                {reservation.moneda === 'USD' ? '$' : 'S/'} {reservation.montoAcordado.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Dates Interval */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
              Intervalo Semiabierto de Estancia [ingreso, salida)
            </h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-stone-400 uppercase font-semibold">Check-in</p>
                <p className="text-base font-bold text-stone-800 font-mono mt-0.5">{reservation.ingreso}</p>
              </div>
              <div className="text-center px-4 py-1.5 rounded-full bg-stone-100 text-xs font-bold text-stone-600">
                → {reservation.noches} noche{reservation.noches > 1 ? 's' : ''} →
              </div>
              <div>
                <p className="text-xs text-stone-400 uppercase font-semibold">Check-out</p>
                <p className="text-base font-bold text-stone-800 font-mono mt-0.5">{reservation.salida}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-stone-400">
              * El día de check-out ({reservation.salida}) queda disponible para un nuevo check-in en la tarde (consecutivas permitidas).
            </p>
          </div>

          {/* DR-03: SECCIÓN DE PLAZO DE SOLICITUD Y EXPIRACIÓN */}
          {(reservation.venceEn || reservation.expiradaEn) && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                Plazo Límite de Solicitud y Expiración
              </h3>
              <div className="space-y-2 text-xs text-stone-700">
                {reservation.venceEn && (
                  <div>
                    <span className="font-semibold text-stone-900">Vencimiento programado:</span>{' '}
                    <span className="font-mono text-stone-800">
                      {new Date(reservation.venceEn).toLocaleString()}
                    </span>
                  </div>
                )}
                {reservation.politicaPlazoVersion && (
                  <div>
                    <span className="font-semibold text-stone-900">Política aplicada:</span>{' '}
                    <span className="font-mono text-stone-600">{reservation.politicaPlazoVersion}</span>
                  </div>
                )}
                {reservation.expiradaEn && (
                  <div className="text-rose-700 font-medium">
                    <span>Expirada formalmente el:</span>{' '}
                    <span className="font-mono">
                      {new Date(reservation.expiradaEn).toLocaleString()}
                    </span>
                  </div>
                )}
                {reservation.estado === 'SOLICITADA' &&
                  reservation.venceEn &&
                  new Date(reservation.venceEn).getTime() <= Date.now() && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900 flex items-center gap-2 mt-2">
                      <AlertCircle size={15} className="shrink-0 text-amber-700" aria-hidden="true" />
                      <span>
                        El plazo de solicitud ha vencido. La liberación definitiva de disponibilidad se efectuará
                        al sincronizar la base de datos (actualización pendiente).
                      </span>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* DR-02: SECCIÓN DE REQUISITOS DE CONFIRMACIÓN (SOLO DIRECTO) */}
          {reservation.origen === 'DIRECTO' && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                  <ShieldAlert size={15} className="text-emerald-800" />
                  Requisitos de Confirmación (Canal Directo)
                </h3>
                {requirements && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      requirements.puedeConfirmar
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {requirements.puedeConfirmar ? 'Apta para Confirmar' : 'Requisitos Incompletos'}
                  </span>
                )}
              </div>

              {requirements ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-stone-700">Contrato Firmado</span>
                      {requirements.requisitos.contratoFirmado ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={13} /> Validado
                        </span>
                      ) : (
                        <span className="text-amber-700 font-bold flex items-center gap-1">
                          <Clock size={13} /> Pendiente
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-stone-700">Voucher Recibido</span>
                      {requirements.requisitos.evidenciaAdelanto ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={13} /> Adjunto
                        </span>
                      ) : (
                        <span className="text-red-700 font-bold flex items-center gap-1">
                          <AlertCircle size={13} /> Faltante
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-stone-700">Voucher Revisado</span>
                      {requirements.requisitos.evidenciaRevisada ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={13} /> Revisado
                        </span>
                      ) : (
                        <span className="text-amber-700 font-bold flex items-center gap-1">
                          <Clock size={13} /> Pendiente
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-stone-700">Adelanto Comercial</span>
                      {requirements.requisitos.adelantoCubierto ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={13} /> Cubierto
                        </span>
                      ) : (
                        <span className="text-amber-700 font-bold flex items-center gap-1">
                          <Clock size={13} /> Insuficiente
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-stone-700">Disponibilidad Fechas</span>
                      {requirements.requisitos.disponibilidadValida ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={13} /> Disponible
                        </span>
                      ) : (
                        <span className="text-red-700 font-bold flex items-center gap-1">
                          <AlertCircle size={13} /> Solape
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-stone-200">
                      <span className="text-stone-500">Conciliación Bancaria</span>
                      {requirements.requisitos.adelantoConciliado ? (
                        <span className="text-stone-600 font-medium">Conciliado</span>
                      ) : (
                        <span className="text-stone-500 font-medium text-[11px]">En Proceso (Tesorería)</span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-500 italic">
                    * Según Adenda DR-02: La confirmación comercial exige contrato firmado y voucher revisado por coordinador. La conciliación bancaria es un proceso de tesorería y no bloquea la confirmación.
                  </p>

                  {requirements.motivosPendientes.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        <AlertCircle size={14} className="text-amber-700" />
                        Requisitos pendientes detectados:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                        {requirements.motivosPendientes.map((m) => (
                          <li key={m}>{formatMotivoPendiente(m)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : requirementsError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-700 shrink-0" />
                  <span>{requirementsError}</span>
                </div>
              ) : (
                <p className="text-xs text-stone-500 italic">
                  {isLoadingRequirements ? 'Consultando requisitos de confirmación...' : 'Cargando requisitos...'}
                </p>
              )}
            </div>
          )}

          {/* DR-02: SECCIÓN DE CONTRATOS ASOCIADOS Y VERSIONES */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <FileText size={15} className="text-stone-600" />
                Contratos de Reserva y Versiones
              </h3>
              {!isRegisteringContract && reservation.estado !== 'CANCELADA' && (
                <button
                  type="button"
                  onClick={() => setIsRegisteringContract(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  <Plus size={13} />
                  Nueva Referencia
                </button>
              )}
            </div>

            {/* Formulario para registrar nueva referencia de contrato */}
            {isRegisteringContract && (
              <form onSubmit={handleRegisterContractSubmit} className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 space-y-3">
                <p className="text-xs font-bold text-stone-800">Registrar Referencia Documental de Contrato</p>
                {contractError && (
                  <p className="text-xs text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">{contractError}</p>
                )}
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    Nombre Original del Archivo *
                  </label>
                  <input
                    type="text"
                    required
                    value={newContractName}
                    onChange={(e) => setNewContractName(e.target.value)}
                    placeholder="ej. contrato_alquiler_firmado_cliente.pdf"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                    URL Privada de Referencia (Google Drive / Repositorio interno)
                  </label>
                  <input
                    type="url"
                    value={newContractUrl}
                    onChange={(e) => setNewContractUrl(e.target.value)}
                    placeholder="https://drive.google.com/... o referencia interna"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisteringContract(false);
                      setContractError(null);
                      setContractIdempotencyKey(crypto.randomUUID());
                    }}
                    className="rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="rounded-lg bg-[#183b32] px-3.5 py-1 text-xs font-semibold text-white hover:bg-[#122e27] cursor-pointer"
                  >
                    {isProcessing ? 'Guardando...' : 'Registrar Referencia'}
                  </button>
                </div>
              </form>
            )}

            {/* Listado de versiones */}
            {contracts.length > 0 ? (
              <div className="space-y-2">
                {contracts.map((ct) => (
                  <div
                    key={ct.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-stone-200 bg-stone-50/40 text-xs gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-stone-800 bg-stone-200/80 px-1.5 py-0.5 rounded text-[11px]">
                          v{ct.version}
                        </span>
                        <span className="font-semibold text-stone-900">{ct.nombreOriginal}</span>
                        {getContractBadge(ct.estadoFirma)}
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500">
                        Registrado el {new Date(ct.registradoEn).toLocaleString('es-PE')}
                        {ct.registradoPorNombre && ` por ${ct.registradoPorNombre}`}
                      </p>
                    </div>

                    {ct.urlReferencia && (
                      <span className="text-[11px] text-stone-400 font-mono italic truncate max-w-xs">
                        [Referencia privada adjunta]
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-400 italic">
                {isLoadingContracts
                  ? 'Cargando contratos...'
                  : 'No se han registrado versiones de contrato para esta reserva.'}
              </p>
            )}
          </div>

          {/* Reference & Notes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Origen / Referencia</p>
              <p className="mt-1 text-sm font-semibold text-stone-800">
                {reservation.origen} {reservation.referenciaCanal ? `(${reservation.referenciaCanal})` : ''}
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Última Actualización</p>
              <p className="mt-1 text-xs text-stone-600 font-mono">
                {new Date(reservation.actualizadaEn).toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          {reservation.notas && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Notas u Observaciones</p>
              <p className="text-sm text-stone-700 leading-relaxed">{reservation.notas}</p>
            </div>
          )}

          {reservation.estado === 'CANCELADA' && (
            <div className="rounded-2xl border border-stone-300 bg-stone-100 p-4 text-xs text-stone-800">
              <p className="font-semibold text-stone-900 mb-1">Motivo de Cancelación</p>
              <p>{reservation.motivoCancelacion || 'Cancelación registrada en el sistema.'}</p>
              <p className="mt-1.5 text-stone-500 font-medium">
                ✓ Disponibilidad liberada en el calendario según la regla de negocio.
              </p>
            </div>
          )}

          {/* Formulario de Cancelación */}
          {isCanceling && (
            <form onSubmit={handleCancelSubmit} className="rounded-2xl border border-red-200 bg-red-50/60 p-4 space-y-3">
              <p className="text-xs font-bold text-red-900 uppercase tracking-wide">
                Confirmar Cancelación de Reserva
              </p>
              <p className="text-xs text-red-800 leading-relaxed">
                Esta acción cambiará el estado a CANCELADA y liberará inmediatamente los días ocupados en el calendario de disponibilidad.
              </p>
              <input
                type="text"
                required
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                placeholder="Motivo de la cancelación (obligatorio)..."
                className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-hidden"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCanceling(false)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="rounded-lg bg-red-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-800 cursor-pointer"
                >
                  {isProcessing ? 'Cancelando...' : 'Confirmar Cancelación'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-200 pt-5">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {reservation.estado !== 'CANCELADA' && reservation.estado !== 'EXPIRADA' && !isCanceling && (
              <button
                type="button"
                onClick={() => setIsCanceling(true)}
                className="rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
              >
                Cancelar Reserva
              </button>
            )}

            {reservation.estado !== 'CANCELADA' && reservation.estado !== 'EXPIRADA' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditDates(reservation);
                }}
                className="rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                Modificar Fechas
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
            >
              Cerrar
            </button>

            {reservation.estado === 'SOLICITADA' && (
              <button
                type="button"
                disabled={isProcessing || isDirectAndCannotConfirm}
                onClick={handleConfirmClick}
                title={
                  isDirectAndCannotConfirm
                    ? 'Requisitos pendientes: Debe contar con contrato firmado validado y voucher revisado.'
                    : undefined
                }
                className="rounded-xl bg-[#183b32] px-5 py-2 text-sm font-semibold text-white hover:bg-[#122e27] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing
                  ? 'Validando...'
                  : isDirectAndCannotConfirm
                  ? 'Requisitos Pendientes'
                  : 'Confirmar Reserva'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
