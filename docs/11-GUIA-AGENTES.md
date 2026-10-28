# 11 — Guía compartida para agentes IA

## Antes de actuar

1. Leer `00-README.md`, `01-ALCANCE-MVP.md`, `02-ROADMAP-5-DIAS.md`, `03-BACKLOG-TECNICO.md` y los documentos del dominio afectado.
2. Confirmar que existe una tarea asignada con ID, prioridad, responsable y criterios de aceptación. Si falta, proponerla y esperar asignación humana.
3. Consultar instrucciones `AGENTS.md` del repositorio y estado Git actual. El árbol puede contener trabajo válido.
4. No iniciar implementación hasta que el equipo declare aprobados stack, contratos y reglas que bloquean esa tarea.

## Límites de trabajo

- Trabajar solo en archivos/módulos de la tarea asignada.
- No modificar archivos propiedad del otro frente sin coordinación explícita. Propuesta inicial: Diego es dueño de backend/database; André de frontend; contratos compartidos requieren revisión de ambos.
- No hacer refactorizaciones, actualizaciones de dependencias ni cambios de diseño ajenos al alcance.
- Preservar historial financiero y de auditoría; nunca eliminar protecciones para facilitar una demo.
- No introducir secretos, credenciales, tokens, datos personales reales ni copias de bases empresariales.
- No hacer push directo a `main`, merge automático ni reescritura forzada de historia.
- No desplegar ni conectar servicios externos sin autorización contextual y decisión aprobada.

## Requisitos de evidencia

- No declarar pruebas, build, concurrencia, integración o despliegue como PASS sin ejecutarlos y conservar evidencia.
- Comandos se toman de la configuración real; no inventar scripts o versiones.
- Actualizar `09-ESTADO-PROYECTO.md` con estado, rama, PR, evidencia, acción siguiente y bloqueo.
- Mantener API, modelo, reglas, roadmap y código sincronizados; documentar cambios contractuales.
- Resumir al finalizar: archivos/módulos, comportamiento, pruebas realmente ejecutadas, evidencia, riesgos y pendientes.
- Si el requisito o su semántica es ambigua, detener la parte dependiente y solicitar decisión humana; avanzar solo en trabajo independiente.

## Coordinación y consumo

- Una tarea principal por agente; dividir tareas por fronteras de módulo con contratos acordados.
- Abrir PR pequeño por frente y pedir revisión del otro responsable; no editar simultáneamente archivos compartidos.
- Compartir solo contexto necesario y referenciar IDs de backlog/decisiones para reducir duplicación.
- Si la validación no está configurada, reportar “no ejecutada”, no fabricar resultados.
