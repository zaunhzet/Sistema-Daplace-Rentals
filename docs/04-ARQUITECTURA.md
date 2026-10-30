# 04 — Arquitectura del Sistema

**Estado:** APROBADA E IMPLEMENTADA (Consolidada tras integración André–Diego el 30 de octubre de 2026).
**Monorepo:** React 19 (Frontend) + Fastify 5 (Backend) + PostgreSQL 16 con Prisma ORM 7.

---

## 1. Estructura Real del Monorepo

```text
daplace-rentals/
├── frontend/
│   ├── src/app/                     # Shell operativo (AdminLayout, Enrutador, App)
│   ├── src/features/
│   │   ├── auth/                    # LoginForm, AuthContext, authClient, sesiones
│   │   ├── properties/              # PropertiesPage, modales de alta/edición, filtros
│   │   ├── guests/                  # GuestsPage, modales de registro de huéspedes
│   │   ├── reservations/            # ReservationsPage, confirmación, reprogramación, contratos
│   │   ├── calendar/                # CalendarPage, CalendarGrid mensual, badges de transición
│   │   ├── payments/                # PaymentsPage, conciliación, vouchers probatorios
│   │   ├── guarantees/              # GuaranteesPage, libro mayor de movimientos
│   │   ├── expenses/                # ExpensesPage, sustentos de gastos, aprobación
│   │   └── public-booking/          # Catálogo y reservas públicas (bajo feature flag)
│   └── src/shared/api/              # Cliente apiClient con authEpoch y reintento 401
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma            # Esquema relacional centralizado
│   │   └── migrations/              # 9 migraciones SQL versionadas
│   ├── src/app/                     # Servidor Fastify, plugins, CORS y hook de autenticación
│   ├── src/modules/
│   │   ├── auth/                    # Repositorio atómico, servicio, rutas y middleware JWT
│   │   └── reservations/            # Expiración transaccional (DR-03), reloj y outbox de avisos
│   ├── src/routes/                  # Rutas REST de dominio (propiedades, pagos, garantías, etc.)
│   ├── src/shared/                  # Tipos unificados de usuario y autorización
│   └── src/scripts/                 # Seed seguro, reseteo de pruebas y worker de avisos
└── docs/                            # Documentación técnica, matrices y auditorías
```

---

## 2. Separación de Identidades: `User` vs `Usuario`

El sistema desacopla explícitamente las credenciales de acceso de las entidades transaccionales del negocio:

* **Modelo `User` (Autenticación y Sesiones):**
  * Responsabilidad: Identidad de acceso, correo único, contraseña cifrada con `bcrypt` (10 rounds), rol RBAC (`ADMINISTRADOR`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`), estado de activación `isActive` y sesiones.
  * Clave primaria: UUID (`id`).
* **Modelo `Usuario` (Identidad Transaccional de Dominio):**
  * Responsabilidad: Participación en contratos, propietario legal de inmuebles, conciliador contable de pagos, autorizador de gastos y actor de auditoría.
  * Clave primaria: UUID (`id`).
* **Vínculo Transaccional Obligatorio:**
  * Relación 1:1 `User.usuarioId -> Usuario.id` con restricción `ON DELETE RESTRICT ON UPDATE CASCADE`.
  * **Regla de Dominio:** Ningún proceso utiliza `User.id` como sustituto de `Usuario.id`. Si un usuario con rol `PROPIETARIO` intenta acceder a inmuebles o calendarios sin un `usuarioId` válido, el backend responde con HTTP 403 `DOMAIN_IDENTITY_REQUIRED`.

---

## 3. Mecanismo de Autenticación, Sesiones y Concurrencia

1. **Tokens de Acceso JWT:**
   * Creados en `auth.service.ts` con payload firmado: `{ sub, email, rol, sid, family, usuarioId }`.
   * Corta duración (15 minutos).
   * Almacenados **únicamente en memoria** en la aplicación React (nunca en `localStorage`).
2. **Refresh Tokens en PostgreSQL (`auth_sessions`):**
   * Token criptográfico aleatorio enviado en cookie `HttpOnly`, `SameSite=Lax`, `Path=/auth`.
   * Persistido como hash SHA-256 en la base de datos con identificador de `family` UUID.
3. **Rotación Atómica y Detección de Reuso:**
   * La renovación (`POST /auth/refresh`) se ejecuta en una transacción PostgreSQL con bloqueo pesimista `SELECT ... FOR UPDATE`.
   * Cada uso invalida el token previo y genera uno nuevo dentro de la misma familia.
   * Si se detecta un intento de reutilizar un token ya rotado fuera de la ventana de gracia (15 s), el sistema revoca inmediatamente toda la familia de sesiones activas.
4. **Cierre de Sesión Seguro (Logout por Familia):**
   * Al invocar `POST /auth/logout`, se actualiza `revokedAt = NOW()` para toda la familia de la sesión actual (`revokeFamily(session.family)`), invalidando tanto el token original como los que se encontraban en vuelo de rotación.
   * Las sesiones del mismo usuario en otros navegadores o dispositivos (familias independientes) permanecen plenamente vigentes.
   * Los registros revocados se preservan para trazabilidad y auditoría forense (cero `DELETE` destructivos).
5. **Coordinación en el Cliente Frontend:**
   * Se utiliza un contador monotónico `authEpoch`. Toda respuesta de red recibida tras un cambio de epoch (como un logout en paralelo) es descartada con `ApiError('STALE_SESSION_RESPONSE', 499)` para prevenir polución de estado.

---

## 4. Control de Concurrencia y Solapes en Reservas

* **Definición de Intervalos:** Las fechas de reserva se manejan como intervalos semiabiertos `[ingreso, salida)`, donde el día de salida está disponible para un nuevo check-in en la misma fecha (días de transición).
* **Barrera en Base de Datos (PostgreSQL):**
  * Se implementó una restricción de exclusión mediante la extensión `btree_gist`:
    ```sql
    ALTER TABLE reservas
    ADD CONSTRAINT reserva_no_solapada_excl
    EXCLUDE USING gist (
      propiedad_id WITH =,
      daterange(ingreso, salida, '[)') WITH &&
    )
    WHERE (estado IN ('CONFIRMADA'));
    ```
  * Dos solicitudes concurrentes jamás pueden confirmar reservas solapadas sobre el mismo inmueble; el motor de base de datos aborta la segunda con error de violación de exclusión, traducido por el backend como HTTP 409 `OVERLAP_CONFLICT`.
* **Reprogramación de Fechas:** Al editar fechas de una reserva existente, la consulta de solape excluye explícitamente el `id` de la propia reserva para permitir extensiones o desplazamientos sin falsos positivos.

---

## 5. Expiración Durable y Outbox de Avisos (DR-03)

* **Reloj Transaccional:** El cálculo de vencimiento de solicitudes se basa en `plazoIniciadoEn + plazo_vigencia` bajo un reloj inyectable (`ExpirationClock`).
* **Selección No Bloqueante (`FOR UPDATE SKIP LOCKED`):**
  * El worker de expiración procesa lotes de reservas vencidas seleccionando registros con `SKIP LOCKED`, evitando bloqueos entre workers concurrentes.
* **Outbox Durable (`avisos_reserva`):**
  * La programación de avisos de expiración y cancelación se registra en la misma transacción que modifica la reserva.
  * La tabla cuenta con restricción lógica única `(reservaId, tipoAviso, politicaVersion, venceEnSnapshot)` e invalidación de avisos previos cuando una reserva cambia de estado o fechas.

---

## 6. Manejo Estandarizado de Errores y Códigos HTTP

El servidor Fastify implementa un capturador global de errores (`setErrorHandler`) que emite respuestas estructuradas:

```json
{
  "error": {
    "code": "CODIGO_ESTANDARIZADO",
    "message": "Mensaje legible sin datos sensibles",
    "details": {},
    "requestId": "req-uuid"
  }
}
```

| Código HTTP | Código Interno | Causa |
| :---: | :--- | :--- |
| **400** | `VALIDATION_ERROR` | Parámetros o cuerpo no cumplen el esquema JSON Schema / Valibot. |
| **401** | `UNAUTHORIZED` | Token ausente, firma inválida o sesión revocada en PostgreSQL. |
| **403** | `FORBIDDEN` | Rol insuficiente para la operación solicitada. |
| **403** | `DOMAIN_IDENTITY_REQUIRED` | Propietario sin vínculo transaccional a la tabla `usuarios`. |
| **404** | `NOT_FOUND` | Recurso solicitado inexistente. |
| **409** | `OVERLAP_CONFLICT` | Solape temporal con otra reserva confirmada en PostgreSQL. |
| **409** | `CONCURRENT_ROTATION` | Rotación duplicada dentro de la ventana de gracia. |
| **429** | `RATE_LIMIT_EXCEEDED` | Exceso de solicitudes por segundo. |
| **500** | `INTERNAL_ERROR` | Error inesperado (detalles técnicos ocultos al cliente y registrados en log seguro). |
