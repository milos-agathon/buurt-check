import json
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.db import init_db
from app.models.address import ResolvedAddress
from app.models.neighborhood3d import BuildingBlock
from app.services.match import amenities as amenities_service
from app.services.match import buildings as buildings_service
from app.services.match.amenity_ingestion import run_amenity_refresh_once
from app.services.match.buildings import get_scoped_neighborhood_buildings
from app.services.match.geometry import get_neighborhood_map_layers, rd_to_wgs84
from app.services.match.providers.amenities import load_official_amenity_records
from tests.test_match_amenity_ingestion import FakeAmenityClient
from tests.test_match_sessions import COMPLETE_ANSWERS


@pytest.fixture
async def match_neighborhood_layers_db(tmp_path):
    db_path = str(tmp_path / "match_neighborhood_layers.db")
    await init_db(db_path)
    with patch.object(settings, "database_path", db_path):
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


def _patch_provider_addresses(monkeypatch, addresses: list[ResolvedAddress] | None = None):
    provider = AsyncMock(return_value=addresses if addresses is not None else _provider_addresses())
    monkeypatch.setattr(buildings_service.locatieserver, "reverse_addresses", provider)
    return provider


@pytest.mark.asyncio
async def test_selected_neighborhood_summary_and_map_layers_are_scoped(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    selected = results["ranked_results"][0]
    neighborhood_id = selected["neighborhood_id"]

    summary_response = await client.get(f"/api/match/neighborhoods/{neighborhood_id}")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["neighborhood_id"] == neighborhood_id
    assert summary["centroid_rd"]["x"] > 0
    assert len(summary["bounds_rd"]) == 4
    assert "display_centroid_wgs84" in summary
    assert "display_bounds_wgs84" in summary
    assert summary["boundary_ref"].startswith("boundary_")
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
    assert layers["building_layer"]["endpoint"].endswith(f"/{neighborhood_id}/buildings")
    assert layers["building_layer"]["available"] is True
    assert layers["building_layer"]["fallback_reason_code"] is None
    assert layers["amenity_layer"]["endpoint"].endswith(f"/{neighborhood_id}/amenities")
    assert layers["fallback_2d_available"] is True


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

    lod22_provider = AsyncMock(return_value=([_lod22_building_block("0363100012253999")], False))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
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
        return_value=([
            _lod22_building_block("0363100012254888", footprint=footprint),
        ], False)
    )
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
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
    lod22_provider = AsyncMock(return_value=([_lod22_building_block("0363100012253999")], False))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
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
    lod22_provider = AsyncMock(return_value=([_lod22_building_block()], False))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
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
    empty_provider = AsyncMock(return_value=([], False))
    monkeypatch.setattr(
        buildings_service,
        "_fetch_lod22_buildings_for_bounds",
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
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    await _seed_official_amenities(neighborhood_id)

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
    assert "sports_fields" in keys
    assert all(tag["label_key"].startswith("matchFirst.amenity.") for tag in tags)
    assert all(tag["source_refs"] for tag in tags)
    points = body["points"]
    assert 1 <= len(points) <= 7
    assert {point["amenity_key"] for point in points}.issubset(set(keys))
    assert all(point["label_key"].startswith("matchFirst.amenity.") for point in points)
    assert all(point["display_coordinate_system"] == "WGS84" for point in points)
    assert all(point["source_refs"] for point in points)


@pytest.mark.asyncio
async def test_official_amenity_markers_include_exact_source_and_geometry_metadata(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]
    await _seed_official_amenities(neighborhood_id)

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
        "sports_fields",
    }
    assert by_category["schools"]["emoji"] == "🏫"
    assert by_category["childcare"]["emoji"] == "🧸"
    assert by_category["parks_green"]["emoji"] == "🌳"
    assert by_category["sports_fields"]["emoji"] == "⚽"
    for point in points:
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
