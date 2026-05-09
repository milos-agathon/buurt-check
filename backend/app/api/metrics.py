"""Metrics API router — operational counters and KPI beacons.

Gated behind BUURT_METRICS_ENABLED config flag.
GET /api/metrics requires BUURT_METRICS_TOKEN when set.
POST /api/metrics/event is open (counter-only, allowlisted events).
"""

from fastapi import APIRouter, Header, HTTPException

from app.config import settings
from app.services import metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])

KPI_EVENTS = {
    "dossier_viewed",
    "export_completed",
    "shortlist_added",
    "compare_viewed",
    "prebid_address_confirmed",
    "prebid_briefing_requested",
    "prebid_briefing_loaded",
    "prebid_result_state_seen",
    "prebid_pack_cta_clicked",
    "prebid_pack_loaded",
    "prebid_pack_queued_for_review",
    "prebid_share_created",
    "prebid_delete_requested",
}


def _check_metrics_auth(
    authorization: str | None = None,
) -> None:
    """Guard: disabled=404, token required in non-dev=401."""
    if not settings.metrics_enabled:
        raise HTTPException(status_code=404)
    if settings.metrics_token:
        if not authorization or authorization != f"Bearer {settings.metrics_token}":
            raise HTTPException(status_code=401)


@router.get("")
async def get_metrics(authorization: str | None = Header(None)):
    _check_metrics_auth(authorization)
    return metrics.snapshot()


@router.post("/event")
async def record_event(body: dict):
    if not settings.metrics_enabled:
        raise HTTPException(status_code=404)
    event = body.get("event", "")
    if event in KPI_EVENTS:
        metrics.inc(f"kpi.{event}")
    return {"ok": True}
