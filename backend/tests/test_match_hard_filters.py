from app.models.match import (
    ConfidenceScore,
    Neighborhood,
    NeighborhoodFeatureVector,
    PreferenceVector,
)
from app.services.match.recommendations import build_recommendation_set
from app.services.match.scoring import score_neighborhoods


def _preference() -> PreferenceVector:
    return PreferenceVector(
        preference_vector_id="pv_filters",
        journey_intent="buy",
        budget_max_cents=65000000,
        hard_filters=["green_space", "mobility"],
        lifestyle_weights={"green_space": 0.6, "mobility": 0.4, "affordability": 0.2},
        property_types=["row_house"],
        locale="en",
        method_version="preference-vector-test",
    )


def _neighborhood(neighborhood_id: str, name: str) -> Neighborhood:
    return Neighborhood(
        neighborhood_id=neighborhood_id,
        name_nl=name,
        municipality="Utrecht",
        geography_level="neighborhood",
        supported_region=True,
        mock_status="seeded_mock",
    )


def _vector(neighborhood_id: str, features: dict[str, float | None]) -> NeighborhoodFeatureVector:
    return NeighborhoodFeatureVector(
        feature_vector_id=f"fv_{neighborhood_id}",
        neighborhood_id=neighborhood_id,
        method_version="test-v1",
        features=features,
        feature_sources={key: [f"src_{key}"] for key, value in features.items() if value},
        completeness_score=100,
        confidence=ConfidenceScore(score=80, reasons=["test"]),
    )


def test_hard_filter_failures_are_separated_from_ranked_top_matches():
    scores = score_neighborhoods(
        _preference(),
        [_neighborhood("nh_ok", "OK"), _neighborhood("nh_fail", "Fail")],
        [
            _vector(
                "nh_ok",
                {
                    "green_access": 80,
                    "mobility": 75,
                    "affordability_buy": 70,
                    "housing_stock": 65,
                    "listing_availability_buy": 64,
                },
            ),
            _vector(
                "nh_fail",
                {
                    "green_access": 35,
                    "mobility": 85,
                    "affordability_buy": 92,
                    "housing_stock": 90,
                    "listing_availability_buy": 88,
                },
            ),
        ],
    )

    recommendations = build_recommendation_set(scores)

    assert [item.neighborhood_id for item in recommendations.top] == ["nh_ok"]
    assert all(item.eligibility_status == "eligible" for item in recommendations.top)
    assert recommendations.avoid_or_reconsider
    assert recommendations.avoid_or_reconsider[0].neighborhood_id == "nh_fail"
    assert recommendations.avoid_or_reconsider[0].eligibility_status == "failed_hard_filter"


def test_budget_commute_and_intent_hard_filters_use_feature_matrix_signals():
    scores = score_neighborhoods(
        PreferenceVector(
            preference_vector_id="pv_generic_filters",
            journey_intent="buy",
            hard_filters=["intent:buy", "budget", "commute"],
            lifestyle_weights={"mobility": 0.6, "affordability": 0.4},
            property_types=["row_house"],
            locale="en",
            method_version="preference-vector-test",
        ),
        [
            _neighborhood("nh_pass", "Pass"),
            _neighborhood("nh_budget_fail", "Budget Fail"),
        ],
        [
            _vector(
                "nh_pass",
                {
                    "listing_availability_buy": 75,
                    "affordability_buy": 72,
                    "mobility": 82,
                    "housing_stock": 70,
                },
            ),
            _vector(
                "nh_budget_fail",
                {
                    "listing_availability_buy": 78,
                    "affordability_buy": 40,
                    "mobility": 86,
                    "housing_stock": 74,
                },
            ),
        ],
    )

    by_id = {score.neighborhood_id: score for score in scores}

    assert by_id["nh_pass"].eligibility_status == "eligible"
    assert by_id["nh_pass"].failed_filters == []
    assert by_id["nh_budget_fail"].eligibility_status == "failed_hard_filter"
    assert by_id["nh_budget_fail"].failed_filters == ["budget"]


def test_every_feature_matrix_candidate_receives_score_and_filter_status():
    neighborhoods = [
        _neighborhood("nh_best", "Best"),
        _neighborhood("nh_stretch", "Stretch"),
        _neighborhood("nh_fail", "Fail"),
    ]
    feature_vectors = [
        _vector(
            "nh_best",
            {
                "green_access": 90,
                "mobility": 88,
                "affordability_buy": 80,
                "housing_stock": 82,
                "listing_availability_buy": 77,
            },
        ),
        _vector(
            "nh_stretch",
            {
                "green_access": 65,
                "mobility": 62,
                "affordability_buy": 44,
                "housing_stock": 45,
                "listing_availability_buy": 42,
            },
        ),
        _vector(
            "nh_fail",
            {
                "green_access": 35,
                "mobility": 70,
                "affordability_buy": 80,
                "housing_stock": 75,
                "listing_availability_buy": 72,
            },
        ),
    ]

    scores = score_neighborhoods(_preference(), neighborhoods, feature_vectors)

    assert {score.neighborhood_id for score in scores} == {
        vector.neighborhood_id for vector in feature_vectors
    }
    assert all(score.fit_score >= 0 for score in scores)
    assert all(score.tradeoffs for score in scores)
    assert all(score.confidence.score >= 0 for score in scores)
    assert {score.eligibility_status for score in scores} >= {
        "eligible",
        "stretch",
        "failed_hard_filter",
    }
