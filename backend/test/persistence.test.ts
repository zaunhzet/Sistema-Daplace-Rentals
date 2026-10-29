import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { safeResetDatabase, validateResetTarget } from '../src/scripts/reset.js';
import { seedDatabase } from '../src/scripts/seed.js';
import { recordAuditEvent } from '../src/shared/audit.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('Hito 1 — PostgreSQL, Prisma, Persistencia Real y Seguridad de Entorno', () => {
  let db: ReturnType<typeof createDatabase>;

  before(async () => {
    await safeResetTestDatabase(testDbUrl);
    db = createDatabase(testDbUrl);
    await db.check();
    await seedDatabase(db.prisma);
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
    await seedDatabase(db.prisma);

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
    await seedDatabase(db.prisma);
    const count = await db.prisma.propiedad.count();
    assert.equal(count, 5, 'El número de propiedades no debe duplicarse');
  });

  it('4. Protección contra destrucción accidental de bases de datos', async () => {
    // A. Rechazar intento de test sobre daplace_dev
    assert.throws(
      () => {
        validateResetTarget('postgresql://daplace:pass@127.0.0.1:5432/daplace_dev', 'test');
      },
      /Las suites de prueba solo pueden operar y limpiar "daplace_test"/i
    );

    // B. Rechazar bases en hosts remotos
    assert.throws(
      () => {
        validateResetTarget('postgresql://daplace:pass@db.production-server.com:5432/daplace_test', 'test');
      },
      /no es una base local permitida/i
    );

    // C. Rechazar bases de datos no autorizadas (ej. bases de producción u otros proyectos)
    assert.throws(
      () => {
        validateResetTarget('postgresql://daplace:pass@localhost:5432/sistemagi_db', 'dev');
      },
      /no está autorizada para reset/i
    );

    // D. Exigir confirmación explícita para reset en desarrollo
    assert.throws(
      () => {
        validateResetTarget('postgresql://daplace:pass@localhost:5432/daplace_dev', 'dev', false);
      },
      /El comando requiere confirmación explícita/i
    );
  });

  it('5. Atomicidad transaccional: rollback garantizado ante fallo de auditoría', async () => {
    const testPropId = 'prop-rollback-test';

    // Intentar crear una propiedad donde el registro de auditoría falla deliberadamente
    await assert.rejects(
      async () => {
        await db.prisma.$transaction(async (tx) => {
          await tx.propiedad.create({
            data: {
              id: testPropId,
              nombre: 'Propiedad Rollback Test',
              propietarioId: 'usr-102',
              direccion: 'Calle Test 123',
              estadoOperativo: 'OPERATIVA',
              estadoPublicacion: 'BORRADOR',
              capacidadHuespedes: 2,
              precioBaseNoche: 100,
              moneda: 'PEN',
            },
          });

          // Forzar fallo de auditoría pasando actor vacío
          await recordAuditEvent(tx, {
            entidad: 'Propiedad',
            entidadId: testPropId,
            accion: 'CREAR_PROPIEDAD',
            actor: '', // Actor inválido: dispara error y aborta la transacción
          });
        });
      },
      /Toda acción auditable requiere un actor identificado/i
    );

    // Verificar que la propiedad NO fue persistida en la base de datos (rollback exitoso)
    const found = await db.prisma.propiedad.findUnique({ where: { id: testPropId } });
    assert.equal(found, null, 'La propiedad no debe persistir si la auditoría falla');
  });
});
