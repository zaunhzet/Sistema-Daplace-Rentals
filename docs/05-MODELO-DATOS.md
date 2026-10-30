# 05 — Modelo de Datos y Esquema Relacional

**Estado:** APROBADO E IMPLEMENTADO (Refleja exactamente `schema.prisma` y las 9 migraciones PostgreSQL aplicadas al 30 de octubre de 2026).
**Motor de Base de Datos:** PostgreSQL 16+ con extensión `btree_gist` habilitada.
**ORM:** Prisma 7.

---

## 1. Diagrama de Relaciones Principales

```text
       ┌──────────┐ 1:1 (RESTRICT) ┌─────────────┐
       │   User   ├───────────────►│   Usuario   │
       └────┬─────┘                └──────┬──────┘
            │ 1:N                         │ 1:N
            ▼                             ▼
     ┌─────────────┐             ┌─────────────────┐
     │ AuthSession │             │    Propiedad    │
     └─────────────┘             └────────┬────────┘
                                          │ 1:N
                                          ▼
┌───────────┐ 1:N                ┌─────────────────┐
│  Huesped  ├───────────────────►│     Reserva     │
└───────────┘                    └──┬───┬───┬───┬──┘
                                    │   │   │   │
        ┌───────────────────────────┘   │   │   └───────────────────────┐
        │ 1:N                           │   │ 1:N                       │ 1:N
        ▼                               │   ▼                           ▼
┌──────────────┐ 1:1             ┌──────┴────────┐ 1:N           ┌──────────────┐
│   Garantia   │                 │ ContratoResva │               │ AvisoReserva │
└───────┬──────┘                 └───────────────┘               └──────────────┘
        │ 1:N
        ▼
┌──────────────────┐             ┌───────────────┐ 1:N
│MovimientoGarantia│             │     Pago      ├──────────────┐
└──────────────────┘             └──────┬────────┘              │
                                        │ 1:N                   │
                                        ▼                       ▼
                                 ┌──────────────┐        ┌──────────────┐
                                 │EvidenciaPago │        │Gasto/Sustento│
                                 └──────────────┘        └──────────────┘
```

---

## 2. Entidades de Autenticación y Control de Sesión

### `User` (`users`)
Almacena credenciales de acceso seguras y roles RBAC.

| Campo | Tipo PostgreSQL | Restricción / Índice | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, `@default(uuid())` | Identificador único de cuenta. |
| `email` | `VARCHAR` | `UNIQUE` | Correo de inicio de sesión. |
| `passwordHash` | `VARCHAR` | NOT NULL | Hash cifrado con bcrypt (10 rounds). |
| `nombre` | `VARCHAR` | NOT NULL | Nombre del usuario. |
| `cargo` | `VARCHAR` | NULL | Cargo administrativo opcional. |
| `rol` | `ENUM UserRole` | NOT NULL (`CLIENTE`) | `ADMINISTRADOR`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`. |
| `isActive` | `BOOLEAN` | `@default(true)` | Control de desactivación inmediata de cuenta. |
| `usuarioId` | `UUID` | `UNIQUE`, NULL | Enlace transaccional opcional con `usuarios(id)`. |
| `createdAt` / `updatedAt` | `TIMESTAMPTZ` | NOT NULL | Marcas de tiempo de auditoría. |

* **Relación:** `usuarioId` apunta a `usuarios(id)` con regla `ON DELETE RESTRICT ON UPDATE CASCADE`.

### `AuthSession` (`auth_sessions`)
Registro de refresh tokens rotativos para gestión de sesiones seguras.

| Campo | Tipo PostgreSQL | Restricción / Índice | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, `@default(uuid())` | Identificador de sesión. |
| `userId` | `UUID` | FK (`users.id`), Index | Usuario propietario de la sesión. |
| `tokenHash` | `VARCHAR` | `UNIQUE` | Hash SHA-256 del refresh token emitido. |
| `family` | `UUID` | Index, NOT NULL | Identificador de la cadena/familia de rotación. |
| `revokedAt` | `TIMESTAMPTZ` | NULL | Momento de revocación por logout o rotación. |
| `replacedByTokenHash` | `VARCHAR` | NULL | Puntero al nuevo hash emitido para detectar reuso. |
| `expiresAt` | `TIMESTAMPTZ` | NOT NULL | Fecha límite de validez del token. |
| `userAgent` / `ipAddress` | `VARCHAR` | NULL | Metadatos para auditoría de conexiones. |

---

## 3. Entidades del Núcleo de Dominio Transaccional

### `Usuario` (`usuarios`)
Representa al actor transaccional del negocio (propietario o personal interno).

* **Campos:** `id` (PK UUID), `nombre`, `email` (`UNIQUE`), `telefono`, `rol` (`RolUsuario`: `ADMIN`, `OPERADOR`, `PROPIETARIO`), `activo` (`BOOLEAN`).
* **Relaciones:** Propietario de múltiples `Propiedad`, registrador/conciliador de `Pago`, registrador/aprobador de `Gasto`, validador de `ContratoReserva`.

### `Propiedad` (`propiedades`)
Inmuebles administrados por la plataforma.

* **Campos:**
  * `id` (PK UUID).
  * `nombre` (`VARCHAR`), `direccion` (`VARCHAR`).
  * `propietarioId` (FK `Usuario.id`, `ON DELETE RESTRICT`).
  * `estadoOperativo` (`ENUM EstadoOperativo`: `OPERATIVA`, `EN_MANTENIMIENTO`, `INACTIVA`).
  * `estadoPublicacion` (`ENUM EstadoPublicacion`: `PUBLICADA`, `BORRADOR`, `PAUSADA`).
  * `activa` (`BOOLEAN`, `@default(true)`): Baja lógica (inmunidad financiera).
  * `capacidadHuespedes` (`INT`), `precioBaseNoche` (`DECIMAL(10,2)`), `moneda` (`VARCHAR`, `@default('PEN')`).
* **Índices:** `[propietarioId]`, `[estadoOperativo, activa]`.

### `Huesped` (`huespedes`)
Clientes que realizan solicitudes y estancias.

* **Campos:** `id` (PK UUID), `nombreCompleto`, `telefono` (NULL), `email` (NULL), `tipoDocumento` (`DNI`, `PASAPORTE`, `CARNET_EXTRANJERIA`, `OTRO`), `numeroDocumento`, `nacionalidad`, `notas`.
* **Regla de Negocio:** Al menos un medio de contacto (teléfono o correo) es obligatorio al registrar.
* **Índices:** `[email]`, `[telefono]`, `[numeroDocumento]`.

### `Reserva` (`reservas`)
Contrato de estancia y ocupación temporal.

* **Campos:**
  * `id` (PK UUID).
  * `propiedadId` (FK `Propiedad.id`, `ON DELETE RESTRICT`).
  * `huespedId` (FK `Huesped.id`, `ON DELETE RESTRICT`).
  * `ingreso` (`DATE`), `salida` (`DATE`), `noches` (`INT`). Intervalo semiabierto `[ingreso, salida)`.
  * `estado` (`ENUM EstadoReserva`: `SOLICITADA`, `CONFIRMADA`, `COMPLETADA`, `CANCELADA`, `EXPIRADA`).
  * `montoAcordado` (`DECIMAL(10,2)`), `moneda` (`VARCHAR`).
  * `origen` (`ENUM OrigenReserva`: `WEB`, `DIRECTO`, `AIRBNB`).
  * `plazoIniciadoEn`, `venceEn`, `expiradaEn` (`TIMESTAMPTZ(3)`): Ciclo de expiración DR-03.
  * `avisoProgramadoEn` (`TIMESTAMPTZ(3)`): Enlace a outbox de notificaciones.
* **Restricción de Exclusión en PostgreSQL (Anti-Solape):**
  ```sql
  CONSTRAINT reserva_no_solapada_excl
  EXCLUDE USING gist (
    propiedad_id WITH =,
    daterange(ingreso, salida, '[)') WITH &&
  ) WHERE (estado IN ('CONFIRMADA'))
  ```

---

## 4. Entidades Financieras, Evidencias y Contratos

### `Pago` (`pagos`)
Adelantos y saldos abonados por el huésped.

* **Campos:** `id` (PK UUID), `reservaId` (FK `Reserva.id`), `monto` (`DECIMAL(12,2)`), `moneda` (`VARCHAR`), `concepto` (`ADELANTO`, `SALDO`, `PAGO_TOTAL`, `PENALIDAD`), `metodoPago` (`TRANSFERENCIA`, `TARJETA`, `EFECTIVO`, etc.), `referenciaOperacion` (`VARCHAR`), `fechaPago` (`DATE`).
* **Estados:** `PENDIENTE_CONCILIACION`, `CONCILIADO`, `RECHAZADO`.
* **Idempotencia:** `idempotencyKey` (`UNIQUE`), `payloadHash`.
* **Auditoría:** `registradoPorId`, `conciliadoPorId`, `conciliadoEn`, `motivoRechazo`.

### `EvidenciaPago` (`evidencias_pago`)
Vouchers y comprobantes digitales vinculados a un pago.

* **Campos:** `id` (PK UUID), `pagoId` (FK `Pago.id`, `ON DELETE RESTRICT`), `tipo` (`VOUCHER`), `nombreArchivo`, `url`, `referenciaDocumental`, `estado` (`REFERENCIADA`, `VALIDADA`, `RECHAZADA`).
* **Restricción Única:** `@@unique([pagoId, idempotencyKey])`.

### `Garantia` (`garantias`) y `MovimientoGarantia` (`movimientos_garantia`)
Depósito de respaldo separado de los ingresos de alquiler.

* **Garantía:** `reservaId` (`UNIQUE`), `montoTotal` (`DECIMAL(12,2)`), `estado` (`EN_CUSTODIA`, `PARCIALMENTE_RETENIDA`, `DEVUELTA_TOTAL`, `RETENIDA_TOTAL`, `LIQUIDADA_MIXTA`).
* **Movimiento:** `garantiaId` (FK `Garantia.id`), `tipo` (`RECEPCION`, `RETENCION`, `DEVOLUCION_PARCIAL`, `DEVOLUCION_TOTAL`), `monto` (`DECIMAL(12,2)`), `motivo`, `documentoSoporte`, `actorId`.
* **Invariante:** La suma de retenciones y devoluciones nunca puede exceder el monto total recibido.

### `Gasto` (`gastos`) y `SustentoGasto` (`sustentos_gasto`)
Egresos operativos asociados a un inmueble.

* **Gasto:** `propiedadId` (FK `Propiedad.id`), `fechaGasto` (`DATE`), `periodoMes` (`INT`), `periodoAnio` (`INT`), `titulo`, `categoria`, `monto` (`DECIMAL(12,2)`), `pagadoPor` (`DAPLACE` / `PROPIETARIO`), `estado` (`REGISTRADO`, `APROBADO`, `ANULADO`).
* **Sustento:** `gastoId` (FK `Gasto.id`, `ON DELETE CASCADE`), `nombreArchivo`, `url`.

### `ContratoReserva` (`contratos_reserva`)
Documento contractual firmado entre las partes.

* **Campos:** `id` (PK UUID), `reservaId` (FK `Reserva.id`), `version` (`INT`), `nombreOriginal`, `urlReferencia`, `estadoFirma` (`REFERENCIADA`, `VALIDADA`, `RECHAZADA`), `registradoPorId`, `validadoPorId`.
* **Restricción Única:** `@@unique([reservaId, version])`.

### `AvisoReserva` (`avisos_reserva`)
Outbox durable de notificaciones de vencimiento.

* **Campos:** `id` (PK UUID), `reservaId` (FK `Reserva.id`), `tipoAviso` (`EXPIRACION_PROXIMA`, `SOLICITADA_EXPIRADA`), `canal` (`EMAIL`, `WHATSAPP`, `SISTEMA`), `estado` (`PROGRAMADO`, `PENDIENTE`, `EN_ENVIO`, `ENVIADO`, `FALLIDO`, `CANCELADO`), `leaseToken`, `leaseVenceEn`.
* **Restricción Única Lógica:** `@@unique([reservaId, tipoAviso, politicaVersion, venceEnSnapshot])`.

### `AuditoriaEvento` (`auditoria_eventos`)
Registro inmutable de acciones y mutaciones de dominio.

* **Campos:** `id` (PK UUID), `entidad`, `entidadId`, `accion`, `actor`, `motivo`, `detalles` (`JSON`), `requestId`, `creadoEn`.

---

## 5. Historial de Migraciones Aplicadas

| Migración | Propósito y Contenido |
| :--- | :--- |
| `20261028180000_init_postgresql_core` | Esquema transaccional base (`propiedades`, `huespedes`, `reservas`, `pagos`, `garantias`). |
| `20261029000000_auth_users_and_sessions` | Modelos de autenticación (`users` y `auth_sessions`). |
| `20261030010000_dr02_requisitos_confirmacion_contratos_evidencias` | `contratos_reserva` y `evidencias_pago` con claves foráneas. |
| `20261030020000_dr02_gastos_sustentos` | `gastos` y `sustentos_gasto` con índices por mes y año. |
| `20261030030000_dr03_add_estado_reserva_expirada` | Enum `EstadoReserva` con `EXPIRADA` y marcas de plazo en reservas. |
| `20261030040000_dr03_avisos_reserva_outbox` | Tabla `avisos_reserva` para outbox durable. |
| `20261030050000_dr03_reserva_exclusion_constraint` | Extensión `btree_gist` y exclusión de solape de fechas en PostgreSQL. |
| `20261030060000_dr03_avisos_reserva_checks_and_restrict_fk` | Claves foráneas `RESTRICT` e índices de soporte para avisos de reserva. |
| `20261030080000_int01_user_usuario_link` | Vínculo foráneo `users.usuario_id -> usuarios(id)` con `ON DELETE RESTRICT`. |
