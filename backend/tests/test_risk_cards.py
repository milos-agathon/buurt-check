from unittest.mock import AsyncMock, patch

import pytest

from app.models.risk import AirQualityRiskCard, ClimateStressRiskCard, NoiseRiskCard, RiskLevel
from app.services.risk_cards import (
    _CLIMATE_HEAT_LAYERS,
    _CLIMATE_WATER_LAYERS,
    _build_air_card,
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
    )
    assert level == RiskLevel.high
    assert value is None
    assert signal == "Onbegaanbaar"


def test_classify_water_from_gridcode():
    level, value, signal = _classify_water_from_properties({"GRIDCODE": 2})
    assert level == RiskLevel.medium
    assert value == 2
    assert signal == "GRIDCODE"


def test_classify_water_from_klasse_20():
    level, value, signal = _classify_water_from_properties({"klasse_20": 3})
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
