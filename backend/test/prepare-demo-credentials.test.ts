import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMemorablePassphrase,
  prepareOrUpdateDemoCredentials,
  TARGET_DEMO_ACCOUNTS,
} from '../src/scripts/prepare-demo-credentials.js';
import { AuthService } from '../modules/auth/auth.service.js';

describe('FEEDBACK-DIEGO-03-A (A5) — Script de Credenciales Simplificadas Demo', () => {
  describe('1. Generador de Frases de Paso Memorables y Seguras', () => {
    it('genera frases de paso con al menos 4 palabras, números, símbolos y más de 16 caracteres', () => {
      const pass1 = generateMemorablePassphrase();
      const pass2 = generateMemorablePassphrase();

      assert.ok(pass1.length >= 16, `La longitud debe ser >= 16 (obtenido: ${pass1.length})`);
      assert.notEqual(pass1, pass2, 'Debe generar frases aleatorias distintas');

      // Debe contener guiones separadores
      const parts = pass1.split('-');
      assert.ok(parts.length >= 4, 'Debe contener palabras separadas por guiones');

      // Debe terminar con número y símbolo
      const lastPart = parts[parts.length - 1];
      assert.match(lastPart, /\d{2}[!@#$%&*]/, 'Debe contener número de 2 dígitos y símbolo');
    });

    it('la frase de paso cumple las reglas estrictas de complejidad de contraseña de Daplace', () => {
      const pass = generateMemorablePassphrase();

      // Longitud >= 8
      assert.ok(pass.length >= 8);
      // Letra mayúscula
      assert.match(pass, /[A-Z]/);
      // Letra minúscula
      assert.match(pass, /[a-z]/);
      // Dígito numérico
      assert.match(pass, /[0-9]/);
      // Carácter especial
      assert.match(pass, /[!@#$%&*]/);
    });
  });

  describe('2. Auditoría y Simulación (Dry-Run)', () => {
    it('en modo dry-run deriva hashes Argon2id válidos y resume el inventario sin escribir', async () => {
      const result = await prepareOrUpdateDemoCredentials({
        dryRun: true,
      });

      assert.equal(result.success, true);
      assert.equal(result.dryRun, true);
      assert.equal(result.accounts.length, 4);

      const roles = result.accounts.map((a) => a.rol);
      assert.ok(roles.includes('ADMINISTRADOR'));
      assert.ok(roles.includes('OPERADOR'));
      assert.ok(roles.includes('PROPIETARIO'));
      assert.ok(roles.includes('CLIENTE'));

      for (const acc of result.accounts) {
        assert.ok(acc.hasArgon2idHash, `La cuenta ${acc.email} debe tener hash Argon2id`);
        assert.ok(acc.passphraseLength >= 16);
      }
    });

    it('los correos propuestos son legibles, memorables y terminan en .invalid', () => {
      const emails = TARGET_DEMO_ACCOUNTS.map((a) => a.proposedEmail);
      assert.deepEqual(emails, [
        'admin@daplace.invalid',
        'operador@daplace.invalid',
        'propietario@daplace.invalid',
        'cliente@daplace.invalid',
      ]);
    });
  });

  describe('3. Detección de Colisiones y Validación Mock', () => {
    it('detecta colisión si un correo propuesto pertenece a un usuario no demo', async () => {
      const mockPrisma: any = {
        $queryRawUnsafe: async (sql: string, params: any[]) => {
          if (sql.includes('SELECT id::text, email FROM users WHERE email = ANY')) {
            // Simular colisión con un usuario ajeno
            return [{ id: 'other-user-999', email: 'admin@daplace.invalid' }];
          }
          return [];
        },
      };

      await assert.rejects(
        async () => {
          await prepareOrUpdateDemoCredentials({
            prisma: mockPrisma,
            dryRun: false,
          });
        },
        /COLISIÓN DE IDENTIDAD/
      );
    });

    it('ejecuta transacción atómica y actualiza User, Usuario y revoca sesiones cuando no hay colisiones', async () => {
      const executedQueries: string[] = [];
      let transactionCommitted = false;

      const mockTx: any = {
        $executeRawUnsafe: async (sql: string, ...params: any[]) => {
          executedQueries.push(sql);
          return 1;
        },
      };

      const mockPrisma: any = {
        $queryRawUnsafe: async () => [],
        $transaction: async (cb: any) => {
          await cb(mockTx);
          transactionCommitted = true;
        },
      };

      const result = await prepareOrUpdateDemoCredentials({
        prisma: mockPrisma,
        dryRun: false,
      });

      assert.equal(result.success, true);
      assert.equal(transactionCommitted, true);

      // Verificamos que se ejecutó UPDATE en users, usuarios y auth_sessions
      assert.ok(executedQueries.some((q) => q.includes('UPDATE users')));
      assert.ok(executedQueries.some((q) => q.includes('UPDATE usuarios')));
      assert.ok(executedQueries.some((q) => q.includes('UPDATE auth_sessions')));
    });
  });
});
