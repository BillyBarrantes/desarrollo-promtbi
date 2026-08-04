"""DXF export service — generates AutoCAD-compatible .dxf files from LayoutV1Response."""

import io
import logging
import math

import ezdxf
from ezdxf.enums import TextEntityAlignment

from app.schemas.layout_v1 import LayoutV1Response

logger = logging.getLogger("vipromt.dxf")

# AutoCAD Color Index (ACI)
COLOR_CYAN = 4
COLOR_YELLOW = 2
COLOR_WHITE = 7
COLOR_MAGENTA = 6
COLOR_GREEN = 3
COLOR_RED = 1
COLOR_GRAY = 8

# Standard text height in meters (drawing units)
TEXT_HEIGHT_NAME = 0.18
TEXT_HEIGHT_AREA = 0.12
TEXT_HEIGHT_DIM = 0.10


class DXFExporter:
    """Transforms a LayoutV1Response into a professional DXF drawing."""

    def generate_dxf(self, layout: LayoutV1Response) -> io.BytesIO:
        """Generate a complete DXF file as an in-memory BytesIO stream."""
        template_path = "app/templates/plantilla_vipromt.dxf"
        try:
            doc = ezdxf.readfile(template_path)
            logger.info("Loaded DXF template from %s", template_path)
        except Exception as e:
            logger.warning("Could not load DXF template %s (%s). Falling back to blank document.", template_path, e)
            doc = ezdxf.new("R2010")
            
        msp = doc.modelspace()

        # ─── Create layers (if they don't exist in template) ───────
        for layer_name, color in [
            ("ARQ-MUROS", COLOR_CYAN),
            ("ARQ-AMBIENTES", COLOR_GREEN),
            ("ARQ-PUERTAS", COLOR_YELLOW),
            ("ARQ-VENTANAS", COLOR_YELLOW),
            ("ARQ-TEXTOS", COLOR_WHITE),
            ("ARQ-MOBILIARIO", COLOR_MAGENTA),
            ("ARQ-COTAS", COLOR_GRAY),
            ("MEP-SANITARIA", COLOR_GREEN),
            ("MEP-ELECTRICA", COLOR_RED),
        ]:
            if layer_name not in doc.layers:
                doc.layers.add(layer_name, color=color)

        # ─── 1. Terrain boundary ───────────────────────────────────
        terrain_pts = [(v.x, v.y) for v in layout.coordenadas_terreno.vertices]
        if terrain_pts:
            terrain_pts_closed = terrain_pts + [terrain_pts[0]]
            msp.add_lwpolyline(terrain_pts_closed, dxfattribs={"layer": "ARQ-MUROS", "color": COLOR_CYAN})

        # ─── 2. Rooms (ambientes) as closed polylines ──────────────
        for room in layout.ambientes:
            pts = [(v.x, v.y) for v in room.vertices]
            if pts:
                pts_closed = pts + [pts[0]]
                msp.add_lwpolyline(pts_closed, dxfattribs={"layer": "ARQ-AMBIENTES"})

        # ─── 3. Walls ─────────────────────────────────────────────
        for wall in layout.muros_y_columnas.muros:
            # Draw wall as a thick line
            msp.add_line(
                start=(wall.inicio.x, wall.inicio.y),
                end=(wall.fin.x, wall.fin.y),
                dxfattribs={"layer": "ARQ-MUROS"},
            )

            # Also draw the wall thickness as a rectangle if espesor > 0
            if wall.espesor_m > 0:
                dx = wall.fin.x - wall.inicio.x
                dy = wall.fin.y - wall.inicio.y
                length = math.hypot(dx, dy)
                if length > 0:
                    # Normal vector (perpendicular)
                    nx = -dy / length * wall.espesor_m / 2
                    ny = dx / length * wall.espesor_m / 2
                    corners = [
                        (wall.inicio.x + nx, wall.inicio.y + ny),
                        (wall.fin.x + nx, wall.fin.y + ny),
                        (wall.fin.x - nx, wall.fin.y - ny),
                        (wall.inicio.x - nx, wall.inicio.y - ny),
                        (wall.inicio.x + nx, wall.inicio.y + ny),  # close
                    ]
                    msp.add_lwpolyline(corners, dxfattribs={"layer": "ARQ-MUROS"})

        # ─── 4. Columns ───────────────────────────────────────────
        for col in layout.muros_y_columnas.columnas:
            hw = col.ancho_m / 2
            hl = col.largo_m / 2
            corners = [
                (col.centro.x - hw, col.centro.y - hl),
                (col.centro.x + hw, col.centro.y - hl),
                (col.centro.x + hw, col.centro.y + hl),
                (col.centro.x - hw, col.centro.y + hl),
                (col.centro.x - hw, col.centro.y - hl),  # close
            ]
            msp.add_lwpolyline(corners, dxfattribs={"layer": "ARQ-MUROS"})

        # ─── 5. Doors ─────────────────────────────────────────────
        for door in layout.puertas_ventanas.puertas:
            # Door as a line at its position
            msp.add_line(
                start=(door.posicion.x, door.posicion.y),
                end=(door.posicion.x + door.ancho_m, door.posicion.y),
                dxfattribs={"layer": "ARQ-PUERTAS"},
            )
            # Door swing arc (quarter circle)
            msp.add_arc(
                center=(door.posicion.x, door.posicion.y),
                radius=door.ancho_m,
                start_angle=0,
                end_angle=90 if door.abatimiento in ("derecha", "corrediza") else -90,
                dxfattribs={"layer": "ARQ-PUERTAS"},
            )

        # ─── 6. Windows ───────────────────────────────────────────
        for win in layout.puertas_ventanas.ventanas:
            msp.add_line(
                start=(win.posicion.x, win.posicion.y),
                end=(win.posicion.x + win.ancho_m, win.posicion.y),
                dxfattribs={"layer": "ARQ-VENTANAS"},
            )

        # ─── 7. Room labels (name + area) ─────────────────────────
        for room in layout.ambientes:
            if not room.vertices:
                continue
            cx = sum(v.x for v in room.vertices) / len(room.vertices)
            cy = sum(v.y for v in room.vertices) / len(room.vertices)

            # Room name
            msp.add_text(
                room.nombre.upper(),
                height=TEXT_HEIGHT_NAME,
                dxfattribs={"layer": "ARQ-TEXTOS", "style": "Standard"},
            ).set_placement((cx, cy + TEXT_HEIGHT_NAME), align=TextEntityAlignment.MIDDLE_CENTER)

            # Room area
            msp.add_text(
                f"{room.area_m2:.2f} m²",
                height=TEXT_HEIGHT_AREA,
                dxfattribs={"layer": "ARQ-TEXTOS", "style": "Standard"},
            ).set_placement((cx, cy - TEXT_HEIGHT_AREA * 1.5), align=TextEntityAlignment.MIDDLE_CENTER)

        # ─── 8. Furniture (block references) ──────────────────────
        for furn in layout.mobiliario:
            block_name = f"BLOQUE_{furn.block_type.upper()}"
            
            # Note: We assume the block name exists in the template.
            # We no longer draw placeholder boundaries.
            msp.add_blockref(
                block_name,
                insert=(furn.insertion.x, furn.insertion.y),
                dxfattribs={
                    "layer": "ARQ-MOBILIARIO",
                    "rotation": furn.rotation_deg,
                    "xscale": furn.scale,
                    "yscale": furn.scale,
                },
            )

        # ─── 9. Sanitary MEP ──────────────────────────────────────
        san = layout.instalaciones_MEP.sanitaria
        all_nodes = {n.id: n for n in san.nodos_agua}
        all_nodes.update({n.id: n for n in san.nodos_desague})

        for tramo in san.tramos:
            from_node = all_nodes.get(tramo.desde_nodo_id)
            to_node = all_nodes.get(tramo.hasta_nodo_id)
            if from_node and to_node:
                msp.add_line(
                    start=(from_node.ubicacion.x, from_node.ubicacion.y),
                    end=(to_node.ubicacion.x, to_node.ubicacion.y),
                    dxfattribs={"layer": "MEP-SANITARIA"},
                )

        for node in list(san.nodos_agua) + list(san.nodos_desague):
            msp.add_circle(
                center=(node.ubicacion.x, node.ubicacion.y),
                radius=0.08,
                dxfattribs={"layer": "MEP-SANITARIA"},
            )

        # ─── 10. Electrical MEP ───────────────────────────────────
        elec = layout.instalaciones_MEP.electrica
        # Tablero general
        tg = elec.tablero_general
        msp.add_circle(
            center=(tg.ubicacion.x, tg.ubicacion.y),
            radius=0.15,
            dxfattribs={"layer": "MEP-ELECTRICA"},
        )
        msp.add_text(
            "TG",
            height=0.10,
            dxfattribs={"layer": "MEP-ELECTRICA"},
        ).set_placement((tg.ubicacion.x, tg.ubicacion.y - 0.25), align=TextEntityAlignment.MIDDLE_CENTER)

        for punto in elec.puntos:
            if punto.tipo == "luminaria":
                msp.add_circle(
                    center=(punto.ubicacion.x, punto.ubicacion.y),
                    radius=0.06,
                    dxfattribs={"layer": "MEP-ELECTRICA"},
                )
            else:
                msp.add_point(
                    location=(punto.ubicacion.x, punto.ubicacion.y),
                    dxfattribs={"layer": "MEP-ELECTRICA"},
                )

        # ─── Write to BytesIO ─────────────────────────────────────
        text_stream = io.StringIO()
        doc.write(text_stream)
        byte_stream = io.BytesIO(text_stream.getvalue().encode("utf-8"))
        byte_stream.seek(0)

        logger.info(
            "DXF generated | project_id=%s | rooms=%d | walls=%d | furniture=%d",
            layout.project_id,
            len(layout.ambientes),
            len(layout.muros_y_columnas.muros),
            len(layout.mobiliario),
        )
        return byte_stream


def _furniture_dims(block_type: str) -> tuple[float, float]:
    """Return (width, height) in meters for a furniture block type."""
    dims = {
        "cama": (1.40, 2.00),
        "inodoro": (0.40, 0.65),
        "lavabo": (0.55, 0.45),
        "mesa": (1.20, 0.80),
        "auto": (2.40, 5.00),
        "sofa": (2.10, 0.90),
        "cocina": (2.40, 0.60),
        "ducha": (0.90, 0.90),
        "otro": (0.60, 0.60),
    }
    return dims.get(block_type, (0.60, 0.60))
