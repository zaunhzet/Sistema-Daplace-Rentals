import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { validateResetTarget, safeResetTestDatabase } from '../src/scripts/reset.js';
import { createDatabase } from '../src/shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

/**
 * Obtiene y valida estrictamente DATABASE_TEST_URL para los tests.
 * Falla inmediatamente si no está configurada, si apunta a un host remoto o a cualquier base que no sea 'daplace_test'.
 * JAMÁS utiliza DATABASE_URL como fallback.
 */
export function getRequiredTestDatabaseUrl(): string {
  const testUrl = process.env.DATABASE_TEST_URL;
  if (!testUrl || typeof testUrl !== 'string' || testUrl.trim() === '') {
    throw new Error(
      'CONFIGURACIÓN INSEGURA ABORTADA: DATABASE_TEST_URL no está definida en las variables de entorno. Las pruebas no pueden ejecutarse sobre bases compartidas ni sobre DATABASE_URL.'
    );
  }

  // Valida que sea estrictamente 'daplace_test' en host local
  validateResetTarget(testUrl, 'test', true);

  return testUrl;
}

export { safeResetTestDatabase, createDatabase };
