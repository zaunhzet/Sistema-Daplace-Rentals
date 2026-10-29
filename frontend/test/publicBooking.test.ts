import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  publicBookingService,
  validatePublicBookingDto,
} from '../src/features/public-booking';
import { propertyService } from '../src/features/properties/services/propertyService';
import { reservationService } from '../src/features/reservations/services/reservationService';
import { guestService } from '../src/features/guests/services/guestService';
import { calendarService } from '../src/features/calendar/services/calendarService';

describe('Public Booking Module — Unit & Integration Tests (UI-ANDRE-004)', () => {
  beforeEach(() => {
    propertyService.reset();
    guestService.reset();
    reservationService.reset();
  });

  describe('1. Catálogo Público y Protección de Privacidad (HU-01)', () => {
    it('muestra exclusivamente propiedades activas, operativas y publicadas', async () => {
      const catalog = await publicBookingService.getPublicCatalog();

      // En mock inicial:
      // prop-01: OPERATIVA + PUBLICADA + activa = true (INCLUIDA)
      // prop-02: OPERATIVA + PUBLICADA + activa = true (INCLUIDA)
      // prop-03: EN_MANTENIMIENTO + PAUSADA = false (EXCLUIDA)
      // prop-04: OPERATIVA + BORRADOR = false (EXCLUIDA)
      // prop-05: INACTIVA + PAUSADA = false (EXCLUIDA)
      assert.equal(catalog.length, 2);

      const ids = catalog.map((p) => p.id);
      assert.ok(ids.includes('prop-01'), 'prop-01 debe estar en el catálogo');
      assert.ok(ids.includes('prop-02'), 'prop-02 debe estar en el catálogo');
      assert.ok(!ids.includes('prop-03'), 'prop-03 en mantenimiento no debe estar en catálogo');
      assert.ok(!ids.includes('prop-04'), 'prop-04 borrador no debe estar en catálogo');
      assert.ok(!ids.includes('prop-05'), 'prop-05 inactiva no debe estar en catálogo');
    });

    it('no expone datos sensibles del propietario ni finanzas privadas en la proyección pública', async () => {
      const catalog = await publicBookingService.getPublicCatalog();

      for (const item of catalog) {
        assert.ok(item.id);
        assert.ok(item.nombre);
        assert.ok(item.direccion);
        assert.ok(item.capacidadHuespedes > 0);
        assert.ok(item.precioBaseNoche > 0);
        assert.ok(item.moneda);

        // Campos privados estrictamente prohibidos:
        assert.equal((item as unknown as Record<string, unknown>).propietarioId, undefined);
        assert.equal((item as unknown as Record<string, unknown>).propietarioNombre, undefined);
        assert.equal((item as unknown as Record<string, unknown>).comisionPorcentaje, undefined);
        assert.equal((item as unknown as Record<string, unknown>).notasInternas, undefined);
      }
    });

    it('filtra propiedades por término de búsqueda en tiempo real', async () => {
      const mirafloresResult = await publicBookingService.getPublicCatalog('Miraflores');
      assert.equal(mirafloresResult.length, 1);
      assert.equal(mirafloresResult[0].id, 'prop-01');

      const barrancoResult = await publicBookingService.getPublicCatalog('Barranco');
      assert.equal(barrancoResult.length, 1);
      assert.equal(barrancoResult[0].id, 'prop-02');

      const inexistente = await publicBookingService.getPublicCatalog('Cusco');
      assert.equal(inexistente.length, 0);
    });

    it('getPublicPropertyById rechaza propiedades no publicadas o en mantenimiento', async () => {
      const p1 = await publicBookingService.getPublicPropertyById('prop-01');
      assert.ok(p1 !== null);
      assert.equal(p1?.id, 'prop-01');

      const pDraft = await publicBookingService.getPublicPropertyById('prop-04');
      assert.equal(pDraft, null, 'Propiedad en BORRADOR no debe resolverse públicamente');

      const pMaint = await publicBookingService.getPublicPropertyById('prop-03');
      assert.equal(pMaint, null, 'Propiedad en MANTENIMIENTO no debe resolverse públicamente');
    });
  });

  describe('2. Consulta Pública de Disponibilidad y Reglas de Intervalo', () => {
    it('detecta fechas ocupadas en el intervalo semiabierto [ingreso, salida)', async () => {
      // res-01 ocupa prop-01 del 2026-11-10 al 2026-11-15
      const checkOverlap = await publicBookingService.checkPublicAvailability(
        'prop-01',
        '2026-11-12',
        '2026-11-16'
      );
      assert.equal(checkOverlap.disponible, false);
      assert.ok(checkOverlap.motivo);
    });

    it('admite reservas consecutivas perfectamente acopladas [ingreso, salida)', async () => {
      // res-01 termina el 2026-11-15. Un nuevo huésped que ingresa el 2026-11-15 debe estar disponible.
      const checkConsecutiveAfter = await publicBookingService.checkPublicAvailability(
        'prop-01',
        '2026-11-15',
        '2026-11-20'
      );
      assert.equal(checkConsecutiveAfter.disponible, true);
      assert.equal(checkConsecutiveAfter.noches, 5);
      assert.equal(checkConsecutiveAfter.precioEstimado, 5 * 280);

      // Un huésped que sale el 2026-11-10 debe estar disponible
      const checkConsecutiveBefore = await publicBookingService.checkPublicAvailability(
        'prop-01',
        '2026-11-05',
        '2026-11-10'
      );
      assert.equal(checkConsecutiveBefore.disponible, true);
      assert.equal(checkConsecutiveBefore.noches, 5);
    });

    it('rechaza rango de fechas con salida anterior o igual a ingreso', async () => {
      const invalid = await publicBookingService.checkPublicAvailability(
        'prop-01',
        '2026-11-20',
        '2026-11-18'
      );
      assert.equal(invalid.disponible, false);
      assert.ok(invalid.motivo?.includes('salida debe ser posterior'));
    });
  });

  describe('3. Validación y Registro de Solicitud de Reserva (HU-02)', () => {
    it('valida que el nombre completo tenga al menos 3 caracteres', () => {
      const res = validatePublicBookingDto({
        propiedadId: 'prop-01',
        ingreso: '2026-12-01',
        salida: '2026-12-05',
        huespedNombre: 'Al',
        huespedEmail: 'al@example.com',
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.huespedNombre);
    });

    it('exige al menos un medio de contacto (correo o teléfono)', () => {
      const resSinContacto = validatePublicBookingDto({
        propiedadId: 'prop-01',
        ingreso: '2026-12-01',
        salida: '2026-12-05',
        huespedNombre: 'Carlos Santana',
      });
      assert.equal(resSinContacto.isValid, false);
      assert.ok(resSinContacto.errors.contacto);

      const resConEmail = validatePublicBookingDto({
        propiedadId: 'prop-01',
        ingreso: '2026-12-01',
        salida: '2026-12-05',
        huespedNombre: 'Carlos Santana',
        huespedEmail: 'carlos@example.com',
      });
      assert.equal(resConEmail.isValid, true);

      const resConTelefono = validatePublicBookingDto({
        propiedadId: 'prop-01',
        ingreso: '2026-12-01',
        salida: '2026-12-05',
        huespedNombre: 'Carlos Santana',
        huespedTelefono: '+51 987654321',
      });
      assert.equal(resConTelefono.isValid, true);
    });

    it('registra la solicitud en estado estrictamente SOLICITADA (no confirmada)', async () => {
      const result = await publicBookingService.submitPublicBookingRequest({
        propiedadId: 'prop-02',
        ingreso: '2026-12-10',
        salida: '2026-12-14',
        huespedNombre: 'Valeria Benavides',
        huespedEmail: 'valeria.benavides@example.invalid',
        huespedTelefono: '+51 988 777 666',
        observaciones: 'Llegada tarde por vuelo internacional.',
      });

      assert.equal(result.success, true);
      assert.ok(result.reservaId);
      assert.equal(result.estado, 'SOLICITADA');
      assert.equal(result.noches, 4);
      assert.equal(result.montoEstimado, 4 * 220);
      assert.ok(result.avisoConfirmacion.includes('SOLICITADA'));

      // Verificar en reservationService (fuente única de verdad)
      const persisted = await reservationService.getReservationById(result.reservaId!);
      assert.ok(persisted !== null);
      assert.equal(persisted?.estado, 'SOLICITADA');
      assert.equal(persisted?.origen, 'WEB');
      assert.equal(persisted?.huespedNombre, 'Valeria Benavides');
    });

    it('reutiliza huésped existente si coincide email o teléfono', async () => {
      // Registrar primera solicitud (fechas libres en prop-02)
      const req1 = await publicBookingService.submitPublicBookingRequest({
        propiedadId: 'prop-02',
        ingreso: '2026-12-15',
        salida: '2026-12-18',
        huespedNombre: 'Héctor Lavoe',
        huespedEmail: 'hector@fania.example.invalid',
      });

      const res1 = await reservationService.getReservationById(req1.reservaId!);
      const originalGuestId = res1?.huespedId;
      assert.ok(originalGuestId);

      // Registrar segunda solicitud con el mismo correo
      const req2 = await publicBookingService.submitPublicBookingRequest({
        propiedadId: 'prop-02',
        ingreso: '2026-12-20',
        salida: '2026-12-23',
        huespedNombre: 'Héctor Lavoe',
        huespedEmail: 'hector@fania.example.invalid',
      });

      const res2 = await reservationService.getReservationById(req2.reservaId!);
      assert.equal(res2?.huespedId, originalGuestId, 'Debe reutilizar el mismo huespedId sin duplicar directorio');
    });

    it('actualiza el calendario administrativo inmediatamente tras registrar la solicitud', async () => {
      // 1. Antes de solicitar, el día 2026-12-25 en prop-01 está disponible
      const monthDaysBefore = await calendarService.getMonthDays('prop-01', 2026, 12);
      const day25Before = monthDaysBefore.find((d) => d.date === '2026-12-25');
      assert.equal(day25Before?.status, 'DISPONIBLE');

      // 2. Enviar solicitud pública
      const request = await publicBookingService.submitPublicBookingRequest({
        propiedadId: 'prop-01',
        ingreso: '2026-12-24',
        salida: '2026-12-27',
        huespedNombre: 'Familia Quispe',
        huespedTelefono: '+51 977 111 222',
      });
      assert.ok(request.reservaId);

      // 3. Inmediatamente el calendario refleja el estado SOLICITADA
      const monthDaysAfter = await calendarService.getMonthDays('prop-01', 2026, 12);
      const day25After = monthDaysAfter.find((d) => d.date === '2026-12-25');
      assert.equal(day25After?.status, 'SOLICITADA');
      assert.equal(day25After?.reservation?.id, request.reservaId);
    });

    it('bloquea solicitud concurrente o posterior sobre las mismas fechas solicitadas', async () => {
      // Solicitud A
      await publicBookingService.submitPublicBookingRequest({
        propiedadId: 'prop-01',
        ingreso: '2026-12-10',
        salida: '2026-12-14',
        huespedNombre: 'Cliente A',
        huespedEmail: 'clienteA@example.com',
      });

      // Solicitud B intentando las mismas fechas
      await assert.rejects(
        async () => {
          await publicBookingService.submitPublicBookingRequest({
            propiedadId: 'prop-01',
            ingreso: '2026-12-12',
            salida: '2026-12-16',
            huespedNombre: 'Cliente B',
            huespedEmail: 'clienteB@example.com',
          });
        },
        /ya no está disponible/
      );
    });
  });
});
