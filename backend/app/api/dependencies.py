"""FastAPI dependencies for endpoint-level access control."""

from fastapi import HTTPException, Query

from app.services.reports import check_entitlement


async def require_entitlement(report_id: str | None = Query(None)):
    """Dependency that verifies report_id has active entitlement.

    Add to premium endpoints via ``Depends(require_entitlement)``.

    Uses ``Query(None)`` (optional) so that FastAPI does NOT return 422
    when the parameter is missing — instead the dependency runs and
    raises 402 explicitly.
    """
    if not report_id:
        raise HTTPException(status_code=402, detail="Payment required")
    entitled = await check_entitlement(report_id)
    if not entitled:
        raise HTTPException(status_code=402, detail="Payment required")
