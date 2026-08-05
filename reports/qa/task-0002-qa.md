# Informe de QA — Task-0002: Implementar DXFInvalidLayerError

| Campo | Valor |
|---|---|
| **Task ID** | task-0002 |
| **Fecha** | 2026-08-04 |
| **Rama** | `agent/dev/task-0002` |
| **Agente QA** | qa |
| **Intérprete** | Python 3.11.15 (`backend/.venv`) |
| **Plan de referencia** | `reports/plans/task-0002-plan.md` |
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
| 8 | `test_dxf_invalid_layer_error[ARQ-INEXISTENTE-missing-ARQ-INEXISTENTE]` | PASSED | task-0002 (nuevo) |
| 9 | `test_dxf_invalid_layer_error[0-reserved-layer='0']` | PASSED | task-0002 (nuevo) |
| 10 | `test_dxf_invalid_layer_error[MEP-FUENTES-duplicated-duplicated]` | PASSED | task-0002 (nuevo) |
| 11 | `test_layouts_api.py::test_generate_layout_ok` | PASSED | regresión |
| 12 | `test_layouts_api.py::test_generate_layout_rejected_by_deterministic_validator` | PASSED | regresión |

- **Total**: 12 tests, 12 pasados, 0 fallidos.
- **Tiempo**: 0.67 s.
- **Plataforma**: darwin, pytest-8.4.1, pluggy-1.6.0.

## 2. Análisis estático (ruff)

```
cd backend && .venv/bin/python -m ruff check app/services/exceptions.py tests/test_dxf_service.py
```

- **Resultado**: `All checks passed!` (exit 0).
- **Nota**: `ruff check .` global reporta 27 errores preexistentes en `crear_plantilla.py` (auxiliar fuera de scope de esta tarea). Los dos archivos modificados por task-0002 están limpios.

## 3. Cobertura de criterios de aceptación

| Criterio del plan | Estado | Verificación |
|---|---|---|
| Excepción `DXFInvalidLayerError` definida en `exceptions.py` | Cumplido | Hereda de `DXFExportError`, campos `layer_name`/`reason` con defaults `""`, `__str__` enriquecido con `[layer=..., reason=...]` |
| Test unitario en `test_dxf_service.py` verificando la excepción | Cumplido | `test_dxf_invalid_layer_error` parametrizado con 3 casos (`missing`, `reserved`, `duplicated`) cubriendo atributos, `str()` y jerarquía |
| Scope mínimo respetado | Cumplido | `dxf_service.py` NO fue modificado |
| Sin regresión en `test_layouts_api.py` | Cumplido | 2/2 pasados |
| `ruff check` limpio en archivos modificados | Cumplido | exit 0 |

## 4. Hallazgos

1. **Jerarquía coherente**: `DXFInvalidLayerError` hereda correctamente de `DXFExportError`. El test 8 verifica `isinstance(err, DXFExportError)`, confirmando que una captura genérica atrapa ambas excepciones.
2. **Defaults consistentes**: la subclase añade `message: str = ""` para sobreescribir el default obligatorio de la base, permitiendo instanciación con solo `layer_name`/`reason`. No se rompe el `__post_init__` heredado.
3. **Test parametrizado estable**: los 3 casos verifican asertos sobre substrings (no strings exactos), evitando fragilidad ante cambios menores de formato.
4. **Cero reintentos**: el dev-worker ejecutó verde al primer intento; sin necesidad de auto-corrección.
5. **Política de ramas**: trabajo en `agent/dev/task-0002`, conforme a `AGENT_POLICY.md` §1, sin commits directos a `main`/`develop` (§2).
6. **Deuda técnica futura**: la excepción está definida pero no lanzada desde `dxf_service.py` (por decisión de scope mínimo). Tarea futura debería integrarla donde se validan capas.

## 5. Veredicto

```
APPROVED
```

Todas las pruebas pasan (12/12), ruff limpio en archivos modificados, criterios de aceptación del plan cumplidos, sin regresiones. La tarea está lista para aprobación humana y merge.

## 6. Próximos pasos recomendados

1. **Aprobación humana**: revisar diff de `agent/dev/task-0002` y aprobar merge.
2. **PR hacia `main`** (vía `pr-review` skill o revisión manual):
   - `backend/app/services/exceptions.py` (nueva clase)
   - `backend/tests/test_dxf_service.py` (nuevo test parametrizado)
3. **Actualización final de estado** a `done` tras el merge (fuera del alcance de esta auditoría).
4. **Iteración futura (opcional)**: integrar `DXFInvalidLayerError` en `dxf_service.py` cuando se validen capas referenciadas contra el template.
