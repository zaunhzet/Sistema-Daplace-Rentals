import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient, EstadoFirmaContrato } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth, resolveDomainActorFromDb } from '../shared/auth.js';
import {
  evaluateConfirmationRequirements,
  defaultPoliticaAdelantoProvider,
  type PoliticaAdelantoProvider,
} from '../modules/reservations/confirmationRequirements.js';
import {
  productionExpirationClock,
  type ExpirationClock,
} from '../modules/reservations/expirationClock.js';

const FORBIDDEN_POLICY_PARAMS = [
  'politicaAdelanto',
  'politicaTipo',
  'porcentajeExigible',
  'versionPolitica',
  'esExcepcion',
  'autorizadoPorId',
];

function hasClientCommercialAuthority(req: { body?: any; query?: any }): boolean {
  const checkObj = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of FORBIDDEN_POLICY_PARAMS) {
      if (key in obj && obj[key] !== undefined && obj[key] !== null) return true;
    }
    return false;
  };
  return checkObj(req.body) || checkObj(req.query);
}

export function validateContractUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function computeContractPayloadHash(data: {
  reservaId: string;
  nombreOriginal: string;
  urlReferencia?: string | null;
  reemplazaContratoId?: string | null;
}): string {
  const canonical = JSON.stringify({
    version: 'contract-v1',
    reservaId: data.reservaId,
    nombreOriginal: data.nombreOriginal.trim(),
    urlReferencia: data.urlReferencia ? data.urlReferencia.trim() : null,
    reemplazaContratoId: data.reemplazaContratoId ? data.reemplazaContratoId.trim() : null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function formatContractResponse(contract: any) {
  return {
    id: contract.id,
    reservaId: contract.reservaId,
    version: contract.version,
    nombreOriginal: contract.nombreOriginal,
    urlReferencia: contract.urlReferencia || undefined,
    estadoFirma: contract.estadoFirma as EstadoFirmaContrato,
    registradoPorId: contract.registradoPorId,
    registradoPor:
      contract.registradoPor?.nombre ||
      contract.registradoPor?.email ||
      contract.registradoPorId,
    registradoEn:
      contract.registradoEn instanceof Date
        ? contract.registradoEn.toISOString()
        : contract.registradoEn,
    validadoPorId: contract.validadoPorId || undefined,
    validadoEn:
      contract.validadoEn instanceof Date
        ? contract.validadoEn.toISOString()
        : contract.validadoEn || undefined,
    motivoValidacion: contract.motivoValidacion || undefined,
    reemplazaContratoId: contract.reemplazaContratoId || undefined,
    idempotencyKey: contract.idempotencyKey || undefined,
  };
}

export function registerContractsRoutes(
  prisma: PrismaClient,
  politicaAdelantoProvider?: PoliticaAdelantoProvider,
  expirationClock?: ExpirationClock
): FastifyPluginAsync {
  return async (app) => {
    const adminOrOperatorGuard = requireAuth(['ADMIN', 'OPERADOR']);

    // 1. Registrar nueva versión de contrato para una reserva
    app.post<{
      Params: { id: string };
      Body: {
        nombreOriginal: string;
        urlReferencia?: string;
        estadoFirma?: string;
        validadoPorId?: string;
        validadoEn?: string;
        motivoValidacion?: string;
        reemplazaContratoId?: string;
        idempotencyKey?: string;
      };
    }>(
      '/api/reservas/:id/contratos',
      { preHandler: adminOrOperatorGuard },
      async (request, reply) => {
        const { id: reservaId } = request.params;
        const body = request.body || ({} as any);

        const {
          nombreOriginal,
          urlReferencia,
          estadoFirma,
          validadoPorId,
          validadoEn,
          motivoValidacion,
          reemplazaContratoId,
          idempotencyKey: bodyIdempotencyKey,
        } = body;

        // Seguridad: Prohibir que el cliente asigne estados de validación o datos de aprobación
        if (
          (estadoFirma && estadoFirma.toUpperCase() !== 'REFERENCIADA') ||
          validadoPorId ||
          validadoEn ||
          motivoValidacion
        ) {
          return reply.status(400).send({
            error: {
              code: 'FORBIDDEN_STATE',
              message:
                'No se permite establecer el estado de validación o aprobación desde el cliente. Las referencias contractuales se registran exclusivamente en estado REFERENCIADA.',
              requestId: request.id,
            },
          });
        }

        if (
          !nombreOriginal ||
          typeof nombreOriginal !== 'string' ||
          nombreOriginal.trim().length < 3
        ) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message:
                'El nombre original del contrato es obligatorio y debe tener al menos 3 caracteres.',
              requestId: request.id,
            },
          });
        }

        // Exigir actor transaccional de dominio válido (existente y activo en BD)
        const actorUsuarioId = await resolveDomainActorFromDb(prisma, request, reply);
        if (actorUsuarioId === null) return;

        let cleanUrl: string | null = null;
        if (urlReferencia && typeof urlReferencia === 'string' && urlReferencia.trim() !== '') {
          if (!validateContractUrl(urlReferencia.trim())) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'La URL proporcionada para el contrato no tiene un esquema HTTP/HTTPS válido.',
                requestId: request.id,
              },
            });
          }
          cleanUrl = urlReferencia.trim();
        }

        const headerKey = request.headers['idempotency-key'];
        const effectiveIdempotencyKey = (
          (typeof headerKey === 'string' ? headerKey : bodyIdempotencyKey) || ''
        ).trim() || null;

        const calculatedHash = effectiveIdempotencyKey
          ? computeContractPayloadHash({
              reservaId,
              nombreOriginal: nombreOriginal.trim(),
              urlReferencia: cleanUrl,
              reemplazaContratoId: reemplazaContratoId ? reemplazaContratoId.trim() : null,
            })
          : null;

        try {
          const resultado = await prisma.$transaction(async (tx) => {
            // Bloqueo pesimista de fila en PostgreSQL para evitar carreras concurrentes en versiones
            const reservaRows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "reservas" WHERE id = ${reservaId} FOR UPDATE;`;
            if (!reservaRows || reservaRows.length === 0) {
              const err = new Error(`La reserva "${reservaId}" no existe.`);
              (err as any).statusCode = 404;
              (err as any).code = 'RESERVATION_NOT_FOUND';
              throw err;
            }

            // Chequeo de idempotencia a nivel transaccional
            if (effectiveIdempotencyKey) {
              const existingContract = await tx.contratoReserva.findUnique({
                where: {
                  reservaId_idempotencyKey: {
                    reservaId,
                    idempotencyKey: effectiveIdempotencyKey,
                  },
                },
                include: { registradoPor: true },
              });

              if (existingContract) {
                if (existingContract.payloadHash === calculatedHash) {
                  return { contrato: existingContract, isReplay: true };
                }
                const conflictErr = new Error('IDEMPOTENCY_CONFLICT');
                (conflictErr as any).statusCode = 409;
                (conflictErr as any).code = 'IDEMPOTENCY_CONFLICT';
                throw conflictErr;
              }
            }

            // Validar reemplazaContratoId si fue enviado
            if (reemplazaContratoId) {
              const previo = await tx.contratoReserva.findUnique({
                where: { id: reemplazaContratoId.trim() },
              });
              if (!previo || previo.reservaId !== reservaId) {
                const err = new Error(
                  `El contrato previo "${reemplazaContratoId}" no existe o no pertenece a esta reserva.`
                );
                (err as any).statusCode = 400;
                (err as any).code = 'INVALID_CONTRACT_REFERENCE';
                throw err;
              }
            }

            // Asignación segura y concurrente de versión: max(version) + 1
            const maxVersionAggregate = await tx.contratoReserva.aggregate({
              where: { reservaId },
              _max: { version: true },
            });
            const nextVersion = (maxVersionAggregate._max.version || 0) + 1;

            const nuevoContrato = await tx.contratoReserva.create({
              data: {
                reservaId,
                version: nextVersion,
                nombreOriginal: nombreOriginal.trim(),
                urlReferencia: cleanUrl,
                estadoFirma: 'REFERENCIADA',
                registradoPorId: actorUsuarioId,
                reemplazaContratoId: reemplazaContratoId ? reemplazaContratoId.trim() : null,
                idempotencyKey: effectiveIdempotencyKey,
                payloadHash: calculatedHash,
              },
              include: { registradoPor: true },
            });

            // Auditoría transaccional
            await recordAuditEvent(tx, {
              entidad: 'Reserva',
              entidadId: reservaId,
              accion: 'CONTRATO_RESERVA_REGISTRADO',
              actor: actorUsuarioId,
              motivo: `Alta de contrato v${nextVersion}: ${nuevoContrato.nombreOriginal} (REFERENCIADA)`,
              detalles: {
                contratoId: nuevoContrato.id,
                reservaId,
                version: nextVersion,
                nombreOriginal: nuevoContrato.nombreOriginal,
                reemplazaContratoId: nuevoContrato.reemplazaContratoId,
                idempotencyKey: effectiveIdempotencyKey,
              },
              requestId: request.id,
            });

            return { contrato: nuevoContrato, isReplay: false };
          });

          if (resultado.isReplay) {
            return reply.status(200).send({
              data: formatContractResponse(resultado.contrato),
              idempotentReplay: true,
            });
          }

          return reply.status(201).send({
            data: formatContractResponse(resultado.contrato),
          });
        } catch (err: any) {
          if (err.statusCode) {
            return reply.status(err.statusCode).send({
              error: {
                code: err.code || 'BAD_REQUEST',
                message: err.message,
                requestId: request.id,
              },
            });
          }

          if (err.code === 'P2002') {
            return reply.status(409).send({
              error: {
                code: 'CONCURRENCY_CONFLICT',
                message: 'Conflicto de concurrencia al registrar la versión del contrato. Reintente la operación.',
                requestId: request.id,
              },
            });
          }

          throw err;
        }
      }
    );

    // 2. Listar versiones contractuales de una reserva
    app.get<{
      Params: { id: string };
    }>(
      '/api/reservas/:id/contratos',
      { preHandler: adminOrOperatorGuard },
      async (request, reply) => {
        const { id: reservaId } = request.params;

        const reserva = await prisma.reserva.findUnique({
          where: { id: reservaId },
        });

        if (!reserva) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: `La reserva "${reservaId}" no existe.`,
              requestId: request.id,
            },
          });
        }

        const contratos = await prisma.contratoReserva.findMany({
          where: { reservaId },
          include: { registradoPor: true, validadoPor: true },
          orderBy: { version: 'asc' },
        });

        return reply.send({
          data: contratos.map(formatContractResponse),
        });
      }
    );

    // 3. Consultar requisitos de confirmación de una reserva
    app.get<{
      Params: { id: string };
      Querystring: Record<string, string | undefined>;
    }>(
      '/api/reservas/:id/requisitos-confirmacion',
      { preHandler: adminOrOperatorGuard },
      async (request, reply) => {
        const { id: reservaId } = request.params;

        // DR02-01: Rechazo terminante de autoridad comercial del cliente
        if (hasClientCommercialAuthority(request)) {
          return reply.status(400).send({
            error: {
              code: 'CLIENT_POLICY_FORBIDDEN',
              message: 'No está permitido establecer políticas comerciales, porcentajes o excepciones desde el cliente.',
              requestId: request.id,
            },
          });
        }

        const reserva = await prisma.reserva.findUnique({
          where: { id: reservaId },
        });

        if (!reserva) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: `La reserva "${reservaId}" no existe.`,
              requestId: request.id,
            },
          });
        }

        // Obtener política comercial compartida desde el proveedor del servidor
        const effectiveProvider = politicaAdelantoProvider || defaultPoliticaAdelantoProvider;
        const politica = await effectiveProvider(reservaId, prisma);

        const clock = expirationClock || productionExpirationClock;
        const now = await clock.now(prisma);

        const result = await evaluateConfirmationRequirements(prisma, reservaId, politica, { now });
        return reply.send({ data: result });
      }
    );
  };
}
