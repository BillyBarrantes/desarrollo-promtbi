# Fase 10 · Lote 1: Ejecución real (modo `--apply`)

Estado: `listo-para-ejecucion-con-aprobacion` · Rama: `agent/task-0014` · Proyecto: `desarrollo-promtbi-main`

## 1. Objetivo del Lote 1

Aplicar la configuración de operación de la Fase 10: rotación de logs,
backups automatizados, monitorización y healthchecks, alertas de bucles y
costes, y locks expirables. Los scripts de este lote operan en modo `--apply`,
se ejecutan **solo en el VPS con `sudo` y aprobación humana**, y **no tocan
producción ni la base de datos real**.

## 2. Alcance

| Componente | Detalle |
|---|---|
| logrotate | Rotación diaria, retención 7 días, compresión gzip. Config en `/etc/logrotate.d/agentic`. |
| backups | Orígenes `.ops/`, `secrets/`, `workspaces/` y DB (cuando exista). Destino `/srv/agentic/backups/`. Script `/usr/local/bin/agentic-backup.sh`. |
| monitoring | Métricas de sistema (CPU, RAM, disco, red) y healthchecks SSH/HTTP/DB. Script `/usr/local/bin/agentic-healthcheck.sh`. |
| alerts | Bucles, costes excesivos, fallos de despliegue y locks expirados. Canal Telegram. Script `/usr/local/bin/agentic-alerts.sh`. |
| locks | Locks JSON con TTL 1 h y recuperación automática. Script `/usr/local/bin/agentic-locks.sh`. |

## 3. Precondiciones

- `task-0014` **approved** (`.ops/state/task-0014.json`).
- Rama de trabajo `agent/task-0014`.
- `production_blocked = true` (nunca se toca producción sin aprobación).
- Acceso al VPS con `sudo`.
- Fase 9 completada (usuarios, SSH, firewall, secrets, workspaces, egress).

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Rotación agresiva pierde logs | Retención 7 días + `missingok`/`notifempty`; revisión antes de aplicar |
| Backups incompletos | Fuentes explícitas; script idempotente; verificar restauración |
| Healthchecks falsos positivos | Umbrales simples; salida JSON revisable |
| Alertas ruidosas | Detección solo lectura; canal Telegram configurable |
| Locks huérfanos | TTL 1 h + recuperación automática de vencidos |
| Ejecución accidental en prod | Scripts exigen EUID 0, `--apply`, task approved y rama correcta |

## 5. Plan de ejecución

### 5.1 Orden de los scripts

Ejecutar en el VPS, en este orden:

1. `setup-logrotate-apply.sh`
2. `setup-backups-apply.sh`
3. `setup-monitoring-apply.sh`
4. `setup-alerts-apply.sh`
5. `setup-locks-apply.sh`

### 5.2 Comandos exactos (en el VPS, con sudo y aprobación humana)

```bash
cd /srv/agentic/projects/desarrollo-promtbi-main
git fetch origin && git checkout agent/task-0014 && git pull origin agent/task-0014

sudo ./scripts/setup-logrotate-apply.sh  desarrollo-promtbi-main task-0014 --apply
sudo ./scripts/setup-backups-apply.sh    desarrollo-promtbi-main task-0014 --apply
sudo ./scripts/setup-monitoring-apply.sh desarrollo-promtbi-main task-0014 --apply
sudo ./scripts/setup-alerts-apply.sh     desarrollo-promtbi-main task-0014 --apply
sudo ./scripts/setup-locks-apply.sh      desarrollo-promtbi-main task-0014 --apply
```

Cada script escribe su log JSONL en `.ops/logs/` y emite **solo el JSON final**
por stdout.

### 5.3 Validaciones post-ejecución

- `bash -n scripts/setup-*-apply.sh` para los 5.
- `git diff --check` limpio.
- Logs presentes en `.ops/logs/task-0014-*-apply.log`.
- JSON de salida con `status:"passed"` y `production_blocked:true`.
- Verificar existencia de `/etc/logrotate.d/agentic`, `/srv/agentic/backups/`,
  `/usr/local/bin/agentic-backup.sh`, `/usr/local/bin/agentic-healthcheck.sh`,
  `/usr/local/bin/agentic-alerts.sh`, `/usr/local/bin/agentic-locks.sh` y
  `.ops/locks/`.

### 5.4 Revertir en caso de error

```bash
sudo rm -f /etc/logrotate.d/agentic
sudo rm -f /usr/local/bin/agentic-backup.sh
sudo rm -f /usr/local/bin/agentic-healthcheck.sh
sudo rm -f /usr/local/bin/agentic-alerts.sh
sudo rm -f /usr/local/bin/agentic-locks.sh
sudo rm -rf /srv/agentic/backups
sudo rm -rf /srv/agentic/metrics
```

Los scripts son idempotentes y no tocan producción, por lo que el rollback es
seguro y no afecta datos reales.

## 6. Evidencia esperada

- `reports/contract/task-0014-lote1-design.json`
- `reports/security/task-0014-lote1-design.json`
- `reports/qa/task-0014-lote1-design.json`

Cada evidencia incluye el resultado de `bash -n`, el fallo seguro (sin
`--apply` y sin root) de los scripts y la confirmación de que producción
permanece bloqueada.
