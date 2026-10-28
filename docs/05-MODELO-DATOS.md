# 05 — Modelo de datos propuesto

**Estado: PROPUESTA, pendiente de contraste con el diccionario de la tesis, moneda, roles y cardinalidades.** Los nombres/campos son conceptuales, no migración ni contrato aprobado.

## Entidades

| Entidad | Campos conceptuales | Relaciones |
|---|---|---|
| `Usuario` | id, nombre, email normalizado, hash de credencial externo/local según decisión, rol, activo, creadoEn | puede ser propietario, administrador, operador o responsable de trabajo; actor de auditoría |
| `Propiedad` | id, propietarioId, nombre/código, dirección operativa mínima, activa | pertenece a un propietario; tiene reservas y trabajos |
| `Huesped` | id, nombre, contacto mínimo requerido, creadoEn | puede estar asociado a varias reservas según política |
| `Reserva` | id, propiedadId, huespedId, ingreso, salida, estado, origen, referenciaCanal opcional, montoAcordado decimal/moneda por definir, creadaPor, timestamps | una propiedad, huésped, pagos, garantía, trabajos, auditoría |
| `Pago` | id, reservaId, importe decimal exacto, moneda, concepto, estado conciliación, referencia/idempotencia, registradoPor, conciliadoPor, fechas | pertenece a reserva; cada transición queda auditada |
| `Garantia` | id, reservaId, importeRecibido decimal, moneda, estado | saldo se deriva de movimientos; separada de ingresos |
| `MovimientoGarantia` | id, garantiaId, tipo RECEPCION/DEVOLUCION/RETENCION/REVERSA (nombres sujetos a aprobación), importe, motivo, actor, instante | libro de movimientos; no sobrescribir movimiento histórico |
| `Auditoria` | id, actorId, acción, entidad, entidadId, instante, resultado, motivo/cambios permitidos, requestId | actor y referencia lógica; evitar guardar secretos o PII superflua |
| `ReportePropietario` | preferentemente resultado derivado; si se persiste, id, propietarioId, filtros, generadoPor, generadoEn, versión/huella | no es fuente de verdad financiera; reproduce consulta de registros base |
| `Trabajo` | id, propiedadId, reservaId opcional, descripción, estado, asignadoA, fechas | creado desde check-out o manual según regla |
| `Autorizacion` | id, propiedadId o reservaId, tipo, estado, referenciaFuente, fechas | entidad posterior, solo tras definir significado y procedencia |
| `Alerta` | id, usuarioId, tipo, entidadId, creadaEn, leidaEn | incremento posterior; no sustituye regla de dominio |
| `Contrato` | id, reservaId, plantillaVersion, estado, ubicación/hash de documento, generadoEn | incremento posterior, sujeto a plantilla aprobada |

`ReportePropietario` puede no necesitar tabla: se propone cálculo bajo demanda para evitar snapshots financieros divergentes. Si se guardan artefactos, conservar filtros y versión de fuente y dejar claro que no son libro contable.

## Tipos y precisión

- Identificadores: UUID o identidad generada, elección por decidir.
- Fechas de estancia: `DATE` local de Pachacámac/Lima; intervalo `[ingreso,salida)`, salida posterior a ingreso. Instantes de auditoría: `TIMESTAMPTZ` con política UTC de almacenamiento y presentación Lima por definir.
- Dinero: `NUMERIC(p,s)` exacto para importe/saldo, con precisión/escala acordadas según moneda; nunca `float`, `real`, `double precision` ni JS `number` sin estrategia decimal segura.
- Moneda: código de moneda explícito; no inferir PEN ni escala por ubicación.
- Estados: enum o texto con restricción/check y transiciones validadas en backend.

## Restricciones, índices y claves

1. `Usuario.emailNormalizado` único si email es identificador aprobado.
2. `Propiedad.propietarioId` FK a Usuario; índice por `propietarioId`.
3. `Reserva.propiedadId`, `huespedId` FKs; `ingreso < salida`; índices `(propiedadId, ingreso, salida)` y `(huespedId)` según consultas.
4. Solape: constraint PostgreSQL `EXCLUDE USING gist (propiedadId WITH =, daterange(ingreso,salida,'[)') WITH &&)` con predicado solo para estados que bloquean, si el motor/ORM y esquema lo soportan; habilitar extensión requerida mediante migración explícita. Alternativa: transacción y bloqueo por propiedad con prueba concurrente equivalente. Elección pendiente; no depender solo del índice B-tree o frontend.
5. `Pago.reservaId` FK; `importe > 0`; clave idempotente única con alcance definido; índices por reserva/estado/fecha.
6. `Garantia.reservaId` único si el negocio define una garantía por reserva; de lo contrario documentar cardinalidad. `MovimientoGarantia.garantiaId` FK; importe positivo; índice por garantía/fecha.
7. Auditoría: índices `(entidad, entidadId, instante)` y `(actorId, instante)`; no permitir actualización/borrado desde operaciones normales.
8. Trabajos/autorizaciones/alertas con FKs e índices por responsable/estado/propiedad según filtros aprobados.
9. Borrado físico restringido en registros financieros e históricos; correcciones vía eventos/movimientos compensatorios aprobados, nunca reescritura silenciosa.

## Reglas transaccionales

- Confirmación/cambio de fechas y registro de solape se resuelven atómicamente en backend/PostgreSQL.
- Conciliación del pago valida transición, autor y no aplicación duplicada en una transacción.
- Devolución/retenido valida saldo de garantía disponible bajo bloqueo o mecanismo equivalente; no puede quedar negativo.
- Auditoría crítica se confirma junto con operación para no registrar éxito sin cambio ni cambio sin rastro, sujeto a política de fallas.
- La eliminación de huésped/usuario debe respetar obligaciones de trazabilidad y privacidad; política pendiente.

## Preguntas para contrastar

Campos exactos del diccionario, PII requerida, modelo de propietarios, moneda y escala, reprogramación/cancelación, múltiples pagos/garantías, zona/horarios, reglas de retención, auditoría, contratos y fuente de autorizaciones se resuelven tras leer la tesis y con aprobación humana.
