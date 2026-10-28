# Daplace Rentals

Monorepo de desarrollo para el sistema transaccional Daplace Rentals. Este bootstrap configura la interfaz, API, PostgreSQL local y Prisma; **no implementa reservas, pagos, garantías ni autenticación**.

## Requisitos

- Node.js 24.x (LTS) y npm 11.x.
- Docker Desktop con motor Linux activo para ejecutar PostgreSQL local con Compose.
- Git.

Las dependencias quedan fijadas en `package-lock.json`. El frontend usa React, Vite, React Router y Tailwind CSS; el backend usa Fastify, TypeScript y Prisma ORM 7 con PostgreSQL. Prisma ORM 8 se mantiene fuera del stack porque está en release candidate al momento de preparar esta base.

## Estructura

```text
frontend/             React + Vite + TypeScript + Tailwind CSS
backend/              Fastify + TypeScript + Prisma
  prisma/              esquema y migraciones SQL versionadas
database/              guía de base de datos local
compose.yaml           PostgreSQL local de desarrollo
.env.example           configuración local de ejemplo
```

El esquema de Prisma intencionalmente no declara tablas de negocio. La primera migración es una línea base sin tablas; agregar modelos/migraciones solo dentro de las tareas aprobadas.

## Preparación inicial — PowerShell

Clona el repositorio y entra a su carpeta. Si ya lo tienes, omite las dos primeras líneas:

```powershell
git clone https://github.com/zaunhzet/Sistema-Web-Transaccional-para-la-Gobernanza-y-Estandarizacion-de-Datos-DAPLACE-RENTALS.git
Set-Location Sistema-Web-Transaccional-para-la-Gobernanza-y-Estandarizacion-de-Datos-DAPLACE-RENTALS
Copy-Item .env.example .env
npm ci
npm run db:up
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
```

Espera a que PostgreSQL termine de iniciar. `npm run db:up` usa un volumen local persistente de Docker; `npm run db:down` solo detiene el contenedor y conserva los datos.

## Preparación inicial — macOS / Linux

```sh
git clone https://github.com/zaunhzet/Sistema-Web-Transaccional-para-la-Gobernanza-y-Estandarizacion-de-Datos-DAPLACE-RENTALS.git
cd Sistema-Web-Transaccional-para-la-Gobernanza-y-Estandarizacion-de-Datos-DAPLACE-RENTALS
cp .env.example .env
npm ci
npm run db:up
npm run db:generate
npm run db:validate
npm run db:migrate:deploy
```

## Desarrollo

Desde la raíz del repositorio:

```sh
npm run dev
```

- Interfaz: <http://127.0.0.1:5173>
- API viva: <http://127.0.0.1:3000/health>
- API lista (comprueba PostgreSQL): <http://127.0.0.1:3000/health/ready>

`/health` confirma que el proceso responde. `/health/ready` consulta PostgreSQL y devuelve 503 si la base no está accesible. Ninguna ruta de salud lee ni modifica datos de negocio.

Para iniciar cada proceso por separado: `npm run dev:web` o `npm run dev:api`.

## Verificaciones

```sh
npm run typecheck
npm test
npm run build
npm run db:validate
```

Generar el cliente después de cambiar el esquema:

```sh
npm run db:generate
```

## Migraciones

- Las migraciones viven en `backend/prisma/migrations/` y se versionan junto con el esquema.
- `npm run db:migrate:dev` crea/aplica migraciones durante desarrollo local. Úsalo solo contra una base local/desocupable identificada; Prisma puede pedir resolver divergencias de esquema.
- `npm run db:migrate:deploy` ejecuta solo el SQL de las migraciones versionadas pendientes; no genera migraciones nuevas.
- `npm run db:status` informa el estado de migraciones.
- No usar comandos `reset`, no borrar volúmenes y no apuntar estas órdenes a una base compartida o de producción. Revisar `DATABASE_URL` antes de cualquier migración.
- La base de Compose usa valores de ejemplo exclusivos para desarrollo local; cambiar credenciales/URL para cualquier otro entorno. No guardar `.env` ni secretos en Git.

## Convenciones iniciales

- Módulos backend: `backend/src/modules/<dominio>/` cuando se asignen tareas de negocio; separar rutas, validación HTTP, servicio de dominio y persistencia.
- Frontend: `frontend/src/features/<dominio>/`; componentes compartidos bajo `frontend/src/shared/`.
- Componentes React en PascalCase; funciones/variables en camelCase; rutas HTTP en minúscula plural según contrato aprobado.
- Respuestas de error usan `{ "error": { "code", "message", "details?", "requestId" } }`. Fastify valida JSON Schema y responde 400 ante errores de validación. No incluir secretos ni datos personales innecesarios en mensajes/logs.
- Los contratos de negocio requieren aprobación antes de implementarse; este bootstrap solo añade rutas de salud.

## Variables de entorno

`.env.example` contiene valores locales de referencia:

- `DATABASE_URL`: conexión PostgreSQL leída por Prisma.
- `API_HOST`, `API_PORT`: interfaz y puerto de Fastify.
- `VITE_API_BASE_URL`: base prevista para el cliente HTTP futuro.

El archivo `.env` local está excluido de Git. No usar información real en fixtures.

## Estado y límites

La pantalla inicial es una estructura de navegación, no un módulo de negocio. No existe autenticación ni operaciones de negocio implementadas. PostgreSQL está configurado mediante Prisma y la ruta de readiness, pero requiere que el contenedor/base esté iniciado.
