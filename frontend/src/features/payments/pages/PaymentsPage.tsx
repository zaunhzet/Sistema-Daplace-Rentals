import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldAlert, CheckCircle2, Clock, Ban, X } from 'lucide-react';
import type { CreatePaymentDto, Payment, PaymentFilterParams, ReconcilePaymentDto, RejectPaymentDto } from '../types';
import { paymentService } from '../services/paymentService';
import { propertyService } from '../../properties';
import { reservationService } from '../../reservations';
import type { Property } from '../../properties';
import type { Reservation } from '../../reservations';
import { PaymentFilters } from '../components/PaymentFilters';
import { PaymentList } from '../components/PaymentList';
import { PaymentFormModal } from '../components/PaymentFormModal';
import { PaymentDetailModal } from '../components/PaymentDetailModal';
import { PaymentReconcileModal } from '../components/PaymentReconcileModal';
import { PaymentRejectModal } from '../components/PaymentRejectModal';
import { fromCents, formatMoney, toCents } from '../../../shared/money';

export const PaymentsPage: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filtros
  const [filters, setFilters] = useState<PaymentFilterParams>({
    search: '',
    propiedadId: 'TODAS',
    reservaId: 'TODAS',
    estado: 'TODOS',
  });

  // Modales
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [detailPayment, setDetailPayment] = useState<Payment | null>(null);
  const [reconcilePayment, setReconcilePayment] = useState<Payment | null>(null);
  const [rejectPayment, setRejectPayment] = useState<Payment | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedPayments, fetchedProps, fetchedReservations] = await Promise.all([
        paymentService.getPayments(filters),
        propertyService.getProperties(),
        reservationService.getReservations(),
      ]);
      setPayments(fetchedPayments);
      setProperties(fetchedProps);
      setReservations(fetchedReservations);
    } catch {
      setFeedback({ type: 'error', message: 'Error al cargar los datos financieros.' });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Manejo de filtros
  const handleFilterChange = (newFilters: Partial<PaymentFilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      propiedadId: 'TODAS',
      reservaId: 'TODAS',
      estado: 'TODOS',
    });
  };

  // Acciones
  const handleCreatePayment = async (dto: CreatePaymentDto) => {
    await paymentService.createPayment(dto);
    setFeedback({
      type: 'success',
      message: 'Abono registrado exitosamente en estado PENDIENTE_CONCILIACION.',
    });
    await loadData();
  };

  const handleReconcilePayment = async (id: string, dto?: ReconcilePaymentDto) => {
    await paymentService.reconcilePayment(id, dto);
    setFeedback({
      type: 'success',
      message: `Pago "${id}" conciliado formalmente. El saldo de la reserva ha sido actualizado.`,
    });
    await loadData();
  };

  const handleRejectPayment = async (id: string, dto: RejectPaymentDto) => {
    await paymentService.rejectPayment(id, dto);
    setFeedback({
      type: 'success',
      message: `Pago "${id}" rechazado correctamente. No se computará como ingreso validado.`,
    });
    await loadData();
  };

  // KPIs calculados con precisión
  let totalConciliadoCents = 0;
  let totalPendienteCents = 0;
  let countPendientes = 0;
  let countRechazados = 0;

  for (const p of payments) {
    if (p.estado === 'CONCILIADO') {
      totalConciliadoCents += toCents(p.importe);
    } else if (p.estado === 'PENDIENTE_CONCILIACION') {
      totalPendienteCents += toCents(p.importe);
      countPendientes++;
    } else if (p.estado === 'RECHAZADO') {
      countRechazados++;
    }
  }

  return (
    <div className="w-full space-y-4">
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

        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#162A2C] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-2xs hover:bg-[#183b32] transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Registrar Abono</span>
        </button>
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

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">TOTAL CONCILIADO</span>
            <CheckCircle2 size={15} className="text-emerald-700" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-emerald-900 mt-1">
            {formatMoney(fromCents(totalConciliadoCents), 'PEN')}
          </div>
          <span className="text-[10px] text-stone-500">Ingreso de alquiler validado</span>
        </div>

        <div className="rounded-xl border border-stone-200/90 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">POR CONCILIAR</span>
            <Clock size={15} className="text-amber-700" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-amber-900 mt-1">
            {formatMoney(fromCents(totalPendienteCents), 'PEN')}
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
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreatePayment}
        reservations={reservations}
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
