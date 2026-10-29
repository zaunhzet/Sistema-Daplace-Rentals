import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient, EstadoEvidenciaPago } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth } from '../shared/auth.js';

export function validateUrl(stringUrl: string): boolean {
  try {
    const url = new URL(stringUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Genera hash canónico para verificación de idempotencia en evidencias documentales.
 */
export function computeEvidencePayloadHash(data: {
  pagoId: string;
  tipo: string;
  nombreArchivo: string;
  referenciaDocumental?: string | null;
  url?: string | null;
  estado: string;
  notas?: string | null;
}): string {
  const canonical = JSON.stringify({
    version: 'ev-v1',
    pagoId: data.pagoId,
    tipo: data.tipo.trim(),
    nombreArchivo: data.nombreArchivo.trim(),
    referenciaDocumental: data.referenciaDocumental ? data.referenciaDocumental.trim() : null,
    url: data.url ? data.url.trim() : null,
    estado: data.estado.trim(),
    notas: data.notas ? data.notas.trim() : null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Formatea un registro de EvidenciaPago para el contrato HTTP / Frontend.
 */
export function formatEvidenciaResponse(evidencia: any) {
  return {
    id: evidencia.id,
    pagoId: evidencia.pagoId,
    tipo: evidencia.tipo || 'VOUCHER',
    nombreArchivo: evidencia.nombreArchivo,
    referenciaDocumental: evidencia.referenciaDocumental || undefined,
    url: evidencia.url || undefined,
    estado: evidencia.estado as EstadoEvidenciaPago,
    notas: evidencia.notas || undefined,
    idempotencyKey: evidencia.idempotencyKey || undefined,
    registradoPor:
      evidencia.registradoPor?.nombre ||
      evidencia.registradoPor?.email ||
      evidencia.registradoPorId ||
      undefined,
    creadoEn:
      evidencia.creadoEn instanceof Date
        ? evidencia.creadoEn.toISOString()
        : String(evidencia.creadoEn),
  };
}

export function registerPaymentEvidencesRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // Operaciones documentales reservadas a roles con facultad administrativa
    const authGuard = requireAuth(['ADMIN', 'OPERADOR']);

    // 1. Registrar evidencia documental para un pago existente con idempotencia estricta
    app.post<{
      Params: { id: string };
      Headers: { 'idempotency-key'?: string };
      Body: {
        nombreArchivo: string;
        referenciaDocumental?: string;
        url?: string;
        tipo?: string;
        estado?: string;
        notas?: string;
        idempotencyKey?: string;
      };
    }>('/api/pagos/:id/evidencias', { preHandler: authGuard }, async (request, reply) => {
      const { id: pagoId } = request.params;
      const { nombreArchivo, referenciaDocumental, url, tipo, estado, notas } = request.body || {};

      // A. Exigir clave de idempotencia no vacía para nuevas solicitudes de adjunto posterior
      const rawIdempotencyKey = request.headers['idempotency-key'] || request.body?.idempotencyKey;
      const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey.trim() : '';
      if (!idempotencyKey) {
        return reply.status(400).send({
          error: {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message:
              'Se requiere una clave de idempotencia no vacía (Header "Idempotency-Key" o campo "idempotencyKey") para adjuntar evidencias documentales.',
            requestId: request.id,
          },
        });
      }

      // B. Validar que el cliente NO pueda establecer VALIDADA directamente
      if (estado && estado.toUpperCase() === 'VALIDADA') {
        return reply.status(400).send({
          error: {
            code: 'FORBIDDEN_STATE',
            message:
              'No se permite establecer el estado VALIDADA directamente desde el cliente. Las evidencias documentales se registran exclusivamente en estado REFERENCIADA.',
            requestId: request.id,
          },
        });
      }

      if (estado && estado.toUpperCase() !== 'REFERENCIADA') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Estado inicial de evidencia documental inválido ("${estado}"). Solo se admite "REFERENCIADA".`,
            requestId: request.id,
          },
        });
      }

      // C. Validar nombre de archivo original
      if (!nombreArchivo || typeof nombreArchivo !== 'string' || nombreArchivo.trim().length < 2) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El nombre del archivo o documento original es obligatorio (mínimo 2 caracteres).',
            requestId: request.id,
          },
        });
      }

      // D. Validar URL si se proporciona
      let urlSanitizada: string | null = null;
      if (url && typeof url === 'string' && url.trim() !== '') {
        const urlCandidate = url.trim();
        if (!validateUrl(urlCandidate)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `La URL proporcionada "${urlCandidate}" no tiene un esquema HTTP/HTTPS válido.`,
              requestId: request.id,
            },
          });
        }
        urlSanitizada = urlCandidate;
      }

      const effectiveTipo = tipo && tipo.trim() ? tipo.trim() : 'VOUCHER';
      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorId = request.user?.id || null;

      // E. Canonicalización y cálculo del hash de evidencia
      const calculatedHash = computeEvidencePayloadHash({
        pagoId,
        tipo: effectiveTipo,
        nombreArchivo: nombreArchivo.trim(),
        referenciaDocumental: referenciaDocumental?.trim() || null,
        url: urlSanitizada,
        estado: 'REFERENCIADA',
        notas: notas?.trim() || null,
      });

      try {
        const result = await prisma.$transaction(async (tx) => {
          const pago = await tx.pago.findUnique({ where: { id: pagoId } });
          if (!pago) {
            throw new Error('PAYMENT_NOT_FOUND');
          }

          if (pago.estado === 'RECHAZADO') {
            throw new Error('CANNOT_ATTACH_TO_REJECTED_PAYMENT');
          }

          // Chequeo de idempotencia a nivel transaccional
          const existing = await tx.evidenciaPago.findUnique({
            where: {
              pagoId_idempotencyKey: {
                pagoId,
                idempotencyKey,
              },
            },
            include: { registradoPor: true },
          });

          if (existing) {
            if (existing.payloadHash === calculatedHash) {
              return { evidencia: existing, isReplay: true };
            }
            throw new Error('IDEMPOTENCY_CONFLICT');
          }

          const evidencia = await tx.evidenciaPago.create({
            data: {
              pagoId,
              tipo: effectiveTipo,
              nombreArchivo: nombreArchivo.trim(),
              referenciaDocumental:
                referenciaDocumental && referenciaDocumental.trim()
                  ? referenciaDocumental.trim()
                  : null,
              url: urlSanitizada,
              estado: 'REFERENCIADA',
              notas: notas && notas.trim() ? notas.trim() : null,
              idempotencyKey,
              payloadHash: calculatedHash,
              registradoPorId: actorId,
            },
            include: { registradoPor: true },
          });

          await recordAuditEvent(tx, {
            entidad: 'Pago',
            entidadId: pagoId,
            accion: 'EVIDENCIA_PAGO_AGREGADA',
            actor: actorEmail,
            motivo: `Adjunto de evidencia documental: ${evidencia.nombreArchivo} (${evidencia.estado})`,
            detalles: {
              evidenciaId: evidencia.id,
              pagoId,
              nombreArchivo: evidencia.nombreArchivo,
              referenciaDocumental: evidencia.referenciaDocumental,
              url: evidencia.url,
              estado: evidencia.estado,
              tipo: evidencia.tipo,
              idempotencyKey,
            },
            requestId: request.id,
          });

          return { evidencia, isReplay: false };
        });

        if (result.isReplay) {
          return reply.status(200).send({
            data: formatEvidenciaResponse(result.evidencia),
            idempotentReplay: true,
          });
        }

        return reply.status(201).send({
          data: formatEvidenciaResponse(result.evidencia),
        });
      } catch (err: any) {
        // Manejo de condición de carrera concurrente P2002 garantizado por PostgreSQL
        if (err.code === 'P2002') {
          const concurrentExisting = await prisma.evidenciaPago.findUnique({
            where: {
              pagoId_idempotencyKey: {
                pagoId,
                idempotencyKey,
              },
            },
            include: { registradoPor: true },
          });
          if (concurrentExisting) {
            if (concurrentExisting.payloadHash === calculatedHash) {
              return reply.status(200).send({
                data: formatEvidenciaResponse(concurrentExisting),
                idempotentReplay: true,
              });
            }
            return reply.status(409).send({
              error: {
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'La clave de idempotencia ya fue utilizada con un contenido de evidencia diferente.',
                requestId: request.id,
              },
            });
          }
        }

        if (err.message === 'IDEMPOTENCY_CONFLICT') {
          return reply.status(409).send({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada con un contenido de evidencia diferente.',
              requestId: request.id,
            },
          });
        }
        if (err.message === 'PAYMENT_NOT_FOUND') {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: `El pago con identificador "${pagoId}" no existe.`,
              requestId: request.id,
            },
          });
        }
        if (err.message === 'CANNOT_ATTACH_TO_REJECTED_PAYMENT') {
          return reply.status(409).send({
            error: {
              code: 'INVALID_STATE_TRANSITION',
              message: 'No se pueden adjuntar evidencias documentales a un pago en estado RECHAZADO.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });

    // 2. Listar evidencias de un pago
    app.get<{
      Params: { id: string };
    }>('/api/pagos/:id/evidencias', { preHandler: authGuard }, async (request, reply) => {
      const { id: pagoId } = request.params;

      const pago = await prisma.pago.findUnique({ where: { id: pagoId } });
      if (!pago) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `El pago "${pagoId}" no existe.`,
            requestId: request.id,
          },
        });
      }

      const evidencias = await prisma.evidenciaPago.findMany({
        where: { pagoId },
        include: { registradoPor: true },
        orderBy: { creadoEn: 'desc' },
      });

      return reply.send({
        data: evidencias.map(formatEvidenciaResponse),
      });
    });
  };
}
