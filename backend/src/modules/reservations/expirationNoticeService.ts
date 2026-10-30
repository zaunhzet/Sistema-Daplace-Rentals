import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { PrismaTxClient } from '../../shared/audit.js';
import { productionExpirationClock, type ExpirationClock } from './expirationClock.js';

export type TipoAvisoReserva = 'EXPIRACION_PROXIMA' | 'SOLICITUD_EXPIRADA';
export type EstadoAvisoReserva = 'PROGRAMADO' | 'PENDIENTE' | 'EN_ENVIO' | 'ENVIADO' | 'FALLIDO' | 'CANCELADO';
export type CanalAvisoReserva = 'EMAIL' | 'WHATSAPP' | 'SISTEMA';

export interface ScheduleNoticeParams {
  reservaId: string;
  tipoAviso: TipoAvisoReserva;
  politicaVersion: string;
  venceEnSnapshot: Date;
  programadoPara: Date;
  canal: CanalAvisoReserva;
  plantilla: string;
  idempotencyKey?: string;
}

export interface NoticeSendResult {
  success: boolean;
  proveedorId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface NoticeSenderAdapter {
  send(notice: {
    id: string;
    reservaId: string;
    tipoAviso: TipoAvisoReserva;
    canal: CanalAvisoReserva;
    plantilla: string;
    venceEnSnapshot: Date;
  }): Promise<NoticeSendResult>;
}

/**
 * Adaptador falso (Mock) para pruebas unitarias e integración en DR-03.
 * NUNCA envía mensajes reales ni utiliza credenciales externas.
 * Garantiza deduplicación idempotente por identificador de aviso lógico.
 */
export class MockNoticeSender implements NoticeSenderAdapter {
  public sentNotices: Array<any> = [];
  public shouldFail = false;
  public failureCode = 'SIMULATED_MOCK_FAILURE';
  private deduplicationCache = new Map<string, string>();

  async send(notice: {
    id: string;
    reservaId: string;
    tipoAviso: TipoAvisoReserva;
    canal: CanalAvisoReserva;
    plantilla: string;
    venceEnSnapshot: Date;
  }): Promise<NoticeSendResult> {
    if (this.shouldFail) {
      return {
        success: false,
        errorCode: this.failureCode,
        errorMessage: 'Fallo simulado por MockNoticeSender para pruebas.',
      };
    }

    let proveedorId = this.deduplicationCache.get(notice.id);
    if (!proveedorId) {
      proveedorId = `mock-msg-${randomUUID()}`;
      this.deduplicationCache.set(notice.id, proveedorId);
      this.sentNotices.push({ ...notice, proveedorId, timestamp: new Date() });
    }

    return {
      success: true,
      proveedorId,
    };
  }
}

/**
 * Planifica de manera durable un aviso de reserva.
 * Si ya existe un registro con la misma tupla única (reservaId, tipoAviso, politicaVersion, venceEnSnapshot),
 * opera con inserción atómica o resolución de conflicto sin abortar la transacción.
 */
export async function scheduleExpirationNotice(
  tx: PrismaTxClient,
  params: ScheduleNoticeParams
): Promise<{ id: string }> {
  if (!params.canal || !params.plantilla) {
    throw new Error(
      'VALIDATION_ERROR: No se puede planificar un aviso sin canal y plantilla aprobados explícitamente.'
    );
  }

  const id = randomUUID();
  const now = new Date();
  const idempotencyKey =
    params.idempotencyKey || `notice-${params.reservaId}-${params.tipoAviso}-${params.politicaVersion}`;

  // Inserción atómica con ON CONFLICT DO NOTHING
  const inserted = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO "avisos_reserva" (
       "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
       "programadoPara", "canal", "plantilla", "estado", "reintentos", "maxReintentos",
       "idempotencyKey", "creadoEn", "actualizadoEn"
     ) VALUES (
       $1, $2, $3::"TipoAvisoReserva", $4, $5::timestamptz,
       $6::timestamptz, $7::"CanalAvisoReserva", $8, 'PROGRAMADO'::"EstadoAvisoReserva", 0, 3,
       $9, $10::timestamptz, $10::timestamptz
     )
     ON CONFLICT ("reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot") DO NOTHING
     RETURNING "id"`,
    id,
    params.reservaId,
    params.tipoAviso,
    params.politicaVersion,
    params.venceEnSnapshot,
    params.programadoPara,
    params.canal,
    params.plantilla,
    idempotencyKey,
    now
  );

  if (inserted && inserted.length > 0) {
    return { id: inserted[0].id };
  }

  // Si hubo conflicto concurrente, recuperar el ID existente de forma segura
  const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "avisos_reserva"
     WHERE "reservaId" = $1
       AND "tipoAviso" = $2::"TipoAvisoReserva"
       AND "politicaVersion" = $3
       AND "venceEnSnapshot" = $4::timestamptz
     LIMIT 1`,
    params.reservaId,
    params.tipoAviso,
    params.politicaVersion,
    params.venceEnSnapshot
  );

  if (existing && existing.length > 0) {
    return { id: existing[0].id };
  }

  throw new Error('UNEXPECTED_ERROR: No fue posible programar ni recuperar el aviso de reserva.');
}

/**
 * Reclama avisos vencidos para envío mediante un mecanismo de Lease concurrente.
 */
export async function claimDueNotices(
  prisma: PrismaClient,
  options: {
    now: Date;
    leaseDurationMs?: number;
    batchSize?: number;
  }
): Promise<
  Array<{
    id: string;
    reservaId: string;
    tipoAviso: TipoAvisoReserva;
    politicaVersion: string;
    venceEnSnapshot: Date;
    canal: CanalAvisoReserva;
    plantilla: string;
    leaseToken: string;
    reintentos: number;
  }>
> {
  const leaseDurationMs = options.leaseDurationMs || 60000;
  const batchSize = Math.max(1, Math.min(options.batchSize || 10, 100));
  const leaseToken = randomUUID();
  const leaseVenceEn = new Date(options.now.getTime() + leaseDurationMs);

  const claimed = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      reservaId: string;
      tipoAviso: TipoAvisoReserva;
      politicaVersion: string;
      venceEnSnapshot: Date;
      canal: CanalAvisoReserva;
      plantilla: string;
      reintentos: number;
      maxReintentos: number;
    }>
  >(
    `WITH elegibles AS (
       SELECT "id"
       FROM "avisos_reserva"
       WHERE (
         ("estado" = 'PROGRAMADO'::"EstadoAvisoReserva" AND "programadoPara" <= $1::timestamptz)
         OR
         ("estado" = 'PENDIENTE'::"EstadoAvisoReserva" AND ("proximoIntentoEn" IS NULL OR "proximoIntentoEn" <= $1::timestamptz))
         OR
         ("estado" = 'EN_ENVIO'::"EstadoAvisoReserva" AND "leaseVenceEn" IS NOT NULL AND "leaseVenceEn" <= $1::timestamptz)
       )
       AND "reintentos" < "maxReintentos"
       ORDER BY "programadoPara" ASC, "id" ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE "avisos_reserva" a
     SET "estado" = 'EN_ENVIO'::"EstadoAvisoReserva",
         "leaseToken" = $3,
         "leaseVenceEn" = $4::timestamptz,
         "actualizadoEn" = $1::timestamptz
     FROM elegibles
     WHERE a."id" = elegibles."id"
     RETURNING a."id", a."reservaId", a."tipoAviso", a."politicaVersion",
               a."venceEnSnapshot", a."canal", a."plantilla", a."reintentos", a."maxReintentos"`,
    options.now,
    batchSize,
    leaseToken,
    leaseVenceEn
  );

  return claimed.map((c) => ({
    ...c,
    leaseToken,
  }));
}

/**
 * Procesa un aviso reclamado con verificación rigurosa de lease y preflight atómico:
 * 1. Bloqueo ordenado determinístico: reserva -> aviso.
 * 2. Comprobación exhaustiva de ownership de lease y coincidencia de snapshot.
 * 3. Ejecución del envío externo FUERA de la transacción SQL.
 * 4. Persistencia del resultado condicionado atómicamente al leaseToken.
 */
export async function processClaimedNotice(
  prisma: PrismaClient,
  claimedItem: {
    id: string;
    reservaId: string;
    tipoAviso: TipoAvisoReserva;
    politicaVersion?: string;
    canal: CanalAvisoReserva;
    plantilla: string;
    venceEnSnapshot: Date;
    leaseToken: string;
    reintentos: number;
    maxReintentos?: number;
  },
  adapter: NoticeSenderAdapter,
  _now?: Date,
  clock: ExpirationClock = productionExpirationClock
): Promise<{ status: 'ENVIADO' | 'CANCELADO' | 'FALLIDO' | 'LEASE_PERDIDO' }> {
  // 1. Verificación preflight en transacción aislada con orden estricto de bloqueos: reserva -> aviso
  type PreflightDecision =
    | { action: 'PROCEED' }
    | { action: 'ABORT_LOST_LEASE' }
    | { action: 'CANCEL'; motivo: string };

  const preflight: PreflightDecision = await prisma.$transaction(async (tx) => {
    // A. Bloquear reserva primero
    const resRows = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        estado: string;
        venceEn: Date | null;
        politicaPlazoVersion: string | null;
      }>
    >(
      `SELECT "id", "estado", "venceEn", "politicaPlazoVersion" FROM "reservas" WHERE "id" = $1 FOR UPDATE`,
      claimedItem.reservaId
    );

    // B. Bloquear aviso después
    const noticeRows = await tx.$queryRawUnsafe<
      Array<{
        id: string;
        estado: string;
        leaseToken: string | null;
        leaseVenceEn: Date | null;
        tipoAviso: string;
        politicaVersion: string;
        venceEnSnapshot: Date;
      }>
    >(
      `SELECT "id", "estado", "leaseToken", "leaseVenceEn", "tipoAviso", "politicaVersion", "venceEnSnapshot"
       FROM "avisos_reserva"
       WHERE "id" = $1
       FOR UPDATE`,
      claimedItem.id
    );

    if (!noticeRows || noticeRows.length === 0) {
      return { action: 'ABORT_LOST_LEASE' };
    }

    const currentNotice = noticeRows[0];
    const postLockNow = await clock.now(tx);

    // C. Verificar pertenencia y vigencia estricta del lease
    if (
      currentNotice.estado !== 'EN_ENVIO' ||
      currentNotice.leaseToken !== claimedItem.leaseToken ||
      !currentNotice.leaseVenceEn ||
      postLockNow.getTime() >= new Date(currentNotice.leaseVenceEn).getTime()
    ) {
      return { action: 'ABORT_LOST_LEASE' };
    }

    // D. Verificar existencia de la reserva
    if (!resRows || resRows.length === 0) {
      await tx.$executeRawUnsafe(
        `UPDATE "avisos_reserva"
         SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
             "canceladoEn" = $2::timestamptz,
             "motivoCancelacion" = 'RESERVA_INEXISTENTE',
             "leaseToken" = NULL,
             "leaseVenceEn" = NULL,
             "actualizadoEn" = $2::timestamptz
         WHERE "id" = $1 AND "leaseToken" = $3`,
        claimedItem.id,
        postLockNow,
        claimedItem.leaseToken
      );
      return { action: 'CANCEL', motivo: 'RESERVA_INEXISTENTE' };
    }

    const res = resRows[0];

    // E. Comprobar coherencia de snapshot y versión de política
    if (
      (claimedItem.politicaVersion && res.politicaPlazoVersion && claimedItem.politicaVersion !== res.politicaPlazoVersion) ||
      (res.venceEn && new Date(res.venceEn).getTime() !== new Date(claimedItem.venceEnSnapshot).getTime())
    ) {
      const motivo = 'SNAPSHOT_O_VERSION_DESACTUALIZADA';
      await tx.$executeRawUnsafe(
        `UPDATE "avisos_reserva"
         SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
             "canceladoEn" = $2::timestamptz,
             "motivoCancelacion" = $3,
             "leaseToken" = NULL,
             "leaseVenceEn" = NULL,
             "actualizadoEn" = $2::timestamptz
         WHERE "id" = $1 AND "leaseToken" = $4`,
        claimedItem.id,
        postLockNow,
        motivo,
        claimedItem.leaseToken
      );
      return { action: 'CANCEL', motivo };
    }

    // F. Comprobar elegibilidad según tipo de aviso
    if (claimedItem.tipoAviso === 'EXPIRACION_PROXIMA') {
      if (res.estado !== 'SOLICITADA') {
        const motivo = `RESERVA_NO_SOLICITADA:${res.estado}`;
        await tx.$executeRawUnsafe(
          `UPDATE "avisos_reserva"
           SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
               "canceladoEn" = $2::timestamptz,
               "motivoCancelacion" = $3,
               "leaseToken" = NULL,
               "leaseVenceEn" = NULL,
               "actualizadoEn" = $2::timestamptz
           WHERE "id" = $1 AND "leaseToken" = $4`,
          claimedItem.id,
          postLockNow,
          motivo,
          claimedItem.leaseToken
        );
        return { action: 'CANCEL', motivo };
      }

      // Si el plazo ya venció, NO enviar aviso previo de vencimiento próximo
      if (res.venceEn && postLockNow.getTime() >= new Date(res.venceEn).getTime()) {
        const motivo = 'PLAZO_ALCANZADO_ANTES_DE_ENVIO';
        await tx.$executeRawUnsafe(
          `UPDATE "avisos_reserva"
           SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
               "canceladoEn" = $2::timestamptz,
               "motivoCancelacion" = $3,
               "leaseToken" = NULL,
               "leaseVenceEn" = NULL,
               "actualizadoEn" = $2::timestamptz
           WHERE "id" = $1 AND "leaseToken" = $4`,
          claimedItem.id,
          postLockNow,
          motivo,
          claimedItem.leaseToken
        );
        return { action: 'CANCEL', motivo };
      }
    } else if (claimedItem.tipoAviso === 'SOLICITUD_EXPIRADA') {
      if (res.estado !== 'EXPIRADA') {
        const motivo = `RESERVA_NO_EXPIRADA:${res.estado}`;
        await tx.$executeRawUnsafe(
          `UPDATE "avisos_reserva"
           SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
               "canceladoEn" = $2::timestamptz,
               "motivoCancelacion" = $3,
               "leaseToken" = NULL,
               "leaseVenceEn" = NULL,
               "actualizadoEn" = $2::timestamptz
           WHERE "id" = $1 AND "leaseToken" = $4`,
          claimedItem.id,
          postLockNow,
          motivo,
          claimedItem.leaseToken
        );
        return { action: 'CANCEL', motivo };
      }
    }

    return { action: 'PROCEED' };
  });

  if (preflight.action === 'ABORT_LOST_LEASE') {
    return { status: 'LEASE_PERDIDO' };
  }

  if (preflight.action === 'CANCEL') {
    return { status: 'CANCELADO' };
  }

  // 2. Realizar envío EXTERNO fuera de transacciones de base de datos
  let sendResult: NoticeSendResult;
  try {
    sendResult = await adapter.send({
      id: claimedItem.id,
      reservaId: claimedItem.reservaId,
      tipoAviso: claimedItem.tipoAviso,
      canal: claimedItem.canal,
      plantilla: claimedItem.plantilla,
      venceEnSnapshot: claimedItem.venceEnSnapshot,
    });
  } catch (err: any) {
    sendResult = {
      success: false,
      errorCode: 'ADAPTER_EXCEPTION',
      errorMessage: 'Fallo inesperado del adaptador de envío de avisos.',
    };
  }

  // 3. Confirmar resultado en base de datos condicionado estrictamente al leaseToken y estado EN_ENVIO
  const resultStatus = await prisma.$transaction(async (tx) => {
    const postSendNow = await clock.now(tx);

    if (sendResult.success) {
      const updated = await tx.$executeRawUnsafe(
        `UPDATE "avisos_reserva"
         SET "estado" = 'ENVIADO'::"EstadoAvisoReserva",
             "enviadoEn" = $2::timestamptz,
             "proveedorId" = $3,
             "leaseToken" = NULL,
             "leaseVenceEn" = NULL,
             "proximoIntentoEn" = NULL,
             "actualizadoEn" = $2::timestamptz
         WHERE "id" = $1 AND "estado" = 'EN_ENVIO'::"EstadoAvisoReserva" AND "leaseToken" = $4`,
        claimedItem.id,
        postSendNow,
        sendResult.proveedorId || 'SENT',
        claimedItem.leaseToken
      );

      return updated > 0 ? ('ENVIADO' as const) : ('LEASE_PERDIDO' as const);
    } else {
      const nextReintentos = claimedItem.reintentos + 1;
      const maxRetriesLimit = claimedItem.maxReintentos ?? 3;
      const nextEstado = nextReintentos >= maxRetriesLimit ? 'FALLIDO' : 'PENDIENTE';

      // Calcular backoff técnico para el próximo intento (escalonado con límite)
      const nextProximoIntento =
        nextEstado === 'PENDIENTE'
          ? new Date(postSendNow.getTime() + Math.min(300000, 1000 * Math.pow(2, nextReintentos) * 10))
          : null;

      const sanitizedMsg = (sendResult.errorMessage || 'ERROR_ENVIO').substring(0, 200);

      const updated = await tx.$executeRawUnsafe(
        `UPDATE "avisos_reserva"
         SET "estado" = $2::"EstadoAvisoReserva",
             "reintentos" = $3,
             "ultimoErrorCodigo" = $4,
             "ultimoErrorMensaje" = $5,
             "proximoIntentoEn" = $6::timestamptz,
             "leaseToken" = NULL,
             "leaseVenceEn" = NULL,
             "actualizadoEn" = $7::timestamptz
         WHERE "id" = $1 AND "estado" = 'EN_ENVIO'::"EstadoAvisoReserva" AND "leaseToken" = $8`,
        claimedItem.id,
        nextEstado,
        nextReintentos,
        sendResult.errorCode || 'UNKNOWN_ERROR',
        sanitizedMsg,
        nextProximoIntento,
        postSendNow,
        claimedItem.leaseToken
      );

      return updated > 0 ? ('FALLIDO' as const) : ('LEASE_PERDIDO' as const);
    }
  });

  return { status: resultStatus };
}

/**
 * Ciclo ejecutable completo del despachador de outbox (DR03-03 / FIX-03).
 * Busca avisos pendientes/programados elegibles, adquiere leases con SKIP LOCKED,
 * evalúa preflight y despacha vía adapter con persistencia durable de backoff y resultados.
 * DESACTIVADO por defecto (requiere options.enabled === true).
 */
export async function runNoticeDispatchCycle(
  prisma: PrismaClient,
  options: {
    clock?: ExpirationClock;
    adapter: NoticeSenderAdapter;
    batchSize?: number;
    leaseDurationMs?: number;
    enabled?: boolean;
  }
): Promise<{
  claimedCount: number;
  sentCount: number;
  failedCount: number;
  cancelledCount: number;
  lostLeaseCount: number;
}> {
  const isEnabled = options.enabled !== undefined ? options.enabled : process.env.ENABLE_NOTICE_DISPATCHER === 'true';

  const report = {
    claimedCount: 0,
    sentCount: 0,
    failedCount: 0,
    cancelledCount: 0,
    lostLeaseCount: 0,
  };

  if (!isEnabled) {
    return report;
  }

  const clock = options.clock || productionExpirationClock;
  const now = await clock.now(prisma);

  const claimedNotices = await claimDueNotices(prisma, {
    now,
    batchSize: options.batchSize || 10,
    leaseDurationMs: options.leaseDurationMs || 60000,
  });

  report.claimedCount = claimedNotices.length;

  for (const notice of claimedNotices) {
    try {
      const cycleNow = await clock.now(prisma);
      const result = await processClaimedNotice(prisma, notice, options.adapter, cycleNow, clock);

      if (result.status === 'ENVIADO') {
        report.sentCount++;
      } else if (result.status === 'FALLIDO') {
        report.failedCount++;
      } else if (result.status === 'CANCELADO') {
        report.cancelledCount++;
      } else if (result.status === 'LEASE_PERDIDO') {
        report.lostLeaseCount++;
      }
    } catch {
      // Un fallo individual de un aviso no aborta el lote completo;
      // queda en EN_ENVIO y su lease podrá ser recuperado durablemente tras expirar
      report.failedCount++;
    }
  }

  return report;
}
