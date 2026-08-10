# Plan de ejecución: task-0006

## Identificación

- Proyecto: desarrollo-promtbi-main
- Workspace: /srv/agentic/projects/desarrollo-promtbi-main
- Tarea: Fase 8.5 - Gates de PR y release controlado
- Riesgo: medium
- Estado inicial: new

## Objetivo

Implementar gates deterministas para contrato, seguridad, QA, PR, release y staging, manteniendo producción bloqueada y exigiendo aprobación humana para acciones críticas.

## Alcance

- Scripts operativos bajo `scripts/`.
- Reportes bajo `reports/`.
- Actualización controlada de `.ops/state/` y `.ops/logs/`.
- Comandos de OpenCode relacionados con la ejecución de gates.
- Actualización de `RUNBOOK.md` y `AGENT_POLICY.md`.

## Fuera de alcance

- Modificar `backend/` o `frontend/`.
- Ejecutar despliegues reales.
- Modificar producción.
- Ejecutar merge automático.
- Guardar secretos o tokens.
- Habilitar operaciones reales desde Telegram.

## Orden de implementación

1. Validar contrato de tarea.
2. Revisar seguridad, rutas modificadas y secretos.
3. Ejecutar QA usando comandos reales del proyecto.
4. Crear gate de PR con resultado JSON.
5. Crear gate de release condicionado a aprobación humana.
6. Preparar staging sin producción.
7. Implementar healthcheck verificable.
8. Preparar rollback operativo.
9. Integrar notificación estructurada para Telegram.
10. Ejecutar pruebas positivas y negativas.

## Reglas de seguridad

- Todos los scripts deben usar `set -euo pipefail`.
- La salida estándar debe ser JSON limpio.
- Los logs deben mantenerse separados de stdout.
- Ningún script puede modificar `backend/`, `frontend/` o `infra/production/`.
- Ningún script puede hacer push autónomo.
- Ningún script puede desplegar producción.
- Toda acción irreversible requiere aprobación humana explícita.

## Criterio de cierre

La tarea se considerará completada cuando los gates funcionen con una tarea controlada, rechacen estados inválidos, produzcan JSON verificable y demuestren que no se puede ejecutar release, merge o producción sin aprobación humana.
