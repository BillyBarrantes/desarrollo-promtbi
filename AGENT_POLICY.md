# AGENT_POLICY.md - Gobernanza de Agentes IA

1. **Ramas Aisladas:** Todo cambio debe realizarse en `agent/{role}/task-{id}-{slug}`.
2. **Prohibición Directa:** Cero commits directos en `main` o `develop`.
3. **Límite de Reintentos:** Máximo 3 intentos autónomos en la corrección de tests/fallos.
4. **Validación Fuerte:** Ningún cambio de backend pasa sin ejecutar `pytest`.
5. **Locks y Estado:** Consultar `.ops/locks/repo.lock` antes de iniciar escritura y persistir en `.ops/state/task-XXXX.json`.
