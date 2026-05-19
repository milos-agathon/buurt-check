from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from app.config import settings
from app.db import get_db, init_db
from app.models.address import ResolvedAddress
from app.services.match import amenity_ingestion
from app.services.match.amenity_ingestion import run_amenity_refresh_once
from app.services.match.geometry import display_bounds_wgs84, load_seed_neighborhood
from app.services.match.providers.amenities import (
    load_amenity_source_versions,
    load_official_amenity_records,
)


class FakeAmenityClient:
    def __init__(self, *, empty: bool = False, fail_lrk: bool = False) -> None:
        self.empty = empty
        self.fail_lrk = fail_lrk
        self.bbox_calls: list[tuple[str, tuple[float, float, float, float]]] = []

    async def fetch_duo_school_rows(self) -> list[dict[str, object]]:
        if self.empty:
            return []
        return [
            {
                "vestigingscode": "DUO-PO-1",
                "naam": "IKC Testschool",
                "straatnaam": "Teststraat",
                "huisnummer": "1",
                "postcode": "1234AB",
                "plaatsnaam": "Almere",
                "peildatum": "2026-05-01",
                "publicatiedatum": "2026-05-01",
            },
            {
                "vestigingscode": "DUO-OUTSIDE",
                "naam": "School Outside",
                "straatnaam": "Buitenstraat",
                "huisnummer": "99",
                "postcode": "9999ZZ",
                "plaatsnaam": "Utrecht",
                "peildatum": "2026-05-01",
                "publicatiedatum": "2026-05-01",
            },
        ]

    async def fetch_lrk_childcare_rows(self) -> list[dict[str, object]]:
        if self.fail_lrk:
            raise TimeoutError("lrk timeout")
        if self.empty:
            return []
        return [
            {
                "lrk_id": "LRK-0001",
                "naam": "Kindcentrum Test",
                "type_oko": "KDV",
                "straatnaam": "Opvanglaan",
                "huisnummer": "2",
                "postcode": "1234AC",
                "plaatsnaam": "Almere",
                "peildatum": "2026-05-18",
            },
            {
                "lrk_id": "LRK-PRIVATE",
                "naam": "Gastouder Thuis",
                "type_oko": "VGO",
                "opvang_op_adres_vraagouder": "ja",
                "straatnaam": "",
                "huisnummer": "",
                "postcode": "",
                "plaatsnaam": "Almere",
                "peildatum": "2026-05-18",
            },
        ]

    async def match_bag_address(self, query: str) -> ResolvedAddress | None:
        if "Buitenstraat" in query:
            return ResolvedAddress(
                id="adr-outside",
                display_name="Buitenstraat 99, Utrecht",
                latitude=52.0900,
                longitude=5.1200,
                rd_x=136000.0,
                rd_y=455000.0,
            )
        if "Teststraat" in query:
            return ResolvedAddress(
                id="adr-school",
                nummeraanduiding_id="0363200000000001",
                adresseerbaar_object_id="0363010000000001",
                display_name="Teststraat 1, Almere",
                latitude=52.3630,
                longitude=5.1240,
                rd_x=147040.0,
                rd_y=486200.0,
            )
        if "Opvanglaan" in query:
            return ResolvedAddress(
                id="adr-childcare",
                nummeraanduiding_id="0363200000000002",
                adresseerbaar_object_id="0363010000000002",
                display_name="Opvanglaan 2, Almere",
                latitude=52.3620,
                longitude=5.1260,
                rd_x=147176.0,
                rd_y=486087.0,
            )
        return None

    async def fetch_pdok_green_features(
        self,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]:
        self.bbox_calls.append(("parks_green", bounds_rd))
        if self.empty:
            return {"type": "FeatureCollection", "features": []}
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "id": "bgt-groen-1",
                    "properties": {
                        "lokaal_id": "bgt-groen-1",
                        "naam": "Testpark",
                        "bgt_functie": "park",
                        "bronhouder": "Gemeente Almere",
                        "eind_registratie": None,
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [5.1235, 52.3625],
                                [5.1265, 52.3625],
                                [5.1265, 52.3640],
                                [5.1235, 52.3640],
                                [5.1235, 52.3625],
                            ]
                        ],
                    },
                }
            ],
        }

    async def fetch_pdok_sports_features(
        self,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]:
        self.bbox_calls.append(("sports_fields", bounds_rd))
        if self.empty:
            return {"type": "FeatureCollection", "features": []}
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "id": "bgt-sport-1",
                    "properties": {
                        "lokaal_id": "bgt-sport-1",
                        "naam": "Sportveld Test",
                        "bgt_functie": "recreatie: sportterrein",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [5.1270, 52.3605],
                                [5.1290, 52.3605],
                                [5.1290, 52.3618],
                                [5.1270, 52.3618],
                                [5.1270, 52.3605],
                            ]
                        ],
                    },
                }
            ],
        }

    async def fetch_bag_sport_features(
        self,
        bounds_rd: tuple[float, float, float, float],
    ) -> dict[str, object]:
        self.bbox_calls.append(("bag_sportfunctie", bounds_rd))
        if self.empty:
            return {"type": "FeatureCollection", "features": []}
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "id": "bag-vbo-sport-1",
                    "properties": {
                        "identificatie": "0363010000000099",
                        "gebruiksdoel": "sportfunctie",
                        "status": "Verblijfsobject in gebruik",
                    },
                    "geometry": {"type": "Point", "coordinates": [5.1282, 52.3610]},
                }
            ],
        }


@pytest.fixture
async def amenity_ingestion_db(tmp_path):
    db_path = str(tmp_path / "amenity_ingestion.db")
    await init_db(db_path)
    original_db_path = settings.database_path
    settings.database_path = db_path
    try:
        yield db_path
    finally:
        settings.database_path = original_db_path


@pytest.mark.asyncio
async def test_lrk_duo_pdok_bag_refresh_stores_exact_scoped_amenity_records(
    amenity_ingestion_db,
):
    neighborhood_id = "nh_almere_poort"
    client = FakeAmenityClient()
    result = await run_amenity_refresh_once(
        neighborhood_ids=(neighborhood_id,),
        client=client,
        now=datetime(2026, 5, 19, 9, 30, tzinfo=UTC),
    )

    assert result.overall_status == "success"
    coverage = {item.source_ref: item for item in result.coverage}
    assert coverage["duo_open_onderwijsdata_bag"].records_imported == 1
    assert coverage["lrk_bag_locations"].records_imported == 1
    assert coverage["lrk_bag_locations"].withheld_address_count == 1
    assert coverage["pdok_bgt_brt_green"].records_imported == 1
    assert coverage["pdok_bgt_bag_sports"].records_imported == 2
    assert {call[0] for call in client.bbox_calls} == {
        "parks_green",
        "sports_fields",
        "bag_sportfunctie",
    }

    neighborhood = await load_seed_neighborhood(neighborhood_id)
    records, unavailable = await load_official_amenity_records(
        neighborhood_id,
        display_bounds_wgs84(neighborhood),
        ("transit", "schools", "childcare", "parks_green", "sports_fields"),
    )
    by_category = {}
    for record in records:
        by_category.setdefault(record.category_key, []).append(record)

    assert "transit" not in by_category
    assert any(item.category_key == "transit" for item in unavailable)
    assert by_category["schools"][0].record_id == "DUO-PO-1"
    assert by_category["schools"][0].source_name.startswith("DUO Open Onderwijsdata")
    assert by_category["schools"][0].display_lat == pytest.approx(52.3630)
    assert by_category["schools"][0].source_coordinate_system == "EPSG:28992"
    assert by_category["schools"][0].source_geometry == {
        "type": "Point",
        "coordinates": [147040.0, 486200.0],
    }
    assert by_category["childcare"][0].record_id == "LRK-0001"
    assert by_category["childcare"][0].freshness_date == "2026-05-18"
    green = by_category["parks_green"][0]
    assert green.display_lng == pytest.approx(5.1250)
    assert green.source_geometry["type"] == "Polygon"
    assert green.source_geometry_coordinate_system == "EPSG:4326"
    assert {item.source_ref for item in by_category["sports_fields"]} == {
        "pdok_bgt_sportterrein",
        "pdok_bag_sportfunctie",
    }


@pytest.mark.asyncio
async def test_amenity_refresh_does_not_replace_previous_success_with_empty_or_failed_runs(
    amenity_ingestion_db,
):
    neighborhood_id = "nh_almere_poort"
    first = await run_amenity_refresh_once(
        neighborhood_ids=(neighborhood_id,),
        client=FakeAmenityClient(),
        now=datetime(2026, 5, 19, 9, 30, tzinfo=UTC),
    )
    assert first.overall_status == "success"

    second = await run_amenity_refresh_once(
        neighborhood_ids=(neighborhood_id,),
        client=FakeAmenityClient(empty=True, fail_lrk=True),
        now=datetime(2026, 5, 19, 10, 30, tzinfo=UTC),
    )

    assert second.overall_status == "failed"
    assert all(item.records_imported == 0 for item in second.coverage)
    neighborhood = await load_seed_neighborhood(neighborhood_id)
    records, _unavailable = await load_official_amenity_records(
        neighborhood_id,
        display_bounds_wgs84(neighborhood),
        ("schools", "childcare", "parks_green", "sports_fields"),
    )
    assert {record.category_key for record in records} == {
        "schools",
        "childcare",
        "parks_green",
        "sports_fields",
    }


@pytest.mark.asyncio
async def test_amenity_source_versions_reflect_loaded_official_source_dates(
    amenity_ingestion_db,
):
    await run_amenity_refresh_once(
        neighborhood_ids=("nh_almere_poort",),
        client=FakeAmenityClient(),
        now=datetime(2026, 5, 19, 9, 30, tzinfo=UTC),
    )

    versions = await load_amenity_source_versions(
        ("transit", "schools", "childcare", "parks_green", "sports_fields")
    )

    assert versions["transit"] == "source_unconfigured"
    assert versions["schools"].startswith("duo_open_onderwijsdata_bag:2026-05-01:")
    assert versions["childcare"].startswith("lrk_bag_locations:2026-05-18:")
    assert "pdok_bgt_brt_green" in versions["parks_green"]
    assert "pdok_bgt_sportterrein" in versions["sports_fields"]
    assert "pdok_bag_sportfunctie" in versions["sports_fields"]

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT status, records_failed, records_skipped, details_json "
            "FROM match_amenity_import_runs ORDER BY started_at"
        )
        rows = await cursor.fetchall()
    assert rows
    assert all(row["status"] in {"success", "partial", "empty"} for row in rows)


@pytest.mark.asyncio
async def test_amenity_refresh_scheduler_runs_configured_startup_refresh(monkeypatch):
    calls = 0
    stop_event = asyncio.Event()

    async def fake_refresh_once():
        nonlocal calls
        calls += 1
        stop_event.set()

    monkeypatch.setattr(settings, "match_amenity_refresh_on_startup", True)
    monkeypatch.setattr(settings, "match_amenity_refresh_interval_hours", 1)
    monkeypatch.setattr(amenity_ingestion, "run_amenity_refresh_once", fake_refresh_once)

    await amenity_ingestion.run_amenity_refresh_scheduler(stop_event)

    assert calls == 1
