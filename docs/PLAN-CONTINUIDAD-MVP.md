# Plan de Continuidad y Cierre Operativo — MVP Daplace Rentals

**Fecha de Emisión:** 30 de octubre de 2026
**Objetivo Temporal:** Demostración Integral del Sistema — Lunes 2 de noviembre de 2026, 18:30 (America/Lima)
**Tiempo Disponible:** ~3 días de trabajo técnico (75 horas calendario restantes)
**Principios Rectores:**
1. **Verticalidad sobre Horizontalidad:** Es preferible tener 6 flujos transaccionales completos de extremo a extremo que 10 pantallas incompletas con botones sin funcionalidad.
2. **Inmunidad y Verificabilidad:** Ninguna tarea debe comprometer los 234 tests de backend ni los 140 tests de frontend existentes.
3. **No Dependencias Circulares:** Las tareas de frontend consumen contratos de backend previamente probados.

---

## 1. Nivel P0 — Imprescindibles para la Demostración (Plazo: Viernes 30 y Sábado 31 Octubre)

### TAREA P0-01: Publicación de Integración y Merge a Rama Base Remota
* **ID:** `P0-01`
* **Objetivo:** Publicar el merge commit `8c6c661` en el repositorio remoto, crear el Pull Request y consolidarlo en la rama de integración `integration/andre-diego-20261029`.
* **Estado Actual:** Merge local concluido; pendiente de `git push` y PR.
* **Archivos Involucrados:** Todo el monorepo consolidado.
* **Dependencias:** Ninguna (validación técnica INT-01 a INT-05 e INT-VERIFY-01 aprobada).
* **Responsable Sugerido:** André (Autorización) / Antigravity (Ejecución).
* **Criterios de Aceptación:**
  1. `git push origin feat/integration-andre-diego-auth` ejecutado limpiamente.
  2. Pull Request abierto y mergeado hacia `integration/andre-diego-20261029`.
  3. CI remoto ejecutando y reportando verde en typechecks y pruebas.
* **Pruebas Necesarias:** Validación de git log y estado de pipeline en GitHub Actions.
* **Riesgos:** Ninguno en código; divergencia si Diego realiza push simultáneo en remoto sin coordinar.
* **Estimación de Esfuerzo:** 30 minutos.

---

### TAREA P0-02: Endpoint y Servicio de Reporte de Liquidación para Propietarios (HU-07 / HU-12)
* **ID:** `P0-02`
* **Objetivo:** Construir el endpoint backend para calcular la liquidación mensual de un propietario por inmueble, consolidando:
  * Total de ingresos por alquiler (pagos en estado `CONCILIADO`).
  * Total de gastos operativos de la propiedad (gastos en estado `APROBADO`).
  * Balance neto a transferir al propietario (`Ingresos Conciliados - Gastos Aprobados`).
  * Discriminación explícita de garantías en custodia (no sumarizables como ingreso).
* **Estado Actual:** PENDIENTE. Ruta `/reportes` muestra placeholder `PendingModuleView`.
* **Archivos Involucrados:**
  * Backend: `backend/src/routes/reports.ts`, `backend/src/app/app.ts`.
  * Frontend: `frontend/src/features/reports/services/reportService.ts`, `frontend/src/features/reports/pages/ReportsPage.tsx`.
* **Dependencias:** `payments.ts`, `expenses.ts`, `properties.ts`, autenticación con aislamiento de propietario.
* **Responsable Sugerido:** Diego (Backend y consultas SQL agregadas) / André (Vista y tabla de desglose).
* **Criterios de Aceptación:**
  1. `GET /api/reportes/propietario?propiedadId={id}&mes={m}&anio={a}` responde con el desglose contable exacto.
  2. Si el usuario es rol `PROPIETARIO`, solo puede consultar propiedades propias; cualquier intento ajeno responde 403 `FORBIDDEN`.
  3. Los pagos pendientes o rechazados no alteran el total de ingresos.
  4. La vista frontend muestra selector de mes/año, tarjeta de ingreso neto y tabla detallada de conceptos.
* **Pruebas Necesarias:**
  * Pruebas de integración en backend con fixtures de pagos conciliados y gastos aprobados.
  * Verificación de precisión decimal y regla de aislamiento por ownership.
* **Riesgos:** Ambigüedad en cómo imputar gastos cuyo pago fue realizado por Daplace vs por el propietario (requiere aplicar campo `pagadoPor` existente en `Gasto`).
* **Estimación de Esfuerzo:** 4 a 6 horas.

---

### TAREA P0-03: Ensayo Completo y Preparación de Datos Sintéticos para el Guion de Demo
* **ID:** `P0-03`
* **Objetivo:** Poblar la base de datos local con un escenario reproducible y visualmente coherente para la presentación:
  * 3 inmuebles en Lima (Miraflores, Barranco, San Isidro) con fotografías representativas.
  * 2 propietarios sintéticos y 4 huéspedes.
  * Reservas distribuidas en el mes actual mostrando estados: 1 `SOLICITADA` lista para confirmar, 2 `CONFIRMADA` en calendario y 1 con pagos conciliados y voucher.
  * 1 garantía con devolución parcial registrada.
  * 2 gastos con sustento aprobados.
* **Estado Actual:** Script `seed-dev.ts` crea usuarios de acceso; falta poblar inmuebles y transacciones realistas de demostración.
* **Archivos Involucrados:** `backend/src/scripts/seed-demo-mvp.ts`.
* **Dependencias:** Modelos Prisma de todo el dominio.
* **Responsable Sugerido:** Compartido (André define la narrativa visual, Diego valida la consistencia relacional).
* **Criterios de Aceptación:**
  1. Comando `npm run seed:demo` resetea y puebla el estado perfecto en menos de 5 segundos.
  2. Al abrir el sistema con las credenciales de Valeria Méndez (`ADMINISTRADOR`), la aplicación luce lista para la demo sin pantallas vacías ni estados erráticos.
* **Pruebas Necesarias:** Ejecución repetida del comando validando idempotencia.
* **Riesgos:** Que una inserción manual viole alguna restricción de exclusión o clave foránea si no se respeta el orden estricto de tablas.
* **Estimación de Esfuerzo:** 3 horas.

---

## 2. Nivel P1 — Importantes para Consolidar el MVP (Plazo: Domingo 1 de Noviembre)

### TAREA P1-01: Descarga Exportable del Reporte de Liquidación (HU-12)
* **ID:** `P1-01`
* **Objetivo:** Permitir la descarga en archivo estructurado (CSV descargable o PDF simple) del reporte generado en P0-02.
* **Estado Actual:** PENDIENTE.
* **Archivos Involucrados:** `backend/src/routes/reports.ts`, `frontend/src/features/reports/components/ExportButton.tsx`.
* **Dependencias:** `P0-02`.
* **Responsable Sugerido:** André.
* **Criterios de Aceptación:**
  1. Botón "Descargar Liquidación" genera un archivo con nombre determinístico `liquidacion-{inmueble}-{periodo}.csv`.
  2. Los totales del archivo descargado coinciden exactamente con los mostrados en pantalla.
* **Pruebas Necesarias:** Validación de headers HTTP (`Content-Disposition: attachment; filename=...`) y codificación UTF-8 con soporte de tildes.
* **Riesgos:** Ninguno de consideración.
* **Estimación de Esfuerzo:** 2 horas.

---

### TAREA P1-02: Dashboard Operativo Inicial (Resumen de Métricas)
* **ID:** `P1-02`
* **Objetivo:** Sustituir el placeholder `/dashboard` por una vista resumen con 4 KPIs operativos:
  * Tasa de ocupación mensual del inventario activo.
  * Total de reservas en estado `SOLICITADA` pendientes de confirmación.
  * Total de pagos en estado `PENDIENTE_CONCILIACION`.
  * Acceso directo a las 5 reservas más próximas en el tiempo.
* **Estado Actual:** PENDIENTE.
* **Archivos Involucrados:** `frontend/src/features/dashboard/`, `backend/src/routes/dashboard.ts`.
* **Dependencias:** Módulos de reservas y pagos.
* **Responsable Sugerido:** Diego (Query de KPIs) / André (Componentes de métricas).
* **Criterios de Aceptación:**
  1. Los contadores reflejan el estado real de la base de datos sin retardos.
  2. Hacer click en "Solicitudes pendientes" redirige a `/reservas?estado=SOLICITADA`.
* **Pruebas Necesarias:** Pruebas unitarias de cálculo de KPIs.
* **Riesgos:** No demorar la entrega de P0 por refinar en exceso gráficos o librerías pesadas.
* **Estimación de Esfuerzo:** 4 horas.

---

### TAREA P1-03: Consola Centralizada de Trazabilidad y Auditoría (HU-20)
* **ID:** `P1-03`
* **Objetivo:** Crear una pantalla o modal dentro de la barra administrativa para inspeccionar los eventos registrados en la tabla `auditoria_eventos` (mutaciones de reservas, pagos y garantías).
* **Estado Actual:** La tabla se alimenta en PostgreSQL; falta interfaz de consulta.
* **Archivos Involucrados:** `backend/src/routes/audit.ts`, `frontend/src/features/audit/`.
* **Dependencias:** `AuditoriaEvento`.
* **Responsable Sugerido:** Diego.
* **Criterios de Aceptación:**
  1. Solo usuarios con rol `ADMINISTRADOR` pueden consultar la bitácora.
  2. Se listan fecha, actor, entidad, acción y motivo de la mutación.
* **Estimación de Esfuerzo:** 3 horas.

---

## 3. Nivel P2 — Mejoras Posteriores a la Demostración (Post-Demo 2 de Noviembre)

### TAREA P2-01: Módulo de Incidencias de Mantenimiento y Asignación de Trabajos (HU-10 / HU-14 / HU-16)
* **ID:** `P2-01`
* **Objetivo:** Crear el modelo relacional `OrdenTrabajo` o `IncidenciaMantenimiento`, permitiendo a operadores registrar tareas surgidas de un check-out y asignarlas al personal de campo.
* **Estado Actual:** Fuera del alcance del recorrido de la demo.
* **Dependencias:** Requiere definición de flujo con operaciones de campo (DEC-14).
* **Estimación de Esfuerzo:** 8 a 12 horas.

---

### TAREA P2-02: Gestión Interactiva de Personal y Cuentas (HU-19)
* **ID:** `P2-02`
* **Objetivo:** Interfaz gráfica para administradores para dar de alta nuevos operadores, restablecer contraseñas y desactivar accesos sin recurrir a base de datos.
* **Estado Actual:** Cuentas gestionadas vía scripts de seed.
* **Estimación de Esfuerzo:** 6 horas.

---

### TAREA P2-03: Conexión Real de Proveedores de Mensajería (SMTP / WhatsApp)
* **ID:** `P2-03`
* **Objetivo:** Conectar el despachador de outbox `avisos_reserva` con un servicio real de correo (SendGrid / AWS SES) o WhatsApp API para enviar los avisos de expiración y confirmación.
* **Estado Actual:** Outbox transaccional y worker operables en modo prueba; despacho externo desactivado.
* **Estimación de Esfuerzo:** 6 a 8 horas.

---

## 4. Matriz de Responsabilidades y Asignación Sugerida

| Tarea | Prioridad | Responsable Principal | Apoyo | Fecha Límite Sugerida |
| :--- | :---: | :---: | :---: | :---: |
| **P0-01: Publicación de Integración (Push & PR)** | P0 | André | Antigravity | Viernes 30 Octubre, 10:00 |
| **P0-02: Módulo y Reportes de Liquidación (HU-07)** | P0 | Diego (Backend) | André (Frontend) | Sábado 31 Octubre, 18:00 |
| **P0-03: Fixtures Sintéticos y Ensayo de la Demo** | P0 | André | Diego | Domingo 1 Noviembre, 14:00 |
| **P1-01: Descarga de Reportes (HU-12)** | P1 | André | Diego | Domingo 1 Noviembre, 18:00 |
| **P1-02: Dashboard de KPIs Operativos** | P1 | Diego | André | Lunes 2 Noviembre, 12:00 |
| **P1-03: Consulta de Auditoría (HU-20)** | P1 | Diego | - | Lunes 2 Noviembre, 14:00 |
| **P2-01 a P2-03: Post-MVP** | P2 | Compartido | - | Post 2 Noviembre |
