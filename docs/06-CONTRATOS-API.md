# 06 — Contratos API REST del Sistema

**Estado:** APROBADO E IMPLEMENTADO (Refleja las rutas registradas en Fastify al 30 de octubre de 2026).
**Formato de Comunicación:** JSON (`application/json`) con UTF-8.
**Autenticación:** Encabezado `Authorization: Bearer <access_token>` para peticiones de API; Cookie `HttpOnly` para refresh tokens en `/auth`.

---

## 1. Módulo de Autenticación (`/auth`)

| Método | Ruta | Autenticación | Entrada | Salida Exitosa | Códigos de Error |
| :--- | :--- | :---: | :--- | :--- | :---: |
| `POST` | `/auth/login` | Pública | `{ email, password }` | `200 { user, accessToken, expiresIn }` (+ Set-Cookie refresh token) | 400, 401 |
| `POST` | `/auth/refresh` | Cookie `HttpOnly` | Ninguna | `200 { user, accessToken, expiresIn }` (+ Set-Cookie nuevo refresh token) | 401, 409 |
| `POST` | `/auth/logout` | Bearer o Cookie | Encabezado `X-Requested-With: XMLHttpRequest` | `204 No Content` (Revoca familia y limpia cookie) | 401 |
| `GET` | `/auth/me` | Bearer | Ninguna | `200 { user }` | 401 |

---

## 2. Módulo de Propiedades (`/api/propiedades` y `/api/propietarios`)

| Método | Ruta | Roles Permitidos | Entrada / Parámetros | Salida Exitosa |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/propiedades` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | `?search=&estadoOperativo=&estadoPublicacion=&soloActivas=` | `200 Property[]` (Si es PROPIETARIO, filtra automáticamente por su `usuarioId`). |
| `GET` | `/api/propiedades/:id` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | Parámetro `:id` | `200 Property` (403 si pertenece a otro propietario). |
| `POST` | `/api/propiedades` | `ADMIN`, `OPERADOR` | `{ nombre, direccion, propietarioId, capacidadHuespedes, precioBaseNoche, estadoOperativo, estadoPublicacion }` | `201 Property` |
| `PATCH` | `/api/propiedades/:id` | `ADMIN`, `OPERADOR` | Campos modificables de la propiedad | `200 Property` |
| `PATCH` | `/api/propiedades/:id/activa` | `ADMIN`, `OPERADOR` | `{ activa: boolean }` (Baja lógica) | `200 Property` |
| `GET` | `/api/propietarios` | `ADMIN`, `OPERADOR` | Ninguna | `200 Usuario[]` (Usuarios con rol `PROPIETARIO`). |

---

## 3. Módulo de Huéspedes (`/api/huespedes`)

| Método | Ruta | Roles Permitidos | Entrada / Parámetros | Salida Exitosa |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/huespedes` | `ADMIN`, `OPERADOR` | `?search=` | `200 Guest[]` |
| `GET` | `/api/huespedes/:id` | `ADMIN`, `OPERADOR` | Parámetro `:id` | `200 GuestWithReservations` (incluye reservas asociadas). |
| `POST` | `/api/huespedes` | `ADMIN`, `OPERADOR` | `{ nombreCompleto, telefono, email, tipoDocumento, numeroDocumento, nacionalidad, notas }` | `201 Guest` (Exige al menos teléfono o email). |
| `PATCH` | `/api/huespedes/:id` | `ADMIN`, `OPERADOR` | Campos modificables del huésped | `200 Guest` |

---

## 4. Módulo de Reservas y Disponibilidad (`/api/reservas` y `/api/calendario`)

| Método | Ruta | Roles Permitidos | Entrada / Parámetros | Salida Exitosa |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/reservas` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | `?propiedadId=&huespedId=&estado=&origen=&desde=&hasta=` | `200 Reservation[]` |
| `GET` | `/api/reservas/:id` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | Parámetro `:id` | `200 Reservation` |
| `POST` | `/api/reservas` | `ADMIN`, `OPERADOR` | `{ propiedadId, huespedId, ingreso, salida, montoAcordado, moneda, origen, referenciaCanal, notas }` | `201 Reservation` (Estado inicial: `SOLICITADA`). |
| `POST` | `/api/reservas/:id/confirmar` | `ADMIN`, `OPERADOR` | `{}` | `200 Reservation` (Verifica adelanto mínimo, contrato y ausencia de solapes). |
| `PATCH` | `/api/reservas/:id/fechas` | `ADMIN`, `OPERADOR` | `{ ingreso, salida, motivo }` | `200 Reservation` (Comprueba solapes excluyendo la propia reserva). |
| `POST` | `/api/reservas/:id/cancelar` | `ADMIN`, `OPERADOR` | `{ motivo }` | `200 Reservation` (Estado: `CANCELADA`, libera el intervalo). |
| `GET` | `/api/reservas/disponibilidad` | Público / Todos | `?propiedadId=&ingreso=&salida=` | `200 { disponible: boolean, propiedadId, intervalo, conflicto? }` |
| `GET` | `/api/calendario` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | `?propiedadId=&mes=&anio=` | `200 { days: CalendarDay[] }` (Matriz de ocupación mensual). |

---

## 5. Módulo de Pagos y Evidencias (`/api/pagos` y `/api/evidencias-pago`)

| Método | Ruta | Roles Permitidos | Entrada / Parámetros | Salida Exitosa |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/pagos` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | `?reservaId=&estado=&fechaDesde=&fechaHasta=` | `200 { data: Payment[] }` |
| `GET` | `/api/pagos/:id` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | Parámetro `:id` | `200 { data: Payment }` |
| `POST` | `/api/pagos` | `ADMIN`, `OPERADOR` | `{ reservaId, monto, moneda, concepto, metodoPago, referenciaOperacion, fechaPago, idempotencyKey, notas, beneficiarioTipo, ... }` | `201 { data: Payment }` (Estado: `PENDIENTE_CONCILIACION`). |
| `POST` | `/api/pagos/:id/conciliar` | `ADMIN` | `{}` | `200 { data: Payment }` (Estado: `CONCILIADO`). |
| `POST` | `/api/pagos/:id/rechazar` | `ADMIN` | `{ motivo }` | `200 { data: Payment }` (Estado: `RECHAZADO`). |
| `GET` | `/api/reservas/:reservaId/saldo` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | Parámetro `:reservaId` | `200 { data: ReservationFinancialSummary }` (Saldo exigible exacto). |
| `POST` | `/api/pagos/:pagoId/evidencias` | `ADMIN`, `OPERADOR` | `{ nombreArchivo, url, referenciaDocumental, idempotencyKey }` | `201 { data: PaymentEvidence }` |
| `POST` | `/api/evidencias-pago/:id/validar` | `ADMIN` | `{}` | `200 { data: PaymentEvidence }` |

---

## 6. Módulo de Garantías (`/api/garantias`)

| Método | Ruta | Roles Permitidos | Entrada / Parámetros | Salida Exitosa |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/garantias` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | `?reservaId=&estado=` | `200 { data: Guarantee[] }` |
| `GET` | `/api/garantias/:id` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | Parámetro `:id` | `200 { data: Guarantee }` |
| `POST` | `/api/garantias` | `ADMIN`, `OPERADOR` | `{ reservaId, montoTotal, moneda }` | `201 { data: Guarantee }` |
| `POST` | `/api/garantias/:id/movimientos` | `ADMIN`, `OPERADOR` | `{ tipo: 'RETENCION'|'DEVOLUCION_PARCIAL'|'DEVOLUCION_TOTAL', monto, motivo, documentoSoporte, idempotencyKey }` | `201 { data: Guarantee }` (Actualiza estado y saldo). |

---

## 7. Módulo de Gastos y Sustentos (`/api/gastos`)

| Método | Ruta | Roles Permitidos | Entrada / Parámetros | Salida Exitosa |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/gastos` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | `?propiedadId=&periodoMes=&periodoAnio=&categoria=&estado=` | `200 { data: Expense[] }` |
| `GET` | `/api/gastos/:id` | `ADMIN`, `OPERADOR`, `PROPIETARIO` | Parámetro `:id` | `200 { data: Expense }` |
| `POST` | `/api/gastos` | `ADMIN`, `OPERADOR` | `{ propiedadId, fechaGasto, periodoMes, periodoAnio, titulo, categoria, monto, moneda, pagadoPor, idempotencyKey }` | `201 { data: Expense }` (Estado: `REGISTRADO`). |
| `POST` | `/api/gastos/:id/anular` | `ADMIN` | `{ motivo }` | `200 { data: Expense }` (Estado: `ANULADO`). |
| `POST` | `/api/gastos/:gastoId/sustentos` | `ADMIN`, `OPERADOR` | `{ nombreArchivo, url, tipo }` | `201 { data: ExpenseEvidence }` |

---

## 8. Módulo de Contratos de Reserva (`/api/contratos`)

| Método | Ruta | Roles Permitidos | Entrada / Parámetros | Salida Exitosa |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/contratos` | `ADMIN`, `OPERADOR` | `?reservaId=` | `200 { data: ReservationContract[] }` |
| `POST` | `/api/contratos` | `ADMIN`, `OPERADOR` | `{ reservaId, nombreOriginal, urlReferencia, idempotencyKey }` | `201 { data: ReservationContract }` |
| `POST` | `/api/contratos/:id/validar` | `ADMIN` | `{ motivo }` | `200 { data: ReservationContract }` |
| `POST` | `/api/contratos/:id/rechazar` | `ADMIN` | `{ motivo }` | `200 { data: ReservationContract }` |

---

## 9. Diagnóstico y Monitoreo del Sistema

* `GET /health`: Estado del proceso Fastify (`200 { status: 'ok' }`).
* `GET /health/ready`: Comprobación activa de la conexión a PostgreSQL (`200 { status: 'ready', dependencies: { database: 'available' } }` o `503 DEPENDENCY_UNAVAILABLE`).
