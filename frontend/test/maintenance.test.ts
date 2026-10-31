import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maintenanceService } from '../src/features/maintenance';

describe('Maintenance & Work Orders Module (HU-10, HU-14, HU-16, HU-17) — Frontend Tests', () => {
  it('1. Obtiene la lista de órdenes de trabajo con atributos requeridos', async () => {
    const orders = await maintenanceService.getOrders();

    assert.ok(Array.isArray(orders));
    assert.ok(orders.length >= 2);

    for (const o of orders) {
      assert.ok(o.id);
      assert.ok(o.titulo);
      assert.ok(o.propiedadId);
      assert.ok(o.propiedadNombre);
      assert.ok(['LIMPIEZA', 'REPARACION', 'INSPECCION', 'PINTURA', 'OTRO'].includes(o.tipo));
      assert.ok(['BAJA', 'MEDIA', 'ALTA', 'URGENTE'].includes(o.prioridad));
      assert.ok(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'].includes(o.estado));
      assert.ok(o.creadoPor);
    }
  });

  it('2. Registra nueva orden de trabajo con tipo, prioridad y costo estimado (HU-14)', async () => {
    const newOrder = await maintenanceService.createOrder({
      propiedadId: 'prop-01',
      titulo: 'Revisión y cambio de bombillos LED',
      descripcion: 'Sustituir focos quemados en terraza y luminarias de cocina.',
      tipo: 'REPARACION',
      prioridad: 'MEDIA',
      costoEstimado: 60,
    });

    assert.ok(newOrder);
    assert.ok(newOrder.id);
    assert.equal(newOrder.titulo, 'Revisión y cambio de bombillos LED');
    assert.equal(newOrder.tipo, 'REPARACION');
    assert.equal(newOrder.prioridad, 'MEDIA');
    assert.equal(newOrder.costoEstimado, 60);
    assert.equal(newOrder.estado, 'PENDIENTE');
  });

  it('3. HU-10: Inspección de check-out con incidencias crea automáticamente orden de trabajo', async () => {
    const result = await maintenanceService.registerCheckout({
      reservaId: 'res-test-checkout-10',
      conforme: false,
      observaciones: 'Vidrio de ventana corrediza fisurado',
      descripcionTrabajo: 'Reparar y reemplazar vidrio corredizo de sala',
      generarOrdenMantenimiento: true,
      tipoTrabajo: 'REPARACION',
      prioridad: 'ALTA',
    });

    assert.ok(result);
    assert.equal(result.reservaId, 'res-test-checkout-10');
    assert.equal(result.estadoReserva, 'COMPLETADA');
    assert.equal(result.conforme, false);
    assert.ok(result.ordenTrabajo);
    assert.equal(result.ordenTrabajo.tipo, 'REPARACION');
    assert.equal(result.ordenTrabajo.prioridad, 'ALTA');
  });

  it('4. HU-16: Actualiza estado de orden a COMPLETADA con costo real', async () => {
    const orders = await maintenanceService.getOrders();
    const target = orders[0];

    const updated = await maintenanceService.updateOrderStatus(target.id, {
      estado: 'COMPLETADA',
      costoReal: 145.5,
      notasResolucion: 'Trabajo concluido conforme a especificaciones.',
    });

    assert.ok(updated);
    assert.equal(updated.estado, 'COMPLETADA');
    assert.equal(updated.costoReal, 145.5);
    assert.equal(updated.notasResolucion, 'Trabajo concluido conforme a especificaciones.');
    assert.ok(updated.completadoEn);
  });

  it('5. HU-14 y HU-17: Asigna operario de campo y avanza estado a EN_PROGRESO', async () => {
    const orders = await maintenanceService.getOrders();
    const pendingOrder = orders.find((o) => o.estado === 'PENDIENTE') || orders[0];

    const updated = await maintenanceService.assignOrder(pendingOrder.id, 'usr-op-02');

    assert.ok(updated);
    assert.ok(updated.asignadoA);
    assert.equal(updated.asignadoA.id, 'usr-op-02');
    assert.equal(updated.estado, 'EN_PROGRESO');
  });
});
