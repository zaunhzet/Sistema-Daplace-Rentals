# DAPLACE RENTALS — INFORME DE ENDURECIMIENTO DE SEGURIDAD SUPABASE-SEC-02

- **Fecha:** 2026-11-01
- **Proyecto Supabase:** `bdfeiiqcswdxzrqoykwp`
- **Host de Conexión:** `aws-1-sa-east-1.pooler.supabase.com:5432` (Session Pooler IPv4)
- **Rol Ejecutor:** `postgres` (`postgres.bdfeiiqcswdxzrqoykwp`)
- **Script Aplicado:** `SUPABASE-SEC-01-FIX` (`database/scripts/supabase-sec-01-hardening.sql`)
- **Estado de Data API:** Deshabilitada en Dashboard (`Enable Data API: OFF`, `No schemas can be queried`)
- **Dictamen:** `SECURITY_HARDENING_PASS`

---

## 1. Resumen Ejecutivo

En cumplimiento de la autorización concedida para **SUPABASE-SEC-02**, se aplicó de forma atómica y transaccional el script de endurecimiento de seguridad corregido **SUPABASE-SEC-01-FIX** sobre la base de datos remota de Supabase.

La operación implementa el principio de defensa en profundidad (*Defense-in-Depth*):
1. **Revocación Total de Privilegios Existentes:** Los roles públicos (`anon` y `authenticated`) quedaron sin permisos sobre ninguna de las 18 tablas ni secuencias del esquema `public`.
2. **Endurecimiento de Privilegios Predeterminados:** Las reglas de `pg_default_acl` para `postgres` sobre `public` fueron actualizadas para revocar permisos automáticos sobre futuras tablas y secuencias a `anon` y `authenticated`.
3. **Row Level Security (RLS) en 18 Tablas:** Habilitado en modo *Default Deny* (sin políticas permisivas), garantizando que ningún rol no privilegiado pueda leer ni escribir registros.
4. **Preservación Operativa de `postgres`:** Al no utilizarse `FORCE ROW LEVEL SECURITY`, el Table Owner (`postgres`) mantiene acceso irrestricto nativo para Fastify, Prisma ORM y Prisma Migrate.
5. **Preservación de Infraestructura y Extensiones:** No se modificaron privilegios del rol del plano de control `supabase_admin`, no se alteraron las 188 rutinas de la extensión `btree_gist` 1.7, y se mantuvieron los permisos estándar de `PUBLIC` sobre el esquema para garantizar la operatividad de los servicios administrados de Supabase.

---

## 2. SQL Transaccional Aplicado

El siguiente bloque SQL fue ejecutado en una única transacción atómica `BEGIN; ... COMMIT;` mediante conexión TLS estricta autenticada como `postgres`:

```sql
BEGIN;

-- 1. Revocar permisos actuales sobre las 18 tablas en public a anon y authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- 2. Revocar permisos actuales sobre secuencias en public a anon y authenticated
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 3. Modificar privilegios predeterminados futuros para objetos creados por 'postgres'
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 4. Activar Row Level Security (RLS) en las 18 tablas (Default Deny sin políticas públicas)
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_reserva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_reserva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidencias_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garantias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.huespedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_garantia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustentos_gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

COMMIT;
```

---

## 3. Resultados de Verificaciones Posteriores

### 3.1. Estado de Row Level Security (`pg_class.relrowsecurity`)

Se inspeccionaron las 18 tablas en el esquema `public`:

| Tabla | `relrowsecurity` (RLS) | `relforcerowsecurity` (FORCE) | Estado |
|---|:---:|:---:|:---:|
| `_prisma_migrations` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `auditoria_eventos` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `auth_sessions` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `avisos_reserva` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `contratos_reserva` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `evidencias_pago` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `garantias` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `gastos` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `huespedes` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `movimientos_garantia` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `notificaciones_internas` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `ordenes_trabajo` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `pagos` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `propiedades` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `reservas` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `sustentos_gasto` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `users` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |
| `usuarios` | `true` | `false` | OK (Default Deny, bypass nativo para `postgres`) |

- **Conclusión:** 18/18 tablas con RLS activado. 0 tablas con FORCE RLS.

---

### 3.2. Acceso Efectivo en Tablas (`has_table_privilege`)

Se evaluaron todas las operaciones relacionales (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) para los roles `anon`, `authenticated` y `postgres` a través de la función del catálogo `has_table_privilege(role, table_oid, privilege)`:

- **Rol `anon`:**
  - `SELECT`: `false` (18/18 tablas)
  - `INSERT`: `false` (18/18 tablas)
  - `UPDATE`: `false` (18/18 tablas)
  - `DELETE`: `false` (18/18 tablas)
  - `TRUNCATE`: `false` (18/18 tablas)
  - `REFERENCES`: `false` (18/18 tablas)
  - `TRIGGER`: `false` (18/18 tablas)
- **Rol `authenticated`:**
  - `SELECT`: `false` (18/18 tablas)
  - `INSERT`: `false` (18/18 tablas)
  - `UPDATE`: `false` (18/18 tablas)
  - `DELETE`: `false` (18/18 tablas)
  - `TRUNCATE`: `false` (18/18 tablas)
  - `REFERENCES`: `false` (18/18 tablas)
  - `TRIGGER`: `false` (18/18 tablas)
- **Rol `postgres`:**
  - Conserva `true` para todas las operaciones en las 18 tablas (100% operativo).

---

### 3.3. Privilegios Predeterminados (`pg_default_acl`)

Inspección de las reglas por defecto para objetos creados por `postgres`:
- En `schema = 'public'`, tipo `tables` (`r`): `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`. (Sin privilegios para `anon` ni `authenticated`).
- En `schema = 'public'`, tipo `sequences` (`S`): `{postgres=rwU/postgres,service_role=rwU/postgres}`. (Sin privilegios para `anon` ni `authenticated`).

---

### 3.4. Batería de Pruebas Negativas (`SET LOCAL ROLE`)

Se ejecutaron pruebas directas de intrusión simulada contra PostgreSQL con roles impersonados, aislando cada intento en bloques transaccionales:

| # | Prueba Negativa | Sentencia SQL | Código Esperado | Código Retornado | Resultado |
|---|---|---|:---:|:---:|:---:|
| 1 | Intento de lectura anónima en `users` | `SET LOCAL ROLE anon; SELECT * FROM public.users LIMIT 1;` | `42501` | `42501` | **PASS (DENEGADO)** |
| 2 | Intento de lectura anónima en `reservas` | `SET LOCAL ROLE anon; SELECT * FROM public.reservas LIMIT 1;` | `42501` | `42501` | **PASS (DENEGADO)** |
| 3 | Intento de lectura autenticada en `users` | `SET LOCAL ROLE authenticated; SELECT * FROM public.users LIMIT 1;` | `42501` | `42501` | **PASS (DENEGADO)** |
| 4 | Intento de inserción fraudulenta en `auditoria_eventos` | `SET LOCAL ROLE authenticated; INSERT INTO public.auditoria_eventos (id, entidad, "entidadId", accion) VALUES ('test-hack', 'users', '1', 'HACK');` | `42501` | `42501` | **PASS (DENEGADO)** |
| 5 | Intento de actualización no autorizada en `users` | `SET LOCAL ROLE authenticated; UPDATE public.users SET email = 'hacked@malicious.com';` | `42501` | `42501` | **PASS (DENEGADO)** |
| 6 | Intento de borrado masivo en `users` | `SET LOCAL ROLE authenticated; DELETE FROM public.users;` | `42501` | `42501` | **PASS (DENEGADO)** |

- **Conclusión:** 100% de las pruebas negativas arrojaron `42501: permission denied for table ...`. Ningún dato fue leído, insertado, modificado ni eliminado.

---

### 3.5. Validación Operativa de Prisma y Fastify

1. **Prisma Client Ping:**
   - `SELECT 1 AS ping, current_user::text AS usr;` -> `ping = 1`, `usr = 'postgres'`.
2. **Acceso de Lectura como `postgres`:**
   - Conteo en `public.users`: `0` registros (acceso irrestricto confirmado sin bloqueos RLS).
   - Conteo en `public.reservas`: `0` registros (acceso irrestricto confirmado sin bloqueos RLS).
3. **Prisma Migrate Status:**
   - Comando: `npx prisma migrate status` (mediante `DIRECT_DATABASE_URL`).
   - Salida: `17 migrations found in prisma/migrations. Database schema is up to date!`.
4. **Integridad de Esquema y Datos:**
   - 17 tablas de dominio con 0 registros de negocio.
   - Restricción GIST `reservas_no_overlapping_excl` operando con `btree_gist` 1.7.
   - 32 claves foráneas y 80 índices activos en `public`.

---

## 4. Guía de Reproducción en Futuras Instalaciones

Para reproducir este mismo endurecimiento en nuevos entornos de Supabase:
1. Desplegar migraciones:
   ```bash
   npx prisma migrate deploy
   ```
2. Ejecutar el script SQL versionado:
   ```bash
   psql "$DIRECT_DATABASE_URL" -f database/scripts/supabase-sec-01-hardening.sql
   ```
3. Validar con el script de verificación automatizado:
   ```bash
   npm --prefix backend run tsx src/scripts/verify-security-hardening.ts
   ```

---

## 5. Dictamen

# `SECURITY_HARDENING_PASS`

La base de datos de Supabase DAPLACE (`bdfeiiqcswdxzrqoykwp`) cuenta con Row Level Security activado en las 18 tablas, permisos públicos revocados, privilegios por defecto restringidos, pruebas negativas de intrusión 100% denegadas con código `42501`, y operatividad completa y verificada de Prisma Client y Prisma Migrate.
