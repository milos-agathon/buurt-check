import asyncio
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.db import init_db
from app.models.address import ResolvedAddress
from app.models.match import MatchNeighborhoodAmenityPoint, MatchSessionResponse
from app.models.neighborhood3d import BuildingBlock
from app.services.bag_ogc import BagPandFootprint, BagPandFootprintPage
from app.services.match import amenities as amenities_service
from app.services.match import buildings as buildings_service
from app.services.match import geometry as geometry_service
from app.services.match.amenity_ingestion import run_amenity_refresh_once
from app.services.match.amenity_store import StoredAmenityRecord
from app.services.match.buildings import get_scoped_neighborhood_buildings
from app.services.match.geometry import get_neighborhood_map_layers, rd_to_wgs84
from app.services.match.providers.amenities import load_official_amenity_records
from tests.test_match_amenity_ingestion import FakeAmenityClient
from tests.test_match_sessions import COMPLETE_ANSWERS

ORIGINAL_FETCH_OFFICIAL_BOUNDARY_FEATURE = geometry_service.fetch_official_boundary_feature


@pytest.fixture
async def match_neighborhood_layers_db(tmp_path):
    db_path = str(tmp_path / "match_neighborhood_layers.db")
    await init_db(db_path)

    async def default_official_boundary(neighborhood):
        center_x = float(neighborhood.centroid_rd_x or 155000.0)
        center_y = float(neighborhood.centroid_rd_y or 463000.0)
        radius_m = 900.0
        rd_ring = [
            (center_x - radius_m, center_y - radius_m),
            (center_x + radius_m, center_y - radius_m),
            (center_x + radius_m, center_y + radius_m),
            (center_x - radius_m, center_y + radius_m),
            (center_x - radius_m, center_y - radius_m),
        ]
        wgs_ring = [
            [rd_to_wgs84(x, y)["lng"], rd_to_wgs84(x, y)["lat"]]
            for x, y in rd_ring
        ]
        return {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [wgs_ring]},
            "properties": {
                "neighborhood_id": neighborhood.neighborhood_id,
                "boundary_ref": (
                    "cbs_wijk_en_buurtkaart_2024:buurten:"
                    f"{neighborhood.neighborhood_id}"
                ),
                "boundary_source": "cbs_wijk_en_buurtkaart_2024",
                "boundary_source_name": "CBS Wijk- en Buurtkaart 2024 via PDOK",
                "boundary_freshness": "current",
                "display_coordinate_system": "WGS84",
                "official_code": f"BU_TEST_{neighborhood.neighborhood_id}",
                "official_name": neighborhood.name_en or neighborhood.name_nl,
                "official_collection": "buurten",
            },
        }

    with (
        patch.object(settings, "database_path", db_path),
        patch.object(settings, "match_building_footprint_provider", "3dbag", create=True),
        patch.object(
            geometry_service,
            "fetch_official_boundary_feature",
            default_official_boundary,
        ),
        patch.object(
            amenities_service,
            "selected_official_or_fallback_boundary_feature",
            default_official_boundary,
        ),
    ):
        yield


async def _run_completed_match(client):
    create_response = await client.post(
        "/api/match/sessions",
        json={"locale": "en", "source": "landing"},
    )
    assert create_response.status_code == 201
    session_id = create_response.json()["session_id"]

    patch_response = await client.patch(
        f"/api/match/sessions/{session_id}/answers",
        json={"locale": "en", "current_step": 11, "answers": COMPLETE_ANSWERS},
    )
    assert patch_response.status_code == 200
    session_response = await client.get(f"/api/match/sessions/{session_id}")
    vector_version = session_response.json()["preference_vector_version"]

    run_response = await client.post(
        f"/api/match/sessions/{session_id}/run",
        json={
            "source": "review_final_cta",
            "preference_vector_version": vector_version,
        },
    )
    assert run_response.status_code == 202

    results_response = await client.get(f"/api/match/sessions/{session_id}/results")
    assert results_response.status_code == 200
    return results_response.json()


async def _seed_official_amenities(neighborhood_id: str) -> None:
    amenities_service.clear_amenity_response_cache()
    await run_amenity_refresh_once(
        neighborhood_ids=(neighborhood_id,),
        client=FakeAmenityClient(),
    )


def _bridge_payload(results: dict[str, object], **overrides):
    selected = (results["ranked_results"])[0]
    session_id = results["session_id"]
    neighborhood_id = selected["neighborhood_id"]
    building_id = f"bldg_{neighborhood_id}_001"
    return_context = {
        "session_id": session_id,
        "job_id": results["job_id"],
        "result_set_id": results["result_set_id"],
        "preference_vector_version": results["preference_vector_version"],
        "source": "match_map",
        "return_url": f"#/match/session/{session_id}/neighborhood/{neighborhood_id}",
        "map_center": [52.36, 4.9],
        "map_zoom": 13,
        "list_scroll": 240,
        "mobile_mode": "list",
        "selected_result_id": selected["recommendation_id"],
        "selected_result_rank": selected["rank"],
        "language": "nl",
        "selected_house_id": building_id,
    }
    payload = {
        "session_id": session_id,
        "neighborhood_id": neighborhood_id,
        "building_id": building_id,
        "address_id": "0363010000123456",
        "vbo_id": "0363010000123456",
        "lookup_id": "adr-abc123",
        "return_context": return_context,
    }
    nested_context = overrides.pop("return_context", None)
    if nested_context:
        payload["return_context"] = {**return_context, **nested_context}
    payload.update(overrides)
    return payload


def _route_query(route: str):
    parsed = urlparse(route[1:] if route.startswith("#") else route)
    return parse_qs(parsed.query)


def _provider_address(
    *,
    lookup_id: str,
    vbo_id: str,
    display_name: str,
    house_number: str,
    latitude: float,
    longitude: float,
) -> ResolvedAddress:
    return ResolvedAddress(
        id=lookup_id,
        nummeraanduiding_id=vbo_id.replace("036301", "036320", 1),
        adresseerbaar_object_id=vbo_id,
        display_name=display_name,
        street="IJburglaan",
        house_number=house_number,
        postcode="1087JK",
        city="Amsterdam",
        municipality="Amsterdam",
        province="Noord-Holland",
        latitude=latitude,
        longitude=longitude,
        rd_x=126250.0,
        rd_y=486800.0,
        buurt_code="BU0363AA01",
        wijk_code="WK0363AA",
    )


def _provider_addresses() -> list[ResolvedAddress]:
    return [
        _provider_address(
            lookup_id="adr-provider-1",
            vbo_id="0363010000987651",
            display_name="IJburglaan 1000, 1087JK Amsterdam",
            house_number="1000",
            latitude=52.3551,
            longitude=5.0001,
        ),
        _provider_address(
            lookup_id="adr-provider-2",
            vbo_id="0363010000987652",
            display_name="IJburglaan 1002, 1087JK Amsterdam",
            house_number="1002",
            latitude=52.3552,
            longitude=5.0002,
        ),
    ]


def _lod22_building_block(
    pand_id: str = "0363100012253924",
    *,
    footprint: list[list[float]] | None = None,
) -> BuildingBlock:
    block_footprint = footprint or [
        [-15.0, -10.0],
        [12.0, -10.0],
        [12.0, 9.0],
        [-15.0, 9.0],
        [-15.0, -10.0],
    ]
    return BuildingBlock(
        pand_id=pand_id,
        ground_height=1.25,
        building_height=8.5,
        footprint=block_footprint,
        year=2019,
        roof_surfaces=[
            [
                [block_footprint[0][0], block_footprint[0][1], 1.25],
                [block_footprint[1][0], block_footprint[1][1], 1.25],
                [block_footprint[2][0], block_footprint[2][1], 9.75],
                [block_footprint[3][0], block_footprint[3][1], 9.75],
            ],
            [
                [block_footprint[0][0], block_footprint[0][1], 1.25],
                [block_footprint[3][0], block_footprint[3][1], 9.75],
                [block_footprint[3][0], block_footprint[3][1], 1.25],
            ],
        ],
        orientation_deg=90.0,
    )


def _building_page(
    blocks: list[BuildingBlock],
    *,
    next_cursor: str | None = None,
    partial: bool = False,
):
    return SimpleNamespace(blocks=blocks, next_cursor=next_cursor, partial=partial)


def _bag_pand_footprint(
    pand_id: str,
    *,
    center_x: float,
    center_y: float,
    offset_x: float,
    status: str = "Pand in gebruik",
    gebruiksdoelen: list[str] | None = None,
    aantal_verblijfsobjecten: int | None = 1,
    usage_classification: str = "residential",
    house_selectable: bool = True,
) -> BagPandFootprint:
    footprint_rd = [
        [offset_x, -10.0],
        [offset_x + 20.0, -10.0],
        [offset_x + 20.0, 10.0],
        [offset_x, 10.0],
        [offset_x, -10.0],
    ]
    footprint = {
        "type": "Polygon",
        "coordinates": [[
            [
                round(rd_to_wgs84(center_x + dx, center_y + dy)["lng"], 7),
                round(rd_to_wgs84(center_x + dx, center_y + dy)["lat"], 7),
            ]
            for dx, dy in footprint_rd
        ]],
    }
    return BagPandFootprint(
        pand_id=pand_id,
        status=status,
        gebruiksdoelen=gebruiksdoelen or ["woonfunctie"],
        aantal_verblijfsobjecten=aantal_verblijfsobjecten,
        bouwjaar=1994,
        documentdatum="2026-04-22",
        footprint=footprint,
        footprint_rd=footprint_rd,
        usage_classification=usage_classification,
        house_selectable=house_selectable,
    )


def _official_boundary_square_around_rd(
    neighborhood_id: str,
    *,
    center_x: float,
    center_y: float,
    radius_m: float,
) -> dict[str, object]:
    rd_ring = [
        (center_x - radius_m, center_y - radius_m),
        (center_x + radius_m, center_y - radius_m),
        (center_x + radius_m, center_y + radius_m),
        (center_x - radius_m, center_y + radius_m),
        (center_x - radius_m, center_y - radius_m),
    ]
    wgs_ring = [
        [rd_to_wgs84(x, y)["lng"], rd_to_wgs84(x, y)["lat"]]
        for x, y in rd_ring
    ]
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": [wgs_ring]},
        "properties": {
            "neighborhood_id": neighborhood_id,
            "boundary_ref": f"cbs_wijk_en_buurtkaart_2024:buurten:{neighborhood_id}",
            "boundary_source": "cbs_wijk_en_buurtkaart_2024",
            "boundary_source_name": "CBS Wijk- en Buurtkaart 2024 via PDOK",
            "boundary_freshness": "current",
            "display_coordinate_system": "WGS84",
            "official_code": "BU_TEST",
            "official_name": neighborhood_id,
            "official_collection": "buurten",
        },
    }


def _patch_provider_addresses(monkeypatch, addresses: list[ResolvedAddress] | None = None):
    provider = AsyncMock(return_value=addresses if addresses is not None else _provider_addresses())
    monkeypatch.setattr(buildings_service.locatieserver, "reverse_addresses", provider)
    return provider


@pytest.mark.asyncio
async def test_selected_neighborhood_summary_and_map_layers_are_scoped(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    selected = results["ranked_results"][0]
    neighborhood_id = selected["neighborhood_id"]
    official_boundary = {
        "type": "Feature",
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [[[
                [4.953, 52.361],
                [4.970, 52.362],
                [4.974, 52.371],
                [4.961, 52.375],
                [4.953, 52.361],
            ]]],
        },
        "properties": {
            "neighborhood_id": neighborhood_id,
            "boundary_ref": "cbs_wijk_en_buurtkaart_2024:buurten:BU0363MJ01",
            "boundary_source": "cbs_wijk_en_buurtkaart_2024",
            "boundary_source_name": "CBS Wijk- en Buurtkaart 2024 via PDOK",
            "boundary_freshness": "current",
            "display_coordinate_system": "WGS84",
            "official_code": "BU0363MJ01",
            "official_name": "Steigereiland-Zuid",
            "official_collection": "buurten",
        },
    }

    async def fake_official_boundary(neighborhood):
        assert neighborhood.neighborhood_id == neighborhood_id
        return official_boundary

    monkeypatch.setattr(
        geometry_service,
        "fetch_official_boundary_feature",
        fake_official_boundary,
        raising=False,
    )

    summary_response = await client.get(f"/api/match/neighborhoods/{neighborhood_id}")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["neighborhood_id"] == neighborhood_id
    assert summary["centroid_rd"]["x"] > 0
    assert len(summary["bounds_rd"]) == 4
    assert "display_centroid_wgs84" in summary
    assert "display_bounds_wgs84" in summary
    assert summary["boundary_ref"] == "cbs_wijk_en_buurtkaart_2024:buurten:BU0363MJ01"
    assert summary_response.headers["cache-control"] == "no-store"

    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    layers = layer_response.json()
    assert layers["neighborhood_id"] == neighborhood_id
    assert layers["allowed_bounds_rd"] == summary["bounds_rd"]
    assert layers["boundary"]["properties"]["neighborhood_id"] == neighborhood_id
    assert layers["boundary"]["geometry"] == official_boundary["geometry"]
    assert layers["boundary"]["properties"]["boundary_source"] == "cbs_wijk_en_buurtkaart_2024"
    assert layers["boundary"]["properties"]["boundary_freshness"] == "current"
    assert layers["display_bounds_wgs84"] == pytest.approx([4.953, 52.361, 4.974, 52.375])
    assert "cbs_wijk_en_buurtkaart_2024" in layers["source_refs"]
    assert layers["building_layer"]["endpoint"].endswith(f"/{neighborhood_id}/buildings")
    assert layers["building_layer"]["available"] is True
    assert layers["building_layer"]["fallback_reason_code"] is None
    assert layers["amenity_layer"]["endpoint"].endswith(f"/{neighborhood_id}/amenities")
    assert layers["fallback_2d_available"] is True


@pytest.mark.asyncio
async def test_map_layers_do_not_emit_seed_bbox_as_selected_boundary_when_official_unavailable(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]

    async def no_official_boundary(_neighborhood):
        return None

    monkeypatch.setattr(
        geometry_service,
        "fetch_official_boundary_feature",
        no_official_boundary,
        raising=False,
    )

    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )

    assert layer_response.status_code == 200
    layers = layer_response.json()
    assert layers["boundary"]["geometry"] == {"type": "MultiPolygon", "coordinates": []}
    assert layers["boundary"]["properties"]["boundary_source"] == "unavailable"
    assert (
        layers["boundary"]["properties"]["fallback_reason_code"]
        == "match.boundary.official_unavailable"
    )
    assert layers["building_layer"]["available"] is False
    assert (
        layers["building_layer"]["fallback_reason_code"]
        == "matchFirst.neighborhood.boundaryUnavailable"
    )
    assert layers["amenity_layer"]["available"] is False
    assert "match.results.limitations.official_boundary_unavailable" in layers["limitations"]


def test_official_boundary_parser_matches_cbs_name_when_seed_code_is_stale():
    seed_neighborhood = geometry_service.Neighborhood(
        neighborhood_id="nh_den_haag_statenkwartier",
        official_code="BU051822",
        name_nl="Statenkwartier",
        name_en="Statenkwartier",
        municipality="Den Haag",
        province="Zuid-Holland",
        geography_level="neighborhood",
        centroid_rd_x=79200.0,
        centroid_rd_y=457200.0,
        mock_status="seeded_mock",
    )
    feature = geometry_service.select_official_boundary_candidate(
        seed_neighborhood,
        "buurten",
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [4.26, 52.08],
                            [4.286, 52.081],
                            [4.285, 52.102],
                            [4.261, 52.102],
                            [4.26, 52.08],
                        ]],
                    },
                    "properties": {
                        "buurtcode": "BU05180907",
                        "buurtnaam": "Statenkwartier",
                        "gemeentenaam": "Den Haag",
                    },
                },
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [4.28, 52.08],
                            [4.29, 52.08],
                            [4.29, 52.09],
                            [4.28, 52.09],
                            [4.28, 52.08],
                        ]],
                    },
                    "properties": {
                        "buurtcode": "BU05180908",
                        "buurtnaam": "Geuzenkwartier",
                        "gemeentenaam": "Den Haag",
                    },
                },
            ],
        },
    )

    assert feature is not None
    assert feature["properties"]["official_code"] == "BU05180907"
    assert feature["properties"]["official_name"] == "Statenkwartier"
    assert feature["properties"]["boundary_ref"] == "cbs_wijk_en_buurtkaart_2024:buurten:BU05180907"
    assert feature["properties"]["boundary_freshness"] == "current"


def test_official_boundary_parser_accepts_nearby_stale_seed_centroid():
    seed_neighborhood = geometry_service.Neighborhood(
        neighborhood_id="nh_den_haag_statenkwartier",
        official_code="BU051822",
        name_nl="Statenkwartier",
        name_en="Statenkwartier",
        municipality="Den Haag",
        province="Zuid-Holland",
        geography_level="neighborhood",
        centroid_rd_x=78500.0,
        centroid_rd_y=455800.0,
        mock_status="seeded_mock",
    )
    feature = geometry_service.select_official_boundary_candidate(
        seed_neighborhood,
        "buurten",
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [4.2702541, 52.0857779],
                            [4.2859993, 52.0857779],
                            [4.2859993, 52.1022801],
                            [4.2702541, 52.1022801],
                            [4.2702541, 52.0857779],
                        ]],
                    },
                    "properties": {
                        "buurtcode": "BU05180907",
                        "buurtnaam": "Statenkwartier",
                        "gemeentenaam": "'s-Gravenhage",
                    },
                },
            ],
        },
    )

    assert feature is not None
    assert feature["properties"]["official_code"] == "BU05180907"
    assert feature["properties"]["official_name"] == "Statenkwartier"


def test_official_boundary_parser_rejects_same_name_outside_seed_bounds():
    seed_neighborhood = geometry_service.Neighborhood(
        neighborhood_id="nh_den_haag_statenkwartier",
        official_code="BU051822",
        name_nl="Statenkwartier",
        name_en="Statenkwartier",
        municipality="Den Haag",
        province="Zuid-Holland",
        geography_level="neighborhood",
        centroid_rd_x=78500.0,
        centroid_rd_y=455800.0,
        mock_status="seeded_mock",
    )
    feature = geometry_service.select_official_boundary_candidate(
        seed_neighborhood,
        "buurten",
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [5.0, 53.0],
                            [5.02, 53.0],
                            [5.02, 53.02],
                            [5.0, 53.02],
                            [5.0, 53.0],
                        ]],
                    },
                    "properties": {
                        "buurtcode": "BU99999999",
                        "buurtnaam": "Statenkwartier",
                        "gemeentenaam": "'s-Gravenhage",
                    },
                },
            ],
        },
    )

    assert feature is None


@pytest.mark.asyncio
async def test_official_boundary_lookup_accepts_current_wijk_name_variant_for_stale_ijburg_seed(
    monkeypatch,
):
    seed_neighborhood = geometry_service.Neighborhood(
        neighborhood_id="nh_amsterdam_ijburg",
        official_code="BU036307",
        name_nl="IJburg",
        name_en="IJburg",
        municipality="Amsterdam",
        province="Noord-Holland",
        geography_level="neighborhood",
        centroid_rd_x=126250.0,
        centroid_rd_y=486800.0,
        mock_status="seeded_mock",
    )
    payloads = {
        "buurten": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [4.957, 52.343],
                            [5.039, 52.343],
                            [5.039, 52.381],
                            [4.957, 52.381],
                            [4.957, 52.343],
                        ]],
                    },
                    "properties": {
                        "buurtcode": "BU03639998",
                        "buurtnaam": "Groot binnenwater",
                        "gemeentenaam": "Amsterdam",
                    },
                },
            ],
        },
        "wijken": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [4.974, 52.350],
                            [5.007, 52.350],
                            [5.007, 52.366],
                            [4.974, 52.366],
                            [4.974, 52.350],
                        ]],
                    },
                    "properties": {
                        "wijkcode": "WK0363MJ",
                        "wijknaam": "IJburg-West",
                        "gemeentenaam": "Amsterdam",
                    },
                },
            ],
        },
    }

    async def fake_fetch_collection(collection, bounds_wgs84):
        assert bounds_wgs84
        return payloads[collection]

    geometry_service._OFFICIAL_BOUNDARY_CACHE.clear()
    monkeypatch.setattr(
        geometry_service,
        "fetch_official_boundary_feature",
        ORIGINAL_FETCH_OFFICIAL_BOUNDARY_FEATURE,
    )
    monkeypatch.setattr(
        geometry_service,
        "_fetch_official_boundary_collection",
        fake_fetch_collection,
    )

    feature = await geometry_service.fetch_official_boundary_feature(seed_neighborhood)

    assert feature is not None
    assert feature["properties"]["boundary_source"] == "cbs_wijk_en_buurtkaart_2024"
    assert feature["properties"]["official_collection"] == "wijken"
    assert feature["properties"]["official_code"] == "WK0363MJ"
    assert feature["properties"]["official_name"] == "IJburg-West"
    assert feature["geometry"]["coordinates"][0] != [
        [4.9532596, 52.3610984],
        [4.9768884, 52.3610984],
        [4.9768884, 52.375562],
        [4.9532596, 52.375562],
        [4.9532596, 52.3610984],
    ]


@pytest.mark.asyncio
async def test_official_boundary_lookup_prefers_stronger_wijk_match_over_buurt_contains(
    monkeypatch,
):
    seed_neighborhood = geometry_service.Neighborhood(
        neighborhood_id="nh_utrecht_leidsche_rijn",
        official_code="BU034406",
        name_nl="Leidsche Rijn",
        name_en="Leidsche Rijn",
        municipality="Utrecht",
        province="Utrecht",
        geography_level="neighborhood",
        centroid_rd_x=131200.0,
        centroid_rd_y=456800.0,
        mock_status="seeded_mock",
    )
    payloads = {
        "buurten": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [5.05, 52.08],
                            [5.07, 52.08],
                            [5.07, 52.09],
                            [5.05, 52.09],
                            [5.05, 52.08],
                        ]],
                    },
                    "properties": {
                        "buurtcode": "BU03440931",
                        "buurtnaam": "Leidsche Rijn-Centrum",
                        "gemeentenaam": "Utrecht",
                    },
                },
            ],
        },
        "wijken": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[
                                [5.039, 52.07],
                                [5.08, 52.07],
                                [5.08, 52.10],
                                [5.039, 52.10],
                                [5.039, 52.07],
                            ]],
                        },
                    "properties": {
                        "wijkcode": "WK034409",
                        "wijknaam": "Wijk 09 Leidsche Rijn",
                        "gemeentenaam": "Utrecht",
                    },
                },
            ],
        },
    }

    async def fake_fetch_collection(collection, bounds_wgs84):
        assert bounds_wgs84
        return payloads[collection]

    geometry_service._OFFICIAL_BOUNDARY_CACHE.clear()
    monkeypatch.setattr(
        geometry_service,
        "fetch_official_boundary_feature",
        ORIGINAL_FETCH_OFFICIAL_BOUNDARY_FEATURE,
    )
    monkeypatch.setattr(
        geometry_service,
        "_fetch_official_boundary_collection",
        fake_fetch_collection,
    )

    feature = await geometry_service.fetch_official_boundary_feature(seed_neighborhood)

    assert feature is not None
    assert feature["properties"]["official_collection"] == "wijken"
    assert feature["properties"]["official_code"] == "WK034409"
    assert feature["properties"]["official_name"] == "Wijk 09 Leidsche Rijn"


@pytest.mark.asyncio
async def test_selected_detail_display_bounds_follow_rd_new_for_missing_data_seed(
    match_neighborhood_layers_db,
    monkeypatch,
):
    neighborhood_id = "nh_seed_missing_data_example"
    layers = (
        await get_neighborhood_map_layers(
            neighborhood_id,
            session_id="match-crs-proof",
            result_set_id="mrs-crs-proof",
        )
    ).model_dump(mode="json")
    west, south, east, north = layers["display_bounds_wgs84"]
    display_center_lng = (west + east) / 2
    display_center_lat = (south + north) / 2
    assert display_center_lng == pytest.approx(4.87608, abs=0.00005)
    assert display_center_lat == pytest.approx(52.12710, abs=0.00005)
    assert display_center_lng != pytest.approx(4.92, abs=0.001)

    lod22_provider = AsyncMock(
        return_value=_building_page([_lod22_building_block("0363100012253999")])
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        lod22_provider,
        raising=False,
    )

    scoped_response = await get_scoped_neighborhood_buildings(
        neighborhood_id,
        session_id="match-crs-proof",
        result_set_id="mrs-crs-proof",
        bounds_rd=layers["allowed_bounds_rd"],
        lod="low",
        limit=25,
    )
    building = scoped_response.model_dump(mode="json")["buildings"][0]
    ring = building["footprint"]["coordinates"][0][:-1]
    footprint_center_lng = sum(point[0] for point in ring) / len(ring)
    footprint_center_lat = sum(point[1] for point in ring) / len(ring)
    assert footprint_center_lng == pytest.approx(display_center_lng, abs=0.0003)
    assert footprint_center_lat == pytest.approx(display_center_lat, abs=0.0003)
    assert west < footprint_center_lng < east
    assert south < footprint_center_lat < north


@pytest.mark.asyncio
async def test_scoped_building_requests_do_not_fetch_provider_without_official_boundary(
    match_neighborhood_layers_db,
    monkeypatch,
):
    neighborhood_id = "nh_amsterdam_ijburg"
    neighborhood = await geometry_service.load_seed_neighborhood(neighborhood_id)
    provider = AsyncMock(
        return_value=BagPandFootprintPage(
            pands=[
                _bag_pand_footprint(
                    "0363100012253999",
                    center_x=126250.0,
                    center_y=486800.0,
                    offset_x=0.0,
                )
            ],
            partial=False,
        )
    )

    async def no_official_boundary(_neighborhood):
        return None

    monkeypatch.setattr(
        geometry_service,
        "fetch_official_boundary_feature",
        no_official_boundary,
        raising=False,
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_bag_pand_footprint_page_for_bounds",
        provider,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_building_footprint_provider", "pdok_bag", raising=False)

    response = await get_scoped_neighborhood_buildings(
        neighborhood_id,
        session_id="match-official-boundary-required",
        result_set_id="mrs-official-boundary-required",
        bounds_rd=geometry_service.neighborhood_bounds_rd(neighborhood),
        lod="low",
        limit=25,
    )

    provider.assert_not_awaited()
    assert response.buildings == []
    assert response.fallback_reason_code == "matchFirst.neighborhood.boundaryUnavailable"
    assert response.source_refs == []
    assert "match.results.limitations.official_boundary_unavailable" in response.limitations


@pytest.mark.asyncio
async def test_scoped_3dbag_offsets_are_projected_from_absolute_rd_new(
    match_neighborhood_layers_db,
    monkeypatch,
):
    neighborhood_id = "nh_seed_missing_data_example"
    layers = (
        await get_neighborhood_map_layers(
            neighborhood_id,
            session_id="match-rd-offset-proof",
            result_set_id="mrs-rd-offset-proof",
        )
    ).model_dump(mode="json")
    footprint = [
        [760.0, -260.0],
        [790.0, -260.0],
        [790.0, -230.0],
        [760.0, -230.0],
        [760.0, -260.0],
    ]
    lod22_provider = AsyncMock(
        return_value=_building_page([
            _lod22_building_block("0363100012254888", footprint=footprint),
        ])
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        lod22_provider,
        raising=False,
    )

    scoped_response = await get_scoped_neighborhood_buildings(
        neighborhood_id,
        session_id="match-rd-offset-proof",
        result_set_id="mrs-rd-offset-proof",
        bounds_rd=layers["allowed_bounds_rd"],
        lod="low",
        limit=25,
    )

    building = scoped_response.model_dump(mode="json")["buildings"][0]
    center_rd = building["center_rd"]
    first_lng, first_lat = building["footprint"]["coordinates"][0][0]
    expected = rd_to_wgs84(center_rd["x"] + footprint[0][0], center_rd["y"] + footprint[0][1])
    assert first_lng == pytest.approx(round(expected["lng"], 7), abs=0.0000001)
    assert first_lat == pytest.approx(round(expected["lat"], 7), abs=0.0000001)


@pytest.mark.asyncio
async def test_scoped_building_requests_return_renderable_buildings_without_missing3d(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    allowed_bounds = layer_response.json()["allowed_bounds_rd"]
    lod22_provider = AsyncMock(
        return_value=_building_page([_lod22_building_block("0363100012253999")])
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        lod22_provider,
        raising=False,
    )

    scoped_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": ",".join(str(item) for item in allowed_bounds),
            "lod": "low",
            "limit": 25,
        },
    )
    assert scoped_response.status_code == 200
    body = scoped_response.json()
    assert body["neighborhood_id"] == neighborhood_id
    assert body["bounds_rd"] == allowed_bounds
    assert body["clipped_to_neighborhood"] is True
    assert body["buildings"][0]["building_id"] == "bag_pand_0363100012253999"
    assert body["buildings"][0]["geometry_source"] == "3dbag_lod22"
    assert body["buildings"][0]["address_resolution"] == "candidate"
    assert body["fallback_reason_code"] is None


@pytest.mark.asyncio
async def test_scoped_building_requests_use_pdok_bag_usage_metadata_for_2d_footprints(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    allowed_bounds = layer_response.json()["allowed_bounds_rd"]
    center_x = (allowed_bounds[0] + allowed_bounds[2]) / 2
    center_y = (allowed_bounds[1] + allowed_bounds[3]) / 2
    bag_provider = AsyncMock(return_value=BagPandFootprintPage(
        pands=[
            _bag_pand_footprint(
                "0363100012253002",
                center_x=center_x,
                center_y=center_y,
                offset_x=40,
                gebruiksdoelen=["winkelfunctie"],
                usage_classification="non_residential",
                house_selectable=False,
            ),
            _bag_pand_footprint(
                "0363100012253001",
                center_x=center_x,
                center_y=center_y,
                offset_x=0,
                gebruiksdoelen=["winkelfunctie", "woonfunctie"],
                aantal_verblijfsobjecten=4,
                usage_classification="mixed_residential",
                house_selectable=True,
            ),
            _bag_pand_footprint(
                "0363100012253003",
                center_x=center_x,
                center_y=center_y,
                offset_x=80,
                gebruiksdoelen=[],
                aantal_verblijfsobjecten=0,
                usage_classification="no_verblijfsobject",
                house_selectable=False,
            ),
        ],
        next_cursor=None,
        partial=False,
    ))
    lod22_provider = AsyncMock(return_value=_building_page([_lod22_building_block()]))
    monkeypatch.setattr(settings, "match_building_footprint_provider", "pdok_bag")
    monkeypatch.setattr(
        buildings_service,
        "_fetch_bag_pand_footprint_page_for_bounds",
        bag_provider,
        raising=False,
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        lod22_provider,
        raising=False,
    )

    response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": ",".join(str(item) for item in allowed_bounds),
            "lod": "low",
            "limit": 25,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [building["building_id"] for building in body["buildings"]] == [
        "bag_pand_0363100012253001",
        "bag_pand_0363100012253002",
        "bag_pand_0363100012253003",
    ]
    assert body["source_refs"] == ["pdok_bag_ogc_v2_pand"]
    assert body["data_version"] == "pdok-bag-ogc-v2-pand-selected-v1"
    assert body["buildings"][0]["geometry_source"] == "pdok_bag_pand"
    assert body["buildings"][0]["bag_gebruiksdoelen"] == ["winkelfunctie", "woonfunctie"]
    assert body["buildings"][0]["bag_verblijfsobject_count"] == 4
    assert body["buildings"][0]["building_usage_classification"] == "mixed_residential"
    assert body["buildings"][0]["house_selectable"] is True
    assert body["buildings"][1]["building_usage_classification"] == "non_residential"
    assert body["buildings"][1]["house_selectable"] is False
    assert body["buildings"][2]["building_usage_classification"] == "no_verblijfsobject"
    assert body["buildings"][2]["house_selectable"] is False
    bag_provider.assert_awaited_once()
    lod22_provider.assert_not_awaited()


@pytest.mark.asyncio
async def test_scoped_building_requests_expose_partial_cursor_metadata(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    allowed_bounds = layer_response.json()["allowed_bounds_rd"]
    first_block = _lod22_building_block("0363100012253991")
    page_provider = AsyncMock(
        return_value=SimpleNamespace(
            blocks=[first_block],
            next_cursor="cursor-page-2",
            partial=False,
        )
    )
    legacy_provider = AsyncMock(return_value=([first_block], True))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        page_provider,
        raising=False,
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
        legacy_provider,
        raising=False,
    )

    response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": ",".join(str(item) for item in allowed_bounds),
            "lod": "low",
            "limit": 1,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["buildings"][0]["building_id"] == "bag_pand_0363100012253991"
    assert body["complete"] is False
    assert body["next_cursor"] == "cursor-page-2"
    assert body["loaded_scope"] == "selected_neighborhood"
    assert body["partial_reason_code"] == "match.buildings.more_available"
    page_provider.assert_awaited_once()
    assert page_provider.await_args.kwargs["cursor"] is None


@pytest.mark.asyncio
async def test_scoped_building_requests_accept_cursor_for_next_page(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    allowed_bounds = layer_response.json()["allowed_bounds_rd"]
    second_block = _lod22_building_block("0363100012253992")
    page_provider = AsyncMock(
        return_value=SimpleNamespace(
            blocks=[second_block],
            next_cursor=None,
            partial=False,
        )
    )
    legacy_provider = AsyncMock(return_value=([_lod22_building_block("0363100012253991")], True))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        page_provider,
        raising=False,
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
        legacy_provider,
        raising=False,
    )

    response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": ",".join(str(item) for item in allowed_bounds),
            "lod": "low",
            "limit": 1,
            "cursor": "cursor-page-2",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["buildings"][0]["building_id"] == "bag_pand_0363100012253992"
    assert body["complete"] is True
    assert body["next_cursor"] is None
    assert body["loaded_scope"] == "selected_neighborhood"
    assert body["partial_reason_code"] is None
    page_provider.assert_awaited_once()
    assert page_provider.await_args.kwargs["cursor"] == "cursor-page-2"


@pytest.mark.asyncio
async def test_scoped_building_requests_return_real_3dbag_lod22_geometry_without_missing3d(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    allowed_bounds = layer_response.json()["allowed_bounds_rd"]
    lod22_provider = AsyncMock(return_value=_building_page([_lod22_building_block()]))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        lod22_provider,
        raising=False,
    )

    response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": ",".join(str(item) for item in allowed_bounds),
            "lod": "low",
            "limit": 25,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["fallback_reason_code"] is None
    assert body["source_refs"] == ["3dbag_lod22"]
    assert body["buildings"][0]["building_id"] == "bag_pand_0363100012253924"
    assert body["buildings"][0]["geometry_source"] == "3dbag_lod22"
    assert body["buildings"][0]["lod"] == "2.2"
    assert body["buildings"][0]["source_refs"] == ["3dbag_lod22"]
    assert body["buildings"][0]["height_m"] == 8.5
    assert body["buildings"][0]["ground_height_m"] == 1.25
    assert body["buildings"][0]["footprint_rd"][0] == [-15.0, -10.0]
    assert body["buildings"][0]["roof_surfaces"][0][2] == [12.0, 9.0, 9.75]
    lod22_provider.assert_awaited_once()
    assert lod22_provider.await_args.kwargs["bounds_rd"] == allowed_bounds
    assert lod22_provider.await_args.kwargs["limit"] == 25


@pytest.mark.asyncio
async def test_scoped_building_requests_clip_features_to_official_boundary(
    match_neighborhood_layers_db,
    monkeypatch,
):
    neighborhood_id = "nh_seed_missing_data_example"
    neighborhood = await geometry_service.load_seed_neighborhood(neighborhood_id)
    seed_bounds = geometry_service.neighborhood_bounds_rd(neighborhood)
    center_x = (seed_bounds[0] + seed_bounds[2]) / 2
    center_y = (seed_bounds[1] + seed_bounds[3]) / 2
    official_boundary = _official_boundary_square_around_rd(
        neighborhood_id,
        center_x=center_x,
        center_y=center_y,
        radius_m=100,
    )
    allowed_bounds = geometry_service.wgs84_bounds_to_rd(
        geometry_service.boundary_display_bounds_wgs84(official_boundary)
    )

    async def fake_official_boundary(_neighborhood):
        return official_boundary

    monkeypatch.setattr(
        geometry_service,
        "fetch_official_boundary_feature",
        fake_official_boundary,
        raising=False,
    )
    lod22_provider = AsyncMock(
        return_value=_building_page(
            [
                _lod22_building_block("0363100012253001"),
                _lod22_building_block(
                    "0363100012253002",
                    footprint=[
                        [560.0, 0.0],
                        [590.0, 0.0],
                        [590.0, 30.0],
                        [560.0, 30.0],
                        [560.0, 0.0],
                    ],
                ),
            ],
        )
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        lod22_provider,
        raising=False,
    )

    response = await get_scoped_neighborhood_buildings(
        neighborhood_id,
        session_id="match-boundary-clip",
        result_set_id="mrs-boundary-clip",
        bounds_rd=allowed_bounds,
        lod="low",
        limit=25,
    )

    building_ids = [building.building_id for building in response.buildings]
    assert building_ids == ["bag_pand_0363100012253001"]
    assert response.clipped_to_neighborhood is True
    assert response.fallback_reason_code is None


@pytest.mark.asyncio
async def test_empty_scoped_building_data_keeps_missing3d_fallback_reason(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    allowed_bounds = layer_response.json()["allowed_bounds_rd"]
    empty_provider = AsyncMock(return_value=_building_page([]))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_building_page_for_bounds",
        empty_provider,
        raising=False,
    )

    response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": ",".join(str(item) for item in allowed_bounds),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["buildings"] == []
    assert body["fallback_reason_code"] == "matchFirst.neighborhood.missing3d"
    empty_provider.assert_awaited_once()


@pytest.mark.asyncio
async def test_building_requests_reject_national_or_escaped_bounds(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    layer_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert layer_response.status_code == 200
    allowed_bounds = layer_response.json()["allowed_bounds_rd"]

    national_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": "0,300000,300000,650000",
        },
    )
    assert national_response.status_code == 400
    assert national_response.json()["detail"] == "match.building_bounds_out_of_scope"

    escaped_by_centimeters = [
        allowed_bounds[0] - 0.02,
        allowed_bounds[1],
        allowed_bounds[2],
        allowed_bounds[3],
    ]
    escaped_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/buildings",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
            "bounds_rd": ",".join(str(item) for item in escaped_by_centimeters),
        },
    )
    assert escaped_response.status_code == 400
    assert escaped_response.json()["detail"] == "match.building_bounds_out_of_scope"


@pytest.mark.asyncio
async def test_amenities_are_preference_aware_capped_and_return_map_points(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    await _seed_official_amenities(neighborhood_id)

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )

    response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/amenities",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    tags = body["tags"]
    keys = [tag["amenity_key"] for tag in tags]
    assert 4 <= len(tags) <= 7
    assert len(keys) == len(set(keys))
    assert "parks_green" in keys
    assert "sports_fields" not in keys
    assert all(tag["label_key"].startswith("matchFirst.amenity.") for tag in tags)
    assert all(tag["source_refs"] for tag in tags)
    points = body["points"]
    assert 1 <= len(points) <= 7
    assert {point["amenity_key"] for point in points}.issubset(set(keys))
    assert all(point["label_key"].startswith("matchFirst.amenity.") for point in points)
    assert all(point["display_coordinate_system"] == "WGS84" for point in points)
    assert all(point["source_refs"] for point in points)


@pytest.mark.asyncio
async def test_preference_aware_amenities_clip_points_to_official_boundary(
    match_neighborhood_layers_db,
    monkeypatch,
):
    neighborhood_id = "nh_seed_missing_data_example"
    neighborhood = await geometry_service.load_seed_neighborhood(neighborhood_id)
    allowed_bounds = geometry_service.neighborhood_bounds_rd(neighborhood)
    center_x = (allowed_bounds[0] + allowed_bounds[2]) / 2
    center_y = (allowed_bounds[1] + allowed_bounds[3]) / 2
    official_boundary = _official_boundary_square_around_rd(
        neighborhood_id,
        center_x=center_x,
        center_y=center_y,
        radius_m=100,
    )
    inside = rd_to_wgs84(center_x, center_y)
    outside = rd_to_wgs84(center_x + 560, center_y)
    session = MatchSessionResponse(
        session_id="session-amenity-boundary-clip",
        locale="en",
        phase="neighborhood_detail",
        current_step=11,
        answer_version=1,
        answers={
            **COMPLETE_ANSWERS,
            "lifestyle_priorities": ["public_transport"],
            "must_haves": ["good_transit"],
        },
        is_complete=True,
    )

    async def fake_get_match_session(_session_id: str):
        return session

    async def fake_official_boundary(_neighborhood):
        return official_boundary

    async def fake_store(_neighborhood_id, _bounds_wgs84, _categories):
        loaded_at = datetime.now(UTC)
        return [
            StoredAmenityRecord(
                category_key="transit",
                record_id="inside-boundary-stop",
                name="Inside boundary stop",
                source_name=amenities_service.TRANSIT_SOURCE_NAME,
                source_ref=amenities_service.TRANSIT_SOURCE_REF,
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=inside["lat"],
                display_lng=inside["lng"],
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [inside["lng"], inside["lat"]],
                },
            ),
            StoredAmenityRecord(
                category_key="transit",
                record_id="outside-boundary-stop",
                name="Outside boundary stop",
                source_name=amenities_service.TRANSIT_SOURCE_NAME,
                source_ref=amenities_service.TRANSIT_SOURCE_REF,
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=outside["lat"],
                display_lng=outside["lng"],
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [outside["lng"], outside["lat"]],
                },
            ),
        ], []

    async def empty_geometry_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def empty_address_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "get_match_session", fake_get_match_session)
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", fake_store)
    monkeypatch.setattr(
        amenities_service,
        "selected_official_or_fallback_boundary_feature",
        fake_official_boundary,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        empty_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_address_points_for_tags",
        empty_address_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", True)

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=session.session_id,
        result_set_id="mrs-amenity-boundary-clip",
    )

    assert [point.name for point in response.points] == ["Inside boundary stop"]


@pytest.mark.asyncio
async def test_no_paid_marker_stack_tags_are_preference_aware_and_honest(
    match_neighborhood_layers_db,
    monkeypatch,
):
    session = MatchSessionResponse(
        session_id="session-no-paid-markers",
        locale="en",
        phase="neighborhood_detail",
        current_step=11,
        answer_version=1,
        answers={
            **COMPLETE_ANSWERS,
            "lifestyle_priorities": [
                "amenities",
                "public_transport",
                "environmental_quality",
            ],
            "must_haves": ["daily_shops", "good_transit"],
        },
        is_complete=True,
    )

    async def fake_get_match_session(_session_id: str):
        return session

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "get_match_session", fake_get_match_session)
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", False)

    response = await amenities_service.get_preference_aware_amenities(
        "nh_almere_poort",
        session_id=session.session_id,
        result_set_id="mrs-no-paid-markers",
    )

    body = response.model_dump(mode="json")
    keys = [tag["amenity_key"] for tag in body["tags"]]
    assert len(keys) == 7
    assert {
        "transit",
        "daily_shops",
        "parks_green",
        "swimming_water",
        "cafes_restaurants",
        "healthcare",
        "ev_charging",
    }.issubset(keys)
    assert body["points"] == []

    unavailable_by_key = {item["amenity_key"]: item for item in body["unavailable"]}
    expected_unconfigured = {
        "transit",
        "daily_shops",
        "swimming_water",
        "cafes_restaurants",
        "healthcare",
        "ev_charging",
    }
    for key in expected_unconfigured:
        assert unavailable_by_key[key]["reason_code"] == "match.amenities.source_unconfigured"
        assert unavailable_by_key[key]["source_name"]


@pytest.mark.asyncio
async def test_no_paid_transit_and_parking_markers_load_on_demand(
    match_neighborhood_layers_db,
    monkeypatch,
):
    session = MatchSessionResponse(
        session_id="session-live-no-paid-markers",
        locale="en",
        phase="neighborhood_detail",
        current_step=11,
        answer_version=1,
        answers={
            **COMPLETE_ANSWERS,
            "lifestyle_priorities": [
                "amenities",
                "public_transport",
            ],
            "must_haves": ["daily_shops", "good_transit"],
        },
        is_complete=True,
    )

    async def fake_get_match_session(_session_id: str):
        return session

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def empty_geometry_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def empty_address_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def transit_records_for_bounds(bounds_wgs84, loaded_at):
        west, south, east, north = bounds_wgs84
        return [
            StoredAmenityRecord(
                category_key="transit",
                record_id="stoparea-den-haag-kunstmuseum",
                name="Kunstmuseum",
                source_name=amenities_service.TRANSIT_SOURCE_NAME,
                source_ref=amenities_service.TRANSIT_SOURCE_REF,
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=(south + north) / 2,
                display_lng=(west + east) / 2,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [(west + east) / 2, (south + north) / 2],
                },
            )
        ]

    async def parking_records_for_bounds(bounds_wgs84, loaded_at):
        west, south, east, north = bounds_wgs84
        return [
            StoredAmenityRecord(
                category_key="parking",
                record_id="rdw-parking-zone-1234",
                name="RDW parking location 1234",
                source_name="RDW / Nationaal Parkeerregister open parking data",
                source_ref="rdw_npr_open_parking",
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=south + ((north - south) * 0.4),
                display_lng=west + ((east - west) * 0.4),
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [
                        west + ((east - west) * 0.4),
                        south + ((north - south) * 0.4),
                    ],
                },
            )
        ]

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "get_match_session", fake_get_match_session)
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        empty_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_address_points_for_tags",
        empty_address_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_transit_records_for_bounds",
        transit_records_for_bounds,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_parking_records_for_bounds",
        parking_records_for_bounds,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", True)

    response = await amenities_service.get_preference_aware_amenities(
        "nh_den_haag_statenkwartier",
        session_id=session.session_id,
        result_set_id="mrs-live-no-paid-markers",
    )

    body = response.model_dump(mode="json")
    point_keys = {point["amenity_key"] for point in body["points"]}
    assert {"transit", "parking"}.issubset(point_keys)
    assert "transit" not in {item["amenity_key"] for item in body["unavailable"]}
    assert "parking" not in {item["amenity_key"] for item in body["unavailable"]}
    assert amenities_service.TRANSIT_SOURCE_REF in body["source_refs"]
    assert "rdw_npr_open_parking" in body["source_refs"]


@pytest.mark.asyncio
async def test_no_paid_open_poi_ev_and_swimming_markers_load_on_demand(
    match_neighborhood_layers_db,
    monkeypatch,
):
    session = MatchSessionResponse(
        session_id="session-live-open-poi-markers",
        locale="en",
        phase="neighborhood_detail",
        current_step=11,
        answer_version=1,
        answers={
            **COMPLETE_ANSWERS,
            "lifestyle_priorities": [
                "amenities",
                "environmental_quality",
            ],
            "must_haves": ["daily_shops"],
        },
        is_complete=True,
    )

    async def fake_get_match_session(_session_id: str):
        return session

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def empty_geometry_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def empty_address_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def records_for_categories(bounds_wgs84, loaded_at, requested_categories):
        west, south, east, north = bounds_wgs84
        category_names = {
            "daily_shops": ("Daily shop", "overture_places_daily_shops"),
            "cafes_restaurants": ("Cafe restaurant", "overture_places_cafes_restaurants"),
            "healthcare": ("Health practice", "overture_places_healthcare"),
            "libraries_culture": ("Library culture venue", "overture_places_libraries_culture"),
        }
        return [
            StoredAmenityRecord(
                category_key=category,
                record_id=f"{source_ref}-1",
                name=name,
                source_name="Overture Places open POI data",
                source_ref=source_ref,
                source_version="2026-05-20.0",
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=south + ((north - south) * 0.5),
                display_lng=west + ((east - west) * 0.5),
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [
                        west + ((east - west) * 0.5),
                        south + ((north - south) * 0.5),
                    ],
                },
            )
            for category, (name, source_ref) in category_names.items()
            if category in requested_categories
        ]

    async def ev_records_for_bounds(bounds_wgs84, loaded_at):
        west, south, east, north = bounds_wgs84
        return [
            StoredAmenityRecord(
                category_key="ev_charging",
                record_id="dotnl-charge-1",
                name="DOT-NL charging point",
                source_name="NDW DOT-NL public charging points GeoJSON",
                source_ref="ndw_dot_nl_charging_points",
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=south + ((north - south) * 0.4),
                display_lng=west + ((east - west) * 0.4),
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [
                        west + ((east - west) * 0.4),
                        south + ((north - south) * 0.4),
                    ],
                },
            )
        ]

    async def swimming_records_for_bounds(bounds_wgs84, loaded_at):
        west, south, east, north = bounds_wgs84
        return [
            StoredAmenityRecord(
                category_key="swimming_water",
                record_id="zwemwater-spot-1",
                name="Official bathing spot",
                source_name="Zwemwater.nl official bathing water locations",
                source_ref="zwemwater_official_bathing_locations",
                source_version=loaded_at.date().isoformat(),
                freshness_date=loaded_at.date().isoformat(),
                loaded_at=loaded_at,
                display_lat=south + ((north - south) * 0.6),
                display_lng=west + ((east - west) * 0.6),
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [
                        west + ((east - west) * 0.6),
                        south + ((north - south) * 0.6),
                    ],
                },
            )
        ]

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "get_match_session", fake_get_match_session)
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        empty_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_address_points_for_tags",
        empty_address_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_overture_place_records_for_bounds",
        records_for_categories,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_ev_charging_records_for_bounds",
        ev_records_for_bounds,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_swimming_water_records_for_bounds",
        swimming_records_for_bounds,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", True)

    response = await amenities_service.get_preference_aware_amenities(
        "nh_den_haag_statenkwartier",
        session_id=session.session_id,
        result_set_id="mrs-live-open-poi-markers",
    )

    body = response.model_dump(mode="json")
    point_keys = {point["amenity_key"] for point in body["points"]}
    assert {
        "daily_shops",
        "cafes_restaurants",
        "healthcare",
        "ev_charging",
        "swimming_water",
        "libraries_culture",
    }.issubset(point_keys)
    unavailable_keys = {item["amenity_key"] for item in body["unavailable"]}
    assert not point_keys.intersection(unavailable_keys)


@pytest.mark.asyncio
async def test_official_amenity_markers_include_exact_source_and_geometry_metadata(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    await _seed_official_amenities(neighborhood_id)

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )

    response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/amenities",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )

    assert response.status_code == 200
    points = response.json()["points"]
    by_category = {point["amenity_key"]: point for point in points}
    assert set(by_category) == {
        "schools",
        "childcare",
        "parks_green",
    }
    assert by_category["schools"]["marker_shape"] == "square"
    assert by_category["childcare"]["marker_shape"] == "rounded-square"
    assert by_category["parks_green"]["marker_shape"] == "circle"
    for point in points:
        assert "emoji" not in point
        assert point["category_key"] == point["amenity_key"]
        assert point["display_coordinate_system"] == "WGS84"
        assert isinstance(point["display_lat"], float)
        assert isinstance(point["display_lng"], float)
        assert point["source_name"]
        assert "source_record_id" in point
        assert point["freshness_date"]
        assert point["loaded_at"]
        assert point["source_coordinate_system"] in {"EPSG:4326", "EPSG:28992"}
        assert point["source_geometry"]["type"] in {"Point", "Polygon"}
        assert point["source_geometry_coordinate_system"] in {"EPSG:4326", "EPSG:28992"}


@pytest.mark.asyncio
async def test_amenity_cache_key_is_scoped_and_empty_provider_results_are_not_cached(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    await _seed_official_amenities(neighborhood_id)
    bounds = [4.988, 52.347, 5.012, 52.363]
    assert amenities_service._cache_key(  # noqa: SLF001 - cache contract regression.
        neighborhood_id,
        bounds,
        ("schools", "childcare"),
        5,
    ) != amenities_service._cache_key(  # noqa: SLF001 - cache contract regression.
        neighborhood_id,
        [4.989, 52.347, 5.012, 52.363],
        ("schools", "childcare"),
        5,
    )
    assert amenities_service._cache_key(  # noqa: SLF001 - cache contract regression.
        neighborhood_id,
        bounds,
        ("schools", "childcare"),
        5,
    ) != amenities_service._cache_key(  # noqa: SLF001 - cache contract regression.
        neighborhood_id,
        bounds,
        ("schools",),
        5,
    )
    assert amenities_service._cache_key(  # noqa: SLF001 - cache contract regression.
        neighborhood_id,
        bounds,
        ("schools",),
        5,
        {"schools": "duo:2026-05-01"},
    ) != amenities_service._cache_key(  # noqa: SLF001 - cache contract regression.
        neighborhood_id,
        bounds,
        ("schools",),
        5,
        {"schools": "duo:2026-05-02"},
    )

    call_count = 0

    async def empty_then_real(selected_neighborhood_id, bounds_wgs84, categories):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return [], []
        return await load_official_amenity_records(
            selected_neighborhood_id,
            bounds_wgs84,
            categories,
        )

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_then_real)
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", False)

    first_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/amenities",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert first_response.status_code == 200
    assert first_response.json()["points"] == []

    second_response = await client.get(
        f"/api/match/neighborhoods/{neighborhood_id}/amenities",
        params={
            "session_id": results["session_id"],
            "result_set_id": results["result_set_id"],
        },
    )
    assert second_response.status_code == 200
    assert second_response.json()["points"]
    assert call_count == 2


@pytest.mark.asyncio
async def test_amenities_load_selected_geometry_markers_when_store_has_no_points(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = "nh_rotterdam_katendrecht"
    selected = results["ranked_results"][0]
    results["ranked_results"][0] = {
        **selected,
        "neighborhood_id": neighborhood_id,
        "recommendation_id": "rec_katendrecht",
        "name": "Katendrecht",
        "municipality": "Rotterdam",
        "rank": 1,
    }
    # Persisted result validation is already covered elsewhere; this regression
    # exercises the service behavior directly for an unseeded selected neighborhood.
    session_id = results["session_id"]
    result_set_id = results["result_set_id"]

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def live_geometry_points(_neighborhood_id, tags, _bounds_wgs84):
        parks_tag = next(tag for tag in tags if tag.amenity_key == "parks_green")
        return [
            MatchNeighborhoodAmenityPoint(
                point_id="amenity_nh_rotterdam_katendrecht_parks_green_live_1",
                amenity_key="parks_green",
                category_key="parks_green",
                label_key=parks_tag.label_key,
                name="PDOK green marker",
                marker_shape="circle",
                display_lat=51.9012,
                display_lng=4.4832,
                source_name="PDOK BGT/BRT green-space geometry",
                source_record_id="bgt-green-katendrecht-1",
                freshness_date="2026-05-20",
                loaded_at="2026-05-20T10:00:00Z",
                source_coordinate_system="EPSG:4326",
                source_geometry={"type": "Polygon", "coordinates": []},
                source_geometry_coordinate_system="EPSG:4326",
                source_refs=["pdok_bgt_brt_green"],
                relevance=parks_tag.relevance,
                )
            ]

    async def empty_address_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        live_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_address_points_for_tags",
        empty_address_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
    )

    body = response.model_dump(mode="json")
    assert body["points"] == [
        {
            "point_id": "amenity_nh_rotterdam_katendrecht_parks_green_live_1",
            "amenity_key": "parks_green",
            "category_key": "parks_green",
            "label_key": "matchFirst.amenity.parks_green",
            "name": "PDOK green marker",
            "marker_shape": "circle",
            "display_lat": 51.9012,
            "display_lng": 4.4832,
            "display_coordinate_system": "WGS84",
            "source_name": "PDOK BGT/BRT green-space geometry",
            "source_record_id": "bgt-green-katendrecht-1",
            "freshness_date": "2026-05-20",
            "loaded_at": "2026-05-20T10:00:00Z",
            "source_coordinate_system": "EPSG:4326",
            "source_geometry": {"type": "Polygon", "coordinates": []},
            "source_geometry_coordinate_system": "EPSG:4326",
            "source_refs": ["pdok_bgt_brt_green"],
            "relevance": 95,
        }
    ]


@pytest.mark.asyncio
async def test_amenities_load_school_and_childcare_markers_when_store_has_no_points(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = "nh_almere_poort"
    session_id = results["session_id"]
    result_set_id = results["result_set_id"]

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    class FakeOnDemandAmenityClient(FakeAmenityClient):
        def __init__(self, *, timeout_seconds: float = 20.0) -> None:
            super().__init__()
            self.timeout_seconds = timeout_seconds

    from app.services.match import amenity_ingestion  # noqa: PLC0415

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenity_ingestion,
        "LiveOfficialAmenityClient",
        FakeOnDemandAmenityClient,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
    )

    body = response.model_dump(mode="json")
    point_keys = {point["amenity_key"] for point in body["points"]}
    assert {"schools", "childcare"}.issubset(point_keys)
    assert "schools" not in {item["amenity_key"] for item in body["unavailable"]}
    assert "childcare" not in {item["amenity_key"] for item in body["unavailable"]}


@pytest.mark.asyncio
async def test_live_parks_lookup_uses_official_boundary_bounds_when_seed_centroid_is_stale(
    match_neighborhood_layers_db,
    monkeypatch,
):
    neighborhood_id = "nh_den_haag_statenkwartier"
    official_boundary = _official_boundary_square_around_rd(
        neighborhood_id,
        center_x=79200.0,
        center_y=457000.0,
        radius_m=180.0,
    )
    inside = rd_to_wgs84(79200.0, 457000.0)
    session = MatchSessionResponse(
        session_id="session-official-boundary-parks",
        locale="en",
        phase="neighborhood_detail",
        current_step=11,
        answer_version=1,
        answers={},
        is_complete=True,
    )

    async def fake_get_match_session(_session_id: str):
        return session

    async def official_boundary_for_stale_seed(_neighborhood):
        return official_boundary

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    class BoundaryAwareGreenClient:
        def __init__(self, *, timeout_seconds: float = 20.0) -> None:
            self.timeout_seconds = timeout_seconds

        async def fetch_pdok_green_features(self, bounds_rd):
            min_x, _min_y, _max_x, _max_y = bounds_rd
            if min_x < 79000.0:
                return {"type": "FeatureCollection", "features": []}
            return {
                "type": "FeatureCollection",
                "features": [
                    {
                        "id": "bgt-green-official-boundary",
                        "properties": {
                            "lokaal_id": "bgt-green-official-boundary",
                            "fysiek_voorkomen": "groenvoorziening",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [inside["lng"], inside["lat"]],
                        },
                    }
                ],
            }

    async def empty_address_points(_neighborhood_id, _tags, _bounds_wgs84, **_kwargs):
        return []

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    from app.services.match import amenity_ingestion  # noqa: PLC0415

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "get_match_session", fake_get_match_session)
    monkeypatch.setattr(
        amenities_service,
        "selected_official_or_fallback_boundary_feature",
        official_boundary_for_stale_seed,
    )
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenity_ingestion,
        "LiveOfficialAmenityClient",
        BoundaryAwareGreenClient,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_address_points_for_tags",
        empty_address_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", True)

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=session.session_id,
        result_set_id="mrs-official-boundary-parks",
    )

    body = response.model_dump(mode="json")
    assert "parks_green" in {point["amenity_key"] for point in body["points"]}
    assert "parks_green" not in {item["amenity_key"] for item in body["unavailable"]}


@pytest.mark.asyncio
async def test_childcare_uses_geocoded_lrk_fallback_when_index_match_clips_outside_boundary(
    match_neighborhood_layers_db,
    monkeypatch,
):
    neighborhood_id = "nh_den_haag_statenkwartier"
    official_boundary = _official_boundary_square_around_rd(
        neighborhood_id,
        center_x=78900.0,
        center_y=456000.0,
        radius_m=160.0,
    )
    inside = rd_to_wgs84(78900.0, 456000.0)
    outside = rd_to_wgs84(79300.0, 456000.0)
    loaded_at = datetime(2026, 5, 22, 10, 0, tzinfo=UTC)
    session = MatchSessionResponse(
        session_id="session-childcare-fallback",
        locale="en",
        phase="neighborhood_detail",
        current_step=11,
        answer_version=1,
        answers={},
        is_complete=True,
    )

    async def fake_get_match_session(_session_id: str):
        return session

    async def official_boundary_for_stale_seed(_neighborhood):
        return official_boundary

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def empty_geometry_points(_neighborhood_id, _tags, _bounds_wgs84, **_kwargs):
        return []

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def empty_duo_records(**_kwargs):
        return [], 0, 0

    async def indexed_lrk_record_outside_boundary(**_kwargs):
        return [
            StoredAmenityRecord(
                category_key="childcare",
                record_id="lrk-index-outside",
                name="Indexed childcare outside boundary",
                source_name="Landelijk Register Kinderopvang matched to BAG",
                source_ref="lrk_bag_locations",
                source_version="lrk_bag_locations:2026-05-22",
                freshness_date="2026-05-22",
                loaded_at=loaded_at,
                display_lat=outside["lat"],
                display_lng=outside["lng"],
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={
                    "type": "Point",
                    "coordinates": [outside["lng"], outside["lat"]],
                },
            )
        ], 0, 0, 0

    async def geocoded_lrk_record_inside_boundary(**_kwargs):
        return [
            StoredAmenityRecord(
                category_key="childcare",
                record_id="lrk-geocoded-inside",
                name="Geocoded childcare inside boundary",
                source_name="Landelijk Register Kinderopvang matched to BAG",
                source_ref="lrk_bag_locations",
                source_version="lrk_bag_locations:2026-05-22",
                freshness_date="2026-05-22",
                loaded_at=loaded_at,
                display_lat=inside["lat"],
                display_lng=inside["lng"],
                source_coordinate_system="EPSG:28992",
                source_geometry_coordinate_system="EPSG:28992",
                source_geometry={"type": "Point", "coordinates": [78900.0, 456000.0]},
            )
        ], 0, 0, 0

    from app.services.match import amenity_ingestion  # noqa: PLC0415

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "get_match_session", fake_get_match_session)
    monkeypatch.setattr(
        amenities_service,
        "selected_official_or_fallback_boundary_feature",
        official_boundary_for_stale_seed,
    )
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        empty_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )
    monkeypatch.setattr(amenity_ingestion, "_duo_records", empty_duo_records)
    monkeypatch.setattr(
        amenity_ingestion,
        "_lrk_records_from_bag_index",
        indexed_lrk_record_outside_boundary,
    )
    monkeypatch.setattr(amenity_ingestion, "_lrk_records", geocoded_lrk_record_inside_boundary)
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", True)

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=session.session_id,
        result_set_id="mrs-childcare-fallback",
    )

    body = response.model_dump(mode="json")
    childcare_points = [
        point for point in body["points"] if point["amenity_key"] == "childcare"
    ]
    assert [point["name"] for point in childcare_points] == [
        "Geocoded childcare inside boundary"
    ]
    assert "childcare" not in {item["amenity_key"] for item in body["unavailable"]}


@pytest.mark.asyncio
async def test_slow_childcare_lookup_does_not_hide_school_markers(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = "nh_almere_poort"
    session_id = results["session_id"]
    result_set_id = results["result_set_id"]

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def empty_geometry_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def fast_duo_records(**_kwargs):
        return [
            StoredAmenityRecord(
                category_key="schools",
                record_id="duo-fast-school",
                name="Fast DUO School",
                source_name="DUO Open Onderwijsdata school vestigingen matched to BAG",
                source_ref="duo_open_onderwijsdata_bag",
                source_version="duo_open_onderwijsdata_bag:2026-05-21",
                freshness_date="2026-05-21",
                loaded_at=datetime(2026, 5, 21, 10, 0, tzinfo=UTC),
                display_lat=52.363,
                display_lng=5.124,
                source_coordinate_system="EPSG:4326",
                source_geometry_coordinate_system="EPSG:4326",
                source_geometry={"type": "Point", "coordinates": [5.124, 52.363]},
            )
        ], 0, 0

    async def slow_lrk_records_from_bag_index(**_kwargs):
        await asyncio.sleep(0.2)
        return [], 0, 0, 0

    async def slow_lrk_records(**_kwargs):
        await asyncio.sleep(0.2)
        return [], 0, 0, 0

    from app.services.match import amenity_ingestion  # noqa: PLC0415

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        empty_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(amenity_ingestion, "_duo_records", fast_duo_records)
    monkeypatch.setattr(
        amenity_ingestion,
        "_lrk_records_from_bag_index",
        slow_lrk_records_from_bag_index,
    )
    monkeypatch.setattr(amenity_ingestion, "_lrk_records", slow_lrk_records)
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_on_demand_timeout_seconds", 0.01)

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=session_id,
        result_set_id=result_set_id,
    )

    body = response.model_dump(mode="json")
    assert "schools" in {point["amenity_key"] for point in body["points"]}
    assert "schools" not in {item["amenity_key"] for item in body["unavailable"]}
    assert "childcare" in {item["amenity_key"] for item in body["unavailable"]}


@pytest.mark.asyncio
async def test_amenity_point_limit_preserves_available_marker_categories(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def dense_live_geometry_points(_neighborhood_id, tags, _bounds_wgs84):
        tag_by_key = {tag.amenity_key: tag for tag in tags}
        west, south, east, north = _bounds_wgs84
        loaded_at = "2026-05-20T10:00:00Z"
        parks = [
            MatchNeighborhoodAmenityPoint(
                point_id=f"amenity_{neighborhood_id}_parks_green_live_{index}",
                amenity_key="parks_green",
                category_key="parks_green",
                label_key=tag_by_key["parks_green"].label_key,
                name=f"Green marker {index}",
                marker_shape="circle",
                display_lat=south + ((north - south) * (0.2 + (index * 0.04))),
                display_lng=west + ((east - west) * (0.2 + (index * 0.04))),
                source_name="PDOK BGT/BRT green-space geometry",
                source_record_id=f"green-{index}",
                freshness_date="2026-05-20",
                loaded_at=loaded_at,
                source_coordinate_system="EPSG:4326",
                source_geometry={"type": "Polygon", "coordinates": []},
                source_geometry_coordinate_system="EPSG:4326",
                source_refs=["pdok_bgt_brt_green"],
                relevance=tag_by_key["parks_green"].relevance,
            )
            for index in range(1, 7)
        ]
        ev_charging = MatchNeighborhoodAmenityPoint(
            point_id=f"amenity_{neighborhood_id}_ev_charging_live_1",
            amenity_key="ev_charging",
            category_key="ev_charging",
            label_key=tag_by_key["ev_charging"].label_key,
            name="EV marker",
            marker_shape="bolt",
            display_lat=south + ((north - south) * 0.62),
            display_lng=west + ((east - west) * 0.62),
            source_name="NDW DOT-NL public charging points GeoJSON",
            source_record_id="ev-1",
            freshness_date="2026-05-20",
            loaded_at=loaded_at,
            source_coordinate_system="EPSG:4326",
            source_geometry={
                "type": "Point",
                "coordinates": [
                    west + ((east - west) * 0.62),
                    south + ((north - south) * 0.62),
                ],
            },
            source_geometry_coordinate_system="EPSG:4326",
            source_refs=["ndw_dot_nl_charging_points"],
            relevance=tag_by_key["ev_charging"].relevance,
        )
        return [*parks, ev_charging]

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        dense_live_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_point_limit", 3)

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=results["session_id"],
        result_set_id=results["result_set_id"],
    )

    body = response.model_dump(mode="json")
    assert len(body["points"]) == 3
    assert "ev_charging" in {point["amenity_key"] for point in body["points"]}
    assert "ev_charging" not in {item["amenity_key"] for item in body["unavailable"]}


@pytest.mark.asyncio
async def test_parks_only_live_geometry_reports_other_categories_unavailable(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def parks_only_live_geometry_points(_neighborhood_id, tags, _bounds_wgs84):
        parks_tag = next(tag for tag in tags if tag.amenity_key == "parks_green")
        west, south, east, north = _bounds_wgs84
        return [
            MatchNeighborhoodAmenityPoint(
                point_id=f"amenity_{neighborhood_id}_parks_green_live_{index}",
                amenity_key="parks_green",
                category_key="parks_green",
                label_key=parks_tag.label_key,
                name=f"Green marker {index}",
                marker_shape="circle",
                display_lat=south + ((north - south) * (0.24 + (index * 0.05))),
                display_lng=west + ((east - west) * (0.24 + (index * 0.05))),
                source_name="PDOK BGT/BRT green-space geometry",
                source_record_id=f"green-{index}",
                freshness_date="2026-05-20",
                loaded_at="2026-05-20T10:00:00Z",
                source_coordinate_system="EPSG:4326",
                source_geometry={"type": "Polygon", "coordinates": []},
                source_geometry_coordinate_system="EPSG:4326",
                source_refs=["pdok_bgt_brt_green"],
                relevance=parks_tag.relevance,
            )
            for index in range(1, 4)
        ]

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        parks_only_live_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )

    response = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=results["session_id"],
        result_set_id=results["result_set_id"],
    )

    body = response.model_dump(mode="json")
    assert {point["amenity_key"] for point in body["points"]} == {"parks_green"}
    unavailable_keys = {item["amenity_key"] for item in body["unavailable"]}
    assert {"schools", "childcare"}.issubset(unavailable_keys)
    assert "sports_fields" not in unavailable_keys
    assert "parks_green" not in unavailable_keys


@pytest.mark.asyncio
async def test_partial_live_amenity_failures_are_not_cached(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    calls = 0

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def live_geometry_points(_neighborhood_id, tags, _bounds_wgs84):
        nonlocal calls
        calls += 1
        if calls == 1:
            return []
        parks_tag = next(tag for tag in tags if tag.amenity_key == "parks_green")
        west, south, east, north = _bounds_wgs84
        return [
            MatchNeighborhoodAmenityPoint(
                point_id=f"amenity_{neighborhood_id}_parks_green_live_1",
                amenity_key="parks_green",
                category_key="parks_green",
                label_key=parks_tag.label_key,
                name="Recovered green marker",
                marker_shape="circle",
                display_lat=south + ((north - south) * 0.4),
                display_lng=west + ((east - west) * 0.4),
                source_name="PDOK BGT/BRT green-space geometry",
                source_record_id="green-recovered",
                freshness_date="2026-05-22",
                loaded_at="2026-05-22T10:00:00Z",
                source_coordinate_system="EPSG:4326",
                source_geometry={"type": "Polygon", "coordinates": []},
                source_geometry_coordinate_system="EPSG:4326",
                source_refs=["pdok_bgt_brt_green"],
                relevance=parks_tag.relevance,
            )
        ]

    async def live_point_points(_neighborhood_id, tags, _bounds_wgs84):
        transit_tag = next(tag for tag in tags if tag.amenity_key == "transit")
        west, south, east, north = _bounds_wgs84
        display_lat = south + ((north - south) * 0.6)
        display_lng = west + ((east - west) * 0.6)
        return [
            MatchNeighborhoodAmenityPoint(
                point_id=f"amenity_{neighborhood_id}_transit_live_1",
                amenity_key="transit",
                category_key="transit",
                label_key=transit_tag.label_key,
                name="Transit marker",
                marker_shape="triangle",
                display_lat=display_lat,
                display_lng=display_lng,
                source_name=amenities_service.TRANSIT_SOURCE_NAME,
                source_record_id="transit-1",
                freshness_date="2026-05-22",
                loaded_at="2026-05-22T10:00:00Z",
                source_coordinate_system="EPSG:4326",
                source_geometry={"type": "Point", "coordinates": [display_lng, display_lat]},
                source_geometry_coordinate_system="EPSG:4326",
                source_refs=[amenities_service.TRANSIT_SOURCE_REF],
                relevance=transit_tag.relevance,
            )
        ]

    async def empty_address_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        live_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_address_points_for_tags",
        empty_address_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        live_point_points,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_on_demand_geometry_enabled", True)

    first = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=results["session_id"],
        result_set_id=results["result_set_id"],
    )
    assert "parks_green" in {item.amenity_key for item in first.unavailable}
    assert "transit" in {point.amenity_key for point in first.points}

    second = await amenities_service.get_preference_aware_amenities(
        neighborhood_id,
        session_id=results["session_id"],
        result_set_id=results["result_set_id"],
    )
    assert "parks_green" in {point.amenity_key for point in second.points}
    assert calls == 2


@pytest.mark.asyncio
async def test_slow_selected_geometry_lookup_keeps_amenity_tags_available(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]

    async def empty_store(_neighborhood_id, _bounds_wgs84, _categories):
        return [], []

    async def no_official_boundary(_neighborhood):
        return None

    async def slow_geometry_points(_neighborhood_id, _tags, _bounds_wgs84):
        await asyncio.sleep(0.2)
        return []

    async def empty_address_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    async def empty_point_points(_neighborhood_id, _tags, _bounds_wgs84):
        return []

    amenities_service.clear_amenity_response_cache()
    monkeypatch.setattr(amenities_service, "load_official_amenity_records", empty_store)
    monkeypatch.setattr(
        amenities_service,
        "selected_official_or_fallback_boundary_feature",
        no_official_boundary,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_geometry_points_for_tags",
        slow_geometry_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_address_points_for_tags",
        empty_address_points,
        raising=False,
    )
    monkeypatch.setattr(
        amenities_service,
        "_live_point_points_for_tags",
        empty_point_points,
        raising=False,
    )
    monkeypatch.setattr(settings, "match_amenity_on_demand_timeout_seconds", 0.01)

    response = await asyncio.wait_for(
        amenities_service.get_preference_aware_amenities(
            neighborhood_id,
            session_id=results["session_id"],
            result_set_id=results["result_set_id"],
        ),
        timeout=0.05,
    )

    body = response.model_dump(mode="json")
    assert [tag["amenity_key"] for tag in body["tags"]]
    assert body["points"] == []


@pytest.mark.asyncio
async def test_unknown_or_stale_neighborhood_layer_requests_use_stable_errors(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    unknown_response = await client.get("/api/match/neighborhoods/unknown-neighborhood")
    assert unknown_response.status_code == 404
    assert unknown_response.json()["detail"] == "match.neighborhood.not_found"

    stale_response = await client.get(
        f"/api/match/neighborhoods/{results['ranked_results'][0]['neighborhood_id']}/map-layers",
        params={
            "session_id": results["session_id"],
            "result_set_id": "mrs_stale",
        },
    )
    assert stale_response.status_code == 409
    assert stale_response.json()["detail"] == "match.results.stale"


@pytest.mark.asyncio
async def test_dossier_bridge_resolves_selected_building_with_match_context(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    payload = _bridge_payload(results)

    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["status"] == "resolved"
    assert body["vbo_id"] == "0363010000123456"
    assert body["lookup_id"] == "adr-abc123"
    assert body["route"].startswith("#/address/0363010000123456?")
    query = _route_query(body["route"])
    context = json.loads(query["match_context"][0])
    assert "session_id" not in query
    assert query["lookup"] == ["adr-abc123"]
    assert query["match_session"] == [results["session_id"]]
    assert query["match_neighborhood"] == [payload["neighborhood_id"]]
    assert query["match_return"] == [
        f"#/match/session/{results['session_id']}/neighborhood/{payload['neighborhood_id']}"
    ]
    assert context == {
        "jobId": results["job_id"],
        "resultSetId": results["result_set_id"],
        "preferenceVectorVersion": results["preference_vector_version"],
        "source": "match_map",
        "addressId": "0363010000123456",
        "buildingId": payload["building_id"],
        "returnUrl": query["match_return"][0],
        "mapCenter": [52.36, 4.9],
        "mapZoom": 13,
        "listScroll": 240,
        "mobileMode": "list",
        "selectedResultId": results["ranked_results"][0]["recommendation_id"],
        "selectedResultRank": results["ranked_results"][0]["rank"],
        "language": "nl",
        "selectedHouseId": payload["building_id"],
    }
    assert body["address_candidate"] == {
        "address_id": "0363010000123456",
        "vbo_id": "0363010000123456",
        "lookup_id": "adr-abc123",
        "reliability": "resolved",
    }


@pytest.mark.asyncio
async def test_dossier_bridge_resolves_second_selected_building_with_match_context(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    selected = results["ranked_results"][0]
    neighborhood_id = selected["neighborhood_id"]
    building_id = f"bldg_{neighborhood_id}_002"
    payload = _bridge_payload(
        results,
        building_id=building_id,
        address_id="0363010000123457",
        vbo_id="0363010000123457",
        lookup_id="adr-def456",
        return_context={"selected_house_id": building_id},
    )

    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["vbo_id"] == "0363010000123457"
    assert body["lookup_id"] == "adr-def456"
    assert body["route"].startswith("#/address/0363010000123457?")
    query = _route_query(body["route"])
    context = json.loads(query["match_context"][0])
    assert query["lookup"] == ["adr-def456"]
    assert context["buildingId"] == building_id
    assert context["selectedHouseId"] == building_id
    assert body["address_candidate"] == {
        "address_id": "0363010000123457",
        "vbo_id": "0363010000123457",
        "lookup_id": "adr-def456",
        "reliability": "resolved",
    }


@pytest.mark.asyncio
async def test_dossier_bridge_uses_server_candidate_when_client_omits_optional_ids(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    payload = _bridge_payload(
        results,
        vbo_id=None,
        address_id=None,
        lookup_id=None,
    )

    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["route"].startswith("#/address/0363010000123456?")
    assert body["address_candidate"]["vbo_id"] == "0363010000123456"
    assert body["address_candidate"]["address_id"] == "0363010000123456"
    assert body["lookup_id"] == "adr-abc123"


@pytest.mark.asyncio
async def test_dossier_bridge_returns_candidate_addresses_for_ambiguous_house(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    original_seed_candidate = buildings_service._seed_house_candidate

    def ambiguous_seed_candidate(neighborhood_id, display_bounds):
        candidate = original_seed_candidate(neighborhood_id, display_bounds)
        return candidate.model_copy(
            update={
                "vbo_id": None,
                "address_id": None,
                "lookup_id": None,
                "address_resolution": "candidate",
                "address_candidate_count": 2,
            }
        )

    monkeypatch.setattr(buildings_service, "_seed_house_candidate", ambiguous_seed_candidate)
    provider = _patch_provider_addresses(monkeypatch)

    payload = _bridge_payload(results, vbo_id=None, address_id=None, lookup_id=None)
    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["status"] == "candidates"
    assert body["route"] is None
    assert body["vbo_id"] is None
    assert body["lookup_id"] is None
    assert body["fallback_reason_code"] == "match.neighborhood.address_candidate_selection_required"
    assert body["address_candidate"]["reliability"] == "candidate"
    assert body["candidate_addresses"] == [
        {
            "candidate_id": f"cand_{payload['building_id']}_adr_provider_1",
            "address_id": "0363010000987651",
            "vbo_id": "0363010000987651",
            "lookup_id": "adr-provider-1",
            "display_label_key": "matchFirst.neighborhood.nearbyAddressCandidateWithLabel",
            "display_params": {
                "city": "Amsterdam",
                "houseNumber": "1000",
                "index": "1",
                "label": "IJburglaan 1000, 1087JK Amsterdam",
                "postcode": "1087JK",
            },
            "reliability": "candidate",
            "source_refs": ["pdok_locatieserver_reverse", "seed_match_source"],
            "fallback_reason_code": "match.neighborhood.address_candidate_selection_required",
        },
        {
            "candidate_id": f"cand_{payload['building_id']}_adr_provider_2",
            "address_id": "0363010000987652",
            "vbo_id": "0363010000987652",
            "lookup_id": "adr-provider-2",
            "display_label_key": "matchFirst.neighborhood.nearbyAddressCandidateWithLabel",
            "display_params": {
                "city": "Amsterdam",
                "houseNumber": "1002",
                "index": "2",
                "label": "IJburglaan 1002, 1087JK Amsterdam",
                "postcode": "1087JK",
            },
            "reliability": "candidate",
            "source_refs": ["pdok_locatieserver_reverse", "seed_match_source"],
            "fallback_reason_code": "match.neighborhood.address_candidate_selection_required",
        },
    ]
    provider.assert_awaited_once()
    provider_kwargs = provider.await_args.kwargs
    assert provider_kwargs["distance_m"] == 75
    assert provider_kwargs["limit"] == 2
    assert 50.7 <= provider_kwargs["latitude"] <= 53.6
    assert 3.2 <= provider_kwargs["longitude"] <= 7.3


@pytest.mark.asyncio
async def test_dossier_bridge_accepts_selected_3dbag_lod22_building_candidate(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    building_id = "bag_pand_0363100012253924"
    lod22_provider = AsyncMock(return_value=([_lod22_building_block()], False))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
        lod22_provider,
        raising=False,
    )
    provider = _patch_provider_addresses(monkeypatch)
    payload = _bridge_payload(
        results,
        building_id=building_id,
        vbo_id=None,
        address_id=None,
        lookup_id=None,
        return_context={"selected_house_id": building_id},
    )

    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "candidates"
    assert body["fallback_reason_code"] == "match.neighborhood.address_candidate_selection_required"
    assert body["candidate_addresses"][0]["source_refs"] == [
        "pdok_locatieserver_reverse",
        "3dbag_lod22",
    ]
    provider.assert_awaited_once()
    lod22_provider.assert_awaited_once()


@pytest.mark.asyncio
async def test_dossier_bridge_resolves_selected_candidate_address_to_dossier(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    original_seed_candidate = buildings_service._seed_house_candidate

    def ambiguous_seed_candidate(neighborhood_id, display_bounds):
        candidate = original_seed_candidate(neighborhood_id, display_bounds)
        return candidate.model_copy(
            update={
                "vbo_id": None,
                "address_id": None,
                "lookup_id": None,
                "address_resolution": "candidate",
                "address_candidate_count": 2,
            }
        )

    monkeypatch.setattr(buildings_service, "_seed_house_candidate", ambiguous_seed_candidate)
    _patch_provider_addresses(monkeypatch)

    payload = _bridge_payload(
        results,
        vbo_id=None,
        address_id=None,
        lookup_id=None,
        selected_candidate_id=(
            f"cand_bldg_{results['ranked_results'][0]['neighborhood_id']}_001_adr_provider_2"
        ),
    )
    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["vbo_id"] == "0363010000987652"
    assert body["lookup_id"] == "adr-provider-2"
    assert body["route"].startswith("#/address/0363010000987652?")
    query = _route_query(body["route"])
    context = json.loads(query["match_context"][0])
    assert query["lookup"] == ["adr-provider-2"]
    assert context["addressId"] == "0363010000987652"
    assert context["buildingId"] == payload["building_id"]
    assert context["selectedHouseId"] == payload["building_id"]
    assert body["address_candidate"] == {
        "address_id": "0363010000987652",
        "vbo_id": "0363010000987652",
        "lookup_id": "adr-provider-2",
        "reliability": "candidate",
    }
    assert body["candidate_addresses"][0]["candidate_id"] == payload["selected_candidate_id"]
    assert body["candidate_addresses"][0]["source_refs"][0] == "pdok_locatieserver_reverse"


@pytest.mark.asyncio
async def test_dossier_bridge_returns_manual_required_when_candidate_addresses_are_missing(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    original_seed_candidate = buildings_service._seed_house_candidate

    def manual_seed_candidate(neighborhood_id, display_bounds):
        candidate = original_seed_candidate(neighborhood_id, display_bounds)
        return candidate.model_copy(
            update={
                "vbo_id": None,
                "address_id": None,
                "lookup_id": None,
                "address_resolution": "manual_required",
                "address_candidate_count": 0,
            }
        )

    monkeypatch.setattr(buildings_service, "_seed_house_candidate", manual_seed_candidate)

    payload = _bridge_payload(results, vbo_id=None, address_id=None, lookup_id=None)
    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "status": "manual_required",
        "route": None,
        "vbo_id": None,
        "lookup_id": None,
        "address_candidate": {
            "address_id": None,
            "vbo_id": None,
            "lookup_id": None,
            "reliability": "unavailable",
        },
        "candidate_addresses": [],
        "fallback_reason_code": "match.neighborhood.manual_address_required",
    }


@pytest.mark.asyncio
async def test_dossier_bridge_returns_manual_required_when_provider_has_no_nearby_addresses(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    original_seed_candidate = buildings_service._seed_house_candidate

    def ambiguous_seed_candidate(neighborhood_id, display_bounds):
        candidate = original_seed_candidate(neighborhood_id, display_bounds)
        return candidate.model_copy(
            update={
                "vbo_id": None,
                "address_id": None,
                "lookup_id": None,
                "address_resolution": "candidate",
                "address_candidate_count": 2,
            }
        )

    monkeypatch.setattr(buildings_service, "_seed_house_candidate", ambiguous_seed_candidate)
    provider = _patch_provider_addresses(monkeypatch, addresses=[])

    payload = _bridge_payload(results, vbo_id=None, address_id=None, lookup_id=None)
    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "status": "manual_required",
        "route": None,
        "vbo_id": None,
        "lookup_id": None,
        "address_candidate": {
            "address_id": None,
            "vbo_id": None,
            "lookup_id": None,
            "reliability": "unavailable",
        },
        "candidate_addresses": [],
        "fallback_reason_code": "match.neighborhood.manual_address_required",
    }
    provider.assert_awaited_once()


@pytest.mark.asyncio
async def test_dossier_bridge_returns_manual_required_when_provider_lookup_fails(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    original_seed_candidate = buildings_service._seed_house_candidate

    def ambiguous_seed_candidate(neighborhood_id, display_bounds):
        candidate = original_seed_candidate(neighborhood_id, display_bounds)
        return candidate.model_copy(
            update={
                "vbo_id": None,
                "address_id": None,
                "lookup_id": None,
                "address_resolution": "candidate",
                "address_candidate_count": 2,
            }
        )

    monkeypatch.setattr(buildings_service, "_seed_house_candidate", ambiguous_seed_candidate)
    provider = AsyncMock(side_effect=TimeoutError("locatieserver timeout"))
    monkeypatch.setattr(buildings_service.locatieserver, "reverse_addresses", provider)

    payload = _bridge_payload(results, vbo_id=None, address_id=None, lookup_id=None)
    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "manual_required"
    assert body["candidate_addresses"] == []
    assert body["fallback_reason_code"] == "match.neighborhood.manual_address_required"
    provider.assert_awaited_once()


@pytest.mark.asyncio
async def test_dossier_bridge_rejects_spoofed_candidate_address_id(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)
    original_seed_candidate = buildings_service._seed_house_candidate

    def ambiguous_seed_candidate(neighborhood_id, display_bounds):
        candidate = original_seed_candidate(neighborhood_id, display_bounds)
        return candidate.model_copy(
            update={
                "vbo_id": None,
                "address_id": None,
                "lookup_id": None,
                "address_resolution": "candidate",
                "address_candidate_count": 2,
            }
        )

    monkeypatch.setattr(buildings_service, "_seed_house_candidate", ambiguous_seed_candidate)
    _patch_provider_addresses(monkeypatch)

    payload = _bridge_payload(
        results,
        vbo_id=None,
        address_id=None,
        lookup_id=None,
        selected_candidate_id="cand_spoofed_999",
    )
    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 409
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["detail"] == "match.dossier.building_not_found"


@pytest.mark.asyncio
async def test_dossier_bridge_returns_unavailable_without_reliable_server_address(
    client,
    match_neighborhood_layers_db,
    monkeypatch,
):
    results = await _run_completed_match(client)

    original_seed_candidate = buildings_service._seed_house_candidate

    def unresolved_seed_candidate(neighborhood_id, display_bounds):
        candidate = original_seed_candidate(neighborhood_id, display_bounds)
        return candidate.model_copy(
            update={
                "vbo_id": None,
                "address_id": None,
                "lookup_id": None,
                "address_resolution": "unavailable",
                "address_candidate_count": 0,
            }
        )

    monkeypatch.setattr(buildings_service, "_seed_house_candidate", unresolved_seed_candidate)

    payload = _bridge_payload(results, vbo_id=None, address_id=None, lookup_id=None)
    response = await client.post(
        "/api/match/dossier/from-building",
        json=payload,
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "status": "unavailable",
        "route": None,
        "vbo_id": None,
        "lookup_id": None,
        "address_candidate": {
            "address_id": None,
            "vbo_id": None,
            "lookup_id": None,
            "reliability": "unavailable",
        },
        "candidate_addresses": [],
        "fallback_reason_code": "match.neighborhood.no_reliable_address",
    }


@pytest.mark.asyncio
async def test_dossier_bridge_rejects_stale_result_context(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    payload = _bridge_payload(results, return_context={"result_set_id": "mrs_stale"})

    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "match.results.stale"


@pytest.mark.asyncio
async def test_dossier_bridge_rejects_stale_return_metadata(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    stale_contexts = [
        {"job_id": "match_job_other"},
        {"preference_vector_version": "pv_v1_other"},
        {"selected_result_id": "rec_other"},
        {"selected_result_rank": 99},
    ]

    for stale_context in stale_contexts:
        payload = _bridge_payload(results, return_context=stale_context)

        response = await client.post("/api/match/dossier/from-building", json=payload)

        assert response.status_code == 409
        assert response.json()["detail"] == "match.results.stale"


@pytest.mark.asyncio
async def test_dossier_bridge_requires_selected_result_identity(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    payload = _bridge_payload(results)
    payload["return_context"].pop("selected_result_id")

    missing_id_response = await client.post("/api/match/dossier/from-building", json=payload)

    assert missing_id_response.status_code == 422
    assert missing_id_response.json()["detail"] == "match.dossier.selected_result_required"

    payload = _bridge_payload(results, return_context={"selected_result_rank": None})

    missing_rank_response = await client.post("/api/match/dossier/from-building", json=payload)

    assert missing_rank_response.status_code == 422
    assert missing_rank_response.json()["detail"] == "match.dossier.selected_result_required"


@pytest.mark.asyncio
async def test_dossier_bridge_rejects_client_spoofed_house_candidate_fields(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    spoofed_payloads = [
        {"building_id": "bldg_other_neighborhood_001"},
        {"vbo_id": "0363010000999999"},
        {"address_id": "0363010000999999"},
        {"lookup_id": "adr-spoofed"},
    ]

    for spoofed in spoofed_payloads:
        payload = _bridge_payload(results, **spoofed)

        response = await client.post("/api/match/dossier/from-building", json=payload)

        assert response.status_code == 409
        assert response.json()["detail"] == "match.dossier.building_not_found"


@pytest.mark.asyncio
async def test_dossier_bridge_rejects_spoofed_return_selected_house_id(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    payload = _bridge_payload(
        results,
        return_context={"selected_house_id": "bldg_spoofed_return_context"},
    )

    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "match.dossier.building_not_found"


@pytest.mark.asyncio
async def test_dossier_bridge_invalid_vbo_id_uses_stable_match_error(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    payload = _bridge_payload(results, vbo_id="not-a-vbo")

    response = await client.post("/api/match/dossier/from-building", json=payload)

    assert response.status_code == 422
    assert response.json()["detail"] == "match.dossier.invalid_vbo_id"
