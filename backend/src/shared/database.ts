import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';

export interface DatabaseOptions {
  ssl?: pg.PoolConfig['ssl'];
  maxConnections?: number;
  connectionTimeoutMillis?: number;
  ca?: string;
}

export function createDatabase(url: string, options?: DatabaseOptions) {
  let isLocalHost = false;
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:\/\//, 'http://'));
    const h = parsed.hostname.toLowerCase();
    isLocalHost = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(h);
  } catch {
    isLocalHost = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
  }

  const isCloudOrSsl =
    url.includes('sslmode=require') ||
    url.includes('supabase.co') ||
    url.includes('supabase.com') ||
    (!isLocalHost && process.env.DATABASE_SSL === 'true');

  // Limpiar parámetros de SSL de la cadena de conexión para evitar que pg-connection-string
  // sobrescriba 'poolConfig.ssl' con un objeto vacío o incompatible en Object.assign.
  let cleanedUrl = url;
  try {
    const isPostgres = url.startsWith('postgresql://') || url.startsWith('postgres://');
    if (isPostgres) {
      const prefix = url.startsWith('postgresql://') ? 'postgresql://' : 'postgres://';
      const parsedUrl = new URL(url.replace(/^postgres(ql)?:\/\//, 'http://'));
      if (parsedUrl.searchParams.has('sslmode') || parsedUrl.searchParams.has('ssl')) {
        parsedUrl.searchParams.delete('sslmode');
        parsedUrl.searchParams.delete('ssl');
        cleanedUrl = prefix + parsedUrl.toString().substring('http://'.length);
      }
    }
  } catch {
    // Si no se puede parsear como URL, mantener url intacta
  }

  const poolConfig: pg.PoolConfig = {
    connectionString: cleanedUrl,
    max: options?.maxConnections ?? Number(process.env.DATABASE_POOL_MAX || 10),
    connectionTimeoutMillis: options?.connectionTimeoutMillis ?? Number(process.env.DATABASE_TIMEOUT_MS || 10000),
  };

  if (isCloudOrSsl) {
    // Si se pasa una configuración explícita en options.ssl, verificar que NO desactive la validación TLS
    if (typeof options?.ssl === 'object' && options.ssl !== null && options.ssl.rejectUnauthorized === false) {
      throw new Error(
        'CONFIGURACIÓN INSEGURA BLOQUEADA: No se permite desactivar la validación TLS (rejectUnauthorized: false) en conexiones remotas.'
      );
    }

    // Resolver CA si se proporciona por variable de entorno o parámetro, o desde certs
    let caContent: string | undefined;
    const caSource = options?.ca || process.env.DATABASE_SSL_CA;
    if (caSource && caSource.trim() !== '') {
      const trimmed = caSource.trim();
      if (trimmed.includes('BEGIN CERTIFICATE')) {
        caContent = trimmed;
      } else {
        const candidatePaths = [
          trimmed,
          path.resolve(process.cwd(), trimmed),
          fileURLToPath(new URL(`../../certs/${path.basename(trimmed)}`, import.meta.url)),
          fileURLToPath(new URL(`../../../${trimmed}`, import.meta.url)),
        ];
        let foundPath: string | null = null;
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            foundPath = p;
            break;
          }
        }
        if (!foundPath) {
          throw new Error(`Error al leer archivo de certificado CA ("${trimmed}"): no se encontró en las rutas buscadas.`);
        }
        caContent = fs.readFileSync(foundPath, 'utf8');
      }
    } else {
      // Fallback automático al certificado oficial si existe en backend/certs/
      const defaultCertCandidates = [
        fileURLToPath(new URL('../../certs/supabase-ca.crt', import.meta.url)),
        fileURLToPath(new URL('../certs/supabase-ca.crt', import.meta.url)),
        path.resolve(process.cwd(), 'certs/supabase-ca.crt'),
        path.resolve(process.cwd(), 'backend/certs/supabase-ca.crt'),
      ];
      for (const p of defaultCertCandidates) {
        if (fs.existsSync(p)) {
          caContent = fs.readFileSync(p, 'utf8');
          break;
        }
      }
    }

    // TLS con verificación estricta de certificado (rejectUnauthorized: true)
    if (typeof options?.ssl === 'object' && options.ssl !== null) {
      poolConfig.ssl = {
        ...options.ssl,
        rejectUnauthorized: true,
        ...(caContent ? { ca: caContent } : {}),
      };
    } else {
      poolConfig.ssl = {
        rejectUnauthorized: true,
        ...(caContent ? { ca: caContent } : {}),
      };
    }
  }

  const pool = new pg.Pool(poolConfig);
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    pool,
    async check() {
      await prisma.$queryRaw`SELECT 1`;
    },
    async close() {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
