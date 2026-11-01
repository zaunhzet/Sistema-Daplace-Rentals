# DAPLACE RENTALS — INFORME DE CARGA DEMO SUPABASE-DEMO-02
## Reporte de Inserción y Verificación de Cuentas y Propiedades Sintéticas

- **Fecha:** 2026-11-01
- **Proyecto Supabase:** `bdfeiiqcswdxzrqoykwp`
- **Host de Conexión:** `aws-1-sa-east-1.pooler.supabase.com:5432` (Session Pooler IPv4)
- **Rol Ejecutor:** `postgres` (`postgres.bdfeiiqcswdxzrqoykwp`)
- **Modo de Ejecución:** Transacción Atómica `prisma.$transaction` (Script dedicado `seed-supabase-demo.ts`)
- **Estado de Seguridad Remoto:** 17 migraciones completas, RLS activo en las 18 tablas (Default Deny), privilegios públicos revocados, Data API deshabilitada.
- **Dictamen:** `DEMO_SEED_PASS`

---

## 1. Resumen Ejecutivo

En cumplimiento de la autorización concedida para **SUPABASE-DEMO-02**, se ejecutó la carga controlada, atómica e idempotente del inventario sintético aprobado sobre la base de datos remota de Supabase DAPLACE.

La carga incorporó exclusivamente:
- **4 Cuentas de Acceso (`users`):** `ADMINISTRADOR`, `OPERADOR`, `PROPIETARIO` y `CLIENTE`.
- **3 Usuarios de Dominio (`usuarios`):** Vinculados de forma estricta (1:1) a las cuentas de personal y propietario.
- **2 Inmuebles de Demostración (`propiedades`):** Asignados al propietario sintético.
- **Hashes Criptográficos Argon2id:** Generados con parámetros estándar OWASP (memoryCost: 19456, timeCost: 2, parallelism: 1), totalmente compatibles con el servicio de autenticación de Fastify.
- **Cero Datos Ajenos o Reales:** Todas las identidades emplean dominios RFC 2606 (`.invalid`), teléfonos ficticios y direcciones con prefijos simulados. Las restantes 14 tablas de negocio permanecen vacías (0 registros).

---

## 2. Verificaciones Obligatorias Previas (Preflight)

Antes de realizar la primera escritura, el script evaluó y certificó:
1. **Identificador del Proyecto:** URL coincide inequívocamente con `bdfeiiqcswdxzrqoykwp` y el host `supabase.com`.
2. **Sesión Activa:** Autenticado como `postgres` (Table Owner, bypass nativo de RLS sin vulnerar políticas).
3. **Migraciones:** 17/17 migraciones de Prisma completadas (`finished_at` no nulo, `rolled_back_at` nulo).
4. **Row Level Security (RLS):** 18/18 tablas en `public` con `relrowsecurity = true` y 0 tablas con `FORCE RLS`.
5. **Privilegios Públicos:** `anon` y `authenticated` cuentan con denegación absoluta (`false`) en `has_table_privilege`.
6. **Estado Inicial de Destino:** `users = 0`, `usuarios = 0`, `propiedades = 0`.
7. **Protección Anti-Colisión:** Algoritmo que aborta inmediatamente si detecta correos ajenos al inventario sintético autorizado.

---

## 3. Registros Creados en la Base de Datos Remota

### 3.1. Cuentas de Acceso (`users`) y Vínculos de Dominio (`usuarios`)

| Rol de Acceso | Email Sintético | ID en `users` | ID en `usuarios` | Rol de Dominio | Estado |
|---|---|---|---|---|:---:|
| **ADMINISTRADOR** | `admin.demo@daplace.invalid` | `00000000-0000-4000-8000-000000000001` | `00000000-0000-4000-a000-000000000001` | `ADMIN` | **ACTIVO** |
| **OPERADOR** | `operador.demo@daplace.invalid` | `00000000-0000-4000-8000-000000000002` | `00000000-0000-4000-a000-000000000002` | `OPERADOR` | **ACTIVO** |
| **PROPIETARIO** | `propietario.demo@daplace.invalid` | `00000000-0000-4000-8000-000000000003` | `00000000-0000-4000-a000-000000000003` | `PROPIETARIO` | **ACTIVO** |
| **CLIENTE** | `cliente.demo@daplace.invalid` | `00000000-0000-4000-8000-000000000004` | *NULL (Sin identidad transaccional)* | — | **ACTIVO** |

### 3.2. Propiedades de Demostración (`propiedades`)

| Inmueble | ID Propiedad | Propietario Asignado | Capacidad | Tarifa Base | Moneda | Estado Operativo / Publicación |
|---|---|---|:---:|:---:|:---:|:---:|
| **[DEMO] Departamento Miraflores Vista al Parque** | `00000000-0000-4000-c000-000000000001` | `...-a000-000000000003` | 4 | S/ 320.00 | PEN | `OPERATIVA` / `PUBLICADA` |
| **[DEMO] Suite Barranco Bohemia y Arte** | `00000000-0000-4000-c000-000000000002` | `...-a000-000000000003` | 2 | S/ 240.00 | PEN | `OPERATIVA` / `PUBLICADA` |

---

## 4. Resultados de Verificaciones Posteriores

Consultas ejecutadas directamente contra el catálogo de PostgreSQL en Supabase tras la inserción:

1. **Conteos de Tablas Sembradas:**
   - `users`: **4** registros.
   - `usuarios`: **3** registros.
   - `propiedades`: **2** registros.
2. **Vínculos de Identidad (Integridad Referencial):**
   - `SELECT count(*) FROM users u JOIN usuarios us ON u."usuarioId" = us.id` -> **3** vínculos exactos.
   - `SELECT count(*) FROM users WHERE rol = 'CLIENTE' AND "usuarioId" IS NULL` -> **1** cuenta CLIENTE sin vínculo transaccional.
3. **Validación de Hashes Criptográficos:**
   - 4/4 hashes almacenados cumplen el estándar `$argon2id$v=19$%` con longitud mayor a 50 caracteres.
   - Ninguna contraseña ni hash fue impreso en logs ni incluido en commits.
4. **Ausencia de Datos No Autorizados en Tablas Operativas:**
   - Conteo en las restantes 14 tablas de negocio (`reservas`, `pagos`, `gastos`, `garantias`, `contratos_reserva`, `evidencias_pago`, `ordenes_trabajo`, `auditoria_eventos`, etc.): **0 registros**.
5. **Idempotencia:**
   - Se ejecutó una segunda corrida del script de seed confirmando que no se generan duplicados, no se modifican IDs y la base permanece idéntica.
6. **Estado de Prisma Migrate:**
   - `npx prisma migrate status` reporta: `Database schema is up to date! (17 migrations found)`.
7. **Seguridad y RLS:**
   - RLS activo en las 18 tablas (18/18). Privilegios públicos de `anon` y `authenticated` continúan denegados al 100%.

---

## 5. Estado Git y Repositorio

- **Rama Activa:** `feat/supabase-deploy` (sobre base `integration/andre-diego-20261029`).
- **Estado de Trabajo:** Modificaciones locales preparadas y verificadas, sin commits desordenados ni push remoto.
- **Compilación Monorepo:** `npm run typecheck` y `npm run build` en verde (0 errores en backend y frontend).
- **Suites de Pruebas Automatizadas:** 282/282 pruebas de backend pasadas, 168/168 pruebas de frontend pasadas contra `daplace_test` local.

---

## 6. Procedimiento Restante para la Entrega a Diego

El sistema se encuentra 100% operativo y listo para que Diego inicie la validación en su máquina. Lo único pendiente es:

1. **Entrega de la Guía:** Entregar a Diego el documento [docs/ENTREGA-DIEGO-MVP.md](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/ENTREGA-DIEGO-MVP.md).
2. **Transmisión Segura de Credenciales:** Proporcionar a Diego por canal privado (mensajería segura / 1Password / Signal) la contraseña de conexión a Supabase y las contraseñas temporales para las 4 cuentas (`admin.demo@daplace.invalid`, `operador.demo@daplace.invalid`, `propietario.demo@daplace.invalid`, `cliente.demo@daplace.invalid`).
3. **Inicio del Servicio:** Diego ejecutará localmente:
   ```bash
   npm install && npm run build
   npm run dev
   ```
   e ingresará a `http://127.0.0.1:5173` para realizar la validación funcional de usuario final.

---

## 7. Dictamen

# `DEMO_SEED_PASS`

*La base de datos remota de Supabase cuenta con los datos sintéticos determinísticos requeridos. No se ha realizado push ni apertura de PR. El sistema se encuentra en pausa operativa a la espera de la entrega formal de credenciales a Diego.*
