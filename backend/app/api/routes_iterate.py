import json
import logging

from fastapi import APIRouter, Depends, Form, HTTPException, Request

from app.api.deps import get_layout_service, get_layout_validator
from app.core.exceptions import GeminiInvalidJSONError, GeminiSchemaValidationError, GeminiServiceError
from app.schemas.layout_v1 import LayoutV1Response
from app.services.gemini_service import GeminiLayoutService
from app.validators.deterministic_validator import DeterministicLayoutValidator

router = APIRouter(prefix="/api/v1/layouts", tags=["layouts"])
logger = logging.getLogger("vipromt.api.iterate")

MAX_RETRIES = 2


@router.post("/iterate")
async def iterate_layout(
    request: Request,
    project_id: str = Form(...),
    message: str = Form(...),
    current_layout: str = Form(...),
    conversation_history: str = Form(default="[]"),
    service: GeminiLayoutService = Depends(get_layout_service),
    validator: DeterministicLayoutValidator = Depends(get_layout_validator),
) -> dict:
    """Iteratively edit an existing layout via natural-language instructions."""

    # Parse the current layout JSON
    try:
        current_layout_dict = json.loads(current_layout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid current_layout JSON: {exc}") from exc

    # Parse conversation history
    try:
        history = json.loads(conversation_history)
        if not isinstance(history, list):
            history = []
    except json.JSONDecodeError:
        history = []

    accumulated_errors: list[str] = []
    last_exception: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 2):
        # Build effective message with correction feedback
        effective_message = message
        if accumulated_errors:
            correction = (
                "\n\n--- CORRECCIÓN REQUERIDA ---\n"
                "En tu intento anterior de edición fallaste por:\n"
                + "\n".join(f"- {err}" for err in accumulated_errors)
                + "\n\nCorrige estos problemas y vuelve a generar el JSON completo."
                "\n--- FIN DE CORRECCIÓN ---"
            )
            effective_message = message + correction
            logger.info(
                "Iterate self-healing retry %d/%d | project_id=%s | errors=%s",
                attempt, MAX_RETRIES + 1, project_id, accumulated_errors,
            )

        try:
            layout = service.iterate_layout(
                project_id=project_id,
                user_message=effective_message,
                current_layout_json=current_layout_dict,
                conversation_history=history,
            )
            if isinstance(layout, dict):
                layout = LayoutV1Response.model_validate(layout)

            deterministic_result = validator.validate(layout)
            layout.validacion_RNE = deterministic_result.report

            if layout.validacion_RNE.estado_global == "rechazado":
                rejection_reasons = [
                    alt for alt in deterministic_result.alternatives if alt
                ] if deterministic_result.alternatives else []
                if not rejection_reasons:
                    rejection_reasons = [
                        f"{r.rule_id}: {r.detalle}"
                        for r in (layout.validacion_RNE.reglas or [])
                        if r.estado == "no_cumple"
                    ]
                error_msg = "; ".join(rejection_reasons) if rejection_reasons else "Validación determinista rechazó la propuesta"
                accumulated_errors.append(error_msg)
                last_exception = HTTPException(
                    status_code=422,
                    detail={
                        "message": "Deterministic validation rejected the edited proposal.",
                        "validacion_RNE": layout.validacion_RNE.model_dump(),
                        "alternativas": deterministic_result.alternatives,
                    },
                )
                if attempt <= MAX_RETRIES:
                    logger.warning(
                        "Iterate attempt %d rejected, retrying | project_id=%s | reason=%s",
                        attempt, project_id, error_msg,
                    )
                    continue
                else:
                    raise last_exception

            # Success
            request.state.response_meta = {"status": "ok", "project_id": project_id}
            if attempt > 1:
                logger.info("Iterate self-healing succeeded on attempt %d | project_id=%s", attempt, project_id)

            # Build change summary for chat
            change_summary = _build_change_summary(current_layout_dict, layout.model_dump())

            return {
                "layout": layout.model_dump(),
                "change_summary": change_summary,
            }

        except HTTPException:
            raise
        except GeminiInvalidJSONError as exc:
            accumulated_errors.append(f"JSON inválido: {exc}")
            last_exception = HTTPException(status_code=422, detail=f"Model returned non-JSON output: {exc}")
            if attempt <= MAX_RETRIES:
                logger.warning("Iterate attempt %d: invalid JSON, retrying | project_id=%s", attempt, project_id)
                continue
            logger.exception("GeminiInvalidJSONError after all retries | project_id=%s", project_id)
            raise last_exception from exc
        except GeminiSchemaValidationError as exc:
            accumulated_errors.append(f"Schema inválido: {exc}")
            last_exception = HTTPException(status_code=422, detail=f"Schema validation failed: {exc}")
            if attempt <= MAX_RETRIES:
                logger.warning("Iterate attempt %d: schema error, retrying | project_id=%s", attempt, project_id)
                continue
            logger.exception("GeminiSchemaValidationError after all retries | project_id=%s", project_id)
            raise last_exception from exc
        except GeminiServiceError as exc:
            logger.exception("GeminiServiceError during iterate | project_id=%s", project_id)
            raise HTTPException(status_code=502, detail=f"Gemini service error: {exc}") from exc

    if last_exception:
        raise last_exception
    raise HTTPException(status_code=500, detail="Unexpected error in iterate self-healing loop")


def _build_change_summary(old: dict, new: dict) -> str:
    """Build a human-readable summary of what changed between two layouts."""
    changes: list[str] = []

    old_rooms = {r.get("id", ""): r.get("nombre", "") for r in old.get("ambientes", [])}
    new_rooms = {r.get("id", ""): r.get("nombre", "") for r in new.get("ambientes", [])}

    added = set(new_rooms.keys()) - set(old_rooms.keys())
    removed = set(old_rooms.keys()) - set(new_rooms.keys())

    for rid in added:
        changes.append(f"✅ Agregado: {new_rooms[rid]}")
    for rid in removed:
        changes.append(f"❌ Eliminado: {old_rooms[rid]}")

    # Check rooms that changed area
    for rid in set(old_rooms.keys()) & set(new_rooms.keys()):
        old_room = next((r for r in old.get("ambientes", []) if r.get("id") == rid), None)
        new_room = next((r for r in new.get("ambientes", []) if r.get("id") == rid), None)
        if old_room and new_room:
            old_area = old_room.get("area_m2", 0)
            new_area = new_room.get("area_m2", 0)
            if abs(old_area - new_area) > 0.1:
                changes.append(f"📐 {new_rooms[rid]}: {old_area:.1f}m² → {new_area:.1f}m²")

    old_walls = len(old.get("muros_y_columnas", {}).get("muros", []))
    new_walls = len(new.get("muros_y_columnas", {}).get("muros", []))
    if old_walls != new_walls:
        changes.append(f"🧱 Muros: {old_walls} → {new_walls}")

    if not changes:
        changes.append("🔄 Layout actualizado (cambios menores de geometría)")

    return "\n".join(changes)
