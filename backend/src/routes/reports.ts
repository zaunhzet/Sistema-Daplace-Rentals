import type { FastifyPluginAsync } from 'fastify';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../shared/auth.js';

export interface LiquidationReportResponse {
  propiedad: {
    id: string;
    nombre: string;
    direccion: string;
    propietarioId: string;
    propietarioNombre: string;
    moneda: string;
  };
  periodo: {
    mes: number;
    anio: number;
    etiqueta: string;
  };
  moneda: string;
  resumen: {
    totalIngresos: number;
    totalGastos: number;
    balanceNeto: number;
    garantiasEnCustodia: number;
    cantidadPagosConciliados: number;
    cantidadGastosAprobados: number;
  };
  ingresos: Array<{
    pagoId: string;
    reservaId: string;
    fechaPago: string;
    concepto: string;
    metodoPago: string;
    referenciaOperacion: string;
    monto: number;
  }>;
  gastos: Array<{
    gastoId: string;
    fechaGasto: string;
    titulo: string;
    categoria: string;
    pagadoPor: string;
    monto: number;
  }>;
  garantias: Array<{
    garantiaId: string;
    reservaId: string;
    estado: string;
    monto: number;
  }>;
}

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function registerReportsRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Obtener reporte de liquidación contable de un propietario por inmueble y período
    app.get<{
      Querystring: {
        propiedadId: string;
        mes?: string | number;
        anio?: string | number;
        format?: string;
      };
    }>(
      '/api/reportes/propietario',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO']) },
      async (request, reply) => {
        const { propiedadId, format } = request.query;
        let mes = Number(request.query.mes);
        let anio = Number(request.query.anio);

        if (!propiedadId || typeof propiedadId !== 'string') {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El parámetro propiedadId es obligatorio.',
              requestId: request.id,
            },
          });
        }

        const now = new Date();
        if (Number.isNaN(mes) || mes < 1 || mes > 12) {
          mes = now.getUTCMonth() + 1;
        }
        if (Number.isNaN(anio) || anio < 2000 || anio > 2100) {
          anio = now.getUTCFullYear();
        }

        // 1. Verificar existencia de la propiedad
        const propiedad = await prisma.propiedad.findUnique({
          where: { id: propiedadId },
          include: {
            propietario: {
              select: { id: true, nombre: true, email: true },
            },
          },
        });

        if (!propiedad) {
          return reply.status(404).send({
            error: {
              code: 'PROPERTY_NOT_FOUND',
              message: 'La propiedad solicitada no existe.',
              requestId: request.id,
            },
          });
        }

        // 2. Aislamiento RBAC estricto: PROPIETARIO solo puede consultar sus propiedades
        if (request.user?.rol === 'PROPIETARIO') {
          if (!request.user.usuarioId) {
            return reply.status(403).send({
              error: {
                code: 'DOMAIN_IDENTITY_REQUIRED',
                message: 'Se requiere una identidad transaccional vinculada para acceder a liquidaciones.',
                requestId: request.id,
              },
            });
          }

          if (propiedad.propietarioId !== request.user.usuarioId) {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'No tiene autorización para consultar liquidaciones de una propiedad ajena.',
                requestId: request.id,
              },
            });
          }
        }

        // 3. Rango de fechas UTC para el mes
        const startOfMonth = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0));
        const endOfMonth = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));

        // 4. Pagos conciliados de la propiedad dentro del período
        const pagosConciliados = await prisma.pago.findMany({
          where: {
            reserva: {
              propiedadId,
            },
            estado: 'CONCILIADO',
            fechaPago: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
          select: {
            id: true,
            reservaId: true,
            fechaPago: true,
            concepto: true,
            metodoPago: true,
            referenciaOperacion: true,
            monto: true,
          },
          orderBy: { fechaPago: 'asc' },
        });

        // 5. Gastos aprobados de la propiedad dentro del período
        const gastosAprobados = await prisma.gasto.findMany({
          where: {
            propiedadId,
            estado: 'APROBADO',
            periodoMes: mes,
            periodoAnio: anio,
          },
          select: {
            id: true,
            fechaGasto: true,
            titulo: true,
            categoria: true,
            pagadoPor: true,
            monto: true,
          },
          orderBy: { fechaGasto: 'asc' },
        });

        // 6. Garantías en custodia asociadas a reservas del período (Fondos en custodia — NO ingresos)
        const garantiasCustodia = await prisma.garantia.findMany({
          where: {
            reserva: {
              propiedadId,
              ingreso: { lte: endOfMonth },
              salida: { gte: startOfMonth },
            },
            estado: 'EN_CUSTODIA',
          },
          select: {
            id: true,
            reservaId: true,
            estado: true,
            montoTotal: true,
          },
        });

        // 7. Cálculos contables con precisión exacta
        let totalIngresosDecimal = new Prisma.Decimal(0);
        for (const p of pagosConciliados) {
          totalIngresosDecimal = totalIngresosDecimal.add(p.monto);
        }

        let totalGastosDecimal = new Prisma.Decimal(0);
        for (const g of gastosAprobados) {
          totalGastosDecimal = totalGastosDecimal.add(g.monto);
        }

        const balanceNetoDecimal = totalIngresosDecimal.sub(totalGastosDecimal);

        let totalGarantiasCustodiaDecimal = new Prisma.Decimal(0);
        for (const gar of garantiasCustodia) {
          totalGarantiasCustodiaDecimal = totalGarantiasCustodiaDecimal.add(gar.montoTotal);
        }

        const mesNombre = NOMBRES_MESES[mes - 1] || `Mes ${mes}`;
        const etiquetaPeriodo = `${mesNombre} ${anio}`;

        const reportData: LiquidationReportResponse = {
          propiedad: {
            id: propiedad.id,
            nombre: propiedad.nombre,
            direccion: propiedad.direccion,
            propietarioId: propiedad.propietarioId,
            propietarioNombre: propiedad.propietario?.nombre || 'Propietario no asignado',
            moneda: propiedad.moneda || 'PEN',
          },
          periodo: {
            mes,
            anio,
            etiqueta: etiquetaPeriodo,
          },
          moneda: propiedad.moneda || 'PEN',
          resumen: {
            totalIngresos: Number(totalIngresosDecimal.toFixed(2)),
            totalGastos: Number(totalGastosDecimal.toFixed(2)),
            balanceNeto: Number(balanceNetoDecimal.toFixed(2)),
            garantiasEnCustodia: Number(totalGarantiasCustodiaDecimal.toFixed(2)),
            cantidadPagosConciliados: pagosConciliados.length,
            cantidadGastosAprobados: gastosAprobados.length,
          },
          ingresos: pagosConciliados.map((p) => ({
            pagoId: p.id,
            reservaId: p.reservaId,
            fechaPago: p.fechaPago.toISOString().slice(0, 10),
            concepto: p.concepto,
            metodoPago: p.metodoPago,
            referenciaOperacion: p.referenciaOperacion,
            monto: Number(p.monto.toFixed(2)),
          })),
          gastos: gastosAprobados.map((g) => ({
            gastoId: g.id,
            fechaGasto: g.fechaGasto.toISOString().slice(0, 10),
            titulo: g.titulo,
            categoria: g.categoria,
            pagadoPor: g.pagadoPor,
            monto: Number(g.monto.toFixed(2)),
          })),
          garantias: garantiasCustodia.map((gar) => ({
            garantiaId: gar.id,
            reservaId: gar.reservaId,
            estado: gar.estado,
            monto: Number(gar.montoTotal.toFixed(2)),
          })),
        };

        // Si se solicita exportación CSV (HU-12)
        if (format === 'csv') {
          const csvLines: string[] = [];
          csvLines.push('LIQUIDACION DE PROPIETARIO - DAPLACE RENTALS');
          csvLines.push(`Inmueble,"${propiedad.nombre.replace(/"/g, '""')}" (${propiedad.id})`);
          csvLines.push(`Propietario,"${(propiedad.propietario?.nombre || '').replace(/"/g, '""')}"`);
          csvLines.push(`Periodo,${mes}/${anio} (${etiquetaPeriodo})`);
          csvLines.push(`Moneda,${propiedad.moneda || 'PEN'}`);
          csvLines.push('');
          csvLines.push('RESUMEN FINANCIERO');
          csvLines.push(`Total Ingresos Conciliados,${reportData.resumen.totalIngresos.toFixed(2)}`);
          csvLines.push(`Total Gastos Deducibles,${reportData.resumen.totalGastos.toFixed(2)}`);
          csvLines.push(`Balance Neto a Transferir,${reportData.resumen.balanceNeto.toFixed(2)}`);
          csvLines.push(`Garantias en Custodia (Fondos no computables como ingreso),${reportData.resumen.garantiasEnCustodia.toFixed(2)}`);
          csvLines.push('');
          csvLines.push('DETALLE DE INGRESOS CONCILIADOS');
          csvLines.push('Fecha Pago,ID Reserva,Concepto,Metodo Pago,Referencia,Monto');
          for (const item of reportData.ingresos) {
            csvLines.push(
              `${item.fechaPago},${item.reservaId},${item.concepto},${item.metodoPago},"${item.referenciaOperacion.replace(/"/g, '""')}",${item.monto.toFixed(2)}`
            );
          }
          csvLines.push('');
          csvLines.push('DETALLE DE GASTOS DEDUCIBLES');
          csvLines.push('Fecha Gasto,Categoria,Titulo,Pagado Por,Monto');
          for (const item of reportData.gastos) {
            csvLines.push(
              `${item.fechaGasto},${item.categoria},"${item.titulo.replace(/"/g, '""')}",${item.pagadoPor},${item.monto.toFixed(2)}`
            );
          }
          csvLines.push('');
          csvLines.push('GARANTIAS EN CUSTODIA (INFORMATIVO)');
          csvLines.push('ID Garantia,ID Reserva,Estado,Monto');
          for (const item of reportData.garantias) {
            csvLines.push(`${item.garantiaId},${item.reservaId},${item.estado},${item.monto.toFixed(2)}`);
          }

          const csvContent = csvLines.join('\r\n');
          const cleanPropName = propiedad.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const filename = `liquidacion-${cleanPropName}-${anio}-${String(mes).padStart(2, '0')}.csv`;

          reply.header('Content-Type', 'text/csv; charset=utf-8');
          reply.header('Content-Disposition', `attachment; filename="${filename}"`);
          return reply.send(csvContent);
        }

        return reportData;
      }
    );

    // 2. Descarga directa explícita en formato CSV (Ruta alias para HU-12)
    app.get<{
      Querystring: {
        propiedadId: string;
        mes?: string | number;
        anio?: string | number;
      };
    }>(
      '/api/reportes/propietario/export',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO']) },
      async (request, reply) => {
        // Redirige internamente con format=csv
        (request.query as any).format = 'csv';
        const url = `/api/reportes/propietario?propiedadId=${encodeURIComponent(
          request.query.propiedadId || ''
        )}&mes=${request.query.mes || ''}&anio=${request.query.anio || ''}&format=csv`;
        return app.inject({
          method: 'GET',
          url,
          headers: {
            authorization: request.headers.authorization || '',
          },
        }).then((res) => {
          reply.status(res.statusCode);
          for (const [key, val] of Object.entries(res.headers)) {
            if (val) reply.header(key, val);
          }
          return reply.send(res.body);
        });
      }
    );
  };
}
