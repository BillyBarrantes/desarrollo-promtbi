import math
import uuid
from typing import List, Tuple, Any

from app.schemas.layout_v1 import LayoutV1Response, FurnitureObject, Point2D

class FurnitureOptimizer:
    """
    Motor determinista para calcular la ubicacion optima del mobiliario
    basandose en la geometria de las habitaciones, eliminando la dependencia del LLM.
    """

    def optimize_placement(self, layout: LayoutV1Response) -> LayoutV1Response:
        """Vacía el mobiliario actual y lo regenera geométricamente."""
        layout.mobiliario = []

        for room in layout.ambientes:
            pts = room.vertices
            if len(pts) < 3:
                continue

            cx = sum(p.x for p in pts) / len(pts)
            cy = sum(p.y for p in pts) / len(pts)
            centroid = Point2D(x=cx, y=cy)

            # Extraer segmentos (muros virtuales)
            segments = []
            for i in range(len(pts)):
                p1 = pts[i]
                p2 = pts[(i + 1) % len(pts)]
                dx = p2.x - p1.x
                dy = p2.y - p1.y
                length = math.hypot(dx, dy)
                mid = Point2D(x=(p1.x + p2.x) / 2, y=(p1.y + p2.y) / 2)
                segments.append((length, p1, p2, mid))

            # Ordenar por longitud descendente
            segments.sort(key=lambda x: x[0], reverse=True)
            if not segments:
                continue

            longest_wall = segments[0]
            shortest_wall = segments[-1]

            name = room.nombre.lower()
            uso = (room.uso or "").lower()

            # ── Independent matching: each keyword fires separately ──
            # Track which walls are already "claimed" so we can pick alternates
            used_wall_indices: list[int] = []

            def _pick_wall(prefer_longest: bool = True, exclude: list[int] | None = None) -> tuple:
                """Pick the best available wall, skipping already-used indices."""
                exc = exclude or []
                candidates = [(idx, seg) for idx, seg in enumerate(segments) if idx not in exc]
                if not candidates:
                    # Fallback: just use longest
                    return 0, segments[0]
                if prefer_longest:
                    candidates.sort(key=lambda x: x[1][0], reverse=True)
                else:
                    candidates.sort(key=lambda x: x[1][0])
                return candidates[0]

            # ── Dormitorio / Bedroom ──
            if any(kw in name for kw in ("dorm", "bed", "habit", "recam")):
                idx, wall = _pick_wall(prefer_longest=True, exclude=used_wall_indices)
                used_wall_indices.append(idx)
                self._place_aligned(layout, room.id, "cama", wall, centroid, offset_dist=1.0, back_is_pos_y=True)

            # ── Sala / Living ──
            if any(kw in name for kw in ("sala", "living", "estar")) or ("social" in uso and "comed" not in name):
                idx, wall = _pick_wall(prefer_longest=True, exclude=used_wall_indices)
                used_wall_indices.append(idx)
                self._place_aligned(layout, room.id, "sofa", wall, centroid, offset_dist=0.45, back_is_pos_y=True)

            # ── Comedor / Dining ──
            if any(kw in name for kw in ("comed", "dining")):
                # Mesa always goes to centroid
                layout.mobiliario.append(FurnitureObject(
                    id=str(uuid.uuid4()),
                    room_id=room.id,
                    block_type="mesa",
                    insertion=centroid,
                    rotation_deg=0,
                    scale=1.0
                ))

            # ── Baño / Bathroom ──
            if any(kw in name for kw in ("baño", "bano", "bath", "ssh", "servi", "sanit")):
                idx, wall = _pick_wall(prefer_longest=False, exclude=used_wall_indices)
                used_wall_indices.append(idx)
                self._place_aligned(layout, room.id, "inodoro", wall, centroid, offset_dist=0.325, back_is_pos_y=False, shift_along_wall=-0.4)
                self._place_aligned(layout, room.id, "lavabo", wall, centroid, offset_dist=0.225, back_is_pos_y=False, shift_along_wall=0.4)

            # ── Cocina / Kitchen ──
            if any(kw in name for kw in ("cocin", "kitchen")):
                idx, wall = _pick_wall(prefer_longest=True, exclude=used_wall_indices)
                used_wall_indices.append(idx)
                self._place_aligned(layout, room.id, "cocina", wall, centroid, offset_dist=0.3, back_is_pos_y=False)

            # ── Cochera / Garage ──
            if any(kw in name for kw in ("cocher", "garaj", "garag", "parking")):
                idx, wall = _pick_wall(prefer_longest=True, exclude=used_wall_indices)
                used_wall_indices.append(idx)
                self._place_aligned(layout, room.id, "auto", wall, centroid, offset_dist=2.5, back_is_pos_y=True)

        return layout

    def _place_aligned(
        self, 
        layout: LayoutV1Response, 
        room_id: str, 
        block_type: str, 
        wall: Tuple[float, Point2D, Point2D, Point2D], 
        centroid: Point2D, 
        offset_dist: float, 
        back_is_pos_y: bool,
        shift_along_wall: float = 0.0
    ):
        """
        Coloca un mueble alineado a una pared, mirando hacia el centro.
        - wall: (length, p1, p2, mid)
        - offset_dist: Distancia desde la pared hasta el centro de inserción del bloque.
        - back_is_pos_y: True si el 'espaladar' del bloque está hacia el +Y local del bloque (ej. Cama, Sofa). 
                         False si está hacia el -Y (ej. Inodoro).
        """
        _, p1, p2, mid = wall

        # Vector normal apuntando hacia el centroide (adentro de la habitación)
        v_cx = centroid.x - mid.x
        v_cy = centroid.y - mid.y
        normal_deg = math.degrees(math.atan2(v_cy, v_cx))

        # Posicionamiento: desplazar desde el centro de la pared hacia el interior (offset_dist)
        # y opcionalmente a lo largo de la pared (shift_along_wall para poner 2 muebles juntos)
        nx = math.cos(math.radians(normal_deg))
        ny = math.sin(math.radians(normal_deg))
        
        # Vector paralelo a la pared
        px = -ny
        py = nx

        ins_x = mid.x + nx * offset_dist + px * shift_along_wall
        ins_y = mid.y + ny * offset_dist + py * shift_along_wall

        # Calculo de rotacion
        # Queremos que la "espalda" del bloque apunte hacia la pared.
        # La direccion hacia la pared es (normal_deg + 180).
        if back_is_pos_y:
            # La espalda está en +90 local.  90 + rot = normal_deg + 180  => rot = normal_deg + 90
            rot = normal_deg + 90
        else:
            # La espalda está en -90 local. -90 + rot = normal_deg + 180 => rot = normal_deg + 270
            rot = normal_deg + 270

        layout.mobiliario.append(FurnitureObject(
            id=str(uuid.uuid4()),
            room_id=room_id,
            block_type=block_type,
            insertion=Point2D(x=ins_x, y=ins_y),
            rotation_deg=round(rot % 360, 1),
            scale=1.0
        ))
