import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';

export interface DatabaseOptions {
  ssl?: boolean | pg.PoolConfig['ssl'];
  maxConnections?: number;
  connectionTimeoutMillis?: number;
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

  if (isCloudOrSsl && poolConfig.ssl === undefined) {
    poolConfig.ssl = options?.ssl ?? { rejectUnauthorized: false };
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
