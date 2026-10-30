# 12 — Guion de Demostración del MVP (Demostrable y Reproducible)

**Fecha de Actualización:** 30 de octubre de 2026
**Fecha de Demostración:** Lunes 2 de noviembre de 2026, 18:30 (America/Lima)
**Entorno:** Local de Demostración (`http://127.0.0.1:5173`) conectado a PostgreSQL local (`daplace_rentals` / `daplace_test`).
**Estado:** VALIDADO TÉCNICAMENTE MEDIANTE PRUEBAS UNITARIAS Y DE INTEGRACIÓN DE API.

---

## 1. Precondiciones Técnicas

1. Contenedor PostgreSQL local activo con `npm run db:up` y migraciones aplicadas (`npm run db:migrate:deploy`).
2. Datos sintéticos cargados con `npm run db:seed`.
3. Servidor backend activo en puerto 3000 (`npm run dev:api`) y frontend en puerto 5173 (`npm run dev:web`).
4. Navegador abierto en modo incógnito o con caché limpia en `http://127.0.0.1:5173`.

---

## 2. Recorrido Paso a Paso y Clasificación de Ejecución

Conforme a las directrices de auditoría, cada paso se clasifica rigurosamente:
* **`SOPORTADO_POR_PRUEBAS_PARCIALES`:** El backend cuenta con pruebas de integración API/PostgreSQL y el frontend con pruebas de componentes, pero el flujo conjunto en navegador vivo está **`PENDIENTE_VERIFICACION_MANUAL`** durante el ensayo general.
* Ningún paso está **`BLOQUEADO`** ni incluye funciones placeholder.

| Paso | Acción en la Interfaz | Actor / Rol | Ruta Frontend | Endpoint Backend | Permisos / Datos Requeridos | Pruebas Automatizadas Disponibles | Clasificación de Ejecución |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | **Inicio de Sesión Seguro** | `Valeria Méndez` (`ADMINISTRADOR`) | `/login` | `POST /auth/login` | Público. Correo `admin.dev@daplace.pe` o selector demo "Administrador". | `auth.test.ts`, `auth-security-int02.test.ts`, `client-integration-int04.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **2** | **Inspección y Alta de Inmueble** | `Valeria Méndez` | `/propiedades` | `GET /api/propiedades`, `POST /api/propiedades`, `GET /api/propietarios` | `ADMIN`, `OPERADOR`. Datos de propiedad vinculada a "Carlos Eduardo Méndez". | `authorization-int03.test.ts` (test 1, 7), suite de propiedades | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **3** | **Consulta del Calendario Operativo** | `Valeria Méndez` | `/calendario` | `GET /api/calendario?propiedadId=...&mes=...&anio=...` | `ADMIN`, `OPERADOR`, `PROPIETARIO`. Rango mensual. | `authorization-int03.test.ts` (test 4), suite de calendario | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **4** | **Directorio y Registro de Huéspedes** | `Diego Navarro` (`OPERADOR`) | `/huespedes` | `GET /api/huespedes`, `POST /api/huespedes` | `ADMIN`, `OPERADOR`. Nombre completo, teléfono o email obligatorio. | `guests.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **5** | **Creación de Reserva y Prevención de Solapes** | `Diego Navarro` | `/reservas` | `POST /api/reservas` | `ADMIN`, `OPERADOR`. Fechas `[ingreso, salida)`, monto, origen. | `reservations.test.ts`, constraint `reserva_no_solapada_excl` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **6** | **Confirmación de Reserva y Contrato** | `Valeria Méndez` | `/reservas` (Modal) | `POST /api/contratos`, `POST /api/reservas/:id/confirmar` | `ADMIN`, `OPERADOR`. Contrato referenciado firmado y validado. | `contracts.ts`, `confirmationRequirements.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **7** | **Reflejo Inmediato en Calendario** | `Valeria Méndez` | `/calendario` | `GET /api/calendario`, `GET /api/reservas/:id` | `ADMIN`, `OPERADOR`. ID de reserva confirmada en paso 6. | `reservationPageCoordinator.test.ts` (refresco por ID) | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **8** | **Registro y Conciliación de Pagos** | `Valeria Méndez` | `/pagos` | `POST /api/pagos`, `POST /api/pagos/:pagoId/evidencias`, `POST /api/pagos/:id/conciliar` | Registro: `ADMIN`, `OPERADOR`. Conciliación: `ADMIN`. Voucher digital. | `payments.test.ts` (idempotencia y saldo exacto) | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **9** | **Custodia de Garantía y Devolución** | `Diego Navarro` | `/garantias` | `POST /api/garantias`, `POST /api/garantias/:id/movimientos` | `ADMIN`, `OPERADOR`. Depósito en custodia, retención o devolución. | `guarantees.test.ts` (invariante de saldo no negativo) | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **10** | **Registro de Gastos Operativos** | `Diego Navarro` | `/gastos` | `POST /api/gastos`, `POST /api/gastos/:gastoId/sustentos` | `ADMIN`, `OPERADOR`. Gasto de propiedad con sustento adjunto. | `expenses.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |
| **11** | **Aislamiento Multi-Tenant de Propietario** | `Carlos Méndez` (`PROPIETARIO`) | `/propiedades` y `/calendario` | `POST /auth/logout`, `POST /auth/login`, `GET /api/propiedades`, `GET /api/calendario` | `PROPIETARIO` vinculado a `Usuario.id`. | `authorization-int03.test.ts` (test 1, 2, 7), `identity-link-int01.test.ts` | **SOPORTADO_POR_PRUEBAS_PARCIALES** (Pendiente verificación manual en vivo) |

---

## 3. Elementos Excluidos de la Presentación (No Intentar en Vivo)

* **Rutas Placeholder (`PendingModuleView`):**
  * `/dashboard`: Pendiente de agregación de métricas.
  * `/reportes`: Pendiente de finalización de endpoint (P0-02). Si se culmina en J4, se incorporará como paso 12.
  * `/personal`: Gestión de usuarios se realiza vía base de datos / seeds.
  * `/mantenimiento`: Órdenes de trabajo de campo fuera de alcance de la demo mínima.
* **Envío real de correos electrónicos:** Los avisos de outbox se muestran directamente en base de datos (`avisos_reserva`), sin despachar correos por SMTP para evitar alertas espurias.

---

## 4. Procedimiento de Restauración Rápida (En Caso de Fallo)

Si durante el ensayo ocurre un error de manipulación de datos:

1. Detener procesos en terminal (`Ctrl + C`).
2. Ejecutar reseteo rápido y seguro:
   ```powershell
   npm run db:migrate:deploy
   npm run db:seed
   ```
3. Reiniciar con `npm run dev`. El entorno regresa a su estado prístino en menos de 10 segundos.
