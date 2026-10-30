import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app/app.js';
import { createDatabase } from './shared/database.js';
import { PrismaAuthRepository } from './modules/auth/auth.repository.js';

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

const database = createDatabase(databaseUrl);
const authRepository = new PrismaAuthRepository(database.prisma);

const app = buildApp({
  checkDatabase: database.check,
  authRepository,
  jwtSecret: process.env.JWT_SECRET,
  allowedOrigins: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : ['http://127.0.0.1:5173', 'http://localhost:5173'],
  secureCookies: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
});

app.addHook('onClose', async () => database.close());

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
