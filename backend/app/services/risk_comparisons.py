from datetime import UTC, datetime

from app.models.neighborhood import UrbanizationLevel
from app.models.risk import (
    ComparisonPattern,
    RiskCardsResponse,
    RiskComparisonRow,
    RiskComparisonsResponse,
)
from app.services.scoring import normalize_sunlight_score

_NL_BASELINES: dict[str, int] = {
    "noise": 66,
    "air_quality": 68,
    "climate_stress": 61,
    "sunlight": 63,
}

_URBAN_BASELINES: dict[str, dict[UrbanizationLevel, int]] = {
    "noise": {
        UrbanizationLevel.very_urban: 54,
        UrbanizationLevel.urban: 59,
        UrbanizationLevel.moderate: 64,
        UrbanizationLevel.rural: 71,
        UrbanizationLevel.very_rural: 76,
        UrbanizationLevel.unknown: 58,
    },
    "air_quality": {
        UrbanizationLevel.very_urban: 57,
        UrbanizationLevel.urban: 62,
        UrbanizationLevel.moderate: 67,
        UrbanizationLevel.rural: 73,
        UrbanizationLevel.very_rural: 78,
        UrbanizationLevel.unknown: 60,
    },
    "climate_stress": {
        UrbanizationLevel.very_urban: 49,
        UrbanizationLevel.urban: 53,
        UrbanizationLevel.moderate: 58,
        UrbanizationLevel.rural: 63,
        UrbanizationLevel.very_rural: 67,
        UrbanizationLevel.unknown: 52,
    },
    "sunlight": {
        UrbanizationLevel.very_urban: 52,
        UrbanizationLevel.urban: 56,
        UrbanizationLevel.moderate: 60,
        UrbanizationLevel.rural: 64,
        UrbanizationLevel.very_rural: 68,
        UrbanizationLevel.unknown: 57,
    },
}

_REFERENCE_ROW_BY_CATEGORY: dict[str, dict[str, str | int]] = {
    "noise": {
        "label_code": "who_limit",
        "value": 74,
        "benchmark_family": "who_noise_lden",
        "label_key": "risk.detail.whoNoiseGuideline",
    },
    "air_quality": {
        "label_code": "air_interim_target",
        "value": 75,
        "benchmark_family": "air_interim_target",
        "label_key": "risk.detail.airQualityTarget",
    },
    "climate_stress": {
        "label_code": "adaptation_target",
        "value": 70,
        "benchmark_family": "climate_adaptation_target",
        "label_key": "risk.detail.climateAdaptationTarget",
    },
    "sunlight": {
        "label_code": "daylight_target",
        "value": 67,
        "benchmark_family": "daylight_target",
        "label_key": "risk.detail.daylightTarget",
    },
}

_SOURCE_CITY = "CBS urbanization profile + Buurt-Check benchmark model"
_SOURCE_NL = "Buurt-Check nationwide baseline model"
_SOURCE_THRESHOLD = "WHO/EU + Buurt-Check target mapping"
_SOURCE_DATE = "2026-02-10"


def _clamp_score(value: int) -> int:
    return max(0, min(100, value))


def _address_score(cards: RiskCardsResponse, category: str) -> int | None:
    if category == "noise":
        return cards.noise.score
    if category == "air_quality":
        return cards.air_quality.score
    if category == "climate_stress":
        return cards.climate_stress.score
    if cards.sunlight is not None:
        if cards.sunlight.score is not None:
            return cards.sunlight.score
        if cards.sunlight.winter_hours is not None:
            return normalize_sunlight_score(cards.sunlight.winter_hours)
    return None


def _build_rows(
    category: str,
    cards: RiskCardsResponse,
    urbanization: UrbanizationLevel,
) -> list[RiskComparisonRow]:
    reference = _REFERENCE_ROW_BY_CATEGORY[category]
    city_value = _URBAN_BASELINES[category][urbanization]
    nl_value = _NL_BASELINES[category]
    rows = [
        RiskComparisonRow(
            label_code="city_avg",
            value=_clamp_score(city_value),
            source=_SOURCE_CITY,
            source_date=_SOURCE_DATE,
            role="peer",
            benchmark_family="urbanization_peer",
            label_key="risk.detail.peerUrbanization",
            scope="urbanization_peer",
        ),
        RiskComparisonRow(
            label_code="nl_avg",
            value=_clamp_score(nl_value),
            source=_SOURCE_NL,
            source_date=_SOURCE_DATE,
            role="national",
            benchmark_family="national_model",
            label_key="risk.detail.nationalBaseline",
            scope="national",
        ),
        RiskComparisonRow(
            label_code=str(reference["label_code"]),
            value=_clamp_score(int(reference["value"])),
            pattern=ComparisonPattern.dashed,
            source=_SOURCE_THRESHOLD,
            source_date=_SOURCE_DATE,
            role="reference",
            benchmark_family=str(reference["benchmark_family"]),
            label_key=str(reference["label_key"]),
            scope="reference",
        ),
    ]
    address_value = _address_score(cards, category)
    if address_value is not None:
        rows.append(
            RiskComparisonRow(
                label_code="address",
                value=_clamp_score(address_value),
                role="address",
                benchmark_family="address_score",
                label_key="risk.detail.address",
                scope="address",
            )
        )
    return rows


def build_risk_comparisons(
    vbo_id: str,
    cards: RiskCardsResponse,
    urbanization: UrbanizationLevel = UrbanizationLevel.unknown,
) -> RiskComparisonsResponse:
    return RiskComparisonsResponse(
        address_id=vbo_id,
        noise=_build_rows("noise", cards, urbanization),
        air_quality=_build_rows("air_quality", cards, urbanization),
        climate_stress=_build_rows("climate_stress", cards, urbanization),
        sunlight=_build_rows("sunlight", cards, urbanization),
        generated_at=datetime.now(UTC).date().isoformat(),
    )
