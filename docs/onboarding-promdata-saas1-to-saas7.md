# Onboarding de promdata — SaaS-1 a SaaS-7

Estado: `draft` · Rama: `agent/task-0019` · Proyecto: `desarrollo-promtbi-main` · SaaS objetivo: `promdata` · Fase: `onboarding`

## 1. Objetivo del onboarding de promdata

Incorporar `promdata` a la plataforma mediante un proceso de onboarding en
7 fases (SaaS-1..SaaS-7), desde el registro formal hasta la habilitación
operativa completa. Esta fase **solo prepara scripts en modo `--dry-run`**; no
registra, detecta, instala, ejecuta tests ni habilita nada real.

## 2. SaaS-1: Registro

- Crear `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN.md`, `RUNBOOK.md`, `AGENTS.md`
  y `AGENT_POLICY.md`.
- Registrar un JSON de proyecto con: `project_id`, `workspace_root`, `stack`,
  `commands`, `healthcheck_url`, `allowed_paths`, `forbidden_paths`,
  `telegram_enabled`, `staging_enabled`.

## 3. SaaS-2: Detección del stack

Definir los comandos de la plataforma para `promdata`:
`install`, `lint`, `typecheck`, `tests`, `build`, `start`, `migration`,
`e2e`, `deploy`, `rollback`, `healthcheck`.

## 4. SaaS-3: Playwright

- Solo si existe frontend web.
- Instalar `@playwright/test`.
- Crear `playwright.config.ts`, `tests/e2e/` y `tests/visual/`.
- Configurar `baseURL`, servidor local, timeouts, screenshots, traces, retries,
  navegadores y artefactos.

## 5. SaaS-4: Baseline

- Ejecutar `lint`, `typecheck`, `tests`, `build`, `E2E`, `screenshots`,
  `security scan` y `healthcheck` iniciales.
- No aprobar si algo fue omitido o no generó evidencia.

## 6. SaaS-5: Skills locales

- Crear `.opencode/skills/project-domain/`, `project-api/`, `project-design/`
  y `project-qa/`.
- Describir las reglas propias del producto, sin repetir las políticas globales.

## 7. SaaS-6: Primera tarea controlada

- Pequeña y real (crear funcionalidad limitada, modificar backend o frontend).
- Ejecutar gates, Playwright y QA.
- Generar reporte y solicitar aprobación por Telegram.
- Crear PR, hacer merge, desplegar en staging, ejecutar healthcheck y probar
  rollback.

## 8. SaaS-7: Habilitación operativa

Verificar aislamiento, workspace, tests, Telegram, QA, rollback, logs,
healthcheck, backup, costes, GitHub y staging.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Registro incompleto | Checklist de documentos SaaS-1; JSON mínimo definido |
| Stack mal detectado | Comandos explícitos y validados en dry-run |
| Playwright innecesario | Solo se aplica si existe frontend web |
| Baseline sin evidencia | No aprobar si falta evidencia |
| Skills duplican políticas | Reglas solo específicas del producto |
| Primera tarea riesgosa | Pequeña, real, con gates + rollback |
| Habilitación prematura | Checklist SaaS-7 completo |

## 10. Plan de ejecución por lotes

- **Lote 1**: SaaS-1 (registro) + SaaS-2 (detección del stack).
- **Lote 2**: SaaS-3 (Playwright, si aplica) + SaaS-4 (baseline).
- **Lote 3**: SaaS-5 (skills locales) + SaaS-6 (primera tarea controlada).
- **Lote 4**: SaaS-7 (habilitación operativa).

## 11. Confirmación de alcance

Esta fase NO registra el proyecto, NO detecta el stack real, NO instala
Playwright, NO ejecuta baseline, NO crea skills, NO ejecuta tareas y NO habilita
operativamente nada. Todos los scripts operan en modo `--dry-run` con
`production_blocked: true`, quedando preparados para ejecución futura con
aprobación humana.