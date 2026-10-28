# 02 — Roadmap de cinco jornadas

**Ventana:** 28 de octubre–2 de noviembre de 2026, America/Lima. Se planifican cinco jornadas efectivas de trabajo (28 oct–1 nov); el lunes 2 es integración final, congelación y presentación, no una sexta jornada de desarrollo. La capacidad real y disponibilidad horaria de André/Diego están por confirmar.

| Jornada | Objetivo y entregables | Responsable propuesto | Dependencias / criterio de salida |
|---|---|---|---|
| Mié 28 oct — J1 | Revisar tesis original; aprobar RF↔HU, alcance, stack, estados, moneda/escala y contratos críticos. Preparar estructura documental, repositorio y esqueleto de aplicación solo tras revisión de este paquete. | André coordina alcance/frontend; Diego contratos/datos; ambos aprueban reglas. | Fuente original disponible o lista explícita de vacíos; decisiones D-01…D-08 resueltas/aceptadas como pendientes acotados; ramas y propiedad de archivos acordadas. |
| Jue 29 oct — J2 | Base persistente, migración inicial revisada, autenticación/autorización mínima, alta/consulta mínima de propiedad y huésped. | Diego: persistencia y API; André: pantallas/flujo inicial. | Modelos y permisos aprobados; aplicación arranca localmente según instrucciones verificables; no se usan datos reales. |
| Vie 30 oct — J3 | Flujo de disponibilidad, solicitud/confirmación/cancelación y prevención de concurrencia en backend/PostgreSQL; pruebas de conflicto. | Diego: transacción y pruebas de concurrencia; André: estados y manejo de respuesta. | Invariantes de reservas aprobados; prueba incompatible y consecutiva ejecutada; integración diaria sin conflictos pendientes. |
| Sáb 31 oct — J4 | Pagos pendientes/conciliados, garantías y movimientos; auditoría; pruebas de repetición, rechazo y límites. | Diego: reglas persistentes; André: formularios y presentación de estado; ambos revisan trazabilidad. | Moneda y reglas de conciliación/devolución aprobadas; saldos derivables; sin edición destructiva de historial. |
| Dom 1 nov — J5 | Reporte reproducible por propietario y recorrido integrado; ejecutar matriz crítica, corregir solo defectos de alcance y ensayar demo. | André: integración y demo; Diego: totales, autorización y consistencia; ambos verifican. | Totales reproducibles; propietario no accede a otra propiedad; lista de defectos clasificada; demo ensayada con datos sintéticos. |
| Lun 2 nov — congelación y entrega, hasta 18:30 | Congelar funcionalidad antes de la presentación (hora exacta por acordar); permitir solo correcciones críticas revisadas, verificar estado desplegable/local acordado, restaurar datos sintéticos y presentar. | Ambos; André conduce demo, Diego respalda recuperación técnica. | No se integran funciones nuevas tras congelación; checklist de demo completo; cualquier limitación se declara; entrega antes de 18:30. |

## Integración diaria

Al cierre de cada jornada: cada frente publica rama/PR pequeño, el otro revisa contratos y cambios propios de su dominio, se resuelven conflictos en una sesión breve y se actualiza `09-ESTADO-PROYECTO.md` con evidencia verificable. No integrar directamente a `main`; el flujo de merge requiere revisión humana acordada. Evitar que ambos editen simultáneamente el mismo archivo: backend/schema y frontend/pantallas son límites iniciales, sujetos a aprobación.

## Plan de contingencia

1. Si la tesis no está disponible en J1, no inventar HU ni detalles: usar RF resumidos, congelar solo decisiones reversibles, registrar los vacíos y solicitar contraste antes de ampliar alcance.
2. Si reservas concurrentes no pasan J3, detener funciones derivadas y reducir demo a un caso controlado; no presentar disponibilidad como garantizada. P0 queda bloqueado.
3. Si finanzas se retrasa, conservar pagos en estado pendiente y excluirlos de totales conciliados; no simular conciliación ni editar saldos manualmente. Garantías y pagos deben mostrarse como registros separados.
4. Si reporte se retrasa, generar una salida mínima reproducible desde datos persistidos, con totales verificables; si ni eso es posible, declarar RF08/RF12 no implementados y ajustar la demo.
5. Reducir primero P2 y luego elementos P1 no críticos. No eliminar autorización, integridad de reservas, trazabilidad financiera ni evidencia de los indicadores.
6. El 2 de noviembre se corrigen solamente fallas que impidan la demo o comprometan datos; cualquier cambio posterior al corte funcional queda registrado y revisado.

Las fechas y reparto son propuesta de planificación, no compromiso confirmado de los desarrolladores.
