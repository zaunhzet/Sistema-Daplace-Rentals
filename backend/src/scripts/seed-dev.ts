import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';
import { AuthService } from '../modules/auth/auth.service.js';
import type { UserRole } from '../modules/auth/auth.types.js';
import type { PrismaClient, RolUsuario } from '../generated/prisma/client.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export interface DevUserFixture {
  email: string;
  nombre: string;
  cargo: string;
  rol: UserRole;
  rolUsuario?: RolUsuario;
}

export interface SeedConflict {
  email: string;
  code: 'CONFLICT_EXISTING_LINK' | 'CONFLICT_ROLE_MISMATCH' | 'CONFLICT_USER_ALREADY_LINKED';
  message: string;
  existingUsuarioId?: string | null;
  targetUsuarioId?: string | null;
  existingRole?: string;
  targetRole?: string;
}

export interface SeedDevResult {
  success: boolean;
  linked: Array<{
    email: string;
    rol: string;
    usuarioId: string;
    status: 'CREADO' | 'VINCULADO' | 'OMITIDO';
  }>;
  conflicts: SeedConflict[];
  errors: Array<{ email?: string; message: string }>;
}

export interface SeedDevOptions {
  defaultPassword?: string;
  allowDevSeed?: boolean;
}

export const devUsers: DevUserFixture[] = [
  {
    email: 'admin.dev@daplace.pe',
    nombre: 'Valeria Méndez',
    cargo: 'Administradora General',
    rol: 'ADMINISTRADOR',
    rolUsuario: 'ADMIN',
  },
  {
    email: 'operador.dev@daplace.pe',
    nombre: 'Diego Navarro',
    cargo: 'Operador de Turno',
    rol: 'OPERADOR',
    rolUsuario: 'OPERADOR',
  },
  {
    email: 'propietario.dev@daplace.pe',
    nombre: 'Carlos Echevarría',
    cargo: 'Propietario de Inmuebles',
    rol: 'PROPIETARIO',
    rolUsuario: 'PROPIETARIO',
  },
  {
    email: 'cliente.dev@daplace.pe',
    nombre: 'Ana Sofía Rivas',
    cargo: 'Cliente / Huésped',
    rol: 'CLIENTE',
  },
];

/**
 * Determina si un rol del módulo User es compatible con un rol de la entidad Usuario.
 */
export function areRolesCompatible(userRole: UserRole, usuarioRol: RolUsuario): boolean {
  if ((userRole === 'ADMINISTRADOR' || userRole === 'ADMIN') && usuarioRol === 'ADMIN') return true;
  if (userRole === 'OPERADOR' && usuarioRol === 'OPERADOR') return true;
  if (userRole === 'PROPIETARIO' && usuarioRol === 'PROPIETARIO') return true;
  return false;
}

/**
 * Valida minuciosamente que la URL de base de datos apunte exclusivamente a un host local.
 */
function validateLocalHost(urlStr: string): void {
  try {
    const parsedUrl = new URL(urlStr.replace(/^postgresql:\/\//, 'http://'));
    const hostname = parsedUrl.hostname.toLowerCase();
    const allowedLocalHosts = ['localhost', '127.0.0.1', '::1', 'postgres'];

    if (!allowedLocalHosts.includes(hostname)) {
      throw new Error(
        `Error de seguridad: DATABASE_URL apunta a un host no local ("${hostname}"). El seed únicamente está permitido contra una instancia local de PostgreSQL.`
      );
    }
  } catch (err: any) {
    if (err.message?.includes('Error de seguridad')) throw err;
    throw new Error('Error: No se pudo verificar la estructura de DATABASE_URL.');
  }
}

/**
 * Ejecuta el bootstrap e integración de usuarios de desarrollo.
 * - Protegido: exige explícitamente ALLOW_DEV_SEED y rechaza entornos de producción.
 * - Idempotente: puede ejecutarse múltiples veces sin generar duplicados.
 * - Conservador: preserva el estado de usuarios desactivados (activo: false) sin habilitarlos automáticamente.
 * - Anticolisiones: ante conflictos de vínculos o roles no altera los datos existentes, reporta el conflicto y exige revisión.
 * - No suposiciones: jamás asocia registros basándose en similitud de nombres; opera con correspondencia estricta de correo.
 */
export async function seedDevUsers(
  target?: PrismaClient | string,
  options?: SeedDevOptions
): Promise<SeedDevResult> {
  // 1. Bloqueo terminante contra entornos de producción en toda invocación
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Error de seguridad: seedDevUsers jamás debe ejecutarse en entornos de producción (NODE_ENV=production).'
    );
  }

  // 2. Verificación de autorización explícita de entorno
  const isAllowed = process.env.ALLOW_DEV_SEED === 'true' || options?.allowDevSeed === true;
  if (!isAllowed) {
    throw new Error(
      'Error de seguridad: La ejecución de seedDevUsers está bloqueada.\n' +
        'Para autorizar la carga de fixtures en desarrollo local, defina explícitamente:\n' +
        'ALLOW_DEV_SEED="true" en su entorno o pase { allowDevSeed: true } en las opciones.'
    );
  }

  let prisma: PrismaClient;
  let shouldClose = false;
  let closeFn: (() => Promise<void>) | undefined;

  if (target && typeof target === 'object' && '$queryRaw' in target) {
    prisma = target as PrismaClient;
  } else {
    const url = typeof target === 'string' ? target : process.env.DATABASE_URL;
    if (!url) {
      throw new Error('Error: DATABASE_URL no se encuentra configurada.');
    }
    validateLocalHost(url);
    const database = createDatabase(url);
    prisma = database.prisma;
    shouldClose = true;
    closeFn = () => database.close();
  }

  const linked: SeedDevResult['linked'] = [];
  const conflicts: SeedConflict[] = [];
  const errors: SeedDevResult['errors'] = [];

  try {
    const devPassword = options?.defaultPassword || process.env.DEV_DEFAULT_PASSWORD;
    if (!devPassword || devPassword.trim().length < 8) {
      throw new Error(
        'Error: Debe especificar una contraseña para los usuarios de prueba en la variable:\n' +
          'DEV_DEFAULT_PASSWORD (mínimo 8 caracteres) en su archivo .env local o en options.'
      );
    }

    console.log('--- Iniciando bootstrap de usuarios para desarrollo local ---');
    const passwordHash = await AuthService.hashPassword(devPassword);

    for (const devUser of devUsers) {
      const emailNormalized = devUser.email.toLowerCase().trim();

      // FASE 1: Consultas de solo lectura (sin escrituras en base de datos)
      const existingUser = await prisma.user.findUnique({
        where: { email: emailNormalized },
      });

      let existingUsuario: { id: string; email: string; rol: RolUsuario; activo: boolean } | null = null;
      let otherUserWithUsuario: { id: string; email: string } | null = null;

      if (devUser.rolUsuario) {
        existingUsuario = await prisma.usuario.findUnique({
          where: { email: emailNormalized },
        });

        if (existingUsuario) {
          otherUserWithUsuario = await prisma.user.findUnique({
            where: { usuarioId: existingUsuario.id },
            select: { id: true, email: true },
          });
        }
      }

      // FASE 2: Validación estricta de conflictos ANTES de cualquier escritura
      if (devUser.rolUsuario) {
        // Escenario A: Cuenta User ya existe
        if (existingUser) {
          // Escenario A.1: Usuario transaccional también existe
          if (existingUsuario) {
            // Validación de compatibilidad de roles
            if (!areRolesCompatible(existingUser.rol, existingUsuario.rol)) {
              const conflictMsg = `Conflicto de roles: User(${emailNormalized}) posee rol "${existingUser.rol}", incompatible con Usuario(${existingUsuario.id}) con rol "${existingUsuario.rol}". Se conservan los datos originales y se exige revisión explícita.`;
              console.warn(`[CONFLICTO]   ${conflictMsg}`);
              conflicts.push({
                email: emailNormalized,
                code: 'CONFLICT_ROLE_MISMATCH',
                message: conflictMsg,
                existingRole: existingUser.rol,
                targetRole: existingUsuario.rol,
              });
              continue;
            }

            // Validación de vínculo existente previo
            if (existingUser.usuarioId && existingUser.usuarioId !== existingUsuario.id) {
              const conflictMsg = `Conflicto de vínculo: User(${emailNormalized}) ya posee usuarioId "${existingUser.usuarioId}", diferente al esperado "${existingUsuario.id}". Se conserva el vínculo existente y se exige revisión explícita.`;
              console.warn(`[CONFLICTO]   ${conflictMsg}`);
              conflicts.push({
                email: emailNormalized,
                code: 'CONFLICT_EXISTING_LINK',
                message: conflictMsg,
                existingUsuarioId: existingUser.usuarioId,
                targetUsuarioId: existingUsuario.id,
              });
              continue;
            }

            // Validación de unicidad 1:1
            if (otherUserWithUsuario && otherUserWithUsuario.id !== existingUser.id) {
              const conflictMsg = `Conflicto de unicidad: Usuario(${existingUsuario.id}) ya se encuentra asignado a otra cuenta User(${otherUserWithUsuario.email}). No se puede vincular a ${emailNormalized}.`;
              console.warn(`[CONFLICTO]   ${conflictMsg}`);
              conflicts.push({
                email: emailNormalized,
                code: 'CONFLICT_USER_ALREADY_LINKED',
                message: conflictMsg,
                targetUsuarioId: existingUsuario.id,
              });
              continue;
            }

            // Sin conflictos: vincular si estaba sin vínculo
            if (!existingUser.usuarioId) {
              await prisma.user.update({
                where: { id: existingUser.id },
                data: { usuarioId: existingUsuario.id },
              });
              console.log(
                `[Vinculado]   ${devUser.rol.padEnd(14)}: ${emailNormalized} -> Usuario(${existingUsuario.id})`
              );
              linked.push({
                email: emailNormalized,
                rol: devUser.rol,
                usuarioId: existingUsuario.id,
                status: 'VINCULADO',
              });
            } else {
              console.log(
                `[Omitido]     ${devUser.rol.padEnd(14)}: ${emailNormalized} (usuario ya existente y vinculado de forma consistente)`
              );
              linked.push({
                email: emailNormalized,
                rol: devUser.rol,
                usuarioId: existingUser.usuarioId,
                status: 'OMITIDO',
              });
            }
          } else {
            // Escenario A.2: User existe, pero Usuario no existe
            // Validar compatibilidad de roles antes de crear cualquier registro
            if (!areRolesCompatible(existingUser.rol, devUser.rolUsuario)) {
              const conflictMsg = `Conflicto de roles: User(${emailNormalized}) posee rol "${existingUser.rol}", incompatible con el rol requerido "${devUser.rolUsuario}". No se crea registro Usuario huérfano.`;
              console.warn(`[CONFLICTO]   ${conflictMsg}`);
              conflicts.push({
                email: emailNormalized,
                code: 'CONFLICT_ROLE_MISMATCH',
                message: conflictMsg,
                existingRole: existingUser.rol,
                targetRole: devUser.rolUsuario,
              });
              continue; // Evita crear un Usuario huérfano
            }

            if (existingUser.usuarioId) {
              const conflictMsg = `Conflicto de vínculo: User(${emailNormalized}) ya posee usuarioId "${existingUser.usuarioId}". No se crea nuevo Usuario huérfano.`;
              console.warn(`[CONFLICTO]   ${conflictMsg}`);
              conflicts.push({
                email: emailNormalized,
                code: 'CONFLICT_EXISTING_LINK',
                message: conflictMsg,
                existingUsuarioId: existingUser.usuarioId,
              });
              continue; // Evita crear un Usuario huérfano
            }

            // Transacción atómica: crea Usuario y vincula User
            const linkedUsuario = await prisma.$transaction(async (tx) => {
              const nuevoUsuario = await tx.usuario.create({
                data: {
                  email: emailNormalized,
                  nombre: existingUser.nombre,
                  rol: devUser.rolUsuario!,
                  activo: existingUser.isActive, // Conserva deshabilitado si User estaba deshabilitado
                },
              });
              await tx.user.update({
                where: { id: existingUser.id },
                data: { usuarioId: nuevoUsuario.id },
              });
              return nuevoUsuario;
            });

            console.log(
              `[Reconciliado] ${devUser.rol.padEnd(14)}: ${emailNormalized} -> Usuario(${linkedUsuario.id}) (activo: ${existingUser.isActive})`
            );
            linked.push({
              email: emailNormalized,
              rol: devUser.rol,
              usuarioId: linkedUsuario.id,
              status: 'CREADO',
            });
          }
        } else {
          // Escenario B: User NO existe
          if (existingUsuario) {
            // Escenario B.1: Usuario existe previamente
            // Validar compatibilidad de roles ANTES de crear User
            if (!areRolesCompatible(devUser.rol, existingUsuario.rol)) {
              const conflictMsg = `Conflicto de roles: Nuevo User(${emailNormalized}) con rol esperado "${devUser.rol}" es incompatible con Usuario existente (${existingUsuario.id}) con rol "${existingUsuario.rol}". No se crea User sin vincular.`;
              console.warn(`[CONFLICTO]   ${conflictMsg}`);
              conflicts.push({
                email: emailNormalized,
                code: 'CONFLICT_ROLE_MISMATCH',
                message: conflictMsg,
                existingRole: devUser.rol,
                targetRole: existingUsuario.rol,
              });
              continue; // CRÍTICO: NO crear User activo sin vínculo
            }

            // Validar unicidad 1:1
            if (otherUserWithUsuario) {
              const conflictMsg = `Conflicto de unicidad: Usuario(${existingUsuario.id}) ya se encuentra asignado a User(${otherUserWithUsuario.email}). No se crea User sin vincular.`;
              console.warn(`[CONFLICTO]   ${conflictMsg}`);
              conflicts.push({
                email: emailNormalized,
                code: 'CONFLICT_USER_ALREADY_LINKED',
                message: conflictMsg,
                targetUsuarioId: existingUsuario.id,
              });
              continue; // CRÍTICO: NO crear User activo sin vínculo
            }

            // Seguro crear User vinculado al Usuario existente
            await prisma.user.create({
              data: {
                email: emailNormalized,
                nombre: devUser.nombre,
                cargo: devUser.cargo,
                rol: devUser.rol as any,
                passwordHash,
                isActive: existingUsuario.activo, // Respeta estado del Usuario existente
                usuarioId: existingUsuario.id,
              },
            });

            console.log(
              `[Creado]      ${devUser.rol.padEnd(14)}: ${emailNormalized} (vinculado a Usuario existente ${existingUsuario.id})`
            );
            linked.push({
              email: emailNormalized,
              rol: devUser.rol,
              usuarioId: existingUsuario.id,
              status: 'CREADO',
            });
          } else {
            // Escenario B.2: Ni User ni Usuario existen -> Transacción atómica
            const created = await prisma.$transaction(async (tx) => {
              const nuevoUsuario = await tx.usuario.create({
                data: {
                  email: emailNormalized,
                  nombre: devUser.nombre,
                  rol: devUser.rolUsuario!,
                  activo: true,
                },
              });
              const nuevoUser = await tx.user.create({
                data: {
                  email: emailNormalized,
                  nombre: devUser.nombre,
                  cargo: devUser.cargo,
                  rol: devUser.rol as any,
                  passwordHash,
                  isActive: true,
                  usuarioId: nuevoUsuario.id,
                },
              });
              return { nuevoUsuario, nuevoUser };
            });

            console.log(
              `[Creado]      ${devUser.rol.padEnd(14)}: ${emailNormalized} (vinculado a Usuario ${created.nuevoUsuario.id})`
            );
            linked.push({
              email: emailNormalized,
              rol: devUser.rol,
              usuarioId: created.nuevoUsuario.id,
              status: 'CREADO',
            });
          }
        }
      } else {
        // devUser sin rolUsuario (CLIENTE)
        if (existingUser) {
          console.log(
            `[Omitido]     ${devUser.rol.padEnd(14)}: ${emailNormalized} (rol CLIENTE sin entidad transaccional en usuarios)`
          );
        } else {
          await prisma.user.create({
            data: {
              email: emailNormalized,
              nombre: devUser.nombre,
              cargo: devUser.cargo,
              rol: devUser.rol as any,
              passwordHash,
              isActive: true,
              usuarioId: null,
            },
          });
          console.log(
            `[Creado]      ${devUser.rol.padEnd(14)}: ${emailNormalized} (rol CLIENTE sin entidad transaccional)`
          );
        }
      }
    }

    // 3. Conciliación y vinculación segura de cuentas User existentes en la base sin relación transaccional
    // Se opera estrictamente por coincidencia exacta de email; nunca por similitud de nombres.
    const unlinkedUsers = await prisma.user.findMany({
      where: {
        usuarioId: null,
        rol: { in: ['ADMINISTRADOR', 'OPERADOR', 'PROPIETARIO'] },
      },
    });

    if (unlinkedUsers.length > 0) {
      console.log(`\n--- Reconciliando ${unlinkedUsers.length} cuentas de login sin vínculo transaccional ---`);
      for (const unlinked of unlinkedUsers) {
        const mappedRole: RolUsuario = unlinked.rol === 'ADMINISTRADOR' ? 'ADMIN' : (unlinked.rol as RolUsuario);
        const email = unlinked.email.toLowerCase().trim();

        // Si la cuenta ya presentó un conflicto en el bootstrap de fixtures, no reconciliar
        if (conflicts.some((c) => c.email === email)) {
          console.log(`[Omitido]     Reconciliación omitida para ${email} debido a conflicto previo no resuelto.`);
          continue;
        }

        let usuario = await prisma.usuario.findUnique({
          where: { email },
        });

        if (usuario) {
          // Verificar compatibilidad de roles
          if (!areRolesCompatible(unlinked.rol, usuario.rol)) {
            const conflictMsg = `Conflicto de roles en reconciliación: User(${email}) posee rol "${unlinked.rol}", incompatible con Usuario(${usuario.id}) con rol "${usuario.rol}". No se vincula.`;
            console.warn(`[CONFLICTO]   ${conflictMsg}`);
            conflicts.push({
              email,
              code: 'CONFLICT_ROLE_MISMATCH',
              message: conflictMsg,
              existingRole: unlinked.rol,
              targetRole: usuario.rol,
            });
            continue;
          }

          // Verificar si ya está asignado a otro User (1:1)
          const alreadyLinkedUser = await prisma.user.findUnique({
            where: { usuarioId: usuario.id },
          });

          if (alreadyLinkedUser && alreadyLinkedUser.id !== unlinked.id) {
            const conflictMsg = `Conflicto de unicidad en reconciliación: Usuario(${usuario.id}) ya asignado a User(${alreadyLinkedUser.email}). No se puede vincular a User(${email}).`;
            console.warn(`[CONFLICTO]   ${conflictMsg}`);
            conflicts.push({
              email,
              code: 'CONFLICT_USER_ALREADY_LINKED',
              message: conflictMsg,
              targetUsuarioId: usuario.id,
            });
            continue;
          }

          await prisma.user.update({
            where: { id: unlinked.id },
            data: { usuarioId: usuario.id },
          });
          console.log(`[Reconciliado] Vinculado User(${email}) con Usuario(${usuario.id})`);
          linked.push({
            email,
            rol: unlinked.rol,
            usuarioId: usuario.id,
            status: 'VINCULADO',
          });
        } else {
          // Si no existe Usuario, crearlo preservando exactamente el estado activo de la cuenta User de forma atómica
          const createdUsuario = await prisma.$transaction(async (tx) => {
            const nuevo = await tx.usuario.create({
              data: {
                email,
                nombre: unlinked.nombre,
                rol: mappedRole,
                activo: unlinked.isActive, // Conserva desactivado si unlinked.isActive === false
              },
            });
            await tx.user.update({
              where: { id: unlinked.id },
              data: { usuarioId: nuevo.id },
            });
            return nuevo;
          });

          console.log(`[Reconciliado] Creado registro Usuario(${createdUsuario.id}) para ${email} (activo: ${unlinked.isActive})`);
          linked.push({
            email,
            rol: unlinked.rol,
            usuarioId: createdUsuario.id,
            status: 'CREADO',
          });
        }
      }
    }

    const isFullySuccessful = conflicts.length === 0 && errors.length === 0;

    if (!isFullySuccessful) {
      console.warn(
        `\n[ADVERTENCIA] Bootstrap finalizado con ${conflicts.length} conflicto(s) y ${errors.length} error(es).\n` +
          'No todas las cuentas fueron vinculadas automáticamente. Se requiere revisión manual explícita para resolver los conflictos detectados.'
      );
    } else {
      console.log('\nBootstrap finalizado exitosamente.');
      console.log('Procedimiento verificado: todas las identidades operativas cuentan con vínculo transaccional válido.');
    }

    return {
      success: isFullySuccessful,
      linked,
      conflicts,
      errors,
    };
  } finally {
    if (shouldClose && closeFn) {
      await closeFn();
    }
  }
}

// Ejecución directa por línea de comandos (npm run db:seed)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDevUsers()
    .then((result) => {
      if (!result.success) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('Error durante el bootstrap de desarrollo:', err.message || err);
      process.exit(1);
    });
}
