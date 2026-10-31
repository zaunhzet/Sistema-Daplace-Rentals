import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  propertyService,
  validateProperty,
} from '../src/features/properties';

describe('Properties Module — Unit & Mock Tests', () => {
  beforeEach(() => {
    propertyService.reset();
  });

  describe('Validation Logic', () => {
    it('rejects property with name shorter than 3 characters', () => {
      const result = validateProperty({
        nombre: 'Ab',
        propietarioId: 'usr-101',
        direccion: 'Calle Los Robles 123',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.nombre);
    });

    it('rejects property without an associated owner (propietarioId)', () => {
      const result = validateProperty({
        nombre: 'Departamento Miraflores',
        propietarioId: '',
        direccion: 'Calle Los Robles 123',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.propietarioId);
    });

    it('rejects property with address shorter than 5 characters', () => {
      const result = validateProperty({
        nombre: 'Departamento Miraflores',
        propietarioId: 'usr-101',
        direccion: 'Av 1',
      });
      assert.equal(result.isValid, false);
      assert.ok(result.errors.direccion);
    });

    it('accepts valid property payload', () => {
      const result = validateProperty({
        nombre: 'Departamento Miraflores',
        propietarioId: 'usr-101',
        direccion: 'Malecón Balta 740, Dpto 802',
        capacidadHuespedes: 4,
        precioBaseNoche: 250,
      });
      assert.equal(result.isValid, true);
      assert.equal(Object.keys(result.errors).length, 0);
    });
  });

  describe('Property Service Mock Operations', () => {
    it('lists initial properties and owners', async () => {
      const properties = await propertyService.getProperties();
      const owners = await propertyService.getPropietarios();

      assert.ok(properties.length >= 5);
      assert.ok(owners.length >= 4);
    });

    it('filters properties by text search', async () => {
      const results = await propertyService.getProperties({ search: 'Punta Hermosa' });
      assert.equal(results.length, 1);
      assert.equal(results[0].nombre, 'Casa de Playa Punta Hermosa');
    });

    it('filters properties by operational status and publication status', async () => {
      const mantenimientos = await propertyService.getProperties({
        estadoOperativo: 'EN_MANTENIMIENTO',
      });
      assert.equal(mantenimientos.length, 1);
      assert.equal(mantenimientos[0].estadoOperativo, 'EN_MANTENIMIENTO');

      const borradores = await propertyService.getProperties({
        estadoPublicacion: 'BORRADOR',
      });
      assert.equal(borradores.length, 1);
      assert.equal(borradores[0].estadoPublicacion, 'BORRADOR');
    });

    it('filters only active properties', async () => {
      const all = await propertyService.getProperties();
      const activeOnly = await propertyService.getProperties({ soloActivas: true });

      assert.ok(activeOnly.length < all.length);
      assert.ok(activeOnly.every((p) => p.activa === true));
    });

    it('creates a new property and associates it to an owner', async () => {
      const created = await propertyService.createProperty({
        nombre: 'Nuevo Loft Barranco',
        propietarioId: 'usr-102',
        direccion: 'Av. Grau 500, Dpto 301, Barranco',
        estadoOperativo: 'OPERATIVA',
        estadoPublicacion: 'PUBLICADA',
        capacidadHuespedes: 3,
        precioBaseNoche: 320,
      });

      assert.ok(created.id);
      assert.equal(created.nombre, 'Nuevo Loft Barranco');
      assert.equal(created.propietarioId, 'usr-102');
      assert.equal(created.propietarioNombre, 'Carlos Eduardo Méndez');
      assert.equal(created.activa, true);

      // Verify it is returned in list
      const retrieved = await propertyService.getPropertyById(created.id);
      assert.ok(retrieved);
      assert.equal(retrieved?.nombre, 'Nuevo Loft Barranco');
    });

    it('updates an existing property', async () => {
      const updated = await propertyService.updateProperty('prop-01', {
        nombre: 'Departamento Miraflores Malecón Renovado',
        precioBaseNoche: 350,
      });

      assert.equal(updated.id, 'prop-01');
      assert.equal(updated.nombre, 'Departamento Miraflores Malecón Renovado');
      assert.equal(updated.precioBaseNoche, 350);
    });

    it('deactivates logically without physical deletion to protect history', async () => {
      const initial = await propertyService.getPropertyById('prop-01');
      assert.equal(initial?.activa, true);

      const deactivated = await propertyService.togglePropertyActive('prop-01', false);
      assert.equal(deactivated.activa, false);
      assert.equal(deactivated.estadoOperativo, 'INACTIVA');

      // The property record still exists in the database/mock (no physical deletion)
      const persisted = await propertyService.getPropertyById('prop-01');
      assert.ok(persisted !== null);
      assert.equal(persisted?.activa, false);
    });

    it('creates a new domain owner and makes it available in catalog', async () => {
      const created = await propertyService.createPropietario({
        nombre: 'Nuevo Propietario Test',
        email: 'nuevo.propietario@daplace.pe',
        telefono: '+51 987 654 321',
      });

      assert.ok(created.id);
      assert.equal(created.nombre, 'Nuevo Propietario Test');
      assert.equal(created.email, 'nuevo.propietario@daplace.pe');

      const all = await propertyService.getPropietarios();
      const found = all.find((p) => p.id === created.id);
      assert.ok(found);
      assert.equal(found?.nombre, 'Nuevo Propietario Test');
    });

    it('rejects creating owner with invalid or duplicate email', async () => {
      await assert.rejects(
        async () => {
          await propertyService.createPropietario({
            nombre: 'Nombre Valido',
            email: 'correo-sin-arroba',
          });
        },
        /correo electrónico válido/
      );

      // Duplicado comprobable
      await assert.rejects(
        async () => {
          await propertyService.createPropietario({
            nombre: 'Carlos Duplicado',
            email: 'contacto@sanisidro-inversiones.example.invalid', // Ya existe en mock
          });
        },
        /Ya existe un propietario registrado/
      );
    });
  });
});
