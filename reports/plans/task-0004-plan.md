# Plan de Ejecución — task-0004: Validar manejo de archivos DXF vacios o sin capas

## 1. Objetivo y Alcance
- **Objetivo**: Crear `DXFEmptyDocumentError` (excepción hija de `DXFExportError`) e integrar su lanzamiento en `DXFExporter.generate_dxf` cuando el `LayoutV1Response` de entrada no produce **ninguna** entidad válida, con 1 test enfocado.
- **Archivos Objetivo**:
  - `backend/app/services/exceptions.py` (agregar `DXFEmptyDocumentError`)
  - `backend/app/services/dxf_service.py` (modificar `generate_dxf`: contador de entidades generadas + guard al final)
  - `backend/tests/test_dxf_service.py` (nuevo test de documento vacío)

## 2. Precondiciones y Entorno
- Rama actual: `agent/dev/task-0003`. Se creará `agent/dev/task-0004` en implementación.
- Stack: FastAPI + pydantic v2 + ezdxf 1.4.4.
- `DXFExportError` ya existe en `app/services/exceptions.py` con `message`, `failed_entities`, `__post_init__` y `__str__` (usado en task-0001).
- `DXFExporter.generate_dxf` ya cuenta con guards A–K + `skipped` dict (task-0001); aquí reutilizamos los contadores `skipped` para decidir si el documento quedó vacío.
- Entorno: `backend/.venv` (Python 3.11.15, pytest 8.4.1, ruff instalado).
- Estado previo: `pytest` 17/17 pasan (post task-0003).

## 3. Pasos de Implementación

1. Checkout a rama `agent/dev/task-0004`.
2. Aplicar lógica en `backend/app/services/exceptions.py`:

```python
@dataclass
class DXFEmptyDocumentError(DXFExportError):
    """Raised when a DXF export produces an empty document (no valid entities).

    Attributes:
        message: Inherited from DXFExportError.
        failed_entities: Inherited; typically [] for this error.
        expected_count: Total entities the exporter attempted before declaring empty.
    """
    expected_count: int = 0

    def __str__(self) -> str:
        base = super().__str__()
        return f"{base} [expected={self.expected_count}]"
```

3. Aplicar lógica en `backend/app/services/dxf_service.py`:
   - Importar `DXFEmptyDocumentError`.
   - En `generate_dxf`, tras todo el cuerpo del `try` y justo antes de escribir el `byte_stream`:
     - Calcular `total_generated = (len(layout.ambientes) - len(skipped["rooms"])) + (len(layout.muros_y_columnas.muros) - len(skipped["walls"])) + (len(layout.mobiliario) - len(skipped["furniture"])) + (len(elec.puntos)) + (len(san.nodos_agua) + len(san.nodos_desague))`.
     - Si `total_generated == 0`:
       - loguear `logger.error("DXF export produced an empty document")`.
       - levantar `DXFEmptyDocumentError(message="DXF export produced an empty document", expected_count=0)`.
   - **Importante**: insertar el guard **antes** de `doc.write(...)` para no serializar un documento vacío innecesariamente.
   - El guard se hace dentro del `try` existente (no dentro del `except`), de modo que `DXFEmptyDocumentError` se propaga sin ser capturado por `except (DXFError, ValueError, IndexError)` (que captura errores de ezdxf, no esta nueva excepción de dominio).
4. Escribir prueba unitaria en `backend/tests/test_dxf_service.py`:

```python
def test_export_with_empty_layout_raises_dxf_empty_document_error(exporter: DXFExporter):
    layout = _build_layout()
    layout.coordenadas_terreno.vertices.clear()
    layout.ambientes.clear()
    layout.muros_y_columnas.muros.clear()
    layout.muros_y_columnas.columnas.clear()
    layout.puertas_ventanas.puertas.clear()
    layout.puertas_ventanas.ventanas.clear()
    layout.mobiliario.clear()
    layout.instalaciones_MEP.sanitaria.nodos_agua.clear()
    layout.instalaciones_MEP.sanitaria.nodos_desague.clear()
    layout.instalaciones_MEP.sanitaria.tramos.clear()
    layout.instalaciones_MEP.electrica.puntos.clear()
    with pytest.raises(DXFEmptyDocumentError):
        exporter.generate_dxf(layout)
```

5. Ejecutar validación local con `pytest`:
   - `cd backend && .venv/bin/python -m pytest tests/ -v`
   - **Esperado**: 17 anteriores + 1 nuevo = **18 tests pasan**.
   - `cd backend && .venv/bin/python -m pytest tests/test_layouts_api.py -v` (sin regresión).
   - `cd backend && .venv/bin/python -m ruff check app/services/exceptions.py app/services/dxf_service.py tests/test_dxf_service.py`.

## 4. Análisis de Riesgos
| Riesgo | Impacto | Mitigación |
| :--- | :--- | :--- |
| `LayoutV1Response` no admite `vertices` vacío vía schema (`min_length=3`) | Medio | Construir con 3 vértices válidos, luego mutar `layout.coordenadas_terreno.vertices.clear()` en memoria (patrón task-0001). Similar para `ambientes`/`puertas_ventanas` que son listas con default factory, admiten vacío. |
| `instalaciones_MEP.sanitaria.tramos` con `min_length` implícito | Bajo | `PipeSegment` es `list[PipeSegment]` sin `min_length` en `SanitaryNetwork`; admite `[]`. Idem `puntos`. |
| Captura accidental de `DXFEmptyDocumentError` en `except (DXFError, ValueError, IndexError)` | Alto | Asegurar que el guard se ejecuta tras el bloque que construye todas las entidades, pero la comparación de `total_generated == 0` no lanza `DXFError`/`ValueError`/`IndexError`; `DXFEmptyDocumentError` hereda de `DXFExportError` que hereda de `Exception`, no de esos tres. |
| Modelos mutados rompiendo invariantes post-validación | Bajo | Pydantic v2 por defecto valida al construir; mutación posterior no re-valida salvo `validate_on_assignment`. Tests previos ya usaron este patrón sin problema. |
| Contador `total_generated` mal calculado | Medio | Apoyarse en `skipped` dict + `len(...)` de las listas del layout. Incluir nodos MEP y puntos eléctricos como entidades positivas (ya se dibujaban sin guard). |
| Doble guard con `total_skipped` del logger | Bajo | Los logs de `skipped` se mantienen tal cual; el nuevo guard decide abortar vs. continuar. |

## 5. Criterios de Aceptación
- [ ] `DXFEmptyDocumentError` definida en `backend/app/services/exceptions.py` heredando de `DXFExportError`, con `expected_count: int = 0` y `__str__` enriquecido.
- [ ] `generate_dxf` lanza `DXFEmptyDocumentError` cuando `total_generated == 0` (ninguna entidad válida generada).
- [ ] 1 test unitario `test_export_with_empty_layout_raises_dxf_empty_document_error` en `backend/tests/test_dxf_service.py` cubriendo el caso borde.
- [ ] Tests en `pytest` pasando (18/18: 17 anteriores + 1 nuevo).
- [ ] Chequeos de `ruff check` limpios en los 3 archivos modificados.
- [ ] Sin regresión en `test_layouts_api.py` (2/2 pasados).
- [ ] `generate_dxf` existente sigue exportando DXF parciales cuando **algunas** entidades se generan (no se vuelve ultra-estricto).

## 6. Decisiones acordadas con el usuario
1. **Alcance del documento vacío**: documento DXF *resultante* vacío (layout de entrada no produce ninguna entidad). No incluye plantilla cargada inválida.
2. **Excepción**: nueva `DXFEmptyDocumentError` heredando de `DXFExportError` en `backend/app/services/exceptions.py` (coherente con `DXFInvalidLayerError` de task-0002).
3. **Condición de disparo**: lanzar **solo si ninguna** entidad válida fue generada (no se vuelve estricto ante documentos parciales).
4. **Suite de tests**: 1 test enfocado en layout totalmente vacío con sus subasertos (cubre el caso borde exhaustivamente).
