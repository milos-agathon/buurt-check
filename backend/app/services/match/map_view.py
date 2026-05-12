from __future__ import annotations

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    MapMissingCoordinate,
    MatchMapFeature,
    MatchMapFeatureGeometry,
    MatchMapFeatureProperties,
    MatchMapResponse,
    Neighborhood,
    NeighborhoodFeatureVector,
)


def _score(vector: NeighborhoodFeatureVector) -> int:
    values = [value for value in vector.features.values() if value is not None]
    return round(sum(values) / len(values)) if values else 0


def _category(score: int) -> str:
    if score >= 75:
        return "top"
    if score >= 60:
        return "surprising"
    if score >= 45:
        return "stretch"
    return "avoid_or_reconsider"


def _freshness(vector: NeighborhoodFeatureVector) -> DataFreshnessStatus:
    if vector.missing_features:
        return DataFreshnessStatus.unavailable
    if vector.stale_features:
        return DataFreshnessStatus.stale
    return DataFreshnessStatus.mock


def _source_refs(vector: NeighborhoodFeatureVector) -> list[str]:
    return sorted(
        {
            source_ref
            for source_refs in vector.feature_sources.values()
            for source_ref in source_refs
        }
    )


def _bounds(features: list[MatchMapFeature]) -> list[float]:
    if not features:
        return [3.2, 50.7, 7.3, 53.6]
    lngs = [feature.geometry.coordinates[0] for feature in features]
    lats = [feature.geometry.coordinates[1] for feature in features]
    return [min(lngs), min(lats), max(lngs), max(lats)]


def build_match_map(
    neighborhoods: list[Neighborhood],
    feature_vectors: list[NeighborhoodFeatureVector],
    *,
    category: str | None = None,
    min_score: int = 0,
) -> MatchMapResponse:
    neighborhoods_by_id = {item.neighborhood_id: item for item in neighborhoods}
    features: list[MatchMapFeature] = []
    missing_coordinates: list[MapMissingCoordinate] = []
    unsupported_regions: list[str] = []

    for vector in feature_vectors:
        neighborhood = neighborhoods_by_id.get(vector.neighborhood_id)
        if neighborhood is None:
            continue
        if not neighborhood.supported_region:
            unsupported_regions.append(neighborhood.neighborhood_id)
            continue
        score = _score(vector)
        item_category = _category(score)
        if category and item_category != category:
            continue
        if score < min_score:
            continue
        name = neighborhood.name_en or neighborhood.name_nl
        if neighborhood.centroid_lng is None or neighborhood.centroid_lat is None:
            missing_coordinates.append(
                MapMissingCoordinate(neighborhood_id=neighborhood.neighborhood_id, name=name)
            )
            continue
        features.append(
            MatchMapFeature(
                geometry=MatchMapFeatureGeometry(
                    coordinates=(neighborhood.centroid_lng, neighborhood.centroid_lat)
                ),
                properties=MatchMapFeatureProperties(
                    neighborhood_id=neighborhood.neighborhood_id,
                    name=name,
                    municipality=neighborhood.municipality,
                    match_score=score,
                    category=item_category,  # type: ignore[arg-type]
                    confidence=ConfidenceScore(
                        score=vector.confidence.score,
                        label=vector.confidence.label,
                        reasons=vector.confidence.reasons,
                    ),
                    freshness_status=_freshness(vector),
                    source_refs=_source_refs(vector),
                    missing_data=sorted(vector.missing_features),
                ),
            )
        )

    features.sort(
        key=lambda feature: (
            -feature.properties.match_score,
            feature.properties.name,
            feature.properties.neighborhood_id,
        )
    )
    return MatchMapResponse(
        bounds=_bounds(features),
        features=features,
        unsupported_regions=sorted(unsupported_regions),
        missing_coordinates=missing_coordinates,
        empty_state_code=None if features else "match.map.empty",
    )
