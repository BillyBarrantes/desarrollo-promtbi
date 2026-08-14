# Fase 9 — Lote 2: Ejecución (secretos + workspaces + egress)

Estado: `plan` · Rama: `agent/task-0011` · Proyecto: `desarrollo-promtbi-main`

## 1. Objetivo del Lote 2

Preparar y definir los scripts de ejecución real (`--apply`) del Lote 2 de la
Fase 9: layout formal de secretos, aislamiento de workspaces por SaaS y
restricción de egress para agentes. Los scripts quedan listos para ejecutarse en
el VPS con `sudo` y aprobación humana explícita; esta rama **no** ejecuta cambios
reales.

## 2. Alcance

### 2.1 Layout de secretos

- Directorios por proyecto en el VPS:
  - `/srv/agentic/secrets/desarrollo-promtbi-main/`
  - `/srv/agentic/secrets/promdata/`
  - `/srv/agentic/secrets/tres-niveles-web/`
- `.gitkeep` vacíos por directorio (placeholders, sin valores).
- Permisos `700`; propietario `root:promtbi-users`.
- NO se crean secretos reales (tokens, claves, credenciales).

### 2.2 Aislamiento de workspaces

- Workspaces por SaaS:
  - `/srv/agentic/workspaces/desarrollo-promtbi-main`
  - `/srv/agentic/workspaces/promdata`
  - `/srv/agentic/workspaces/tres-niveles-web`
- Permisos `750` (o `770`); propietario `promtbi-agent:promtbi-users`.
- Cada SaaS solo accede a su workspace.
- NO se mueven datos reales todavía.

### 2.3 Restricción de egress

- Permitir salida DNS (`53/udp`, `53/tcp`).
- Permitir salida HTTP/HTTPS (`80/tcp`, `443/tcp`).
- Allowlist de dominios: `api.github.com`, `api.telegram.org`, etc.
- Bloquear el resto para usuarios `promtbi-*`.
- NO aplicar si el firewall está inactivo (paso manual).

## 3. Precondiciones

- `task-0011` está `approved`.
- Rama actual: `agent/task-0011`.
- `production_blocked = true`.
- Acceso al VPS con `sudo`.
- Lote 1 completado (usuarios, SSH, firewall).

## 4. Estructura de secretos

- `secrets/desarrollo-promtbi-main/` — credenciales del proyecto principal.
- `secrets/promdata/` — credenciales del servicio promdata.
- `secrets/tres-niveles-web/` — credenciales del servicio tres-niveles-web.
- Cada directorio contiene `.gitkeep` como placeholder vacío.
- Telegram reporta variables faltantes por nombre, **sin mostrar valores**
  (ej.: `Falta variable: DB_PASSWORD en secretos/desarrollo-promtbi-main`).

## 5. Aislamiento de workspaces

| Workspace | Usuario propietario | Grupo | Permisos |
|---|---|---|---|
| `.../desarrollo-promtbi-main` | `promtbi-agent` | `promtbi-users` | 750 |
| `.../promdata` | `promtbi-agent` | `promtbi-users` | 750 |
| `.../tres-niveles-web` | `promtbi-agent` | `promtbi-users` | 750 |

- Cada usuario (bot, agente, SaaS) recibe acceso solo a su workspace.

## 6. Restricción de egress

- Reglas de firewall para limitar salida de agentes.
- Allowlist de dominios y puertos.
- Auditoría de intentos de egress no autorizados (logs del firewall).
- No habilita el firewall automáticamente.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Exposición accidental de secretos | Permisos `700`, placeholders en Git, reporte por nombre sin valores |
| Bloqueo de egress necesario | Allowlist ampliable; no habilitar firewall automáticamente |
| Permisos incorrectos en workspaces | Validaciones previas; `750`/`770`; revisión post-ejecución |

## 8. Plan de ejecución

Orden de scripts (en el VPS, con `sudo` y aprobación humana):

1. `bash scripts/setup-secrets-apply.sh desarrollo-promtbi-main task-0011 --apply`
2. `bash scripts/setup-workspace-isolation.sh desarrollo-promtbi-main task-0011 --apply`
3. `bash scripts/setup-egress-restrictions.sh desarrollo-promtbi-main task-0011 --apply`

Validaciones post-ejecución:

- `ls -la /srv/agentic/secrets/` y `/srv/agentic/workspaces/` con permisos correctos.
- `stat -c '%U:%G %a'` sobre cada directorio.
- Revisión de reglas de egress con el firewall.

Cómo revertir en caso de error:

- Restaurar permisos/owners con `chown`/`chmod` a los previos.
- Eliminar directorios recién creados si son incorrectos.
- Revertir reglas de egress desde backup del firewall.

## 9. Evidencia esperada

- Logs JSONL:
  - `.ops/logs/task-0011-secrets-apply.log`
  - `.ops/logs/task-0011-workspace-apply.log`
  - `.ops/logs/task-0011-egress-apply.log`
- JSON de estado de `task-0011`.
- Reportes: `reports/{contract,security,qa}/task-0011-lote2-design.json`.

## 10. Confirmación

En esta rama NO se ejecuta `sudo`, NO se crean secretos reales, NO se modifican
workspaces reales fuera del repo, NO se modifica firewall ni routing, y NO se
reinician servicios. Producción permanece bloqueada.