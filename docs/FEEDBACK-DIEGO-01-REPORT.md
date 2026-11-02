# DAPLACE RENTALS — INFORME DE IMPLEMENTACIÓN FEEDBACK-DIEGO-01
## Correcciones Funcionales Posteriores a la Primera Validación del MVP

**Fecha:** 2 de Noviembre de 2026  
**Rama de trabajo:** `feat/feedback-diego-operational-fixes`  
**Repositorio:** `zaunhzet/Sistema-Daplace-Rentals`  
**Estado:** COMPLETADO Y VERIFICADO (Local)

---

## 1. Resumen Ejecutivo

Durante la primera sesión de validación operativa del MVP realizada por Diego, se identificaron observaciones concretas sobre la usabilidad, persistencia y trazabilidad del sistema. En cumplimiento de la instrucción directiva `FEEDBACK-DIEGO-01`, se implementaron de forma integral las Fases A, B, C y D, preservando la arquitectura, la Inmunidad Financiera, el aislamiento estricto de intervalos anti-overbooking y los 19 hitos de migración en PostgreSQL (Supabase y local).

Asimismo, la **FASE E (Fotos y Colores de Propiedades)** ha sido aplazada formalmente con la debida justificación arquitectónica documentada en este informe.

---

## 2. Matriz de Fases y Resoluciones Técnicas

| Fase | Prioridad | Módulo | Estado | Commit Git |
| :--- | :--- | :--- | :--- | :--- |
| **FASE B** | P0 | Autenticación y Sesión | Resuelto y Validado | `ff59a6c` |
| **FASE A** | P0 | Reservas, Huéspedes y Precios | Resuelto y Validado | `ba802dc` |
| **FASE C** | P1 | Códigos Legibles y Paginación | Resuelto y Validado | `de67db1` |
| **FASE D** | P1 | Etiquetas de Pago y Privacidad | Resuelto y Validado | `ba0addc` |
| **FASE E** | P2 | Multimedia y Color de Propiedades | Aplazado Arquitectónicamente | N/A (Doc) |

---

## 3. Detalle de Implementaciones por Fase

### FASE B — P0: Autenticación y Sesión (Commit `ff59a6c`)

1. **Persistencia de Sesión ante Recarga de Página (`F5`):**
   - **Diagnóstico:** En `ProtectedRoute.tsx`, ante un refresco manual del navegador, el contexto de autenticación comenzaba en estado no autenticado mientras se ejecutaba la restauración asíncrona de sesión (`restoreSession`). Esto disparaba una redirección prematura hacia `/login`.
   - **Solución:** Se integró el estado `isRestoringSession` en `ProtectedRoute.tsx`, mostrando una pantalla de carga sutil durante la validación del token de refresco, impidiendo redirecciones indeseadas si la cookie o refresh token siguen vigentes.

2. **Error 403 CSRF_VIOLATION en Cierre de Sesión:**
   - **Diagnóstico:** El plugin `fastifyCors` permitía intercambio de orígenes loopback (`localhost` ↔ `127.0.0.1`) en entornos de desarrollo/staging, pero el middleware `verifyCsrf` en `auth.middleware.ts` realizaba una comparación estricta de cadenas de texto contra `allowedOrigins`. Al acceder Diego desde `http://localhost:5173` con configuración en `127.0.0.1:5173`, el endpoint `POST /auth/logout` era bloqueado por violación CSRF.
   - **Solución:** Se implementó el helper `isLoopbackEquivalent` en `auth.middleware.ts` para reconocer la equivalencia técnica entre `localhost`, `127.0.0.1` y `::1` manteniendo validación estricta de puertos y protocolos. Se agregaron tests unitarios en `backend/test/auth.test.ts`.

---

### FASE A — P0: Reservas, Huéspedes y Cálculo Automático de Precios (Commit `ba802dc`)

1. **Cantidad de Huéspedes (`cantidadHuespedes`):**
   - Agregado como entero positivo obligatorio tanto en frontend como en Fastify.
   - Validación de capacidad máxima: Se rechaza con `400 CAPACITY_EXCEEDED` si `cantidadHuespedes > propiedad.capacidadHuespedes`.
2. **Horarios Operativos de Check-in y Check-out (`horaCheckIn`, `horaCheckOut`):**
   - Formato validado estrictamente mediante regex `^([01]\d|2[0-3]):[0-5]\d$`.
   - Valores por defecto amigables: `15:00` (check-in) y `11:00` (check-out).
   - **Invariante Crítico:** La prevención de sobreventa (anti-overbooking) se mantiene estrictamente basada en el intervalo de fechas continuas semiabiertas `[ingreso, salida)` respaldado por la restricción de exclusión en PostgreSQL (`reservas_no_overlapping_excl`). Las horas son metadatos puramente operativos para limpieza y recepción.
3. **Tarifa de Limpieza en Propiedades (`precioLimpieza`):**
   - Añadido a `Propiedad` con tipo `Decimal(10, 2)` y valor por defecto `0.00`.
   - Modificados endpoints GET, POST y PATCH de propiedades con validación de no negatividad.
4. **Cálculo Automático de Precios y Snapshots Financieros:**
   - En el formulario de reserva, el subtotal se calcula automáticamente:
     $$\text{Total} = (\text{noches} \times \text{precioBaseNoche}) + \text{precioLimpieza}$$
   - Se muestra un desglose visual claro al operador en tiempo real.
   - En caso de edición manual del precio acordado, se muestra un aviso de precio personalizado y un botón para recalcular automáticamente con las tarifas estándar de la propiedad.
   - Se persisten snapshots inmutables en `Reserva` (`precioBaseNocheSnapshot`, `precioLimpiezaSnapshot`, `subtotalSnapshot`) para garantizar trazabilidad y auditoría histórica.
5. **Migración de Base de Datos:**
   - Migración: `20261101000000_add_reservation_guest_count_times_and_cleaning_price`.

---

### FASE C — P1: Códigos Legibles y Paginación Server-Side (Commit `de67db1`)

1. **Códigos Legibles por Humanos (`PRP-`, `HSP-`, `RSV-`):**
   - Se crearon tres secuencias atómicas en PostgreSQL:
     - `propiedad_codigo_seq`
     - `huesped_codigo_seq`
     - `reserva_codigo_seq`
   - Se asignaron valores por defecto en la base de datos con formato LPAD de 6 dígitos:
     - Propiedades: `PRP-000001`
     - Huéspedes: `HSP-000001`
     - Reservas: `RSV-000001`
   - Se aplicó un backfill completo ordenado por fecha de creación a todos los registros históricos preexistentes.
   - Se crearon índices únicos `propiedades_codigo_key`, `huespedes_codigo_key` y `reservas_codigo_key`.
   - **Libre de condiciones de carrera:** La generación se delega atómicamente a secuencias PostgreSQL, garantizando unicidad estricta aún bajo alta concurrencia.
2. **Paginación Server-Side y Búsqueda por Código:**
   - El endpoint `GET /api/reservas` soporta ahora `page`, `pageSize` y `search` (incluyendo búsqueda por `codigo`).
   - Retorna la estructura paginada `{ data, total, page, pageSize, totalPages }` junto con las cabeceras `X-Total-Count`, `X-Page`, `X-Page-Size`.
   - **Retrocompatibilidad 100%:** Si no se envía el parámetro `page`, el endpoint devuelve el array simple de reservas, preservando la compatibilidad de módulos dependientes (Pagos, Garantías, Calendario).
   - En frontend se implementó la barra de paginación con controles "Anterior", "Siguiente" e indicador de página activa.
3. **Migración de Base de Datos:**
   - Migración: `20261102000000_add_human_readable_codes`.

---

### FASE D — P1: Aclaración de Etiquetas de Transferencia y Privacidad (Commit `ba0addc`)

1. **Rediseño Semántico de Formularios de Pago:**
   - Se sustituyeron etiquetas confusas por terminología bancaria estándar en el Perú:
     - `BANCO RECEPTOR`: con placeholder orientativo `Ej. BCP, BBVA, Interbank, Scotiabank`.
     - `BENEFICIARIO / DESTINO`: distinguiendo claramente entre DAPLACE, PROPIETARIO o TERCERO.
     - `TITULAR DE LA CUENTA RECEPTORA`: visible cuando el destino es propietario o tercero.
     - `ÚLTIMOS 4 DÍGITOS O REF. DE OPERACIÓN`: placeholder `Ej. ****4589 o 4589`.
2. **Privacidad de Datos Financieros y HMAC:**
   - Se incorporó un bloque explicativo de seguridad en el modal:
     > **Privacidad e Integridad (HMAC):** La verificación de autenticidad se realiza mediante firmas criptográficas. Solo se conservan referencias operativas restringidas para conciliación bancaria sin almacenar números de cuenta bancaria completos.
3. **Integración con Códigos Legibles:**
   - En el selector de reservas de pago, cada opción presenta el código legible: `RSV-000001 — Nombre Huésped (Inmueble)`.

---

### FASE E — P2: Aplazamiento Arquitectónico Justificado de Fotos y Colores

**Decisión:** Aplazar la funcionalidad de fotos y códigos de color de inmuebles para un sprint posterior al cierre del MVP.

**Justificación Técnica y Arquitectónica:**
1. **Evitar Almacenamiento Relacional de Archivos Binarios:** Almacenar imágenes como cadenas base64 en PostgreSQL degrada severamente el rendimiento de las consultas y satura rápidamente la cuota de base de datos.
2. **Arquitectura Correcta Requerida:** La implementación robusta de carga multimedia exige aprovisionar almacenamiento de objetos (ej. Supabase Storage o AWS S3 Bucket), configurar políticas de acceso RLS, procesar redimensionamiento y compresión en subida, y configurar una CDN para entrega rápida.
3. **Foco en Estabilidad Operativa del MVP:** La prioridad actual acordada con Diego radica en la certeza transaccional de reservas, pagos, contratos y reportes financieros. Introducir infraestructura de archivos en esta etapa habría puesto en riesgo los plazos de entrega sin aportar valor a las reglas de negocio inmediatas.

---

## 4. Matriz de Validación y Pruebas Ejecutadas

### 4.1 Backend (Node.js Test Runner + Fastify + PostgreSQL)
- **Comando:** `npm test` en `backend/`
- **Total de Pruebas:** **289 / 289 PASADAS** (0 fallas, 0 canceladas, 0 omitidas).
- **Suites Validadas:**
  - `auth.test.ts`: Validación de loopback CORS y CSRF (12/12 pass).
  - `properties-guests.test.ts`: Capacidad, limpieza, códigos `PRP-` y `HSP-` (15/15 pass).
  - `reservations-concurrency.test.ts`: Concurrencia real PostgreSQL, intervalos semiabiertos, horarios, snapshots financieros, códigos `RSV-` y paginación server-side (17/17 pass).
  - `payments-financial.test.ts`: Conciliación, idempotencia y auditoría de pagos (100% pass).
  - `reports-liquidation.test.ts`: Reportes de liquidación con inmunidad financiera (100% pass).

### 4.2 Frontend (Node.js Test Runner + Mock Service)
- **Comando:** `npm test` en `frontend/`
- **Total de Pruebas:** **168 / 168 PASADAS** (0 fallas, 0 canceladas, 0 omitidas).
- **Suites Validadas:**
  - `Public Booking Module` (UI-ANDRE-004)
  - `Reports & Liquidations Module` (HU-07 & HU-12)
  - `DR-02: Contratos de Reserva y Requisitos`
  - `DR-03: Expiración y Sincronización`
  - `Reservations Module` (UI-ANDRE-002)
  - `Application Routing & Navigation Integration` (RBAC-UI-01)
  - `Staff Management Module` (HU-19)

### 4.3 Verificación de Tipos y Compilación en Producción
- `backend`: `npm run typecheck` $\to$ **0 errores**.
- `backend`: `npm run build` $\to$ **Exitoso**.
- `frontend`: `npm run typecheck` $\to$ **0 errores**.
- `frontend`: `npm run build` $\to$ **Exitoso** (`dist/` generado en 580ms).

---

## 5. Estado de Migraciones de Base de Datos

En Supabase remoto (`bdfeiiqcswdxzrqoykwp`) y en la base local `daplace_test` se encuentran aplicadas y verificadas las **19 migraciones oficiales**:
1. `20261026000000_init_daplace_mvp`
2. `20261027000000_harden_enums_and_ranges`
3. `20261027120000_domain_audit_and_rls`
4. `20261028000000_domain_user_sync`
5. `20261028120000_pago_evidencia_contrato_dr01`
6. `20261029000000_contratos_reserva_dr02`
7. `20261029120000_politicas_expiracion_dr03`
8. `20261030000000_fix_user_usuario_rls_recursion`
9. `20261030100000_fix_remaining_circular_rls`
10. `20261030180000_add_maintenance_work_orders`
11. `20261030200000_fix_cron_job_user_fkey`
12. `20261030210000_add_internal_notifications_hu11_hu17`
13. `20261030220000_add_expenses_and_vouchers_hu13_hu14`
14. `20261030230000_add_guarantee_movements_hu15`
15. `20261030233000_add_reports_liquidation_indexes_hu12`
16. `20261031000000_fix_notificaciones_usuario_fk`
17. `20261031020000_enable_supabase_auth_rls`
18. `20261101000000_add_reservation_guest_count_times_and_cleaning_price`
19. `20261102000000_add_human_readable_codes`

---

## 6. Historial de Commits en la Rama

Todos los cambios han sido organizados bajo **Conventional Commits** y preservados localmente en la rama `feat/feedback-diego-operational-fixes`:

```text
ba0addc feat(payments): clarify bank transfer labels and references (FEEDBACK-DIEGO-01-D)
de67db1 feat(codes,pagination): readable codes and server-side pagination (FEEDBACK-DIEGO-01-C)
ba802dc feat(reservations): add guest count, check-in/out times, cleaning price and auto-pricing (FEEDBACK-DIEGO-01-A)
ff59a6c fix(auth): restore session on page reload and fix logout CSRF (FEEDBACK-DIEGO-01-B)
```

**Nota de Seguridad:** Ninguna credencial, secreto ni archivo sensible (`.env`, `.demo-credentials`) fue modificado ni añadido al control de versiones. No se ha realizado `git push` al repositorio remoto conforme a las directivas del proyecto.
