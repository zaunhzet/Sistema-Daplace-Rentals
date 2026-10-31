import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { staffService } from '../src/features/staff';

describe('Staff Management Module (HU-19) — Frontend Tests', () => {
  it('1. Obtiene la lista de colaboradores internos con atributos requeridos y roles autorizados', async () => {
    const users = await staffService.getStaffUsers();

    assert.ok(Array.isArray(users));
    assert.ok(users.length >= 2);

    for (const u of users) {
      assert.ok(u.id);
      assert.ok(u.nombre);
      assert.ok(u.email);
      assert.ok(['ADMINISTRADOR', 'OPERADOR'].includes(u.rol));
      assert.equal(typeof u.isActive, 'boolean');
      if (u.usuario) {
        assert.ok(u.usuario.id);
        assert.ok(['ADMIN', 'OPERADOR', 'PROPIETARIO'].includes(u.usuario.rol));
      }
    }
  });

  it('2. Registra un nuevo colaborador interno con vínculo transaccional de dominio', async () => {
    const newUser = await staffService.createStaffUser({
      nombre: 'Elena Castro',
      email: `elena.test.${Date.now()}@daplace.pe`,
      password: 'PasswordSegura2026!',
      rol: 'OPERADOR',
      cargo: 'Supervisora de Turno Tarde',
      telefono: '+51 912345678',
    });

    assert.ok(newUser);
    assert.ok(newUser.id);
    assert.equal(newUser.nombre, 'Elena Castro');
    assert.equal(newUser.rol, 'OPERADOR');
    assert.equal(newUser.isActive, true);
    assert.ok(newUser.usuarioId);
    assert.ok(newUser.usuario);
    assert.equal(newUser.usuario.rol, 'OPERADOR');
    assert.equal(newUser.usuario.activo, true);
  });

  it('3. Rechaza registro con email duplicado', async () => {
    const existingEmail = 'admin@daplace.pe';

    await assert.rejects(
      async () => {
        await staffService.createStaffUser({
          nombre: 'Duplicado Test',
          email: existingEmail,
          password: 'PasswordSegura2026!',
          rol: 'OPERADOR',
        });
      },
      /Ya existe una cuenta con el correo/
    );
  });

  it('4. Alterna estado activo/inactivo sincronizando cuenta y dominio', async () => {
    const users = await staffService.getStaffUsers();
    const target = users.find((u) => u.isActive);
    assert.ok(target, 'Debe existir al menos un usuario activo');

    const updated = await staffService.updateStaffStatus(target.id, false);
    assert.equal(updated.isActive, false);
    if (updated.usuario) {
      assert.equal(updated.usuario.activo, false);
    }

    // Restaurar a activo
    const restored = await staffService.updateStaffStatus(target.id, true);
    assert.equal(restored.isActive, true);
    if (restored.usuario) {
      assert.equal(restored.usuario.activo, true);
    }
  });

  it('5. Actualiza rol interno a ADMINISTRADOR sincronizando modelo de dominio a ADMIN', async () => {
    const users = await staffService.getStaffUsers();
    const target = users.find((u) => u.rol === 'OPERADOR');
    assert.ok(target, 'Debe existir al menos un usuario con rol OPERADOR');

    const updated = await staffService.updateStaffRole(target.id, 'ADMINISTRADOR');
    assert.equal(updated.rol, 'ADMINISTRADOR');
    if (updated.usuario) {
      assert.equal(updated.usuario.rol, 'ADMIN');
    }

    // Regresar a OPERADOR
    const reverted = await staffService.updateStaffRole(target.id, 'OPERADOR');
    assert.equal(reverted.rol, 'OPERADOR');
    if (reverted.usuario) {
      assert.equal(reverted.usuario.rol, 'OPERADOR');
    }
  });
});
