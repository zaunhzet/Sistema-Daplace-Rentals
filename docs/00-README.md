# Documentación y roadmap del MVP

**Proyecto:** Sistema Web Transaccional para la Gobernanza y Estandarización de Datos — Daplace Rentals
**Corte de planificación:** 28 de octubre de 2026, America/Lima
**Entrega objetivo:** lunes 2 de noviembre de 2026, 18:30 (America/Lima)
**Estado documental:** propuesta inicial; requiere revisión de André y Diego.
**Fuente primaria funcional:** tesis `info daplace.docx`, no localizada en el repositorio inspeccionado.

## Propósito y responsables

Este paquete ofrece una base revisable para priorizar y organizar el MVP. No acredita que el software esté implementado ni que las tecnologías, contratos o reglas propuestas hayan sido aprobadas.

- **André (`dev/andre`):** responsable propuesto del frente de interfaz, integración y coordinación de demo.
- **Diego (`dev/diego`):** responsable propuesto del frente backend, PostgreSQL e integridad transaccional.
- **Ambos:** aprobar contratos, decisiones de arquitectura y reglas pendientes; integrar diariamente mediante PR revisable.

La asignación es una propuesta para reducir conflictos, no una asignación confirmada por los desarrolladores.

## Prioridades

- **P0:** integridad de reservas, registro/confirmación de reserva, pagos y garantías trazables, y reporte reproducible mínimo. Bloquean la demostración transaccional.
- **P1:** autenticación y separación por rol, datos operativos de propiedad/huésped, auditoría y soporte operativo necesarios para usar el MVP con seguridad. Los controles de autorización que protegen datos son condición de liberación, no se omiten por calendario.
- **P2:** contrato automático completo, automatizaciones, consultas y alertas especializadas, exportación avanzada y transición automatizada desde Airbnb. Se reduce a registro manual donde sea suficiente y aprobado.

## Secuencia recomendada de lectura

1. Este índice.
2. [01-ALCANCE-MVP.md](01-ALCANCE-MVP.md): qué se propone entregar.
3. [07-REGLAS-NEGOCIO.md](07-REGLAS-NEGOCIO.md) y [05-MODELO-DATOS.md](05-MODELO-DATOS.md): invariantes.
4. [06-CONTRATOS-API.md](06-CONTRATOS-API.md) y [04-ARQUITECTURA.md](04-ARQUITECTURA.md): límites técnicos propuestos.
5. [03-BACKLOG-TECNICO.md](03-BACKLOG-TECNICO.md), [02-ROADMAP-5-DIAS.md](02-ROADMAP-5-DIAS.md), [08-PLAN-PRUEBAS.md](08-PLAN-PRUEBAS.md).
6. [09-ESTADO-PROYECTO.md](09-ESTADO-PROYECTO.md), [10-DECISIONES.md](10-DECISIONES.md), [11-GUIA-AGENTES.md](11-GUIA-AGENTES.md) y [12-DEMO-MVP.md](12-DEMO-MVP.md).

## Precedencia documental

Ante contradicción, prevalecen: (1) tesis original `info daplace.docx` para requisitos y definiciones científicas, una vez disponible; (2) decisiones de negocio/arquitectura registradas como **APROBADA** en `10-DECISIONES.md` por las personas responsables; (3) reglas aprobadas de `07-REGLAS-NEGOCIO.md`; (4) contratos aprobados de `06-CONTRATOS-API.md`; (5) alcance y backlog; (6) roadmap y demo. Un documento **PROPUESTO** no invalida una decisión aprobada. Hasta contrastar la tesis, los resúmenes de este paquete son la única entrada funcional disponible y no se atribuye texto detallado a la fuente ausente.

## Inventario y estado inicial

| Archivo | Propósito | Estado |
|---|---|---|
| `00-README.md` | Índice, lectura y precedencia | PROPUESTO |
| `01-ALCANCE-MVP.md` | P0/P1/P2, incluidos y excluidos | PROPUESTO |
| `02-ROADMAP-5-DIAS.md` | Cinco jornadas efectivas y entrega | PROPUESTO |
| `03-BACKLOG-TECNICO.md` | Tareas atómicas vinculadas a RF | PROPUESTO; HU por validar |
| `04-ARQUITECTURA.md` | Capas y estructura monorepo | PROPUESTA |
| `05-MODELO-DATOS.md` | Entidades, relaciones e invariantes | PROPUESTA |
| `06-CONTRATOS-API.md` | API REST provisional | PROPUESTA; aprobación pendiente |
| `07-REGLAS-NEGOCIO.md` | Reglas resumidas e invariantes | Pendiente de validar con tesis y negocio |
| `08-PLAN-PRUEBAS.md` | Matriz de pruebas requerida | Plan; ninguna prueba declarada ejecutada |
| `09-ESTADO-PROYECTO.md` | Tablero inicial verificable | Todas las tareas PENDIENTE |
| `10-DECISIONES.md` | Registro de decisiones y preguntas | Propuesta; sin aprobaciones supuestas |
| `11-GUIA-AGENTES.md` | Límites de colaboración | Propuesta de trabajo compartida |
| `12-DEMO-MVP.md` | Recorrido reproducible | Diseño; implementación pendiente |

## Hechos, propuestas y validaciones

**Hechos disponibles:** el repositorio contenía únicamente un README al iniciar este trabajo; los 17 RF, objetivos, indicadores y tecnologías listados en el encargo. La tesis primaria no se localizó junto al repositorio.

**Propuestas:** prioridades, historias de usuario identificadas por código provisional, reparto de tareas, arquitectura, datos y API de los documentos siguientes.

**Validación necesaria:** obtener y revisar `info daplace.docx`, identificar sus 23 HU auténticas y mapearlas a RF; André y Diego deben aprobar prioridades y contratos; confirmar moneda, roles, política de cancelación, permisos de confirmación, alcance de garantías/reportes y stack final.
