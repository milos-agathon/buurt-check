from __future__ import annotations

from collections.abc import Iterable

from app.models.match import (
    MatchNeighborhoodAmenitiesResponse,
    MatchNeighborhoodAmenityTag,
    MatchSessionResponse,
)
from app.services.match.geometry import LIMITATIONS, SOURCE_REFS, load_seed_neighborhood
from app.services.match.sessions import get_match_session

DEFAULT_VISIBLE_AMENITY_CAP = 6

PREFERENCE_AMENITIES: dict[str, list[tuple[str, str, int]]] = {
    "green_access": [
        ("parks", "green_space_priority", 95),
        ("nature", "green_space_priority", 88),
    ],
    "calmness": [
        ("quiet_routes", "calmness_priority", 90),
        ("parks", "calmness_priority", 82),
    ],
    "public_transport": [
        ("transit", "transport_priority", 95),
        ("cycling", "transport_priority", 84),
    ],
    "schools_childcare": [
        ("schools", "family_priority", 95),
        ("childcare", "family_priority", 88),
    ],
    "amenities": [
        ("groceries", "daily_amenities_priority", 92),
        ("cafes", "daily_amenities_priority", 78),
    ],
    "environmental_quality": [
        ("parks", "environmental_quality_priority", 86),
        ("quiet_routes", "environmental_quality_priority", 76),
    ],
    "parks_nearby": [("parks", "must_have_match", 94)],
    "good_transit": [("transit", "must_have_match", 94)],
    "schools_nearby": [("schools", "must_have_match", 94)],
    "daily_shops": [("groceries", "must_have_match", 92)],
    "low_traffic": [("quiet_routes", "must_have_match", 88)],
    "bike_friendly": [("cycling", "must_have_match", 88)],
}

DEFAULT_AMENITIES: list[tuple[str, str, int]] = [
    ("parks", "default_context", 68),
    ("transit", "default_context", 66),
    ("groceries", "default_context", 64),
    ("schools", "default_context", 62),
    ("cycling", "default_context", 60),
    ("healthcare", "default_context", 58),
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
        source_refs=SOURCE_REFS,
        relevance=relevance,
    )


async def get_preference_aware_amenities(
    neighborhood_id: str,
    *,
    session_id: str,
    result_set_id: str,
    limit: int = DEFAULT_VISIBLE_AMENITY_CAP,
) -> MatchNeighborhoodAmenitiesResponse:
    await load_seed_neighborhood(neighborhood_id)
    session = await get_match_session(session_id)
    cap = max(5, min(limit, 7))
    selected: dict[str, MatchNeighborhoodAmenityTag] = {}

    for preference_key in _preference_keys(session):
        for amenity_key, reason_code, relevance in PREFERENCE_AMENITIES.get(preference_key, []):
            current = selected.get(amenity_key)
            if current is None or relevance > current.relevance:
                selected[amenity_key] = _tag(amenity_key, reason_code, relevance)

    for amenity_key, reason_code, relevance in DEFAULT_AMENITIES:
        if len(selected) >= cap:
            break
        selected.setdefault(amenity_key, _tag(amenity_key, reason_code, relevance))

    tags = sorted(selected.values(), key=lambda item: item.relevance, reverse=True)[:cap]
    return MatchNeighborhoodAmenitiesResponse(
        neighborhood_id=neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
        tags=tags,
        points=[],
        source_refs=SOURCE_REFS,
        limitations=LIMITATIONS,
    )
