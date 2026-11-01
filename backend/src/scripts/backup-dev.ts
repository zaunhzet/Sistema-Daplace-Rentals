import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function createLocalBackup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL no está definida en .env');
  }

  const parsed = new URL(dbUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())) {
    throw new Error(`Seguridad: solo se permite respaldar bases locales. Host encontrado: ${parsed.hostname}`);
  }

  const backupDir = fileURLToPath(new URL('../../../database/backups', import.meta.url));
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `daplace_dev_backup_${timestamp}.sql`);

  const pgDumpCandidates = [
    'pg_dump',
    'C:\\Program Files\\PostgreSQL\\18\\pgAdmin 4\\runtime\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
  ];

  let pgDumpBin: string | null = null;
  for (const candidate of pgDumpCandidates) {
    try {
      if (candidate === 'pg_dump') {
        execFileSync('where.exe', ['pg_dump'], { stdio: 'ignore' });
        pgDumpBin = 'pg_dump';
        break;
      } else if (fs.existsSync(candidate)) {
        pgDumpBin = candidate;
        break;
      }
    } catch {
      // continuar buscando
    }
  }

  if (!pgDumpBin) {
    throw new Error('No se encontró el ejecutable pg_dump en el sistema.');
  }

  // pg_dump no acepta el parámetro ?schema=public propio de Prisma en la URI
  const cleanUrl = new URL(dbUrl);
  cleanUrl.searchParams.delete('schema');

  console.log(`[BACKUP] Ejecutando respaldo con ${pgDumpBin}...`);
  execFileSync(pgDumpBin, ['--dbname', cleanUrl.toString(), '--format=plain', '--file', backupFile], {
    stdio: 'inherit',
  });

  const stats = fs.statSync(backupFile);
  console.log(`[BACKUP] Respaldo completado con éxito: ${backupFile} (${stats.size} bytes).`);
  return { backupFile, sizeBytes: stats.size };
}

createLocalBackup().catch((err: Error) => {
  console.error('[BACKUP ERROR]:', err.message);
  process.exit(1);
});
