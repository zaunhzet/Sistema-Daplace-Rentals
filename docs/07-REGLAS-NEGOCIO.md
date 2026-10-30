# 07 — Reglas de negocio propuestas

**Base disponible:** reglas explícitamente resumidas en el encargo. Texto detallado, excepciones y definiciones deben contrastarse con `info daplace.docx` y negocio. Aplicar la precedencia de `00-README.md`.

## Reservas y disponibilidad

1. La estancia es el intervalo semiabierto `[ingreso, salida)`. Requerir `salida > ingreso`; reservas `[10,12)` y `[12,14)` son consecutivas y no se solapan.
2. Dos solicitudes incompatibles no pueden ocupar simultáneamente el mismo inmueble. La definición de estados que bloquean inventario, incluido si una `SOLICITADA` mantiene cupo, está pendiente de aprobación. La tesis indica que solicitudes web nuevas empiezan `SOLICITADA` y requieren confirmación.
3. Una solicitud no equivale a confirmación. Solo actor autorizado puede confirmar. La disponibilidad se vuelve a comprobar durante la transacción que confirma; resultado de consulta previa no reserva inventario.
4. Cambios de fecha revalidan en servidor/base de datos, excluyendo la reserva actual. En conflicto, operación atómica falla y el registro previo permanece.
5. Cancelar cambia estado y libera intervalo según política vigente aprobada; no borra reserva ni auditoría. Elegibilidad, penalidad y efecto financiero están pendientes.
6. Airbnb se incorpora inicialmente por registro o conciliación manual. No se asume integración/sincronización automática. Sus fechas también pasan por controles de conflicto.

## Pagos y saldo

1. Un pago nuevo inicia `PENDIENTE_CONCILIACION` (nombre de estado propuesto). Pagos pendientes/rechazados no cuentan como pagos validados ni reducen saldo.
2. La conciliación es una transición explícita, autorizada, idempotente y auditable. Repetir una misma operación no duplica el importe.
3. Monto y moneda se almacenan con representación exacta decimal. Moneda, escala y redondeo están pendientes; no hacer operaciones financieras con floats binarios.
4. Ingreso validado de alquiler se calcula solo con pagos conciliados asociados a reserva, aplicando reglas aprobadas para reversiones/correcciones. No reescribir transacciones históricas.
5. Pago repetido con misma clave idempotente devuelve el resultado previo si el contenido coincide; misma clave con contenido distinto genera conflicto. Política/alcance de clave pendiente.

## Garantías

1. Fondos de garantía se contabilizan separados de ingresos por alquiler.
2. Recepción y movimientos de devolución/retención quedan individualizados y auditados. Saldo se deriva de movimientos; no editar un saldo como fuente autónoma.
3. Reembolso no puede exceder saldo disponible; concurrencia se resuelve transaccionalmente en backend/PostgreSQL.
4. Motivos, estados, plazos, deducciones y documentos asociados deben ser aprobados por negocio; no asumir reglas legales o empresariales.

## Reportes

1. Propietario solo consulta propiedades/datos bajo su autorización. El control se aplica a cada recurso/filtro en servidor; un `propietarioId` manipulado no amplía acceso.
2. Los totales de pagos usan pagos conciliados según periodo y definición temporal aprobados; garantías aparecen separadas. Cancelaciones, ingresos por fecha de estancia vs fecha de pago y zona horaria requieren definición explícita.
3. Reporte debe exponer período, moneda, criterios y desglose suficientes para reproducir total. Exportación no elude autorización.
4. No inferir criterios de KPI de tesis. Definir medición antes de afirmar reducción de incidencias, errores de conciliación o tiempo de reporte.

## Auditoría y autorización

- Cambios relevantes en reserva, pago, garantía, asignación y acceso administrativo dejan actor, instante, acción, entidad y resultado.
- Propietarios solo acceden a sus propiedades. Roles internos y capacidades exactas aún por confirmar.
- No guardar credenciales en logs ni confiar en controles de visibilidad de frontend.

## Estados de referencia (propuestos)

| Dominio | Estados/transiciones candidatas | Pendiente |
|---|---|---|
| Reserva | `SOLICITADA → CONFIRMADA → COMPLETADA`; `SOLICITADA/CONFIRMADA → CANCELADA`; rechazada puede añadirse | Estados auténticos, quién cambia, bloqueos y reglas de cancelación |
| Pago | `PENDIENTE_CONCILIACION → CONCILIADO` o `RECHAZADO` | reversa/corrección, actor, referencias |
| Garantía | registro y movimientos; no necesariamente estado único | estados, múltiples garantías, retenciones parciales |
| Trabajo | `PENDIENTE → EN_PROGRESO → COMPLETADO` | transiciones, asignación, reapertura |

Los nombres y diagramas no se tratan como estados de tesis confirmados.

## Controles transaccionales obligatorios

- Prevención de solape debe residir en backend y PostgreSQL: constraint de exclusión de rango filtrada a estados bloqueantes, o estrategia transaccional demostrablemente equivalente sobre PostgreSQL. La interfaz solo anticipa el resultado.
- Confirmación/cambio de fecha: revalidar e insertar/actualizar atómicamente; conflicto devuelve 409 y no deja escritura parcial.
- Conciliar pago: estado, idempotencia, importe y auditoría se aplican atómicamente.
- Devolución garantía: bloquear/serializar lectura de saldo y movimiento para impedir sobregiro por solicitudes concurrentes.
- Pruebas de concurrencia ejecutan contra el motor objetivo, no solo mocks.
