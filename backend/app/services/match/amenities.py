from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy

from app.models.match import (
    MatchNeighborhoodAmenitiesResponse,
    MatchNeighborhoodAmenityPoint,
    MatchNeighborhoodAmenityTag,
    MatchSessionResponse,
)
from app.services.match.geometry import (
    LIMITATIONS,
    display_bounds_wgs84,
    load_seed_neighborhood,
)
from app.services.match.providers.amenities import (
    OFFICIAL_AMENITY_CATEGORIES,
    OFFICIAL_AMENITY_EMOJI,
    OfficialAmenityCategory,
    load_amenity_source_versions,
    load_official_amenity_records,
)
from app.services.match.sessions import get_match_session

DEFAULT_VISIBLE_AMENITY_CAP = len(OFFICIAL_AMENITY_CATEGORIES)
AMENITY_CACHE_VERSION = "official-amenities-v1"

_AMENITY_RESPONSE_CACHE: dict[str, MatchNeighborhoodAmenitiesResponse] = {}

PREFERENCE_AMENITIES: dict[str, list[tuple[str, str, int]]] = {
    "green_access": [
        ("parks_green", "green_space_priority", 95),
    ],
    "calmness": [
        ("parks_green", "calmness_priority", 82),
        ("sports_fields", "calmness_priority", 74),
    ],
    "public_transport": [
        ("transit", "transport_priority", 95),
    ],
    "schools_childcare": [
        ("schools", "family_priority", 95),
        ("childcare", "family_priority", 88),
    ],
    "amenities": [
        ("transit", "daily_amenities_priority", 74),
        ("sports_fields", "daily_amenities_priority", 72),
    ],
    "environmental_quality": [
        ("parks_green", "environmental_quality_priority", 86),
    ],
    "parks_nearby": [("parks_green", "must_have_match", 94)],
    "good_transit": [("transit", "must_have_match", 94)],
    "schools_nearby": [("schools", "must_have_match", 94)],
    "daily_shops": [("transit", "must_have_match", 68)],
    "low_traffic": [("parks_green", "must_have_match", 78)],
    "bike_friendly": [("sports_fields", "must_have_match", 76)],
}

DEFAULT_AMENITIES: list[tuple[str, str, int]] = [
    ("parks_green", "default_context", 68),
    ("transit", "default_context", 66),
    ("schools", "default_context", 62),
    ("childcare", "default_context", 60),
    ("sports_fields", "default_context", 58),
]


def _string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _preference_keys(session: MatchSessionResponse) -> Iterable[str]:
    answers = session.answers
    yield from _string_list(answers.get("lifestyle_priorities"))
    yield from _string_list(answers.get("must_haves"))


def _tag(amenity_key: str, reason_code: str, relevance: int) -> MatchNeighborhoodAmenityTag:
    return MatchNeighborhoodAmenityTag(
        amenity_key=amenity_key,
        label_key=f"matchFirst.amenity.{amenity_key}",
        reason_code=reason_code,
        source_refs=[f"official_amenity:{amenity_key}"],
        relevance=relevance,
    )


def _cache_key(
    neighborhood_id: str,
    bounds_wgs84: list[float],
    categories: tuple[OfficialAmenityCategory, ...],
    limit: int,
    source_versions: dict[str, str] | None = None,
) -> str:
    bbox = ",".join(f"{value:.7f}" for value in bounds_wgs84)
    effective_versions = source_versions or {}
    versions = ",".join(
        f"{category}:{effective_versions.get(category, 'source_unconfigured')}"
        for category in categories
    )
    return (
        f"{AMENITY_CACHE_VERSION}|neighborhood={neighborhood_id}|bbox={bbox}|"
        f"categories={','.join(categories)}|versions={versions}|limit={limit}"
    )


def _copy_response(
    response: MatchNeighborhoodAmenitiesResponse,
) -> MatchNeighborhoodAmenitiesResponse:
    return response.model_validate(deepcopy(response.model_dump(mode="python")))


def clear_amenity_response_cache() -> None:
    _AMENITY_RESPONSE_CACHE.clear()


def _source_refs_for_points(points: list[MatchNeighborhoodAmenityPoint]) -> list[str]:
    return sorted({source_ref for point in points for source_ref in point.source_refs})


async def _points_for_tags(
    neighborhood_id: str,
    tags: list[MatchNeighborhoodAmenityTag],
    bounds_wgs84: list[float],
) -> list[MatchNeighborhoodAmenityPoint]:
    tag_by_key = {tag.amenity_key: tag for tag in tags}
    categories = tuple(
        category
        for category in OFFICIAL_AMENITY_CATEGORIES
        if category in tag_by_key
    )
    records, _unavailable = await load_official_amenity_records(
        neighborhood_id,
        bounds_wgs84,
        categories,
    )
    points: list[MatchNeighborhoodAmenityPoint] = []
    for record in records:
        tag = tag_by_key[record.category_key]
        record_id = record.record_id or f"{record.source_ref}:{record.category_key}"
        points.append(
            MatchNeighborhoodAmenityPoint(
                point_id=f"amenity_{neighborhood_id}_{record.category_key}_{record_id}",
                amenity_key=record.category_key,
                category_key=record.category_key,
                label_key=tag.label_key,
                name=record.name,
                emoji=OFFICIAL_AMENITY_EMOJI[record.category_key],
                display_lat=record.display_lat,
                display_lng=record.display_lng,
                source_name=record.source_name,
                source_record_id=record.record_id,
                freshness_date=record.freshness_date,
                loaded_at=record.loaded_at,
                source_coordinate_system=record.source_coordinate_system,
                source_geometry=record.source_geometry,
                source_geometry_coordinate_system=record.source_geometry_coordinate_system,
                source_refs=[record.source_ref],
                relevance=tag.relevance,
            )
        )
    return sorted(points, key=lambda item: item.relevance, reverse=True)


async def get_preference_aware_amenities(
    neighborhood_id: str,
    *,
    session_id: str,
    result_set_id: str,
    limit: int = DEFAULT_VISIBLE_AMENITY_CAP,
) -> MatchNeighborhoodAmenitiesResponse:
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    session = await get_match_session(session_id)
    cap = max(5, min(limit, len(OFFICIAL_AMENITY_CATEGORIES)))
    selected: dict[str, MatchNeighborhoodAmenityTag] = {}

    for preference_key in _preference_keys(session):
        for amenity_key, reason_code, relevance in PREFERENCE_AMENITIES.get(preference_key, []):
            current = selected.get(amenity_key)
            if current is None or relevance > current.relevance:
                selected[amenity_key] = _tag(amenity_key, reason_code, relevance)

    for amenity_key, reason_code, relevance in DEFAULT_AMENITIES:
        selected.setdefault(amenity_key, _tag(amenity_key, reason_code, relevance))

    bounds_wgs84 = display_bounds_wgs84(neighborhood)
    tags = [
        tag
        for tag in sorted(selected.values(), key=lambda item: item.relevance, reverse=True)
        if tag.amenity_key in OFFICIAL_AMENITY_CATEGORIES
    ][:cap]
    categories = tuple(
        category
        for category in OFFICIAL_AMENITY_CATEGORIES
        if any(tag.amenity_key == category for tag in tags)
    )
    source_versions = await load_amenity_source_versions(categories)
    cache_key = _cache_key(neighborhood_id, bounds_wgs84, categories, cap, source_versions)
    if cache_key in _AMENITY_RESPONSE_CACHE:
        cached = _copy_response(_AMENITY_RESPONSE_CACHE[cache_key])
        cached.session_id = session_id
        cached.result_set_id = result_set_id
        return cached

    points = await _points_for_tags(neighborhood_id, tags, bounds_wgs84)
    response = MatchNeighborhoodAmenitiesResponse(
        neighborhood_id=neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
        tags=tags,
        points=points,
        source_refs=_source_refs_for_points(points),
        limitations=sorted(
            {
                *LIMITATIONS,
                "match.amenities.limitations.official_source_coverage_varies",
                "match.amenities.limitations.address_sources_require_bag_match",
            }
        ),
    )
    if response.points:
        _AMENITY_RESPONSE_CACHE[cache_key] = _copy_response(response)
    return response
