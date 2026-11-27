# Daplace Rentals — Guía de Demo Local (Tesis)

Guía operativa para ejecutar el recorrido completo de demostración local sobre PostgreSQL en Docker, reutilizando los scripts existentes del monorepo y las mejoras consolidadas en `b8569aa` (`fix: pulir calendario, reservas y pagos para la demo de tesis`).

---

## 1. Preparación del Entorno Local

### 1.1 Variables de entorno (`.env.example`)
Copia `.env.example` a `.env` en la raíz de `daplace-rentals/` y define los valores locales sin exponer secretos en repositorio:

| Variable | Propósito en la demo local |
| :--- | :--- |
| `DATABASE_URL` | Conexión a PostgreSQL local (`daplace_dev` en `localhost:5432`). |
| `DIRECT_DATABASE_URL` | Opcional en local; si se define, `backend/prisma.config.ts` la prioriza sobre `DATABASE_URL` al migrar. Para la demo debe apuntar también a `daplace_dev` local. |
| `DATABASE_TEST_URL` | Base aislada para pruebas (`daplace_test` en `localhost:5432`). |
| `API_HOST`, `API_PORT` | Host (`127.0.0.1`) y puerto (`3000`) del backend Fastify. |
| `CORS_ALLOWED_ORIGINS`, `CORS_ORIGIN` | Orígenes permitidos (`http://127.0.0.1:5173,http://localhost:5173`). |
| `VITE_API_BASE_URL` | URL base del backend consumida por Vite (`http://127.0.0.1:3000`). |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_SECURE` | Secreto JWT local (mín. 32 caracteres), expiración (`15m`) y `false` en HTTP local. |
| `ENABLE_DEMO_AUTH_BYPASS` | Mantener en `"false"` para validar autenticación real. |
| `ALLOW_DEV_SEED`, `DEV_DEFAULT_PASSWORD` | Habilita `db:seed` local (`"true"`) y define la contraseña local (mín. 8 caracteres). |
| `BANK_ACCOUNT_HMAC_SECRET` | Opcional si en pagos solo se usa cuenta enmascarada (`****4444`); obligatoria (mín. 32 bytes) si se ingresa cuenta completa. |

### 1.2 Verificación previa de destino, migraciones y seed existente

> [!CAUTION]
> **Verificación obligatoria antes de migrar o ejecutar seeds:**
> `backend/prisma.config.ts` carga `../.env` sin sobrescribir variables ya definidas en tu terminal y **prioriza `DIRECT_DATABASE_URL` sobre `DATABASE_URL`**.
> - Para el flujo de demo local, verifica el destino efectivo de **ambas** variables tanto en la **sesión de terminal actual** como en **`.env`**.
> - Si defines las dos, **ambas deben apuntar a `daplace_dev` local** (`localhost:5432/daplace_dev` o `127.0.0.1:5432/daplace_dev`).
> - **Detente de inmediato** si cualquiera de las dos conserva una conexión remota (por ejemplo, Supabase) y corrígela antes de ejecutar `db:migrate:deploy`, `db:seed:dev` o `db:seed`.

Comprueba en PowerShell el destino efectivo (`host:puerto/base`) en terminal y en `.env` sin imprimir credenciales:

```powershell
node -e 'const fs=require("fs"); const fileEnv={}; if(fs.existsSync(".env")){for(const line of fs.readFileSync(".env","utf8").split(/\r?\n/)){const t=line.trim(); if(!t||t.startsWith("#"))continue; const i=t.indexOf("="); if(i>0){fileEnv[t.slice(0,i).trim()]=t.slice(i+1).trim().replace(/^[\x22\x27]|[\x22\x27]$/g,"");}}} for(const k of ["DATABASE_URL","DIRECT_DATABASE_URL"]){for(const [src,v] of [["TERMINAL",process.env[k]],[".env",fileEnv[k]]]){if(!v){console.log(src,k,"-> (no definida)");continue;} const u=new URL(v.replace(/^postgresql:\/\//,"http://")); console.log(src,k,"->",u.hostname+":"+(u.port||"5432")+u.pathname);}}'
```

Solo después de confirmar que el destino efectivo es `daplace_dev` local, ejecuta desde la raíz `daplace-rentals/`:

```powershell
npm run db:up
npm run db:generate
npm run db:migrate:deploy
npm run db:seed:dev
npm run db:seed
```

> **Nota sobre los scripts de seed existentes:**
> - `npm run db:seed:dev` (`backend/src/scripts/seed.ts`) carga los datos sintéticos de dominio (`Usuario`, `Propiedad`, `Huesped`, `Reserva`, `Pago`, `Garantia`).
> - `npm run db:seed` (`backend/src/scripts/seed-dev.ts`) crea las cuentas de acceso `User` y las vincula a los `Usuario` sintéticos (`usr-admin`, `usr-operador`, `usr-102`) si ya existen en la base. Por eso conviene ejecutar `db:seed:dev` antes de `db:seed`.

**Cuentas y datos sintéticos creados:**
- **Cuentas `User` (`db:seed`):** `admin.dev@daplace.pe` (`ADMINISTRADOR`), `operador.dev@daplace.pe` (`OPERADOR`), `propietario.dev@daplace.pe` (`PROPIETARIO`, vinculado a `usr-102`), `cliente.dev@daplace.pe` (`CLIENTE`), todas con la contraseña configurada localmente en `DEV_DEFAULT_PASSWORD`.
- **Inmuebles (`db:seed:dev`):** `prop-01` (*Departamento Miraflores Malecón Balta*, `PEN`, `S/ 280.00/noche`, `OPERATIVA`), `prop-02` (*Suite Boutique Barranco Tradicional*), entre otros.
- **Huéspedes (`db:seed:dev`):** `hue-01` (*Alejandro Silva Rivas*, DNI `44556677`), entre otros.

### 1.3 Arranque de servidores y URLs
```sh
npm run dev
```

- **Frontend Web:** `http://127.0.0.1:5173`
- **Backend API:** `http://127.0.0.1:3000`
- **Health Check API:** `http://127.0.0.1:3000/health`
- **Health Check BD:** `http://127.0.0.1:3000/health/ready`

---

## 2. Datos Ficticios del Recorrido

Usa estos valores de ejemplo durante la demostración (iniciando sesión con `operador.dev@daplace.pe` o `admin.dev@daplace.pe`):

- **Propiedad:** `Departamento Miraflores Malecón Balta` (`prop-01`)
- **Huésped:** `Alejandro Silva Rivas` (`hue-01`)
- **Fechas de estadía:** intervalo libre de 3 noches dentro del mes actual (ej. del día `+10` al día `+13` desde hoy, en formato semiabierto `[ingreso, salida)`)
- **Origen:** `WEB`
- **Moneda:** `PEN`
- **Referencia documental de contrato:** archivo `contrato-demo-miraflores.pdf` / referencia `CTR-DEMO-001`
- **Abono inicial:** importe `280.00` `PEN`, concepto `ADELANTO`, método `TRANSFERENCIA`, cuenta enmascarada `****4444`, referencia de transacción `OP-DEMO-4444`

---

## 3. Guion Paso a Paso de la Demo

### Paso 1 — Calendario inicial (perfil limpio)
- **Acción:** Abrir un perfil limpio del navegador (o limpiar `localStorage` del sitio) e ingresar a `http://127.0.0.1:5173/calendario`.
- **Resultado esperado:**
  - Gracias a `resolveInitialCalendarDateState` / `getLocalCalendarDateState` (`frontend/src/features/calendar/services/calendarService.ts`, `CalendarPage.tsx`), el calendario abre en el **mes y día civil actual del sistema** (ya no queda fijo en noviembre 2026).
  - Si seleccionas una propiedad, cambias de vista o de mes y recargas (`F5`), las preferencias válidas se conservan.

### Paso 2 — Reserva → Calendario
- **Acción:** Ir a **Reservas** (`/reservas`), abrir el formulario de nueva solicitud, seleccionar `Departamento Miraflores Malecón Balta`, huésped `Alejandro Silva Rivas`, origen `WEB`, moneda `PEN` y el rango de 3 noches elegido. Guardar y navegar a `/calendario` filtrando por la misma propiedad.
- **Resultado esperado:**
  - La reserva se crea en estado `SOLICITADA`.
  - En `/calendario`, el intervalo `[ingreso, salida)` aparece ocupado para esa propiedad.

### Paso 3 — Rechazo por solape (aviso único)
- **Acción:** Volver a **Reservas**, abrir nuevamente el modal de creación para `Departamento Miraflores Malecón Balta` e intentar registrar una reserva con fechas que se solapen con la creada en el Paso 2 (p. ej. entrando 1 día después del check-in anterior).
- **Resultado esperado:**
  - El backend rechaza la operación con HTTP `409` (exclusión `btree_gist` en PostgreSQL).
  - Por el ajuste en `ReservationsPage.tsx` (`b8569aa`), el mensaje de error se muestra **una sola vez dentro del modal abierto**, sin banner duplicado en la página ni aviso de éxito.

### Paso 4 — Referencia documental de contrato
- **Acción:** En **Reservas**, abrir el detalle de la reserva creada (`ReservationDetailModal`), registrar la referencia documental del contrato (`contrato-demo-miraflores.pdf` / `CTR-DEMO-001`), guardar, cerrar el modal y volver a abrirlo.
- **Resultado esperado:**
  - El documento queda persistido con estado `REFERENCIADA` y sigue visible al reabrir `ReservationDetailModal`.

### Paso 5 — Pago pendiente y campo avanzado
- **Acción:** Ir a **Pagos** (o abrir `PaymentFormModal` para la reserva), verificar la sección de clave avanzada, ingresar `280.00` `PEN`, concepto `ADELANTO`, método `TRANSFERENCIA`, referencia `OP-DEMO-4444` y cuenta enmascarada `****4444`. Registrar el pago.
- **Resultado esperado:**
  - El campo avanzado muestra exactamente la etiqueta **`Clave de idempotencia (opcional)`** y el texto de ayuda **«Si reutilizas una clave, conserva los mismos datos del pago.»** (`PaymentFormModal.tsx`, `b8569aa`).
  - El pago se registra en estado `PENDIENTE_CONCILIACION`.
  - El saldo pendiente de la reserva **no se reduce** mientras el pago siga pendiente de conciliación.

### Paso 6 — Conciliación
- **Acción:** En la lista de pagos, ejecutar la acción de conciliar sobre el abono `OP-DEMO-4444`.
- **Resultado esperado:**
  - El pago pasa a estado `CONCILIADO`.
  - El saldo pendiente de la reserva se reduce exactamente en `S/ 280.00`.

---

### Paso 7 — Agenda, pagos y garantía

1. En **Calendario → Agenda diaria**, elige una fecha con llegadas o salidas de prueba. Revisa **Todas las propiedades** y luego una propiedad puntual. Las solicitudes y las reservas confirmadas deben distinguirse por estado.
2. Abre el detalle de una reserva. Comprueba el saldo de hospedaje y los importes conciliados y por conciliar. Usa **Ver historial de pagos** para revisar los abonos de esa reserva. Usa **Registrar abono** para comprobar la preselección de reserva y su moneda.
3. Si la reserva tiene una garantía, revisa su estado y saldo disponible en la sección **Garantía** y abre sus movimientos. Comprueba que la custodia se muestra separada del saldo de hospedaje.

### Paso 8 — Inspección de salida y orden de trabajo

1. Usa una **salida confirmada de prueba**. Desde Agenda, pulsa **Iniciar inspección** y verifica el código, el inmueble y el huésped antes de confirmar. Para probar el envío, usa una inspección ficticia con la opción de generar una orden.
2. En el resultado del check-out, pulsa **Abrir orden generada** y comprueba que se abre la orden indicada. Con otra salida de prueba sin orden, verifica que el resultado indica que no se generó ninguna.
3. Desde **Órdenes abiertas** de la Agenda o desde el resultado anterior, abre la orden, pulsa **Finalizar** y guarda una nota de resolución. Comprueba el estado final y la nota. Si hay otro trabajo abierto para la propiedad, esta debe seguir en mantenimiento.
4. Con un rol propietario, revisa que Agenda siga limitada a sus propiedades y que no muestre el bloque de órdenes abiertas ni el acceso a la inspección.

Los pasos en navegador de esta sección quedan para UAT. La prueba integrada de la sección siguiente cubre el recorrido de reserva y pago a través de la API.

## 4. Prueba Integrada Reproducible

`compose.yaml` crea únicamente la base `daplace_dev` (`POSTGRES_DB: daplace_dev` con usuario `daplace`). En un entorno nuevo debes preparar y migrar `daplace_test` por separado antes de correr la prueba integrada.

Ten presente la separación de configuraciones:
- **`DATABASE_TEST_URL`** dirige la prueba (`backend/test/thesis-demo-journey.test.ts` mediante `getRequiredTestDatabaseUrl()` en `backend/test/test-helpers.ts`, exclusivamente contra `daplace_test` local y sin fallback a `DATABASE_URL`).
- **`npm run db:migrate:deploy`** usa `backend/prisma.config.ts`, que prioriza `DIRECT_DATABASE_URL` sobre `DATABASE_URL`.

### 4.1 Preparar `daplace_test` y aplicar migraciones (PowerShell)

1. Con PostgreSQL local arriba (`npm run db:up`), crea `daplace_test` si no existe y habilita `btree_gist`:

```powershell
$dbExists = docker compose exec -T postgres psql -U daplace -d daplace_dev -tAc "SELECT 1 FROM pg_database WHERE datname = 'daplace_test'"
if ($dbExists.Trim() -ne '1') {
  docker compose exec -T postgres psql -U daplace -d daplace_dev -c "CREATE DATABASE daplace_test OWNER daplace;"
}
docker compose exec -T postgres psql -U daplace -d daplace_test -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
```

2. Aplica las migraciones en `daplace_test` dentro de un **subproceso PowerShell aislado**, de modo que las variables temporales expiren al terminar y tu sesión actual (y la API de demo) sigan apuntando a `daplace_dev` sin modificar `.env`:

```powershell
powershell -NoProfile -Command {
  $env:DIRECT_DATABASE_URL = 'postgresql://daplace:daplace_local_only@localhost:5432/daplace_test?schema=public'
  $env:DATABASE_URL = 'postgresql://daplace:daplace_local_only@localhost:5432/daplace_test?schema=public'
  npm run db:migrate:deploy
}
```

### 4.2 Ejecutar la prueba integrada

Con `DATABASE_TEST_URL` apuntando a `daplace_test` en `.env`:

```powershell
npx --workspace @daplace/backend tsx --test test/thesis-demo-journey.test.ts
```

> **Aislamiento y concurrencia:** esta prueba ejecuta `safeResetTestDatabase()`, por lo que **reinicia/trunca los datos de `daplace_test`**. Ejecútala de forma aislada, sin otras suites escribiendo simultáneamente contra `daplace_test` (si corres múltiples archivos de prueba backend juntos, utiliza `--test-concurrency=1`, tal como define `backend/package.json`).

---

## 5. Limitaciones de Alcance Conocidas

- **Confirmación `DIRECTO`:** sujeta a la definición pendiente de política comercial (`politicaAdelantoProvider`).
- **Documentos y contratos:** solo soportan registro de referencia en estado `REFERENCIADA` (sin flujo HTTP/UI de validación/rechazo ni subida binaria de archivos).
- **Fuera de alcance del MVP actual:** pasarela de pagos en línea, reparto automático de ingresos, liquidaciones automáticas, sincronización con Google Calendar, integración con Airbnb y portal web público.
