# 06 — Contratos API propuestos

**Todos los contratos de este archivo están PROPUESTOS.** No implementar como acuerdo hasta aprobación expresa de André y Diego y contraste con `info daplace.docx`. Esquema JSON ilustrativo; campos definitivos, moneda, autenticación y códigos exactos quedan pendientes. Base local `/api`; JSON salvo descargas.

## Convenciones provisionales

- Sesión/cookie segura o Bearer según DEC-04; marcador `Auth` indica autenticación requerida, no mecanismo aprobado.
- `ADMIN`: administrador; `OPERADOR`: operación; `PROPIETARIO`: solo recursos asociados. Permisos siempre comprobados en servidor y propiedad.
- Fechas de estancia `YYYY-MM-DD`; instantes ISO-8601 con zona. Montos como strings decimales (`"125.00"`) y moneda explícita, para evitar floats binarios.
- Errores comunes: `{"error":{"code":"VALIDATION_ERROR","message":"Entrada inválida","details":[{"field":"salida","code":"MUST_BE_AFTER_ARRIVAL"}],"requestId":"..."}}`.
- Códigos previstos: 200 lectura/cambio exitoso; 201 creación; 204 cuando no hay cuerpo; 400 validación; 401 sin autenticar; 403 permiso insuficiente; 404 no encontrado; 409 solape/estado/idempotencia; 422 regla de dominio no satisfacible si se aprueba; 500 error inesperado. `details` no incluye secretos ni PII innecesaria.

## Contratos

| Método y ruta | Auth/roles propuestos | Entrada | Salida exitosa | Códigos relevantes |
|---|---|---|---|---|
| `GET /api/propiedades` | Auth; ADMIN/OPERADOR alcance aprobado, PROPIETARIO propias | `?desde=&hasta=` opcional | `200 {"items":[{"id":"prop-1","nombre":"Casa Muestra"}]}` | 401,403,400 |
| `POST /api/propiedades` | Auth; ADMIN/OPERADOR | `{ "nombre":"Casa Muestra", "propietarioId":"usr-1" }` | `201 {"id":"prop-1","nombre":"Casa Muestra","propietarioId":"usr-1"}` | 400,401,403 |
| `GET /api/propiedades/{id}/disponibilidad` | Auth según política aprobada | `?ingreso=2026-11-10&salida=2026-11-12` | `200 {"propiedadId":"prop-1","disponible":true,"intervalo":{"ingreso":"2026-11-10","salida":"2026-11-12"}}` | 400,401,403,404 |
| `POST /api/huespedes` | Auth; ADMIN/OPERADOR | `{ "nombre":"Huésped Demo", "contacto":"demo@example.invalid" }` | `201 {"id":"hue-1","nombre":"Huésped Demo"}` | 400,401,403 |
| `POST /api/reservas` | Auth; ADMIN/OPERADOR; política web pendiente | `{ "propiedadId":"prop-1", "huespedId":"hue-1", "ingreso":"2026-11-10", "salida":"2026-11-12", "origen":"WEB" }` | `201 {"id":"res-1","estado":"SOLICITADA","ingreso":"2026-11-10","salida":"2026-11-12"}` | 400,401,403,404,409 |
| `POST /api/reservas/{id}/confirmar` | Auth; ADMIN/OPERADOR autorizado | `{}` | `200 {"id":"res-1","estado":"CONFIRMADA"}` | 401,403,404,409 |
| `PATCH /api/reservas/{id}` | Auth; ADMIN/OPERADOR autorizado | `{ "ingreso":"2026-11-11", "salida":"2026-11-13" }` | `200 {"id":"res-1","estado":"CONFIRMADA","ingreso":"2026-11-11","salida":"2026-11-13"}` | 400,401,403,404,409 |
| `POST /api/reservas/{id}/cancelar` | Auth; ADMIN/OPERADOR autorizado | `{ "motivo":"Cambio solicitado" }` | `200 {"id":"res-1","estado":"CANCELADA"}` | 400,401,403,404,409 |
| `POST /api/reservas/{id}/pagos` | Auth; ADMIN/OPERADOR | `{ "importe":"250.00", "moneda":"PEN", "concepto":"ADELANTO", "idempotencyKey":"demo-pago-1" }` | `201 {"id":"pag-1","estado":"PENDIENTE_CONCILIACION","importe":"250.00","moneda":"PEN"}` | 400,401,403,404,409 |
| `POST /api/pagos/{id}/conciliar` | Auth; ADMIN/OPERADOR explícitamente autorizado | `{ "referencia":"DEMO-001" }` | `200 {"id":"pag-1","estado":"CONCILIADO","conciliadoEn":"2026-10-28T15:00:00-05:00"}` | 401,403,404,409 |
| `POST /api/pagos/{id}/rechazar` | Auth; ADMIN/OPERADOR autorizado | `{ "motivo":"No confirmado" }` | `200 {"id":"pag-1","estado":"RECHAZADO"}` | 400,401,403,404,409 |
| `GET /api/reservas/{id}/saldo` | Auth; actor con acceso a propiedad | — | `200 {"reservaId":"res-1","moneda":"PEN","total":"500.00","validado":"250.00","saldo":"250.00"}` | 401,403,404 |
| `POST /api/reservas/{id}/garantia` | Auth; ADMIN/OPERADOR | `{ "importe":"100.00", "moneda":"PEN" }` | `201 {"id":"gar-1","saldoDisponible":"100.00","moneda":"PEN"}` | 400,401,403,404,409 |
| `POST /api/garantias/{id}/movimientos` | Auth; ADMIN/OPERADOR | `{ "tipo":"DEVOLUCION", "importe":"80.00", "motivo":"Cierre demo" }` | `201 {"id":"mov-1","saldoDisponible":"20.00"}` | 400,401,403,404,409 |
| `GET /api/reportes/propietario` | Auth; ADMIN/OPERADOR alcance permitido o PROPIETARIO propio | `?desde=2026-11-01&hasta=2026-11-30&propietarioId=usr-1` (id omitido para propietario si se decide) | `200 {"filtros":{"desde":"2026-11-01","hasta":"2026-11-30"},"moneda":"PEN","ingresosAlquiler":"250.00","garantiasExcluidas":"100.00","reservas":[]}` | 400,401,403 |
| `GET /api/reportes/propietario/descarga` | Mismos permisos que reporte | mismos filtros | archivo aprobado (P1) | 400,401,403 |
| `POST /api/reservas/{id}/checkout` | Auth; ADMIN/OPERADOR | `{ "notas":"Datos sintéticos" }` | `201 {"id":"trab-1","estado":"PENDIENTE"}` | 400,401,403,404,409 |
| `GET /api/trabajos` | Auth; alcance por rol | `?estado=PENDIENTE&asignadoA=usr-2` | `200 {"items":[]}` | 400,401,403 |
| `PATCH /api/trabajos/{id}` | Auth; ADMIN/OPERADOR autorizado | `{ "estado":"EN_PROGRESO", "asignadoA":"usr-2" }` | `200 {"id":"trab-1","estado":"EN_PROGRESO"}` | 400,401,403,404,409 |

## Ejemplo de error de solape

```json
{
  "error": {
    "code": "RESERVATION_CONFLICT",
    "message": "El intervalo ya no está disponible.",
    "details": [{"field": "ingreso", "code": "OVERLAPPING_RESERVATION"}],
    "requestId": "req-demo-17"
  }
}
```

## Aprobación

Antes de implementación: acordar si lectura pública existe, sesión/token, roles exactos, solicitud de propietario, campos obligatorios, formato de fechas/moneda, política de cancelación, estados, códigos 409/422, idempotencia y exportación. Congelar OpenAPI u otra descripción única tras aprobación; mantener API y ejemplos sincronizados.
