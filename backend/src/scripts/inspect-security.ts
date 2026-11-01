import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function inspectSecurity() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL no encontrada');
    process.exit(1);
  }

  const { prisma, close } = createDatabase(dbUrl);

  try {
    console.log('=== INSPECCIÓN DE SEGURIDAD SUPABASE-SEC-01 ===\n');

    // 1. Privilegios sobre tablas existentes
    console.log('--- 1. Permisos en information_schema.table_privileges (anon y authenticated) ---');
    const tablePrivs: any = await prisma.$queryRawUnsafe(`
      SELECT grantee, table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
      FROM information_schema.table_privileges
      WHERE table_schema = 'public' 
        AND grantee IN ('anon', 'authenticated', 'public')
      GROUP BY grantee, table_name
      ORDER BY table_name, grantee;
    `);
    console.log(`Total registros de privilegios encontrados para anon/authenticated: ${tablePrivs.length}`);
    tablePrivs.slice(0, 10).forEach((p: any) => console.log(`- Tabla "${p.table_name}" -> Rol "${p.grantee}": [${p.privileges}]`));
    if (tablePrivs.length > 10) console.log(`... y ${tablePrivs.length - 10} filas más.`);

    // 2. Privilegios por defecto (pg_default_acl)
    console.log('\n--- 2. Privilegios Predeterminados (pg_default_acl) ---');
    const defaultAcls: any = await prisma.$queryRawUnsafe(`
      SELECT 
        pg_roles.rolname as owner,
        pg_namespace.nspname as schema_name,
        CASE defaclobjtype
          WHEN 'r' THEN 'tables'
          WHEN 'S' THEN 'sequences'
          WHEN 'f' THEN 'functions'
          WHEN 'T' THEN 'types'
          WHEN 'n' THEN 'schemas'
          ELSE defaclobjtype::text
        END as object_type,
        defaclacl::text as acl
      FROM pg_default_acl
      JOIN pg_roles ON pg_roles.oid = pg_default_acl.defaclrole
      LEFT JOIN pg_namespace ON pg_namespace.oid = pg_default_acl.defaclnamespace
      WHERE pg_roles.rolname IN ('postgres', 'supabase_admin')
      ORDER BY owner, object_type;
    `);
    defaultAcls.forEach((d: any) => {
      console.log(`Owner: ${d.owner} | Schema: ${d.schema_name || '(global)'} | Type: ${d.object_type} | ACL: ${d.acl}`);
    });

    // 3. Estado de RLS en todas las tablas
    console.log('\n--- 3. Estado de Row Level Security (RLS) en tablas de public ---');
    const rlsStatus: any = await prisma.$queryRawUnsafe(`
      SELECT 
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);
    console.log(`Total tablas evaluadas: ${rlsStatus.length}`);
    const rlsDisabled = rlsStatus.filter((r: any) => !r.rls_enabled);
    console.log(`Tablas con RLS desactivado: ${rlsDisabled.length}/${rlsStatus.length}`);
    rlsStatus.forEach((r: any) => console.log(`- ${r.table_name}: RLS=${r.rls_enabled ? 'ON' : 'OFF'}`));

    // 4. Ubicación de btree_gist y dependencias
    console.log('\n--- 4. Extensión btree_gist y Dependencias ---');
    const extInfo: any = await prisma.$queryRawUnsafe(`
      SELECT e.extname, e.extversion, n.nspname as schema_name
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname = 'btree_gist';
    `);
    console.log('Extensión:', extInfo[0]);

    const dependInfo: any = await prisma.$queryRawUnsafe(`
      SELECT 
        c.conname as constraint_name,
        t.relname as table_name,
        n.nspname as schema_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.conname = 'reservas_no_overlapping_excl';
    `);
    console.log('Dependencia anti-overbooking:', dependInfo[0]);

    // 5. Permisos de schema public
    console.log('\n--- 5. Permisos sobre el esquema public ---');
    const schemaPrivs: any = await prisma.$queryRawUnsafe(`
      SELECT 
        rolname,
        has_schema_privilege(rolname, 'public', 'USAGE') as usage_priv,
        has_schema_privilege(rolname, 'public', 'CREATE') as create_priv
      FROM pg_roles
      WHERE rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
      ORDER BY rolname;
    `);
    schemaPrivs.forEach((s: any) => console.log(`Rol ${s.rolname}: USAGE=${s.usage_priv}, CREATE=${s.create_priv}`));

  } finally {
    await close();
  }
}

inspectSecurity().catch((e) => {
  console.error('Error inspección:', e.message);
  process.exit(1);
});
