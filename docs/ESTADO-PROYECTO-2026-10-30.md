# Estado Consolidado del Proyecto — Daplace Rentals

**Fecha de Corte:** 30 de octubre de 2026
**Hora de Corte:** 05:30 America/Lima
**Rama de Trabajo:** `feat/integration-andre-diego-auth`
**Commit de Referencia (HEAD):** `8c6c661c7f494b75f5eb3a08f2fdc2184d01c0a2`
**Objetivo de Demostración:** Lunes 2 de noviembre de 2026, 18:30 (America/Lima)

---

## 1. Resumen Ejecutivo

El proyecto **Daplace Rentals** ha completado la integración técnica de sus dos ramas maestras de desarrollo (`dev/diego` y `feat/andre-expiracion-reservas`), logrando un sistema web transaccional operable, con persistencia relacional estricta en PostgreSQL, control de concurrencia y una suite de pruebas automatizadas verde tanto en frontend como en backend.

### Lo que existe y funciona con evidencia verificable:
* **Autenticación y Seguridad Integral:** Inicio de sesión con credenciales cifradas (bcrypt), tokens JWT de acceso en memoria, refresh tokens rotativos atómicamente en PostgreSQL bajo `SELECT ... FOR UPDATE`, detección de replay attack, revocación de familia completa ante logout y aislamiento de identidades con separación formal entre credenciales (`User`) y actores de dominio (`Usuario`).
* **Núcleo de Dominio Transaccional:**
  * **Propiedades:** Mantenimiento de inmuebles, vinculación de propietarios, activación/desactivación lógica para protección histórica y filtrado estricto por rol de propietario.
  * **Huéspedes:** Registro de clientes, validación obligatoria de vías de contacto (teléfono/email) y trazabilidad con reservas históricas.
  * **Reservas:** Flujo de ciclo de vida completo (`SOLICITADA` -> `CONFIRMADA` -> `CANCELADA` / `EXPIRADA`), validación de fechas `[ingreso, salida)`, barrera de exclusión en PostgreSQL contra solapes de ocupación y reprogramación de fechas con exclusión de la propia reserva.
  * **Expiración Durable (DR-03):** Reloj de expiración, worker transaccional con `FOR UPDATE SKIP LOCKED`, outbox durable de avisos de vencimiento (`avisos_reserva`) e invalidación de avisos obsoletos.
  * **Calendario:** Visualización mensual de ocupación con discriminación de días de transición (check-in / check-out), pills de reservas y navegación temporal sincronizada con base de datos.
  * **Pagos y Conciliación:** Registro de adelantos y saldos con clave de idempotencia, conciliación explícita con registro de auditoría, rechazo formal con motivo, cálculo de saldo exigible exacto en decimal y asociación de evidencias documentales (vouchers).
  * **Garantías:** Fondo en custodia separado de los ingresos por alquiler, libro mayor inmutable de movimientos (recepción, retención justificada, devoluciones parciales y totales) con barrera contra saldos negativos.
  * **Gastos Operativos:** Registro de egresos por propiedad y categoría contable, soporte de comprobantes digitales, flujo de aprobación y anulación controlada sin borrado físico.
  * **Contratos:** Registro de versiones de contrato firmado y validación documental previa a la confirmación de la reserva.

### Lo que falta para la entrega final:
* **Dashboard Administrativo:** La ruta `/dashboard` muestra un componente placeholder (`PendingModuleView`). No existen agregaciones analíticas de ocupación o KPIs de ingresos en backend.
* **Reportes de Liquidación para Propietarios (HU-07 / HU-12):** La ruta `/reportes` muestra un componente placeholder (`PendingModuleView`). No se ha implementado el endpoint `/api/reportes/propietario` para calcular los ingresos netos descontando gastos y generando el archivo descargable (Tarea P0-02 programada para la jornada J4).
* **Administración Interactiva de Personal (HU-19):** La ruta `/personal` es un placeholder; los usuarios del sistema se inicializan de forma segura mediante script de seed (`seed-dev.ts`) y no mediante un formulario interactivo.
* **Mantenimiento y Salidas de Campo (HU-10 / HU-14 / HU-16):** La ruta `/mantenimiento` es un placeholder; los check-outs no derivan automáticamente en órdenes de trabajo asignadas a operarios.
* **Despacho Externo de Notificaciones:** Los avisos de vencimiento se persisten en el outbox (`avisos_reserva`), pero no se transmiten vía SMTP o WhatsApp en producción (mantenidos deliberadamente desconectados para evitar envíos externos durante pruebas).

---

## 2. Estado por Módulo del Sistema

| Módulo | Frontend | Backend | Integración API | Pruebas Automatizadas | Estado General |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Autenticación y Sesión** | Real (`LoginForm`, `authClient`, `AuthContext`) | Real (`User`, `AuthSession`, `auth.service`) | Completa (`/auth/login`, `/auth/refresh`, `/auth/logout`) | 8 pruebas concurrentes PostgreSQL + 5 tests frontend | **COMPLETO_VERIFICADO** |
| **Layout y Navegación** | Real (`AdminLayout`, `Sidebar`, selectores demo) | N/A (Manejado en cliente / middlewares) | Completa (Header con sesión activa y rol) | Verificado en suite React | **COMPLETO_VERIFICADO** |
| **Propiedades** | Real (`PropertiesPage`, modales, filtros) | Real (`/api/propiedades`, `prisma.propiedad`) | Completa (CRUD, ownership de propietario) | Unitarias y de integración de rutas | **COMPLETO_VERIFICADO** |
| **Huéspedes** | Real (`GuestsPage`, modales, búsqueda) | Real (`/api/huespedes`, `prisma.huesped`) | Completa (Registro, búsqueda, validación) | Unitarias y de integración de rutas | **COMPLETO_VERIFICADO** |
| **Reservas** | Real (`ReservationsPage`, modales de acción) | Real (`/api/reservas`, `prisma.reserva`) | Completa (Solicitud, confirmación, cancelación) | Pruebas transaccionales de solape y cancelación | **COMPLETO_VERIFICADO** |
| **Expiración y Avisos** | Coordinado en Calendar y Reservas | Real (`expirationService`, worker, outbox) | Completa (Sincronización de reservas expiradas) | 56 pruebas focales DR-03 | **COMPLETO_VERIFICADO** |
| **Calendario de Ocupación** | Real (`CalendarPage`, grilla interactiva) | Real (`/api/calendario`, cálculo de días) | Completa (Días ocupados, disponibles, transición) | Pruebas de cálculo de rango y fechas | **COMPLETO_VERIFICADO** |
| **Pagos y Evidencias** | Real (`PaymentsPage`, modales de voucher) | Real (`/api/pagos`, `prisma.pago`, evidencias) | Completa (Idempotencia, conciliación, vouchers) | Pruebas de precisión decimal e idempotencia | **COMPLETO_VERIFICADO** |
| **Garantías** | Real (`GuaranteesPage`, modales de movimiento) | Real (`/api/garantias`, libro de movimientos) | Completa (Custodia, retención, devoluciones) | Pruebas de control de saldo y retenciones | **COMPLETO_VERIFICADO** |
| **Gastos y Sustentos** | Real (`ExpensesPage`, modales de sustento) | Real (`/api/gastos`, `prisma.gasto`) | Completa (Alta por inmueble, sustento, anulación) | Pruebas de asociación e inmunidad | **COMPLETO_VERIFICADO** |
| **Contratos** | Modal integrado en confirmación de reserva | Real (`/api/contratos`, versionamiento) | Completa (Referencia a documento firmado) | Pruebas de integridad documental | **COMPLETO_VERIFICADO** |
| **Portal Público** | Implementado bajo flag `VITE_ENABLE_PUBLIC_BOOKING` | Endpoints públicos compartidos | Parcial (Pospuesto por alcance MVP) | Pruebas de componentes de catálogo | **FEATURE_FLAG (HU-01/02)** |
| **Dashboard KPIs** | Placeholder (`PendingModuleView`) | Sin endpoints | Sin integración | Ninguna | **PENDIENTE** |
| **Reportes Propietario** | Placeholder (`PendingModuleView`) | Sin endpoints | Sin integración | Ninguna | **PENDIENTE (P0 para Demo)** |
| **Personal / Usuarios** | Placeholder (`PendingModuleView`) | Modelo `User` existe; sin endpoints CRUD | Inicialización vía `seed-dev.ts` | Pruebas unitarias de modelo | **PARCIAL (P1)** |
| **Mantenimiento / Salidas** | Placeholder (`PendingModuleView`) | Sin endpoints | Sin integración | Ninguna | **PENDIENTE (P1)** |

---

## 3. Matriz Definitiva de Trazabilidad de Historias de Usuario (Exactamente 23 HU)

| ID | Historia de Usuario | Frontend | Backend | Integración | Pruebas | Estado | Observaciones de Alcance |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **HU-01** | Consultar propiedades y fechas disponibles | `CalendarPage.tsx`, `CalendarGrid.tsx` | `calendar.ts`, `reservations.ts` | Real (`/api/calendario`) | `calendar.test.ts`, suites de rango | **COMPLETO_VERIFICADO** | La variante pública `/catalogo` está desacoplada bajo flag `VITE_ENABLE_PUBLIC_BOOKING`. |
| **HU-02** | Solicitar una reserva | `ReservationFormModal.tsx` | `reservations.ts` (`POST /api/reservas`) | Real | `reservations.test.ts` | **COMPLETO_VERIFICADO** | Estado inicial `SOLICITADA`. Variante pública `/solicitar-reserva` bajo flag. |
| **HU-03** | Gestionar reservas (confirmar, reprogramar, cancelar) | `ReservationDetailModal.tsx`, `ReservationDateEditModal.tsx` | `reservations.ts` (`/confirmar`, `/fechas`, `/cancelar`) | Real | Concurrencia PostgreSQL y solape | **COMPLETO_VERIFICADO** | Exclusión de solape vía `btree_gist` en PostgreSQL. |
| **HU-04** | Registrar y consultar huéspedes | `GuestsPage.tsx`, `GuestFormModal.tsx` | `guests.ts` (`/api/huespedes`) | Real | `guests.test.ts` | **COMPLETO_VERIFICADO** | Validación obligatoria de teléfono o email. |
| **HU-05** | Registrar y conciliar pagos de alquiler | `PaymentsPage.tsx`, `PaymentFormModal.tsx` | `payments.ts` (`/api/pagos`) | Real | Idempotencia y cálculo decimal exacto | **COMPLETO_VERIFICADO** | Conciliación explícita con trazabilidad y saldo reproducible. |
| **HU-06** | Controlar la garantía | `GuaranteesPage.tsx`, `GuaranteeMovementModal.tsx` | `guarantees.ts` (`/api/garantias`) | Real | Invariante de saldo no negativo | **COMPLETO_VERIFICADO** | Fondo separado de ingresos por alquiler. |
| **HU-07** | Generar reporte por propiedad y período | `PendingModuleView.tsx` (`/reportes`) | Inexistente | Ninguna | Ninguna | **PENDIENTE** | **Requisito P0 para la demo (Tarea P0-02)**. |
| **HU-08** | Iniciar sesión y aplicar permisos | `LoginForm.tsx`, `AdminLayout.tsx` | `auth.routes.ts`, `auth.middleware.ts` | Real (`/auth/login`, cookies HTTP-only) | `auth-security-int02.test.ts` | **COMPLETO_VERIFICADO** | Rotación atómica de tokens y roles `ADMIN`, `OPERADOR`, `PROPIETARIO`. |
| **HU-09** | Registrar reservas procedentes de Airbnb | `ReservationFormModal.tsx` (selector origen) | `reservations.ts` (`origen = AIRBNB`) | Real | Pruebas de origen en reservas | **COMPLETO_VERIFICADO** | Entrada manual respetando las mismas barreras de solape. |
| **HU-10** | Registrar salida y necesidad de mantenimiento | `PendingModuleView.tsx` (`/mantenimiento`) | Inexistente | Ninguna | Ninguna | **PENDIENTE** | Prioridad P1; posterior a la demo mínima. |
| **HU-11** | Ver alerta interna de nueva reserva | Avisos guardados en DB | Outbox `avisos_reserva` | Parcial (DB outbox) | Pruebas de inserción de outbox | **IMPLEMENTADO_NO_VALIDADO_E2E** | Avisos se generan en base de datos; falta campana de notificaciones en UI. |
| **HU-12** | Descargar reporte propio | `PendingModuleView.tsx` | Inexistente | Ninguna | Ninguna | **PENDIENTE** | Prioridad P1; exportación CSV asociada a HU-07 (Tarea P1-01). |
| **HU-13** | Generar / registrar contrato de reserva | Modal de contrato en `ReservationsPage.tsx` | `contracts.ts` (`/api/contratos`) | Real | Pruebas de versionamiento de contrato | **COMPLETO_VERIFICADO** | Registro de versión documental firmada y validación. |
| **HU-14** | Asignar trabajos de campo | `PendingModuleView.tsx` | Inexistente | Ninguna | Ninguna | **PENDIENTE** | Prioridad P1; fuera de la ruta crítica mínima de la demo. |
| **HU-15** | Consultar autorizaciones de ingreso | Inexistente | Inexistente | Ninguna | Ninguna | **BLOQUEADO_DECISION** | Falta definición de fuente de datos externa de negocio (DEC-09). |
| **HU-16** | Consultar y actualizar trabajos asignados | `PendingModuleView.tsx` | Inexistente | Ninguna | Ninguna | **PENDIENTE** | Prioridad P1; depende de HU-14. |
| **HU-17** | Recibir aviso de asignación | Inexistente | Inexistente | Ninguna | Ninguna | **PENDIENTE** | Prioridad P1; depende de HU-14 y módulo de avisos. |
| **HU-18** | Mantener propiedades y propietarios | `PropertiesPage.tsx`, `PropertyFormModal.tsx` | `properties.ts` (`/api/propiedades`) | Real | Matriz de ownership en `authorization-int03.test.ts` | **COMPLETO_VERIFICADO** | Filtrado estricto por `usuarioId` del propietario. |
| **HU-19** | Crear y desactivar cuentas internas | `PendingModuleView.tsx` (`/personal`) | Modelo `User` con campo `isActive` | Parcial (Vía seed script) | Pruebas de rechazo de usuario inactivo | **PARCIAL** | Falta interfaz gráfica de administración de usuarios. |
| **HU-20** | Consultar trazabilidad operativa | Vista de eventos en modales | Tabla `auditoria_eventos` | Real (Eventos en pagos y reservas) | Verificado en auditoría de mutaciones | **IMPLEMENTADO_NO_VALIDADO_E2E** | Los eventos se persisten; falta consola gráfica consolidada. |
| **HU-21** | Registrar gastos asociados a propiedad | `ExpensesPage.tsx`, `ExpenseFormModal.tsx` | `expenses.ts` (`/api/gastos`) | Real | Pruebas de aprobación y sustentación | **COMPLETO_VERIFICADO** | Registro por inmueble con comprobante y categorización. |
| **HU-22** | Corregir registros sin perder historial | Anulación de pagos y gastos con motivo | Persistencia inmutable con flags | Real | Pruebas de integridad financiera | **COMPLETO_VERIFICADO** | Los registros se marcan `ANULADO` o `RECHAZADO`; no hay borrado físico. |
| **HU-23** | Consultar estados y errores del proceso | Manejo estandarizado en modales | `app.setErrorHandler` (`requestId`) | Real | Pruebas de formato JSON de error | **COMPLETO_VERIFICADO** | Códigos estandarizados (`DOMAIN_IDENTITY_REQUIRED`, `VALIDATION_ERROR`). |

### Balance Cuantitativo Conciliado (Suma Exacta = 23):
* **COMPLETO_VERIFICADO:** 13 (56.5%)
* **IMPLEMENTADO_NO_VALIDADO_E2E:** 2 (8.7%)
* **PARCIAL:** 1 (4.3%)
* **PENDIENTE:** 6 (26.1%) — `HU-07`, `HU-10`, `HU-12`, `HU-14`, `HU-16`, `HU-17`
* **BLOQUEADO_DECISION:** 1 (4.3%) — `HU-15`
* **TOTAL:** **23 historias de usuario**

---

## 4. Estado de Seguridad

* **Credenciales:** Hash con algoritmo `bcrypt` (10 rounds). Ninguna credencial ni secreto se expone en código, logs ni respuestas API.
* **Sesiones:** Refresh tokens almacenados con hash SHA-256 en la tabla `auth_sessions`. Rotación forzosa en cada uso. Revocación de toda la familia de tokens al detectar reuso o ejecutar logout.
* **Aislamiento Multi-Tenant (Propietarios):** Si un usuario autenticado posee rol `PROPIETARIO`, sus consultas a propiedades y calendario quedan estrictamente acotadas a `propiedad.propietarioId === request.user.usuarioId`. Si carece de vínculo transaccional, se rechaza de plano con HTTP 403 `DOMAIN_IDENTITY_REQUIRED`.
* **Inmunidad Financiera:** Pagos conciliados y garantías en custodia prohíben su eliminación. La desactivación de propiedades es lógica (`activa = false`).

---

## 5. Estado de Base de Datos y Entornos de Migración

Es fundamental distinguir el estado de las migraciones según cada entorno:

1. **Migraciones Existentes en el Monorepo (9 archivos SQL en `backend/prisma/migrations/`):**
   * `20261028180000_init_postgresql_core`
   * `20261029000000_auth_users_and_sessions`
   * `20261030010000_dr02_requisitos_confirmacion_contratos_evidencias`
   * `20261030020000_dr02_gastos_sustentos`
   * `20261030030000_dr03_add_estado_reserva_expirada`
   * `20261030040000_dr03_avisos_reserva_outbox`
   * `20261030050000_dr03_reserva_exclusion_constraint` (Requiere `btree_gist`)
   * `20261030060000_dr03_avisos_reserva_checks_and_restrict_fk`
   * `20261030080000_int01_user_usuario_link` (`ON DELETE RESTRICT`)
2. **Entorno de Pruebas Local (`daplace_test`):**
   * Las 9 migraciones se encuentran **completamente aplicadas y comprobadas**. Los 234 tests automatizados de backend corren exitosamente contra este esquema.
3. **Entorno de Desarrollo Local (`daplace_rentals`):**
   * Gestionado mediante el contenedor local de Docker (`compose.yaml`). Requiere ejecutar `npm run db:migrate:deploy` y `npm run db:seed` tras levantar el contenedor.
4. **Entornos de Staging / Producción:**
   * **Inexistentes en esta etapa.** No se afirma ningún despliegue en la nube ni aplicación de migraciones en servidores remotos.

---

## 6. Estado de Calidad y Pruebas

* **Backend Unit & Integration:** 234 pruebas exitosas en `daplace_test` contra PostgreSQL real.
* **Frontend Component & Integration:** 140 pruebas exitosas con Vitest.
* **Typechecking:** TypeScript estricto con 0 errores en backend y frontend.
* **Builds:** Producción de paquetes sin advertencias.
* **Pruebas E2E automatizadas:** Pendientes de implementación con Playwright (se cuenta con validación manual guiada).

---

## 7. Alcance y Clasificación del Guion de Demostración (11 Pasos)

Los 11 pasos documentados en [docs/12-DEMO-MVP.md](12-DEMO-MVP.md) se clasifican como:
* **`SOPORTADO_POR_PRUEBAS_PARCIALES`:** Cuentan con pruebas unitarias y de integración de API/PostgreSQL y pruebas de componentes React.
* **`PENDIENTE_VERIFICACION_MANUAL`:** Requieren ensayo conjunto en navegador antes de la presentación.
* Ningún paso está **`BLOQUEADO`** ni incluye funciones placeholder.

| Paso | Acción | Ruta | Clasificación |
| :---: | :--- | :--- | :---: |
| 1 | Inicio de Sesión Seguro | `/login` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 2 | Inspección y Alta de Inmueble | `/propiedades` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 3 | Consulta del Calendario Operativo | `/calendario` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 4 | Directorio y Registro de Huéspedes | `/huespedes` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 5 | Creación de Reserva y Prevención de Solapes | `/reservas` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 6 | Confirmación de Reserva y Contrato | `/reservas` (Modal) | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 7 | Reflejo Inmediato en Calendario | `/calendario` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 8 | Registro y Conciliación de Pagos | `/pagos` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 9 | Custodia de Garantía y Devolución | `/garantias` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 10 | Registro de Gastos Operativos | `/gastos` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |
| 11 | Aislamiento Multi-Tenant de Propietario | `/propiedades`, `/calendario` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual) |

---

## 8. Estado Git y Control de Fuentes

* **Rama Activa:** `feat/integration-andre-diego-auth`
* **Commit Local (HEAD):** `8c6c661c7f494b75f5eb3a08f2fdc2184d01c0a2`
* **Padre 1:** `81eab929838f08671f74d25d95cfd9d3947d6f79` (André)
* **Padre 2:** `4b4e0eb9a97f688c6e1d7395acdadcd76883ba87` (Diego)
* **Estado de Publicación:** Local. No se ha ejecutado `git push` ni creado Pull Request formal a `origin/integration/andre-diego-20261029`.
