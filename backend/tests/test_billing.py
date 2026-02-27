"""Tests for the billing API endpoints (Story 3.1 — Stripe Checkout Session)."""

from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import init_db
from app.main import app


@pytest.fixture
async def db_path(tmp_path):
    """Create a fresh test DB and return its path."""
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


def _billing_patches(db_path, extra_settings=None):
    """Create ExitStack with all necessary patches for billing tests.

    Patches the singleton settings attributes (database_path, stripe_*, etc.)
    rather than replacing the module-level settings object, since reports.py
    accesses settings indirectly through db.get_db().
    """
    stack = ExitStack()
    stack.enter_context(patch.object(settings, "database_path", db_path))
    stack.enter_context(patch.object(settings, "stripe_secret_key", "sk_test_xxx"))
    stack.enter_context(patch.object(settings, "stripe_webhook_secret", "whsec_test"))
    stack.enter_context(patch.object(settings, "stripe_price_cents", 1499))
    stack.enter_context(patch.object(settings, "base_url", "http://localhost:5173"))
    stack.enter_context(patch.object(settings, "rate_limit_enabled", False))
    if extra_settings:
        for k, v in extra_settings.items():
            stack.enter_context(patch.object(settings, k, v))
    mock_stripe = stack.enter_context(patch("app.api.billing.stripe"))
    return stack, mock_stripe


@pytest.mark.asyncio
async def test_create_checkout_session(db_path):
    """stripe.checkout.Session.create is called via asyncio.to_thread."""
    from app.services.reports import create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    mock_session = MagicMock()
    mock_session.id = "cs_test_abc123"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_abc123"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["checkout_url"] == "https://checkout.stripe.com/pay/cs_test_abc123"


@pytest.mark.asyncio
async def test_checkout_rejects_nonexistent_report(db_path):
    """Requesting checkout for a report that doesn't exist returns 404."""
    stack, _mock_stripe = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": "00000000-0000-0000-0000-000000000000"},
            )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_checkout_rejects_already_paid(db_path):
    """Requesting checkout for an already-paid report returns 409."""
    from app.services.reports import create_report, update_payment_status

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await update_payment_status(rid, "paid", db_path=db_path)

    stack, _mock_stripe = _billing_patches(db_path)
    with stack:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_checkout_stores_provider_session_id(db_path):
    """After checkout, the provider_session_id is stored on the report."""
    from app.services.reports import create_report, get_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    mock_session = MagicMock()
    mock_session.id = "cs_test_stored_id"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_stored_id"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

    report = await get_report(rid, db_path=db_path)
    assert report is not None
    assert report.provider_session_id == "cs_test_stored_id"


@pytest.mark.asyncio
async def test_checkout_stripe_call_args(db_path):
    """Verify the Stripe API is called with the correct parameters."""
    from app.services.reports import create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)

    mock_session = MagicMock()
    mock_session.id = "cs_test_args"
    mock_session.url = "https://checkout.stripe.com/pay/cs_test_args"

    stack, mock_stripe = _billing_patches(db_path)
    with stack:
        mock_stripe.checkout.Session.create.return_value = mock_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/billing/checkout-session",
                json={"report_id": rid},
            )

        # Verify Stripe was called with correct args
        call_kwargs = mock_stripe.checkout.Session.create.call_args
        assert call_kwargs.kwargs["mode"] == "payment"
        assert len(call_kwargs.kwargs["line_items"]) == 1
        item = call_kwargs.kwargs["line_items"][0]
        assert item["price_data"]["currency"] == "eur"
        assert item["price_data"]["unit_amount"] == 1499
        assert item["quantity"] == 1
        assert call_kwargs.kwargs["metadata"]["report_id"] == rid
        assert call_kwargs.kwargs["metadata"]["vbo_id"] == "0363010012345678"
        assert "success_url" in call_kwargs.kwargs
        assert "cancel_url" in call_kwargs.kwargs
