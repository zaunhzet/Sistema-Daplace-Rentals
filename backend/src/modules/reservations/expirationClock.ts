export interface ExpirationClock {
  now(txOrPrisma?: any): Promise<Date>;
}

/**
 * Reloj de producción:
 * Consulta el instante exacto del motor PostgreSQL mediante clock_timestamp()
 * inmediatamente después de que se hayan adquirido los bloqueos FOR UPDATE.
 */
export const productionExpirationClock: ExpirationClock = {
  async now(txOrPrisma?: any): Promise<Date> {
    if (!txOrPrisma || typeof txOrPrisma.$queryRaw !== 'function') {
      throw new Error(
        'FATAL_DATABASE_CLOCK_UNAVAILABLE: Se requiere una conexión o transacción de Prisma válida para obtener clock_timestamp().'
      );
    }
    const rows = await txOrPrisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() as now`;
    if (!rows || rows.length === 0 || !rows[0].now) {
      throw new Error(
        'FATAL_DATABASE_CLOCK_UNAVAILABLE: PostgreSQL no devolvió un timestamp válido para clock_timestamp().'
      );
    }
    return new Date(rows[0].now);
  },
};

export interface SyntheticClock extends ExpirationClock {
  set(newDate: Date | string | number): void;
  advance(ms: number): void;
  get(): Date;
}

/**
 * Reloj sintético inyectable exclusivamente para pruebas determinísticas de tiempo.
 */
export function createSyntheticClock(initial: Date | string | number = new Date()): SyntheticClock {
  let current = new Date(initial);
  return {
    async now(): Promise<Date> {
      return new Date(current.getTime());
    },
    set(newDate: Date | string | number) {
      current = new Date(newDate);
    },
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
    get(): Date {
      return new Date(current.getTime());
    },
  };
}
