import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

dotenv.config({ path: '../.env' });

function resolveMigrationUrl(): string {
  const directUrl = process.env.DIRECT_DATABASE_URL;
  if (directUrl && directUrl.trim() !== '') {
    return directUrl.trim();
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl || rawUrl.trim() === '') {
    throw new Error('DATABASE_URL o DIRECT_DATABASE_URL es obligatoria para ejecutar migraciones.');
  }

  const url = rawUrl.trim();

  // Para migraciones remotas (ej. Supabase, poolers, cloud), es OBLIGATORIO definir DIRECT_DATABASE_URL explícita.
  // No se permite fallback silencioso a DATABASE_URL.
  try {
    const parsed = new URL(url.replace(/^postgresql:\/\//, 'http://'));
    const hostname = parsed.hostname.toLowerCase();
    const allowedLocalHosts = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'];

    if (!allowedLocalHosts.includes(hostname)) {
      throw new Error(
        `BLOQUEO DE SEGURIDAD: Para migraciones contra bases de datos remotas ("${hostname}"), ` +
          'es OBLIGATORIO configurar DIRECT_DATABASE_URL de forma explícita (conexión directa puerto 5432 sin pooler transaccional). ' +
          'Se prohíbe el fallback silencioso a DATABASE_URL.'
      );
    }
  } catch (err: any) {
    if (err.message.includes('BLOQUEO DE SEGURIDAD')) {
      throw err;
    }
  }

  return url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: resolveMigrationUrl() },
});
