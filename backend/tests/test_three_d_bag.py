from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models.neighborhood3d import BuildingBlock
from app.services.three_d_bag import (
    MAX_PAGES,
    _fetch_bbox_buildings,
    _fetch_target_building,
    _parse_building,
    get_neighborhood_3d,
)

# --- _parse_building unit tests ---

SCALE = [0.001, 0.001, 0.001]
TRANSLATE = [121000.0, 487000.0, 0.0]
CENTER_X = 121005.0
CENTER_Y = 487005.0


def _make_city_object(
    *,
    h_maaiveld=1.75,
    h_dak_max=18.18,
    year=1917,
    lod0=True,
    boundaries=None,
):
    """Build a minimal CityJSON Building object for testing."""
    geoms = []
    if lod0:
        if boundaries is None:
            # Square footprint: 10m x 10m centered at translate origin
            boundaries = [[[0, 1, 2, 3]]]
        geoms.append({"lod": "0", "type": "MultiSurface", "boundaries": boundaries})
    # Always include a higher LoD too
    geoms.append({"lod": "2.2", "type": "Solid", "boundaries": []})

    attrs = {"identificatie": "NL.IMBAG.Pand.0363100012253924", "oorspronkelijkbouwjaar": year}
    if h_maaiveld is not None:
        attrs["b3_h_maaiveld"] = h_maaiveld
    if h_dak_max is not None:
        attrs["b3_h_dak_max"] = h_dak_max

    return attrs, geoms


def test_parse_building():
    attrs, geoms = _make_city_object()
    city_object = {"type": "Building", "attributes": attrs, "geometry": geoms}
    # Vertices: 4 corners of a 10m x 10m square at translate origin
    # vertex * scale + translate = real coords
    # real_x = v[0] * 0.001 + 121000.0, so v[0]=0 => 121000.0, v[0]=10000 => 121010.0
    vertices = [
        [0, 0, 0],       # (121000, 487000) -> offset (-5, -5)
        [10000, 0, 0],   # (121010, 487000) -> offset (5, -5)
        [10000, 10000, 0],  # (121010, 487010) -> offset (5, 5)
        [0, 10000, 0],   # (121000, 487010) -> offset (-5, 5)
    ]

    result = _parse_building(city_object, vertices, SCALE, TRANSLATE, CENTER_X, CENTER_Y)

    assert result is not None
    assert isinstance(result, BuildingBlock)
    assert result.pand_id == "0363100012253924"
    assert result.ground_height == 1.75
    assert result.building_height == 16.43
    assert result.year == 1917
    assert len(result.footprint) == 4
    assert result.footprint[0] == [-5.0, -5.0]
    assert result.footprint[1] == [5.0, -5.0]


def test_parse_building_missing_heights():
    attrs, geoms = _make_city_object(h_maaiveld=None, h_dak_max=None)
    city_object = {"type": "Building", "attributes": attrs, "geometry": geoms}
    vertices = [[0, 0, 0], [10000, 0, 0], [10000, 10000, 0], [0, 10000, 0]]

    result = _parse_building(city_object, vertices, SCALE, TRANSLATE, CENTER_X, CENTER_Y)
    assert result is None


def test_parse_building_missing_h_dak_max():
    attrs, geoms = _make_city_object(h_maaiveld=1.0, h_dak_max=None)
    city_object = {"type": "Building", "attributes": attrs, "geometry": geoms}
    vertices = [[0, 0, 0], [10000, 0, 0], [10000, 10000, 0], [0, 10000, 0]]

    result = _parse_building(city_object, vertices, SCALE, TRANSLATE, CENTER_X, CENTER_Y)
    assert result is None


def test_parse_building_no_lod0():
    attrs, geoms = _make_city_object(lod0=False)
    city_object = {"type": "Building", "attributes": attrs, "geometry": geoms}
    vertices = [[0, 0, 0], [10000, 0, 0], [10000, 10000, 0], [0, 10000, 0]]

    result = _parse_building(city_object, vertices, SCALE, TRANSLATE, CENTER_X, CENTER_Y)
    assert result is None


def test_parse_building_negative_height():
    """Building where ground is higher than roof should be skipped."""
    attrs, geoms = _make_city_object(h_maaiveld=20.0, h_dak_max=10.0)
    city_object = {"type": "Building", "attributes": attrs, "geometry": geoms}
    vertices = [[0, 0, 0], [10000, 0, 0], [10000, 10000, 0], [0, 10000, 0]]

    result = _parse_building(city_object, vertices, SCALE, TRANSLATE, CENTER_X, CENTER_Y)
    assert result is None


def test_parse_building_too_few_vertices():
    """Footprint with fewer than 3 vertices should be skipped."""
    attrs, geoms = _make_city_object(boundaries=[[[0, 1]]])
    city_object = {"type": "Building", "attributes": attrs, "geometry": geoms}
    vertices = [[0, 0, 0], [10000, 0, 0]]

    result = _parse_building(city_object, vertices, SCALE, TRANSLATE, CENTER_X, CENTER_Y)
    assert result is None


# --- Helper factories ---


def _make_3dbag_response(features, next_link=None):
    """Build a 3DBAG paginated API response dict (FeatureCollection)."""
    links = [{"rel": "self", "href": "http://example.com"}]
    if next_link:
        links.append({"rel": "next", "href": next_link})
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "transform": {
                "scale": [0.001, 0.001, 0.001],
                "translate": [121000.0, 487000.0, 0.0],
            }
        },
        "links": links,
        "numberMatched": len(features),
        "numberReturned": len(features),
    }


def _make_feature(pand_id="0363100012253924", h_maaiveld=1.75, h_dak_max=18.18, year=1917):
    co_name = f"NL.IMBAG.Pand.{pand_id}"
    return {
        "type": "CityJSONFeature",
        "id": co_name,
        "CityObjects": {
            co_name: {
                "type": "Building",
                "attributes": {
                    "identificatie": f"NL.IMBAG.Pand.{pand_id}",
                    "b3_h_maaiveld": h_maaiveld,
                    "b3_h_dak_max": h_dak_max,
                    "oorspronkelijkbouwjaar": year,
                },
                "geometry": [
                    {
                        "lod": "0",
                        "type": "MultiSurface",
                        "boundaries": [[[0, 1, 2, 3]]],
                    }
                ],
            }
        },
        "vertices": [
            [0, 0, 0],
            [10000, 0, 0],
            [10000, 10000, 0],
            [0, 10000, 0],
        ],
    }


def _make_single_item_response(
    pand_id="0363100012253924", h_maaiveld=1.75, h_dak_max=18.18, year=1917,
):
    """Build a 3DBAG single-item response matching the real API shape.

    Real API nests CityObjects/vertices/metadata under a "feature" key.
    Root-level vertices/metadata are also present but are duplicates.
    """
    co_name = f"NL.IMBAG.Pand.{pand_id}"
    feature_data = {
        "CityObjects": {
            co_name: {
                "type": "Building",
                "attributes": {
                    "identificatie": co_name,
                    "b3_h_maaiveld": h_maaiveld,
                    "b3_h_dak_max": h_dak_max,
                    "oorspronkelijkbouwjaar": year,
                },
                "geometry": [
                    {
                        "lod": "0",
                        "type": "MultiSurface",
                        "boundaries": [[[0, 1, 2, 3]]],
                    }
                ],
            }
        },
        "vertices": [
            [0, 0, 0],
            [10000, 0, 0],
            [10000, 10000, 0],
            [0, 10000, 0],
        ],
        "metadata": {
            "transform": {
                "scale": [0.001, 0.001, 0.001],
                "translate": [121000.0, 487000.0, 0.0],
            }
        },
    }
    return {
        "type": "CityJSONFeature",
        "id": co_name,
        "feature": feature_data,
        # Root-level duplicates (as seen in real API)
        "vertices": feature_data["vertices"],
        "metadata": feature_data["metadata"],
    }


def _make_mock_resp(data):
    """Create a MagicMock HTTP response with the given JSON data."""
    resp = MagicMock()
    resp.json.return_value = data
    resp.raise_for_status.return_value = None
    return resp


def _route_responses(direct_resp, bbox_resp):
    """Create a side_effect function that routes by URL pattern."""
    def _side_effect(url, **kwargs):
        if "NL.IMBAG.Pand." in str(url):
            return direct_resp
        return bbox_resp
    return _side_effect


# --- _fetch_target_building tests ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_building_success(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    data = _make_single_item_response()
    mock_client.get.return_value = _make_mock_resp(data)

    result = await _fetch_target_building("0363100012253924", CENTER_X, CENTER_Y)

    assert result is not None
    assert result.pand_id == "0363100012253924"
    assert result.building_height == 16.43
    # Verify correct URL was called
    call_url = str(mock_client.get.call_args[0][0])
    assert "NL.IMBAG.Pand.0363100012253924" in call_url


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_building_http_error(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    mock_client.get.side_effect = httpx.HTTPStatusError(
        "Not Found", request=MagicMock(), response=MagicMock(status_code=404)
    )

    result = await _fetch_target_building("0363100012253924", CENTER_X, CENTER_Y)
    assert result is None


# --- get_neighborhood_3d integration tests (mocked HTTP) ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_single_page(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    direct_data = _make_single_item_response()
    bbox_data = _make_3dbag_response([_make_feature()])

    mock_client.get.side_effect = _route_responses(
        _make_mock_resp(direct_data), _make_mock_resp(bbox_data)
    )

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    # Target appears only once (deduplication)
    assert len(result.buildings) == 1
    assert result.buildings[0].pand_id == "0363100012253924"
    assert result.target_pand_id == "0363100012253924"
    assert result.message is None


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_pagination(mock_get_client):
    """MAX_PAGES=1 means bbox stops after one page even if next_link exists."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    direct_data = _make_single_item_response()

    # Both buildings on a single page, with a next_link that should NOT be followed
    page1 = _make_3dbag_response(
        [_make_feature("0363100012253924"), _make_feature("0363100099999999", year=2000)],
        next_link="https://api.3dbag.nl/collections/pand/items?offset=1",
    )

    bbox_resp1 = _make_mock_resp(page1)

    def route(url, **kwargs):
        if "NL.IMBAG.Pand." in str(url):
            return _make_mock_resp(direct_data)
        return bbox_resp1

    mock_client.get.side_effect = route

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    # Target (direct) + 1 neighbor from page1 (target in page1 deduplicated)
    assert len(result.buildings) == 2
    assert result.target_pand_id == "0363100012253924"

    # Verify page 2 was never fetched: only direct + 1 bbox call = 2 total
    bbox_calls = [c for c in mock_client.get.call_args_list if "NL.IMBAG.Pand." not in str(c)]
    assert len(bbox_calls) == 1, f"Expected 1 bbox call (MAX_PAGES=1), got {len(bbox_calls)}"


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_empty(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    # Direct fetch fails, bbox returns empty
    direct_error = httpx.HTTPStatusError(
        "Not Found", request=MagicMock(), response=MagicMock(status_code=404)
    )
    bbox_data = _make_3dbag_response([])

    def route(url, **kwargs):
        if "NL.IMBAG.Pand." in str(url):
            raise direct_error
        return _make_mock_resp(bbox_data)

    mock_client.get.side_effect = route

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    assert len(result.buildings) == 0
    assert result.target_pand_id is None
    assert result.message == "No 3D building data available for this area"


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_target_not_found(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    # Direct fetch fails, bbox has other buildings
    direct_error = httpx.HTTPStatusError(
        "Not Found", request=MagicMock(), response=MagicMock(status_code=404)
    )
    bbox_data = _make_3dbag_response([_make_feature("0363100099999999")])

    def route(url, **kwargs):
        if "NL.IMBAG.Pand." in str(url):
            raise direct_error
        return _make_mock_resp(bbox_data)

    mock_client.get.side_effect = route

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    assert len(result.buildings) == 1
    assert result.target_pand_id is None
    assert result.message == "Target building not found in 3D data"


# --- New tests for direct fetch + parallel strategy ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_target_via_direct(mock_get_client):
    """Target found via direct fetch even when bbox doesn't contain it."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    direct_data = _make_single_item_response("0363100012253924")
    # Bbox only has a different building
    bbox_data = _make_3dbag_response([_make_feature("0363100099999999")])

    mock_client.get.side_effect = _route_responses(
        _make_mock_resp(direct_data), _make_mock_resp(bbox_data)
    )

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    assert result.target_pand_id == "0363100012253924"
    assert result.message is None
    # Target + 1 neighbor
    assert len(result.buildings) == 2
    assert result.buildings[0].pand_id == "0363100012253924"  # target first


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_deduplication(mock_get_client):
    """Target in both direct + bbox appears only once."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    pand_id = "0363100012253924"
    direct_data = _make_single_item_response(pand_id)
    # Bbox also has the same target + another building
    bbox_data = _make_3dbag_response([
        _make_feature(pand_id),
        _make_feature("0363100099999999"),
    ])

    mock_client.get.side_effect = _route_responses(
        _make_mock_resp(direct_data), _make_mock_resp(bbox_data)
    )

    result = await get_neighborhood_3d(
        pand_id=pand_id,
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    # Only 2 buildings (target deduplicated)
    assert len(result.buildings) == 2
    pand_ids = [b.pand_id for b in result.buildings]
    assert pand_ids.count(pand_id) == 1  # no duplicates
    assert result.buildings[0].pand_id == pand_id  # target is first


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_vbo_id_as_address_id(mock_get_client):
    """address_id uses vbo_id when provided."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    direct_data = _make_single_item_response()
    bbox_data = _make_3dbag_response([])

    mock_client.get.side_effect = _route_responses(
        _make_mock_resp(direct_data), _make_mock_resp(bbox_data)
    )

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
        vbo_id="0363010012345678",
    )

    assert result.address_id == "0363010012345678"


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_address_id_fallback_to_pand_id(mock_get_client):
    """address_id falls back to pand_id when vbo_id not provided."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    direct_data = _make_single_item_response()
    bbox_data = _make_3dbag_response([])

    mock_client.get.side_effect = _route_responses(
        _make_mock_resp(direct_data), _make_mock_resp(bbox_data)
    )

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    assert result.address_id == "0363100012253924"


# --- Bug fix tests ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_building_root_level_fallback(mock_get_client):
    """Old-style response without 'feature' wrapper still works via fallback."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    co_name = "NL.IMBAG.Pand.0363100012253924"
    # Root-level structure (no "feature" key) — legacy/fallback shape
    data = {
        "type": "CityJSONFeature",
        "id": co_name,
        "CityObjects": {
            co_name: {
                "type": "Building",
                "attributes": {
                    "identificatie": co_name,
                    "b3_h_maaiveld": 1.75,
                    "b3_h_dak_max": 18.18,
                    "oorspronkelijkbouwjaar": 1917,
                },
                "geometry": [
                    {
                        "lod": "0",
                        "type": "MultiSurface",
                        "boundaries": [[[0, 1, 2, 3]]],
                    }
                ],
            }
        },
        "vertices": [
            [0, 0, 0],
            [10000, 0, 0],
            [10000, 10000, 0],
            [0, 10000, 0],
        ],
        "metadata": {
            "transform": {
                "scale": [0.001, 0.001, 0.001],
                "translate": [121000.0, 487000.0, 0.0],
            }
        },
    }
    mock_client.get.return_value = _make_mock_resp(data)

    result = await _fetch_target_building("0363100012253924", CENTER_X, CENTER_Y)

    assert result is not None
    assert result.pand_id == "0363100012253924"
    assert result.building_height == 16.43


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_respects_max_pages(mock_get_client):
    """Bbox pagination stops at MAX_PAGES even if more pages are available."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    call_count = 0

    def always_next_page(url, **kwargs):
        nonlocal call_count
        call_count += 1
        pand_id = f"036310000000{call_count:04d}"
        page = _make_3dbag_response(
            [_make_feature(pand_id)],
            next_link=f"https://api.3dbag.nl/collections/pand/items?offset={call_count}",
        )
        return _make_mock_resp(page)

    mock_client.get.side_effect = always_next_page

    buildings = await _fetch_bbox_buildings(CENTER_X, CENTER_Y, 250.0)

    assert call_count == MAX_PAGES
    assert len(buildings) == MAX_PAGES


@pytest.mark.asyncio
@patch("app.services.three_d_bag.time")
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_stops_on_time_budget(mock_get_client, mock_time):
    """Bbox pagination stops when time budget is exhausted."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    # Simulate: start=0.0, first remaining check=0.0, page_start=0.0,
    # page_end=2.0, then remaining check=19.5 (remaining=0.5 < 1.0 → break)
    mock_time.monotonic.side_effect = [0.0, 0.0, 0.0, 2.0, 19.5, 19.5]

    call_count = 0

    def always_next_page(url, **kwargs):
        nonlocal call_count
        call_count += 1
        pand_id = f"036310000000{call_count:04d}"
        page = _make_3dbag_response(
            [_make_feature(pand_id)],
            next_link=f"https://api.3dbag.nl/collections/pand/items?offset={call_count}",
        )
        return _make_mock_resp(page)

    mock_client.get.side_effect = always_next_page

    buildings = await _fetch_bbox_buildings(CENTER_X, CENTER_Y, 250.0)

    assert call_count == 1
    assert len(buildings) == 1


@pytest.mark.asyncio
@patch("app.services.three_d_bag.time")
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_returns_partial_on_mid_page_failure(mock_get_client, mock_time):
    """Page 1 succeeds, page 2 fails with timeout — returns partial results."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    # No time pressure — always return 0.0
    mock_time.monotonic.return_value = 0.0

    call_count = 0

    def page_then_fail(url, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            page = _make_3dbag_response(
                [_make_feature("0363100000000001")],
                next_link="https://api.3dbag.nl/collections/pand/items?offset=1",
            )
            return _make_mock_resp(page)
        raise httpx.TimeoutException("read timeout")

    mock_client.get.side_effect = page_then_fail

    buildings = await _fetch_bbox_buildings(CENTER_X, CENTER_Y, 250.0)

    assert len(buildings) == 1
    assert buildings[0].pand_id == "0363100000000001"
