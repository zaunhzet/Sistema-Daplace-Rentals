# DAPLACE RENTALS — SUPABASE-MIGRATION-01
## Planificación, Arquitectura y Preparación para Migración a Supabase PostgreSQL

**Versión:** 1.0  
**Fecha:** 2026-11-01  
**Autor:** Antigravity (Líder Técnico de Implementación Full-Stack)  
**Estado:** PREPARADO — LISTO PARA AUTORIZACIÓN REMOTA  
**Repositorio:** `zaunhzet/Sistema-Daplace-Rentals`  
**Rama Base:** `integration/andre-diego-20261029` (Merge PR #8 `1522568df3c06b31f247d6586f862d8644626737`)

---

## 1. Resumen Ejecutivo y Objetivos

El objetivo de esta intervención es planificar y preparar el traslado de la persistencia relacional del MVP de Daplace Rentals desde la instancia local de PostgreSQL hacia un proyecto administrado en **Supabase**, gestionado operativamente por Diego, garantizando **cero impacto funcional**, **inmunidad financiera**, **aislamiento de pruebas locales** y **continuidad estricta del modelo de autenticación y autorización vigente**.

### Principios Fundamentales
1. **Conservación de Arquitectura:** El backend Fastify en Node.js, el cliente React con Vite, la capa ORM Prisma 7 con `@prisma/adapter-pg` y las suites de pruebas automatizadas permanecen intactos.
2. **No Migración a Supabase Auth:** La autenticación continúa operando mediante la tabla `users`, sesiones rotativas `auth_sessions` en PostgreSQL, hashes Argon2id y tokens JWT propios del MVP. Supabase se utiliza estrictamente como proveedor de PostgreSQL administrado.
3. **Privacidad de la Capa de Datos:** El frontend jamás se conecta directamente a Supabase ni recibe cadenas de conexión, contraseñas de PostgreSQL o tokens de administración (`service_role`). Toda interacción con la base de datos se efectúa exclusivamente a través de los contratos REST de Fastify.
4. **Inmunidad y Seguridad de Entornos:** Las herramientas destructivas (`safeResetDatabase`, `safeResetTestDatabase`, `seed-dev`) quedan técnicamente bloqueadas contra cualquier host que no sea `localhost`/`127.0.0.1`. Las 450 pruebas automatizadas continúan ejecutándose de forma exclusiva sobre la base desechable local `daplace_test`.
5. **Migración Aditiva y Controlada:** No se ejecutarán comandos `prisma migrate reset`, `prisma db push` ni scripts destructivos contra Supabase. La instalación del esquema sobre la base remota se realizará exclusivamente mediante `prisma migrate deploy` en orden determinístico.

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
│                     Backend Fastify (Node.js 22 LTS)                        │
│                     - Escucha en http://127.0.0.1:3000                     │
│                     - Módulos: Auth, Reservas, Pagos, Gastos, Mantenimiento,│
│                       Garantías, Reportes, Personal, Alertas, Auditoría     │
│                     - RBAC: ADMINISTRADOR, OPERADOR, PROPIETARIO, CLIENTE   │
│                     - Motor ORM: Prisma 7 con @prisma/adapter-pg + pg.Pool  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ TCP / SSL TLS (Pool local max 10 conn)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PERSISTENCIA EN SUPABASE                           │
│                                                                             │
│                  Proyecto Supabase PostgreSQL (AWS / Diego)                 │
│                                                                             │
│  [Puerto 5432: Conexión Directa] ───► Para 'prisma migrate deploy'        │
│                                        (Advisory locks, DDL transaccional)  │
│                                                                             │
│  [Puerto 5432: Session Pooler]   ───► Para Fastify Runtime (@prisma/pg)     │
│                                        (Sesiones seguras, SSL require)      │
│                                                                             │
│  - Extensiones activas: btree_gist                                          │
│  - Restricción de concurrencia: reservas_no_overlapping_excl (GIST)         │
│  - Esquema: 17 tablas relacionales + _prisma_migrations                     │
│  - Data API (PostgREST): Sin exposición pública de tablas privadas          │
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

## 4. Estrategia de Conectividad con Supabase

### 4.1. Modos de Conexión y Puertos

Supabase implementa un pooler centralizado (Supavisor). Para una operación estable de Prisma 7 se requieren dos canales:

1. **Conexión Directa (`DIRECT_DATABASE_URL` — Puerto 5432):**
   - URL: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public&sslmode=require`
   - Uso: **Exclusivo para `prisma migrate deploy`**.
   - Justificación técnica: las migraciones de Prisma utilizan bloqueos consultivos (`pg_advisory_lock`) y comandos DDL que fallan en Transaction Poolers.
2. **Conexión de Aplicación (`DATABASE_URL` — Puerto 5432 Session Pooler o Directa):**
   - URL: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?schema=public&sslmode=require`
   - Uso: Runtime del backend Fastify mediante `@prisma/adapter-pg`.
   - Parámetros configurados en [backend/src/shared/database.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/shared/database.ts):
     - Pool local `pg.Pool` con límite conservador (`maxConnections: 10`).
     - Detección automática de SSL (`ssl: { rejectUnauthorized: false }`) ante URLs con `sslmode=require` o dominios `supabase.co` / `supabase.com`.
     - Timeout de conexión: 10,000 ms.

### 4.2. Protección de la Data API (PostgREST) y RLS

- Supabase expone automáticamente una API REST vía PostgREST sobre el puerto HTTPS 443 utilizando la `anon` key.
- **Directriz de Seguridad:**
  1. No compartir la clave `anon` con el frontend del MVP.
  2. Verificar que las tablas sensibles (`users`, `auth_sessions`, `usuarios`, `huespedes`, `reservas`, `pagos`, `garantias`, `gastos`) no tengan políticas RLS públicas permisivas (`SELECT true USING (true)`).
  3. En el panel de Supabase (Settings → API), si es factible, deshabilitar la exposición pública del esquema `public` o habilitar Row Level Security (RLS) en modo restrictivo por defecto (`ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;` sin políticas públicas anónimas).

---

## 5. Estrategia de Respaldo y Restauración Local

Antes de activar la conexión hacia la base remota, debe preservarse una instantánea completa de la base de datos local de desarrollo (`daplace_dev`).

### 5.1. Procedimiento de Respaldo Local (Backup)

Desde PowerShell en la raíz del proyecto:

```powershell
# 1. Definir marca temporal
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$BACKUP_FILE = "d:\Proyectos VS Code\Daplace\daplace-rentals\backups\daplace_dev_pre_supabase_$TIMESTAMP.sql"

# Crear directorio si no existe
New-Item -ItemType Directory -Force -Path "d:\Proyectos VS Code\Daplace\daplace-rentals\backups"

# 2. Ejecutar pg_dump excluyendo contraseñas en terminal
$env:PGPASSWORD = "daplace_local_only"
pg_dump -h localhost -p 5432 -U daplace -d daplace_dev -F p -b -v -f $BACKUP_FILE
$env:PGPASSWORD = $null

Write-Host "Respaldo completado exitosamente en: $BACKUP_FILE"
```

### 5.2. Procedimiento de Restauración Local (Rollback de Datos)

En caso de requerir volver a la base local con el estado previo:

```powershell
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

### FASE 1 — Configuración Segura (PREPARADA)
- [x] [prisma.config.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/prisma.config.ts) actualizado para resolver `DIRECT_DATABASE_URL` (para migraciones en Supabase) con respaldo a `DATABASE_URL`.
- [x] [database.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/shared/database.ts) enriquecido con soporte de `pg.Pool`, SSL condicional seguro y timeouts de pooler.
- [x] [.env.example](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/.env.example) documentado con las variables requeridas para Supabase.
- [ ] **Espera de Entrada Externa:** Recepción de credenciales del proyecto Supabase creado por Diego mediante canal privado y seguro (nunca por commit o chat público).

### FASE 2 — Despliegue de Esquema sobre Base Remota Limpia (POR EJECUTAR TRAS AUTORIZACIÓN)
*Nota: Solo ejecutar cuando Diego proporcione las credenciales oficiales.*

1. **Configurar `.env` local temporal:**
   ```env
   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?schema=public&sslmode=require"
   DIRECT_DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public&sslmode=require"
   ```
2. **Aplicar migraciones aditivas de forma determinística:**
   ```bash
   cd backend
   npm run db:migrate:deploy
   ```
   *Comprobación:* salida esperada `17 migrations found. All migrations have been applied.`
3. **Verificar estado de migraciones:**
   ```bash
   npm run db:status
   ```
   *Comprobación:* `Database schema is up to date.`

### FASE 3 — Validación Funcional y Pruebas de Humo (POR EJECUTAR TRAS FASE 2)
1. **Verificación de Estructura Físico-Relacional en Supabase:**
   - Comprobar que `_prisma_migrations` contiene las 17 filas con `finished_at` no nulo.
   - Comprobar que la extensión `btree_gist` está activa (`SELECT * FROM pg_extension WHERE extname = 'btree_gist';`).
   - Comprobar que la restricción `reservas_no_overlapping_excl` existe en `reservas`.
   - Comprobar que las 17 tablas tienen sus claves foráneas, columnas e índices correspondientes.
2. **Prueba de Conexión y Arranque del Backend:**
   - Iniciar `npm run dev` en `backend`.
   - Confirmar arranque en `http://127.0.0.1:3000` con conexión exitosa (`SELECT 1`).
3. **Smoke Test Operativo No Destructivo (Vía API Fastify):**
   - **Identidad:** Registrar administrador inicial (o migrar credenciales mínimas de demostración) e iniciar sesión en `POST /auth/login`. Verificar recepción de JWT y cookie HttpOnly.
   - **Propiedades:** Registrar propiedad de prueba en `POST /api/propiedades` y verificar consulta en `GET /api/propiedades`.
   - **Reservas:** Crear reserva de prueba en `POST /api/reservas` verificando creación de alerta interna en `notificaciones_internas` (HU-11).
   - **Anti-Overbooking:** Intentar registrar reserva solapada y confirmar rechazo 409 `CONCURRENCY_CONFLICT` respaldado por la restricción física `reservas_no_overlapping_excl`.
   - **Mantenimiento:** Asignar orden de trabajo en `POST /api/mantenimiento/ordenes` y verificar notificación personal en `notificaciones_internas` (HU-17).
   - **Reportes:** Consultar reporte financiero en `GET /api/reportes/mensual` verificando cálculo consistente.
4. **Validación de Pruebas Automatizadas:**
   - Ejecutar `npm test` en `backend`.
   - **Verificar que `backend/test` corre contra `daplace_test` local (localhost:5432) y que las 282 pruebas pasan al 100% sin enviar una sola petición a Supabase.**

---

## 7. Matriz de Riesgos y Mitigaciones

| Riesgo Técnico | Severidad | Mitigación Implementada |
|---|:---:|---|
| **Fallo en Advisory Locks de Prisma con Transaction Pooler (Puerto 6543)** | ALTA | Se configuró `DIRECT_DATABASE_URL` apuntando al puerto 5432 directo para la ejecución de `prisma migrate deploy`. |
| **Error en creación de extensión `btree_gist` por permisos insuficientes** | ALTA | El rol predeterminado de Supabase (`postgres`) cuenta con permisos de superusuario gestionado para `CREATE EXTENSION btree_gist`. Se verificará explícitamente en el primer paso de migración. |
| **Exposición no autorizada de datos vía PostgREST / clave `anon`** | CRÍTICA | No se usa PostgREST ni se comparte la clave `anon`. Las tablas sensibles deben permanecer con RLS restrictivo sin políticas públicas anónimas. |
| **Ejecución accidental de `npm test` o scripts de limpieza contra Supabase** | CRÍTICA | [backend/src/scripts/reset.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/scripts/reset.ts) y [seed-dev.ts](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/scripts/seed-dev.ts) contienen una salvaguarda que bloquea la ejecución ante cualquier host que no sea `localhost`, `127.0.0.1` o `::1`. |
| **Filtración de credenciales en commits o reportes** | CRÍTICA | Las cadenas de conexión se almacenan exclusivamente en `.env` (ignorado en `.gitignore`). NUNCA se escriben en documentos, repositorios ni logs. |
| **Límite de conexiones agotado en Supabase (Connection Exhaustion)** | MEDIA | Se fijó `maxConnections: 10` en el pool `pg.Pool` del backend Fastify para evitar sobrecargar los límites del plan de Supabase. |

---

## 8. Criterios Binarios de Aprobación (Checklist Go / No-Go)

Para declarar formalmente completada la migración una vez recibidas las credenciales, deben satisfacerse los siguientes criterios:

- [ ] **G1 (Estado Git):** PR #8 fusionado y rama de integración `integration/andre-diego-20261029` limpia y actualizada.
- [ ] **G2 (Migraciones Remotas):** Las 17 migraciones fueron aplicadas con éxito mediante `prisma migrate deploy` sobre Supabase sin errores ni rollbacks.
- [ ] **G3 (Extensiones y Exclusiones):** `btree_gist` y la restricción `reservas_no_overlapping_excl` existen activas en la base de datos Supabase.
- [ ] **G4 (Conectividad Fastify):** El backend Fastify local se conecta a Supabase con SSL y responde exitosamente al check de salud `SELECT 1`.
- [ ] **G5 (Seguridad de Autenticación):** El login autentica contra la tabla `users` en Supabase y emite JWT válidos sin utilizar Supabase Auth.
- [ ] **G6 (Pruebas Automatizadas Intactas):** `DATABASE_TEST_URL` continúa apuntando a `daplace_test` local y las 450 pruebas (282 backend + 168 frontend) pasan al 100%.
- [ ] **G7 (Cero Exposición de Secretos):** No existen credenciales de Supabase en archivos trackeados por Git, reportes o commits.
- [ ] **G8 (Plan de Rollback Probado):** El archivo de respaldo local de `daplace_dev` existe y el procedimiento de retorno a PostgreSQL local está documentado y listo.
