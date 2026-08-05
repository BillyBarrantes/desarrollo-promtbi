"""Unit tests for the DXF export service (task-0001).

Validates that invalid geometry is skipped with warnings instead of aborting
the whole export, and that unrecoverable failures raise ``DXFExportError``.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import pytest

from app.schemas.dxf_validation import DXFValidationResponse
from app.schemas.layout_v1 import LayoutV1Response
from app.services.dxf_service import DXFExporter, validate_dxf
from app.services.exceptions import (
    DXFEmptyDocumentError,
    DXFExportError,
    DXFInvalidLayerError,
)


def _base_payload() -> dict[str, Any]:
    """Minimal but structurally complete LayoutV1Response payload."""
    return {
        "version": "v1.1",
        "project_id": "proj-test",
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "coordenadas_terreno": {
            "unidad": "m",
            "area_total_m2": 120.0,
            "vertices": [
                {"x": 0, "y": 0},
                {"x": 10, "y": 0},
                {"x": 10, "y": 12},
                {"x": 0, "y": 12},
            ],
        },
        "ambientes": [
            {
                "id": "room-1",
                "nombre": "Sala",
                "uso": "social",
                "vertices": [
                    {"x": 0, "y": 0},
                    {"x": 5, "y": 0},
                    {"x": 5, "y": 5},
                    {"x": 0, "y": 5},
                ],
                "area_m2": 25.0,
            }
        ],
        "muros_y_columnas": {
            "muros": [
                {
                    "id": "m1",
                    "tipo": "portante",
                    "inicio": {"x": 0, "y": 0},
                    "fin": {"x": 10, "y": 0},
                    "espesor_m": 0.2,
                }
            ],
            "columnas": [
                {
                    "id": "c1",
                    "centro": {"x": 1, "y": 1},
                    "ancho_m": 0.25,
                    "largo_m": 0.25,
                    "estructural": True,
                }
            ],
        },
        "puertas_ventanas": {
            "puertas": [
                {
                    "id": "d1",
                    "tipo": "principal",
                    "host_wall_id": "m1",
                    "offset_m": 0.5,
                    "posicion": {"x": 1, "y": 0},
                    "ancho_m": 0.9,
                    "alto_m": 2.1,
                    "abatimiento": "derecha",
                }
            ],
            "ventanas": [
                {
                    "id": "w1",
                    "host_wall_id": "m1",
                    "offset_m": 1.5,
                    "posicion": {"x": 2, "y": 0},
                    "ancho_m": 1.2,
                    "alto_m": 1.0,
                    "antepecho_m": 0.9,
                    "tipo": "corrediza",
                }
            ],
        },
        "mobiliario": [
            {
                "id": "f1",
                "block_type": "cama",
                "insertion": {"x": 2.0, "y": 2.0},
                "rotation_deg": 0,
                "scale": 1.0,
                "room_id": "room-1",
                "metadata": {"source": "test"},
            }
        ],
        "instalaciones_MEP": {
            "sanitaria": {
                "montante_id": "r1",
                "nodos_agua": [
                    {
                        "id": "wa1",
                        "tipo": "lavamanos",
                        "ambiente": "bano",
                        "ubicacion": {"x": 3, "y": 4},
                    }
                ],
                "nodos_desague": [
                    {
                        "id": "wd1",
                        "tipo": "inodoro",
                        "ambiente": "bano",
                        "ubicacion": {"x": 3, "y": 4.5},
                    }
                ],
                "tramos": [
                    {
                        "id": "t1",
                        "desde_nodo_id": "wa1",
                        "hasta_nodo_id": "wd1",
                        "diametro_mm": 50,
                        "pendiente_porcentaje": 2,
                    }
                ],
            },
            "electrica": {
                "tablero_general": {
                    "id": "tg1",
                    "ubicacion": {"x": 0.5, "y": 0.5},
                    "amperaje_principal": 60,
                },
                "circuitos": [{"id": "e1", "tipo": "iluminacion", "breaker_a": 20}],
                "puntos": [
                    {
                        "id": "p1",
                        "tipo": "luminaria",
                        "ambiente": "sala",
                        "ubicacion": {"x": 4, "y": 4},
                        "circuito_id": "e1",
                    }
                ],
            },
        },
        "validacion_RNE": {
            "estado_global": "aprobado",
            "reglas_evaluadas": [
                {
                    "rule_id": "RNE-P-001",
                    "categoria": "arquitectura",
                    "resultado": "cumple",
                    "evidencia": "Puerta principal >= 0.90m",
                }
            ],
            "resumen": {"total_reglas": 1, "cumple": 1, "no_cumple": 0, "no_aplica": 0},
        },
    }


def _build_layout(**overrides: Any) -> LayoutV1Response:
    """Build a LayoutV1Response from the base payload, applying overrides.

    Overrides are deep-merged into the base payload before validation, so a
    test can replace just ``ambientes`` or a nested field without rewriting
    the whole fixture.
    """
    payload = _base_payload()
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(payload.get(key), dict):
            payload[key] = {**payload[key], **value}
        else:
            payload[key] = value
    return LayoutV1Response.model_validate(payload)


@pytest.fixture
def exporter() -> DXFExporter:
    return DXFExporter()


# ─── Test 1 ───────────────────────────────────────────────────────────────
def test_generate_dxf_happy_path(exporter: DXFExporter):
    layout = _build_layout()
    stream = exporter.generate_dxf(layout)
    assert isinstance(stream, type(layout.timestamp_utc and __import__("io").BytesIO()))
    data = stream.read()
    assert len(data) > 0
    assert b"EOF" in data


# ─── Test 2 ───────────────────────────────────────────────────────────────
def test_export_with_empty_terrain_vertices(exporter: DXFExporter, caplog: pytest.LogCaptureFixture):
    # Override with a 3-vertex terrain (schema requires min_length=3, so we
    # cannot pass []. Instead we pass a degenerate 3-vertex triangle and
    # verify robustness; for strict empty we bypass schema via object model.
    # Build layout with valid terrain, then mutate the model in-memory.
    layout = _build_layout()
    # Mutate to empty list directly (bypassing schema validation) to simulate
    # a corrupted runtime model.
    layout.coordenadas_terreno.vertices.clear()
    with caplog.at_level(logging.WARNING, logger="vipromt.dxf"):
        stream = exporter.generate_dxf(layout)
    data = stream.read()
    assert len(data) > 0  # export still completes
    assert any("terrain" in r.message and "vertices" in r.message for r in caplog.records)


# ─── Test 3 ───────────────────────────────────────────────────────────────
def test_export_with_collapsed_wall(exporter: DXFExporter, caplog: pytest.LogCaptureFixture):
    layout = _build_layout()
    # Collapse the wall: inicio == fin
    collapsed = {
        "id": "m2",
        "tipo": "portante",
        "inicio": {"x": 5, "y": 5},
        "fin": {"x": 5, "y": 5},
        "espesor_m": 0.2,
    }
    layout.muros_y_columnas.muros.append(
        type(layout.muros_y_columnas.muros[0]).model_validate(collapsed)
    )
    with caplog.at_level(logging.WARNING, logger="vipromt.dxf"):
        stream = exporter.generate_dxf(layout)
    data = stream.read()
    assert len(data) > 0
    assert any("walls" in r.message and "m2" in r.message for r in caplog.records)


# ─── Test 4 ───────────────────────────────────────────────────────────────
def test_export_with_missing_block_type(exporter: DXFExporter, caplog: pytest.LogCaptureFixture):
    """When a furniture block is unavailable, the export must skip it and log.

    ezdxf 1.4.x is permissive at insert time, so we monkeypatch ``add_blockref``
    on a fake modelspace wrapper to raise ``DXFError`` for the missing block
    while letting other entities through. This exercises the service's guard.
    """
    layout = _build_layout()
    layout.mobiliario[0].block_type = "otro"

    import ezdxf as _ez

    import app.services.dxf_service as svc

    orig_new = _ez.new
    orig_readfile = _ez.readfile

    def _wrap_new(version="R2010"):
        doc = orig_new(version)
        msp = doc.modelspace()
        orig_add_blockref = msp.add_blockref

        def _add_blockref(name, insert, dxfattribs=None):
            if name.startswith("BLOQUE_") and name not in doc.blocks:
                raise svc.DXFError(f"block '{name}' not in table")
            return orig_add_blockref(name, insert, dxfattribs or {})

        msp.add_blockref = _add_blockref
        return doc

    def _wrap_readfile(path):
        return _wrap_new()

    _ez.new = _wrap_new
    _ez.readfile = _wrap_readfile
    try:
        with caplog.at_level(logging.WARNING, logger="vipromt.dxf"):
            stream = exporter.generate_dxf(layout)
    finally:
        _ez.new = orig_new
        _ez.readfile = orig_readfile

    data = stream.read()
    assert len(data) > 0
    assert any("furniture" in r.message and "f1" in r.message for r in caplog.records)


# ─── Test 5 ───────────────────────────────────────────────────────────────
def test_export_raises_dxf_export_error_on_unrecoverable(exporter: DXFExporter, monkeypatch):
    layout = _build_layout()
    import app.services.dxf_service as svc

    def _boom(_doc):
        raise svc.DXFError("simulated ezdxf internal failure")

    monkeypatch.setattr(svc.ezdxf, "readfile", _boom)
    monkeypatch.setattr(svc.ezdxf, "new", _boom)
    with pytest.raises(DXFExportError) as excinfo:
        exporter.generate_dxf(layout)
    assert "DXF export failed" in str(excinfo.value)


# ─── Test 6 ───────────────────────────────────────────────────────────────
def test_export_with_non_positive_scale_furniture(exporter: DXFExporter, caplog: pytest.LogCaptureFixture):
    layout = _build_layout()
    layout.mobiliario[0].scale = 0.0  # non-positive
    with caplog.at_level(logging.WARNING, logger="vipromt.dxf"):
        stream = exporter.generate_dxf(layout)
    data = stream.read()
    assert len(data) > 0
    assert any("furniture" in r.message and "f1" in r.message for r in caplog.records)


# ─── Test 7 ───────────────────────────────────────────────────────────────
def test_export_orphan_mep_tramos(exporter: DXFExporter, caplog: pytest.LogCaptureFixture):
    layout = _build_layout()
    # Add a tramo referencing non-existent nodes
    orphan = {
        "id": "t_orphan",
        "desde_nodo_id": "ghost_a",
        "hasta_nodo_id": "ghost_b",
        "diametro_mm": 32,
        "pendiente_porcentaje": 1,
    }
    layout.instalaciones_MEP.sanitaria.tramos.append(
        type(layout.instalaciones_MEP.sanitaria.tramos[0]).model_validate(orphan)
    )
    with caplog.at_level(logging.WARNING, logger="vipromt.dxf"):
        stream = exporter.generate_dxf(layout)
    data = stream.read()
    assert len(data) > 0
    assert any("mep_tramos" in r.message and "t_orphan" in r.message for r in caplog.records)


# ─── Test 8 — DXFInvalidLayerError (task-0002) ─────────────────────────────
@pytest.mark.parametrize(
    "layer_name, reason, expected_substring",
    [
        ("ARQ-INEXISTENTE", "missing", "ARQ-INEXISTENTE"),
        ("0", "reserved", "layer='0'"),
        ("MEP-FUENTES", "duplicated", "duplicated"),
    ],
)
def test_dxf_invalid_layer_error(layer_name, reason, expected_substring):
    err = DXFInvalidLayerError(
        message="invalid layer",
        layer_name=layer_name,
        reason=reason,
    )
    # (a) Atributos preservados
    assert err.layer_name == layer_name
    assert err.reason == reason
    # (b) str() contiene substring esperado
    assert expected_substring in str(err)
    # (c) Es subclase de DXFExportError (captura generica)
    assert isinstance(err, DXFExportError)


# ─── Tests 9-13 — validate_dxf (task-0003) ─────────────────────────────────
def test_validate_dxf_ok():
    layout = _build_layout()
    response = validate_dxf(layout)
    assert response.estado == "ok"
    assert response.mensaje == "Layout valido"
    assert response.project_id == layout.project_id
    assert response.timestamp_utc == layout.timestamp_utc
    assert isinstance(response, DXFValidationResponse)


def test_validate_dxf_no_terrain():
    layout = _build_layout()
    layout.coordenadas_terreno.vertices.clear()
    response = validate_dxf(layout)
    assert response.estado == "invalido"
    assert "terreno" in response.mensaje
    assert response.project_id == layout.project_id


def test_validate_dxf_no_rooms():
    layout = _build_layout()
    layout.ambientes.clear()
    response = validate_dxf(layout)
    assert response.estado == "invalido"
    assert "ambientes" in response.mensaje
    assert response.project_id == layout.project_id


def test_validate_dxf_no_walls():
    layout = _build_layout()
    layout.muros_y_columnas.muros.clear()
    response = validate_dxf(layout)
    assert response.estado == "invalido"
    assert "muros" in response.mensaje
    assert response.project_id == layout.project_id


def test_dxf_validation_response_schema_keys():
    expected_keys = {"estado", "mensaje", "project_id", "timestamp_utc"}
    actual_keys = set(DXFValidationResponse.model_fields.keys())
    assert actual_keys == expected_keys, f"Unexpected keys: {actual_keys ^ expected_keys}"


# ─── Test 16 — DXFEmptyDocumentError (task-0004) ────────────────────────────
def test_export_with_empty_layout_raises_dxf_empty_document_error(exporter: DXFExporter):
    """A layout that produces no valid DXF entities must raise DXFEmptyDocumentError."""
    layout = _build_layout()
    # Vaciamos todas las colecciones de entidades que generan elementos DXF.
    layout.coordenadas_terreno.vertices.clear()  # < 3 → skipped
    layout.ambientes.clear()
    layout.muros_y_columnas.muros.clear()
    layout.muros_y_columnas.columnas.clear()
    layout.puertas_ventanas.puertas.clear()
    layout.puertas_ventanas.ventanas.clear()
    layout.mobiliario.clear()
    # MEP nodos y puntos eléctricos también se vacían para que no dibujen círculos.
    layout.instalaciones_MEP.sanitaria.nodos_agua.clear()
    layout.instalaciones_MEP.sanitaria.nodos_desague.clear()
    layout.instalaciones_MEP.sanitaria.tramos.clear()
    layout.instalaciones_MEP.electrica.puntos.clear()

    with pytest.raises(DXFEmptyDocumentError) as excinfo:
        exporter.generate_dxf(layout)
    # (a) La excepción es subclase de DXFExportError (jerarquía coherente)
    assert isinstance(excinfo.value, DXFExportError)
    # (b) Mensaje descriptivo
    assert "empty document" in str(excinfo.value).lower()
    # (c) expected_count Reporta 0 entidades generadas
    assert excinfo.value.expected_count == 0
