import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export interface RecordAuditParams {
  entidad: string;
  entidadId: string;
  accion: string;
  actor: string;
  motivo?: string;
  detalles?: Record<string, unknown>;
  requestId?: string;
}

export type PrismaTxClient = Prisma.TransactionClient | PrismaClient;

const SENSITIVE_KEYS = ['password', 'contrasena', 'token', 'secret', 'apikey', 'credential', 'authorization'];

/**
 * Sanitiza detalles para evitar registrar credenciales, tokens o información sensible innecesaria.
 */
function sanitizeAuditDetails(detalles: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detalles)) {
    if (SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeAuditDetails(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Registra un evento de auditoría de manera atómica y obligatoria.
 * Debe ejecutarse dentro de la misma transacción (tx) que la mutación sensible.
 * Si la escritura del evento falla, propaga el error provocando el rollback completo.
 */
export async function recordAuditEvent(
  tx: PrismaTxClient,
  params: RecordAuditParams
) {
  if (!params.actor || params.actor.trim() === '') {
    throw new Error('OPERACIÓN ABORTADA: Toda acción auditable requiere un actor identificado.');
  }

  const cleanDetails = params.detalles ? sanitizeAuditDetails(params.detalles) : undefined;

  return await tx.auditoriaEvento.create({
    data: {
      entidad: params.entidad,
      entidadId: params.entidadId,
      accion: params.accion,
      actor: params.actor.trim(),
      motivo: params.motivo ? params.motivo.trim() : null,
      detalles: cleanDetails as any,
      requestId: params.requestId || null,
    },
  });
}

