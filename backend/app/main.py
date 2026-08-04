import logging
import time
import uuid

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_layout import router as layout_router
from app.api.routes_iterate import router as iterate_router
from app.api.routes_export import export_router
from app.core.settings import get_settings

settings = get_settings()
logger = logging.getLogger("vipromt.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = FastAPI(title=settings.app_name, version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(layout_router)
app.include_router(iterate_router)
app.include_router(export_router)


@app.middleware("http")
async def request_context_middleware(request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_id=%s method=%s path=%s status=%s latency_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.exception(
        "request_id=%s unhandled_error=%s", getattr(request.state, "request_id", "n/a"), exc
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.app_version, "environment": settings.environment}
