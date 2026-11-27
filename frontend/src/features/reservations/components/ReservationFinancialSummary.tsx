import { useEffect, useState, type ReactNode } from 'react';
import { financialReadService } from '../../payments/services/financialReadService';
import type { ReservationFinancialSummary as Summary } from '../../payments/types';
import { formatMoney } from '../../../shared/money';

type SummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: Summary };

export function ReservationFinancialSummary({
  reservationId,
  action,
}: {
  reservationId: string;
  action?: ReactNode;
}) {
  const [state, setState] = useState<SummaryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    financialReadService.getReservationSummary(reservationId)
      .then((summary) => {
        if (active) {
          setState(summary.reservaId === reservationId
            ? { status: 'ready', summary }
            : { status: 'error' });
        }
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });

    return () => { active = false; };
  }, [reservationId, attempt]);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5" aria-label="Resumen de pagos">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Resumen de pagos
        </h3>
        {action}
      </div>
      {state.status === 'loading' && (
        <p role="status" className="text-sm text-stone-600">Consultando pagos…</p>
      )}
      {state.status === 'error' && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
          <p role="status">No se pudo consultar el resumen de pagos.</p>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setState({ status: 'loading' });
              setAttempt((previous) => previous + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-stone-600">Pagos conciliados</dt>
              <dd className="font-semibold">{formatMoney(state.summary.totalPagosConciliados, state.summary.moneda)}</dd>
            </div>
            <div>
              <dt className="text-stone-600">Pagos por conciliar</dt>
              <dd className="font-semibold">{formatMoney(state.summary.totalPagosPendientes, state.summary.moneda)}</dd>
            </div>
            <div>
              <dt className="text-stone-600">Saldo pendiente</dt>
              <dd className="font-semibold">{formatMoney(state.summary.saldoPendiente, state.summary.moneda)}</dd>
            </div>
          </dl>
          {state.summary.tieneSobrepago && state.summary.montoSobrepago && (
            <p className="mt-3 text-sm text-amber-800">
              Sobrepago de {formatMoney(state.summary.montoSobrepago, state.summary.moneda)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
