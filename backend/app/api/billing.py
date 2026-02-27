"""Billing endpoints — Stripe Checkout Session creation."""

import asyncio
import logging

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.rate_limit import limiter
from app.services.reports import get_report, store_provider_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    report_id: str


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
    report = await get_report(body.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Report already paid")

    stripe.api_key = settings.stripe_secret_key

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

    await store_provider_session(body.report_id, provider_session_id=session.id)

    return CheckoutResponse(checkout_url=session.url)
