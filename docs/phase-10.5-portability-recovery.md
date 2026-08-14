# Fase 10.5: Portabilidad y recuperación del Centro de Operaciones

Estado: `draft` · Rama: `agent/task-0016` · Proyecto: `desarrollo-promtbi-main` · Fase: `10.5`

## 1. Objetivo de la Fase 10.5

Hacer el Centro de Operaciones **portable y recuperable**: eliminar rutas fijas
y dependencias personales, y permitir migrar/reconstruir toda la plataforma en
un VPS nuevo mediante scripts de bootstrap y restore, más healthcheck y backup
de plataforma. Esta fase **solo prepara scripts en modo `--dry-run`**; no
ejecuta instalaciones, restauraciones ni cambios en systemd.

## 2. Eliminación de rutas fijas

No se depende de `/root/saas-test`, `/root/opencode-bot` ni rutas personales.
Todas las ubicaciones se resuelven por variables de entorno:

| Variable | Propósito |
|---|---|
| `OPENCODE_HOME` | Raíz de la instalación de OpenCode |
| `WORKSPACE_ROOT` | Raíz de workspaces |
| `PROJECTS_ROOT` | Raíz de repositorios de proyectos |
| `BOT_DIR` | Directorio del bot |
| `SCRIPTS_DIR` | Directorio de scripts |
| `SECRETS_DIR` | Directorio de secretos |
| `CONFIG_DIR` | Directorio de configuración |
| `BACKUP_DIR` | Directorio de backups |

## 3. Scripts de portabilidad

| Script | Función |
|---|---|
| `bootstrap-vps-agentic.sh` | Instalación de dependencias base, usuarios, permisos |
| `restore-projects.sh` | Restauración de repositorios SaaS (git clone) |
| `restore-secrets.sh` | Restauración de secretos desde gestor seguro |
| `restore-services.sh` | Restauración de servicios systemd |
| `restore-database.sh` | Restauración de `.ops/` o DB |
| `healthcheck-platform.sh` | Validación de la plataforma completa |
| `backup-platform.sh` | Backup de toda la plataforma |

## 4. Proceso de migración

1. Crear un VPS nuevo.
2. Instalar dependencias base.
3. Crear usuarios y permisos.
4. Ejecutar `bootstrap-vps-agentic.sh`.
5. Restaurar OpenCode, OpenDesign, OpenWork.
6. Restaurar agentes y skills.
7. Restaurar repositorios SaaS (`restore-projects.sh`).
8. Restaurar `.ops/` o DB (`restore-database.sh`).
9. Restaurar secretos (`restore-secrets.sh`).
10. Restaurar servicios systemd (`restore-services.sh`).
11. Configurar Telegram.
12. Configurar GitHub App o token.
13. Ejecutar healthchecks (`healthcheck-platform.sh`).
14. Probar el SaaS piloto.
15. Habilitar los demás SaaS progresivamente.

## 5. Criterios de cierre

- El motor funciona en el VPS nuevo.
- No depende de rutas personales.
- Los repositorios se restauran correctamente.
- Los secretos se restauran por separado.
- Telegram vuelve a operar.
- GitHub puede crear ramas y PRs.
- Los servicios se recuperan.
- Un SaaS puede validarse sin intervención manual extensa.

## 6. Onboarding de cada SaaS

1. **SaaS-1 · Registro**: `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN.md`,
   `RUNBOOK.md`, `AGENTS.md`, `AGENT_POLICY.md`, JSON de registro.
2. **SaaS-2 · Detección del stack**: instalación, lint, typecheck, tests, build,
   start, migraciones, E2E, deploy, rollback, healthcheck.
3. **SaaS-3 · Playwright**: solo si existe frontend web.
4. **SaaS-4 · Baseline**: lint, typecheck, tests, build, E2E, screenshots,
   security scan, healthchecks iniciales.
5. **SaaS-5 · Skills locales**: `.opencode/skills/project-*`.
6. **SaaS-6 · Primera tarea controlada**: pequeña y real, con gates, PR, merge,
   staging, healthcheck y rollback.
7. **SaaS-7 · Habilitación operativa**: aislamiento, workspace, tests, Telegram,
   QA, rollback, logs, healthcheck, backup, costes, GitHub y staging.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Dependencia de rutas personales | Variables `*_DIR`/`*_ROOT`; scripts resolvieran por variables |
| Migración incompleta | Scripts de restore dedicados por dominio; checklist |
| Secretos endechos en archivos | `restore-secrets.sh` desde gestor seguro; nunca muestra valores |
| Servicios no arrancan en VPS nuevo | `restore-services.sh` (systemd) + healthcheck |
| Pérdida de `.ops/`/DB | `restore-database.sh` + `backup-platform.sh` |
| SaaS no validable | Onboarding paso a paso (SaaS-1..7) |

## 8. Plan de ejecución por lotes

- **Lote 1**: `bootstrap-vps-agentic.sh` + `healthcheck-platform.sh` +
  `backup-platform.sh`.
- **Lote 2**: `restore-projects.sh` + `restore-secrets.sh`.
- **Lote 3**: `restore-database.sh` + `restore-services.sh`.

## 9. Confirmación de alcance

Esta fase NO instala paquetes, NO crea usuarios, NO restaura proyectos o
secretos, NO toca systemd, NO ejecuta healthchecks reales ni backups. Todos
los scripts operan en modo `--dry-run` con `production_blocked: true`,
dejándolos preparados para ejecución futura con aprobación humana.