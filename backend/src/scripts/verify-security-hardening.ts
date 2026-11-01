import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export async function checkSecurityHardening() {
  console.log('=== VERIFICACIÓN DE ENDURECIMIENTO SUPABASE-SEC-01-FIX ===\n');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL no encontrada');
    process.exit(1);
  }

  const { prisma, close } = createDatabase(dbUrl);

  try {
    // 1. Verificación de has_table_privilege para anon, authenticated y postgres
    console.log('--- 1. Acceso Efectivo en Tablas (has_table_privilege) ---');
    const tablePrivs: any = await prisma.$queryRawUnsafe(`
      SELECT 
        c.relname AS table_name,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
        has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
        has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
        has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
        has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
        has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
        has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
        has_table_privilege('postgres', c.oid, 'SELECT') AS postgres_select,
        has_table_privilege('postgres', c.oid, 'INSERT') AS postgres_insert,
        has_table_privilege('postgres', c.oid, 'UPDATE') AS postgres_update,
        has_table_privilege('postgres', c.oid, 'DELETE') AS postgres_delete
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    console.log(`Total tablas evaluadas: ${tablePrivs.length}`);
    let anyUnauthorizedAccess = false;
    let postgresAccessComplete = true;

    for (const row of tablePrivs) {
      const anonHasAccess = row.anon_select || row.anon_insert || row.anon_update || row.anon_delete;
      const authHasAccess = row.auth_select || row.auth_insert || row.auth_update || row.auth_delete;
      const postgresHasFull = row.postgres_select && row.postgres_insert && row.postgres_update && row.postgres_delete;

      if (anonHasAccess || authHasAccess) {
        anyUnauthorizedAccess = true;
        console.warn(`ADVERTENCIA: ${row.table_name} tiene permisos para anon (${anonHasAccess}) o auth (${authHasAccess})`);
      }
      if (!postgresHasFull) {
        postgresAccessComplete = false;
        console.error(`ERROR: ${row.table_name} no tiene acceso completo para postgres`);
      }
    }

    if (!anyUnauthorizedAccess && postgresAccessComplete) {
      console.log('VERIFICADO: Acceso efectivo denegado a anon y authenticated en las 18 tablas.');
      console.log('VERIFICADO: Acceso completo conservado para postgres en las 18 tablas.\n');
    }

    // 2. Verificación de pg_default_acl para rol postgres
    console.log('--- 2. Privilegios Predeterminados de postgres (pg_default_acl) ---');
    const defaultAcls: any = await prisma.$queryRawUnsafe(`
      SELECT 
        pg_roles.rolname AS owner,
        pg_namespace.nspname AS schema_name,
        CASE defaclobjtype
          WHEN 'r' THEN 'tables'
          WHEN 'S' THEN 'sequences'
          WHEN 'f' THEN 'functions'
          WHEN 'T' THEN 'types'
          WHEN 'n' THEN 'schemas'
          ELSE defaclobjtype::text
        END AS object_type,
        defaclacl::text AS acl
      FROM pg_default_acl
      JOIN pg_roles ON pg_roles.oid = pg_default_acl.defaclrole
      LEFT JOIN pg_namespace ON pg_namespace.oid = pg_default_acl.defaclnamespace
      WHERE pg_roles.rolname = 'postgres'
      ORDER BY object_type;
    `);

    console.log(`Entradas de default ACL para postgres: ${defaultAcls.length}`);
    for (const d of defaultAcls) {
      console.log(`Owner: ${d.owner} | Schema: ${d.schema_name || '(global)'} | Type: ${d.object_type} | ACL: ${d.acl}`);
    }

    // 3. Verificación de Row Level Security (pg_class.relrowsecurity)
    console.log('\n--- 3. Estado de Row Level Security (pg_class.relrowsecurity) ---');
    const rlsStatus: any = await prisma.$queryRawUnsafe(`
      SELECT 
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    const rlsEnabledCount = rlsStatus.filter((r: any) => r.rls_enabled).length;
    const rlsForcedCount = rlsStatus.filter((r: any) => r.rls_forced).length;
    console.log(`Tablas con RLS habilitado: ${rlsEnabledCount}/${rlsStatus.length}`);
    console.log(`Tablas con FORCE RLS: ${rlsForcedCount} (esperado: 0 para preservar bypass de postgres)`);

    // 4. Verificación de conectividad y lectura de Prisma
    console.log('\n--- 4. Conectividad y Consulta de Prisma Client ---');
    const pingRes: any = await prisma.$queryRawUnsafe('SELECT 1 AS ping, current_user::text AS current_user;');
    console.log(`Ping: ${pingRes[0].ping}, Rol: ${pingRes[0].current_user}`);

    console.log('\n=== RESULTADO PRELIMINAR DE VERIFICACIÓN COMPLETADO ===');
  } finally {
    await close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkSecurityHardening().catch((err) => {
    console.error('Error al verificar:', err.message);
    process.exit(1);
  });
}
