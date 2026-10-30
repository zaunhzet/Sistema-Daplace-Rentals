export type CanalReserva = 'DIRECTO' | 'WEB' | 'AIRBNB';
export type CanalAviso = 'EMAIL' | 'WHATSAPP' | 'SISTEMA';

export type TipoPoliticaExpiracion =
  | 'DESACTIVADA'
  | 'DURACION_EXPLICITA'
  | 'REGLA_CALENDARIO';

export interface PoliticaExpiracionDesactivada {
  tipo: 'DESACTIVADA';
  version: string;
  motivo?: string;
}

export interface PoliticaExpiracionDuracionExplicita {
  tipo: 'DURACION_EXPLICITA';
  version: string;
  duracionMs: number;
  anticipacionAvisoMs?: number;
  canalAviso?: CanalAviso;
  plantillaAviso?: string;
  canalesAplicables: CanalReserva[];
}

export interface PoliticaExpiracionReglaCalendario {
  tipo: 'REGLA_CALENDARIO';
  version: string;
  diasCalendario: number;
  horaCorteUtc?: string;
  anticipacionAvisoMs?: number;
  canalAviso?: CanalAviso;
  plantillaAviso?: string;
  canalesAplicables: CanalReserva[];
  resolver?: (inicio: Date, dias: number, horaCorte?: string) => Date;
}

export type ExpirationPolicy =
  | PoliticaExpiracionDesactivada
  | PoliticaExpiracionDuracionExplicita
  | PoliticaExpiracionReglaCalendario;

export interface ExpirationCalculationResult {
  aplica: boolean;
  plazoIniciadoEn?: Date;
  venceEn?: Date;
  avisoProgramadoEn?: Date;
  canalAviso?: CanalAviso;
  plantillaAviso?: string;
  politicaPlazoVersion?: string;
  politicaPlazoSnapshot?: Record<string, unknown>;
  motivoExclusion?: string;
}

export type ExpirationPolicyProvider = (
  context: {
    origen?: string;
    propiedadId?: string;
    reservaId?: string;
  }
) => Promise<ExpirationPolicy> | ExpirationPolicy;

/**
 * Proveedor por defecto para producción:
 * La política productiva permanece estrictamente DESACTIVADA por defecto
 * mientras no exista aprobación comercial explícita.
 */
export const defaultExpirationPolicyProvider: ExpirationPolicyProvider = () => {
  return {
    tipo: 'DESACTIVADA',
    version: 'v0-desactivada-default',
    motivo: 'Política productiva de expiración automática desactivada por defecto pendiente de aprobación comercial.',
  };
};

/**
 * Validación rigurosa de configuración de políticas de expiración.
 * Lanza un error ante configuraciones incompletas, duraciones no positivas o tipos inválidos.
 */
export function validateExpirationPolicy(policy: unknown): ExpirationPolicy {
  if (!policy || typeof policy !== 'object') {
    throw new Error('CONFIGURACIÓN INVÁLIDA: La política de expiración debe ser un objeto.');
  }

  const p = policy as Record<string, unknown>;

  if (typeof p.version !== 'string' || p.version.trim() === '') {
    throw new Error('CONFIGURACIÓN INVÁLIDA: La versión de política es obligatoria y debe ser una cadena no vacía.');
  }

  if (p.tipo === 'DESACTIVADA') {
    return {
      tipo: 'DESACTIVADA',
      version: p.version.trim(),
      motivo: typeof p.motivo === 'string' ? p.motivo : undefined,
    };
  }

  if (p.tipo === 'DURACION_EXPLICITA') {
    if (typeof p.duracionMs !== 'number' || !Number.isFinite(p.duracionMs) || p.duracionMs <= 0 || !Number.isInteger(p.duracionMs)) {
      throw new Error('CONFIGURACIÓN INVÁLIDA: duracionMs debe ser un entero positivo mayor a cero.');
    }

    if (!Array.isArray(p.canalesAplicables) || p.canalesAplicables.length === 0) {
      throw new Error('CONFIGURACIÓN INVÁLIDA: canalesAplicables debe ser un arreglo no vacío de canales válidos.');
    }

    const validChannels: CanalReserva[] = ['DIRECTO', 'WEB', 'AIRBNB'];
    for (const c of p.canalesAplicables) {
      if (!validChannels.includes(c as CanalReserva)) {
        throw new Error(`CONFIGURACIÓN INVÁLIDA: Canal "${c}" no es reconocido.`);
      }
    }

    let anticipacion: number | undefined = undefined;
    if (p.anticipacionAvisoMs !== undefined && p.anticipacionAvisoMs !== null) {
      if (typeof p.anticipacionAvisoMs !== 'number' || !Number.isFinite(p.anticipacionAvisoMs) || p.anticipacionAvisoMs <= 0) {
        throw new Error('CONFIGURACIÓN INVÁLIDA: anticipacionAvisoMs debe ser un número positivo.');
      }
      if (p.anticipacionAvisoMs >= p.duracionMs) {
        throw new Error('CONFIGURACIÓN INVÁLIDA: anticipacionAvisoMs debe ser menor que duracionMs.');
      }
      anticipacion = p.anticipacionAvisoMs;
    }

    return {
      tipo: 'DURACION_EXPLICITA',
      version: p.version.trim(),
      duracionMs: p.duracionMs,
      anticipacionAvisoMs: anticipacion,
      canalAviso: typeof p.canalAviso === 'string' ? (p.canalAviso as CanalAviso) : undefined,
      plantillaAviso: typeof p.plantillaAviso === 'string' ? p.plantillaAviso : undefined,
      canalesAplicables: [...p.canalesAplicables] as CanalReserva[],
    };
  }

  if (p.tipo === 'REGLA_CALENDARIO') {
    if (typeof p.diasCalendario !== 'number' || !Number.isFinite(p.diasCalendario) || p.diasCalendario <= 0 || !Number.isInteger(p.diasCalendario)) {
      throw new Error('CONFIGURACIÓN INVÁLIDA: diasCalendario debe ser un entero positivo mayor a cero.');
    }

    if (!Array.isArray(p.canalesAplicables) || p.canalesAplicables.length === 0) {
      throw new Error('CONFIGURACIÓN INVÁLIDA: canalesAplicables debe ser un arreglo no vacío de canales válidos.');
    }

    let anticipacion: number | undefined = undefined;
    if (p.anticipacionAvisoMs !== undefined && p.anticipacionAvisoMs !== null) {
      if (typeof p.anticipacionAvisoMs !== 'number' || !Number.isFinite(p.anticipacionAvisoMs) || p.anticipacionAvisoMs <= 0) {
        throw new Error('CONFIGURACIÓN INVÁLIDA: anticipacionAvisoMs debe ser un número positivo.');
      }
      anticipacion = p.anticipacionAvisoMs;
    }

    return {
      tipo: 'REGLA_CALENDARIO',
      version: p.version.trim(),
      diasCalendario: p.diasCalendario,
      horaCorteUtc: typeof p.horaCorteUtc === 'string' ? p.horaCorteUtc.trim() : undefined,
      anticipacionAvisoMs: anticipacion,
      canalAviso: typeof p.canalAviso === 'string' ? (p.canalAviso as CanalAviso) : undefined,
      plantillaAviso: typeof p.plantillaAviso === 'string' ? p.plantillaAviso : undefined,
      canalesAplicables: [...p.canalesAplicables] as CanalReserva[],
      resolver: typeof p.resolver === 'function' ? (p.resolver as any) : undefined,
    };
  }

  throw new Error(`CONFIGURACIÓN INVÁLIDA: Tipo de política "${String(p.tipo)}" no es reconocido.`);
}

/**
 * Resuelve y calcula el vencimiento de una solicitud de reserva según la política provista.
 *
 * REGLAS DE SEGURIDAD Y NEGOCIO:
 * 1. Los parámetros del cliente jamás controlan ni alteran el plazo calculado.
 * 2. Si la política está DESACTIVADA, no se genera plazo (campos permanecen nulos).
 * 3. Si el canal/origen no está contemplado en canalesAplicables, no se genera plazo.
 * 4. REGLA_CALENDARIO requiere resolver oficial aprobado; sin él falla de forma controlada.
 * 5. Si faltan canal o plantilla en la política, no se planifica aviso previo.
 * 6. El snapshot resultante es un objeto inmutable serializable que se persiste con la reserva.
 */
export function resolveExpirationForReservation(
  rawPolicy: ExpirationPolicy,
  context: {
    origen: string;
    now: Date;
    clientPayload?: Record<string, unknown>;
  }
): ExpirationCalculationResult {
  const policy = validateExpirationPolicy(rawPolicy);

  if (policy.tipo === 'DESACTIVADA') {
    return {
      aplica: false,
      motivoExclusion: 'POLITICA_DESACTIVADA',
      politicaPlazoVersion: policy.version,
    };
  }

  const canal = context.origen as CanalReserva;
  if (!policy.canalesAplicables.includes(canal)) {
    return {
      aplica: false,
      motivoExclusion: 'CANAL_NO_APLICABLE',
      politicaPlazoVersion: policy.version,
    };
  }

  const plazoIniciadoEn = new Date(context.now.getTime());

  if (policy.tipo === 'DURACION_EXPLICITA') {
    const venceEn = new Date(plazoIniciadoEn.getTime() + policy.duracionMs);
    let avisoProgramadoEn: Date | undefined = undefined;
    let canalAviso: CanalAviso | undefined = undefined;
    let plantillaAviso: string | undefined = undefined;

    if (
      policy.anticipacionAvisoMs !== undefined &&
      policy.canalAviso !== undefined &&
      policy.plantillaAviso !== undefined
    ) {
      avisoProgramadoEn = new Date(venceEn.getTime() - policy.anticipacionAvisoMs);
      if (avisoProgramadoEn.getTime() > plazoIniciadoEn.getTime() && avisoProgramadoEn.getTime() < venceEn.getTime()) {
        canalAviso = policy.canalAviso;
        plantillaAviso = policy.plantillaAviso;
      } else {
        avisoProgramadoEn = undefined;
      }
    }

    const politicaPlazoSnapshot: Record<string, unknown> = {
      tipo: policy.tipo,
      version: policy.version,
      duracionMs: policy.duracionMs,
      anticipacionAvisoMs: policy.anticipacionAvisoMs ?? null,
      canalAviso: canalAviso ?? null,
      plantillaAviso: plantillaAviso ?? null,
      canalesAplicables: policy.canalesAplicables,
      calculadoEn: context.now.toISOString(),
    };

    return {
      aplica: true,
      plazoIniciadoEn,
      venceEn,
      avisoProgramadoEn,
      canalAviso,
      plantillaAviso,
      politicaPlazoVersion: policy.version,
      politicaPlazoSnapshot,
    };
  }

  if (policy.tipo === 'REGLA_CALENDARIO') {
    if (!policy.resolver) {
      throw new Error(
        'CALENDAR_POLICY_RESOLVER_UNAVAILABLE: Las políticas de tipo REGLA_CALENDARIO requieren un resolver de calendario comercial oficialmente aprobado.'
      );
    }

    const venceEn = policy.resolver(plazoIniciadoEn, policy.diasCalendario, policy.horaCorteUtc);
    if (!venceEn || venceEn.getTime() <= plazoIniciadoEn.getTime()) {
      throw new Error(
        'CALENDAR_POLICY_INVALID_RESULT: El resolver de calendario debe devolver una fecha estrictamente posterior al inicio del plazo.'
      );
    }

    let avisoProgramadoEn: Date | undefined = undefined;
    let canalAviso: CanalAviso | undefined = undefined;
    let plantillaAviso: string | undefined = undefined;

    if (
      policy.anticipacionAvisoMs !== undefined &&
      policy.canalAviso !== undefined &&
      policy.plantillaAviso !== undefined
    ) {
      avisoProgramadoEn = new Date(venceEn.getTime() - policy.anticipacionAvisoMs);
      if (avisoProgramadoEn.getTime() > plazoIniciadoEn.getTime() && avisoProgramadoEn.getTime() < venceEn.getTime()) {
        canalAviso = policy.canalAviso;
        plantillaAviso = policy.plantillaAviso;
      } else {
        avisoProgramadoEn = undefined;
      }
    }

    const politicaPlazoSnapshot: Record<string, unknown> = {
      tipo: policy.tipo,
      version: policy.version,
      diasCalendario: policy.diasCalendario,
      horaCorteUtc: policy.horaCorteUtc ?? null,
      anticipacionAvisoMs: policy.anticipacionAvisoMs ?? null,
      canalAviso: canalAviso ?? null,
      plantillaAviso: plantillaAviso ?? null,
      canalesAplicables: policy.canalesAplicables,
      calculadoEn: context.now.toISOString(),
    };

    return {
      aplica: true,
      plazoIniciadoEn,
      venceEn,
      avisoProgramadoEn,
      canalAviso,
      plantillaAviso,
      politicaPlazoVersion: policy.version,
      politicaPlazoSnapshot,
    };
  }

  return {
    aplica: false,
    motivoExclusion: 'TIPO_POLITICA_NO_SOPORTADO',
  };
}
