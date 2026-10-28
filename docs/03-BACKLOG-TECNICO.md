# 03 — Backlog técnico

**Estado inicial de todas las tareas: PENDIENTE.** Historias `HU-Pxx` de esta matriz son identificadores provisionales para rastrear el trabajo, no las 23 HU de la tesis. Sustituirlos por los identificadores y textos auténticos al revisar `info daplace.docx`; no asumir correspondencia uno-a-uno entre RF y HU. Rutas/módulos previstos son propuestas porque el repositorio no contiene aplicación ni stack confirmado.

## Reservas y disponibilidad

| ID | RF / historia provisional | Descripción exacta | Pri. / responsable prop. | Dep. | Módulos previstos | Contratos afectados | Implementación | Aceptación binaria | Pruebas / evidencia esperada | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| RSV-01 | RF01 / HU-P01 | Consultar disponibilidad por propiedad y fechas usando intervalo `[ingreso,salida)`. | P0 / Diego | DEC-01, DB | `backend/src/reservas`, `database` | `GET /api/propiedades/{id}/disponibilidad` | Validar fechas; consultar reservas bloqueantes; filtrar por propiedad. | Dada una reserva activa `[10,12)`, consulta `[12,13)` resulta disponible y `[11,13)` ocupada. | Límites y consecutivas; respuesta API y consulta persistida. | PENDIENTE |
| RSV-02 | RF02 / HU-P02 | Crear solicitud web con estado `SOLICITADA`. | P0 / André (UI), Diego (API) | RSV-01, identidad, propiedad/huésped | `frontend/src/features/reservas`, `backend/src/reservas` | `POST /api/reservas` | Validar entrada; persistir solicitud; devolver representación; no confirmar implícitamente. | Toda solicitud web nueva queda `SOLICITADA` y no bloquea como confirmada salvo política aprobada. | POST válido/inválido y lectura DB. | PENDIENTE |
| RSV-03 | RF03 / HU-P03 | Confirmar solicitud por actor autorizado con comprobación transaccional de solape. | P0 / Diego | RSV-02, RSV-01, auth, DEC-01 | `backend/src/reservas`, `database` | `POST /api/reservas/{id}/confirmar` | Verificar rol/propiedad; bloquear o validar serializable/constraint; cambiar estado atómicamente. | Dos confirmaciones solapadas no terminan ambas exitosas. | Prueba concurrente; logs y estado DB. | PENDIENTE |
| RSV-04 | RF03 / HU-P04 | Cambiar fechas de reserva y rechazar cambio conflictivo. | P0 / Diego | RSV-03, DEC-01 | `backend/src/reservas` | `PATCH /api/reservas/{id}` | Validar rango; ignorar la propia reserva en búsqueda; actualizar atómicamente. | Si existe otra ocupación solapada, fechas/estado anteriores permanecen. | Conflicto de cambio y comprobación de rollback. | PENDIENTE |
| RSV-05 | RF03 / HU-P05 | Cancelar reserva y liberar intervalo bajo transacción y reglas aprobadas. | P0 / Diego | DEC-02, RSV-03 | `backend/src/reservas` | `POST /api/reservas/{id}/cancelar` | Autorizar; validar transición; registrar razón; cambiar estado sin borrar datos. | Cancelada deja de bloquear consultas según regla aprobada; registro permanece. | Cancelación, repetición, historial y DB. | PENDIENTE |
| RSV-06 | RF01,03 / HU-P06 | Añadir barrera de integridad de base para impedir doble ocupación bloqueante. | P0 / Diego | DEC-01, motor PostgreSQL confirmado | `database/migrations`, `backend/src/reservas` | Confirmar/cambiar fechas | Elegir exclusion constraint de rango o estrategia transaccional/bloqueo aprobada; manejar conflicto. | Prueba concurrente en PostgreSQL permite como máximo una ocupación incompatible. | Script de concurrencia reproducible y evidencia DB. | PENDIENTE |

## Propiedades, huéspedes, identidad y auditoría

| ID | RF / historia provisional | Descripción exacta | Pri. / responsable prop. | Dep. | Módulos previstos | Contratos afectados | Implementación | Aceptación binaria | Pruebas / evidencia esperada | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| BASE-01 | RF04 / HU-P07 | Registrar y consultar datos mínimos de huésped con datos sintéticos. | P0 / André (UI), Diego (API) | DEC-03, auth | `frontend/src/features/huespedes`, `backend/src/huespedes` | `POST,GET /api/huespedes` | Definir campos mínimos con tesis; validar y persistir. | Un huésped sintético se crea y consulta; entrada inválida obtiene 400. | API, validación y DB. | PENDIENTE |
| BASE-02 | RF01,12 / HU-P08 | Registrar propiedad y vincularla a un propietario. | P0 / Diego (API), André (UI) | DEC-03, auth | `frontend/src/features/propiedades`, `backend/src/propiedades` | `POST,GET /api/propiedades` | Validar propietario; persistir; restringir lectura/escritura por rol. | Propietario solo lista propiedades asociadas; administrador autorizado ve el conjunto permitido. | Autorización cruzada y DB. | PENDIENTE |
| AUTH-01 | RF09,12,14 / HU-P09 | Autenticar usuarios y aplicar permisos en servidor por rol y alcance de propiedad. | P0 / Diego | DEC-04, DB | `backend/src/auth`, `frontend/src/features/sesion` | Todas las rutas protegidas | Seleccionar mecanismo; verificar identidad; autorizar cada objeto; no confiar en rol enviado por cliente. | Sin sesión se recibe 401; rol insuficiente 403; propietario ajeno no obtiene datos. | Matriz de roles y evidencia HTTP. | PENDIENTE |
| AUD-01 | RF09 / HU-P10 | Registrar auditoría de mutaciones financieras y de reservas. | P0 / Diego | DEC-05, auth | `backend/src/auditoria`, módulos mutantes | Reservas, pagos, garantías | Escribir actor, acción, entidad, tiempo, resultado y correlación dentro de transacción adecuada. | Cada mutación aceptada deja evento; cambios rechazados no simulan éxito. | Consulta DB vinculada a operación. | PENDIENTE |

## Pagos, garantías y reportes

| ID | RF / historia provisional | Descripción exacta | Pri. / responsable prop. | Dep. | Módulos previstos | Contratos afectados | Implementación | Aceptación binaria | Pruebas / evidencia esperada | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| FIN-01 | RF05 / HU-P11 | Registrar pago de reserva con monto exacto y estado pendiente de conciliación. | P0 / Diego (API), André (UI) | DEC-06, RSV-03, AUD-01 | `backend/src/pagos`, `database` | `POST /api/reservas/{id}/pagos` | Validar decimal/moneda; clave idempotente propuesta; persistir pendiente. | Pago inicia `PENDIENTE`; no aumenta total validado. | Repetición/idempotencia y precisión decimal; filas DB. | PENDIENTE |
| FIN-02 | RF05 / HU-P12 | Conciliar o rechazar pago con actor, fecha y motivo. | P0 / Diego | FIN-01, AUTH-01, AUD-01 | `backend/src/pagos` | `POST /api/pagos/{id}/conciliar`, `/rechazar` | Controlar transición; impedir doble aplicación; auditar. | Conciliado cuenta una vez; rechazado nunca cuenta como pagado. | Positivo, rechazo, reintento concurrente e historial. | PENDIENTE |
| FIN-03 | RF05 / HU-P13 | Calcular saldo de alquiler usando exclusivamente pagos validados. | P0 / Diego | FIN-02, DEC-06 | `backend/src/pagos`, reporte | `GET /api/reservas/{id}/saldo` | Definir monto exigible; sumar pagos conciliados con decimal; devolver desglose. | Pendientes/rechazados no reducen saldo y suma es reproducible. | Casos de suma y límite de precisión. | PENDIENTE |
| GAR-01 | RF06 / HU-P14 | Registrar garantía recibida separada de pago de alquiler. | P0 / Diego (API), André (UI) | FIN-01, DEC-07, AUD-01 | `backend/src/garantias` | `POST /api/reservas/{id}/garantia` | Persistir monto/moneda/estado por separado; no incluir en ingreso de alquiler. | Total de ingresos excluye garantía. | Conciliación de totales de reserva. | PENDIENTE |
| GAR-02 | RF06 / HU-P15 | Registrar movimientos de devolución o retención hasta saldo disponible. | P0 / Diego | GAR-01, AUD-01 | `backend/src/garantias` | `POST /api/garantias/{id}/movimientos` | Bloquear/actualizar saldo en transacción; validar monto positivo y disponible. | Movimiento mayor al saldo es rechazado sin cambios parciales. | Insuficiente, límite exacto y concurrencia. | PENDIENTE |
| REP-01 | RF08,12 / HU-P16 | Generar reporte por período, propietario y propiedad autorizada con desglose reproducible. | P0 / Diego (consulta), André (vista) | AUTH-01, FIN-02, DEC-08 | `backend/src/reportes`, `frontend/src/features/reportes` | `GET /api/reportes/propietario` | Filtrar por rango acordado; sumar solo pagos validados; separar garantía; incluir detalle/filtros. | Mismos datos producen mismos subtotales; propietario no ve ajenos. | Datos sintéticos y reproducción manual de suma. | PENDIENTE |
| REP-02 | RF12 / HU-P17 | Descargar reporte del propietario en formato simple aprobado. | P1 / André, Diego API | REP-01, decisión de formato | `backend/src/reportes`, `frontend/src/features/reportes` | `GET /api/reportes/propietario/descarga` | Reutilizar consulta autorizada; fijar tipo y nombre de archivo. | Descarga abre y coincide con consulta para el mismo filtro. | Formato y autorización. | PENDIENTE |

## Trabajos, alertas, contrato y Airbnb

| ID | RF / historia provisional | Descripción exacta | Pri. / responsable prop. | Dep. | Módulos previstos | Contratos afectados | Implementación | Aceptación binaria | Pruebas / evidencia esperada | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| OPS-01 | RF07,13 / HU-P18 | Registrar salida/check-out y crear trabajo de mantenimiento relacionado. | P1 / Diego (API), André (UI) | RF07 validado, RSV-03 | `backend/src/trabajos`, `frontend/src/features/trabajos` | `POST /api/reservas/{id}/checkout` | Validar reserva/estado; persistir check-out y trabajo asignable. | Check-out autorizado deja un único registro según idempotencia acordada. | Estado válido, repetición y DB. | PENDIENTE |
| OPS-02 | RF13,15 / HU-P19 | Asignar y consultar trabajos por responsable, estado y propiedad autorizada. | P1 / André (UI), Diego API | OPS-01, AUTH-01 | módulos de trabajos | `PATCH /api/trabajos/{id}`, `GET /api/trabajos` | Validar asignación y alcance; filtrar consulta. | Actor no autorizado no modifica ni ve trabajo ajeno. | Matriz de rol y filtros. | PENDIENTE |
| OPS-03 | RF14 / HU-P20 | Consultar autorizaciones desde fuente y catálogo definidos por negocio. | P2 / Diego API | DEC-09, fuente auténtica | `backend/src/autorizaciones` | `GET /api/autorizaciones` | Definir modelo y procedencia; exponer solo datos autorizados. | Cada resultado enlaza a una fuente/caso autorizado. | Caso de permisos y procedencia. | PENDIENTE |
| OPS-04 | RF11,16 / HU-P21 | Mostrar alertas internas de fechas reservadas y asignaciones pendientes. | P1 / André, Diego API | RSV-03, OPS-02 | `frontend/src/features/alertas`, API | `GET /api/alertas` | Definir evento, destinatario y condición; mostrar estado leído. | Usuario objetivo ve solo alertas de su alcance. | Generación y autorización. | PENDIENTE |
| OPS-05 | RF10 / HU-P22 | Generar borrador de contrato desde reserva y plantilla aprobada. | P2 / André, Diego API | DEC-10, datos reserva | `backend/src/contratos`, frontend | `POST /api/reservas/{id}/contrato` | Esperar plantilla aprobada; generar documento con versión trazable. | Documento identifica reserva y plantilla usada. | Datos fuente y generación reproducible. | PENDIENTE |
| OPS-06 | RF17 / HU-P23 | Registrar manualmente una reserva de origen Airbnb y conciliarla sin API externa. | P1 / Diego API, André UI | DEC-11, RSV-06 | reservas, canal/origen | reutiliza `POST /api/reservas` | Capturar origen y referencia opcional única cuando se defina; seguir aprobación normal. | Registro manual sigue reglas de solape y queda trazado como Airbnb. | Conflicto, duplicado y origen. | PENDIENTE |

## Trazabilidad con 17 RF y 23 HU

Los 17 RF están numerados por el encargo. `HU-P01…HU-P23` son placeholders de cobertura para que cada fila tenga un enlace manejable; **no son las 23 HU de la tesis**. Es posible que una HU cubra varios RF y un RF requiera varias HU. Con el documento original, añadir identificadores y títulos exactos de las 23 HU a cada tarea; revisar RF sin cobertura y retirar enlaces falsos. La correspondencia actual es provisional.
## Anexo — cobertura literal de requisitos

Para hacer verificable el rastreo de los RF cuyo detalle se implementa en tareas compartidas, la cobertura propuesta queda así (no es mapeo aprobado a HU de tesis):

| RF | Cobertura propuesta |
|---|---|
| RF01 | RSV-01, RSV-06 |
| RF02 | RSV-02 |
| RF03 | RSV-03, RSV-04, RSV-05 |
| RF04 | BASE-01 |
| RF05 | FIN-01, FIN-02, FIN-03 |
| RF06 | GAR-01, GAR-02 |
| RF07 | OPS-01 |
| RF08 | REP-01 |
| RF09 | AUTH-01, AUD-01 |
| RF10 | OPS-05 |
| RF11 | OPS-04 y disponibilidad RSV-01 |
| RF12 | REP-01, REP-02, BASE-02, AUTH-01 |
| RF13 | OPS-01, OPS-02 |
| RF14 | OPS-03 |
| RF15 | OPS-02 |
| RF16 | OPS-04 |
| RF17 | OPS-06 |

Confirmar y ajustar esta matriz al recuperar `info daplace.docx` y su catálogo de 23 HU.
