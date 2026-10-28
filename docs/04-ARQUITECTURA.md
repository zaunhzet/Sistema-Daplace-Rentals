# 04 — Arquitectura propuesta

**Estado: PROPUESTA.** La tesis enumera React, TypeScript, Vite, Tailwind, Node.js, Fastify, PostgreSQL, Prisma, Git y GitHub; son tecnologías previstas, no decisiones confirmadas. Validar compatibilidad, experiencia del equipo, versiones y herramientas instaladas antes de adoptar.

## Estructura monorepo sugerida

```text
frontend/
  src/app/                 # arranque, rutas, proveedores
  src/features/            # reservas, propiedades, pagos, reportes...
  src/shared/               # componentes, cliente API, tipos compartidos
backend/
  src/app/                  # servidor, plugins, rutas
  src/modules/<dominio>/    # handler, schema, service, repository
  src/auth/                 # identidad y autorización
  src/shared/               # errores, configuración, logging
  prisma/                   # schema y migraciones, si se aprueba Prisma
 database/
  README.md                 # políticas locales, datos sintéticos, respaldos descartables
  migrations/               # solo si no se centralizan con ORM
 docs/
```

Elegir un solo dueño de migraciones (ORM o SQL versionado); no duplicar fuentes del esquema. `frontend` nunca se conecta directamente a PostgreSQL.

## Límites entre capas

- **Interfaz:** captura y muestra datos; validación cliente mejora experiencia, pero no reemplaza validación backend. No decide disponibilidad final, conciliación ni autorización.
- **Rutas/controladores:** traducen HTTP, autentican, validan esquema de entrada/salida y asignan códigos; no contienen cálculos financieros.
- **Servicios de dominio:** aplican estados/invariantes y coordinan transacciones. Reserva, pago, garantía y reporte tienen responsabilidades separadas.
- **Repositorios/ORM:** persistencia parametrizada, transacciones y consultas con alcance. No filtrar campos sensibles.
- **PostgreSQL:** claves, restricciones, índices, integridad referencial y barrera de concurrencia para intervalos bloqueantes.
- **Reportes:** vista/consulta derivada de registros fuente inmutables; totales reconstruibles, con moneda y filtros explícitos.

## Autenticación, permisos y errores

Mecanismo de autenticación queda pendiente de decisión (DEC-04). Todas las rutas mutantes y privadas verifican identidad en servidor. Aplicar mínimo privilegio por rol más propiedad asociada; nunca aceptar `propietarioId` arbitrario para consultar información sin comprobar alcance. Los errores siguen un sobre común de `06-CONTRATOS-API.md`; no retornar stack trace ni secretos. Validación inválida 400, sin autenticar 401, sin permiso 403, no encontrado 404, solape/idempotencia conflictiva 409 y fallo inesperado 500 con identificador de correlación.

## Integridad y concurrencia

Las operaciones críticas se ejecutan en transacción de base. Para confirmar o mover fechas, elegir exclusión de rangos PostgreSQL para reservas bloqueantes o transacción con aislamiento/bloqueos que demuestre exclusión bajo concurrencia. Definirla y probarla sobre el mismo motor previsto; una consulta de disponibilidad aislada seguida de insert no basta. Pagos idempotentes y garantías controlan repetición/ saldo con restricción o bloqueo. No usar floats binarios para dinero; persistir decimal exacto y convertir a unidades menores solo si moneda/escala se acuerdan.

## Configuración local

- Configuración validada al iniciar; ejemplo sin secretos en `.env.example`, archivo real excluido de Git.
- Base local con migraciones y semilla sintética explícita; no copiar datos personales reales.
- Comandos de instalación/arranque/test se documentan solo después de confirmar manifiestos y herramientas reales del repositorio.
- Versiones fijadas en archivos de runtime/lock únicamente tras aprobar stack; no instalar dependencias como parte de esta propuesta documental.
- Logs estructurados sin documentos de identidad, datos financieros completos ni credenciales.

## Contratos y propiedad de archivos

Definir módulos/contratos en sesión conjunta antes de implementación. Propuesta para reducir cruces: Diego es dueño inicial de `backend/` y `database/`; André de `frontend/`; ambos revisan los cambios de dominio; nadie altera archivos de la otra área sin coordinación. `docs/` requiere revisión compartida. Decidir si un paquete `shared/` existe tras acordar tipos de API; evitar generar monorepo complejo innecesario.
