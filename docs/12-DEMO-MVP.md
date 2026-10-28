# 12 — Demo MVP reproducible

**Estado: diseño, no ejecución.** El repositorio inspeccionado no contiene aplicación, usuarios de demostración, base ni comandos; cada paso depende de funcionalidades pendientes. Usar exclusivamente datos ficticios y ambiente local/no productivo confirmado. No presentar capturas o formularios estáticos como funcionalidad.

## Precondiciones

- Stack, scripts, entorno y migraciones aprobados y configurados; identificar host/base como local de demo antes de mutar datos.
- Usuario administrador y propietario sintéticos cargados por proceso seguro; nunca contraseña compartida en documentación.
- Propiedad ficticia “Casa Muestra” vinculada a “Propietario Demo”; un período libre definido durante ensayo y revisado.
- Huésped “Huésped Demo”; contacto de dominio reservado `.invalid` si se requiere.
- Montos y moneda acordados por DEC-06/07; valores solo de demostración, no tarifas reales.
- Reloj/periodo visible y zona horaria acordados; dejar disponible plan de restauración de fixtures sintéticos.

## Recorrido

| Paso | Acción | RF / tarea | Dependencia | Resultado esperado |
|---|---|---|---|---|
| 1 | Iniciar sesión como administrador demo. | RF09 / AUTH-01 | Autenticación y usuario sintético | Sesión reconocida; rutas privadas protegidas. Pendiente. |
| 2 | Registrar propiedad ficticia y asociar propietario demo. | RF01 / BASE-02 | Modelo, permisos | Propiedad persistida y visible en ámbito autorizado. Pendiente. |
| 3 | Consultar disponibilidad para intervalo libre `[ingreso,salida)`. | RF01 / RSV-01, RSV-06 | Regla de fechas | Respuesta disponible calculada por backend. Pendiente. |
| 4 | Registrar huésped demo y solicitar reserva. | RF02,04 / BASE-01, RSV-02 | Campos aprobados | Reserva persistida como `SOLICITADA`. Pendiente. |
| 5 | Confirmar reserva; opcional intentar segunda incompatible para mostrar rechazo. | RF03 / RSV-03, RSV-06 | Autorización y concurrencia | Una confirmación; solape produce conflicto verificable. Pendiente. |
| 6 | Registrar adelanto y mostrar estado pendiente; conciliar como actor autorizado. | RF05 / FIN-01, FIN-02 | Monto y criterio de conciliación | Pendiente no reduce saldo; conciliado sí lo reduce una vez. Pendiente. |
| 7 | Registrar garantía separada y movimiento de devolución/retención ≤ saldo. | RF06 / GAR-01, GAR-02 | Política de garantía | Total de alquiler no incluye garantía; movimiento queda trazado. Pendiente. |
| 8 | Generar reporte del propietario para período, abrir detalle y reproducir suma. | RF08,12 / REP-01 | Reporte y ownership | Totales coherentes con pagos conciliados; propietario no ve otra propiedad. Pendiente. |

## Recuperación si falla

1. Registrar qué paso falló, hora/zona, ID de tarea/commit y mensaje sin datos sensibles; detener escrituras repetidas.
2. Consultar estado persistido por interfaz/API autorizada antes de reintentar; usar clave idempotente si está aprobada.
3. Restaurar únicamente fixtures sintéticos mediante el procedimiento local aprobado; no limpiar/restaurar una base sin identificarla y sin instrucción autorizada.
4. Si autenticación o integridad crítica falla, detener la demo transaccional. Mostrar flujo previamente grabado solo si se identifica como grabación y no como sistema en vivo.
5. Si una etapa posterior falla, explicar dependencia y resultado realmente verificado; no simular aceptación ni editar montos manualmente.
6. Mantener ruta alternativa con recorrido acotado de disponibilidad/reserva sintética solo si esa función pasó sus pruebas; informar lo omitido.

## Checklist previo

- [ ] ambiente identificado como demo local/no productivo
- [ ] datos 100% sintéticos y reiniciables
- [ ] sesión/roles probados
- [ ] reserva concurrente y secuencial comprobadas en PostgreSQL
- [ ] pago pendiente y conciliado reproducibles
- [ ] garantía separada y límite negativo comprobados
- [ ] reporte coincide con suma manual y aplica permisos
- [ ] recuperación practicada; capturas/logs no contienen secretos
- [ ] cada paso marcado `VERIFICADO` solo con evidencia en `09-ESTADO-PROYECTO.md`
