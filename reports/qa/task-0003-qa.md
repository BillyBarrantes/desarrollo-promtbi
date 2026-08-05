# Informe de QA — Task-0003: Esquema de Validación de Respuesta DXF

| Campo | Valor |
|---|---|
| **Task ID** | task-0003 |
| **Fecha** | 2026-08-04 |
| **Rama** | `agent/dev/task-0003` |
| **Agente QA** | qa-reviewer |
| **Intérprete** | Python 3.11.15 (`backend/.venv`) |
| **Plan de referencia** | `reports/plans/task-0003-plan.md` |
| **Estado previo** | `awaiting_qa` (dev-worker) |
| **Veredicto** | **APPROVED** |

## 1. Pruebas unitarias

```
cd backend && .venv/bin/python -m pytest -v --tb=short
```

| # | Test | Estado | Origen |
|---|---|---|---|
| 1 | `test_generate_dxf_happy_path` | PASSED | task-0001 |
| 2 | `test_export_with_empty_terrain_vertices` | PASSED | task-0001 |
| 3 | `test_export_with_collapsed_wall` | PASSED | task-0001 |
| 4 | `test_export_with_missing_block_type` | PASSED | task-0001 |
| 5 | `test_export_raises_dxf_export_error_on_unrecoverable` | PASSED | task-0001 |
| 6 | `test_export_with_non_positive_scale_furniture` | PASSED | task-0001 |
| 7 | `test_export_orphan_mep_tramos` | PASSED | task-0001 |
| 8-10 | `test_dxf_invalid_layer_error[*]` (3 casos parametrizados) | PASSED | task-0002 |
| 11 | `test_validate_dxf_ok` | PASSED | task-0003 (nuevo) |
| 12 | `test_validate_dxf_no_terrain` | PASSED | task-0003 (nuevo) |
| 13 | `test_validate_dxf_no_rooms` | PASSED | task-0003 (nuevo) |
| 14 | `test_validate_dxf_no_walls` | PASSED | task-0003 (nuevo) |
| 15 | `test_dxf_validation_response_schema_keys` | PASSED | task-0003 (nuevo) |
| 16 | `test_layouts_api.py::test_generate_layout_ok` | PASSED | regresión |
| 17 | `test_layouts_api.py::test_generate_layout_rejected_by_deterministic_validator` | PASSED | regresión |

- **Total**: 17 tests, 17 pasados, 0 fallidos.
- **Tiempo**: 4.00 s.
- **Plataforma**: darwin, pytest-8.4.1, pluggy-1.6.0.

## 2. Análisis estático (ruff)

```
cd backend && .venv/bin/python -m ruff check \
  app/schemas/dxf_validation.py \
  app/services/dxf_service.py \
  tests/test_dxf_service.py
```

- **Resultado**: `All checks passed!` (exit 0).
- **Nota**: El error `I001` (orden de imports) detectado por dev-worker fue corregido en su reintento #1. La verificación QA confirma el estado limpio.

## 3. Cobertura de criterios de aceptación

| Criterio del plan | Estado | Verificación |
|---|---|---|
| `DXFValidationResponse` definida en `backend/app/schemas/dxf_validation.py` | Cumplido | Modelo pydantic con claves `estado` (Literal), `mensaje` (str), `project_id` (str), `timestamp_utc` (datetime). |
| Función libre `validate_dxf(layout) -> DXFValidationResponse` en `dxf_service.py` sin modificar `generate_dxf` | Cumplido | Función agregada al final del módulo fuera de `DXFExporter`. `generate_dxf` intacto (verificado por diff del dev-worker). |
| 5 tests unitarios (1 ok + 3 inválidos + 1 claves del schema) | Cumplido | `test_validate_dxf_ok`, `test_validate_dxf_no_terrain`, `test_validate_dxf_no_rooms`, `test_validate_dxf_no_walls`, `test_dxf_validation_response_schema_keys`. |
| Tests en `pytest` pasando (17/17) | Cumplido | 17 passed en 4.00 s. |
| `ruff check` limpio en archivos modificados | Cumplido | All checks passed! |
| Sin regresión en `test_layouts_api.py` | Cumplido | 2/2 pasados. |
| `generate_dxf` NO modificado | Cumplido | Solo se agregó import de `DXFValidationResponse` y la función libre `validate_dxf` al final del archivo. |

## 4. Hallazgos

1. **Alcance respetado**: `generate_dxf` permanece completamente intacto. La función `validate_dxf` se agregó como función libre al final del módulo, sin acoplamiento con la clase `DXFExporter`.
2. **Reglas de negocio mínimas**: las 3 reglas confirmadas (terreno ≥ 3 vértices, ≥ 1 ambiente, ≥ 1 muro) están implementadas exactamente como en el plan, con mensajes en español y separados por `"; "`.
3. **Schema pydantic idiomático**: `DXFValidationResponse` usa `Literal["ok", "invalido"]` para `estado`, evitando strings arbitrarios. Coherente con `LayoutV1Response`.
4. **Tests usan mutación en memoria**: los tests `no_terrain`/`no_rooms`/`no_walls` mutan el modelo post-construcción (técnica ya usada en task-0001), dado que el schema pydantic impide construir directamente con valores inválidos. Es un patrón consistente.
5. **Reintento consumido**: dev-worker usó 1 de 3 reintentos permitidos por `AGENT_POLICY.md` §3 para corregir orden de imports (ruff `I001`). Dentro del límite.
6. **Política de ramas**: trabajo en `agent/dev/task-0003`, conforme a `AGENT_POLICY.md` §1, sin commits directos a `main`/`develop` (§2).
7. **Deuda técnica**: `validate_dxf` no está integrada con ningún endpoint (scope mínimo aceptado). Tarea futura podría exponerla vía `/api/v1/layouts/validate`.

## 5. Veredicto

```
APPROVED
```

Todas las pruebas pasan (17/17), ruff limpio en los 3 archivos modificados, criterios de aceptación del plan cumplidos, sin regresiones. La tarea está lista para aprobación humana y merge.

## 6. Próximos pasos recomendados

1. **Aprobación humana**: revisar diff de `agent/dev/task-0003` y aprobar merge.
2. **PR hacia `main`** (vía `pr-review` skill o revisión manual):
   - `backend/app/schemas/dxf_validation.py` (nuevo)
   - `backend/app/services/dxf_service.py` (función libre `validate_dxf` agregada)
   - `backend/tests/test_dxf_service.py` (5 tests nuevos)
3. **Actualización final de estado** a `done` tras el merge (fuera del alcance de esta auditoría).
4. **Iteración futura (opcional)**: integrar `validate_dxf` con un endpoint FastAPI para exponer el esquema vía API.
