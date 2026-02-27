"""Report endpoints — freemium funnel entry point."""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.rate_limit import limiter
from app.services.reports import create_report, find_existing_paid_report

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["reports"])


class ShortReportRequest(BaseModel):
    vbo_id: str = Field(..., pattern=r"^[0-9]{16}$")
    address_key: str = Field(..., min_length=1)


class ShortReportResponse(BaseModel):
    report_id: str
    report_type: str
    already_purchased: bool = False


@limiter.limit("10/minute")
@router.post("/short", response_model=ShortReportResponse)
async def create_short_report(request: Request, body: ShortReportRequest):
    """Create a short report record and return its ID.

    If a paid + active report already exists for this vbo_id, return that
    instead so the frontend can skip the purchase flow.
    """
    existing = await find_existing_paid_report(body.vbo_id)
    if existing:
        return ShortReportResponse(
            report_id=existing.report_id,
            report_type=existing.report_type,
            already_purchased=True,
        )

    report_id = await create_report(body.vbo_id, body.address_key, "short")
    return ShortReportResponse(report_id=report_id, report_type="short")
