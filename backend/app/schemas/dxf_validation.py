"""DXF validation response schema."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DXFValidationResponse(BaseModel):
    """Estructura de salida para respuestas de validacion DXF.

    Attributes:
        estado: Resultado global de la validacion ('ok' | 'invalido').
        mensaje: Descripcion legible del estado o lista de motivos si invalido.
        project_id: Identificador del proyecto validado (propagado del layout).
        timestamp_utc: Marca temporal UTC propagada del layout de origen.
    """

    estado: Literal["ok", "invalido"] = "ok"
    mensaje: str = ""
    project_id: str
    timestamp_utc: datetime
