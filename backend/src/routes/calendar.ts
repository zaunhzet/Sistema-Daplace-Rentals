import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../shared/auth.js';

export function formatDateKey(year: number, month: number, day: number): string {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

          days.push({
            date: dateStr,
            dayNumber: day,
            isCurrentMonth: true,
            isToday: dateStr === todayStr,
            status,
            reservation: occupyingRes
              ? {
                  id: occupyingRes.id,
                  propiedadId: occupyingRes.propiedadId,
                  huespedId: occupyingRes.huespedId,
                  huespedNombre: occupyingRes.huesped.nombreCompleto,
                  ingreso: occupyingRes.ingreso.toISOString().slice(0, 10),
                  salida: occupyingRes.salida.toISOString().slice(0, 10),
                  estado: occupyingRes.estado,
                  montoAcordado: Number(occupyingRes.montoAcordado),
                  moneda: occupyingRes.moneda,
                }
              : undefined,
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
  };
}
