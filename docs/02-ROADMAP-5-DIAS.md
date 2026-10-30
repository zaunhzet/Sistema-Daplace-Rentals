# 02 — Roadmap de Ejecución y Plan de Jornadas

**Fecha de Actualización:** 30 de octubre de 2026
**Jornada Actual:** Viernes 30 de octubre (J3 — Integración André–Diego Concluida)
**Entrega y Demostración:** Lunes 2 de noviembre de 2026, 18:30 (America/Lima)

---

## 1. Mapeo de Historias de Usuario por Jornada

| HU Auténtica | Bloque Relacionado | Prioridad | Jornada | Estado al 30 de Octubre |
|---|---|:---:|:---:|:---:|
| **HU-01** Consultar propiedades y fechas disponibles | RSV-01, RSV-06 | P0 | J3 | **COMPLETO_VERIFICADO** (Calendario mensual y disponibilidad API) |
| **HU-02** Solicitar una reserva | RSV-02 | P0 | J3 | **COMPLETO_VERIFICADO** (Estado `SOLICITADA` y cálculo de noches) |
| **HU-03** Gestionar reservas | RSV-03, RSV-04, RSV-05, RSV-06 | P0 | J3 | **COMPLETO_VERIFICADO** (Anti-solape `btree_gist`, fechas y cancelación) |
| **HU-04** Registrar y consultar huéspedes | BASE-01 | P0 | J2 | **COMPLETO_VERIFICADO** (Directorio con contacto obligatorio) |
| **HU-05** Registrar y conciliar pagos de alquiler | FIN-01, FIN-02, FIN-03 | P0 | J4 (Adelantado) | **COMPLETO_VERIFICADO** (Idempotencia, conciliación y saldo exacto) |
| **HU-06** Controlar la garantía | GAR-01, GAR-02 | P0 | J4 (Adelantado) | **COMPLETO_VERIFICADO** (Custodia separada e invariante de saldo) |
| **HU-07** Generar reporte por propiedad y periodo | REP-01 | P0 | J4 / J5 | **PENDIENTE (P0-02)** — Programado para Sábado 31 de Octubre |
| **HU-08** Iniciar sesión y aplicar permisos | AUTH-01 | P0 | J2 | **COMPLETO_VERIFICADO** (JWT, rotación atómica y RBAC) |
| **HU-09** Registrar reservas procedentes de Airbnb | OPS-07 | P1 | J3 | **COMPLETO_VERIFICADO** (Origen manual con control de solape) |
| **HU-10** Registrar salida y necesidad de mantenimiento | OPS-01 | P1 | Post-Demo | **PENDIENTE** |
| **HU-11** Ver alerta interna de nueva reserva | OPS-04 | P1 | J3 | **IMPLEMENTADO_NO_VALIDADO_E2E** (Outbox `avisos_reserva`) |
| **HU-12** Descargar reporte propio | REP-02 | P1 | J5 | **PENDIENTE (P1-01)** — Programado para Domingo 1 de Noviembre |
| **HU-13** Generar / registrar contrato de reserva | OPS-06 | P2 | J3 (Adelantado) | **COMPLETO_VERIFICADO** (`contratos_reserva` con validación) |
| **HU-14** Asignar trabajos de campo | OPS-02 | P1 | Post-Demo | **PENDIENTE** |
| **HU-15** Consultar autorizaciones de ingreso | OPS-03 | P2 | Post-Demo | **BLOQUEADO_DECISION** (Fuente externa no definida) |
| **HU-16** Consultar y actualizar trabajos asignados | OPS-02 | P1 | Post-Demo | **PENDIENTE** |
| **HU-17** Recibir aviso de asignación | OPS-05 | P1 | Post-Demo | **PENDIENTE** |
| **HU-18** Mantener propiedades y propietarios | BASE-02 | P0 | J2 | **COMPLETO_VERIFICADO** (CRUD y aislamiento por propietario) |
| **HU-19** Crear y desactivar cuentas internas | AUTH-01 | P1 | J2 | **PARCIAL** (Gestionado mediante `seed-dev.ts`) |
| **HU-20** Consultar trazabilidad operativa | AUD-01, OPS-08 | P1 | J4 | **IMPLEMENTADO_NO_VALIDADO_E2E** (`auditoria_eventos`) |
| **HU-21** Registrar gastos asociados a propiedad | FIN-04 | P1 | J4 (Adelantado) | **COMPLETO_VERIFICADO** (Gastos por inmueble y sustentos) |
| **HU-22** Corregir registros sin perder historial | AUD-01 | P0 | J4 (Adelantado) | **COMPLETO_VERIFICADO** (Inmunidad financiera y anulación formal) |
| **HU-23** Consultar estados y errores del proceso | AUD-02 | P1 | J3 | **COMPLETO_VERIFICADO** (Manejo centralizado de errores Fastify) |

---

## 2. Cronograma de Jornadas y Estado Real

| Jornada | Fecha | Hitos y Objetivos | Estado Real al 30 de Octubre |
| :---: | :--- | :--- | :---: |
| **J1** | Mié 28 oct | Definición de contratos, arquitectura, modelo relacional y setup del monorepo. | **COMPLETADA** |
| **J2** | Jue 29 oct | Autenticación real en PostgreSQL (Diego), entidades base de propiedades y huéspedes (André). | **COMPLETADA** |
| **J3** | Vie 30 oct | Integración André–Diego (`feat/integration-andre-diego-auth`), solape en PostgreSQL, expiración DR-03 y suites de prueba (234 backend / 140 frontend). | **COMPLETADA** |
| **J4** | Sáb 31 oct | **Enfoque P0:** Endpoint y vista de reporte de liquidación para propietarios (HU-07), fixtures sintéticos y datos de ensayo para la demo. | **EN CURSO** |
| **J5** | Dom 1 nov | Descarga exportable de reporte (HU-12), ensayo general del guion de demo y contingencias. | **PROGRAMADA** |
| **Cierre** | Lun 2 nov | **Congelación técnica al mediodía.** Ajustes cosméticos menores, validación de entorno de presentación y **Demostración oficial a las 18:30**. | **PROGRAMADA** |
