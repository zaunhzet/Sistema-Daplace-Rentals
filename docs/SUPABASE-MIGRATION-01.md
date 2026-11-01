# DAPLACE RENTALS — SUPABASE-MIGRATION-01
## Planificación, Arquitectura y Preparación para Migración a Supabase PostgreSQL

- **Versión:** 1.1 (Revisada — SUPABASE-PREP-FIX-01)
- **Fecha:** 2026-11-01
- **Autor:** Antigravity (Líder Técnico de Implementación Full-Stack)
- **Estado:** PREPARADO — LISTO PARA AUTORIZACIÓN REMOTA
- **Repositorio:** `zaunhzet/Sistema-Daplace-Rentals`
- **Rama Base:** `integration/andre-diego-20261029` (Merge PR #8 `1522568df3c06b31f247d6586f862d8644626737`)

---

## 1. Resumen Ejecutivo y Objetivos

El objetivo de esta intervención es planificar y preparar el traslado de la persistencia relacional del MVP de Daplace Rentals desde la instancia local de PostgreSQL hacia un proyecto administrado en **Supabase**, gestionado operativamente por Diego, garantizando **cero impacto funcional**, **inmunidad financiera**, **aislamiento de pruebas locales** y **continuidad estricta del modelo de autenticación y autorización vigente**.

### Principios Fundamentales
1. **Conservación de Arquitectura:** El backend Fastify en Node.js 24, el cliente React con Vite, la capa ORM Prisma 7 con `@prisma/adapter-pg` y las suites de pruebas automatizadas permanecen intactos.
2. **No Migración a Supabase Auth:** La autenticación continúa operando mediante la tabla `users`, sesiones rotativas `auth_sessions` en PostgreSQL, hashes Argon2id y tokens JWT propios del MVP. Supabase se utiliza estrictamente como proveedor de PostgreSQL administrado.
3. **Privacidad de la Capa de Datos:** El frontend jamás se conecta directamente a Supabase ni recibe cadenas de conexión, contraseñas de PostgreSQL o tokens de administración (`service_role`). Toda interacción con la base de datos se efectúa exclusivamente a través de los contratos REST de Fastify.
4. **Protección Integral de la Data API:** La Data API (PostgREST) de Supabase no debe quedar expuesta con privilegios públicos. Se promueve su desactivación completa o la aplicación restrictiva de RLS y revocación de permisos al rol `anon`.
5. **Inmunidad y Seguridad de Entornos:** Las herramientas destructivas (`safeResetDatabase`, `safeResetTestDatabase`, `seed-dev`) quedan técnicamente bloqueadas contra cualquier host que no sea `localhost`/`127.0.0.1`. Las 450 pruebas automatizadas continúan ejecutándose de forma exclusiva sobre la base desechable local `daplace_test`.
6. **Migración Aditiva y Controlada:** No se ejecutarán comandos `prisma migrate reset`, `prisma db push` ni scripts destructivos contra Supabase. La instalación del esquema sobre la base remota se realizará exclusivamente mediante `prisma migrate deploy` en orden determinístico, exigiendo de forma obligatoria `DIRECT_DATABASE_URL`.

---

## 2. Arquitectura Destino

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CAPA DE PRESENTACIÓN                            │
│                                                                             │
│                   Frontend Web (React 19 + TypeScript + Vite)                │
│                   - Escucha en http://127.0.0.1:5173                       │
│                   - Consume exclusivamente la API REST de Fastify          │
│                   - NO contiene credenciales ni SDK directo de Supabase     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST (JWT HttpOnly Cookies / Bearer)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CAPA DE APLICACIÓN                              │
│                                                                             │
│                     Backend Fastify (Node.js 24 LTS)                        │
│                     - Escucha en http://127.0.0.1:3000                     │
│                     - Módulos: Auth, Reservas, Pagos, Gastos, Mantenimiento,│
│                       Garantías, Reportes, Personal, Alertas, Auditoría     │
│                     - RBAC: ADMINISTRADOR, OPERADOR, PROPIETARIO, CLIENTE   │
│                     - Motor ORM: Prisma 7 con @prisma/adapter-pg + pg.Pool  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ TCP / TLS con Validación Estricta de Certificado
                                       │ (rejectUnauthorized: true, Pool local max 10)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PERSISTENCIA EN SUPABASE                           │
│                                                                             │
│                  Proyecto Supabase PostgreSQL (AWS / Diego)                 │
│                                                                             │
│  [Puerto 5432: Conexión Directa] ───► Para 'prisma migrate deploy'        │
│                                        (DIRECT_DATABASE_URL obligatoria,    │
│                                         advisory locks, DDL transaccional)  │
│                                                                             │
│  [Puerto 5432: Session Pooler]   ───► Para Fastify Runtime (@prisma/pg)     │
│                                        (DATABASE_URL, TLS estricto)         │
│                                                                             │
│  - Extensiones activas: btree_gist                                          │
│  - Restricción de concurrencia: reservas_no_overlapping_excl (GIST)         │
│  - Esquema: 17 tablas relacionales + _prisma_migrations                     │
│  - Data API (PostgREST): Deshabilitada o asegurada con RLS restrictivo      │
│  - Storage / Edge Functions: No utilizados en esta fase                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Inventario Exhaustivo de Esquema y Migraciones

### 3.1. Migraciones Prisma (17 migraciones en orden correlativo)

La instalación completa del esquema sobre una base Supabase limpia aplicará exactamente la siguiente secuencia cronológica:

| # | Migración | Objeto Principal | Dependencias Críticas |
|---|---|---|---|
| **01** | `20261028000000_bootstrap` | Registro inicial de base de datos | Base limpia |
| **02** | `20261029000000_auth_users_and_sessions` | Tablas `users` y `auth_sessions`, enum `UserRole` | Soporte de autenticación JWT |
| **03** | `20261029050918_init_domain_models` | Extensión `btree_gist`, tablas `usuarios`, `propiedades`, `huespedes`, `reservas`, exclusión GIST de anti-overbooking | Requiere privilegio para `CREATE EXTENSION` |
| **04** | `20261029060000_financial_payments_and_guarantees` | Tablas `pagos`, `garantias`, `movimientos_garantia`, `auditoria_eventos`, enums financieros | FKs a `reservas` y `usuarios` |
| **05** | `20261029080000_expenses_and_evidence` | Tablas `gastos` y `sustentos_gasto`, checks de período | FKs a `propiedades` y `usuarios` |
| **06** | `20261029090000_gasto_payload_hash` | Columna `payloadHash` e `idempotencyKey` en `gastos` | Integridad de gastos |
| **07** | `20261030000000_dr01_payment_beneficiary_evidence` | Tabla `evidencias_pago`, beneficiarios y bancos | FK a `pagos` |
| **08** | `20261030010000_dr01_fix_idempotency_retention` | Claves únicas de idempotencia financiera | Cuentas enmascaradas |
| **09** | `20261030020000_dr02_contracts_and_confirmation` | Tabla `contratos_reserva`, versiones y firmas | FK a `reservas` |
| **10** | `20261030030000_dr03_add_estado_reserva_expirada` | Enum valor `EXPIRADA` en `EstadoReserva` | Tipo `EstadoReserva` |
| **11** | `20261030040000_dr03_reservation_expiration_fields_and_checks` | Campos y checks de vencimiento y snapshot de plazos | Tabla `reservas` |
| **12** | `20261030050000_dr03_avisos_reserva_outbox` | Tabla `avisos_reserva` (Outbox durable) | FK a `reservas` |
| **13** | `20261030060000_dr03_avisos_reserva_checks_and_restrict_fk` | 7 Check constraints y FK RESTRICT en avisos | Tabla `avisos_reserva` |
| **14** | `20261030070000_dr03_drop_canal_default` | Corrección de canal explícito en outbox | Tabla `avisos_reserva` |
| **15** | `20261030080000_int01_user_usuario_link` | Vínculo explícito 1:1 `users.usuarioId` ↔ `usuarios.id` | FK RESTRICT entre Auth y Dominio |
| **16** | `20261031000000_dr04_ordenes_trabajo_mantenimiento` | Tabla `ordenes_trabajo` (16 columnas, 3 enums, 4 FKs) | HU-10, HU-14, HU-16 |
| **17** | `20261031010000_hu11_hu17_notificaciones_internas` | Tabla `notificaciones_internas` (15 columnas, 2 enums, 4 FKs, unicidad de idempotencia) | HU-11, HU-17 |

---

### 3.2. Inventario de Tablas (17 Tablas + Control Prisma)

1. `users`: Cuentas de acceso, contraseñas Argon2id, rol del sistema (`ADMINISTRADOR`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`), estado activo y vínculo `usuarioId`.
2. `auth_sessions`: Sesiones activas, hashes de refresh tokens, familias de rotación, expiración y detección de reuso.
3. `usuarios`: Entidad de negocio (colaboradores internos, propietarios, administradores de dominio).
4. `propiedades`: Inmuebles comercializables, estado operativo, publicación, precios base y propietario asociado.
5. `huespedes`: Directorio de huéspedes con nombre, contacto obligatorio (teléfono/email) y documento.
6. `reservas`: Contratos de reserva con fechas `ingreso`/`salida`, plazos de expiración, montos y estados.
7. `pagos`: Registro transaccional de cobros con clave única de idempotencia, hash de canonicalización y conciliación contable.
8. `garantias`: Fondos de custodia por reserva con libro mayor independiente de ingresos operativos.
9. `movimientos_garantia`: Movimientos inmutables de recepción, retención y devolución de depósitos de garantía.
10. `gastos`: Egresos imputables por propiedad, categoría, período contable (mes/año) y aprobación/anulación auditada.
11. `sustentos_gasto`: Comprobantes y documentación de soporte digital vinculados a gastos.
12. `evidencias_pago`: Vouchers bancarios con validación documental e idempotencia.
13. `contratos_reserva`: Versiones inmutables de contratos de arrendamiento temporal con trazabilidad de firma.
14. `avisos_reserva`: Outbox transaccional para alertas durables de expiración de reservas.
15. `ordenes_trabajo`: Órdenes de mantenimiento e inspección operativa con costos estimados, reales y asignación de colaboradores.
16. `notificaciones_internas`: Avisos de sistema para eventos clave (nueva reserva e asignación de trabajo) con idempotencia transaccional.
17. `auditoria_eventos`: Bitácora inmutable de eventos de seguridad y negocio para consulta administrativa.
18. `_prisma_migrations`: Registro oficial de migraciones aplicadas por el motor de Prisma.

---

### 3.3. Extensiones y Restricciones Especiales de PostgreSQL

1. **Extensión `btree_gist`:**
   - Habilitada en la migración `20261029050918_init_domain_models`.
   - Requisito: el rol de conexión en Supabase (`postgres`) debe poder ejecutar `CREATE EXTENSION IF NOT EXISTS btree_gist;`. Supabase admite esta extensión de forma nativa en todos sus planes.
2. **Restricción de Exclusión Anti-Overbooking (`reservas_no_overlapping_excl`):**
   ```sql
   ALTER TABLE "reservas"
   ADD CONSTRAINT "reservas_no_overlapping_excl"
   EXCLUDE USING gist (
       "propiedadId" WITH =,
       daterange("ingreso", "salida", '[)') WITH &&
   )
   WHERE ("estado" IN ('CONFIRMADA', 'SOLICITADA', 'COMPLETADA'));
   ```
   - Invariante crítico: impide a nivel físico en PostgreSQL cualquier solapamiento de fechas sobre un mismo inmueble en intervalo semiabierto `[ingreso, salida)`.
3. **Restricciones de Validación de Dominio (Check Constraints):**
   - Fechas válidas: `salida > ingreso`.
   - Cantidades positivas: `noches > 0`, `montoAcordado > 0`, `monto > 0` (pagos, gastos, garantías).
   - Contacto requerido en huésped: `telefono IS NOT NULL OR email IS NOT NULL`.
   - Período contable en gastos: `periodoMes BETWEEN 1 AND 12`, `periodoAnio BETWEEN 2000 AND 2100`.
   - Plazos de expiración en reservas: `venceEn > plazoIniciadoEn`, `expiradaEn >= venceEn`.
   - Leases y reintentos en avisos: consistencia de tokens de exclusión mutua en outbox.

---

## 4. Estrategia de Conectividad y Seguridad con Supabase

### 4.1. Modos de Conexión, Puertos y Migraciones

Supabase implementa un pooler centralizado (Supavisor). Para una operación estable y segura de Prisma 7 se establecen los siguientes requisitos:

1. **Exigencia Estricta de `DIRECT_DATABASE_URL` para Migraciones Remotas:**
   - URL: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public&sslmode=require`
   - Configurado en [prisma.config.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/prisma.config.ts): **Si el host objetivo es remoto, el sistema EXIGE `DIRECT_DATABASE_URL` explícita y bloquea categóricamente cualquier fallback silencioso a `DATABASE_URL`**.
   - Para entornos locales y Docker (`localhost`, `127.0.0.1`, `postgres`, `db`), se mantiene el soporte directo de `DATABASE_URL` sin requisitos adicionales.
   - Justificación técnica: `prisma migrate deploy` requiere bloqueos consultivos (`pg_advisory_lock`) y comandos DDL directos sobre PostgreSQL (puerto 5432 directo), los cuales fallan o provocan bloqueos indebidos en Transaction Poolers.
2. **Conexión de Aplicación en Runtime (`DATABASE_URL`):**
   - URL: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?schema=public&sslmode=require` (Session Pooler) o conexión directa con límites de pool.
   - Configurado en [database.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/shared/database.ts):
     - Pool local `pg.Pool` con límite conservador (`maxConnections: 10`, configurable con `DATABASE_POOL_MAX`).
     - Timeout de conexión: 10,000 ms (`DATABASE_TIMEOUT_MS`).

### 4.2. TLS Obligatorio con Verificación Estricta de Certificado

- **Prohibición de `rejectUnauthorized: false`:**
  - Se eliminó completamente la opción `rejectUnauthorized: false`.
  - En [database.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/shared/database.ts), si se detecta una conexión remota o SSL activo, el sistema fuerza estrictamente `rejectUnauthorized: true`.
  - Si una opción externa intenta forzar `rejectUnauthorized: false`, el runtime lanza inmediatamente una excepción de seguridad bloqueando el arranque.
- **Soporte de Certificado CA (`DATABASE_SSL_CA`):**
  - Para proveedores con CA personalizada o certificados raíz de Supabase, se admite la variable de entorno `DATABASE_SSL_CA`.
  - Si `DATABASE_SSL_CA` contiene la cadena del certificado PEM directa o una ruta a archivo local (`.crt`/`.pem`), se carga de forma segura y se inyecta en el atributo `ca` de TLS.
  - Si no se especifica CA personalizada, Node.js utiliza el almacén de certificados raíz estándar de confianza del sistema operativo.

### 4.3. Protección Obligatoria de la Data API (PostgREST) y RLS

No se confía en que el cliente frontend ignore la clave pública `anon` (seguridad por oscuridad rechazada):

1. **Opción Recomendada (Desactivación de Data API):**
   - En el panel de Supabase: `Project Settings` → `API` → Deshabilitar `Data API (PostgREST)`.
   - Dado que el MVP de Daplace Rentals opera exclusivamente a través del backend Fastify, la Data API no debe estar expuesta hacia internet.
2. **Opción Alternativa (Restricción Absoluta de RLS y Privilegios):**
   - Si PostgREST debe permanecer activo por requerimientos de la plataforma de Supabase:
     ```sql
     -- 1. Habilitar RLS en todas las tablas del dominio y autenticación
     ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "propiedades" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "huespedes" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "reservas" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "pagos" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "garantias" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "movimientos_garantia" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "gastos" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "sustentos_gasto" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "evidencias_pago" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "contratos_reserva" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "avisos_reserva" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "ordenes_trabajo" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "notificaciones_internas" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "auditoria_eventos" ENABLE ROW LEVEL SECURITY;

     -- 2. Revocar todos los privilegios sobre el esquema public a los roles anónimos y autenticados de Supabase
     REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
     REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
     REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
     ```
   - **Garantía:** Cero políticas permisivas (`CREATE POLICY`) para `anon` o `authenticated`. El rol de conexión de Fastify (`postgres` o rol de servicio propio) mantiene privilegios directos de conexión.

---

## 5. Estrategia de Respaldo, Rollback y Recuperación Local

### 5.1. Respaldo Preventivo Local de Seguridad (Backup)

Antes de cualquier intervención remota, se genera una instantánea completa de la base de datos local de desarrollo (`daplace_dev`):

```powershell
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$BACKUP_FILE = "d:\Proyectos VS Code\Daplace\daplace-rentals\backups\daplace_dev_pre_supabase_$TIMESTAMP.sql"

New-Item -ItemType Directory -Force -Path "d:\Proyectos VS Code\Daplace\daplace-rentals\backups"

$env:PGPASSWORD = "daplace_local_only"
pg_dump -h localhost -p 5432 -U daplace -d daplace_dev -F p -b -v -f $BACKUP_FILE
$env:PGPASSWORD = $null

Write-Host "Respaldo preventivo completado en: $BACKUP_FILE"
```

### 5.2. Procedimiento Habitual de Rollback Operativo (Inmediato y No Destructivo)

Si durante la conexión hacia Supabase se presentan anomalías de red, latencia inaceptable, errores de pooler o incompatibilidad:

1. **Revertir variables de entorno en `.env`:**
   ```env
   DATABASE_URL="postgresql://daplace:daplace_local_only@localhost:5432/daplace_dev?schema=public"
   # Comentar o eliminar DIRECT_DATABASE_URL remota:
   # DIRECT_DATABASE_URL=
   ```
2. **Reiniciar el backend Fastify:**
   ```powershell
   npm run dev:api
   ```
3. **Validar salud operativa local:**
   - Comprobar que Fastify arranca y responde exitosamente en `http://127.0.0.1:3000` ejecutando `SELECT 1` sobre PostgreSQL local.
4. **Impacto:** Cero pérdida de datos, cero alteraciones en la base local y retorno inmediato al estado estable en segundos.

### 5.3. Procedimiento de Restauración Destructiva (Excepcional — Solo con Autorización Explícita y Respaldo Verificado)

*ADVERTENCIA: Este procedimiento es de carácter catastrófico y NO forma parte del rollback operativo estándar. Requiere autorización previa explícita de André y verificación de la integridad del archivo de respaldo.*

Solo si la base local sufriera corrupción de datos o pérdida de consistencia se procederá a:

```powershell
# 1. Comprobar que el archivo de respaldo existe y tiene tamaño válido (> 0 bytes)
if (-not (Test-Path $BACKUP_FILE) -or (Get-Item $BACKUP_FILE).Length -eq 0) {
    throw "ABORTADO: Archivo de respaldo inexistente o corrupto."
}

# 2. Restaurar esquema de forma controlada
$env:PGPASSWORD = "daplace_local_only"
psql -h localhost -p 5432 -U daplace -d daplace_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql -h localhost -p 5432 -U daplace -d daplace_dev -f $BACKUP_FILE
$env:PGPASSWORD = $null
```

---

## 6. Procedimiento Paso a Paso de Ejecución (Fases 0 a 3)

### FASE 0 — Inspección y Preparación (COMPLETADA)
- [x] Merge del PR #8 confirmado en GitHub (`1522568df3c06b31f247d6586f862d8644626737`).
- [x] Rama `integration/andre-diego-20261029` sincronizada localmente con `origin`.
- [x] Rama de trabajo `feat/supabase-migration-prep` creada.
- [x] 17 migraciones Prisma inspeccionadas y verificadas en orden cronológico.
- [x] Invariantes críticos validados (`btree_gist`, exclusión GIST de reservas, DR-04, DR-05).
- [x] Salvaguardas en scripts destructivos (`reset.ts`, `seed-dev.ts`, `seed.ts`) validadas contra hosts no locales.

### FASE 1 — Configuración Segura y TLS Estricto (COMPLETADA LOCALMENTE)
- [x] [prisma.config.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/prisma.config.ts) actualizado: **exige `DIRECT_DATABASE_URL` obligatoria para migraciones remotas** sin fallback silencioso, preservando `DATABASE_URL` para Docker/local.
- [x] [database.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/shared/database.ts) actualizado: **eliminado `rejectUnauthorized: false`**, configuración estricta de TLS (`rejectUnauthorized: true`), soporte de CA personalizada (`DATABASE_SSL_CA`) y pool controlado (`maxConnections: 10`).
- [x] [.env.example](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/.env.example) documentado con `DATABASE_URL`, `DIRECT_DATABASE_URL`, `DATABASE_SSL_CA` y `DATABASE_POOL_MAX`.
- [ ] **Espera de Entrada Externa:** Recepción de credenciales del proyecto Supabase creado por Diego mediante canal privado y seguro.

### FASE 2 — Despliegue de Esquema sobre Base Remota Limpia (POR EJECUTAR TRAS AUTORIZACIÓN)
*Nota: Solo ejecutar cuando Diego proporcione las credenciales oficiales.*

1. **Configurar `.env` local:**
   ```env
   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?schema=public&sslmode=require"
   DIRECT_DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public&sslmode=require"
   ```
2. **Aplicar migraciones aditivas de forma determinística:**
   ```bash
   cd backend
   npm run db:migrate:deploy
   ```
   *Comprobación esperada:* `17 migrations found. All migrations have been applied.`
3. **Verificar estado de migraciones:**
   ```bash
   npm run db:status
   ```
   *Comprobación esperada:* `Database schema is up to date.`

### FASE 3A — Smoke Tests de Solo Lectura (No Invasivos — Obligatorios)
*Comprobaciones directas sin mutación de datos en Supabase:*

1. **Verificación de Estructura Físico-Relacional en Supabase:**
   - Comprobar que `_prisma_migrations` contiene las 17 filas con `finished_at` no nulo.
   - Comprobar que la extensión `btree_gist` está activa:
     ```sql
     SELECT extname, extversion FROM pg_extension WHERE extname = 'btree_gist';
     ```
   - Comprobar que la restricción de exclusión existe en `reservas`:
     ```sql
     SELECT conname, contype FROM pg_constraint WHERE conname = 'reservas_no_overlapping_excl';
     ```
   - Comprobar que las 17 tablas tienen sus claves foráneas, columnas e índices correspondientes.
2. **Prueba de Conexión del Backend Fastify:**
   - Iniciar `npm run dev:api` en `backend`.
   - Confirmar arranque en `http://127.0.0.1:3000` con conexión exitosa (`SELECT 1`).
3. **Smoke Tests de Solo Lectura vía Endpoints REST:**
   - **Consulta de Propiedades:** `GET /api/propiedades` → Retorna `200 OK` con arreglo vacío o datos preexistentes.
   - **Consulta de Alertas:** `GET /api/alertas` (con token de prueba) → Retorna `200 OK` con `data: []` y `totalPendientes: 0`.
   - **Consulta de Liquidación de Propietario (HU-07/HU-12):**
     - Endpoint exacto: `GET /api/reportes/propietario?propiedadId=<id>&mes=<m>&anio=<a>`
     - Contratos de error verificados contra el código real:
       - `400 VALIDATION_ERROR`: Si falta `propiedadId`.
       - `401 UNAUTHORIZED`: Si no hay sesión válida.
       - `403 DOMAIN_IDENTITY_REQUIRED`: Si el rol `PROPIETARIO` no tiene identidad transaccional en `Usuario`.
       - `403 FORBIDDEN`: Si el propietario intenta consultar liquidaciones de un inmueble ajeno.
       - `404 PROPERTY_NOT_FOUND`: Si la propiedad no existe en la base de datos.
       - `409 MIXED_CURRENCY_REPORT`: Si existen transacciones en monedas incompatibles sin tasa de conversión.
       - `200 OK`: Si la consulta es válida (devuelve desglose contable o CSV según `format=csv`).
4. **Aislamiento de Pruebas Automatizadas:**
   - Ejecutar `npm test` en `backend`.
   - **Verificar que `DATABASE_TEST_URL` corre contra `daplace_test` local y que las 282 pruebas pasan al 100% sin interacción con Supabase.**

### FASE 3B — Smoke Tests de Escritura (RESTRINGIDOS — Solo con Autorización Explícita)
*Queda estrictamente prohibido ejecutar escrituras no autorizadas sobre Supabase.*

En caso de que André autorice formalmente una prueba de escritura sobre la base remota:
1. **Identificadores Rastreables:**
   - Se utilizarán entidades con prefijo identificable `smoke-test-*` (ej. huésped `smoke-test-guest@daplace.invalid`, reserva con notas `smoke-test-verification`).
2. **Prueba Transaccional Controlada:**
   - Crear reserva y comprobar alerta interna en `notificaciones_internas` (HU-11).
   - Probar rechazo físico de sobreventa `409 CONCURRENCY_CONFLICT` mediante intento de reserva solapada.
3. **Estrategia de Limpieza No Destructiva:**
   - Eliminación focal de las entidades creadas mediante su ID exacto (`DELETE FROM ... WHERE id = 'smoke-test-...'` o baja lógica).
   - **Prohibición terminante:** Jamás utilizar `TRUNCATE TABLE`, `prisma migrate reset` ni `DROP SCHEMA` en la base remota.

---

## 7. Matriz de Riesgos y Mitigaciones

| Riesgo Técnico | Severidad | Mitigación Implementada |
|---|:---:|---|
| **Fallo de advisory locks con Transaction Pooler (Puerto 6543)** | ALTA | [prisma.config.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/prisma.config.ts) **exige `DIRECT_DATABASE_URL` obligatoria** (puerto 5432 directo) para migraciones remotas y bloquea el fallback silencioso. |
| **Vulnerabilidad por desactivación de TLS (MITM en conexión remota)** | CRÍTICA | [database.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/shared/database.ts) **fuerza `rejectUnauthorized: true`** en conexiones remotas y bloquea cualquier intento de configurar `false`. Soporta `DATABASE_SSL_CA`. |
| **Exposición no autorizada de datos vía PostgREST / clave `anon`** | CRÍTICA | Documentada la desactivación de la Data API en el panel de Supabase o la aplicación obligatoria de RLS restrictivo sin políticas públicas anónimas. |
| **Ejecución accidental de `npm test` o scripts de reset contra Supabase** | CRÍTICA | [reset.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/scripts/reset.ts) y [seed-dev.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/scripts/seed-dev.ts) contienen salvaguardas que abortan la ejecución ante cualquier host que no sea `localhost`, `127.0.0.1` o `::1`. |
| **Corrupción o pérdida de datos locales durante rollback** | ALTA | El rollback operativo estándar **no utiliza `DROP SCHEMA CASCADE`**; consiste exclusivamente en revertir las variables a PostgreSQL local y reiniciar Fastify. |
| **Contaminación de la base remota con datos de prueba** | MEDIA | Se separaron los smoke tests en Solo Lectura (3A) y Escritura Restringida (3B), requiriendo autorización previa y limpieza focal por ID. |

---

## 8. Criterios Binarios de Aprobación (Checklist Go / No-Go)

- [ ] **G1 (Estado Git y Node.js):** Rama `feat/supabase-migration-prep` basada en la integración actualizada, con Node.js 24 especificado en `package.json`.
- [ ] **G2 (Migraciones Remotas con URL Directa):** Las 17 migraciones aplicadas con éxito mediante `prisma migrate deploy` utilizando `DIRECT_DATABASE_URL` obligatoria sobre Supabase.
- [ ] **G3 (Extensiones e Invariantes):** `btree_gist` activa y restricción `reservas_no_overlapping_excl` verificada en catálogo de Supabase.
- [ ] **G4 (Conectividad con TLS Verificado):** Backend Fastify conectado con `rejectUnauthorized: true`, validación de certificado (y `DATABASE_SSL_CA` si aplica) y respuesta exitosa a `SELECT 1`.
- [ ] **G5 (Contratos de Reportes Exactos):** `GET /api/reportes/propietario` probado contra los contratos reales (400, 401, 403, 404, 409 y 200).
- [ ] **G6 (Protección Data API):** PostgREST deshabilitado en Supabase o RLS habilitado en todas las tablas sin políticas públicas anónimas.
- [ ] **G7 (Pruebas Automatizadas 100% Locales):** `DATABASE_TEST_URL` intacta en `daplace_test` local y las 450 pruebas automatizadas pasando al 100%.
- [ ] **G8 (Rollback Operativo No Destructivo):** Procedimiento de conmutación rápida a PostgreSQL local documentado y verificado sin sentencias destructivas.
