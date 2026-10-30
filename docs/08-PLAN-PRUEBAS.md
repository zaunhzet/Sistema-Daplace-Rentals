# 08 — Estrategia y Ejecución de Pruebas

**Estado:** APROBADO Y VERIFICADO (Refleja la suite de pruebas automatizadas ejecutadas y aprobadas al 30 de octubre de 2026).
**Cobertura Verificada:** 234 pruebas Backend (PostgreSQL real) + 140 pruebas Frontend (Vitest).
**Tasa de Éxito:** 100% PASS (0 fallos, 0 errores de TypeScript, builds de producción limpios).

---

## 1. Comandos de Ejecución

Desde la raíz del monorepo:

```sh
# Ejecución integral de validación (Typechecks + Tests + Builds)
npm run verify

# Ejecución de pruebas Backend (PostgreSQL)
npm run test:api       # o en backend/: npm test

# Ejecución de pruebas Frontend (Vitest)
npm run test:web       # o en frontend/: npm test

# Verificación de tipos estricta
npm run typecheck
```

---

## 2. Suites de Pruebas Backend (234 Tests PASS)

Todas las pruebas backend se ejecutan contra una base de datos local aislada (`daplace_test` en `postgresql://postgres:postgres@localhost:5432/daplace_test`) administrada de forma segura mediante `test-helpers.ts` y `reset.ts` con `RESTART IDENTITY CASCADE`.

### A. Suites Focales de Integración y Seguridad
1. **Integridad de Identidad y Vínculo (`identity-link-int01.test.ts` — 4 PASS):**
   * Compatibilidad de tipos UUID entre `users` y `usuarios`.
   * Restricción de clave foránea `ON DELETE RESTRICT` (impide borrar un `Usuario` si tiene un `User` vinculado).
   * Aislamiento de atributos de autenticación frente a entidades de dominio.
2. **Seguridad y Concurrencia de Autenticación (`auth-security-int02.test.ts` — 8 PASS):**
   * **Replay Attack:** Detección de reuso de refresh tokens y revocación automática de la familia entera.
   * **Carrera Atómica:** Dos peticiones de rotación paralelas bajo `SELECT ... FOR UPDATE` resueltas con una exitosa y una bajo ventana de gracia/conflicto controlado.
   * **Logout Concurrente — Orden 1:** Refresh en vuelo + Logout simultáneo; post-logout ningún token de esa familia queda autorizado.
   * **Logout Concurrente — Orden 2:** Refresh completa rotación + Logout posterior; toda la familia queda revocada con timestamp; el access token recién emitido queda revocado de inmediato.
   * **Aislamiento Multisesión:** Una sesión en otro dispositivo del mismo usuario permanece 100% válida tras el logout en el primer dispositivo.
   * **Trazabilidad:** Preservación de registros con `revokedAt IS NOT NULL` (cero borrado destructivo).
3. **Autorización y Aislamiento de Dominio (`authorization-int03.test.ts` — 7 PASS):**
   * Matriz de roles RBAC (`ADMIN`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`).
   * Validación negativa: Propietario activo sin `usuarioId` vinculado es rechazado de inmediato con HTTP 403 `DOMAIN_IDENTITY_REQUIRED`.
   * Propiedad ajena no visible ni modificable por propietario no autorizado.

### B. Suites del Núcleo de Dominio y Transacciones
* **Reservas y Solapes (`reservations.test.ts`):** Exclusión de fechas con `btree_gist`, intervalo semiabierto `[ingreso, salida)`, transiciones de estado y cálculo de noches.
* **Expiración y Worker DR-03 (56 PASS):** Selección con `FOR UPDATE SKIP LOCKED`, outbox durable `avisos_reserva`, reloj inyectable e invalidación de avisos obsoletos.
* **Pagos y Conciliación (`payments.test.ts`):** Idempotencia por clave, conciliación contable de adelantos, rechazo motivado y cálculo exacto de saldo en decimal.
* **Evidencias de Pago y Contratos:** Carga documental referenciada, validación administrativa y versionamiento inmutable de contratos.
* **Garantías (`guarantees.test.ts`):** Depósito en custodia, retención justificada, devoluciones parciales e invariante contra saldos negativos.
* **Gastos (`expenses.test.ts`):** Egresos por inmueble, sustentos digitales, aprobación y anulación controlada sin pérdida de historial.

---

## 3. Suites de Pruebas Frontend (140 Tests PASS)

Ejecutadas con Vitest y Testing Library sobre componentes y coordinadores de página:

1. **Cliente de API y Coordinación (`client-integration-int04.test.ts` — 5 PASS):**
   * Descarte de peticiones lentas en vuelo tras logout mediante `authEpoch` (`STALE_SESSION_RESPONSE`, 499).
   * Preservación del encabezado `Idempotency-Key` en reintentos transparentes de 401 tras renovación de token.
   * Propagación automática del Bearer token en memoria.
2. **Coordinadores de Página y Formularios:**
   * `reservationPageCoordinator.test.ts`: Actualización por ID de la reserva seleccionada tras refresco del calendario.
   * Componentes de grilla de calendario, badges de transición (check-in / check-out) y leyenda de estados.
   * Modales de pago, subida de vouchers y cálculo reactivo de saldos.
   * Contexto de autenticación (`AuthContext` y `LoginForm`) con soporte de selección demo.

---

## 4. Pruebas Pendientes para Consolidación (Post-MVP)

* **Pruebas End-to-End (E2E) con Playwright:** Automatización del flujo completo en navegador Chrome headless desde el login hasta la confirmación de reserva y pago.
* **Pruebas de Carga:** Evaluación de rendimiento con k6 sobre el worker de expiración y concurrencia de reservas simultáneas.
