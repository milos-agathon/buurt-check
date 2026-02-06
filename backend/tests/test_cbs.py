from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.neighborhood import (
    NeighborhoodStats,
    UrbanizationLevel,
)
from app.services.cbs import (
    _fetch_by_bbox,
    _fetch_by_buurt_code,
    _geometry_contains_point,
    _is_sentinel,
    _make_indicator,
    _parse_age_profile,
    _parse_stats,
    _parse_urbanization,
    _safe_float,
    get_neighborhood_stats,
)

# --- Sentinel detection ---

def test_is_sentinel_rejects_large_negative():
    assert _is_sentinel(-99999) is True


def test_is_sentinel_rejects_none():
    assert _is_sentinel(None) is True


def test_is_sentinel_rejects_string():
    assert _is_sentinel("n/a") is True


def test_is_sentinel_accepts_zero():
    assert _is_sentinel(0) is False


def test_is_sentinel_accepts_positive():
    assert _is_sentinel(42.5) is False


# --- safe_float ---

def test_safe_float_returns_value():
    assert _safe_float({"x": 12.5}, "x") == 12.5


def test_safe_float_returns_none_for_sentinel():
    assert _safe_float({"x": -99999}, "x") is None


def test_safe_float_returns_none_for_missing_key():
    assert _safe_float({}, "x") is None


# --- make_indicator ---

def test_make_indicator_available():
    ind = _make_indicator({"density": 5000}, "density", "per km²")
    assert ind.available is True
    assert ind.value == 5000.0
    assert ind.unit == "per km²"


def test_make_indicator_unavailable():
    ind = _make_indicator({"density": -99999}, "density")
    assert ind.available is False
    assert ind.value is None


# --- urbanization ---

def test_parse_urbanization_very_urban():
    props = {"stedelijkheid_adressen_per_km2": 1}
    assert _parse_urbanization(props) == UrbanizationLevel.very_urban


def test_parse_urbanization_very_rural():
    props = {"stedelijkheid_adressen_per_km2": 5}
    assert _parse_urbanization(props) == UrbanizationLevel.very_rural


def test_parse_urbanization_unknown_for_sentinel():
    props = {"stedelijkheid_adressen_per_km2": -99999}
    assert _parse_urbanization(props) == UrbanizationLevel.unknown


def test_parse_urbanization_unknown_for_missing():
    assert _parse_urbanization({}) == UrbanizationLevel.unknown


def test_parse_urbanization_unknown_for_out_of_range():
    assert _parse_urbanization({"stedelijkheid_adressen_per_km2": 99}) == UrbanizationLevel.unknown


# --- age profile ---

def test_parse_age_profile_complete():
    props = {
        "percentage_personen_0_tot_15_jaar": 15.2,
        "percentage_personen_15_tot_25_jaar": 12.1,
        "percentage_personen_25_tot_45_jaar": 30.0,
        "percentage_personen_45_tot_65_jaar": 25.5,
        "percentage_personen_65_jaar_en_ouder": 17.2,
    }
    profile = _parse_age_profile(props)
    assert profile.age_0_24 is not None
    assert abs(profile.age_0_24 - 27.3) < 0.01  # 15.2 + 12.1
    assert profile.age_25_64 == 55.5  # 30.0 + 25.5
    assert profile.age_65_plus == 17.2


def test_parse_age_profile_with_sentinels():
    props = {
        "percentage_personen_0_tot_15_jaar": -99999,
        "percentage_personen_15_tot_25_jaar": 12.1,
        "percentage_personen_25_tot_45_jaar": 30.0,
        "percentage_personen_45_tot_65_jaar": -99999,
    }
    profile = _parse_age_profile(props)
    # age_0_24 should be 12.1 (only 15_24 is valid)
    assert profile.age_0_24 == 12.1
    # age_25_64 should be 30.0 (only 25_44 is valid)
    assert profile.age_25_64 == 30.0


# --- full stats parsing ---

def _make_full_feature() -> dict:
    return {
        "properties": {
            "buurtcode": "BU0363AD07",
            "buurtnaam": "Centrum-Oost",
            "gemeentenaam": "Amsterdam",
            "bevolkingsdichtheid_inwoners_per_km2": 15000,
            "gemiddelde_huishoudsgrootte": 1.8,
            "percentage_eenpersoonshuishoudens": 55.0,
            "percentage_personen_0_tot_15_jaar": 8.0,
            "percentage_personen_15_tot_25_jaar": 10.0,
            "percentage_personen_25_tot_45_jaar": 40.0,
            "percentage_personen_45_tot_65_jaar": 25.0,
            "percentage_personen_65_jaar_en_ouder": 17.0,
            "percentage_koopwoningen": 35.0,
            "gemiddelde_woningwaarde": 520000,
            "treinstation_gemiddelde_afstand_in_km": 0.8,
            "grote_supermarkt_gemiddelde_afstand_in_km": 0.3,
            "stedelijkheid_adressen_per_km2": 1,
        }
    }


def test_parse_stats_full():
    stats = _parse_stats(_make_full_feature())
    assert isinstance(stats, NeighborhoodStats)
    assert stats.buurt_code == "BU0363AD07"
    assert stats.buurt_name == "Centrum-Oost"
    assert stats.gemeente_name == "Amsterdam"
    assert stats.population_density.value == 15000.0
    assert stats.avg_household_size.value == 1.8
    assert stats.single_person_pct.value == 55.0
    assert stats.owner_occupied_pct.value == 35.0
    assert stats.avg_property_value.value == 520000.0
    assert stats.avg_property_value.unit == "€"
    assert stats.distance_to_train_km.value == 0.8
    assert stats.distance_to_supermarket_km.value == 0.3
    assert stats.urbanization == UrbanizationLevel.very_urban
    assert stats.age_profile.age_0_24 == 18.0  # 8.0 + 10.0
    assert stats.age_profile.age_25_64 == 65.0  # 40.0 + 25.0
    assert stats.age_profile.age_65_plus == 17.0


def test_parse_stats_returns_none_without_buurtcode():
    feature = {"properties": {"buurtnaam": "Test"}}
    assert _parse_stats(feature) is None


def test_parse_stats_suppressed_fields():
    feature = _make_full_feature()
    feature["properties"]["percentage_koopwoningen"] = -99999
    feature["properties"]["gemiddelde_woningwaarde"] = -99999
    stats = _parse_stats(feature)
    assert stats is not None
    assert stats.owner_occupied_pct.available is False
    assert stats.avg_property_value.available is False
    # Other indicators should still be available
    assert stats.population_density.available is True


# --- geometry point-in-polygon ---

def test_geometry_contains_point_polygon():
    geom = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    }
    assert _geometry_contains_point(geom, 5, 5) is True
    assert _geometry_contains_point(geom, 15, 5) is False


def test_geometry_contains_point_multipolygon():
    geom = {
        "type": "MultiPolygon",
        "coordinates": [
            [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
            [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]],
        ],
    }
    assert _geometry_contains_point(geom, 15, 15) is True
    assert _geometry_contains_point(geom, 7, 7) is False


def test_geometry_contains_point_none():
    assert _geometry_contains_point(None, 5, 5) is False


# --- fetch_by_buurt_code ---

@pytest.mark.asyncio
async def test_fetch_by_buurt_code_returns_feature():
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"features": [_make_full_feature()]}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("app.services.cbs._get_client", return_value=mock_client):
        result = await _fetch_by_buurt_code("BU0363AD07")

    assert result is not None
    assert result["properties"]["buurtcode"] == "BU0363AD07"
    call_args = mock_client.get.call_args
    assert "buurtcode" in call_args.kwargs.get("params", call_args[1].get("params", {}))


@pytest.mark.asyncio
async def test_fetch_by_buurt_code_empty():
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"features": []}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("app.services.cbs._get_client", return_value=mock_client):
        result = await _fetch_by_buurt_code("BU0000XX00")

    assert result is None


# --- fetch_by_bbox ---

@pytest.mark.asyncio
async def test_fetch_by_bbox_with_point_in_polygon():
    feature_inside = _make_full_feature()
    feature_inside["geometry"] = {
        "type": "Polygon",
        "coordinates": [[
            [4.88, 52.36], [4.90, 52.36],
            [4.90, 52.38], [4.88, 52.38], [4.88, 52.36],
        ]],
    }
    feature_outside = {
        "properties": {"buurtcode": "BU0000XX00"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[5.0, 53.0], [5.1, 53.0], [5.1, 53.1], [5.0, 53.1], [5.0, 53.0]]],
        },
    }

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"features": [feature_outside, feature_inside]}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("app.services.cbs._get_client", return_value=mock_client):
        result = await _fetch_by_bbox(52.37, 4.89)

    assert result is not None
    assert result["properties"]["buurtcode"] == "BU0363AD07"


@pytest.mark.asyncio
async def test_fetch_by_bbox_fallback_first_feature():
    """When no geometry matches, falls back to first feature."""
    feature = _make_full_feature()
    # No geometry field
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"features": [feature]}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("app.services.cbs._get_client", return_value=mock_client):
        result = await _fetch_by_bbox(52.37, 4.89)

    assert result is not None


# --- orchestrator ---

@pytest.mark.asyncio
async def test_get_neighborhood_stats_by_buurt_code():
    with patch("app.services.cbs._fetch_by_buurt_code", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = _make_full_feature()
        result = await get_neighborhood_stats(
            vbo_id="0363010000696734",
            lat=52.37,
            lng=4.89,
            buurt_code="BU0363AD07",
        )

    assert result.stats is not None
    assert result.stats.buurt_code == "BU0363AD07"
    assert result.message is None


@pytest.mark.asyncio
async def test_get_neighborhood_stats_fallback_to_bbox():
    with (
        patch("app.services.cbs._fetch_by_buurt_code", new_callable=AsyncMock) as mock_bc,
        patch("app.services.cbs._fetch_by_bbox", new_callable=AsyncMock) as mock_bbox,
    ):
        mock_bc.return_value = None  # buurt_code lookup returns nothing
        mock_bbox.return_value = _make_full_feature()
        result = await get_neighborhood_stats(
            vbo_id="0363010000696734",
            lat=52.37,
            lng=4.89,
            buurt_code="BU0363AD07",
        )

    assert result.stats is not None


@pytest.mark.asyncio
async def test_get_neighborhood_stats_bbox_only():
    """When no buurt_code provided, goes directly to bbox."""
    with patch("app.services.cbs._fetch_by_bbox", new_callable=AsyncMock) as mock_bbox:
        mock_bbox.return_value = _make_full_feature()
        result = await get_neighborhood_stats(
            vbo_id="0363010000696734",
            lat=52.37,
            lng=4.89,
        )

    assert result.stats is not None
    mock_bbox.assert_called_once()


@pytest.mark.asyncio
async def test_get_neighborhood_stats_no_buurt_found():
    with (
        patch("app.services.cbs._fetch_by_buurt_code", new_callable=AsyncMock, return_value=None),
        patch("app.services.cbs._fetch_by_bbox", new_callable=AsyncMock, return_value=None),
    ):
        result = await get_neighborhood_stats(
            vbo_id="0363010000696734",
            lat=52.37,
            lng=4.89,
            buurt_code="BU0000XX00",
        )

    assert result.stats is None
    assert result.message == "CBS_NO_BUURT_FOUND"


@pytest.mark.asyncio
async def test_get_neighborhood_stats_bbox_exception():
    mock_bbox = AsyncMock(side_effect=Exception("timeout"))
    with patch("app.services.cbs._fetch_by_bbox", mock_bbox):
        result = await get_neighborhood_stats(
            vbo_id="0363010000696734",
            lat=52.37,
            lng=4.89,
        )

    assert result.stats is None
    assert result.message == "CBS_LOOKUP_FAILED"


@pytest.mark.asyncio
async def test_get_neighborhood_stats_buurt_code_exception_falls_back():
    """If buurt_code fetch raises, falls back to bbox."""
    with (
        patch(
            "app.services.cbs._fetch_by_buurt_code",
            new_callable=AsyncMock,
            side_effect=Exception("timeout"),
        ),
        patch("app.services.cbs._fetch_by_bbox", new_callable=AsyncMock) as mock_bbox,
    ):
        mock_bbox.return_value = _make_full_feature()
        result = await get_neighborhood_stats(
            vbo_id="0363010000696734",
            lat=52.37,
            lng=4.89,
            buurt_code="BU0363AD07",
        )

    assert result.stats is not None
    mock_bbox.assert_called_once()
