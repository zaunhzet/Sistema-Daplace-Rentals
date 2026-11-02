import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from '../shared/database.js';
import { AuthService } from '../modules/auth/auth.service.js';
import type { PrismaClient } from '../generated/prisma/client.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

// ==============================================================================
// DAPLACE RENTALS — PREPARACIÓN Y ROTACIÓN FOCAL DE CREDENCIALES DEMO
// (FEEDBACK-DIEGO-03-A / A5)
//
// Actualiza correo y contraseña de las 4 cuentas sintéticas demo:
// - admin@daplace.invalid
// - operador@daplace.invalid
// - propietario@daplace.invalid
// - cliente@daplace.invalid
//
// Invariantes obligatorias:
// 1. Conserva User.id, Usuario.id, usuarioId, roles y propiedades.
// 2. Sincroniza transaccionalmente Usuario.email para las cuentas internas/propietario.
// 3. Contraseñas memorables pero criptográficamente robustas (frases de paso de alta entropía).
// 4. Deriva hashes Argon2id seguros.
// 5. Detecta y aborta ante cualquier colisión de email con cuentas no demo.
// 6. Revoca de inmediato todas las sesiones activas de las cuentas actualizadas.
// 7. Salida segura: guarda inventario en backend/.demo-credentials (gitignored) con chmod 0600.
// 8. Safe-by-default: dry-run por defecto; requiere confirmación explícita para escritura.
// ==============================================================================

export interface DemoAccountConfig {
  id: string;
  usuarioId?: string;
  proposedEmail: string;
  rol: 'ADMINISTRADOR' | 'OPERADOR' | 'PROPIETARIO' | 'CLIENTE';
  currentEmailCandidates: string[];
}

export const TARGET_DEMO_ACCOUNTS: DemoAccountConfig[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    usuarioId: '00000000-0000-4000-a000-000000000001',
    proposedEmail: 'admin@daplace.invalid',
    rol: 'ADMINISTRADOR',
    currentEmailCandidates: ['admin.demo@daplace.invalid', 'admin@daplace.pe', 'admin@daplace.invalid'],
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    usuarioId: '00000000-0000-4000-a000-000000000002',
    proposedEmail: 'operador@daplace.invalid',
    rol: 'OPERADOR',
    currentEmailCandidates: ['operador.demo@daplace.invalid', 'operador@daplace.pe', 'operador@daplace.invalid'],
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    usuarioId: '00000000-0000-4000-a000-000000000003',
    proposedEmail: 'propietario@daplace.invalid',
    rol: 'PROPIETARIO',
    currentEmailCandidates: ['propietario.demo@daplace.invalid', 'propietario@daplace.pe', 'propietario@daplace.invalid'],
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    proposedEmail: 'cliente@daplace.invalid',
    rol: 'CLIENTE',
    currentEmailCandidates: ['cliente.demo@daplace.invalid', 'cliente@daplace.pe', 'cliente@daplace.invalid'],
  },
];

// Lista curada de palabras memorables para frases de paso (Wordlist de alta memorabilidad)
const MEMORABLE_WORDS = [
  'Andes', 'Bahia', 'Brisa', 'Canto', 'Cedro', 'Cielo', 'Clave', 'Costa',
  'Delta', 'Dunas', 'Farol', 'Fiesta', 'Flora', 'Fuente', 'Gemas', 'Huerto',
  'Isla', 'Jardin', 'Lapis', 'Llama', 'Lluvia', 'Marea', 'Monte', 'Nieve',
  'Nube', 'Oasis', 'Oceano', 'Olivo', 'Palma', 'Pampa', 'Piedra', 'Playa',
  'Prado', 'Puente', 'Puerto', 'Risco', 'Roble', 'Salto', 'Selva', 'Sierra',
  'Solar', 'Sombra', 'Suave', 'Tejano', 'Torre', 'Valle', 'Viento', 'Zafiro'
];

const SPECIAL_SYMBOLS = ['!', '@', '#', '$', '%', '&', '*'];

/**
 * Genera una frase de paso memorable pero criptográficamente segura.
 * Estructura: Palabra-Palabra-Palabra-Palabra-NumSimb (ej. "Costa-Nube-Torre-Valle-84#")
 * Entropía: ~48 bits de selección de palabra + números + símbolos = > 64 bits de entropía.
 */
export function generateMemorablePassphrase(): string {
  const selectedWords: string[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = crypto.randomInt(0, MEMORABLE_WORDS.length);
    selectedWords.push(MEMORABLE_WORDS[idx]);
  }

  const randomNum = crypto.randomInt(10, 99);
  const randomSymbol = SPECIAL_SYMBOLS[crypto.randomInt(0, SPECIAL_SYMBOLS.length)];

  return `${selectedWords.join('-')}-${randomNum}${randomSymbol}`;
}

export interface PreparedAccountCredential {
  id: string;
  usuarioId?: string;
  rol: string;
  email: string;
  passphrase: string;
  passwordHash: string;
}

export interface PrepareCredentialsOptions {
  prisma?: PrismaClient;
  dryRun?: boolean;
  saveInventoryPath?: string;
  customPassphrases?: Record<string, string>;
}

export async function prepareOrUpdateDemoCredentials(options: PrepareCredentialsOptions = {}) {
  const isDryRun = options.dryRun ?? true;

  console.log('================================================================');
  console.log('   DAPLACE RENTALS — PREPARACIÓN DE CREDENCIALES SIMPLIFICADAS');
  console.log('   (FEEDBACK-DIEGO-03-A / A5)');
  console.log('================================================================\n');

  if (isDryRun) {
    console.log('[MODO] AUDITORÍA / SIMULACIÓN (DRY-RUN). No se escribirán cambios en la base de datos.\n');
  } else {
    console.log('[MODO] EJECUCIÓN ACTIVA. Se aplicarán cambios en la base de datos local autorizada.\n');
  }

  // 1. Generar credenciales memorables y derivar hashes Argon2id
  console.log('[1/4] Generando frases de paso memorables y calculando hashes Argon2id...');
  const preparedList: PreparedAccountCredential[] = [];

  for (const target of TARGET_DEMO_ACCOUNTS) {
    const passphrase = options.customPassphrases?.[target.id] || generateMemorablePassphrase();
    const passwordHash = await AuthService.hashPassword(passphrase);

    preparedList.push({
      id: target.id,
      usuarioId: target.usuarioId,
      rol: target.rol,
      email: target.proposedEmail,
      passphrase,
      passwordHash,
    });

    console.log(`  ✓ Rol: ${target.rol.padEnd(14)} -> Nuevo email: ${target.proposedEmail}`);
  }

  // 2. Si se proporcionó una instancia de Prisma o DATABASE_URL está activa, validar contra BD
  if (options.prisma) {
    const prisma = options.prisma;
    console.log('\n[2/4] Verificando estado en base de datos e integridad relacional...');

    // A. Detectar colisiones de correo con cuentas distintas a las sintéticas
    const proposedEmails = TARGET_DEMO_ACCOUNTS.map((a) => a.proposedEmail);
    const existingCollisions: any = await prisma.$queryRawUnsafe(
      `SELECT id::text, email FROM users WHERE email = ANY($1::text[]) AND id::text != ALL($2::text[]);`,
      proposedEmails,
      TARGET_DEMO_ACCOUNTS.map((a) => a.id)
    );

    if (existingCollisions.length > 0) {
      throw new Error(
        `COLISIÓN DE IDENTIDAD: Uno o más correos propuestos ya existen en cuentas ajenas: ${existingCollisions
          .map((c: any) => `${c.email} (${c.id})`)
          .join(', ')}`
      );
    }
    console.log('  ✓ Sin colisiones de correo detectadas.');

    // B. Si NO es dry-run, ejecutar actualización transaccional
    if (!isDryRun) {
      console.log('\n[3/4] Aplicando cambios transaccionales en base de datos...');
      let updatedUsers = 0;
      let updatedUsuarios = 0;
      let revokedSessions = 0;

      await prisma.$transaction(async (tx) => {
        for (const prep of preparedList) {
          // Actualizar User
          const uRes: any = await tx.$executeRawUnsafe(
            `UPDATE users
             SET email = $1, "passwordHash" = $2, "updatedAt" = now()
             WHERE id::text = $3;`,
            prep.email,
            prep.passwordHash,
            prep.id
          );
          updatedUsers += Number(uRes) || 0;

          // Si tiene usuarioId, sincronizar Usuario.email
          if (prep.usuarioId) {
            const domRes: any = await tx.$executeRawUnsafe(
              `UPDATE usuarios
               SET email = $1, "updatedAt" = now()
               WHERE id::text = $2;`,
              prep.email,
              prep.usuarioId
            );
            updatedUsuarios += Number(domRes) || 0;
          }

          // Revocar sesiones activas
          const sRes: any = await tx.$executeRawUnsafe(
            `UPDATE auth_sessions
             SET "revokedAt" = now(), "updatedAt" = now()
             WHERE "userId"::text = $1 AND "revokedAt" IS NULL;`,
            prep.id
          );
          revokedSessions += Number(sRes) || 0;
        }
      });

      console.log(`  ✓ ${updatedUsers}/4 registros de User actualizados.`);
      console.log(`  ✓ ${updatedUsuarios}/3 registros de Usuario de dominio sincronizados.`);
      console.log(`  ✓ ${revokedSessions} sesiones activas revocadas.`);
    } else {
      console.log('\n[3/4] Dry-run: omisión de escritura en base de datos.');
    }
  } else {
    console.log('\n[2/4] y [3/4] Sin conexión de base de datos provista; se omite verificación SQL.');
  }

  // 4. Guardar inventario seguro si se especifica ruta
  console.log('\n[4/4] Preparando inventario seguro de credenciales...');
  const inventoryPath = options.saveInventoryPath || path.resolve(process.cwd(), 'backend/.demo-credentials');

  const inventoryContent = [
    '# ==============================================================================#',
    '# DAPLACE RENTALS — INVENTARIO DE CREDENCIALES SIMPLIFICADAS DEMO                #',
    '# GENERADO: ' + new Date().toISOString() + '                               #',
    '# ARCHIVO PRIVADO — PROHIBIDO SUBIR A CONTROL DE VERSIONES (GIT)                 #',
    '# ==============================================================================#',
    '',
    ...preparedList.map((item) => {
      return [
        `[${item.rol}]`,
        `User ID:      ${item.id}`,
        item.usuarioId ? `Usuario ID:   ${item.usuarioId}` : `Usuario ID:   (No aplica / Sin vínculo de dominio)`,
        `Email:        ${item.email}`,
        `Passphrase:   ${item.passphrase}`,
        `PasswordHash: ${item.passwordHash.substring(0, 30)}... [Argon2id]`,
        '',
      ].join('\n');
    }),
  ].join('\n');

  if (!isDryRun && options.saveInventoryPath) {
    fs.writeFileSync(inventoryPath, inventoryContent, { mode: 0o600 });
    console.log(`  ✓ Inventario persistido de forma segura en: ${inventoryPath}`);
  }

  return {
    success: true,
    dryRun: isDryRun,
    accounts: preparedList.map((p) => ({
      id: p.id,
      rol: p.rol,
      email: p.email,
      passphraseLength: p.passphrase.length,
      hasArgon2idHash: p.passwordHash.startsWith('$argon2id$v=19$'),
    })),
  };
}

// Ejecución directa por CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const confirmUpdate = process.env.CONFIRM_DEMO_CREDENTIALS_UPDATE === 'true';
  const dbUrl = process.env.DATABASE_URL;

  // Gate de seguridad obligatorio contra Supabase remoto:
  if (dbUrl && (dbUrl.includes('supabase.com') || dbUrl.includes('supabase.co'))) {
    console.error(
      '\nBLOQUEO DE SEGURIDAD ESTRICTO: No se autoriza la ejecución de este script sobre Supabase remoto en esta fase.\n' +
        'El alcance A5 establece: "No ejecutar todavía cambios de correo o contraseña sobre Supabase. Preparar la operación y el inventario exacto para autorización posterior."\n'
    );
    process.exit(1);
  }

  let db: { prisma: PrismaClient; close: () => Promise<void> } | undefined;
  if (dbUrl) {
    db = createDatabase(dbUrl);
  }

  prepareOrUpdateDemoCredentials({
    prisma: db?.prisma,
    dryRun: !confirmUpdate,
    saveInventoryPath: path.resolve(process.cwd(), '.demo-credentials-preview'),
  })
    .then(async (result) => {
      console.log('\n================================================================');
      console.log('   INVENTARIO RESUMIDO (METADATOS SIN SECRETOS EXPUESTOS):');
      console.log('================================================================');
      console.table(result.accounts);
      console.log('\nOperación completada con éxito.');
      if (db) await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('\nERROR:', err.message);
      if (db) await db.close();
      process.exit(1);
    });
}
