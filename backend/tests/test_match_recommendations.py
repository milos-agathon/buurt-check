from app.models.match import (
    ConfidenceScore,
    Neighborhood,
    NeighborhoodFeatureVector,
    PreferenceVector,
)
from app.services.match.recommendations import build_recommendation_set
from app.services.match.scoring import score_neighborhoods


def _preference(*, hard_filters: list[str] | None = None) -> PreferenceVector:
    return PreferenceVector(
        preference_vector_id="pv_recs",
        journey_intent="buy",
        hard_filters=hard_filters or [],
        lifestyle_weights={"green_space": 0.8, "mobility": 0.6, "affordability": 0.8},
        locale="en",
        method_version="preference-v1",
    )


def _neighborhood(index: int, municipality: str = "Amsterdam") -> Neighborhood:
    return Neighborhood(
        neighborhood_id=f"nh_{index:02d}",
        name_nl=f"Neighborhood {index:02d}",
        municipality=municipality,
        geography_level="neighborhood",
        supported_region=True,
        mock_status="seeded_mock",
    )


def _vector(
    index: int,
    *,
    green: int,
    mobility: int,
    affordability: int,
    availability: int = 70,
    completeness: int = 100,
    confidence: int = 80,
    missing: list[str] | None = None,
) -> NeighborhoodFeatureVector:
    features = {
        "green_access": green,
        "mobility": mobility,
        "affordability_buy": affordability,
        "housing_stock": availability,
        "listing_availability_buy": availability,
    }
    if missing:
        for key in missing:
            features[key] = None
    return NeighborhoodFeatureVector(
        feature_vector_id=f"fv_{index:02d}",
        neighborhood_id=f"nh_{index:02d}",
        method_version="test-v1",
        features=features,
        feature_sources={
            key: [f"src_{index:02d}_{key}"]
            for key, value in features.items()
            if value is not None
        },
        completeness_score=completeness,
        confidence=ConfidenceScore(score=confidence, reasons=["test confidence"]),
        missing_features=missing or [],
    )


def test_recommendation_set_selects_required_categories_and_limits():
    neighborhoods = [
        _neighborhood(i, municipality="Haarlem" if i in {4, 7, 9, 11} else "Amsterdam")
        for i in range(1, 18)
    ]
    vectors = [
        _vector(i, green=95 - i, mobility=90 - i, affordability=88 - i)
        for i in range(1, 12)
    ] + [
        _vector(12, green=92, mobility=82, affordability=35),
        _vector(13, green=90, mobility=38, affordability=86),
        _vector(14, green=88, mobility=84, affordability=82, availability=25),
        _vector(15, green=35, mobility=80, affordability=80),
        _vector(
            16,
            green=82,
            mobility=80,
            affordability=80,
            completeness=65,
            confidence=38,
            missing=["green_access"],
        ),
        _vector(17, green=28, mobility=30, affordability=35),
    ]
    scored = score_neighborhoods(_preference(hard_filters=["green_space"]), neighborhoods, vectors)

    recommendation_set = build_recommendation_set(scored, limit=10)

    assert len(recommendation_set.top) == 10
    assert 3 <= len(recommendation_set.surprising) <= 5
    assert len(recommendation_set.stretch) == 3
    assert len(recommendation_set.avoid_or_reconsider) == 3
    for recommendation in [
        *recommendation_set.top,
        *recommendation_set.surprising,
        *recommendation_set.stretch,
        *recommendation_set.avoid_or_reconsider,
    ]:
        assert recommendation.confidence.score >= 0
        assert recommendation.data_freshness_indicator
        assert (
            recommendation.why_it_fits
            or recommendation.eligibility_status == "failed_hard_filter"
        )
        assert recommendation.tradeoffs
        assert recommendation.evidence_refs


def test_empty_hard_filter_results_include_safe_relaxations_and_missing_data_state():
    neighborhoods = [_neighborhood(1), _neighborhood(2)]
    vectors = [
        _vector(1, green=35, mobility=90, affordability=88),
        _vector(
            2,
            green=20,
            mobility=86,
            affordability=92,
            completeness=70,
            confidence=42,
            missing=["green_access"],
        ),
    ]
    scored = score_neighborhoods(_preference(hard_filters=["green_space"]), neighborhoods, vectors)

    recommendation_set = build_recommendation_set(scored, limit=10)

    assert recommendation_set.top == []
    assert "green_space" in recommendation_set.empty_result_relaxations
    assert any(
        item.eligibility_status in {"failed_hard_filter", "insufficient_data"}
        for item in recommendation_set.avoid_or_reconsider
    )
    assert any(
        "missing" in tradeoff.code
        for item in recommendation_set.avoid_or_reconsider
        for tradeoff in item.tradeoffs
    )
