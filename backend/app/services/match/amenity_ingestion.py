from __future__ import annotations

import asyncio
import csv
import html
import logging
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from io import StringIO
from typing import Protocol
from urllib.parse import urljoin

import httpx

from app.config import settings
from app.models.address import ResolvedAddress
from app.services import locatieserver
from app.services.match.amenities import clear_amenity_response_cache
from app.services.match.amenity_store import (
    AmenityCategoryKey,
    AmenityImportRun,
    StoredAmenityRecord,
    insert_amenity_import_run,
    replace_successful_amenity_records,
)
from app.services.match.geometry import (
    display_bounds_wgs84,
    load_seed_neighborhood,
    neighborhood_bounds_rd,
)

logger = logging.getLogger(__name__)

_DUO_SOURCE_REF = "duo_open_onderwijsdata_bag"
_LRK_SOURCE_REF = "lrk_bag_locations"
_GREEN_SOURCE_REF = "pdok_bgt_brt_green"
_ADDRESS_MATCH_CONCURRENCY = 8

_SOURCE_NAMES = {
    _DUO_SOURCE_REF: "DUO Open Onderwijsdata school vestigingen matched to BAG",
    _LRK_SOURCE_REF: "Landelijk Register Kinderopvang matched to BAG",
    _GREEN_SOURCE_REF: "PDOK BGT/BRT green-space geometry",
}

_LIMITATIONS = (
    "match.amenities.limitations.official_source_coverage_varies",
    "match.amenities.limitations.address_sources_require_bag_match",
)

_CSV_HREF = re.compile(r"href=[\"']([^\"']+\.csv[^\"']*)[\"']", re.IGNORECASE)
_CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
_RD_NEW = "http://www.opengis.net/def/crs/EPSG/0/28992"


class OfficialAmenityClient(Protocol):
    async def fetch_duo_school_rows(self) -> list[dict[str, object]]: ...

    async def fetch_lrk_childcare_rows(self) -> list[dict[str, object]]: ...

    async def match_bag_address(self, query: str) -> ResolvedAddress | None: ...

    async def fetch_pdok_green_features(
        self,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]: ...

    async def fetch_bag_sport_features(
        self,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]: ...


@dataclass(frozen=True)
class AmenityCoverage:
    neighborhood_id: str
    category_key: AmenityCategoryKey
    source_ref: str
    source_name: str
    source_version: str
    status: str
    records_imported: int
    records_failed: int = 0
    records_skipped: int = 0
    withheld_address_count: int = 0
    unmatched_address_count: int = 0
    error_reason_code: str | None = None


@dataclass(frozen=True)
class AmenityRefreshResult:
    overall_status: str
    started_at: datetime
    finished_at: datetime
    coverage: list[AmenityCoverage] = field(default_factory=list)


class LiveOfficialAmenityClient:
    def __init__(self, *, timeout_seconds: float = 20.0) -> None:
        self._timeout = httpx.Timeout(timeout_seconds)

    async def fetch_duo_school_rows(self) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            for page_url in settings.match_amenity_duo_source_pages:
                page_response = await client.get(page_url)
                page_response.raise_for_status()
                csv_url = _first_csv_url(page_url, page_response.text)
                csv_response = await client.get(csv_url)
                csv_response.raise_for_status()
                rows.extend(_parse_csv_rows(csv_response.text, source_url=csv_url))
        return rows

    async def fetch_lrk_childcare_rows(self) -> list[dict[str, object]]:
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            response = await client.get(settings.match_amenity_lrk_csv_url)
            response.raise_for_status()
            return _parse_csv_rows(
                response.text,
                source_url=settings.match_amenity_lrk_csv_url,
            )

    async def match_bag_address(self, query: str) -> ResolvedAddress | None:
        suggestions = await locatieserver.suggest(query, limit=1)
        if not suggestions:
            return None
        return await locatieserver.lookup(suggestions[0].id)

    async def fetch_pdok_green_features(
        self,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]:
        return await self._fetch_bgt_collection("begroeidterreindeel", bounds_rd)

    async def fetch_bag_sport_features(
        self,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]:
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            response = await client.get(
                settings.bag_wfs_base,
                params={
                    "service": "WFS",
                    "version": "2.0.0",
                    "request": "GetFeature",
                    "typeNames": "bag:verblijfsobject",
                    "bbox": ",".join(str(value) for value in (*bounds_rd, "EPSG:28992")),
                    "srsName": "EPSG:4326",
                    "outputFormat": "application/json",
                    "count": "1000",
                },
            )
            response.raise_for_status()
            return response.json()

    async def _fetch_bgt_collection(
        self,
        collection: str,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]:
        async with httpx.AsyncClient(timeout=self._timeout, follow_redirects=True) as client:
            response = await client.get(
                f"{settings.match_amenity_pdok_bgt_ogc_base.rstrip('/')}/collections/{collection}/items",
                params={
                    "f": "json",
                    "limit": str(settings.match_amenity_pdok_bgt_ogc_limit),
                    "bbox": ",".join(str(value) for value in bounds_rd),
                    "bbox-crs": _RD_NEW,
                    "crs": _CRS84,
                },
            )
            response.raise_for_status()
            return response.json()


def _first_csv_url(page_url: str, page_html: str) -> str:
    matches = _CSV_HREF.findall(page_html)
    if not matches:
        raise ValueError("match.amenities.duo_csv_link_unavailable")
    return urljoin(page_url, html.unescape(matches[-1]))


def _parse_csv_rows(text: str, *, source_url: str) -> list[dict[str, object]]:
    clean_text = text.lstrip("\ufeff")
    if clean_text.casefold().startswith("lrk_id;"):
        reader = csv.DictReader(StringIO(clean_text), delimiter=";", quotechar='"')
    else:
        sample = clean_text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,")
        except csv.Error:
            dialect = csv.excel
            dialect.delimiter = ";"
        reader = csv.DictReader(StringIO(clean_text), dialect=dialect)
    rows: list[dict[str, object]] = []
    for row in reader:
        normalized = {str(key or "").strip(): value for key, value in row.items()}
        normalized["_source_url"] = source_url
        rows.append(normalized)
    return rows


def _value(row: dict[str, object], *candidates: str) -> str:
    normalized_candidates = {candidate.casefold().replace(" ", "_") for candidate in candidates}
    for key, value in row.items():
        normalized_key = str(key).casefold().replace(" ", "_")
        if normalized_key in normalized_candidates and value not in (None, ""):
            return str(value).strip()
    return ""


def _address_query(row: dict[str, object]) -> str:
    street = _value(
        row,
        "straatnaam",
        "straat",
        "vestigingsadres_straatnaam",
        "opvanglocatie_adres",
    )
    number = _value(row, "huisnummer", "vestigingsadres_huisnummer", "huisnummer-toevoeging")
    suffix = _value(row, "huisletter", "huisnummertoevoeging", "toevoeging")
    postcode = _value(row, "postcode", "vestigingsadres_postcode", "opvanglocatie_postcode")
    city = _value(
        row,
        "plaatsnaam",
        "woonplaats",
        "vestigingsadres_plaatsnaam",
        "opvanglocatie_woonplaats",
    )
    return " ".join(part for part in (street, number + suffix, postcode, city) if part).strip()


def _row_may_belong_to_neighborhood(row: dict[str, object], municipality: str) -> bool:
    def aliases(value: str) -> set[str]:
        normalized = value.strip().casefold()
        values = {normalized} if normalized else set()
        if normalized in {"den haag", "'s-gravenhage", "'s gravenhage", "s-gravenhage"}:
            values.update({"den haag", "'s-gravenhage", "'s gravenhage", "s-gravenhage"})
        return values

    targets = aliases(municipality)
    if not targets:
        return True
    row_places = {
        _value(
            row,
            "plaatsnaam",
            "woonplaats",
            "gemeentenaam",
            "gemeente",
            "vestigingsadres_plaatsnaam",
            "opvanglocatie_woonplaats",
            "verantwoordelijke_gemeente",
        ).casefold()
    }
    row_places.discard("")
    row_place_aliases = set().union(*(aliases(place) for place in row_places))
    return not row_place_aliases or bool(targets.intersection(row_place_aliases))


def _in_bounds(bounds_wgs84: tuple[float, float, float, float], lat: float, lng: float) -> bool:
    west, south, east, north = bounds_wgs84
    return west <= lng <= east and south <= lat <= north


def _source_version(_source_ref: str, freshness_date: str, now: datetime) -> str:
    return freshness_date or now.date().isoformat()


async def _duo_records(
    *,
    client: OfficialAmenityClient,
    bounds_wgs84: tuple[float, float, float, float],
    municipality: str,
    loaded_at: datetime,
) -> tuple[list[StoredAmenityRecord], int, int]:
    records: list[StoredAmenityRecord] = []
    skipped = 0
    unmatched = 0
    candidates: list[tuple[dict[str, object], str]] = []
    for row in await client.fetch_duo_school_rows():
        if not _row_may_belong_to_neighborhood(row, municipality):
            skipped += 1
            continue
        query = _address_query(row)
        if not query:
            skipped += 1
            continue
        candidates.append((row, query))

    semaphore = asyncio.Semaphore(_ADDRESS_MATCH_CONCURRENCY)

    async def resolve(
        row: dict[str, object],
        query: str,
    ) -> tuple[StoredAmenityRecord | None, str | None]:
        async with semaphore:
            address = await client.match_bag_address(query)
        if not _has_exact_wgs84(address):
            return None, "unmatched"
        assert address is not None
        if not _in_bounds(bounds_wgs84, address.latitude, address.longitude):
            return None, "skipped"
        freshness_date = _value(row, "peildatum", "publicatiedatum") or loaded_at.date().isoformat()
        return (
            StoredAmenityRecord(
                category_key="schools",
                record_id=_value(row, "vestigingscode", "vestigingsnummer", "brin", "brin_nummer")
                or address.id,
                name=_value(row, "naam", "vestigingsnaam", "schoolnaam") or address.display_name,
                source_name=_SOURCE_NAMES[_DUO_SOURCE_REF],
                source_ref=_DUO_SOURCE_REF,
                source_version=_source_version(_DUO_SOURCE_REF, freshness_date, loaded_at),
                freshness_date=freshness_date,
                loaded_at=loaded_at,
                display_lat=address.latitude,
                display_lng=address.longitude,
                source_coordinate_system="EPSG:28992",
                source_geometry_coordinate_system="EPSG:28992",
                source_geometry={"type": "Point", "coordinates": [address.rd_x, address.rd_y]},
                limitations=_LIMITATIONS,
                bag_address_id=address.nummeraanduiding_id,
                bag_vbo_id=address.adresseerbaar_object_id,
            ),
            None,
        )

    resolved = await asyncio.gather(
        *(resolve(row, query) for row, query in candidates),
        return_exceptions=True,
    )
    for item in resolved:
        if isinstance(item, Exception):
            unmatched += 1
            continue
        record, status = item
        if record is not None:
            records.append(record)
        elif status == "skipped":
            skipped += 1
        else:
            unmatched += 1
    return records, skipped, unmatched


async def _lrk_records(
    *,
    client: OfficialAmenityClient,
    bounds_wgs84: tuple[float, float, float, float],
    municipality: str,
    loaded_at: datetime,
) -> tuple[list[StoredAmenityRecord], int, int, int]:
    records: list[StoredAmenityRecord] = []
    skipped = 0
    unmatched = 0
    withheld = 0
    candidates: list[tuple[dict[str, object], str]] = []
    for row in await client.fetch_lrk_childcare_rows():
        if not _row_may_belong_to_neighborhood(row, municipality):
            skipped += 1
            continue
        query = _address_query(row)
        if _is_withheld_lrk_address(row, query):
            withheld += 1
            continue
        if not query:
            skipped += 1
            continue
        candidates.append((row, query))

    semaphore = asyncio.Semaphore(_ADDRESS_MATCH_CONCURRENCY)

    async def resolve(
        row: dict[str, object],
        query: str,
    ) -> tuple[StoredAmenityRecord | None, str | None]:
        async with semaphore:
            address = await client.match_bag_address(query)
        if not _has_exact_wgs84(address):
            return None, "unmatched"
        assert address is not None
        if not _in_bounds(bounds_wgs84, address.latitude, address.longitude):
            return None, "skipped"
        freshness_date = _value(row, "peildatum", "publicatiedatum") or loaded_at.date().isoformat()
        return (
            StoredAmenityRecord(
                category_key="childcare",
                record_id=_value(row, "lrk_id", "lrk_nummer", "registratienummer") or address.id,
                name=(
                    _value(row, "naam", "naam_voorziening", "voorzieningnaam", "actuele_naam_oko")
                    or address.display_name
                ),
                source_name=_SOURCE_NAMES[_LRK_SOURCE_REF],
                source_ref=_LRK_SOURCE_REF,
                source_version=_source_version(_LRK_SOURCE_REF, freshness_date, loaded_at),
                freshness_date=freshness_date,
                loaded_at=loaded_at,
                display_lat=address.latitude,
                display_lng=address.longitude,
                source_coordinate_system="EPSG:28992",
                source_geometry_coordinate_system="EPSG:28992",
                source_geometry={"type": "Point", "coordinates": [address.rd_x, address.rd_y]},
                limitations=(
                    *_LIMITATIONS,
                    "match.amenities.limitations.lrk_withheld_gastouder_addresses",
                ),
                bag_address_id=address.nummeraanduiding_id,
                bag_vbo_id=address.adresseerbaar_object_id,
            ),
            None,
        )

    resolved = await asyncio.gather(
        *(resolve(row, query) for row, query in candidates),
        return_exceptions=True,
    )
    for item in resolved:
        if isinstance(item, Exception):
            unmatched += 1
            continue
        record, status = item
        if record is not None:
            records.append(record)
        elif status == "skipped":
            skipped += 1
        else:
            unmatched += 1
    return records, skipped, unmatched, withheld


async def _lrk_records_from_bag_index(
    *,
    client: OfficialAmenityClient,
    bounds_wgs84: tuple[float, float, float, float],
    bounds_rd: tuple[float, float, float, float],
    municipality: str,
    loaded_at: datetime,
) -> tuple[list[StoredAmenityRecord], int, int, int]:
    records: list[StoredAmenityRecord] = []
    skipped = 0
    unmatched = 0
    withheld = 0
    bag_index = _bag_feature_index(
        await client.fetch_bag_sport_features(bounds_rd),
        bounds_wgs84=bounds_wgs84,
    )
    for row in await client.fetch_lrk_childcare_rows():
        if not _row_may_belong_to_neighborhood(row, municipality):
            skipped += 1
            continue
        query = _address_query(row)
        if _is_withheld_lrk_address(row, query):
            withheld += 1
            continue
        bag_id = _value(row, "bag_id")
        indexed = bag_index.get(bag_id)
        if indexed is None:
            unmatched += 1
            continue
        lat, lng, geometry = indexed
        freshness_date = _value(row, "peildatum", "publicatiedatum") or loaded_at.date().isoformat()
        records.append(
            StoredAmenityRecord(
                category_key="childcare",
                record_id=_value(row, "lrk_id", "lrk_nummer", "registratienummer") or bag_id,
                name=(
                    _value(row, "naam", "naam_voorziening", "voorzieningnaam", "actuele_naam_oko")
                    or query
                    or _SOURCE_NAMES[_LRK_SOURCE_REF]
                ),
                source_name=_SOURCE_NAMES[_LRK_SOURCE_REF],
                source_ref=_LRK_SOURCE_REF,
                source_version=_source_version(
                    _LRK_SOURCE_REF,
                    freshness_date,
                    loaded_at,
                ),
                freshness_date=freshness_date,
                loaded_at=loaded_at,
                display_lat=lat,
                display_lng=lng,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry=geometry,
                limitations=(
                    *_LIMITATIONS,
                    "match.amenities.limitations.lrk_withheld_gastouder_addresses",
                ),
                bag_vbo_id=bag_id,
            )
        )
    return records, skipped, unmatched, withheld


def _has_exact_wgs84(address: ResolvedAddress | None) -> bool:
    return (
        address is not None
        and address.latitude is not None
        and address.longitude is not None
        and address.rd_x is not None
        and address.rd_y is not None
    )


def _is_withheld_lrk_address(row: dict[str, object], query: str) -> bool:
    type_value = _value(row, "type_oko", "type", "opvangsoort").casefold()
    at_home = _value(
        row,
        "opvang_op_adres_vraagouder",
        "opvangadres_vraagouder",
        "adres_afgeschermd",
        "opvanglocatie_adres",
    ).casefold()
    return ("vgo" in type_value or "gastouder" in type_value) and (
        not query or at_home in {"ja", "j", "true", "1", "opvang bij de vraagouder"}
    )


def _feature_records(
    *,
    collection: dict[str, object],
    category_key: AmenityCategoryKey,
    source_ref: str,
    source_name: str,
    source_version: str,
    loaded_at: datetime,
    bounds_wgs84: tuple[float, float, float, float],
    predicate,
) -> tuple[list[StoredAmenityRecord], int]:
    records: list[StoredAmenityRecord] = []
    skipped = 0
    features = collection.get("features")
    if not isinstance(features, list):
        return records, 1
    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            skipped += 1
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict) or not predicate(properties):
            skipped += 1
            continue
        representative = _representative_wgs84(geometry)
        if representative is None:
            skipped += 1
            continue
        lng, lat = representative
        if not _in_bounds(bounds_wgs84, lat, lng):
            skipped += 1
            continue
        record_id = str(
            feature.get("id")
            or properties.get("lokaal_id")
            or properties.get("identificatie")
            or f"{source_ref}-{index}"
        )
        records.append(
            StoredAmenityRecord(
                category_key=category_key,
                record_id=record_id,
                name=str(
                    properties.get("naam")
                    or properties.get("naamnl")
                    or properties.get("type")
                    or properties.get("gebruiksdoel")
                    or source_name
                ),
                source_name=source_name,
                source_ref=source_ref,
                source_version=source_version,
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=lat,
                display_lng=lng,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry=geometry,
                limitations=(
                    "match.amenities.limitations.official_source_coverage_varies",
                    "match.amenities.limitations.geometry_centroid_marker",
                ),
                bag_vbo_id=str(properties.get("identificatie") or "") or None,
            )
        )
    return records, skipped


def _green_predicate(properties: dict[str, object]) -> bool:
    text = " ".join(str(value).casefold() for value in properties.values() if value is not None)
    return any(token in text for token in ("park", "groen", "bos", "plantsoen", "gras"))


def _representative_wgs84(geometry: dict[str, object]) -> tuple[float, float] | None:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Point" and isinstance(coordinates, list) and len(coordinates) >= 2:
        return float(coordinates[0]), float(coordinates[1])
    points = _flatten_points(coordinates)
    if not points:
        return None
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    lng = sum(point[0] for point in points) / len(points)
    lat = sum(point[1] for point in points) / len(points)
    return lng, lat


def _bag_feature_index(
    collection: dict[str, object],
    *,
    bounds_wgs84: tuple[float, float, float, float],
) -> dict[str, tuple[float, float, dict[str, object]]]:
    indexed: dict[str, tuple[float, float, dict[str, object]]] = {}
    features = collection.get("features")
    if not isinstance(features, list):
        return indexed
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            continue
        bag_id = str(properties.get("identificatie") or "").strip()
        geometry = feature.get("geometry")
        if not bag_id or not isinstance(geometry, dict):
            continue
        representative = _representative_wgs84(geometry)
        if representative is None:
            continue
        lng, lat = representative
        if not _in_bounds(bounds_wgs84, lat, lng):
            continue
        indexed[bag_id] = (lat, lng, geometry)
    return indexed


def _flatten_points(value: object) -> list[tuple[float, float]]:
    if not isinstance(value, list):
        return []
    if (
        len(value) >= 2
        and isinstance(value[0], int | float)
        and isinstance(value[1], int | float)
    ):
        return [(float(value[0]), float(value[1]))]
    points: list[tuple[float, float]] = []
    for item in value:
        points.extend(_flatten_points(item))
    return points


async def _store_source_result(
    *,
    neighborhood_id: str,
    category_key: AmenityCategoryKey,
    source_ref: str,
    source_name: str,
    source_version: str,
    records: list[StoredAmenityRecord],
    started_at: datetime,
    finished_at: datetime,
    bbox_wgs84: tuple[float, float, float, float],
    bbox_rd: tuple[float, float, float, float],
    records_failed: int = 0,
    records_skipped: int = 0,
    withheld_address_count: int = 0,
    unmatched_address_count: int = 0,
    error_reason_code: str | None = None,
) -> AmenityCoverage:
    if records:
        status = (
            "partial"
            if records_failed or records_skipped or unmatched_address_count
            else "success"
        )
    elif records_failed:
        status = "failed"
    else:
        status = "empty"
    import_run_id = f"amir_{uuid.uuid4().hex[:16]}"
    await insert_amenity_import_run(
        AmenityImportRun(
            import_run_id=import_run_id,
            neighborhood_id=neighborhood_id,
            category_key=category_key,
            source_ref=source_ref,
            source_name=source_name,
            source_version=source_version,
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            records_imported=len(records),
            records_failed=records_failed,
            records_skipped=records_skipped,
            withheld_address_count=withheld_address_count,
            unmatched_address_count=unmatched_address_count,
            bbox_wgs84=bbox_wgs84,
            bbox_rd=bbox_rd,
            error_reason_code=error_reason_code,
            details={"cache_policy": "empty_or_failed_runs_do_not_replace_records"},
        )
    )
    for record_source_ref, grouped_records in _group_by_source_ref(records).items():
        await replace_successful_amenity_records(
            neighborhood_id=neighborhood_id,
            category_key=category_key,
            source_ref=record_source_ref,
            import_run_id=import_run_id,
            records=grouped_records,
        )
    return AmenityCoverage(
        neighborhood_id=neighborhood_id,
        category_key=category_key,
        source_ref=source_ref,
        source_name=source_name,
        source_version=source_version,
        status=status,
        records_imported=len(records),
        records_failed=records_failed,
        records_skipped=records_skipped,
        withheld_address_count=withheld_address_count,
        unmatched_address_count=unmatched_address_count,
        error_reason_code=error_reason_code,
    )


def _group_by_source_ref(
    records: list[StoredAmenityRecord],
) -> dict[str, list[StoredAmenityRecord]]:
    grouped: dict[str, list[StoredAmenityRecord]] = defaultdict(list)
    for record in records:
        grouped[record.source_ref].append(record)
    return grouped


async def _safe_source(call, *, default_version: str, error_version_prefix: str, now: datetime):
    try:
        return await call(), None
    except Exception as exc:
        logger.warning("amenity source refresh failed: %s", exc)
        return exc, _source_version(error_version_prefix, default_version, now)


async def run_amenity_refresh_once(
    *,
    neighborhood_ids: tuple[str, ...] | None = None,
    client: OfficialAmenityClient | None = None,
    now: datetime | None = None,
) -> AmenityRefreshResult:
    refresh_client = client or LiveOfficialAmenityClient()
    started_at = now or datetime.now(UTC)
    loaded_at = started_at
    coverage: list[AmenityCoverage] = []
    target_neighborhood_ids = neighborhood_ids or (
        "nh_almere_poort",
        "nh_amsterdam_ijburg",
        "nh_utrecht_leidsche_rijn",
    )

    for neighborhood_id in target_neighborhood_ids:
        neighborhood = await load_seed_neighborhood(neighborhood_id)
        bounds_wgs84_tuple = tuple(display_bounds_wgs84(neighborhood))
        bounds_rd_tuple = tuple(float(value) for value in neighborhood_bounds_rd(neighborhood))

        duo_started = datetime.now(UTC)
        duo_result = await _safe_source(
            lambda: _duo_records(
                client=refresh_client,
                bounds_wgs84=bounds_wgs84_tuple,
                municipality=neighborhood.municipality or "",
                loaded_at=loaded_at,
            ),
            default_version=loaded_at.date().isoformat(),
            error_version_prefix=_DUO_SOURCE_REF,
            now=loaded_at,
        )
        if isinstance(duo_result[0], Exception):
            coverage.append(
                await _store_source_result(
                    neighborhood_id=neighborhood_id,
                    category_key="schools",
                    source_ref=_DUO_SOURCE_REF,
                    source_name=_SOURCE_NAMES[_DUO_SOURCE_REF],
                    source_version=duo_result[1],
                    records=[],
                    records_failed=1,
                    error_reason_code="match.amenities.source_failed",
                    started_at=duo_started,
                    finished_at=datetime.now(UTC),
                    bbox_wgs84=bounds_wgs84_tuple,
                    bbox_rd=bounds_rd_tuple,
                )
            )
        else:
            duo_records, skipped, unmatched = duo_result[0]
            version = (
                duo_records[0].source_version
                if duo_records
                else _source_version(
                    _DUO_SOURCE_REF,
                    loaded_at.date().isoformat(),
                    loaded_at,
                )
            )
            coverage.append(
                await _store_source_result(
                    neighborhood_id=neighborhood_id,
                    category_key="schools",
                    source_ref=_DUO_SOURCE_REF,
                    source_name=_SOURCE_NAMES[_DUO_SOURCE_REF],
                    source_version=version,
                    records=duo_records,
                    records_skipped=skipped,
                    unmatched_address_count=unmatched,
                    started_at=duo_started,
                    finished_at=datetime.now(UTC),
                    bbox_wgs84=bounds_wgs84_tuple,
                    bbox_rd=bounds_rd_tuple,
                )
            )

        lrk_started = datetime.now(UTC)
        lrk_result = await _safe_source(
            lambda: _lrk_records(
                client=refresh_client,
                bounds_wgs84=bounds_wgs84_tuple,
                municipality=neighborhood.municipality or "",
                loaded_at=loaded_at,
            ),
            default_version=loaded_at.date().isoformat(),
            error_version_prefix=_LRK_SOURCE_REF,
            now=loaded_at,
        )
        if isinstance(lrk_result[0], Exception):
            coverage.append(
                await _store_source_result(
                    neighborhood_id=neighborhood_id,
                    category_key="childcare",
                    source_ref=_LRK_SOURCE_REF,
                    source_name=_SOURCE_NAMES[_LRK_SOURCE_REF],
                    source_version=lrk_result[1],
                    records=[],
                    records_failed=1,
                    error_reason_code="match.amenities.source_failed",
                    started_at=lrk_started,
                    finished_at=datetime.now(UTC),
                    bbox_wgs84=bounds_wgs84_tuple,
                    bbox_rd=bounds_rd_tuple,
                )
            )
        else:
            lrk_records, skipped, unmatched, withheld = lrk_result[0]
            version = (
                lrk_records[0].source_version
                if lrk_records
                else _source_version(
                    _LRK_SOURCE_REF,
                    loaded_at.date().isoformat(),
                    loaded_at,
                )
            )
            coverage.append(
                await _store_source_result(
                    neighborhood_id=neighborhood_id,
                    category_key="childcare",
                    source_ref=_LRK_SOURCE_REF,
                    source_name=_SOURCE_NAMES[_LRK_SOURCE_REF],
                    source_version=version,
                    records=lrk_records,
                    records_skipped=skipped,
                    withheld_address_count=withheld,
                    unmatched_address_count=unmatched,
                    started_at=lrk_started,
                    finished_at=datetime.now(UTC),
                    bbox_wgs84=bounds_wgs84_tuple,
                    bbox_rd=bounds_rd_tuple,
                )
            )

        coverage.extend(
            await _refresh_geometry_sources(
                client=refresh_client,
                neighborhood_id=neighborhood_id,
                bounds_wgs84=bounds_wgs84_tuple,
                bounds_rd=bounds_rd_tuple,
                loaded_at=loaded_at,
            )
        )

    clear_amenity_response_cache()
    finished_at = datetime.now(UTC)
    if any(item.records_imported for item in coverage):
        overall_status = (
            "partial" if any(item.status == "failed" for item in coverage) else "success"
        )
    elif any(item.status == "failed" for item in coverage):
        overall_status = "failed"
    else:
        overall_status = "empty"
    return AmenityRefreshResult(
        overall_status=overall_status,
        started_at=started_at,
        finished_at=finished_at,
        coverage=coverage,
    )


async def _refresh_geometry_sources(
    *,
    client: OfficialAmenityClient,
    neighborhood_id: str,
    bounds_wgs84: tuple[float, float, float, float],
    bounds_rd: tuple[float, float, float, float],
    loaded_at: datetime,
) -> list[AmenityCoverage]:
    coverage: list[AmenityCoverage] = []
    green_started = datetime.now(UTC)
    green_version = _source_version(_GREEN_SOURCE_REF, loaded_at.date().isoformat(), loaded_at)
    try:
        green_records, green_skipped = _feature_records(
            collection=await client.fetch_pdok_green_features(bounds_rd),
            category_key="parks_green",
            source_ref=_GREEN_SOURCE_REF,
            source_name=_SOURCE_NAMES[_GREEN_SOURCE_REF],
            source_version=green_version,
            loaded_at=loaded_at,
            bounds_wgs84=bounds_wgs84,
            predicate=_green_predicate,
        )
        coverage.append(
            await _store_source_result(
                neighborhood_id=neighborhood_id,
                category_key="parks_green",
                source_ref=_GREEN_SOURCE_REF,
                source_name=_SOURCE_NAMES[_GREEN_SOURCE_REF],
                source_version=green_version,
                records=green_records,
                records_skipped=green_skipped,
                started_at=green_started,
                finished_at=datetime.now(UTC),
                bbox_wgs84=bounds_wgs84,
                bbox_rd=bounds_rd,
            )
        )
    except Exception as exc:
        logger.warning("PDOK green amenity refresh failed: %s", exc)
        coverage.append(
            await _store_source_result(
                neighborhood_id=neighborhood_id,
                category_key="parks_green",
                source_ref=_GREEN_SOURCE_REF,
                source_name=_SOURCE_NAMES[_GREEN_SOURCE_REF],
                source_version=green_version,
                records=[],
                records_failed=1,
                error_reason_code="match.amenities.source_failed",
                started_at=green_started,
                finished_at=datetime.now(UTC),
                bbox_wgs84=bounds_wgs84,
                bbox_rd=bounds_rd,
            )
        )

    return coverage


async def run_amenity_refresh_scheduler(stop_event: asyncio.Event) -> None:
    interval_seconds = max(1, settings.match_amenity_refresh_interval_hours) * 60 * 60
    if settings.match_amenity_refresh_on_startup:
        await run_amenity_refresh_once()
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except TimeoutError:
            await run_amenity_refresh_once()
