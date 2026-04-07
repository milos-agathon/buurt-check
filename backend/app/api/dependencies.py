"""FastAPI dependencies for endpoint-level access control."""

from __future__ import annotations

import logging

from fastapi import HTTPException, Path, Query, Request

from app.api.buyer import get_buyer_key
from app.config import settings
from app.services.forge3d_renderer import Forge3DRenderService
from app.services.reports import check_entitlement

logger = logging.getLogger(__name__)

# Singleton render service — created once, reused across requests.
_render_service: Forge3DRenderService | None = None


async def require_entitlement(
    request: Request,
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    report_id: str | None = Query(None),
):
    """Dependency that verifies report_id has active entitlement.

    Add to premium endpoints via ``Depends(require_entitlement)``.

    Uses ``Query(None)`` (optional) so that FastAPI does NOT return 422
    when the parameter is missing — instead the dependency runs and
    raises 402 explicitly.
    """
    if not report_id:
        raise HTTPException(status_code=402, detail="Payment required")
    buyer_key = get_buyer_key(request)
    if not buyer_key:
        raise HTTPException(status_code=402, detail="Payment required")
    entitled = await check_entitlement(report_id, buyer_key=buyer_key, vbo_id=vbo_id)
    if not entitled:
        raise HTTPException(status_code=402, detail="Payment required")


def get_render_service() -> Forge3DRenderService | None:
    """Return forge3d render service if enabled, else None.

    Inject via ``Depends(get_render_service)`` on export endpoints.
    """
    global _render_service  # noqa: PLW0603
    if not settings.forge3d_enabled:
        return None
    if _render_service is None:
        _render_service = Forge3DRenderService(settings)
        if _render_service.available:
            logger.info("forge3d render service initialised")
        else:
            logger.warning("forge3d enabled but not available (missing GPU or package)")
    return _render_service
