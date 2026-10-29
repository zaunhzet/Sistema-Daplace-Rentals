import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app/app.js';
import { createDatabase } from './shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const host = process.env.API_HOST ?? '127.0.0.1';
const port = Number(process.env.API_PORT ?? '3000');
const databaseUrl = process.env.DATABASE_URL;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535.');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure the local database.');
}

const ALLOWED_LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];
if (process.env.ENABLE_DEMO_AUTH_BYPASS === 'true') {
  if (!ALLOWED_LOOPBACK_HOSTS.includes(host.toLowerCase())) {
    throw new Error(
      `CONFIGURACIÓN INSEGURA CRÍTICA: ENABLE_DEMO_AUTH_BYPASS solo está permitido cuando el servidor escucha exclusivamente en loopback (${ALLOWED_LOOPBACK_HOSTS.join(', ')}). Se configuró host "${host}".`
    );
  }
}

const database = createDatabase(databaseUrl);
const app = buildApp({ prisma: database.prisma, checkDatabase: database.check });

app.addHook('onClose', async () => database.close());

try {
  await app.listen({ host, port });
  if (process.env.ENABLE_DEMO_AUTH_BYPASS === 'true') {
    app.log.warn('[SECURITY NOTICE] ENABLE_DEMO_AUTH_BYPASS está activado en desarrollo local. El acceso administrativo no requiere token JWT.');
  }
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
