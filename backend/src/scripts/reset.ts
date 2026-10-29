import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

export interface ResetOptions {
  forceConfirm?: boolean;
  databaseUrl?: string;
}

/**
 * Valida minuciosamente que la URL de base de datos sea apta y segura para un reinicio.
 */
export function validateResetTarget(
  databaseUrl: string | undefined,
  context: 'test' | 'dev' = 'dev',
  forceConfirm = false
): { host: string; dbName: string } {
  if (!databaseUrl || typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('OPERACIÓN ABORTADA: La URL de base de datos es obligatoria.');
  }

  // 1. Validar entorno no productivo
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('OPERACIÓN ABORTADA: reset bloqueado categóricamente en entorno de producción.');
  }

  // 2. Analizar URL de base de datos
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`OPERACIÓN ABORTADA: URL de base de datos malformada "${databaseUrl}".`);
  }

  const host = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();

  // 3. Comprobar host: estrictamente local
  if (!ALLOWED_LOCAL_HOSTS.includes(host)) {
    throw new Error(`OPERACIÓN ABORTADA: El host "${host}" no es una base local permitida (${ALLOWED_LOCAL_HOSTS.join(', ')}).`);
  }

  // 4. En contexto de test, EXCLUSIVAMENTE se admite "daplace_test"
  if (context === 'test') {
    if (dbName !== 'daplace_test') {
      throw new Error(
        `OPERACIÓN ABORTADA POR SEGURIDAD: Las suites de prueba solo pueden operar y limpiar "daplace_test". Intento de reset en "${dbName}" bloqueado.`
      );
    }
    return { host, dbName };
  }

  // 5. En contexto manual/dev, se permite daplace_dev o daplace_test
  const allowedDbs = ['daplace_dev', 'daplace_test'];
  if (!allowedDbs.includes(dbName)) {
    throw new Error(
      `OPERACIÓN ABORTADA: La base "${dbName}" no está autorizada para reset. Solo se permite ${allowedDbs.join(', ')}.`
    );
  }

  // 6. Exigir confirmación explícita para reset manual de desarrollo
  const hasConfirmFlag =
    process.argv.includes('--confirm') || forceConfirm === true || process.env.CONFIRM_RESET === 'true';
  if (!hasConfirmFlag) {
    throw new Error(
      'OPERACIÓN ABORTADA: El comando requiere confirmación explícita. Ejecute con "--confirm" o "CONFIRM_RESET=true npm run db:reset:dev".'
    );
  }

  return { host, dbName };
}

/**
 * Limpieza segura para el entorno de pruebas automatizadas.
 * Exige estrictamente que la base sea 'daplace_test' en host local.
 */
export async function safeResetTestDatabase(databaseUrl: string) {
  validateResetTarget(databaseUrl, 'test', true);

  const { prisma, close } = createDatabase(databaseUrl);
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "auditoria_eventos",
        "reservas",
        "propiedades",
        "huespedes",
        "usuarios"
      RESTART IDENTITY CASCADE;
    `);
  } finally {
    await close();
  }
}

/**
 * Reinicio seguro para entorno de desarrollo manual (daplace_dev).
 */
export async function safeResetDatabase(options: ResetOptions = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  const { host, dbName } = validateResetTarget(databaseUrl, 'dev', options.forceConfirm);

  console.log(`[SAFE RESET] Procediendo a limpiar datos exclusivamente en ${dbName} @ ${host}...`);

  const { prisma, close } = createDatabase(databaseUrl!);
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "auditoria_eventos",
        "reservas",
        "propiedades",
        "huespedes",
        "usuarios"
      RESTART IDENTITY CASCADE;
    `);

    // Registrar evento de auditoría de reinicio
    await prisma.auditoriaEvento.create({
      data: {
        entidad: 'Sistema',
        entidadId: 'database-reset',
        accion: 'RESET_EJECUTADO',
        actor: 'DEV_CLI',
        motivo: 'Reinicio seguro de base de datos de desarrollo solicitado con confirmación.',
      },
    });

    console.log(`[SAFE RESET] Tablas limpiadas con éxito en ${dbName}. Estructura y migraciones conservadas.`);
  } finally {
    await close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  safeResetDatabase()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}

