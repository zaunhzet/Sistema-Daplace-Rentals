import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma, type PrismaClient, type EstadoPago, type ConceptoPago, type MetodoPago, type BeneficiarioPago } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth, resolveDomainActorFromDb } from '../shared/auth.js';
import { formatEvidenciaResponse, validateUrl } from './payment-evidences.js';

const ALLOWED_ESTADOS_PAGO: EstadoPago[] = ['PENDIENTE_CONCILIACION', 'CONCILIADO', 'RECHAZADO'];
const ALLOWED_CONCEPTOS_PAGO: ConceptoPago[] = ['ADELANTO', 'SALDO', 'PAGO_TOTAL', 'PENALIDAD', 'OTRO'];
const ALLOWED_METODOS_PAGO: MetodoPago[] = ['TRANSFERENCIA', 'TARJETA', 'EFECTIVO', 'BILLETERA_DIGITAL', 'DEPOSITO', 'OTRO'];
const ALLOWED_BENEFICIARIOS_PAGO: BeneficiarioPago[] = ['DAPLACE', 'PROPIETARIO', 'OTRO'];
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

export interface ProcessedAccountReference {
  mask: string | null;
  fingerprint: string | null;
}

/**
 * Resuelve y valida la clave secreta para la derivación de huella HMAC en referencias bancarias.
 * Precedencia:
 * 1. Si BANK_ACCOUNT_HMAC_SECRET está definida (incluso vacía o con espacios), se evalúa como principal.
 *    No se recurre al alias si la variable principal fue configurada de forma inválida.
 * 2. Si BANK_ACCOUNT_HMAC_SECRET es estrictamente undefined, se evalúa PAYMENT_HMAC_SECRET.
 */
export function resolveHmacSecret(): string {
  const primary = process.env.BANK_ACCOUNT_HMAC_SECRET;
  const alias = process.env.PAYMENT_HMAC_SECRET;

  const candidate = primary !== undefined ? primary : alias;

  if (candidate === undefined) {
    const err: any = new Error(
      'Falta la clave secreta requerida (BANK_ACCOUNT_HMAC_SECRET) para procesar y calcular la huella segura de referencias bancarias completas.'
    );
    err.code = 'MISSING_CONFIGURATION';
    throw err;
  }

  // Rechazar secreto compuesto exclusivamente de espacios (sin corregir silenciosamente mediante trim)
  if (/^\s*$/.test(candidate)) {
    const err: any = new Error(
      'La clave secreta para referencias bancarias es inválida: no puede estar vacía ni compuesta exclusivamente de espacios.'
    );
    err.code = 'INVALID_CONFIGURATION';
    throw err;
  }

  // Rechazar secretos con menos de 32 bytes efectivos
  const byteLength = Buffer.byteLength(candidate, 'utf8');
  if (byteLength < 32) {
    const err: any = new Error(
      `La clave secreta para referencias bancarias es insegura: debe contar con al menos 32 bytes efectivos (proporcionados: ${byteLength} bytes).`
    );
    err.code = 'INVALID_CONFIGURATION';
    throw err;
  }

  return candidate;
}

/**
 * Valida, normaliza y procesa una referencia de cuenta bancaria.
 * - Formato enmascarado estricto documentado: ****DDDD (exactamente 4 asteriscos seguidos de 4 dígitos).
 * - Rechaza cadenas ambiguas o parcialmente enmascaradas (p. ej. cadenas con * que no cumplan el formato estricto).
 * - Si es referencia completa: normaliza y calcula huella HMAC-SHA256 con clave secreta estable sin almacenar la cuenta completa.
 */
export function processAccountReference(rawRef?: string | null): ProcessedAccountReference {
  if (!rawRef || typeof rawRef !== 'string') {
    return { mask: null, fingerprint: null };
  }
  const trimmed = rawRef.trim();
  if (!trimmed) {
    return { mask: null, fingerprint: null };
  }

  // 1. Detección y validación de formato previamente enmascarado
  if (trimmed.includes('*')) {
    const STRICT_MASK_REGEX = /^\*{4}\d{4}$/;
    if (!STRICT_MASK_REGEX.test(trimmed)) {
      const err: any = new Error(
        'La referencia de cuenta enmascarada debe tener el formato estricto "****DDDD" (4 asteriscos seguidos de 4 dígitos). Cadenas mixtas, ambiguas o parcialmente enmascaradas no están permitidas.'
      );
      err.code = 'INVALID_ACCOUNT_REFERENCE';
      throw err;
    }
    return {
      mask: trimmed,
      fingerprint: `MASK:${trimmed}`,
    };
  }

  // 2. Referencia completa: normalización removiendo separadores habituales
  const clean = trimmed.replace(/[\s\-_.]/g, '');
  if (clean.length < 4 || !/^[A-Za-z0-9]{4,34}$/.test(clean)) {
    const err: any = new Error(
      'La referencia de cuenta completa debe contener entre 4 y 34 caracteres alfanuméricos válidos.'
    );
    err.code = 'INVALID_ACCOUNT_REFERENCE';
    throw err;
  }

  const secretKey = resolveHmacSecret();
  const hmac = crypto.createHmac('sha256', secretKey).update(clean.toUpperCase()).digest('hex');
  const mask = `****${clean.slice(-4)}`;

  return {
    mask,
    fingerprint: `FINGERPRINT:${hmac}`,
  };
}

/**
 * Sanitiza y enmascara la referencia bancaria para no almacenar ni exponer referencias completas.
 */
export function maskRestrictedAccountReference(rawRef?: string | null): string | null {
  try {
    const result = processAccountReference(rawRef);
    return result.mask;
  } catch {
    return null;
  }
}

export interface PaymentPayloadForHash {
  reservaId: string;
  monto: string;
  moneda: string;
  concepto: string;
  metodoPago: string;
  referencia: string;
  fechaPago: string;
  notas?: string | null;
  beneficiarioTipo?: string | null;
  beneficiarioNombre?: string | null;
  bancoReceptor?: string | null;
  cuentaReferencia?: string | null;
  cuentaReferenciaMask?: string | null;
  cuentaReferenciaFingerprint?: string | null;
  evidencias?: Array<{
    tipo?: string | null;
    nombreArchivo: string;
    referenciaDocumental?: string | null;
    url?: string | null;
    notas?: string | null;
  }> | null;
}

/**
 * Genera hash canónico para verificación estricta de idempotencia.
 * Versiona el hash canónico (v2) cuando existen campos de DR-01 sin invalidar solicitudes históricas (v1).
 */
export function computePaymentPayloadHash(payload: PaymentPayloadForHash): string {
  const hasDr01 = Boolean(
    payload.beneficiarioTipo ||
    payload.beneficiarioNombre ||
    payload.bancoReceptor ||
    payload.cuentaReferenciaMask ||
    payload.cuentaReferenciaFingerprint ||
    payload.cuentaReferencia ||
    (payload.evidencias && payload.evidencias.length > 0)
  );

  if (!hasDr01) {
    // Hash canónico compatible v1 para pagos históricos
    const legacyCanonical = JSON.stringify({
      reservaId: payload.reservaId,
      monto: new Prisma.Decimal(payload.monto).toFixed(2),
      moneda: payload.moneda.toUpperCase().trim(),
      concepto: payload.concepto,
      metodoPago: payload.metodoPago,
      referencia: payload.referencia.trim(),
      fechaPago: payload.fechaPago,
    });
    return crypto.createHash('sha256').update(legacyCanonical).digest('hex');
  }

  // Hash canónico versionado v2 con normalización determinista exhaustiva (H4)
  const normalizedEvidencias = (payload.evidencias || [])
    .map((e) => ({
      tipo: e.tipo && e.tipo.trim() ? e.tipo.trim() : 'VOUCHER',
      nombreArchivo: e.nombreArchivo.trim(),
      referenciaDocumental: e.referenciaDocumental ? e.referenciaDocumental.trim() : null,
      url: e.url ? e.url.trim() : null,
      notas: e.notas ? e.notas.trim() : null,
    }))
    .sort((a, b) =>
      a.nombreArchivo.localeCompare(b.nombreArchivo) ||
      (a.referenciaDocumental || '').localeCompare(b.referenciaDocumental || '') ||
      (a.tipo || '').localeCompare(b.tipo || '') ||
      (a.url || '').localeCompare(b.url || '') ||
      (a.notas || '').localeCompare(b.notas || '')
    );

  const effectiveCuentaMask = payload.cuentaReferenciaMask || (payload.cuentaReferencia ? payload.cuentaReferencia.trim() : null);

  const v2Canonical = JSON.stringify({
    version: 'v2',
    reservaId: payload.reservaId,
    monto: new Prisma.Decimal(payload.monto).toFixed(2),
    moneda: payload.moneda.toUpperCase().trim(),
    concepto: payload.concepto,
    metodoPago: payload.metodoPago,
    referencia: payload.referencia.trim(),
    fechaPago: payload.fechaPago,
    beneficiarioTipo: payload.beneficiarioTipo ? payload.beneficiarioTipo.trim() : null,
    beneficiarioNombre: payload.beneficiarioNombre ? payload.beneficiarioNombre.trim() : null,
    bancoReceptor: payload.bancoReceptor ? payload.bancoReceptor.trim() : null,
    cuentaReferencia: effectiveCuentaMask,
    cuentaReferenciaFingerprint: payload.cuentaReferenciaFingerprint || null,
    notas: payload.notas ? payload.notas.trim() : null,
    evidencias: normalizedEvidencias,
  });
  return crypto.createHash('sha256').update(v2Canonical).digest('hex');
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
    beneficiarioTipo: pago.beneficiarioTipo || undefined,
    beneficiario: pago.beneficiarioTipo || undefined,
    beneficiarioNombre: pago.beneficiarioNombre || undefined,
    bancoReceptor: pago.bancoReceptor || undefined,
    cuentaReferencia: pago.cuentaReferencia || undefined,
    evidencias: Array.isArray(pago.evidencias)
      ? pago.evidencias.map(formatEvidenciaResponse)
      : undefined,
  };
}

export const PAYMENT_INCLUDES = {
  reserva: {
    include: {
      propiedad: true,
      huesped: true,
    },
  },
  registradoPor: true,
  conciliadoPor: true,
  evidencias: {
    include: {
      registradoPor: true,
    },
    orderBy: {
      creadoEn: 'desc' as const,
    },
  },
};

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
        include: PAYMENT_INCLUDES,
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
        include: PAYMENT_INCLUDES,
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
        include: PAYMENT_INCLUDES,
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
        beneficiarioTipo?: string;
        beneficiario?: string;
        beneficiarioNombre?: string;
        bancoReceptor?: string;
        cuentaReferencia?: string;
        evidencias?: Array<{
          nombreArchivo: string;
          referenciaDocumental?: string;
          url?: string;
          tipo?: string;
          estado?: string;
          notas?: string;
        }>;
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
        beneficiarioTipo,
        beneficiario,
        beneficiarioNombre,
        bancoReceptor,
        cuentaReferencia,
        evidencias,
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

      // Validaciones específicas DR-01
      const rawBeneficiario = (beneficiarioTipo || beneficiario)?.trim();
      let resolvedBeneficiario: BeneficiarioPago | null = null;
      if (rawBeneficiario) {
        const upper = rawBeneficiario.toUpperCase() as BeneficiarioPago;
        if (!ALLOWED_BENEFICIARIOS_PAGO.includes(upper)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `Beneficiario de pago inválido. Permitidos: ${ALLOWED_BENEFICIARIOS_PAGO.join(', ')}.`,
              requestId: request.id,
            },
          });
        }
        resolvedBeneficiario = upper;
      }

      const safeBeneficiarioNombre =
        beneficiarioNombre && typeof beneficiarioNombre === 'string' && beneficiarioNombre.trim() !== ''
          ? beneficiarioNombre.trim()
          : null;

      const safeBanco =
        bancoReceptor && typeof bancoReceptor === 'string' && bancoReceptor.trim() !== ''
          ? bancoReceptor.trim()
          : null;

      // Procesar y proteger referencia bancaria (H2/H3)
      let processedAccount: ProcessedAccountReference = { mask: null, fingerprint: null };
      if (cuentaReferencia && typeof cuentaReferencia === 'string' && cuentaReferencia.trim() !== '') {
        try {
          processedAccount = processAccountReference(cuentaReferencia);
        } catch (err: any) {
          if (err.code === 'INVALID_ACCOUNT_REFERENCE') {
            return reply.status(400).send({
              error: {
                code: 'INVALID_ACCOUNT_REFERENCE',
                message: err.message,
                requestId: request.id,
              },
            });
          }
          if (err.code === 'MISSING_CONFIGURATION' || err.code === 'INVALID_CONFIGURATION') {
            return reply.status(500).send({
              error: {
                code: err.code,
                message: err.message,
                requestId: request.id,
              },
            });
          }
          throw err;
        }
      }

      const safeCuentaRef = processedAccount.mask;

      // Validar evidencias adjuntas en la solicitud de creación
      if (Array.isArray(evidencias) && evidencias.length > 0) {
        for (const ev of evidencias) {
          if (ev.estado && ev.estado.toUpperCase() === 'VALIDADA') {
            return reply.status(400).send({
              error: {
                code: 'FORBIDDEN_STATE',
                message:
                  'No se permite establecer el estado VALIDADA directamente desde el cliente. Las evidencias documentales se registran exclusivamente en estado REFERENCIADA.',
                requestId: request.id,
              },
            });
          }
          if (!ev.nombreArchivo || typeof ev.nombreArchivo !== 'string' || ev.nombreArchivo.trim().length < 2) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Cada evidencia documental debe contar con un nombre de archivo válido (mínimo 2 caracteres).',
                requestId: request.id,
              },
            });
          }
          if (ev.url && typeof ev.url === 'string' && ev.url.trim() !== '' && !validateUrl(ev.url.trim())) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: `La URL proporcionada para la evidencia "${ev.nombreArchivo}" no tiene un esquema HTTP/HTTPS válido.`,
                requestId: request.id,
              },
            });
          }
        }
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
          notas: notas ? notas.trim() : null,
          beneficiarioTipo: resolvedBeneficiario,
          beneficiarioNombre: safeBeneficiarioNombre,
          bancoReceptor: safeBanco,
          cuentaReferenciaMask: processedAccount.mask,
          cuentaReferenciaFingerprint: processedAccount.fingerprint,
          evidencias: Array.isArray(evidencias)
            ? evidencias.map((e) => ({
                tipo: e.tipo,
                nombreArchivo: e.nombreArchivo,
                referenciaDocumental: e.referenciaDocumental,
                url: e.url,
                notas: e.notas,
              }))
            : null,
        });

        const pagoExistente = await prisma.pago.findUnique({
          where: { idempotencyKey: safeIdempotencyKey },
          include: PAYMENT_INCLUDES,
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

      // D. Detección segura de duplicación de referencia operativa (P2)
      const pagoReferenciaDuplicada = await prisma.pago.findFirst({
        where: {
          reservaId,
          moneda: monedaNormalizada,
          monto: montoDecimal,
          metodoPago: metodoPago as MetodoPago,
          referenciaOperacion: { equals: referencia.trim(), mode: 'insensitive' },
          estado: { in: ['PENDIENTE_CONCILIACION', 'CONCILIADO'] },
          ...(safeIdempotencyKey ? { NOT: { idempotencyKey: safeIdempotencyKey } } : {}),
        },
      });

      if (pagoReferenciaDuplicada) {
        return reply.status(409).send({
          error: {
            code: 'DUPLICATE_PAYMENT_REFERENCE',
            message: `Detección de duplicado bancario: ya existe un pago activo registrado para la reserva "${reservaId}" con la misma referencia ("${referencia.trim()}"), método de pago (${metodoPago}), moneda (${monedaNormalizada}) e importe (${montoDecimal.toFixed(2)}).`,
            requestId: request.id,
          },
        });
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorId = await resolveDomainActorFromDb(prisma, request, reply);
      if (actorId === null) return;

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
              beneficiarioTipo: resolvedBeneficiario,
              beneficiarioNombre: safeBeneficiarioNombre,
              bancoReceptor: safeBanco,
              cuentaReferencia: safeCuentaRef,
            },
          });

          if (Array.isArray(evidencias) && evidencias.length > 0) {
            for (const ev of evidencias) {
              await tx.evidenciaPago.create({
                data: {
                  pagoId: pago.id,
                  tipo: ev.tipo && ev.tipo.trim() ? ev.tipo.trim() : 'VOUCHER',
                  nombreArchivo: ev.nombreArchivo.trim(),
                  referenciaDocumental:
                    ev.referenciaDocumental && ev.referenciaDocumental.trim()
                      ? ev.referenciaDocumental.trim()
                      : null,
                  url: ev.url && ev.url.trim() ? ev.url.trim() : null,
                  estado: 'REFERENCIADA',
                  notas: ev.notas && ev.notas.trim() ? ev.notas.trim() : null,
                  registradoPorId: actorId,
                },
              });
            }
          }

          const pagoCompleto = await tx.pago.findUniqueOrThrow({
            where: { id: pago.id },
            include: PAYMENT_INCLUDES,
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
              beneficiarioTipo: resolvedBeneficiario,
              beneficiarioNombre: safeBeneficiarioNombre,
              bancoReceptor: safeBanco,
              cuentaReferencia: safeCuentaRef,
              evidenciasCount: Array.isArray(evidencias) ? evidencias.length : 0,
            },
            requestId: request.id,
          });

          return pagoCompleto;
        });

        return reply.status(201).send({
          data: formatPaymentResponse(nuevoPago),
        });
      } catch (err: any) {
        // Manejar condición de carrera en concurrencia con misma clave de idempotencia
        if (err.code === 'P2002' && safeIdempotencyKey) {
          const pagoConcurrente = await prisma.pago.findUnique({
            where: { idempotencyKey: safeIdempotencyKey },
            include: PAYMENT_INCLUDES,
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

    // 6. Conciliar pago (HU-05) con bloqueo de fila atómico (P1)
    app.post<{
      Params: { id: string };
      Body: {
        referencia?: string;
        notas?: string;
      };
    }>('/api/pagos/:id/conciliar', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;
      const { referencia, notas } = request.body || {};

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorId = await resolveDomainActorFromDb(prisma, request, reply);
      if (actorId === null) return;
      const now = new Date();

      try {
        const resultado = await prisma.$transaction(async (tx) => {
          // Bloqueo pesimista de fila en PostgreSQL para transiciones concurrentes atómicas
          const lockedRows: any[] = await tx.$queryRaw`
            SELECT id FROM "pagos" WHERE id = ${id} FOR UPDATE;
          `;

          if (!lockedRows || lockedRows.length === 0) {
            throw new Error('PAYMENT_NOT_FOUND');
          }

          const pagoActual = await tx.pago.findUniqueOrThrow({
            where: { id },
            include: PAYMENT_INCLUDES,
          });

          // Si ya está conciliado: respuesta idempotente sin alterar montos ni fechas históricas ni duplicar auditoría
          if (pagoActual.estado === 'CONCILIADO') {
            return { pago: pagoActual, idempotentReplay: true };
          }

          // Si está rechazado: no se permite conciliación directa
          if (pagoActual.estado === 'RECHAZADO') {
            throw new Error('PAYMENT_ALREADY_REJECTED');
          }

          const actualizado = await tx.pago.update({
            where: { id },
            data: {
              estado: 'CONCILIADO',
              conciliadoPorId: actorId,
              conciliadoEn: now,
              referenciaOperacion: referencia && referencia.trim() ? referencia.trim() : undefined,
              notas: notas && notas.trim()
                ? pagoActual.notas
                  ? `${pagoActual.notas} | Conciliación: ${notas.trim()}`
                  : notas.trim()
                : undefined,
            },
            include: PAYMENT_INCLUDES,
          });

          // Registrar auditoría ÚNICAMENTE para la transición efectivamente realizada
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

          return { pago: actualizado, idempotentReplay: false };
        });

        return reply.status(200).send({
          data: formatPaymentResponse(resultado.pago),
          idempotentReplay: resultado.idempotentReplay || undefined,
        });
      } catch (err: any) {
        if (err.message === 'PAYMENT_NOT_FOUND') {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `El pago "${id}" no existe.`, requestId: request.id },
          });
        }
        if (err.message === 'PAYMENT_ALREADY_REJECTED') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_STATE_TRANSITION',
              message: 'Un pago rechazado no puede ser conciliado directamente. Debe registrarse un nuevo pago válido.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });

    // 7. Rechazar pago (HU-05) con bloqueo de fila atómico (P1)
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

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const now = new Date();

      try {
        const resultado = await prisma.$transaction(async (tx) => {
          // Bloqueo pesimista de fila en PostgreSQL para transiciones concurrentes atómicas
          const lockedRows: any[] = await tx.$queryRaw`
            SELECT id FROM "pagos" WHERE id = ${id} FOR UPDATE;
          `;

          if (!lockedRows || lockedRows.length === 0) {
            throw new Error('PAYMENT_NOT_FOUND');
          }

          const pagoActual = await tx.pago.findUniqueOrThrow({
            where: { id },
            include: PAYMENT_INCLUDES,
          });

          // No permitir rechazo de pagos ya conciliados sin proceso contable formal
          if (pagoActual.estado === 'CONCILIADO') {
            throw new Error('PAYMENT_ALREADY_CONCILIATED');
          }

          // Si ya está rechazado: respuesta idempotente sin duplicar auditoría
          if (pagoActual.estado === 'RECHAZADO') {
            return { pago: pagoActual, idempotentReplay: true };
          }

          const actualizado = await tx.pago.update({
            where: { id },
            data: {
              estado: 'RECHAZADO',
              motivoRechazo: motivo.trim(),
              rechazadoEn: now,
            },
            include: PAYMENT_INCLUDES,
          });

          // Registrar auditoría ÚNICAMENTE para la transición efectivamente realizada
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

          return { pago: actualizado, idempotentReplay: false };
        });

        return reply.status(200).send({
          data: formatPaymentResponse(resultado.pago),
          idempotentReplay: resultado.idempotentReplay || undefined,
        });
      } catch (err: any) {
        if (err.message === 'PAYMENT_NOT_FOUND') {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `El pago "${id}" no existe.`, requestId: request.id },
          });
        }
        if (err.message === 'PAYMENT_ALREADY_CONCILIATED') {
          return reply.status(409).send({
            error: {
              code: 'INVALID_STATE_TRANSITION',
              message: 'No se puede rechazar un pago previamente conciliado sin una política de reversa contable formal.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });
  };
}
