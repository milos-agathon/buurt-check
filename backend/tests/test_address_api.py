import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

import app.cache.redis as cache_module
from app.models.address import AddressSuggestion, ResolvedAddress
from app.models.building import BuildingFacts
from app.models.livability import (
    LivabilityComparison,
    LivabilityComparisonRow,
    LivabilityDimension,
    LivabilityResponse,
    LivabilityTrendPoint,
)
from app.models.neighborhood import (
    AgeProfile,
    NeighborhoodIndicator,
    NeighborhoodStats,
    NeighborhoodStatsResponse,
    UrbanizationLevel,
)
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse
from app.models.property_warnings import (
    AsbestosWarning,
    AttentionSummary,
    ErfpachtWarning,
    FoundationRisk,
    PropertyWarningsResponse,
    VvEInfo,
)
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    QuestionCategory,
    RiskCardsResponse,
    RiskLevel,
    SeverityLevel,
    SunlightRiskCard,
    ViewingQuestion,
    ViewingQuestionsResponse,
)
from app.models.tier_b import CrimeStatsCard, EnergyLabelCard, TierBResponse


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.locatieserver")
async def test_suggest_endpoint(mock_ls, mock_cache_set, mock_cache_get, client):
    mock_ls.suggest = AsyncMock(
        return_value=[
            AddressSuggestion(
                id="adr-123",
                display_name="Kalverstraat 1, Amsterdam",
                type="adres",
                score=7.5,
            )
        ]
    )
    mock_ls.AddressSuggestion = AddressSuggestion

    resp = await client.get("/api/address/suggest", params={"q": "kalverstraat"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["suggestions"]) == 1
    assert data["suggestions"][0]["display_name"] == "Kalverstraat 1, Amsterdam"


@pytest.mark.asyncio
async def test_suggest_too_short(client):
    resp = await client.get("/api/address/suggest", params={"q": "k"})
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.locatieserver")
async def test_suggest_cache_key_normalized(mock_ls, mock_cache_set, mock_cache_get, client):
    """Cache key for suggest should normalize q with strip().casefold() (bug #20)."""
    mock_ls.suggest = AsyncMock(return_value=[])
    mock_ls.AddressSuggestion = AddressSuggestion

    await client.get("/api/address/suggest", params={"q": "  Kalverstraat  "})
    await client.get("/api/address/suggest", params={"q": "kalverstraat"})

    # Both queries should produce the same cache key: "suggest:kalverstraat:7"
    cache_get_keys = [call.args[0] for call in mock_cache_get.call_args_list]
    assert cache_get_keys[0] == "suggest:kalverstraat:7"
    assert cache_get_keys[1] == "suggest:kalverstraat:7"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_endpoint(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            street="Kalverstraat",
            house_number="1",
            postcode="1012NX",
            city="Amsterdam",
            latitude=52.372,
            longitude=4.892,
            rd_x=121286.0,
            rd_y=487296.0,
            adresseerbaar_object_id="0363010000696734",
        )
    )
    mock_bag.get_pand_id = AsyncMock(return_value=None)

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["street"] == "Kalverstraat"
    assert data["latitude"] == 52.372


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_not_found(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    mock_ls.lookup = AsyncMock(return_value=None)
    mock_bag.get_pand_id = AsyncMock(return_value=None)

    resp = await client.get("/api/address/lookup", params={"id": "adr-nonexistent"})
    assert resp.status_code == 404


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_includes_pand_id(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
            rd_x=121286.0,
            rd_y=487296.0,
        )
    )
    mock_bag.get_pand_id = AsyncMock(return_value="0363100012253924")

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["pand_id"] == "0363100012253924"
    mock_bag.get_pand_id.assert_called_once_with("0363010000696734")


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_succeeds_when_pand_id_resolution_fails(
    mock_ls, mock_bag, mock_cache_set, mock_cache_get, client,
):
    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
            rd_x=121286.0,
            rd_y=487296.0,
        )
    )
    mock_bag.get_pand_id = AsyncMock(side_effect=Exception("BAG WFS timeout"))

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("pand_id") is None
    assert data["display_name"] == "Kalverstraat 1, 1012NX Amsterdam"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_pand_id_respects_3s_timeout(
    mock_ls, mock_bag, mock_cache_set, mock_cache_get, client,
):
    async def slow_pand_id(vbo_id):
        await asyncio.sleep(10)
        return "0363100012253924"

    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
        )
    )
    mock_bag.get_pand_id = AsyncMock(side_effect=slow_pand_id)

    started = time.monotonic()
    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    elapsed = time.monotonic() - started

    assert resp.status_code == 200
    assert elapsed <= 3.5
    data = resp.json()
    assert data.get("pand_id") is None
    mock_cache_set.assert_called_once()
    assert mock_cache_set.call_args.kwargs.get("ttl") == 300


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_uses_full_ttl_when_pand_id_resolved(
    mock_ls, mock_bag, mock_cache_set, mock_cache_get, client,
):
    from app.config import settings

    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
        )
    )
    mock_bag.get_pand_id = AsyncMock(return_value="0363100012253924")

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    mock_cache_set.assert_called_once()
    assert mock_cache_set.call_args.kwargs.get("ttl") == settings.cache_ttl_lookup


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
async def test_building_facts_endpoint(mock_bag, mock_cache_set, mock_cache_get, client):
    mock_bag.get_building_facts = AsyncMock(
        return_value=BuildingFacts(
            pand_id="0363100012253924",
            construction_year=1917,
            status="Pand in gebruik",
            status_en="In use",
            intended_use=["winkelfunctie"],
            intended_use_en=["Retail"],
            num_units=3,
            floor_area_m2=143,
            footprint_geojson={"type": "Polygon", "coordinates": [[[4.89, 52.37]]]},
        )
    )

    resp = await client.get("/api/address/0363010000696734/building")
    assert resp.status_code == 200
    data = resp.json()
    assert data["building"]["pand_id"] == "0363100012253924"
    assert data["building"]["construction_year"] == 1917
    assert data["building"]["status_en"] == "In use"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
async def test_building_facts_no_building(mock_bag, mock_cache_set, mock_cache_get, client):
    mock_bag.get_building_facts = AsyncMock(return_value=None)

    resp = await client.get("/api/address/0000000000000000/building")
    assert resp.status_code == 200
    data = resp.json()
    assert data["building"] is None
    assert data["message"] is not None


@pytest.mark.asyncio
async def test_building_facts_invalid_vbo_id(client):
    resp = await client.get("/api/address/not-valid/building")
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.api.address.locatieserver")
async def test_suggest_works_without_redis(mock_ls, client):
    """Suggest endpoint returns 200 without Redis running (no cache mocks)."""
    # Reset circuit breaker and pool so real Redis connection is attempted
    cache_module._circuit_open_until = 0.0
    cache_module._pool = None

    mock_ls.suggest = AsyncMock(
        return_value=[
            AddressSuggestion(
                id="adr-123",
                display_name="Kalverstraat 1, Amsterdam",
                type="adres",
                score=7.5,
            )
        ]
    )
    mock_ls.AddressSuggestion = AddressSuggestion

    start = time.monotonic()
    resp = await client.get("/api/address/suggest", params={"q": "kalverstraat"})
    elapsed = time.monotonic() - start

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["suggestions"]) == 1
    assert elapsed < 3.0  # Must complete in under 3 seconds

    cache_module._circuit_open_until = 0.0
    cache_module._pool = None


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.three_d_bag")
async def test_building_3d_endpoint(mock_3d, mock_cache_set, mock_cache_get, client):
    """Phase 1: fast target-only building3d endpoint."""
    mock_3d.get_target_building_3d = AsyncMock(
        return_value=Neighborhood3DResponse(
            address_id="0363100012253924",
            target_pand_id="0363100012253924",
            center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
            buildings=[
                BuildingBlock(
                    pand_id="0363100012253924",
                    ground_height=1.75,
                    building_height=16.43,
                    footprint=[[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]],
                    year=1917,
                )
            ],
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/building3d",
        params={
            "pand_id": "0363100012253924",
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["target_pand_id"] == "0363100012253924"
    assert len(data["buildings"]) == 1
    mock_cache_set.assert_called_once()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.three_d_bag")
async def test_neighborhood_3d_endpoint(mock_3d, mock_cache_set, mock_cache_get, client):
    mock_3d.get_neighborhood_3d = AsyncMock(
        return_value=Neighborhood3DResponse(
            address_id="0363100012253924",
            target_pand_id="0363100012253924",
            center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
            buildings=[
                BuildingBlock(
                    pand_id="0363100012253924",
                    ground_height=1.75,
                    building_height=16.43,
                    footprint=[[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]],
                    year=1917,
                )
            ],
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/neighborhood3d",
        params={
            "pand_id": "0363100012253924",
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["target_pand_id"] == "0363100012253924"
    assert len(data["buildings"]) == 1
    assert data["buildings"][0]["building_height"] == 16.43


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.three_d_bag")
async def test_neighborhood_3d_cache_key_includes_accelerated_mode(
    mock_3d, mock_cache_set, mock_cache_get, client,
):
    mock_3d.get_neighborhood_3d = AsyncMock(
        return_value=Neighborhood3DResponse(
            address_id="0363100012253924",
            target_pand_id="0363100012253924",
            center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
            buildings=[
                BuildingBlock(
                    pand_id="0363100012253924",
                    ground_height=1.75,
                    building_height=16.43,
                    footprint=[[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]],
                    year=1917,
                )
            ],
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/neighborhood3d",
        params={
            "pand_id": "0363100012253924",
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    cache_key = mock_cache_get.call_args.args[0]
    assert cache_key.startswith("neighborhood3d:v26:accelerated:")
    assert "0363100012253924:121286:487296" in cache_key
    assert mock_cache_set.call_args.args[0] == cache_key


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.three_d_bag")
async def test_neighborhood_3d_cache_key_includes_conservative_mode(
    mock_3d, mock_cache_set, mock_cache_get, client,
):
    import app.api.address as address_mod

    mock_3d.get_neighborhood_3d = AsyncMock(
        return_value=Neighborhood3DResponse(
            address_id="0363100012253924",
            target_pand_id="0363100012253924",
            center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
            buildings=[
                BuildingBlock(
                    pand_id="0363100012253924",
                    ground_height=1.75,
                    building_height=16.43,
                    footprint=[[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]],
                    year=1917,
                )
            ],
        )
    )

    with patch.object(address_mod.settings, "three_d_conservative_mode", True):
        resp = await client.get(
            "/api/address/0363010000696734/neighborhood3d",
            params={
                "pand_id": "0363100012253924",
                "rd_x": "121286.0",
                "rd_y": "487296.0",
                "lat": "52.372",
                "lng": "4.892",
            },
        )

    assert resp.status_code == 200
    cache_key = mock_cache_get.call_args.args[0]
    assert cache_key.startswith("neighborhood3d:v26:conservative:")
    assert "0363100012253924:121286:487296" in cache_key
    assert mock_cache_set.call_args.args[0] == cache_key


@pytest.mark.asyncio
async def test_neighborhood_3d_invalid_vbo_id(client):
    resp = await client.get(
        "/api/address/not-valid/neighborhood3d",
        params={
            "pand_id": "0363100012253924",
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_neighborhood_3d_missing_params(client):
    resp = await client.get("/api/address/0363010000696734/neighborhood3d")
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.three_d_bag")
async def test_neighborhood_3d_caches_successful_response(
    mock_3d, mock_cache_set, mock_cache_get, client,
):
    """cache_set is called when the response contains buildings."""
    mock_3d.get_neighborhood_3d = AsyncMock(
        return_value=Neighborhood3DResponse(
            address_id="0363100012253924",
            target_pand_id="0363100012253924",
            center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
            buildings=[
                BuildingBlock(
                    pand_id="0363100012253924",
                    ground_height=1.75,
                    building_height=16.43,
                    footprint=[[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]],
                    year=1917,
                )
            ],
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/neighborhood3d",
        params={
            "pand_id": "0363100012253924",
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    mock_cache_set.assert_called_once()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.three_d_bag")
async def test_neighborhood_3d_does_not_cache_partial_response(
    mock_3d, mock_cache_set, mock_cache_get, client,
):
    """cache_set is NOT called when response is flagged as partial."""
    mock_3d.get_neighborhood_3d = AsyncMock(
        return_value=Neighborhood3DResponse(
            address_id="0363100012253924",
            target_pand_id="0363100012253924",
            center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
            buildings=[
                BuildingBlock(
                    pand_id="0363100012253924",
                    ground_height=1.75,
                    building_height=16.43,
                    footprint=[[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]],
                    year=1917,
                )
            ],
            message="Partial neighborhood data: some surrounding buildings could not be loaded",
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/neighborhood3d",
        params={
            "pand_id": "0363100012253924",
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.three_d_bag")
async def test_neighborhood_3d_does_not_cache_empty_response(
    mock_3d, mock_cache_set, mock_cache_get, client,
):
    """cache_set is NOT called when the response has no buildings."""
    mock_3d.get_neighborhood_3d = AsyncMock(
        return_value=Neighborhood3DResponse(
            address_id="0363100012253924",
            target_pand_id=None,
            center=Neighborhood3DCenter(lat=52.372, lng=4.892, rd_x=121286.0, rd_y=487296.0),
            buildings=[],
            message="No 3D building data available for this area",
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/neighborhood3d",
        params={
            "pand_id": "0363100012253924",
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.risk_cards")
async def test_risk_cards_endpoint(mock_risk_cards, mock_cache_set, mock_cache_get, client):
    mock_risk_cards.get_risk_cards = AsyncMock(
        return_value=RiskCardsResponse(
            address_id="0363010000696734",
            noise=NoiseRiskCard(
                level=RiskLevel.medium,
                lden_db=61.3,
                source="RIVM / Atlas Leefomgeving WMS",
                sampled_at="2026-02-05",
            ),
            air_quality=AirQualityRiskCard(
                level=RiskLevel.medium,
                pm25_ug_m3=8.8,
                no2_ug_m3=19.1,
                pm25_level=RiskLevel.medium,
                no2_level=RiskLevel.medium,
                source="RIVM GCN WMS",
                sampled_at="2026-02-05",
            ),
            climate_stress=ClimateStressRiskCard(
                level=RiskLevel.low,
                heat_level=RiskLevel.low,
                water_level=RiskLevel.low,
                source="Klimaateffectatlas WMS/WFS",
                sampled_at="2026-02-05",
            ),
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/risks",
        params={
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["noise"]["level"] == "medium"
    assert data["air_quality"]["pm25_ug_m3"] == 8.8
    assert data["climate_stress"]["level"] == "low"
    mock_cache_set.assert_called_once()


@pytest.mark.asyncio
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_submit_sunlight_analysis_caches_result(mock_cache_set, client):
    resp = await client.post(
        "/api/address/0363010000696734/sunlight",
        json={
            "winter_hours": 3.0,
            "summer_hours": 11.0,
            "equinox_hours": 7.0,
            "analysis_year": 2026,
            "svf": 0.52,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["score"] == 50
    assert data["severity"] == "moderate"

    mock_cache_set.assert_called_once()
    cache_key, cached_value = mock_cache_set.call_args.args[:2]
    assert cache_key == "sunlight:0363010000696734"
    assert cached_value["score"] == 50
    assert cached_value["level"] == "moderate"
    assert cached_value["svf_score"] == 52


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock)
@patch("app.api.address.risk_cards")
async def test_risk_cards_merges_cached_sunlight_when_base_cache_has_no_sunlight(
    mock_risk_cards,
    mock_cache_get,
    client,
):
    cached_risks = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.medium,
            source="RIVM",
            sampled_at="2026-02-10",
            score=55,
            severity="moderate",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.low,
            source="RIVM",
            sampled_at="2026-02-10",
            score=75,
            severity="good",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.low,
            heat_level=RiskLevel.low,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=85,
            severity="good",
        ),
        sunlight=None,
    ).model_dump(mode="json")
    cached_sunlight = SunlightRiskCard(
        level=SeverityLevel.moderate,
        winter_hours=3.0,
        summer_hours=11.0,
        equinox_hours=7.0,
        source="3DBAG + SunCalc",
        score=50,
        severity="moderate",
    ).model_dump(mode="json")
    mock_cache_get.side_effect = [cached_risks, cached_sunlight]
    mock_risk_cards.get_risk_cards = AsyncMock()

    resp = await client.get(
        "/api/address/0363010000696734/risks",
        params={
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sunlight"]["score"] == 50
    assert data["sunlight"]["level"] == "moderate"
    mock_risk_cards.get_risk_cards.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.risk_cards")
async def test_risk_cards_does_not_cache_on_failure_message(
    mock_risk_cards, mock_cache_set, mock_cache_get, client,
):
    """If any card indicates a lookup failure, do not cache."""
    mock_risk_cards.get_risk_cards = AsyncMock(
        return_value=RiskCardsResponse(
            address_id="0363010000696734",
            noise=NoiseRiskCard(
                level=RiskLevel.unavailable,
                source="RIVM / Atlas Leefomgeving WMS",
                sampled_at="2026-02-05",
                message="NOISE_LOOKUP_FAILED",
            ),
            air_quality=AirQualityRiskCard(
                level=RiskLevel.low,
                pm25_ug_m3=4.2,
                no2_ug_m3=9.1,
                pm25_level=RiskLevel.low,
                no2_level=RiskLevel.low,
                source="RIVM GCN WMS",
                sampled_at="2026-02-05",
            ),
            climate_stress=ClimateStressRiskCard(
                level=RiskLevel.low,
                heat_level=RiskLevel.low,
                water_level=RiskLevel.low,
                source="Klimaateffectatlas WMS/WFS",
                sampled_at="2026-02-05",
            ),
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/risks",
        params={
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 200
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
async def test_risk_cards_invalid_vbo_id(client):
    resp = await client.get(
        "/api/address/not-valid/risks",
        params={
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_risk_cards_returns_502_on_unhandled_exception(
    mock_cache_set, mock_cache_get, client,
):
    """If get_risk_cards() raises unexpectedly, endpoint returns 502."""
    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        side_effect=RuntimeError("WMS connection pool exhausted"),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/risks",
            params={"rd_x": "121286", "rd_y": "487296", "lat": "52.372", "lng": "4.892"},
        )
    assert resp.status_code == 502


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_risk_cards_does_not_cache_all_unavailable(
    mock_cache_set, mock_cache_get, client,
):
    """When all three cards are unavailable, result is NOT cached."""
    all_unavailable = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM",
            sampled_at="2026-02-05",
            message="fail",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM",
            sampled_at="2026-02-05",
            message="fail",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.unavailable,
            source="KA",
            sampled_at="2026-02-05",
            message="fail",
        ),
    )
    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        return_value=all_unavailable,
    ):
        resp = await client.get(
            "/api/address/0363010000696734/risks",
            params={"rd_x": "121286", "rd_y": "487296", "lat": "52.372", "lng": "4.892"},
        )
    assert resp.status_code == 200
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
async def test_risk_cards_missing_params(client):
    """Missing rd_x/rd_y/lat/lng returns 422."""
    resp = await client.get("/api/address/0363010000696734/risks")
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.risk_cards")
@patch("app.api.address.build_viewing_questions")
async def test_viewing_questions_passes_context_to_builder(
    mock_build_questions,
    mock_risk_cards,
    mock_cache_get,
    client,
):
    mock_risk_cards.get_risk_cards = AsyncMock(
        return_value=RiskCardsResponse(
            address_id="0363010000696734",
            noise=NoiseRiskCard(
                level=RiskLevel.medium,
                source="RIVM",
                sampled_at="2026-02-10",
                score=55,
                severity="moderate",
            ),
            air_quality=AirQualityRiskCard(
                level=RiskLevel.low,
                pm25_level=RiskLevel.low,
                no2_level=RiskLevel.low,
                source="RIVM",
                sampled_at="2026-02-10",
                score=72,
                severity="good",
            ),
            climate_stress=ClimateStressRiskCard(
                level=RiskLevel.low,
                heat_level=RiskLevel.low,
                water_level=RiskLevel.low,
                source="Klimaateffectatlas",
                sampled_at="2026-02-10",
                score=76,
                severity="good",
            ),
        )
    )
    mock_build_questions.return_value = ViewingQuestionsResponse(
        address_id="0363010000696734",
        categories=[
            QuestionCategory(
                name="Noise",
                name_nl="Geluid",
                severity="moderate",
                questions=[
                    ViewingQuestion(
                        text_en="Question",
                        text_nl="Vraag",
                    )
                ],
            )
        ],
    )

    resp = await client.get(
        "/api/address/0363010000696734/viewing-questions",
        params={
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
            "street": "Kalverstraat",
            "city": "Amsterdam",
        },
    )
    assert resp.status_code == 200
    mock_build_questions.assert_called_once()
    _, kwargs = mock_build_questions.call_args
    assert kwargs["street"] == "Kalverstraat"
    assert kwargs["city"] == "Amsterdam"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.tier_b")
async def test_tier_b_endpoint_returns_data_and_caches(
    mock_tier_b, mock_cache_set, mock_cache_get, client,
):
    mock_tier_b.get_tier_b_data = AsyncMock(
        return_value=TierBResponse(
            address_id="0363010000696734",
            energy_label=EnergyLabelCard(label="A", source_date="2025-05-01"),
            crime=CrimeStatsCard(
                total_per_1000=12.5,
                burglary_per_1000=1.2,
                violent_per_1000=0.8,
                yearly_period="2025JJ00",
                monthly_total_per_1000=1.0,
                monthly_period="2025MM12",
            ),
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/tier-b",
        params={
            "buurt_code": "BU0363AD07",
            "postcode": "1012NX",
            "house_number": "1",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["energy_label"]["label"] == "A"
    assert data["crime"]["total_per_1000"] == 12.5
    mock_cache_set.assert_called_once()


@pytest.mark.asyncio
async def test_tier_b_rejects_invalid_buurt_code(client):
    """Route returns 422 for malformed buurt_code (OData injection guard)."""
    resp = await client.get(
        "/api/address/0363010000696734/tier-b",
        params={
            "buurt_code": "BU0537'OR 1 eq 1--",
            "postcode": "1012NX",
            "house_number": "1",
        },
    )
    assert resp.status_code == 422
    assert "Invalid buurt_code format" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_tier_b_accepts_none_buurt_code(client):
    """Route accepts None buurt_code (it is optional)."""
    # This should not 422 — buurt_code is optional. It will likely 502
    # without mocking, but the point is it does NOT 422.
    resp = await client.get(
        "/api/address/0363010000696734/tier-b",
        params={
            "postcode": "1012NX",
            "house_number": "1",
        },
    )
    assert resp.status_code != 422


# --- Neighborhood stats endpoint ---

def _make_neighborhood_stats_response() -> NeighborhoodStatsResponse:
    return NeighborhoodStatsResponse(
        address_id="0363010000696734",
        stats=NeighborhoodStats(
            buurt_code="BU0363AD07",
            buurt_name="Centrum-Oost",
            gemeente_name="Amsterdam",
            population_density=NeighborhoodIndicator(value=15000, unit="per km²"),
            avg_household_size=NeighborhoodIndicator(value=1.8),
            single_person_pct=NeighborhoodIndicator(value=55.0, unit="%"),
            age_profile=AgeProfile(
                age_0_14=8.0, age_15_24=10.0, age_25_44=40.0,
                age_45_64=25.0, age_65_plus=17.0,
            ),
            owner_occupied_pct=NeighborhoodIndicator(value=35.0, unit="%"),
            avg_property_value=NeighborhoodIndicator(value=520000, unit="€"),
            distance_to_train_km=NeighborhoodIndicator(value=0.8, unit="km"),
            distance_to_supermarket_km=NeighborhoodIndicator(value=0.3, unit="km"),
            urbanization=UrbanizationLevel.very_urban,
        ),
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.cbs")
async def test_neighborhood_endpoint(mock_cbs, mock_cache_set, mock_cache_get, client):
    mock_cbs.get_neighborhood_stats = AsyncMock(
        return_value=_make_neighborhood_stats_response()
    )

    resp = await client.get(
        "/api/address/0363010000696734/neighborhood",
        params={"lat": "52.372", "lng": "4.892", "buurt_code": "BU0363AD07"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["buurt_code"] == "BU0363AD07"
    assert data["stats"]["buurt_name"] == "Centrum-Oost"
    assert data["stats"]["population_density"]["value"] == 15000
    mock_cache_set.assert_called_once()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.cbs")
async def test_neighborhood_caches_by_buurt_code(mock_cbs, mock_cache_set, mock_cache_get, client):
    mock_cbs.get_neighborhood_stats = AsyncMock(
        return_value=_make_neighborhood_stats_response()
    )

    await client.get(
        "/api/address/0363010000696734/neighborhood",
        params={"lat": "52.372", "lng": "4.892", "buurt_code": "BU0363AD07"},
    )

    cache_key = mock_cache_set.call_args[0][0]
    assert cache_key == "neighborhood:v2:BU0363AD07"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.cbs")
async def test_neighborhood_does_not_cache_on_failure(
    mock_cbs, mock_cache_set, mock_cache_get, client,
):
    mock_cbs.get_neighborhood_stats = AsyncMock(
        return_value=NeighborhoodStatsResponse(
            address_id="0363010000696734",
            message="CBS_NO_BUURT_FOUND",
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/neighborhood",
        params={"lat": "52.372", "lng": "4.892"},
    )
    assert resp.status_code == 200
    assert resp.json()["stats"] is None
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
async def test_neighborhood_invalid_vbo_id(client):
    resp = await client.get(
        "/api/address/not-valid/neighborhood",
        params={"lat": "52.372", "lng": "4.892"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_neighborhood_missing_params(client):
    resp = await client.get("/api/address/0363010000696734/neighborhood")
    assert resp.status_code == 422


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_neighborhood_returns_502_on_exception(
    mock_cache_set, mock_cache_get, client,
):
    with patch(
        "app.api.address.cbs.get_neighborhood_stats",
        new_callable=AsyncMock,
        side_effect=RuntimeError("CBS connection failed"),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/neighborhood",
            params={"lat": "52.372", "lng": "4.892"},
        )
    assert resp.status_code == 502


# --- Property warnings endpoint ---


def _make_property_warnings_response() -> PropertyWarningsResponse:
    return PropertyWarningsResponse(
        address_id="0363010000696734",
        attention_summary=AttentionSummary(
            flag_count=0,
            flags=[],
            risk_categories_assessed=0,
            risk_categories_total=4,
        ),
        foundation_risk=FoundationRisk(level="low", construction_year=2000),
        erfpacht=ErfpachtWarning(detected=False),
        vve=VvEInfo(is_apartment=False),
        asbestos=AsbestosWarning(flagged=False),
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_property_warnings_success(mock_cache_set, mock_cache_get, client):
    with patch(
        "app.api.address.property_warnings.get_property_warnings",
        new_callable=AsyncMock,
        return_value=_make_property_warnings_response(),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={"rd_x": "121000", "rd_y": "487000"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["address_id"] == "0363010000696734"
    assert data["foundation_risk"]["level"] == "low"
    assert data["erfpacht"]["detected"] is False
    mock_cache_set.assert_called_once()


@pytest.mark.asyncio
async def test_property_warnings_invalid_vbo(client):
    resp = await client.get(
        "/api/address/invalid/property-warnings",
        params={"rd_x": "121000", "rd_y": "487000"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_property_warnings_missing_params(client):
    resp = await client.get("/api/address/0363010000696734/property-warnings")
    assert resp.status_code == 422


# --- Property-warnings cache-key regression tests ---


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_property_warnings_cache_key_varies_by_context(
    mock_cache_set, mock_cache_get, client
):
    """Different construction_year / num_units / municipality => distinct cache keys."""
    with patch(
        "app.api.address.property_warnings.get_property_warnings",
        new_callable=AsyncMock,
        return_value=_make_property_warnings_response(),
    ):
        # Call 1: with construction_year=1920, num_units=1, municipality=amsterdam
        await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "construction_year": "1920",
                "num_units": "1",
                "municipality": "amsterdam",
            },
        )
        key_1 = mock_cache_get.call_args_list[-1][0][0]

        # Call 2: different construction_year
        await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "construction_year": "2005",
                "num_units": "1",
                "municipality": "amsterdam",
            },
        )
        key_2 = mock_cache_get.call_args_list[-1][0][0]

        # Call 3: different num_units
        await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "construction_year": "1920",
                "num_units": "50",
                "municipality": "amsterdam",
            },
        )
        key_3 = mock_cache_get.call_args_list[-1][0][0]

        # Call 4: different municipality
        await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "construction_year": "1920",
                "num_units": "1",
                "municipality": "utrecht",
            },
        )
        key_4 = mock_cache_get.call_args_list[-1][0][0]

    # All four keys must be distinct
    keys = [key_1, key_2, key_3, key_4]
    assert len(set(keys)) == 4, f"Expected 4 distinct cache keys, got: {keys}"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_property_warnings_cache_key_municipality_normalization(
    mock_cache_set, mock_cache_get, client
):
    """Municipality normalization: ' Amsterdam ' vs 'amsterdam' => same cache key."""
    with patch(
        "app.api.address.property_warnings.get_property_warnings",
        new_callable=AsyncMock,
        return_value=_make_property_warnings_response(),
    ):
        # Padded with whitespace and mixed case
        await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "municipality": " Amsterdam ",
            },
        )
        key_padded = mock_cache_get.call_args_list[-1][0][0]

        # Lowercase, stripped
        await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "municipality": "amsterdam",
            },
        )
        key_clean = mock_cache_get.call_args_list[-1][0][0]

    assert key_padded == key_clean, (
        f"Municipality normalization failed: '{key_padded}' != '{key_clean}'"
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_property_warnings_cache_key_uses_casefold(
    mock_cache_set, mock_cache_get, client
):
    """Cache key uses casefold() (not lower()) — parity with service logic.

    casefold() handles locale-specific case folding (e.g., German ß -> ss).
    This ensures cache key normalization matches property_warnings.py:134.
    """
    with patch(
        "app.api.address.property_warnings.get_property_warnings",
        new_callable=AsyncMock,
        return_value=_make_property_warnings_response(),
    ):
        # Use a string where casefold() and lower() produce different results
        await client.get(
            "/api/address/0363010000696734/property-warnings",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "municipality": "Straße",
            },
        )
        cache_key = mock_cache_get.call_args_list[-1][0][0]

    # casefold() turns ß -> ss, lower() keeps ß.
    # Verify cache key used casefold() normalization.
    assert "strasse" in cache_key, (
        f"Cache key should use casefold() (ß->ss), got: '{cache_key}'"
    )
    assert "straße" not in cache_key, (
        f"Cache key should NOT contain non-casefolded 'ß', got: '{cache_key}'"
    )


# --- Livability endpoint ---


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_livability_returns_502_on_unhandled_exception(
    mock_cache_set, mock_cache_get, client,
):
    """If get_livability() raises unexpectedly, endpoint returns 502."""
    with patch(
        "app.api.address.leefbaarometer.get_livability",
        new_callable=AsyncMock,
        side_effect=ValueError("non-numeric kscore"),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/livability",
            params={"rd_x": "121286", "rd_y": "487296"},
        )
    assert resp.status_code == 502
    assert resp.json()["detail"] == "Livability data unavailable"


# --- Bug #8: Empty suggestion list should NOT be cached ---


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.locatieserver")
async def test_suggest_empty_result_not_cached(
    mock_ls, mock_cache_set, mock_cache_get, client,
):
    """When PDOK returns no suggestions, the empty list must NOT be cached."""
    mock_ls.suggest = AsyncMock(return_value=[])
    mock_ls.AddressSuggestion = AddressSuggestion

    resp = await client.get("/api/address/suggest", params={"q": "xyznonexistent"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["suggestions"] == []
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.locatieserver")
async def test_suggest_nonempty_result_is_cached(
    mock_ls, mock_cache_set, mock_cache_get, client,
):
    """When PDOK returns results, they should be cached (positive control)."""
    mock_ls.suggest = AsyncMock(
        return_value=[
            AddressSuggestion(
                id="adr-1",
                display_name="Damrak 1, Amsterdam",
                type="adres",
                score=9.0,
            )
        ]
    )
    mock_ls.AddressSuggestion = AddressSuggestion

    resp = await client.get("/api/address/suggest", params={"q": "damrak"})
    assert resp.status_code == 200
    mock_cache_set.assert_called_once()


# --- Bug #9: Incomplete livability (trend/comparison failure) should NOT be cached ---


def _make_livability_current():
    """Helper: minimal valid LivabilityResponse (current data only)."""
    return LivabilityResponse(
        available=True,
        buurt_code="BU03630001",
        buurt_name="Centrum",
        gemeente="Amsterdam",
        year="2024",
        overall_score=7,
        overall_normalized=75,
        dimensions=[
            LivabilityDimension(
                name="physical", raw_score=7, normalized_score=75,
                label_code="livability.dimension.physical",
            ),
        ],
        source="Leefbaarometer (Dutch Livability Index)",
    )


def _make_trend():
    """Helper: minimal trend data."""
    return [
        LivabilityTrendPoint(
            year="2024", overall_score=7, overall_normalized=75,
        ),
    ]


def _make_comparison():
    """Helper: minimal comparison data."""
    return LivabilityComparison(
        rows=[
            LivabilityComparisonRow(
                level="gemeente", name="Amsterdam",
                overall_score=6, overall_normalized=62,
            ),
        ]
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_livability_not_cached_when_trend_fails(
    mock_cache_set, mock_cache_get, client,
):
    """If trend gather returns an Exception, livability must NOT be cached."""
    current = _make_livability_current()
    comparison = _make_comparison()

    with (
        patch(
            "app.api.address.leefbaarometer.get_livability",
            new_callable=AsyncMock,
            return_value=current,
        ),
        patch(
            "app.api.address.leefbaarometer.get_livability_trend",
            new_callable=AsyncMock,
            side_effect=ConnectionError("PDOK timeout"),
        ),
        patch(
            "app.api.address.leefbaarometer.get_livability_comparison",
            new_callable=AsyncMock,
            return_value=comparison,
        ),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/livability",
            params={"rd_x": "121286", "rd_y": "487296"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is True
    # Trend failed, so trend should be empty in response
    assert data["trend"] == []
    # Comparison succeeded
    assert len(data["comparison"]) > 0
    # Must NOT cache partial result
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_livability_not_cached_when_comparison_fails(
    mock_cache_set, mock_cache_get, client,
):
    """If comparison gather returns an Exception, livability must NOT be cached."""
    current = _make_livability_current()
    trend = _make_trend()

    with (
        patch(
            "app.api.address.leefbaarometer.get_livability",
            new_callable=AsyncMock,
            return_value=current,
        ),
        patch(
            "app.api.address.leefbaarometer.get_livability_trend",
            new_callable=AsyncMock,
            return_value=trend,
        ),
        patch(
            "app.api.address.leefbaarometer.get_livability_comparison",
            new_callable=AsyncMock,
            side_effect=ConnectionError("WFS timeout"),
        ),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/livability",
            params={"rd_x": "121286", "rd_y": "487296"},
        )

    assert resp.status_code == 200
    data = resp.json()
    # Comparison failed, so comparison should be empty
    assert data["comparison"] == []
    # Trend succeeded
    assert len(data["trend"]) > 0
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_livability_cached_when_all_succeed(
    mock_cache_set, mock_cache_get, client,
):
    """When current + trend + comparison all succeed, result IS cached (positive control)."""
    current = _make_livability_current()
    trend = _make_trend()
    comparison = _make_comparison()

    with (
        patch(
            "app.api.address.leefbaarometer.get_livability",
            new_callable=AsyncMock,
            return_value=current,
        ),
        patch(
            "app.api.address.leefbaarometer.get_livability_trend",
            new_callable=AsyncMock,
            return_value=trend,
        ),
        patch(
            "app.api.address.leefbaarometer.get_livability_comparison",
            new_callable=AsyncMock,
            return_value=comparison,
        ),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/livability",
            params={"rd_x": "121286", "rd_y": "487296"},
        )

    assert resp.status_code == 200
    mock_cache_set.assert_called_once()


# --- Bug #10: Export risk cache guard must check has_failure ---


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_export_risks_not_cached_with_failure_message(
    mock_cache_set, mock_cache_get,
):
    """_fetch_risks_for_export must NOT cache when a card has a failure message."""
    from app.api.address import _fetch_risks_for_export

    failed_result = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM / Atlas Leefomgeving WMS",
            sampled_at="2026-02-05",
            message="NOISE_LOOKUP_FAILED",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_ug_m3=4.2,
            no2_ug_m3=9.1,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.low,
            source="RIVM GCN WMS",
            sampled_at="2026-02-05",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.low,
            heat_level=RiskLevel.low,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas WMS/WFS",
            sampled_at="2026-02-05",
        ),
    )

    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        return_value=failed_result,
    ):
        result = await _fetch_risks_for_export(
            "0363010000696734", 121286.0, 487296.0, 52.372, 4.892,
        )

    assert result is not None
    # has_data is True (air + climate are available), but has_failure is True
    # so cache_set must NOT be called
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_export_risks_not_cached_with_timeout_message(
    mock_cache_set, mock_cache_get,
):
    """_fetch_risks_for_export must NOT cache when a card has a timeout message."""
    from app.api.address import _fetch_risks_for_export

    timeout_result = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.low,
            lden_db=45.0,
            source="RIVM / Atlas Leefomgeving WMS",
            sampled_at="2026-02-05",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.unavailable,
            source="RIVM GCN WMS",
            sampled_at="2026-02-05",
            message="AIR_TIMEOUT",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.low,
            heat_level=RiskLevel.low,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas WMS/WFS",
            sampled_at="2026-02-05",
        ),
    )

    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        return_value=timeout_result,
    ):
        result = await _fetch_risks_for_export(
            "0363010000696734", 121286.0, 487296.0, 52.372, 4.892,
        )

    assert result is not None
    mock_cache_set.assert_not_called()


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_export_risks_cached_when_no_failures(
    mock_cache_set, mock_cache_get,
):
    """Export risk cache: data present + no failures -> cached (positive control)."""
    from app.api.address import _fetch_risks_for_export

    ok_result = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.low,
            lden_db=45.0,
            source="RIVM / Atlas Leefomgeving WMS",
            sampled_at="2026-02-05",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_ug_m3=4.2,
            no2_ug_m3=9.1,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.low,
            source="RIVM GCN WMS",
            sampled_at="2026-02-05",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.low,
            heat_level=RiskLevel.low,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas WMS/WFS",
            sampled_at="2026-02-05",
        ),
    )

    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        return_value=ok_result,
    ):
        result = await _fetch_risks_for_export(
            "0363010000696734", 121286.0, 487296.0, 52.372, 4.892,
        )

    assert result is not None
    mock_cache_set.assert_called_once()
