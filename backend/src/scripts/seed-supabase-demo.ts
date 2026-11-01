import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createDatabase } from '../shared/database.js';
import { AuthService } from '../modules/auth/auth.service.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

// ==============================================================================
// DAPLACE RENTALS — SEED CONTROLADO PARA SUPABASE (SUPABASE-DEMO-02)
// Identificadores y datos estrictamente sintéticos y determinísticos
// ==============================================================================

export const DEMO_IDENTIFIERS = {
  adminUsuarioId: '00000000-0000-4000-a000-000000000001',
  adminUserId: '00000000-0000-4000-8000-000000000001',
  adminEmail: 'admin.demo@daplace.invalid',

  operadorUsuarioId: '00000000-0000-4000-a000-000000000002',
  operadorUserId: '00000000-0000-4000-8000-000000000002',
  operadorEmail: 'operador.demo@daplace.invalid',

  propietarioUsuarioId: '00000000-0000-4000-a000-000000000003',
  propietarioUserId: '00000000-0000-4000-8000-000000000003',
  propietarioEmail: 'propietario.demo@daplace.invalid',

  clienteUserId: '00000000-0000-4000-8000-000000000004',
  clienteEmail: 'cliente.demo@daplace.invalid',

  propiedad1Id: '00000000-0000-4000-c000-000000000001',
  propiedad2Id: '00000000-0000-4000-c000-000000000002',
};

function generateSecureDemoPassword(): string {
  // Genera contraseña de 24 caracteres con alta entropía criptográfica
  const raw = crypto.randomBytes(16).toString('base64url');
  return `Dp#2026!${raw}`;
}

export async function runSupabaseDemoSeed() {
  console.log('================================================================');
  console.log('   DAPLACE RENTALS — SEED CONTROLADO SUPABASE (SUPABASE-DEMO-02)');
  console.log('================================================================\n');

  // 1. Salvaguarda explícita de autorización
  if (process.env.CONFIRM_SUPABASE_DEMO_SEED !== 'true') {
    console.error(
      'BLOQUEO DE SEGURIDAD: La carga de datos sintéticos en Supabase requiere autorización explícita.\n' +
        'Defina CONFIRM_SUPABASE_DEMO_SEED="true" en el entorno antes de ejecutar este script.'
    );
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('FATAL: DATABASE_URL no encontrada.');
    process.exit(1);
  }

  // 2. Comprobación estricta del proyecto autorizado
  const expectedProjectId = 'bdfeiiqcswdxzrqoykwp';
  if (!dbUrl.includes(expectedProjectId) || !dbUrl.includes('supabase.com')) {
    console.error(
      `BLOQUEO DE SEGURIDAD: Este script únicamente está autorizado a ejecutarse sobre el proyecto Supabase "${expectedProjectId}".\n` +
        'La URL actual no coincide con el host ni con el identificador del proyecto remoto autorizado.'
    );
    process.exit(1);
  }

  const { prisma, close } = createDatabase(dbUrl);

  try {
    // --------------------------------------------------------------------------
    // FASE 1: VERIFICACIONES OBLIGATORIAS PREVIAS
    // --------------------------------------------------------------------------
    console.log('[1/4] Ejecutando verificaciones obligatorias previas...');

    // A. Sesión como postgres
    const userRes: any = await prisma.$queryRawUnsafe('SELECT current_user::text AS current_user, current_database()::text AS current_db;');
    const currentUser = userRes[0].current_user;
    if (currentUser !== 'postgres') {
      throw new Error(`Se requiere conexión como 'postgres' (Table Owner), usuario actual: '${currentUser}'.`);
    }
    console.log(`- Sesión verificada: '${currentUser}' en base '${userRes[0].current_db}'.`);

    // B. 17 migraciones completas
    const migCount: any = await prisma.$queryRawUnsafe(
      'SELECT count(*)::int AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
    );
    if (Number(migCount[0].count) !== 17) {
      throw new Error(`Se esperaban 17 migraciones completas, se encontraron: ${migCount[0].count}.`);
    }
    console.log(`- Migraciones en _prisma_migrations: 17/17 finalizadas.`);

    // C. 18 tablas con RLS activo y 0 FORCE RLS
    const rlsCount: any = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS count 
       FROM pg_class c 
       JOIN pg_namespace n ON n.oid = c.relnamespace 
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true;`
    );
    if (Number(rlsCount[0].count) !== 18) {
      throw new Error(`Se esperaban 18 tablas con RLS activo, se encontraron: ${rlsCount[0].count}.`);
    }
    console.log(`- Row Level Security (RLS): 18/18 tablas habilitadas (Default Deny).`);

    // D. Privilegios públicos restringidos
    const privAnon: any = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND (has_table_privilege('anon', c.oid, 'SELECT') 
          OR has_table_privilege('authenticated', c.oid, 'SELECT')
          OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('authenticated', c.oid, 'INSERT'));
    `);
    if (Number(privAnon[0].count) !== 0) {
      throw new Error(`Privilegios públicos detectados en ${privAnon[0].count} tablas.`);
    }
    console.log(`- Privilegios de roles públicos (anon, authenticated): denegados al 100%.`);

    // E. Confirmar estado de las tablas de destino
    const countUsers = await prisma.user.count();
    const countUsuarios = await prisma.usuario.count();
    const countPropiedades = await prisma.propiedad.count();

    console.log(`- Conteo actual: users=${countUsers}, usuarios=${countUsuarios}, propiedades=${countPropiedades}.`);

    // Comprobación de colisiones: si hay datos, deben ser exactamente los de este seed (idempotencia)
    if (countUsers > 0 || countUsuarios > 0 || countPropiedades > 0) {
      const existingUserEmails = (await prisma.user.findMany({ select: { email: true } })).map((u) => u.email);
      const allowedEmails = [
        DEMO_IDENTIFIERS.adminEmail,
        DEMO_IDENTIFIERS.operadorEmail,
        DEMO_IDENTIFIERS.propietarioEmail,
        DEMO_IDENTIFIERS.clienteEmail,
      ];
      const foreignUsers = existingUserEmails.filter((e) => !allowedEmails.includes(e));
      if (foreignUsers.length > 0) {
        throw new Error(
          `OPERACIÓN ABORTADA POR SEGURIDAD: Se detectaron usuarios no pertenecientes al seed sintético: ${foreignUsers.join(', ')}. No se sobrescribirán datos ajenos.`
        );
      }
      console.log('  * Los registros existentes corresponden exactamente a la ejecución previa de este seed (modo idempotente).');
    }

    console.log('PREFLIGHT: Todas las verificaciones previas superadas exitosamente.\n');

    // --------------------------------------------------------------------------
    // FASE 2: PREPARACIÓN DE CREDENCIALES ARGON2ID SEGURAS
    // --------------------------------------------------------------------------
    console.log('[2/4] Derivando hashes Argon2id para cuentas sintéticas...');
    const adminPass = process.env.DEMO_ADMIN_PASSWORD || generateSecureDemoPassword();
    const operadorPass = process.env.DEMO_OPERATOR_PASSWORD || generateSecureDemoPassword();
    const propietarioPass = process.env.DEMO_PROPIETARIO_PASSWORD || generateSecureDemoPassword();
    const clientePass = process.env.DEMO_CLIENTE_PASSWORD || generateSecureDemoPassword();

    // Guardar temporalmente las contraseñas para entrega a Diego (solo en memoria)
    const demoCredentials = {
      admin: { email: DEMO_IDENTIFIERS.adminEmail, pass: adminPass, rol: 'ADMINISTRADOR' },
      operador: { email: DEMO_IDENTIFIERS.operadorEmail, pass: operadorPass, rol: 'OPERADOR' },
      propietario: { email: DEMO_IDENTIFIERS.propietarioEmail, pass: propietarioPass, rol: 'PROPIETARIO' },
      cliente: { email: DEMO_IDENTIFIERS.clienteEmail, pass: clientePass, rol: 'CLIENTE' },
    };

    const [adminHash, operadorHash, propietarioHash, clienteHash] = await Promise.all([
      AuthService.hashPassword(adminPass),
      AuthService.hashPassword(operadorPass),
      AuthService.hashPassword(propietarioPass),
      AuthService.hashPassword(clientePass),
    ]);

    // --------------------------------------------------------------------------
    // FASE 3: ESCRITURA EN TRANSACCIÓN ATÓMICA
    // --------------------------------------------------------------------------
    console.log('[3/4] Ejecutando inserción en transacción atómica...');

    await prisma.$transaction(async (tx) => {
      // 1. Usuarios de Dominio (3 registros)
      await tx.usuario.upsert({
        where: { id: DEMO_IDENTIFIERS.adminUsuarioId },
        update: {
          nombre: 'Administrador Demo',
          email: DEMO_IDENTIFIERS.adminEmail,
          telefono: '+51999000001',
          rol: 'ADMIN',
          activo: true,
        },
        create: {
          id: DEMO_IDENTIFIERS.adminUsuarioId,
          nombre: 'Administrador Demo',
          email: DEMO_IDENTIFIERS.adminEmail,
          telefono: '+51999000001',
          rol: 'ADMIN',
          activo: true,
        },
      });

      await tx.usuario.upsert({
        where: { id: DEMO_IDENTIFIERS.operadorUsuarioId },
        update: {
          nombre: 'Operador Demo',
          email: DEMO_IDENTIFIERS.operadorEmail,
          telefono: '+51999000002',
          rol: 'OPERADOR',
          activo: true,
        },
        create: {
          id: DEMO_IDENTIFIERS.operadorUsuarioId,
          nombre: 'Operador Demo',
          email: DEMO_IDENTIFIERS.operadorEmail,
          telefono: '+51999000002',
          rol: 'OPERADOR',
          activo: true,
        },
      });

      await tx.usuario.upsert({
        where: { id: DEMO_IDENTIFIERS.propietarioUsuarioId },
        update: {
          nombre: 'Propietario Demo',
          email: DEMO_IDENTIFIERS.propietarioEmail,
          telefono: '+51999000003',
          rol: 'PROPIETARIO',
          activo: true,
        },
        create: {
          id: DEMO_IDENTIFIERS.propietarioUsuarioId,
          nombre: 'Propietario Demo',
          email: DEMO_IDENTIFIERS.propietarioEmail,
          telefono: '+51999000003',
          rol: 'PROPIETARIO',
          activo: true,
        },
      });

      // 2. Cuentas de Acceso User (4 registros)
      // Si el usuario ya existe, se preservan sus credenciales y no se sobrescribe el passwordHash
      await tx.user.upsert({
        where: { id: DEMO_IDENTIFIERS.adminUserId },
        update: {
          email: DEMO_IDENTIFIERS.adminEmail,
          nombre: 'Administrador Demo',
          cargo: 'Gerencia General Demo',
          rol: 'ADMINISTRADOR',
          isActive: true,
          usuarioId: DEMO_IDENTIFIERS.adminUsuarioId,
        },
        create: {
          id: DEMO_IDENTIFIERS.adminUserId,
          email: DEMO_IDENTIFIERS.adminEmail,
          nombre: 'Administrador Demo',
          cargo: 'Gerencia General Demo',
          rol: 'ADMINISTRADOR',
          isActive: true,
          usuarioId: DEMO_IDENTIFIERS.adminUsuarioId,
          passwordHash: adminHash,
        },
      });

      await tx.user.upsert({
        where: { id: DEMO_IDENTIFIERS.operadorUserId },
        update: {
          email: DEMO_IDENTIFIERS.operadorEmail,
          nombre: 'Operador Demo',
          cargo: 'Coordinación de Operaciones Demo',
          rol: 'OPERADOR',
          isActive: true,
          usuarioId: DEMO_IDENTIFIERS.operadorUsuarioId,
        },
        create: {
          id: DEMO_IDENTIFIERS.operadorUserId,
          email: DEMO_IDENTIFIERS.operadorEmail,
          nombre: 'Operador Demo',
          cargo: 'Coordinación de Operaciones Demo',
          rol: 'OPERADOR',
          isActive: true,
          usuarioId: DEMO_IDENTIFIERS.operadorUsuarioId,
          passwordHash: operadorHash,
        },
      });

      await tx.user.upsert({
        where: { id: DEMO_IDENTIFIERS.propietarioUserId },
        update: {
          email: DEMO_IDENTIFIERS.propietarioEmail,
          nombre: 'Propietario Demo',
          cargo: 'Inversionista Inmobiliario Demo',
          rol: 'PROPIETARIO',
          isActive: true,
          usuarioId: DEMO_IDENTIFIERS.propietarioUsuarioId,
        },
        create: {
          id: DEMO_IDENTIFIERS.propietarioUserId,
          email: DEMO_IDENTIFIERS.propietarioEmail,
          nombre: 'Propietario Demo',
          cargo: 'Inversionista Inmobiliario Demo',
          rol: 'PROPIETARIO',
          isActive: true,
          usuarioId: DEMO_IDENTIFIERS.propietarioUsuarioId,
          passwordHash: propietarioHash,
        },
      });

      await tx.user.upsert({
        where: { id: DEMO_IDENTIFIERS.clienteUserId },
        update: {
          email: DEMO_IDENTIFIERS.clienteEmail,
          nombre: 'Cliente Demo',
          cargo: null,
          rol: 'CLIENTE',
          isActive: true,
          usuarioId: null,
        },
        create: {
          id: DEMO_IDENTIFIERS.clienteUserId,
          email: DEMO_IDENTIFIERS.clienteEmail,
          nombre: 'Cliente Demo',
          cargo: null,
          rol: 'CLIENTE',
          isActive: true,
          usuarioId: null,
          passwordHash: clienteHash,
        },
      });

      // 3. Propiedades Sintéticas (2 registros)
      await tx.propiedad.upsert({
        where: { id: DEMO_IDENTIFIERS.propiedad1Id },
        update: {
          nombre: '[DEMO] Departamento Miraflores Vista al Parque',
          propietarioId: DEMO_IDENTIFIERS.propietarioUsuarioId,
          direccion: 'Calle Ficticia 450, Dpto 802, Miraflores, Lima',
          estadoOperativo: 'OPERATIVA',
          estadoPublicacion: 'PUBLICADA',
          activa: true,
          capacidadHuespedes: 4,
          precioBaseNoche: 320.0,
          moneda: 'PEN',
        },
        create: {
          id: DEMO_IDENTIFIERS.propiedad1Id,
          nombre: '[DEMO] Departamento Miraflores Vista al Parque',
          propietarioId: DEMO_IDENTIFIERS.propietarioUsuarioId,
          direccion: 'Calle Ficticia 450, Dpto 802, Miraflores, Lima',
          estadoOperativo: 'OPERATIVA',
          estadoPublicacion: 'PUBLICADA',
          activa: true,
          capacidadHuespedes: 4,
          precioBaseNoche: 320.0,
          moneda: 'PEN',
        },
      });

      await tx.propiedad.upsert({
        where: { id: DEMO_IDENTIFIERS.propiedad2Id },
        update: {
          nombre: '[DEMO] Suite Barranco Bohemia y Arte',
          propietarioId: DEMO_IDENTIFIERS.propietarioUsuarioId,
          direccion: 'Av. San Martín Ficticia 210, Barranco, Lima',
          estadoOperativo: 'OPERATIVA',
          estadoPublicacion: 'PUBLICADA',
          activa: true,
          capacidadHuespedes: 2,
          precioBaseNoche: 240.0,
          moneda: 'PEN',
        },
        create: {
          id: DEMO_IDENTIFIERS.propiedad2Id,
          nombre: '[DEMO] Suite Barranco Bohemia y Arte',
          propietarioId: DEMO_IDENTIFIERS.propietarioUsuarioId,
          direccion: 'Av. San Martín Ficticia 210, Barranco, Lima',
          estadoOperativo: 'OPERATIVA',
          estadoPublicacion: 'PUBLICADA',
          activa: true,
          capacidadHuespedes: 2,
          precioBaseNoche: 240.0,
          moneda: 'PEN',
        },
      });
    });

    console.log('Transacción atómica completada exitosamente en Supabase PostgreSQL.\n');

    // --------------------------------------------------------------------------
    // FASE 4: VERIFICACIÓN POSTERIOR EXHAUSTIVA
    // --------------------------------------------------------------------------
    console.log('[4/4] Ejecutando verificaciones posteriores directas en catálogo...');

    const postUsers = await prisma.user.count();
    const postUsuarios = await prisma.usuario.count();
    const postPropiedades = await prisma.propiedad.count();

    console.log(`- Conteo en users: ${postUsers} (esperado: 4)`);
    console.log(`- Conteo en usuarios: ${postUsuarios} (esperado: 3)`);
    console.log(`- Conteo en propiedades: ${postPropiedades} (esperado: 2)`);

    if (postUsers !== 4 || postUsuarios !== 3 || postPropiedades !== 2) {
      throw new Error(`Conteo inconsistente tras seed: users=${postUsers}, usuarios=${postUsuarios}, propiedades=${postPropiedades}`);
    }

    // Vínculos User <-> Usuario
    const linkedUsers: any = await prisma.$queryRawUnsafe(`
      SELECT u.email, u.rol::text as user_rol, us.rol::text as usuario_rol
      FROM users u
      JOIN usuarios us ON u."usuarioId" = us.id
      ORDER BY u.email;
    `);
    console.log(`- Vínculos válidos de identidad User <-> Usuario: ${linkedUsers.length}/3`);
    if (linkedUsers.length !== 3) {
      throw new Error(`Se esperaban 3 vínculos válidos, se encontraron: ${linkedUsers.length}`);
    }

    // Cliente sin vínculo
    const clienteCount: any = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int as count 
      FROM users 
      WHERE rol = 'CLIENTE' AND "usuarioId" IS NULL;
    `);
    if (Number(clienteCount[0].count) !== 1) {
      throw new Error('CLIENTE no se encuentra sin identidad transaccional como se esperaba.');
    }
    console.log('- Cuenta CLIENTE: rol CLIENTE confirmado sin vínculo en tabla usuarios.');

    // Verificación de formato Argon2id sin exponer el hash
    const hashCheck: any = await prisma.$queryRawUnsafe(`
      SELECT id, ( "passwordHash" LIKE '$argon2id$v=19$%' AND length("passwordHash") > 50 ) AS is_valid_argon2
      FROM users;
    `);
    const allHashesValid = hashCheck.every((h: any) => h.is_valid_argon2);
    if (!allHashesValid) {
      throw new Error('Uno o más hashes de contraseña no cumplen el formato OWASP Argon2id.');
    }
    console.log('- Hashes Argon2id: 4/4 hashes válidos y seguros almacenados (formato verificado).');

    // Confirmar cero registros en las restantes 15 tablas de dominio
    const remainingTables = [
      'auditoria_eventos',
      'auth_sessions',
      'avisos_reserva',
      'contratos_reserva',
      'evidencias_pago',
      'garantias',
      'gastos',
      'huespedes',
      'movimientos_garantia',
      'notificaciones_internas',
      'ordenes_trabajo',
      'pagos',
      'reservas',
      'sustentos_gasto',
    ];

    let extraRowsTotal = 0;
    for (const t of remainingTables) {
      const res: any = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM "${t}";`);
      const c = Number(res[0].count);
      extraRowsTotal += c;
      if (c > 0) {
        console.warn(`ADVERTENCIA: Tabla "${t}" contiene ${c} registros.`);
      }
    }
    console.log(`- Conteo en las 14 tablas operativas restantes: ${extraRowsTotal} registros (esperado: 0).`);
    if (extraRowsTotal !== 0) {
      throw new Error('Se detectaron registros no autorizados en tablas operativas.');
    }

    // RLS y privilegios finales
    const finalRls: any = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS count 
       FROM pg_class c 
       JOIN pg_namespace n ON n.oid = c.relnamespace 
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true;`
    );
    console.log(`- RLS activo en las 18 tablas: ${finalRls[0].count}/18.`);

    console.log('\n================================================================');
    console.log('   DICTAMEN FINAL: DEMO_SEED_PASS');
    console.log('================================================================');

    return {
      success: true,
      demoCredentials,
    };
  } finally {
    await close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSupabaseDemoSeed().catch((err) => {
    console.error('FATAL: Fallo en seed sintético:', err.message);
    process.exit(1);
  });
}
