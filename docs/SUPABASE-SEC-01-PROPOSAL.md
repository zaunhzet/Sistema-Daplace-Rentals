# DAPLACE RENTALS — SUPABASE-SEC-01-FIX
## Propuesta Definitiva de Endurecimiento de Seguridad en Supabase PostgreSQL

- **Fecha:** 2026-11-01
- **Proyecto Supabase:** `bdfeiiqcswdxzrqoykwp`
- **Host de Conexión:** `aws-1-sa-east-1.pooler.supabase.com:5432` (Session Pooler IPv4)
- **Rol de Conexión:** `postgres` (`postgres.bdfeiiqcswdxzrqoykwp`)
- **Estado de Data API:** Deshabilitada en Dashboard (`Enable Data API: OFF`, `No schemas can be queried`)
- **Dictamen:** `READY_FOR_SECURITY_APPLY`

---

### 1. Hallazgos Confirmados y Correcciones Focales Incorporadas

Tras la revisión independiente contra el catálogo activo de Supabase, se incorporan 4 correcciones fundamentales sobre la propuesta inicial:

1. **Eliminación de Sentencias sobre `supabase_admin`:**
   - El rol de conexión es `postgres`, el cual **no es miembro** de `supabase_admin`.
   - Intentar ejecutar `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` provocaría el error de PostgreSQL `42501: must be member of role "supabase_admin"`.
   - Se suprimen todas las referencias y sentencias dirigidas a `supabase_admin`.

2. **Preservación Íntegra de las 188 Rutinas de `btree_gist`:**
   - Las 188 rutinas existentes en el esquema `public` pertenecen estrictamente a la extensión `btree_gist` (versión 1.7), instalada por la migración bootstrap para dar soporte a la restricción física `reservas_no_overlapping_excl`.
   - Se suprime la revocación indiscriminada de funciones (`REVOKE ALL ON ALL ROUTINES`), evitando posibles fallos colaterales en la invocación interna de operadores o indexación compartida.

3. **Análisis de `PUBLIC` y Preservación de Permisos Globales del Esquema:**
   - El pseudo-rol `PUBLIC` posee el privilegio `USAGE` en el esquema `public` por convención estándar de PostgreSQL.
   - Revocar `USAGE` sobre el esquema a nivel global (`FROM PUBLIC`) es una operación destructiva de alto riesgo que afectaría los servicios internos administrados de Supabase y extensiones.
   - La **ausencia de acceso efectivo** a nivel de datos queda garantizada sin modificar los permisos globales del esquema mediante la combinación de:
     - Revocación directa de privilegios sobre tablas y secuencias a `anon` y `authenticated`.
     - Revocación de privilegios predeterminados de `postgres` sobre futuras tablas y secuencias.
     - Activación de Row Level Security (**RLS**) en las 18 tablas en modo **Default Deny** (sin políticas públicas).
     - RLS deniega el 100% de las filas a cualquier rol sin bypass, neutralizando cualquier resolución de nombres derivada del `USAGE` del esquema.

4. **Preservación del Acceso Total para el Propietario `postgres`:**
   - Las 18 tablas (las 17 tablas de dominio de Daplace + `_prisma_migrations`) pertenecen a `postgres`.
   - En PostgreSQL, el Table Owner ignora las restricciones de RLS de forma automática (*"The table owner bypasses row-level security by default"*), a menos que se aplique explícitamente `FORCE ROW LEVEL SECURITY`.
   - Al no utilizar `FORCE ROW LEVEL SECURITY`, `postgres` mantiene acceso irrestricto a nivel de lectura, escritura y DDL para Fastify, Prisma ORM y Prisma Migrate.

---

### 2. Script SQL Transaccional Mínimo (`SUPABASE-SEC-01-FIX`)

El siguiente script contiene el conjunto mínimo, atómico y suficiente de instrucciones para aislar la base de datos sin romper servicios administrados ni privilegios de ejecución:

```sql
-- ==============================================================================
-- DAPLACE RENTALS — SUPABASE-SEC-01-FIX: Endurecimiento Transaccional Mínimo
-- Rol de ejecución: postgres (Database Owner)
-- Proyecto: bdfeiiqcswdxzrqoykwp
-- ==============================================================================

BEGIN;

-- 1. Revocar permisos actuales sobre las 18 tablas en public a anon y authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- 2. Revocar permisos actuales sobre secuencias en public a anon y authenticated
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 3. Modificar privilegios predeterminados futuros para objetos creados por 'postgres'
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 4. Activar Row Level Security (RLS) en las 18 tablas (Default Deny sin políticas)
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

### 3. Consideraciones de Seguridad: `PUBLIC` y Riesgo Residual de `supabase_admin`

#### 3.1. Permisos Heredados del Pseudo-Rol `PUBLIC`
- **Situación:** En PostgreSQL, `PUBLIC` es un grupo implícito al cual pertenecen todos los roles. El esquema `public` posee por defecto `USAGE` para `PUBLIC`.
- **Efecto de USAGE:** Concede el derecho de buscar y resolver identificadores de objetos dentro del esquema, pero **no otorga derechos de lectura (`SELECT`) ni escritura (`INSERT`, `UPDATE`, `DELETE`)** sobre las tablas.
- **Defensa Aplicada:** 
  1. Las tablas y secuencias de Daplace no tienen grants asignados a `PUBLIC` en el catálogo de PostgreSQL.
  2. Los grants explícitos a `anon` y `authenticated` son revocados en el Paso 1 y 2.
  3. Incluso si existiera un grant heredado inadvertido en el futuro, **RLS activo sin políticas públicas deniega el 100% del acceso** a nivel de filas para cualquier rol no privilegiado (cero filas devueltas en SELECT, rechazo total en escrituras).
- **Conclusión:** No se requiere alterar los permisos globales de `PUBLIC` sobre el esquema, preservando la compatibilidad de las herramientas internas de Supabase sin comprometer los datos de la aplicación.

#### 3.2. Riesgo Residual de Privilegios Predeterminados de `supabase_admin`
- **Situación:** `supabase_admin` mantiene en `pg_default_acl` reglas que asignan privilegios automáticos a `anon` y `authenticated` cuando dicho rol crea tablas o secuencias.
- **Imposibilidad de Modificación:** `postgres` carece de autorización para alterar los default ACLs de `supabase_admin` (`42501`).
- **Análisis de Riesgo Residual:**
  - **Canal de Creación de Objetos:** En Daplace Rentals, el 100% de las migraciones, esquemas y tablas son creados por **Prisma Migrate** a través de `DIRECT_DATABASE_URL`, que se autentica estrictamente como **`postgres`**.
  - **Cobertura de Protección:** Los default privileges de `postgres` quedan revocados en el Paso 3. Por ende, cualquier tabla o secuencia creada por futuras migraciones de Prisma nacerá sin permisos para `anon` ni `authenticated`.
  - **Mitigación Adicional:** La Data API (PostgREST) está explícitamente apagada en el Dashboard de Supabase (`No schemas can be queried`).
- **Nivel de Riesgo:** **Residual y Controlado.** El único escenario donde aplicaría sería si un administrador ejecutara scripts DDL desde una consola administrativa interna que opere directamente con la identidad `supabase_admin`. Como práctica estándar, todo cambio de esquema debe transitar por Prisma Migrate.

---

### 4. Protocolo de Verificaciones Posteriores

Tras la aplicación del script, se ejecutarán 5 comprobaciones independientes mediante consultas al catálogo y herramientas de orquestación:

#### 4.1. Verificación de Acceso Efectivo (`has_table_privilege`)
Consulta para comprobar que ningún rol público posea facultades sobre las 18 tablas y que `postgres` conserve acceso total:
```sql
SELECT 
  c.relname AS table_name,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
  has_table_privilege('postgres', c.oid, 'SELECT') AS postgres_select,
  has_table_privilege('postgres', c.oid, 'INSERT') AS postgres_insert,
  has_table_privilege('postgres', c.oid, 'UPDATE') AS postgres_update,
  has_table_privilege('postgres', c.oid, 'DELETE') AS postgres_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
```
- **Criterio de Aprobación:**
  - `anon_*` = `false` en las 18 tablas.
  - `auth_*` = `false` en las 18 tablas.
  - `postgres_*` = `true` en las 18 tablas.

#### 4.2. Verificación de Privilegios Predeterminados (`pg_default_acl`)
Consulta para confirmar que las reglas de `postgres` sobre `public` no concedan privilegios a roles públicos:
```sql
SELECT 
  pg_roles.rolname AS owner,
  pg_namespace.nspname AS schema_name,
  CASE defaclobjtype
    WHEN 'r' THEN 'tables'
    WHEN 'S' THEN 'sequences'
    ELSE defaclobjtype::text
  END AS object_type,
  defaclacl::text AS acl
FROM pg_default_acl
JOIN pg_roles ON pg_roles.oid = pg_default_acl.defaclrole
LEFT JOIN pg_namespace ON pg_namespace.oid = pg_default_acl.defaclnamespace
WHERE pg_roles.rolname = 'postgres'
ORDER BY object_type;
```
- **Criterio de Aprobación:** Las entradas para `tables` y `sequences` no deben otorgar privilegios a `anon` ni a `authenticated`.

#### 4.3. Verificación de RLS en el Catálogo (`pg_class.relrowsecurity`)
Consulta para constatar la activación de Row Level Security sin bypass forzado:
```sql
SELECT 
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
```
- **Criterio de Aprobación:**
  - `rls_enabled` = `true` (18/18 tablas).
  - `rls_forced` = `false` (18/18 tablas, garantizando bypass nativo para `postgres`).

#### 4.4. Verificación de Conectividad y Consulta de Prisma
- Ejecución de consulta de lectura (`SELECT 1`, conteo de tablas) vía Prisma Client como `postgres`.
- **Criterio de Aprobación:** Respuesta HTTP 200/OK a nivel de base de datos sin errores de permisos.

#### 4.5. Verificación de Prisma Migrate
- Ejecución de `npx prisma migrate status` a través de `DIRECT_DATABASE_URL`.
- **Criterio de Aprobación:** Salida exitosa reportando `Database schema is up to date!`.

---

### 5. Dictamen Técnico y Próximo Paso

- **Estado:** **`READY_FOR_SECURITY_APPLY`**
- **Condición:** El script transaccional mínimo y el protocolo de verificación se encuentran consolidados y listos en el repositorio (`backend/src/scripts/verify-security-hardening.ts`). 
- **Restricción:** No se ha ejecutado ninguna modificación en la base de datos remota ni se ha habilitado la Data API, en estricto cumplimiento de las directivas recibidas.
