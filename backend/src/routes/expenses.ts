import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import {
  Prisma,
  type PrismaClient,
  type EstadoGasto,
} from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth } from '../shared/auth.js';

const ALLOWED_ESTADOS_GASTO: EstadoGasto[] = ['REGISTRADO', 'APROBADO', 'ANULADO'];
const DECIMAL_REGEX = /^\d+(\.\d{1,2})?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida formato YYYY-MM-DD y existencia en calendario real.
 */
function validateDateString(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Valida que una URL sea sintácticamente válida con protocolo HTTP o HTTPS.
 */
function isValidHttpUrl(stringUrl: string): boolean {
  try {
    const url = new URL(stringUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface ExpensePayloadForHash {
  propiedadId: string;
  fechaGasto: string;
  periodoMes: number;
  periodoAnio: number;
  titulo: string;
  categoria: string;
  monto: string;
  pagadoPor: string;
  moneda?: string | null;
  notas?: string | null;
  repartido?: string | null;
  usoRucDaplace?: boolean | null;
  sustentos?: Array<{
    tipo?: string | null;
    nombreArchivo: string;
    url: string;
    origen?: string | null;
  }> | null;
}

/**
 * Genera hash canónico para verificación estricta de idempotencia en gastos.
 * Incluye todos los campos de Anexo A.2 con normalización determinista.
 */
export function computeExpensePayloadHash(payload: ExpensePayloadForHash): string {
  const normalizedSustentos = (payload.sustentos || [])
    .map((s) => ({
      tipo: s.tipo && s.tipo.trim() ? s.tipo.trim() : 'COMPROBANTE',
      nombreArchivo: s.nombreArchivo.trim(),
      url: s.url.trim(),
      origen: s.origen && s.origen.trim() ? s.origen.trim() : 'MANUAL',
    }))
    .sort((a, b) => a.url.localeCompare(b.url) || a.nombreArchivo.localeCompare(b.nombreArchivo));

  const canonical = JSON.stringify({
    propiedadId: payload.propiedadId.trim(),
    fechaGasto: payload.fechaGasto.trim(),
    periodoMes: Number(payload.periodoMes),
    periodoAnio: Number(payload.periodoAnio),
    titulo: payload.titulo.trim().toLowerCase(),
    categoria: payload.categoria.trim().toLowerCase(),
    monto: new Prisma.Decimal(payload.monto.trim()).toFixed(2),
    moneda: (payload.moneda || 'PEN').toUpperCase().trim(),
    pagadoPor: payload.pagadoPor.trim().toLowerCase(),
    notas: payload.notas && payload.notas.trim() ? payload.notas.trim() : null,
    repartido: payload.repartido && payload.repartido.trim() ? payload.repartido.trim() : null,
    usoRucDaplace:
      payload.usoRucDaplace === undefined || payload.usoRucDaplace === null
        ? null
        : Boolean(payload.usoRucDaplace),
    sustentos: normalizedSustentos,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Recupera el hash persistido del gasto original o lo deriva si no existía.
 */
function getOrComputeExpenseHash(gasto: any): string {
  if (gasto.payloadHash) {
    return gasto.payloadHash;
  }
  return computeExpensePayloadHash({
    propiedadId: gasto.propiedadId,
    fechaGasto:
      gasto.fechaGasto instanceof Date
        ? gasto.fechaGasto.toISOString().slice(0, 10)
        : String(gasto.fechaGasto).slice(0, 10),
    periodoMes: gasto.periodoMes,
    periodoAnio: gasto.periodoAnio,
    titulo: gasto.titulo,
    categoria: gasto.categoria,
    monto: new Prisma.Decimal(gasto.monto).toFixed(2),
    pagadoPor: gasto.pagadoPor,
    moneda: gasto.moneda,
    notas: gasto.notas,
    repartido: gasto.repartido,
    usoRucDaplace: gasto.usoRucDaplace,
    sustentos: (gasto.sustentos || []).map((s: any) => ({
      tipo: s.tipo,
      nombreArchivo: s.nombreArchivo,
      url: s.url,
      origen: s.origen,
    })),
  });
}

/**
 * Formatea un registro de SustentoGasto para respuesta JSON.
 */
export function formatSustentoResponse(sustento: any) {
  return {
    id: sustento.id,
    gastoId: sustento.gastoId,
    tipo: sustento.tipo,
    nombreArchivo: sustento.nombreArchivo,
    url: sustento.url,
    origen: sustento.origen || 'MANUAL',
    registradoPor: sustento.registradoPor?.nombre || sustento.registradoPor?.email || sustento.registradoPorId || undefined,
    creadoEn: sustento.creadoEn instanceof Date ? sustento.creadoEn.toISOString() : String(sustento.creadoEn),
  };
}

/**
 * Formatea un registro de Gasto de Prisma al contrato esperado por el Frontend.
 */
export function formatExpenseResponse(gasto: any) {
  return {
    id: gasto.id,
    propiedadId: gasto.propiedadId,
    propiedadNombre: gasto.propiedad?.nombre || undefined,
    fechaGasto: gasto.fechaGasto instanceof Date ? gasto.fechaGasto.toISOString().slice(0, 10) : String(gasto.fechaGasto).slice(0, 10),
    periodoMes: gasto.periodoMes,
    periodoAnio: gasto.periodoAnio,
    titulo: gasto.titulo,
    categoria: gasto.categoria,
    notas: gasto.notas || undefined,
    monto: new Prisma.Decimal(gasto.monto).toFixed(2),
    moneda: gasto.moneda,
    pagadoPor: gasto.pagadoPor,
    repartido: gasto.repartido ?? undefined,
    usoRucDaplace: gasto.usoRucDaplace === null ? null : Boolean(gasto.usoRucDaplace),
    estado: gasto.estado as EstadoGasto,
    idempotencyKey: gasto.idempotencyKey || undefined,
    payloadHash: gasto.payloadHash || undefined,
    registradoPor: gasto.registradoPor?.nombre || gasto.registradoPor?.email || gasto.registradoPorId || undefined,
    aprobadoPor: gasto.aprobadoPor?.nombre || gasto.aprobadoPor?.email || gasto.aprobadoPorId || undefined,
    aprobadoEn: gasto.aprobadoEn instanceof Date ? gasto.aprobadoEn.toISOString() : (gasto.aprobadoEn || undefined),
    anuladoPor: gasto.anuladoPor?.nombre || gasto.anuladoPor?.email || gasto.anuladoPorId || undefined,
    anuladoEn: gasto.anuladoEn instanceof Date ? gasto.anuladoEn.toISOString() : (gasto.anuladoEn || undefined),
    motivoAnulacion: gasto.motivoAnulacion || undefined,
    sustentos: (gasto.sustentos || []).map(formatSustentoResponse),
    creadoEn: gasto.creadoEn instanceof Date ? gasto.creadoEn.toISOString() : String(gasto.creadoEn),
    actualizadoEn: gasto.actualizadoEn instanceof Date ? gasto.actualizadoEn.toISOString() : String(gasto.actualizadoEn),
  };
}

export function registerExpensesRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // Autenticación administrativa: ADMIN y OPERADOR permitidos. PROPIETARIO denegado.
    const authGuard = requireAuth(['ADMIN', 'OPERADOR']);

    // 1. Listar gastos con filtros avanzados
    app.get<{
      Querystring: {
        propiedadId?: string;
        categoria?: string;
        fechaDesde?: string;
        fechaHasta?: string;
        mes?: string;
        anio?: string;
        pagadoPor?: string;
        estado?: string;
        search?: string;
      };
    }>('/api/gastos', { preHandler: authGuard }, async (request, reply) => {
      const {
        propiedadId,
        categoria,
        fechaDesde,
        fechaHasta,
        mes,
        anio,
        pagadoPor,
        estado,
        search,
      } = request.query;

      const where: Prisma.GastoWhereInput = {};

      if (propiedadId && propiedadId.trim()) {
        where.propiedadId = propiedadId.trim();
      }

      if (categoria && categoria.trim() && categoria.trim().toUpperCase() !== 'TODAS') {
        where.categoria = { equals: categoria.trim(), mode: 'insensitive' };
      }

      if (estado && estado.trim() && estado.trim().toUpperCase() !== 'TODOS') {
        const estadoUpper = estado.trim().toUpperCase() as EstadoGasto;
        if (!ALLOWED_ESTADOS_GASTO.includes(estadoUpper)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `Estado de gasto inválido "${estado}". Permitidos: ${ALLOWED_ESTADOS_GASTO.join(', ')}.`,
              requestId: request.id,
            },
          });
        }
        where.estado = estadoUpper;
      }

      if (pagadoPor && pagadoPor.trim()) {
        where.pagadoPor = { contains: pagadoPor.trim(), mode: 'insensitive' };
      }

      if (mes !== undefined && String(mes).trim() !== '' && String(mes).trim().toUpperCase() !== 'TODOS') {
        const numMes = parseInt(String(mes), 10);
        if (isNaN(numMes) || numMes < 1 || numMes > 12) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El filtro de mes debe ser un entero entre 1 y 12.',
              requestId: request.id,
            },
          });
        }
        where.periodoMes = numMes;
      }

      if (anio !== undefined && String(anio).trim() !== '' && String(anio).trim().toUpperCase() !== 'TODOS') {
        const numAnio = parseInt(String(anio), 10);
        if (isNaN(numAnio) || numAnio < 2000 || numAnio > 2100) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El filtro de año debe ser un número de 4 dígitos válido.',
              requestId: request.id,
            },
          });
        }
        where.periodoAnio = numAnio;
      }

      if (fechaDesde && fechaDesde.trim()) {
        if (!validateDateString(fechaDesde.trim())) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El parámetro "fechaDesde" debe ser una fecha válida en formato YYYY-MM-DD.',
              requestId: request.id,
            },
          });
        }
        where.fechaGasto = {
          ...(where.fechaGasto as Prisma.DateTimeFilter),
          gte: new Date(`${fechaDesde.trim()}T00:00:00.000Z`),
        };
      }

      if (fechaHasta && fechaHasta.trim()) {
        if (!validateDateString(fechaHasta.trim())) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El parámetro "fechaHasta" debe ser una fecha válida en formato YYYY-MM-DD.',
              requestId: request.id,
            },
          });
        }
        where.fechaGasto = {
          ...(where.fechaGasto as Prisma.DateTimeFilter),
          lte: new Date(`${fechaHasta.trim()}T00:00:00.000Z`),
        };
      }

      if (search && search.trim()) {
        const term = search.trim();
        where.OR = [
          { titulo: { contains: term, mode: 'insensitive' } },
          { notas: { contains: term, mode: 'insensitive' } },
          { categoria: { contains: term, mode: 'insensitive' } },
          { pagadoPor: { contains: term, mode: 'insensitive' } },
        ];
      }

      const gastos = await prisma.gasto.findMany({
        where,
        include: {
          propiedad: true,
          registradoPor: true,
          aprobadoPor: true,
          anuladoPor: true,
          sustentos: {
            include: { registradoPor: true },
            orderBy: { creadoEn: 'desc' },
          },
        },
        orderBy: [{ fechaGasto: 'desc' }, { creadoEn: 'desc' }],
      });

      return reply.send({
        data: gastos.map(formatExpenseResponse),
      });
    });

    // 2. Obtener detalle de gasto por ID
    app.get<{
      Params: { id: string };
    }>('/api/gastos/:id', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;

      const gasto = await prisma.gasto.findUnique({
        where: { id },
        include: {
          propiedad: true,
          registradoPor: true,
          aprobadoPor: true,
          anuladoPor: true,
          sustentos: {
            include: { registradoPor: true },
            orderBy: { creadoEn: 'desc' },
          },
        },
      });

      if (!gasto) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `El gasto con identificador "${id}" no existe.`,
            requestId: request.id,
          },
        });
      }

      return reply.send({ data: formatExpenseResponse(gasto) });
    });

    // 3. Registrar nuevo gasto (HU-07 / Hito 3)
    app.post<{
      Body: {
        propiedadId: string;
        fechaGasto: string;
        periodoMes: number;
        periodoAnio: number;
        titulo: string;
        categoria: string;
        monto: string;
        moneda?: string;
        pagadoPor: string;
        repartido?: string | null;
        usoRucDaplace?: boolean | null;
        notas?: string | null;
        idempotencyKey?: string | null;
        sustentos?: Array<{
          tipo?: string;
          nombreArchivo: string;
          url: string;
          origen?: string;
        }>;
      };
    }>('/api/gastos', { preHandler: authGuard }, async (request, reply) => {
      const {
        propiedadId,
        fechaGasto,
        periodoMes,
        periodoAnio,
        titulo,
        categoria,
        monto,
        moneda,
        pagadoPor,
        repartido,
        usoRucDaplace,
        notas,
        idempotencyKey,
        sustentos,
      } = request.body || {};

      // A. Validaciones sintácticas y de negocio obligatorias
      if (!propiedadId || typeof propiedadId !== 'string' || propiedadId.trim() === '') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El campo "propiedadId" es obligatorio.', requestId: request.id },
        });
      }

      if (!fechaGasto || typeof fechaGasto !== 'string' || !validateDateString(fechaGasto.trim())) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La fecha del gasto debe ser una fecha real válida en formato YYYY-MM-DD.',
            requestId: request.id,
          },
        });
      }

      const numMes = Number(periodoMes);
      if (isNaN(numMes) || numMes < 1 || numMes > 12) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El mes del periodo declarado debe ser un número entero entre 1 y 12.',
            requestId: request.id,
          },
        });
      }

      const numAnio = Number(periodoAnio);
      if (isNaN(numAnio) || numAnio < 2000 || numAnio > 2100) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El año del periodo declarado debe ser un número entero entre 2000 y 2100.',
            requestId: request.id,
          },
        });
      }

      if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El título del gasto es obligatorio.', requestId: request.id },
        });
      }

      if (!categoria || typeof categoria !== 'string' || categoria.trim() === '') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'La categoría del gasto es obligatoria.', requestId: request.id },
        });
      }

      if (!monto || typeof monto !== 'string' || !DECIMAL_REGEX.test(monto.trim())) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El monto debe ser una cadena decimal válida con hasta 2 decimales (ej: "150.00").',
            requestId: request.id,
          },
        });
      }

      const montoDecimal = new Prisma.Decimal(monto.trim());
      if (montoDecimal.lessThanOrEqualTo(0)) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El monto del gasto debe ser estrictamente positivo.',
            requestId: request.id,
          },
        });
      }

      // Regla de Invariante Financiero: En este incremento solo se soporta PEN
      const monedaNormalizada = (moneda || 'PEN').toUpperCase().trim();
      if (monedaNormalizada !== 'PEN') {
        return reply.status(400).send({
          error: {
            code: 'CURRENCY_NOT_SUPPORTED',
            message: `Moneda "${monedaNormalizada}" no soportada. En este incremento únicamente se admite moneda PEN conforme al Excel operativo.`,
            requestId: request.id,
          },
        });
      }

      if (!pagadoPor || typeof pagadoPor !== 'string' || pagadoPor.trim() === '') {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'El pagador ("pagadoPor") es obligatorio.', requestId: request.id },
        });
      }

      // Validar sustentos iniciales si se proveen
      if (sustentos && Array.isArray(sustentos)) {
        for (let i = 0; i < sustentos.length; i++) {
          const s = sustentos[i];
          if (!s.nombreArchivo || typeof s.nombreArchivo !== 'string' || s.nombreArchivo.trim() === '') {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: `El sustento en el índice ${i} requiere un "nombreArchivo" no vacío.`,
                requestId: request.id,
              },
            });
          }
          if (!s.url || typeof s.url !== 'string' || !isValidHttpUrl(s.url.trim())) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: `La URL del sustento en el índice ${i} debe ser un enlace HTTP o HTTPS válido.`,
                requestId: request.id,
              },
            });
          }
        }
      }

      // B. Verificar existencia de la propiedad en PostgreSQL
      const propiedad = await prisma.propiedad.findUnique({
        where: { id: propiedadId.trim() },
      });

      if (!propiedad) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `La propiedad con identificador "${propiedadId.trim()}" no existe.`,
            requestId: request.id,
          },
        });
      }

      // C. Verificación de Idempotencia
      const safeIdempotencyKey = idempotencyKey && idempotencyKey.trim() ? idempotencyKey.trim() : null;

      const incomingHash = safeIdempotencyKey
        ? computeExpensePayloadHash({
            propiedadId: propiedadId.trim(),
            fechaGasto: fechaGasto.trim(),
            periodoMes: numMes,
            periodoAnio: numAnio,
            titulo: titulo.trim(),
            categoria: categoria.trim(),
            monto: monto.trim(),
            moneda: monedaNormalizada,
            pagadoPor: pagadoPor.trim(),
            notas: notas && notas.trim() ? notas.trim() : null,
            repartido: repartido && repartido.trim() ? repartido.trim() : null,
            usoRucDaplace: usoRucDaplace === undefined || usoRucDaplace === null ? null : Boolean(usoRucDaplace),
            sustentos,
          })
        : null;

      if (safeIdempotencyKey && incomingHash) {
        const gastoExistente = await prisma.gasto.findUnique({
          where: { idempotencyKey: safeIdempotencyKey },
          include: {
            propiedad: true,
            registradoPor: true,
            aprobadoPor: true,
            anuladoPor: true,
            sustentos: { include: { registradoPor: true }, orderBy: { creadoEn: 'desc' } },
          },
        });

        if (gastoExistente) {
          const hashExistente = getOrComputeExpenseHash(gastoExistente);

          if (incomingHash === hashExistente) {
            return reply.status(200).send({
              data: formatExpenseResponse(gastoExistente),
              idempotentReplay: true,
            });
          }

          return reply.status(409).send({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada con un contenido de gasto diferente.',
              requestId: request.id,
            },
          });
        }
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorUsuarioId = request.user?.usuarioId;
      if (!actorUsuarioId || typeof actorUsuarioId !== 'string' || actorUsuarioId.trim() === '') {
        return reply.status(403).send({
          error: {
            code: 'DOMAIN_IDENTITY_REQUIRED',
            message: 'Se requiere una identidad transaccional (usuarioId) válida y vinculada para registrar gastos en el sistema.',
            requestId: request.id,
          },
        });
      }

      try {
        const nuevoGasto = await prisma.$transaction(async (tx) => {
          const gasto = await tx.gasto.create({
            data: {
              propiedadId: propiedadId.trim(),
              fechaGasto: new Date(`${fechaGasto.trim()}T00:00:00.000Z`),
              periodoMes: numMes,
              periodoAnio: numAnio,
              titulo: titulo.trim(),
              categoria: categoria.trim(),
              notas: notas && notas.trim() ? notas.trim() : null,
              monto: montoDecimal,
              moneda: monedaNormalizada,
              pagadoPor: pagadoPor.trim(),
              repartido: repartido && repartido.trim() ? repartido.trim() : null,
              usoRucDaplace: usoRucDaplace === undefined || usoRucDaplace === null ? null : Boolean(usoRucDaplace),
              estado: 'REGISTRADO',
              idempotencyKey: safeIdempotencyKey,
              payloadHash: incomingHash,
              registradoPorId: actorUsuarioId,
              sustentos: sustentos && sustentos.length > 0
                ? {
                    create: sustentos.map((s) => ({
                      tipo: s.tipo && s.tipo.trim() ? s.tipo.trim() : 'COMPROBANTE',
                      nombreArchivo: s.nombreArchivo.trim(),
                      url: s.url.trim(),
                      origen: s.origen && s.origen.trim() ? s.origen.trim() : 'MANUAL',
                      registradoPorId: actorUsuarioId,
                    })),
                  }
                : undefined,
            },
            include: {
              propiedad: true,
              registradoPor: true,
              aprobadoPor: true,
              anuladoPor: true,
              sustentos: { include: { registradoPor: true }, orderBy: { creadoEn: 'desc' } },
            },
          });

          // Registro atómico de auditoría
          await recordAuditEvent(tx, {
            entidad: 'Gasto',
            entidadId: gasto.id,
            accion: 'GASTO_REGISTRADO',
            actor: actorEmail,
            motivo: `Registro de gasto operativo: ${gasto.titulo}`,
            detalles: {
              gastoId: gasto.id,
              propiedadId: gasto.propiedadId,
              propiedadNombre: gasto.propiedad.nombre,
              monto: montoDecimal.toFixed(2),
              moneda: monedaNormalizada,
              categoria: gasto.categoria,
              fechaGasto: fechaGasto.trim(),
              periodoMes: numMes,
              periodoAnio: numAnio,
              pagadoPor: gasto.pagadoPor,
              usoRucDaplace: gasto.usoRucDaplace,
              idempotencyKey: safeIdempotencyKey,
              payloadHash: incomingHash,
              cantidadSustentos: sustentos ? sustentos.length : 0,
            },
            requestId: request.id,
          });

          return gasto;
        });

        return reply.status(201).send({
          data: formatExpenseResponse(nuevoGasto),
        });
      } catch (err: any) {
        if (err.code === 'P2002' && safeIdempotencyKey && incomingHash) {
          // Si ocurrió carrera concurrente con la misma clave de idempotencia
          const recheck = await prisma.gasto.findUnique({
            where: { idempotencyKey: safeIdempotencyKey },
            include: {
              propiedad: true,
              registradoPor: true,
              aprobadoPor: true,
              anuladoPor: true,
              sustentos: { include: { registradoPor: true }, orderBy: { creadoEn: 'desc' } },
            },
          });
          if (recheck) {
            const hashExistente = getOrComputeExpenseHash(recheck);
            if (incomingHash === hashExistente) {
              return reply.status(200).send({
                data: formatExpenseResponse(recheck),
                idempotentReplay: true,
              });
            }
            return reply.status(409).send({
              error: {
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'La clave de idempotencia ya fue utilizada con un contenido de gasto diferente.',
                requestId: request.id,
              },
            });
          }
          return reply.status(409).send({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });

    // 4. Actualizar gasto existente (HU-07)
    app.patch<{
      Params: { id: string };
      Body: {
        propiedadId?: string;
        fechaGasto?: string;
        periodoMes?: number;
        periodoAnio?: number;
        titulo?: string;
        categoria?: string;
        monto?: string;
        moneda?: string;
        pagadoPor?: string;
        repartido?: string | null;
        usoRucDaplace?: boolean | null;
        notas?: string | null;
      };
    }>('/api/gastos/:id', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;
      const body = request.body || {};

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';

      try {
        const resultado = await prisma.$transaction(async (tx) => {
          // Bloqueo pesimista de fila en PostgreSQL
          const lockedRows: any[] = await tx.$queryRaw`
            SELECT id FROM "gastos" WHERE id = ${id} FOR UPDATE;
          `;

          if (!lockedRows || lockedRows.length === 0) {
            throw new Error('EXPENSE_NOT_FOUND');
          }

          const gastoActual = await tx.gasto.findUniqueOrThrow({
            where: { id },
            include: { propiedad: true },
          });

          // Invariante: Un gasto anulado NO debe ser modificado
          if (gastoActual.estado === 'ANULADO') {
            throw new Error('CANNOT_MODIFY_CANCELLED_EXPENSE');
          }

          const updateData: Prisma.GastoUpdateInput = {};
          const valoresAnteriores: Record<string, any> = {};
          const valoresNuevos: Record<string, any> = {};

          if (body.propiedadId !== undefined) {
            const nuevaPropId = body.propiedadId.trim();
            const prop = await tx.propiedad.findUnique({ where: { id: nuevaPropId } });
            if (!prop) {
              const err = new Error('PROPERTY_NOT_FOUND');
              (err as any).propiedadId = nuevaPropId;
              throw err;
            }
            valoresAnteriores.propiedadId = gastoActual.propiedadId;
            valoresNuevos.propiedadId = nuevaPropId;
            updateData.propiedad = { connect: { id: nuevaPropId } };
          }

          if (body.fechaGasto !== undefined) {
            if (!validateDateString(body.fechaGasto.trim())) {
              throw new Error('INVALID_DATE_FORMAT');
            }
            const nuevaFecha = new Date(`${body.fechaGasto.trim()}T00:00:00.000Z`);
            valoresAnteriores.fechaGasto = gastoActual.fechaGasto.toISOString().slice(0, 10);
            valoresNuevos.fechaGasto = body.fechaGasto.trim();
            updateData.fechaGasto = nuevaFecha;
          }

          if (body.periodoMes !== undefined) {
            const m = Number(body.periodoMes);
            if (isNaN(m) || m < 1 || m > 12) {
              throw new Error('INVALID_MONTH');
            }
            valoresAnteriores.periodoMes = gastoActual.periodoMes;
            valoresNuevos.periodoMes = m;
            updateData.periodoMes = m;
          }

          if (body.periodoAnio !== undefined) {
            const a = Number(body.periodoAnio);
            if (isNaN(a) || a < 2000 || a > 2100) {
              throw new Error('INVALID_YEAR');
            }
            valoresAnteriores.periodoAnio = gastoActual.periodoAnio;
            valoresNuevos.periodoAnio = a;
            updateData.periodoAnio = a;
          }

          if (body.titulo !== undefined) {
            if (typeof body.titulo !== 'string' || body.titulo.trim() === '') {
              throw new Error('INVALID_TITLE');
            }
            valoresAnteriores.titulo = gastoActual.titulo;
            valoresNuevos.titulo = body.titulo.trim();
            updateData.titulo = body.titulo.trim();
          }

          if (body.categoria !== undefined) {
            if (typeof body.categoria !== 'string' || body.categoria.trim() === '') {
              throw new Error('INVALID_CATEGORY');
            }
            valoresAnteriores.categoria = gastoActual.categoria;
            valoresNuevos.categoria = body.categoria.trim();
            updateData.categoria = body.categoria.trim();
          }

          if (body.monto !== undefined) {
            if (typeof body.monto !== 'string' || !DECIMAL_REGEX.test(body.monto.trim())) {
              throw new Error('INVALID_AMOUNT_FORMAT');
            }
            const montoDecimal = new Prisma.Decimal(body.monto.trim());
            if (montoDecimal.lessThanOrEqualTo(0)) {
              throw new Error('INVALID_AMOUNT_VALUE');
            }
            valoresAnteriores.monto = new Prisma.Decimal(gastoActual.monto).toFixed(2);
            valoresNuevos.monto = montoDecimal.toFixed(2);
            updateData.monto = montoDecimal;
          }

          if (body.moneda !== undefined) {
            const mon = body.moneda.toUpperCase().trim();
            if (mon !== 'PEN') {
              throw new Error('CURRENCY_NOT_SUPPORTED');
            }
          }

          if (body.pagadoPor !== undefined) {
            if (typeof body.pagadoPor !== 'string' || body.pagadoPor.trim() === '') {
              throw new Error('INVALID_PAYER');
            }
            valoresAnteriores.pagadoPor = gastoActual.pagadoPor;
            valoresNuevos.pagadoPor = body.pagadoPor.trim();
            updateData.pagadoPor = body.pagadoPor.trim();
          }

          if (body.repartido !== undefined) {
            valoresAnteriores.repartido = gastoActual.repartido;
            valoresNuevos.repartido = body.repartido ? body.repartido.trim() : null;
            updateData.repartido = body.repartido ? body.repartido.trim() : null;
          }

          if (body.usoRucDaplace !== undefined) {
            valoresAnteriores.usoRucDaplace = gastoActual.usoRucDaplace;
            valoresNuevos.usoRucDaplace = body.usoRucDaplace === null ? null : Boolean(body.usoRucDaplace);
            updateData.usoRucDaplace = body.usoRucDaplace === null ? null : Boolean(body.usoRucDaplace);
          }

          if (body.notas !== undefined) {
            valoresAnteriores.notas = gastoActual.notas;
            valoresNuevos.notas = body.notas ? body.notas.trim() : null;
            updateData.notas = body.notas ? body.notas.trim() : null;
          }

          const gastoActualizado = await tx.gasto.update({
            where: { id },
            data: updateData,
            include: {
              propiedad: true,
              registradoPor: true,
              aprobadoPor: true,
              anuladoPor: true,
              sustentos: { include: { registradoPor: true }, orderBy: { creadoEn: 'desc' } },
            },
          });

          // Auditoría de cambios atómica
          await recordAuditEvent(tx, {
            entidad: 'Gasto',
            entidadId: id,
            accion: 'GASTO_ACTUALIZADO',
            actor: actorEmail,
            motivo: 'Actualización formal de campos de gasto',
            detalles: {
              gastoId: id,
              valoresAnteriores,
              valoresNuevos,
            },
            requestId: request.id,
          });

          return gastoActualizado;
        });

        return reply.status(200).send({
          data: formatExpenseResponse(resultado),
        });
      } catch (err: any) {
        if (err.message === 'EXPENSE_NOT_FOUND') {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `El gasto "${id}" no existe.`, requestId: request.id },
          });
        }
        if (err.message === 'CANNOT_MODIFY_CANCELLED_EXPENSE') {
          return reply.status(409).send({
            error: {
              code: 'INVALID_STATE_TRANSITION',
              message: 'No se puede modificar un gasto que se encuentra en estado ANULADO.',
              requestId: request.id,
            },
          });
        }
        if (err.message === 'PROPERTY_NOT_FOUND') {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: `La propiedad con id "${(err as any).propiedadId}" no existe.`,
              requestId: request.id,
            },
          });
        }
        if (err.message === 'INVALID_DATE_FORMAT') {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'Formato de fecha inválido en fechaGasto (debe ser YYYY-MM-DD).', requestId: request.id },
          });
        }
        if (err.message === 'INVALID_MONTH') {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'El mes del periodo debe ser un entero entre 1 y 12.', requestId: request.id },
          });
        }
        if (err.message === 'INVALID_YEAR') {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'El año del periodo debe ser un número válido de 4 dígitos.', requestId: request.id },
          });
        }
        if (err.message === 'INVALID_TITLE') {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'El título no puede estar vacío.', requestId: request.id },
          });
        }
        if (err.message === 'INVALID_CATEGORY') {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'La categoría no puede estar vacía.', requestId: request.id },
          });
        }
        if (err.message === 'INVALID_AMOUNT_FORMAT' || err.message === 'INVALID_AMOUNT_VALUE') {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'El monto debe ser un decimal estrictamente positivo con hasta 2 decimales.', requestId: request.id },
          });
        }
        if (err.message === 'CURRENCY_NOT_SUPPORTED') {
          return reply.status(400).send({
            error: { code: 'CURRENCY_NOT_SUPPORTED', message: 'Solo se admite moneda PEN.', requestId: request.id },
          });
        }
        if (err.message === 'INVALID_PAYER') {
          return reply.status(400).send({
            error: { code: 'VALIDATION_ERROR', message: 'El pagador no puede estar vacío.', requestId: request.id },
          });
        }
        throw err;
      }
    });

    // 5. Anular gasto con motivo y trazabilidad (HU-07)
    app.post<{
      Params: { id: string };
      Body: { motivo: string };
    }>('/api/gastos/:id/anular', { preHandler: authGuard }, async (request, reply) => {
      const { id } = request.params;
      const { motivo } = request.body || {};

      if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 3) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El motivo de anulación es obligatorio y debe tener al menos 3 caracteres.',
            requestId: request.id,
          },
        });
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorUsuarioId = request.user?.usuarioId;
      if (!actorUsuarioId || typeof actorUsuarioId !== 'string' || actorUsuarioId.trim() === '') {
        return reply.status(403).send({
          error: {
            code: 'DOMAIN_IDENTITY_REQUIRED',
            message: 'Se requiere una identidad transaccional (usuarioId) válida y vinculada para anular gastos en el sistema.',
            requestId: request.id,
          },
        });
      }
      const now = new Date();

      try {
        const resultado = await prisma.$transaction(async (tx) => {
          // Bloqueo pesimista de fila en PostgreSQL
          const lockedRows: any[] = await tx.$queryRaw`
            SELECT id FROM "gastos" WHERE id = ${id} FOR UPDATE;
          `;

          if (!lockedRows || lockedRows.length === 0) {
            throw new Error('EXPENSE_NOT_FOUND');
          }

          const gastoActual = await tx.gasto.findUniqueOrThrow({
            where: { id },
            include: {
              propiedad: true,
              registradoPor: true,
              aprobadoPor: true,
              anuladoPor: true,
              sustentos: { include: { registradoPor: true } },
            },
          });

          // Si ya está anulado: respuesta idempotente sin duplicar auditoría
          if (gastoActual.estado === 'ANULADO') {
            return { gasto: gastoActual, idempotentReplay: true };
          }

          const gastoAnulado = await tx.gasto.update({
            where: { id },
            data: {
              estado: 'ANULADO',
              motivoAnulacion: motivo.trim(),
              anuladoEn: now,
              anuladoPorId: actorUsuarioId,
            },
            include: {
              propiedad: true,
              registradoPor: true,
              aprobadoPor: true,
              anuladoPor: true,
              sustentos: { include: { registradoPor: true } },
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'Gasto',
            entidadId: id,
            accion: 'GASTO_ANULADO',
            actor: actorEmail,
            motivo: `Anulación de gasto: ${motivo.trim()}`,
            detalles: {
              gastoId: id,
              titulo: gastoActual.titulo,
              monto: new Prisma.Decimal(gastoActual.monto).toFixed(2),
              motivoAnulacion: motivo.trim(),
              anuladoEn: now.toISOString(),
            },
            requestId: request.id,
          });

          return { gasto: gastoAnulado, idempotentReplay: false };
        });

        return reply.status(200).send({
          data: formatExpenseResponse(resultado.gasto),
          idempotentReplay: resultado.idempotentReplay || undefined,
        });
      } catch (err: any) {
        if (err.message === 'EXPENSE_NOT_FOUND') {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `El gasto "${id}" no existe.`, requestId: request.id },
          });
        }
        throw err;
      }
    });

    // 6. Adjuntar sustento / comprobante a un gasto (Hito 2)
    app.post<{
      Params: { id: string };
      Body: {
        tipo?: string;
        nombreArchivo: string;
        url: string;
        origen?: string;
      };
    }>('/api/gastos/:id/sustentos', { preHandler: authGuard }, async (request, reply) => {
      const { id: gastoId } = request.params;
      const { tipo, nombreArchivo, url, origen } = request.body || {};

      if (!nombreArchivo || typeof nombreArchivo !== 'string' || nombreArchivo.trim() === '') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El nombre o título del archivo de sustento es obligatorio.',
            requestId: request.id,
          },
        });
      }

      if (!url || typeof url !== 'string' || !isValidHttpUrl(url.trim())) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La URL del sustento debe ser un enlace HTTP o HTTPS válido.',
            requestId: request.id,
          },
        });
      }

      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';
      const actorUsuarioId = request.user?.usuarioId;
      if (!actorUsuarioId || typeof actorUsuarioId !== 'string' || actorUsuarioId.trim() === '') {
        return reply.status(403).send({
          error: {
            code: 'DOMAIN_IDENTITY_REQUIRED',
            message: 'Se requiere una identidad transaccional (usuarioId) válida y vinculada para registrar sustentos de gasto en el sistema.',
            requestId: request.id,
          },
        });
      }

      try {
        const sustentoCreado = await prisma.$transaction(async (tx) => {
          const gasto = await tx.gasto.findUnique({ where: { id: gastoId } });
          if (!gasto) {
            throw new Error('EXPENSE_NOT_FOUND');
          }

          if (gasto.estado === 'ANULADO') {
            throw new Error('CANNOT_ATTACH_TO_CANCELLED_EXPENSE');
          }

          const sustento = await tx.sustentoGasto.create({
            data: {
              gastoId,
              tipo: tipo && tipo.trim() ? tipo.trim() : 'COMPROBANTE',
              nombreArchivo: nombreArchivo.trim(),
              url: url.trim(),
              origen: origen && origen.trim() ? origen.trim() : 'MANUAL',
              registradoPorId: actorUsuarioId,
            },
            include: { registradoPor: true },
          });

          await recordAuditEvent(tx, {
            entidad: 'Gasto',
            entidadId: gastoId,
            accion: 'SUSTENTO_AGREGADO',
            actor: actorEmail,
            motivo: `Adjunto de sustento: ${sustento.nombreArchivo}`,
            detalles: {
              sustentoId: sustento.id,
              gastoId,
              nombreArchivo: sustento.nombreArchivo,
              url: sustento.url,
              tipo: sustento.tipo,
              origen: sustento.origen,
            },
            requestId: request.id,
          });

          return sustento;
        });

        return reply.status(201).send({
          data: formatSustentoResponse(sustentoCreado),
        });
      } catch (err: any) {
        if (err.message === 'EXPENSE_NOT_FOUND') {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: `El gasto "${gastoId}" no existe.`, requestId: request.id },
          });
        }
        if (err.message === 'CANNOT_ATTACH_TO_CANCELLED_EXPENSE') {
          return reply.status(409).send({
            error: {
              code: 'INVALID_STATE_TRANSITION',
              message: 'No se pueden adjuntar sustentos a un gasto anulado.',
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });

    // 7. Listar sustentos de un gasto (Hito 2)
    app.get<{
      Params: { id: string };
    }>('/api/gastos/:id/sustentos', { preHandler: authGuard }, async (request, reply) => {
      const { id: gastoId } = request.params;

      const gasto = await prisma.gasto.findUnique({ where: { id: gastoId } });
      if (!gasto) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `El gasto "${gastoId}" no existe.`, requestId: request.id },
        });
      }

      const sustentos = await prisma.sustentoGasto.findMany({
        where: { gastoId },
        include: { registradoPor: true },
        orderBy: { creadoEn: 'desc' },
      });

      return reply.send({
        data: sustentos.map(formatSustentoResponse),
      });
    });

    // 8. Desvincular sustento con preservación de trazabilidad y auditoría
    app.delete<{
      Params: { id: string; sustentoId: string };
    }>('/api/gastos/:id/sustentos/:sustentoId', { preHandler: authGuard }, async (request, reply) => {
      const { id: gastoId, sustentoId } = request.params;
      const actorEmail = request.user?.email || 'SYSTEM_OPERATOR';

      try {
        await prisma.$transaction(async (tx) => {
          const sustento = await tx.sustentoGasto.findFirst({
            where: { id: sustentoId, gastoId },
          });

          if (!sustento) {
            throw new Error('EVIDENCE_NOT_FOUND');
          }

          await tx.sustentoGasto.delete({
            where: { id: sustentoId },
          });

          await recordAuditEvent(tx, {
            entidad: 'Gasto',
            entidadId: gastoId,
            accion: 'SUSTENTO_ELIMINADO',
            actor: actorEmail,
            motivo: `Desvinculación de sustento: ${sustento.nombreArchivo}`,
            detalles: {
              sustentoId,
              gastoId,
              nombreArchivo: sustento.nombreArchivo,
              url: sustento.url,
            },
            requestId: request.id,
          });
        });

        return reply.status(200).send({
          data: { success: true, message: 'Sustento desvinculado con éxito conservando trazabilidad.' },
        });
      } catch (err: any) {
        if (err.message === 'EVIDENCE_NOT_FOUND') {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: `El sustento "${sustentoId}" no pertenece al gasto "${gastoId}" o no existe.`,
              requestId: request.id,
            },
          });
        }
        throw err;
      }
    });
  };
}
