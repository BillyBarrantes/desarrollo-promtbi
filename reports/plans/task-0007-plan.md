# Plan de ejecución — task-0007

## Objetivo

Implementar y validar los gates deterministas de la Fase 8.5.

## Alcance permitido

- `scripts/`
- `.opencode/commands/`
- `.ops/state/`
- `.ops/logs/`
- `reports/`
- `RUNBOOK.md`
- `AGENT_POLICY.md`

## Fuera de alcance

- `backend/`
- `frontend/`
- `infra/production/`
- `.env`
- `secrets/`
- `node_modules/`
- `dist/`

## Entregables

1. Gate de contrato.
2. Gate de seguridad.
3. QA determinista.
4. Release con aprobación humana.
5. Deploy exclusivo a staging.
6. Healthcheck verificable.
7. Rollback limitado a staging.
8. Bloqueo explícito de producción.
9. Pruebas negativas y reporte QA.

## Criterio de cierre

La tarea solo podrá pasar a release cuando todos los checks existan, se ejecuten y generen evidencia verificable.
