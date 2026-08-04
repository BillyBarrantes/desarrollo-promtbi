import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.deps import get_layout_service, get_layout_validator
from app.core.exceptions import GeminiInvalidJSONError, GeminiSchemaValidationError, GeminiServiceError
from app.core.settings import get_settings
from app.schemas.layout_request import LayoutGenerateRequest
from app.schemas.layout_v1 import LayoutV1Response
from app.services.gemini_service import GeminiLayoutService
from app.validators.deterministic_validator import DeterministicLayoutValidator

router = APIRouter(prefix="/api/v1/layouts", tags=["layouts"])
settings = get_settings()
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
logger = logging.getLogger("vipromt.api.layouts")


@router.post("/generate")
async def generate_layout(
    request: Request,
    project_id: str = Form(...),
    prompt: str = Form(...),
    image: UploadFile | None = File(default=None),
    service: GeminiLayoutService = Depends(get_layout_service),
    validator: DeterministicLayoutValidator = Depends(get_layout_validator),
) -> LayoutV1Response:
    _ = LayoutGenerateRequest(project_id=project_id, prompt=prompt)

    image_bytes = await image.read() if image else None
    image_mime = image.content_type if image else None

    if image and image_mime not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported image MIME type")

    if image and image_bytes and len(image_bytes) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Uploaded image exceeds max allowed size")

    MAX_RETRIES = 2
    accumulated_errors: list[str] = []
    last_exception: Exception | None = None

    for attempt in range(1, MAX_RETRIES + 2):  # attempts 1, 2, 3
        # Build the prompt: original + any correction feedback from previous failures
        effective_prompt = prompt
        if accumulated_errors:
            correction = (
                "\n\n--- CORRECCIÓN REQUERIDA ---\n"
                "En tu intento anterior fallaste por los siguientes motivos:\n"
                + "\n".join(f"- {err}" for err in accumulated_errors)
                + "\n\nCorrige estos problemas estructurales y vuelve a generar el JSON completo. "
                "Asegúrate de que la topología sanitaria esté correctamente conectada y que "
                "todos los nodos referencien muros existentes."
                "\n--- FIN DE CORRECCIÓN ---"
            )
            effective_prompt = prompt + correction
            logger.info(
                "Self-healing retry %d/%d | project_id=%s | injected_errors=%s",
                attempt, MAX_RETRIES + 1, project_id, accumulated_errors,
            )

        try:
            layout = service.generate_layout(
                project_id=project_id,
                user_prompt=effective_prompt,
                image_bytes=image_bytes,
                image_mime_type=image_mime,
            )
            if isinstance(layout, dict):
                layout = LayoutV1Response.model_validate(layout)

            deterministic_result = validator.validate(layout)
            layout.validacion_RNE = deterministic_result.report

            if layout.validacion_RNE.estado_global == "rechazado":
                # Extract rejection reasons for self-healing
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
                        "message": "Deterministic validation rejected the proposal.",
                        "validacion_RNE": layout.validacion_RNE.model_dump(),
                        "alternativas": deterministic_result.alternatives,
                    },
                )
                if attempt <= MAX_RETRIES:
                    logger.warning(
                        "Attempt %d rejected, will retry | project_id=%s | reason=%s",
                        attempt, project_id, error_msg,
                    )
                    continue  # Retry with error injection
                else:
                    raise last_exception  # All retries exhausted

            # Success — validation passed
            request.state.response_meta = {"status": "ok", "project_id": project_id}
            if attempt > 1:
                logger.info(
                    "Self-healing succeeded on attempt %d | project_id=%s",
                    attempt, project_id,
                )
            return layout

        except HTTPException:
            raise  # Re-raise HTTP exceptions (including our 422 above)
        except GeminiInvalidJSONError as exc:
            accumulated_errors.append(f"JSON inválido: {exc}")
            last_exception = HTTPException(status_code=422, detail=f"Model returned non-JSON output: {exc}")
            if attempt <= MAX_RETRIES:
                logger.warning("Attempt %d: invalid JSON, retrying | project_id=%s", attempt, project_id)
                continue
            logger.exception("GeminiInvalidJSONError after all retries | project_id=%s", project_id)
            raise last_exception from exc
        except GeminiSchemaValidationError as exc:
            accumulated_errors.append(f"Schema inválido: {exc}")
            last_exception = HTTPException(status_code=422, detail=f"Model JSON failed schema validation: {exc}")
            if attempt <= MAX_RETRIES:
                logger.warning("Attempt %d: schema validation failed, retrying | project_id=%s", attempt, project_id)
                continue
            logger.exception("GeminiSchemaValidationError after all retries | project_id=%s", project_id)
            raise last_exception from exc
        except GeminiServiceError as exc:
            logger.exception("GeminiServiceError | project_id=%s", project_id)
            raise HTTPException(status_code=502, detail=f"Gemini service error: {exc}") from exc

    # Should never reach here, but safety net
    if last_exception:
        raise last_exception
    raise HTTPException(status_code=500, detail="Unexpected error in self-healing loop")
