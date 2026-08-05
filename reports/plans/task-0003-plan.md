# Plan de Ejecución — task-0003: Agregar esquema de validacion de respuesta en DXF Service

## 1. Objetivo y Alcance
- **Objetivo**: Crear `DXFValidationResponse` (modelo pydantic) en `backend/app/schemas/dxf_validation.py` + función libre `validate_dxf(layout) -> DXFValidationResponse` en `backend/app/services/dxf_service.py`, con 5 tests en `backend/tests/test_dxf_service.py`.
- **Archivos Objetivo**:
  - `backend/app/schemas/dxf_validation.py` (nuevo)
  - `backend/app/services/dxf_service.py` (agregar `validate_dxf` SIN tocar `generate_dxf`)
  - `backend/tests/test_dxf_service.py` (nuevos tests)

## 2. Precondiciones y Entorno
- Rama actual: `agent/dev/task-0002`. Se creará `agent/dev/task-0003` en implementación.
- Stack: FastAPI + pydantic v2 + ezdxf 1.4.4.
- `backend/app/schemas/layout_v1.py` define `LayoutV1Response` (entrada de `validate_dxf`).
- Entorno: `backend/.venv` (Python 3.11.15, pytest 8.4.1, ruff).
- `DXFExportError` y `DXFInvalidLayerError` ya existen en `app/services/exceptions.py` (no se usarán en esta tarea — `validate_dxf` no lanza excepciones, solo devuelve `DXFValidationResponse`).

## 3. Pasos de Implementación

1. Checkout a rama `agent/dev/task-0003`.
2. Aplicar lógica en `backend/app/schemas/dxf_validation.py` (nuevo):

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DXFValidationResponse(BaseModel):
    """Estructura de salida para respuestas de validacion DXF."""
    estado: Literal["ok", "invalido"] = "ok"
    mensaje: str = ""
    project_id: str
    timestamp_utc: datetime
```

3. Aplicar lógica en `backend/app/services/dxf_service.py`:
   - Importar `DXFValidationResponse` desde `app.schemas.dxf_validation`.
   - Agregar función libre `validate_dxf(layout: LayoutV1Response) -> DXFValidationResponse` (fuera de la clase `DXFExporter`).
   - Reglas de negocio:
     - `len(layout.coordenadas_terreno.vertices) >= 3`
     - `len(layout.ambientes) >= 1`
     - `len(layout.muros_y_columnas.muros) >= 1`
   - Comportamiento:
     - Todas pasan → `estado="ok"`, `mensaje="Layout valido"`.
     - Alguna falla → `estado="invalido"`, `mensaje` con lista corta de motivos.
   - `project_id` y `timestamp_utc` se propagan desde `layout`.
   - **No modificar** `generate_dxf` en absoluto.

```python
def validate_dxf(layout: LayoutV1Response) -> DXFValidationResponse:
    motivos: list[str] = []
    if len(layout.coordenadas_terreno.vertices) < 3:
        motivos.append("terreno requiere >=3 vertices")
    if not layout.ambientes:
        motivos.append("sin ambientes")
    if not layout.muros_y_columnas.muros:
        motivos.append("sin muros")
    if motivos:
        return DXFValidationResponse(
            estado="invalido",
            mensaje="; ".join(motivos),
            project_id=layout.project_id,
            timestamp_utc=layout.timestamp_utc,
        )
    return DXFValidationResponse(
        estado="ok",
        mensaje="Layout valido",
        project_id=layout.project_id,
        timestamp_utc=layout.timestamp_utc,
    )
```

4. Escribir pruebas unitarias en `backend/tests/test_dxf_service.py`:
   - `test_validate_dxf_ok` — layout base → `estado="ok"`, `mensaje="Layout valido"`, propaga `project_id` y `timestamp_utc`.
   - `test_validate_dxf_no_terrain` — `coordenadas_terreno.vertices` con < 3 → `estado="invalido"`, `mensaje` menciona "terreno".
   - `test_validate_dxf_no_rooms` — `ambientes=[]` → `estado="invalido"`, `mensaje` menciona "ambientes".
   - `test_validate_dxf_no_walls` — `muros=[]` → `estado="invalido"`, `mensaje` menciona "muros".
   - `test_dxf_validation_response_schema_keys` — valida que el schema expone exactamente las claves `estado`, `mensaje`, `project_id`, `timestamp_utc` (vía `DXFValidationResponse.model_fields.keys()`).
   - Se reutiliza el helper `_build_layout(**overrides)` existente (task-0001).

5. Ejecutar validación local con `pytest`:
   - `cd backend && .venv/bin/python -m pytest tests/ -v`
   - **Esperado**: 12 anteriores + 5 nuevos = **17 tests pasan**.
   - `cd backend && .venv/bin/python -m pytest tests/test_layouts_api.py -v` (sin regresión).
   - `cd backend && .venv/bin/python -m ruff check app/schemas/dxf_validation.py app/services/dxf_service.py tests/test_dxf_service.py`.

## 4. Análisis de Riesgos
| Riesgo | Impacto | Mitigación |
| :--- | :--- | :--- |
| `LayoutV1Response` ya valida `min_length=3` en `vertices` — el test `no_terrain` no puede construirse vía pydantic | Medio | Mutar el modelo en memoria post-validación (`layout.coordenadas_terreno.vertices.clear()`) como ya hace `test_export_with_empty_terrain_vertices` (task-0001). |
| `muros_y_columnas.muros` es `list[Wall]` sin default — schema no admite vacío en construcción | Bajo | Mutar en memoria después de construir con un muro válido y luego `layout.muros_y_columnas.muros.clear()`. |
| `validate_dxf` como función libre puede chocar con imports existentes | Bajo | Agregar import al inicio del archivo; ruff alerta duplicados. |
| Sin integración con endpoint deja función sin uso | Bajo | Aceptado por scope mínimo. Integración con endpoint será tarea futura. |
| `timestamp_utc` propagation timezone | Bajo | Se propaga el objeto `datetime` del layout directamente (ya viene en UTC desde `LayoutV1Response`). |

## 5. Criterios de Aceptación
- [ ] `DXFValidationResponse` definida en `backend/app/schemas/dxf_validation.py` con claves `estado`, `mensaje`, `project_id`, `timestamp_utc`.
- [ ] Función libre `validate_dxf(layout) -> DXFValidationResponse` en `backend/app/services/dxf_service.py`, sin modificar `generate_dxf`.
- [ ] 5 tests unitarios en `backend/tests/test_dxf_service.py` (1 ok + 3 inválidos + 1 claves del schema).
- [ ] Tests en `pytest` pasando (17/17: 12 anteriores + 5 nuevos).
- [ ] Chequeos de `ruff check` limpios en los 3 archivos modificados.
- [ ] Sin regresión en `test_layouts_api.py` (2/2 pasados).
- [ ] `generate_dxf` NO modificado (criterio de alcance cumplimiento).

## 6. Decisiones acordadas con el usuario
1. **Estructura de salida**: modelo pydantic nuevo `DXFValidationResponse` (no dict plano).
2. **Ubicación del esquema**: `app/schemas/dxf_validation.py` (archivo nuevo).
3. **Claves mínimas**: `estado`, `mensaje`, `project_id`, `timestamp_utc`.
4. **Integración**: función libre `validate_dxf(layout) -> DXFValidationResponse`, sin tocar `generate_dxf`.
5. **Ubicación de función**: función libre en `dxf_service.py` (no `@staticmethod` en `DXFExporter`).
6. **Reglas de `estado="invalido"`**: las 3 base (terreno ≥ 3 vértices, ≥ 1 ambiente, ≥ 1 muro).
7. **Suite de tests**: 5 tests (1 ok + 3 inválidos + 1 claves del schema).
