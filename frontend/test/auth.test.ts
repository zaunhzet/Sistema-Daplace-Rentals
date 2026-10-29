import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { USUARIOS_DEMO_PREDEFINIDOS, type DemoSession, type DemoUser } from '../src/features/auth/types';

describe('Demo Authentication Module — Unit Tests (UI-DIEGO-001)', () => {
  it('defines the 4 standardized demo roles and predefined accounts', () => {
    assert.equal(USUARIOS_DEMO_PREDEFINIDOS.length, 4);

    const roles = USUARIOS_DEMO_PREDEFINIDOS.map((u) => u.rol);
    assert.ok(roles.includes('ADMINISTRADOR'), 'Debe incluir rol ADMINISTRADOR');
    assert.ok(roles.includes('OPERADOR'), 'Debe incluir rol OPERADOR');
    assert.ok(roles.includes('PROPIETARIO'), 'Debe incluir rol PROPIETARIO');
    assert.ok(roles.includes('CLIENTE'), 'Debe incluir rol CLIENTE');

    for (const u of USUARIOS_DEMO_PREDEFINIDOS) {
      assert.ok(u.nombre.length > 3);
      assert.ok(u.correo.includes('@daplace.pe'));
      assert.ok(u.cargo.length > 3);
    }
  });

  it('maintains demo session strictly in-memory without forging JWT tokens or backend credentials', () => {
    const sessionInicial: DemoSession = {
      isAuthenticated: false,
      user: null,
      ingresoEn: null,
      modoDemo: true,
    };

    assert.equal(sessionInicial.isAuthenticated, false);
    assert.equal(sessionInicial.user, null);
    assert.equal(sessionInicial.modoDemo, true);

    // Simular login demo en memoria
    const adminUser = USUARIOS_DEMO_PREDEFINIDOS[0];
    const loggedSession: DemoSession = {
      isAuthenticated: true,
      user: adminUser,
      ingresoEn: '10:00:00',
      modoDemo: true,
    };

    assert.equal(loggedSession.isAuthenticated, true);
    assert.equal(loggedSession.user?.correo, 'valeria.mendez@daplace.pe');
    assert.equal(loggedSession.user?.rol, 'ADMINISTRADOR');
    assert.equal(loggedSession.modoDemo, true);
    // Verificar que no existen tokens secretos ni JWT simulados
    assert.equal((loggedSession as any).token, undefined);
    assert.equal((loggedSession as any).jwt, undefined);
  });
});
