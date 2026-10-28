# 08 — Plan de pruebas

**Plan, no evidencia de ejecución.** No hay aplicación ni herramientas de prueba configuradas en el repositorio inspeccionado. No se prescriben comandos hasta que existan manifiestos, motor y scripts confirmados. Tras implementación, registrar comando real, versión/entorno, datos sintéticos, resultado y artefacto en `09-ESTADO-PROYECTO.md`.

## Matriz prioritaria

| ID | Área / tipo | Preparación y acción | Resultado esperado binario | Prioridad / evidencia |
|---|---|---|---|---|
| T-01 | Reserva / concurrencia | Dos sesiones solicitan confirmar solapamientos incompatibles de la misma propiedad simultáneamente. | Exactamente una queda confirmada/bloqueante; otra recibe conflicto y no deja escritura parcial. | P0; resultados HTTP y filas DB/constraint. |
| T-02 | Reserva / límite positivo | Confirmar `[10,12)` y luego `[12,14)`. | Ambas aceptadas. | P0; respuestas y DB. |
| T-03 | Reserva / negativo | Solicitar `[11,13)` sobre `[10,12)`. | Rechazo por conflicto al confirmar; consulta indicativa no basta. | P0; 409 y DB sin segunda confirmación. |
| T-04 | Reserva / negativo | Cambiar fechas de una reserva para solapar con otra. | Conflicto; fechas/estado originales intactos. | P0; respuesta y snapshot DB. |
| T-05 | Reserva / estado | Cancelar reserva y buscar intervalo de nuevo. | Estado persistente cancelado y liberación conforme regla aprobada; auditoría presente. | P0; HTTP, reserva y auditoría. |
| T-06 | Pago / repetición | Enviar dos veces la misma clave y contenido; luego misma clave con contenido distinto. | No se duplica importe; segunda variante conflictiva. | P0; respuesta y una sola operación fuente. |
| T-07 | Pago / rechazo | Registrar, rechazar y consultar saldo/reporte. | Pago no reduce saldo ni suma ingreso validado. | P0; desglose reproducible. |
| T-08 | Pago / conciliación | Registrar pago pendiente, conciliar dos veces/reintentar concurrente. | Cuenta como validado una vez; transición y auditoría coherentes. | P0; filas, total y actor. |
| T-09 | Garantía / límite negativo | Con saldo 50 intentar devolución 51. | Rechazo sin movimiento parcial ni saldo negativo. | P0; error y libro sin cambio. |
| T-10 | Garantía / concurrencia | Dos devoluciones concurrentes que suman más que el disponible. | Como máximo se aprueban hasta el saldo; nunca sobregiro. | P0; movimientos y saldo. |
| T-11 | Reporte / reproducción | Crear conjunto pequeño de pagos conciliados, pendientes, rechazados y garantías. | Total alquiler = suma manual de conciliados incluidos; pendientes/rechazados/garantías se excluyen o separan. | P0; cálculo esperado, consulta y respuesta. |
| T-12 | Autorización | Propietario A consulta reporte o reserva de propiedad de B manipulando ID/filtro. | 403 o 404 sin filtrar datos de B. | P0; request/response y evidencia de alcance. |
| T-13 | Autenticación | Llamar ruta privada sin sesión y con sesión inválida. | 401 en ambos casos. | P0; HTTP. |
| T-14 | Validación | Fechas iguales/invertidas, importe negativo, formato inválido y campo desconocido según esquema. | 400/422 acordado; ninguna escritura. | P0; respuestas y DB. |
| T-15 | Red/reintento | Interrumpir respuesta después de enviar mutación y repetir con la misma clave idempotente. | Una sola mutación; cliente puede recuperar resultado o conflicto definido. | P0; correlación y DB. |
| T-16 | Red/error | Servicio/base no disponible durante operación crítica. | Error controlado; no se presenta éxito ni estado parcial. | P0; log redactado y comprobación DB. |
| T-17 | Reporte / autorización | Propietario válido solicita rango y luego cambia propietarioId. | Primer reporte solo cubre propiedades propias; alteración no amplía el conjunto. | P0; filtros y detalle. |
| T-18 | Airbnb/manual | Registrar origen Airbnb manual en rango libre y rango ocupado; repetir referencia. | Libre sigue flujo de confirmación; ocupado entra en conflicto; duplicado se gestiona según idempotencia aprobada. | P1; origen y auditoría. |

## Categorías adicionales

- **Positivos:** alta/consulta de propiedad y huésped; reserva solicitada/confirmada; pago conciliado; garantía con devolución exacta; reporte vacío y con movimientos.
- **Negativos:** IDs inexistentes, transición inválida, propietario ajeno, datos ausentes, fechas inválidas, errores del motor.
- **Límites:** ingreso/salida adyacentes, monto máximo/escala acordados, saldo cero, rango temporal inclusivo/exclusivo, páginas vacías si aplica.
- **Autorización:** cada verbo y objeto por ADMIN/OPERADOR/PROPIETARIO; verificar ownership en servidor.
- **Reintentos:** claves repetidas con mismo/distinto contenido y timeout luego de commit.
- **Concurrencia:** reservas, pagos y devoluciones contra PostgreSQL real del perfil de prueba.
- **Recuperación:** se cae la interfaz o red; consultar estado del servidor sin crear duplicados.

## Evidencia mínima de cierre

Por caso: ID, commit probado, comando realmente configurado, versión de runtime/base, fixture sintético, resultado observado, salida/registro o captura, fecha/hora con zona y responsable. Solo marcar PASS después de ejecutar. Un test unitario no certifica por sí mismo concurrencia PostgreSQL, autorización de todos los endpoints ni despliegue.
