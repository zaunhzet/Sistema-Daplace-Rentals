import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  reservationService,
  MockReservationService,
  ApiReservationService,
} from '../src/features/reservations';
import { ApiError } from '../src/shared/api/client';
import {
  createModalLoadCoordinator,
  evaluateDirectCannotConfirm,
} from '../src/features/reservations/components/ReservationDetailModal';

describe('DR-02: Contratos de Reserva y Requisitos de Confirmación — Tests Frontend', () => {
  beforeEach(() => {
    reservationService.reset();
  });

  it('27. Visualización correcta de contratos: distingue REFERENCIADA de VALIDADA y asigna versiones correlativas', async () => {
    const mockService = new MockReservationService();

    // 1) Contrato histórico ya validado en res-03
    const existingContracts = await mockService.getContracts('res-03');
    assert.equal(existingContracts.length, 1);
    assert.equal(existingContracts[0].version, 1);
    assert.equal(existingContracts[0].estadoFirma, 'VALIDADA');

    // 2) Registrar nueva versión de contrato para res-03
    const newVersion = await mockService.createContract('res-03', {
      nombreOriginal: 'adenda_contrato_res03_v2.pdf',
      urlReferencia: 'https://docs.daplace.internal/contracts/res-03/v2.pdf',
    });

    assert.equal(newVersion.version, 2);
    // Toda nueva versión empieza obligatoriamente como REFERENCIADA
    assert.equal(newVersion.estadoFirma, 'REFERENCIADA');
    assert.equal(newVersion.nombreOriginal, 'adenda_contrato_res03_v2.pdf');

    // 3) Cliente intenta enviar VALIDADA directamente y el servicio lo rechaza
    await assert.rejects(
      async () => {
        await mockService.createContract('res-03', {
          nombreOriginal: 'intento_validado_tramposo.pdf',
          estadoFirma: 'VALIDADA' as any,
        });
      },
      (err: any) => err.message.includes('No se permite establecer el estado de validación')
    );

    // 4) Verificar listado con ambas versiones
    const all = await mockService.getContracts('res-03');
    assert.equal(all.length, 2);
    assert.equal(all[0].estadoFirma, 'VALIDADA');
    assert.equal(all[1].estadoFirma, 'REFERENCIADA');
  });

  it('28. Consulta estructurada de requisitos de confirmación según Adenda DR-02', async () => {
    const mockService = new MockReservationService();

    const resDirecta = await mockService.createReservation({
      propiedadId: 'prop-01',
      huespedId: 'hue-01',
      ingreso: '2026-12-26',
      salida: '2026-12-30',
      montoAcordado: 1000,
      moneda: 'PEN',
      origen: 'DIRECTO',
    });

    // Consulta de requisitos para solicitud directa sin contrato validado ni voucher revisado
    const req = await mockService.getConfirmationRequirements(resDirecta.id);
    assert.equal(req.puedeConfirmar, false);
    assert.equal(req.requisitos.contratoFirmado, false);
    assert.equal(req.requisitos.politicaAdelantoDefinida, false);
    assert.ok(req.motivosPendientes.includes('CONTRATO_NO_VALIDADO'));
    assert.ok(req.motivosPendientes.includes('POLITICA_ADELANTO_PENDIENTE'));

    // Conciliación bancaria es reportada de forma informativa para tesorería
    assert.equal(typeof req.requisitos.adelantoConciliado, 'boolean');
  });

  it('29. Confirmación rechazada no modifica la reserva a CONFIRMADA en la interfaz', async () => {
    const mockService = new MockReservationService();

    const resDirecta = await mockService.createReservation({
      propiedadId: 'prop-01',
      huespedId: 'hue-01',
      ingreso: '2026-12-26',
      salida: '2026-12-30',
      montoAcordado: 1000,
      moneda: 'PEN',
      origen: 'DIRECTO',
    });

    // Intentar confirmar reserva DIRECTO sin cumplir requisitos
    await assert.rejects(
      async () => {
        await mockService.confirmReservation(resDirecta.id);
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'REQUIREMENTS_NOT_MET');
        assert.ok(err.details?.motivosPendientes?.length > 0);
        return true;
      }
    );

    // Verificar que en el almacén de datos la reserva conserva su estado SOLICITADA
    const resAfter = await mockService.getReservationById(resDirecta.id);
    assert.ok(resAfter);
    assert.equal(resAfter.estado, 'SOLICITADA', 'El estado debe permanecer SOLICITADA tras confirmación fallida');
  });

  it('30. Cliente HTTP ApiReservationService propaga errores 409 y parámetros estructurados', async () => {
    const apiService = new ApiReservationService();

    const originalFetch = globalThis.fetch;
    try {
      // Mock de fetch para simular respuesta 409 REQUIREMENTS_NOT_MET del backend
      globalThis.fetch = async (input: any, init?: any) => {
        const url = String(input);
        if (url.includes('/confirmar')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'REQUIREMENTS_NOT_MET',
                message: 'La reserva directa no cumple con los requisitos obligatorios para confirmación.',
                details: {
                  motivosPendientes: ['CONTRATO_NO_VALIDADO', 'EVIDENCIA_NO_REVISADA'],
                },
              },
            }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        if (url.includes('/requisitos-confirmacion')) {
          return new Response(
            JSON.stringify({
              data: {
                reservaId: 'res-directa-01',
                puedeConfirmar: false,
                requisitos: {
                  reservaApta: true,
                  contratoFirmado: false,
                  pagoRegistrado: true,
                  evidenciaAdelanto: true,
                  evidenciaRevisada: false,
                  adelantoCubierto: false,
                  adelantoConciliado: false,
                  politicaAdelantoDefinida: true,
                  disponibilidadValida: true,
                },
                motivosPendientes: ['CONTRATO_NO_VALIDADO', 'EVIDENCIA_NO_REVISADA'],
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return originalFetch(input, init);
      };

      // 1) Test de propagación de consulta de requisitos (sin parámetros de política del cliente)
      const req = await apiService.getConfirmationRequirements('res-directa-01');
      assert.equal(req.puedeConfirmar, false);
      assert.equal(req.requisitos.contratoFirmado, false);
      assert.equal(req.requisitos.evidenciaRevisada, false);

      // 2) Test de propagación de error 409 en confirmación
      await assert.rejects(
        async () => {
          await apiService.confirmReservation('res-directa-01');
        },
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.statusCode, 409);
          assert.equal(err.code, 'REQUIREMENTS_NOT_MET');
          assert.ok(err.details?.motivosPendientes?.includes('CONTRATO_NO_VALIDADO'));
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('31. DR02-05: Mock sin pagos ficticios — contrato validado sin pago explícito nunca acredita adelanto', async () => {
    const mockService = new MockReservationService();

    const resDirecta = await mockService.createReservation({
      propiedadId: 'prop-01',
      huespedId: 'hue-01',
      ingreso: '2026-12-26',
      salida: '2026-12-30',
      montoAcordado: 1000,
      moneda: 'PEN',
      origen: 'DIRECTO',
    });

    // Agregar contrato VALIDADO directamente en el mock
    const contrato = await mockService.createContract(resDirecta.id, {
      nombreOriginal: 'contrato_firmado.pdf',
    });
    // Simular que el contrato fue validado documentalmente en el mock
    const internalContracts = (mockService as any).contracts.get(resDirecta.id);
    internalContracts[0].estadoFirma = 'VALIDADA';

    // Sin pagos sintéticos explícitos agregados
    const reqSinPagos = await mockService.getConfirmationRequirements(resDirecta.id);
    assert.equal(reqSinPagos.puedeConfirmar, false);
    assert.equal(reqSinPagos.requisitos.contratoFirmado, true);
    assert.equal(reqSinPagos.requisitos.pagoRegistrado, false);
    assert.equal(reqSinPagos.requisitos.adelantoCubierto, false);
    assert.equal(reqSinPagos.detalles.totalPagado, '0.00', 'No debe fabricar pagos basados en contratos');
    assert.ok(reqSinPagos.motivosPendientes.includes('PAGO_ADELANTO_FALTANTE'));

    // Con fixture de pago RECHAZADO explícito
    mockService.setMockPayments(resDirecta.id, [
      {
        id: 'pago-rechazado-01',
        reservaId: resDirecta.id,
        monto: 500,
        moneda: 'PEN',
        estado: 'RECHAZADO',
        voucherEstado: 'VALIDADA',
      },
    ]);

    const reqConRechazado = await mockService.getConfirmationRequirements(resDirecta.id);
    assert.equal(reqConRechazado.puedeConfirmar, false);
    assert.equal(reqConRechazado.detalles.totalPagado, '0.00', 'Pagos RECHAZADOS no deben sumar');
    assert.ok(reqConRechazado.motivosPendientes.includes('PAGO_ADELANTO_FALTANTE'));
  });

  it('32. DR02-05 y DR02-03: Mock resuelve contratos sustituidos estrictamente', async () => {
    const mockService = new MockReservationService();

    const resDirecta = await mockService.createReservation({
      propiedadId: 'prop-01',
      huespedId: 'hue-01',
      ingreso: '2026-12-26',
      salida: '2026-12-30',
      montoAcordado: 1000,
      moneda: 'PEN',
      origen: 'DIRECTO',
    });

    // v1 VALIDADA
    const v1 = await mockService.createContract(resDirecta.id, {
      nombreOriginal: 'contrato_v1.pdf',
    });
    const internalContracts = (mockService as any).contracts.get(resDirecta.id);
    internalContracts[0].estadoFirma = 'VALIDADA';

    // v2 REFERENCIADA que reemplaza a v1
    await mockService.createContract(resDirecta.id, {
      nombreOriginal: 'contrato_v2_adenda.pdf',
      reemplazaContratoId: v1.id,
    });

    // Como v2 reemplaza a v1 y v2 es REFERENCIADA, el requisito de contrato NO debe cumplirse
    const req = await mockService.getConfirmationRequirements(resDirecta.id);
    assert.equal(req.puedeConfirmar, false);
    assert.equal(req.requisitos.contratoFirmado, false, 'Contrato v1 sustituido no debe satisfacer la firma');
    assert.ok(req.motivosPendientes.includes('CONTRATO_NO_VALIDADO'));
  });

  it('33. DR02-06: Idempotencia contractual — reintento con misma clave devuelve mismo contrato sin duplicar', async () => {
    const mockService = new MockReservationService();
    const idempotencyKey = 'mock-idem-uuid-12345';

    // Primer intento
    const primerEnvio = await mockService.createContract('res-03', {
      nombreOriginal: 'contrato_reintento.pdf',
      urlReferencia: 'https://docs.daplace.internal/c1.pdf',
      idempotencyKey,
    });
    assert.equal(primerEnvio.version, 2);

    // Reintento idéntico (simulando timeout / pérdida de respuesta HTTP)
    const reintento = await mockService.createContract('res-03', {
      nombreOriginal: 'contrato_reintento.pdf',
      urlReferencia: 'https://docs.daplace.internal/c1.pdf',
      idempotencyKey,
    });
    // Debe devolver el mismo contrato sin crear una versión 3
    assert.equal(reintento.id, primerEnvio.id);
    assert.equal(reintento.version, 2);

    // Un envío con una clave diferente sí crea la siguiente versión
    const nuevoEnvio = await mockService.createContract('res-03', {
      nombreOriginal: 'contrato_nuevo.pdf',
      urlReferencia: 'https://docs.daplace.internal/c2.pdf',
      idempotencyKey: 'otra-clave-diferente-67890',
    });
    assert.equal(nuevoEnvio.version, 3);
  });

  it('34. DR02-04: Consumo frontend de error 409 con sobre real de backend error.details', async () => {
    const apiService = new ApiReservationService();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 'REQUIREMENTS_NOT_MET',
              message: 'La reserva directa no cumple los requisitos obligatorios para confirmación.',
              details: {
                motivosPendientes: ['CONTRATO_NO_VALIDADO', 'ADELANTO_INSUFICIENTE'],
                requisitos: {
                  reservaApta: true,
                  contratoFirmado: false,
                  pagoRegistrado: false,
                  evidenciaAdelanto: false,
                  evidenciaRevisada: false,
                  adelantoCubierto: false,
                  adelantoConciliado: false,
                  politicaAdelantoDefinida: false,
                  disponibilidadValida: true,
                },
              },
            },
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      };

      try {
        await apiService.confirmReservation('res-01');
        assert.fail('Debió lanzar ApiError 409');
      } catch (err: any) {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'REQUIREMENTS_NOT_MET');
        assert.ok(Array.isArray(err.details?.motivosPendientes));
        assert.equal(err.details.motivosPendientes.length, 2);
        assert.ok(err.details.motivosPendientes.includes('CONTRATO_NO_VALIDADO'));
        assert.ok(err.details.motivosPendientes.includes('ADELANTO_INSUFICIENTE'));
        assert.equal(err.details?.requisitos?.contratoFirmado, false);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('35. FIX 2: Idempotencia coherente del mock — replay idéntico vs conflicto 409 ante contenido modificado', async () => {
    const mockService = new MockReservationService();
    const idempotencyKey = 'idem-strict-key-001';

    // 1) Envío original
    const c1 = await mockService.createContract('res-03', {
      nombreOriginal: 'contrato_original.pdf',
      urlReferencia: 'https://docs.daplace.internal/c1.pdf',
      idempotencyKey,
    });
    assert.equal(c1.version, 2);
    assert.equal(c1.nombreOriginal, 'contrato_original.pdf');

    const contractsAfter1 = await mockService.getContracts('res-03');
    assert.equal(contractsAfter1.length, 2);

    // 2) Replay idéntico: mismo nombre, misma url
    const replay = await mockService.createContract('res-03', {
      nombreOriginal: '  contrato_original.pdf  ',
      urlReferencia: 'https://docs.daplace.internal/c1.pdf',
      idempotencyKey,
    });
    assert.equal(replay.id, c1.id);
    assert.equal(replay.version, 2);
    assert.equal(replay.nombreOriginal, 'contrato_original.pdf');

    // Recuento de contratos no cambia
    const contractsAfterReplay = await mockService.getContracts('res-03');
    assert.equal(contractsAfterReplay.length, 2);

    // 3) Reintento con misma clave pero contenido diferente (diferente nombre) -> 409 IDEMPOTENCY_CONFLICT
    await assert.rejects(
      async () => {
        await mockService.createContract('res-03', {
          nombreOriginal: 'contrato_contenido_adulterado.pdf',
          urlReferencia: 'https://docs.daplace.internal/c1.pdf',
          idempotencyKey,
        });
      },
      (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'IDEMPOTENCY_CONFLICT');
        return true;
      }
    );

    // Ausencia de efectos secundarios: el recuento sigue en 2 y el contrato original permanece intacto
    const contractsAfterConflict = await mockService.getContracts('res-03');
    assert.equal(contractsAfterConflict.length, 2);
    assert.equal(contractsAfterConflict[1].nombreOriginal, 'contrato_original.pdf');

    // 4) Reset del mock limpia los snapshots: la misma clave ahora se puede usar de nuevo
    mockService.reset();
    const cAfterReset = await mockService.createContract('res-03', {
      nombreOriginal: 'nuevo_tras_reset.pdf',
      idempotencyKey,
    });
    assert.equal(cAfterReset.version, 2);
    assert.equal(cAfterReset.nombreOriginal, 'nuevo_tras_reset.pdf');
  });

  it('36. FIX 3: Coordinador de carga del modal invalida respuestas asíncronas lentas de reservas previas (carrera A/B)', async () => {
    const state = {
      contracts: [] as any[],
      requirements: null as any,
      requirementsError: null as string | null,
      isLoadingContracts: false,
      isLoadingRequirements: false,
    };

    let resolveContractsA: (val: any) => void = () => {};
    let resolveReqA: (val: any) => void = () => {};
    let resolveContractsB: (val: any) => void = () => {};
    let resolveReqB: (val: any) => void = () => {};

    const promiseContractsA = new Promise((resolve) => { resolveContractsA = resolve; });
    const promiseReqA = new Promise((resolve) => { resolveReqA = resolve; });
    const promiseContractsB = new Promise((resolve) => { resolveContractsB = resolve; });
    const promiseReqB = new Promise((resolve) => { resolveReqB = resolve; });

    const fakeService = {
      getContracts: (resId: string) => (resId === 'res-A' ? promiseContractsA : promiseContractsB) as any,
      getConfirmationRequirements: (resId: string) => (resId === 'res-A' ? promiseReqA : promiseReqB) as any,
    };

    const coordinator = createModalLoadCoordinator(fakeService, {
      setContracts: (c) => { state.contracts = c; },
      setRequirements: (r) => { state.requirements = r; },
      setRequirementsError: (e) => { state.requirementsError = e; },
      setIsLoadingContracts: (l) => { state.isLoadingContracts = l; },
      setIsLoadingRequirements: (l) => { state.isLoadingRequirements = l; },
    });

    // 1. Iniciar carga de reserva A (res-A)
    const taskA = coordinator.startLoad('res-A', 'DIRECTO');

    // 2. Cambiar inmediatamente a reserva B (res-B)
    const taskB = coordinator.startLoad('res-B', 'DIRECTO');

    // 3. Resolver B primero
    resolveContractsB([{ id: 'ct-B', version: 1, nombreOriginal: 'contrato_B.pdf' }]);
    resolveReqB({
      reservaId: 'res-B',
      puedeConfirmar: true,
      requisitos: { contratoFirmado: true },
      motivosPendientes: [],
    });
    await taskB;

    // Verificar que el estado refleja los datos de B y puede confirmar
    assert.equal(state.contracts[0].id, 'ct-B');
    assert.equal(state.requirements.reservaId, 'res-B');
    assert.equal(state.isLoadingRequirements, false);
    assert.equal(
      evaluateDirectCannotConfirm('DIRECTO', 'SOLICITADA', state, 'res-B'),
      false,
      'B cumple requisitos'
    );

    // 4. Resolver A después (respuesta tardía de la reserva anterior)
    resolveContractsA([{ id: 'ct-A-OBSOLETO', version: 1, nombreOriginal: 'contrato_A.pdf' }]);
    resolveReqA({
      reservaId: 'res-A',
      puedeConfirmar: false,
      requisitos: { contratoFirmado: false },
      motivosPendientes: ['CONTRATO_NO_VALIDADO'],
    });
    await taskA;

    // 5. Comprobar que únicamente aparecen datos de B (A fue invalidada y descartada por el coordinador)
    assert.equal(state.contracts.length, 1);
    assert.equal(state.contracts[0].id, 'ct-B', 'Contratos de A no deben sobrescribir a B');
    assert.equal(state.requirements.reservaId, 'res-B', 'Requisitos de A no deben sobrescribir a B');
    assert.equal(state.requirementsError, null);
    assert.equal(state.isLoadingRequirements, false);

    // 7. Si los requisitos en estado correspondieran a otra reserva, DIRECTO permanece bloqueada
    state.requirements = {
      reservaId: 'res-A',
      puedeConfirmar: true,
      requisitos: {},
      motivosPendientes: [],
    };
    assert.equal(
      evaluateDirectCannotConfirm('DIRECTO', 'SOLICITADA', state, 'res-B'),
      true,
      'DIRECTO debe bloquearse si los requisitos pertenecen a otra reserva'
    );
  });
});
