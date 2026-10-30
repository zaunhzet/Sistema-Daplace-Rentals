import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';
import { expireDueBatch } from '../modules/reservations/expirationService.js';
import { productionExpirationClock } from '../modules/reservations/expirationClock.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export interface WorkerOptions {
  once?: boolean;
  intervalMs?: number;
  batchSize?: number;
  databaseUrl?: string;
  force?: boolean;
}

export interface WorkerCoordinatorDeps {
  executeBatch: () => Promise<any>;
  close: () => Promise<void>;
  intervalMs?: number;
}

export function createExpirationWorkerCoordinator(deps: WorkerCoordinatorDeps) {
  let isShuttingDown = false;
  let activeCyclePromise: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let closeCallCount = 0;
  let cycleExecutionCount = 0;

  const executeCycle = (): Promise<void> | null => {
    if (isShuttingDown) return null;
    if (activeCyclePromise) return activeCyclePromise;

    let currentPromise: Promise<void> | null = null;
    currentPromise = (async () => {
      cycleExecutionCount++;
      try {
        await deps.executeBatch();
      } catch (err: any) {
        console.error('[EXPIRATION WORKER] Error durante el ciclo de expiración:', err?.message || err);
      } finally {
        if (activeCyclePromise === currentPromise) {
          activeCyclePromise = null;
        }
      }
    })();

    activeCyclePromise = currentPromise;
    return currentPromise;
  };

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

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

    closeCallCount++;
    try {
      await deps.close();
    } catch {
      // Ignorar error de cierre
    }
  };

  const start = () => {
    if (deps.intervalMs && deps.intervalMs > 0) {
      timer = setInterval(() => {
        if (isShuttingDown) {
          if (timer) clearInterval(timer);
          return;
        }
        void executeCycle();
      }, deps.intervalMs);
    }
  };

  return {
    executeCycle,
    shutdown,
    start,
    getActiveCyclePromise: () => activeCyclePromise,
    getIsShuttingDown: () => isShuttingDown,
    getCloseCallCount: () => closeCallCount,
    getCycleExecutionCount: () => cycleExecutionCount,
    getTimer: () => timer,
  };
}

export async function runExpirationWorker(options: WorkerOptions = {}) {
  const isEnabled = process.env.ENABLE_EXPIRATION_WORKER === 'true' || options.force === true;

  if (!isEnabled) {
    console.log(
      '[EXPIRATION WORKER] Worker desactivado por defecto para protección de datos e inmunidad financiera. ' +
      'Para ejecutarlo intencionalmente, defina ENABLE_EXPIRATION_WORKER="true" o pase el flag --force.'
    );
    return;
  }

  if (options.force && process.env.ENABLE_EXPIRATION_WORKER !== 'true') {
    console.warn(
      '[EXPIRATION WORKER WARNING] Ejecutando forzadamente vía flag --force. ' +
      'Asegúrese de que el entorno y la base de datos de destino sean los autorizados.'
    );
  }

  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('[EXPIRATION WORKER] Error: DATABASE_URL no está definida.');
  }

  const { prisma, close } = createDatabase(databaseUrl);
  const once = options.once || process.argv.includes('--once');
  const batchSize = options.batchSize || 50;

  // Extraer intervalo si se proporcionó --interval=NNNN
  let intervalMs = options.intervalMs || 30000;
  const intervalArg = process.argv.find((arg) => arg.startsWith('--interval='));
  if (intervalArg) {
    const val = parseInt(intervalArg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      intervalMs = val;
    }
  }

  console.log(
    `[EXPIRATION WORKER] Iniciando worker de expiración en modo ${once ? 'ONCE' : `PERIÓDICO (cada ${intervalMs}ms)`}...`
  );

  const coordinator = createExpirationWorkerCoordinator({
    executeBatch: async () => {
      const report = await expireDueBatch(prisma, {
        batchSize,
        clock: productionExpirationClock,
        context: {
          actor: 'WORKER_CLI',
          motivo: 'Ciclo periódico de expiración automática de reservas.',
        },
      });

      if (report.totalCandidates > 0) {
        console.log(
          `[EXPIRATION WORKER] Ciclo completado: ${report.expiredCount} expiradas, ` +
          `${report.skippedCount} omitidas, ${report.failedCount} fallidas de ${report.totalCandidates} candidatas.`
        );
      }
      return report;
    },
    close: async () => {
      await close();
    },
    intervalMs,
  });

  const handleSignal = () => {
    void coordinator.shutdown().then(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  const initialCycle = coordinator.executeCycle();
  if (initialCycle) await initialCycle;

  if (once) {
    await coordinator.shutdown();
    return;
  }

  coordinator.start();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  const once = process.argv.includes('--once');
  runExpirationWorker({ force, once }).catch((err) => {
    console.error('[EXPIRATION WORKER FATAL]', err);
    process.exit(1);
  });
}
