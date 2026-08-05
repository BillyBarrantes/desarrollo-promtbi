---
description: Corre la suite de pruebas completa y genera el reporte de QA observacional.
agent: qa-reviewer
---
Ejecuta la auditoría formal de QA para la tarea $1:
1. Ejecuta la suite navegando al backend: `cd backend && pytest` y `cd backend && ruff check .`.
2. Redacta el informe de auditoría en `reports/qa/$1-qa.md` siguiendo la plantilla `.opencode/templates/qa-report-template.md`.
3. Si las pruebas y el linter pasan sin errores, actualiza `.ops/state/$1.json` estableciendo `status: "awaiting_human"` y `current_agent: "qa"`.
4. NO modifiques ningún archivo de código fuente bajo ninguna circunstancia.
