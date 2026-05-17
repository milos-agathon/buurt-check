import json
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.db import init_db
from app.models.address import ResolvedAddress
from app.services.match import buildings as buildings_service
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
    assert layers["building_layer"]["available"] is False
    assert layers["building_layer"]["fallback_reason_code"] == "matchFirst.neighborhood.missing3d"
    assert layers["amenity_layer"]["endpoint"].endswith(f"/{neighborhood_id}/amenities")
    assert layers["fallback_2d_available"] is True


@pytest.mark.asyncio
async def test_building_requests_are_clipped_and_reject_national_bounds(
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
    assert body["buildings"][0]["building_id"] == f"bldg_{neighborhood_id}_001"
    assert body["buildings"][0]["vbo_id"] == "0363010000123456"
    assert body["buildings"][0]["lookup_id"] == "adr-abc123"
    assert body["buildings"][0]["address_resolution"] == "resolved"
    assert body["fallback_reason_code"] == "matchFirst.neighborhood.missing3d"

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
async def test_amenities_are_preference_aware_capped_and_do_not_return_all_points(
    client,
    match_neighborhood_layers_db,
):
    results = await _run_completed_match(client)
    neighborhood_id = results["ranked_results"][0]["neighborhood_id"]

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
    assert 5 <= len(tags) <= 7
    assert len(keys) == len(set(keys))
    assert "parks" in keys
    assert "transit" in keys
    assert all(tag["label_key"].startswith("matchFirst.amenity.") for tag in tags)
    assert all(tag["source_refs"] for tag in tags)
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
