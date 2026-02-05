import time
from unittest.mock import AsyncMock, patch

import pytest

import app.cache.redis as cache_module
from app.models.address import AddressSuggestion, ResolvedAddress
from app.models.building import BuildingFacts
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
)


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
async def test_lookup_endpoint(mock_ls, mock_cache_set, mock_cache_get, client):
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

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["street"] == "Kalverstraat"
    assert data["latitude"] == 52.372


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.locatieserver")
async def test_lookup_not_found(mock_ls, mock_cache_set, mock_cache_get, client):
    mock_ls.lookup = AsyncMock(return_value=None)

    resp = await client.get("/api/address/lookup", params={"id": "adr-nonexistent"})
    assert resp.status_code == 404


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
