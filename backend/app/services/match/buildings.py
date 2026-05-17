from __future__ import annotations

from app.models.match import MatchNeighborhoodBuildingFeature, MatchNeighborhoodBuildingsResponse
from app.services.match.geometry import (
    DATA_VERSION,
    LIMITATIONS,
    SOURCE_REFS,
    display_bounds_wgs84,
    load_seed_neighborhood,
    neighborhood_bounds_rd,
    validate_building_bounds,
)


def _seed_house_candidate(
    neighborhood_id: str,
    display_bounds: list[float],
) -> MatchNeighborhoodBuildingFeature:
    west, south, east, north = display_bounds
    center_lng = (west + east) / 2
    center_lat = (south + north) / 2
    delta_lng = max((east - west) * 0.06, 0.0002)
    delta_lat = max((north - south) * 0.06, 0.0002)
    return MatchNeighborhoodBuildingFeature(
        building_id=f"bldg_{neighborhood_id}_001",
        vbo_id="0363010000123456",
        address_id="0363010000123456",
        lookup_id="adr-abc123",
        footprint={
            "type": "Polygon",
            "coordinates": [[
                [center_lng - delta_lng, center_lat - delta_lat],
                [center_lng + delta_lng, center_lat - delta_lat],
                [center_lng + delta_lng, center_lat + delta_lat],
                [center_lng - delta_lng, center_lat + delta_lat],
                [center_lng - delta_lng, center_lat - delta_lat],
            ]],
        },
        height_m=None,
        source_refs=SOURCE_REFS,
        address_resolution="resolved",
        address_candidate_count=1,
        fallback_label_key="matchFirst.neighborhood.addressCandidate",
    )


async def get_scoped_neighborhood_buildings(
    neighborhood_id: str,
    *,
    session_id: str,
    result_set_id: str,
    bounds_rd: list[float],
    lod: str = "low",
    limit: int = 50,
) -> MatchNeighborhoodBuildingsResponse:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    allowed_bounds = neighborhood_bounds_rd(neighborhood)
    validate_building_bounds(bounds_rd, allowed_bounds)
    bounded_limit = max(1, min(limit, 100))
    _ = (lod, bounded_limit)
    buildings = [_seed_house_candidate(neighborhood_id, display_bounds_wgs84(neighborhood))]

    return MatchNeighborhoodBuildingsResponse(
        neighborhood_id=neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
        bounds_rd=bounds_rd,
        clipped_to_neighborhood=True,
        buildings=buildings,
        fallback_reason_code="matchFirst.neighborhood.missing3d",
        data_version=DATA_VERSION,
        source_refs=SOURCE_REFS,
        limitations=[*LIMITATIONS, "match.results.limitations.source_metadata_unavailable"],
    )
