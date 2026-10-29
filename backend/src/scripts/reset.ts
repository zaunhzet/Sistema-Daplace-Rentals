import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export async function safeResetDatabase(options: { forceConfirm?: boolean; databaseUrl?: string } = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definida.');
  }

  // 1. Validar entorno no productivo
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    throw new Error('OPERACIÓN ABORTADA: reset bloqueado en entorno de producción.');
  }

  // 2. Analizar URL de base de datos
  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();

  // 3. Comprobar host: estrictamente local
  const allowedHosts = ['localhost', '127.0.0.1', '::1'];
  if (!allowedHosts.includes(host)) {
    throw new Error(`OPERACIÓN ABORTADA: el host "${host}" no es una base local permitida.`);
  }

  // 4. Comprobar nombre de base: exclusivamente daplace_dev o daplace_test
  const allowedDbs = ['daplace_dev', 'daplace_test'];
  if (!allowedDbs.includes(dbName)) {
    throw new Error(`OPERACIÓN ABORTADA: la base "${dbName}" no está autorizada para reset. Solo se permite ${allowedDbs.join(', ')}.`);
  }

  // 5. Exigir confirmación explícita
  const hasConfirmFlag = process.argv.includes('--confirm') || options.forceConfirm === true || process.env.CONFIRM_RESET === 'true';
  if (!hasConfirmFlag) {
    throw new Error(
      'OPERACIÓN ABORTADA: El comando requiere confirmación explícita. Ejecute con "--confirm" o "CONFIRM_RESET=true npm run db:reset:dev".'
    );
  }

  console.log(`[SAFE RESET] Procediendo a limpiar datos exclusivamente en ${dbName} @ ${host}...`);

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
