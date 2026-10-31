# Matriz de Control de Acceso Basado en Roles (RBAC)

**Sistema:** Daplace Rentals
**Fase:** Validación MVP (RBAC-UI-01)
**Fecha:** 30 de octubre de 2026
**Autores:** André (Frontend & Dominio Transaccional) y Diego (Backend & Seguridad de Acceso)

---

## 1. Principios de Autorización

1. **Defensa en Profundidad:** El frontend filtra la interfaz para maximizar la experiencia de usuario y evitar navegación engañosa, pero **el backend es la autoridad definitiva** mediante middleware `requireAuth` y guardias de identidad de dominio (`DOMAIN_IDENTITY_REQUIRED`).
2. **Catálogo Central de Permisos:** Se centralizan en `frontend/src/shared/auth/permissions.ts` en lugar de comparaciones dispersas de strings.
3. **Aislamiento Multi-Tenant de Propietarios:** Los propietarios solo pueden ver y operar sobre sus propios inmuebles y calendarios. Se rechaza cualquier intento de manipulación o consulta de propiedades ajenas (`403 ROLE_NOT_AUTHORIZED` / `DOMAIN_IDENTITY_REQUIRED`).
4. **Separación de Identidades:** La cuenta de autenticación (`User`) no se confunde con el actor relacional de dominio (`Usuario`). Registrar un propietario en el catálogo no genera credenciales `User`.

---

## 2. Matriz de Roles y Módulos de Interfaz (Frontend)

| Módulo / Ruta | ADMINISTRADOR | OPERADOR | PROPIETARIO | CLIENTE | Estado del Módulo |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`/dashboard`** |  Permitido |  Permitido | ❌ Denegado (403) | ❌ Denegado | Placeholder (En desarrollo) |
| **`/propiedades`** |  Permitido (Total) |  Permitido (Total) | ⚠️ Solo Propias (Lectura) | ❌ Denegado | Operativo |
| **`/calendario`** |  Permitido (Global) |  Permitido (Global) | ⚠️ Solo Propias (Lectura) | ❌ Denegado | Operativo |
| **`/huespedes`** |  Permitido |  Permitido | ❌ Denegado (403) | ❌ Denegado | Operativo |
| **`/reservas`** |  Permitido |  Permitido | ❌ Denegado (403) | ❌ Denegado | Operativo |
| **`/pagos`** |  Permitido |  Permitido | ❌ Denegado (403) | ❌ Denegado | Operativo |
| **`/garantias`** |  Permitido |  Permitido | ❌ Denegado (403) | ❌ Denegado | Operativo |
| **`/gastos`** |  Permitido |  Permitido | ❌ Denegado (403) | ❌ Denegado | Operativo |
| **`/reportes`** |  Permitido | ❌ Denegado (403) | ❌ Denegado (403) | ❌ Denegado | Placeholder (P0-02) |
| **`/personal`** |  Permitido | ❌ Denegado (403) | ❌ Denegado (403) | ❌ Denegado | Placeholder (CLI/Seed) |
| **`/mantenimiento`** |  Permitido |  Permitido | ❌ Denegado (403) | ❌ Denegado | Placeholder (HU-10/14) |
| **Acceso al Layout Admin** |  Sí |  Sí |  Sí | ❌ No (Redirección a pantalla segura) | Operativo |

---

## 3. Matriz de Acciones por Endpoint Backend y Visibilidad Frontend

| Recurso / Operación | Método & Endpoint | Backend Auth Guard | ADMINISTRADOR | OPERADOR | PROPIETARIO | CLIENTE | Estado de Pruebas |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Listar Propiedades** | `GET /api/propiedades` | `requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO'])` |  Todas |  Todas | ⚠️ Solo Propias (Filtro forzado `propietarioId`) | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Crear Propiedad** | `POST /api/propiedades` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 (`ROLE_NOT_AUTHORIZED`) | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Editar Propiedad** | `PUT /api/propiedades/:id` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 (`ROLE_NOT_AUTHORIZED`) | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Desactivar Propiedad**| `PATCH /api/propiedades/:id/desactivar` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 (`ROLE_NOT_AUTHORIZED`) | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Listar Catálogo Propietarios** | `GET /api/propietarios` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 (`ROLE_NOT_AUTHORIZED`) | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Registrar Propietario** | `POST /api/propietarios` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 (`ROLE_NOT_AUTHORIZED`) | ❌ 403 | ✅ Probado (`properties-guests.test.ts`) |
| **Consultar Calendario** | `GET /api/calendario` | `requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO'])` |  Permitido |  Permitido | ⚠️ Solo Propiedad Propia | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Listar Huéspedes** | `GET /api/huespedes` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Crear Huésped** | `POST /api/huespedes` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`properties-guests.test.ts`) |
| **Crear Reserva** | `POST /api/reservas` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`authorization-int03.test.ts`) |
| **Confirmar Reserva** | `POST /api/reservas/:id/confirmar` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`reservations.test.ts`) |
| **Registrar Pago** | `POST /api/pagos` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`payments.test.ts`) |
| **Conciliar Pago** | `POST /api/pagos/:id/conciliar` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`financial-payments-guarantees.test.ts`) |
| **Registrar Garantía** | `POST /api/garantias` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`guarantees.test.ts`) |
| **Registrar Gasto** | `POST /api/gastos` | `requireAuth(['ADMIN', 'OPERADOR'])` |  Permitido |  Permitido | ❌ 403 | ❌ 403 | ✅ Probado (`expenses.test.ts`) |
| **Revocar Sesión (Logout)** | `POST /auth/logout` | Sesión activa |  Revoca familia |  Revoca familia |  Revoca familia |  Revoca familia | ✅ Probado (`auth-security-int02.test.ts`) |

---

## 4. Distinción entre Niveles de Autorización y Visibilidad

1. **Autorización Backend:**
   - La regla se evalúa en el middleware de Fastify en cada petición HTTP.
   - El token JWT provee `rol` y `usuarioId`.
   - Si el rol es insuficiente, responde HTTP 403 `ROLE_NOT_AUTHORIZED`.
   - Si el rol es `PROPIETARIO` pero `usuarioId` es nulo, responde HTTP 403 `DOMAIN_IDENTITY_REQUIRED`.
2. **Visibilidad en Frontend:**
   - Evaluada reactivamente mediante `shared/auth/permissions.ts`.
   - El `Sidebar` solo renderiza los elementos que satisfacen `canAccessPath(session.user?.rol, item.path)`.
   - Si el usuario introduce manualmente la URL en la barra de direcciones, `ProtectedRoute` intercepta y renderiza `ForbiddenPage` (403) con un enlace para retornar al módulo seguro.
   - Si un usuario no está autenticado, es redirigido de inmediato a `/login`.
3. **Acciones en Formularios y Listados:**
   - En la vista de propiedades, para el rol `PROPIETARIO`:
     - El botón superior "Registrar Propiedad" se oculta.
     - En la grilla de propiedades, los botones "Editar" y "Desactivar" se ocultan.
     - En el modal de detalle de propiedad, las acciones de mutación se ocultan.
     - La carga inicial de datos no invoca `GET /api/propietarios`, eliminando errores de red innecesarios.

---

## 5. Nota sobre Rol GERENTE

* **Estado:** **DECISIÓN DE NEGOCIO PENDIENTE**.
* **Tratamiento:** No forma parte del enum `RolUsuario` en la base de datos PostgreSQL (`ADMIN`, `OPERADOR`, `PROPIETARIO`, `CLIENTE`).
* **Restricción:** Queda terminantemente prohibido inventar permisos o mapeos artificiales para `GERENTE` hasta que la dirección de negocio defina su especificación de responsabilidades y matriz formal.
