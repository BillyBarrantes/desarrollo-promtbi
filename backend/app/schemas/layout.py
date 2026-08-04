from pydantic import BaseModel, Field


class Coordinate(BaseModel):
    x: float
    y: float


class WallSegment(BaseModel):
    start: Coordinate
    end: Coordinate
    thickness_m: float = Field(gt=0)


class Door(BaseModel):
    id: str
    from_room_id: str
    to_room_id: str | None = None
    position: Coordinate
    width_m: float = Field(gt=0)


class Window(BaseModel):
    id: str
    room_id: str
    position: Coordinate
    width_m: float = Field(gt=0)
    height_m: float = Field(gt=0)


class WaterNode(BaseModel):
    id: str
    room_id: str
    fixture_type: str
    position: Coordinate


class DrainNode(BaseModel):
    id: str
    room_id: str
    position: Coordinate


class ElectricalPoint(BaseModel):
    id: str
    room_id: str
    point_type: str
    position: Coordinate


class PanelBoard(BaseModel):
    position: Coordinate


class PlumbingNetwork(BaseModel):
    water_nodes: list[WaterNode]
    drain_nodes: list[DrainNode]
    riser_reference: str


class ElectricalNetwork(BaseModel):
    panel_board: PanelBoard
    points: list[ElectricalPoint]


class RNEJustification(BaseModel):
    rule_id: str
    status: str
    explanation: str


class LayoutResponse(BaseModel):
    coordenadas_muros: list[WallSegment]
    ubicacion_puertas: list[Door]
    ubicacion_ventanas: list[Window]
    red_agua: PlumbingNetwork
    red_electrica: ElectricalNetwork
    justificacion_segun_RNE: list[RNEJustification]
