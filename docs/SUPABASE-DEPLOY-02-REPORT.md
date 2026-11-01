# DAPLACE RENTALS — SUPABASE-DEPLOY-02-REPORT
## Informe de Instalación y Verificación del Esquema Remoto en Supabase

- **Fecha:** 2026-11-01
- **Proyecto Supabase Autorizado:** `bdfeiiqcswdxzrqoykwp`
- **Host de Conexión:** `aws-1-sa-east-1.pooler.supabase.com:5432` (Session Pooler IPv4)
- **Rama Git:** `feat/supabase-deploy` (Base: `integration/andre-diego-20261029` en `ad9ab90`)
- **Dictamen Final:** **`SCHEMA_DEPLOY_PASS`**

---

### 1. Resumen Ejecutivo

Conforme a la autorización condicionada **SUPABASE-DEPLOY-02**, y tras confirmar la desactivación oficial de la Data API en el Dashboard de Supabase (`Enable Data API: OFF`, `No schemas can be queried`), se procedió con la ejecución controlada de la herramienta oficial de migraciones de Prisma:

```bash
npm --prefix backend run db:migrate:deploy
```

**Resultado:** Las **17 migraciones Prisma** existentes fueron aplicadas de manera secuencial, determinística y sin errores sobre la base de datos remota de Supabase.

La inspección posterior del catálogo de PostgreSQL confirmó la presencia íntegra de las **17 tablas de dominio de aplicación**, la extensión **`btree_gist`**, la restricción física anti-overbooking **`reservas_no_overlapping_excl`**, 32 claves foráneas, 80 índices, 24 tipos enumerados y **exactamente 0 registros de negocio** (base limpia, sin seeds ni mutaciones).

---

### 2. Inventario de Migraciones Aplicadas

| # | Archivo de Migración | Hash / Estado | Objetivo de la Migración |
|---|---|:---:|---|
| 01 | `20261028000000_bootstrap` | **APPLIED** | Creación inicial de `btree_gist`, enums y tablas base de reservas y propiedades |
| 02 | `20261029000000_auth_users_and_sessions` | **APPLIED** | Modelos `users` y `auth_sessions` con refresh tokens e índices de expiración |
| 03 | `20261029050918_init_domain_models` | **APPLIED** | Modelos `usuarios`, `propiedades`, `huespedes` y `reservas` con restricción GIST |
| 04 | `20261029060000_financial_payments_and_guarantees` | **APPLIED** | Modelos `pagos`, `garantias` y `movimientos_garantia` con checks financieros |
| 05 | `20261029080000_expenses_and_evidence` | **APPLIED** | Modelos `gastos`, `sustentos_gasto` y `evidencias_pago` con hashing SHA-256 |
| 06 | `20261029090000_gasto_payload_hash` | **APPLIED** | Integridad e idempotencia en gastos mediante columna `payloadHash` |
| 07 | `20261030000000_dr01_payment_beneficiary_evidence` | **APPLIED** | Beneficiario de pagos, retención de garantías y evidencias (Adenda DR-01) |
| 08 | `20261030010000_dr01_fix_idempotency_retention` | **APPLIED** | Ajustes de unicidad idempotente en pagos y movimientos de retención |
| 09 | `20261030020000_dr02_contracts_and_confirmation` | **APPLIED** | Tabla `contratos_reserva` con versionado correlativo y confirmación formal (DR-02) |
| 10 | `20261030030000_dr03_add_estado_reserva_expirada` | **APPLIED** | Inclusión de valor `EXPIRADA` en enum `EstadoReserva` |
| 11 | `20261030040000_dr03_reservation_expiration_fields_and_checks` | **APPLIED** | Campos `expiraEn`, `expiradaEn` y exclusión de expiradas en GIST temporal |
| 12 | `20261030050000_dr03_avisos_reserva_outbox` | **APPLIED** | Tabla transaccional `avisos_reserva` para outbox de notificaciones |
| 13 | `20261030060000_dr03_avisos_reserva_checks_and_restrict_fk` | **APPLIED** | Restricciones `ON DELETE RESTRICT` y unicidad de avisos de expiración |
| 14 | `20261030070000_dr03_drop_canal_default` | **APPLIED** | Eliminación de canal por defecto para despacho determinístico de avisos |
| 15 | `20261030080000_int01_user_usuario_link` | **APPLIED** | Vínculo 1:1 estricto entre identidades de autenticación (`users`) y dominio (`usuarios`) |
| 16 | `20261031000000_dr04_ordenes_trabajo_mantenimiento` | **APPLIED** | Tabla `ordenes_trabajo` con 16 columnas operativas, enums y 4 FKs (DR-04) |
| 17 | `20261031010000_hu11_hu17_notificaciones_internas` | **APPLIED** | Tabla `notificaciones_internas` para avisos de reserva y órdenes de trabajo (DR-05) |

---

### 3. Verificaciones Físicas en PostgreSQL Remoto

#### 3.1. Estado de Migraciones (`_prisma_migrations`)
- **Total de filas:** 17.
- **`finished_at`:** 17 valores timestamp no nulos.
- **`rolled_back_at`:** 0 valores (ninguna reversión).
- **`applied_steps_count`:** 1 en todas las 17 migraciones.
- **Prisma Migrate Status:** `Database schema is up to date!` (código de salida 0).

#### 3.2. Tablas Base en Esquema `public` (18 en total)
1. `_prisma_migrations` (Control Prisma)
2. `auditoria_eventos` (0 registros)
3. `auth_sessions` (0 registros)
4. `avisos_reserva` (0 registros)
5. `contratos_reserva` (0 registros)
6. `evidencias_pago` (0 registros)
7. `garantias` (0 registros)
8. `gastos` (0 registros)
9. `huespedes` (0 registros)
10. `movimientos_garantia` (0 registros)
11. `notificaciones_internas` (0 registros)
12. `ordenes_trabajo` (0 registros)
13. `pagos` (0 registros)
14. `propiedades` (0 registros)
15. `reservas` (0 registros)
16. `sustentos_gasto` (0 registros)
17. `users` (0 registros)
18. `usuarios` (0 registros)

**Total Registros de Negocio:** **0 filas** en las 17 tablas de aplicación. La base de datos es un esquema virgen.

#### 3.3. Extensión e Invariantes Críticas
- **Extensión `btree_gist`:** Activa en versión **`1.7`** en el catálogo de Supabase.
- **Restricción Anti-Overbooking:**
  - Nombre: **`reservas_no_overlapping_excl`** (tipo `x` — EXCLUDE).
  - Definición física verificada:
    ```sql
    EXCLUDE USING gist (
      "propiedadId" WITH =, 
      daterange(ingreso, salida, '[)'::text) WITH &&
    ) WHERE (estado = ANY (ARRAY['CONFIRMADA'::"EstadoReserva", 'SOLICITADA'::"EstadoReserva", 'COMPLETADA'::"EstadoReserva"]))
    ```
- **Integridad Referencial:** 32 Claves Foráneas (FK) activas.
- **Índices de Búsqueda y Unicidad:** 80 Índices activos en el esquema `public`.
- **Tipos Enumerados (Enums):** 24 Enums creados según el diseño de dominio.

---

### 4. Seguridad y PostgREST

- **Data API (PostgREST):** Confirmada oficialmente en estado **`OFF`** en el Dashboard de Supabase (`No schemas can be queried`).
- **TLS Estricto:** Activo con `rejectUnauthorized: true` y certificado oficial `backend/certs/supabase-ca.crt` (`Supabase Root 2021 CA`).
- **Autenticación del MVP:** Preservada en Fastify sobre `users` / `auth_sessions` con hashes Argon2id y JWT propio. Supabase Auth se mantiene completamente desactivado.
- **Cero Datos de Demostración:** No se ejecutó ningún seed (`ALLOW_DEV_SEED="false"`).
- **Aislamiento de Pruebas:** `DATABASE_TEST_URL` se mantiene apuntando exclusivamente a `daplace_test` local. La suite de pruebas de backend (282/282 PASS) y frontend (168/168 PASS) permanece 100% verde y aislada.

---

### 5. Dictamen y Conclusión

**`SCHEMA_DEPLOY_PASS`**

El esquema relacional de Daplace Rentals se encuentra instalado, completo, verificado y protegido en el proyecto Supabase `bdfeiiqcswdxzrqoykwp`. La base remota se encuentra lista para la posterior fase independiente de sembrado/carga inicial y smoke tests funcionales.
