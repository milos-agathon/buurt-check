"""Tests for the reports API endpoint (Story 2.1)."""

import uuid
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import init_db
from app.main import app
from app.rate_limit import limiter


@pytest.fixture
async def db_path(tmp_path):
    """Create a fresh test DB and return its path."""
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


@pytest.fixture
async def client(db_path):
    """Async test client with database_path pointed at the temp DB.

    Patches the *attribute* on the singleton settings instance so every module
    that imported ``from app.config import settings`` sees the temp path.
    Also resets the rate limiter to avoid cross-test pollution.
    """
    limiter.reset()
    with patch.object(settings, "database_path", db_path):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


@pytest.mark.asyncio
async def test_create_short_report(client):
    """POST /api/reports/short creates a report and returns report_id."""
    response = await client.post(
        "/api/reports/short",
        json={
            "vbo_id": "0363010012345678",
            "address_key": "Damrak 1, Amsterdam",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "report_id" in data
    assert data["report_type"] == "short"
    assert data["already_purchased"] is False


@pytest.mark.asyncio
async def test_create_short_report_returns_uuid(client):
    """The report_id should be a valid UUID v4 string."""
    response = await client.post(
        "/api/reports/short",
        json={
            "vbo_id": "0363010012345678",
            "address_key": "Damrak 1, Amsterdam",
        },
    )
    data = response.json()
    # Should not raise
    uuid.UUID(data["report_id"], version=4)


@pytest.mark.asyncio
async def test_returns_existing_paid_report(client, db_path):
    """If a paid+active report exists for the vbo_id, return it instead."""
    from app.services.reports import (
        activate_entitlement,
        create_report,
        update_payment_status,
    )

    rid = await create_report(
        "0363010012345678", "Damrak 1", "long", db_path=db_path
    )
    await update_payment_status(rid, "paid", db_path=db_path)
    await activate_entitlement(rid, db_path=db_path)

    response = await client.post(
        "/api/reports/short",
        json={
            "vbo_id": "0363010012345678",
            "address_key": "Damrak 1",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["report_id"] == rid
    assert data["report_type"] == "long"
    assert data["already_purchased"] is True


@pytest.mark.asyncio
async def test_does_not_return_unpaid_report(client, db_path):
    """Unpaid reports should NOT be returned as existing."""
    from app.services.reports import create_report

    await create_report(
        "0363010012345678", "Damrak 1", "long", db_path=db_path
    )

    response = await client.post(
        "/api/reports/short",
        json={
            "vbo_id": "0363010012345678",
            "address_key": "Damrak 1",
        },
    )
    data = response.json()
    assert data["already_purchased"] is False
    assert data["report_type"] == "short"


@pytest.mark.asyncio
async def test_invalid_vbo_id_rejected(client):
    """vbo_id must be exactly 16 digits."""
    response = await client.post(
        "/api/reports/short",
        json={
            "vbo_id": "123",
            "address_key": "Damrak 1, Amsterdam",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_empty_address_key_rejected(client):
    """address_key must be non-empty."""
    response = await client.post(
        "/api/reports/short",
        json={
            "vbo_id": "0363010012345678",
            "address_key": "",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_missing_fields_rejected(client):
    """Both vbo_id and address_key are required."""
    response = await client.post(
        "/api/reports/short",
        json={},
    )
    assert response.status_code == 422


# --- Entitlement check (Story 2.2) ---


@pytest.mark.asyncio
async def test_entitlement_check_false(client, db_path):
    """Newly created report should NOT be entitled."""
    from app.services.reports import create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    response = await client.get(f"/api/reports/{rid}/entitlement")
    assert response.status_code == 200
    data = response.json()
    assert data["report_id"] == rid
    assert data["entitled"] is False
    assert data["report_type"] == "long"


@pytest.mark.asyncio
async def test_entitlement_check_true(client, db_path):
    """After activation, report should be entitled."""
    from app.services.reports import activate_entitlement, create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await activate_entitlement(rid, db_path=db_path)
    response = await client.get(f"/api/reports/{rid}/entitlement")
    assert response.status_code == 200
    data = response.json()
    assert data["report_id"] == rid
    assert data["entitled"] is True
    assert data["report_type"] == "long"


@pytest.mark.asyncio
async def test_entitlement_check_not_found(client):
    """Unknown report_id returns 404."""
    response = await client.get("/api/reports/nonexistent/entitlement")
    assert response.status_code == 404
