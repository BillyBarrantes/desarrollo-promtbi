# Fase 10: Persistencia y operación — Diseño

Estado: `draft` · Rama: `agent/task-0013` · Proyecto: `desarrollo-promtbi-main` · Fase: `10`

## 1. Objetivo de la Fase 10

Diseñar la evolución de la persistencia de la plataforma desde el sistema de
archivos `.ops/` hacia una base de datos escalable, junto con operaciones
robustas: rotación de logs, backups automatizados, monitorización y healthchecks,
alertas de bucles y costes, locks expirables y trazabilidad fina. Esta fase **no
ejecuta cambios reales** en el VPS ni en la base de datos; entrega el diseño y
los scripts de preparación en modo `--dry-run`.

## 2. Criterios para migrar a base de datos

Considerar la migración cuando:

- Varios SaaS activos comparten la misma plataforma.
- Alta concurrencia de tareas y agentes.
- Colas complejas de trabajo y eventos.
- Historial grande de tareas, ejecuciones y artefactos.
- Necesidad de analítica y reportes.
- Múltiples usuarios con roles y permisos.
- Locks distribuidos entre workers.
- Múltiples workers ejecutando en paralelo.
- Notificaciones complejas.
- Auditoría centralizada.

## 3. Modelo inicial de base de datos

| Tabla | Propósito |
|---|---|
| `projects` | SaaS/proyectos registrados |
| `tasks` | Tareas con estado, rama, gates |
| `task_events` | Eventos de ciclo de vida de cada tarea |
| `approvals` | Aprobaciones humanas (release, staging, rollback) |
| `agent_runs` | Ejecuciones de agentes (duración, modelo, tokens) |
| `artifacts` | Artefactos generados por tareas |
| `deployments` | Despliegues (staging, producción, rollback) |
| `notifications` | Notificaciones (Telegram, otros canales) |
| `git_operations` | Commits, PRs, merges, pushes |
| `healthchecks` | Resultados de healthchecks |
| `cost_records` | Registros de coste por agente/SaaS |

## 4. Función de `.ops/`

- **Cache local**: estado reciente accesible sin DB.
- **Fallback**: operación continúa si la DB no está disponible.
- **Modo offline**: los scripts trabajan con archivos si no hay red/DB.
- **Evidencia del workspace**: lo que vive en el workspace local.
- **Formato de exportación**: fuente para poblar la DB.
- **Respaldo temporal**: retención corta antes de consolidar en DB.
- **Mecanismo de recuperación**: re-sincronización desde DB o desde archivos.

## 5. Contrato JSON

- Los scripts mantienen **el mismo formato de salida JSON** aunque el motor
  interno migre a DB.
- Esto garantiza que la migración sea transparente para gates, logs y reportes.

## 6. Rotación de logs

- **Qué rotar**: `.ops/logs/*.log`, `/var/log/agentic/*.log`.
- **Frecuencia**: diaria.
- **Retención**: 7 días.
- **Compresión**: gzip.

## 7. Backups

- **Qué respaldar**: `.ops/`, `secrets/`, `workspaces/`, DB (cuando exista).
- **Frecuencia**: diaria.
- **Destino**: `/srv/agentic/backups/` (local) y remoto (S3, otro VPS — TBD).
- **Retención**: 30 días.
- **Restauración**: procedimiento documentado por origen.

## 8. Monitorización y healthchecks

- **Métricas clave**: CPU, RAM, disco, red.
- **Healthchecks**: SSH, HTTP, DB.
- **Métricas por agente y por SaaS**: tiempos, costes, tasas de fallo.

## 9. Alertas

- **Bucles**: ejecuciones repetidas del mismo agente/tarea.
- **Costes excesivos**: superación de límite por agente/SaaS.
- **Fallos de despliegue**: deploy/rollback fallidos.
- **Locks expirados**: locks vencidos sin liberar.
- **Errores por agente**: tasa de error alta.
- Canal de notificación: Telegram.

## 10. Locks expirables

- **Formato**: JSON en `.ops/locks/<task_id>.json`.
- **TTL**: 1 hora (configurable).
- **Recuperación**: los locks vencidos se detectan y liberan automáticamente.

## 11. Trazabilidad

- Registro de commits, PRs, merges y despliegues.
- Tokens consumidos por ejecución.
- Duración de ejecuciones.
- Modelo utilizado por agente.
- Todo con actor, fecha UTC y SHA cuando aplique.

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Pérdida de datos en migración | Contrato JSON estable; `.ops/` como fallback; backups |
| DB como punto único de falla | Modo offline y cache local |
| Rotación agresiva de logs | Retención 7 días + compresión; revisión |
| Backups incompletos | Fuentes explícitas; verificación de restauración |
| Alertas ruidosas | Umbrales por agente/SaaS; canal Telegram |
| Locks huérfanos | TTL + recuperación automática |

## 13. Plan de ejecución por lotes

- **Lote 1**: logrotate + backups.
- **Lote 2**: monitorización + healthchecks.
- **Lote 3**: alertas + locks.
- **Lote 4**: diseño e implementación de la migración a DB (futuro).

## 14. Confirmación de alcance

Esta fase NO configura logrotate, NO ejecuta backups, NO instala monitorización,
NO configura alertas, NO crea locks ni bases de datos reales. Todos los scripts
operan en modo `--dry-run` y quedan preparados para ejecución futura con
aprobación humana.
