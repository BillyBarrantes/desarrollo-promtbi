# Fase 9: Seguridad y operación — Diseño

Estado: `draft` · Rama: `agent/task-0009` · Proyecto: `desarrollo-promtbi-main`

## 1. Objetivo de la Fase 9

Endurecer la operación de la plataforma promtbi: separar identidades por rol y por
SaaS, eliminar secretos del repositorio y de la superficie de configuración,
restringir el acceso SSH a claves únicamente, y añadir trazabilidad, límites y
aprobaciones humanas para toda acción irreversible. Esta fase **no ejecuta cambios
reales en el VPS**; entrega el diseño, los scripts de preparación en modo `--dry-run`
y los lotes de ejecución que requieren aprobación humana.

## 2. Principios

1. **Ningún servicio operativo como root.** Cada proceso (bot, agente, SaaS) corre
   con la identidad mínima necesaria y sin privilegios de administrador.
2. **Aislamiento por SaaS.** Cada proyecto/SaaS tiene su propio usuario, grupo,
   workspace y layout de secretos; ningún agente cruza los límites de otro SaaS.
3. **Secretos fuera de Git.** El repositorio contiene solo placeholders vacíos
   (`.gitkeep`); los valores reales viven en `secrets/` del VPS fuera de Git y con
   permisos restringidos.
4. **Trazabilidad completa.** Cada acción operativa queda registrada en
   `.ops/logs/`, los approvals en `.ops/approvals/`, y los commits, PRs, merges y
   despliegues se registran con fecha, actor y SHA.

## 3. Seguridad del VPS

### 3.1 Usuarios

| Usuario | Rol | Comentario |
|---|---|---|
| `promtbi-bot` | Bot Telegram | Solo mensajería y disparo de tareas |
| `promtbi-agent` | Agentes OpenCode | Trabajo en workspaces aislados |
| `promdata-svc` | Servicio SaaS promdata (ejemplo) | Identidad dedicada por SaaS |
| `tresniveles-svc` | Servicio SaaS tres-niveles-web (ejemplo) | Identidad dedicada por SaaS |

- Grupo común: `promtbi-users` (acceso operativo restringido).
- Cada servicio SaaS en su propio grupo/workspace.

### 3.2 SSH

- **Solo con claves** (`PubkeyAuthentication yes`).
- **Login root bloqueado** (`PermitRootLogin no`).
- **Contraseñas deshabilitadas** (`PasswordAuthentication no`).
- `AllowUsers promtbi-bot promtbi-agent ...`.
- `AllowGroups promtbi-users`.
- Revisión manual de `sshd_config` antes de recargar el servicio.

### 3.3 Firewall y egress

- Firewall básico (solo puertos expuestos; SSH restringido por IP).
- Restricción de egress para agentes (deny por defecto, allowlist de destinos).
- Aislamiento de workspaces por usuario/SaaS (permisos `0700`/`0750`).

### 3.4 Herramientas y comandos

- Allowlists de herramientas disponibles para cada agente.
- Bloqueo de comandos destructivos (`rm -rf`, `DROP DATABASE`, `TRUNCATE`,
  `kubectl ... production`, deploy/rollback sin gate).
- Aprobación humana para acciones irreversibles.

### 3.5 Auditoría

- Registro de accesos y operaciones (quién, cuándo, qué, contra qué).

## 4. Gestión de secretos

### 4.1 Estructura

```
secrets/
  desarrollo-promtbi-main/
  promdata/
  tres-niveles-web/
```

### 4.2 Qué se guarda en cada uno

- `desarrollo-promtbi-main/`: credenciales del proyecto principal (tokens de
  despliegue, API keys, acceso de agentes).
- `promdata/`: credenciales del servicio promdata (API keys, DB, terceros).
- `tres-niveles-web/`: credenciales del servicio tres-niveles-web.

### 4.3 Qué NUNCA se guarda en Git

- `.env*`, tokens, claves privadas, API keys, contraseñas, certificados privados,
  credenciales de base de datos o de terceros, secretos de producción.

### 4.4 Telegram y faltantes

- Telegram **no muestra valores**: solo reporta nombres de variables faltantes
  (p. ej. `Falta variable: DB_PASSWORD en secrets/desarrollo-promtbi-main`).

## 5. Operación

- **Rotación de logs**: por tamaño y antigüedad (`logrotate`).
- **Backups**: de estado y de configuraciones críticas, con retención definida.
- **Monitorización**: de servicios, colas y agentes.
- **Healthchecks**: verificaciones periódicas (staging y servicios).
- **Locks expirables**: TTL por tarea, evitan ejecución concurrente.
- **Reintentos máximos**: límite por tarea (retries `0..3`).
- **Timeouts por tarea**: límite temporal por ejecución.
- **Límites de coste**: presupuesto máximo por agente/SaaS.
- **Alertas de bucles**: detección de iteraciones infinitas.
- **Métricas por agente y por SaaS**: tiempos, costes, tasas de fallo.
- **Registro**: commits, PRs, merges y despliegues con SHA, actor y fecha UTC.

## 6. Criterios de cierre de Fase 9

- Ningún servicio opera como `root`.
- No existen secretos reales dentro del repositorio Git.
- SSH permite únicamente autenticación por clave; `PermitRootLogin no` y
  `PasswordAuthentication no` están planificados y pendientes de ejecución con
  aprobación humana.
- Los scripts de preparación (`setup-users`, `harden-ssh`, `setup-secrets-layout`)
  pasan `bash -n` y devuelven JSON determinista en modo `--dry-run`.
- `production_blocked: true` en toda salida; producción no se toca.
- Cada cambio irreversible requiere aprobación humana registrada en
  `.ops/approvals/`.

## 7. Plan de ejecución por lotes

- **Lote 1: usuarios + SSH + firewall básico.** Crear usuarios/grupos
  (`setup-users.sh`), endurecer SSH (`harden-ssh.sh`), firewall básico.
  Requiere aprobación humana y `sudo` explícito.
- **Lote 2: secrets layout + aislamiento de workspaces + egress.**
  Crear estructura `secrets/` (`setup-secrets-layout.sh`), workspaces aislados,
  restricción de egress para agentes.
- **Lote 3: logs, backups, monitorización, alertas, locks.** Logrotate, backups,
  healthchecks, locks expirables, límites, alertas y métricas.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper acceso SSH al endurecer | Sesión persistente abierta + revisión manual de `sshd_config` antes de recargar |
| Pérdida de secretos | Backups y layout con permisos `0600`/`0700`; nunca en Git |
| Agentes cruzando SaaS | Workspaces y usuarios aislados; egress restringido |
| Comando destructivo | Bloqueo en allowlists + gate + aprobación humana |
| Bucles/sobrecoste | Timeouts, reintentos máx, límites de coste, alertas |
| Configuración divergente | Trazabilidad en logs/approvals y docs de diseño |

## 9. Confirmación de alcance

Esta fase NO ejecuta cambios reales en el VPS: no crea usuarios, no modifica
`sshd_config`, no toca firewall, no crea secretos reales y no despliega. Todos los
scripts operan en modo `--dry-run` y quedan preparados para ejecución futura con
aprobación humana.
