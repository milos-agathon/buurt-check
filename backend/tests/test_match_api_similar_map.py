import pytest

from app.models.match import ConfidenceScore, Neighborhood, NeighborhoodFeatureVector
from app.services.match.map_view import build_match_map


@pytest.mark.asyncio
async def test_similar_endpoint_ranks_filtered_alternatives(client):
    response = await client.post(
        "/api/match/similar",
        json={
            "source_neighborhood_id": "nh_amsterdam_ijburg",
            "filters": {"greener": False, "cheaper": True, "calmer": False},
            "limit": 4,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["source_neighborhood_id"] == "nh_amsterdam_ijburg"
    assert body["results"]
    scores = [item["similarity_score"] for item in body["results"]]
    assert scores == sorted(scores, reverse=True)
    assert all(item["confidence"]["score"] >= 0 for item in body["results"])


@pytest.mark.asyncio
async def test_map_endpoint_returns_recommendation_geojson_with_match_scores(client):
    response = await client.get("/api/match/map?min_score=0")

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert body["features"]
    first = body["features"][0]
    assert first["geometry"]["type"] == "Point"
    assert "match_score" in first["properties"]
    assert "category" in first["properties"]
    assert "confidence" in first["properties"]
    assert "source_refs" in first["properties"]


def test_map_service_reports_missing_coordinates_without_crashing():
    neighborhoods = [
        Neighborhood(
            neighborhood_id="nh_with_coords",
            name_nl="With coords",
            municipality="Utrecht",
            geography_level="neighborhood",
            centroid_lat=52.1,
            centroid_lng=5.1,
            supported_region=True,
            mock_status="seeded_mock",
        ),
        Neighborhood(
            neighborhood_id="nh_missing_coords",
            name_nl="Missing coords",
            municipality="Utrecht",
            geography_level="neighborhood",
            supported_region=True,
            mock_status="seeded_mock",
        ),
    ]
    vectors = [
        NeighborhoodFeatureVector(
            feature_vector_id="fv_with_coords",
            neighborhood_id="nh_with_coords",
            method_version="test",
            features={"green_access": 80},
            feature_sources={"green_access": ["src_green"]},
            completeness_score=100,
            confidence=ConfidenceScore(score=80, reasons=["test"]),
        ),
        NeighborhoodFeatureVector(
            feature_vector_id="fv_missing_coords",
            neighborhood_id="nh_missing_coords",
            method_version="test",
            features={"green_access": 75},
            feature_sources={"green_access": ["src_green_missing"]},
            completeness_score=100,
            confidence=ConfidenceScore(score=80, reasons=["test"]),
        ),
    ]

    result = build_match_map(neighborhoods, vectors, min_score=0)

    assert len(result.features) == 1
    assert result.missing_coordinates[0].neighborhood_id == "nh_missing_coords"
