from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Point2D(BaseModel):
    x: float
    y: float


class LandCoordinates(BaseModel):
    unidad: Literal["m"] = "m"
    area_total_m2: float = Field(gt=0)
    vertices: list[Point2D] = Field(min_length=3)


class Wall(BaseModel):
    id: str
    tipo: Literal["portante", "no_portante", "cerramiento"]
    inicio: Point2D
    fin: Point2D
    espesor_m: float = Field(gt=0)
    altura_m: float | None = Field(default=None, gt=0)


class Column(BaseModel):
    id: str
    centro: Point2D
    ancho_m: float = Field(gt=0)
    largo_m: float = Field(gt=0)
    estructural: bool


class WallsAndColumns(BaseModel):
    muros: list[Wall]
    columnas: list[Column]


class Door(BaseModel):
    id: str
    tipo: Literal["principal", "interior", "bano", "servicio"]
    host_wall_id: str
    offset_m: float = Field(ge=0)
    posicion: Point2D
    ancho_m: float = Field(gt=0)
    alto_m: float = Field(gt=0)
    abatimiento: Literal["izquierda", "derecha", "corrediza", "plegable"]


class Window(BaseModel):
    id: str
    host_wall_id: str
    offset_m: float = Field(ge=0)
    posicion: Point2D
    ancho_m: float = Field(gt=0)
    alto_m: float = Field(gt=0)
    antepecho_m: float = Field(ge=0)
    tipo: Literal["corrediza", "batiente", "fija", "proyectante"] | None = None


class DoorsAndWindows(BaseModel):
    puertas: list[Door]
    ventanas: list[Window]


class Room(BaseModel):
    id: str
    nombre: str
    uso: Literal["social", "privado", "servicio", "circulacion", "otro"]
    vertices: list[Point2D] = Field(min_length=3)
    area_m2: float = Field(gt=0)


class FurnitureObject(BaseModel):
    id: str
    block_type: Literal["cama", "inodoro", "lavabo", "mesa", "auto", "sofa", "cocina", "ducha", "otro"]
    insertion: Point2D
    rotation_deg: float = 0
    scale: float = Field(default=1.0, gt=0)
    room_id: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)


class MEPNode(BaseModel):
    id: str
    tipo: Literal[
        "lavadero",
        "inodoro",
        "ducha",
        "lavamanos",
        "fregadero",
        "punto_lavadora",
        "otro",
    ]
    ambiente: str
    ubicacion: Point2D


class PipeSegment(BaseModel):
    id: str
    desde_nodo_id: str
    hasta_nodo_id: str
    diametro_mm: float = Field(gt=0)
    pendiente_porcentaje: float = Field(ge=0)


class SanitaryNetwork(BaseModel):
    montante_id: str
    nodos_agua: list[MEPNode]
    nodos_desague: list[MEPNode]
    tramos: list[PipeSegment]


class MainPanel(BaseModel):
    id: str
    ubicacion: Point2D
    amperaje_principal: float = Field(gt=0)


class Circuit(BaseModel):
    id: str
    tipo: Literal["iluminacion", "tomacorriente", "fuerza"]
    breaker_a: float = Field(gt=0)


class ElectricalPoint(BaseModel):
    id: str
    tipo: Literal["luminaria", "interruptor", "tomacorriente", "salida_especial"]
    ambiente: str
    ubicacion: Point2D
    circuito_id: str


class ElectricalNetwork(BaseModel):
    tablero_general: MainPanel
    circuitos: list[Circuit]
    puntos: list[ElectricalPoint]


class MEPInstallations(BaseModel):
    sanitaria: SanitaryNetwork
    electrica: ElectricalNetwork


class RuleEvaluation(BaseModel):
    rule_id: str
    categoria: Literal[
        "arquitectura",
        "circulacion",
        "ventilacion_iluminacion",
        "sanitaria",
        "electrica",
        "estructural",
    ]
    resultado: Literal["cumple", "no_cumple", "no_aplica"]
    evidencia: str
    valor_normativo: str | None = None
    valor_observado: str | None = None
    severidad: Literal["baja", "media", "alta", "critica"] | None = None


class ValidationSummary(BaseModel):
    total_reglas: int = Field(ge=0)
    cumple: int = Field(ge=0)
    no_cumple: int = Field(ge=0)
    no_aplica: int = Field(ge=0)


class RNEValidation(BaseModel):
    estado_global: Literal["aprobado", "observado", "rechazado"]
    reglas_evaluadas: list[RuleEvaluation] = Field(min_length=1)
    resumen: ValidationSummary


class LayoutV1Response(BaseModel):
    version: Literal["v1.1"] = "v1.1"
    project_id: str
    timestamp_utc: datetime
    coordenadas_terreno: LandCoordinates
    ambientes: list[Room] = Field(default_factory=list)
    muros_y_columnas: WallsAndColumns
    puertas_ventanas: DoorsAndWindows
    mobiliario: list[FurnitureObject] = Field(default_factory=list)
    instalaciones_MEP: MEPInstallations
    validacion_RNE: RNEValidation
