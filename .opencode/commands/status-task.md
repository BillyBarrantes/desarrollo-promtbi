---
description: Muestra un resumen del estado operativo de una tarea específica o del tablero general.
agent: planner
---
Determina el alcance de la consulta:
- Si se proporciona un argumento en $1 (ejemplo: `task-0001`), lee el archivo de estado `.ops/state/$1.json`.
- Si NO se proporciona argumento en $1, escanea todos los archivos JSON dentro de `.ops/state/`.

Presenta los datos en una tabla Markdown con las siguientes columnas:
`task_id`, `title`, `status`, `current_agent`, `retries`, `updated_at` y `last_error`.
