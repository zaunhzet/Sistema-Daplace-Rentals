import type { PrismaClient } from '../../generated/prisma/client.js';
import type { PrismaTxClient } from '../../shared/audit.js';
import { recordAuditEvent } from '../../shared/audit.js';
import type { ExpirationClock } from './expirationClock.js';
import { productionExpirationClock } from './expirationClock.js';

export interface ExpirationContext {
  actor?: string;
  motivo?: string;
  requestId?: string;
  detalles?: Record<string, unknown>;
}

export interface ExpirationResult {
  expired: boolean;
  reservaId: string;
  motivo?: string;
  expiradaEn?: Date;
  venceEn?: Date;
}

export interface BatchExpirationOptions {
  batchSize?: number;
  clock?: ExpirationClock;
  context?: ExpirationContext;
  maxRetries?: number;
}

export interface BatchExpirationReport {
  totalCandidates: number;
  expiredCount: number;
  skippedCount: number;
  failedCount: number;
  errors: Array<{ reservaId: string; error: string }>;
}

/**
 * Expira de forma atómica y segura una reserva bloqueada.
 *
 * SECUENCIA DETERMINÍSTICA ESTABLECIDA:
 * 1. La reserva DEBE estar previamente bloqueada o se bloquea explícitamente con FOR UPDATE.
 * 2. Se relee el estado real y venceEn de la reserva.
 * 3. Se verifica que el estado sea estrictamente SOLICITADA y que cuente con venceEn definido.
 * 4. Se valida now >= venceEn. Si no ha vencido, no expira.
 * 5. Se actualiza de forma atómica a EXPIRADA con expiradaEn = now.
 * 6. Se registra el evento de auditoría EXPIRAR_SOLICITUD_RESERVA dentro de la misma transacción.
 * 7. Se invalidan (cancelan) avisos pendientes asociados a la solicitud vencida.
 */
export async function expireLockedReservation(
  tx: PrismaTxClient,
  reservaId: string,
  now: Date,
  context?: ExpirationContext
): Promise<ExpirationResult> {
  // 1. Bloquear y releer estado actual de la reserva
  const rows = await tx.$queryRawUnsafe<
    Array<{
      id: string;
      estado: string;
      venceEn: Date | null;
      plazoIniciadoEn: Date | null;
      politicaPlazoVersion: string | null;
    }>
  >(
    `SELECT "id", "estado", "venceEn", "plazoIniciadoEn", "politicaPlazoVersion"
     FROM "reservas"
     WHERE "id" = $1
     FOR UPDATE`,
    reservaId
  );

  if (!rows || rows.length === 0) {
    return {
      expired: false,
      reservaId,
      motivo: 'RESERVA_NO_ENCONTRADA',
    };
  }

  const reserva = rows[0];

  // 2. Verificar estado SOLICITADA
  if (reserva.estado !== 'SOLICITADA') {
    return {
      expired: false,
      reservaId,
      motivo: `ESTADO_NO_APTO:${reserva.estado}`,
    };
  }

  // 3. Verificar plazo persistido
  if (!reserva.venceEn) {
    return {
      expired: false,
      reservaId,
      motivo: 'SIN_PLAZO_CONFIGURADO',
    };
  }

  const venceEnDate = new Date(reserva.venceEn);

  // 4. Comprobar que el instante actual haya alcanzado o superado el vencimiento
  if (now.getTime() < venceEnDate.getTime()) {
    return {
      expired: false,
      reservaId,
      venceEn: venceEnDate,
      motivo: 'PLAZO_AUN_VIGENTE',
    };
  }

  // 5. Actualizar a EXPIRADA
  const updateResult = await tx.$executeRawUnsafe(
    `UPDATE "reservas"
     SET "estado" = 'EXPIRADA'::"EstadoReserva",
         "expiradaEn" = $2::timestamptz,
         "actualizadaEn" = $2::timestamptz
     WHERE "id" = $1 AND "estado" = 'SOLICITADA'::"EstadoReserva"`,
    reservaId,
    now
  );

  if (updateResult === 0) {
    return {
      expired: false,
      reservaId,
      motivo: 'TRANSICION_YA_EJECUTADA_POR_OTRO_PROCESO',
    };
  }

  // 6. Registrar auditoría obligatoria (si falla, tx hace rollback completo)
  await recordAuditEvent(tx, {
    entidad: 'Reserva',
    entidadId: reservaId,
    accion: 'EXPIRAR_SOLICITUD_RESERVA',
    actor: context?.actor || 'SYSTEM_EXPIRATION_WORKER',
    motivo: context?.motivo || 'Expiración automática por vencimiento del plazo de solicitud.',
    detalles: {
      plazoIniciadoEn: reserva.plazoIniciadoEn ? new Date(reserva.plazoIniciadoEn).toISOString() : null,
      venceEn: venceEnDate.toISOString(),
      expiradaEn: now.toISOString(),
      politicaPlazoVersion: reserva.politicaPlazoVersion,
      ...context?.detalles,
    },
    requestId: context?.requestId,
  });

  // 7. Cancelar avisos no entregados (incluyendo EN_ENVIO y FALLIDO), liberando leases
  await tx.$executeRawUnsafe(
    `UPDATE "avisos_reserva"
     SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
         "canceladoEn" = $2::timestamptz,
         "motivoCancelacion" = 'RESERVA_EXPIRADA',
         "leaseToken" = NULL,
         "leaseVenceEn" = NULL,
         "actualizadoEn" = $2::timestamptz
     WHERE "reservaId" = $1
       AND "estado" IN ('PROGRAMADO'::"EstadoAvisoReserva", 'PENDIENTE'::"EstadoAvisoReserva", 'FALLIDO'::"EstadoAvisoReserva", 'EN_ENVIO'::"EstadoAvisoReserva")`,
    reservaId,
    now
  );

  return {
    expired: true,
    reservaId,
    expiradaEn: now,
    venceEn: venceEnDate,
  };
}

function isConcurrencyError(err: any): boolean {
  if (!err) return false;
  const isMatch = (c: unknown) => c === '40P01' || c === '40001' || c === 'P2034';

  if (isMatch(err.code)) return true;
  if (err.meta && typeof err.meta === 'object') {
    if (isMatch(err.meta.code)) return true;
    if (isMatch(err.meta.database_error_code)) return true;
  }
  if (err.cause && isConcurrencyError(err.cause)) return true;

  const msg = String(err.message || '');
  if (msg.includes('40P01') || msg.includes('40001') || msg.includes('deadlock') || msg.includes('could not serialize')) {
    return true;
  }
  return false;
}

/**
 * Procesa un lote de reservas vencidas con selección y bloqueo concurrente auténtico FOR UPDATE SKIP LOCKED.
 * Cada candidato se selecciona y bloquea dentro de su propia transacción aislada para no bloquear
 * a otros procesos concurrentes y saltar filas retenidas por otras conexiones.
 */
export async function expireDueBatch(
  prisma: PrismaClient,
  options: BatchExpirationOptions = {}
): Promise<BatchExpirationReport> {
  const batchSize = Math.max(1, Math.min(options.batchSize || 20, 200));
  const clock = options.clock || productionExpirationClock;
  const maxRetries = options.maxRetries ?? 3;

  const report: BatchExpirationReport = {
    totalCandidates: 0,
    expiredCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
  };

  const processedOrExcludedIds: string[] = [];

  for (let i = 0; i < batchSize; i++) {
    let attempt = 0;
    let success = false;
    let selectedCandidateId: string | null = null;

    while (attempt < maxRetries && !success) {
      attempt++;
      selectedCandidateId = null;

      try {
        const txResult = await prisma.$transaction(
          async (tx) => {
            // 1. Seleccionar Y bloquear el siguiente candidato vencido con FOR UPDATE SKIP LOCKED
            const rows = await tx.$queryRawUnsafe<
              Array<{
                id: string;
                estado: string;
                venceEn: Date;
                plazoIniciadoEn: Date | null;
                politicaPlazoVersion: string | null;
              }>
            >(
              `SELECT "id", "estado", "venceEn", "plazoIniciadoEn", "politicaPlazoVersion"
               FROM "reservas"
               WHERE "estado" = 'SOLICITADA'::"EstadoReserva"
                 AND "venceEn" IS NOT NULL
                 AND "id" != ALL($1::text[])
               ORDER BY "venceEn" ASC, "id" ASC
               LIMIT 1
               FOR UPDATE SKIP LOCKED`,
              processedOrExcludedIds.length > 0 ? processedOrExcludedIds : ['__dummy_none__']
            );

            if (!rows || rows.length === 0) {
              return { hasCandidate: false };
            }

            const candidate = rows[0];
            selectedCandidateId = candidate.id;

            // 2. Obtener reloj confiable DESPUÉS de adquirir el bloqueo en la fila
            const txNow = await clock.now(tx);
            const venceEnDate = new Date(candidate.venceEn);

            // 3. Comprobar si efectivamente venció
            if (txNow.getTime() < venceEnDate.getTime()) {
              return {
                hasCandidate: true,
                candidateId: candidate.id,
                expired: false,
                motivo: 'PLAZO_AUN_VIGENTE',
              };
            }

            // 4. Actualizar condicionalmente a EXPIRADA
            const updateCount = await tx.$executeRawUnsafe(
              `UPDATE "reservas"
               SET "estado" = 'EXPIRADA'::"EstadoReserva",
                   "expiradaEn" = $2::timestamptz,
                   "actualizadaEn" = $2::timestamptz
               WHERE "id" = $1 AND "estado" = 'SOLICITADA'::"EstadoReserva"`,
              candidate.id,
              txNow
            );

            if (updateCount === 0) {
              return {
                hasCandidate: true,
                candidateId: candidate.id,
                expired: false,
                motivo: 'TRANSICION_YA_EJECUTADA',
              };
            }

            // 5. Registrar auditoría con fechas en formato ISO string
            await recordAuditEvent(tx, {
              entidad: 'Reserva',
              entidadId: candidate.id,
              accion: 'EXPIRAR_SOLICITUD_RESERVA',
              actor: options.context?.actor || 'SYSTEM_EXPIRATION_WORKER',
              motivo: options.context?.motivo || 'Expiración automática por vencimiento del plazo de solicitud.',
              detalles: {
                plazoIniciadoEn: candidate.plazoIniciadoEn ? new Date(candidate.plazoIniciadoEn).toISOString() : null,
                venceEn: venceEnDate.toISOString(),
                expiradaEn: txNow.toISOString(),
                politicaPlazoVersion: candidate.politicaPlazoVersion,
                ...options.context?.detalles,
              },
              requestId: options.context?.requestId,
            });

            // 6. Cancelar avisos no entregados
            await tx.$executeRawUnsafe(
              `UPDATE "avisos_reserva"
               SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
                   "canceladoEn" = $2::timestamptz,
                   "motivoCancelacion" = 'RESERVA_EXPIRADA',
                   "leaseToken" = NULL,
                   "leaseVenceEn" = NULL,
                   "actualizadoEn" = $2::timestamptz
               WHERE "reservaId" = $1
                 AND "estado" IN ('PROGRAMADO'::"EstadoAvisoReserva", 'PENDIENTE'::"EstadoAvisoReserva", 'FALLIDO'::"EstadoAvisoReserva", 'EN_ENVIO'::"EstadoAvisoReserva")`,
              candidate.id,
              txNow
            );

            return {
              hasCandidate: true,
              candidateId: candidate.id,
              expired: true,
            };
          },
          {
            isolationLevel: 'ReadCommitted',
            timeout: 10000,
          }
        );

        if (!txResult.hasCandidate) {
          // No hay más candidatos desbloqueados y pendientes en la base de datos
          break;
        }

        // 7. Contabilizar ÚNICAMENTE después de confirmar la transacción exitosamente
        report.totalCandidates++;
        if (txResult.expired) {
          report.expiredCount++;
        } else {
          report.skippedCount++;
        }

        if (txResult.candidateId) {
          processedOrExcludedIds.push(txResult.candidateId);
        }

        success = true;
      } catch (err: any) {
        if (isConcurrencyError(err) && attempt < maxRetries) {
          const backoff = Math.floor(Math.random() * 50 + 20) * attempt;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        report.failedCount++;
        if (selectedCandidateId) {
          processedOrExcludedIds.push(selectedCandidateId);
          report.errors.push({
            reservaId: selectedCandidateId,
            error: err?.message || String(err),
          });
          success = true; // Excluir la fila anómala y continuar con las demás filas del lote
        } else {
          // Error antes de seleccionar fila (infraestructura / conexión): no repetir ciegamente
          report.errors.push({
            reservaId: 'UNKNOWN_OR_BATCH_ROW',
            error: err?.message || String(err),
          });
          return report;
        }
      }
    }
  }

  return report;
}
