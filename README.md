# Daplace Rentals — Monorepo Transaccional

Monorepo de desarrollo para el **Sistema Web Transaccional para la Gobernanza y Estandarización de Datos de Daplace Rentals**.

El sistema integra la gestión integral de operaciones inmobiliarias de alquiler temporal (propiedades, huéspedes, reservas, calendario, pagos, garantías, gastos y contratos) con un motor de backend en **Fastify 5**, base de datos relacional **PostgreSQL** mediante **Prisma ORM 7**, control de concurrencia y un sistema de **autenticación y autorización basada en roles (RBAC) con sesiones persistentes y revocación durable**.

---

## 1. Arquitectura y Módulos del Sistema

```text
daplace-rentals/
├── frontend/                     React 19 + Vite + TypeScript + Tailwind CSS
│   ├── src/features/auth/        Autenticación real, rotación, contexto seguro y sesión
│   ├── src/features/properties/  Gestión de inmuebles, estado operativo y ownership
│   ├── src/features/guests/      Directorio de huéspedes con validación de contacto
│   ├── src/features/reservations/ Ciclo de vida de reservas, solape y outbox
│   ├── src/features/calendar/    Grilla mensual de ocupación y sincronización
│   ├── src/features/payments/    Pagos, conciliación contable y vouchers probatorios
│   ├── src/features/guarantees/  Custodia de depósitos y libro de movimientos
│   ├── src/features/expenses/    Gastos operativos por inmueble y sustentos
│   └── src/shared/api/           Cliente API unificado con epoch y reintento idempotente
├── backend/                      Fastify 5 + TypeScript + Prisma 7 + PostgreSQL
│   ├── prisma/                   Esquema unificado (User, Usuario, Reserva, Pago, etc.)
│   ├── src/modules/auth/         Servicio atómico de autenticación, JWT y sesiones
│   ├── src/modules/reservations/ Expiración transaccional (DR-03) y worker de avisos
│   ├── src/routes/               Endpoints REST de dominio protegidos por roles
│   └── src/scripts/              Seeds seguros de desarrollo y reseteo idempotente
├── docs/                         Documentación técnica, auditorías y trazabilidad
└── compose.yaml                  Contenedor Docker para PostgreSQL local
```

---

## 2. Requisitos de Entorno

* **Node.js:** Versión 24.x LTS (compatible con Node 20+).
* **npm:** Versión 11.x o superior.
* **PostgreSQL / Docker:** PostgreSQL 16+ con extensión `btree_gist` habilitada (proporcionada mediante `compose.yaml`).
* **Git:** Para control de versiones.

---

## 3. Puesta en Marcha Local

### Paso 1: Configurar variables de entorno e instalar dependencias

En PowerShell (Windows):
```powershell
Copy-Item .env.example .env
npm ci
```

En Bash (macOS / Linux):
```sh
cp .env.example .env
npm ci
```

### Paso 2: Iniciar PostgreSQL y aplicar migraciones

```sh
npm run db:up
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
```

### Paso 3: Inicializar datos de desarrollo (Seed Seguro)

Configure en su archivo `.env` local:
* `ALLOW_DEV_SEED="true"`
* `DEV_DEFAULT_PASSWORD="<contraseña_elegida_min_8_caracteres>"`

Y ejecute:
```sh
npm run db:seed
```

#### Cuentas de Prueba Creadas:
| Rol | Correo | Propósito en el Sistema |
| :--- | :--- | :--- |
| **ADMINISTRADOR** | `admin.dev@daplace.pe` | Gestión total, anulación de pagos, aprobación de gastos |
| **OPERADOR** | `operador.dev@daplace.pe` | Registro de reservas, pagos y atención de huéspedes |
| **PROPIETARIO** | `propietario.dev@daplace.pe` | Acceso restringido a sus inmuebles y calendario propio |
| **CLIENTE** | `cliente.dev@daplace.pe` | Cuenta base de huésped/usuario |

---

## 4. Ejecución del Entorno de Desarrollo

Para iniciar tanto el frontend como el backend simultáneamente:
```sh
npm run dev
```

* **Frontend Web:** <http://127.0.0.1:5173>
* **Backend API:** <http://127.0.0.1:3000>
* **Health Check API:** <http://127.0.0.1:3000/health>
* **Health Check Base de Datos:** <http://127.0.0.1:3000/health/ready>

Para ejecutarlos en terminales independientes:
* Frontend: `npm run dev:web`
* Backend: `npm run dev:api`

---

## 5. Suites de Pruebas y Calidad de Código

El proyecto cuenta con validación integral automatizada sin mocks destructivos:

```sh
# Ejecutar verificación completa (Typecheck, Tests y Build)
npm run verify

# O de forma independiente:
npm run typecheck       # Verificación estricta de tipos en frontend y backend
npm test                # Ejecuta 234 tests backend (PostgreSQL) y 140 tests frontend
npm run build           # Compilación de paquetes de producción
```

---

## 6. Aspectos Clave de Seguridad y Negocio

1. **Separación de Identidades (`User` vs `Usuario`):**
   * `User` gestiona credenciales de acceso, contraseñas cifradas y sesiones activas.
   * `Usuario` representa la identidad transaccional en el dominio (propietario o personal interno).
   * Vínculo relacional `User.usuarioId -> Usuario.id` con integridad referencial estricta `ON DELETE RESTRICT`. Nunca se sustituye `User.id` por `Usuario.id`.
2. **Aislamiento de Dominio para Propietarios:**
   * Si un usuario con rol `PROPIETARIO` no posee vínculo transaccional en `usuarios`, los endpoints responden `403 DOMAIN_IDENTITY_REQUIRED`.
   * Un propietario jamás puede ver inmuebles ni calendarios de otros propietarios.
3. **Control Transaccional de Solape de Reservas:**
   * La base de datos PostgreSQL rechaza reservas conflictivas con restricción de exclusión mediante `btree_gist` en intervalos semiabiertos `[ingreso, salida)`.
4. **Idempotencia e Inmunidad Financiera:**
   * Pagos, garantías y gastos exigen `idempotencyKey` para evitar cargos duplicados.
   * Los registros contables y movimientos no se eliminan físicamente; se preservan mediante estados `CONCILIADO`, `RECHAZADO` o `ANULADO` con auditoría.

---

## 7. Documentación Técnica del Proyecto

Para consultar los informes de arquitectura, matrices de requisitos y planes de continuidad, consulte la carpeta [`docs/`](docs/):

* [**04 — Arquitectura del Sistema**](docs/04-ARQUITECTURA.md): Modelo por capas, monorepo y flujo de datos.
* [**05 — Modelo de Datos**](docs/05-MODELO-DATOS.md): Esquema relacional, entidades financieras y sesiones.
* [**06 — Contratos API**](docs/06-CONTRATOS-API.md): Especificación de endpoints REST, códigos de error y payloads.
* [**Estado Consolidado del Proyecto**](docs/ESTADO-PROYECTO-2026-10-30.md): Auditoría completa del estado de implementación al 30 de octubre de 2026.
* [**Informe Histórico de Integración André–Diego**](docs/INTEGRACION-ANDRE-DIEGO-2026-10-30.md): Detalle técnico del merge de autenticación y transacciones.
* [**Plan de Continuidad MVP**](docs/PLAN-CONTINUIDAD-MVP.md): Roadmap operativo priorizado (P0, P1, P2) rumbo a la demo del 2 de noviembre.
