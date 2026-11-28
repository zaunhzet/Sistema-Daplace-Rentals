# DAPLACE RENTALS · Preparación de despliegue

## Dictamen

**READY_FOR_VERCEL_REMOTE_VALIDATION.** La CLI 54.11.1 rechazó el destino de servicio con `rewrites[0].destination should be string`. La CLI 68.0.0 sí aceptó la configuración y detectó Vite y Fastify. El `EPERM` al crear enlaces simbólicos de los builders es una limitación del entorno Windows de prueba. El agente verificará empaquetado y routing en Vercel. Si el proyecto del equipo rechaza el formato vigente, usar la alternativa B y validarla antes de habilitar tráfico.

Base verificada en GitHub y obtenida por Git de `integration/andre-diego-20261029` en `cf580a0abd21ca1840f17491448a728ad599fae0`. Rama local `feat/vercel-deployment-readiness` en el checkout reutilizado `daplace-rentals-wt-int`. El checkout de tesis con cambios locales se preservó.

## Arquitectura y costos

| Opción | Uso recomendado | Implicación |
|---|---|---|
| A. Services + Supabase | Primera opción si el proyecto acepta el formato actual | Despliegue y rollback conjuntos, mismo origen y una sola cuenta de Vercel. Services está en beta en todos los planes. |
| B. Dos proyectos Vercel + Supabase | Alternativa si A no pasa el gate | Vite y Fastify se despliegan por separado. La web reenvía `/api`, `/auth` y `/health` a HTTPS del backend, preservando las rutas completas. El agente debe comprobar el efecto de la protección del backend sobre ese proxy y que la cookie siga funcionando. |
| C. Vite en Vercel + Fastify persistente + Supabase | Cuando se necesiten workers continuos o el backend no funcione en Functions | Mantiene `app.listen` y permite procesos supervisados. Añade costo de cómputo separado y gestión de despliegue. Mismo contrato de proxy que B. |

Para una demostración personal no comercial, Hobby cuesta USD 0 si se mantiene dentro de sus cupos. El uso operativo comercial de Daplace requiere un plan compatible, normalmente Pro desde **USD 20/mes** con USD 20 de crédito de uso según la página consultada. Presupuestar ese piso más el costo actual de Supabase, impuestos, asientos facturables y exceso de consumo. A y B no requieren dos suscripciones de Vercel dentro del mismo equipo. En C se suma el proveedor de backend. Para 6–10 unidades, usar como supuesto inicial 5–10 usuarios operativos, hasta 100 mil peticiones de API/mes y ningún worker activo. Es un escenario de planificación, no una proyección de consumo. Medir CPU, memoria, invocaciones, transferencia y conexiones durante el piloto.

Functions con Fluid Compute documenta 2 GB y hasta 300 s en Hobby, 2 GB por defecto con hasta 4 GB y hasta 800 s en Pro, 250 MB comprimidos de paquete y autoescalado de plataforma hasta 30 mil concurrentes en ambos planes. La capacidad real de Daplace vendrá condicionada por PostgreSQL, el costo de Argon2 y el presupuesto. Hobby incluye 4 horas de CPU activa, 360 GB-h y 1 millón de invocaciones según la página consultada. Services no añade una llamada entre servicios para una petición pública enrutada directamente a Fastify. [Services](https://vercel.com/docs/services) · [Pricing](https://vercel.com/pricing) · [Hobby](https://vercel.com/docs/plans/hobby) · [Functions](https://vercel.com/docs/functions/limitations) · [Fluid Compute](https://vercel.com/docs/functions/usage-and-pricing) · [Services pricing](https://vercel.com/docs/services/pricing)

## Configuración del proyecto

| Campo | Valor |
|---|---|
| Equipo y nombre | `zaunhzet-4641`, `daplace-rentals` |
| Repo y rama | `zaunhzet/Sistema-Daplace-Rentals`; rama de integración indicada arriba después de incorporar el commit de preparación. Si se autoriza publicar la rama de preparación, validarla primero como preview explícita. |
| Root Directory y preset | Raíz `./`, preset **Services** |
| Runtime | Node 24.x, npm 11, lockfile único en la raíz |
| Install | Cada servicio usa `npm --prefix .. ci --no-audit --no-fund` desde su raíz para instalar a partir del lockfile común. Mantener disponibles el lockfile y los archivos externos a cada raíz de servicio. Verificar el directorio efectivo en el log. |
| Web | `frontend`, Vite, `npm run build`, salida `dist` relativa al frontend |
| API | `backend`, Fastify, `src/server.ts`, generación Prisma en el build. El builder Fastify empaqueta el entrypoint como Function. No configurar una carpeta estática para la API. |
| Región | `gru1` (São Paulo), según la región del pooler documentada en el informe de Supabase. Confirmar la región efectiva en Vercel. |
| Routing | `/api/*`, `/auth/*`, `/health` y `/health/*` llegan a Fastify con su ruta original. El resto llega a Vite y su fallback SPA. |

El archivo raíz `vercel.json` usa `services`, destinos de servicio y fallback dentro de Vite. El prefijo no se recorta. Se requiere conservar `/auth` porque la cookie de refresh tiene `Path=/auth`. En producción, ambos clientes usan el origen de la web y rutas relativas por defecto. Así se mantienen `HttpOnly`, `Secure`, `SameSite=Lax` y las comprobaciones CSRF existentes. Los CSV siguen pasando por Fastify con su encabezado de descarga. Una ruta API desconocida debe recibir JSON 404, no HTML. [Configuración Services](https://vercel.com/docs/services/config-reference) · [Routing](https://vercel.com/docs/services/routing) · [Fastify](https://vercel.com/docs/frameworks/backend/fastify) · [Vite](https://vercel.com/docs/frameworks/frontend/vite) · [Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) · [Regiones](https://vercel.com/docs/regions)

Si el equipo dispone exclusivamente del formato anterior `experimentalServices`, no copiar el prefijo automático `/api` como configuración final. Exigir una configuración que preserve las tres familias de rutas y el fallback SPA. Si la variante del equipo no las admite, pasar a B. En B, raíz de cada proyecto `frontend` o `backend`, mismos comandos y Node; poner los rewrites externos HTTPS antes del fallback del proyecto web. No usar `main`.

## Backend y capacidad

- `backend/src/server.ts` construye Fastify, repositorio de sesiones y pool una vez por carga del módulo. Vercel documenta un entrypoint Fastify con `listen`. El empaquetado efectivo de este entrypoint y del binario de `@node-rs/argon2` exige smoke remoto de readiness y login. No añadir otro servidor ni crear pools por petición. El hook `onClose` libera el pool en cierres donde Fastify lo ejecute; una Function puede congelarse o terminar sin ejecutar ese hook.
- `backend/src/shared/database.ts` fuerza verificación TLS. En el runtime de Vercel usar el PEM de la CA como valor de `DATABASE_SSL_CA`, para evitar depender del empaquetado de un archivo leído por ruta. La generación del cliente Prisma 7 usa un DSN ficticio local exclusivo del comando de build, pues la configuración Prisma exige una URL. `prisma generate` no requiere conectar a PostgreSQL. No configurar un DSN de migraciones como secreto de runtime para satisfacer el build.
- Para empezar usar el pooler de sesión de Supabase ya acreditado para la aplicación, con `DATABASE_POOL_MAX=2` por instancia. Medir conexiones cliente y de servidor, cold starts y latencia de `/health/ready`. Evaluar Supavisor transaccional (6543) en un entorno aislado antes de producción: probar Prisma 7 con adapter-pg, transacciones y prepared statements. El límite de la plataforma no es un presupuesto de conexiones. No reutilizar pool transaccional para migraciones. [Supabase pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- Las sesiones se guardan en PostgreSQL. Usar el mismo JWT secret entre instancias del mismo entorno. El rate limiting de Fastify usa memoria local y su cuota no es global. Para uso público/comercial definir y probar un control de entrada distribuido para login, refresh y endpoints sensibles, observando 429 y la identidad de cliente. Revisar cómo el proxy entrega la IP antes de cambiar `trustProxy`. No tocar RBAC.
- `worker:notices` ejecuta un CLI periódico o de una pasada, con controles independientes y adaptador de prueba. El worker de expiración también es un CLI fuera del ciclo HTTP. Dejar ambos desactivados. Para futuras pasarelas usar webhooks autenticados por firma con persistencia idempotente y cola durable cuando proceda. Google Calendar, iCal o Guesty requieren sincronización reintentable y estado durable; cron acotado o proceso externo si se requiere baja latencia. Gastos y Android interno pueden usar la API transaccional existente cuando llegue su fase.

## Variables por entorno

**Production** aquí significa el entorno estable del proyecto de Vercel destinado a esta entrega. No habilitar en previews genéricas las credenciales de la base que usa la operación. Un preview que ejercite login requiere base aislada, JWT propio y origen concreto. Si no existe esa base, limitar los previews a build hasta disponer de una. Los valores sensibles van en Vercel, nunca en Git ni en variables `VITE_*`.

| Variable | Servicio | Requerida | Secreto | Valor u origen y alcance |
|---|---|---|---|---|
| `DATABASE_URL` | API | Sí | Sí | Supabase Connect, cuenta de aplicación autorizada. Production aprobado o base aislada de preview. |
| `DATABASE_SSL` | API | Recomendada | No | `true` en ambos; Supabase ya activa TLS por host. |
| `DATABASE_SSL_CA` | API | Recomendada para Functions | No | PEM oficial del proyecto en ambos; evita dependencia de la ruta del CA del repo. |
| `DATABASE_POOL_MAX` | API | Opcional | No | `2` inicial, ajustar con mediciones. El default del código es 10. |
| `DATABASE_TIMEOUT_MS` | API | Opcional | No | `5000` inicial, frente al default 10000. |
| `JWT_SECRET` | API | Sí | Sí | Secreto de ≥32 caracteres desde el almacén aprobado, distinto por entorno. |
| `JWT_EXPIRES_IN` | API | Opcional | No | `15m` en ambos. |
| `NODE_ENV` | API y build web | Plataforma | No | `production` en builds/Functions; preferir el valor de plataforma. |
| `COOKIE_SECURE` | API | Recomendada | No | `true` para ambos en HTTPS; el código también activa Secure con NODE_ENV production. |
| `CORS_ORIGIN` | API | Sí para origen explícito | No | Origen HTTPS exacto de Production o alias de preview; sin wildcard. |
| `CORS_ALLOWED_ORIGINS` | API | Opcional | No | Alias alternativo; omitir si existe `CORS_ORIGIN` porque este tiene prioridad. |
| `ENABLE_DEMO_AUTH_BYPASS`, `ALLOW_DEV_SEED` | API/scripts | Desactivadas | No | `false` en ambos. |
| `ENABLE_EXPIRATION_WORKER`, `ENABLE_NOTICE_DISPATCHER` | Scripts | Desactivadas | No | `false` en ambos. No añadir cron. |
| `BANK_ACCOUNT_HMAC_SECRET` | API | Condicional | Sí | Requerida para referencias bancarias completas. Mantener la clave probada del entorno al que pertenecen los pagos históricos, sin rotarla. Preview aislado usa clave separada. |
| `VITE_API_BASE_URL` | Web | Opcional | No | Omitir en ambos con mismo origen; no configurar localhost ni un prefijo `/api`. |
| `VITE_USE_MOCKS` | Web | Opcional | No | `false` en ambos. |
| `DIRECT_DATABASE_URL` | Generación/mantenimiento | No para runtime | Sí si es real | El build usa un valor ficticio. Mantener valores reales fuera del despliegue. |
| `DATABASE_TEST_URL` | Pruebas | Solo local | Sí | Nunca en Vercel. Usar PostgreSQL local desechable `daplace_test`. |

## Runbook del agente de Vercel

1. Confirma identidad `zaunhzet-4641`, acceso al repo y aceptación de Services en ese espacio. Crea `daplace-rentals` con el preset y raíz de la tabla.
2. Vincula GitHub. Ordena el primer despliegue utilizable desde la rama de integración con el commit de preparación incorporado. Si el importador inicia en `main`, cancela ese despliegue o mantén el acceso protegido hasta corregir la rama.
3. Configura las variables según entorno. Mantén aisladas las previews. Confirma identidad y región del Supabase aprobado, esquema ya aplicado y acceso autorizado sin modificar la base.
4. Revisa que se haya leído `services` y que el frontend sea Vite y el backend Fastify. Si el proyecto rechaza el esquema, conserva los logs y usa B. No concedas acceso público a un piloto con datos reales.
5. Despliega y comprueba el SHA, Node/npm, uso del lockfile, `prisma generate`, resolución de Argon2 y CA, región y estado Ready. El build no debe ejecutar migraciones o seeds.
6. Ejecuta `node scripts/smoke-vercel.mjs https://URL-DEMO` sobre el alias autorizado. Si tiene protección, usa un mecanismo aprobado para ejecutar las mismas aserciones en el entorno protegido. El script sin credenciales comprueba SPA, health, readiness, 401, JSON 404 y rechazo CSRF.
7. En un entorno aislado, automatiza login con cuenta sintética, comprueba atributos de cookie, refresh tras recargar, logout/revocación, rechazo CSRF con origen indebido, rechazo RBAC y CSV con `Content-Type` y `Content-Disposition`. Contrasta /health/ready con el proyecto esperado. Confirma que el JS público no contiene cadenas de conexión ni JWT secrets. Evita registrar credenciales o tokens.
8. Si pasan los gates, entrega a Diego la URL protegida, SHA y accesos por el canal habitual. Diego realiza UAT. Si falla, conserva el enlace anterior y vuelve al despliegue íntegro conocido o retira el alias nuevo. Con B revierte API y web a versiones compatibles. El rollback de código no revierte datos; no ejecutar rollback de esquema como parte de esta entrega.

## Evidencia local y riesgos pendientes

- Instalación reproducible con `npm ci --no-audit --no-fund` (286 paquetes), generación Prisma 7.10.1 con DSN ficticio, typechecks y builds de ambos workspaces ejecutados. Frontend **207/207**, 55 suites. Vite avisó que el chunk JS minificado supera 500 kB (828.40 kB de salida, 199.34 kB gzip).
- Comparación DR-03 en `daplace_test` local, ejecutada secuencialmente con el mismo comando, dependencias y reinicio de fixtures. Tanto `cf580a0` como `97b9811` obtuvieron **52/56** con los mismos cuatro fallos. El backend era idéntico entre ambos commits.
- N04, N05 y N06 reclamaban leases con fechas fijas y ejecutaban el preflight con el reloj real de PostgreSQL. El cuarto argumento de `processClaimedNotice` no controla ese reloj. Los tres obtenían `LEASE_PERDIDO` antes de probar envío, reintento o cancelación por estado. Las pruebas inyectan ahora un reloj sintético coherente con el claim. N06 también exige que el aviso se reclame y verifica que no quede un ID de proveedor.
- N12 ejecutaba el runner real con una reserva cuyo vencimiento fijo ya estaba en el pasado y obtenía `CANCELADO`. El fixture se construye ahora alrededor de `clock_timestamp()` con un aviso ya exigible y una reserva todavía vigente. Se conservan el runner, el guard de base de test y las expectativas. Después del ajuste, DR-03 obtuvo **56/56**.
- Gate final: backend **309/309** en 54 suites, frontend **207/207** en 55 suites. Typechecks y builds de ambos workspaces y `git diff --check` pasaron.
- El bundle carece del destino de API `127.0.0.1:3000`, cadenas PostgreSQL y certificados PEM. La coincidencia `http://localhost` corresponde a un fallback interno del router, no a un destino de peticiones de Daplace. La inspección por patrones no sustituye el control de variables públicas en Vercel.
- `vercel dev --local` se invocó con un destino PostgreSQL ficticio de loopback. Con la CLI 68.0.0 detectó ambos servicios antes del `EPERM` de los builders. El smoke de Vercel, el empaquetado Linux, el certificado en runtime, el login/cookies y las descargas a través del enrutador cloud siguen pendientes.
- Cambios acotados a `vercel.json`, clientes HTTP frontend, smoke y runbook. Sin cambio de esquema, proyecto remoto, plan ni datos en Supabase.
- Antes de aprobar uso comercial, ejecutar el smoke en Services y acreditar sesiones y CSV a través del dominio final. El chequeo CSRF existente valida `Origin` por igualdad, pero usa una comparación de prefijo para `Referer` cuando no hay `Origin`; revisar posteriormente el endurecimiento a comparación de orígenes exactos. Este cambio conserva el middleware existente y deja los workers desactivados.
