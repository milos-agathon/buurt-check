from unittest.mock import AsyncMock, patch

import pytest

from app.models.risk import AirQualityRiskCard, ClimateStressRiskCard, NoiseRiskCard, RiskLevel
from app.services.risk_cards import (
    _classify_heat_from_properties,
    _classify_water_from_properties,
    _risk_from_threshold,
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
        "rivm_20180205_g_geluidkaart_lden_wegverkeer",
        "rivm_20191112_g_geluidkaart_lden_wegverkeer",
    ]
    assert _select_noise_layer(layers) == "rivm_20191112_g_geluidkaart_lden_wegverkeer"


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
