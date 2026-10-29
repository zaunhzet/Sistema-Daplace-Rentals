import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app/app.js';
import { seedDatabase } from '../src/scripts/seed.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('BACKEND-003: Gastos Operativos, Sustentos y Trazabilidad Financiera', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: FastifyInstance;

  before(async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    process.env.API_HOST = '127.0.0.1';

    await safeResetTestDatabase(testDbUrl);
    db = createDatabase(testDbUrl);
    await db.check();
    await seedDatabase(db.prisma);

    app = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
    });
    await app.ready();
  });

  after(async () => {
    delete process.env.ENABLE_DEMO_AUTH_BYPASS;
    await app.close();
    await db.close();
  });

  describe('1. Registro y Validaciones de Gastos Operativos', () => {
    it('1.1. Crear gasto asociado a propiedad existente con persistencia y auditoría (Anexo A.2)', async () => {
      const payload = {
        propiedadId: 'prop-01',
        fechaGasto: '2026-10-15',
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Mantenimiento de cerradura electrónica',
        categoria: 'Mantenimiento',
        notas: 'Cambio de baterías y ajuste de cerrojo',
        monto: '120.50',
        moneda: 'PEN',
        pagadoPor: 'DAPLACE',
        repartido: 'Pendiente de liquidación',
        usoRucDaplace: true,
        idempotencyKey: 'idem-gas-001',
        sustentos: [
          {
            tipo: 'FACTURA',
            nombreArchivo: 'Factura-E001-4451.pdf',
            url: 'https://drive.google.com/file/d/test-file-01/view',
            origen: 'DRIVE',
          },
        ],
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload,
      });

      assert.equal(res.statusCode, 201);
      const { data } = res.json();
      assert.ok(data.id);
      assert.equal(data.propiedadId, 'prop-01');
      assert.equal(data.titulo, 'Mantenimiento de cerradura electrónica');
      assert.equal(data.monto, '120.50');
      assert.equal(data.moneda, 'PEN');
      assert.equal(data.periodoMes, 10);
      assert.equal(data.periodoAnio, 2026);
      assert.equal(data.pagadoPor, 'DAPLACE');
      assert.equal(data.usoRucDaplace, true);
      assert.equal(data.estado, 'REGISTRADO');
      assert.equal(data.sustentos.length, 1);
      assert.equal(data.sustentos[0].nombreArchivo, 'Factura-E001-4451.pdf');

      // Comprobar persistencia real en PostgreSQL
      const dbGasto = await db.prisma.gasto.findUnique({
        where: { id: data.id },
        include: { sustentos: true },
      });
      assert.ok(dbGasto);
      assert.equal(dbGasto.monto.toFixed(2), '120.50');
      assert.equal(dbGasto.sustentos.length, 1);

      // Comprobar auditoría atómica
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidad: 'Gasto', entidadId: data.id, accion: 'GASTO_REGISTRADO' },
      });
      assert.ok(audit, 'Debe existir auditoría de registro de gasto');
    });

    it('1.2. Rechazar propiedad inexistente con 404 NOT_FOUND', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-inexistente-999',
          fechaGasto: '2026-10-15',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Gasto en propiedad fantasma',
          categoria: 'Servicios',
          monto: '100.00',
          pagadoPor: 'DAPLACE',
        },
      });

      assert.equal(res.statusCode, 404);
      assert.equal(res.json().error.code, 'NOT_FOUND');
    });

    it('1.3. Rechazar importe negativo, cero o formato monetario inválido', async () => {
      // Importe negativo
      const resNeg = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-15',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Importe negativo',
          categoria: 'Varios',
          monto: '-50.00',
          pagadoPor: 'DAPLACE',
        },
      });
      assert.equal(resNeg.statusCode, 400);

      // Importe cero
      const resCero = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-15',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Importe cero',
          categoria: 'Varios',
          monto: '0.00',
          pagadoPor: 'DAPLACE',
        },
      });
      assert.equal(resCero.statusCode, 400);

      // Decimales excesivos
      const resDec = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-15',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Tres decimales',
          categoria: 'Varios',
          monto: '50.123',
          pagadoPor: 'DAPLACE',
        },
      });
      assert.equal(resDec.statusCode, 400);
    });

    it('1.4. Validar fecha real y rechazar fechas inválidas en calendario gregoriano', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-02-30', // 30 de febrero no existe
          periodoMes: 2,
          periodoAnio: 2026,
          titulo: 'Fecha inválida',
          categoria: 'Varios',
          monto: '80.00',
          pagadoPor: 'DAPLACE',
        },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    });

    it('1.5. Conservar fecha de comprobante y periodo declarado por separado', async () => {
      // Gasto emitido el 28 de octubre pero imputado al periodo de Noviembre 2026
      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-02',
          fechaGasto: '2026-10-28',
          periodoMes: 11,
          periodoAnio: 2026,
          titulo: 'Adelanto de servicio para noviembre',
          categoria: 'Servicios Básicos',
          monto: '200.00',
          pagadoPor: 'PROPIETARIO',
        },
      });

      assert.equal(res.statusCode, 201);
      const { data } = res.json();
      assert.equal(data.fechaGasto, '2026-10-28');
      assert.equal(data.periodoMes, 11);
      assert.equal(data.periodoAnio, 2026);
    });

    it('1.6. Registrar correctamente pagador', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-02',
          fechaGasto: '2026-10-18',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Compra de toallas premium',
          categoria: 'Lavandería y Blancos',
          monto: '180.00',
          pagadoPor: 'PROPIETARIO',
        },
      });

      assert.equal(res.statusCode, 201);
      assert.equal(res.json().data.pagadoPor, 'PROPIETARIO');
    });

    it('1.7. Mantener campo "Repartido" sin cálculos inferidos ni suposiciones', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-03',
          fechaGasto: '2026-10-20',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Reparación de tubería compartida',
          categoria: 'Mantenimiento',
          monto: '350.00',
          pagadoPor: 'DAPLACE',
          repartido: '50% propietario / 50% edificio pendiente de cobro',
        },
      });

      assert.equal(res.statusCode, 201);
      assert.equal(res.json().data.repartido, '50% propietario / 50% edificio pendiente de cobro');
      assert.equal(res.json().data.monto, '350.00'); // Monto no se dividió artificialmente
    });

    it('1.8. Registrar uso del RUC en valores Sí (true), No (false) y Sin información (null)', async () => {
      // Caso Sí (true)
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-21',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Compra con RUC DAPLACE',
          categoria: 'Suministros',
          monto: '95.00',
          pagadoPor: 'DAPLACE',
          usoRucDaplace: true,
        },
      });
      assert.equal(res1.statusCode, 201);
      assert.equal(res1.json().data.usoRucDaplace, true);

      // Caso No (false)
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-21',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Compra personal sin RUC',
          categoria: 'Suministros',
          monto: '30.00',
          pagadoPor: 'OPERADOR',
          usoRucDaplace: false,
        },
      });
      assert.equal(res2.statusCode, 201);
      assert.equal(res2.json().data.usoRucDaplace, false);

      // Caso Sin información (null)
      const res3 = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-21',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Compra sin dato de RUC',
          categoria: 'Suministros',
          monto: '40.00',
          pagadoPor: 'DAPLACE',
          usoRucDaplace: null,
        },
      });
      assert.equal(res3.statusCode, 201);
      assert.equal(res3.json().data.usoRucDaplace, null);
    });

    it('1.9. Rechazar monedas distintas de PEN (Hito 4)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-21',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Intento de gasto en dólares',
          categoria: 'Servicios',
          monto: '100.00',
          moneda: 'USD',
          pagadoPor: 'DAPLACE',
        },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'CURRENCY_NOT_SUPPORTED');
    });
  });

  describe('2. Sustentos y Evidencias Documentales', () => {
    let gastoIdParaSustentos: string;

    before(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-02',
          fechaGasto: '2026-10-22',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Gasto base para sustentos múltiples',
          categoria: 'Mantenimiento',
          monto: '250.00',
          pagadoPor: 'DAPLACE',
        },
      });
      gastoIdParaSustentos = res.json().data.id;
    });

    it('2.1. Vincular varios sustentos a un mismo gasto preservando URL y origen', async () => {
      // Primer sustento: Google Drive
      const res1 = await app.inject({
        method: 'POST',
        url: `/api/gastos/${gastoIdParaSustentos}/sustentos`,
        payload: {
          tipo: 'FACTURA',
          nombreArchivo: 'Factura-Gasfiteria-001.pdf',
          url: 'https://drive.google.com/file/d/gasfiteria-01/view',
          origen: 'DRIVE',
        },
      });
      assert.equal(res1.statusCode, 201);
      assert.ok(res1.json().data.id);

      // Segundo sustento: Comprobante bancario
      const res2 = await app.inject({
        method: 'POST',
        url: `/api/gastos/${gastoIdParaSustentos}/sustentos`,
        payload: {
          tipo: 'VOUCHER',
          nombreArchivo: 'Voucher-Transferencia-BCP.jpg',
          url: 'https://drive.google.com/file/d/bcp-voucher-02/view',
          origen: 'DRIVE',
        },
      });
      assert.equal(res2.statusCode, 201);

      // Consultar lista de sustentos
      const resLista = await app.inject({
        method: 'GET',
        url: `/api/gastos/${gastoIdParaSustentos}/sustentos`,
      });
      assert.equal(resLista.statusCode, 200);
      assert.equal(resLista.json().data.length, 2);
    });

    it('2.2. Rechazar URL inválida o no soportada (400)', async () => {
      const resNoUrl = await app.inject({
        method: 'POST',
        url: `/api/gastos/${gastoIdParaSustentos}/sustentos`,
        payload: {
          nombreArchivo: 'Archivo.pdf',
          url: 'not-a-valid-url-format',
        },
      });
      assert.equal(resNoUrl.statusCode, 400);
      assert.equal(resNoUrl.json().error.code, 'VALIDATION_ERROR');

      const resFtp = await app.inject({
        method: 'POST',
        url: `/api/gastos/${gastoIdParaSustentos}/sustentos`,
        payload: {
          nombreArchivo: 'Archivo.pdf',
          url: 'ftp://ftp.example.com/file.pdf',
        },
      });
      assert.equal(resFtp.statusCode, 400);
    });

    it('2.3. Desvincular sustento con preservación de trazabilidad en auditoría', async () => {
      // Obtener un sustento existente
      const resLista = await app.inject({
        method: 'GET',
        url: `/api/gastos/${gastoIdParaSustentos}/sustentos`,
      });
      const sustentoId = resLista.json().data[0].id;

      const resDel = await app.inject({
        method: 'DELETE',
        url: `/api/gastos/${gastoIdParaSustentos}/sustentos/${sustentoId}`,
      });
      assert.equal(resDel.statusCode, 200);

      // Verificar en BD que se eliminó el vínculo
      const checkDb = await db.prisma.sustentoGasto.findUnique({ where: { id: sustentoId } });
      assert.equal(checkDb, null);

      // Verificar evento de auditoría SUSTENTO_ELIMINADO
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: {
          entidad: 'Gasto',
          entidadId: gastoIdParaSustentos,
          accion: 'SUSTENTO_ELIMINADO',
        },
      });
      assert.ok(audit, 'Debe registrarse auditoría de desvinculación');
    });
  });

  describe('3. Consultas, Filtros, Edición y Anulación Justificada', () => {
    it('3.1. Consultar gastos filtrados por propiedad y periodo', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/gastos?propiedadId=prop-01&mes=10&anio=2026',
      });

      assert.equal(res.statusCode, 200);
      const { data } = res.json();
      assert.ok(Array.isArray(data));
      for (const item of data) {
        assert.equal(item.propiedadId, 'prop-01');
        assert.equal(item.periodoMes, 10);
        assert.equal(item.periodoAnio, 2026);
      }
    });

    it('3.2. Modificar gasto con auditoría de valores anteriores y nuevos', async () => {
      // Crear gasto
      const reg = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-03',
          fechaGasto: '2026-10-23',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Compra inicial de lámpara',
          categoria: 'Muebles',
          monto: '150.00',
          pagadoPor: 'DAPLACE',
        },
      });
      const gastoId = reg.json().data.id;

      // Actualizar título y monto
      const resUpdate = await app.inject({
        method: 'PATCH',
        url: `/api/gastos/${gastoId}`,
        payload: {
          titulo: 'Lámpara de pie para sala principal',
          monto: '175.00',
          notas: 'Ajuste de precio según factura final',
        },
      });

      assert.equal(resUpdate.statusCode, 200);
      const { data } = resUpdate.json();
      assert.equal(data.titulo, 'Lámpara de pie para sala principal');
      assert.equal(data.monto, '175.00');
      assert.equal(data.notas, 'Ajuste de precio según factura final');

      // Validar evento de auditoría GASTO_ACTUALIZADO
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidad: 'Gasto', entidadId: gastoId, accion: 'GASTO_ACTUALIZADO' },
      });
      assert.ok(audit);
      const detalles = audit.detalles as any;
      assert.equal(detalles.valoresAnteriores.monto, '150.00');
      assert.equal(detalles.valoresNuevos.monto, '175.00');
    });

    it('3.3. Anular gasto conservando historial y bloquear posteriores modificaciones', async () => {
      const reg = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-03',
          fechaGasto: '2026-10-24',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Gasto que será anulado',
          categoria: 'Varios',
          monto: '85.00',
          pagadoPor: 'OPERADOR',
        },
      });
      const gastoId = reg.json().data.id;

      // Anulación sin motivo: 400
      const resNoMotivo = await app.inject({
        method: 'POST',
        url: `/api/gastos/${gastoId}/anular`,
        payload: { motivo: '' },
      });
      assert.equal(resNoMotivo.statusCode, 400);

      // Anulación formal con motivo
      const resAnular = await app.inject({
        method: 'POST',
        url: `/api/gastos/${gastoId}/anular`,
        payload: { motivo: 'Comprobante emitido con RUC equivocado por el proveedor' },
      });
      assert.equal(resAnular.statusCode, 200);
      assert.equal(resAnular.json().data.estado, 'ANULADO');
      assert.equal(resAnular.json().data.motivoAnulacion, 'Comprobante emitido con RUC equivocado por el proveedor');

      // Reintento de anulación es idempotente (200)
      const resReanular = await app.inject({
        method: 'POST',
        url: `/api/gastos/${gastoId}/anular`,
        payload: { motivo: 'Comprobante emitido con RUC equivocado' },
      });
      assert.equal(resReanular.statusCode, 200);
      assert.equal(resReanular.json().idempotentReplay, true);

      // Comprobar que NO fue eliminado físicamente
      const enDb = await db.prisma.gasto.findUnique({ where: { id: gastoId } });
      assert.ok(enDb);
      assert.equal(enDb.estado, 'ANULADO');

      // Intento de modificar gasto anulado debe fallar con 409 Conflict
      const resFailPatch = await app.inject({
        method: 'PATCH',
        url: `/api/gastos/${gastoId}`,
        payload: { titulo: 'Intento de cambio en gasto anulado' },
      });
      assert.equal(resFailPatch.statusCode, 409);
      assert.equal(resFailPatch.json().error.code, 'INVALID_STATE_TRANSITION');
    });

    it('3.4. Reintentar creación con misma clave de idempotencia no duplica registros', async () => {
      const payload = {
        propiedadId: 'prop-01',
        fechaGasto: '2026-10-25',
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Compra con clave idempotente',
        categoria: 'Mantenimiento',
        monto: '110.00',
        pagadoPor: 'DAPLACE',
        idempotencyKey: 'idem-gas-repeat-test',
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload,
      });
      assert.equal(res1.statusCode, 201);
      const firstId = res1.json().data.id;

      // Reintento idéntico
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload,
      });
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.json().data.id, firstId);
      assert.equal(res2.json().idempotentReplay, true);

      // Reintento con clave igual pero monto alterado -> 409
      const resConflict = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          ...payload,
          monto: '190.00',
        },
      });
      assert.equal(resConflict.statusCode, 409);
      assert.equal(resConflict.json().error.code, 'IDEMPOTENCY_CONFLICT');

      // Cantidad en PostgreSQL: exactamente 1
      const count = await db.prisma.gasto.count({ where: { idempotencyKey: 'idem-gas-repeat-test' } });
      assert.equal(count, 1);
    });

    it('3.5. Detectar conflicto 409 cuando se reutiliza clave alterando campos antes omitidos (notas, repartido, usoRucDaplace, sustentos)', async () => {
      const basePayload = {
        propiedadId: 'prop-02',
        fechaGasto: '2026-10-27',
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Servicio técnico de calefón',
        categoria: 'Reparaciones y Cerrajería',
        monto: '240.00',
        pagadoPor: 'DAPLACE',
        notas: 'Primera revisión técnica',
        repartido: '50% propietario',
        usoRucDaplace: true,
        idempotencyKey: 'idem-gas-extended-fields',
        sustentos: [
          {
            nombreArchivo: 'recibo-calefon.pdf',
            url: 'https://storage.daplace.com/recibo-calefon.pdf',
          },
        ],
      };

      // 1. Registro inicial exitoso
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: basePayload,
      });
      assert.equal(res1.statusCode, 201);
      const originalId = res1.json().data.id;

      // 2. Reintento idéntico -> 200 idempotente
      const resReplay = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: basePayload,
      });
      assert.equal(resReplay.statusCode, 200);
      assert.equal(resReplay.json().data.id, originalId);
      assert.equal(resReplay.json().idempotentReplay, true);

      // 3. Alteración en "notas" -> 409
      const resNotasConflict = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: { ...basePayload, notas: 'Segunda revisión técnica diferente' },
      });
      assert.equal(resNotasConflict.statusCode, 409);
      assert.equal(resNotasConflict.json().error.code, 'IDEMPOTENCY_CONFLICT');

      // 4. Alteración en "repartido" -> 409
      const resRepartidoConflict = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: { ...basePayload, repartido: '100% daplace' },
      });
      assert.equal(resRepartidoConflict.statusCode, 409);
      assert.equal(resRepartidoConflict.json().error.code, 'IDEMPOTENCY_CONFLICT');

      // 5. Alteración en "usoRucDaplace" (true -> false) -> 409
      const resRucConflict = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: { ...basePayload, usoRucDaplace: false },
      });
      assert.equal(resRucConflict.statusCode, 409);
      assert.equal(resRucConflict.json().error.code, 'IDEMPOTENCY_CONFLICT');

      // 6. Alteración en "sustentos" (url distinta) -> 409
      const resSustentoConflict = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          ...basePayload,
          sustentos: [
            {
              nombreArchivo: 'recibo-calefon.pdf',
              url: 'https://storage.daplace.com/recibo-calefon-modificado.pdf',
            },
          ],
        },
      });
      assert.equal(resSustentoConflict.statusCode, 409);
      assert.equal(resSustentoConflict.json().error.code, 'IDEMPOTENCY_CONFLICT');
    });

    it('3.6. Persistencia histórica del hash: ediciones posteriores (PATCH) no alteran la verificación del request original', async () => {
      const payload = {
        propiedadId: 'prop-01',
        fechaGasto: '2026-10-28',
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Compra inicial de focos LED',
        categoria: 'Suministros y Amenities',
        monto: '65.00',
        pagadoPor: 'OPERADOR',
        notas: 'Nota original al crear',
        idempotencyKey: 'idem-gas-patch-history',
      };

      const resCreate = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload,
      });
      assert.equal(resCreate.statusCode, 201);
      const gastoId = resCreate.json().data.id;

      // Se modifica el gasto mediante PATCH
      const resPatch = await app.inject({
        method: 'PATCH',
        url: `/api/gastos/${gastoId}`,
        payload: {
          titulo: 'Compra modificada de focos LED inteligentes',
          monto: '85.00',
          notas: 'Nota actualizada posterior a la compra',
        },
      });
      assert.equal(resPatch.statusCode, 200);
      assert.equal(resPatch.json().data.monto, '85.00');

      // Reenvío de la solicitud original de creación con el payload original:
      // Debe responder 200 con el gasto existente porque el payloadHash original está protegido
      const resReplayOriginal = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload,
      });
      assert.equal(resReplayOriginal.statusCode, 200);
      assert.equal(resReplayOriginal.json().idempotentReplay, true);
      assert.equal(resReplayOriginal.json().data.id, gastoId);
    });

    it('3.7. Concurrencia real sobre PostgreSQL: solicitudes simultáneas con la misma clave resuelven atómicamente', async () => {
      const payloadIdentico = {
        propiedadId: 'prop-03',
        fechaGasto: '2026-10-29',
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Gasto concurrente idéntico',
        categoria: 'Limpieza',
        monto: '95.00',
        pagadoPor: 'DAPLACE',
        idempotencyKey: 'idem-gas-concurrent-same',
      };

      // Disparar 3 solicitudes concurrentes con el mismo payload
      const [resA, resB, resC] = await Promise.all([
        app.inject({ method: 'POST', url: '/api/gastos', payload: payloadIdentico }),
        app.inject({ method: 'POST', url: '/api/gastos', payload: payloadIdentico }),
        app.inject({ method: 'POST', url: '/api/gastos', payload: payloadIdentico }),
      ]);

      const statusCodes = [resA.statusCode, resB.statusCode, resC.statusCode];
      // Exactamente una debe ser 201 y las otras 200 con idempotentReplay, ninguna debe fallar con 500
      assert.ok(statusCodes.includes(201), 'Una de las solicitudes concurrentes debió ser 201 Created');
      const count200 = statusCodes.filter((s) => s === 200).length;
      const count201 = statusCodes.filter((s) => s === 201).length;
      assert.equal(count201, 1);
      assert.equal(count200, 2);

      // Disparar solicitudes concurrentes con distinto payload bajo la misma clave
      const keyDistinta = 'idem-gas-concurrent-diff';
      const [resDiff1, resDiff2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/gastos',
          payload: { ...payloadIdentico, idempotencyKey: keyDistinta, monto: '100.00' },
        }),
        app.inject({
          method: 'POST',
          url: '/api/gastos',
          payload: { ...payloadIdentico, idempotencyKey: keyDistinta, monto: '200.00' },
        }),
      ]);

      const diffCodes = [resDiff1.statusCode, resDiff2.statusCode].sort();
      // Una solicitud crea el recurso (201) y la perdedora con payload diferente recibe 409
      assert.deepEqual(diffCodes, [201, 409]);
    });
  });

  describe('4. Integridad Transaccional, Separación Contable y Seguridad', () => {
    it('4.1. Separación de fondos: el registro de gastos NO altera pagos conciliados ni saldos de reserva', async () => {
      // res-01 tiene 700 conciliados y saldoPendiente 700
      const resAntes = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-01/resumen-financiero',
      });
      const resumenAntes = resAntes.json().data;

      // Registrar 3 gastos para la propiedad de res-01 (prop-01)
      await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-26',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Gasto operativo para probar aislamiento contable',
          categoria: 'Mantenimiento',
          monto: '500.00',
          pagadoPor: 'DAPLACE',
        },
      });

      const resDespues = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-01/resumen-financiero',
      });
      const resumenDespues = resDespues.json().data;

      // Invariante innegociable: Alquiler intacto
      assert.equal(resumenDespues.totalPagosConciliados, resumenAntes.totalPagosConciliados);
      assert.equal(resumenDespues.saldoPendiente, resumenAntes.saldoPendiente);
    });

    it('4.2. Separación de fondos: el registro de gastos NO altera saldos de garantías en custodia', async () => {
      const resGarAntes = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-01/garantia',
      });
      const garantiaAntes = resGarAntes.json().data;

      // Registrar gasto
      await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-01',
          fechaGasto: '2026-10-26',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Otro gasto operativo',
          categoria: 'Limpieza',
          monto: '150.00',
          pagadoPor: 'DAPLACE',
        },
      });

      const resGarDespues = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-01/garantia',
      });
      const garantiaDespues = resGarDespues.json().data;

      // Invariante innegociable: Custodia intacta
      assert.equal(garantiaDespues.saldoDisponible, garantiaAntes.saldoDisponible);
      assert.equal(garantiaDespues.totalRetenido, garantiaAntes.totalRetenido);
    });

    it('4.3. Rechazar solicitudes sin autenticación (401)', async () => {
      process.env.ENABLE_DEMO_AUTH_BYPASS = 'false';

      const res = await app.inject({
        method: 'GET',
        url: '/api/gastos',
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error.code, 'UNAUTHORIZED');

      process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    });

    it('4.4. Rechazar rol PROPIETARIO en rutas administrativas de gastos (403)', async () => {
      const customApp = buildApp({
        prisma: db.prisma,
        checkDatabase: db.check,
      });

      customApp.addHook('preHandler', async (req) => {
        req.user = {
          id: 'usr-102',
          nombre: 'Carlos Méndez',
          email: 'carlos.mendez@propietarios.example.invalid',
          rol: 'PROPIETARIO',
        };
      });

      await customApp.ready();

      const res = await customApp.inject({
        method: 'GET',
        url: '/api/gastos',
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().error.code, 'FORBIDDEN');

      await customApp.close();
    });

    it('4.5. Confirmar persistencia de gastos tras reinicio del servidor API', async () => {
      // Registrar un gasto para verificar persistencia tras restart
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/gastos',
        payload: {
          propiedadId: 'prop-02',
          fechaGasto: '2026-10-27',
          periodoMes: 10,
          periodoAnio: 2026,
          titulo: 'Gasto para probar reinicio de API',
          categoria: 'Administración',
          monto: '65.00',
          pagadoPor: 'DAPLACE',
        },
      });
      const gastoId = createRes.json().data.id;

      // Reiniciar la instancia de Fastify
      await app.close();

      const newApp = buildApp({
        prisma: db.prisma,
        checkDatabase: db.check,
      });
      await newApp.ready();

      const fetchRes = await newApp.inject({
        method: 'GET',
        url: `/api/gastos/${gastoId}`,
      });
      assert.equal(fetchRes.statusCode, 200);
      assert.equal(fetchRes.json().data.id, gastoId);
      assert.equal(fetchRes.json().data.monto, '65.00');

      await newApp.close();

      // Restaurar app para el hook after()
      app = buildApp({
        prisma: db.prisma,
        checkDatabase: db.check,
      });
      await app.ready();
    });
  });
});
