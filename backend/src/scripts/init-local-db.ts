import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const { Client } = pg;

async function setup() {
  const adminHost = process.env.PGHOST_ADMIN || process.env.PGHOST || '127.0.0.1';
  const adminPort = Number(process.env.PGPORT_ADMIN || process.env.PGPORT || 5432);
  const adminUser = process.env.PGUSER_ADMIN || process.env.PGUSER || 'postgres';
  const adminPassword = process.env.PGPASSWORD_ADMIN || process.env.PGPASSWORD || 'postgres';
  const adminDatabase = process.env.PGDATABASE_ADMIN || process.env.PGDATABASE || 'postgres';

  const appUser = process.env.DB_APP_USER || 'daplace';
  const appPassword = process.env.DB_APP_PASSWORD || 'daplace_local_only';

  console.log(`[DB SETUP] Conectando como administrador (${adminUser}) en ${adminHost}:${adminPort}/${adminDatabase}...`);

  const adminClient = new Client({
    host: adminHost,
    port: adminPort,
    user: adminUser,
    password: adminPassword,
    database: adminDatabase,
  });

  await adminClient.connect();

  try {
    // 1. Crear o ajustar rol de aplicación con privilegios mínimos (NUNCA SUPERUSER)
    const roleRes = await adminClient.query('SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = $1', [appUser]);
    if (roleRes.rowCount === 0) {
      // Crear rol sin privilegios de superusuario ni creación de BD
      await adminClient.query(`CREATE ROLE "${appUser}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${appPassword.replace(/'/g, "''")}'`);
      console.log(`[DB SETUP] Rol de aplicación "${appUser}" creado con privilegios mínimos (NOSUPERUSER, NOCREATEDB).`);
    } else {
      // Si existía previamente con SUPERUSER, remover privilegios excesivos
      if (roleRes.rows[0].rolsuper) {
        await adminClient.query(`ALTER ROLE "${appUser}" WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
        console.log(`[DB SETUP] Privilegios excesivos removidos: rol "${appUser}" rebajado a NOSUPERUSER.`);
      } else {
        console.log(`[DB SETUP] Rol "${appUser}" ya existe y cuenta con privilegios mínimos adecuados.`);
      }
    }

    // 2. Crear bases de datos de desarrollo y test si no existen
    for (const dbName of ['daplace_dev', 'daplace_test']) {
      const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
      if (exists.rowCount === 0) {
        await adminClient.query(`CREATE DATABASE "${dbName}" OWNER "${appUser}"`);
        console.log(`[DB SETUP] Base de datos "${dbName}" creada con propietario "${appUser}".`);
      } else {
        console.log(`[DB SETUP] Base de datos "${dbName}" ya existe.`);
      }

      await adminClient.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${appUser}"`);
    }
  } finally {
    await adminClient.end();
  }

  // 3. Conectar a cada base como administrador para configurar extensiones y permisos de esquema
  for (const dbName of ['daplace_dev', 'daplace_test']) {
    const dbClient = new Client({
      host: adminHost,
      port: adminPort,
      user: adminUser,
      password: adminPassword,
      database: dbName,
    });
    await dbClient.connect();

    try {
      // Extensión btree_gist requerida para constraints de exclusión temporal
      await dbClient.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');
      console.log(`[DB SETUP] Extensión btree_gist verificada en "${dbName}".`);

      // Otorgar permisos necesarios y suficientes en schema public
      await dbClient.query(`GRANT USAGE, CREATE ON SCHEMA public TO "${appUser}";`);
      await dbClient.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${appUser}";`);
      await dbClient.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${appUser}";`);
      await dbClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${appUser}";`);
      await dbClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${appUser}";`);
      console.log(`[DB SETUP] Permisos de esquema otorgados al usuario "${appUser}" en "${dbName}".`);
    } finally {
      await dbClient.end();
    }
  }

  console.log('[DB SETUP] Configuración local de base de datos finalizada exitosamente con privilegios mínimos.');
}

setup().catch((err) => {
  console.error('[DB SETUP ERROR] Falló la configuración de base de datos:', err.message);
  process.exit(1);
});

