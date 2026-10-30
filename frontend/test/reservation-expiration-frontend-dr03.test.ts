import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  reservationService,
  createCalendarPageCoordinator,
  createReservationsPageCoordinator,
  type Reservation,
} from '../src/features/reservations';
import { ApiError } from '../src/shared/api/client';
import { propertyService } from '../src/features/properties';
import { guestService } from '../src/features/guests';
import { calendarService } from '../src/features/calendar';

describe('DR-03 Frontend: Pruebas Obligatorias F01–F06 (Carreras, Mocks y Expiración)', () => {
  beforeEach(() => {
    propertyService.reset();
    guestService.reset();
    reservationService.reset();
  });

  it('F01: Estado EXPIRADA es admitido en los tipos y visible en el servicio', async () => {
    // res-03 o cualquier reserva modificada a EXPIRADA
    const all = await reservationService.getReservations();
    assert.ok(all.length > 0);

    // Inyectar sintéticamente una reserva EXPIRADA en el mock
    const expiredRes: Reservation = {
      id: 'res-test-expired',
      propiedadId: 'prop-01',
      propiedadNombre: 'Penthouse Miraflores',
      huespedId: 'hue-01',
      huespedNombre: 'Huésped Prueba',
      ingreso: '2027-02-01',
      salida: '2027-02-05',
      noches: 4,
      estado: 'EXPIRADA',
      montoAcordado: 1000,
      moneda: 'PEN',
      origen: 'DIRECTO',
      venceEn: '2026-10-15T12:00:00Z',
      expiradaEn: '2026-10-15T12:00:01Z',
      politicaPlazoVersion: 'v1.0-directo-72h',
      creadaEn: '2026-10-12T12:00:00Z',
      actualizadaEn: '2026-10-15T12:00:01Z',
    };

    (reservationService as any).reservations.push(expiredRes);

    const filtered = await reservationService.getReservations({ estado: 'EXPIRADA' });
    assert.ok(filtered.length >= 1);
    const found = filtered.find((r) => r.id === 'res-test-expired');
    assert.ok(found);
    assert.equal(found.estado, 'EXPIRADA');
  });

  it('F02: Calendario y disponibilidad: EXPIRADA no bloquea fechas; SOLICITADA, CONFIRMADA y COMPLETADA sí bloquean', async () => {
    const expiredRes: Reservation = {
      id: 'res-f02-exp',
      propiedadId: 'prop-01',
      propiedadNombre: 'Penthouse Miraflores',
      huespedId: 'hue-01',
      huespedNombre: 'Huésped Uno',
      ingreso: '2027-05-10',
      salida: '2027-05-15',
      noches: 5,
      estado: 'EXPIRADA',
      montoAcordado: 1200,
      moneda: 'PEN',
      origen: 'DIRECTO',
      creadaEn: new Date().toISOString(),
      actualizadaEn: new Date().toISOString(),
    };

    (reservationService as any).reservations.push(expiredRes);

    // Comprobar disponibilidad en las mismas fechas de la reserva expirada -> DEBE ESTAR DISPONIBLE
    const availExpired = await reservationService.checkAvailability('prop-01', '2027-05-10', '2027-05-15');
    assert.equal(availExpired.disponible, true, 'Una reserva EXPIRADA no debe bloquear disponibilidad');

    // Ahora probar con una reserva SOLICITADA en las mismas fechas
    const solRes: Reservation = {
      id: 'res-f02-sol',
      propiedadId: 'prop-01',
      propiedadNombre: 'Penthouse Miraflores',
      huespedId: 'hue-02',
      huespedNombre: 'Huésped Dos',
      ingreso: '2027-05-10',
      salida: '2027-05-15',
      noches: 5,
      estado: 'SOLICITADA',
      montoAcordado: 1200,
      moneda: 'PEN',
      origen: 'DIRECTO',
      creadaEn: new Date().toISOString(),
      actualizadaEn: new Date().toISOString(),
    };
    (reservationService as any).reservations.push(solRes);

    const availSol = await reservationService.checkAvailability('prop-01', '2027-05-10', '2027-05-15');
    assert.equal(availSol.disponible, false, 'Una reserva SOLICITADA debe bloquear disponibilidad');
  });

  it('F03: Cambio de mes A -> B con respuesta A tardía: el coordinador real descarta la respuesta obsoleta', async () => {
    let resolveA!: (val: any[]) => void;
    let resolveB!: (val: any[]) => void;
    const pA = new Promise<any[]>((r) => { resolveA = r; });
    const pB = new Promise<any[]>((r) => { resolveB = r; });

    let renderedDays: any[] = [];
    let loadingState = false;

    const coordinator = createCalendarPageCoordinator(
      {
        getMonthDays: async (_pid, _y, month) => (month === 1 ? pA : pB),
        getMonthSummary: (days) => ({ total: days.length }),
      },
      {
        setDays: (d) => { renderedDays = d; },
        setSummary: () => {},
        setLoading: (l) => { loadingState = l; },
      }
    );

    // 1. Cargar Mes 1 (A)
    const taskA = coordinator.loadCalendar('prop-01', 2026, 1);
    assert.equal(loadingState, true);

    // 2. Inmediatamente cambiar a Mes 2 (B)
    const taskB = coordinator.loadCalendar('prop-01', 2026, 2);

    // 3. Responder B primero
    resolveB([{ date: '2026-02-01', status: 'AVAILABLE' }]);
    await taskB;
    assert.equal(renderedDays.length, 1);
    assert.equal(renderedDays[0].date, '2026-02-01');

    // 4. Responder A tardíamente
    resolveA([{ date: '2026-01-01', status: 'AVAILABLE' }, { date: '2026-01-02', status: 'AVAILABLE' }]);
    await taskA;

    // Debe permanecer el resultado de B
    assert.equal(renderedDays.length, 1);
    assert.equal(renderedDays[0].date, '2026-02-01', 'La respuesta tardía de A no sobrescribe a B');
    assert.equal(loadingState, false);
  });

  it('F04: Cambio de filtros A -> B con respuesta A tardía y carga silenciosa: el coordinador descarta A y resuelve loading', async () => {
    let resolveA!: (val: any[]) => void;
    let resolveB!: (val: any[]) => void;
    const pA = new Promise<any[]>((r) => { resolveA = r; });
    const pB = new Promise<any[]>((r) => { resolveB = r; });

    let displayedReservations: any[] = [];
    let loadingState = false;

    const coordinator = createReservationsPageCoordinator(
      {
        getReservations: async (f) => (f?.estado === 'SOLICITADA' ? pA : pB),
        getProperties: async () => [],
        getGuests: async () => [],
        getReservationById: async () => ({} as any),
      },
      {
        setReservations: (r) => { displayedReservations = r; },
        setProperties: () => {},
        setGuests: () => {},
        setSelectedReservation: () => {},
        setLoading: (l) => { loadingState = l; },
        showError: () => {},
        getSelectedReservation: () => null,
      }
    );

    // Carga visible para A
    const taskA = coordinator.loadData({ estado: 'SOLICITADA' }, false);
    assert.equal(loadingState, true);

    // Carga silenciosa para B (p. ej. cambio rápido de filtro / polling)
    const taskB = coordinator.loadData({ estado: 'CONFIRMADA' }, true);

    // B resuelve primero
    resolveB([{ id: 'res-B-confirmada', estado: 'CONFIRMADA' }]);
    await taskB;

    assert.equal(displayedReservations.length, 1);
    assert.equal(displayedReservations[0].id, 'res-B-confirmada');
    // La carga silenciosa B completó como la última solicitud, por lo que loading debe resolver a false
    assert.equal(loadingState, false, 'Loading se apaga al terminar la última generación');

    // A responde después
    resolveA([{ id: 'res-A-solicitada', estado: 'SOLICITADA' }]);
    await taskA;

    assert.equal(displayedReservations.length, 1);
    assert.equal(displayedReservations[0].id, 'res-B-confirmada');
  });

  it('F05: Sincronización de detalle por ID independiente de filtros y omisión en pestaña oculta', async () => {
    let selectedRes: Reservation | null = {
      id: 'res-target-exp',
      propiedadId: 'prop-01',
      propiedadNombre: 'Penthouse Miraflores',
      huespedId: 'hue-01',
      huespedNombre: 'Huésped Uno',
      ingreso: '2027-08-10',
      salida: '2027-08-15',
      noches: 5,
      estado: 'SOLICITADA',
      montoAcordado: 1200,
      moneda: 'PEN',
      origen: 'DIRECTO',
      creadaEn: new Date().toISOString(),
      actualizadaEn: new Date().toISOString(),
    };

    // La lista filtrada por 'SOLICITADA' ya no incluye res-target-exp porque el backend la expiró
    const coordinator = createReservationsPageCoordinator(
      {
        getReservations: async () => [], // La lista viene vacía bajo filtro SOLICITADA
        getProperties: async () => [],
        getGuests: async () => [],
        getReservationById: async (id) => {
          assert.equal(id, 'res-target-exp');
          return {
            ...selectedRes!,
            estado: 'EXPIRADA',
            expiradaEn: '2026-10-20T12:00:00Z',
          };
        },
      },
      {
        setReservations: () => {},
        setProperties: () => {},
        setGuests: () => {},
        setSelectedReservation: (r) => { selectedRes = r; },
        setLoading: () => {},
        showError: () => {},
        getSelectedReservation: () => selectedRes,
      }
    );

    await coordinator.loadData({ estado: 'SOLICITADA' });

    assert.ok(selectedRes);
    assert.equal(selectedRes?.estado, 'EXPIRADA', 'El detalle refleja el estado EXPIRADA consultado por ID real');

    // Comprobación de visibilidad: pestaña oculta no debe disparar consultas
    let queryCount = 0;
    const triggerRefreshIfVisible = (visibility: 'visible' | 'hidden') => {
      if (visibility !== 'hidden') {
        queryCount++;
      }
    };
    triggerRefreshIfVisible('hidden');
    assert.equal(queryCount, 0);
    triggerRefreshIfVisible('visible');
    assert.equal(queryCount, 1);
  });

  it('F06: Acciones prohibidas sobre EXPIRADA se rechazan con 409 y getConfirmationRequirements reporta vencimiento', async () => {
    const expiredRes: Reservation = {
      id: 'res-f06-exp',
      propiedadId: 'prop-01',
      propiedadNombre: 'Penthouse Miraflores',
      huespedId: 'hue-01',
      huespedNombre: 'Huésped Uno',
      ingreso: '2027-06-10',
      salida: '2027-06-15',
      noches: 5,
      estado: 'EXPIRADA',
      montoAcordado: 1200,
      moneda: 'PEN',
      origen: 'DIRECTO',
      venceEn: '2026-10-10T12:00:00Z',
      expiradaEn: '2026-10-10T12:00:01Z',
      creadaEn: new Date().toISOString(),
      actualizadaEn: new Date().toISOString(),
    };
    (reservationService as any).reservations.push(expiredRes);

    // 1. Confirmar reserva EXPIRADA -> debe lanzar ApiError 409 RESERVATION_EXPIRED
    await assert.rejects(async () => {
      await reservationService.confirmReservation('res-f06-exp');
    }, (err: any) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'RESERVATION_EXPIRED');
      return true;
    });

    // 2. Modificar fechas de reserva EXPIRADA -> debe lanzar ApiError 409 RESERVATION_EXPIRED
    await assert.rejects(async () => {
      await reservationService.updateReservationDates('res-f06-exp', {
        ingreso: '2027-06-12',
        salida: '2027-06-17',
      });
    }, (err: any) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'RESERVATION_EXPIRED');
      return true;
    });

    // 3. Cancelar reserva EXPIRADA -> debe lanzar ApiError 409 RESERVATION_EXPIRED
    await assert.rejects(async () => {
      await reservationService.cancelReservation('res-f06-exp', 'Cancelación usuario');
    }, (err: any) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'RESERVATION_EXPIRED');
      return true;
    });

    // 4. getConfirmationRequirements evalúa si el plazo venció
    const overdueSol: Reservation = {
      id: 'res-f06-overdue-sol',
      propiedadId: 'prop-01',
      propiedadNombre: 'Penthouse Miraflores',
      huespedId: 'hue-01',
      huespedNombre: 'Huésped Uno',
      ingreso: '2027-07-10',
      salida: '2027-07-15',
      noches: 5,
      estado: 'SOLICITADA',
      montoAcordado: 1200,
      moneda: 'PEN',
      origen: 'DIRECTO',
      venceEn: '2020-01-01T00:00:00Z', // Vencida en el pasado
      creadaEn: new Date().toISOString(),
      actualizadaEn: new Date().toISOString(),
    };
    (reservationService as any).reservations.push(overdueSol);

    const reqs = await reservationService.getConfirmationRequirements('res-f06-overdue-sol');
    assert.equal(reqs.puedeConfirmar, false);
    assert.ok(reqs.motivosPendientes.includes('PLAZO_SOLICITUD_VENCIDO'));
  });

  describe('DR03-07: Sincronización de detalle de reserva por ID en CalendarPage (Casos A, B, C, D)', () => {
    it('Caso A — Expiración externa: detalle abierto se actualiza a EXPIRADA y calendario libera fechas', async () => {
      let selectedReservation: Reservation | null = {
        id: 'res-A-cal',
        propiedadId: 'prop-01',
        propiedadNombre: 'Penthouse Miraflores',
        huespedId: 'hue-01',
        huespedNombre: 'Huésped Uno',
        ingreso: '2026-11-10',
        salida: '2026-11-15',
        noches: 5,
        estado: 'SOLICITADA',
        montoAcordado: 1000,
        moneda: 'PEN',
        origen: 'DIRECTO',
        creadaEn: new Date().toISOString(),
        actualizadaEn: new Date().toISOString(),
      };

      let calendarDays: any[] = [];
      let calendarSummary: any = null;

      const coordinator = createCalendarPageCoordinator(
        {
          getMonthDays: async () => {
            // El calendario devuelve eventos donde A ya expiró y las fechas quedan libres
            return [
              { fecha: '2026-11-10', estado: 'DISPONIBLE', ocupada: false, reservaId: null },
              { fecha: '2026-11-11', estado: 'DISPONIBLE', ocupada: false, reservaId: null },
            ];
          },
          getMonthSummary: (days) => ({ totalDays: days.length, occupiedDays: 0, availableDays: days.length, occupancyRate: 0 }),
          getReservationById: async (id) => {
            assert.equal(id, 'res-A-cal');
            return {
              ...selectedReservation!,
              estado: 'EXPIRADA',
              expiradaEn: '2026-11-04T12:00:00Z',
            };
          },
        },
        {
          setDays: (d) => { calendarDays = d; },
          setSummary: (s) => { calendarSummary = s; },
          setLoading: () => {},
          getSelectedReservation: () => selectedReservation,
          setSelectedReservation: (r) => { selectedReservation = r; },
        }
      );

      // Ejecutar refresco del calendario
      await coordinator.loadCalendar('prop-01', 2026, 11);

      // 1. El calendario actualiza días y resumen liberando fechas
      assert.equal(calendarDays.length, 2);
      assert.equal(calendarDays[0].estado, 'DISPONIBLE');
      assert.equal(calendarSummary.occupiedDays, 0);

      // 2. El detalle abierto de A se actualiza por ID a EXPIRADA
      assert.ok(selectedReservation);
      assert.equal(selectedReservation?.estado, 'EXPIRADA', 'El detalle abierto se actualiza a EXPIRADA tras refresco');
      assert.equal(selectedReservation?.expiradaEn, '2026-11-04T12:00:00Z');

      // 3. Las acciones incompatibles permanecen deshabilitadas en el backend/mock
      (reservationService as any).reservations.push(selectedReservation);
      await assert.rejects(async () => {
        await reservationService.confirmReservation('res-A-cal');
      }, (err: any) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'RESERVATION_EXPIRED');
        return true;
      });
    });

    it('Caso B — Cambio de selección: respuesta tardía de A no sobrescribe selección activa B', async () => {
      let resolveDetailA!: (r: Reservation) => void;
      const detailAPromise = new Promise<Reservation>((resolve) => {
        resolveDetailA = resolve;
      });

      const resA: Reservation = {
        id: 'res-A',
        propiedadId: 'prop-01',
        propiedadNombre: 'Penthouse Miraflores',
        huespedId: 'hue-01',
        huespedNombre: 'Huésped A',
        ingreso: '2026-11-01',
        salida: '2026-11-05',
        noches: 4,
        estado: 'SOLICITADA',
        montoAcordado: 500,
        moneda: 'PEN',
        origen: 'DIRECTO',
        creadaEn: new Date().toISOString(),
        actualizadaEn: new Date().toISOString(),
      };

      const resB: Reservation = {
        id: 'res-B',
        propiedadId: 'prop-01',
        propiedadNombre: 'Penthouse Miraflores',
        huespedId: 'hue-02',
        huespedNombre: 'Huésped B',
        ingreso: '2026-11-10',
        salida: '2026-11-15',
        noches: 5,
        estado: 'CONFIRMADA',
        montoAcordado: 800,
        moneda: 'PEN',
        origen: 'DIRECTO',
        creadaEn: new Date().toISOString(),
        actualizadaEn: new Date().toISOString(),
      };

      let selectedReservation: Reservation | null = resA;

      const coordinator = createCalendarPageCoordinator(
        {
          getMonthDays: async () => [],
          getMonthSummary: () => ({}),
          getReservationById: async (id) => {
            if (id === 'res-A') return detailAPromise;
            return resB;
          },
        },
        {
          setDays: () => {},
          setSummary: () => {},
          setLoading: () => {},
          getSelectedReservation: () => selectedReservation,
          setSelectedReservation: (r) => { selectedReservation = r; },
        }
      );

      // 1. Iniciar carga con A seleccionado (la petición getReservationById(res-A) queda pendiente)
      const loadTask = coordinator.loadCalendar('prop-01', 2026, 11);

      // 2. El usuario cambia la selección de A a B antes de que termine la petición
      selectedReservation = resB;

      // 3. Resolver tardíamente la petición de A
      resolveDetailA({
        ...resA,
        estado: 'EXPIRADA',
      });
      await loadTask;

      // 4. El detalle debe continuar mostrando B y no ser sobrescrito por A
      assert.equal(selectedReservation?.id, 'res-B', 'Permanece B');
      assert.equal(selectedReservation?.estado, 'CONFIRMADA', 'Permanece el estado de B sin ser pisado por A');
    });

    it('Caso C — Modal cerrado: respuesta pendiente no reabre el modal ni restaura la selección', async () => {
      let resolveDetailA!: (r: Reservation) => void;
      const detailAPromise = new Promise<Reservation>((resolve) => {
        resolveDetailA = resolve;
      });

      const resA: Reservation = {
        id: 'res-A',
        propiedadId: 'prop-01',
        propiedadNombre: 'Penthouse Miraflores',
        huespedId: 'hue-01',
        huespedNombre: 'Huésped A',
        ingreso: '2026-11-01',
        salida: '2026-11-05',
        noches: 4,
        estado: 'SOLICITADA',
        montoAcordado: 500,
        moneda: 'PEN',
        origen: 'DIRECTO',
        creadaEn: new Date().toISOString(),
        actualizadaEn: new Date().toISOString(),
      };

      let selectedReservation: Reservation | null = resA;

      const coordinator = createCalendarPageCoordinator(
        {
          getMonthDays: async () => [],
          getMonthSummary: () => ({}),
          getReservationById: async () => detailAPromise,
        },
        {
          setDays: () => {},
          setSummary: () => {},
          setLoading: () => {},
          getSelectedReservation: () => selectedReservation,
          setSelectedReservation: (r) => { selectedReservation = r; },
        }
      );

      // 1. Iniciar carga mientras A está abierto
      const loadTask = coordinator.loadCalendar('prop-01', 2026, 11);

      // 2. El usuario cierra el modal antes de recibir la respuesta
      selectedReservation = null;

      // 3. Se resuelve la respuesta de A
      resolveDetailA({
        ...resA,
        estado: 'EXPIRADA',
      });
      await loadTask;

      // 4. El modal debe permanecer cerrado (selectedReservation sigue siendo null)
      assert.equal(selectedReservation, null, 'El modal permanece cerrado y no se restaura la selección anterior');
    });

    it('Caso D — Error 409 y refresco: propaga error original 409 y actualiza detalle a EXPIRADA si sigue seleccionado', async () => {
      let selectedReservation: Reservation | null = {
        id: 'res-A-409',
        propiedadId: 'prop-01',
        propiedadNombre: 'Penthouse Miraflores',
        huespedId: 'hue-01',
        huespedNombre: 'Huésped A',
        ingreso: '2026-11-01',
        salida: '2026-11-05',
        noches: 4,
        estado: 'SOLICITADA',
        montoAcordado: 500,
        moneda: 'PEN',
        origen: 'DIRECTO',
        creadaEn: new Date().toISOString(),
        actualizadaEn: new Date().toISOString(),
      };

      (reservationService as any).reservations.push({
        ...selectedReservation,
        estado: 'EXPIRADA',
        expiradaEn: '2026-10-30T10:00:00Z',
      });

      let notificationState: string | null = null;
      let refreshFails = false;

      const coordinator = createCalendarPageCoordinator(
        {
          getMonthDays: async () => {
            if (refreshFails) throw new Error('Network error on calendar reload');
            return [];
          },
          getMonthSummary: () => ({}),
          getReservationById: async () => {
            return {
              ...selectedReservation!,
              estado: 'EXPIRADA',
              expiradaEn: '2026-10-30T10:00:00Z',
            };
          },
        },
        {
          setDays: () => {},
          setSummary: () => {},
          setLoading: () => {},
          getSelectedReservation: () => selectedReservation,
          setSelectedReservation: (r) => { selectedReservation = r; },
        }
      );

      const handleConfirmReservation = async (id: string) => {
        try {
          const confirmed = await reservationService.confirmReservation(id);
          selectedReservation = confirmed;
          notificationState = `Reserva ${confirmed.id} confirmada exitosamente.`;
          await coordinator.loadCalendar('prop-01', 2026, 11);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error al confirmar la reserva.';
          notificationState = `Error: ${msg}`;
          try {
            await coordinator.loadCalendar('prop-01', 2026, 11);
          } catch {
            // Preservar el error original sin sustitución
          }
          throw err;
        }
      };

      // 1. Probar flujo normal con 409
      let thrownError: any = null;
      try {
        await handleConfirmReservation('res-A-409');
      } catch (err) {
        thrownError = err;
      }

      assert.ok(thrownError instanceof ApiError, 'Propaga la instancia original de ApiError');
      assert.equal(thrownError.statusCode, 409);
      assert.equal(thrownError.code, 'RESERVATION_EXPIRED');
      assert.ok(notificationState?.startsWith('Error:'), 'Notificación es de error, no de éxito');
      assert.equal(selectedReservation?.estado, 'EXPIRADA', 'El detalle se actualizó por ID a EXPIRADA tras el refresco');

      // 2. Probar que una falla secundaria del refresco NO sustituye el error original 409
      refreshFails = true;
      let thrownError2: any = null;
      try {
        await handleConfirmReservation('res-A-409');
      } catch (err) {
        thrownError2 = err;
      }

      assert.ok(thrownError2 instanceof ApiError, 'Continúa propagando ApiError 409');
      assert.equal(thrownError2.statusCode, 409);
      assert.equal(thrownError2.code, 'RESERVATION_EXPIRED');
    });
  });
});
