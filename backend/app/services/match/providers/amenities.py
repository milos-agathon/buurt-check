from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.services.match.amenity_store import (
    AmenityCategoryKey,
    load_stored_amenity_records,
    load_stored_amenity_source_versions,
)

OfficialAmenityCategory = AmenityCategoryKey

OFFICIAL_AMENITY_CATEGORIES: tuple[OfficialAmenityCategory, ...] = (
    "schools",
    "childcare",
    "parks_green",
    "sports_fields",
)

OFFICIAL_AMENITY_EMOJI: dict[OfficialAmenityCategory, str] = {
    "transit": "🚉",
    "schools": "🏫",
    "childcare": "🧸",
    "parks_green": "🌳",
    "sports_fields": "⚽",
}

OFFICIAL_AMENITY_SOURCE_VERSIONS: dict[OfficialAmenityCategory, str] = {
    "transit": "source_unconfigured",
    "schools": "duo_open_onderwijsdata_bag:unloaded",
    "childcare": "lrk_bag_locations:unloaded",
    "parks_green": "pdok_bgt_brt_green:unloaded",
    "sports_fields": "pdok_bgt_bag_sports:unloaded",
}


@dataclass(frozen=True)
class OfficialAmenityRecord:
    category_key: OfficialAmenityCategory
    record_id: str | None
    name: str
    source_name: str
    source_ref: str
    source_version: str
    freshness_date: str
    loaded_at: datetime
    display_lat: float
    display_lng: float
    source_coordinate_system: Literal["EPSG:4326", "EPSG:28992"]
    source_geometry_coordinate_system: Literal["EPSG:4326", "EPSG:28992"]
    source_geometry: dict[str, object]
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class OfficialAmenityUnavailable:
    category_key: OfficialAmenityCategory
    reason_code: str
    source_name: str


_CATEGORY_SOURCE_NAMES: dict[OfficialAmenityCategory, str] = {
    "transit": "NDOV / REISinformatiegroep GTFS stops",
    "schools": "DUO Open Onderwijsdata school vestigingen matched to BAG",
    "childcare": "Landelijk Register Kinderopvang matched to BAG",
    "parks_green": "PDOK BGT/BRT green-space geometry",
    "sports_fields": "PDOK BGT sportterrein and BAG sportfunctie geometry",
}

_CATEGORY_SOURCE_REFS: dict[OfficialAmenityCategory, str] = {
    "transit": "ndov_gtfs_stops",
    "schools": "duo_open_onderwijsdata_bag",
    "childcare": "lrk_bag_locations",
    "parks_green": "pdok_bgt_brt_green",
    "sports_fields": "pdok_bgt_bag_sports",
}


async def load_official_amenity_records(
    neighborhood_id: str,
    bounds_wgs84: list[float],
    categories: tuple[OfficialAmenityCategory, ...] = OFFICIAL_AMENITY_CATEGORIES,
) -> tuple[list[OfficialAmenityRecord], list[OfficialAmenityUnavailable]]:
    """Return bounded normalized official amenities for one selected neighborhood.

    This helper is intentionally scoped by selected-neighborhood bounds and never exposes
    a national amenity dataset to the frontend.
    """

    records: list[OfficialAmenityRecord] = []
    unavailable: list[OfficialAmenityUnavailable] = []

    if len(bounds_wgs84) != 4:
        return (
            records,
            [
                OfficialAmenityUnavailable(
                    category_key=category,
                    reason_code="match.amenities.bounds_unavailable",
                    source_name=_CATEGORY_SOURCE_NAMES[category],
                )
                for category in categories
            ],
        )

    stored = await load_stored_amenity_records(
        neighborhood_id=neighborhood_id,
        bounds_wgs84=tuple(bounds_wgs84),
        categories=categories,
    )
    categories_with_records: set[OfficialAmenityCategory] = set()
    for record in stored:
        categories_with_records.add(record.category_key)
        records.append(
            OfficialAmenityRecord(
                category_key=record.category_key,
                record_id=record.record_id,
                name=record.name,
                source_name=record.source_name,
                source_ref=record.source_ref,
                source_version=record.source_version,
                freshness_date=record.freshness_date,
                loaded_at=record.loaded_at,
                display_lat=record.display_lat,
                display_lng=record.display_lng,
                source_coordinate_system=record.source_coordinate_system,
                source_geometry_coordinate_system=record.source_geometry_coordinate_system,
                source_geometry=record.source_geometry,
                limitations=record.limitations,
            )
        )

    for category in categories:
        if category not in categories_with_records:
            unavailable.append(
                OfficialAmenityUnavailable(
                    category_key=category,
                    reason_code=(
                        "match.amenities.source_unconfigured"
                        if category == "transit"
                        else "match.amenities.official_record_unavailable"
                    ),
                    source_name=_CATEGORY_SOURCE_NAMES[category],
                )
            )

    return records, unavailable


async def load_amenity_source_versions(
    categories: tuple[OfficialAmenityCategory, ...] = OFFICIAL_AMENITY_CATEGORIES,
) -> dict[OfficialAmenityCategory, str]:
    versions = await load_stored_amenity_source_versions(categories)
    for category in categories:
        versions.setdefault(category, OFFICIAL_AMENITY_SOURCE_VERSIONS[category])
    return versions
