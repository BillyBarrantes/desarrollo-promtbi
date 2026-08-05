# Informe de QA — Task-0004: Validar manejo de archivos DXF vacíos o sin capas

| Campo | Valor |
|---|---|
| **Task ID** | task-0004 |
| **Fecha** | 2026-08-04 |
| **Rama** | `agent/dev/task-0004` |
| **Agente QA** | qa-reviewer |
| **Intérprete** | Python 3.11.15 (`backend/.venv`) |
| **Plan de referencia** | `reports/plans/task-0004-plan.md` |
| **Estado previo** | `awaiting_qa` (dev-worker) |
| **Veredicto** | **APPROVED** |

## 1. Pruebas unitarias

```
cd backend && .venv/bin/python -m pytest -v --tb=short
```

| # | Test | Estado | Origen |
|---|---|---|---|
| 1-7 | Tests de exportación DXF (happy path + 6 casos borde) | PASSED | task-0001 |
| 8-10 | `test_dxf_invalid_layer_error[*]` (3 casos parametrizados) | PASSED | task-0002 |
| 11-15 | `test_validate_dxf_*` (4 tests + 1 claves del schema) | PASSED | task-0003 |
| 16 | `test_export_with_empty_layout_raises_dxf_empty_document_error` | PASSED | task-0004 (nuevo) |
| 17 | `test_layouts_api.py::test_generate_layout_ok` | PASSED | regresión |
| 18 | `test_layouts_api.py::test_generate_layout_rejected_by_deterministic_validator` | PASSED | regresión |

- **Total**: 18 tests, 18 pasados, 0 fallidos.
- **Tiempo**: 0.99 s.
- **Plataforma**: darwin, pytest-8.4.1, pluggy-1.6.0.

## 2. Análisis estático (ruff)

```
cd backend && .venv/bin/python -m ruff check \
  app/services/exceptions.py \
  app/services/dxf_service.py \
  tests/test_dxf_service.py
```

- **Resultado**: `All checks passed!` (exit 0).
- **Nota**: Dev-worker ejecutó verde al primer intento; sin necesidad de autocorrección (0 reintentos usados de 3 permitidos).

## 3. Cobertura de criterios de aceptación

| Criterio del plan | Estado | Verificación |
|---|---|---|
| `DXFEmptyDocumentError` definida en `backend/app/services/exceptions.py` heredando de `DXFExportError` con `expected_count: int = 0` y `__str__` enriquecido | Cumplido | `@dataclass` con `expected_count: int = 0` y `f"{base} [expected={self.expected_count}]"`. |
| `generate_dxf` lanza `DXFEmptyDocumentError` cuando `total_generated == 0` (ninguna entidad válida generada) | Cumplido | Guard insertado antes de `doc.write`, calcula `total_generated` sumando ambientes + muros + mobiliario + puntos eléctricos + nodos MEP. |
| 1 test unitario `test_export_with_empty_layout_raises_dxf_empty_document_error` en `backend/tests/test_dxf_service.py` | Cumplido | Test con 3 subasertos: jerarquía (`isinstance DXFExportError`), mensaje (`"empty document" in str`), `expected_count == 0`. |
| Tests en `pytest` pasando (18/18) | Cumplido | 18 passed en 0.99 s. |
| `ruff check` limpio en los 3 archivos modificados | Cumplido | All checks passed! |
| Sin regresión en `test_layouts_api.py` | Cumplido | 2/2 pasados. |
| `generate_dxf` sigue exportando DXF parciales cuando algunas entidades se generan | Cumplido | El guard solo aborta si `total_generated == 0`; cualquier layout con al menos 1 entidad válida sigue su flujo normal (verificado por los 15 tests precedentes que no esperan `DXFEmptyDocumentError`). |

## 4. Hallazgos

1. **Ubicación óptima del guard**: el check se inserta antes de `doc.write(text_stream)`, evitando serializar un documento vacío innecesariamente. Buena práctica de eficiencia.
2. **No captura accidental**: `DXFEmptyDocumentError` hereda de `DXFExportError` → `Exception`, no de `DXFError`/`ValueError`/`IndexError`. El `except (DXFError, ValueError, IndexError)` preexistente en `generate_dxf` no la intercepta, permitiendo que se propague limpiamente hacia el endpoint.
3. **Contador inclusivo**: `total_generated` considera MEP nodos (`nodos_agua` + `nodos_desague`) y puntos eléctricos como entidades positivas, dado que estos siempre dibujan círculos/puntos sin guard. Coherente con el comportamiento ya implementado en tasks anteriores.
4. **Mutación en memoria del test**: el test vacía todas las colecciones del modelo post-construcción (patrón consistente con task-0001 y task-0003), evitando las restricciones `min_length` del schema.
5. **3 subasertos robustos**: el test verifica tipo, mensaje y campo `expected_count` — cobertura completa del contrato de la nueva excepción.
6. **Cero reintentos**: dev-worker completó verde al primer intento; política de `AGENT_POLICY.md` §3 respetada con margen amplio.
7. **Política de ramas**: trabajo en `agent/dev/task-0004`, conforme a `AGENT_POLICY.md` §1, sin commits directos a `main`/`develop` (§2).

## 5. Veredicto

```
APPROVED
```

Todas las pruebas pasan (18/18), ruff limpio en los 3 archivos modificados, criterios de aceptación del plan cumplidos, sin regresiones. La jerarquía de excepciones `DXFExportError` → `DXFInvalidLayerError` / `DXFEmptyDocumentError` queda coherente y completa para el dominio DXF. La tarea está lista para aprobación humana y merge.

## 6. Próximos pasos recomendados

1. **Aprobación humana**: revisar diff de `agent/dev/task-0004` y aprobar merge.
2. **PR hacia `main`** (vía `pr-review` skill o revisión manual):
   - `backend/app/services/exceptions.py` (nueva `DXFEmptyDocumentError`)
   - `backend/app/services/dxf_service.py` (guard antes de `doc.write`)
   - `backend/tests/test_dxf_service.py` (nuevo test 16)
3. **Actualización final de estado** a `done` tras el merge (fuera del alcance de esta auditoría).
4. **Estado acumulado del dominio DXF**: tras merge de task-0004, el servicio `dxf_service.py` contará con:
   - Guards A–K de geometría inválida (task-0001)
   - `DXFInvalidLayerError` (task-0002)
   - `validate_dxf(layout) -> DXFValidationResponse` (task-0003)
   - `DXFEmptyDocumentError` y guard de documento vacío (task-0004)
   Queda como deuda técnica futura: (a) integrar `validate_dxf` con un endpoint FastAPI y (b) lanzar `DXFInvalidLayerError` desde `dxf_service.py` cuando se validen capas referenciadas contra el template.
