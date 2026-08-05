---
description: Inicia el análisis de una tarea pasando su ID, activa a planner y genera el plan.
agent: planner
---
Lee la tarea activa identificada por $1 desde `.ops/state/$1.json`.

Ejecuta las siguientes acciones de forma estricta:
1. Analiza el contexto técnico usando la skill `plan-saas`.
2. Redacta el plan de ejecución formal en `reports/plans/$1-plan.md` aplicando la estructura de `.opencode/templates/plan-template.md`.
3. Actualiza el archivo `.ops/state/$1.json` con `status: "planned"` y `current_agent: "planner"`.
