# DAPLACE RENTALS — INFORME DE VALIDACIÓN OPERATIVA FINAL
## RBAC-UI-01 FINAL GATE

**Fecha:** 30 de octubre de 2026
**Rama:** `feat/rbac-ui-owner-workflow`
**Base:** `origin/integration/andre-diego-20261029` (Commit base `77d567c4e31c48aa2e36b76a9a624b25692b76f6`)
**Responsable:** André (Senior Full-Stack Engineer)
**Estado:** **READY FOR COMMIT** (Todos los gates aprobados al 100%)

---

## 1. Evidencia del Proceso de Bootstrap e Inicialización

Se ensayó y validó minuciosamente el proceso completo de arranque sobre la base de pruebas desechable y autorizada `daplace_test` (`postgresql://daplace:****@localhost:5432/daplace_test?schema=public`):

### Orden Seguro de Inicialización Verificado:
1. **Migraciones:** `prisma migrate deploy` (Aplica esquemas, tipos enum, índices y constraint de exclusión `reserva_no_solapada_excl`).
2. **Paso 1 — Entidades de Dominio:** `npm run db:seed:dev` (`backend/src/scripts/seed.ts`).
   * Puebla 6 usuarios (`usr-admin`, `usr-operador`, `usr-101`, `usr-102`, `usr-103`, `usr-104`), 5 propiedades, 4 huéspedes, 6 reservas, 2 pagos y 1 garantía con libro mayor inmutable.
3. **Paso 2 — Credenciales y Vinculación de Identidades:** `npm run db:seed` (`backend/src/scripts/seed-dev.ts`).
   * Inserta o actualiza las cuentas de autenticación `users` (`admin.dev@daplace.pe`, `operador.dev@daplace.pe`, `propietario.dev@daplace.pe`, `cliente.dev@daplace.pe`).
   * **Vinculación Explícita:** Vincula determinísticamente `propietario.dev@daplace.pe` con `usr-102` ("Carlos Eduardo Méndez"), `admin.dev@daplace.pe` con `usr-admin`, y `operador.dev@daplace.pe` con `usr-operador`.
4. **Idempotencia Comprobada:**
   * La reejecución de ambos scripts comprobó que **no se sobrescriben contraseñas ni vínculos existentes**, no se generan errores de clave foránea duplicada y se preserva íntegramente la relación relacional `User.usuarioId -> Usuario.id`.
   * Se comprobó que `prop-01` y `prop-04` pertenecen a `usr-102` y quedan vinculadas a la cuenta de propietario demo.

---

## 2. Verificación Funcional RBAC de los 4 Roles

Se verificó el comportamiento reactivo en frontend y la autoridad definitiva de autorización en Fastify/PostgreSQL:

| Rol | Navegación Frontend | Visualización Sidebar | Acciones en UI | Respuesta Backend ante Ataque/Bypass |
| :--- | :--- | :--- | :--- | :--- |
| **ADMINISTRADOR** | Acceso a todas las rutas operativas y placeholders. | Sidebar completo (7 operativas + 4 placeholders). | Habilitadas todas las operaciones de creación, edición y conciliación. | HTTP 200 / 201 en todos los endpoints administrativos. |
| **OPERADOR** | Acceso a operaciones y finanzas (`/propiedades`, `/calendario`, `/huespedes`, `/reservas`, `/pagos`, `/garantias`, `/gastos`). | Ocultos `/reportes` y `/personal`. | Habilitadas operaciones de registro y gestión operativa. Conciliación habilitada según guards vigentes. | HTTP 403 `ROLE_NOT_AUTHORIZED` si intenta acceder a endpoints ejecutivos no asignados (`/personal`, `/reportes`). |
| **PROPIETARIO** | Estrictamente `/propiedades` y `/calendario`. Navegación directa por URL a cualquier otra ruta es interceptada por `ProtectedRoute` mostrando la pantalla **403 ForbiddenPage**. | Ocultos todos los módulos financieros y de huéspedes. Solo visibles `/propiedades` y `/calendario`. | Botones "Registrar Propiedad", "Editar" y "Desactivar" ocultos. Carga inicial no solicita `GET /api/propietarios`. | HTTP 403 `ROLE_NOT_AUTHORIZED` en cualquier intento de mutación de propiedades, pagos, huéspedes o reservas. Si carece de `usuarioId`, HTTP 403 `DOMAIN_IDENTITY_REQUIRED`. |
| **CLIENTE** | Acceso denegado a todo el `AdminLayout`. Intento de acceso administrativo muestra pantalla informativa y redirección segura. | Sin acceso al layout administrativo. | Sin acciones administrativas. | HTTP 403 `ROLE_NOT_AUTHORIZED` en todas las rutas administrativas del backend. |

---

## 3. Validación de Punta a Punta del Flujo de Diego

Se implementó y ejecutó una verificación integral de punta a punta cubriendo la secuencia exacta solicitada:

1. **Login Administrador:** Autenticado vía `POST /auth/login` con `admin.dev@daplace.pe`. Emisión de JWT y cookie HttpOnly.
2. **Registro de Propietario en Caliente:** Invocado `POST /api/propietarios` creando al actor de dominio `Usuario` (rol `PROPIETARIO`, `activo = true`) sin crear credenciales `User`. Evento de auditoría `CREAR_PROPIETARIO` persistido en PostgreSQL.
3. **Creación de Propiedad:** Invocado `POST /api/propiedades` asignada al ID del propietario recién creado.
4. **Verificación de Inmueble:** Invocado `GET /api/propiedades/:id`. Se comprobó la integridad de la clave foránea `propietarioId`.
5. **Registro de Huésped:** Invocado `POST /api/huespedes`. Huésped registrado con éxito.
6. **Persistencia Directa en PostgreSQL:** Comprobada lectura directa con Prisma (`db.prisma.huesped.findUnique`). Persistencia íntegra confirmada.
7. **Cierre de Sesión Admin:** Invocado `POST /auth/logout` con cabecera CSRF `x-requested-with: XMLHttpRequest`. Revocación en servidor confirmada.
8. **Login Propietario Vinculado:** Autenticado con `propietario.dev@daplace.pe`.
9. **Aislamiento Multi-Tenant de Inmuebles:** Invocado `GET /api/propiedades`. El propietario recibió **únicamente** sus 2 propiedades (`prop-01` y `prop-04`), con 0 filtraciones de propiedades ajenas.
10. **Pruebas Negativas de Acceso:** Se comprobó que peticiones directas de este propietario a `GET /api/huespedes`, `GET /api/pagos` y `GET /api/propietarios` respondieron con **HTTP 403 `ROLE_NOT_AUTHORIZED`**.

---

## 4. Problemas Encontrados y Correcciones Realizadas

1. **Trailing Whitespace en Documentación:**
   - La ejecución de `git diff --check` detectó un espacio en blanco sobrante en la línea 4 de [`docs/13-MAPA-FRONTEND.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/13-MAPA-FRONTEND.md).
   - **Corrección:** Espacio eliminado; `git diff --check` ahora retorna código de salida 0 limpio.
2. **Orden Documentado de Seeds en el Guion:**
   - Se corrigió la descripción del procedimiento de reseteo en [`docs/12-DEMO-MVP.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/12-DEMO-MVP.md): debe ejecutarse primero `npm run db:seed:dev` (dominio) y luego `npm run db:seed` (credenciales y vinculación) para evitar errores de clave foránea.
3. **Comando de Pruebas de Frontend:**
   - Se validó que el comando oficial de pruebas en el frontend es `npm test` (que ejecuta `tsx --test test/*.test.ts`) o `npm run test:web` desde la raíz.

---

## 5. Resultados de Validación Automatizada

- **`git diff --check`:** **Limpio (Exit code 0).**
- **Typecheck Backend (`npm run typecheck --workspace @daplace/backend`):** **0 errores.**
- **Typecheck Frontend (`npm run typecheck --workspace @daplace/frontend`):** **0 errores.**
- **Build Backend (`npm run build --workspace @daplace/backend`):** **Completado con éxito (Exit code 0).**
- **Build Frontend (`npm run build --workspace @daplace/frontend`):** **Completado con éxito (Exit code 0).**
- **Pruebas Backend (`npm test` contra PostgreSQL real):** **239/239 PASS** (37 suites, 0 fallos).
- **Pruebas Frontend (`npm test` con Vitest/tsx):** **148/148 PASS** (33 suites, 0 fallos).

---

## 6. Estado Git y Veredicto Final

- **Rama Actual:** `feat/rbac-ui-owner-workflow`
- **Cambios Realizados:** 11 archivos de código modificados, 4 componentes/guards creados, 8 documentos técnicos actualizados o creados.
- **Veredicto:** **READY FOR COMMIT**. Todos los requerimientos funcionales, de seguridad, arquitectura y persistencia han sido verificados y documentados.
