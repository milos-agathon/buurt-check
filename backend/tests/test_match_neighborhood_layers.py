from unittest.mock import patch

import pytest

from app.config import settings
from app.db import init_db
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
