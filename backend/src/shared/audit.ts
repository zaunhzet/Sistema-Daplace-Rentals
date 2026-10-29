import type { PrismaClient } from '../generated/prisma/client.js';

export interface RecordAuditParams {
  entidad: string;
  entidadId: string;
  accion: string;
  actor?: string;
  motivo?: string;
  detalles?: Record<string, unknown>;
  requestId?: string;
}

export async function recordAuditEvent(
  prisma: PrismaClient,
  params: RecordAuditParams
) {
  try {
    return await prisma.auditoriaEvento.create({
      data: {
        entidad: params.entidad,
        entidadId: params.entidadId,
        accion: params.accion,
        actor: params.actor || 'SYSTEM_DEV',
        motivo: params.motivo || null,
        detalles: params.detalles ? (params.detalles as any) : undefined,
        requestId: params.requestId || null,
      },
    });
  } catch (err) {
    // Auditoría no debe interrumpir la respuesta pero debe quedar advertencia
    console.error('[AUDIT_ERROR] Error al registrar evento de auditoría:', err);
    return null;
  }
}
