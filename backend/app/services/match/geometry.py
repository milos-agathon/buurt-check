from __future__ import annotations

from app.models.match import (
    DataFreshnessStatus,
    MatchNeighborhoodLayerEndpoint,
    MatchNeighborhoodMapLayersResponse,
    MatchNeighborhoodSummaryResponse,
    Neighborhood,
)
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter

DATA_VERSION = "match-seed-v1"
NEIGHBORHOOD_RD_RADIUS_M = 800.0
DISPLAY_LNG_DELTA = 0.012
DISPLAY_LAT_DELTA = 0.008
SOURCE_REFS = ["seed_match_source"]
LIMITATIONS = ["match.results.limitations.mock_data"]


class NeighborhoodNotFoundError(KeyError):
    """Raised when the selected neighborhood is absent from the active dataset."""


class BoundsParseError(ValueError):
    """Raised when an RD New bounds query cannot be parsed."""


class BuildingBoundsOutOfScopeError(ValueError):
    """Raised when a building layer request escapes the selected neighborhood."""


def _centroid_rd(neighborhood: Neighborhood) -> dict[str, float]:
    return {
        "x": float(neighborhood.centroid_rd_x or 155000.0),
        "y": float(neighborhood.centroid_rd_y or 463000.0),
    }


def _centroid_wgs84(neighborhood: Neighborhood) -> dict[str, float]:
    return {
        "lat": float(neighborhood.centroid_lat or 52.2),
        "lng": float(neighborhood.centroid_lng or 5.3),
    }


def neighborhood_bounds_rd(neighborhood: Neighborhood) -> list[float]:
    centroid = _centroid_rd(neighborhood)
    return [
        centroid["x"] - NEIGHBORHOOD_RD_RADIUS_M,
        centroid["y"] - NEIGHBORHOOD_RD_RADIUS_M,
        centroid["x"] + NEIGHBORHOOD_RD_RADIUS_M,
        centroid["y"] + NEIGHBORHOOD_RD_RADIUS_M,
    ]


def display_bounds_wgs84(neighborhood: Neighborhood) -> list[float]:
    centroid = _centroid_wgs84(neighborhood)
    return [
        centroid["lng"] - DISPLAY_LNG_DELTA,
        centroid["lat"] - DISPLAY_LAT_DELTA,
        centroid["lng"] + DISPLAY_LNG_DELTA,
        centroid["lat"] + DISPLAY_LAT_DELTA,
    ]


def selected_boundary_feature(neighborhood: Neighborhood) -> dict[str, object]:
    west, south, east, north = display_bounds_wgs84(neighborhood)
    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ]],
        },
        "properties": {
            "neighborhood_id": neighborhood.neighborhood_id,
            "boundary_ref": neighborhood.geometry_ref
            or f"boundary_{neighborhood.neighborhood_id}",
            "display_coordinate_system": "WGS84",
        },
    }


async def load_seed_neighborhood(neighborhood_id: str) -> Neighborhood:
    seed = await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)
    for neighborhood in seed.neighborhoods:
        if neighborhood.neighborhood_id == neighborhood_id:
            return neighborhood
    raise NeighborhoodNotFoundError(neighborhood_id)


def summarize_neighborhood(neighborhood: Neighborhood) -> MatchNeighborhoodSummaryResponse:
    return MatchNeighborhoodSummaryResponse(
        neighborhood_id=neighborhood.neighborhood_id,
        name=neighborhood.name_en or neighborhood.name_nl,
        municipality=neighborhood.municipality,
        centroid_rd=_centroid_rd(neighborhood),
        bounds_rd=neighborhood_bounds_rd(neighborhood),
        display_centroid_wgs84=_centroid_wgs84(neighborhood),
        display_bounds_wgs84=display_bounds_wgs84(neighborhood),
        boundary_ref=neighborhood.geometry_ref or f"boundary_{neighborhood.neighborhood_id}",
        source_refs=SOURCE_REFS,
        freshness_status=DataFreshnessStatus.mock,
        limitations=LIMITATIONS,
    )


async def get_neighborhood_summary(neighborhood_id: str) -> MatchNeighborhoodSummaryResponse:
    return summarize_neighborhood(await load_seed_neighborhood(neighborhood_id))


async def get_neighborhood_map_layers(
    neighborhood_id: str,
    *,
    session_id: str,
    result_set_id: str,
) -> MatchNeighborhoodMapLayersResponse:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    return MatchNeighborhoodMapLayersResponse(
        neighborhood_id=neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
        allowed_bounds_rd=neighborhood_bounds_rd(neighborhood),
        display_bounds_wgs84=display_bounds_wgs84(neighborhood),
        boundary=selected_boundary_feature(neighborhood),
        building_layer=MatchNeighborhoodLayerEndpoint(
            available=False,
            endpoint=f"/api/match/neighborhoods/{neighborhood_id}/buildings",
            fallback_reason_code="matchFirst.neighborhood.missing3d",
        ),
        amenity_layer=MatchNeighborhoodLayerEndpoint(
            endpoint=f"/api/match/neighborhoods/{neighborhood_id}/amenities",
        ),
        fallback_2d_available=True,
        source_refs=SOURCE_REFS,
        limitations=LIMITATIONS,
    )


def parse_bounds_rd(value: str) -> list[float]:
    try:
        parsed = [float(item.strip()) for item in value.split(",")]
    except ValueError as exc:
        raise BoundsParseError("match.building_bounds_invalid") from exc
    if len(parsed) != 4:
        raise BoundsParseError("match.building_bounds_invalid")
    min_x, min_y, max_x, max_y = parsed
    if min_x >= max_x or min_y >= max_y:
        raise BoundsParseError("match.building_bounds_invalid")
    return parsed


def validate_building_bounds(
    requested_bounds_rd: list[float],
    allowed_bounds_rd: list[float],
    *,
    tolerance_m: float = 0.01,
) -> None:
    min_x, min_y, max_x, max_y = requested_bounds_rd
    allowed_min_x, allowed_min_y, allowed_max_x, allowed_max_y = allowed_bounds_rd
    if (
        min_x < allowed_min_x - tolerance_m
        or min_y < allowed_min_y - tolerance_m
        or max_x > allowed_max_x + tolerance_m
        or max_y > allowed_max_y + tolerance_m
    ):
        raise BuildingBoundsOutOfScopeError("match.building_bounds_out_of_scope")
