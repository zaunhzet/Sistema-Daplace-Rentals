# Estado del proyecto

Línea base documental; todas las tareas de producto permanecen **PENDIENTE**. Los títulos HU auténticos entregados permiten rastreo semántico preliminar, pero el texto y criterios del Anexo 8 (pp. 69–91) no fueron inspeccionados. No se declaran avances ni pruebas ejecutadas.

Estados permitidos: `PENDIENTE`, `EN_PROGRESO`, `BLOQUEADO`, `EN_REVISION`, `VERIFICADO`.

| Tarea | HU relacionada | Prioridad | Responsable prop. | Estado | Rama | PR | Última evidencia | Siguiente acción | Bloqueos |
|---|---|---|---|---|---|---|---|---|---|
| Revisar criterios y relaciones del Anexo 8; validar 17 RF ↔ 23 HU | HU-01…HU-23 | P0 | André + Diego | PENDIENTE | — | — | Títulos suministrados; tesis íntegra no inspeccionada | Contrastar pp. 69–91 y ajustar criterios/mapeo | Texto original pendiente |
| Aprobar alcance, stack, roles, moneda y reglas | HU-01…HU-23 según dominio | P0 | André + Diego | PENDIENTE | — | — | Propuestas en `10-DECISIONES.md` | Resolver/aprobar decisiones | Reglas abiertas |
| Propiedad y huéspedes | HU-04, HU-18 | P0 | Diego API + André UI | PENDIENTE | — | — | Sin aplicación | Aprobar campos y relación | Tesis/stack |
| Identidad y permisos mínimos | HU-08; parte de HU-19 | P0 | Diego | PENDIENTE | — | — | Sin aplicación | Elegir mecanismo y roles | DEC-04 |
| Disponibilidad, solicitud y gestión | HU-01, HU-02, HU-03 | P0 | Diego API + André UI | PENDIENTE | — | — | Sin aplicación | Aprobar estados y mecanismo PostgreSQL | DEC-01/02 |
| Pagos de alquiler y saldo | HU-05 | P0 | Diego API + André UI | PENDIENTE | — | — | Sin aplicación | Aprobar moneda/conciliación/idempotencia | DEC-06 |
| Garantía y movimientos | HU-06 | P0 | Diego API + André UI | PENDIENTE | — | — | Sin aplicación | Aprobar cardinalidad y límites | DEC-07 |
| Reporte por propiedad/período | HU-07 | P0 | Diego consulta + André UI | PENDIENTE | — | — | Sin aplicación | Acordar periodo/fórmulas | DEC-08 |
| Descarga de reporte propio | HU-12 | P1 | André + Diego | PENDIENTE | — | — | Sin aplicación | Definir formato y autorización | REP-01 |
| Salida y mantenimiento | HU-10 | P1 | André + Diego | PENDIENTE | — | — | Sin aplicación | Validar estados y flujo | Tesis |
| Alertas de reserva/asignación | HU-11, HU-17 | P1 | André + Diego | PENDIENTE | — | — | Sin aplicación | Definir evento, destinatario y canal | Tesis |
| Asignación/consulta de trabajos | HU-14, HU-16 | P1 | André + Diego | PENDIENTE | — | — | Sin aplicación | Definir permisos/transiciones | Tesis |
| Autorizaciones de ingreso | HU-15 | P2 | Diego | PENDIENTE | — | — | Fuente no identificada | Identificar fuente auténtica | DEC-09 |
| Contrato | HU-13 | P2 | André + Diego | PENDIENTE | — | — | Plantilla no identificada | Aprobar plantilla | DEC-10 |
| Reserva de Airbnb manual | HU-09 | P1 | André + Diego | PENDIENTE | — | — | Sin aplicación | Definir datos de canal | DEC-11 |
| Cuentas internas | [HU-19](03-HU-19.md) | P1 (controles de acceso P0) | Diego + André | PENDIENTE | — | — | Sin aplicación | Definir quién administra altas/bajas | Tesis/roles |
| Trazabilidad operativa/correcciones | HU-20, HU-22 | P1 (rastro financiero crítico P0) | Diego + André | PENDIENTE | — | — | Sin aplicación | Definir eventos/corrección | DEC-05 |
| Gastos por propiedad | HU-21 | P1 | Diego API + André UI | PENDIENTE | — | — | Sin aplicación | Definir tratamiento en reporte | DEC-06/08 |
| Estados y errores de proceso | HU-23 | P1 | Diego API + André UI | PENDIENTE | — | — | Sin aplicación | Definir detalle visible y redacción | DEC-05 |
| Pruebas críticas y demo | HU-01…HU-08, HU-12 | P0 | André + Diego | PENDIENTE | — | — | Sin comandos configurados | Identificar scripts tras crear aplicación | Implementación pendiente |

Al marcar una fila `VERIFICADO`, registrar ejecutor, rama/commit, PR si existe, fecha/zona, comando real y evidencia. El estado de backlog de cada tarea inicia y se mantiene PENDIENTE hasta ejecutar trabajo.
