import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });



async function runSecurityHardening() {
  console.log('================================================================');
  console.log('   DAPLACE RENTALS — EJECUCIÓN SUPABASE-SEC-02 (SUPABASE-SEC-01-FIX)');
  console.log('================================================================\n');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('FATAL: DATABASE_URL no encontrada en entorno.');
    process.exit(1);
  }

  // Validar Project ID sin imprimir la URL completa
  const expectedProjectId = 'bdfeiiqcswdxzrqoykwp';
  if (!dbUrl.includes(expectedProjectId)) {
    console.error(`FATAL: DATABASE_URL no corresponde al proyecto esperado "${expectedProjectId}".`);
    process.exit(1);
  }

  console.log(`[PREFLIGHT] Project ID verificado: ${expectedProjectId}`);
  const { prisma, pool, close } = createDatabase(dbUrl);

  try {
    // --------------------------------------------------------------------------
    // FASE 1: PREFLIGHT CHECK
    // --------------------------------------------------------------------------
    console.log('\n--- FASE 1: Verificación de Precondiciones ---');
    const userRes: any = await prisma.$queryRawUnsafe('SELECT current_user::text AS current_user, current_database()::text AS current_db;');
    const currentUser = userRes[0].current_user;
    const currentDb = userRes[0].current_db;
    console.log(`- Usuario activo: ${currentUser}`);
    console.log(`- Base de datos activa: ${currentDb}`);

    if (currentUser !== 'postgres') {
      throw new Error(`Usuario inesperado: se esperaba "postgres", se obtuvo "${currentUser}".`);
    }

    const tablesRes: any = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tableNames: string[] = tablesRes.map((t: any) => t.table_name);
    console.log(`- Tablas existentes en public: ${tableNames.length}/18`);
    if (tableNames.length !== 18) {
      throw new Error(`Se esperaban 18 tablas en public, se encontraron ${tableNames.length}.`);
    }

    const migRes: any = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count 
      FROM _prisma_migrations 
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
    `);
    const appliedMigrations = Number(migRes[0].count);
    console.log(`- Migraciones finalizadas en _prisma_migrations: ${appliedMigrations}/17`);
    if (appliedMigrations !== 17) {
      throw new Error(`Se esperaban 17 migraciones finalizadas, se encontraron ${appliedMigrations}.`);
    }

    console.log('PREFLIGHT: OK. Todas las condiciones previas validadas.\n');

    // --------------------------------------------------------------------------
    // FASE 2: EJECUCIÓN ATÓMICA DE SUPABASE-SEC-01-FIX
    // --------------------------------------------------------------------------
    console.log('--- FASE 2: Aplicando Endurecimiento Transaccional ---');
    const client = await pool.connect();

    try {
      await client.query('BEGIN;');

      // 1. Revocar permisos sobre las 18 tablas a anon y authenticated
      console.log('1. Ejecutando: REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;');
      await client.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;');

      // 2. Revocar permisos sobre secuencias a anon y authenticated
      console.log('2. Ejecutando: REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;');
      await client.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;');

      // 3. Modificar privilegios predeterminados de postgres en public
      console.log('3. Ejecutando: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;');
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;');
      console.log('   Ejecutando: ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;');
      await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;');

      // 4. Activar RLS en las 18 tablas
      console.log('4. Activando Row Level Security (RLS) en las 18 tablas...');
      const rlsStatements = [
        'ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.avisos_reserva ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.contratos_reserva ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.evidencias_pago ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.garantias ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.huespedes ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.movimientos_garantia ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.notificaciones_internas ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.ordenes_trabajo ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.sustentos_gasto ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;',
      ];

      for (const stmt of rlsStatements) {
        await client.query(stmt);
      }

      await client.query('COMMIT;');
      console.log('COMMIT: Transacción confirmada exitosamente en Supabase PostgreSQL.\n');
    } catch (txError: any) {
      console.error('ERROR EN TRANSACCIÓN. Ejecutando ROLLBACK...', txError.message);
      try {
        await client.query('ROLLBACK;');
        console.log('ROLLBACK ejecutado con éxito.');
      } catch (rbError: any) {
        console.error('Error durante rollback:', rbError.message);
      }
      throw txError;
    } finally {
      client.release();
    }

    // --------------------------------------------------------------------------
    // FASE 3: VERIFICACIONES OBLIGATORIAS
    // --------------------------------------------------------------------------
    console.log('--- FASE 3: Verificación de Estado Post-Endurecimiento ---');

    // 1. RLS en las 18 tablas
    const rlsCheck: any = await prisma.$queryRawUnsafe(`
      SELECT 
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    const rlsEnabledCount = rlsCheck.filter((r: any) => r.rls_enabled).length;
    const rlsForcedCount = rlsCheck.filter((r: any) => r.rls_forced).length;
    console.log(`- Tablas con RLS activado: ${rlsEnabledCount}/${rlsCheck.length}`);
    console.log(`- Tablas con FORCE RLS: ${rlsForcedCount} (esperado 0 para conservar bypass nativo de postgres)`);

    if (rlsEnabledCount !== 18 || rlsForcedCount !== 0) {
      throw new Error(`Inconsistencia en RLS: habilitadas=${rlsEnabledCount}/18, forzadas=${rlsForcedCount}/0.`);
    }

    // 2. has_table_privilege en las 18 tablas
    const privCheck: any = await prisma.$queryRawUnsafe(`
      SELECT 
        c.relname AS table_name,
        has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
        has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
        has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
        has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
        has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
        has_table_privilege('anon', c.oid, 'REFERENCES') AS anon_references,
        has_table_privilege('anon', c.oid, 'TRIGGER') AS anon_trigger,
        has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
        has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
        has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
        has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
        has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS auth_truncate,
        has_table_privilege('authenticated', c.oid, 'REFERENCES') AS auth_references,
        has_table_privilege('authenticated', c.oid, 'TRIGGER') AS auth_trigger,
        has_table_privilege('postgres', c.oid, 'SELECT') AS postgres_select,
        has_table_privilege('postgres', c.oid, 'INSERT') AS postgres_insert,
        has_table_privilege('postgres', c.oid, 'UPDATE') AS postgres_update,
        has_table_privilege('postgres', c.oid, 'DELETE') AS postgres_delete,
        has_table_privilege('postgres', c.oid, 'TRUNCATE') AS postgres_truncate,
        has_table_privilege('postgres', c.oid, 'REFERENCES') AS postgres_references,
        has_table_privilege('postgres', c.oid, 'TRIGGER') AS postgres_trigger
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);

    let anyAnonPriv = false;
    let anyAuthPriv = false;
    let postgresAllPriv = true;

    for (const r of privCheck) {
      if (r.anon_select || r.anon_insert || r.anon_update || r.anon_delete || r.anon_truncate || r.anon_references || r.anon_trigger) {
        anyAnonPriv = true;
        console.error(`ERROR: anon tiene privilegios en ${r.table_name}`);
      }
      if (r.auth_select || r.auth_insert || r.auth_update || r.auth_delete || r.auth_truncate || r.auth_references || r.auth_trigger) {
        anyAuthPriv = true;
        console.error(`ERROR: authenticated tiene privilegios en ${r.table_name}`);
      }
      if (!r.postgres_select || !r.postgres_insert || !r.postgres_update || !r.postgres_delete || !r.postgres_truncate || !r.postgres_references || !r.postgres_trigger) {
        postgresAllPriv = false;
        console.error(`ERROR: postgres perdió privilegios en ${r.table_name}`);
      }
    }

    console.log(`- Permisos efectivos anon en tablas: ${anyAnonPriv ? 'FALLO (CONCEDIDOS)' : 'DENEGADOS 100%'}`);
    console.log(`- Permisos efectivos authenticated en tablas: ${anyAuthPriv ? 'FALLO (CONCEDIDOS)' : 'DENEGADOS 100%'}`);
    console.log(`- Permisos completos de postgres conservados: ${postgresAllPriv ? 'CONFIRMADO 100%' : 'FALLO'}`);

    if (anyAnonPriv || anyAuthPriv || !postgresAllPriv) {
      throw new Error('Fallo en la validación de privilegios de tablas.');
    }

    // 3. pg_default_acl para rol postgres
    const defaultAcls: any = await prisma.$queryRawUnsafe(`
      SELECT 
        pg_roles.rolname AS owner,
        pg_namespace.nspname AS schema_name,
        CASE defaclobjtype
          WHEN 'r' THEN 'tables'
          WHEN 'S' THEN 'sequences'
          ELSE defaclobjtype::text
        END AS object_type,
        defaclacl::text AS acl
      FROM pg_default_acl
      JOIN pg_roles ON pg_roles.oid = pg_default_acl.defaclrole
      LEFT JOIN pg_namespace ON pg_namespace.oid = pg_default_acl.defaclnamespace
      WHERE pg_roles.rolname = 'postgres'
      ORDER BY object_type;
    `);
    console.log(`- Entradas de pg_default_acl para postgres: ${defaultAcls.length}`);
    for (const d of defaultAcls) {
      console.log(`  * Tipo: ${d.object_type} | Schema: ${d.schema_name || '(global)'} | ACL: ${d.acl}`);
      if (d.schema_name === 'public' && (d.object_type === 'tables' || d.object_type === 'sequences') && d.acl && (d.acl.includes('anon=') || d.acl.includes('authenticated='))) {
        throw new Error(`Default ACL de postgres aún otorga permisos a anon/auth en public.${d.object_type}: ${d.acl}`);
      }
    }
    console.log('  * Default ACLs de postgres sobre tablas y secuencias en public limpias de anon y authenticated.');

    // 4. Pruebas Negativas con SET ROLE anon y SET ROLE authenticated
    console.log('\n--- FASE 4: Pruebas Negativas de Ejecución Directa (SET ROLE) ---');
    const negClient = await pool.connect();
    const negativeTestCases = [
      {
        name: 'anon - SELECT public.users',
        role: 'anon',
        sql: 'SELECT * FROM public.users LIMIT 1;',
      },
      {
        name: 'anon - SELECT public.reservas',
        role: 'anon',
        sql: 'SELECT * FROM public.reservas LIMIT 1;',
      },
      {
        name: 'authenticated - SELECT public.users',
        role: 'authenticated',
        sql: 'SELECT * FROM public.users LIMIT 1;',
      },
      {
        name: 'authenticated - INSERT public.auditoria_eventos',
        role: 'authenticated',
        sql: `INSERT INTO public.auditoria_eventos (id, entidad, "entidadId", accion) 
              VALUES ('test-hack', 'users', '1', 'HACK');`,
      },
      {
        name: 'authenticated - UPDATE public.users',
        role: 'authenticated',
        sql: `UPDATE public.users SET email = 'hacked@malicious.com';`,
      },
      {
        name: 'authenticated - DELETE public.users',
        role: 'authenticated',
        sql: `DELETE FROM public.users;`,
      },
    ];

    const negativeResults: { test: string; passed: boolean; errorCode?: string; errorMsg?: string }[] = [];

    for (const tc of negativeTestCases) {
      let passed = false;
      let errorCode: string | undefined;
      let errorMsg: string | undefined;

      try {
        // Ejecutar en bloque transaccional aislado por test case para que el error 42501 no ensucie el cliente
        await negClient.query('BEGIN;');
        await negClient.query(`SET LOCAL ROLE ${tc.role};`);
        await negClient.query(tc.sql);
        await negClient.query('COMMIT;');
        passed = false;
        errorMsg = 'LA CONSULTA TUVO ÉXITO CUANDO DEBIÓ SER RECHAZADA.';
      } catch (err: any) {
        await negClient.query('ROLLBACK;');
        errorCode = err.code;
        errorMsg = err.message;
        if (err.code === '42501') {
          passed = true;
        } else {
          console.warn(`Código inesperado: ${err.code} - ${err.message}`);
        }
      }

      negativeResults.push({ test: tc.name, passed, errorCode, errorMsg });
      console.log(`- [${passed ? 'PASS - DENEGADO' : 'FAIL - PERMITIDO'}] ${tc.name} -> Código: ${errorCode || 'N/A'}`);
    }

    negClient.release();

    const allNegPassed = negativeResults.every((r) => r.passed);
    if (!allNegPassed) {
      throw new Error('Al menos una prueba negativa falló: acceso no autorizado concedido.');
    }
    console.log('TODAS LAS PRUEBAS NEGATIVAS RECHAZADAS CON 42501 (Permission Denied).');

    // 5. Validación de Prisma Client como postgres
    console.log('\n--- FASE 5: Validación Operativa de Prisma Client ---');
    const ping: any = await prisma.$queryRawUnsafe('SELECT 1 AS ping, current_user::text AS usr;');
    console.log(`- Prisma ping: ${ping[0].ping}, Usuario: ${ping[0].usr}`);

    const countUsers: any = await prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM public.users;');
    console.log(`- Conteo en public.users como postgres: ${countUsers[0].count} filas (acceso verificado)`);

    const countReservas: any = await prisma.$queryRawUnsafe('SELECT count(*)::int AS count FROM public.reservas;');
    console.log(`- Conteo en public.reservas como postgres: ${countReservas[0].count} filas (acceso verificado)`);

    console.log('\n================================================================');
    console.log('   DICTAMEN FINAL: SECURITY_HARDENING_PASS');
    console.log('================================================================');
  } finally {
    await close();
  }
}

runSecurityHardening().catch((err) => {
  console.error('\nFATAL: Fallo en ejecución de seguridad:', err.message);
  process.exit(1);
});
