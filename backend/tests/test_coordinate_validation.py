"""Tests for coordinate range validation on all endpoints accepting rd_x, rd_y, lat, lng."""

import pytest

VBO_ID = "0363200012345678"
PAND_ID = "0363100012345678"

# Valid coordinates (Amsterdam area)
VALID_RD_X = 121286.0
VALID_RD_Y = 487296.0
VALID_LAT = 52.372
VALID_LNG = 4.892

# Out-of-range coordinates
BAD_RD_X_LOW = -1.0
BAD_RD_X_HIGH = 300001.0
BAD_RD_Y_LOW = 284999.0
BAD_RD_Y_HIGH = 625001.0
BAD_LAT_LOW = 50.4
BAD_LAT_HIGH = 53.9
BAD_LNG_LOW = 3.1
BAD_LNG_HIGH = 7.4


@pytest.mark.asyncio
async def test_wms_tile_rejects_rd_x_out_of_range(client):
    """WMS tile endpoint rejects rd_x outside [0, 300000]."""
    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": BAD_RD_X_LOW, "rd_y": VALID_RD_Y},
    )
    assert resp.status_code == 422

    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": BAD_RD_X_HIGH, "rd_y": VALID_RD_Y},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_wms_tile_rejects_rd_y_out_of_range(client):
    """WMS tile endpoint rejects rd_y outside [285000, 625000]."""
    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": VALID_RD_X, "rd_y": BAD_RD_Y_LOW},
    )
    assert resp.status_code == 422

    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": VALID_RD_X, "rd_y": BAD_RD_Y_HIGH},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_building3d_rejects_out_of_range_coords(client):
    """building3d endpoint rejects coordinates outside Netherlands bounds."""
    # Bad rd_x
    resp = await client.get(
        f"/api/address/{VBO_ID}/building3d",
        params={
            "pand_id": PAND_ID,
            "rd_x": BAD_RD_X_HIGH,
            "rd_y": VALID_RD_Y,
            "lat": VALID_LAT,
            "lng": VALID_LNG,
        },
    )
    assert resp.status_code == 422

    # Bad lat
    resp = await client.get(
        f"/api/address/{VBO_ID}/building3d",
        params={
            "pand_id": PAND_ID,
            "rd_x": VALID_RD_X,
            "rd_y": VALID_RD_Y,
            "lat": BAD_LAT_HIGH,
            "lng": VALID_LNG,
        },
    )
    assert resp.status_code == 422

    # Bad lng
    resp = await client.get(
        f"/api/address/{VBO_ID}/building3d",
        params={
            "pand_id": PAND_ID,
            "rd_x": VALID_RD_X,
            "rd_y": VALID_RD_Y,
            "lat": VALID_LAT,
            "lng": BAD_LNG_HIGH,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_neighborhood3d_rejects_out_of_range_coords(client):
    """neighborhood3d endpoint rejects coordinates outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/neighborhood3d",
        params={
            "pand_id": PAND_ID,
            "rd_x": BAD_RD_X_LOW,
            "rd_y": VALID_RD_Y,
            "lat": VALID_LAT,
            "lng": VALID_LNG,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_risks_rejects_out_of_range_coords(client):
    """risks endpoint rejects coordinates outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/risks",
        params={
            "rd_x": VALID_RD_X,
            "rd_y": BAD_RD_Y_LOW,
            "lat": VALID_LAT,
            "lng": VALID_LNG,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_neighborhood_rejects_out_of_range_lat_lng(client):
    """neighborhood endpoint rejects lat/lng outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/neighborhood",
        params={"lat": BAD_LAT_LOW, "lng": VALID_LNG},
    )
    assert resp.status_code == 422

    resp = await client.get(
        f"/api/address/{VBO_ID}/neighborhood",
        params={"lat": VALID_LAT, "lng": BAD_LNG_LOW},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_risk_comparisons_rejects_out_of_range_coords(client):
    """risk-comparisons endpoint rejects coordinates outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/risk-comparisons",
        params={
            "rd_x": VALID_RD_X,
            "rd_y": VALID_RD_Y,
            "lat": BAD_LAT_HIGH,
            "lng": VALID_LNG,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_viewing_questions_rejects_out_of_range_coords(client):
    """viewing-questions endpoint rejects coordinates outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/viewing-questions",
        params={
            "rd_x": VALID_RD_X,
            "rd_y": VALID_RD_Y,
            "lat": VALID_LAT,
            "lng": BAD_LNG_HIGH,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_livability_rejects_out_of_range_coords(client):
    """livability endpoint rejects rd_x/rd_y outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/livability",
        params={"rd_x": BAD_RD_X_HIGH, "rd_y": VALID_RD_Y},
    )
    assert resp.status_code == 422

    resp = await client.get(
        f"/api/address/{VBO_ID}/livability",
        params={"rd_x": VALID_RD_X, "rd_y": BAD_RD_Y_HIGH},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_property_warnings_rejects_out_of_range_coords(client):
    """property-warnings endpoint rejects rd_x/rd_y outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/property-warnings",
        params={"rd_x": BAD_RD_X_LOW, "rd_y": VALID_RD_Y},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_export_get_rejects_out_of_range_coords(client):
    """GET export endpoint rejects coordinates outside Netherlands bounds."""
    resp = await client.get(
        f"/api/address/{VBO_ID}/export",
        params={
            "rd_x": BAD_RD_X_HIGH,
            "rd_y": VALID_RD_Y,
            "lat": VALID_LAT,
            "lng": VALID_LNG,
            "address": "Test address",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_export_post_rejects_out_of_range_coords(client):
    """POST export rejects coordinates outside Netherlands bounds."""
    resp = await client.post(
        f"/api/address/{VBO_ID}/export",
        json={
            "rd_x": VALID_RD_X,
            "rd_y": BAD_RD_Y_HIGH,
            "lat": VALID_LAT,
            "lng": VALID_LNG,
            "address": "Test address",
        },
    )
    assert resp.status_code == 422

    # Bad lat in POST body
    resp = await client.post(
        f"/api/address/{VBO_ID}/export",
        json={
            "rd_x": VALID_RD_X,
            "rd_y": VALID_RD_Y,
            "lat": BAD_LAT_LOW,
            "lng": VALID_LNG,
            "address": "Test address",
        },
    )
    assert resp.status_code == 422

    # Bad lng in POST body
    resp = await client.post(
        f"/api/address/{VBO_ID}/export",
        json={
            "rd_x": VALID_RD_X,
            "rd_y": VALID_RD_Y,
            "lat": VALID_LAT,
            "lng": BAD_LNG_LOW,
            "address": "Test address",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_boundary_values_accepted(client):
    """Boundary values at exact limits should be accepted (not 422).

    We only check status != 422 — these may return 502 if external APIs
    are mocked/unavailable, but they should pass validation.
    """
    # Exact min rd_x = 0, min rd_y = 285000
    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": 0, "rd_y": 285000},
    )
    assert resp.status_code != 422

    # Exact max rd_x = 300000, max rd_y = 625000
    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": 300000, "rd_y": 625000},
    )
    assert resp.status_code != 422
