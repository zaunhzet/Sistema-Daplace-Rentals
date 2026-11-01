import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';
import { AuthService } from '../modules/auth/auth.service.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

// ==============================================================================
// DAPLACE RENTALS — ROTACIÓN FOCAL DE CREDENCIALES DEMO (HANDOFF-DIEGO-03)
//
// Actualiza ÚNICAMENTE passwordHash de las 4 cuentas sintéticas conocidas.
// No modifica: User.id, Usuario.id, usuarioId, roles, propiedades ni otras tablas.
// Revoca sesiones activas de las cuentas rotadas.
//
// Uso:
//   CONFIRM_DEMO_ROTATION=true \
//   DEMO_ADMIN_PASSWORD="..." \
//   DEMO_OPERATOR_PASSWORD="..." \
//   DEMO_PROPIETARIO_PASSWORD="..." \
//   DEMO_CLIENTE_PASSWORD="..." \
//   npx tsx src/scripts/rotate-demo-passwords.ts
// ==============================================================================

const DEMO_ACCOUNTS = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin.demo@daplace.invalid',
    rol: 'ADMINISTRADOR',
    envVar: 'DEMO_ADMIN_PASSWORD',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'operador.demo@daplace.invalid',
    rol: 'OPERADOR',
    envVar: 'DEMO_OPERATOR_PASSWORD',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'propietario.demo@daplace.invalid',
    rol: 'PROPIETARIO',
    envVar: 'DEMO_PROPIETARIO_PASSWORD',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'cliente.demo@daplace.invalid',
    rol: 'CLIENTE',
    envVar: 'DEMO_CLIENTE_PASSWORD',
  },
] as const;

const EXPECTED_PROJECT_ID = 'bdfeiiqcswdxzrqoykwp';

export async function rotateDemoPasswords() {
  console.log('================================================================');
  console.log('   DAPLACE RENTALS — ROTACIÓN FOCAL DE CREDENCIALES DEMO');
  console.log('   (HANDOFF-DIEGO-03)');
  console.log('================================================================\n');

  // ── Gate 1: Confirmación explícita ──────────────────────────────────────────
  if (process.env.CONFIRM_DEMO_ROTATION !== 'true') {
    console.error(
      'BLOQUEO: Defina CONFIRM_DEMO_ROTATION="true" para autorizar la rotación.'
    );
    process.exit(1);
  }

  // ── Gate 2: DATABASE_URL y Project ID ──────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('FATAL: DATABASE_URL no encontrada.');
    process.exit(1);
  }
  if (!dbUrl.includes(EXPECTED_PROJECT_ID) || !dbUrl.includes('supabase.com')) {
    console.error(
      `BLOQUEO: DATABASE_URL no corresponde al proyecto autorizado "${EXPECTED_PROJECT_ID}".`
    );
    process.exit(1);
  }

  // ── Gate 3: Las 4 contraseñas deben estar en variables de entorno ────────────
  const passwords: Record<string, string> = {};
  for (const account of DEMO_ACCOUNTS) {
    const pwd = process.env[account.envVar];
    if (!pwd || pwd.trim().length < 16) {
      console.error(
        `BLOQUEO: ${account.envVar} no definida o demasiado corta (mínimo 16 caracteres).`
      );
      process.exit(1);
    }
    passwords[account.id] = pwd.trim();
  }

  const { prisma, close } = createDatabase(dbUrl);

  try {
    // ── Preflight: verificar conexión como postgres ───────────────────────────
    const sessionRes: any = await prisma.$queryRawUnsafe(
      'SELECT current_user::text AS u, current_database()::text AS db;'
    );
    const currentUser = sessionRes[0].u;
    if (currentUser !== 'postgres') {
      throw new Error(`Se requiere sesión postgres. Usuario actual: '${currentUser}'.`);
    }
    console.log(`[PREFLIGHT] Sesión: postgres @ ${sessionRes[0].db}`);

    // ── Preflight: 17 migraciones completas ──────────────────────────────────
    const migRes: any = await prisma.$queryRawUnsafe(
      'SELECT count(*)::int AS c FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
    );
    if (Number(migRes[0].c) !== 17) {
      throw new Error(`Se esperaban 17 migraciones, encontradas: ${migRes[0].c}.`);
    }
    console.log('[PREFLIGHT] Migraciones: 17/17 completas.');

    // ── Preflight: 18 tablas con RLS ─────────────────────────────────────────
    const rlsRes: any = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS c FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true;`
    );
    if (Number(rlsRes[0].c) !== 18) {
      throw new Error(`Se esperaban 18 tablas con RLS, encontradas: ${rlsRes[0].c}.`);
    }
    console.log('[PREFLIGHT] RLS: 18/18 tablas habilitadas.');

    // ── Preflight: verificar existencia y estado de las 4 cuentas ────────────
    console.log('\n[PREFLIGHT] Verificando identidades de las 4 cuentas demo...');
    for (const account of DEMO_ACCOUNTS) {
      const user: any = await prisma.$queryRawUnsafe(
        `SELECT id::text, email, rol::text, "isActive"
         FROM users WHERE id::text = $1;`,
        account.id
      );
      if (user.length !== 1) {
        throw new Error(`Cuenta no encontrada: ${account.email} (${account.id})`);
      }
      const u = user[0];
      if (u.email !== account.email) {
        throw new Error(`Email inesperado para ${account.id}: '${u.email}' (esperado: '${account.email}')`);
      }
      if (u.rol !== account.rol) {
        throw new Error(`Rol inesperado para ${account.email}: '${u.rol}' (esperado: '${account.rol}')`);
      }
      if (!u.isActive) {
        throw new Error(`Cuenta inactiva: ${account.email}`);
      }
      console.log(`  ✓ ${account.rol}: ${account.email} — activa`);
    }

    // ── Preflight: rechazar identidades ajenas ───────────────────────────────
    const allUsers: any = await prisma.$queryRawUnsafe(
      'SELECT id::text, email FROM users;'
    );
    const knownIds = new Set(DEMO_ACCOUNTS.map((a) => a.id));
    const foreignUsers = allUsers.filter((u: any) => !knownIds.has(u.id));
    if (foreignUsers.length > 0) {
      throw new Error(
        `Identidades no pertenecientes al seed sintético detectadas: ${foreignUsers.map((u: any) => u.email).join(', ')}. Rotación abortada.`
      );
    }
    console.log('[PREFLIGHT] Sin identidades ajenas. OK.\n');

    // ── Generar hashes Argon2id ───────────────────────────────────────────────
    console.log('[1/3] Derivando hashes Argon2id (esto puede tomar ~4-8 segundos)...');
    const hashes: Record<string, string> = {};
    for (const account of DEMO_ACCOUNTS) {
      hashes[account.id] = await AuthService.hashPassword(passwords[account.id]);
    }
    console.log('  Hashes derivados para las 4 cuentas.');

    // ── Rotación + revocación de sesiones en transacción atómica ─────────────
    console.log('[2/3] Ejecutando rotación y revocación de sesiones en transacción atómica...');
    let updatedCount = 0;
    let revokedSessions = 0;

    await prisma.$transaction(async (tx) => {
      for (const account of DEMO_ACCOUNTS) {
        // Actualizar SOLO passwordHash
        await tx.$executeRawUnsafe(
          `UPDATE users SET "passwordHash" = $1 WHERE id::text = $2;`,
          hashes[account.id],
          account.id
        );
        updatedCount++;

        // Revocar sesiones activas (marcar como revocadas durable)
        const revoked: any = await tx.$executeRawUnsafe(
          `UPDATE auth_sessions
           SET "revokedAt" = now(), "updatedAt" = now()
           WHERE "userId"::text = $1 AND "revokedAt" IS NULL;`,
          account.id
        );
        revokedSessions += Number(revoked) || 0;
      }
    });

    console.log(`  ${updatedCount}/4 cuentas actualizadas.`);
    console.log(`  ${revokedSessions} sesiones activas revocadas.\n`);

    // ── Verificación posterior ────────────────────────────────────────────────
    console.log('[3/3] Verificando hashes y estado post-rotación...');

    for (const account of DEMO_ACCOUNTS) {
      const row: any = await prisma.$queryRawUnsafe(
        `SELECT "passwordHash" FROM users WHERE id::text = $1;`,
        account.id
      );
      const hash = row[0].passwordHash;

      // Verificar formato Argon2id sin imprimir el hash
      if (!hash.startsWith('$argon2id$v=19$') || hash.length < 50) {
        throw new Error(`Hash inválido para ${account.email} — formato no Argon2id.`);
      }

      // Verificar que la contraseña coincide con el hash (funcional)
      const valid = await AuthService.verifyPassword(hash, passwords[account.id]);
      if (!valid) {
        throw new Error(`FALLO DE VERIFICACIÓN: La contraseña de ${account.email} no coincide con el hash almacenado.`);
      }
      console.log(`  ✓ ${account.rol} (${account.email}): hash Argon2id válido y verificado.`);
    }

    // Verificar vínculos User/Usuario
    const linkedUsers: any = await prisma.$queryRawUnsafe(`
      SELECT u.email FROM users u
      JOIN usuarios us ON u."usuarioId" = us.id
      ORDER BY u.email;
    `);
    if (linkedUsers.length !== 3) {
      throw new Error(`Se esperaban 3 vínculos User/Usuario, encontrados: ${linkedUsers.length}`);
    }
    console.log(`\n  Vínculos User/Usuario: 3/3 intactos.`);

    // Verificar propiedades
    const propCount: any = await prisma.$queryRawUnsafe(
      'SELECT count(*)::int AS c FROM propiedades;'
    );
    if (Number(propCount[0].c) !== 2) {
      throw new Error(`Se esperaban 2 propiedades, encontradas: ${propCount[0].c}`);
    }
    console.log('  Propiedades: 2/2 intactas.');

    console.log('\n================================================================');
    console.log('   DICTAMEN FINAL: ROTATION_PASS');
    console.log('================================================================');
    console.log('\nLas nuevas credenciales están disponibles en:');
    console.log('  backend/.demo-credentials  (gitignored — entrega privada a Diego)');

  } finally {
    await close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rotateDemoPasswords().catch((err) => {
    console.error('\nFATAL: Rotación fallida:', err.message);
    process.exit(1);
  });
}
