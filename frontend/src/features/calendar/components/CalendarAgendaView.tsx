import React from 'react';
import { Link } from 'react-router';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ClipboardList,
  Clock,
  Loader2,
  RefreshCw,
  User,
  Wrench,
} from 'lucide-react';
import type {
  CalendarAgendaData,
  CalendarAgendaItem,
  CalendarAgendaOpenOrder,
} from '../types';
import { formatDisplayDate, formatTimeHHmm } from '../../../shared/utils/stayFormatters';

interface CalendarAgendaViewProps {
  fecha: string;
  data: CalendarAgendaData | null;
  loading: boolean;
  error: string | null;
  loadingReservationId?: string | null;
  canInspectCheckout?: boolean;
  onRetry: () => void;
  onSelectReservationId: (reservaId: string) => void;
}

const STATUS_BADGE_STYLES: Record<CalendarAgendaItem['estado'], string> = {
  SOLICITADA: 'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMADA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  COMPLETADA: 'bg-stone-100 text-stone-700 border-stone-200',
};

const ORDER_STATUS_STYLES: Record<CalendarAgendaOpenOrder['estado'], string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800 border-amber-200',
  EN_PROGRESO: 'bg-blue-100 text-blue-800 border-blue-200',
};

const ORDER_STATUS_LABELS: Record<CalendarAgendaOpenOrder['estado'], string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
};

const ORDER_PRIORITY_STYLES: Record<CalendarAgendaOpenOrder['prioridad'], string> = {
  URGENTE: 'bg-rose-100 text-rose-800 border-rose-200',
  ALTA: 'bg-orange-100 text-orange-800 border-orange-200',
  MEDIA: 'bg-stone-100 text-stone-700 border-stone-200',
  BAJA: 'bg-stone-50 text-stone-500 border-stone-200',
};

interface AgendaSectionProps {
  title: string;
  items: CalendarAgendaItem[];
  emptyMessage: string;
  icon: React.ReactNode;
  accentClass: string;
  loadingReservationId?: string | null;
  showInspectCheckoutAction?: boolean;
  onSelectReservationId: (reservaId: string) => void;
}

const AgendaSection: React.FC<AgendaSectionProps> = ({
  title,
  items,
  emptyMessage,
  icon,
  accentClass,
  loadingReservationId,
  showInspectCheckoutAction = false,
  onSelectReservationId,
}) => {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white shadow-2xs overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-200/80 bg-stone-50/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`grid size-7 place-items-center rounded-lg ${accentClass}`}>
            {icon}
          </span>
          <h2 className="text-sm sm:text-base font-bold text-stone-900">{title}</h2>
        </div>
        <span className="rounded-full bg-stone-200/70 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs sm:text-sm text-stone-500">
          {emptyMessage}
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {items.map((item) => {
            const isResolving = loadingReservationId === item.reservaId;
            const timeLabel = formatTimeHHmm(item.hora, 'Sin hora registrada');
            const hasTime = Boolean(item.hora && item.hora.trim() !== '');

            return (
              <li
                key={`${title}-${item.reservaId}`}
                className="px-4 py-3 hover:bg-stone-50 transition-colors flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  type="button"
                  onClick={() => onSelectReservationId(item.reservaId)}
                  disabled={isResolving}
                  className="flex-1 min-w-0 text-left flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between cursor-pointer disabled:opacity-60"
                >
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                          hasTime
                            ? 'bg-stone-100 text-stone-900 font-mono'
                            : 'bg-stone-50 text-stone-500 italic'
                        }`}
                      >
                        <Clock size={12} aria-hidden="true" />
                        {timeLabel}
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-stone-900 truncate">
                        <Building2 size={14} className="shrink-0 text-stone-400" aria-hidden="true" />
                        <span className="truncate">{item.propiedadNombre}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
                      <span className="inline-flex items-center gap-1 font-medium text-stone-800">
                        <User size={13} className="shrink-0 text-stone-400" aria-hidden="true" />
                        {item.huespedNombre}
                      </span>
                      <span className="font-mono text-[11px] text-stone-500">
                        {item.codigo || item.reservaId}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    {isResolving && (
                      <Loader2
                        size={14}
                        className="animate-spin text-stone-500"
                        aria-label="Cargando detalle de reserva"
                      />
                    )}
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
                        STATUS_BADGE_STYLES[item.estado]
                      }`}
                    >
                      {item.estado}
                    </span>
                  </div>
                </button>

                {showInspectCheckoutAction && item.estado === 'CONFIRMADA' && (
                  <Link
                    to="/mantenimiento"
                    state={{ inspectCheckoutReservationId: item.reservaId }}
                    className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors shrink-0 self-start sm:self-center"
                  >
                    Iniciar inspección
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export const CalendarAgendaView: React.FC<CalendarAgendaViewProps> = ({
  fecha,
  data,
  loading,
  error,
  loadingReservationId,
  canInspectCheckout = false,
  onRetry,
  onSelectReservationId,
}) => {
  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center shadow-2xs">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-stone-600">
          <Loader2 size={18} className="animate-spin text-[#183b32]" aria-hidden="true" />
          <span>Cargando agenda del {formatDisplayDate(fecha)}...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-6 text-center shadow-2xs space-y-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-red-900">
          <AlertCircle size={18} className="shrink-0 text-red-700" aria-hidden="true" />
          <span>{error}</span>
        </div>
        <div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const llegadas = data?.llegadas ?? [];
  const salidas = data?.salidas ?? [];
  const mantenimiento = data?.mantenimiento ?? null;
  const propiedadesEnMantenimiento = mantenimiento?.propiedadesEnMantenimiento ?? [];
  const ordenesAbiertas = mantenimiento?.ordenesAbiertas ?? [];

  return (
    <div className="space-y-4">
      {llegadas.length === 0 && salidas.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center shadow-2xs space-y-1">
          <p className="text-sm font-semibold text-stone-800">
            Sin llegadas ni salidas programadas
          </p>
          <p className="text-xs text-stone-500">
            No hay movimientos registrados para el {formatDisplayDate(fecha)}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AgendaSection
            title="Llegadas"
            items={llegadas}
            emptyMessage="No hay llegadas programadas para esta fecha."
            icon={<ArrowDownLeft size={16} aria-hidden="true" />}
            accentClass="bg-emerald-100 text-emerald-800"
            loadingReservationId={loadingReservationId}
            onSelectReservationId={onSelectReservationId}
          />

          <AgendaSection
            title="Salidas"
            items={salidas}
            emptyMessage="No hay salidas programadas para esta fecha."
            icon={<ArrowUpRight size={16} aria-hidden="true" />}
            accentClass="bg-amber-100 text-amber-800"
            loadingReservationId={loadingReservationId}
            showInspectCheckoutAction={canInspectCheckout}
            onSelectReservationId={onSelectReservationId}
          />
        </div>
      )}

      {mantenimiento && (
        <section
          className="rounded-2xl border border-stone-200 bg-white shadow-2xs overflow-hidden"
          aria-label="Mantenimiento abierto"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200/80 bg-stone-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-amber-100 text-amber-800">
                <Wrench size={15} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-stone-900">
                  Mantenimiento abierto
                </h2>
                <p className="text-[11px] text-stone-500">
                  Estado operativo actual (aplica el filtro de propiedad seleccionado; no depende de la fecha).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-600">
              <span className="rounded-full bg-stone-200/70 px-2.5 py-0.5">
                {propiedadesEnMantenimiento.length} prop.
              </span>
              <span className="rounded-full bg-stone-200/70 px-2.5 py-0.5">
                {ordenesAbiertas.length} órdenes
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-stone-200/80">
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                  <Building2 size={14} className="text-amber-700" aria-hidden="true" />
                  Propiedades en mantenimiento
                </h3>
                <span className="text-xs font-semibold text-stone-500">
                  {propiedadesEnMantenimiento.length}
                </span>
              </div>

              {propiedadesEnMantenimiento.length === 0 ? (
                <p className="text-xs text-stone-500 py-2">
                  No hay propiedades en mantenimiento para el filtro actual.
                </p>
              ) : (
                <ul className="space-y-2">
                  {propiedadesEnMantenimiento.map((prop) => (
                    <li
                      key={prop.propiedadId}
                      className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-stone-900 truncate">
                        {prop.propiedadNombre}
                      </span>
                      <span className="shrink-0 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        EN_MANTENIMIENTO
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                  <ClipboardList size={14} className="text-stone-600" aria-hidden="true" />
                  Órdenes abiertas
                </h3>
                <span className="text-xs font-semibold text-stone-500">
                  {ordenesAbiertas.length}
                </span>
              </div>

              {ordenesAbiertas.length === 0 ? (
                <p className="text-xs text-stone-500 py-2">
                  No hay órdenes pendientes ni en progreso para el filtro actual.
                </p>
              ) : (
                <ul className="space-y-2">
                  {ordenesAbiertas.map((order) => (
                    <li
                      key={order.ordenId}
                      className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-stone-200 bg-stone-50/50 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 truncate">{order.titulo}</p>
                        <p className="text-[11px] text-stone-600 truncate">
                          {order.propiedadNombre}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                            ORDER_PRIORITY_STYLES[order.prioridad]
                          }`}
                        >
                          {order.prioridad}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                            ORDER_STATUS_STYLES[order.estado]
                          }`}
                        >
                          {ORDER_STATUS_LABELS[order.estado]}
                        </span>
                        <Link
                          to={`/mantenimiento?${new URLSearchParams({ ordenId: order.ordenId }).toString()}`}
                          className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100 transition-colors"
                        >
                          Abrir orden
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
