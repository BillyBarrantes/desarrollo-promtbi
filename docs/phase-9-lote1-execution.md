# Fase 9 — Lote 1: Ejecución (usuarios + SSH + firewall)

Estado: `plan` · Rama: `agent/task-0010` · Proyecto: `desarrollo-promtbi-main`

## 1. Objetivo del Lote 1

Preparar y definir los scripts de ejecución real (`--apply`) del Lote 1 de la
Fase 9: creación de usuarios de servicio, hardening de SSH y firewall básico.
Los scripts quedan listos para ejecutarse en el VPS con `sudo` y aprobación
humana explícita; esta rama **no** ejecuta cambios reales.

## 2. Alcance

### 2.1 Usuarios

- Grupo: `promtbi-users`.
- Usuarios: `promtbi-bot`, `promtbi-agent`.
- Shells: `/usr/sbin/nologin` para servicios; `/bin/bash` solo si es necesario
  para operación interactiva.
- Sin modificación de contraseñas; sin home dirs especiales.

### 2.2 SSH

- `PermitRootLogin no`
- `PasswordAuthentication no`
- `PubkeyAuthentication yes`
- `AllowUsers promtbi-bot promtbi-agent`
- `AllowGroups promtbi-users`

### 2.3 Firewall

- Permitir SSH (`22/tcp`), HTTP (`80/tcp`), HTTPS (`443/tcp`).
- Egress básico (DNS, HTTP/HTTPS).
- Bloquear ingress innecesario.
- Detectar `ufw`; si existe `nftables`/`iptables`, dejar estructura preparada.
- NO habilitar el firewall si estaba deshabilitado sin confirmación explícita.

## 3. Precondiciones

- `task-0010` está `approved`.
- Rama actual: `agent/task-0010`.
- `production_blocked = true`.
- Acceso al VPS con `sudo`.
- Backup previo de:
  - `/etc/passwd`
  - `/etc/group`
  - `/etc/ssh/sshd_config`
  - reglas actuales del firewall.

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Bloqueo accidental de SSH | Backup previo; validación `sshd -t`; reinicio manual; sesión SSH persistente abierta |
| Usuarios mal creados | Validaciones previas; `set -euo pipefail`; solo `--apply` y con EUID==0 |
| Reglas de firewall demasiado restrictivas | Backup de reglas; no habilitar si estaba deshabilitado; revisión manual |

## 5. Plan de ejecución

Orden de scripts (en el VPS, con `sudo` y aprobación humana):

1. `bash scripts/setup-users-apply.sh desarrollo-promtbi-main task-0010 --apply`
2. `bash scripts/harden-ssh-apply.sh desarrollo-promtbi-main task-0010 --apply`
3. `bash scripts/setup-firewall-apply.sh desarrollo-promtbi-main task-0010 --apply`

Validaciones post-ejecución:

- `id promtbi-bot` y `id promtbi-agent` existen y pertenecen a `promtbi-users`.
- `sshd -t` sin errores.
- `ufw status` muestra reglas esperadas.

Cómo revertir en caso de error:

- Restaurar backups: `/etc/passwd`, `/etc/group`,
  `/etc/ssh/sshd_config.bak.task-0010`, reglas de firewall.
- Reiniciar SSH manualmente solo tras confirmar sintaxis.

## 6. Evidencia esperada

- Logs JSONL: `.ops/logs/task-0010-users-apply.log`,
  `.ops/logs/task-0010-ssh-apply.log`,
  `.ops/logs/task-0010-firewall-apply.log`.
- JSON de estado de `task-0010`.
- Reportes: `reports/contract/task-0010-lote1-design.json`,
  `reports/security/task-0010-lote1-design.json`,
  `reports/qa/task-0010-lote1-design.json`.

## 7. Confirmación

En esta rama NO se ejecuta `sudo`, NO se crean usuarios reales, NO se modifica
`/etc/ssh/sshd_config` ni el firewall, y NO se reinician servicios. Producción
permanece bloqueada.
