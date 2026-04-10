from unittest.mock import AsyncMock, patch

import pytest

from app.models.neighborhood import (
    AgeProfile,
    NeighborhoodIndicator,
    NeighborhoodStats,
    NeighborhoodStatsResponse,
    UrbanizationLevel,
)
from app.models.risk import (
    AirQualityRiskCard,
    ClimateStressRiskCard,
    NoiseRiskCard,
    RiskCardsResponse,
    RiskLevel,
    SeverityLevel,
    SunlightRiskCard,
)
from app.services.risk_comparisons import build_risk_comparisons


def _sample_risk_cards() -> RiskCardsResponse:
    return RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.medium,
            lden_db=58.0,
            source="RIVM",
            sampled_at="2026-02-10",
            score=56,
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.low,
            pm25_level=RiskLevel.low,
            no2_level=RiskLevel.low,
            source="RIVM GCN",
            sampled_at="2026-02-10",
            score=74,
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.medium,
            heat_level=RiskLevel.medium,
            water_level=RiskLevel.low,
            source="Klimaateffectatlas",
            sampled_at="2026-02-10",
            score=52,
        ),
        sunlight=SunlightRiskCard(
            level=SeverityLevel.moderate,
            source="3DBAG + SunCalc",
            winter_hours=2.7,
            score=45,
        ),
    )


def test_build_risk_comparisons_uses_urbanization_profile():
    result = build_risk_comparisons(
        vbo_id="0363010000696734",
        cards=_sample_risk_cards(),
        urbanization=UrbanizationLevel.very_urban,
    )
    assert result.address_id == "0363010000696734"
    assert result.noise[0].label_code == "city_avg"
    assert result.noise[0].value == 54
    assert result.noise[0].role == "peer"
    assert result.noise[0].benchmark_family == "urbanization_peer"
    assert result.noise[0].label_key == "risk.detail.peerUrbanization"
    assert result.noise[0].scope == "urbanization_peer"
    assert result.noise[1].label_code == "nl_avg"
    assert result.noise[1].role == "national"
    assert result.noise[1].benchmark_family == "national_model"
    assert result.noise[2].label_code == "who_limit"
    assert result.noise[2].role == "reference"
    assert result.noise[2].benchmark_family == "who_noise_lden"
    assert result.noise[-1].label_code == "address"
    assert result.noise[-1].role == "address"
    assert result.noise[-1].value == 56
    assert result.air_quality[2].label_code == "air_interim_target"
    assert result.air_quality[2].value == 75
    assert result.air_quality[2].benchmark_family == "air_interim_target"
    assert "who" not in result.air_quality[2].label_key.lower()
    assert result.climate_stress[2].label_code == "adaptation_target"
    assert result.climate_stress[2].benchmark_family == "climate_adaptation_target"
    assert result.sunlight[2].label_code == "daylight_target"
    assert result.sunlight[2].benchmark_family == "daylight_target"


def test_build_risk_comparisons_sunlight_falls_back_to_winter_hours():
    cards = _sample_risk_cards()
    cards.sunlight = SunlightRiskCard(
        level=SeverityLevel.moderate,
        source="3DBAG + SunCalc",
        winter_hours=3.0,
        score=None,
    )
    result = build_risk_comparisons(
        vbo_id="0363010000696734",
        cards=cards,
        urbanization=UrbanizationLevel.unknown,
    )
    assert result.sunlight[-1].label_code == "address"
    assert result.sunlight[-1].value == 50


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, side_effect=[None, None])
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.cbs")
@patch("app.api.address.risk_cards")
async def test_risk_comparisons_endpoint(
    mock_risk_cards,
    mock_cbs,
    mock_cache_set,
    mock_cache_get,
    client,
):
    mock_risk_cards.get_risk_cards = AsyncMock(return_value=_sample_risk_cards())
    mock_cbs.get_neighborhood_stats = AsyncMock(
        return_value=NeighborhoodStatsResponse(
            address_id="0363010000696734",
            stats=NeighborhoodStats(
                buurt_code="BU0363AD07",
                buurt_name="Centrum-Oost",
                gemeente_name="Amsterdam",
                population_density=NeighborhoodIndicator(value=15000),
                avg_household_size=NeighborhoodIndicator(value=1.8),
                single_person_pct=NeighborhoodIndicator(value=55.0),
                age_profile=AgeProfile(age_0_24=18, age_25_64=65, age_65_plus=17),
                owner_occupied_pct=NeighborhoodIndicator(value=35.0),
                avg_property_value=NeighborhoodIndicator(value=520000),
                distance_to_train_km=NeighborhoodIndicator(value=0.8),
                distance_to_supermarket_km=NeighborhoodIndicator(value=0.3),
                urbanization=UrbanizationLevel.very_urban,
            ),
        )
    )

    resp = await client.get(
        "/api/address/0363010000696734/risk-comparisons",
        params={
            "rd_x": "121286.0",
            "rd_y": "487296.0",
            "lat": "52.372",
            "lng": "4.892",
            "buurt_code": "BU0363AD07",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["noise"][0]["label_code"] == "city_avg"
    assert data["noise"][0]["value"] == 54
    assert data["noise"][0]["role"] == "peer"
    assert data["noise"][0]["label_key"] == "risk.detail.peerUrbanization"
    assert data["air_quality"][2]["label_code"] == "air_interim_target"
    assert data["air_quality"][2]["benchmark_family"] == "air_interim_target"
    assert data["air_quality"][-1]["label_code"] == "address"
    assert data["air_quality"][-1]["value"] == 74
    assert data["climate_stress"][2]["label_code"] == "adaptation_target"
    assert data["sunlight"][-1]["value"] == 45
    mock_cache_set.assert_called_once()
