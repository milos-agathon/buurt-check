from app.models.match import ConfidenceScore, Neighborhood, NeighborhoodFeatureVector
from app.services.match.similarity import PROTECTED_SIMILARITY_FIELDS, find_similar_neighborhoods


def _neighborhood(neighborhood_id: str, name: str) -> Neighborhood:
    return Neighborhood(
        neighborhood_id=neighborhood_id,
        name_nl=name,
        municipality="Utrecht",
        geography_level="neighborhood",
        supported_region=True,
        mock_status="seeded_mock",
    )


def _vector(
    neighborhood_id: str,
    features: dict[str, float | None],
    *,
    confidence: int = 80,
    completeness: int = 100,
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
        missing_features=[key for key, value in features.items() if value is None],
    )


def test_similar_neighborhood_search_returns_distance_reasons_and_filters():
    neighborhoods = [
        _neighborhood("nh_source", "Source"),
        _neighborhood("nh_match", "Match"),
        _neighborhood("nh_too_expensive", "Too expensive"),
        _neighborhood("nh_far", "Far"),
    ]
    vectors = [
        _vector(
            "nh_source",
            {"green_access": 70, "calmness": 72, "mobility": 75, "affordability_buy": 50},
        ),
        _vector(
            "nh_match",
            {"green_access": 74, "calmness": 78, "mobility": 72, "affordability_buy": 68},
        ),
        _vector(
            "nh_too_expensive",
            {"green_access": 72, "calmness": 74, "mobility": 75, "affordability_buy": 35},
        ),
        _vector(
            "nh_far",
            {"green_access": 98, "calmness": 20, "mobility": 30, "affordability_buy": 95},
        ),
    ]

    results = find_similar_neighborhoods(
        "nh_source",
        neighborhoods,
        vectors,
        filters={"cheaper": True, "calmer": True},
        limit=3,
    )

    assert [result.neighborhood_id for result in results] == ["nh_match"]
    assert results[0].similarity_score >= 80
    assert {"green_access", "mobility"} <= {driver.feature for driver in results[0].shared_drivers}
    assert results[0].meaningful_differences
    assert results[0].confidence.score >= 70


def test_similarity_excludes_protected_traits_and_marks_sparse_data():
    assert {
        "ethnicity",
        "religion",
        "nationality",
        "immigration_status",
    } <= PROTECTED_SIMILARITY_FIELDS
    neighborhoods = [_neighborhood("nh_source", "Source"), _neighborhood("nh_sparse", "Sparse")]
    vectors = [
        _vector("nh_source", {"green_access": 80, "mobility": 80, "affordability_buy": 60}),
        _vector(
            "nh_sparse",
            {"green_access": 82, "mobility": None, "affordability_buy": 62},
            confidence=40,
            completeness=67,
        ),
    ]

    results = find_similar_neighborhoods("nh_source", neighborhoods, vectors, limit=1)

    assert results[0].neighborhood_id == "nh_sparse"
    assert results[0].confidence.score < 50
    assert any("missing" in constraint.code for constraint in results[0].constraints)
    assert all(
        driver.feature not in PROTECTED_SIMILARITY_FIELDS
        for driver in [*results[0].shared_drivers, *results[0].meaningful_differences]
    )
