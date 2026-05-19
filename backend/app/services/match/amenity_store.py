from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from app.db import get_db

AmenityCategoryKey = Literal[
    "transit",
    "schools",
    "childcare",
    "parks_green",
    "sports_fields",
]


@dataclass(frozen=True)
class StoredAmenityRecord:
    category_key: AmenityCategoryKey
    record_id: str | None
    name: str
    source_name: str
    source_ref: str
    source_version: str
    freshness_date: str
    loaded_at: datetime
    display_lat: float
    display_lng: float
    source_coordinate_system: Literal["EPSG:4326", "EPSG:28992"] | None
    source_geometry_coordinate_system: Literal["EPSG:4326", "EPSG:28992"] | None
    source_geometry: dict[str, object]
    limitations: tuple[str, ...] = ()
    bag_address_id: str | None = None
    bag_vbo_id: str | None = None
    bag_pand_id: str | None = None
    withheld_address: bool = False


@dataclass(frozen=True)
class AmenityImportRun:
    import_run_id: str
    neighborhood_id: str
    category_key: AmenityCategoryKey
    source_ref: str
    source_name: str
    source_version: str
    status: Literal["success", "partial", "empty", "failed"]
    started_at: datetime
    finished_at: datetime
    records_imported: int
    records_failed: int = 0
    records_skipped: int = 0
    withheld_address_count: int = 0
    unmatched_address_count: int = 0
    bbox_wgs84: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    bbox_rd: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    error_reason_code: str | None = None
    details: dict[str, object] | None = None


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def amenity_record_id(
    neighborhood_id: str,
    category_key: str,
    source_ref: str,
    record_id: str | None,
    name: str,
) -> str:
    raw = "|".join([neighborhood_id, category_key, source_ref, record_id or name])
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]
    return f"amenity_{digest}"


async def insert_amenity_import_run(run: AmenityImportRun) -> None:
    async with get_db() as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO match_amenity_import_runs (
                amenity_import_run_id, neighborhood_id, category_key, source_ref,
                source_name, source_version, status, started_at, finished_at,
                records_imported, records_failed, records_skipped,
                withheld_address_count, unmatched_address_count, bbox_wgs84_json,
                bbox_rd_json, error_reason_code, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run.import_run_id,
                run.neighborhood_id,
                run.category_key,
                run.source_ref,
                run.source_name,
                run.source_version,
                run.status,
                _iso(run.started_at),
                _iso(run.finished_at),
                run.records_imported,
                run.records_failed,
                run.records_skipped,
                run.withheld_address_count,
                run.unmatched_address_count,
                json.dumps(list(run.bbox_wgs84), separators=(",", ":")),
                json.dumps(list(run.bbox_rd), separators=(",", ":")),
                run.error_reason_code,
                json.dumps(run.details or {}, sort_keys=True, separators=(",", ":")),
            ),
        )
        await db.commit()


async def replace_successful_amenity_records(
    *,
    neighborhood_id: str,
    category_key: AmenityCategoryKey,
    source_ref: str,
    import_run_id: str,
    records: list[StoredAmenityRecord],
) -> None:
    if not records:
        return
    updated_at = _iso(datetime.now(UTC))
    async with get_db() as db:
        await db.execute(
            """
            DELETE FROM match_amenity_records
            WHERE neighborhood_id = ? AND category_key = ? AND source_ref = ?
            """,
            (neighborhood_id, category_key, source_ref),
        )
        for record in records:
            await db.execute(
                """
                INSERT OR REPLACE INTO match_amenity_records (
                    amenity_record_id, neighborhood_id, category_key, source_ref,
                    source_name, source_record_id, source_version, name,
                    freshness_date, loaded_at, display_lat, display_lng,
                    display_coordinate_system, source_coordinate_system,
                    source_geometry_coordinate_system, source_geometry_json,
                    bag_address_id, bag_vbo_id, bag_pand_id, withheld_address,
                    limitations_json, import_run_id, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'WGS84', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    amenity_record_id(
                        neighborhood_id,
                        record.category_key,
                        record.source_ref,
                        record.record_id,
                        record.name,
                    ),
                    neighborhood_id,
                    record.category_key,
                    record.source_ref,
                    record.source_name,
                    record.record_id,
                    record.source_version,
                    record.name,
                    record.freshness_date,
                    _iso(record.loaded_at),
                    record.display_lat,
                    record.display_lng,
                    record.source_coordinate_system,
                    record.source_geometry_coordinate_system,
                    json.dumps(record.source_geometry, sort_keys=True, separators=(",", ":")),
                    record.bag_address_id,
                    record.bag_vbo_id,
                    record.bag_pand_id,
                    1 if record.withheld_address else 0,
                    json.dumps(list(record.limitations), separators=(",", ":")),
                    import_run_id,
                    updated_at,
                ),
            )
        await db.commit()


def _row_to_record(row) -> StoredAmenityRecord:
    return StoredAmenityRecord(
        category_key=row["category_key"],
        record_id=row["source_record_id"],
        name=row["name"] or "",
        source_name=row["source_name"],
        source_ref=row["source_ref"],
        source_version=row["source_version"],
        freshness_date=row["freshness_date"] or "",
        loaded_at=_parse_datetime(row["loaded_at"]),
        display_lat=float(row["display_lat"]),
        display_lng=float(row["display_lng"]),
        source_coordinate_system=row["source_coordinate_system"],
        source_geometry_coordinate_system=row["source_geometry_coordinate_system"],
        source_geometry=json.loads(row["source_geometry_json"]),
        limitations=tuple(json.loads(row["limitations_json"] or "[]")),
        bag_address_id=row["bag_address_id"],
        bag_vbo_id=row["bag_vbo_id"],
        bag_pand_id=row["bag_pand_id"],
        withheld_address=bool(row["withheld_address"]),
    )


async def load_stored_amenity_records(
    *,
    neighborhood_id: str,
    bounds_wgs84: tuple[float, float, float, float],
    categories: tuple[AmenityCategoryKey, ...],
) -> list[StoredAmenityRecord]:
    if not categories:
        return []
    west, south, east, north = bounds_wgs84
    placeholders = ",".join("?" for _ in categories)
    async with get_db() as db:
        cursor = await db.execute(
            f"""
            SELECT *
            FROM match_amenity_records
            WHERE neighborhood_id = ?
              AND category_key IN ({placeholders})
              AND display_lng BETWEEN ? AND ?
              AND display_lat BETWEEN ? AND ?
            ORDER BY category_key, source_ref, source_record_id
            """,
            (neighborhood_id, *categories, west, east, south, north),
        )
        rows = await cursor.fetchall()
    return [_row_to_record(row) for row in rows]


async def load_stored_amenity_source_versions(
    categories: tuple[AmenityCategoryKey, ...],
) -> dict[AmenityCategoryKey, str]:
    versions: dict[AmenityCategoryKey, str] = {}
    async with get_db() as db:
        for category in categories:
            cursor = await db.execute(
                """
                SELECT source_ref, source_version, MAX(loaded_at) AS loaded_at
                FROM match_amenity_records
                WHERE category_key = ?
                GROUP BY source_ref, source_version
                ORDER BY loaded_at DESC, source_ref
                """,
                (category,),
            )
            rows = await cursor.fetchall()
            if not rows:
                versions[category] = "source_unconfigured"
                continue
            versions[category] = ";".join(
                f"{row['source_ref']}:{row['source_version']}:{row['loaded_at']}"
                for row in rows
            )
    return versions
