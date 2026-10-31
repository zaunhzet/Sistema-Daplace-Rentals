import type { FastifyPluginAsync } from 'fastify';
import {
  Prisma,
  type PrismaClient,
  type EstadoGarantia,
  type TipoMovimientoGarantia,
} from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth, resolveDomainActor } from '../shared/auth.js';

const ALLOWED_ESTADOS_GARANTIA: EstadoGarantia[] = [
  'EN_CUSTODIA',
  'PARCIALMENTE_RETENIDA',
  'DEVUELTA_TOTAL',
  'RETENIDA_TOTAL',
  'LIQUIDADA_MIXTA',
];

const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * Calcula los totales derivados y el saldo disponible a partir de los movimientos append-only.
 */
export function computeGuaranteeBalances(movimientos: Array<{ tipo: TipoMovimientoGarantia; monto: Prisma.Decimal }>) {
  let totalRecibido = new Prisma.Decimal(0);
  let totalRetenido = new Prisma.Decimal(0);
  let totalDevuelto = new Prisma.Decimal(0);

  for (const m of movimientos) {
    const val = new Prisma.Decimal(m.monto);
    if (m.tipo === 'RECEPCION') {
      totalRecibido = totalRecibido.add(val);
    } else if (m.tipo === 'RETENCION') {
      totalRetenido = totalRetenido.add(val);
    } else if (m.tipo === 'DEVOLUCION_PARCIAL' || m.tipo === 'DEVOLUCION_TOTAL') {
      totalDevuelto = totalDevuelto.add(val);
    }
  }

  const saldoDisponible = totalRecibido.minus(totalRetenido).minus(totalDevuelto);

  return {
    totalRecibido,
    totalRetenido,
    totalDevuelto,
    saldoDisponible,
  };
}

/**
 * Determina el estado canónico de la garantía en base a sus saldos y movimientos históricos.
 */
export function deriveGuaranteeState(
  totalRecibido: Prisma.Decimal,
  totalRetenido: Prisma.Decimal,
  totalDevuelto: Prisma.Decimal
): EstadoGarantia {
  const saldoDisponible = totalRecibido.minus(totalRetenido).minus(totalDevuelto);

  if (saldoDisponible.greaterThan(0)) {
    if (totalRetenido.greaterThan(0)) {
      return 'PARCIALMENTE_RETENIDA';
    }
    return 'EN_CUSTODIA';
  }

  // Cuando saldoDisponible === 0 (garantía totalmente liquidada)
  if (totalRetenido.greaterThan(0) && totalDevuelto.greaterThan(0)) {
    return 'LIQUIDADA_MIXTA';
  }
  if (totalRetenido.greaterThan(0)) {
    return 'RETENIDA_TOTAL';
  }
  return 'DEVUELTA_TOTAL';
}

/**
 * Compara canónicamente un movimiento existente con el payload esperado para verificar idempotencia estricta.
 * Evalúa: garantía, tipo, importe decimal exacto, motivo y documento de soporte.
 */
export function isMatchingGuaranteeMovementPayload(
  existente: {
    garantiaId: string;
    tipo: string;
    monto: Prisma.Decimal | string | number;
    motivo: string;
    documentoSoporte: string | null;
  },
  esperado: {
    garantiaId: string;
    tipo: string;
    importe: string;
    motivo: string;
    documentoSoporte?: string | null;
  }
): boolean {
  if (existente.garantiaId !== esperado.garantiaId) {
    return false;
  }
  if (existente.tipo !== esperado.tipo) {
    return false;
  }
  const existenteMontoStr = new Prisma.Decimal(existente.monto).toFixed(2);
  const esperadoMontoStr = new Prisma.Decimal(esperado.importe.trim()).toFixed(2);
  if (existenteMontoStr !== esperadoMontoStr) {
    return false;
  }
  if (existente.motivo.trim() !== esperado.motivo.trim()) {
    return false;
  }
  const docExistente = existente.documentoSoporte ? existente.documentoSoporte.trim() : null;
  const docEsperado = esperado.documentoSoporte && esperado.documentoSoporte.trim() ? esperado.documentoSoporte.trim() : null;
  if (docExistente !== docEsperado) {
    return false;
  }
  return true;
}

/**

 * Mapea una Garantía de Prisma al contrato esperado por el Frontend.
 */
export function formatGuaranteeResponse(garantia: any) {
  const movimientos = (garantia.movimientos || []).map((m: any) => ({
    id: m.id,
    garantiaId: m.garantiaId,
    tipo: m.tipo as TipoMovimientoGarantia,
    importe: new Prisma.Decimal(m.monto).toFixed(2),
    motivo: m.motivo,
    documentoSoporte: m.documentoSoporte || undefined,
    registradoEn: m.creadoEn instanceof Date ? m.creadoEn.toISOString() : String(m.creadoEn),
    registradoPor: m.actor?.nombre || m.actor?.email || m.actorId || undefined,
  }));

  const { totalRecibido, totalRetenido, totalDevuelto, saldoDisponible } = computeGuaranteeBalances(
    garantia.movimientos || []
  );

  return {
    id: garantia.id,
    reservaId: garantia.reservaId,
    propiedadId: garantia.reserva?.propiedadId || garantia.reserva?.propiedad?.id || '',
    propiedadNombre: garantia.reserva?.propiedad?.nombre || '',
    huespedId: garantia.reserva?.huespedId || garantia.reserva?.huesped?.id || '',
    huespedNombre: garantia.reserva?.huesped?.nombreCompleto || '',
    moneda: garantia.moneda,
    importeRecibido: totalRecibido.greaterThan(0) ? totalRecibido.toFixed(2) : new Prisma.Decimal(garantia.montoTotal).toFixed(2),
    totalRetenido: totalRetenido.toFixed(2),
    totalDevuelto: totalDevuelto.toFixed(2),
    saldoDisponible: saldoDisponible.toFixed(2),
    estado: garantia.estado as EstadoGarantia,
    movimientos,
    creadaEn: garantia.creadaEn instanceof Date ? garantia.creadaEn.toISOString() : String(garantia.creadaEn),
    actualizadaEn: garantia.actualizadaEn instanceof Date ? garantia.actualizadaEn.toISOString() : String(garantia.actualizadaEn),
  };
}

export function registerGuaranteesRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    const authGuard = requireAuth(['ADMIN', 'OPERADOR']);

    // 1. Listar garantías con filtros
    app.get<{
      Querystring: {
        propiedadId?: string;
        reservaId?: string;
        estado?: string;
        search?: string;
      };
    }>('/api/garantias', { preHandler: authGuard }, async (request, reply) => {
      const { propiedadId, reservaId, estado, search } = request.query;

      const where: Prisma.GarantiaWhereInput = {};

      if (reservaId) {
        where.reservaId = reservaId;
      }

      if (propiedadId) {
        where.reserva = {
          ...(where.reserva as Prisma.ReservaWhereInput),
          propiedadId,
        };
      }

      if (estado && estado !== 'TODOS') {
        if (!ALLOWED_ESTADOS_GARANTIA.includes(estado as EstadoGarantia)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `Estado de garantía inválido "${estado}".`,
              requestId: request.id,
            },
          });
        }
        where.estado = estado as EstadoGarantia;
      }

      if (search && search.trim()) {
        const term = search.trim();
        where.reserva = {
          ...(where.reserva as Prisma.ReservaWhereInput),
          OR: [
            { huesped: { nombreCompleto: { contains: term, mode: 'insensitive' } } },
            { propiedad: { nombre: { contains: term, mode: 'insensitive' } } },
          ],
        };
      }

      const garantias = await prisma.garantia.findMany({
        where,
        include: {
          reserva: {
            include: {
              propiedad: true,
              huesped: true,
            },
          },
          movimientos: {
            include: { actor: true },
            orderBy: { creadoEn: 'asc' },
          },
        },
        orderBy: { creadaEn: 'desc' },
      });

      return reply.send({
        data: garantias.map(formatGuaranteeResponse),
      });
    });

    // 2. Obtener garantía por ID
    app.get<{
      Params: { id: string };
    }>('/api/garantias/:id', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;

      const garantia = await prisma.garantia.findUnique({
        where: { id },
        include: {
          reserva: {
            include: {
              propiedad: true,
              huesped: true,
            },
          },
          movimientos: {
            include: { actor: true },
            orderBy: { creadoEn: 'asc' },
          },
        },
      });

      if (!garantia) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `La garantía con identificador "${id}" no existe.`,
            requestId: request.id,
          },
        });
      }

      return reply.send({ data: formatGuaranteeResponse(garantia) });
    });

    // 3. Obtener garantía de una reserva
    app.get<{
      Params: { id: string };
    }>('/api/reservas/:id/garantia', { preHandler: authGuard }, async (request, reply) => {
      const { id: reservaId } = request.params;

      const reserva = await prisma.reserva.findUnique({ where: { id: reservaId } });
      if (!reserva) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `La reserva "${reservaId}" no existe.`, requestId: request.id },
        });
      }

      const garantia = await prisma.garantia.findUnique({
        where: { reservaId },
        include: {
          reserva: {
            include: {
              propiedad: true,
              huesped: true,
            },
          },
          movimientos: {
            include: { actor: true },
            orderBy: { creadoEn: 'asc' },
          },
        },
      });

      if (!garantia) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `La reserva "${reservaId}" no tiene ninguna garantía registrada.`,
            requestId: request.id,
          },
        });
      }

      return reply.send({ data: formatGuaranteeResponse(garantia) });
    });

    // 4. Crear garantía inicial con movimiento de RECEPCIÓN atómico (HU-06)
    app.post<{
      Body: {
        reservaId: string;
        importe: string;
        moneda: string;
        motivo?: string;
        metodoRecepcion?: string;
        idempotencyKey?: string;
      };
    }>('/api/garantias', { preHandler: authGuard }, async (request, reply) => {
      const { reservaId, importe, moneda, motivo, idempotencyKey } = request.body || {};

      if (!reservaId || typeof reservaId !== 'string') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El campo "reservaId" es obligatorio.', requestId: request.id },
        });
      }

      if (!importe || typeof importe !== 'string' || !DECIMAL_REGEX.test(importe.trim())) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El importe debe ser una cadena decimal positiva con hasta 2 decimales (ej: "500.00").',
            requestId: request.id,
          },
        });
      }

      const montoDecimal = new Prisma.Decimal(importe.trim());
      if (montoDecimal.lessThanOrEqualTo(0)) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El importe de garantía debe ser estrictamente positivo.', requestId: request.id },
        });
      }

      if (!moneda || typeof moneda !== 'string') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El campo "moneda" es obligatorio.', requestId: request.id },
        });
      }

      // Validar existencia de reserva y coherencia de moneda
      const reserva = await prisma.reserva.findUnique({
        where: { id: reservaId },
        include: { garantia: true, propiedad: true, huesped: true },
      });

      if (!reserva) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `La reserva "${reservaId}" no existe.`, requestId: request.id },
        });
      }

      const monedaNormalizada = moneda.toUpperCase().trim();
      if (reserva.moneda.toUpperCase() !== monedaNormalizada) {
        return reply.status(400).send({
          error: {
            code: 'CURRENCY_MISMATCH',
            message: `La moneda de la garantía (${monedaNormalizada}) no coincide con la moneda de la reserva (${reserva.moneda}).`,
            requestId: request.id,
          },
        });
      }

      // Invariante de negocio: exactamente UNA garantía por reserva
      if (reserva.garantia) {
        return reply.status(409).send({
          error: {
            code: 'GUARANTEE_ALREADY_EXISTS',
            message: `La reserva "${reservaId}" ya cuenta con una garantía registrada (${reserva.garantia.id}).`,
            requestId: request.id,
          },
        });
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorId = resolveDomainActor(request, reply);
      if (actorId === null) return;
      const motivoRecepcion = motivo && motivo.trim()
        ? motivo.trim()
        : `Recepción inicial de depósito de garantía en custodia para reserva ${reservaId}.`;

      try {
        const nuevaGarantia = await prisma.$transaction(async (tx) => {
          // 1. Crear registro de Garantia
          const garantia = await tx.garantia.create({
            data: {
              reservaId,
              moneda: monedaNormalizada,
              montoTotal: montoDecimal,
              estado: 'EN_CUSTODIA',
            },
          });

          // 2. Crear Movimiento inicial de RECEPCIÓN atómico
          await tx.movimientoGarantia.create({
            data: {
              garantiaId: garantia.id,
              tipo: 'RECEPCION',
              monto: montoDecimal,
              motivo: motivoRecepcion,
              actorId,
              idempotencyKey: idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : null,
            },
          });

          // 3. Registrar auditoría atómica
          await recordAuditEvent(tx, {
            entidad: 'Garantia',
            entidadId: garantia.id,
            accion: 'GARANTIA_CREADA',
            actor: actorEmail,
            motivo: `Creación y recepción atómica de garantía en custodia por ${montoDecimal} ${monedaNormalizada}.`,
            detalles: {
              reservaId,
              montoTotal: montoDecimal.toFixed(2),
              moneda: monedaNormalizada,
            },
            requestId: request.id,
          });

          return tx.garantia.findUniqueOrThrow({
            where: { id: garantia.id },
            include: {
              reserva: { include: { propiedad: true, huesped: true } },
              movimientos: { include: { actor: true }, orderBy: { creadoEn: 'asc' } },
            },
          });
        });

        return reply.status(201).send({ data: formatGuaranteeResponse(nuevaGarantia) });
      } catch (err: any) {
        if (err.code === 'P2002') {
          return reply.status(409).send({
            error: {
              code: 'CONFLICT',
              message: 'Conflicto de unicidad: la garantía o clave de idempotencia ya existe.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });

    // 5. Registrar movimiento de custodia (RETENCIÓN, DEVOLUCIÓN PARCIAL, DEVOLUCIÓN TOTAL)
    app.post<{
      Params: { id: string };
      Body: {
        tipo: 'RETENCION' | 'DEVOLUCION_PARCIAL' | 'DEVOLUCION_TOTAL';
        importe: string;
        motivo: string;
        documentoSoporte?: string;
        idempotencyKey?: string;
      };
    }>('/api/garantias/:id/movimientos', { preHandler: authGuard }, async (request, reply) => {
      const { id: garantiaId } = request.params;
      const { tipo, importe, motivo, documentoSoporte, idempotencyKey } = request.body || {};

      if (!tipo || !['RETENCION', 'DEVOLUCION_PARCIAL', 'DEVOLUCION_TOTAL'].includes(tipo)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El tipo de movimiento debe ser "RETENCION", "DEVOLUCION_PARCIAL" o "DEVOLUCION_TOTAL".',
            requestId: request.id,
          },
        });
      }

      if (!importe || typeof importe !== 'string' || !DECIMAL_REGEX.test(importe.trim())) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El importe debe ser una cadena decimal positiva con hasta 2 decimales (ej: "150.00").',
            requestId: request.id,
          },
        });
      }

      const montoMovimiento = new Prisma.Decimal(importe.trim());
      if (montoMovimiento.lessThanOrEqualTo(0)) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El importe del movimiento debe ser estrictamente positivo.', requestId: request.id },
        });
      }

      if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El motivo del movimiento es obligatorio para fines de justificación y auditoría.',
            requestId: request.id,
          },
        });
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorId = resolveDomainActor(request, reply);
      if (actorId === null) return;
      const safeIdempotencyKey = idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : null;

      try {
        const garantiaActualizada = await prisma.$transaction(async (tx) => {
          // Bloqueo pesimista de fila en PostgreSQL para evitar carreras concurrentes en la disposición de fondos
          const lockedRows: any[] = await tx.$queryRaw`
            SELECT id FROM "garantias" WHERE id = ${garantiaId} FOR UPDATE;
          `;

          if (!lockedRows || lockedRows.length === 0) {
            throw new Error('GUARANTEE_NOT_FOUND');
          }

          // Consultar el historial completo de movimientos para computar el balance actual verificado
          const movimientosActuales = await tx.movimientoGarantia.findMany({
            where: { garantiaId },
            orderBy: { creadoEn: 'asc' },
          });

          // Verificar si este movimiento ya fue registrado de forma idempotente con su payload canónico completo
          if (safeIdempotencyKey) {
            const movimientoExistente = await tx.movimientoGarantia.findUnique({
              where: { idempotencyKey: safeIdempotencyKey },
            });

            if (movimientoExistente) {
              const coincide = isMatchingGuaranteeMovementPayload(movimientoExistente, {
                garantiaId,
                tipo,
                importe,
                motivo,
                documentoSoporte,
              });

              if (coincide) {
                const garantiaCompleta = await tx.garantia.findUniqueOrThrow({
                  where: { id: garantiaId },
                  include: {
                    reserva: { include: { propiedad: true, huesped: true } },
                    movimientos: { include: { actor: true }, orderBy: { creadoEn: 'asc' } },
                  },
                });
                return { garantia: garantiaCompleta, idempotentReplay: true };
              }

              // Misma clave y payload diferente: 409 IDEMPOTENCY_CONFLICT
              const conflictErr = new Error('IDEMPOTENCY_CONFLICT');
              (conflictErr as any).code = 'IDEMPOTENCY_CONFLICT';
              throw conflictErr;
            }
          }

          const { totalRecibido, totalRetenido, totalDevuelto, saldoDisponible } = computeGuaranteeBalances(movimientosActuales);

          // Invariante financiero crítico: ningún movimiento puede exceder el saldo disponible
          if (montoMovimiento.greaterThan(saldoDisponible)) {
            const err = new Error('INSUFFICIENT_GUARANTEE_FUNDS');
            (err as any).saldoDisponible = saldoDisponible.toFixed(2);
            throw err;
          }

          // Para DEVOLUCION_TOTAL: el importe debe liquidar la totalidad del saldo restante
          if (tipo === 'DEVOLUCION_TOTAL') {
            if (!montoMovimiento.equals(saldoDisponible)) {
              const err = new Error('TOTAL_REFUND_AMOUNT_MISMATCH');
              (err as any).saldoDisponible = saldoDisponible.toFixed(2);
              throw err;
            }
          }

          // Registrar movimiento en el libro mayor append-only
          await tx.movimientoGarantia.create({
            data: {
              garantiaId,
              tipo,
              monto: montoMovimiento,
              motivo: motivo.trim(),
              documentoSoporte: documentoSoporte && documentoSoporte.trim() ? documentoSoporte.trim() : null,
              actorId,
              idempotencyKey: safeIdempotencyKey,
            },
          });

          // Recalcular saldo y nuevo estado de la garantía
          const nuevoRetenido = tipo === 'RETENCION' ? totalRetenido.add(montoMovimiento) : totalRetenido;
          const nuevoDevuelto = tipo.startsWith('DEVOLUCION') ? totalDevuelto.add(montoMovimiento) : totalDevuelto;
          const nuevoEstado = deriveGuaranteeState(totalRecibido, nuevoRetenido, nuevoDevuelto);

          // Actualizar estado en Garantia
          await tx.garantia.update({
            where: { id: garantiaId },
            data: { estado: nuevoEstado },
          });

          // Registrar auditoría atómica
          await recordAuditEvent(tx, {
            entidad: 'Garantia',
            entidadId: garantiaId,
            accion: `GARANTIA_${tipo}`,
            actor: actorEmail,
            motivo: motivo.trim(),
            detalles: {
              garantiaId,
              tipo,
              monto: montoMovimiento.toFixed(2),
              saldoAnterior: saldoDisponible.toFixed(2),
              saldoNuevo: saldoDisponible.minus(montoMovimiento).toFixed(2),
              nuevoEstado,
              documentoSoporte: documentoSoporte?.trim() || null,
            },
            requestId: request.id,
          });

          const garantiaFinal = await tx.garantia.findUniqueOrThrow({
            where: { id: garantiaId },
            include: {
              reserva: { include: { propiedad: true, huesped: true } },
              movimientos: { include: { actor: true }, orderBy: { creadoEn: 'asc' } },
            },
          });

          return { garantia: garantiaFinal, idempotentReplay: false };
        });

        const statusCode = garantiaActualizada.idempotentReplay ? 200 : 201;
        return reply.status(statusCode).send({
          data: formatGuaranteeResponse(garantiaActualizada.garantia),
          idempotentReplay: garantiaActualizada.idempotentReplay || undefined,
        });
      } catch (err: any) {
        if (err.message === 'GUARANTEE_NOT_FOUND') {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `La garantía "${garantiaId}" no existe.`, requestId: request.id },
          });
        }
        if (err.message === 'INSUFFICIENT_GUARANTEE_FUNDS') {
          return reply.status(400).send({
            error: {
              code: 'INSUFFICIENT_FUNDS',
              message: `El importe solicitado (${montoMovimiento.toFixed(2)}) supera el saldo disponible en custodia (${err.saldoDisponible}).`,
              requestId: request.id,
            },
          });
        }
        if (err.message === 'TOTAL_REFUND_AMOUNT_MISMATCH') {
          return reply.status(400).send({
            error: {
              code: 'AMOUNT_MISMATCH',
              message: `Para una DEVOLUCIÓN TOTAL, el importe debe coincidir exactamente con el saldo disponible (${err.saldoDisponible}).`,
              requestId: request.id,
            },
          });
        }
        if (err.message === 'IDEMPOTENCY_CONFLICT' || err.code === 'IDEMPOTENCY_CONFLICT') {
          return reply.status(409).send({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada con una carga útil diferente (garantía, tipo, importe, motivo o documento de soporte).',
              requestId: request.id,
            },
          });
        }
        if (err.code === 'P2002') {
          // Si ocurrió colisión única en la clave de idempotencia por concurrencia
          if (safeIdempotencyKey) {
            const mov = await prisma.movimientoGarantia.findUnique({
              where: { idempotencyKey: safeIdempotencyKey },
            });
            if (
              mov &&
              isMatchingGuaranteeMovementPayload(mov, {
                garantiaId,
                tipo,
                importe,
                motivo,
                documentoSoporte,
              })
            ) {
              const garantiaCompleta = await prisma.garantia.findUnique({
                where: { id: garantiaId },
                include: {
                  reserva: { include: { propiedad: true, huesped: true } },
                  movimientos: { include: { actor: true }, orderBy: { creadoEn: 'asc' } },
                },
              });
              if (garantiaCompleta) {
                return reply.status(200).send({
                  data: formatGuaranteeResponse(garantiaCompleta),
                  idempotentReplay: true,
                });
              }
            }
          }
          return reply.status(409).send({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada para otro movimiento con diferente carga útil.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });
  };
}
