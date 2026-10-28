import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  guestService,
  validateGuest,
} from '../src/features/guests';

describe('Guests Module — Unit & Mock Tests', () => {
  beforeEach(() => {
    guestService.reset();
  });

  describe('Validation Logic', () => {
    it('rejects guest with name shorter than 3 characters', () => {
      const result = validateGuest({
        nombreCompleto: 'Lu',
        email: 'lu@example.invalid',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.nombreCompleto);
    });

    it('rejects guest without any contact method (neither phone nor email)', () => {
      const result = validateGuest({
        nombreCompleto: 'Lucía Fernández',
        telefono: '',
        email: '',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.contacto);
    });

    it('rejects guest with invalid email format', () => {
      const result = validateGuest({
        nombreCompleto: 'Lucía Fernández',
        email: 'correo-invalido-sin-arroba',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.email);
    });

    it('rejects guest with phone shorter than 6 characters', () => {
      const result = validateGuest({
        nombreCompleto: 'Lucía Fernández',
        telefono: '123',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.telefono);
    });

    it('accepts guest with only valid email', () => {
      const result = validateGuest({
        nombreCompleto: 'Lucía Fernández',
        email: 'lucia.fernandez@example.invalid',
      });
      assert.equal(result.isValid, true);
      assert.equal(Object.keys(result.errors).length, 0);
    });

    it('accepts guest with only valid phone', () => {
      const result = validateGuest({
        nombreCompleto: 'Lucía Fernández',
        telefono: '+51 987 654 321',
      });
      assert.equal(result.isValid, true);
      assert.equal(Object.keys(result.errors).length, 0);
    });
  });

  describe('Guest Service Mock Operations', () => {
    it('lists initial guests', async () => {
      const guests = await guestService.getGuests();
      assert.ok(guests.length >= 4);
    });

    it('searches guests by name', async () => {
      const results = await guestService.getGuests({ search: 'Sophie' });
      assert.equal(results.length, 1);
      assert.equal(results[0].nombreCompleto, 'Sophie Martin');
    });

    it('searches guests by document number or email', async () => {
      const byDoc = await guestService.getGuests({ search: '44556677' });
      assert.equal(byDoc.length, 1);
      assert.equal(byDoc[0].nombreCompleto, 'Alejandro Silva Rivas');

      const byEmail = await guestService.getGuests({ search: 'camila.vega' });
      assert.equal(byEmail.length, 1);
      assert.equal(byEmail[0].nombreCompleto, 'Camila Vega Benavides');
    });

    it('creates a new guest with valid contact and document', async () => {
      const created = await guestService.createGuest({
        nombreCompleto: 'Renato Balbuena Prado',
        telefono: '+51 911 222 333',
        email: 'renato.balbuena@example.invalid',
        tipoDocumento: 'DNI',
        numeroDocumento: '09887766',
        nacionalidad: 'Peruana',
        notas: 'Huésped corporativo referido.',
      });

      assert.ok(created.id);
      assert.equal(created.nombreCompleto, 'Renato Balbuena Prado');

      // Verify retrieved detail
      const full = await guestService.getGuestById(created.id);
      assert.ok(full);
      assert.equal(full?.email, 'renato.balbuena@example.invalid');
      assert.equal(full?.reservasRelacionadas.length, 0);
    });

    it('updates guest contact and notes', async () => {
      const updated = await guestService.updateGuest('hue-01', {
        telefono: '+51 987 999 888',
        notas: 'Actualización de contacto corporativo.',
      });

      assert.equal(updated.id, 'hue-01');
      assert.equal(updated.telefono, '+51 987 999 888');
      assert.equal(updated.notas, 'Actualización de contacto corporativo.');
    });

    it('returns related reservations when consulting detail', async () => {
      const guest = await guestService.getGuestById('hue-01');
      assert.ok(guest);
      assert.equal(guest?.reservasRelacionadas.length, 2);

      const res1 = guest?.reservasRelacionadas[0];
      assert.equal(res1?.id, 'res-01');
      assert.equal(res1?.propiedadNombre, 'Departamento Miraflores Malecón Balta');
      assert.equal(res1?.estado, 'CONFIRMADA');
    });

    it('returns empty related reservations list when guest has no reservations', async () => {
      const guest = await guestService.getGuestById('hue-04');
      assert.ok(guest);
      assert.equal(guest?.reservasRelacionadas.length, 0);
    });
  });
});
