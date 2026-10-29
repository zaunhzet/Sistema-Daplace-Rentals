import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldCheck, ShieldAlert, RotateCcw, X } from 'lucide-react';
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
    <div className="w-full space-y-4">
      {/* Aviso de Modo Simulado / Mock */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[11px] uppercase tracking-wide">
            Modo Simulado (Mock)
          </span>
          <span>
            Este módulo opera temporalmente con fondos en custodia simulados. Se conectará al backend transaccional en el incremento BACKEND-002.
          </span>
        </div>
      </div>

      {/* Cabecera */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Control de Garantías
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Custodia separada de depósitos, libro inmutable de retenciones por daños y reembolsos a huéspedes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#183b32] px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-[#122e27] transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus size={15} />
          <span>Recibir Garantía</span>
        </button>
      </div>

      {/* Alerta de feedback */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border p-3 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-stone-500 hover:text-stone-800 ml-4 p-1 rounded-md"
            aria-label="Cerrar notificación"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Banner de regla contable */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-xs text-stone-600 flex items-start gap-2.5">
        <ShieldCheck size={16} className="text-[#183b32] shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-stone-800 font-semibold">Fondos en Custodia Independiente:</strong> Las garantías
          recibidas no constituyen ingresos por alquiler. Cada retención o devolución se registra
          como un movimiento inmutable cuyo saldo disponible no puede ser sobregirado.
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Saldo en custodia</span>
            <ShieldCheck size={15} className="text-[#183b32]" />
          </div>
          <div className="text-xl font-bold font-mono text-[#183b32] mt-1.5">
            {formatMoney(fromCents(totalCustodiaCents), 'PEN')}
          </div>
          <span className="text-[11px] text-stone-500">{countActivas} depósitos activos</span>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Retenido por daños</span>
            <ShieldAlert size={15} className="text-amber-700" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-900 mt-1.5">
            {formatMoney(fromCents(totalRetenidoCents), 'PEN')}
          </div>
          <span className="text-[11px] text-amber-700">Deducciones documentadas</span>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Total devuelto</span>
            <RotateCcw size={15} className="text-stone-600" />
          </div>
          <div className="text-xl font-bold font-mono text-stone-800 mt-1.5">
            {formatMoney(fromCents(totalDevueltoCents), 'PEN')}
          </div>
          <span className="text-[11px] text-stone-500">Reembolsos ejecutados</span>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Total expedientes</span>
            <span className="text-xs font-mono font-semibold text-stone-400">Total</span>
          </div>
          <div className="text-xl font-bold font-mono text-stone-900 mt-1.5">{guarantees.length}</div>
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
