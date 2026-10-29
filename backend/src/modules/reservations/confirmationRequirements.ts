import { Prisma } from '../../generated/prisma/client.js';

export type MotivoRequisitoPendiente =
  | 'RESERVA_NO_ENCONTRADA'
  | 'RESERVA_NO_APTA'
  | 'CONTRATO_NO_VALIDADO'
  | 'CONTRATO_VIGENCIA_PENDIENTE'
  | 'PAGO_ADELANTO_FALTANTE'
  | 'EVIDENCIA_ADELANTO_FALTANTE'
  | 'EVIDENCIA_NO_REVISADA'
  | 'POLITICA_ADELANTO_PENDIENTE'
  | 'EXCEPCION_NO_AUTORIZADA'
  | 'ADELANTO_INSUFICIENTE'
  | 'MONEDA_INCONSISTENTE'
  | 'DISPONIBILIDAD_NO_VALIDA';

export type BaseCalculoAdelanto = 'TOTAL_ACORDADO';

export type PoliticaAdelanto =
  | { tipo: 'PENDIENTE_APROBACION' }
  | {
      tipo: 'HABITUAL_50';
      baseCalculo?: BaseCalculoAdelanto;
      versionPolitica?: string;
      permitePendienteConVoucher?: boolean;
    }
  | {
      tipo: 'CONFIGURADA';
      porcentajeExigible: number;
      baseCalculo: BaseCalculoAdelanto;
      versionPolitica: string;
      permitePendienteConVoucher?: boolean;
      esExcepcion?: boolean;
      motivoExcepcion?: string;
    };

export type PoliticaAdelantoProvider = (
  reservaId: string,
  txOrPrisma?: any
) => Promise<PoliticaAdelanto> | PoliticaAdelanto;

/**
 * Proveedor por defecto para producción:
 * Devuelve siempre PENDIENTE_APROBACION mientras no exista una fuente de política
 * y matriz de autorización aprobada por Diego / Gerencia.
 */
export const defaultPoliticaAdelantoProvider: PoliticaAdelantoProvider = async (
  _reservaId: string
) => {
  return { tipo: 'PENDIENTE_APROBACION' };
};

export interface RequisitosEvaluacion {
  reservaApta: boolean;
  contratoFirmado: boolean;
  pagoRegistrado: boolean;
  evidenciaAdelanto: boolean;
  evidenciaRevisada: boolean;
  adelantoCubierto: boolean;
  adelantoConciliado: boolean; // Informativo para tesorería (no bloqueante comercialmente según Adenda DR-02)
  politicaAdelantoDefinida: boolean;
  disponibilidadValida: boolean;
}

export interface ConfirmationRequirementsResult {
  reservaId: string;
  puedeConfirmar: boolean;
  requisitos: RequisitosEvaluacion;
  motivosPendientes: MotivoRequisitoPendiente[];
  detalles?: {
    montoAcordado?: string;
    totalPagado?: string;
    totalConciliado?: string;
    moneda?: string;
    adelantoRequerido?: string;
    porcentajeAplicado?: number;
    versionPolitica?: string;
    contratosCount?: number;
    pagosCount?: number;
    evidenciasCount?: number;
    evidenciasRevisadasCount?: number;
  };
}

/**
 * Evalúa los requisitos de confirmación de reserva directa (DR-02-FIX).
 *
 * Correcciones críticas aplicadas:
 * - DR02-01: La política proviene exclusivamente del proveedor del servidor, no del cliente.
 * - DR02-02: Exclusión estricta de pagos RECHAZADO, pagos pendientes requieren voucher validado
 *             y política que lo permita explícitamente, deduplicación por pago.id, sin mezclar garantías ni monedas.
 * - DR02-03: Exclusión de contratos sustituidos (reemplazaContratoId) y bloqueo si hay vigencia ambigua.
 *
 * @param prismaClient Cliente Prisma o transacción activa (tx)
 * @param reservaId Identificador de la reserva
 * @param politica Política explícita provista por el servidor (por defecto: PENDIENTE_APROBACION)
 */
export async function evaluateConfirmationRequirements(
  prismaClient: any,
  reservaId: string,
  politica: PoliticaAdelanto = { tipo: 'PENDIENTE_APROBACION' }
): Promise<ConfirmationRequirementsResult> {
  const motivosPendientes: MotivoRequisitoPendiente[] = [];

  const reserva = await prismaClient.reserva.findUnique({
    where: { id: reservaId },
    include: {
      contratos: {
        orderBy: { version: 'asc' },
      },
      pagos: {
        orderBy: { id: 'asc' },
        include: {
          evidencias: true,
        },
      },
    },
  });

  if (!reserva) {
    return {
      reservaId,
      puedeConfirmar: false,
      requisitos: {
        reservaApta: false,
        contratoFirmado: false,
        pagoRegistrado: false,
        evidenciaAdelanto: false,
        evidenciaRevisada: false,
        adelantoCubierto: false,
        adelantoConciliado: false,
        politicaAdelantoDefinida: false,
        disponibilidadValida: false,
      },
      motivosPendientes: ['RESERVA_NO_ENCONTRADA'],
    };
  }

  // 1. Estado de la reserva apto para confirmación (únicamente SOLICITADA)
  const reservaApta = reserva.estado === 'SOLICITADA';
  if (!reservaApta) {
    motivosPendientes.push('RESERVA_NO_APTA');
  }

  // 2. DR02-03: Vigencia y sustitución contractual
  // Resolver relaciones reemplazaContratoId dentro de la misma reserva.
  const contratosMismaReserva = (reserva.contratos || []).filter(
    (c: any) => c.reservaId === reserva.id
  );

  const idsSustituidos = new Set<string>();
  for (const c of contratosMismaReserva) {
    if (c.reemplazaContratoId && typeof c.reemplazaContratoId === 'string') {
      const idTrim = c.reemplazaContratoId.trim();
      if (idTrim !== '') {
        idsSustituidos.add(idTrim);
      }
    }
  }

  // Candidatos vigentes: contratos que NO hayan sido sustituidos por ningún otro contrato
  const contratosVigentes = contratosMismaReserva.filter(
    (c: any) => !idsSustituidos.has(c.id)
  );

  let contratoFirmado = false;
  if (contratosVigentes.length === 0) {
    motivosPendientes.push('CONTRATO_NO_VALIDADO');
  } else if (contratosVigentes.length === 1) {
    const contratoActual = contratosVigentes[0];
    if (contratoActual.estadoFirma === 'VALIDADA') {
      contratoFirmado = true;
    } else {
      motivosPendientes.push('CONTRATO_NO_VALIDADO');
    }
  } else {
    // Existen múltiples contratos vigentes no sustituidos entre sí:
    // La vigencia es ambigua y no debe inventarse; se bloquea con motivo estructurado.
    motivosPendientes.push('CONTRATO_VIGENCIA_PENDIENTE');
  }

  // 3. DR02-02: Pagos elegibles (excluir expresamente RECHAZADO y pagos de otra reserva)
  const todosLosPagos = reserva.pagos || [];
  const pagosElegibles = todosLosPagos.filter(
    (p: any) => p.estado !== 'RECHAZADO' && p.reservaId === reserva.id
  );

  const pagoRegistrado = pagosElegibles.length > 0;
  if (!pagoRegistrado) {
    motivosPendientes.push('PAGO_ADELANTO_FALTANTE');
  }

  // 4. Evidencias documentales recibidas y revisadas (asociadas a pagos no rechazados)
  let totalEvidencias = 0;
  let totalEvidenciasRevisadas = 0;
  for (const pago of pagosElegibles) {
    if (Array.isArray(pago.evidencias)) {
      totalEvidencias += pago.evidencias.length;
      totalEvidenciasRevisadas += pago.evidencias.filter(
        (e: any) => e.estado === 'VALIDADA'
      ).length;
    }
  }

  const evidenciaAdelanto = totalEvidencias > 0;
  if (!evidenciaAdelanto) {
    motivosPendientes.push('EVIDENCIA_ADELANTO_FALTANTE');
  }

  const evidenciaRevisada = totalEvidenciasRevisadas > 0;
  if (evidenciaAdelanto && !evidenciaRevisada) {
    motivosPendientes.push('EVIDENCIA_NO_REVISADA');
  }

  // 5. Moneda y sumas deduplicadas por pago
  const monedaReserva = reserva.moneda.toUpperCase().trim();
  let sumaAdelantoElegible = new Prisma.Decimal(0);
  let sumaConciliada = new Prisma.Decimal(0);
  let huboInconsistenciaMoneda = false;

  // FIX 1: Para HABITUAL_50 y CONFIGURADA, un pago PENDIENTE_CONCILIACION solo puede
  // contribuir al adelanto cuando la bandera permitePendienteConVoucher es estrictamente true.
  // Si la bandera está ausente (undefined) o es false, se excluye del importe elegible.
  const permitePendienteConVoucher =
    (politica.tipo === 'HABITUAL_50' || politica.tipo === 'CONFIGURADA')
      ? politica.permitePendienteConVoucher === true
      : false;

  const pagosSumadosIds = new Set<string>();

  for (const p of pagosElegibles) {
    if (pagosSumadosIds.has(p.id)) continue;
    pagosSumadosIds.add(p.id);

    const monedaPago = (p.moneda || '').toUpperCase().trim();
    if (monedaPago !== monedaReserva) {
      huboInconsistenciaMoneda = true;
      continue;
    }

    const montoPago = new Prisma.Decimal(p.monto);
    const tieneVoucherValidado =
      Array.isArray(p.evidencias) &&
      p.evidencias.some((e: any) => e.estado === 'VALIDADA');

    if (p.estado === 'CONCILIADO') {
      sumaConciliada = sumaConciliada.add(montoPago);
      // Un pago conciliado con voucher validado aporta al adelanto comercial
      if (tieneVoucherValidado) {
        sumaAdelantoElegible = sumaAdelantoElegible.add(montoPago);
      }
    } else if (p.estado === 'PENDIENTE_CONCILIACION') {
      // Contribución comercial de pago pendiente ÚNICAMENTE si la política del servidor
      // lo permite expresamente Y el voucher está documentalmente validado.
      if (permitePendienteConVoucher && tieneVoucherValidado) {
        sumaAdelantoElegible = sumaAdelantoElegible.add(montoPago);
      }
    }
  }

  if (huboInconsistenciaMoneda && pagosElegibles.length > 0 && sumaAdelantoElegible.isZero()) {
    motivosPendientes.push('MONEDA_INCONSISTENTE');
  }

  const adelantoConciliado = sumaConciliada.greaterThan(0);

  // 6. Política de adelanto configurable y suficiencia (DR02-01)
  let politicaAdelantoDefinida = false;
  let adelantoCubierto = false;
  let porcentajeAplicado = 0;
  let versionPolitica = 'NO_DEFINIDA';
  let adelantoRequeridoDecimal = new Prisma.Decimal(0);

  if (politica.tipo === 'PENDIENTE_APROBACION') {
    politicaAdelantoDefinida = false;
    adelantoCubierto = false;
    motivosPendientes.push('POLITICA_ADELANTO_PENDIENTE');
  } else if (politica.tipo === 'HABITUAL_50') {
    politicaAdelantoDefinida = true;
    porcentajeAplicado = 50;
    versionPolitica = politica.versionPolitica || 'HABITUAL_50_V1';
    const montoAcordadoDecimal = new Prisma.Decimal(reserva.montoAcordado);
    adelantoRequeridoDecimal = montoAcordadoDecimal.mul(50).div(100);

    if (sumaAdelantoElegible.greaterThanOrEqualTo(adelantoRequeridoDecimal)) {
      adelantoCubierto = true;
    } else {
      adelantoCubierto = false;
      motivosPendientes.push('ADELANTO_INSUFICIENTE');
    }
  } else if (politica.tipo === 'CONFIGURADA') {
    versionPolitica = politica.versionPolitica;
    porcentajeAplicado = politica.porcentajeExigible;

    if (politica.esExcepcion) {
      // Sin política de excepciones aprobada formalmente en backend, se bloquea por seguridad
      politicaAdelantoDefinida = false;
      adelantoCubierto = false;
      motivosPendientes.push('EXCEPCION_NO_AUTORIZADA');
    } else if (
      typeof politica.porcentajeExigible === 'number' &&
      politica.porcentajeExigible > 0 &&
      politica.porcentajeExigible <= 100
    ) {
      politicaAdelantoDefinida = true;
      const montoAcordadoDecimal = new Prisma.Decimal(reserva.montoAcordado);
      adelantoRequeridoDecimal = montoAcordadoDecimal
        .mul(politica.porcentajeExigible)
        .div(100);

      if (sumaAdelantoElegible.greaterThanOrEqualTo(adelantoRequeridoDecimal)) {
        adelantoCubierto = true;
      } else {
        adelantoCubierto = false;
        motivosPendientes.push('ADELANTO_INSUFICIENTE');
      }
    } else {
      politicaAdelantoDefinida = false;
      adelantoCubierto = false;
      motivosPendientes.push('POLITICA_ADELANTO_PENDIENTE');
    }
  } else {
    politicaAdelantoDefinida = false;
    adelantoCubierto = false;
    motivosPendientes.push('POLITICA_ADELANTO_PENDIENTE');
  }

  // 7. Disponibilidad de fechas en PostgreSQL [ingreso, salida)
  const conflicto = await prismaClient.reserva.findFirst({
    where: {
      propiedadId: reserva.propiedadId,
      id: { not: reserva.id },
      estado: { in: ['CONFIRMADA', 'SOLICITADA', 'COMPLETADA'] },
      ingreso: { lt: reserva.salida },
      salida: { gt: reserva.ingreso },
    },
  });

  const disponibilidadValida = !conflicto;
  if (!disponibilidadValida) {
    motivosPendientes.push('DISPONIBILIDAD_NO_VALIDA');
  }

  const puedeConfirmar =
    reservaApta &&
    contratoFirmado &&
    pagoRegistrado &&
    evidenciaAdelanto &&
    evidenciaRevisada &&
    politicaAdelantoDefinida &&
    adelantoCubierto &&
    disponibilidadValida;

  return {
    reservaId: reserva.id,
    puedeConfirmar,
    requisitos: {
      reservaApta,
      contratoFirmado,
      pagoRegistrado,
      evidenciaAdelanto,
      evidenciaRevisada,
      adelantoCubierto,
      adelantoConciliado,
      politicaAdelantoDefinida,
      disponibilidadValida,
    },
    motivosPendientes,
    detalles: {
      montoAcordado: new Prisma.Decimal(reserva.montoAcordado).toFixed(2),
      totalPagado: sumaAdelantoElegible.toFixed(2),
      totalConciliado: sumaConciliada.toFixed(2),
      moneda: reserva.moneda,
      adelantoRequerido: adelantoRequeridoDecimal.toFixed(2),
      porcentajeAplicado,
      versionPolitica,
      contratosCount: contratosMismaReserva.length,
      pagosCount: pagosElegibles.length,
      evidenciasCount: totalEvidencias,
      evidenciasRevisadasCount: totalEvidenciasRevisadas,
    },
  };
}
