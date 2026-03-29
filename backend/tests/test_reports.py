"""Tests for the report repository service (Story 1.2)."""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.db import init_db
from app.services.apple_app_store import reset_apple_app_store_clients
from app.services.google_play import GooglePlayPurchaseNotFound
from app.services.reports import (
    activate_entitlement,
    check_entitlement,
    create_report,
    find_existing_paid_report,
    get_report,
    get_report_by_payment_intent,
    revoke_entitlement,
    store_provider_session,
    update_payment_status,
)


@pytest_asyncio.fixture
async def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


@pytest.fixture(autouse=True)
def reset_apple_clients():
    reset_apple_app_store_clients()
    yield
    reset_apple_app_store_clients()


@pytest.mark.asyncio
async def test_create_and_get_report(db_path):
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "short", db_path=db_path
    )
    report = await get_report(report_id, db_path=db_path)
    assert report is not None
    assert report.vbo_id == "0363010012345678"
    assert report.report_type == "short"
    assert report.payment_status == "unpaid"


@pytest.mark.asyncio
async def test_check_entitlement_false_by_default(db_path):
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    assert await check_entitlement(report_id, db_path=db_path) is False


@pytest.mark.asyncio
async def test_activate_entitlement(db_path):
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await activate_entitlement(report_id, db_path=db_path)
    assert await check_entitlement(report_id, db_path=db_path) is True


@pytest.mark.asyncio
async def test_update_payment_status(db_path):
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await update_payment_status(report_id, "paid", provider_payment_id="pi_123", db_path=db_path)
    report = await get_report(report_id, db_path=db_path)
    assert report.payment_status == "paid"
    assert report.provider_payment_id == "pi_123"


@pytest.mark.asyncio
async def test_find_existing_paid_report(db_path):
    report_id = await create_report(
        "0363010012345678",
        "Amsterdam, Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await update_payment_status(report_id, "paid", db_path=db_path)
    await activate_entitlement(report_id, db_path=db_path)
    found = await find_existing_paid_report("0363010012345678", "buyer-123", db_path=db_path)
    assert found is not None
    assert found.report_id == report_id


@pytest.mark.asyncio
async def test_find_existing_paid_report_none_when_unpaid(db_path):
    await create_report(
        "0363010012345678",
        "Amsterdam, Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    found = await find_existing_paid_report("0363010012345678", "buyer-123", db_path=db_path)
    assert found is None


@pytest.mark.asyncio
async def test_get_nonexistent_report(db_path):
    report = await get_report("nonexistent-id", db_path=db_path)
    assert report is None


@pytest.mark.asyncio
async def test_store_provider_session(db_path):
    """store_provider_session stores Stripe session ID without changing payment_status."""
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    report_before = await get_report(report_id, db_path=db_path)
    assert report_before.payment_status == "unpaid"
    await store_provider_session(report_id, provider_session_id="cs_test_abc", db_path=db_path)
    report_after = await get_report(report_id, db_path=db_path)
    assert report_after.provider_session_id == "cs_test_abc"
    assert report_after.payment_status == "unpaid"  # MUST remain unpaid


@pytest.mark.asyncio
async def test_get_report_by_payment_intent(db_path):
    """Lookup report by Stripe payment_intent ID."""
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await update_payment_status(
        report_id,
        "paid",
        provider="stripe",
        provider_payment_id="pi_test_123",
        db_path=db_path,
    )
    found = await get_report_by_payment_intent("pi_test_123", db_path=db_path)
    assert found is not None
    assert found.report_id == report_id
    not_found = await get_report_by_payment_intent("pi_nonexistent", db_path=db_path)
    assert not_found is None


@pytest.mark.asyncio
async def test_check_entitlement_revokes_missing_google_play_purchase(db_path):
    """Missing Google Play purchase tokens revoke stored entitlement state."""
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await update_payment_status(
        report_id,
        "paid",
        provider="google_play",
        provider_payment_id="purchase-token-123",
        db_path=db_path,
    )
    await activate_entitlement(report_id, db_path=db_path)

    with patch(
        "app.services.google_play.get_product_purchase",
        new=AsyncMock(side_effect=GooglePlayPurchaseNotFound("missing")),
    ):
        assert await check_entitlement(report_id, db_path=db_path) is False

    report = await get_report(report_id, db_path=db_path)
    assert report is not None
    assert report.payment_status == "refunded"
    assert report.entitlement_status == "revoked"


@pytest.mark.asyncio
async def test_revoke_entitlement(db_path):
    """Revoke entitlement sets status to 'revoked'."""
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await activate_entitlement(report_id, db_path=db_path)
    assert await check_entitlement(report_id, db_path=db_path) is True
    result = await revoke_entitlement(report_id, db_path=db_path)
    assert result is True
    assert await check_entitlement(report_id, db_path=db_path) is False
    report = await get_report(report_id, db_path=db_path)
    assert report.entitlement_status == "revoked"


@pytest.mark.asyncio
async def test_write_functions_return_false_for_nonexistent_id(db_path):
    """All write functions return False when report_id does not exist."""
    fake_id = "nonexistent-id"
    assert await update_payment_status(fake_id, "paid", db_path=db_path) is False
    assert await store_provider_session(fake_id, "cs_xxx", db_path=db_path) is False
    assert await activate_entitlement(fake_id, db_path=db_path) is False
    assert await revoke_entitlement(fake_id, db_path=db_path) is False


@pytest.mark.asyncio
async def test_find_existing_paid_report_excludes_revoked(db_path):
    """Paid but revoked reports must NOT be returned by find_existing_paid_report."""
    report_id = await create_report(
        "0363010012345678",
        "Amsterdam, Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await update_payment_status(report_id, "paid", db_path=db_path)
    await activate_entitlement(report_id, db_path=db_path)
    # Verify it's found when active
    found_active = await find_existing_paid_report(
        "0363010012345678",
        "buyer-123",
        db_path=db_path,
    )
    assert found_active is not None
    # Revoke and verify it's no longer found
    await revoke_entitlement(report_id, db_path=db_path)
    assert await find_existing_paid_report("0363010012345678", "buyer-123", db_path=db_path) is None


@pytest.mark.asyncio
async def test_find_existing_paid_report_skips_invalid_google_play_purchase(db_path):
    """Invalid Google Play records are skipped in favor of the next valid paid report."""
    older_report = await create_report(
        "0363010012345678",
        "Amsterdam, Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await update_payment_status(older_report, "paid", provider="stripe", db_path=db_path)
    await activate_entitlement(older_report, db_path=db_path)

    newer_report = await create_report(
        "0363010012345678",
        "Amsterdam, Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await update_payment_status(
        newer_report,
        "paid",
        provider="google_play",
        provider_payment_id="purchase-token-123",
        db_path=db_path,
    )
    await activate_entitlement(newer_report, db_path=db_path)

    with patch(
        "app.services.google_play.get_product_purchase",
        new=AsyncMock(side_effect=GooglePlayPurchaseNotFound("missing")),
    ):
        found = await find_existing_paid_report("0363010012345678", "buyer-123", db_path=db_path)

    assert found is not None
    assert found.report_id == older_report


@pytest.mark.asyncio
async def test_check_entitlement_revokes_refunded_apple_transaction(db_path):
    """Revoked Apple transactions invalidate stored entitlement state."""
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await update_payment_status(
        report_id,
        "paid",
        provider="apple_app_store",
        provider_payment_id="apple-transaction-123",
        db_path=db_path,
    )
    await activate_entitlement(report_id, db_path=db_path)

    with patch(
        "app.services.apple_app_store.get_transaction_status",
        new=AsyncMock(
            return_value=type(
                "AppleTransaction",
                (),
                {"revoked": True},
            )()
        ),
    ):
        assert await check_entitlement(report_id, db_path=db_path) is False

    report = await get_report(report_id, db_path=db_path)
    assert report is not None
    assert report.payment_status == "refunded"
    assert report.entitlement_status == "revoked"


@pytest.mark.asyncio
async def test_find_existing_paid_report_skips_invalid_apple_transaction(db_path):
    """Invalid Apple records are skipped in favor of the next valid paid report."""
    older_report = await create_report(
        "0363010012345678",
        "Amsterdam, Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await update_payment_status(older_report, "paid", provider="stripe", db_path=db_path)
    await activate_entitlement(older_report, db_path=db_path)

    newer_report = await create_report(
        "0363010012345678",
        "Amsterdam, Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await update_payment_status(
        newer_report,
        "paid",
        provider="apple_app_store",
        provider_payment_id="apple-transaction-123",
        db_path=db_path,
    )
    await activate_entitlement(newer_report, db_path=db_path)

    with patch(
        "app.services.apple_app_store.get_transaction_status",
        new=AsyncMock(
            return_value=type(
                "AppleTransaction",
                (),
                {"revoked": True},
            )()
        ),
    ):
        found = await find_existing_paid_report("0363010012345678", "buyer-123", db_path=db_path)

    assert found is not None
    assert found.report_id == older_report
