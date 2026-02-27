"""Billing endpoints — Stripe Checkout Session creation."""

import asyncio
import logging

import aiosqlite
import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.rate_limit import limiter
from app.services.reports import get_report, store_provider_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    report_id: str = Field(
        ...,
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    )


class CheckoutResponse(BaseModel):
    checkout_url: str


@limiter.limit("5/minute")
@router.post("/checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(request: Request, body: CheckoutRequest):
    """Create a Stripe Checkout Session for a one-time dossier purchase.

    Validates the report exists and is unpaid, then creates a hosted checkout
    page. The provider_session_id is stored on the report for webhook
    reconciliation.
    """
    try:
        report = await get_report(body.report_id)
    except aiosqlite.Error:
        logger.exception("Database error fetching report %s", body.report_id)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Report already paid")

    stripe.api_key = settings.stripe_secret_key

    try:
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "unit_amount": settings.stripe_price_cents,
                    "product_data": {
                        "name": "Buurt Check Full Dossier",
                        "description": f"Complete property analysis for {report.address_key}",
                    },
                },
                "quantity": 1,
            }],
            success_url=(
                f"{settings.base_url}/#/address/{report.vbo_id}"
                f"?report={body.report_id}"
                "&session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=f"{settings.base_url}/#/address/{report.vbo_id}",
            metadata={
                "report_id": body.report_id,
                "vbo_id": report.vbo_id,
            },
        )
    except stripe.StripeError as exc:
        logger.exception("Stripe session creation failed for report %s: %s", body.report_id, exc)
        raise HTTPException(status_code=502, detail="Payment provider unavailable")

    try:
        await store_provider_session(body.report_id, provider_session_id=session.id)
    except aiosqlite.Error:
        logger.exception(
            "Failed to store session %s for report %s", session.id, body.report_id,
        )
        # Stripe session already exists — return URL anyway; webhook will reconcile.

    return CheckoutResponse(checkout_url=session.url)
