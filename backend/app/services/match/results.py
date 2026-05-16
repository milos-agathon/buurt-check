from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from app.models.match import (
    ConfidenceLabel,
    DataFreshnessStatus,
    MatchGeometryReference,
    MatchResultConfidence,
    MatchResultRecommendation,
    MatchResultsMap,
    MatchResultSourceMetadata,
    MatchResultsResponse,
    MetricSource,
    Neighborhood,
    NeighborhoodMatchScore,
    RecommendationSet,
)

NETHERLANDS_BBOX_WGS84 = [3.2, 50.7, 7.3, 53.6]
NETHERLANDS_CENTER_WGS84 = {"lat": 52.2, "lng": 5.3}
REASON_CODE_PREFIX = "match.results.reasons."
TRADEOFF_CODE_PREFIX = "match.results.tradeoffs."
SOURCE_NAME_KEY_BY_TYPE = {
    "official": "match.results.sources.official",
    "commercial": "match.results.sources.commercial",
    "derived": "match.results.sources.derived",
    "mock": "match.results.sources.seedMock",
    "user_provided": "match.results.sources.userProvided",
    "missing": "match.results.sources.unavailable",
}


def result_set_id() -> str:
    return f"mrs_{uuid4().hex[:12]}"


def utc_now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def json_dumps(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def json_loads(value: str | None, fallback: object) -> object:
    if not value:
        return fallback
    return json.loads(value)


def _confidence_level(label: ConfidenceLabel | None, score: int) -> str:
    if score >= 80:
        return "high"
    if score >= 50:
        return "medium"
    if score >= 20:
        return "low"
    return "insufficient"


def _result_key(prefix: str, code: str) -> str:
    if code.startswith(prefix):
        return code
    return f"{prefix}{code}"


def _neighborhood_lookup(neighborhoods: list[Neighborhood]) -> dict[str, Neighborhood]:
    return {item.neighborhood_id: item for item in neighborhoods}


def _geometry_ref(
    score: NeighborhoodMatchScore,
    neighborhood: Neighborhood,
) -> MatchGeometryReference:
    x = float(neighborhood.centroid_rd_x or 155000.0)
    y = float(neighborhood.centroid_rd_y or 463000.0)
    lat = float(neighborhood.centroid_lat or 52.2)
    lng = float(neighborhood.centroid_lng or 5.3)
    bounds_rd = [x - 800.0, y - 800.0, x + 800.0, y + 800.0]
    display_bounds = [lng - 0.012, lat - 0.008, lng + 0.012, lat + 0.008]
    return MatchGeometryReference(
        centroid_rd={"x": x, "y": y},
        bounds_rd=bounds_rd,
        display_centroid_wgs84={"lat": lat, "lng": lng},
        display_bounds_wgs84=display_bounds,
        boundary_ref=neighborhood.geometry_ref or f"boundary_{score.neighborhood_id}",
        building_layer_ref=f"buildings_{score.neighborhood_id}",
        building_layer_available=False,
        amenity_layer_refs=[f"amenities_{score.neighborhood_id}"],
        limitations=["match.results.limitations.mock_data"],
    )


def _fit_label_key(fit_score: int) -> str:
    if fit_score >= 80:
        return "matchFirst.results.fitLabel.strong"
    if fit_score >= 65:
        return "matchFirst.results.fitLabel.good"
    if fit_score >= 50:
        return "matchFirst.results.fitLabel.possible"
    return "matchFirst.results.fitLabel.low"


def _source_limitation_keys(source: MetricSource | None) -> list[str]:
    if source is None:
        return ["match.results.limitations.source_metadata_unavailable"]

    limitations: set[str] = set()
    if source.source_type == "mock":
        limitations.add("match.results.limitations.seed_mock_feature_matrix")
    if (
        source.source_type == "missing"
        or source.freshness_status == DataFreshnessStatus.unavailable
    ):
        limitations.add("match.results.limitations.source_metadata_unavailable")
    if source.freshness_status == DataFreshnessStatus.stale:
        limitations.add("match.results.limitations.stale_source_metric")
    if not limitations:
        limitations.add("match.results.limitations.source_metadata_limited")
    return sorted(limitations)


def _source_metadata(
    source_refs: list[str],
    *,
    source_metadata_by_id: dict[str, MetricSource],
) -> list[MatchResultSourceMetadata]:
    items: list[MatchResultSourceMetadata] = []
    for source_id in sorted(set(source_refs)):
        source = source_metadata_by_id.get(source_id)
        if source is None:
            items.append(
                MatchResultSourceMetadata(
                    source_id=source_id,
                    source_type="missing",
                    source_name_key="match.results.sources.unavailable",
                    metric_keys=[],
                    measurement_date=None,
                    retrieved_at=None,
                    freshness_status=DataFreshnessStatus.unavailable,
                    confidence=0,
                    limitations=_source_limitation_keys(None),
                )
            )
            continue
        items.append(
            MatchResultSourceMetadata(
                source_id=source.source_id,
                source_type=source.source_type,
                source_name_key=SOURCE_NAME_KEY_BY_TYPE[source.source_type],
                metric_keys=[source.metric_name],
                measurement_date=source.measurement_date,
                retrieved_at=source.retrieved_at,
                freshness_status=source.freshness_status,
                confidence=source.confidence,
                limitations=_source_limitation_keys(source),
            )
        )
    return items


def _to_result_recommendation(
    score: NeighborhoodMatchScore,
    *,
    rank: int,
    neighborhoods: dict[str, Neighborhood],
    source_metadata_by_id: dict[str, MetricSource],
) -> MatchResultRecommendation:
    neighborhood = neighborhoods[score.neighborhood_id]
    source_refs = score.source_refs or ["seed_match_source"]
    reason_codes = [
        _result_key(REASON_CODE_PREFIX, item.code)
        for item in score.why_it_fits
    ] or [f"{REASON_CODE_PREFIX}review_source_limitations"]
    tradeoff_codes = [
        _result_key(TRADEOFF_CODE_PREFIX, item.code)
        for item in score.tradeoffs
    ] or [f"{TRADEOFF_CODE_PREFIX}review_source_limitations"]
    return MatchResultRecommendation(
        rank=rank,
        recommendation_id=score.recommendation_id,
        neighborhood_id=score.neighborhood_id,
        name=score.name,
        municipality=score.municipality,
        fit_score=score.fit_score,
        fit_label_key=_fit_label_key(score.fit_score),
        category=score.category or "top",
        eligibility_status=score.eligibility_status,
        confidence=MatchResultConfidence(
            score=score.confidence.score,
            level=_confidence_level(score.confidence.label, score.confidence.score),  # type: ignore[arg-type]
            reasons=score.confidence.reasons,
        ),
        reason_codes=reason_codes,
        tradeoffs=tradeoff_codes,
        component_scores=score.component_scores,
        matched_preferences=[driver.feature for driver in score.score_drivers[:3]],
        failed_filters=score.failed_filters,
        source_refs=source_refs,
        source_metadata=_source_metadata(
            source_refs,
            source_metadata_by_id=source_metadata_by_id,
        ),
        limitations=["match.results.limitations.mock_data"],
        freshness_status=score.freshness_status,
        geometry_ref=_geometry_ref(score, neighborhood),
        amenity_refs=[f"amenities_{score.neighborhood_id}"],
    )


def _unique(items: list[NeighborhoodMatchScore]) -> list[NeighborhoodMatchScore]:
    seen: set[str] = set()
    unique: list[NeighborhoodMatchScore] = []
    for item in items:
        if item.neighborhood_id in seen:
            continue
        seen.add(item.neighborhood_id)
        unique.append(item)
    return unique


def _map_features(results: list[MatchResultRecommendation]) -> list[dict[str, object]]:
    features: list[dict[str, object]] = []
    for item in results:
        centroid = item.geometry_ref.display_centroid_wgs84
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [centroid["lng"], centroid["lat"]],
                },
                "properties": {
                    "recommendation_id": item.recommendation_id,
                    "neighborhood_id": item.neighborhood_id,
                    "rank": item.rank,
                    "fit_score": item.fit_score,
                    "category": item.category,
                },
            }
        )
    return features


def serialize_match_results(
    *,
    session_id: str,
    job_id: str,
    result_set_id_value: str,
    preference_vector_id: str,
    preference_vector_version: str,
    status: str,
    recommendations: RecommendationSet,
    neighborhoods: list[Neighborhood],
    data_version: str,
    runtime_ms: int = 0,
    candidate_count: int = 0,
    scored_candidate_count: int = 0,
    fallback_used: bool = False,
    fallback_reason_code: str | None = None,
    generated_at: datetime | None = None,
    source_metadata_by_id: dict[str, MetricSource] | None = None,
) -> MatchResultsResponse:
    generated = generated_at or utc_now()
    neighborhood_by_id = _neighborhood_lookup(neighborhoods)
    source_metadata_lookup = source_metadata_by_id or {}
    ranked_scores = _unique(
        [
            *recommendations.top,
            *recommendations.surprising,
        ]
    )
    stretch_scores = _unique(recommendations.stretch)
    near_miss_scores = _unique(recommendations.avoid_or_reconsider)
    ranked_results = [
        _to_result_recommendation(
            score,
            rank=rank,
            neighborhoods=neighborhood_by_id,
            source_metadata_by_id=source_metadata_lookup,
        )
        for rank, score in enumerate(ranked_scores, start=1)
        if score.eligibility_status != "failed_hard_filter"
    ]
    stretch_matches = [
        _to_result_recommendation(
            score,
            rank=rank,
            neighborhoods=neighborhood_by_id,
            source_metadata_by_id=source_metadata_lookup,
        )
        for rank, score in enumerate(stretch_scores, start=1)
        if score.eligibility_status != "failed_hard_filter"
    ]
    excluded_ids = {
        *{item.neighborhood_id for item in ranked_results},
        *{item.neighborhood_id for item in stretch_matches},
    }
    near_misses = [
        _to_result_recommendation(
            score,
            rank=rank,
            neighborhoods=neighborhood_by_id,
            source_metadata_by_id=source_metadata_lookup,
        )
        for rank, score in enumerate(near_miss_scores, start=1)
        if score.neighborhood_id not in excluded_ids
    ]
    result_map = MatchResultsMap(
        display_bounds_wgs84=NETHERLANDS_BBOX_WGS84,
        features=_map_features(ranked_results),
    )
    return MatchResultsResponse(
        session_id=session_id,
        job_id=job_id,
        result_set_id=result_set_id_value,
        preference_vector_version=preference_vector_version,
        status=status,  # type: ignore[arg-type]
        generated_at=generated,
        runtime_ms=runtime_ms,
        data_version=data_version,
        fallback_used=fallback_used,
        fallback_reason_code=fallback_reason_code,
        ranked_results=ranked_results,
        recommendations=ranked_results,
        stretch_matches=stretch_matches,
        near_misses=near_misses,
        normal_recommendation_count=len(ranked_results),
        candidate_count=candidate_count,
        scored_candidate_count=scored_candidate_count,
        empty_state_code=None if ranked_results else "match.recommendations.empty",
        map_center=NETHERLANDS_CENTER_WGS84,
        bbox=NETHERLANDS_BBOX_WGS84,
        map=result_map,
    )
