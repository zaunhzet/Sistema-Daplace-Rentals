import fs from 'node:fs';
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
  const isCloudOrSsl =
    url.includes('sslmode=require') ||
    url.includes('supabase.co') ||
    url.includes('supabase.com') ||
    process.env.DATABASE_SSL === 'true';

  const poolConfig: pg.PoolConfig = {
    connectionString: url,
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

    // Resolver CA si se proporciona por variable de entorno o parámetro
    let caContent: string | undefined;
    const caSource = options?.ca || process.env.DATABASE_SSL_CA;
    if (caSource && caSource.trim() !== '') {
      const trimmed = caSource.trim();
      if (trimmed.includes('BEGIN CERTIFICATE')) {
        caContent = trimmed;
      } else {
        try {
          caContent = fs.readFileSync(trimmed, 'utf8');
        } catch (err: any) {
          throw new Error(`Error al leer archivo de certificado CA ("${trimmed}"): ${err.message}`);
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
