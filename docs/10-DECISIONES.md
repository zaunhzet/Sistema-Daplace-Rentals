# 10 — Decisiones y preguntas abiertas

**Registro inicial:** propuestas solamente; ninguna decisión técnica o de negocio se marca aprobada. Responsable de resolver: André y Diego para arquitectura/contratos; responsable de negocio por identificar para políticas operativas.

## Registro

| ID | Tema / decisión propuesta | Alternativas | Motivación | Consecuencias | Responsable | Estado |
|---|---|---|---|---|---|---|
| DEC-01 | Control de solape en PostgreSQL: preferir exclusion constraint de rangos y estado bloqueante, si es compatible; alternativa bloqueo/transacción serializada demostrable. | Constraint `EXCLUDE`; bloqueo por propiedad; aislamiento serializable | Garantía bajo concurrencia | Migración y manejo 409; requiere prueba sobre motor real | Diego + André revisa contrato | PROPUESTA |
| DEC-02 | Cancelar por transición auditable, no borrado. | Estado CANCELADA; estados diferenciados | Preservar historial y liberar calendario según política | Penalidad/devolución no inferidas | Negocio + ambos | PROPUESTA |
| DEC-03 | Propietario asociado a una o varias propiedades; autorización por relación en servidor. | Cardinalidad y admin por definir | Segregación de datos | Modelo y reporte dependen | Negocio + ambos | PROPUESTA |
| DEC-04 | Autenticación estándar con sesión segura o token según despliegue/stack. | Cookie de sesión; token firmado; proveedor externo solo si justificado | Seguridad y sencillez del MVP | CSRF/cookies o expiración/rotación según alternativa | Diego + André | PROPUESTA |
| DEC-05 | Auditoría append-only para mutaciones relevantes, junto a transacción. | Tabla relacional; event log adicional | Trazabilidad sin servicios externos | Política de retención y PII pendiente | Diego + negocio | PROPUESTA |
| DEC-06 | Monto `NUMERIC` exacto y estados pendiente/conciliado/rechazado; moneda explícita. | Decimal; unidades menores | Evitar error binario y pago no validado | Elegir moneda/escala/redondeo/idempotencia | Negocio + Diego | PROPUESTA |
| DEC-07 | Garantía separada con movimientos y saldo derivado. | Tabla de garantía por reserva; varias por reserva | Separar fondos y permitir auditoría | Definir devolución, retención, reversa y cardinalidad | Negocio + Diego | PROPUESTA |
| DEC-08 | Reporte por fecha de pago o estancia; propuesta inicial no elegida hasta definir indicador. | Fecha de transacción; ingreso/estancia | Reproducibilidad | Cambia totales y KPI; fuente de conciliación | Negocio + ambos | PROPUESTA |
| DEC-09 | No implementar consulta de autorizaciones hasta definir su significado y fuente. | Registro propio; fuente documental existente | Evitar fabricar datos de autorización | RF14 se difiere si no se resuelve | Negocio | PROPUESTA |
| DEC-10 | Contrato automático solo con plantilla y cláusulas aprobadas. | PDF parametrizado; documento manual; diferir | Evitar inferencias legales | RF10 queda P2 | Negocio/revisión competente + ambos | PROPUESTA |
| DEC-11 | Airbnb inicialmente manual con origen y referencia; sin API automática. | Registro manual; importación; sincronización | Alcance explícito y menor dependencia | Deduplicación y responsabilidad manual por definir | Negocio + ambos | PROPUESTA |
| DEC-12 | Stack del listado de tesis no se considera definitivo hasta confirmación y revisión del repo. | React/TS/Vite/Tailwind/Fastify/PostgreSQL/Prisma; alternativa acordada | No instalar ni imponer dependencias | Estructura y herramientas de test pendientes | André + Diego | PROPUESTA |

## Preguntas de negocio sin resolver

1. ¿Cuál es la moneda, escala, redondeo y política de importes/montos máximos?
2. ¿`SOLICITADA` bloquea disponibilidad temporalmente? ¿Con qué vencimiento?
3. ¿Quién puede solicitar, confirmar, rechazar, cambiar fechas y cancelar? ¿Qué razones/penalidades aplican?
4. ¿Cuándo un pago se considera conciliado y quién lo puede conciliar? ¿Cómo se corrige o revierte sin borrar historia?
5. ¿Una reserva admite varios pagos, varias garantías o múltiples huéspedes?
6. ¿Cómo se devuelve/retiene garantía y quién registra evidencia/motivo?
7. ¿Reporte suma por fecha de pago, fechas de estancia u otra regla? ¿Qué incluye como ingreso y cómo excluye garantía?
8. ¿Qué roles existen y qué datos/acciones puede realizar cada uno?
9. ¿Qué significa RF14 “autorizaciones” y cuál es su fuente auténtica?
10. ¿Qué datos personales del huésped son estrictamente necesarios y cuál es la política de retención/rectificación?
11. ¿Hay plantilla de contrato aprobada? ¿RF10 requiere descarga, firma o solo generación?
12. ¿Cuál es el formato de registro Airbnb y criterio para identificar duplicados?
13. ¿Cuáles son las 23 HU exactas, prioridades originales, reglas de aceptación y diccionario de la tesis?
14. ¿Quién aprueba despliegue/demo y cuál es el entorno objetivo? No asumir nube, dominio ni servicio externo.
