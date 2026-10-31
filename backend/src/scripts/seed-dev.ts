import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';
import { AuthService } from '../modules/auth/auth.service.js';
import type { UserRole } from '../modules/auth/auth.types.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

// 1. Verificación de autorización explícita de entorno
if (process.env.ALLOW_DEV_SEED !== 'true') {
  console.error(
    'Error de seguridad: La ejecución de db:seed está bloqueada.\n' +
      'Para autorizar la carga de fixtures en desarrollo local, defina explícitamente:\n' +
      'ALLOW_DEV_SEED="true" en su entorno o archivo .env local.'
  );
  process.exit(1);
}

// 2. Bloqueo terminante contra entornos de producción
if (process.env.NODE_ENV === 'production') {
  console.error('Error de seguridad: db:seed jamás debe ejecutarse en entornos de producción (NODE_ENV=production).');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Error: DATABASE_URL no se encuentra configurada.');
  process.exit(1);
}

// 3. Verificación de host local: impide ejecución contra bases compartidas o remotas
try {
  const parsedUrl = new URL(databaseUrl.replace(/^postgresql:\/\//, 'http://'));
  const hostname = parsedUrl.hostname.toLowerCase();
  const allowedLocalHosts = ['localhost', '127.0.0.1', '::1', 'postgres'];

  if (!allowedLocalHosts.includes(hostname)) {
    console.error(
      `Error de seguridad: DATABASE_URL apunta a un host no local ("${hostname}").\n` +
        'El seed de desarrollo únicamente está permitido contra una instancia local de PostgreSQL.'
    );
    process.exit(1);
  }
} catch {
  console.error('Error: No se pudo verificar la estructura de DATABASE_URL.');
  process.exit(1);
}

// 4. Eliminación de contraseña por defecto codificada en duro
const devPassword = process.env.DEV_DEFAULT_PASSWORD;
if (!devPassword || devPassword.trim().length < 8) {
  console.error(
    'Error: Debe especificar una contraseña para los usuarios de prueba en la variable:\n' +
      'DEV_DEFAULT_PASSWORD (mínimo 8 caracteres) en su archivo .env local.'
  );
  process.exit(1);
}

const devUsers: Array<{
  email: string;
  nombre: string;
  cargo: string;
  rol: UserRole;
  syntheticUsuarioId?: string;
}> = [
  {
    email: 'admin.dev@daplace.pe',
    nombre: 'Valeria Méndez',
    cargo: 'Administradora General',
    rol: 'ADMINISTRADOR',
    syntheticUsuarioId: 'usr-admin',
  },
  {
    email: 'operador.dev@daplace.pe',
    nombre: 'Diego Navarro',
    cargo: 'Operador de Turno',
    rol: 'OPERADOR',
    syntheticUsuarioId: 'usr-operador',
  },
  {
    email: 'propietario.dev@daplace.pe',
    nombre: 'Carlos Echevarría',
    cargo: 'Propietario de Inmuebles',
    rol: 'PROPIETARIO',
    syntheticUsuarioId: 'usr-102', // Propietario sintético de prop-01 y prop-04
  },
  {
    email: 'cliente.dev@daplace.pe',
    nombre: 'Ana Sofía Rivas',
    cargo: 'Cliente / Huésped',
    rol: 'CLIENTE',
  },
];

async function seed() {
  console.log('--- Iniciando bootstrap de usuarios para desarrollo local ---');
  const database = createDatabase(databaseUrl!);

  try {
    const passwordHash = await AuthService.hashPassword(devPassword!);

    for (const devUser of devUsers) {
      // Si tiene syntheticUsuarioId, verificar que el Usuario de dominio exista antes de vincular
      let targetUsuarioId: string | null = null;
      if (devUser.syntheticUsuarioId) {
        const domainUser = await database.prisma.usuario.findUnique({
          where: { id: devUser.syntheticUsuarioId },
        });
        if (domainUser) {
          targetUsuarioId = domainUser.id;
        }
      }

      const existing = await database.prisma.user.findUnique({
        where: { email: devUser.email },
      });

      // 5. No sobrescribir usuarios existentes, pero si carecen de vinculación sintética y está disponible, vincular
      if (existing) {
        if (!existing.usuarioId && targetUsuarioId) {
          await database.prisma.user.update({
            where: { id: existing.id },
            data: { usuarioId: targetUsuarioId },
          });
          console.log(
            `[Vinculado]   ${devUser.rol.padEnd(14)}: ${devUser.email} -> Usuario(${targetUsuarioId})`
          );
        } else {
          console.log(
            `[Omitido]     ${devUser.rol.padEnd(14)}: ${devUser.email} (usuario ya existente, se conservan sus datos)`
          );
        }
      } else {
        await database.prisma.user.create({
          data: {
            email: devUser.email,
            nombre: devUser.nombre,
            cargo: devUser.cargo,
            rol: devUser.rol as any,
            passwordHash,
            isActive: true,
            ...(targetUsuarioId ? { usuarioId: targetUsuarioId } : {}),
          },
        });
        console.log(`[Creado]     ${devUser.rol.padEnd(14)}: ${devUser.email}`);
      }
    }

    console.log('\nBootstrap finalizado.');
    console.log('Procedimiento verificado: ningún secreto o contraseña fue expuesto en los registros.');
  } finally {
    await database.close();
  }
}

seed().catch((err) => {
  console.error('Error durante el bootstrap de desarrollo:', err);
  process.exit(1);
});
