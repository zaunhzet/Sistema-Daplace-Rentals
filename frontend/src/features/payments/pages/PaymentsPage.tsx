import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Plus, ShieldAlert, CheckCircle2, Clock, Ban, X } from 'lucide-react';
import type { CreatePaymentDto, Payment, PaymentFilterParams, ReconcilePaymentDto, RejectPaymentDto } from '../types';
import { paymentService } from '../services/paymentService';
import { propertyService } from '../../properties';
import { reservationService } from '../../reservations';
import type { Property } from '../../properties';
import type { Reservation } from '../../reservations';
import { useAuth } from '../../auth/AuthContext';
import { hasPermission } from '../../../shared/auth/permissions';
import { PaymentFilters } from '../components/PaymentFilters';
import { PaymentList } from '../components/PaymentList';
import { PaymentFormModal } from '../components/PaymentFormModal';
import { PaymentDetailModal } from '../components/PaymentDetailModal';
import { PaymentReconcileModal } from '../components/PaymentReconcileModal';
import { PaymentRejectModal } from '../components/PaymentRejectModal';
import { fromCents, formatMoney, toCents } from '../../../shared/money';
import { isMockMode } from '../../../shared/api/config';

const readReservaIdParam = (search: string): string | null => {
  const value = new URLSearchParams(search).get('reservaId')?.trim();
  return value ? value : null;
};

export const PaymentsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const canManagePayments = hasPermission(session.user?.rol, 'manage:payments');

  const initialUrlReservaId = readReservaIdParam(location.search);
  const lastUrlReservaIdRef = useRef<string | null>(initialUrlReservaId);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filtros
  const [filters, setFilters] = useState<PaymentFilterParams>({
    search: '',
    propiedadId: 'TODAS',
    reservaId: initialUrlReservaId || 'TODAS',
    estado: 'TODOS',
  });
  const filtersRef = useRef<PaymentFilterParams>(filters);
  filtersRef.current = filters;
  const loadSeqRef = useRef(0);
  const isMountedRef = useRef(true);

  // Modales
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [preselectedReservation, setPreselectedReservation] = useState<Reservation | null>(null);
  const [pendingNavReservationId, setPendingNavReservationId] = useState<string | null>(null);
  const navRequestSeqRef = useRef(0);
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [reconcilePayment, setReconcilePayment] = useState<Payment | null>(null);
  const [rejectPayment, setRejectPayment] = useState<Payment | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      loadSeqRef.current += 1;
    };
  }, []);

  const loadData = useCallback(async (targetFilters?: PaymentFilterParams) => {
    const requestSeq = ++loadSeqRef.current;
    const activeFilters = targetFilters ?? filtersRef.current;
    setLoading(true);
    try {
      const [fetchedPayments, fetchedProps, fetchedReservations] = await Promise.all([
        paymentService.getPayments(activeFilters),
        propertyService.getProperties(),
        reservationService.getReservations(),
      ]);
      if (!isMountedRef.current || requestSeq !== loadSeqRef.current) return;
      setPayments(fetchedPayments);
      setProperties(fetchedProps);
      setReservations(fetchedReservations);
    } catch {
      if (!isMountedRef.current || requestSeq !== loadSeqRef.current) return;
      setFeedback({ type: 'error', message: 'Error al cargar los datos financieros.' });
    } finally {
      if (isMountedRef.current && requestSeq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData(filters);
    return () => {
      loadSeqRef.current += 1;
    };
  }, [filters, loadData]);

  // Captura el contexto de navegación una sola vez y lo limpia del historial
  useEffect(() => {
    const state = location.state as { registerPaymentForReservationId?: unknown } | null;
    const rawId = state?.registerPaymentForReservationId;
    if (typeof rawId === 'string' && rawId.trim() !== '') {
      setPendingNavReservationId(rawId.trim());
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  // Resuelve la reserva por ID y valida permiso antes de abrir el formulario
  useEffect(() => {
    if (!pendingNavReservationId) return;
    let active = true;
    const requestedId = pendingNavReservationId;
    const requestSeq = ++navRequestSeqRef.current;

    if (!canManagePayments) {
      setFeedback({
        type: 'error',
        message: 'No cuentas con permisos para registrar abonos en esta reserva.',
      });
      setPendingNavReservationId(null);
      return;
    }

    reservationService
      .getReservationById(requestedId)
      .then((resolved) => {
        if (!active || requestSeq !== navRequestSeqRef.current) return;
        if (!resolved) {
          setFeedback({
            type: 'error',
            message: 'No se encontró la reserva solicitada para registrar el abono.',
          });
          return;
        }
        setFeedback(null);
        setPreselectedReservation(resolved);
        setIsFormOpen(true);
      })
      .catch((err: unknown) => {
        if (!active || requestSeq !== navRequestSeqRef.current) return;
        setFeedback({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'No se pudo consultar la reserva solicitada para registrar el abono.',
        });
      })
      .finally(() => {
        if (active && requestSeq === navRequestSeqRef.current) {
          setPendingNavReservationId(null);
        }
      });

    return () => {
      active = false;
    };
  }, [pendingNavReservationId, canManagePayments]);

  // Sincroniza filtro de reserva cuando cambia ?reservaId= en la URL
  useEffect(() => {
    const urlReservaId = readReservaIdParam(location.search);
    if (urlReservaId !== lastUrlReservaIdRef.current) {
      lastUrlReservaIdRef.current = urlReservaId;
      setFilters((prev) => ({
        ...prev,
        reservaId: urlReservaId || 'TODAS',
      }));
    }
  }, [location.search]);

  const clearReservaIdFromUrl = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('reservaId')) return;
    params.delete('reservaId');
    const nextSearch = params.toString();
    lastUrlReservaIdRef.current = null;
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true, state: location.state }
    );
  }, [location.pathname, location.search, location.state, navigate]);

  // Manejo de filtros
  const handleFilterChange = (newFilters: Partial<PaymentFilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    if ('reservaId' in newFilters) {
      clearReservaIdFromUrl();
    }
  };

  const handleResetFilters = () => {
    clearReservaIdFromUrl();
    setFilters({
      search: '',
      propiedadId: 'TODAS',
      reservaId: 'TODAS',
      estado: 'TODOS',
    });
  };

  // Acciones
  const handleCreatePayment = async (dto: CreatePaymentDto) => {
    try {
      await paymentService.createPayment(dto);
      setFeedback({
        type: 'success',
        message: 'Abono registrado exitosamente en estado PENDIENTE_CONCILIACION.',
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar el abono.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  const handleReconcilePayment = async (id: string, dto?: ReconcilePaymentDto) => {
    try {
      await paymentService.reconcilePayment(id, dto);
      setFeedback({
        type: 'success',
        message: `Pago "${id}" conciliado formalmente. El saldo de la reserva ha sido actualizado.`,
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conciliar el pago.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  const handleRejectPayment = async (id: string, dto: RejectPaymentDto) => {
    try {
      await paymentService.rejectPayment(id, dto);
      setFeedback({
        type: 'success',
        message: `Pago "${id}" rechazado correctamente. No se computará como ingreso validado.`,
      });
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al rechazar el pago.';
      setFeedback({ type: 'error', message: msg });
      throw err;
    }
  };

  // KPIs calculados con precisión por moneda (estricta separación contable PEN y USD)
  let totalConciliadoPenCents = 0;
  let totalConciliadoUsdCents = 0;
  let totalPendientePenCents = 0;
  let totalPendienteUsdCents = 0;
  let countPendientes = 0;
  let countRechazados = 0;

  for (const p of payments) {
    const isUsd = (p.moneda || 'PEN').toUpperCase() === 'USD';
    const cents = toCents(p.importe);
    if (p.estado === 'CONCILIADO') {
      if (isUsd) totalConciliadoUsdCents += cents;
      else totalConciliadoPenCents += cents;
    } else if (p.estado === 'PENDIENTE_CONCILIACION') {
      if (isUsd) totalPendienteUsdCents += cents;
      else totalPendientePenCents += cents;
      countPendientes++;
    } else if (p.estado === 'RECHAZADO') {
      countRechazados++;
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Aviso de Modo Simulado: solo si VITE_USE_MOCKS === 'true' */}
      {isMockMode() && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[11px] uppercase tracking-wide">
              Modo Simulado (Mock)
            </span>
            <span>
              Este módulo opera temporalmente con datos en memoria (VITE_USE_MOCKS=true).
            </span>
          </div>
        </div>
      )}

      {/* Cabecera de Página */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Pagos y Conciliación
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
            Registro de abonos, prevención de doble contabilización y validación formal con extractos bancarios.
          </p>
        </div>

        {canManagePayments && (
          <button
            type="button"
            onClick={() => {
              navRequestSeqRef.current += 1;
              setPendingNavReservationId(null);
              setPreselectedReservation(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#162A2C] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-2xs hover:bg-[#183b32] transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Registrar Abono</span>
          </button>
        )}
      </div>

      {/* Alerta de feedback */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-stone-500 hover:text-stone-800 ml-4 cursor-pointer"
            aria-label="Cerrar notificación"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Banner de regla financiera */}
      <div className="rounded-xl border border-stone-200/90 bg-stone-100/70 p-3 text-xs text-stone-700 flex items-start gap-2.5 shadow-2xs">
        <ShieldAlert size={16} className="text-[#5E6C5B] shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-stone-900 font-semibold">Regla de Inmunidad Financiera:</strong> Únicamente los
          abonos con estado <span className="font-semibold text-emerald-800">CONCILIADO</span> reducen el saldo deudor.
          Los pagos <span className="font-semibold text-amber-800">PENDIENTE</span> o{' '}
          <span className="font-semibold text-rose-800">RECHAZADO</span> no generan ingreso computable ni alteran los
          libros. Los fondos de garantía se administran en custodia contable separada.
        </div>
      </div>

      {/* Tarjetas KPI con estricta separación de divisas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">TOTAL CONCILIADO</span>
            <CheckCircle2 size={15} className="text-emerald-700" />
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            <div className="text-lg sm:text-xl font-bold font-mono text-emerald-900">
              {formatMoney(fromCents(totalConciliadoPenCents), 'PEN')}
            </div>
            {totalConciliadoUsdCents > 0 && (
              <div className="text-xs sm:text-sm font-semibold font-mono text-emerald-800">
                + {formatMoney(fromCents(totalConciliadoUsdCents), 'USD')}
              </div>
            )}
          </div>
          <span className="text-[10px] text-stone-500">Ingreso de alquiler validado</span>
        </div>

        <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">POR CONCILIAR</span>
            <Clock size={15} className="text-amber-700" />
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            <div className="text-lg sm:text-xl font-bold font-mono text-amber-900">
              {formatMoney(fromCents(totalPendientePenCents), 'PEN')}
            </div>
            {totalPendienteUsdCents > 0 && (
              <div className="text-xs sm:text-sm font-semibold font-mono text-amber-800">
                + {formatMoney(fromCents(totalPendienteUsdCents), 'USD')}
              </div>
            )}
          </div>
          <span className="text-[10px] text-amber-800 font-medium">
            {countPendientes} {countPendientes === 1 ? 'abono pendiente' : 'abonos pendientes'}
          </span>
        </div>

        <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">ABONOS RECHAZADOS</span>
            <Ban size={15} className="text-rose-700" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-rose-900 mt-1">{countRechazados}</div>
          <span className="text-[10px] text-stone-500">Sin impacto en ingresos</span>
        </div>

        <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">TOTAL REGISTROS</span>
            <span className="text-[10px] font-mono font-semibold text-stone-400">Total</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-stone-900 mt-1">{payments.length}</div>
          <span className="text-[10px] text-stone-500">Transacciones en vista</span>
        </div>
      </div>

      {/* Filtros */}
      <PaymentFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        properties={properties}
        reservations={reservations}
        onReset={handleResetFilters}
      />

      {/* Listado de Pagos */}
      {loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-xs text-stone-500">
          Cargando registros contables...
        </div>
      ) : (
        <PaymentList
          payments={payments}
          onSelectPayment={(p) => setDetailPayment(p)}
          onReconcilePayment={(p) => setReconcilePayment(p)}
          onRejectPayment={(p) => setRejectPayment(p)}
        />
      )}

      {/* Modales */}
      <PaymentFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setPreselectedReservation(null);
        }}
        onSubmit={handleCreatePayment}
        reservations={reservations}
        preselectedReservation={preselectedReservation}
      />

      <PaymentDetailModal
        payment={detailPayment}
        isOpen={Boolean(detailPayment)}
        onClose={() => setDetailPayment(null)}
        onOpenReconcile={(p) => setReconcilePayment(p)}
        onOpenReject={(p) => setRejectPayment(p)}
      />

      <PaymentReconcileModal
        payment={reconcilePayment}
        isOpen={Boolean(reconcilePayment)}
        onClose={() => setReconcilePayment(null)}
        onConfirm={handleReconcilePayment}
      />

      <PaymentRejectModal
        payment={rejectPayment}
        isOpen={Boolean(rejectPayment)}
        onClose={() => setRejectPayment(null)}
        onConfirm={handleRejectPayment}
      />
    </div>
  );
};
