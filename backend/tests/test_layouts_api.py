from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.api.deps import get_layout_service
from app.main import app


class FakeServiceOK:
    def generate_layout(self, project_id, user_prompt, image_bytes, image_mime_type):
        return {
            "version": "v1.1",
            "project_id": project_id,
            "timestamp_utc": datetime.now(UTC).isoformat(),
            "coordenadas_terreno": {
                "unidad": "m",
                "area_total_m2": 60.0,
                "vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 12}],
            },
            "ambientes": [
                {
                    "id": "room-1",
                    "nombre": "Sala",
                    "uso": "social",
                    "vertices": [{"x": 0, "y": 0}, {"x": 5, "y": 0}, {"x": 5, "y": 5}, {"x": 0, "y": 5}],
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


class FakeServiceBadJSON:
    def generate_layout(self, project_id, user_prompt, image_bytes, image_mime_type):
        return {"broken": "payload"}


def test_generate_layout_ok():
    app.dependency_overrides[get_layout_service] = lambda: FakeServiceOK()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/v1/layouts/generate",
        data={"project_id": "proj-1", "prompt": "Quiero una casa de 2 dormitorios, 1 bano y cocina en L"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["version"] == "v1.1"
    assert payload["project_id"] == "proj-1"
    assert payload["validacion_RNE"]["estado_global"] == "aprobado"

    app.dependency_overrides.clear()


class FakeServiceRejected:
    def generate_layout(self, project_id, user_prompt, image_bytes, image_mime_type):
        payload = FakeServiceOK().generate_layout(project_id, user_prompt, image_bytes, image_mime_type)
        payload["puertas_ventanas"]["puertas"][0]["ancho_m"] = 0.5
        return payload


def test_generate_layout_rejected_by_deterministic_validator():
    app.dependency_overrides[get_layout_service] = lambda: FakeServiceRejected()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/v1/layouts/generate",
        data={"project_id": "proj-2", "prompt": "Necesito un departamento compacto con buena ventilacion"},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["message"] == "Deterministic validation rejected the proposal."
    assert detail["validacion_RNE"]["estado_global"] == "rechazado"
    assert len(detail["alternativas"]) > 0

    app.dependency_overrides.clear()
