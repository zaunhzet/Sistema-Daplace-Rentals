import pg from 'pg';
const { Client } = pg;

async function setup() {
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  await client.connect();

  const roleRes = await client.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'daplace'");
  if (roleRes.rowCount === 0) {
    await client.query("CREATE ROLE daplace WITH LOGIN SUPERUSER PASSWORD 'daplace_local_only'");
    console.log('Role daplace created.');
  } else {
    console.log('Role daplace already exists.');
  }

  for (const dbName of ['daplace_dev', 'daplace_test']) {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${dbName} OWNER daplace`);
      console.log(`Database ${dbName} created with owner daplace.`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }
  }

  await client.end();

  // Also ensure btree_gist extension on daplace_dev and daplace_test
  for (const dbName of ['daplace_dev', 'daplace_test']) {
    const dbClient = new Client({
      host: '127.0.0.1',
      port: 5432,
      user: 'daplace',
      password: 'daplace_local_only',
      database: dbName,
    });
    await dbClient.connect();
    await dbClient.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');
    console.log(`btree_gist extension ensured on ${dbName}.`);
    await dbClient.end();
  }

  console.log('Setup finished successfully!');
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
