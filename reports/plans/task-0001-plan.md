# Plan de Ejecución — Task-0001: Validación de esquema en exportación DXF

- **Task ID:** task-0001
- **Estado:** planned
- **Agente:** planner
- **Fecha:** 2026-08-04
- **Archivos afectados (fase de implementación):** `backend/app/services/dxf_service.py`, `backend/app/services/exceptions.py` (nuevo), `backend/tests/test_dxf_service.py` (nuevo)

## 1. Objetivo

Refactorizar `backend/app/services/dxf_service.py` para que la exportación DXF maneje de forma robusta geometría no válida: registrar advertencias estructuradas y omitir entidades inválidas en lugar de abortar toda la exportación. Acompañar con pruebas unitarias en `backend/tests/`.

Conforme a `ARCHITECTURE.md` y `AGENTS.md`, se respeta la separación estricta entre lógica estocástica (Gemini) y validación determinista (Python). Esta tarea pertenece al dominio determinista de exportación.

## 2. Contexto técnico

- Stack: FastAPI (Python 3.13) + `ezdxf` + `pydantic` (`LayoutV1Response`).
- El servicio actual (254 líneas) ya valida `length > 0` en muros (línea 86) y `room.vertices` vacíos en textos (línea 139), pero:
  - No captura excepciones de `ezdxf` (bloques faltantes, escalas degeneradas, geometría nula).
  - No protege puertas/ventanas con `ancho_m <= 0` (arco radio 0 lanza `ValueError`).
  - No valida columnas con dimensiones degeneradas.
  - No reporta omisiones (MEP: nodos huérfanos se descartan en silencio en línea 183).
  - No existe `try/except` global: cualquier excepción aborta el endpoint.

## 3. Decisiones acordadas con el usuario

1. **Ubicación de `DXFExportError`**: `app/services/exceptions.py` (nuevo). Centraliza excepciones de dominio, reutilizable por otros servicios.
2. **Cobertura de tests**: los 7 tests unitarios propuestos.
3. **Comportamiento ante geometría irrecuperable**: omitir entidades inválidas y entregar DXF parcial con warnings. `DXFExportError` solo se lanza si el modelo está completamente vacío o el documento no puede construirse.

## 4. Modificaciones propuestas en `backend/app/services/dxf_service.py`

| # | Sección (línea actual) | Problema detectado | Cambio planificado |
|---|---|---|---|
| A | `add_blockref` (164-173) + `_furniture_dims` (241-254) | Si `block_type` no existe en la plantilla, `ezdxf` lanza `DXFTableEntryError`/`KeyError` y aborta todo. | Envolver `add_blockref` en `try/except` por bloque; `logger.warning` con `block_type` y `furn.id`; continuar. |
| B | Mobiliario (159) | Se acepta escala arbitraria sin validar `scale > 0`. | Guard `if furn.scale <= 0: logger.warning(...); continue`. |
| C | Muros (73-97) | Si `inicio == fin`, `length=0` evita el rectángulo pero `add_line` genera entidad degenerada. | Skip temprano con `logger.warning` antes de `add_line`. |
| D | Columnas (100-110) | Sin validación de `ancho_m > 0` y `largo_m > 0`. | Guard para columnas degeneradas. |
| E | Puertas (113-127) | `door.ancho_m <= 0` produce arco/línea inválida; `msp.add_arc` con radio 0 lanza `ValueError`. | Guard `if door.ancho_m > 0`. |
| F | Ventanas (130-135) | Mismo riesgo: `ancho_m <= 0`. | Guard equivalente. |
| G | Polilíneas terreno (60-63) y ambientes (66-70) | Si `vertices` vacío, `terrain_pts_closed[0]` lanza `IndexError`. | Guard `len(terrain_pts) >= 3`; `len(pts) >= 3` para ambientes. |
| H | MEP sanitaria (180-195) | `tramo.desde_nodo_id` o `hasta_nodo_id` no presentes en `all_nodes` → omisión silenciosa en línea 183. | Agregar `logger.warning` en rama `else`. |
| I | MEP eléctrica (212-223) | Sin manejo si `layout.instalaciones_MEP.electrica` o `tablero_general` vienen nulos. | Guard defensivo. |
| J | `generate_dxf` (32-238) | Ningún `try/except` global: cualquier excepción `ezdxf` aborta el endpoint sin estructura. | Envolver el cuerpo en `try/except` que capture `ezdxf.exceptions.DXFError`, `ValueError`, `IndexError`; los registre y propague como `DXFExportError` para que el endpoint responda 422/500 con estructura consistente. |
| K | Logging final (231-237) | No reporta entidades omitidas. | Acumular contadores `skipped_rooms/walls/furniture/...` e incluirlos en el `logger.info` final + `logger.warning` de resumen. |

**Restricción de alcance**: en la fase de implementación no se modificará el endpoint `/export`, los schemas `LayoutV1Response`, ni el validador determinista. Únicamente `dxf_service.py` y el nuevo módulo de excepciones.

## 5. Pruebas unitarias — `backend/tests/test_dxf_service.py` (nuevo)

Sigue el estilo de `test_layouts_api.py` (fixtures manuales con `LayoutV1Response`):

1. `test_generate_dxf_happy_path` — payload completo válido → retorna `BytesIO` no vacío, sin warnings.
2. `test_export_with_empty_terrain_vertices` — `coordenadas_terreno.vertices = []` → no lanza, omite polilínea, logga warning.
3. `test_export_with_collapsed_wall` — muro con `inicio == fin` → omitido, demás entidades presentes.
4. `test_export_with_missing_block_type` — mobiliario con `block_type="inexistente"` → warning y `furn` omitido; el resto del DXF se completa.
5. `test_export_raises_dxf_export_error_on_unrecoverable` — propaga `DXFExportError` cuando geometría es irrecuperable.
6. `test_export_with_negative_scale_furniture` — `scale=-1` → omitido con warning.
7. `test_export_orphan_mep_tramos` — `tramo` referencia nodo inexistente → omitido con warning; el resto del DXF OK.

**Estrategia de fixtures**: extraer helper `_build_layout(**overrides)` para reutilizar la plantilla base del `LayoutV1Response` en todas las variantes. Usar `caplog` para verificar los warnings en los tests 2, 3, 4, 6 y 7.

## 6. Verificación posterior a la implementación

- `python -m pytest backend/tests/test_dxf_service.py -v`
- `python -m pytest backend/tests/ -v` (regresión de `test_layouts_api.py`).
- `ruff check backend/app/services/dxf_service.py backend/app/services/exceptions.py backend/tests/test_dxf_service.py`
- `python -m mypy backend/app/services/dxf_service.py` (si está configurado).

## 7. Riesgos y mitigaciones

- **Riesgo**: silenciar errores oculta bugs de Gemini. **Mitigación**: cada omisión se loguea con `logger.warning` y se cuenta; el resumen final expone el total de omitidos.
- **Riesgo**: nuevo `DXFExportError` rompe el contrato del endpoint `/export`. **Mitigación**: solo se lanza en casos que antes ya abortaban (no cambia el flujo happy path). En la fase de implementación se confirmará el mapeo HTTP del endpoint.
- **Riesgo**: `ezdxf` no expone `DXFTableEntryError` para bloques faltantes en todas las versiones. **Mitigación**: capturar `ezdxf.exceptions.DXFError` como base y, si es necesario, `KeyError`.

## 8. Orden de ejecución para la fase de implementación

1. Crear `backend/app/services/exceptions.py` con `DXFExportError`.
2. Modificar `dxf_service.py`: importar `DXFExportError`, añadir guards A–I con logging, envolver cuerpo en try/except (J) y resumen de contadores (K).
3. Crear `backend/tests/test_dxf_service.py` con helper `_build_layout` y los 7 tests.
4. Ejecutar `pytest` + `ruff`.
5. Actualizar `task-0001.json` a `status: done`.

## 9. Criterios de aceptación de la tarea (verificados en esta fase de plan)

- [x] Plan detallado con modificaciones en `backend/app/services/dxf_service.py` (sección 4).
- [x] Definición de prueba unitaria en `backend/tests/` (sección 5).
- [x] Cero archivos modificados en esta fase: únicamente se actualiza `.ops/state/task-0001.json` y se agrega `reports/plans/task-0001-plan.md` (archivos de seguimiento, no de código).
