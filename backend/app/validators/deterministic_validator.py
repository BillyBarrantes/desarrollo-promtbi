import math
from dataclasses import dataclass

from app.schemas.layout_v1 import LayoutV1Response, RNEValidation, RuleEvaluation, ValidationSummary


@dataclass
class DeterministicValidationResult:
    report: RNEValidation
    alternatives: list[str]


class DeterministicLayoutValidator:
    """Deterministic gate for geometry, RNE minimums, and MEP consistency."""

    def validate(self, layout: LayoutV1Response) -> DeterministicValidationResult:
        rules: list[RuleEvaluation] = []
        alternatives: list[str] = []

        rules.append(self._rule_area_consistency(layout))
        rules.append(self._rule_wall_footprint(layout))
        rules.extend(self._rule_rooms_within_terrain(layout))
        rules.extend(self._rule_door_widths(layout))
        rules.append(self._rule_openings_reference_existing_walls(layout))
        rules.append(self._rule_sanitary_connectivity(layout))
        rules.append(self._rule_panel_near_main_access(layout))

        # Not enough semantic room metadata in v1 for deterministic checks.
        rules.append(
            RuleEvaluation(
                rule_id="RNE-VI-001",
                categoria="ventilacion_iluminacion",
                resultado="no_aplica",
                evidencia="Schema v1 no incluye clasificacion formal de ambientes principales.",
                valor_normativo="Ambientes principales con ventilacion/iluminacion natural.",
                valor_observado="No determinable con contrato actual.",
                severidad="media",
            )
        )
        rules.append(
            RuleEvaluation(
                rule_id="RNE-CI-001",
                categoria="circulacion",
                resultado="no_aplica",
                evidencia="Schema v1 no incluye entidad explicita de pasadizos/circulaciones.",
                valor_normativo="Ancho minimo de pasadizo 0.90m - 1.00m.",
                valor_observado="No determinable con contrato actual.",
                severidad="media",
            )
        )

        for rule in rules:
            if rule.resultado == "no_cumple":
                alternatives.extend(self._alternatives_for_rule(rule.rule_id))

        total = len(rules)
        ok = sum(1 for r in rules if r.resultado == "cumple")
        fail = sum(1 for r in rules if r.resultado == "no_cumple")
        na = sum(1 for r in rules if r.resultado == "no_aplica")

        has_high_or_critical = any(
            r.resultado == "no_cumple" and r.severidad in {"alta", "critica"} for r in rules
        )

        if has_high_or_critical:
            global_status = "rechazado"
        elif fail > 0:
            global_status = "observado"
        else:
            global_status = "aprobado"

        report = RNEValidation(
            estado_global=global_status,
            reglas_evaluadas=rules,
            resumen=ValidationSummary(
                total_reglas=total,
                cumple=ok,
                no_cumple=fail,
                no_aplica=na,
            ),
        )

        dedup_alternatives = list(dict.fromkeys(alternatives))
        return DeterministicValidationResult(report=report, alternatives=dedup_alternatives)

    def _rule_area_consistency(self, layout: LayoutV1Response) -> RuleEvaluation:
        vertices = layout.coordenadas_terreno.vertices
        polygon_area = self._polygon_area(vertices)
        declared_area = layout.coordenadas_terreno.area_total_m2

        if declared_area <= 0:
            return RuleEvaluation(
                rule_id="RNE-AR-001",
                categoria="arquitectura",
                resultado="no_cumple",
                evidencia="Area declarada invalida (<= 0).",
                valor_normativo="Area total del terreno > 0.",
                valor_observado=str(declared_area),
                severidad="critica",
            )

        ratio = abs(polygon_area - declared_area) / declared_area
        if ratio <= 0.15:
            return RuleEvaluation(
                rule_id="RNE-AR-001",
                categoria="arquitectura",
                resultado="cumple",
                evidencia="Coherencia aceptable entre area declarada y poligono de terreno.",
                valor_normativo="Desviacion <= 15%.",
                valor_observado=f"desviacion={ratio:.2%}",
                severidad="media",
            )

        return RuleEvaluation(
            rule_id="RNE-AR-001",
            categoria="arquitectura",
            resultado="no_cumple",
            evidencia="La geometria del poligono no coincide con el area declarada.",
            valor_normativo="Desviacion <= 15%.",
            valor_observado=f"desviacion={ratio:.2%}",
            severidad="alta",
        )

    def _rule_wall_footprint(self, layout: LayoutV1Response) -> RuleEvaluation:
        area_total = layout.coordenadas_terreno.area_total_m2
        wall_footprint = 0.0

        for wall in layout.muros_y_columnas.muros:
            length = self._distance(wall.inicio.x, wall.inicio.y, wall.fin.x, wall.fin.y)
            wall_footprint += length * wall.espesor_m

        ratio = wall_footprint / area_total if area_total else 1.0
        if ratio < 0.45:
            return RuleEvaluation(
                rule_id="RNE-AR-002",
                categoria="arquitectura",
                resultado="cumple",
                evidencia="Huella total de muros dentro de rango esperable para propuesta inicial.",
                valor_normativo="Huella de muros < 45% del area total.",
                valor_observado=f"{ratio:.2%}",
                severidad="media",
            )

        return RuleEvaluation(
            rule_id="RNE-AR-002",
            categoria="arquitectura",
            resultado="no_cumple",
            evidencia="La huella de muros consume una proporcion excesiva del terreno.",
            valor_normativo="Huella de muros < 45% del area total.",
            valor_observado=f"{ratio:.2%}",
            severidad="alta",
        )

    def _rule_rooms_within_terrain(self, layout: LayoutV1Response) -> list[RuleEvaluation]:
        """Reject any room whose vertices fall outside the terrain bounding box."""
        terrain_verts = layout.coordenadas_terreno.vertices
        xs = [v.x for v in terrain_verts]
        ys = [v.y for v in terrain_verts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        tolerance = 0.01  # 1cm tolerance

        evaluations: list[RuleEvaluation] = []
        for room in layout.ambientes:
            offending = []
            for v in room.vertices:
                if v.x < min_x - tolerance or v.x > max_x + tolerance:
                    offending.append(f"x={v.x:.2f}")
                if v.y < min_y - tolerance or v.y > max_y + tolerance:
                    offending.append(f"y={v.y:.2f}")
            if offending:
                evaluations.append(
                    RuleEvaluation(
                        rule_id=f"RNE-LIM-{room.id}",
                        categoria="arquitectura",
                        resultado="no_cumple",
                        evidencia=f"El ambiente '{room.nombre}' se sale de los limites del terreno.",
                        valor_normativo=f"Vertices dentro de [{min_x},{min_y}] a [{max_x},{max_y}].",
                        valor_observado="; ".join(offending),
                        severidad="critica",
                    )
                )
            else:
                evaluations.append(
                    RuleEvaluation(
                        rule_id=f"RNE-LIM-{room.id}",
                        categoria="arquitectura",
                        resultado="cumple",
                        evidencia=f"El ambiente '{room.nombre}' esta dentro del terreno.",
                        valor_normativo=f"Vertices dentro de [{min_x},{min_y}] a [{max_x},{max_y}].",
                        valor_observado="Todos los vertices dentro de limites.",
                        severidad="critica",
                    )
                )
        return evaluations

    def _rule_door_widths(self, layout: LayoutV1Response) -> list[RuleEvaluation]:
        minimum_by_type = {
            "principal": 0.90,
            "interior": 0.80,
            "bano": 0.70,
            "servicio": 0.70,
        }

        evaluations: list[RuleEvaluation] = []
        for door in layout.puertas_ventanas.puertas:
            min_width = minimum_by_type[door.tipo]
            if door.ancho_m >= min_width:
                evaluations.append(
                    RuleEvaluation(
                        rule_id=f"RNE-PU-{door.id}",
                        categoria="arquitectura",
                        resultado="cumple",
                        evidencia=f"Puerta {door.id} cumple ancho minimo por tipo.",
                        valor_normativo=f">= {min_width:.2f}m",
                        valor_observado=f"{door.ancho_m:.2f}m",
                        severidad="alta",
                    )
                )
            else:
                evaluations.append(
                    RuleEvaluation(
                        rule_id=f"RNE-PU-{door.id}",
                        categoria="arquitectura",
                        resultado="no_cumple",
                        evidencia=f"Puerta {door.id} no cumple ancho minimo por tipo.",
                        valor_normativo=f">= {min_width:.2f}m",
                        valor_observado=f"{door.ancho_m:.2f}m",
                        severidad="alta",
                    )
                )

        return evaluations

    def _rule_openings_reference_existing_walls(self, layout: LayoutV1Response) -> RuleEvaluation:
        wall_ids = {w.id for w in layout.muros_y_columnas.muros}
        openings_ref = [d.host_wall_id for d in layout.puertas_ventanas.puertas] + [
            w.host_wall_id for w in layout.puertas_ventanas.ventanas
        ]

        missing = [ref for ref in openings_ref if ref not in wall_ids]
        if not missing:
            return RuleEvaluation(
                rule_id="RNE-ES-001",
                categoria="estructural",
                resultado="cumple",
                evidencia="Todas las puertas y ventanas referencian muros existentes.",
                valor_normativo="Toda abertura debe estar asociada a un muro valido.",
                valor_observado="0 referencias huerfanas",
                severidad="alta",
            )

        return RuleEvaluation(
            rule_id="RNE-ES-001",
            categoria="estructural",
            resultado="no_cumple",
            evidencia="Se detectaron puertas/ventanas con host_wall_id inexistente.",
            valor_normativo="Toda abertura debe estar asociada a un muro valido.",
            valor_observado=f"{len(missing)} referencias huerfanas",
            severidad="critica",
        )

    def _rule_sanitary_connectivity(self, layout: LayoutV1Response) -> RuleEvaluation:
        sanitary = layout.instalaciones_MEP.sanitaria
        node_ids = {n.id for n in sanitary.nodos_agua} | {n.id for n in sanitary.nodos_desague}

        disconnected_segments = [
            t.id
            for t in sanitary.tramos
            if t.desde_nodo_id not in node_ids or t.hasta_nodo_id not in node_ids
        ]

        if disconnected_segments:
            return RuleEvaluation(
                rule_id="RNE-SA-001",
                categoria="sanitaria",
                resultado="no_cumple",
                evidencia="Existen tramos sanitarios sin nodos validos en la red.",
                valor_normativo="Todo tramo debe conectar nodos existentes.",
                valor_observado=",".join(disconnected_segments),
                severidad="alta",
            )

        if not sanitary.montante_id.strip():
            return RuleEvaluation(
                rule_id="RNE-SA-001",
                categoria="sanitaria",
                resultado="no_cumple",
                evidencia="No se definio montante sanitaria.",
                valor_normativo="Debe existir montante unica o referencia valida.",
                valor_observado="montante vacia",
                severidad="alta",
            )

        return RuleEvaluation(
            rule_id="RNE-SA-001",
            categoria="sanitaria",
            resultado="cumple",
            evidencia="Red sanitaria conectada y montante declarada.",
            valor_normativo="Conectividad completa + montante definida.",
            valor_observado=f"nodos={len(node_ids)} tramos={len(sanitary.tramos)}",
            severidad="media",
        )

    def _rule_panel_near_main_access(self, layout: LayoutV1Response) -> RuleEvaluation:
        principal_doors = [d for d in layout.puertas_ventanas.puertas if d.tipo == "principal"]
        if not principal_doors:
            return RuleEvaluation(
                rule_id="RNE-EL-001",
                categoria="electrica",
                resultado="no_aplica",
                evidencia="No existe puerta principal modelada en el layout.",
                valor_normativo="Tablero cercano al ingreso principal.",
                valor_observado="Sin referencia de ingreso principal.",
                severidad="media",
            )

        main_door = principal_doors[0]
        panel = layout.instalaciones_MEP.electrica.tablero_general.ubicacion
        distance = self._distance(main_door.posicion.x, main_door.posicion.y, panel.x, panel.y)

        if distance <= 3.0:
            return RuleEvaluation(
                rule_id="RNE-EL-001",
                categoria="electrica",
                resultado="cumple",
                evidencia="Tablero general ubicado cerca del ingreso principal.",
                valor_normativo="Distancia <= 3.0m desde puerta principal.",
                valor_observado=f"{distance:.2f}m",
                severidad="media",
            )

        return RuleEvaluation(
            rule_id="RNE-EL-001",
            categoria="electrica",
            resultado="no_cumple",
            evidencia="Tablero general alejado del ingreso principal.",
            valor_normativo="Distancia <= 3.0m desde puerta principal.",
            valor_observado=f"{distance:.2f}m",
            severidad="media",
        )

    @staticmethod
    def _polygon_area(vertices) -> float:
        area = 0.0
        points = list(vertices)
        for i, current in enumerate(points):
            nxt = points[(i + 1) % len(points)]
            area += current.x * nxt.y
            area -= nxt.x * current.y
        return abs(area) / 2.0

    @staticmethod
    def _distance(x1: float, y1: float, x2: float, y2: float) -> float:
        return math.hypot(x2 - x1, y2 - y1)

    @staticmethod
    def _alternatives_for_rule(rule_id: str) -> list[str]:
        if rule_id == "RNE-AR-001":
            return [
                "Ajustar vertices del terreno para que el area geometrica coincida con el area declarada.",
                "Reducir programa arquitectonico si el area efectiva del lote es menor a la declarada.",
            ]
        if rule_id == "RNE-AR-002":
            return [
                "Reducir longitud/espesor de muros no estructurales para liberar area util.",
                "Reorganizar ambientes con menos divisiones internas.",
            ]
        if rule_id.startswith("RNE-PU-"):
            return [
                "Incrementar ancho de puertas segun tipo: principal 0.90m, interior 0.80m, bano 0.70m.",
            ]
        if rule_id == "RNE-ES-001":
            return [
                "Corregir host_wall_id de cada abertura para que apunte a muros existentes en el plano.",
            ]
        if rule_id == "RNE-SA-001":
            return [
                "Reconectar tramos sanitarios a nodos existentes y consolidar montante principal.",
            ]
        if rule_id == "RNE-EL-001":
            return [
                "Reubicar tablero general cerca del ingreso principal (<= 3.0m).",
            ]
        if rule_id.startswith("RNE-LIM-"):
            return [
                "Error: Un ambiente se sale de los limites del terreno. Reposicionar vertices para que queden dentro del poligono del terreno.",
            ]
        return ["Revisar la regla tecnica observada y regenerar propuesta con restricciones explicitas."]
