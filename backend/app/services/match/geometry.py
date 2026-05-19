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
RD_REFERENCE_X = 155000.0
RD_REFERENCE_Y = 463000.0
WGS84_REFERENCE_LAT = 52.15517440
WGS84_REFERENCE_LNG = 5.38720621
RD_SCALE = 100000.0

RD_TO_WGS84_LAT_TERMS = (
    (0, 1, 3235.65389),
    (2, 0, -32.58297),
    (0, 2, -0.24750),
    (2, 1, -0.84978),
    (0, 3, -0.06550),
    (2, 2, -0.01709),
    (1, 0, -0.00738),
    (4, 0, 0.00530),
    (2, 3, -0.00039),
    (4, 1, 0.00033),
    (1, 1, -0.00012),
)

RD_TO_WGS84_LNG_TERMS = (
    (1, 0, 5260.52916),
    (1, 1, 105.94684),
    (1, 2, 2.45656),
    (3, 0, -0.81885),
    (1, 3, 0.05594),
    (3, 1, -0.05607),
    (0, 1, 0.01199),
    (3, 2, -0.00256),
    (1, 4, 0.00128),
    (0, 2, 0.00022),
    (2, 0, -0.00022),
    (5, 0, 0.00026),
)


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


def rd_to_wgs84(x: float, y: float) -> dict[str, float]:
    dx = (x - RD_REFERENCE_X) / RD_SCALE
    dy = (y - RD_REFERENCE_Y) / RD_SCALE
    lat_seconds = sum(
        coefficient * (dx**p) * (dy**q)
        for p, q, coefficient in RD_TO_WGS84_LAT_TERMS
    )
    lng_seconds = sum(
        coefficient * (dx**p) * (dy**q)
        for p, q, coefficient in RD_TO_WGS84_LNG_TERMS
    )
    return {
        "lat": WGS84_REFERENCE_LAT + (lat_seconds / 3600.0),
        "lng": WGS84_REFERENCE_LNG + (lng_seconds / 3600.0),
    }


def rd_bounds_to_wgs84(bounds_rd: list[float]) -> list[float]:
    west, south, east, north = bounds_rd
    corners = [
        rd_to_wgs84(west, south),
        rd_to_wgs84(west, north),
        rd_to_wgs84(east, south),
        rd_to_wgs84(east, north),
    ]
    lngs = [corner["lng"] for corner in corners]
    lats = [corner["lat"] for corner in corners]
    return [
        round(min(lngs), 7),
        round(min(lats), 7),
        round(max(lngs), 7),
        round(max(lats), 7),
    ]


def _centroid_wgs84(neighborhood: Neighborhood) -> dict[str, float]:
    if neighborhood.centroid_rd_x is not None and neighborhood.centroid_rd_y is not None:
        centroid = rd_to_wgs84(float(neighborhood.centroid_rd_x), float(neighborhood.centroid_rd_y))
        return {
            "lat": round(centroid["lat"], 7),
            "lng": round(centroid["lng"], 7),
        }
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
    if neighborhood.centroid_rd_x is not None and neighborhood.centroid_rd_y is not None:
        return rd_bounds_to_wgs84(neighborhood_bounds_rd(neighborhood))
    centroid = _centroid_wgs84(neighborhood)
    return [
        round(centroid["lng"] - DISPLAY_LNG_DELTA, 7),
        round(centroid["lat"] - DISPLAY_LAT_DELTA, 7),
        round(centroid["lng"] + DISPLAY_LNG_DELTA, 7),
        round(centroid["lat"] + DISPLAY_LAT_DELTA, 7),
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
            available=True,
            endpoint=f"/api/match/neighborhoods/{neighborhood_id}/buildings",
            fallback_reason_code=None,
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
