import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alertService } from '../src/features/alerts';
import { auditService } from '../src/features/audit';

describe('Alerts & Audit Module (HU-11 & HU-20) — Frontend Tests', () => {
  it('1. HU-11: alertService obtiene alertas activas en modo fallback/mock con atributos requeridos', async () => {
    const res = await alertService.getAlerts();

    assert.ok(res);
    assert.ok(Array.isArray(res.data));
    assert.ok(res.data.length > 0);

    const first = res.data[0];
    assert.ok(first.id);
    assert.ok(first.tipoAviso);
    assert.ok(first.estado);
    assert.ok(first.canal);
    assert.ok(first.creadoEn);
    assert.ok(first.reserva);
    assert.ok(first.reserva.propiedadNombre);
  });

  it('2. HU-11: alertService marca una alerta como atendida de forma segura', async () => {
    const res = await alertService.getAlerts();
    const alertId = res.data[0].id;

    await alertService.attendAlert(alertId);

    const updated = await alertService.getAlerts();
    const found = updated.data.find((a) => a.id === alertId);
    assert.ok(found);
    assert.equal(found.estado, 'ENVIADO');
  });

  it('3. HU-20: auditService consulta registros de auditoría con paginación y estructura de bitácora', async () => {
    const response = await auditService.getAuditEvents({
      page: 1,
      limit: 10,
    });

    assert.ok(response);
    assert.ok(Array.isArray(response.data));
    assert.ok(response.data.length > 0);
    assert.equal(response.meta.page, 1);
    assert.ok(response.meta.total >= response.data.length);

    const first = response.data[0];
    assert.ok(first.id);
    assert.ok(first.entidad);
    assert.ok(first.accion);
    assert.ok(first.actor);
    assert.ok(first.creadoEn);
  });

  it('4. HU-20: auditService permite filtrar bitácora por entidad y término de búsqueda', async () => {
    const filtered = await auditService.getAuditEvents({
      entidad: 'Reserva',
      search: 'CONFIRMAR',
      page: 1,
      limit: 5,
    });

    assert.ok(filtered);
    assert.ok(Array.isArray(filtered.data));
    for (const item of filtered.data) {
      assert.equal(item.entidad.toLowerCase(), 'reserva');
      assert.ok(
        item.accion.includes('CONFIRMAR') ||
          item.motivo.toLowerCase().includes('confirmar')
      );
    }
  });
});
