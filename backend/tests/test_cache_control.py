"""Tests for HTTP Cache-Control headers on API endpoints.

Verifies that each endpoint class returns the correct Cache-Control header
on success, and does NOT set it on error/empty responses.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.models.address import AddressSuggestion, ResolvedAddress
from app.models.building import BuildingFacts
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
)

# ---------------------------------------------------------------------------
# Suggest → no-cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.locatieserver")
async def test_suggest_returns_no_cache_header(
    mock_ls, mock_cache_set, mock_cache_get, client
):
    mock_ls.suggest = AsyncMock(
        return_value=[
            AddressSuggestion(
                id="adr-1",
                display_name="Test 1, Amsterdam",
                type="adres",
                score=9.0,
            )
        ]
    )
    mock_ls.AddressSuggestion = AddressSuggestion

    resp = await client.get("/api/address/suggest", params={"q": "test"})
    assert resp.status_code == 200
    assert resp.headers.get("cache-control") == "no-cache"


# ---------------------------------------------------------------------------
# Building facts → max-age=86400 on success, absent on error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
async def test_building_returns_immutable_cache_on_success(
    mock_bag, mock_cache_set, mock_cache_get, client
):
    mock_bag.get_building_facts = AsyncMock(
        return_value=BuildingFacts(
            pand_id="0363100012253924",
            construction_year=1917,
            status="Pand in gebruik",
            status_en="In use",
        )
    )

    resp = await client.get("/api/address/0363010000696734/building")
    assert resp.status_code == 200
    assert resp.headers.get("cache-control") == "public, max-age=86400"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
async def test_building_no_cache_control_on_502(
    mock_bag, mock_cache_set, mock_cache_get, client
):
    mock_bag.get_building_facts = AsyncMock(
        side_effect=RuntimeError("BAG WFS down")
    )

    resp = await client.get("/api/address/0363010000696734/building")
    assert resp.status_code == 502
    assert "cache-control" not in resp.headers


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
async def test_building_no_cache_control_when_no_building_found(
    mock_bag, mock_cache_set, mock_cache_get, client
):
    """When building is None (not found), no Cache-Control header is set."""
    mock_bag.get_building_facts = AsyncMock(return_value=None)

    resp = await client.get("/api/address/0000000000000000/building")
    assert resp.status_code == 200
    # No building found → no Cache-Control (success but empty data)
    assert "cache-control" not in resp.headers


# ---------------------------------------------------------------------------
# Risks → max-age=3600, stale-while-revalidate=86400 on success
# ---------------------------------------------------------------------------


def _make_risk_result(*, all_unavailable=False):
    level = RiskLevel.unavailable if all_unavailable else RiskLevel.medium
    return RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=level,
            lden_db=None if all_unavailable else 55.0,
            source="RIVM",
            sampled_at="2026-02-26",
        ),
        air_quality=AirQualityRiskCard(
            level=level,
            source="RIVM GCN",
            sampled_at="2026-02-26",
        ),
        climate_stress=ClimateStressRiskCard(
            level=level,
            source="Klimaateffectatlas",
            sampled_at="2026-02-26",
        ),
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.risk_cards")
async def test_risks_returns_data_cache_on_success(
    mock_rc, mock_cache_set, mock_cache_get, client
):
    mock_rc.get_risk_cards = AsyncMock(return_value=_make_risk_result())

    resp = await client.get(
        "/api/address/0363010000696734/risks",
        params={"rd_x": "121286", "rd_y": "487296", "lat": "52.372", "lng": "4.892"},
    )
    assert resp.status_code == 200
    assert (
        resp.headers.get("cache-control")
        == "public, max-age=3600, stale-while-revalidate=86400"
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.risk_cards")
async def test_risks_no_cache_control_when_all_unavailable(
    mock_rc, mock_cache_set, mock_cache_get, client
):
    mock_rc.get_risk_cards = AsyncMock(
        return_value=_make_risk_result(all_unavailable=True)
    )

    resp = await client.get(
        "/api/address/0363010000696734/risks",
        params={"rd_x": "121286", "rd_y": "487296", "lat": "52.372", "lng": "4.892"},
    )
    assert resp.status_code == 200
    # All unavailable → no data → no Cache-Control
    assert "cache-control" not in resp.headers


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
async def test_risks_no_cache_control_on_502(mock_cache_set, mock_cache_get, client):
    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        side_effect=RuntimeError("WMS down"),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/risks",
            params={
                "rd_x": "121286",
                "rd_y": "487296",
                "lat": "52.372",
                "lng": "4.892",
            },
        )
    assert resp.status_code == 502
    assert "cache-control" not in resp.headers


# ---------------------------------------------------------------------------
# Lookup → max-age=86400 on success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_returns_immutable_cache_on_success(
    mock_ls, mock_bag, mock_cache_set, mock_cache_get, client
):
    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-1",
            display_name="Test 1, Amsterdam",
            street="Test",
            house_number="1",
            postcode="1012AB",
            city="Amsterdam",
            latitude=52.37,
            longitude=4.89,
            rd_x=121286.0,
            rd_y=487296.0,
            adresseerbaar_object_id="0363010000696734",
        )
    )
    mock_bag.get_pand_id = AsyncMock(return_value="0363100012253924")

    resp = await client.get("/api/address/lookup", params={"id": "adr-1"})
    assert resp.status_code == 200
    assert resp.headers.get("cache-control") == "public, max-age=86400"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_no_cache_control_on_404(
    mock_ls, mock_bag, mock_cache_set, mock_cache_get, client
):
    mock_ls.lookup = AsyncMock(return_value=None)
    mock_bag.get_pand_id = AsyncMock(return_value=None)

    resp = await client.get("/api/address/lookup", params={"id": "nonexistent"})
    assert resp.status_code == 404
    assert "cache-control" not in resp.headers


# ---------------------------------------------------------------------------
# Export → no-store
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.risk_cards")
async def test_export_returns_no_store(
    mock_rc, mock_bag, mock_cache_set, mock_cache_get, client
):
    mock_bag.get_building_facts = AsyncMock(
        return_value=BuildingFacts(
            pand_id="0363100012345678",
            construction_year=1920,
            intended_use_en=["Residential"],
        )
    )
    mock_rc.get_risk_cards = AsyncMock(return_value=_make_risk_result())

    resp = await client.post(
        "/api/address/0363010012345678/export",
        json={
            "rd_x": 121000,
            "rd_y": 487000,
            "lat": 52.37,
            "lng": 4.89,
            "address": "Test 1, Amsterdam",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("cache-control") == "no-store"
