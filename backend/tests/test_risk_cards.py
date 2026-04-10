import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskLevel,
    SeverityLevel,
)
from app.services.risk_cards import (
    _CLIMATE_HEAT_LAYERS,
    _CLIMATE_WATER_LAYERS,
    _PER_CARD_TIMEOUT_SECONDS,
    _build_air_card,
    _build_card_with_timeout,
    _build_climate_card,
    _build_noise_card,
    _classify_heat_from_properties,
    _classify_water_from_properties,
    _extract_layer_date,
    _risk_from_threshold,
    _sample_wfs_properties,
    _select_air_layer,
    _select_noise_layer,
    get_risk_cards,
)


def test_risk_from_threshold():
    assert _risk_from_threshold(10.0, 20.0, 30.0) == RiskLevel.low
    assert _risk_from_threshold(25.0, 20.0, 30.0) == RiskLevel.medium
    assert _risk_from_threshold(40.0, 20.0, 30.0) == RiskLevel.high


def test_risk_from_threshold_non_finite_is_unavailable():
    assert _risk_from_threshold(float("nan"), 20.0, 30.0) == RiskLevel.unavailable
    assert _risk_from_threshold(float("inf"), 20.0, 30.0) == RiskLevel.unavailable


def test_select_noise_layer_prefers_latest_date():
    layers = [
        "rivm_20220601_Geluid_lden_wegverkeer_2020",
        "rivm_20250101_Geluid_lden_wegverkeer_2022",
        "other_layer",
    ]
    assert _select_noise_layer(layers) == "rivm_20250101_Geluid_lden_wegverkeer_2022"


def test_select_noise_layer_matches_real_rivm_names():
    """Real RIVM ALO names use Geluid_lden_wegverkeer_YYYY pattern."""
    layers = [
        "rivm_20220601_Geluid_lden_wegverkeer_2020",
        "rivm_20250101_Geluid_lden_wegverkeer_2022",
        "rivm_Geluid_lden_wegverkeer_actueel",
        "rivm_20250101_Geluid_lnight_wegverkeer_2022",
    ]
    assert _select_noise_layer(layers) == "rivm_20250101_Geluid_lden_wegverkeer_2022"


def test_select_air_layer_prefers_latest_year():
    layers = ["conc_PM25_2023", "conc_PM25_2024", "conc_NO2_2024"]
    assert _select_air_layer(layers, "PM25") == "conc_PM25_2024"
    assert _select_air_layer(layers, "NO2") == "conc_NO2_2024"


def test_classify_heat_from_raster_index():
    level, value, signal = _classify_heat_from_properties(
        {"GRAY_INDEX": 0.92},
        "wpn:s0149_hittestress_warme_nachten_huidig",
    )
    assert level == RiskLevel.high
    assert value == 0.92
    assert signal == "heat index"


def test_classify_water_from_begaanbaar_text():
    level, value, signal = _classify_water_from_properties(
        {"Begaanbaar": "Onbegaanbaar"},
        "mra_klimaatatlas:1826_mra_begaanbaarheid_wegen_70mm",
    )
    assert level == RiskLevel.high
    assert value is None
    assert signal == "Onbegaanbaar"


def test_classify_water_from_gridcode():
    level, value, signal = _classify_water_from_properties(
        {"GRIDCODE": 2},
        "wpn:s0149_wateroverlast_wpn",
    )
    assert level == RiskLevel.medium
    assert value == 2
    assert signal == "GRIDCODE"


def test_classify_water_from_gridcode_sentinel_is_unavailable():
    level, value, signal = _classify_water_from_properties(
        {"GRIDCODE": float("nan")},
        "wpn:s0149_wateroverlast_wpn",
    )
    assert level == RiskLevel.unavailable
    assert value is None
    assert signal is None


def test_classify_water_ignores_unknown_numeric_fields():
    level, value, signal = _classify_water_from_properties(
        {"mystery_score": 999},
        "wpn:s0149_wateroverlast_wpn",
    )
    assert level == RiskLevel.unavailable
    assert value is None
    assert signal is None


def test_classify_water_from_klasse_20():
    level, value, signal = _classify_water_from_properties(
        {"klasse_20": 3},
        "mra_klimaatatlas:1826_mra_overstromingskans_20cm",
    )
    assert level == RiskLevel.high
    assert value == 3
    assert signal == "klasse_20"


def test_climate_heat_layers_include_national_first():
    first_layer, _ = _CLIMATE_HEAT_LAYERS[0]
    assert first_layer.startswith("wpn:")


def test_climate_water_layers_include_national():
    national = [layer for layer, _ in _CLIMATE_WATER_LAYERS if layer.startswith("wpn:")]
    assert len(national) >= 1


def test_climate_water_layers_start_with_broad_coverage_layer():
    first_layer, _ = _CLIMATE_WATER_LAYERS[0]
    assert first_layer == "mra_klimaatatlas:1826_mra_overstromingskans_20cm"


@pytest.mark.asyncio
@patch("app.services.risk_cards._build_noise_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_air_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_climate_card", new_callable=AsyncMock)
async def test_get_risk_cards_assembly(mock_climate, mock_air, mock_noise):
    mock_noise.return_value = NoiseRiskCard(
        level=RiskLevel.low,
        lden_db=50.0,
        source="RIVM / Atlas Leefomgeving WMS",
        sampled_at="2026-02-05",
    )
    mock_air.return_value = AirQualityRiskCard(
        level=RiskLevel.medium,
        pm25_ug_m3=8.0,
        no2_ug_m3=17.0,
        pm25_level=RiskLevel.medium,
        no2_level=RiskLevel.medium,
        source="RIVM GCN WMS",
        sampled_at="2026-02-05",
    )
    mock_climate.return_value = ClimateStressRiskCard(
        level=RiskLevel.high,
        heat_level=RiskLevel.high,
        water_level=RiskLevel.medium,
        source="Klimaateffectatlas WMS/WFS",
        sampled_at="2026-02-05",
    )

    resp = await get_risk_cards(
        vbo_id="0363010000696734",
        rd_x=121286.0,
        rd_y=487296.0,
        lat=52.372,
        lng=4.892,
    )

    assert resp.address_id == "0363010000696734"
    assert resp.noise.level == RiskLevel.low
    assert resp.air_quality.level == RiskLevel.medium
    assert resp.climate_stress.level == RiskLevel.high
    assert resp.noise.score == 80
    assert resp.noise.severity == SeverityLevel.good
    assert isinstance(resp.noise.severity, SeverityLevel)
    assert resp.noise.summary is not None
    assert resp.noise.summary_nl is not None
    assert resp.air_quality.score == 77
    assert resp.air_quality.severity == SeverityLevel.good
    assert isinstance(resp.air_quality.severity, SeverityLevel)
    assert resp.air_quality.summary is not None
    assert resp.air_quality.summary_nl is not None
    assert resp.climate_stress.score == 15
    assert resp.climate_stress.severity == SeverityLevel.critical
    assert isinstance(resp.climate_stress.severity, SeverityLevel)
    assert resp.climate_stress.summary is not None
    assert resp.climate_stress.summary_nl is not None


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_climate_layer", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_climate_layer_names", new_callable=AsyncMock)
async def test_climate_card_selects_worst_case_heat(mock_layers, mock_sample):
    """When multiple heat layers return data, the worst-case (highest risk) wins."""
    heat_names = [layer for layer, _ in _CLIMATE_HEAT_LAYERS]
    # Only heat layers available — no water layers
    mock_layers.return_value = set(heat_names)

    # Layer 0 (national raster): GRAY_INDEX 0.5 → low (threshold: ≤0.65)
    # Layer 1 (regional vector): text "Hoge urgentie" → high
    results = {
        heat_names[0]: {"GRAY_INDEX": 0.5},
        heat_names[1]: {"urgentie": "Hoge urgentie"},
    }

    async def side_effect(layer, layer_type, rd_x, rd_y):
        return results.get(layer)

    mock_sample.side_effect = side_effect

    card = await _build_climate_card(121000.0, 487000.0, "2026-02-05")

    # Must pick high (from layer 1), not low (from layer 0 which is iterated first)
    assert card.heat_level == RiskLevel.high
    assert card.heat_layer == heat_names[1]
    # Water has no available layers, so should be unavailable
    assert card.water_level == RiskLevel.unavailable


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_climate_layer", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_climate_layer_names", new_callable=AsyncMock)
async def test_climate_card_selects_worst_case_water(mock_layers, mock_sample):
    """When multiple water layers return data, the worst-case (highest risk) wins."""
    water_names = [layer for layer, _ in _CLIMATE_WATER_LAYERS]
    # Only water layers available — no heat layers
    mock_layers.return_value = set(water_names)

    # Layer 0: Begaanbaar text → low
    # Layer 3: Onbegaanbaar text → high
    results = {
        water_names[0]: {"Begaanbaar": "Begaanbaar"},
        water_names[3]: {"Begaanbaar": "Onbegaanbaar"},
    }

    async def side_effect(layer, layer_type, rd_x, rd_y):
        return results.get(layer)

    mock_sample.side_effect = side_effect

    card = await _build_climate_card(121000.0, 487000.0, "2026-02-05")

    # Must pick high (from layer 3), not low (from layer 0 which is iterated first)
    assert card.water_level == RiskLevel.high
    assert card.water_layer == water_names[3]
    # Heat has no available layers, so should be unavailable
    assert card.heat_level == RiskLevel.unavailable


@pytest.mark.asyncio
@patch("app.services.risk_cards._get_client")
async def test_wfs_bbox_uses_narrow_range(mock_get_client):
    """WFS bbox should be ±5m (10m square), not ±300m."""
    from unittest.mock import MagicMock

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = {
        "features": [{"properties": {"value": 42}, "geometry": {"type": "Point"}}]
    }
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_get_client.return_value = mock_client

    await _sample_wfs_properties("test:layer", 121000.0, 487000.0)

    call_kwargs = mock_client.get.call_args
    bbox_param = call_kwargs.kwargs.get("params", call_kwargs[1].get("params", {})).get("bbox")
    assert bbox_param == "120995.0,486995.0,121005.0,487005.0,EPSG:28992"


@pytest.mark.asyncio
@patch("app.services.risk_cards._get_client")
async def test_wfs_picks_closest_feature(mock_get_client):
    """When multiple features returned, pick the one closest to query point."""
    from unittest.mock import MagicMock

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = {
        "features": [
            {
                "properties": {"value": "far"},
                "geometry": {"type": "Polygon"},
                "bbox": [120900, 486900, 120950, 486950],
            },
            {
                "properties": {"value": "close"},
                "geometry": {"type": "Polygon"},
                "bbox": [120998, 486998, 121002, 487002],
            },
        ]
    }
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_get_client.return_value = mock_client

    result = await _sample_wfs_properties("test:layer", 121000.0, 487000.0)
    assert result is not None
    assert result["value"] == "close"


@pytest.mark.asyncio
@patch("app.services.risk_cards._get_client")
async def test_wfs_prefers_containing_polygon(mock_get_client):
    """If a polygon contains the point, prefer it even if another centroid is closer."""
    from unittest.mock import MagicMock

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.headers = {"content-type": "application/json"}
    mock_response.json.return_value = {
        "features": [
            {
                "properties": {"value": "contains"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [120900, 486900],
                            [121900, 486900],
                            [121900, 487100],
                            [120900, 487100],
                            [120900, 486900],
                        ]
                    ],
                },
                "bbox": [120900, 486900, 121900, 487100],
            },
            {
                "properties": {"value": "close"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [121010, 487010],
                            [121020, 487010],
                            [121020, 487020],
                            [121010, 487020],
                            [121010, 487010],
                        ]
                    ],
                },
                "bbox": [121010, 487010, 121020, 487020],
            },
        ]
    }
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_get_client.return_value = mock_client

    result = await _sample_wfs_properties("test:layer", 121000.0, 487000.0)
    assert result is not None
    assert result["value"] == "contains"


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_climate_layer", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_climate_layer_names", new_callable=AsyncMock)
async def test_climate_source_date_none_when_no_layer_date(mock_layers, mock_sample):
    """source_date should be None (not sampled_at) when layer names have no dates."""
    # Use layers with no date info in names
    mock_layers.return_value = {"test:no_date_layer"}

    # No heat/water layers from the predefined lists are available
    card = await _build_climate_card(121000.0, 487000.0, "2026-02-05")

    # No layers matched → source_date should be None, not the sampled_at fallback
    assert card.source_date is None
    assert card.sampled_at == "2026-02-05"


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_climate_layer", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_climate_layer_names", new_callable=AsyncMock)
async def test_climate_source_date_uses_publication_year_fallback(mock_layers, mock_sample):
    """Curated Klimaateffectatlas layers resolve to the atlas publication year."""
    mock_layers.return_value = {"wpn:s0149_hittestress_warme_nachten_huidig"}
    mock_sample.return_value = {"GRAY_INDEX": 0.6}

    card = await _build_climate_card(121000.0, 487000.0, "2026-02-05")

    assert card.heat_layer == "wpn:s0149_hittestress_warme_nachten_huidig"
    assert card.source_date == "2024"
    assert card.sampled_at == "2026-02-05"


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_climate_layer", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_climate_layer_names", new_callable=AsyncMock)
async def test_climate_card_warns_on_unmapped_layer_schema(mock_layers, mock_sample):
    """Schema drift produces a warning instead of classifying arbitrary numbers."""
    mock_layers.return_value = {"wpn:s0149_wateroverlast_wpn"}
    mock_sample.return_value = {"mystery_score": 999}

    card = await _build_climate_card(121000.0, 487000.0, "2026-02-05")

    assert card.water_level == RiskLevel.unavailable
    assert card.water_layer is None
    assert "CLIMATE_LAYER_UNMAPPED" in card.warnings


def test_extract_layer_date_returns_none_for_undated_names():
    assert _extract_layer_date("test:no_date_layer") is None
    assert _extract_layer_date("wpn:s0149_hittestress_warme_nachten_huidig") is None
    assert _extract_layer_date(None) is None


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_wms_properties", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_gcn_layers", new_callable=AsyncMock)
async def test_build_air_card_filters_sentinel_values(mock_layers, mock_sample):
    """Sentinel values (-999, -9999, 1e30) must produce unavailable, not low."""
    mock_layers.return_value = ["conc_PM25_2024", "conc_NO2_2024"]

    # PM2.5 returns sentinel -999, NO2 returns sentinel 1e30
    async def side_effect(base_url, layer, rd_x, rd_y):
        if "PM25" in layer:
            return {layer: -999}
        if "NO2" in layer:
            return {layer: 1e30}
        return None

    mock_sample.side_effect = side_effect

    card = await _build_air_card(121000.0, 487000.0, "2026-02-05")

    assert card.pm25_level == RiskLevel.unavailable
    assert card.pm25_ug_m3 is None
    assert card.no2_level == RiskLevel.unavailable
    assert card.no2_ug_m3 is None
    assert card.level == RiskLevel.unavailable


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_wms_properties", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_gcn_layers", new_callable=AsyncMock)
async def test_build_air_card_filters_sentinel_from_alt_key(mock_layers, mock_sample):
    """Sentinel values from non-layer keys should be ignored."""
    mock_layers.return_value = ["conc_PM25_2024", "conc_NO2_2024"]

    async def side_effect(base_url, layer, rd_x, rd_y):
        return {"GRAY_INDEX": -999}

    mock_sample.side_effect = side_effect

    card = await _build_air_card(121000.0, 487000.0, "2026-02-05")

    assert card.pm25_level == RiskLevel.unavailable
    assert card.pm25_ug_m3 is None
    assert card.no2_level == RiskLevel.unavailable
    assert card.no2_ug_m3 is None
    assert card.level == RiskLevel.unavailable


@pytest.mark.asyncio
@patch("app.services.risk_cards._sample_wms_properties", new_callable=AsyncMock)
@patch("app.services.risk_cards._get_alo_layers", new_callable=AsyncMock)
async def test_build_noise_card_filters_sentinel(mock_layers, mock_sample):
    """Noise sentinel values should produce unavailable."""
    mock_layers.return_value = ["rivm_20250101_Geluid_lden_wegverkeer_2022"]

    async def side_effect(base_url, layer, rd_x, rd_y):
        return {"GRAY_INDEX": -999}

    mock_sample.side_effect = side_effect

    card = await _build_noise_card(121000.0, 487000.0, "2026-02-05")

    assert card.level == RiskLevel.unavailable
    assert card.lden_db is None


# ---------------------------------------------------------------------------
# Per-card timeout tests
# ---------------------------------------------------------------------------


def test_per_card_timeout_constant_within_backend_budget():
    """Per-card timeout must fit within the 20s backend budget."""
    assert _PER_CARD_TIMEOUT_SECONDS <= 20.0
    assert _PER_CARD_TIMEOUT_SECONDS > 0


@pytest.mark.asyncio
async def test_build_card_with_timeout_returns_result_on_success():
    """When coroutine finishes in time, return the real result."""

    async def fast_coro():
        return "real_result"

    fallback = "fallback"
    result = await _build_card_with_timeout(fast_coro(), fallback, "test")
    assert result == "real_result"


@pytest.mark.asyncio
async def test_build_card_with_timeout_returns_fallback_on_timeout():
    """When coroutine exceeds timeout, return the fallback card."""
    from app.services import risk_cards

    async def slow_coro():
        await asyncio.sleep(100)  # Way longer than any timeout
        return "should_not_reach"

    fallback = "timeout_fallback"

    with patch.object(risk_cards, "_PER_CARD_TIMEOUT_SECONDS", 0.05):
        result = await _build_card_with_timeout(slow_coro(), fallback, "test")

    assert result == "timeout_fallback"


@pytest.mark.asyncio
@patch("app.services.risk_cards._build_noise_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_air_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_climate_card", new_callable=AsyncMock)
async def test_get_risk_cards_timeout_on_one_card(mock_climate, mock_air, mock_noise):
    """When one card times out, other cards still return real data."""
    from app.services import risk_cards

    # Noise will be slow (exceed timeout)
    async def slow_noise(*args, **kwargs):
        await asyncio.sleep(100)
        return NoiseRiskCard(
            level=RiskLevel.low,
            lden_db=50.0,
            source="RIVM (Dutch National Health Institute)",
            sampled_at="2026-02-05",
        )

    mock_noise.side_effect = slow_noise

    # Air and climate return normally
    mock_air.return_value = AirQualityRiskCard(
        level=RiskLevel.medium,
        pm25_ug_m3=8.0,
        no2_ug_m3=17.0,
        pm25_level=RiskLevel.medium,
        no2_level=RiskLevel.medium,
        source="RIVM GCN WMS",
        sampled_at="2026-02-05",
    )
    mock_climate.return_value = ClimateStressRiskCard(
        level=RiskLevel.high,
        heat_level=RiskLevel.high,
        water_level=RiskLevel.medium,
        source="Klimaateffectatlas WMS/WFS",
        sampled_at="2026-02-05",
    )

    with patch.object(risk_cards, "_PER_CARD_TIMEOUT_SECONDS", 0.05):
        resp = await get_risk_cards(
            vbo_id="0363010000696734",
            rd_x=121286.0,
            rd_y=487296.0,
            lat=52.372,
            lng=4.892,
        )

    # Noise card should be unavailable due to timeout
    assert resp.noise.level == RiskLevel.unavailable
    assert resp.noise.message == "NOISE_TIMEOUT"

    # Air and climate should have real data
    assert resp.air_quality.level == RiskLevel.medium
    assert resp.climate_stress.level == RiskLevel.high


@pytest.mark.asyncio
@patch("app.services.risk_cards._build_noise_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_air_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_climate_card", new_callable=AsyncMock)
async def test_get_risk_cards_all_cards_timeout(mock_climate, mock_air, mock_noise):
    """When all cards time out, all return unavailable with timeout messages."""
    from app.services import risk_cards

    async def slow(*args, **kwargs):
        await asyncio.sleep(100)

    mock_noise.side_effect = slow
    mock_air.side_effect = slow
    mock_climate.side_effect = slow

    with patch.object(risk_cards, "_PER_CARD_TIMEOUT_SECONDS", 0.05):
        resp = await get_risk_cards(
            vbo_id="0363010000696734",
            rd_x=121286.0,
            rd_y=487296.0,
            lat=52.372,
            lng=4.892,
        )

    assert resp.noise.level == RiskLevel.unavailable
    assert resp.noise.message == "NOISE_TIMEOUT"
    assert resp.air_quality.level == RiskLevel.unavailable
    assert resp.air_quality.message == "AIR_TIMEOUT"
    assert resp.climate_stress.level == RiskLevel.unavailable
    assert resp.climate_stress.message == "CLIMATE_TIMEOUT"


@pytest.mark.asyncio
@patch("app.services.risk_cards._build_noise_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_air_card", new_callable=AsyncMock)
@patch("app.services.risk_cards._build_climate_card", new_callable=AsyncMock)
async def test_severity_is_enum_not_string(mock_climate, mock_air, mock_noise):
    """Severity must be SeverityLevel enum, not a plain string (bug #21)."""
    # Card with no score (lden_db=None) → severity = unavailable enum
    mock_noise.return_value = NoiseRiskCard(
        level=RiskLevel.unavailable,
        lden_db=None,
        source="RIVM",
        sampled_at="2026-02-05",
    )
    mock_air.return_value = AirQualityRiskCard(
        level=RiskLevel.unavailable,
        source="RIVM GCN WMS",
        sampled_at="2026-02-05",
    )
    mock_climate.return_value = ClimateStressRiskCard(
        level=RiskLevel.unavailable,
        source="Klimaateffectatlas WMS/WFS",
        sampled_at="2026-02-05",
    )

    resp = await get_risk_cards(
        vbo_id="0363010000696734",
        rd_x=121286.0,
        rd_y=487296.0,
        lat=52.372,
        lng=4.892,
    )

    # All scores are None → severity must be SeverityLevel.unavailable (enum)
    assert resp.noise.severity == SeverityLevel.unavailable
    assert isinstance(resp.noise.severity, SeverityLevel)
    assert resp.air_quality.severity == SeverityLevel.unavailable
    assert isinstance(resp.air_quality.severity, SeverityLevel)
    assert resp.climate_stress.severity == SeverityLevel.unavailable
    assert isinstance(resp.climate_stress.severity, SeverityLevel)


@pytest.mark.asyncio
async def test_build_card_with_timeout_does_not_swallow_non_timeout_errors():
    """Non-timeout exceptions should propagate, not be silently caught."""

    async def error_coro():
        raise ValueError("not a timeout")

    with pytest.raises(ValueError, match="not a timeout"):
        await _build_card_with_timeout(error_coro(), "fallback", "test")
