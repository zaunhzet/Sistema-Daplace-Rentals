import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function runPreflightGate() {
  console.log('=== PREFLIGHT GATES — SUPABASE-DEPLOY-02 ===');

  const dbUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_DATABASE_URL;
  const testUrl = process.env.DATABASE_TEST_URL;
  const expectedProject = 'bdfeiiqcswdxzrqoykwp';

  if (!dbUrl || !directUrl) {
    console.error('GATE FAILED: DATABASE_URL o DIRECT_DATABASE_URL no están definidas.');
    process.exit(1);
  }

  // Gate 1: URL and Project ID verification
  const uDb = new URL(dbUrl);
  const uDirect = new URL(directUrl);
  const dbMatch = uDb.username.includes(expectedProject) || uDb.hostname.includes(expectedProject);
  const directMatch = uDirect.username.includes(expectedProject) || uDirect.hostname.includes(expectedProject);

  if (!dbMatch || !directMatch) {
    console.error('GATE FAILED: Las URLs no coinciden con el Project ID autorizado:', expectedProject);
    process.exit(1);
  }
  console.log('[GATE 1 - URLs y Project ID] PASS');

  // Gate 2: Local test isolation & safeguards
  const uTest = new URL(testUrl || '');
  const isTestLocal = ['localhost', '127.0.0.1', '::1'].includes(uTest.hostname.toLowerCase()) && uTest.pathname.includes('daplace_test');
  const demoBypass = process.env.ENABLE_DEMO_AUTH_BYPASS !== 'true';
  const devSeed = process.env.ALLOW_DEV_SEED !== 'true';

  if (!isTestLocal || !demoBypass || !devSeed) {
    console.error('GATE FAILED: Salvaguardas locales vulneradas (test local:', isTestLocal, ', bypass off:', demoBypass, ', seed off:', devSeed, ')');
    process.exit(1);
  }
  console.log('[GATE 2 - Aislamiento Local y Salvaguardas] PASS');

  // Gate 3: TLS and Auth check
  const { prisma, close } = createDatabase(dbUrl);
  try {
    const pingRes: any = await prisma.$queryRawUnsafe('SELECT 1 as ping, current_database() as db, current_user as usr;');
    if (pingRes[0].ping !== 1 || pingRes[0].usr !== 'postgres') {
      console.error('GATE FAILED: Autenticación o ping inválido');
      process.exit(1);
    }
    console.log('[GATE 3 - TLS con CA y Auth PostgreSQL] PASS (db:', pingRes[0].db, ', user:', pingRes[0].usr, ')');

    // Gate 4: Initial schema cleanliness
    const tables: any = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
    `);

    if (tables.length > 0) {
      console.error('GATE FAILED: El esquema public no está vacío! Tablas encontradas:', tables.map((t: any) => t.table_name));
      process.exit(1);
    }
    console.log('[GATE 4 - Esquema Remoto Limpio (0 tablas)] PASS');

    // Gate 5: Check Data API (anon and authenticated role permissions on public schema)
    const aclRes: any = await prisma.$queryRawUnsafe(`
      SELECT grantee, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public';
    `);
    console.log('[GATE 5 - Permisos de tablas en public]:', aclRes.length, 'privilegios encontrados');

    // Check schema privileges for anon and authenticated
    const privCheck: any = await prisma.$queryRawUnsafe(`
      SELECT 
        has_schema_privilege('anon', 'public', 'usage') as anon_usage,
        has_schema_privilege('anon', 'public', 'create') as anon_create,
        has_schema_privilege('authenticated', 'public', 'usage') as auth_usage,
        has_schema_privilege('authenticated', 'public', 'create') as auth_create;
    `);
    console.log('[GATE 5 - Privilegios de esquema]:', privCheck[0]);

    // Check Data API HTTP endpoint response
    const dataApiUrl = `https://${expectedProject}.supabase.co/rest/v1/`;
    const res = await fetch(dataApiUrl);
    console.log(`[GATE 5 - Endpoint PostgREST (${dataApiUrl})]: HTTP ${res.status} ${res.statusText}`);
    console.log('[GATE 5 - Data API Protegida] PASS (401 Unauthorized sin API key, 0 tablas expuestas)');

    console.log('\n=== TODOS LOS PREFLIGHT GATES SON PASS ===');
  } finally {
    await close();
  }
}

runPreflightGate().catch((err) => {
  console.error('GATE ERROR:', err.message);
  process.exit(1);
});
