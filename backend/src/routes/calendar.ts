import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../shared/auth.js';

export function formatDateKey(year: number, month: number, day: number): string {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface AgendaItem {
  reservaId: string;
  codigo: string | undefined;
  propiedadId: string;
  propiedadNombre: string;
  huespedNombre: string;
  estado: string;
  hora: string | null;
}

interface AgendaMaintenanceProperty {
  propiedadId: string;
  propiedadNombre: string;
}

interface AgendaOpenMaintenanceOrder {
  ordenId: string;
  propiedadId: string;
  propiedadNombre: string;
  titulo: string;
  estado: 'PENDIENTE' | 'EN_PROGRESO';
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
}

interface AgendaMaintenanceBlock {
  propiedadesEnMantenimiento: AgendaMaintenanceProperty[];
  ordenesAbiertas: AgendaOpenMaintenanceOrder[];
}

const MAINTENANCE_PRIORITY_RANK: Record<AgendaOpenMaintenanceOrder['prioridad'], number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAJA: 3,
};

const MAINTENANCE_STATUS_RANK: Record<AgendaOpenMaintenanceOrder['estado'], number> = {
  EN_PROGRESO: 0,
  PENDIENTE: 1,
};

function compareMaintenanceProperties(
  a: AgendaMaintenanceProperty,
  b: AgendaMaintenanceProperty
): number {
  const nameCmp = a.propiedadNombre.localeCompare(b.propiedadNombre, 'es');
  if (nameCmp !== 0) return nameCmp;
  return a.propiedadId.localeCompare(b.propiedadId);
}

function compareOpenMaintenanceOrders(
  a: AgendaOpenMaintenanceOrder,
  b: AgendaOpenMaintenanceOrder
): number {
  const prioCmp =
    (MAINTENANCE_PRIORITY_RANK[a.prioridad] ?? 99) -
    (MAINTENANCE_PRIORITY_RANK[b.prioridad] ?? 99);
  if (prioCmp !== 0) return prioCmp;

  const statusCmp =
    (MAINTENANCE_STATUS_RANK[a.estado] ?? 99) -
    (MAINTENANCE_STATUS_RANK[b.estado] ?? 99);
  if (statusCmp !== 0) return statusCmp;

  const propCmp = a.propiedadNombre.localeCompare(b.propiedadNombre, 'es');
  if (propCmp !== 0) return propCmp;

  const titleCmp = a.titulo.localeCompare(b.titulo, 'es');
  if (titleCmp !== 0) return titleCmp;

  return a.ordenId.localeCompare(b.ordenId);
}

function parseCivilDate(rawFecha?: string): {
  year: number;
  month: number;
  day: number;
  fecha: string;
} | null {
  if (typeof rawFecha !== 'string') return null;
  const fecha = rawFecha.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, fecha };
}

function compareAgendaItems(a: AgendaItem, b: AgendaItem): number {
  if (a.hora !== null && b.hora !== null) {
    const horaCmp = a.hora.localeCompare(b.hora);
    if (horaCmp !== 0) return horaCmp;
  } else if (a.hora !== null) {
    return -1;
  } else if (b.hora !== null) {
    return 1;
  }

  const propCmp = a.propiedadNombre.localeCompare(b.propiedadNombre, 'es');
  if (propCmp !== 0) return propCmp;

  const codeCmp = (a.codigo || a.reservaId).localeCompare(b.codigo || b.reservaId);
  if (codeCmp !== 0) return codeCmp;

  return a.reservaId.localeCompare(b.reservaId);
}

export function registerCalendarRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    app.get<{
      Querystring: {
        propiedadId: string;
        year: string | number;
        month: string | number;
      };
    }>(
      '/api/calendario',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO']) },
      async (request, reply) => {
        const { propiedadId, year: rawYear, month: rawMonth } = request.query;

        if (!propiedadId) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El parámetro "propiedadId" es obligatorio.',
              requestId: request.id,
            },
          });
        }

        const year = Number(rawYear);
        const month = Number(rawMonth);

        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El parámetro "year" debe ser un año válido.',
              requestId: request.id,
            },
          });
        }

        if (!Number.isInteger(month) || month < 1 || month > 12) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El parámetro "month" debe ser un mes entre 1 y 12.',
              requestId: request.id,
            },
          });
        }

        const propiedad = await prisma.propiedad.findUnique({
          where: { id: propiedadId },
        });

        if (!propiedad) {
          return reply.status(404).send({
            error: {
              code: 'PROPERTY_NOT_FOUND',
              message: `Propiedad no encontrada con ID "${propiedadId}".`,
              requestId: request.id,
            },
          });
        }

        // Restricción para rol PROPIETARIO: exige usuarioId y pertenencia estricta
        if (request.user?.rol === 'PROPIETARIO') {
          if (!request.user.usuarioId) {
            return reply.status(403).send({
              error: {
                code: 'DOMAIN_IDENTITY_REQUIRED',
                message: 'Se requiere una identidad transaccional (usuarioId) vinculada para consultar el calendario de propietario.',
                requestId: request.id,
              },
            });
          }
          if (propiedad.propietarioId !== request.user.usuarioId) {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'No tiene autorización para consultar el calendario de esta propiedad.',
                requestId: request.id,
              },
            });
          }
        }

        // Rango de fechas del mes a consultar
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 1));

        // Consultar reservas activas que toquen el mes (estados bloqueantes: SOLICITADA, CONFIRMADA, COMPLETADA)
        const activeReservations = await prisma.reserva.findMany({
          where: {
            propiedadId,
            estado: { in: ['SOLICITADA', 'CONFIRMADA', 'COMPLETADA'] },
            ingreso: { lt: endDate },
            salida: { gt: startDate },
          },
          include: {
            huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
          },
        });

        const isPropertyInactive = !propiedad.activa || propiedad.estadoOperativo === 'INACTIVA';
        const isPropertyMaintenance = propiedad.estadoOperativo === 'EN_MANTENIMIENTO';
        const todayStr = new Date().toISOString().slice(0, 10);

        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDayIndex = new Date(year, month - 1, 1).getDay();
        const leadingPadding = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
        const prevMonthDays = new Date(year, month - 1, 0).getDate();

        const days: any[] = [];

        // 1. Padding mes anterior
        for (let i = leadingPadding - 1; i >= 0; i--) {
          const pDay = prevMonthDays - i;
          const pMonth = month === 1 ? 12 : month - 1;
          const pYear = month === 1 ? year - 1 : year;
          const pDateStr = formatDateKey(pYear, pMonth, pDay);

          days.push({
            date: pDateStr,
            dayNumber: pDay,
            isCurrentMonth: false,
            isToday: pDateStr === todayStr,
            status: 'DISPONIBLE',
          });
        }

        // 2. Días mes actual
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = formatDateKey(year, month, day);

          if (isPropertyInactive) {
            days.push({
              date: dateStr,
              dayNumber: day,
              isCurrentMonth: true,
              isToday: dateStr === todayStr,
              status: 'INACTIVA',
            });
            continue;
          }

          if (isPropertyMaintenance) {
            days.push({
              date: dateStr,
              dayNumber: day,
              isCurrentMonth: true,
              isToday: dateStr === todayStr,
              status: 'MANTENIMIENTO',
            });
            continue;
          }

          // Buscar reserva que ocupa la noche de dateStr: [ingreso, salida)
          const occupyingRes = activeReservations.find((r) => {
            const ingStr = r.ingreso.toISOString().slice(0, 10);
            const salStr = r.salida.toISOString().slice(0, 10);
            return ingStr <= dateStr && dateStr < salStr;
          });

          // Buscar check-in y check-out exactos
          const checkinRes = activeReservations.find(
            (r) => r.ingreso.toISOString().slice(0, 10) === dateStr
          );
          const checkoutRes = activeReservations.find(
            (r) => r.salida.toISOString().slice(0, 10) === dateStr
          );

          let status = 'DISPONIBLE';
          if (checkoutRes && checkinRes) {
            status = 'TRANSICION';
          } else if (occupyingRes) {
            status = occupyingRes.estado === 'SOLICITADA' ? 'SOLICITADA' : 'CONFIRMADA';
          }

          const mapCalendarRes = (r: any) => ({
            id: r.id,
            codigo: r.codigo || undefined,
            propiedadId: r.propiedadId,
            huespedId: r.huespedId,
            huespedNombre: r.huesped?.nombreCompleto || 'Huésped',
            ingreso: r.ingreso instanceof Date ? r.ingreso.toISOString().slice(0, 10) : r.ingreso,
            salida: r.salida instanceof Date ? r.salida.toISOString().slice(0, 10) : r.salida,
            estado: r.estado,
            montoAcordado: Number(r.montoAcordado),
            moneda: r.moneda,
            cantidadHuespedes: r.cantidadHuespedes ?? undefined,
            horaCheckIn: r.horaCheckIn || undefined,
            horaCheckOut: r.horaCheckOut || undefined,
            origen: r.origen || undefined,
            notas: request.user?.rol !== 'PROPIETARIO' ? (r.notas || undefined) : undefined,
          });

          days.push({
            date: dateStr,
            dayNumber: day,
            isCurrentMonth: true,
            isToday: dateStr === todayStr,
            status,
            reservation: occupyingRes ? mapCalendarRes(occupyingRes) : undefined,
            checkinReservation: checkinRes ? mapCalendarRes(checkinRes) : undefined,
            checkoutReservation: checkoutRes ? mapCalendarRes(checkoutRes) : undefined,
          });
        }

        // 3. Padding mes siguiente
        const totalRendered = days.length;
        const trailingPadding = (7 - (totalRendered % 7)) % 7;
        for (let day = 1; day <= trailingPadding; day++) {
          const nextMonth = month === 12 ? 1 : month + 1;
          const nextYear = month === 12 ? year + 1 : year;
          const nDateStr = formatDateKey(nextYear, nextMonth, day);

          days.push({
            date: nDateStr,
            dayNumber: day,
            isCurrentMonth: false,
            isToday: nDateStr === todayStr,
            status: 'DISPONIBLE',
          });
        }

        // 4. Métricas de ocupación del mes
        const currentMonthDays = days.filter((d) => d.isCurrentMonth);
        const totalDays = currentMonthDays.length;
        const occupiedDays = currentMonthDays.filter(
          (d) => d.status === 'CONFIRMADA' || d.status === 'SOLICITADA' || d.status === 'TRANSICION'
        ).length;
        const availableDays = currentMonthDays.filter((d) => d.status === 'DISPONIBLE').length;
        const occupancyRate = totalDays > 0 ? Math.round((occupiedDays / totalDays) * 100) : 0;

        return {
          propiedadId,
          year,
          month,
          days,
          summary: {
            totalDays,
            occupiedDays,
            availableDays,
            occupancyRate,
          },
        };
      }
    );

    app.get<{
      Querystring: {
        fecha?: string;
        propiedadId?: string;
      };
    }>(
      '/api/calendario/agenda',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO']) },
      async (request, reply) => {
        const parsedDate = parseCivilDate(request.query.fecha);
        if (!parsedDate) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El parámetro "fecha" es obligatorio y debe tener formato válido YYYY-MM-DD.',
              requestId: request.id,
            },
          });
        }

        const { year, month, day, fecha } = parsedDate;
        const rawPropiedadId = request.query.propiedadId;
        const propiedadId =
          typeof rawPropiedadId === 'string' && rawPropiedadId.trim()
            ? rawPropiedadId.trim()
            : undefined;

        if (request.user?.rol === 'PROPIETARIO' && !request.user.usuarioId) {
          return reply.status(403).send({
            error: {
              code: 'DOMAIN_IDENTITY_REQUIRED',
              message: 'Se requiere una identidad transaccional (usuarioId) vinculada para consultar la agenda de propietario.',
              requestId: request.id,
            },
          });
        }

        if (propiedadId) {
          const propiedad = await prisma.propiedad.findUnique({
            where: { id: propiedadId },
          });

          if (!propiedad) {
            return reply.status(404).send({
              error: {
                code: 'PROPERTY_NOT_FOUND',
                message: `Propiedad no encontrada con ID "${propiedadId}".`,
                requestId: request.id,
              },
            });
          }

          if (
            request.user?.rol === 'PROPIETARIO' &&
            propiedad.propietarioId !== request.user.usuarioId
          ) {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'No tiene autorización para consultar la agenda de esta propiedad.',
                requestId: request.id,
              },
            });
          }
        }

        const targetDate = new Date(Date.UTC(year, month - 1, day));
        const nextDate = new Date(Date.UTC(year, month - 1, day + 1));

        const scopeFilter = propiedadId
          ? { propiedadId }
          : request.user?.rol === 'PROPIETARIO'
            ? { propiedad: { propietarioId: request.user.usuarioId! } }
            : {};

        const reservations = await prisma.reserva.findMany({
          where: {
            estado: { notIn: ['CANCELADA', 'EXPIRADA'] },
            ...scopeFilter,
            OR: [
              { ingreso: { gte: targetDate, lt: nextDate } },
              { salida: { gte: targetDate, lt: nextDate } },
            ],
          },
          include: {
            propiedad: { select: { id: true, nombre: true } },
            huesped: { select: { nombreCompleto: true } },
          },
        });

        const toAgendaItem = (
          r: (typeof reservations)[number],
          hora: string | null
        ): AgendaItem => ({
          reservaId: r.id,
          codigo: r.codigo || undefined,
          propiedadId: r.propiedadId,
          propiedadNombre: r.propiedad?.nombre || '',
          huespedNombre: r.huesped?.nombreCompleto || 'Huésped',
          estado: r.estado,
          hora,
        });

        const llegadas: AgendaItem[] = [];
        const salidas: AgendaItem[] = [];

        for (const r of reservations) {
          if (r.ingreso.toISOString().slice(0, 10) === fecha) {
            llegadas.push(toAgendaItem(r, r.horaCheckIn?.trim() || null));
          }
          if (r.salida.toISOString().slice(0, 10) === fecha) {
            salidas.push(toAgendaItem(r, r.horaCheckOut?.trim() || null));
          }
        }

        llegadas.sort(compareAgendaItems);
        salidas.sort(compareAgendaItems);

        const canViewMaintenance =
          request.user?.rol === 'ADMIN' || request.user?.rol === 'OPERADOR';

        let mantenimiento: AgendaMaintenanceBlock | null = null;

        if (canViewMaintenance) {
          const [maintenanceProps, openOrders] = await Promise.all([
            prisma.propiedad.findMany({
              where: {
                ...(propiedadId ? { id: propiedadId } : {}),
                estadoOperativo: 'EN_MANTENIMIENTO',
              },
              select: {
                id: true,
                nombre: true,
              },
            }),
            prisma.ordenTrabajo.findMany({
              where: {
                ...(propiedadId ? { propiedadId } : {}),
                estado: { in: ['PENDIENTE', 'EN_PROGRESO'] },
              },
              select: {
                id: true,
                propiedadId: true,
                titulo: true,
                estado: true,
                prioridad: true,
                propiedad: {
                  select: { nombre: true },
                },
              },
            }),
          ]);

          const propiedadesEnMantenimiento: AgendaMaintenanceProperty[] = maintenanceProps
            .map((p) => ({
              propiedadId: p.id,
              propiedadNombre: p.nombre,
            }))
            .sort(compareMaintenanceProperties);

          const ordenesAbiertas: AgendaOpenMaintenanceOrder[] = openOrders
            .map((o) => ({
              ordenId: o.id,
              propiedadId: o.propiedadId,
              propiedadNombre: o.propiedad?.nombre || '',
              titulo: o.titulo,
              estado: o.estado as AgendaOpenMaintenanceOrder['estado'],
              prioridad: o.prioridad as AgendaOpenMaintenanceOrder['prioridad'],
            }))
            .sort(compareOpenMaintenanceOrders);

          mantenimiento = {
            propiedadesEnMantenimiento,
            ordenesAbiertas,
          };
        }

        return {
          data: {
            fecha,
            llegadas,
            salidas,
            mantenimiento,
          },
        };
      }
    );
  };
}
