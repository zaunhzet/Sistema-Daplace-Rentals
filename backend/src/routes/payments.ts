import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma, type PrismaClient, type EstadoPago, type ConceptoPago, type MetodoPago } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth } from '../shared/auth.js';

const ALLOWED_ESTADOS_PAGO: EstadoPago[] = ['PENDIENTE_CONCILIACION', 'CONCILIADO', 'RECHAZADO'];
const ALLOWED_CONCEPTOS_PAGO: ConceptoPago[] = ['ADELANTO', 'SALDO', 'PAGO_TOTAL', 'PENALIDAD', 'OTRO'];
const ALLOWED_METODOS_PAGO: MetodoPago[] = ['TRANSFERENCIA', 'TARJETA', 'EFECTIVO', 'BILLETERA_DIGITAL', 'DEPOSITO', 'OTRO'];
const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida minuciosamente formato YYYY-MM-DD y existencia real en calendario UTC.
 */
function validateDateString(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Genera hash canónico para verificación estricta de idempotencia.
 */
function computePaymentPayloadHash(payload: {
  reservaId: string;
  monto: string;
  moneda: string;
  concepto: string;
  metodoPago: string;
  referencia: string;
  fechaPago: string;
}): string {
  const canonical = JSON.stringify({
    reservaId: payload.reservaId,
    monto: new Prisma.Decimal(payload.monto).toFixed(2),
    moneda: payload.moneda.toUpperCase().trim(),
    concepto: payload.concepto,
    metodoPago: payload.metodoPago,
    referencia: payload.referencia.trim(),
    fechaPago: payload.fechaPago,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Formatea un registro de Pago de Prisma al contrato esperado por el Frontend.
 */
export function formatPaymentResponse(pago: any) {
  const decimalMonto = new Prisma.Decimal(pago.monto);
  return {
    id: pago.id,
    reservaId: pago.reservaId,
    propiedadId: pago.reserva?.propiedadId || pago.reserva?.propiedad?.id || '',
    propiedadNombre: pago.reserva?.propiedad?.nombre || '',
    huespedId: pago.reserva?.huespedId || pago.reserva?.huesped?.id || '',
    huespedNombre: pago.reserva?.huesped?.nombreCompleto || '',
    importe: decimalMonto.toFixed(2),
    moneda: pago.moneda,
    concepto: pago.concepto,
    metodoPago: pago.metodoPago,
    referencia: pago.referenciaOperacion,
    estado: pago.estado,
    idempotencyKey: pago.idempotencyKey || undefined,
    fechaPago: pago.fechaPago instanceof Date ? pago.fechaPago.toISOString().slice(0, 10) : String(pago.fechaPago).slice(0, 10),
    registradoEn: pago.creadoEn instanceof Date ? pago.creadoEn.toISOString() : String(pago.creadoEn),
    conciliadoEn: pago.conciliadoEn ? (pago.conciliadoEn instanceof Date ? pago.conciliadoEn.toISOString() : String(pago.conciliadoEn)) : undefined,
    conciliadoPor: pago.conciliadoPor?.nombre || pago.conciliadoPorId || undefined,
    motivoRechazo: pago.motivoRechazo || undefined,
    rechazadoEn: pago.rechazadoEn ? (pago.rechazadoEn instanceof Date ? pago.rechazadoEn.toISOString() : String(pago.rechazadoEn)) : undefined,
    notas: pago.notas || undefined,
  };
}

export function registerPaymentsRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // Todas las operaciones financieras exigen rol administrativo (ADMIN u OPERADOR)
    const authGuard = requireAuth(['ADMIN', 'OPERADOR']);

    // 1. Listar pagos con filtros
    app.get<{
      Querystring: {
        propiedadId?: string;
        reservaId?: string;
        estado?: string;
        desde?: string;
        hasta?: string;
        search?: string;
      };
    }>('/api/pagos', { preHandler: authGuard }, async (request, reply) => {
      const { propiedadId, reservaId, estado, desde, hasta, search } = request.query;

      const where: Prisma.PagoWhereInput = {};

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
        if (!ALLOWED_ESTADOS_PAGO.includes(estado as EstadoPago)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `Estado de pago inválido "${estado}".`,
              requestId: request.id,
            },
          });
        }
        where.estado = estado as EstadoPago;
      }

      if (desde || hasta) {
        where.fechaPago = {};
        if (desde) {
          if (!validateDateString(desde)) {
            return reply.status(400).send({
              error: { code: 'VALIDATION_ERROR', message: `Fecha "desde" inválida (${desde}).`, requestId: request.id },
            });
          }
          where.fechaPago.gte = new Date(`${desde}T00:00:00.000Z`);
        }
        if (hasta) {
          if (!validateDateString(hasta)) {
            return reply.status(400).send({
              error: { code: 'VALIDATION_ERROR', message: `Fecha "hasta" inválida (${hasta}).`, requestId: request.id },
            });
          }
          where.fechaPago.lte = new Date(`${hasta}T00:00:00.000Z`);
        }
      }

      if (search && search.trim()) {
        const term = search.trim();
        where.OR = [
          { referenciaOperacion: { contains: term, mode: 'insensitive' } },
          { notas: { contains: term, mode: 'insensitive' } },
          {
            reserva: {
              OR: [
                { huesped: { nombreCompleto: { contains: term, mode: 'insensitive' } } },
                { propiedad: { nombre: { contains: term, mode: 'insensitive' } } },
              ],
            },
          },
        ];
      }

      const pagos = await prisma.pago.findMany({
        where,
        include: {
          reserva: {
            include: {
              propiedad: true,
              huesped: true,
            },
          },
          registradoPor: true,
          conciliadoPor: true,
        },
        orderBy: { creadoEn: 'desc' },
      });

      return reply.send({
        data: pagos.map(formatPaymentResponse),
      });
    });

    // 2. Obtener pago por ID
    app.get<{
      Params: { id: string };
    }>('/api/pagos/:id', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;

      const pago = await prisma.pago.findUnique({
        where: { id },
        include: {
          reserva: {
            include: {
              propiedad: true,
              huesped: true,
            },
          },
          registradoPor: true,
          conciliadoPor: true,
        },
      });

      if (!pago) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `El pago con identificador "${id}" no existe.`,
            requestId: request.id,
          },
        });
      }

      return reply.send({ data: formatPaymentResponse(pago) });
    });

    // 3. Obtener pagos de una reserva
    app.get<{
      Params: { id: string };
    }>('/api/reservas/:id/pagos', { preHandler: authGuard }, async (request, reply) => {
      const { id: reservaId } = request.params;

      const reserva = await prisma.reserva.findUnique({ where: { id: reservaId } });
      if (!reserva) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `La reserva "${reservaId}" no existe.`, requestId: request.id },
        });
      }

      const pagos = await prisma.pago.findMany({
        where: { reservaId },
        include: {
          reserva: {
            include: {
              propiedad: true,
              huesped: true,
            },
          },
          registradoPor: true,
          conciliadoPor: true,
        },
        orderBy: { creadoEn: 'desc' },
      });

      return reply.send({ data: pagos.map(formatPaymentResponse) });
    });

    // 4. Resumen financiero de una reserva (HU-05)
    app.get<{
      Params: { id: string };
    }>('/api/reservas/:id/resumen-financiero', { preHandler: authGuard }, async (request, reply) => {
      const { id: reservaId } = request.params;

      const reserva = await prisma.reserva.findUnique({
        where: { id: reservaId },
        include: { pagos: true },
      });

      if (!reserva) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `La reserva "${reservaId}" no existe.`, requestId: request.id },
        });
      }

      const montoAcordado = new Prisma.Decimal(reserva.montoAcordado);

      // Regla innegociable: SOLO los pagos CONCILIADOS reducen el saldo de alquiler
      let totalConciliado = new Prisma.Decimal(0);
      let totalPendiente = new Prisma.Decimal(0);

      for (const p of reserva.pagos) {
        if (p.estado === 'CONCILIADO') {
          totalConciliado = totalConciliado.add(p.monto);
        } else if (p.estado === 'PENDIENTE_CONCILIACION') {
          totalPendiente = totalPendiente.add(p.monto);
        }
      }

      const tieneSobrepago = totalConciliado.greaterThan(montoAcordado);
      const montoSobrepago = tieneSobrepago ? totalConciliado.minus(montoAcordado) : new Prisma.Decimal(0);
      const saldoPendiente = totalConciliado.greaterThanOrEqualTo(montoAcordado)
        ? new Prisma.Decimal(0)
        : montoAcordado.minus(totalConciliado);

      return reply.send({
        data: {
          reservaId: reserva.id,
          moneda: reserva.moneda,
          montoAcordado: montoAcordado.toFixed(2),
          totalPagosConciliados: totalConciliado.toFixed(2),
          totalPagosPendientes: totalPendiente.toFixed(2),
          saldoPendiente: saldoPendiente.toFixed(2),
          tieneSobrepago,
          montoSobrepago: montoSobrepago.toFixed(2),
          alertaSobrepago: tieneSobrepago
            ? `ALERTA DE SOBREPAGO: Los pagos conciliados (${totalConciliado.toFixed(2)} ${reserva.moneda}) superan el monto acordado (${montoAcordado.toFixed(2)} ${reserva.moneda}) por ${montoSobrepago.toFixed(2)} ${reserva.moneda}.`
            : undefined,
        },
      });
    });

    // 5. Registrar pago (HU-05) con Idempotencia y Auditoría
    app.post<{
      Body: {
        reservaId: string;
        importe: string;
        moneda: string;
        concepto: string;
        metodoPago: string;
        referencia: string;
        fechaPago: string;
        idempotencyKey?: string;
        notas?: string;
      };
    }>('/api/pagos', { preHandler: authGuard }, async (request, reply) => {
      const {
        reservaId,
        importe,
        moneda,
        concepto,
        metodoPago,
        referencia,
        fechaPago,
        idempotencyKey,
        notas,
      } = request.body || {};

      // A. Validaciones sintácticas
      if (!reservaId || typeof reservaId !== 'string') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El campo "reservaId" es obligatorio.', requestId: request.id },
        });
      }

      if (!importe || typeof importe !== 'string' || !DECIMAL_REGEX.test(importe.trim())) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El importe debe ser una cadena decimal válida con hasta 2 decimales (ej: "500.00").',
            requestId: request.id,
          },
        });
      }

      const montoDecimal = new Prisma.Decimal(importe.trim());
      if (montoDecimal.lessThanOrEqualTo(0)) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El importe de pago debe ser estrictamente positivo.', requestId: request.id },
        });
      }

      if (!moneda || typeof moneda !== 'string') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El campo "moneda" es obligatorio.', requestId: request.id },
        });
      }

      if (!concepto || !ALLOWED_CONCEPTOS_PAGO.includes(concepto as ConceptoPago)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Concepto de pago inválido. Permitidos: ${ALLOWED_CONCEPTOS_PAGO.join(', ')}.`,
            requestId: request.id,
          },
        });
      }

      if (!metodoPago || !ALLOWED_METODOS_PAGO.includes(metodoPago as MetodoPago)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Método de pago inválido. Permitidos: ${ALLOWED_METODOS_PAGO.join(', ')}.`,
            requestId: request.id,
          },
        });
      }

      if (!referencia || typeof referencia !== 'string' || referencia.trim() === '') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La referencia u operación de pago es obligatoria.',
            requestId: request.id,
          },
        });
      }

      if (!fechaPago || typeof fechaPago !== 'string' || !validateDateString(fechaPago.trim())) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La fecha de pago debe ser una fecha válida en formato YYYY-MM-DD.',
            requestId: request.id,
          },
        });
      }

      // B. Validar reserva y moneda coincidente
      const reserva = await prisma.reserva.findUnique({
        where: { id: reservaId },
        include: { propiedad: true, huesped: true },
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
            message: `La moneda del pago (${monedaNormalizada}) no coincide con la moneda de la reserva (${reserva.moneda}).`,
            requestId: request.id,
          },
        });
      }

      // C. Verificación de Idempotencia en PostgreSQL
      const safeIdempotencyKey = idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : null;
      let payloadHash: string | null = null;

      if (safeIdempotencyKey) {
        payloadHash = computePaymentPayloadHash({
          reservaId,
          monto: importe,
          moneda: monedaNormalizada,
          concepto,
          metodoPago,
          referencia,
          fechaPago: fechaPago.trim(),
        });

        const pagoExistente = await prisma.pago.findUnique({
          where: { idempotencyKey: safeIdempotencyKey },
          include: {
            reserva: { include: { propiedad: true, huesped: true } },
            registradoPor: true,
            conciliadoPor: true,
          },
        });

        if (pagoExistente) {
          // Idempotencia confirmada: mismo key y mismo payload canónico
          if (pagoExistente.payloadHash === payloadHash) {
            return reply.status(200).send({
              data: formatPaymentResponse(pagoExistente),
              idempotentReplay: true,
            });
          }
          // Conflicto de idempotencia: mismo key con payload distinto
          return reply.status(409).send({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada con un contenido de pago diferente.',
              requestId: request.id,
            },
          });
        }
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorId = request.user?.id || null;

      try {
        const nuevoPago = await prisma.$transaction(async (tx) => {
          const pago = await tx.pago.create({
            data: {
              reservaId,
              monto: montoDecimal,
              moneda: monedaNormalizada,
              concepto: concepto as ConceptoPago,
              metodoPago: metodoPago as MetodoPago,
              referenciaOperacion: referencia.trim(),
              fechaPago: new Date(`${fechaPago.trim()}T00:00:00.000Z`),
              estado: 'PENDIENTE_CONCILIACION',
              idempotencyKey: safeIdempotencyKey,
              payloadHash,
              registradoPorId: actorId,
              notas: notas ? notas.trim() : null,
            },
            include: {
              reserva: { include: { propiedad: true, huesped: true } },
              registradoPor: true,
              conciliadoPor: true,
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'Pago',
            entidadId: pago.id,
            accion: 'PAGO_REGISTRADO',
            actor: actorEmail,
            motivo: `Registro de pago ${pago.monto} ${pago.moneda} en estado PENDIENTE_CONCILIACION.`,
            detalles: {
              reservaId,
              monto: montoDecimal.toFixed(2),
              moneda: monedaNormalizada,
              referencia: referencia.trim(),
              metodoPago,
              concepto,
              idempotencyKey: safeIdempotencyKey,
            },
            requestId: request.id,
          });

          return pago;
        });

        return reply.status(201).send({
          data: formatPaymentResponse(nuevoPago),
        });
      } catch (err: any) {
        // Manejar condición de carrera en concurrencia con misma clave de idempotencia
        if (err.code === 'P2002' && safeIdempotencyKey) {
          const pagoConcurrente = await prisma.pago.findUnique({
            where: { idempotencyKey: safeIdempotencyKey },
            include: {
              reserva: { include: { propiedad: true, huesped: true } },
              registradoPor: true,
              conciliadoPor: true,
            },
          });
          if (pagoConcurrente && pagoConcurrente.payloadHash === payloadHash) {
            return reply.status(200).send({
              data: formatPaymentResponse(pagoConcurrente),
              idempotentReplay: true,
            });
          }
          return reply.status(409).send({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada por una solicitud concurrente.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });

    // 6. Conciliar pago (HU-05)
    app.post<{
      Params: { id: string };
      Body: {
        referencia?: string;
        notas?: string;
      };
    }>('/api/pagos/:id/conciliar', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;
      const { referencia, notas } = request.body || {};

      const pagoExistente = await prisma.pago.findUnique({
        where: { id },
        include: {
          reserva: { include: { propiedad: true, huesped: true } },
          registradoPor: true,
          conciliadoPor: true,
        },
      });

      if (!pagoExistente) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `El pago "${id}" no existe.`, requestId: request.id },
        });
      }

      // Si ya está conciliado: respuesta idempotente sin alterar montos ni fechas históricas
      if (pagoExistente.estado === 'CONCILIADO') {
        return reply.status(200).send({
          data: formatPaymentResponse(pagoExistente),
          idempotentReplay: true,
        });
      }

      // Si está rechazado: no se permite conciliación directa
      if (pagoExistente.estado === 'RECHAZADO') {
        return reply.status(400).send({
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: 'Un pago rechazado no puede ser conciliado directamente. Debe registrarse un nuevo pago válido.',
            requestId: request.id,
          },
        });
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorId = request.user?.id || null;
      const now = new Date();

      const pagoConciliado = await prisma.$transaction(async (tx) => {
        const actualizado = await tx.pago.update({
          where: { id },
          data: {
            estado: 'CONCILIADO',
            conciliadoPorId: actorId,
            conciliadoEn: now,
            referenciaOperacion: referencia && referencia.trim() ? referencia.trim() : undefined,
            notas: notas && notas.trim()
              ? pagoExistente.notas
                ? `${pagoExistente.notas} | Conciliación: ${notas.trim()}`
                : notas.trim()
              : undefined,
          },
          include: {
            reserva: { include: { propiedad: true, huesped: true } },
            registradoPor: true,
            conciliadoPor: true,
          },
        });

        await recordAuditEvent(tx, {
          entidad: 'Pago',
          entidadId: id,
          accion: 'PAGO_CONCILIADO',
          actor: actorEmail,
          motivo: `Pago por ${actualizado.monto} ${actualizado.moneda} conciliado formalmente.`,
          detalles: {
            pagoId: id,
            monto: new Prisma.Decimal(actualizado.monto).toFixed(2),
            moneda: actualizado.moneda,
            conciliadoPor: actorEmail,
            conciliadoEn: now.toISOString(),
          },
          requestId: request.id,
        });

        return actualizado;
      });

      return reply.send({ data: formatPaymentResponse(pagoConciliado) });
    });

    // 7. Rechazar pago (HU-05)
    app.post<{
      Params: { id: string };
      Body: {
        motivo: string;
      };
    }>('/api/pagos/:id/rechazar', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;
      const { motivo } = request.body || {};

      if (!motivo || typeof motivo !== 'string' || motivo.trim() === '') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El motivo de rechazo es obligatorio para registrar la operación.',
            requestId: request.id,
          },
        });
      }

      const pagoExistente = await prisma.pago.findUnique({
        where: { id },
        include: {
          reserva: { include: { propiedad: true, huesped: true } },
          registradoPor: true,
          conciliadoPor: true,
        },
      });

      if (!pagoExistente) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `El pago "${id}" no existe.`, requestId: request.id },
        });
      }

      // No permitir rechazo de pagos ya conciliados sin proceso contable formal
      if (pagoExistente.estado === 'CONCILIADO') {
        return reply.status(409).send({
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: 'No se puede rechazar un pago previamente conciliado sin una política de reversa contable formal.',
            requestId: request.id,
          },
        });
      }

      // Si ya está rechazado: respuesta idempotente
      if (pagoExistente.estado === 'RECHAZADO') {
        return reply.status(200).send({
          data: formatPaymentResponse(pagoExistente),
          idempotentReplay: true,
        });
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const now = new Date();

      const pagoRechazado = await prisma.$transaction(async (tx) => {
        const actualizado = await tx.pago.update({
          where: { id },
          data: {
            estado: 'RECHAZADO',
            motivoRechazo: motivo.trim(),
            rechazadoEn: now,
          },
          include: {
            reserva: { include: { propiedad: true, huesped: true } },
            registradoPor: true,
            conciliadoPor: true,
          },
        });

        await recordAuditEvent(tx, {
          entidad: 'Pago',
          entidadId: id,
          accion: 'PAGO_RECHAZADO',
          actor: actorEmail,
          motivo: `Pago rechazado: ${motivo.trim()}`,
          detalles: {
            pagoId: id,
            monto: new Prisma.Decimal(actualizado.monto).toFixed(2),
            moneda: actualizado.moneda,
            motivoRechazo: motivo.trim(),
            rechazadoEn: now.toISOString(),
          },
          requestId: request.id,
        });

        return actualizado;
      });

      return reply.send({ data: formatPaymentResponse(pagoRechazado) });
    });
  };
}
