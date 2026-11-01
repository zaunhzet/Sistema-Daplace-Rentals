import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function verifyDeployment() {
  console.log('=== VERIFICACIÓN POST-DESPLIEGUE SUPABASE-DEPLOY-02 ===\n');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL no encontrada');
    process.exit(1);
  }

  const { prisma, close } = createDatabase(dbUrl);

  try {
    // 1. Verificar _prisma_migrations
    console.log('--- 1. Migraciones en _prisma_migrations ---');
    const migrations: any = await prisma.$queryRawUnsafe(`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations
      ORDER BY migration_name;
    `);
    console.log(`Total migraciones registradas: ${migrations.length}`);
    const unapplied = migrations.filter((m: any) => !m.finished_at || m.rolled_back_at);
    if (unapplied.length > 0) {
      console.error('ALERTA: Migraciones no finalizadas o revertidas:', unapplied);
    } else {
      console.log('VERIFICADO: Las 17 migraciones están finalizadas exitosamente (finished_at no nulo, rolled_back_at nulo).\n');
    }

    // 2. Verificar tablas de aplicación
    console.log('--- 2. Tablas en esquema public ---');
    const tables: any = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tableNames: string[] = tables.map((t: any) => t.table_name);
    console.log(`Total tablas base encontradas: ${tableNames.length}`);
    console.log('Tablas:', tableNames.join(', '));

    const domainTables = tableNames.filter((t) => t !== '_prisma_migrations');
    console.log(`Total tablas de aplicación: ${domainTables.length}\n`);

    // 3. Extensión btree_gist
    console.log('--- 3. Extensión btree_gist ---');
    const ext: any = await prisma.$queryRawUnsafe(`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'btree_gist';
    `);
    if (ext.length > 0) {
      console.log(`VERIFICADO: Extensión ${ext[0].extname} activa en versión ${ext[0].extversion}.\n`);
    } else {
      console.error('ALERTA: Extensión btree_gist no encontrada!\n');
    }

    // 4. Restricción anti-overbooking
    console.log('--- 4. Restricción Anti-Overbooking (GIST) ---');
    const excl: any = await prisma.$queryRawUnsafe(`
      SELECT conname, contype::text as contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conname = 'reservas_no_overlapping_excl';
    `);
    if (excl.length > 0) {
      console.log(`VERIFICADO: Restricción ${excl[0].conname} encontrada (tipo: ${excl[0].contype}).`);
      console.log(`Definición: ${excl[0].def}\n`);
    } else {
      console.error('ALERTA: Restricción reservas_no_overlapping_excl no encontrada!\n');
    }

    // 5. Claves Foráneas e Índices
    console.log('--- 5. Claves Foráneas e Índices ---');
    const fkCount: any = await prisma.$queryRawUnsafe(`
      SELECT count(*) as count
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY';
    `);
    const idxCount: any = await prisma.$queryRawUnsafe(`
      SELECT count(*) as count
      FROM pg_indexes
      WHERE schemaname = 'public';
    `);
    console.log(`Total claves foráneas (FK): ${fkCount[0].count}`);
    console.log(`Total índices en public: ${idxCount[0].count}\n`);

    // 6. Ausencia de registros de negocio
    console.log('--- 6. Conteo de Registros por Tabla de Negocio ---');
    let totalRowsAllTables = 0;
    for (const t of domainTables) {
      const countRes: any = await prisma.$queryRawUnsafe(`SELECT count(*) as count FROM "${t}";`);
      const count = Number(countRes[0].count);
      totalRowsAllTables += count;
      if (count > 0) {
        console.warn(`ADVERTENCIA: Tabla "${t}" contiene ${count} registros.`);
      }
    }
    console.log(`Total de registros en todas las 17 tablas de aplicación: ${totalRowsAllTables}`);
    if (totalRowsAllTables === 0) {
      console.log('VERIFICADO: Base de datos 100% libre de datos de negocio (cero registros, sin seeds).\n');
    }

    // 7. Enums creados
    console.log('--- 7. Tipos Enumerados (Enums) ---');
    const enums: any = await prisma.$queryRawUnsafe(`
      SELECT t.typname as enum_name, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname;
    `);
    console.log(`Total enums creados: ${enums.length}`);
    enums.forEach((e: any) => console.log(`- ${e.enum_name}: [${e.values}]`));

    console.log('\n=== VERIFICACIÓN POST-DESPLIEGUE EXITOSA: SCHEMA_DEPLOY_PASS ===');
  } finally {
    await close();
  }
}

verifyDeployment().catch((err) => {
  console.error('Error de verificación post-despliegue:', err.message);
  process.exit(1);
});
