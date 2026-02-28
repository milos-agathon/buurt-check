"""Tests for the report repository service (Story 1.2)."""

import pytest
import pytest_asyncio

from app.db import init_db
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
    await update_payment_status(
        report_id, "paid", provider_payment_id="pi_123", db_path=db_path
    )
    report = await get_report(report_id, db_path=db_path)
    assert report.payment_status == "paid"
    assert report.provider_payment_id == "pi_123"


@pytest.mark.asyncio
async def test_find_existing_paid_report(db_path):
    report_id = await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await update_payment_status(report_id, "paid", db_path=db_path)
    await activate_entitlement(report_id, db_path=db_path)
    found = await find_existing_paid_report("0363010012345678", db_path=db_path)
    assert found is not None
    assert found.report_id == report_id


@pytest.mark.asyncio
async def test_find_existing_paid_report_none_when_unpaid(db_path):
    await create_report(
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    found = await find_existing_paid_report("0363010012345678", db_path=db_path)
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
    await store_provider_session(
        report_id, provider_session_id="cs_test_abc", db_path=db_path
    )
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
        "0363010012345678", "Amsterdam, Damrak 1", "long", db_path=db_path
    )
    await update_payment_status(report_id, "paid", db_path=db_path)
    await activate_entitlement(report_id, db_path=db_path)
    # Verify it's found when active
    assert await find_existing_paid_report("0363010012345678", db_path=db_path) is not None
    # Revoke and verify it's no longer found
    await revoke_entitlement(report_id, db_path=db_path)
    assert await find_existing_paid_report("0363010012345678", db_path=db_path) is None
