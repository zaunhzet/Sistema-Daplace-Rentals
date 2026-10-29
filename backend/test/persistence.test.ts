import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/shared/database.js';
import { safeResetDatabase } from '../src/scripts/reset.js';
import { seedDatabase } from '../src/scripts/seed.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const testDbUrl = process.env.DATABASE_TEST_URL || process.env.DATABASE_URL;

describe('Hito 1 — PostgreSQL, Prisma y Persistencia Real', () => {
  let db: ReturnType<typeof createDatabase>;

  before(async () => {
    assert.ok(testDbUrl, 'DATABASE_URL o DATABASE_TEST_URL debe estar configurada');
    db = createDatabase(testDbUrl);
    await db.check();
  });

  after(async () => {
    await db.close();
  });

  it('1. Conexión real con PostgreSQL y verificación de extensiones', async () => {
    const res = await db.prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist';
    `;
    assert.ok(res.length > 0, 'La extensión btree_gist debe estar instalada para constraints de exclusión');
  });

  it('2. Persistencia y lectura de datos sintéticos (Seed)', async () => {
    // Asegurar que hay datos del seed
    await seedDatabase();

    const usuarios = await db.prisma.usuario.findMany();
    const propiedades = await db.prisma.propiedad.findMany({ include: { propietario: true } });
    const huespedes = await db.prisma.huesped.findMany();
    const reservas = await db.prisma.reserva.findMany({ include: { propiedad: true, huesped: true } });

    assert.ok(usuarios.length >= 6, 'Debe haber al menos 6 usuarios registrados');
    assert.ok(propiedades.length >= 5, 'Debe haber al menos 5 propiedades registradas');
    assert.ok(huespedes.length >= 4, 'Debe haber al menos 4 huéspedes registrados');
    assert.ok(reservas.length >= 6, 'Debe haber al menos 6 reservas registradas');

    // Verificar relaciones integridad
    const prop1 = propiedades.find((p) => p.id === 'prop-01');
    assert.ok(prop1, 'prop-01 debe existir');
    assert.equal(prop1.propietario.nombre, 'Carlos Eduardo Méndez');

    // Verificar precisión decimal exacta
    assert.equal(Number(prop1.precioBaseNoche), 280.0);
  });

  it('3. Idempotencia del seed sintético', async () => {
    // Correr de nuevo el seed no debe duplicar ni fallar
    await seedDatabase();
    const count = await db.prisma.propiedad.count();
    assert.equal(count, 5, 'El número de propiedades no debe duplicarse');
  });

  it('4. Protección de reset seguro contra operaciones no autorizadas', async () => {
    await assert.rejects(
      async () => {
        // Sin confirmar explícitamente debe fallar
        await safeResetDatabase({ forceConfirm: false });
      },
      /confirmación explícita/i
    );
  });
});
