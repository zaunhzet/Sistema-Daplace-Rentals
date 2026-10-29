import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldCheck, ShieldAlert, RotateCcw } from 'lucide-react';
import type { CreateGuaranteeDto, Guarantee, GuaranteeFilterParams, RegisterGuaranteeMovementDto } from '../types';
import { guaranteeService } from '../services/guaranteeService';
import { propertyService } from '../../properties';
import { reservationService } from '../../reservations';
import type { Property } from '../../properties';
import type { Reservation } from '../../reservations';
import { GuaranteeFilters } from '../components/GuaranteeFilters';
import { GuaranteeList } from '../components/GuaranteeList';
import { GuaranteeFormModal } from '../components/GuaranteeFormModal';
import { GuaranteeDetailModal } from '../components/GuaranteeDetailModal';
import { GuaranteeMovementModal } from '../components/GuaranteeMovementModal';
import { fromCents, formatMoney, toCents } from '../../../shared/money';

export const GuaranteesPage: React.FC = () => {
  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filtros
  const [filters, setFilters] = useState<GuaranteeFilterParams>({
    search: '',
    propiedadId: 'TODAS',
    reservaId: 'TODAS',
    estado: 'TODOS',
  });

  // Modales
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [detailGuarantee, setDetailGuarantee] = useState<Guarantee | null>(null);
  const [movementGuarantee, setMovementGuarantee] = useState<Guarantee | null>(null);
  const [movementDefaultType, setMovementDefaultType] = useState<
    'RETENCION' | 'DEVOLUCION_TOTAL' | 'DEVOLUCION_PARCIAL'
  >('DEVOLUCION_TOTAL');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedGuarantees, fetchedProps, fetchedReservations] = await Promise.all([
        guaranteeService.getGuarantees(filters),
        propertyService.getProperties(),
        reservationService.getReservations(),
      ]);
      setGuarantees(fetchedGuarantees);
      setProperties(fetchedProps);
      setReservations(fetchedReservations);
    } catch {
      setFeedback({ type: 'error', message: 'Error al cargar el módulo de garantías.' });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFilterChange = (newFilters: Partial<GuaranteeFilterParams>) => {
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

  const handleCreateGuarantee = async (dto: CreateGuaranteeDto) => {
    await guaranteeService.createGuarantee(dto);
    setFeedback({
      type: 'success',
      message: 'Garantía registrada en custodia con su movimiento inicial de RECEPCIÓN.',
    });
    await loadData();
  };

  const handleRegisterMovement = async (
    garantiaId: string,
    dto: RegisterGuaranteeMovementDto
  ) => {
    await guaranteeService.registerMovement(garantiaId, dto);
    setFeedback({
      type: 'success',
      message: `Movimiento de ${dto.tipo} registrado exitosamente. Saldo disponible recalculado.`,
    });
    await loadData();
  };

  const handleOpenMovement = (
    guarantee: Guarantee,
    type: 'RETENCION' | 'DEVOLUCION_TOTAL' | 'DEVOLUCION_PARCIAL'
  ) => {
    setMovementGuarantee(guarantee);
    setMovementDefaultType(type);
  };

  // KPIs de garantías
  let totalCustodiaCents = 0;
  let totalRetenidoCents = 0;
  let totalDevueltoCents = 0;
  let countActivas = 0;

  for (const g of guarantees) {
    totalCustodiaCents += toCents(g.saldoDisponible);
    totalRetenidoCents += toCents(g.totalRetenido);
    totalDevueltoCents += toCents(g.totalDevuelto);
    if (toCents(g.saldoDisponible) > 0) {
      countActivas++;
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#5E6C5B]">
            FINANZAS / MÓDULO HU-06 & RF06
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 mt-1">
            Control de Garantías
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
            Custodia separada de depósitos, libro inmutable de retenciones por daños y reembolsos a huéspedes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#162A2C] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#183b32] transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Recibir Garantía</span>
        </button>
      </div>

      {/* Alerta de feedback */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-2xl border p-4 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-stone-500 hover:text-stone-800 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner de regla contable */}
      <div className="rounded-2xl border border-stone-200 bg-stone-100/70 p-4 text-xs text-stone-700 flex items-start gap-3">
        <ShieldCheck size={18} className="text-[#5E6C5B] shrink-0 mt-0.5" />
        <div className="leading-5">
          <strong className="text-stone-900 font-semibold">Fondos en Custodia Independiente:</strong> Las garantías
          recibidas <strong>nunca</strong> constituyen ingresos por alquiler. Cada retención o devolución se registra
          como un movimiento positivo inmutable cuyo saldo disponible no puede ser sobregirado. Las devoluciones por
          cancelación de reserva se gestionan bajo política explícita pendiente de definición institucional.
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">SALDO EN CUSTODIA</span>
            <ShieldCheck size={16} className="text-[#183b32]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#183b32] mt-2">
            {formatMoney(fromCents(totalCustodiaCents), 'PEN')}
          </div>
          <span className="text-[11px] text-stone-500">{countActivas} depósitos con saldo activo</span>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">RETENIDO POR DAÑOS</span>
            <ShieldAlert size={16} className="text-amber-700" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-900 mt-2">
            {formatMoney(fromCents(totalRetenidoCents), 'PEN')}
          </div>
          <span className="text-[11px] text-amber-800">Deducciones documentadas</span>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">TOTAL DEVUELTO</span>
            <RotateCcw size={16} className="text-stone-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-stone-800 mt-2">
            {formatMoney(fromCents(totalDevueltoCents), 'PEN')}
          </div>
          <span className="text-[11px] text-stone-500">Reembolsos ejecutados</span>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">TOTAL EXPEDIENTES</span>
            <span className="text-xs font-mono font-semibold text-stone-400">Total</span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900 mt-2">{guarantees.length}</div>
          <span className="text-[11px] text-stone-500">Garantías bajo control</span>
        </div>
      </div>

      {/* Filtros */}
      <GuaranteeFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        properties={properties}
        reservations={reservations}
        onReset={handleResetFilters}
      />

      {/* Listado */}
      {loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-xs text-stone-500">
          Cargando libro de garantías...
        </div>
      ) : (
        <GuaranteeList
          guarantees={guarantees}
          onSelectGuarantee={(g) => setDetailGuarantee(g)}
          onOpenMovement={handleOpenMovement}
        />
      )}

      {/* Modales */}
      <GuaranteeFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateGuarantee}
        reservations={reservations}
      />

      <GuaranteeDetailModal
        guarantee={detailGuarantee}
        isOpen={Boolean(detailGuarantee)}
        onClose={() => setDetailGuarantee(null)}
        onOpenMovement={handleOpenMovement}
      />

      <GuaranteeMovementModal
        guarantee={movementGuarantee}
        isOpen={Boolean(movementGuarantee)}
        onClose={() => setMovementGuarantee(null)}
        onSubmit={handleRegisterMovement}
        defaultType={movementDefaultType}
      />
    </div>
  );
};
