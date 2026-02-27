"""Tests for entitlement-gated PDF export (Story 3.3).

Verifies that:
- quick_brief template is always allowed (free, no report_id needed)
- full_dossier template returns 402 without report_id
- full_dossier template returns 402 with unentitled report_id
- full_dossier template succeeds with entitled report_id
"""

from unittest.mock import AsyncMock, patch

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


_VBO_ID = "0363010012345678"
_BASE_BODY = {
    "rd_x": 121000,
    "rd_y": 487000,
    "lat": 52.37,
    "lng": 4.89,
    "address": "Test 1",
}


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_quick_brief_always_allowed(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get,
):
    """quick_brief template works without report_id (free tier)."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=None)

    with patch.object(settings, "rate_limit_enabled", False):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/address/{_VBO_ID}/export",
                json={**_BASE_BODY, "template": "quick_brief"},
            )
    assert response.status_code == 200
    assert response.content[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_full_dossier_rejects_without_report_id(db_path):
    """full_dossier template returns 402 when no report_id provided."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/address/{_VBO_ID}/export",
                json={**_BASE_BODY, "template": "full_dossier"},
            )
    assert response.status_code == 402
    assert "Payment required" in response.json()["detail"]


@pytest.mark.asyncio
async def test_full_dossier_rejects_unentitled_report(db_path):
    """full_dossier template returns 402 for unpaid report_id."""
    from app.services.reports import create_report

    rid = await create_report(_VBO_ID, "Test 1", "long", db_path=db_path)

    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/address/{_VBO_ID}/export",
                json={
                    **_BASE_BODY,
                    "template": "full_dossier",
                    "report_id": rid,
                },
            )
    assert response.status_code == 402
    assert "Payment required" in response.json()["detail"]


@pytest.mark.asyncio
async def test_full_dossier_rejects_nonexistent_report(db_path):
    """full_dossier template returns 402 for a report_id that doesn't exist."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/address/{_VBO_ID}/export",
                json={
                    **_BASE_BODY,
                    "template": "full_dossier",
                    "report_id": "00000000-0000-0000-0000-000000000000",
                },
            )
    assert response.status_code == 402


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_full_dossier_allowed_with_entitled_report(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get, db_path
):
    """full_dossier template succeeds when report has active entitlement."""
    from app.services.reports import activate_entitlement, create_report

    rid = await create_report(_VBO_ID, "Test 1", "long", db_path=db_path)
    await activate_entitlement(rid, db_path=db_path)

    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=None)

    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/address/{_VBO_ID}/export",
                json={
                    **_BASE_BODY,
                    "template": "full_dossier",
                    "report_id": rid,
                },
            )
    assert response.status_code == 200
    assert response.content[:5] == b"%PDF-"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_quick_brief_ignores_report_id(
    mock_risk_cards, mock_bag, mock_cache_set, mock_cache_get,
):
    """quick_brief works even when report_id is provided (backward compat)."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=None)

    with patch.object(settings, "rate_limit_enabled", False):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/address/{_VBO_ID}/export",
                json={
                    **_BASE_BODY,
                    "template": "quick_brief",
                    "report_id": "some-id-doesnt-matter",
                },
            )
    assert response.status_code == 200
    assert response.content[:5] == b"%PDF-"
