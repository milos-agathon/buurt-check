import pytest
from pydantic import ValidationError

from app.models.match import (
    ConfidenceScore,
    Neighborhood,
    NeighborhoodFeatureVector,
    PreferenceVector,
)
from app.services.match.scoring import PROTECTED_TRAIT_FIELDS, score_neighborhoods


def _preference(
    *,
    weights: dict[str, float] | None = None,
    hard_filters: list[str] | None = None,
    avoid_signals: list[str] | None = None,
) -> PreferenceVector:
    return PreferenceVector(
        preference_vector_id="pv_test",
        journey_intent="buy",
        budget_max_cents=60000000,
        property_types=["apartment"],
        hard_filters=hard_filters or [],
        avoid_signals=avoid_signals or [],
        lifestyle_weights=weights
        or {
            "green_space": 0.7,
            "mobility": 0.5,
            "affordability": 0.8,
            "calmness": 0.3,
        },
        locale="en",
        method_version="preference-v1",
    )


def _neighborhood(neighborhood_id: str, name: str) -> Neighborhood:
    return Neighborhood(
        neighborhood_id=neighborhood_id,
        name_nl=name,
        municipality="Amsterdam",
        geography_level="neighborhood",
        supported_region=True,
        mock_status="seeded_mock",
    )


def _vector(
    neighborhood_id: str,
    features: dict[str, float | None],
    *,
    completeness: int = 100,
    confidence: int = 80,
    missing: list[str] | None = None,
    stale: list[str] | None = None,
) -> NeighborhoodFeatureVector:
    return NeighborhoodFeatureVector(
        feature_vector_id=f"fv_{neighborhood_id}",
        neighborhood_id=neighborhood_id,
        method_version="test-v1",
        features=features,
        feature_sources={
            key: [f"src_{neighborhood_id}_{key}"]
            for key, value in features.items()
            if value is not None
        },
        completeness_score=completeness,
        confidence=ConfidenceScore(score=confidence, reasons=["test confidence"]),
        missing_features=missing or [],
        stale_features=stale or [],
    )


def test_scoring_applies_hard_filter_eligibility_and_component_formula():
    preference = _preference(hard_filters=["green_space"], avoid_signals=["high_traffic"])
    neighborhoods = [_neighborhood("nh_good", "Good"), _neighborhood("nh_fail", "Fail")]
    vectors = [
        _vector(
            "nh_good",
            {
                "green_access": 85,
                "mobility": 70,
                "affordability_buy": 75,
                "housing_stock": 65,
                "listing_availability_buy": 60,
                "environmental_quality": 80,
            },
        ),
        _vector(
            "nh_fail",
            {
                "green_access": 42,
                "mobility": 95,
                "affordability_buy": 95,
                "housing_stock": 85,
                "listing_availability_buy": 90,
                "environmental_quality": 90,
            },
        ),
    ]

    scores = score_neighborhoods(preference, neighborhoods, vectors)
    by_id = {score.neighborhood_id: score for score in scores}

    assert by_id["nh_good"].eligibility_status == "eligible"
    assert by_id["nh_good"].fit_score == 73
    assert by_id["nh_fail"].eligibility_status == "failed_hard_filter"
    assert "green_space" in by_id["nh_fail"].failed_filters
    assert by_id["nh_fail"].fit_score < by_id["nh_good"].fit_score


def test_weight_changes_alter_ranking_deterministically():
    neighborhoods = [_neighborhood("nh_green", "Green"), _neighborhood("nh_connected", "Connected")]
    vectors = [
        _vector(
            "nh_green",
            {"green_access": 95, "mobility": 45, "affordability_buy": 55, "housing_stock": 65},
        ),
        _vector(
            "nh_connected",
            {"green_access": 45, "mobility": 95, "affordability_buy": 70, "housing_stock": 65},
        ),
    ]

    green_first = score_neighborhoods(
        _preference(weights={"green_space": 1.0, "mobility": 0.1, "affordability": 0.2}),
        neighborhoods,
        vectors,
    )
    mobility_first = score_neighborhoods(
        _preference(weights={"green_space": 0.1, "mobility": 1.0, "affordability": 0.2}),
        neighborhoods,
        vectors,
    )

    assert [score.neighborhood_id for score in green_first][:2] == ["nh_green", "nh_connected"]
    assert [score.neighborhood_id for score in mobility_first][:2] == [
        "nh_connected",
        "nh_green",
    ]


def test_confidence_and_missing_data_reduce_score_without_silent_fill():
    neighborhoods = [_neighborhood("nh_sparse", "Sparse")]
    vectors = [
        _vector(
            "nh_sparse",
            {
                "green_access": 90,
                "mobility": None,
                "affordability_buy": 80,
                "housing_stock": 75,
            },
            completeness=75,
            confidence=48,
            missing=["mobility"],
            stale=["affordability_buy"],
        )
    ]

    score = score_neighborhoods(_preference(weights={"mobility": 1.0}), neighborhoods, vectors)[0]

    assert score.eligibility_status == "insufficient_data"
    assert score.confidence.score < 45
    assert any("missing" in tradeoff.code for tradeoff in score.tradeoffs)
    assert all(driver.feature != "mobility" for driver in score.score_drivers)


def test_protected_trait_inputs_are_not_supported_score_features():
    assert {"nationality", "ethnicity", "religion", "immigration_status"} <= PROTECTED_TRAIT_FIELDS

    with pytest.raises(ValidationError, match="unsupported lifestyle weight"):
        _preference(weights={"nationality": 1.0})

    preference = _preference(weights={"green_space": 1.0})
    neighborhoods = [_neighborhood("nh_any", "Any")]
    vectors = [_vector("nh_any", {"green_access": 70, "mobility": 70, "affordability_buy": 70})]

    score = score_neighborhoods(preference, neighborhoods, vectors)[0]

    assert score.score_drivers
    assert all(driver.feature not in PROTECTED_TRAIT_FIELDS for driver in score.score_drivers)


def test_explanation_drivers_match_weighted_score_drivers():
    preference = _preference(weights={"green_space": 1.0, "mobility": 0.8, "affordability": 0.1})
    neighborhoods = [_neighborhood("nh_match", "Match")]
    vectors = [_vector("nh_match", {"green_access": 90, "mobility": 82, "affordability_buy": 45})]

    score = score_neighborhoods(preference, neighborhoods, vectors)[0]

    driver_features = {driver.feature for driver in score.score_drivers[:2]}
    why_codes = {item.code for item in score.why_it_fits}
    assert driver_features == {"green_access", "mobility"}
    assert why_codes == {"green_access_match", "mobility_match"}
    assert all(item.evidence_refs for item in score.why_it_fits)
