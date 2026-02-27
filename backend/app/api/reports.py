"""Report endpoints — freemium funnel entry point."""

import logging

import aiosqlite
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.rate_limit import limiter
from app.services.reports import (
    check_entitlement,
    create_report,
    find_existing_paid_report,
    get_report,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["reports"])


class ShortReportRequest(BaseModel):
    vbo_id: str = Field(..., pattern=r"^[0-9]{16}$")
    address_key: str = Field(..., min_length=1, max_length=500)


class ShortReportResponse(BaseModel):
    report_id: str
    report_type: str
    already_purchased: bool = False


class EntitlementResponse(BaseModel):
    report_id: str
    entitled: bool
    report_type: str


@limiter.limit("10/minute")
@router.post("/short", response_model=ShortReportResponse)
async def create_short_report(request: Request, body: ShortReportRequest):
    """Create a short report record and return its ID.

    If a paid + active report already exists for this vbo_id, return that
    instead so the frontend can skip the purchase flow.
    """
    try:
        existing = await find_existing_paid_report(body.vbo_id)
        if existing:
            return ShortReportResponse(
                report_id=existing.report_id,
                report_type=existing.report_type,
                already_purchased=True,
            )

        report_id = await create_report(body.vbo_id, body.address_key, "short")
        return ShortReportResponse(report_id=report_id, report_type="short")
    except aiosqlite.Error:
        logger.exception("Database error creating short report for vbo_id=%s", body.vbo_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")


@limiter.limit("30/minute")
@router.get("/{report_id}/entitlement", response_model=EntitlementResponse)
async def get_entitlement(request: Request, report_id: str):
    """Check whether a report has an active entitlement.

    Called by the frontend after Stripe checkout redirect to verify that
    payment went through and the user is entitled to view the full report.
    """
    try:
        report = await get_report(report_id)
    except aiosqlite.Error:
        logger.exception("Database error checking entitlement for report_id=%s", report_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        entitled = await check_entitlement(report_id)
    except aiosqlite.Error:
        logger.exception("Database error checking entitlement for report_id=%s", report_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    return EntitlementResponse(
        report_id=report_id,
        entitled=entitled,
        report_type=report.report_type,
    )
