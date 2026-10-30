# Informe Histórico de Integración André–Diego

**Fecha:** 30 de octubre de 2026
**Proyecto:** Sistema Web Transaccional para la Gobernanza y Estandarización de Datos — Daplace Rentals
**Identificador de Integración:** `INT-ANDRE-DIEGO-20261030`
**Autor:** Antigravity (Auditoría Técnica y Arquitectura de Software)

---

## 1. Contexto y Propósito

El presente documento registra la consolidación técnica del trabajo desarrollado por **André** (módulos transaccionales de dominio: reservas, disponibilidad, propiedades, huéspedes, pagos, evidencias, garantías, contratos, expiración durable DR-03 y vistas frontend operativas) y **Diego** (autenticación segura con JWT, sesiones persistentes en PostgreSQL, rotación de tokens por familia, middleware de autorización y layout administrativo).

La integración fusiona ambas líneas de desarrollo en un monorepo cohesionado, resolviendo discrepancias estructurales de identidad, serialización concurrente y contratos API sin degradar la integridad financiera ni las garantías de concurrencia en PostgreSQL.

---

## 2. Coordenadas de Integración Git

| Parámetro | Valor Verificable |
| :--- | :--- |
| **Repositorio Remoto** | `zaunhzet/Sistema-Daplace-Rentals` |
| **Rama Base de André** | `feat/andre-expiracion-reservas` (mergeada previamente en PR #4 con SHA `81eab929838f08671f74d25d95cfd9d3947d6f79`) |
| **Rama de Diego** | `dev/diego` (commit `4b4e0eb9a97f688c6e1d7395acdadcd76883ba87`) |
| **Rama de Integración Local** | `feat/integration-andre-diego-auth` |
| **Tracking Upstream** | `origin/integration/andre-diego-20261029` |
| **Merge Commit SHA** | `8c6c661c7f494b75f5eb3a08f2fdc2184d01c0a2` |
| **Padre 1 (HEAD André)** | `81eab929838f08671f74d25d95cfd9d3947d6f79` |
| **Padre 2 (Commit Diego)** | `4b4e0eb9a97f688c6e1d7395acdadcd76883ba87` |
| **Estado Git Actual** | Merge concluido localmente; working tree limpio; 2 commits por delante del tracking remoto. |

> [!IMPORTANT]
> **Aclaración de Estado:** El merge commit local **NO** equivale a un PR fusionado en la rama principal (`main`) ni a un despliegue en ambiente productivo. La publicación mediante `git push` y la creación del Pull Request formal hacia `integration/andre-diego-20261029` están sujetas a autorización explícita.

---

## 3. Estrategia de Integración y Resolución de Conflictos

La integración se estructuró en cinco frentes de trabajo (INT-01 a INT-05) complementados por la verificación correctiva obligatoria (INT-VERIFY-01):

### INT-01: Separación Estricta de Identidades (`User` vs `Usuario`)
* **Problema:** Diego introdujo la tabla `users` (credenciales y autenticación) con UUID propio, mientras que el modelo de dominio de André utilizaba `usuarios` como clave foránea en propiedades, pagos, garantías y auditorías. Si se sustituía `Usuario.id` por `User.id`, se rompía la integridad referencial y se mezclaban cuentas de acceso con actores de negocio.
* **Solución Implementada:**
  * Se preservaron ambas tablas con responsabilidades ortogonales:
    * `User`: credenciales, hash de contraseña, rol de acceso (`ADMINISTRADOR`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`), estado activo y sesiones.
    * `Usuario`: entidad transaccional de dominio (propietario anfitrión, operador registrador, conciliador contable).
  * Vínculo determinístico 1:1 opcional: `User.usuarioId -> Usuario.id` con restricción de integridad referencial `ON DELETE RESTRICT ON UPDATE CASCADE` (migración `20261030080000_int01_user_usuario_link`).
  * No se realizan vinculaciones heurísticas ni automáticas por email.

### INT-02: Autenticación, Concurrencia y Revocación por Familia
* **Problema:** En situaciones de rotación y logout simultáneo, o peticiones en paralelo de un mismo cliente, un logout parcial podía dejar tokens renovados autorizados, o un fallo en rotación podía provocar carreras de tokens.
* **Solución Implementada:**
  * Se incorporaron `sid` (ID de sesión) y `family` (UUID de familia) en el payload del JWT de acceso.
  * La rotación de refresh tokens (`rotateSessionAtomic`) se ejecuta bajo transacción atómica en PostgreSQL (`SELECT ... FOR UPDATE`), detectando si algún miembro de la familia fue revocado.
  * Al cerrar sesión (`logout`), se revoca la familia completa (`revokeFamily(session.family)`) mediante `revokedAt = NOW()`, preservando la fila para auditoría (cero `DELETE` destructivos).
  * Sesiones independientes del mismo usuario en otros dispositivos (con diferente `family`) permanecen 100% válidas.

### INT-03: Autorización y Aislamiento de Dominio
* **Problema:** En `properties.ts` y `calendar.ts`, existía un fallback `request.user.usuarioId || request.user.id`, el cual permitía que un `User` sin registro en `usuarios` accediera a recursos de propietario utilizando su ID de autenticación.
* **Solución Implementada:**
  * Retiro total del fallback. `User.id` nunca sustituye a `Usuario.id`.
  * Si un usuario con rol `PROPIETARIO` no cuenta con vínculo transaccional (`request.user.usuarioId === null`), los endpoints responden inmediatamente con HTTP 403 `DOMAIN_IDENTITY_REQUIRED`.

### INT-04: Coordinación Cliente Frontend
* **Problema:** Respuestas tardías en vuelo tras un logout podían repoblar el estado de la aplicación, o reintentos automáticos tras 401 podían duplicar operaciones financieras no idempotentes.
* **Solución Implementada:**
  * Contador incremental `authEpoch` en [authClient.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/auth/authClient.ts).
  * En [client.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/shared/api/client.ts), toda respuesta cuyo `authEpoch` haya cambiado durante la ejecución se descarta con `ApiError('STALE_SESSION_RESPONSE', 499)`.
  * Los reintentos transparentes de 401 tras renovación de token preservan los encabezados originales, incluyendo `Idempotency-Key`.

### INT-05: Unificación de Shell y Layout
* **Problema:** Coexistencia de dos layouts administrativos: uno con bypass demo y otro con formulario de login real.
* **Solución Implementada:**
  * Se fusionó el shell operativo de André (`AdminLayout`) con el estado de autenticación real de Diego (`AuthContext`).
  * Se agregó soporte para iniciar y cerrar sesión real, manteniendo botones de acceso rápido con usuarios demo sintéticos para agilizar la evaluación de evaluadores.

---

## 4. Resumen de Migraciones en PostgreSQL

El esquema consolidado contiene las siguientes migraciones ordenadas cronológicamente:

1. `20261028180000_init_postgresql_core`: Esquema base de propiedades, huéspedes, reservas, pagos, garantías y auditoría.
2. `20261029000000_auth_users_and_sessions`: Modelos `users` y `auth_sessions` aportados por Diego.
3. `20261030010000_dr02_requisitos_confirmacion_contratos_evidencias`: Contratos de reserva y evidencias de pago con índices y restricciones.
4. `20261030020000_dr02_gastos_sustentos`: Modelo de gastos operativos y sustentos documentales.
5. `20261030030000_dr03_add_estado_reserva_expirada`: Estado `EXPIRADA` en enum `EstadoReserva` y columnas de plazo en `reservas`.
6. `20261030040000_dr03_avisos_reserva_outbox`: Tabla `avisos_reserva` para outbox durable de notificaciones.
7. `20261030050000_dr03_reserva_exclusion_constraint`: Restricción de exclusión en PostgreSQL contra solapes de reserva (GIST / btree_gist).
8. `20261030060000_dr03_avisos_reserva_checks_and_restrict_fk`: Claves foráneas `RESTRICT` e índices de soporte para avisos de reserva.
9. `20261030080000_int01_user_usuario_link`: Clave foránea `users.usuario_id -> usuarios(id)` con regla `ON DELETE RESTRICT ON UPDATE CASCADE`.

---

## 5. Batería de Pruebas y Cobertura Verificada

| Suite de Pruebas | Tipo | Pruebas | Estado | Aspectos Verificados |
| :--- | :---: | :---: | :---: | :--- |
| `backend/test/identity-link-int01.test.ts` | Integración DB | 4 | **PASS** | Vínculo 1:1, tipos UUID compatibles, rechazo de borrado de `Usuario` vinculado (`RESTRICT`). |
| `backend/test/auth-security-int02.test.ts` | Concurrencia DB | 8 | **PASS** | Detección de replay attack, rotación bajo carrera atómica, logout concurrente en ambos órdenes y persistencia de auditoría. |
| `backend/test/authorization-int03.test.ts` | Integración API | 7 | **PASS** | Matriz de roles (`ADMIN`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`), aislamiento de propiedades y 403 `DOMAIN_IDENTITY_REQUIRED`. |
| `frontend/test/client-integration-int04.test.ts` | Frontend Client | 5 | **PASS** | Descarte por epoch tras logout, preservación de `Idempotency-Key` en reintentos 401 y propagación Bearer. |
| **Suite Backend Completa** | Integral | **234** | **PASS** | Transacciones de reserva, pagos, garantías, gastos, avisos, exclusión PostgreSQL y workers. |
| **Suite Frontend Completa** | Integral | **140** | **PASS** | Coordinadores de página, componentes de calendario, formularios de pago, filtros y contexto de autenticación. |

* **TypeScript Backend:** `npm run typecheck` reporta 0 errores.
* **TypeScript Frontend:** `npm run typecheck` reporta 0 errores.
* **Compilación Backend (`npm run build`):** Generación limpia en `backend/dist`.
* **Compilación Frontend (`npm run build`):** Bundle Vite generado exitosamente sin advertencias.

---

## 6. Riesgos Residuales y Pendientes Técnicos

1. **Pantallas sin integración backend (Stubs UI):**
   * `/dashboard`: muestra componente `PendingModuleView`. Requiere implementar agregaciones de KPIs en backend.
   * `/reportes`: muestra componente `PendingModuleView`. Requiere implementar cálculo consolidado de liquidaciones para propietarios.
   * `/personal`: muestra componente `PendingModuleView`. Requiere CRUD de administración de usuarios y asignación de credenciales.
   * `/mantenimiento`: muestra componente `PendingModuleView`. Requiere tabla de incidencias de campo y asignación de tareas.
2. **Despachador de notificaciones desacoplado:**
   * El outbox de `avisos_reserva` se persiste transaccionalmente, pero el dispatcher real no envía correos ni mensajes SMTP/WhatsApp en producción (permanece en modo prueba para evitar spam externo).
3. **Dependencia de migración btree_gist:**
   * En PostgreSQL requiere superusuario o extensión `btree_gist` habilitada en la base de datos para exclusion constraints de fechas.

---

## 7. Próximos Pasos Recomendados

1. **Aprobación de Pull Request:** Solicitar revisión de André y Diego sobre la rama `feat/integration-andre-diego-auth` y fusionar hacia `integration/andre-diego-20261029`.
2. **Priorización de la Demo (2 de Noviembre, 18:30):**
   * Enfocar la demostración en los flujos verticales completos y verificados: **Autenticación real -> Catálogo/Propiedades -> Huéspedes -> Creación y confirmación de Reserva -> Calendario de disponibilidad -> Registro de Pagos con Evidencias -> Control de Garantías -> Registro de Gastos con Sustento**.
   * Omitir intencionalmente los stubs en la ruta crítica de la presentación.
