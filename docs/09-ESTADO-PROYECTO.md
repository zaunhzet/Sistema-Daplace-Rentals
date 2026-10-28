# 09 — Estado del proyecto

Tablero creado como línea base documental el 28 de octubre de 2026. El repositorio inicial no contenía implementación ni herramientas de test; no se marca ningún trabajo de software como realizado o probado. Una fila cambia de estado solo con evidencia verificable.

Estados permitidos: `PENDIENTE`, `EN_PROGRESO`, `BLOQUEADO`, `EN_REVISION`, `VERIFICADO`.

| Tarea | Prioridad | Responsable propuesto | Estado | Rama | PR | Última evidencia | Siguiente acción | Bloqueos |
|---|---|---|---|---|---|---|---|---|
| Revisar tesis y mapear 17 RF ↔ 23 HU reales | P0 | André + Diego | PENDIENTE | — | — | No localizada en repo | Conseguir `info daplace.docx` y revisar | Fuente primaria ausente |
| Aprobar alcance, stack, roles, moneda y reglas | P0 | André + Diego | PENDIENTE | — | — | Propuesta en `10-DECISIONES.md` | Revisión conjunta | Decisiones abiertas |
| Confirmar propiedad/huésped e identidad | P0 | Diego API + André UI | PENDIENTE | — | — | No hay aplicación | Acordar modelos y permisos | Tesis y stack |
| Implementar disponibilidad y concurrencia | P0 | Diego | PENDIENTE | — | — | Sin evidencia | Elegir control PostgreSQL y prueba | Estados bloqueantes |
| Solicitar/confirmar/cancelar reserva | P0 | Diego API + André UI | PENDIENTE | — | — | Sin evidencia | Aprobar transiciones y comenzar tras base | RSV-06 |
| Registrar/conciliar pagos y saldo | P0 | Diego API + André UI | PENDIENTE | — | — | Sin evidencia | Aprobar moneda, idempotencia y transiciones | DEC-06 |
| Garantía y movimientos | P0 | Diego API + André UI | PENDIENTE | — | — | Sin evidencia | Aprobar cardinalidad y reglas | DEC-07 |
| Reporte reproducible autorizado | P0 | Diego consulta + André UI | PENDIENTE | — | — | Sin evidencia | Definir periodo y reproducción | Pagos y ownership |
| Auditoría de mutaciones | P0 | Diego | PENDIENTE | — | — | Sin evidencia | Definir contenido y retención | DEC-05 |
| Check-out, asignaciones, consultas | P1 | André + Diego | PENDIENTE | — | — | Sin evidencia | Validar RF07/13/15 y secuencia | Estados de trabajos |
| Descarga, alertas internas | P1 | André + Diego | PENDIENTE | — | — | Sin evidencia | Definir formato/eventos | Reporte/trabajos |
| Contrato automático | P2 | André + Diego | PENDIENTE | — | — | Sin evidencia | Esperar plantilla revisada | Aprobación negocio/legal |
| Airbnb manual/automatizado | P1 manual / P2 integración | André + Diego | PENDIENTE | — | — | Sin evidencia | Definir metadatos de canal | Sin API asumida |
| Pruebas P0 y ensayo de demo | P0 | André + Diego | PENDIENTE | — | — | No hay comandos configurados | Identificar scripts cuando existan | Implementación pendiente |

Al mover a `VERIFICADO`, llenar responsable ejecutor, rama y commit, PR si existe, fecha/zona, comando real o comprobación, artefacto/evidencia y siguiente acción. `EN_REVISION` no significa aprobado. No inventar números de PR ni enlaces.
