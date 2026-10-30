import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';
import {
  runNoticeDispatchCycle,
  MockNoticeSender,
} from '../modules/reservations/expirationNoticeService.js';
import { productionExpirationClock } from '../modules/reservations/expirationClock.js';
import { validateResetTarget } from './reset.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export interface DispatcherOptions {
  once?: boolean;
  intervalMs?: number;
  batchSize?: number;
  databaseUrl?: string;
  mock?: boolean;
  enabled?: boolean;
}

let isShuttingDown = false;
let activeCyclePromise: Promise<void> | null = null;
let timer: NodeJS.Timeout | null = null;

// Instancia compartida de MockNoticeSender por proceso para garantizar deduplicación
const globalMockNoticeSender = new MockNoticeSender();

export async function runNoticeDispatcher(options: DispatcherOptions = {}) {
  // Precedencia inequívoca: options.enabled tiene prioridad si se define; si no, process.env
  const isEnabled =
    options.enabled !== undefined
      ? options.enabled
      : process.env.ENABLE_NOTICE_DISPATCHER === 'true';

  if (!isEnabled) {
    console.log(
      '[NOTICE DISPATCHER] Dispatcher desactivado por defecto para protección e integridad outbox. ' +
      'Para ejecutarlo intencionalmente, defina ENABLE_NOTICE_DISPATCHER="true" o pase options.enabled = true.'
    );
    return;
  }

  const isMock = options.mock ?? process.argv.includes('--mock');
  if (!isMock) {
    console.log(
      '[NOTICE DISPATCHER] Sin adaptador de mensajería configurado. En este incremento solo se admite --mock. ' +
      'Saliendo sin abrir conexiones ni reclamar avisos.'
    );
    return;
  }

  // Validación estricta de entorno test para --mock (no contaminar daplace_dev ni bases remotas)
  const databaseUrl = options.databaseUrl || process.env.DATABASE_TEST_URL;
  if (!databaseUrl) {
    throw new Error(
      '[NOTICE DISPATCHER] CONFIGURACIÓN INSEGURA ABORTADA: El adaptador --mock exige DATABASE_TEST_URL y no puede ejecutarse sin base de datos de test.'
    );
  }

  // Valida que el host sea local y que la base sea exactamente "daplace_test"
  validateResetTarget(databaseUrl, 'test', true);

  const { prisma, close } = createDatabase(databaseUrl);
  const once = options.once || process.argv.includes('--once');
  const batchSize = options.batchSize || 20;

  let intervalMs = options.intervalMs || 30000;
  const intervalArg = process.argv.find((arg) => arg.startsWith('--interval='));
  if (intervalArg) {
    const val = parseInt(intervalArg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      intervalMs = val;
    }
  }

  console.log(
    `[NOTICE DISPATCHER] Iniciando despachador outbox en modo ${once ? 'ONCE' : `PERIÓDICO (cada ${intervalMs}ms)`} con MockNoticeSender...`
  );

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('[NOTICE DISPATCHER] Señal de terminación recibida. Esperando ciclo activo...');

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (activeCyclePromise) {
      try {
        await activeCyclePromise;
      } catch {
        // Ignorar error del ciclo durante shutdown
      }
    }

    console.log('[NOTICE DISPATCHER] Cerrando conexiones de base de datos...');
    try {
      await close();
    } catch {
      // Ignorar error al desconectar en shutdown
    }
    console.log('[NOTICE DISPATCHER] Despachador outbox finalizado.');
  };

  const handleSignal = () => {
    void shutdown().then(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  const executeCycle = async () => {
    if (isShuttingDown) return;
    if (activeCyclePromise) return activeCyclePromise;

    let currentPromise: Promise<void> | null = null;
    currentPromise = (async () => {
      try {
        const report = await runNoticeDispatchCycle(prisma, {
          adapter: globalMockNoticeSender,
          batchSize,
          clock: productionExpirationClock,
          enabled: true,
        });

        if (report.claimedCount > 0) {
          console.log(
            `[NOTICE DISPATCHER] Ciclo completado: ${report.sentCount} enviados, ` +
            `${report.failedCount} fallidos, ${report.cancelledCount} cancelados, ` +
            `${report.lostLeaseCount} leases perdidos de ${report.claimedCount} reclamados.`
          );
        }
      } catch (err: any) {
        console.error('[NOTICE DISPATCHER] Error durante el ciclo de despacho:', err?.message || err);
      } finally {
        if (activeCyclePromise === currentPromise) {
          activeCyclePromise = null;
        }
      }
    })();

    activeCyclePromise = currentPromise;
    return currentPromise;
  };

  const initialCycle = executeCycle();
  if (initialCycle) await initialCycle;

  if (once) {
    await shutdown();
    return;
  }

  timer = setInterval(() => {
    if (isShuttingDown) {
      if (timer) clearInterval(timer);
      return;
    }
    void executeCycle();
  }, intervalMs);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const once = process.argv.includes('--once');
  const mock = process.argv.includes('--mock');
  void runNoticeDispatcher({ once, mock }).catch((err) => {
    console.error('[NOTICE DISPATCHER FATAL]', err?.message || err);
    process.exit(1);
  });
}
