# 03 — Backlog Técnico y Estado de Tareas

**Fecha de Actualización:** 30 de octubre de 2026
**Estado:** VIGENTE TRAS INTEGRACIÓN ANDRÉ–DIEGO

---

## 1. Reservas y Disponibilidad

| ID | Requisito / HU Auténtica | Descripción Exacta | Pri. | Módulos Reales | Estado | Evidencia y Verificación |
|---|---|---|:---:|---|:---:|---|
| **RSV-01** | RF01 / HU-01 «Consultar propiedades y fechas disponibles» | Consultar disponibilidad por propiedad y fechas con intervalo semiabierto `[ingreso, salida)`. | P0 | `backend/src/routes/calendar.ts`, `frontend/src/features/calendar` | **COMPLETO_VERIFICADO** | Grilla mensual de calendario con días libres/ocupados y badges de check-in/out. |
| **RSV-02** | RF02 / HU-02 «Solicitar una reserva» | Crear solicitud de reserva con estado inicial `SOLICITADA` y cálculo de noches. | P0 | `backend/src/routes/reservations.ts`, `frontend/src/features/reservations` | **COMPLETO_VERIFICADO** | Formulario modal de reserva con validación y respuesta 201 en base de datos. |
| **RSV-03** | RF03 / HU-03 «Gestionar reservas» | Confirmar una solicitud verificando atómicamente la ausencia de solapes. | P0 | `backend/src/routes/reservations.ts` | **COMPLETO_VERIFICADO** | Transición a `CONFIRMADA` con verificación de adelanto mínimo y contrato. |
| **RSV-04** | RF03 / HU-03 «Gestionar reservas» | Reprogramar fechas de una reserva excluyendo el propio ID al comprobar solape. | P0 | `backend/src/routes/reservations.ts` (`PATCH /fechas`) | **COMPLETO_VERIFICADO** | Edición de fechas transaccional; solape produce 409 y rollback. |
| **RSV-05** | RF03 / HU-03 «Gestionar reservas» | Cancelar reserva mediante transición a `CANCELADA` requiriendo motivo formal. | P0 | `backend/src/routes/reservations.ts` (`POST /cancelar`) | **COMPLETO_VERIFICADO** | Libera el intervalo en calendario y preserva la auditoría histórica. |
| **RSV-06** | RF01, RF03 / HU-01, HU-03 | Aplicar barrera de integridad en PostgreSQL contra ocupaciones incompatibles. | P0 | `backend/prisma/migrations/20261030050000...` | **COMPLETO_VERIFICADO** | Exclusion constraint `reserva_no_solapada_excl` con `btree_gist` en PostgreSQL. |

---

## 2. Propiedades, Huéspedes, Identidad y Trazabilidad

| ID | Requisito / HU Auténtica | Descripción Exacta | Pri. | Módulos Reales | Estado | Evidencia y Verificación |
|---|---|---|:---:|---|:---:|---|
| **BASE-01** | RF04 / HU-04 «Registrar y consultar huéspedes» | Registrar y consultar datos de huésped con validación de al menos un contacto. | P0 | `backend/src/routes/guests.ts`, `frontend/src/features/guests` | **COMPLETO_VERIFICADO** | CRUD completo de huéspedes, búsqueda reactiva y trazabilidad de estancias. |
| **BASE-02** | — / HU-18 «Mantener propiedades y propietarios» | Registrar y mantener la relación propiedad-propietario con baja lógica. | P0 | `backend/src/routes/properties.ts`, `frontend/src/features/properties` | **COMPLETO_VERIFICADO** | CRUD de inmuebles, `activa = false` para preservación financiera y ownership estricto. |
| **AUTH-01** | RF09, RF12 / HU-08 «Iniciar sesión y aplicar permisos»; HU-19 | Autenticar usuarios con JWT/cookies, rotación atómica y RBAC en servidor. | P0 | `backend/src/modules/auth/`, `frontend/src/features/auth` | **COMPLETO_VERIFICADO** | 8 tests concurrentes en PostgreSQL; login real, logout por familia y rechazo 403. |
| **AUD-01** | RF09 / HU-20 «Consultar trazabilidad»; HU-22 «Corregir sin perder historial» | Registrar eventos operativos append-only en `auditoria_eventos`. | P0 | `backend/prisma/schema.prisma` (`AuditoriaEvento`) | **COMPLETO_VERIFICADO** | Mutaciones financieras dejan rastro de actor, entidad, acción y motivo. |
| **AUD-02** | — / HU-23 «Consultar estados y errores del proceso» | Manejo centralizado de errores con códigos legibles y sin filtrar secretos. | P1 | `backend/src/app/app.ts` (`setErrorHandler`) | **COMPLETO_VERIFICADO** | Respuestas JSON con `code`, `message`, `requestId` y captura de validaciones. |

---

## 3. Pagos, Garantías, Gastos y Reportes

| ID | Requisito / HU Auténtica | Descripción Exacta | Pri. | Módulos Reales | Estado | Evidencia y Verificación |
|---|---|---|:---:|---|:---:|---|
| **FIN-01** | RF05 / HU-05 «Registrar y conciliar pagos de alquiler» | Registrar pago con clave de idempotencia en estado `PENDIENTE_CONCILIACION`. | P0 | `backend/src/routes/payments.ts`, `frontend/src/features/payments` | **COMPLETO_VERIFICADO** | Registro con monto exacto decimal, método de pago y voucher adjunto. |
| **FIN-02** | RF05 / HU-05 «Registrar y conciliar pagos de alquiler» | Conciliar o rechazar formalmente un pago con registro de actor y fecha. | P0 | `backend/src/routes/payments.ts` (`/conciliar`, `/rechazar`) | **COMPLETO_VERIFICADO** | Solo pagos conciliados reducen saldo; rechazo exige motivo auditable. |
| **FIN-03** | RF05 / HU-05 «Registrar y conciliar pagos de alquiler» | Calcular saldo exigible de la reserva derivado de pagos conciliados. | P0 | `backend/src/routes/payments.ts` (`/saldo`) | **COMPLETO_VERIFICADO** | Resumen financiero exacto sin aproximaciones de punto flotante binario. |
| **GAR-01** | RF06 / HU-06 «Controlar la garantía» | Registrar depósito de garantía separado de los ingresos por alquiler. | P0 | `backend/src/routes/guarantees.ts`, `frontend/src/features/guarantees` | **COMPLETO_VERIFICADO** | Fondo en custodia independiente de la suma de alquiler del inmueble. |
| **GAR-02** | RF06 / HU-06 «Controlar la garantía» | Registrar retenciones y devoluciones limitadas estrictamente al saldo disponible. | P0 | `backend/src/routes/guarantees.ts` (`/movimientos`) | **COMPLETO_VERIFICADO** | Libro mayor inmutable; movimientos que superen saldo disponible son rechazados. |
| **FIN-04** | — / HU-21 «Registrar gastos asociados a propiedad» | Registrar gastos por inmueble con comprobante digital y estado de aprobación. | P1 | `backend/src/routes/expenses.ts`, `frontend/src/features/expenses` | **COMPLETO_VERIFICADO** | Clasificación por categoría y mes; soporte de comprobantes y anulación formal. |
| **REP-01** | RF08 / HU-07 «Generar reporte por propiedad y periodo» | Generar liquidación mensual para propietarios con total reproducible. | P0 | `PendingModuleView` (`/reportes`) | **PENDIENTE (P0-02)** | Programado para desarrollo en jornada J4 (Sábado 31 de Octubre). |
| **REP-02** | RF12 / HU-12 «Descargar reporte propio» | Exportar liquidación en archivo estructurado (CSV descargable). | P1 | `PendingModuleView` (`/reportes`) | **PENDIENTE (P1-01)** | Programado para desarrollo en jornada J5 (Domingo 1 de Noviembre). |

---

## 4. Operaciones, Alertas, Airbnb y Contratos

| ID | Requisito / HU Auténtica | Descripción Exacta | Pri. | Módulos Reales | Estado | Evidencia y Verificación |
|---|---|---|:---:|---|:---:|---|
| **OPS-01** | RF07 / HU-10 «Registrar salida y necesidad de mantenimiento» | Registro de check-out y necesidad de mantenimiento vinculada. | P1 | `PendingModuleView` (`/mantenimiento`) | **PENDIENTE** | Fuera de la ruta crítica mínima de la demo del 2 de noviembre. |
| **OPS-02** | RF13, RF15 / HU-14 «Asignar trabajos»; HU-16 «Consultar trabajos» | Asignar y actualizar órdenes de trabajo de campo por operario. | P1 | `PendingModuleView` (`/mantenimiento`) | **PENDIENTE** | Fuera de la ruta crítica mínima de la demo del 2 de noviembre. |
| **OPS-03** | RF14 / HU-15 «Consultar autorizaciones de ingreso» | Consultar autorizaciones de ingreso desde fuente externa oficial. | P2 | Inexistente | **BLOQUEADO_DECISION** | Fuente externa de datos no definida por negocio (DEC-09). |
| **OPS-04** | RF11 / HU-11 «Ver alerta interna de nueva reserva» | Mostrar alertas internas de vencimiento y confirmación. | P1 | `avisos_reserva` (Outbox) | **IMPLEMENTADO_NO_VALIDADO_E2E** | Avisos se programan en PostgreSQL; falta componente de campana en UI. |
| **OPS-05** | RF16 / HU-17 «Recibir aviso de asignación» | Notificación al personal de campo tras asignación de trabajo. | P1 | Inexistente | **PENDIENTE** | Depende de OPS-02. |
| **OPS-06** | RF10 / HU-13 «Generar / registrar contrato» | Registro de contrato firmado y validación previa a confirmación. | P2 | `backend/src/routes/contracts.ts` | **COMPLETO_VERIFICADO** | Modelo `ContratoReserva` con versionamiento inmutable y validación. |
| **OPS-07** | RF17 / HU-09 «Registrar reservas procedentes de Airbnb» | Registrar reservas manuales con procedencia Airbnb y control de solape. | P1 | `backend/src/routes/reservations.ts` | **COMPLETO_VERIFICADO** | Selector de origen `AIRBNB` sujeto a las mismas barreras de integridad. |
| **OPS-08** | RF09 / HU-20 «Consultar trazabilidad operativa» | Vista de bitácora de eventos con filtros por fecha y entidad. | P1 | Tabla `auditoria_eventos` | **IMPLEMENTADO_NO_VALIDADO_E2E** | Eventos persistidos en base de datos; falta consola gráfica consolidada. |
