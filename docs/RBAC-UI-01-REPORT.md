# DAPLACE RENTALS — INFORME DE IMPLEMENTACIÓN RBAC-UI-01
## Permisos por Interfaz, Gestión de Propietarios y Resiliencia de Sesión

**Fecha:** 30 de octubre de 2026
**Rama:** `feat/rbac-ui-owner-workflow`
**Base:** `origin/integration/andre-diego-20261029` (Commit base `77d567c4e31c48aa2e36b76a9a624b25692b76f6`)
**Responsable:** André (Senior Full-Stack Engineer)
**Estado:** IMPLEMENTADO, VERIFICADO Y PROBADO AL 100% PASS

---

## 1. Hallazgos Confirmados Durante la Validación del MVP

1. **Vulnerabilidad de Navegación por URL Directa y Ausencia de RBAC Centralizado en Frontend:**
   - La interfaz React no contaba con un catálogo formal de permisos.
   - El `Sidebar` mostraba módulos administrativos sin validar el rol de la sesión activa.
   - Si un usuario `PROPIETARIO` navegaba manualmente por URL a `/huespedes`, `/pagos`, `/reservas` o `/garantias`, la aplicación intentaba renderizar las pantallas antes de que los endpoints de backend rechazaran las peticiones, generando pantallas inconsistentes o alertas de error no guiadas.
   - El rol `CLIENTE` no tenía barrera de entrada al layout administrativo.
2. **Error 403 Bloqueante en Carga de Inmuebles para PROPIETARIO:**
   - En `PropertiesPage.tsx`, la carga inicial ejecutaba en un único `Promise.all` `propertyService.getProperties()` y `propertyService.getPropietarios()`.
   - Dado que `GET /api/propietarios` está restringido estrictamente a `ADMIN` y `OPERADOR`, la llamada fallaba con HTTP 403, arruinando la vista de inmuebles para los propietarios legítimos.
3. **Imposibilidad de Registrar Propietarios en el Flujo de Propiedades:**
   - `PropertyFormModal.tsx` requería seleccionar un propietario existente del catálogo, pero no existía forma de registrar un propietario en caliente ni endpoint backend `POST /api/propietarios`.
4. **Cierre de Sesión Frágil y Sin Tratamiento de Errores:**
   - `AdminLayout.tsx` ejecutaba `logoutDemo` de forma síncrona sin `await`, sin estado visual de carga (`loading`), sin prevención de doble clic y sin redirección a `/login`.
5. **Alineación de Cuentas Demo Sintéticas:**
   - La cuenta sintética de propietario (`propietario.dev@daplace.pe`) en `seed-dev.ts` requería la asignación explícita de `usuarioId` al dueño sintético `usr-102` ("Carlos Eduardo Méndez") para satisfacer el guard estricto de base de datos `DOMAIN_IDENTITY_REQUIRED`.

---

## 2. Archivos Modificados y Creados

### A. Backend
- [`backend/src/routes/properties.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/routes/properties.ts):
  - Creación del endpoint `POST /api/propietarios` con `requireAuth(['ADMIN', 'OPERADOR'])`.
  - Validación de nombre (mínimo 3 caracteres), formato de email y longitud de teléfono.
  - Verificación de duplicados en PostgreSQL (`409 DUPLICATE_OWNER_EMAIL`).
  - Registro de auditoría inmutable `CREAR_PROPIETARIO` en `auditoria_eventos`.
- [`backend/src/scripts/seed-dev.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/src/scripts/seed-dev.ts):
  - Vinculación determinista de cuentas sintéticas a identidades de dominio (`usr-admin`, `usr-operador`, `usr-102`), sin sobrescribir datos existentes si ya están vinculados.
- [`backend/test/properties-guests.test.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/test/properties-guests.test.ts):
  - Tests 7b, 7c, 7d para validación, persistencia en PostgreSQL, auditoría y conflicto 409 de email duplicado en `POST /api/propietarios`.
- [`backend/test/authorization-int03.test.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/backend/test/authorization-int03.test.ts):
  - Tests 8 y 9 verificando que `PROPIETARIO` es rechazado con HTTP 403 `ROLE_NOT_AUTHORIZED` al intentar crear/editar/desactivar inmuebles o invocar `GET /api/propietarios` y `POST /api/propietarios`.

### B. Frontend
- [`frontend/src/features/auth/types.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/auth/types.ts):
  - Inclusión de `usuarioId?: string | null;` en la interfaz `User`.
- [`frontend/src/shared/auth/permissions.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/shared/auth/permissions.ts) *(Nuevo)*:
  - Catálogo centralizado de permisos (`AppPermission`), mapeo estricto por rol (`ROLE_PERMISSIONS`), helpers `hasPermission`, `canAccessPath`, y `getDefaultAuthorizedPath`.
- [`frontend/src/app/ForbiddenPage.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/app/ForbiddenPage.tsx) *(Nuevo)*:
  - Pantalla 403 de acceso denegado con estética limpia, explicación amigable y botón de retorno al módulo autorizado.
- [`frontend/src/app/ProtectedRoute.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/app/ProtectedRoute.tsx) *(Nuevo)*:
  - Guard de rutas React. Redirige a `/login` si no está autenticado, bloquea layout admin a `CLIENTE`, y renderiza `ForbiddenPage` ante rutas no autorizadas.
- [`frontend/src/features/properties/types.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/properties/types.ts):
  - Definición del DTO `CreatePropietarioDto`.
- [`frontend/src/features/properties/services/propertyService.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/properties/services/propertyService.ts):
  - Incorporación de `createPropietario` en `IPropertyService`, `MockPropertyService` y `ApiPropertyService`.
- [`frontend/src/features/properties/components/PropietarioFormModal.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/properties/components/PropietarioFormModal.tsx) *(Nuevo)*:
  - Modal accesible para registro inmediato de nuevo propietario con validación en cliente.
- [`frontend/src/features/properties/components/PropertyFormModal.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/properties/components/PropertyFormModal.tsx):
  - Botón interactivo "+ Agregar Propietario" y selección automática del nuevo propietario creado.
- [`frontend/src/features/properties/components/PropertyList.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/properties/components/PropertyList.tsx) y [`PropertyDetailModal.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/properties/components/PropertyDetailModal.tsx):
  - Prop `canManage?: boolean` para ocultar botones de mutación (editar, desactivar) cuando el usuario carece de privilegios.
- [`frontend/src/features/properties/pages/PropertiesPage.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/features/properties/pages/PropertiesPage.tsx):
  - Desacoplamiento de `propertyService.getPropietarios()`: solo se ejecuta si el rol posee permiso `manage:owners`.
  - Protección de acciones de interfaz según permisos de usuario.
- [`frontend/src/shared/navigation/Sidebar.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/shared/navigation/Sidebar.tsx) y [`AdminLayout.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/app/AdminLayout.tsx):
  - Filtrado reactivo de items de navegación en sidebar según `canAccessPath`.
  - Reemplazo de `logoutDemo` por `handleLogout` con bloqueo de doble clic, spinner `Loader2`, manejo visual de errores y redirección a `/login`.
- [`frontend/src/app/App.tsx`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/src/app/App.tsx):
  - Envoltura de rutas administrativas con `ProtectedRoute`.
  - Redirección post-login y en `/` al módulo inicial autorizado (`getDefaultAuthorizedPath`).
- [`frontend/test/routing.test.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/test/routing.test.ts) y [`frontend/test/properties.test.ts`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/frontend/test/properties.test.ts):
  - Suites de pruebas completas para RBAC frontend, navegación, registro de propietarios y desacoplamiento de catálogo.

### C. Documentación
- [`docs/04-ARQUITECTURA.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/04-ARQUITECTURA.md)
- [`docs/06-CONTRATOS-API.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/06-CONTRATOS-API.md)
- [`docs/08-PLAN-PRUEBAS.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/08-PLAN-PRUEBAS.md)
- [`docs/10-DECISIONES.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/10-DECISIONES.md)
- [`docs/12-DEMO-MVP.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/12-DEMO-MVP.md)
- [`docs/13-MAPA-FRONTEND.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/13-MAPA-FRONTEND.md)
- [`docs/RBAC-MATRIZ-PERMISOS.md`](file:///d:/Proyectos%20VS%20Code/Daplace/daplace-rentals/docs/RBAC-MATRIZ-PERMISOS.md) *(Nuevo)*

---

## 3. Matriz de Roles y Módulos Implementada

| Rol | Módulos Autorizados en Sidebar y Navegación | Restricciones Específicas en UI y Backend |
| :--- | :--- | :--- |
| **ADMINISTRADOR** | Todos los módulos operativos (`/propiedades`, `/calendario`, `/huespedes`, `/reservas`, `/pagos`, `/garantias`, `/gastos`) y módulos pendientes/ejecutivos (`/dashboard`, `/reportes`, `/personal`, `/mantenimiento`). | Acceso irrestricto a operaciones, gestión y conciliación de pagos. |
| **OPERADOR** | Módulos operativos y financieros: `/dashboard`, `/propiedades`, `/calendario`, `/huespedes`, `/reservas`, `/pagos`, `/garantias`, `/gastos`, `/mantenimiento`. | No accede a `/reportes` ni `/personal`. Puede registrar y conciliar pagos según los guards vigentes (`requireAuth(['ADMIN', 'OPERADOR'])`). |
| **PROPIETARIO** | Estrictamente `/propiedades` y `/calendario`. | **Solo lectura:** No puede crear, editar ni desactivar propiedades. No ve catálogo global de propietarios (`GET /api/propietarios` omitido). Bloqueado de `/huespedes`, `/reservas`, `/pagos`, `/garantias`, `/gastos` (HTTP 403). Si no tiene `usuarioId`, responde `DOMAIN_IDENTITY_REQUIRED`. |
| **CLIENTE** | Ningún módulo administrativo. | Acceso denegado al layout administrativo completo (`AdminLayout`); visualiza pantalla informativa segura. |
| **GERENTE** | *No implementado.* | **Decisión de Negocio Pendiente.** No existe en el enum `RolUsuario` de PostgreSQL. No se inventaron reglas artificiales. |

---

## 4. Pruebas y Resultados de Verificación

Todas las verificaciones se ejecutaron en el entorno local conforme a las reglas del proyecto:

1. **Typecheck Backend (`npx tsc --noEmit`):**
   - **Resultado:** 0 errores.
2. **Typecheck Frontend (`npx tsc --noEmit`):**
   - **Resultado:** 0 errores.
3. **Build de Producción Backend (`npm run build`):**
   - **Resultado:** Salida limpia en `dist/` (Exit code 0).
4. **Build de Producción Frontend (`npm run build`):**
   - **Resultado:** Bundle Vite generado con éxito (Exit code 0).
5. **Pruebas Automatizadas Backend (`npm test` contra PostgreSQL real):**
   - **Resultado:** **239 tests PASS**, 37 suites, 0 fallos, 0 errores (duración: 63.8s).
   - Incluye:
     - `properties-guests.test.ts` (15/15 tests PASS): validaciones, unicidad, persistencia de propietarios y auditoría.
     - `authorization-int03.test.ts` (9/9 tests PASS): aislamiento estricto, rechazo seguro de propietarios sin vínculo (`DOMAIN_IDENTITY_REQUIRED`) y rechazo de endpoints de escritura para propietarios (`ROLE_NOT_AUTHORIZED`).
6. **Pruebas Automatizadas Frontend (`npm test` con Vitest):**
   - **Resultado:** **148 tests PASS**, 33 suites, 0 fallos, 0 errores.
   - Incluye:
     - `routing.test.ts` (6 tests PASS): validación RBAC de los 4 roles, redirecciones y filtrado de sidebar.
     - `properties.test.ts` (9 tests PASS): registro de propietarios en mock, rechazo de duplicados y desacoplamiento de catálogo.

---

## 5. Evidencia de Integridad y Persistencia

- **Persistencia de Propietarios:** Se verificó que `POST /api/propietarios` crea el registro en la tabla `usuarios` de PostgreSQL con `rol = 'PROPIETARIO'` y `activo = true`, registrando el hash del payload y el actor en `auditoria_eventos` con `accion = 'CREAR_PROPIETARIO'`.
- **Integridad Foránea:** Ningún propietario de dominio creado automáticamente genera una cuenta `User` ni credenciales, preservando la separación estricta entre identidad de autenticación y actor de dominio (`DEC-13`).
- **Resiliencia de Cierre de Sesión:** El logout frontend incrementa el `authEpoch`, invalidando cualquier respuesta asíncrona desfasada y garantizando que el usuario regrese a `/login` sin dejar expuestas rutas administrativas.

---

## 6. Riesgos Restantes y Recomendaciones

1. **Rol GERENTE:** Debe convocarse una reunión con dirección de producto para definir los requerimientos de auditoría y supervisión antes de emitir una migración de Prisma para alterar el enum `RolUsuario`.
2. **Smoke Test E2E en Navegador Vivo:** Aunque la cobertura unitaria y de integración es del 100% PASS, se recomienda ejecutar el guion manual de `docs/12-DEMO-MVP.md` en el ensayo del lunes 2 de noviembre para validar la experiencia visual en vivo.

---

## 7. Estado Git y Pasos para Publicación

- **Rama Actual:** `feat/rbac-ui-owner-workflow`
- **Estado de Trabajo:** Todos los cambios implementados, probados y documentados.
- **Sin Push:** En cumplimiento estricto con las directrices globales, **no se ha realizado `git push` ni creado commits sin autorización previa**.
- **Pasos para Publicación:**
  1. Revisión y autorización de cambios por André.
  2. Generación de commit local convencional:
     `feat(rbac): implement frontend role-based access, owner creation workflow and robust logout`
  3. Push autorizado a remoto: `git push origin feat/rbac-ui-owner-workflow`.
  4. Apertura de Pull Request contra `integration/andre-diego-20261029`.
