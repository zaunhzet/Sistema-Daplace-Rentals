# Daplace Rentals

Monorepo de desarrollo para el sistema transaccional Daplace Rentals. Este proyecto implementa la interfaz web, el backend con Fastify, base de datos PostgreSQL mediante Prisma ORM 7 y un sistema de **autenticación real y control de acceso basado en roles con seguridad web de nivel empresarial**.

## Requisitos

- Node.js 24.x (LTS) y npm 11.x.
- Docker Desktop con motor Linux activo para ejecutar PostgreSQL local con Compose.
- Git.

Las dependencias quedan fijadas en `package-lock.json`. El frontend usa React 19, Vite, React Router y Tailwind CSS; el backend usa Fastify 5, TypeScript, Prisma ORM 7 con PostgreSQL y `@node-rs/argon2` para hashing criptográfico.

## Estructura

```text
frontend/             React + Vite + TypeScript + Tailwind CSS
  src/features/auth/   Formulario real, cliente HTTP con reintento, contexto seguro
backend/              Fastify 5 + TypeScript + Prisma 7
  prisma/              esquema con modelos User, AuthSession y migraciones SQL
  src/modules/auth/    rutas, middleware de verificación en vivo, servicio y repositorio atómico
database/              guía de base de datos local
compose.yaml           PostgreSQL local de desarrollo
.env.example           configuración local de ejemplo
```

## Preparación inicial — PowerShell

Clona el repositorio y entra a su carpeta:

```powershell
Copy-Item .env.example .env
npm ci
npm run db:up
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
```

Para inicializar cuentas de prueba locales de forma segura, configure en su `.env` local:
- `ALLOW_DEV_SEED="true"`
- `DEV_DEFAULT_PASSWORD="<su_contraseña_elegida_min_8_caracteres>"`

Y ejecute:
```powershell
npm run db:seed
```

Espera a que PostgreSQL termine de iniciar. `npm run db:up` usa un volumen local persistente de Docker; `npm run db:down` solo detiene el contenedor y conserva los datos.

## Preparación inicial — macOS / Linux

```sh
cp .env.example .env
npm ci
npm run db:up
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
npm run db:seed
```

## Desarrollo

Desde la raíz del repositorio:

```sh
npm run dev
```

- Interfaz: <http://127.0.0.1:5173>
- API viva: <http://127.0.0.1:3000/health>
- API lista (comprueba PostgreSQL): <http://127.0.0.1:3000/health/ready>

Para iniciar cada proceso por separado: `npm run dev:web` o `npm run dev:api`.

## Procedimiento Seguro de Seed para Desarrollo Local

El script `npm run db:seed` cuenta con salvaguardas de seguridad:
1. **Bloqueo de entorno**: Requiere explícitamente `ALLOW_DEV_SEED="true"` y rechaza la ejecución si `NODE_ENV === 'production'`.
2. **Restricción de host local**: Valida que `DATABASE_URL` apunte a `localhost` o `127.0.0.1`, impidiendo cualquier ejecución contra bases compartidas o de producción.
3. **Sin contraseñas codificadas ni exposición en logs**: Exige `DEV_DEFAULT_PASSWORD` en `.env` (mínimo 8 caracteres) y nunca imprime credenciales ni hashes en la consola.
4. **No destructivo para usuarios existentes**: Si una cuenta de prueba ya existe en la base de datos, el seed la omite respetando su contraseña, rol y estado actual sin sobreescribirla.

### Cuentas creadas por el seed
- **Administrador**: `admin.dev@daplace.pe` (Rol: `ADMINISTRADOR`)
- **Operador**: `operador.dev@daplace.pe` (Rol: `OPERADOR`)
- **Propietario**: `propietario.dev@daplace.pe` (Rol: `PROPIETARIO`)
- **Cliente**: `cliente.dev@daplace.pe` (Rol: `CLIENTE`)

Nota: Las credenciales no se encuentran codificadas en el frontend. Toda autenticación valida la identidad y obtiene el rol directamente de PostgreSQL.

## Arquitectura de Autenticación y Seguridad

### 1. Login (`POST /auth/login`)
- Valida credenciales contra la base de datos mediante hashing **Argon2id**.
- **Mitigación de timing attacks / enumeración de cuentas**: Cuando el correo ingresado no existe o la cuenta está inactiva, el backend ejecuta una verificación sintética de Argon2id para igualar el tiempo de cómputo del procesador frente a una contraseña incorrecta de un usuario real.
- Emite un **access token JWT de corta duración** (15 min) devuelto en el cuerpo de la respuesta para ser almacenado **únicamente en memoria** en la aplicación React.
- Emite un **refresh token criptográfico** (guardado como SHA-256 en base de datos) almacenado en una cookie `HttpOnly`, `SameSite=Lax`, con flag `Secure` condicionado al entorno HTTPS.

### 2. Rotación Atómica y Política de Ventana de Gracia (`POST /auth/refresh`)
- La rotación se ejecuta de forma **atómica en PostgreSQL** mediante una transacción: se invalida el refresh token previo y se crea la nueva sesión en una sola operación indisoluble. Dos solicitudes simultáneas no pueden generar dos sesiones activas.
- **Política de Gracia (15 segundos)**: Para evitar que peticiones duplicadas normales del cliente (por ejemplo, el doble montaje de `React.StrictMode` en desarrollo o dos llamadas paralelas de red) desconecten accidentalmente una sesión legítima, si un token ya rotado se presenta dentro de una ventana de 15 segundos se responde con un código de concurrencia `409 CONCURRENT_ROTATION` sin destruir la familia de sesión.
- **Detección de Reutilización (Token Reuse Detection)**: Si un token rotado se intenta reutilizar después de la ventana de gracia, el sistema asume una brecha de seguridad (robo de token) y anula de inmediato toda la familia de sesiones activas.

### 3. Validación en Vivo de Roles y Cuentas Desactivadas
- Aunque un JWT siga vigente cronológicamente, el middleware `authenticate` y `requireRoles` realiza una **comprobación en vivo contra PostgreSQL**:
  - Si el usuario fue desactivado (`isActive: false`), el acceso se revoca de inmediato (401).
  - Si el rol del usuario fue cambiado (ej. de `ADMINISTRADOR` a `CLIENTE`), la autorización evalúa el rol real y vigente en la base de datos, no el del reclamo estático del JWT, respondiendo 403 `FORBIDDEN` si no cuenta con los permisos necesarios.

### 4. Cierre de Sesión con Manejo de Fallos (`POST /auth/logout`)
- Exige encabezado de mitigación CSRF (`X-Requested-With`).
- Revoca la sesión en la base de datos y elimina la cookie en el navegador.
- Si la revocación remota falla (error de red o del servidor), el frontend **no presenta el cierre como exitoso**, alerta explícitamente al usuario de que la sesión remota podría seguir activa y proporciona un botón para **reintentar**.

### 5. Cliente Centralizado con Reintento Automático (`authenticatedFetch`)
- Provee un wrapper reutilizable sobre `fetch` para futuras llamadas autenticadas.
- Si recibe un código `401 Unauthorized` por vencimiento de token:
  - Invoca `refreshApi()`. Todas las llamadas paralelas que coincidan en el refresco comparten una **única promesa en curso** (`activeRefreshPromise`), evitando inundar el endpoint `/auth/refresh`.
  - Reintenta automáticamente la petición original una sola vez con el nuevo token.
  - Si el refresco falla, notifica al contexto y limpia la sesión sin generar bucles infinitos.

### 6. Política de CORS Estricta
- No se permite el uso del origen comodín `*` cuando se habilitan credenciales (`credentials: true`). El servidor exige una lista explícita de orígenes en `CORS_ORIGIN`.

## Verificaciones

Ejecutar la suite completa de validación:

```sh
npm run verify
```

O individualmente:

```sh
npm run typecheck
npm test
npm run build
npm run db:validate
```

## Variables de Entorno

`.env.example` contiene los valores locales de referencia:

- `DATABASE_URL`: conexión PostgreSQL leída por Prisma.
- `API_HOST`, `API_PORT`: interfaz y puerto de Fastify.
- `VITE_API_BASE_URL`: URL base de la API consumida por el frontend Vite.
- `JWT_SECRET`: secreto simétrico para firma de tokens JWT (mínimo 32 caracteres). Obligatorio para arrancar con autenticación.
- `JWT_EXPIRES_IN`: vigencia del access token (ej. `15m`).
- `CORS_ORIGIN`: lista explícita de orígenes autorizados para peticiones con credenciales (ej. `http://127.0.0.1:5173,http://localhost:5173`).
- `COOKIE_SECURE`: `false` en desarrollo HTTP local, `true` en producción HTTPS.
- `ALLOW_DEV_SEED`: `false` por defecto; establecer en `true` para autorizar `npm run db:seed`.
- `DEV_DEFAULT_PASSWORD`: contraseña de prueba configurada para el seed local.

## Estado y Decisiones Pendientes

- La infraestructura de autenticación, rotación atómica y autorización por roles (`ADMINISTRADOR`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`) está completamente operativa y probada.
- **Decisión de producto pendiente**: La matriz granular de permisos para entidades de negocio (propiedades, huéspedes, reservas, calendarios, pagos y garantías) no está definida en esta etapa. El backend cuenta con la función `requireRoles` lista para aplicarse a futuros endpoints de negocio según se apruebe la matriz de gobernanza.
