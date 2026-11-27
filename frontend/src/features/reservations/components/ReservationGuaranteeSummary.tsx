import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { guaranteeService } from '../../guarantees/services/guaranteeService';
import type { EstadoGarantia, Guarantee } from '../../guarantees/types';
import { formatMoney } from '../../../shared/money';

type GuaranteeSummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; guarantee: Guarantee };

const GUARANTEE_STATUS_LABELS: Record<EstadoGarantia, string> = {
  EN_CUSTODIA: 'En Custodia',
  PARCIALMENTE_RETENIDA: 'Parcialmente Retenida',
  DEVUELTA_TOTAL: 'Devuelta Total',
  RETENIDA_TOTAL: 'Retenida Total',
  LIQUIDADA_MIXTA: 'Liquidada Mixta',
};

const GUARANTEE_STATUS_CLASSES: Record<EstadoGarantia, string> = {
  EN_CUSTODIA: 'bg-emerald-100 text-emerald-800',
  PARCIALMENTE_RETENIDA: 'bg-amber-100 text-amber-800',
  DEVUELTA_TOTAL: 'bg-stone-100 text-stone-700',
  RETENIDA_TOTAL: 'bg-rose-100 text-rose-800',
  LIQUIDADA_MIXTA: 'bg-purple-100 text-purple-800',
};

export function ReservationGuaranteeSummary({
  reservationId,
  onNavigate,
}: {
  reservationId: string;
  onNavigate?: () => void;
}) {
  const [state, setState] = useState<GuaranteeSummaryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    let active = true;
    const seq = ++requestSeqRef.current;
    setState({ status: 'loading' });

    guaranteeService
      .getGuaranteeByReservationId(reservationId)
      .then((guarantee) => {
        if (!active || seq !== requestSeqRef.current) return;
        if (!guarantee) {
          setState({ status: 'empty' });
          return;
        }
        setState(
          guarantee.reservaId === reservationId
            ? { status: 'ready', guarantee }
            : { status: 'error' }
        );
      })
      .catch(() => {
        if (!active || seq !== requestSeqRef.current) return;
        setState({ status: 'error' });
      });

    return () => {
      active = false;
      requestSeqRef.current += 1;
    };
  }, [reservationId, attempt]);

  const movementsUrl = `/garantias?${new URLSearchParams({ reservaId: reservationId }).toString()}`;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5" aria-label="Garantía">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Garantía
        </h3>
        {state.status === 'ready' && (
          <Link
            to={movementsUrl}
            onClick={onNavigate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
          >
            <span>Ver movimientos</span>
          </Link>
        )}
      </div>

      {state.status === 'loading' && (
        <p role="status" className="text-sm text-stone-600">
          Consultando garantía…
        </p>
      )}

      {state.status === 'error' && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
          <p role="status">No se pudo consultar la garantía.</p>
          <button
            type="button"
            className="font-semibold underline cursor-pointer"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((previous) => previous + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {state.status === 'empty' && (
        <p className="text-sm text-stone-600">Sin garantía registrada para esta reserva.</p>
      )}

      {state.status === 'ready' && (
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-stone-600">Estado</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  GUARANTEE_STATUS_CLASSES[state.guarantee.estado]
                }`}
              >
                {GUARANTEE_STATUS_LABELS[state.guarantee.estado]}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-stone-600">Importe recibido</dt>
            <dd className="font-semibold">
              {formatMoney(state.guarantee.importeRecibido, state.guarantee.moneda)}
            </dd>
          </div>
          <div>
            <dt className="text-stone-600">Saldo disponible</dt>
            <dd className="font-semibold">
              {formatMoney(state.guarantee.saldoDisponible, state.guarantee.moneda)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
