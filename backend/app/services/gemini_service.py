import json
import logging
import math
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from app.core.exceptions import GeminiInvalidJSONError, GeminiSchemaValidationError, GeminiServiceError
from app.core.settings import get_settings
from app.schemas.layout_v1 import LayoutV1Response
from app.services.layout_optimizer import FurnitureOptimizer

logger = logging.getLogger("vipromt.gemini")

SYSTEM_INSTRUCTION = """
[ROL Y PERSONALIDAD]
Eres "ViPromt", una Inteligencia Artificial experta y multidisciplinaria que opera en Peru. Asumes simultaneamente los roles de: Arquitecto Senior, Ingeniero Civil Estructural, Disenador de Interiores, y Especialista en Instalaciones Sanitarias y Electricas (MEP).
Tu tono es profesional, consultivo, analitico y estrictamente apegado a la fisica y a la realidad constructiva. Nunca asumes, nunca alucinas espacios imposibles y siempre optimizas los recursos del usuario.

[MISION PRINCIPAL]
Tu objetivo es recibir requerimientos de usuarios (texto) junto con restricciones espaciales (imagenes de planos, bocetos a mano alzada o medidas de terrenos) y devolver una distribucion espacial y tecnica perfectamente viable. Todo tu diseno debe regirse bajo el Reglamento Nacional de Edificaciones (RNE) de Peru.

[REGLAS ESTRICTAS DE ARQUITECTURA E INGENIERIA]
1. Cero Alucinaciones Espaciales: La suma de las areas de los ambientes propuestos (incluyendo muros) NUNCA puede superar el area total del terreno proporcionado. Si el usuario pide mas ambientes de los que fisicamente caben, debes rechazar la solicitud, explicar matematicamente por que no es posible y sugerir una alternativa viable.
2. Normativa RNE (Peru):
   - Ancho minimo de puertas: Principal (0.90m), Interiores (0.80m), Banos (0.70m).
   - Ancho minimo de pasadizos: 0.90m a 1.00m.
   - Ventilacion e Iluminacion: Todo ambiente principal (sala, dormitorio) debe tener acceso a luz natural y ventilacion. No crees "cuartos ciegos" a menos que sea un deposito.
3. Respeto Estructural: Si el usuario proporciona un plano con columnas o muros portantes existentes, tu diseno no puede alterar, mover ni atravesar estos elementos estructurales.

[REGLAS DE INSTALACIONES (MEP) - OPTIMIZACION]
1. Zonas Humedas (Sanitarias): Debes agrupar obligatoriamente los ambientes que requieran agua y desague (ej. cocina, lavanderia, banos) para que compartan la misma montante y red de tuberias. Esto minimiza costos de construccion.
2. Red Electrica: Define la ubicacion logica del Tablero General (cerca del ingreso principal). Distribuye tomacorrientes e iluminacion considerando la ergonomia y la disposicion del mobiliario (ej. tomacorrientes a los lados de la cama, luz calida sobre islas o peninsulas de cocina).

[ERGONOMIA Y DISENO DE INTERIORES]
1. Considera medidas universales para el mobiliario (camas Queen/King, mesas de comedor, sofas) y asegura que exista un radio de giro y espacio de circulacion minimo de 0.60m alrededor de ellos.
2. Si el usuario pide recomendaciones de diseno, sugiere paletas de colores y materiales realistas que se ajusten a la iluminacion calculada.

[MOBILIARIO OBLIGATORIO]
Para cada ambiente, DEBES proponer al menos 1 mueble logico en el array "mobiliario":
- Dormitorio: cama (1.40x2.00m), opcionalmente mesa (mesita_noche)
- Bano: inodoro (0.40x0.65m), lavabo (0.55x0.45m), opcionalmente ducha (0.90x0.90m)
- Sala: sofa (2.10x0.90m)
- Cocina: cocina (2.40x0.60m)
- Comedor: mesa (1.20x0.80m)
- Garaje/Cochera: auto (2.40x5.00m)
El campo "insertion" es el punto (x,y) del CENTRO del mueble en metros.
El mueble DEBE caber dentro de los vertices del ambiente asignado (room_id).
SIEMPRE especifica el campo "room_id" con el ID del ambiente que contiene el mueble.
La escala (scale) siempre debe ser 1.0 salvo que se requiera ajuste especial.

[ROTACION Y ALINEACION DE MUEBLES]
Usa "rotation_deg" para alinear los muebles contra las paredes:
- rotation_deg=0: El mueble se orienta con su lado LARGO en el eje X (horizontal).
- rotation_deg=90: El mueble se orienta con su lado LARGO en el eje Y (vertical).
- rotation_deg=180 o 270: Orientaciones inversas.
REGLAS DE ALINEACION:
1. Camas: Alinea el cabecero contra un muro. Si el muro es horizontal (eje X), rotation_deg=0. Si el muro es vertical (eje Y), rotation_deg=90.
2. Sofas: Ubica el respaldo contra un muro. El sofa debe mirar hacia el centro de la sala.
3. Inodoros y lavabos: Apoya contra un muro del bano, con rotation_deg apropiado.
4. Cocinas: Alinea contra un muro, normalmente con rotation_deg=0 o 90.
5. Asegura un espacio de circulacion minimo de 0.50m entre el mueble y cualquier pared opuesta.

[FORMATO DE RESPUESTA]
Cuando se te solicite generar la distribucion tecnica, tu respuesta FINAL debe ser UNICA Y EXCLUSIVAMENTE un objeto JSON valido.
No incluyas saludos, explicaciones en texto plano, ni bloques de markdown fuera del JSON.
DEBES usar exactamente estas llaves top-level:
- version
- project_id
- timestamp_utc
- coordenadas_terreno
- ambientes
- muros_y_columnas
- puertas_ventanas
- mobiliario
- instalaciones_MEP
- validacion_RNE
No uses llaves alternativas como "proyecto", "distribucion_arquitectonica", "sanitarias" o similares.

[EJEMPLO OBLIGATORIO DE SALIDA]
{
  "version": "v1.1",
  "project_id": "vipromt-proj-001",
  "timestamp_utc": "2026-03-01T00:00:00Z",
  "coordenadas_terreno": {
    "unidad": "m",
    "area_total_m2": 90,
    "vertices": [{"x":0,"y":0},{"x":6,"y":0},{"x":6,"y":15},{"x":0,"y":15}]
  },
  "ambientes": [
    {
      "id": "room_1",
      "nombre": "Dormitorio",
      "uso": "privado",
      "vertices": [{"x":0.2,"y":9.5},{"x":3.2,"y":9.5},{"x":3.2,"y":14.7},{"x":0.2,"y":14.7}],
      "area_m2": 15.6
    }
  ],
  "muros_y_columnas": {
    "muros": [
      {
        "id": "wall_1",
        "tipo": "cerramiento",
        "inicio": {"x":0,"y":0},
        "fin": {"x":6,"y":0},
        "espesor_m": 0.15,
        "altura_m": 2.4
      }
    ],
    "columnas": []
  },
  "puertas_ventanas": {
    "puertas": [
      {
        "id": "door_1",
        "tipo": "principal",
        "host_wall_id": "wall_1",
        "offset_m": 1.2,
        "posicion": {"x":1.2,"y":0},
        "ancho_m": 0.9,
        "alto_m": 2.1,
        "abatimiento": "derecha"
      }
    ],
    "ventanas": []
  },
  "mobiliario": [
    {
      "id": "furn_1",
      "block_type": "cama",
      "insertion": {"x":1.4,"y":12.0},
      "rotation_deg": 0,
      "scale": 1.0,
      "room_id": "room_1",
      "metadata": {"source":"gemini"}
    }
  ],
  "instalaciones_MEP": {
    "sanitaria": {
      "montante_id": "montante_1",
      "nodos_agua": [{"id":"wa_1","tipo":"lavamanos","ambiente":"bano","ubicacion":{"x":4.5,"y":10.5}}],
      "nodos_desague": [{"id":"wd_1","tipo":"inodoro","ambiente":"bano","ubicacion":{"x":4.7,"y":10.5}}],
      "tramos": [{"id":"pipe_1","desde_nodo_id":"wa_1","hasta_nodo_id":"wd_1","diametro_mm":50,"pendiente_porcentaje":2}]
    },
    "electrica": {
      "tablero_general": {"id":"tg_1","ubicacion":{"x":0.5,"y":0.5},"amperaje_principal":60},
      "circuitos": [{"id":"circuit_1","tipo":"iluminacion","breaker_a":20}],
      "puntos": [{"id":"ep_1","tipo":"luminaria","ambiente":"sala","ubicacion":{"x":2.0,"y":2.0},"circuito_id":"circuit_1"}]
    }
  },
  "validacion_RNE": {
    "estado_global": "observado",
    "reglas_evaluadas": [{"rule_id":"RNE-EX-001","categoria":"arquitectura","resultado":"cumple","evidencia":"Formato correcto"}],
    "resumen": {"total_reglas":1,"cumple":1,"no_cumple":0,"no_aplica":0}
  }
}
""".strip()

LAYOUT_V1_REPAIR_INSTRUCTION = """
Eres un normalizador de JSON estricto.
Tu trabajo es convertir una entrada JSON de arquitectura al contrato LayoutV1Response.
Debes responder SOLO un objeto JSON valido con estas llaves top-level exactas:
- version
- project_id
- timestamp_utc
- coordenadas_terreno
- ambientes
- muros_y_columnas
- puertas_ventanas
- mobiliario
- instalaciones_MEP
- validacion_RNE

No agregues markdown, comentarios ni texto fuera del JSON.
Si un dato falta, completa con valores plausibles y conservadores que cumplan tipos y estructura.
""".strip()

ITERATION_SYSTEM_PROMPT = """
[ROL]
Eres "ViPromt", un Arquitecto CAD experto que está EDITANDO un plano existente.
NO generes un plano desde cero. Modifica SOLO lo que el usuario pide.

[REGLA CRÍTICA]
1. Recibirás el JSON completo del plano actual. Es tu PUNTO DE PARTIDA.
2. Modifica ÚNICAMENTE los elementos que el usuario menciona.
3. CONSERVA todos los IDs, vértices y elementos que NO fueron mencionados.
4. Si el usuario pide mover un ambiente, actualiza sus vértices y ajusta los muros adyacentes.
5. Si el usuario pide agregar un ambiente, agrégalo sin eliminar los existentes.
6. Si el usuario pide eliminar un ambiente, elimínalo y ajusta muros y puertas.
7. Mantén la topología sanitaria y eléctrica coherente con los cambios.
8. Respeta el RNE (anchos mínimos de puertas, pasadizos, ventilación).
9. La suma de áreas NUNCA puede superar el área del terreno.
10. Devuelve el JSON COMPLETO del layout modificado (no un diff/delta).

[REGLAS INQUEBRANTABLES DE PRESERVACIÓN]
11. BAJO NINGUNA CIRCUNSTANCIA puedes eliminar un ambiente existente del array "ambientes"
    a menos que el usuario EXPLÍCITAMENTE diga "elimina", "borra" o "quita" ese ambiente.
12. NUNCA cambies el "id" de un ambiente existente. Los IDs son inmutables.
13. SIEMPRE devuelve el array COMPLETO de "ambientes" con TODOS los ambientes originales
    y sus IDs intactos. Si el usuario pide "reduce el dormitorio", reduces sus vértices
    y area_m2 pero el ambiente SIGUE EXISTIENDO con su mismo id.
14. TODOS los vértices de TODOS los ambientes DEBEN estar dentro de los límites del terreno
    (coordenadas_terreno.vertices). Un ambiente NUNCA puede tener vértices con X < 0,
    X > ancho_terreno, Y < 0, o Y > fondo_terreno.

[FORMATO]
Responde ÚNICAMENTE con un objeto JSON válido con las mismas llaves top-level:
version, project_id, timestamp_utc, coordenadas_terreno, ambientes,
muros_y_columnas, puertas_ventanas, mobiliario, instalaciones_MEP, validacion_RNE.
""".strip()


class GeminiLayoutService:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise GeminiServiceError("Missing GEMINI_API_KEY configuration")
        try:
            from google import genai
        except Exception as exc:
            raise GeminiServiceError("google-genai SDK is not installed in the current environment") from exc

        self._types = genai.types
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.gemini_model

    def generate_layout(
        self,
        project_id: str,
        user_prompt: str,
        image_bytes: bytes | None,
        image_mime_type: str | None,
    ) -> LayoutV1Response:
        types: Any = self._types
        parts = [types.Part(text=user_prompt)]

        if image_bytes and image_mime_type:
            parts.append(types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type))

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )
        except Exception as exc:
            logger.exception(
                "Gemini SDK call failed | model=%s | project_id=%s | error_type=%s | error=%r",
                self.model,
                project_id,
                type(exc).__name__,
                exc,
            )
            raise GeminiServiceError(f"Gemini request failed: {exc}") from exc

        raw_text = response.text or ""
        try:
            parsed_raw = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            logger.exception(
                "Gemini returned invalid JSON | model=%s | project_id=%s | raw_text_preview=%r",
                self.model,
                project_id,
                raw_text[:700],
            )
            raise GeminiInvalidJSONError(f"Gemini returned non-JSON response: {exc}") from exc

        parsed = self._normalize_payload(parsed_raw, project_id=project_id, raw_text=raw_text)
        parsed["project_id"] = project_id
        parsed.setdefault("version", "v1.1")
        parsed.setdefault("timestamp_utc", datetime.now(UTC).isoformat())

        layout = self._validate_or_repair(parsed=parsed, project_id=project_id)
        self._clamp_layout_model(layout, project_id=project_id)
        self._repair_orphan_openings(layout, project_id=project_id)
        
        # Override LLM furniture with deterministic placement
        layout = FurnitureOptimizer().optimize_placement(layout)
        
        return layout

    def iterate_layout(
        self,
        project_id: str,
        user_message: str,
        current_layout_json: dict,
        conversation_history: list[dict],
    ) -> LayoutV1Response:
        """Edit an existing layout based on a natural-language instruction."""
        types: Any = self._types

        # Build the user content: current layout + conversation context + new instruction
        context_block = (
            "## Layout Actual (tu punto de partida):\n"
            f"```json\n{json.dumps(current_layout_json, ensure_ascii=False)}\n```\n\n"
        )

        history_block = ""
        if conversation_history:
            history_lines = []
            for msg in conversation_history[-6:]:  # Keep last 6 messages for context window
                role = msg.get("role", "user")
                content = msg.get("content", "")
                history_lines.append(f"[{role.upper()}]: {content}")
            history_block = (
                "## Historial de conversación:\n"
                + "\n".join(history_lines)
                + "\n\n"
            )

        user_content = (
            context_block
            + history_block
            + f"## Instrucción del usuario:\n{user_message}"
        )

        parts = [types.Part(text=user_content)]

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    system_instruction=ITERATION_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )
        except Exception as exc:
            logger.exception(
                "Gemini iterate call failed | model=%s | project_id=%s | error=%r",
                self.model, project_id, exc,
            )
            raise GeminiServiceError(f"Gemini iterate request failed: {exc}") from exc

        raw_text = response.text or ""
        try:
            parsed_raw = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            logger.exception(
                "Gemini iterate returned invalid JSON | model=%s | project_id=%s",
                self.model, project_id,
            )
            raise GeminiInvalidJSONError(f"Gemini iterate returned non-JSON: {exc}") from exc

        parsed = self._normalize_payload(parsed_raw, project_id=project_id, raw_text=raw_text)
        parsed["project_id"] = project_id
        parsed.setdefault("version", "v1.1")
        parsed.setdefault("timestamp_utc", datetime.now(UTC).isoformat())

        layout = self._validate_or_repair(parsed=parsed, project_id=project_id)
        self._clamp_layout_model(layout, project_id=project_id)
        self._repair_orphan_openings(layout, project_id=project_id)
        
        # Override LLM furniture with deterministic placement
        layout = FurnitureOptimizer().optimize_placement(layout)
        
        return layout

    def _clamp_layout_model(self, layout: LayoutV1Response, project_id: str) -> None:
        """Clamp all coordinates in a validated LayoutV1Response to terrain bounds."""
        terrain_verts = layout.coordenadas_terreno.vertices
        if not terrain_verts:
            return

        xs = [v.x for v in terrain_verts]
        ys = [v.y for v in terrain_verts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)

        clamped_count = 0

        def clamp_pt(pt: Any) -> int:
            """Clamp a Point2D-like object in-place."""
            changed = 0
            cx = max(min_x, min(pt.x, max_x))
            if cx != pt.x:
                pt.x = cx
                changed = 1
            cy = max(min_y, min(pt.y, max_y))
            if cy != pt.y:
                pt.y = cy
                changed = 1
            return changed

        # Clamp ambientes
        for room in layout.ambientes:
            for v in room.vertices:
                clamped_count += clamp_pt(v)

        # Clamp muros
        for wall in layout.muros_y_columnas.muros:
            clamped_count += clamp_pt(wall.inicio)
            clamped_count += clamp_pt(wall.fin)

        # Clamp columnas
        for col in layout.muros_y_columnas.columnas:
            clamped_count += clamp_pt(col.centro)

        # Clamp puertas y ventanas
        for door in layout.puertas_ventanas.puertas:
            clamped_count += clamp_pt(door.posicion)
        for win in layout.puertas_ventanas.ventanas:
            clamped_count += clamp_pt(win.posicion)

        # Clamp mobiliario to ROOM bounds (not just terrain)
        room_bounds: dict[str, tuple[float, float, float, float]] = {}
        for room in layout.ambientes:
            rxs = [v.x for v in room.vertices]
            rys = [v.y for v in room.vertices]
            room_bounds[room.id] = (min(rxs), max(rxs), min(rys), max(rys))

        furniture_dims_m: dict[str, tuple[float, float]] = {
            "cama": (1.40, 2.00), "inodoro": (0.40, 0.65), "lavabo": (0.55, 0.45),
            "mesa": (1.20, 0.80), "auto": (2.40, 5.00), "sofa": (2.10, 0.90),
            "cocina": (2.40, 0.60), "ducha": (0.90, 0.90), "otro": (0.60, 0.60),
        }

        for furn in layout.mobiliario:
            fw, fh = furniture_dims_m.get(furn.block_type, (0.6, 0.6))
            # If rotated 90 or 270 degrees, swap w/h
            if furn.rotation_deg in (90, 270, -90, -270):
                fw, fh = fh, fw
            half_w, half_h = fw / 2, fh / 2

            if furn.room_id and furn.room_id in room_bounds:
                rb = room_bounds[furn.room_id]
                pad = 0.05  # 5cm wall padding
                new_x = max(rb[0] + half_w + pad, min(furn.insertion.x, rb[1] - half_w - pad))
                new_y = max(rb[2] + half_h + pad, min(furn.insertion.y, rb[3] - half_h - pad))
            else:
                # Fallback to terrain bounds
                new_x = max(min_x + half_w, min(furn.insertion.x, max_x - half_w))
                new_y = max(min_y + half_h, min(furn.insertion.y, max_y - half_h))

            if new_x != furn.insertion.x or new_y != furn.insertion.y:
                furn.insertion.x = new_x
                furn.insertion.y = new_y
                clamped_count += 1

        # Clamp MEP
        san = layout.instalaciones_MEP.sanitaria
        for node in san.nodos_agua:
            clamped_count += clamp_pt(node.ubicacion)
        for node in san.nodos_desague:
            clamped_count += clamp_pt(node.ubicacion)
        elec = layout.instalaciones_MEP.electrica
        clamped_count += clamp_pt(elec.tablero_general.ubicacion)
        for punto in elec.puntos:
            clamped_count += clamp_pt(punto.ubicacion)

        if clamped_count > 0:
            logger.info(
                "Coordinate clamper adjusted %d points to terrain bounds [%.1f,%.1f]-[%.1f,%.1f] | project_id=%s",
                clamped_count, min_x, min_y, max_x, max_y, project_id,
            )

    def _validate_or_repair(self, parsed: dict[str, Any], project_id: str) -> LayoutV1Response:
        try:
            return LayoutV1Response.model_validate(parsed)
        except ValidationError as exc:
            logger.warning(
                "Gemini JSON schema validation failed on first pass; trying deterministic coercion | model=%s | project_id=%s | parsed_preview=%r",
                self.model,
                project_id,
                str(parsed)[:900],
            )
            coerced_payload = self._coerce_layout_v1_shape(parsed=parsed, project_id=project_id)
            try:
                return LayoutV1Response.model_validate(coerced_payload)
            except ValidationError:
                logger.warning(
                    "Deterministic coercion did not fully satisfy schema; trying LLM repair | model=%s | project_id=%s",
                    self.model,
                    project_id,
                )

            repaired_payload = self._repair_payload_to_layout_v1(parsed=parsed, project_id=project_id)
            repaired_payload = self._coerce_layout_v1_shape(
                parsed=repaired_payload,
                project_id=project_id,
            )

            try:
                return LayoutV1Response.model_validate(repaired_payload)
            except ValidationError as repair_exc:
                logger.exception(
                    "Gemini repaired JSON still failed schema | model=%s | project_id=%s | repaired_preview=%r",
                    self.model,
                    project_id,
                    str(repaired_payload)[:900],
                )
                raise GeminiSchemaValidationError(
                    f"Gemini JSON failed schema validation: {exc}; repair attempt failed: {repair_exc}"
                ) from repair_exc

    def _normalize_payload(self, payload: Any, project_id: str, raw_text: str) -> dict[str, Any]:
        # Gemini can occasionally return a JSON array; accept only a single-object list.
        if isinstance(payload, list):
            if len(payload) == 1 and isinstance(payload[0], dict):
                logger.warning(
                    "Gemini payload came as single-item list; normalizing to object | model=%s | project_id=%s",
                    self.model,
                    project_id,
                )
                return payload[0]

            logger.exception(
                "Gemini payload is an unsupported JSON list | model=%s | project_id=%s | payload_preview=%r",
                self.model,
                project_id,
                str(payload)[:900],
            )
            raise GeminiSchemaValidationError(
                "Gemini returned JSON list, expected a single JSON object matching LayoutV1Response"
            )

        if not isinstance(payload, dict):
            logger.exception(
                "Gemini payload is not a JSON object | model=%s | project_id=%s | payload_type=%s | raw_preview=%r",
                self.model,
                project_id,
                type(payload).__name__,
                raw_text[:900],
            )
            raise GeminiSchemaValidationError(
                f"Gemini returned unsupported JSON type: {type(payload).__name__}; expected object"
            )

        return payload

    def _repair_payload_to_layout_v1(self, parsed: dict[str, Any], project_id: str) -> dict[str, Any]:
        types: Any = self._types
        repair_prompt = (
            "Normaliza este JSON al contrato LayoutV1Response.\n"
            "JSON_ORIGINAL:\n"
                f"{json.dumps(parsed, ensure_ascii=False)}\n"
        )

        try:
            repair_response = self.client.models.generate_content(
                model=self.model,
                contents=[types.Content(role="user", parts=[types.Part(text=repair_prompt)])],
                config=types.GenerateContentConfig(
                    system_instruction=LAYOUT_V1_REPAIR_INSTRUCTION,
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )
        except Exception as exc:
            logger.exception(
                "Gemini repair call failed | model=%s | project_id=%s | error_type=%s | error=%r",
                self.model,
                project_id,
                type(exc).__name__,
                exc,
            )
            raise GeminiSchemaValidationError(f"Gemini repair call failed: {exc}") from exc

        repair_text = repair_response.text or ""
        try:
            repair_raw = json.loads(repair_text)
        except json.JSONDecodeError as exc:
            logger.exception(
                "Gemini repair returned invalid JSON | model=%s | project_id=%s | raw_preview=%r",
                self.model,
                project_id,
                repair_text[:900],
            )
            raise GeminiSchemaValidationError(
                f"Gemini repair returned non-JSON response: {exc}"
            ) from exc

        return self._normalize_payload(repair_raw, project_id=project_id, raw_text=repair_text)

    def _coerce_layout_v1_shape(self, parsed: dict[str, Any], project_id: str) -> dict[str, Any]:
        terreno_raw = self._pick_first_dict(
            parsed,
            [
                ("coordenadas_terreno",),
                ("proyecto", "terreno"),
                ("terreno",),
            ],
        )
        ancho = self._to_float(terreno_raw.get("ancho"))
        largo = self._to_float(terreno_raw.get("largo"))
        vertices = self._coerce_points(
            terreno_raw.get("vertices") or terreno_raw.get("poligono") or terreno_raw.get("coordenadas")
        )
        if not vertices and ancho > 0 and largo > 0:
            vertices = [
                {"x": 0.0, "y": 0.0},
                {"x": ancho, "y": 0.0},
                {"x": ancho, "y": largo},
                {"x": 0.0, "y": largo},
            ]
        if len(vertices) < 3:
            vertices = [{"x": 0.0, "y": 0.0}, {"x": 6.0, "y": 0.0}, {"x": 6.0, "y": 15.0}]
        area_total = self._to_float(
            terreno_raw.get("area_total")
            or terreno_raw.get("area_total_m2")
            or terreno_raw.get("area")
            or parsed.get("area_total_m2")
        )
        if area_total <= 0:
            area_total = self._polygon_area(vertices)
            if area_total <= 0:
                area_total = 90.0

        muros_y_columnas_raw = parsed.get("muros_y_columnas")
        if isinstance(muros_y_columnas_raw, dict):
            muros_raw = muros_y_columnas_raw.get("muros") or []
            columnas_raw = muros_y_columnas_raw.get("columnas") or []
        elif isinstance(muros_y_columnas_raw, list):
            muros_raw = muros_y_columnas_raw
            columnas_raw = []
        else:
            muros_raw = parsed.get("muros") or parsed.get("distribucion_muros") or []
            columnas_raw = parsed.get("columnas") or []

        muros = [self._coerce_wall(item, idx) for idx, item in enumerate(muros_raw) if isinstance(item, dict)]
        columnas = [
            self._coerce_column(item, idx) for idx, item in enumerate(columnas_raw) if isinstance(item, dict)
        ]

        if not muros:
            muros = self._default_perimeter_walls(vertices)

        puertas_ventanas_raw = parsed.get("puertas_ventanas")
        puertas_raw: list[dict[str, Any]]
        ventanas_raw: list[dict[str, Any]]
        if isinstance(puertas_ventanas_raw, dict):
            puertas_raw = [p for p in (puertas_ventanas_raw.get("puertas") or []) if isinstance(p, dict)]
            ventanas_raw = [w for w in (puertas_ventanas_raw.get("ventanas") or []) if isinstance(w, dict)]
        elif isinstance(puertas_ventanas_raw, list):
            puertas_raw = []
            ventanas_raw = []
            for item in puertas_ventanas_raw:
                if not isinstance(item, dict):
                    continue
                tipo = str(item.get("tipo", "")).lower()
                if "ventan" in tipo:
                    ventanas_raw.append(item)
                else:
                    puertas_raw.append(item)
        else:
            puertas_raw = [p for p in (parsed.get("puertas") or []) if isinstance(p, dict)]
            ventanas_raw = [w for w in (parsed.get("ventanas") or []) if isinstance(w, dict)]

        puertas = [self._coerce_door(item, idx, muros) for idx, item in enumerate(puertas_raw)]
        ventanas = [self._coerce_window(item, idx, muros) for idx, item in enumerate(ventanas_raw)]

        instalaciones_raw = parsed.get("instalaciones_MEP")
        if isinstance(instalaciones_raw, dict):
            sanitaria_raw = (
                instalaciones_raw.get("sanitaria")
                or instalaciones_raw.get("sanitarias")
                or instalaciones_raw.get("red_agua")
                or {}
            )
            electrica_raw = (
                instalaciones_raw.get("electrica")
                or instalaciones_raw.get("electricas")
                or instalaciones_raw.get("red_electrica")
                or {}
            )
        else:
            sanitaria_raw = parsed.get("sanitaria") or parsed.get("sanitarias") or {}
            electrica_raw = parsed.get("electrica") or parsed.get("electricas") or {}

        sanitaria = self._coerce_sanitary(sanitaria_raw)
        electrica = self._coerce_electrical(electrica_raw, puertas)
        validacion_rne = self._coerce_validation(parsed.get("validacion_RNE") or parsed.get("cumplimiento_RNE"))
        ambientes = self._coerce_ambientes(parsed, vertices)
        mobiliario = self._coerce_furniture(parsed, ambientes)

        return {
            "version": "v1.1",
            "project_id": project_id,
            "timestamp_utc": datetime.now(UTC).isoformat(),
            "coordenadas_terreno": {
                "unidad": "m",
                "area_total_m2": area_total,
                "vertices": vertices,
            },
            "ambientes": ambientes,
            "muros_y_columnas": {
                "muros": muros,
                "columnas": columnas,
            },
            "puertas_ventanas": {
                "puertas": puertas,
                "ventanas": ventanas,
            },
            "mobiliario": mobiliario,
            "instalaciones_MEP": {
                "sanitaria": sanitaria,
                "electrica": electrica,
            },
            "validacion_RNE": validacion_rne,
        }

    def _coerce_wall(self, item: dict[str, Any], idx: int) -> dict[str, Any]:
        tipo_raw = str(item.get("tipo", "no_portante")).lower()
        if "port" in tipo_raw:
            tipo = "portante"
        elif "cerr" in tipo_raw:
            tipo = "cerramiento"
        else:
            tipo = "no_portante"
        return {
            "id": str(item.get("id") or f"wall_{idx + 1}"),
            "tipo": tipo,
            "inicio": self._coerce_point(item.get("inicio") or item.get("start")),
            "fin": self._coerce_point(item.get("fin") or item.get("end")),
            "espesor_m": max(0.1, self._to_float(item.get("espesor_m") or item.get("espesor") or 0.15)),
            "altura_m": max(2.2, self._to_float(item.get("altura_m") or item.get("altura") or 2.4)),
        }

    def _coerce_column(self, item: dict[str, Any], idx: int) -> dict[str, Any]:
        return {
            "id": str(item.get("id") or f"col_{idx + 1}"),
            "centro": self._coerce_point(item.get("centro") or item.get("ubicacion")),
            "ancho_m": max(0.2, self._to_float(item.get("ancho_m") or item.get("ancho") or 0.25)),
            "largo_m": max(0.2, self._to_float(item.get("largo_m") or item.get("largo") or 0.25)),
            "estructural": bool(item.get("estructural", True)),
        }

    def _coerce_door(self, item: dict[str, Any], idx: int, muros: list[dict[str, Any]]) -> dict[str, Any]:
        tipo_raw = str(item.get("tipo", "interior")).lower()
        if "prin" in tipo_raw:
            tipo = "principal"
            min_w = 0.9
        elif "ba" in tipo_raw:
            tipo = "bano"
            min_w = 0.7
        elif "serv" in tipo_raw:
            tipo = "servicio"
            min_w = 0.7
        else:
            tipo = "interior"
            min_w = 0.8
        return {
            "id": str(item.get("id") or f"door_{idx + 1}"),
            "tipo": tipo,
            "host_wall_id": str(
                item.get("host_wall_id") or item.get("muro_id") or (muros[0]["id"] if muros else "wall_1")
            ),
            "offset_m": max(0.0, self._to_float(item.get("offset_m") or item.get("offset") or 0.5)),
            "posicion": self._coerce_point(item.get("posicion") or item.get("ubicacion")),
            "ancho_m": max(min_w, self._to_float(item.get("ancho_m") or item.get("ancho") or min_w)),
            "alto_m": max(2.0, self._to_float(item.get("alto_m") or item.get("alto") or 2.1)),
            "abatimiento": self._coerce_abatimiento(item.get("abatimiento")),
        }

    def _coerce_window(self, item: dict[str, Any], idx: int, muros: list[dict[str, Any]]) -> dict[str, Any]:
        tipo_raw = str(item.get("tipo", "corrediza")).lower()
        if "bat" in tipo_raw:
            tipo = "batiente"
        elif "fij" in tipo_raw:
            tipo = "fija"
        elif "proy" in tipo_raw:
            tipo = "proyectante"
        else:
            tipo = "corrediza"
        return {
            "id": str(item.get("id") or f"window_{idx + 1}"),
            "host_wall_id": str(
                item.get("host_wall_id") or item.get("muro_id") or (muros[0]["id"] if muros else "wall_1")
            ),
            "offset_m": max(0.0, self._to_float(item.get("offset_m") or item.get("offset") or 0.5)),
            "posicion": self._coerce_point(item.get("posicion") or item.get("ubicacion")),
            "ancho_m": max(0.5, self._to_float(item.get("ancho_m") or item.get("ancho") or 1.2)),
            "alto_m": max(0.4, self._to_float(item.get("alto_m") or item.get("alto") or 1.0)),
            "antepecho_m": max(0.0, self._to_float(item.get("antepecho_m") or item.get("antepecho") or 0.9)),
            "tipo": tipo,
        }

    def _coerce_ambientes(
        self, parsed: dict[str, Any], terreno_vertices: list[dict[str, float]]
    ) -> list[dict[str, Any]]:
        raw_ambientes = parsed.get("ambientes")
        if not isinstance(raw_ambientes, list):
            raw_ambientes = parsed.get("distribucion_arquitectonica")
        if not isinstance(raw_ambientes, list):
            raw_ambientes = parsed.get("espacios")
        if not isinstance(raw_ambientes, list):
            raw_ambientes = []

        # Compute terrain bounding box for auto-placement fallback
        t_xs = [self._to_float(v.get("x")) for v in terreno_vertices if isinstance(v, dict)]
        t_ys = [self._to_float(v.get("y")) for v in terreno_vertices if isinstance(v, dict)]
        terrain_min_x = min(t_xs) if t_xs else 0.0
        terrain_max_x = max(t_xs) if t_xs else 6.0
        terrain_min_y = min(t_ys) if t_ys else 0.0
        terrain_width = terrain_max_x - terrain_min_x

        # Track current Y offset for auto-placement
        auto_y_cursor = terrain_min_y

        ambientes: list[dict[str, Any]] = []
        for idx, item in enumerate(raw_ambientes):
            if not isinstance(item, dict):
                continue

            nombre = str(item.get("nombre") or item.get("name") or f"Ambiente {idx + 1}")
            uso = self._map_uso(item.get("uso") or item.get("tipo"))

            dims = item.get("dimensiones") if isinstance(item.get("dimensiones"), dict) else {}
            start = item.get("coordenadas_inicio") if isinstance(item.get("coordenadas_inicio"), dict) else {}
            width = self._to_float(item.get("ancho_m") or item.get("ancho") or dims.get("ancho"))
            length = self._to_float(item.get("largo_m") or item.get("largo") or dims.get("largo"))
            area = self._to_float(item.get("area_m2") or dims.get("area"))

            # Smart dimension derivation: use area + terrain context instead of hardcoded defaults
            wall_offset = 0.30  # typical double-wall thickness (0.15 * 2)
            usable_width = max(1.0, terrain_width - wall_offset) if terrain_width > 0 else 5.70

            if width <= 0 and length <= 0 and area > 0:
                # Both dimensions missing: derive from area and terrain context
                # Check if room spans full width (e.g., Sala spanning wall-to-wall)
                if area >= usable_width * 2.0:
                    width = usable_width
                    length = area / width
                else:
                    # Smaller room: assume roughly square aspect ratio
                    width = min(math.sqrt(area), usable_width)
                    length = area / width if width > 0.1 else 3.0
            elif width <= 0 and length > 0 and area > 0:
                width = area / length
            elif length <= 0 and width > 0 and area > 0:
                length = area / width
            else:
                if width <= 0:
                    width = min(usable_width, 2.5)
                if length <= 0:
                    length = 3.0

            if area <= 0:
                area = width * length

            # Check if AI provided explicit start coordinates
            has_explicit_start = bool(start) and (
                self._to_float(start.get("x")) != 0.0 or self._to_float(start.get("y")) != 0.0
            )

            if has_explicit_start:
                x0 = self._to_float(start.get("x"))
                y0 = self._to_float(start.get("y"))
            else:
                # Auto-place: center horizontally on terrain, stack vertically
                x0 = terrain_min_x + (terrain_width - min(width, terrain_width)) / 2
                if x0 < terrain_min_x:
                    x0 = terrain_min_x
                y0 = auto_y_cursor

            # Clamp width to terrain width
            room_w = min(width, terrain_width) if terrain_width > 0 else width

            vertices = [
                {"x": x0, "y": y0},
                {"x": x0 + room_w, "y": y0},
                {"x": x0 + room_w, "y": y0 + length},
                {"x": x0, "y": y0 + length},
            ]

            # Advance cursor for next auto-placed room
            if not has_explicit_start:
                auto_y_cursor = y0 + length

            ambientes.append(
                {
                    "id": str(item.get("id") or f"room_{idx + 1}"),
                    "nombre": nombre,
                    "uso": uso,
                    "vertices": vertices,
                    "area_m2": max(0.1, area),
                }
            )

        if ambientes:
            return ambientes

        if len(terreno_vertices) >= 3:
            return [
                {
                    "id": "room_1",
                    "nombre": "Ambiente principal",
                    "uso": "social",
                    "vertices": terreno_vertices,
                    "area_m2": max(0.1, self._polygon_area(terreno_vertices)),
                }
            ]
        return []

    def _coerce_furniture(
        self, parsed: dict[str, Any], ambientes: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        room_by_name = {a["nombre"].lower(): a["id"] for a in ambientes}
        objects_raw: list[dict[str, Any]] = []

        for key in ("mobiliario", "objetos", "bloques"):
            value = parsed.get(key)
            if isinstance(value, list):
                objects_raw.extend([item for item in value if isinstance(item, dict)])

        raw_ambientes = parsed.get("ambientes")
        if not isinstance(raw_ambientes, list):
            raw_ambientes = parsed.get("distribucion_arquitectonica")
        if isinstance(raw_ambientes, list):
            for room in raw_ambientes:
                if not isinstance(room, dict):
                    continue
                room_name = str(room.get("nombre") or room.get("name") or "").lower()
                room_id = room_by_name.get(room_name)
                room_furniture = room.get("mobiliario") or room.get("objetos")
                if isinstance(room_furniture, list):
                    for item in room_furniture:
                        if isinstance(item, dict):
                            copy = dict(item)
                            if room_id and "room_id" not in copy:
                                copy["room_id"] = room_id
                            objects_raw.append(copy)

        furniture: list[dict[str, Any]] = []
        for idx, item in enumerate(objects_raw):
            block_type = self._map_block_type(item.get("block_type") or item.get("tipo") or item.get("nombre"))
            insertion_raw = item.get("insertion") or item.get("ubicacion") or item.get("posicion")
            room_id = item.get("room_id")
            if not room_id and ambientes:
                room_id = ambientes[0]["id"]

            furniture.append(
                {
                    "id": str(item.get("id") or f"furn_{idx + 1}"),
                    "block_type": block_type,
                    "insertion": self._coerce_point(insertion_raw),
                    "rotation_deg": self._to_float(item.get("rotation_deg") or item.get("rotacion") or 0),
                    "scale": max(0.2, self._to_float(item.get("scale") or item.get("escala") or 1.0)),
                    "room_id": str(room_id) if room_id else None,
                    "metadata": {
                        "source": "gemini"
                    },
                }
            )

        if furniture:
            return furniture

        generated: list[dict[str, Any]] = []
        for room_idx, room in enumerate(ambientes):
            default_blocks = self._default_blocks_for_room(room.get("nombre"), room.get("uso"))
            center = self._polygon_center(room.get("vertices"))
            for block_idx, block in enumerate(default_blocks):
                generated.append(
                    {
                        "id": f"furn_auto_{room_idx + 1}_{block_idx + 1}",
                        "block_type": block,
                        "insertion": {
                            "x": center["x"] + (block_idx * 0.35),
                            "y": center["y"] + (block_idx * 0.2),
                        },
                        "rotation_deg": 0.0,
                        "scale": 1.0,
                        "room_id": room.get("id"),
                        "metadata": {"source": "auto_fallback"},
                    }
                )

        return generated

    def _map_uso(self, raw: Any) -> str:
        value = str(raw or "").lower()
        if any(k in value for k in ["social", "sala", "comedor", "estar"]):
            return "social"
        if any(k in value for k in ["dorm", "privad", "habit"]):
            return "privado"
        if any(k in value for k in ["serv", "bano", "baño", "cocina", "lavander"]):
            return "servicio"
        if any(k in value for k in ["pasad", "circul"]):
            return "circulacion"
        return "otro"

    def _map_block_type(self, raw: Any) -> str:
        value = str(raw or "").lower()
        if any(k in value for k in ["cama", "bed"]):
            return "cama"
        if any(k in value for k in ["inodoro", "wc", "toilet"]):
            return "inodoro"
        if any(k in value for k in ["lavabo", "lavamanos", "sink"]):
            return "lavabo"
        if any(k in value for k in ["mesa", "table"]):
            return "mesa"
        if any(k in value for k in ["auto", "car", "coche"]):
            return "auto"
        if any(k in value for k in ["sofa", "sofá"]):
            return "sofa"
        if any(k in value for k in ["cocina", "kitchen"]):
            return "cocina"
        if any(k in value for k in ["ducha", "shower"]):
            return "ducha"
        return "otro"

    def _default_blocks_for_room(self, room_name: Any, room_use: Any) -> list[str]:
        name = str(room_name or "").lower()
        use = str(room_use or "").lower()
        if "dorm" in name or use == "privado":
            return ["cama"]
        if any(k in name for k in ["bano", "baño"]):
            return ["inodoro", "lavabo"]
        if "cocina" in name:
            return ["cocina"]
        if "comedor" in name or "sala" in name or use == "social":
            return ["mesa", "sofa"]
        if "patio" in name or "cochera" in name or "garage" in name:
            return ["auto"]
        return ["otro"]

    def _polygon_center(self, vertices: Any) -> dict[str, float]:
        if not isinstance(vertices, list) or not vertices:
            return {"x": 0.0, "y": 0.0}
        points = [v for v in vertices if isinstance(v, dict)]
        if not points:
            return {"x": 0.0, "y": 0.0}
        x = sum(self._to_float(p.get("x")) for p in points) / len(points)
        y = sum(self._to_float(p.get("y")) for p in points) / len(points)
        return {"x": x, "y": y}

    def _coerce_sanitary(self, raw: Any) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raw = {}
        water_nodes_raw = raw.get("nodos_agua") or raw.get("puntos_agua") or []
        drain_nodes_raw = raw.get("nodos_desague") or raw.get("puntos_desague") or []
        segments_raw = raw.get("tramos") or raw.get("tuberias") or []

        nodos_agua = [self._coerce_mep_node(n, idx, "lavamanos") for idx, n in enumerate(water_nodes_raw) if isinstance(n, dict)]
        nodos_desague = [
            self._coerce_mep_node(n, idx, "inodoro") for idx, n in enumerate(drain_nodes_raw) if isinstance(n, dict)
        ]
        tramos = [self._coerce_pipe_segment(s, idx) for idx, s in enumerate(segments_raw) if isinstance(s, dict)]

        if not nodos_agua:
            nodos_agua = [
                {"id": "wa_1", "tipo": "lavamanos", "ambiente": "bano", "ubicacion": {"x": 1.0, "y": 1.0}}
            ]
        if not nodos_desague:
            nodos_desague = [
                {"id": "wd_1", "tipo": "inodoro", "ambiente": "bano", "ubicacion": {"x": 1.2, "y": 1.1}}
            ]
        if not tramos:
            tramos = [
                {
                    "id": "pipe_1",
                    "desde_nodo_id": nodos_agua[0]["id"],
                    "hasta_nodo_id": nodos_desague[0]["id"],
                    "diametro_mm": 50.0,
                    "pendiente_porcentaje": 2.0,
                }
            ]

        return {
            "montante_id": str(raw.get("montante_id") or raw.get("montante") or "montante_1"),
            "nodos_agua": nodos_agua,
            "nodos_desague": nodos_desague,
            "tramos": tramos,
        }

    def _coerce_electrical(self, raw: Any, puertas: list[dict[str, Any]]) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raw = {}

        panel_raw = raw.get("tablero_general") or raw.get("tablero") or {}
        if not isinstance(panel_raw, dict):
            panel_raw = {}
        principal_ref = next((d for d in puertas if d["tipo"] == "principal"), None)
        panel_default = principal_ref["posicion"] if principal_ref else {"x": 0.5, "y": 0.5}

        circuits_raw = raw.get("circuitos") or raw.get("circuitos_principales") or []
        points_raw = raw.get("puntos") or raw.get("puntos_luz") or raw.get("tomacorrientes") or []

        circuitos = [self._coerce_circuit(c, idx) for idx, c in enumerate(circuits_raw) if isinstance(c, dict)]
        puntos = [self._coerce_electrical_point(p, idx) for idx, p in enumerate(points_raw) if isinstance(p, dict)]

        if not circuitos:
            circuitos = [{"id": "circuit_1", "tipo": "iluminacion", "breaker_a": 20.0}]
        if not puntos:
            puntos = [
                {
                    "id": "ep_1",
                    "tipo": "luminaria",
                    "ambiente": "sala",
                    "ubicacion": {"x": 2.0, "y": 2.0},
                    "circuito_id": circuitos[0]["id"],
                }
            ]

        return {
            "tablero_general": {
                "id": str(panel_raw.get("id") or "tg_1"),
                "ubicacion": self._coerce_point(panel_raw.get("ubicacion") or panel_default),
                "amperaje_principal": max(
                    20.0,
                    self._to_float(panel_raw.get("amperaje_principal") or panel_raw.get("amperaje") or 60.0),
                ),
            },
            "circuitos": circuitos,
            "puntos": puntos,
        }

    def _coerce_validation(self, raw: Any) -> dict[str, Any]:
        if isinstance(raw, dict):
            state = self._coerce_estado_global(raw.get("estado_global") or raw.get("estado") or "observado")
            reglas_raw = raw.get("reglas_evaluadas") or raw.get("reglas") or []
            reglas = [self._coerce_rule(r, idx) for idx, r in enumerate(reglas_raw) if isinstance(r, dict)]
        else:
            state = "observado"
            reglas = []

        if not reglas:
            reglas = [
                {
                    "rule_id": "RNE-BOOT-001",
                    "categoria": "arquitectura",
                    "resultado": "no_aplica",
                    "evidencia": "Validacion inicial completada; se requiere validacion determinista posterior.",
                    "valor_normativo": "N/A",
                    "valor_observado": "N/A",
                    "severidad": "media",
                }
            ]

        resumen = {
            "total_reglas": len(reglas),
            "cumple": sum(1 for r in reglas if r["resultado"] == "cumple"),
            "no_cumple": sum(1 for r in reglas if r["resultado"] == "no_cumple"),
            "no_aplica": sum(1 for r in reglas if r["resultado"] == "no_aplica"),
        }
        if resumen["no_cumple"] > 0 and state == "aprobado":
            state = "observado"

        return {"estado_global": state, "reglas_evaluadas": reglas, "resumen": resumen}

    def _coerce_rule(self, item: dict[str, Any], idx: int) -> dict[str, Any]:
        categoria_raw = str(item.get("categoria", "arquitectura")).lower()
        allowed_cat = {
            "arquitectura",
            "circulacion",
            "ventilacion_iluminacion",
            "sanitaria",
            "electrica",
            "estructural",
        }
        categoria = categoria_raw if categoria_raw in allowed_cat else "arquitectura"
        resultado_raw = str(item.get("resultado", "no_aplica")).lower()
        if resultado_raw in {"cumple", "ok", "true"}:
            resultado = "cumple"
        elif resultado_raw in {"no_cumple", "fail", "false"}:
            resultado = "no_cumple"
        else:
            resultado = "no_aplica"

        sev_raw = str(item.get("severidad", "media")).lower()
        severidad = sev_raw if sev_raw in {"baja", "media", "alta", "critica"} else "media"

        return {
            "rule_id": str(item.get("rule_id") or item.get("id") or f"RNE-AUTO-{idx + 1:03d}"),
            "categoria": categoria,
            "resultado": resultado,
            "evidencia": str(item.get("evidencia") or item.get("detalle") or "Sin evidencia detallada."),
            "valor_normativo": str(item.get("valor_normativo") or "N/A"),
            "valor_observado": str(item.get("valor_observado") or "N/A"),
            "severidad": severidad,
        }

    def _coerce_mep_node(self, item: dict[str, Any], idx: int, fallback_tipo: str) -> dict[str, Any]:
        tipo_raw = str(item.get("tipo") or fallback_tipo).lower()
        allowed = {"lavadero", "inodoro", "ducha", "lavamanos", "fregadero", "punto_lavadora", "otro"}
        tipo = tipo_raw if tipo_raw in allowed else "otro"
        return {
            "id": str(item.get("id") or f"node_{idx + 1}"),
            "tipo": tipo,
            "ambiente": str(item.get("ambiente") or item.get("zona") or "servicio"),
            "ubicacion": self._coerce_point(item.get("ubicacion") or item.get("posicion")),
        }

    def _coerce_pipe_segment(self, item: dict[str, Any], idx: int) -> dict[str, Any]:
        return {
            "id": str(item.get("id") or f"segment_{idx + 1}"),
            "desde_nodo_id": str(item.get("desde_nodo_id") or item.get("desde") or "wa_1"),
            "hasta_nodo_id": str(item.get("hasta_nodo_id") or item.get("hasta") or "wd_1"),
            "diametro_mm": max(40.0, self._to_float(item.get("diametro_mm") or item.get("diametro") or 50.0)),
            "pendiente_porcentaje": max(
                0.5, self._to_float(item.get("pendiente_porcentaje") or item.get("pendiente") or 2.0)
            ),
        }

    def _coerce_circuit(self, item: dict[str, Any], idx: int) -> dict[str, Any]:
        tipo_raw = str(item.get("tipo", "iluminacion")).lower()
        if "tom" in tipo_raw:
            tipo = "tomacorriente"
        elif "fuer" in tipo_raw:
            tipo = "fuerza"
        else:
            tipo = "iluminacion"
        return {
            "id": str(item.get("id") or f"circuit_{idx + 1}"),
            "tipo": tipo,
            "breaker_a": max(10.0, self._to_float(item.get("breaker_a") or item.get("amperaje") or 20.0)),
        }

    def _coerce_electrical_point(self, item: dict[str, Any], idx: int) -> dict[str, Any]:
        tipo_raw = str(item.get("tipo", "luminaria")).lower()
        if "inter" in tipo_raw:
            tipo = "interruptor"
        elif "tom" in tipo_raw:
            tipo = "tomacorriente"
        elif "espec" in tipo_raw:
            tipo = "salida_especial"
        else:
            tipo = "luminaria"
        return {
            "id": str(item.get("id") or f"ep_{idx + 1}"),
            "tipo": tipo,
            "ambiente": str(item.get("ambiente") or "general"),
            "ubicacion": self._coerce_point(item.get("ubicacion") or item.get("posicion")),
            "circuito_id": str(item.get("circuito_id") or item.get("circuito") or "circuit_1"),
        }

    def _coerce_abatimiento(self, raw: Any) -> str:
        value = str(raw or "derecha").lower()
        if "izq" in value:
            return "izquierda"
        if "corr" in value:
            return "corrediza"
        if "pleg" in value:
            return "plegable"
        return "derecha"

    def _coerce_estado_global(self, raw: Any) -> str:
        value = str(raw or "observado").lower()
        if value in {"aprobado", "ok", "cumple"}:
            return "aprobado"
        if value in {"rechazado", "fail", "no_cumple"}:
            return "rechazado"
        return "observado"

    def _coerce_points(self, raw: Any) -> list[dict[str, float]]:
        if not isinstance(raw, list):
            return []
        points: list[dict[str, float]] = []
        for item in raw:
            if isinstance(item, dict):
                points.append(self._coerce_point(item))
        return points

    def _coerce_point(self, raw: Any) -> dict[str, float]:
        if isinstance(raw, dict):
            return {"x": self._to_float(raw.get("x")), "y": self._to_float(raw.get("y"))}
        return {"x": 0.0, "y": 0.0}

    def _pick_first_dict(self, source: dict[str, Any], paths: list[tuple[str, ...]]) -> dict[str, Any]:
        for path in paths:
            current: Any = source
            ok = True
            for key in path:
                if isinstance(current, dict) and key in current:
                    current = current[key]
                else:
                    ok = False
                    break
            if ok and isinstance(current, dict):
                return current
        return {}

    def _default_perimeter_walls(self, vertices: list[dict[str, float]]) -> list[dict[str, Any]]:
        walls: list[dict[str, Any]] = []
        for idx in range(len(vertices)):
            start = vertices[idx]
            end = vertices[(idx + 1) % len(vertices)]
            walls.append(
                {
                    "id": f"wall_{idx + 1}",
                    "tipo": "cerramiento",
                    "inicio": start,
                    "fin": end,
                    "espesor_m": 0.15,
                    "altura_m": 2.4,
                }
            )
        return walls

    def _polygon_area(self, vertices: list[dict[str, float]]) -> float:
        if len(vertices) < 3:
            return 0.0
        area = 0.0
        for i, current in enumerate(vertices):
            nxt = vertices[(i + 1) % len(vertices)]
            area += current["x"] * nxt["y"] - nxt["x"] * current["y"]
        return abs(area) / 2.0

    def _to_float(self, value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _repair_orphan_openings(self, layout: LayoutV1Response, project_id: str) -> None:
        walls = list(layout.muros_y_columnas.muros)
        wall_ids = {wall.id for wall in walls}

        if not walls:
            if layout.puertas_ventanas.puertas or layout.puertas_ventanas.ventanas:
                logger.warning(
                    "No walls available; dropping orphan openings | project_id=%s", project_id
                )
            layout.puertas_ventanas.puertas = []
            layout.puertas_ventanas.ventanas = []
            return

        for door in layout.puertas_ventanas.puertas:
            if door.host_wall_id not in wall_ids:
                repaired_wall = self._nearest_wall(door.posicion.x, door.posicion.y, walls)
                logger.warning(
                    "Repairing orphan door host | project_id=%s | door_id=%s | old_host=%s | new_host=%s",
                    project_id,
                    door.id,
                    door.host_wall_id,
                    repaired_wall.id,
                )
                door.host_wall_id = repaired_wall.id
                door.offset_m = self._wall_offset_m(door.posicion.x, door.posicion.y, repaired_wall)

        for window in layout.puertas_ventanas.ventanas:
            if window.host_wall_id not in wall_ids:
                repaired_wall = self._nearest_wall(window.posicion.x, window.posicion.y, walls)
                logger.warning(
                    "Repairing orphan window host | project_id=%s | window_id=%s | old_host=%s | new_host=%s",
                    project_id,
                    window.id,
                    window.host_wall_id,
                    repaired_wall.id,
                )
                window.host_wall_id = repaired_wall.id
                window.offset_m = self._wall_offset_m(window.posicion.x, window.posicion.y, repaired_wall)

    def _nearest_wall(self, x: float, y: float, walls: list[Any]) -> Any:
        best = walls[0]
        best_dist = float("inf")
        for wall in walls:
            dist = self._point_to_segment_distance(
                x,
                y,
                wall.inicio.x,
                wall.inicio.y,
                wall.fin.x,
                wall.fin.y,
            )
            if dist < best_dist:
                best_dist = dist
                best = wall
        return best

    def _wall_offset_m(self, x: float, y: float, wall: Any) -> float:
        sx, sy = wall.inicio.x, wall.inicio.y
        ex, ey = wall.fin.x, wall.fin.y
        dx = ex - sx
        dy = ey - sy
        length = math.hypot(dx, dy)
        if length == 0:
            return 0.0
        t = ((x - sx) * dx + (y - sy) * dy) / (length * length)
        t = max(0.0, min(1.0, t))
        return round(t * length, 3)

    def _point_to_segment_distance(
        self,
        px: float,
        py: float,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
    ) -> float:
        dx = x2 - x1
        dy = y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(px - x1, py - y1)
        t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
        t = max(0.0, min(1.0, t))
        proj_x = x1 + t * dx
        proj_y = y1 + t * dy
        return math.hypot(px - proj_x, py - proj_y)
