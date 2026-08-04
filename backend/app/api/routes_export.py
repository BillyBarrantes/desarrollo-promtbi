"""DXF export endpoint — generates AutoCAD .dxf from LayoutV1Response."""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.layout_v1 import LayoutV1Response
from app.services.dxf_service import DXFExporter

logger = logging.getLogger("vipromt.routes.export")

export_router = APIRouter(prefix="/api/v1/layouts/export", tags=["export"])

_dxf = DXFExporter()


@export_router.post("/dxf")
async def export_dxf(layout: LayoutV1Response):
    """Receive a validated LayoutV1Response and return a .dxf file download."""
    try:
        stream = _dxf.generate_dxf(layout)
    except Exception as exc:
        logger.exception("DXF generation failed | project_id=%s", layout.project_id)
        raise HTTPException(status_code=500, detail=f"DXF generation failed: {exc}") from exc

    filename = f"plano_{layout.project_id}.dxf"
    return StreamingResponse(
        stream,
        media_type="application/dxf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
