import dotenv from 'dotenv';
import { defineConfig, env } from 'prisma/config';

dotenv.config({ path: '../.env' });

const migrationUrl = process.env.DIRECT_DATABASE_URL || env('DATABASE_URL');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: migrationUrl },
});
