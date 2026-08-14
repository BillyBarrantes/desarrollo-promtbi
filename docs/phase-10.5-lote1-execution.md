# Fase 10.5 · Lote 1: Ejecución real (modo `--apply`)

Estado: `listo-para-ejecucion-con-aprobacion` · Rama: `agent/task-0017` · Proyecto: `desarrollo-promtbi-main`

## 1. Objetivo del Lote 1

Aplicar la portabilidad y recuperación de la Fase 10.5: bootstrap del VPS,
restauración de proyectos/secretos/servicios/`.ops` o DB, healthcheck de
plataforma y backup de plataforma. Los scripts operan en modo `--apply`, se
ejecutan **solo en el VPS con `sudo` y aprobación humana**, y **no tocan
producción ni la base de datos real** más allá de lo autorizado.

## 2. Alcance

| Componente | Detalle |
|---|---|
| bootstrap | Dependencias base, usuarios/grupos, directorios y variables (`OPENCODE_HOME`, `WORKSPACE_ROOT`, `PROJECTS_ROOT`, `BOT_DIR`, `SCRIPTS_DIR`, `SECRETS_DIR`, `CONFIG_DIR`, `BACKUP_DIR`). |
| restore-projects | `git clone` de repositorios SaaS en `PROJECTS_ROOT`. |
| restore-secrets | Restauración desde gestor seguro en `SECRETS_DIR`, permisos 700, sin exponer valores. |
| restore-services | Creación/activación de unidades systemd (agentes, backups, monitoring). |
| restore-database | Copia de `.ops/` o importación de dump de DB. |
| healthcheck-platform | Validación de SSH, HTTP, DB, agentes, servicios, Telegram y GitHub. |
| backup-platform | Backup integral (proyectos, secretos, servicios, `.ops`/DB, configs) en `BACKUP_DIR`. |

## 3. Precondiciones

- `task-0017` **approved** (`.ops/state/task-0017.json`).
- Rama de trabajo `agent/task-0017`.
- `production_blocked = true`.
- Acceso al VPS con `sudo`.
- Fases 9 y 10 completadas.

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Instalación incompleta | `bootstrap-vps-agentic-apply.sh` idempotente; lista explícita de paquetes |
| Clones fallidos | `restore-projects-apply.sh` con permisos; logs por repo |
| Secretos filtrados | `restore-secrets-apply.sh` nunca imprime valores; permisos 700 |
| Servicios dañados | `restore-services-apply.sh` crea/activa; no reinicia hasta aprobación |
| Pérdida de `.ops`/DB | `restore-database-apply.sh` con permisos |
| Healthchecks falsos | `healthcheck-platform-apply.sh` guarda resultados en reports/ |
| Backup incompleto | `backup-platform-apply.sh` con retención |

## 5. Plan de ejecución

### 5.1 Orden de los scripts

Ejecutar en el VPS, en este orden:

1. `bootstrap-vps-agentic-apply.sh`
2. `restore-projects-apply.sh`
3. `restore-secrets-apply.sh`
4. `restore-services-apply.sh`
5. `restore-database-apply.sh`
6. `backup-platform-apply.sh`
7. `healthcheck-platform-apply.sh`

### 5.2 Comandos exactos (en el VPS, con sudo y aprobación humana)

```bash
cd /srv/agentic/projects/desarrollo-promtbi-main
git fetch origin && git checkout agent/task-0017 && git pull origin agent/task-0017

sudo ./scripts/bootstrap-vps-agentic-apply.sh   desarrollo-promtbi-main task-0017 --apply
sudo ./scripts/restore-projects-apply.sh        desarrollo-promtbi-main task-0017 --apply
sudo ./scripts/restore-secrets-apply.sh         desarrollo-promtbi-main task-0017 --apply
sudo ./scripts/restore-services-apply.sh        desarrollo-promtbi-main task-0017 --apply
sudo ./scripts/restore-database-apply.sh        desarrollo-promtbi-main task-0017 --apply
sudo ./scripts/backup-platform-apply.sh         desarrollo-promtbi-main task-0017 --apply
sudo ./scripts/healthcheck-platform-apply.sh    desarrollo-promtbi-main task-0017 --apply
```

Cada script escribe su log JSONL en `.ops/logs/` y emite **solo el JSON final**.

### 5.3 Validaciones post-ejecución

- `bash -n scripts/<script>-apply.sh` para los 7.
- `git diff --check` limpio.
- Logs presentes en `.ops/logs/task-0017-*-apply.log`.
- JSON de salida con `status:"passed"` y `production_blocked:true`.
- Healthchecks guardados en `reports/`.

### 5.4 Revertir en caso de error

- Usuarios/grupos: `userdel`/`groupdel` o `useradd` de nuevo según estado.
- Repositorios: `rm -rf` del clon recién creado en `PROJECTS_ROOT`.
- Secretos: eliminar archivos no deseados en `SECRETS_DIR` (restaurar desde gestor).
- Servicios: `systemctl disable --now` de las unidades recién creadas.
- `.ops`/DB: eliminar copia recién importada.
- Backups: `rm -f` del archivo creado.

Los scripts son idempotentes y operan solo sobre lo autorizado, sin modificar
producción real.

## 6. Evidencia esperada

- `reports/contract/task-0017-lote1-design.json`
- `reports/security/task-0017-lote1-design.json`
- `reports/qa/task-0017-lote1-design.json`

Cada evidencia incluye el fallo seguro (sin `--apply` y sin root) de los 7
scripts y la confirmación de que producción permanece bloqueada.