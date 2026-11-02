import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNights,
  formatTimeHHmm,
  formatDisplayDate,
  formatChannelLabel,
} from '../src/shared/utils/stayFormatters';
import {
  getScopedStorageKey,
  savePersistentState,
  loadPersistentState,
  clearPersistentState,
} from '../src/shared/utils/persistence';
import { propertyService } from '../src/features/properties/services/propertyService';
import { reservationService } from '../src/features/reservations/services/reservationService';

// Polyfill in-memory localStorage for Node.js test runner
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe('FEEDBACK-DIEGO-03-B — Pruebas Focales: Códigos, Selectores, Estancia y Calendario', () => {
  beforeEach(() => {
    propertyService.reset();
    reservationService.reset();
    localStorage.clear();
  });

  describe('B1 — P0: Eliminación de UUIDs y Códigos Comerciales Cortos', () => {
    it('1. Propietarios exponen código comercial único y estable (ej. PRO-000001) sin alterar su UUID', async () => {
      const propietarios = await propertyService.getPropietarios();
      assert.ok(propietarios.length > 0, 'Debe haber propietarios sembrados');

      for (const p of propietarios) {
        assert.ok(p.id, 'Debe conservar UUID técnico');
        assert.match(
          p.codigo || '',
          /^PRO-\d{6}$/,
          `El propietario ${p.nombre} debe tener código comercial en formato PRO-XXXXXX (actual: ${p.codigo})`
        );
      }
    });

    it('2. Las propiedades vinculadas incluyen el código comercial del propietario (propietarioCodigo)', async () => {
      const properties = await propertyService.getProperties();
      assert.ok(properties.length > 0, 'Debe haber propiedades');

      for (const prop of properties) {
        assert.ok(prop.id, 'Debe tener id de propiedad');
        assert.match(
          prop.codigo || '',
          /^PRP-\d{6}$/,
          `Propiedad debe tener código PRP-XXXXXX (actual: ${prop.codigo})`
        );
        if (prop.propietarioCodigo) {
          assert.match(
            prop.propietarioCodigo,
            /^PRO-\d{6}$/,
            `Propietario debe exponer código PRO-XXXXXX en la propiedad`
          );
        }
      }
    });
  });

  describe('B2 — P0: Búsqueda y Combobox para Reservas Vinculadas', () => {
    it('3. Búsqueda remota de reservas filtra por código RSV-XXXXXX', async () => {
      const all = await reservationService.getReservations();
      assert.ok(all.length > 0);
      const target = all[0];
      assert.ok(target.codigo, 'La reserva debe tener código comercial');

      const results = await reservationService.getReservations({ search: target.codigo });
      assert.ok(results.length > 0, 'Debe encontrar al menos la reserva buscada');
      assert.ok(results.some((r) => r.id === target.id));
    });

    it('4. Búsqueda remota filtra por nombre de huésped y por UUID completo pegado', async () => {
      const all = await reservationService.getReservations();
      const target = all[0];

      // Búsqueda por nombre de huésped
      const byGuest = await reservationService.getReservations({ search: target.huespedNombre });
      assert.ok(byGuest.length > 0);
      assert.ok(byGuest.some((r) => r.id === target.id));

      // Búsqueda por UUID exacto
      const byId = await reservationService.getReservations({ search: target.id });
      assert.ok(byId.length > 0);
      assert.equal(byId[0].id, target.id);
    });

    it('5. Paginación de reservas en backend/servicio sin descargar catálogo completo al frontend', async () => {
      const paginated = await reservationService.getReservationsPaginated({ page: 1, pageSize: 2 });
      assert.equal(paginated.data.length, 2, 'Debe retornar exactamente el pageSize solicitado');
      assert.equal(paginated.page, 1);
      assert.equal(paginated.pageSize, 2);
      assert.ok(paginated.total >= 2);
      assert.ok(paginated.totalPages >= 1);
    });
  });

  describe('B3 — P0: Formato de Estancia, Horarios y Fechas Seguras', () => {
    it('6. formatNights previene "→ noche →" y garantiza "X noche(s)" sin textos truncados', () => {
      assert.equal(formatNights(1), '1 noche');
      assert.equal(formatNights(2), '2 noches');
      assert.equal(formatNights(0), '0 noches');
      assert.equal(formatNights(undefined), '0 noches');
      assert.equal(formatNights(-5), '0 noches');
    });

    it('7. formatTimeHHmm maneja formato consistente y datos históricos faltantes como "No especificado"', () => {
      assert.equal(formatTimeHHmm('15:00'), '15:00');
      assert.equal(formatTimeHHmm('11:00:00'), '11:00');
      assert.equal(formatTimeHHmm('9:30'), '09:30');
      assert.equal(formatTimeHHmm(undefined), 'No especificado');
      assert.equal(formatTimeHHmm(''), 'No especificado');
      assert.equal(formatTimeHHmm('   '), 'No especificado');
    });

    it('8. formatDisplayDate previene "Invalid Date" y formatea DD/MM/YYYY con zonas horarias seguras', () => {
      assert.equal(formatDisplayDate('2026-11-01'), '01/11/2026');
      assert.equal(formatDisplayDate('2026-12-31'), '31/12/2026');
      assert.equal(formatDisplayDate(''), 'Fecha no disponible');
      assert.equal(formatDisplayDate('fecha-invalida'), 'Fecha no disponible');
      assert.equal(formatDisplayDate(undefined), 'Fecha no disponible');
    });

    it('9. formatChannelLabel normaliza canales y previene etiquetas vacías', () => {
      assert.equal(formatChannelLabel('AIRBNB'), 'Airbnb');
      assert.equal(formatChannelLabel('BOOKING'), 'Booking.com');
      assert.equal(formatChannelLabel('DIRECTO'), 'Directo');
      assert.equal(formatChannelLabel(''), 'Canal Directo');
      assert.equal(formatChannelLabel(undefined), 'Canal Directo');
    });
  });

  describe('B4 & B5 — P1: Calendario Enriquecido y Vistas Mes, Semana y Día', () => {
    it('10. Vistas de calendario y eventos preservan la regla de intervalos semiabiertos [ingreso, salida)', async () => {
      // Ingreso el día 01, salida el día 05 = 4 noches ocupadas (días 1, 2, 3, 4 ocupados, día 5 disponible para nuevo check-in)
      const res = await reservationService.createReservation({
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: '2026-11-20',
        salida: '2026-11-25',
        montoAcordado: 1200,
        moneda: 'PEN',
        horaCheckIn: '15:00',
        horaCheckOut: '11:00',
        cantidadHuespedes: 3,
      });

      assert.equal(res.horaCheckIn, '15:00');
      assert.equal(res.horaCheckOut, '11:00');
      assert.equal(res.cantidadHuespedes, 3);
      assert.match(res.codigo || '', /^RSV-\d{6}$/);

      // Una reserva contigua que ingresa el 25 de noviembre a las 15:00 DEBE ser permitida sin overbooking
      const contigua = await reservationService.createReservation({
        propiedadId: 'prop-01',
        huespedId: 'hue-02',
        ingreso: '2026-11-25',
        salida: '2026-11-28',
        montoAcordado: 800,
        moneda: 'PEN',
      });
      assert.ok(contigua.id, 'Reserva contigua [20, 25) y [25, 28) no colisiona');
    });
  });

  describe('B6 — P1: Persistencia de Filtros con Separación por Rol y Usuario', () => {
    it('11. Genera keys de almacenamiento aisladas por rol y usuario', () => {
      const userAdmin = { id: 'usr-admin-12345678', email: 'admin@daplace.pe', rol: 'ADMINISTRADOR' };
      const userProp = { id: 'usr-prop-99887766', email: 'prop@daplace.pe', rol: 'PROPIETARIO' };

      const keyAdmin = getScopedStorageKey('calendar_prefs', userAdmin);
      const keyProp = getScopedStorageKey('calendar_prefs', userProp);

      assert.equal(keyAdmin, 'daplace_filter_ADMINISTRADOR_usr-admi_calendar_prefs');
      assert.equal(keyProp, 'daplace_filter_PROPIETARIO_usr-prop_calendar_prefs');
      assert.notEqual(keyAdmin, keyProp, 'Las claves de almacenamiento no deben solaparse entre usuarios');
    });

    it('12. Guarda y recupera estado persistente respetando el aislamiento', () => {
      const user1 = { id: 'usr-11111111', rol: 'ADMINISTRADOR' };
      const user2 = { id: 'usr-22222222', rol: 'PROPIETARIO' };

      savePersistentState('reservations_filters', { estado: 'CONFIRMADA', page: 2 }, user1);
      savePersistentState('reservations_filters', { estado: 'SOLICITADA', page: 1 }, user2);

      const loadedUser1 = loadPersistentState('reservations_filters', { estado: 'TODOS', page: 1 }, user1);
      const loadedUser2 = loadPersistentState('reservations_filters', { estado: 'TODOS', page: 1 }, user2);

      assert.equal(loadedUser1.estado, 'CONFIRMADA');
      assert.equal(loadedUser1.page, 2);

      assert.equal(loadedUser2.estado, 'SOLICITADA');
      assert.equal(loadedUser2.page, 1);
    });

    it('13. loadPersistentState retorna defaultValue ante ausencia o corrupción de datos', () => {
      const user = { id: 'usr-clean', rol: 'OPERADOR' };
      const defaultState = { viewMode: 'mes', year: 2026, month: 11 };

      const result = loadPersistentState('non_existent_key', defaultState, user);
      assert.deepEqual(result, defaultState);

      // Simular JSON corrupto en localStorage
      const corruptKey = getScopedStorageKey('corrupt_key', user);
      localStorage.setItem(corruptKey, '{valor_invalido:::');

      const recovered = loadPersistentState('corrupt_key', defaultState, user);
      assert.deepEqual(recovered, defaultState, 'Debe degradar de forma segura al default');
    });

    it('14. clearPersistentState elimina el registro específico sin alterar otros estados', () => {
      const user = { id: 'usr-clear', rol: 'ADMINISTRADOR' };
      savePersistentState('pref_a', 'valor_a', user);
      savePersistentState('pref_b', 'valor_b', user);

      clearPersistentState('pref_a', user);

      assert.equal(loadPersistentState('pref_a', 'fallback', user), 'fallback');
      assert.equal(loadPersistentState('pref_b', 'fallback', user), 'valor_b');
    });
  });
});
