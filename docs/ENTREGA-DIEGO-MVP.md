# DAPLACE RENTALS — GUÍA DE ENTREGA Y PUESTA EN MARCHA DEL MVP
## Manual Operativo para Validación Funcional (Diego)

- **Fecha de Entrega:** 2026-11-01
- **Versión de Entrega:** MVP 1.0.0 (Release Candidate)
- **Base de Datos Remota:** Supabase PostgreSQL (`bdfeiiqcswdxzrqoykwp`)
- **Modo de Conexión:** Session Pooler IPv4 (`aws-1-sa-east-1.pooler.supabase.com:5432`)
- **Estado de Seguridad Remoto:** 17 migraciones completas, RLS activo en las 18 tablas (Default Deny), permisos públicos revocados, Data API deshabilitada.
- **Responsabilidad de Validación:** La exploración de interfaz, recorridos manuales y aceptación funcional corresponden exclusivamente a Diego en calidad de usuario y validador de negocio.

---

### 1. Requisitos Previos del Sistema

Antes de iniciar, verificar en la terminal local:
- **Node.js:** Versión `v24.x` requerida (`node -v`).
- **NPM:** Versión `v11.x` requerida (`npm -v`).
- **Git:** Instalado y configurado.
- **Navegador Web:** Chrome, Edge o Firefox moderno.

---

### 2. Configuración Segura del Entorno Local (`.env`)

En la raíz del repositorio (`daplace-rentals/`), crear o editar el archivo `.env` tomando como base `.env.example`:

```bash
# 1. Conexión a Supabase (Session Pooler IPv4 en puerto 5432)
# Reemplazar [TU_PASSWORD] por la contraseña de la base de datos entregada por canal seguro:
DATABASE_URL="postgresql://postgres.bdfeiiqcswdxzrqoykwp:[TU_PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?schema=public&sslmode=require"
DIRECT_DATABASE_URL="postgresql://postgres.bdfeiiqcswdxzrqoykwp:[TU_PASSWORD]@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?schema=public&sslmode=require"

# 2. Configuración TLS estricta con CA oficial
DATABASE_SSL="true"
DATABASE_SSL_CA="./backend/certs/supabase-ca.crt"
DATABASE_POOL_MAX="10"
DATABASE_TIMEOUT_MS="10000"

# 3. Base de Datos de Pruebas (Aislamiento local obligatorio)
DATABASE_TEST_URL="postgresql://daplace:daplace_local_only@localhost:5432/daplace_test?schema=public"

# 4. Servidor API Fastify
API_HOST="127.0.0.1"
API_PORT="3000"

# 5. Seguridad Web y Sesiones
JWT_SECRET="daplace_jwt_secret_local_diego_mvp_2026_super_seguro_min32chars"
JWT_EXPIRES_IN="15m"
COOKIE_SECURE="false"

# 6. CORS
CORS_ORIGIN="http://127.0.0.1:5173,http://localhost:5173"
CORS_ALLOWED_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"

# 7. Frontend Vite
VITE_API_BASE_URL="http://127.0.0.1:3000"

# 8. Modos y Bypasses (Ambos desactivados para prueba auténtica)
ENABLE_DEMO_AUTH_BYPASS="false"
ALLOW_DEV_SEED="false"
```

> **NOTA DE SEGURIDAD:** 
> - El archivo `.env` está en `.gitignore` y **nunca** debe ser añadido a commits ni compartido públicamente.
> - La contraseña de la base de datos se proporciona exclusivamente por canal privado y seguro.
> - El certificado CA oficial de Supabase ya se encuentra versionado en [backend/certs/supabase-ca.crt](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/certs/supabase-ca.crt).

---

### 3. Instalación de Dependencias y Compilación

Desde la raíz del repositorio:

```bash
# 1. Instalar dependencias del monorepo
npm install

# 2. Generar el cliente de Prisma
npm run db:generate

# 3. Verificar compilación TypeScript
npm run typecheck
npm run build
```

---

### 4. Inicio de los Servidores de Aplicación

#### 4.1. Verificación Opcional de Conexión Remota
Antes de iniciar los servidores, puedes comprobar la conectividad TLS con Supabase ejecutando:
```bash
npm --prefix backend run tsx src/scripts/test-remote-connection.ts
```
*(Debe retornar `CONECTIVIDAD REMOTA: OK` confirmando sesión `postgres` y TLS estricto).*

#### 4.2. Ejecución Concurrente del MVP
Para iniciar tanto el backend (Fastify) como el frontend (React/Vite) en una sola terminal:

```bash
npm run dev
```

O si prefieres ejecutarlos en terminales separadas:
- **Terminal 1 (Backend API):**
  ```bash
  npm run dev:api
  # Escuchando en: http://127.0.0.1:3000
  ```
- **Terminal 2 (Frontend Web):**
  ```bash
  npm run dev:web
  # Disponible en: http://127.0.0.1:5173
  ```

Abre tu navegador en `http://127.0.0.1:5173` para ingresar a la plataforma. Las 4 cuentas sintéticas y los 2 inmuebles ya se encuentran precargados en la base de datos remota de Supabase.

---

### 5. Cuentas de Acceso y Roles de Demostración

El sistema cuenta con 4 roles bien diferenciados según la matriz RBAC de la aplicación. Las contraseñas de cada cuenta se suministran por canal privado:

| Rol | Correo Electrónico (Sintético) | Propósito y Alcance Funcional |
|---|---|---|
| **ADMINISTRADOR** | `admin.demo@daplace.invalid` | Acceso irrestricto: gestión de personal, auditoría, configuración, liquidaciones y todas las propiedades. |
| **OPERADOR** | `operador.demo@daplace.invalid` | Operación diaria: gestión de reservas, validación de comprobantes, contratos y órdenes de mantenimiento. |
| **PROPIETARIO** | `propietario.demo@daplace.invalid` | Portal del Propietario: visualización de ingresos, estados de cuenta, liquidaciones y calendario de sus inmuebles. |
| **CLIENTE** | `cliente.demo@daplace.invalid` | Portal informativo / autoservicio de cliente (rol restringido). |

#### Inmuebles Sintéticos Disponibles
1. **[DEMO] Departamento Miraflores Vista al Parque:**
   - Dirección ficticia: Calle Ficticia 450, Dpto 802, Miraflores, Lima.
   - Capacidad: 4 huéspedes | Tarifa base: S/ 320.00 / noche | Moneda: PEN.
   - Propietario asignado: `propietario.demo@daplace.invalid`.
2. **[DEMO] Suite Barranco Bohemia y Arte:**
   - Dirección ficticia: Av. San Martín Ficticia 210, Barranco, Lima.
   - Capacidad: 2 huéspedes | Tarifa base: S/ 240.00 / noche | Moneda: PEN.
   - Propietario asignado: `propietario.demo@daplace.invalid`.

---

### 6. Mapa de Módulos Operativos y Estado de Historias de Usuario

El MVP implementa 22 historias de usuario plenamente integradas:

| Módulo | Funcionalidades Disponibles |
|---|---|
| **Autenticación y Sesiones** | Login JWT, rotación de refresh tokens, cookies seguras, control de inactividad, revocación de sesión. |
| **Gestión de Propiedades** | Catálogo, alta, edición, estados operativos (`OPERATIVA`, `EN_MANTENIMIENTO`), capacidad y tarifas. |
| **Reservas y Calendario** | Creación de reservas, anti-overbooking físico (PostgreSQL GIST), calendario mensual unificado. |
| **Pagos y Conciliación** | Registro de adelantos y saldos, conciliación bancaria idempotente, hash HMAC de cuentas bancarias. |
| **Contratos y Vouchers (DR-02)** | Carga de contratos, versionado determinístico, revisión y validación de evidencias por coordinador. |
| **Expiración y Avisos (DR-03)** | Expiración automática de solicitudes vencidas, liberación atómica de fechas, outbox durable. |
| **Garantías y Liquidaciones** | Custodia de garantías, retenciones parciales/totales, liquidación de depósitos. |
| **Gastos y Mantenimiento** | Registro de gastos con sustento, órdenes de trabajo para limpieza/reparación, asignación a personal. |
| **Reportes para Propietarios** | Estados de cuenta mensuales, desglose de ingresos netos y comisiones, exportación. |
| **Administración de Personal (HU-19)**| Alta y baja de operadores, asignación de roles de dominio, protección contra auto-desactivación. |

#### Estado de HU-15 (Consultar autorizaciones de ingreso)
- **Estado:** `BLOQUEADA_DECISION` (Registrada bajo la Decisión Arquitectónica DEC-09).
- **Razón:** Requiere definición del proveedor oficial de cerraduras inteligentes / control de acceso físico (ej. Nuki/Tuya) y entrega de credenciales auténticas. 
- **Impacto:** Ningún módulo del MVP depende de este componente; se encuentra debidamente aislada para no interferir en la validación funcional.

---

### 7. Protocolo para Reportar Defectos Funcionales

Si durante la exploración detectas alguna anomalía, comportamiento inesperado o error de interfaz, repórtalo documentando los siguientes campos para facilitar su diagnóstico y corrección:

```markdown
### Reporte de Defecto Funcional
- **Módulo / Pantalla:** (ej. Reservas -> Confirmación de Contrato)
- **Cuenta / Rol Utilizado:** (ej. operador.demo@daplace.invalid)
- **Descripción del Problema:** (Qué ocurrió de forma anómala)
- **Pasos para Reproducir:**
  1. Ir a ...
  2. Hacer clic en ...
  3. Ingresar el valor ...
- **Comportamiento Esperado:** (Qué debió suceder según la regla de negocio)
- **Comportamiento Observado:** (Mensaje de error, pantalla en blanco, código HTTP, etc.)
- **Captura / Log:** (Si aplica, captura de pantalla o mensaje de consola en F12)
```
