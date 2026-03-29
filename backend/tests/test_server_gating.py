"""Server-side gating tests for free viewer and paid export-only endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.buyer import BUYER_COOKIE_NAME
from app.config import settings
from app.db import init_db
from app.main import app


@pytest_asyncio.fixture
async def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    await init_db(path)
    return path


@pytest.mark.asyncio
async def test_property_warnings_rejects_without_report_id(db_path):
    """Property warnings remain paid-only."""
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
async def test_weather_tmy_rejects_without_report_id(db_path):
    """Weather TMY remains paid-only because it feeds full-dossier sunlight export."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/weather-tmy",
                params={"lat": "52.37", "lng": "4.89"},
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_sunlight_submission_rejects_without_report_id(db_path):
    """Cached sunlight submission remains paid-only."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/address/0363010012345678/sunlight",
                json={
                    "winter_hours": 3.0,
                    "summer_hours": 11.0,
                    "equinox_hours": 7.0,
                    "analysis_year": 2026,
                    "svf": 0.5,
                },
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_viewing_questions_are_free_without_report_id(db_path):
    """Viewing questions are part of the free viewer."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.risk_cards") as mock_rc,
        patch("app.api.address.build_viewing_questions") as mock_vq,
    ):
        mock_rc.get_risk_cards = AsyncMock(return_value=_stub_risk_cards())
        mock_vq.return_value = _stub_viewing_questions()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/viewing-questions",
                params={"rd_x": "121000", "rd_y": "487000", "lat": "52.37", "lng": "4.89"},
            )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_risk_comparisons_are_free_without_report_id(db_path):
    """Risk detail comparisons are part of the free viewer."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock),
        patch("app.api.address.risk_cards") as mock_rc,
        patch("app.api.address.cbs") as mock_cbs,
    ):
        mock_rc.get_risk_cards = AsyncMock(return_value=_stub_risk_cards())
        mock_cbs.get_neighborhood_stats = AsyncMock(return_value=_stub_neighborhood_stats())
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/risk-comparisons",
                params={"rd_x": "121000", "rd_y": "487000", "lat": "52.37", "lng": "4.89"},
            )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_livability_is_free_without_report_id(db_path):
    """Livability is part of the free viewer."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.leefbaarometer") as mock_livability,
    ):
        mock_livability.get_livability = AsyncMock(return_value=_stub_livability())
        mock_livability.get_livability_trend = AsyncMock(return_value=[])
        mock_livability.get_livability_comparison = AsyncMock(
            return_value=_stub_livability_comparison()
        )
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/livability",
                params={"rd_x": "121000", "rd_y": "487000"},
            )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_tier_b_is_free_without_report_id(db_path):
    """Crime context is part of the free viewer."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.tier_b") as mock_tier_b,
    ):
        mock_tier_b.get_tier_b_data = AsyncMock(return_value=_stub_tier_b())
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/address/0363010012345678/tier-b")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_building3d_is_free_without_report_id(db_path):
    """Target-building 3D is part of the free viewer."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch(
            "app.api.address.three_d_bag.get_target_building_3d",
            new_callable=AsyncMock,
        ) as mock_3d,
    ):
        mock_3d.return_value = _stub_neighborhood_3d()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/building3d",
                params={
                    "pand_id": "0363100012345678",
                    "rd_x": "121000",
                    "rd_y": "487000",
                    "lat": "52.37",
                    "lng": "4.89",
                },
            )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_neighborhood3d_is_free_without_report_id(db_path):
    """Neighborhood 3D is part of the free viewer."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.three_d_bag.get_neighborhood_3d", new_callable=AsyncMock) as mock_3d,
    ):
        mock_3d.return_value = _stub_neighborhood_3d()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/0363010012345678/neighborhood3d",
                params={
                    "pand_id": "0363100012345678",
                    "rd_x": "121000",
                    "rd_y": "487000",
                    "lat": "52.37",
                    "lng": "4.89",
                },
            )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_wms_tile_is_free_without_report_id(db_path):
    """Map tiles are part of the free viewer."""
    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.wms_tile.get_wms_tile", new_callable=AsyncMock) as mock_tile,
    ):
        mock_tile.return_value = b"png"
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/address/wms-tile",
                params={"type": "noise", "rd_x": "121000", "rd_y": "487000"},
            )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_paid_endpoint_rejects_unentitled_report(db_path):
    """Paid-only endpoints still reject an unpaid report."""
    from app.services.reports import create_report

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "short",
        buyer_key="buyer-123",
        db_path=db_path,
    )

    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.get(
                "/api/address/0363010012345678/property-warnings",
                params={
                    "rd_x": "121000",
                    "rd_y": "487000",
                    "report_id": rid,
                },
            )
    assert response.status_code == 402


@pytest.mark.asyncio
async def test_paid_endpoint_allows_entitled_owner(db_path):
    """Paid-only endpoints require both active entitlement and buyer ownership."""
    from app.services.reports import activate_entitlement, create_report

    rid = await create_report(
        "0363010012345678",
        "Damrak 1",
        "long",
        buyer_key="buyer-123",
        db_path=db_path,
    )
    await activate_entitlement(rid, db_path=db_path)

    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "rate_limit_enabled", False),
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch(
            "app.api.address.property_warnings.get_property_warnings",
            new_callable=AsyncMock,
        ) as mock_warnings,
    ):
        mock_warnings.return_value = _stub_property_warnings()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            client.cookies.set(BUYER_COOKIE_NAME, "buyer-123")
            response = await client.get(
                "/api/address/0363010012345678/property-warnings",
                params={
                    "rd_x": "121000",
                    "rd_y": "487000",
                    "report_id": rid,
                },
            )
    assert response.status_code == 200


def _stub_risk_cards():
    from app.models.risk import (
        AirQualityRiskCard,
        ClimateStressRiskCard,
        NoiseRiskCard,
        RiskCardsResponse,
        RiskLevel,
    )

    common = {"level": RiskLevel.unavailable, "source": "test", "sampled_at": "2026-01-01"}
    return RiskCardsResponse(
        address_id="0363010012345678",
        noise=NoiseRiskCard(**common),
        air_quality=AirQualityRiskCard(**common),
        climate_stress=ClimateStressRiskCard(**common),
    )


def _stub_viewing_questions():
    from app.models.risk import ViewingQuestionsResponse

    return ViewingQuestionsResponse(
        address_id="0363010012345678",
        categories=[],
        total_questions=0,
    )


def _stub_neighborhood_stats():
    from app.models.neighborhood import (
        AgeProfile,
        NeighborhoodIndicator,
        NeighborhoodStats,
        NeighborhoodStatsResponse,
        UrbanizationLevel,
    )

    return NeighborhoodStatsResponse(
        address_id="0363010012345678",
        stats=NeighborhoodStats(
            buurt_code="BU03630000",
            buurt_name="Testbuurt",
            gemeente_name="Amsterdam",
            population_density=NeighborhoodIndicator(value=5000, unit="per km2"),
            avg_household_size=NeighborhoodIndicator(value=2.1),
            single_person_pct=NeighborhoodIndicator(value=42),
            age_profile=AgeProfile(age_0_24=20, age_25_64=60, age_65_plus=20),
            owner_occupied_pct=NeighborhoodIndicator(value=55),
            avg_property_value=NeighborhoodIndicator(value=450000, unit="EUR"),
            distance_to_train_km=NeighborhoodIndicator(value=0.5, unit="km"),
            distance_to_supermarket_km=NeighborhoodIndicator(value=0.2, unit="km"),
            urbanization=UrbanizationLevel.urban,
        ),
    )


def _stub_livability():
    from app.models.livability import LivabilityResponse

    return LivabilityResponse(
        available=True,
        buurt_code="BU03630000",
        buurt_name="Testbuurt",
        gemeente="Amsterdam",
        year="2024",
        overall_score=7,
        overall_normalized=78,
    )


def _stub_livability_comparison():
    from app.models.livability import LivabilityComparison, LivabilityComparisonRow

    return LivabilityComparison(
        rows=[
            LivabilityComparisonRow(
                level="buurt",
                name="Testbuurt",
                overall_score=7,
                overall_normalized=78,
            ),
            LivabilityComparisonRow(
                level="gemeente",
                name="Amsterdam",
                overall_score=6,
                overall_normalized=70,
            ),
        ]
    )


def _stub_tier_b():
    from app.models.tier_b import CrimeStatsCard, TierBResponse

    return TierBResponse(
        address_id="0363010012345678",
        crime=CrimeStatsCard(
            source="CBS",
            source_date="2025",
            total_per_1000=42.0,
        ),
    )


def _stub_neighborhood_3d():
    from app.models.neighborhood3d import (
        BuildingBlock,
        Neighborhood3DCenter,
        Neighborhood3DResponse,
    )

    return Neighborhood3DResponse(
        address_id="0363010012345678",
        target_pand_id="0363100012345678",
        center=Neighborhood3DCenter(lat=52.37, lng=4.89, rd_x=121000, rd_y=487000),
        buildings=[
            BuildingBlock(
                pand_id="0363100012345678",
                ground_height=0.0,
                building_height=10.0,
                footprint=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            )
        ],
    )


def _stub_property_warnings():
    from app.models.property_warnings import (
        AsbestosWarning,
        AttentionSummary,
        ErfpachtWarning,
        FoundationRisk,
        LeadPipeWarning,
        PropertyWarningsResponse,
        VvEInfo,
    )

    return PropertyWarningsResponse(
        address_id="0363010012345678",
        attention_summary=AttentionSummary(
            flag_count=0,
            flags=[],
            risk_categories_assessed=4,
            risk_categories_total=4,
        ),
        foundation_risk=FoundationRisk(level="low", messages=[]),
        erfpacht=ErfpachtWarning(detected=False, messages=[]),
        vve=VvEInfo(is_apartment=False, messages=[]),
        asbestos=AsbestosWarning(flagged=False, messages=[]),
        lead_pipe=LeadPipeWarning(flagged=False, messages=[]),
    )
