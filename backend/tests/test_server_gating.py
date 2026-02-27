"""Server-side entitlement gating tests (Story 3.4).

Verifies that premium endpoints return 402 without a valid report_id,
and that free endpoints remain accessible without one.
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import init_db
from app.main import app


@pytest.fixture
async def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


# --- Premium endpoints must reject without report_id ---


@pytest.mark.asyncio
async def test_premium_viewing_questions_rejects_without_report_id(db_path):
    """Premium endpoint viewing-questions returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/viewing-questions",
                params={"rd_x": "121000", "rd_y": "487000", "lat": "52.37", "lng": "4.89"},
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_risk_comparisons_rejects_without_report_id(db_path):
    """Premium endpoint risk-comparisons returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/risk-comparisons",
                params={"rd_x": "121000", "rd_y": "487000", "lat": "52.37", "lng": "4.89"},
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_livability_rejects_without_report_id(db_path):
    """Premium endpoint livability returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/livability",
                params={"rd_x": "121000", "rd_y": "487000"},
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_property_warnings_rejects_without_report_id(db_path):
    """Premium endpoint property-warnings returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/property-warnings",
                params={"rd_x": "121000", "rd_y": "487000"},
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_tier_b_rejects_without_report_id(db_path):
    """Premium endpoint tier-b returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/tier-b",
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_building3d_rejects_without_report_id(db_path):
    """Premium endpoint building3d returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/building3d",
                params={
                    "pand_id": "0363100012345678",
                    "rd_x": "121000", "rd_y": "487000",
                    "lat": "52.37", "lng": "4.89",
                },
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_neighborhood3d_rejects_without_report_id(db_path):
    """Premium endpoint neighborhood3d returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/neighborhood3d",
                params={
                    "pand_id": "0363100012345678",
                    "rd_x": "121000", "rd_y": "487000",
                    "lat": "52.37", "lng": "4.89",
                },
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_premium_wms_tile_rejects_without_report_id(db_path):
    """Premium endpoint wms-tile returns 402 when no report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/wms-tile",
                params={"type": "noise", "rd_x": "121000", "rd_y": "487000"},
            )
    assert response.status_code == 402


# --- Premium endpoints reject unpaid report_id ---


@pytest.mark.asyncio
async def test_premium_endpoint_rejects_unentitled_report(db_path):
    """Premium endpoints return 402 for an unpaid report_id."""
    from app.services.reports import create_report

    rid = await create_report("0363010012345678", "Damrak 1", "short", db_path=db_path)

    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/viewing-questions",
                params={
                    "rd_x": "121000", "rd_y": "487000",
                    "lat": "52.37", "lng": "4.89",
                    "report_id": rid,
                },
            )
    assert response.status_code == 402


# --- Premium endpoints allow entitled report_id ---


@pytest.mark.asyncio
async def test_premium_endpoint_allows_entitled_report(db_path):
    """Premium endpoints allow access with an active entitlement."""
    from app.services.reports import activate_entitlement, create_report

    rid = await create_report("0363010012345678", "Damrak 1", "long", db_path=db_path)
    await activate_entitlement(rid, db_path=db_path)

    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock),
        patch("app.api.address.risk_cards") as mock_rc,
        patch("app.api.address.build_viewing_questions") as mock_vq,
    ):
        mock_rc.get_risk_cards = AsyncMock(return_value=_stub_risk_cards())
        mock_vq.return_value = _stub_viewing_questions()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/viewing-questions",
                params={
                    "rd_x": "121000", "rd_y": "487000",
                    "lat": "52.37", "lng": "4.89",
                    "report_id": rid,
                },
            )
    assert response.status_code == 200


# --- Free endpoints work without report_id ---


@pytest.mark.asyncio
async def test_free_building_endpoint_works_without_report_id(db_path):
    """Free endpoint /building works without report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.bag.get_building_facts", new_callable=AsyncMock) as mock_svc,
    ):
        mock_svc.return_value = None
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/address/0363010012345678/building")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_free_suggest_endpoint_works_without_report_id(db_path):
    """Free endpoint /suggest works without report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.locatieserver") as mock_loc,
    ):
        mock_loc.suggest = AsyncMock(return_value=[])
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/suggest", params={"q": "Damrak 1"},
            )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_free_risks_endpoint_works_without_report_id(db_path):
    """Free endpoint /risks works without report_id."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock),
        patch("app.api.address.risk_cards") as mock_rc,
    ):
        mock_rc.get_risk_cards = AsyncMock(return_value=_stub_risk_cards())
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/risks",
                params={"rd_x": "121000", "rd_y": "487000", "lat": "52.37", "lng": "4.89"},
            )
    assert response.status_code == 200


# --- Helpers ---


def _stub_risk_cards():
    """Minimal RiskCardsResponse with unavailable levels."""
    from app.models.risk import (
        AirQualityRiskCard,
        ClimateStressRiskCard,
        NoiseRiskCard,
        RiskCardsResponse,
        RiskLevel,
    )

    _common = {"level": RiskLevel.unavailable, "source": "test", "sampled_at": "2026-01-01"}
    return RiskCardsResponse(
        address_id="0363010012345678",
        noise=NoiseRiskCard(**_common),
        air_quality=AirQualityRiskCard(**_common),
        climate_stress=ClimateStressRiskCard(**_common),
    )


def _stub_viewing_questions():
    """Minimal ViewingQuestionsResponse."""
    from app.models.risk import ViewingQuestionsResponse

    return ViewingQuestionsResponse(
        address_id="0363010012345678",
        categories=[],
        total_questions=0,
    )
