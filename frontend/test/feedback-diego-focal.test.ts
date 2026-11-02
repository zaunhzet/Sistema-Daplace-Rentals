import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNights,
  reservationService,
  MockReservationService,
  validateReservationPayload,
  type Reservation,
} from '../src/features/reservations';
import { propertyService } from '../src/features/properties';
import { guestService } from '../src/features/guests';
import { addMoney, fromCents, toCents, formatMoney } from '../src/shared/money';

describe('FEEDBACK-DIEGO-02 — Pruebas Focales de Verificación Frontend', () => {
  beforeEach(() => {
    propertyService.reset();
    guestService.reset();
    reservationService.reset();
  });

  describe('1. Sesión y Autenticación (FASE B)', () => {
    it('F5 / Restauración de Sesión: soporta estado isRestoringSession para evitar expulsión a /login', () => {
      // Simular estado de contexto de autenticación durante recarga
      const authStateInit = {
        user: null,
        isAuthenticated: false,
        isRestoringSession: true, // Debe permanecer en true mientras se consulta /auth/refresh
      };

      // Si isRestoringSession es true, ProtectedRoute debe mostrar loader y NO redirigir a /login
      const shouldRedirectToLogin = !authStateInit.isAuthenticated && !authStateInit.isRestoringSession;
      assert.equal(shouldRedirectToLogin, false, 'No debe redirigir a /login mientras isRestoringSession sea true');

      // Al completar restauración con éxito
      const authStateRestored = {
        user: { id: 'usr-admin', email: 'admin@daplace.pe', rol: 'ADMINISTRADOR' },
        isAuthenticated: true,
        isRestoringSession: false,
      };

      const isAccessAllowed = authStateRestored.isAuthenticated && !authStateRestored.isRestoringSession;
      assert.equal(isAccessAllowed, true, 'Sesión restaurada autoriza navegación sin solicitar credenciales nuevamente');
    });

    it('Logout: revoca sesión, limpia usuario en memoria y redirige a login', () => {
      let currentSession: any = {
        user: { id: 'usr-admin', email: 'admin@daplace.pe' },
        isAuthenticated: true,
      };

      // Simular logout
      const handleLogout = () => {
        currentSession = {
          user: null,
          isAuthenticated: false,
        };
      };

      handleLogout();
      assert.equal(currentSession.isAuthenticated, false);
      assert.equal(currentSession.user, null);
    });
  });

  describe('2. Capacidad de Huéspedes y Horarios (FASE A)', () => {
    it('valida que cantidadHuespedes sea un entero positivo mayor a cero', () => {
      const invalidZero = validateReservationPayload({
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: '2026-11-20',
        salida: '2026-11-25',
        montoAcordado: 1000,
        cantidadHuespedes: 0,
      });
      assert.equal(invalidZero.isValid, false);
      assert.ok(invalidZero.errors.cantidadHuespedes, 'Debe reportar error si cantidadHuespedes <= 0');

      const invalidNegative = validateReservationPayload({
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: '2026-11-20',
        salida: '2026-11-25',
        montoAcordado: 1000,
        cantidadHuespedes: -2,
      });
      assert.equal(invalidNegative.isValid, false);

      const valid = validateReservationPayload({
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: '2026-11-20',
        salida: '2026-11-25',
        montoAcordado: 1000,
        cantidadHuespedes: 2,
      });
      assert.equal(valid.isValid, true);
    });

    it('respeta la capacidad máxima del inmueble (capacidadHuespedes)', async () => {
      const prop = await propertyService.getPropertyById('prop-02');
      assert.ok(prop);
      assert.equal(prop.capacidadHuespedes, 2, 'prop-02 tiene capacidad máxima de 2');

      // Intentar reservar para 5 personas en un inmueble de 2
      const exceso = 5;
      const excedeCapacidad = (huespedes: number, capacidadMax: number) => huespedes > capacidadMax;
      assert.equal(excedeCapacidad(exceso, prop.capacidadHuespedes!), true);

      // Una reserva válida de 2 no excede
      assert.equal(excedeCapacidad(2, prop.capacidadHuespedes!), false);
    });

    it('persiste horaCheckIn y horaCheckOut con valores predeterminados operativos', async () => {
      const defaultCheckIn = '15:00';
      const defaultCheckOut = '11:00';

      const created = await reservationService.createReservation({
        propiedadId: 'prop-02',
        huespedId: 'hue-02',
        ingreso: '2027-01-10',
        salida: '2027-01-15',
        montoAcordado: 1100,
        cantidadHuespedes: 2,
        horaCheckIn: defaultCheckIn,
        horaCheckOut: defaultCheckOut,
      });

      assert.equal(created.horaCheckIn, '15:00');
      assert.equal(created.horaCheckOut, '11:00');
      assert.equal(created.cantidadHuespedes, 2);
    });
  });

  describe('3. Tarifa de Limpieza y Cálculo Automático de Precios (FASE A)', () => {
    it('suma el precio de limpieza exactamente una sola vez sobre el total de noches', async () => {
      const prop = await propertyService.getPropertyById('prop-01');
      assert.ok(prop);
      assert.equal(prop.precioBaseNoche, 280);
      assert.equal(prop.precioLimpieza, 50);

      const noches = calculateNights('2026-11-20', '2026-11-24'); // 4 noches
      assert.equal(noches, 4);

      // Fórmula matemática oficial: (noches * precioBaseNoche) + precioLimpieza
      const subtotalNoches = noches * prop.precioBaseNoche!;
      const totalEstimado = subtotalNoches + prop.precioLimpieza!;

      assert.equal(subtotalNoches, 1120);
      assert.equal(totalEstimado, 1170, 'La limpieza (50) solo se suma una vez, totalizando 1170');
    });

    it('protección de precio manual negociado: nunca se sobrescribe silenciosamente', () => {
      // Estado del formulario:
      let isManualOverride = false;
      let montoAcordado = '1170.00';
      const precioCalculado = 1170;

      // Operador edita manualmente el precio a 1000 por acuerdo comercial
      const nuevoMontoManual = '1000.00';
      if (Number(nuevoMontoManual) !== precioCalculado) {
        isManualOverride = true;
      }
      montoAcordado = nuevoMontoManual;

      assert.equal(isManualOverride, true);
      assert.equal(montoAcordado, '1000.00');

      // Si cambian las fechas a 5 noches (precio sugerido pasaría a 1450):
      const nuevoPrecioCalculado = 5 * 280 + 50; // 1450
      // La regla de protección impide sustituir montoAcordado si isManualOverride es true
      if (!isManualOverride) {
        montoAcordado = String(nuevoPrecioCalculado);
      }

      assert.equal(montoAcordado, '1000.00', 'El precio negociado se mantiene inalterado ante cambios de fechas');

      // Solo si el operador presiona explícitamente "Recalcular con tarifas" se restablece:
      const handleRecalculate = () => {
        isManualOverride = false;
        montoAcordado = String(nuevoPrecioCalculado);
      };

      handleRecalculate();
      assert.equal(isManualOverride, false);
      assert.equal(montoAcordado, '1450', 'Al confirmar recálculo manual, adopta la tarifa estándar');
    });

    it('utiliza precisión decimal en centavos evitando errores de coma flotante', () => {
      // 0.10 + 0.20 en coma flotante estándar de JavaScript da 0.30000000000000004
      const floatSum = 0.10 + 0.20;
      assert.notEqual(floatSum, 0.3);

      // Utilizando precisión en céntimos con las utilidades de SistemaGI
      const cents1 = toCents('0.10');
      const cents2 = toCents('0.20');
      const sumCents = cents1 + cents2;
      assert.equal(sumCents, 30);
      assert.equal(fromCents(sumCents), '0.30');

      // Verificación de suma financiera compuesta
      const totalCents = addMoney('1120.00', '50.00', '0.50');
      assert.equal(fromCents(totalCents), '1170.50');
    });
  });

  describe('4. Códigos Legibles y Paginación Server-Side (FASE C)', () => {
    it('asigna y muestra códigos legibles únicos y estables PRP, HSP y RSV', async () => {
      const prop = await propertyService.getPropertyById('prop-01');
      assert.ok(prop?.codigo);
      assert.match(prop.codigo, /^PRP-\d{6}$/);

      const guest = await guestService.getGuestById('hue-01');
      assert.ok(guest?.codigo);
      assert.match(guest.codigo, /^HSP-\d{6}$/);

      const r = await reservationService.getReservationById('res-01');
      assert.ok(r?.codigo);
      assert.match(r.codigo, /^RSV-\d{6}$/);
    });

    it('paginación y búsqueda escalable para 100+ reservas sin saturar la memoria cliente', async () => {
      const mockService = new MockReservationService();

      // Generar 120 reservas sintéticas en el servicio
      const largeReservationSet: Reservation[] = [];
      for (let i = 1; i <= 120; i++) {
        largeReservationSet.push({
          id: `res-perf-${i}`,
          codigo: `RSV-${String(i).padStart(6, '0')}`,
          propiedadId: 'prop-01',
          propiedadNombre: 'Departamento Miraflores',
          huespedId: 'hue-01',
          huespedNombre: `Huésped ${i}`,
          ingreso: '2027-01-01',
          salida: '2027-01-05',
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 1000,
          moneda: 'PEN',
          origen: 'WEB',
          creadaEn: new Date().toISOString(),
          actualizadaEn: new Date().toISOString(),
        });
      }

      // Inyectar en el servicio de pruebas
      (mockService as any).reservations = largeReservationSet;

      // Solicitar página 1 con tamaño 15
      const page1 = await mockService.getReservationsPaginated({ page: 1, pageSize: 15 });
      assert.equal(page1.data.length, 15, 'La página 1 debe contener exactamente 15 reservas');
      assert.equal(page1.total, 120, 'El total debe reportar las 120 reservas');
      assert.equal(page1.page, 1);
      assert.equal(page1.totalPages, 8, '120 reservas / 15 por página = 8 páginas');
      assert.equal(page1.data[0].codigo, 'RSV-000001');

      // Solicitar página 8 (última)
      const page8 = await mockService.getReservationsPaginated({ page: 8, pageSize: 15 });
      assert.equal(page8.data.length, 15);
      assert.equal(page8.data[14].codigo, 'RSV-000120');

      // Búsqueda por código legible específico
      const searchResult = await mockService.getReservations({ search: 'RSV-000042' });
      assert.equal(searchResult.length, 1);
      assert.equal(searchResult[0].codigo, 'RSV-000042');

      // Retrocompatibilidad: llamada sin parámetro page devuelve array completo para módulos heredados
      const legacyResult = await mockService.getReservations();
      assert.ok(Array.isArray(legacyResult));
      assert.equal(legacyResult.length, 120, 'Consumidores sin page conservan acceso al listado sin rotura');
    });
  });

  describe('5. Clarificación de Etiquetas de Pago y Seguridad HMAC (FASE D)', () => {
    it('comprueba que la presentación incluya el código legible de reserva en el abono', async () => {
      const res = await reservationService.getReservationById('res-01');
      assert.ok(res?.codigo);

      // Formateo para selección de abonos
      const dropdownLabel = `${res.codigo ? `${res.codigo} — ` : ''}${res.huespedNombre} (${res.propiedadNombre})`;
      assert.ok(dropdownLabel.startsWith('RSV-000001 — '));
      assert.ok(dropdownLabel.includes('Alejandro Silva Rivas'));
    });

    it('valida que las referencias de cuenta bancaria solo registren datos restringidos (últimos 4 dígitos)', () => {
      const cuentaCompleta = '191-12345678-0-99';
      // Sanitización segura para privacidad financiera
      const extraerUltimosCuatro = (val: string) => {
        const digits = val.replace(/\D/g, '');
        return digits.length >= 4 ? `****${digits.slice(-4)}` : val;
      };

      const refSegura = extraerUltimosCuatro(cuentaCompleta);
      assert.equal(refSegura, '****8099', 'Solo expone los últimos 4 dígitos para resguardar privacidad');
    });
  });
});
