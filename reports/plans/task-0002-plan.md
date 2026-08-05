# Plan de Ejecución — task-0002: Implementar DXFInvalidLayerError

## 1. Objetivo y Alcance
- **Objetivo**: Agregar `DXFInvalidLayerError` en `backend/app/services/exceptions.py` y su test unitario asociado en `backend/tests/test_dxf_service.py`.
- **Archivos Objetivo**:
  - `backend/app/services/exceptions.py` (edición, ya existe)
  - `backend/tests/test_dxf_service.py` (edición, ya existe)
- **Alcance**: Solo definición de excepción + test. Sin integración en `dxf_service.py` durante esta tarea (scope mínimo).

## 2. Precondiciones y Entorno
- Rama actual de trabajo: `agent/dev/task-0001` (se creará `agent/dev/task-0002` en fase de implementación).
- `backend/app/services/exceptions.py` ya existe (creado en task-0001) con `DXFExportError` como `@dataclass`.
- `backend/tests/test_dxf_service.py` ya existe con 7 tests (task-0001) + fixture `exporter`.
- Entorno: `backend/.venv` (Python 3.11.15, pytest 8.4.1, ruff instalado).
- Pydantic v2, ezdxf 1.4.4.

## 3. Pasos de Implementación
1. Checkout a rama `agent/dev/task-0002`.
2. Aplicar refactor / lógica en `backend/app/services/exceptions.py`:
   - Agregar `DXFInvalidLayerError` heredando de `DXFExportError`.
   - Campos: `layer_name: str = ""`, `reason: str = ""`.
   - `__str__` enriquecido con layer + reason.
3. Escribir pruebas unitarias en `backend/tests/test_dxf_service.py`:
   - Test parametrizado `test_dxf_invalid_layer_error` con 3 casos (`missing`, `reserved`, `duplicated`).
   - Asertos: (a) atributos preservados, (b) `str()` contiene substring esperado, (c) es subclase de `DXFExportError`.
4. Ejecutar validación local con `pytest`:
   - `cd backend && .venv/bin/python -m pytest tests/test_dxf_service.py -v`
   - Esperado: 7 (task-0001) + 3 (parametrizados) = 10 tests pasan.
   - `cd backend && .venv/bin/python -m pytest tests/ -v` (sin regresión en `test_layouts_api.py`).
   - `cd backend && .venv/bin/python -m ruff check app/services/exceptions.py tests/test_dxf_service.py`.

### 3.1 Diseño detallado de `DXFInvalidLayerError`

```python
@dataclass
class DXFInvalidLayerError(DXFExportError):
    """Raised when a DXF layer reference is invalid or not found.

    Attributes:
        message: Human-readable description inherited from DXFExportError.
        layer_name: Name of the invalid/missing DXF layer.
        reason: Why the layer is invalid ('missing', 'reserved', 'duplicated', etc.).
    """
    layer_name: str = ""
    reason: str = ""

    def __str__(self) -> str:
        base = super().__str__()
        if self.layer_name:
            return f"{base} [layer={self.layer_name!r}, reason={self.reason!r}]"
        return base
```

### 3.2 Diseño detallado del test parametrizado

```python
import pytest
from app.services.exceptions import DXFExportError, DXFInvalidLayerError


@pytest.mark.parametrize(
    "layer_name, reason, expected_substring",
    [
        ("ARQ-INEXISTENTE", "missing", "ARQ-INEXISTENTE"),
        ("0", "reserved", "layer='0'"),
        ("MEP-FUENTES", "duplicated", "duplicated"),
    ],
)
def test_dxf_invalid_layer_error(exporter, layer_name, reason, expected_substring):
    err = DXFInvalidLayerError(message="invalid layer", layer_name=layer_name, reason=reason)
    assert err.layer_name == layer_name
    assert err.reason == reason
    assert expected_substring in str(err)
    assert isinstance(err, DXFExportError)
```

## 4. Análisis de Riesgos
| Riesgo | Impacto | Mitigación |
| :--- | :--- | :--- |
| Herencia de `@dataclass` con defaults en clase base (`DXFExportError.failed_entities`) rompa `__post_init__` | Medio | Validar en test que la instanciación funciona sin fallar; herencia simples con defaults no presenta conflicto en Python 3.11+. |
| Test parametrizado frágil ante cambios de formato en `__str__` | Bajo | Asertos sobre substring, no sobre texto exacto. |
| Import de `DXFInvalidLayerError` colisione con existentes | Bajo | Se añade al final del bloque de imports; `ruff` alertaría de duplicados. |
| Sin integración real deje la excepción sin uso | Bajo | Aceptado por scope mínimo (decisión del usuario). Se cubre en tarea futura. |

## 5. Criterios de Aceptación
- [ ] `DXFInvalidLayerError` definida en `backend/app/services/exceptions.py` heredando de `DXFExportError`.
- [ ] Test unitario `test_dxf_invalid_layer_error` en `backend/tests/test_dxf_service.py` verificando instanciación, `str()` y jerarquía.
- [ ] Tests en `pytest` pasando (10/10: 7 task-0001 + 3 parametrizados nuevos).
- [ ] Chequeos de `ruff check` limpios en `exceptions.py` y `test_dxf_service.py`.
- [ ] Sin regresión en `test_layouts_api.py` (2/2 pasados).
- [ ] `backend/app/services/dxf_service.py` NO modificado (scope mínimo respetado).

## 6. Decisiones acordadas con el usuario
1. **Jerarquía**: `DXFInvalidLayerError` hereda de `DXFExportError` (familia única de errores DXF).
2. **Uso operativo**: Solo definición + test (scope mínimo, sin integración en `dxf_service.py`).
3. **Detalle del test**: Un test parametrizado con 3 asertos por caso.
