# 01 — Alcance del MVP

**Estado: propuesta, no aprobación ni evidencia de implementación.** Las prioridades se conservan respecto al paquete anterior; la nueva lista de HU añade ámbitos no representados, cuya prioridad se deja explícita para revisión. Tener un mockup no demuestra funcionalidad implementada. Los títulos HU provienen de la lista atribuida al Anexo 8; criterios y detalle requieren contraste con su texto íntegro.

## P0 — Núcleo transaccional y controles de seguridad

| Capacidad | Requisito / HU auténtica | Qué se demostraría | Fuera de P0 | Dependencias |
|---|---|---|---|---|
| Disponibilidad y ocupación | RF01, RF03 / HU-01, HU-03 | Consulta de propiedad/fechas; prevención backend/PostgreSQL contra solape; consecutivas admitidas. | Sincronización multicanal. | PostgreSQL; estados bloqueantes aprobados. |
| Solicitud y gestión de reservas | RF02, RF03 / HU-02, HU-03 | Solicitud en `SOLICITADA`; confirmación y cambio/cancelación autorizados con revalidación transaccional. | Flujos de aprobación adicionales. | Identidad, propiedad, huésped, política aprobada. |
| Huéspedes / propiedad | RF04 y prerrequisito / HU-04, HU-18 | Registrar/consultar huésped y mantener propiedad-propietario en flujo mínimo. | CRM y verificación externa. | Campos y cardinalidad aprobados. |
| Permisos y cuentas | RF09 / HU-08; HU-19 parcialmente | Inicio de sesión y permisos mínimos en servidor; cuentas internas solo si necesarias para control. | Administración avanzada de usuarios. | Roles, identidad y política de desactivación. |
| Pagos de alquiler | RF05 / HU-05 | Pago pendiente, conciliación explícita y saldo reproducible con decimal exacto. | Pasarela/cobro automático. | Moneda/escala; identidad y auditoría. |
| Garantía | RF06 / HU-06 | Registro separado y movimiento limitado al saldo disponible. | Custodia bancaria o política no definida. | Reglas/cardinalidad aprobadas. |
| Reporte por propiedad/período | RF08 / HU-07 | Totales reproducibles y detalle de fuente para propiedad autorizada. | Analítica avanzada. | Pagos conciliados; período/fórmulas. |
| Trazabilidad crítica | RF09 / HU-20, HU-22 parcialmente | Rastro de mutaciones y corrección financiera sin borrar historial. | Consulta operacional avanzada de eventos. | Política de auditoría/correcciones. |

## P1 — Operación complementaria

| Capacidad | RF / HU | Qué se demostraría | Fuera de P1 | Dependencias |
|---|---|---|---|---|
| Descargar reporte propio | RF12 / HU-12 | Archivo propio generado desde REP-01 con permisos. | Múltiples formatos/configuración. | REP-01 y formato aprobado. |
| Airbnb manual | RF17 / HU-09 | Registrar origen Airbnb manualmente bajo controles de reservas. | Sincronización/API automática. | Reglas de origen/dedupe. |
| Salida y mantenimiento | RF07 / HU-10 | Registrar salida y necesidad de mantenimiento. | Gestión de mantenimiento avanzada. | Estados y relación por validar. |
| Alertas internas | RF11, RF16 / HU-11, HU-17 | Aviso en app por nueva reserva y asignación. | Email/SMS/push garantizados. | Evento y destinatario acordados. |
| Trabajos | RF13, RF15 / HU-14, HU-16 | Asignar, consultar y actualizar trabajos dentro de permisos. | Planificador complejo. | Roles/estados aprobados. |
| Cuentas internas extendidas | RF09 transversal / HU-19 | Crear/desactivar cuentas por actor autorizado, si no entra en mínimo P0. | SSO/provisión externa. | Política de administración. |
| Trazabilidad consultable | RF09 / HU-20 | Consulta filtrada de eventos operativos. | SIEM. | Auditoría básica, redacción y roles. |
| Gastos | No identificado en RF resumidos / HU-21 | Registrar gasto asociado a propiedad y mostrar separado hasta fórmula aprobada. | Contabilidad completa. | Clasificación y reportes. |
| Estados/errores | Transversal / HU-23 | Consultar estado/error operativo sin exponer secretos. | Observabilidad externa. | Catálogo, retención y permisos. |

## P2 — Incrementos con decisión/fuente pendiente

| Capacidad | RF / HU | Fuera del MVP inicial | Dependencias |
|---|---|---|---|
| Contrato generado | RF10 / HU-13 | No asumir validez, firma ni cláusulas. | Plantilla aprobada y definición de salida. |
| Autorizaciones de ingreso | RF14 / HU-15 | No inventar fuente ni modelo. | Fuente auténtica y permisos definidos. |
| Automatizaciones de canales/reportes | RF11, RF12, RF17 | Sin servicio externo/SLA asumido. | P1 y decisión explícita. |

## Reglas de corte

Ningún P0 depende silenciosamente de P2. Registro Airbnb manual reutiliza reservas y no depende de integración P2. Reporte P0 no depende de descarga P1. Autenticación y autorización backend son puerta de liberación para los flujos P0. El estado de cada HU/tarea permanece PENDIENTE hasta implementación y evidencia. Las prioridades de HU-18 a HU-23 son propuesta; validar el contenido original antes de aceptar el corte.
