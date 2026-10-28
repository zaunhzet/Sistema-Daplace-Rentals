# 01 — Alcance del MVP

**Estado: PROPUESTA.** La clasificación no es aprobación de producto ni afirmación de implementación. P0 debe poder demostrarse con datos sintéticos y controles de backend/base de datos. El mockup por sí solo no satisface ningún criterio.

## P0 — Núcleo transaccional demostrable

| Capacidad / RF | Qué se demostrará | Fuera de P0 | Dependencias |
|---|---|---|---|
| Disponibilidad y bloqueo de intervalos (RF01, RF03, RF11) | Consultar disponibilidad y rechazar en el backend dos ocupaciones incompatibles del mismo inmueble; intervalos consecutivos son válidos. | Sincronización de canales externos, calendario en tiempo real multi-canal. | PostgreSQL; política de estados; mecanismo de concurrencia aprobado. |
| Solicitud y confirmación de reserva (RF02, RF03) | Crear solicitud `SOLICITADA`, mostrarla y confirmarla por usuario autorizado; cambio de fechas vuelve a validar. | Flujos complejos de aprobación y automatización no confirmados. | Identidad/roles; Propiedad; huésped; control contra concurrencia. |
| Adelanto y saldo (RF05) | Registrar pago pendiente, conciliarlo explícitamente y reproducir saldo desde pagos validados sin alterar historial. | Pasarela de pago, reversas automáticas o cobros reales. | Moneda/escala aprobadas; Reserva; auditoría; API. |
| Garantía (RF06) | Registrar recepción separada de ingreso de alquiler y movimiento de devolución/retenido; impedir devolución mayor al saldo. | Custodia bancaria, comprobantes fiscales o reglas no definidas. | Reserva; tipo monetario exacto; saldo derivado; auditoría. |
| Reporte reproducible mínimo (RF08, RF12) | Generar totales por propietario para un período con detalle rastreable y autorización por propiedad. | Diseñador avanzado, programación de reportes, exportaciones múltiples. | Pagos validados; propiedad/propietario; filtros temporales aprobados. |
| Trazabilidad y acceso (RF09; soporte transversal) | Registrar actor, acción, entidad, instante y resultado para mutaciones críticas; denegar acceso ajeno en servidor. | SIEM, auditoría externa, granularidad no acordada. | Autenticación, autorización, tabla de auditoría. |

## P1 — Operación segura y completa del flujo

| Capacidad / RF | Qué se demostrará | Fuera de P1 | Dependencias |
|---|---|---|---|
| Gestión de propiedad y huésped (RF04; precondiciones de RF01–03) | Alta/consulta/edición controlada de datos mínimos sintéticos; vínculo propietario-propiedad y reserva-huésped. | CRM, verificación de identidad externa. | Roles, modelo y validaciones aprobadas. |
| Cierre, mantenimiento y trabajos (RF07, RF13, RF15) | Registrar salida y tareas asignadas/consultables con estado y responsable. | Planificador, inventario de mantenimiento, notificaciones externas. | Estados de trabajo y cierre por validar. |
| Autorizaciones y consulta operativa (RF14) | Consultar autorización vinculada a propiedad/reserva si se define catálogo y fuente. | Firma electrónica o validez legal inferida. | Reglas de negocio/documentos originales. |
| Descarga de reporte (RF12) | Descargar formato simple generado en servidor, con filtros y permisos validados. | Programación, formatos configurables. | Reporte P0 y formato aprobado. |
| Alertas internas (RF11, RF16) | Mostrar aviso de fecha reservada/asignación en la interfaz. | Correo, SMS, push o entrega garantizada. | Eventos y estados; P0 de reserva. |

## P2 — Incrementos posteriores

| Capacidad / RF | Objetivo posterior | Fuera de MVP inicial | Dependencias |
|---|---|---|---|
| Contrato automático (RF10) | Producir contrato parametrizado a partir de reserva validada. | Asumir validez legal, firma o cláusulas no revisadas. | Plantilla aprobada por negocio/legal; datos completos. |
| Transición desde Airbnb (RF17) | Estandarizar migración/conciliación del canal. | API, sincronización bidireccional o importación no verificada. | Formato origen, reglas de identidad y conciliación. |
| Alertas y consultas avanzadas (RF11, RF14, RF15, RF16) | Automatizar canales y filtros adicionales. | Proveedores externos y SLA. | P1, decisiones de negocio y servicio aprobado. |
| Analítica avanzada (RF08, RF12) | Comparativos, gráficos y plantillas. | Métricas sin definiciones acordadas. | Indicadores científicos definidos y datos suficientes. |

## Dependencias y puertas de liberación

Ningún P0 depende de una capacidad etiquetada solo P2. Reportes P0 solo requiere lectura reproducible de datos de reservas/pagos y autorización; descarga avanzada es P1. El registro manual de Airbnb no requiere sincronización P2. P0 sí depende de autenticación/autorización mínima segura; aunque la pantalla de administración simple figure como P1, el servidor debe proteger todo acceso desde la primera entrega. Si falta el mecanismo confiable contra reserva concurrente, no se declara cumplido RF01/RF03.

**Criterio de MVP funcional:** recorrido de `12-DEMO-MVP.md` respaldado por frontend, API y base persistente; cada escritura se comprueba en servidor y base de datos; pruebas críticas de `08-PLAN-PRUEBAS.md` ejecutadas y evidencia registrada. Un prototipo visual no cumple este criterio.
