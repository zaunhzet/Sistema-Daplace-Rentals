# 12 — Guion de Demostración del MVP (Demostrable y Reproducible)

**Fecha de Actualización:** 30 de octubre de 2026 (Corte RBAC-UI-01 Final Gate)
**Fecha de Demostración:** Lunes 2 de noviembre de 2026, 18:30 (America/Lima)
**Entorno:** Local de Demostración (`http://127.0.0.1:5173`) conectado a PostgreSQL local (`daplace_rentals` / `daplace_test`).
**Estado:** VALIDADO TÉCNICAMENTE CON SUITES AUTOMATIZADAS (239 Backend + 148 Frontend PASS) Y SIMULACIÓN TRANSACCIONAL DE PUNTA A PUNTA.

---

## 1. Preparación Exacta del Entorno y Orden Seguro de Inicialización

Para garantizar la integridad relacional de claves foráneas y la vinculación de identidades, el orden de inicialización debe ejecutarse de la siguiente manera:

### Orden de Inicialización Obligatorio

1. **Levantar el motor de base de datos PostgreSQL local:**
   ```bash
   npm run db:up
   ```
2. **Aplicar migraciones de base de datos:**
   ```bash
   npm run db:migrate:deploy
   ```
3. **Paso 1 de Sembrado — Entidades de Dominio Transaccional:**
   * Debe ejecutarse **primero** para poblar las tablas base (`usuarios`, `propiedades`, `huespedes`, `reservas`, `pagos`, `garantias`).
   ```bash
   npm run db:seed:dev
   ```
   *(Ejecuta `backend/src/scripts/seed.ts` creando los actores de dominio `usr-admin`, `usr-operador`, `usr-102`, etc.)*

4. **Paso 2 de Sembrado — Cuentas de Acceso y Credenciales:**
   * Debe ejecutarse **después** para crear las cuentas de autenticación (`users`) y vincularlas de forma determinista mediante foreign key a las entidades de dominio creadas en el Paso 1.
   ```bash
   npm run db:seed
   ```
   *(Ejecuta `backend/src/scripts/seed-dev.ts` vinculando `propietario.dev@daplace.pe` a `usr-102` y asegurando idempotencia).*

5. **Iniciar los servidores de desarrollo:**
   ```bash
   npm run dev
   ```
   *(Backend en `http://127.0.0.1:3000` y Frontend en `http://127.0.0.1:5173`)*.

6. **Abrir navegador:**
   * Navegar en modo incógnito a `http://127.0.0.1:5173`.

---

## 2. Cuentas de Prueba Sintéticas por Rol

> [!NOTE]
> Las contraseñas se configuran localmente mediante la variable de entorno `DEV_DEFAULT_PASSWORD` (mínimo 8 caracteres). Para la demostración local se puede utilizar la interfaz con el selector directo de usuarios de prueba en `/login`.

| Rol | Correo Demo | Nombre en Pantalla | Identidad Dominio Vinculada | Módulos Autorizados en UI |
| :--- | :--- | :--- | :--- | :--- |
| **ADMINISTRADOR** | `admin.dev@daplace.pe` | Valeria Méndez | `usr-admin` | Todos los módulos operativos y placeholders. |
| **OPERADOR** | `operador.dev@daplace.pe` | Diego Navarro | `usr-operador` | Operaciones (`/propiedades`, `/calendario`, `/huespedes`, `/reservas`) y Finanzas (`/pagos`, `/garantias`, `/gastos`). |
| **PROPIETARIO** | `propietario.dev@daplace.pe` | Carlos Echevarría | `usr-102` ("Carlos Eduardo Méndez") | **Únicamente** `/propiedades` y `/calendario` de sus inmuebles (`prop-01`, `prop-04`). |
| **CLIENTE** | `cliente.dev@daplace.pe` | Ana Sofía Rivas | *Sin vínculo (null)* | **Sin acceso** al panel administrativo. |

---

## 3. Recorrido Paso a Paso y Clasificación de Ejecución

Conforme a las directrices de auditoría, cada paso se clasifica rigurosamente:
* **`SOPORTADO_POR_PRUEBAS_PARCIALES`:** El backend cuenta con pruebas de integración API/PostgreSQL y el frontend con pruebas de componentes, pero el flujo conjunto en navegador vivo está **`PENDIENTE_VERIFICACION_MANUAL`** durante el ensayo general.
* Ningún paso está **`BLOQUEADO`** ni incluye funciones placeholder como si fuesen definitivas.

| Paso | Acción en la Interfaz | Actor / Rol | Ruta Frontend | Endpoint Backend | Permisos / Datos Requeridos | Pruebas Automatizadas Disponibles | Clasificación de Ejecución |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | **Inicio de Sesión Seguro y RBAC** | `Valeria Méndez` (`ADMINISTRADOR`) | `/login` | `POST /auth/login` | Público. Correo `admin.dev@daplace.pe` o selector demo "Administrador". Redirección automática a módulo autorizado. | `auth.test.ts`, `routing.test.ts`, `auth-security-int02.test.ts`, `client-integration-int04.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **2** | **Inspección, Registro de Propietario y Alta de Inmueble** | `Valeria Méndez` | `/propiedades` | `GET /api/propiedades`, `POST /api/propietarios`, `POST /api/propiedades`, `GET /api/propietarios` | `ADMIN`, `OPERADOR`. Registro modal de nuevo propietario de dominio con autoselección en el formulario de propiedad. | `authorization-int03.test.ts` (test 1, 7, 8, 9), `properties-guests.test.ts` (test 7b, 7c, 7d), `properties.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **3** | **Consulta del Calendario Operativo** | `Valeria Méndez` | `/calendario` | `GET /api/calendario?propiedadId=...&mes=...&anio=...` | `ADMIN`, `OPERADOR`, `PROPIETARIO`. Rango mensual. | `authorization-int03.test.ts` (test 4), suite de calendario | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **4** | **Directorio y Registro de Huéspedes** | `Diego Navarro` (`OPERADOR`) | `/huespedes` | `GET /api/huespedes`, `POST /api/huespedes` | `ADMIN`, `OPERADOR`. Nombre completo, teléfono o email obligatorio. | `guests.test.ts`, `properties-guests.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **5** | **Creación de Reserva y Prevención de Solapes** | `Diego Navarro` | `/reservas` | `POST /api/reservas` | `ADMIN`, `OPERADOR`. Fechas `[ingreso, salida)`, monto, origen. | `reservations.test.ts`, constraint `reserva_no_solapada_excl` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **6** | **Confirmación de Reserva y Contrato** | `Valeria Méndez` | `/reservas` (Modal) | `POST /api/contratos`, `POST /api/reservas/:id/confirmar` | `ADMIN`, `OPERADOR`. Contrato referenciado firmado y validado. | `contracts.ts`, `confirmationRequirements.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **7** | **Reflejo Inmediato en Calendario** | `Valeria Méndez` | `/calendario` | `GET /api/calendario`, `GET /api/reservas/:id` | `ADMIN`, `OPERADOR`. ID de reserva confirmada en paso 6. | `reservationPageCoordinator.test.ts` (refresco por ID) | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **8** | **Registro y Conciliación de Pagos** | `Valeria Méndez` | `/pagos` | `POST /api/pagos`, `POST /api/pagos/:pagoId/evidencias`, `POST /api/pagos/:id/conciliar` | Registro y Conciliación: `ADMIN`, `OPERADOR`. Voucher digital. | `financial-payments-guarantees.test.ts`, `payments-evidence-dr01.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **9** | **Custodia de Garantía y Devolución** | `Diego Navarro` | `/garantias` | `POST /api/garantias`, `POST /api/garantias/:id/movimientos` | `ADMIN`, `OPERADOR`. Depósito en custodia, retención o devolución. | `guarantees.test.ts` (invariante de saldo no negativo) | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **10** | **Registro de Gastos Operativos** | `Diego Navarro` | `/gastos` | `POST /api/gastos`, `POST /api/gastos/:gastoId/sustentos` | `ADMIN`, `OPERADOR`. Gasto de propiedad con sustento adjunto. | `expenses.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **11** | **Cierre de Sesión Seguro y Resiliente** | `Valeria Méndez` / `Diego Navarro` | Layout Admin | `POST /auth/logout` | Sesión activa. Manejo de estado de carga, revocación en servidor y descarte por `authEpoch`. | `client-integration-int04.test.ts`, `auth-security-int02.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **12** | **Aislamiento Multi-Tenant y Restricción UI de Propietario** | `Carlos Méndez` (`PROPIETARIO`) | `/propiedades` y `/calendario` | `POST /auth/login`, `GET /api/propiedades`, `GET /api/calendario` | `PROPIETARIO` vinculado a `Usuario.id` (`usr-102`). Solo ve propiedades y calendario propios; sin acciones de edición/creación; rutas ajenas muestran 403. | `authorization-int03.test.ts` (test 1, 2, 7, 8, 9), `identity-link-int01.test.ts`, `routing.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |

---

## 4. Lista de Comprobación Manual Paso a Paso (Flujo de Diego)

Para ejecutar la verificación manual en navegador Chrome:

1. **Login como Administrador:**
   - Ir a `http://127.0.0.1:5173/login`.
   - Seleccionar "Administrador" (o `admin.dev@daplace.pe`).
   - Clic en "Iniciar Sesión". Debe redirigir a `/dashboard` (o `/propiedades`).
2. **Registrar Propietario en Caliente:**
   - Ir a `/propiedades`.
   - Clic en "Registrar Propiedad".
   - En el campo Propietario, pulsar "+ Agregar Propietario".
   - Completar: Nombre: "Propietario Demo Barranco", Email: "barranco.owner@daplace.pe", Teléfono: "999888777".
   - Clic en "Registrar Propietario".
   - Verificar: El modal se cierra, el nuevo propietario aparece seleccionado automáticamente.
3. **Completar Registro de Propiedad:**
   - Ingresar Nombre: "Barranco Loft 501", Dirección: "Av. Grau 500, Dpto 501", Capacidad: 2, Precio: 280.
   - Guardar propiedad.
   - Verificar: La propiedad aparece en la grilla y el backend guardó el `propietarioId` correcto.
4. **Registrar Huésped:**
   - Navegar a `/huespedes`.
   - Clic en "Registrar Huésped".
   - Completar Nombre: "Lucía Paredes", Email: "lucia.paredes@example.invalid", Teléfono: "912345678".
   - Guardar y verificar que el huésped figure en la lista con persistencia en PostgreSQL.
5. **Cerrar Sesión:**
   - En el encabezado / sidebar, pulsar el botón "Cerrar Sesión".
   - Verificar: El botón muestra el spinner de carga (`Loader2`), se deshabilita temporalmente y redirige limpiamente a `/login`.
6. **Login como Propietario:**
   - Seleccionar "Propietario" (`propietario.dev@daplace.pe`).
   - Clic en "Iniciar Sesión".
   - Verificar: Redirige automáticamente a `/propiedades`.
   - Verificar: En el sidebar **solo** se muestran los enlaces `/propiedades` y `/calendario`.
   - Verificar: En `/propiedades` **no** aparece el botón "Registrar Propiedad", ni botones "Editar" o "Desactivar" en las tarjetas.
   - Verificar: Solo se listan los inmuebles pertenecientes a `usr-102` (`prop-01` y `prop-04`).
7. **Prueba Negativa de Navegación Directa por URL:**
   - En la barra de direcciones del navegador, ingresar manualmente `http://127.0.0.1:5173/pagos`.
   - Verificar: La aplicación intercepta el acceso y muestra la pantalla **403 — Acceso Denegado** con el mensaje explicativo y el botón "Volver al módulo seguro".
   - Pulsar "Volver al módulo seguro": debe retornar a `/propiedades`.

---

## 5. Contingencias para la Presentación

1. **Si ocurre un bloqueo en el puerto o procesos colgados:**
   - Ejecutar en PowerShell:
     ```powershell
     npm run dev
     ```
   - Si un proceso previo quedó en segundo plano, reiniciar terminales o invocar `kill` sobre el PID respectivo.
2. **Si se requiere regresar la base de datos a su estado prístino en menos de 10 segundos:**
   - Ejecutar en el orden seguro:
     ```powershell
     npm run db:migrate:deploy
     npm run db:seed:dev
     npm run db:seed
     ```
3. **Si el propietario intenta consultar huéspedes o pagos:**
   - El sistema responderá formalmente con pantalla 403 `ForbiddenPage`, lo cual es el comportamiento esperado y documentado para demostrar el aislamiento de seguridad ante la audiencia.

---

## 6. Elementos Excluidos de la Presentación (No Intentar en Vivo)

* **Rutas Placeholder (`PendingModuleView`):**
  * `/dashboard`: Pendiente de agregación de métricas analíticas.
  * `/reportes`: Pendiente de finalización de endpoint (P0-02).
  * `/personal`: Gestión de usuarios administrativos se realiza vía CLI/Seed (HU-19 pendiente).
  * `/mantenimiento`: Órdenes de trabajo de campo fuera del alcance del MVP transaccional.
* **Envío real de correos electrónicos:** Los avisos de outbox se inspeccionan directamente en base de datos (`avisos_reserva`), sin despachar correos por SMTP para evitar alertas espurias.
