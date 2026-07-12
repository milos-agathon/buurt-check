import asyncio
import re
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse
from app.services.three_d_bag import (
    _compute_building_orientation,
    _enrich_with_lod22,
    _extract_lod22_surfaces,
    _fetch_bbox_parallel_quadrants,
    _fetch_bbox_quick_context,
    _fetch_single_quadrant,
    _fetch_target_budgeted,
    _fetch_target_building,
    _parse_building,
    _quadrant_bboxes,
    get_neighborhood_3d,
    get_target_building_3d,
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


def _make_feature_with_lod22_child(
    pand_id="0363100012253924",
    h_maaiveld=1.75,
    h_dak_max=10.0,
    year=1917,
):
    """Build a bbox feature whose Building has a BuildingPart with LoD 2.2 geometry."""
    parent_name = f"NL.IMBAG.Pand.{pand_id}"
    part_name = f"{parent_name}-0"

    return {
        "type": "CityJSONFeature",
        "id": parent_name,
        "CityObjects": {
            parent_name: {
                "type": "Building",
                "attributes": {
                    "identificatie": parent_name,
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
                "children": [part_name],
            },
            part_name: {
                "type": "BuildingPart",
                "parents": [parent_name],
                "geometry": [
                    {
                        "lod": "2.2",
                        "type": "Solid",
                        "boundaries": [[
                            [[4, 5, 6, 7]],
                            [[0, 3, 2, 1]],
                            [[0, 1, 5, 4]],
                            [[1, 2, 6, 5]],
                            [[2, 3, 7, 6]],
                            [[3, 0, 4, 7]],
                        ]],
                    }
                ],
            },
        },
        "vertices": LOD22_VERTICES,
    }


def _make_single_item_response(
    pand_id="0363100012253924", h_maaiveld=1.75, h_dak_max=18.18, year=1917,
):
    """Build a 3DBAG single-item response matching the real API shape.

    Real API structure (verified against live 3DBAG):
    - feature.CityObjects, feature.vertices: building data
    - metadata.transform: transform at ROOT level (NOT inside feature!)
    """
    co_name = f"NL.IMBAG.Pand.{pand_id}"
    vertices = [
        [0, 0, 0],
        [10000, 0, 0],
        [10000, 10000, 0],
        [0, 10000, 0],
    ]
    return {
        "type": "CityJSONFeature",
        "id": co_name,
        "feature": {
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
            "vertices": vertices,
            # Note: NO metadata inside feature (matches real API)
        },
        # Transform is at ROOT level metadata
        "metadata": {
            "transform": {
                "scale": [0.001, 0.001, 0.001],
                "translate": [121000.0, 487000.0, 0.0],
            }
        },
    }


def _make_mock_resp(data):
    """Create a MagicMock HTTP response with the given JSON data."""
    resp = MagicMock()
    resp.json.return_value = data
    resp.raise_for_status.return_value = None
    return resp


def _route_responses(bbox_resp):
    """Create a side_effect function that routes by URL pattern.

    Any single-item request returns a matching single-item payload for that pand_id,
    which keeps LoD2.2 enrichment deterministic in tests.
    """
    def _side_effect(url, **kwargs):
        s_url = str(url)
        match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
        if match:
            return _make_mock_resp(_make_single_item_response(match.group(1)))
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


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_building_retries_transient_502(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    transient_502 = httpx.HTTPStatusError(
        "Bad Gateway",
        request=MagicMock(),
        response=MagicMock(status_code=502),
    )
    mock_client.get.side_effect = [
        transient_502,
        transient_502,
        _make_mock_resp(_make_single_item_response()),
    ]

    result = await _fetch_target_building("0363100012253924", CENTER_X, CENTER_Y)

    assert result is not None
    assert result.pand_id == "0363100012253924"
    assert mock_client.get.call_count == 3


@pytest.mark.asyncio
@patch("app.services.three_d_bag.TARGET_FETCH_BUDGET", 0.5)
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_budgeted_caps_wall_clock(mock_get_client):
    """Budget wrapper must cap wall-clock even when target endpoint is slow."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    call_count = 0

    async def slow_target(url, **kwargs):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(10)
        return _make_mock_resp(_make_single_item_response("0363100012253924"))

    mock_client.get.side_effect = slow_target

    start = time.monotonic()
    result = await _fetch_target_budgeted("0363100012253924", 121005.0, 487005.0)
    elapsed = time.monotonic() - start

    assert result is None
    assert elapsed < 2.0, f"Budget should cap wall-clock; took {elapsed:.1f}s"
    assert call_count <= 2, f"Budget should prevent full retry exhaustion; {call_count} calls made"


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_budgeted_returns_building_on_success(mock_get_client):
    """Budget wrapper should pass through successful responses unchanged."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    mock_client.get.return_value = _make_mock_resp(
        _make_single_item_response("0363100012253924")
    )

    result = await _fetch_target_budgeted("0363100012253924", 121005.0, 487005.0)

    assert result is not None
    assert result.pand_id == "0363100012253924"


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_quick_context_reference_origin(mock_get_client):
    """Context fetch can query around one center but keep a stable output origin."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    response = {
        "type": "FeatureCollection",
        "features": [_make_feature("0363100099999999")],
        "metadata": {
            "transform": {
                "scale": [0.001, 0.001, 0.001],
                "translate": [121010.0, 487010.0, 0.0],
            }
        },
        "links": [{"rel": "self", "href": "http://example.com"}],
        "numberMatched": 1,
        "numberReturned": 1,
    }
    mock_client.get.return_value = _make_mock_resp(response)

    # Default origin is the query center.
    default_buildings, default_partial = await _fetch_bbox_quick_context(
        121015.0,
        487015.0,
        30.0,
    )
    assert default_partial is False
    assert default_buildings[0].footprint[0] == [-5.0, -5.0]

    # Explicit origin keeps all footprints in the shared neighborhood frame.
    shared_buildings, shared_partial = await _fetch_bbox_quick_context(
        121015.0,
        487015.0,
        30.0,
        reference_x=121005.0,
        reference_y=487005.0,
    )
    assert shared_partial is False
    assert shared_buildings[0].footprint[0] == [5.0, 5.0]


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_quick_context_retries_transient_502(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    transient_502 = httpx.HTTPStatusError(
        "Bad Gateway",
        request=MagicMock(),
        response=MagicMock(status_code=502),
    )
    response = {
        "type": "FeatureCollection",
        "features": [_make_feature("0363100099999999")],
        "metadata": {
            "transform": {
                "scale": [0.001, 0.001, 0.001],
                "translate": [121010.0, 487010.0, 0.0],
            }
        },
        "links": [{"rel": "self", "href": "http://example.com"}],
        "numberMatched": 1,
        "numberReturned": 1,
    }

    mock_client.get.side_effect = [
        transient_502,
        _make_mock_resp(response),
    ]

    buildings, partial = await _fetch_bbox_quick_context(
        121015.0,
        487015.0,
        30.0,
    )

    assert partial is False
    assert len(buildings) == 1
    assert buildings[0].pand_id == "0363100099999999"
    assert mock_client.get.call_count == 2


# --- get_neighborhood_3d integration tests (mocked HTTP) ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_single_page(mock_get_client):
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    bbox_data = _make_3dbag_response([_make_feature()])

    mock_client.get.side_effect = _route_responses(_make_mock_resp(bbox_data))

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
async def test_get_neighborhood_3d_parallel_strategy(mock_get_client):
    """Verify paginated bbox fetch returns surrounding buildings."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    bbox_resp = _make_3dbag_response([
        _make_feature("0363100000000001"),
        _make_feature("0363100000000002"),
    ])

    def side_effect(url, **kwargs):
        s_url = str(url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        if "bbox=" in s_url:
            return _make_mock_resp(bbox_resp)
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    assert len(result.buildings) == 3
    ids = {b.pand_id for b in result.buildings}
    assert "0363100012253924" in ids
    assert "0363100000000001" in ids
    assert "0363100000000002" in ids


@pytest.mark.asyncio
@patch("app.services.three_d_bag.TARGET_FETCH_BUDGET", 0.5)
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_impl_bounded_by_budgets(mock_get_client):
    """Gather wall-clock should be bounded by target and bbox budgets."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    target_id = "0363100012253924"
    bbox_resp = _make_3dbag_response([
        _make_feature("0363100000000001"),
        _make_feature("0363100000000002"),
    ])

    call_count = 0

    async def side_effect(url, **kwargs):
        nonlocal call_count
        s_url = str(url)
        if f"NL.IMBAG.Pand.{target_id}" in s_url:
            call_count += 1
            await asyncio.sleep(10)
            return _make_mock_resp(_make_single_item_response(target_id))
        match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
        if match:
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    start = time.monotonic()
    result = await get_neighborhood_3d(
        pand_id=target_id,
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )
    elapsed = time.monotonic() - start

    assert elapsed < 5.0, (
        f"gather wall-clock should be bounded by TARGET_FETCH_BUDGET; took {elapsed:.1f}s"
    )
    assert len(result.buildings) >= 1
    assert call_count <= 2


@pytest.mark.asyncio
@patch("app.services.three_d_bag.TARGET_FETCH_BUDGET", 0.5)
@patch("app.services.three_d_bag._get_client")
async def test_get_target_building_3d_bounded_by_target_budget(mock_get_client):
    """Target-only endpoint must also honor the target fetch budget."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    async def slow_target(url, **kwargs):
        await asyncio.sleep(10)
        return _make_mock_resp(_make_single_item_response("0363100012253924"))

    mock_client.get.side_effect = slow_target

    start = time.monotonic()
    result = await get_target_building_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )
    elapsed = time.monotonic() - start

    assert elapsed < 2.0, (
        f"target-only endpoint should be bounded by TARGET_FETCH_BUDGET; took {elapsed:.1f}s"
    )
    assert result.target_pand_id is None
    assert result.buildings == []
    assert result.message == "Target building not found in 3D data"


@pytest.mark.asyncio
@patch("app.services.three_d_bag.settings")
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_fast_path_skips_context_enrichment(
    mock_get_client, mock_settings
):
    """Fast path should avoid N single-item context calls that cause long tail latency."""
    mock_settings.enable_lod22_roofs = True
    mock_settings.enable_lod22_context_enrichment = False
    mock_settings.three_d_bag_base = "https://api.3dbag.nl"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    bbox_resp = _make_3dbag_response(
        [
            _make_feature("0363100000000001"),
            _make_feature("0363100000000002"),
        ]
    )
    single_item_calls = 0

    def side_effect(url, **kwargs):
        nonlocal single_item_calls
        s_url = str(url)
        if "NL.IMBAG.Pand." in s_url:
            single_item_calls += 1
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    # One direct fetch for target + one bbox page, no context single-item enrichment.
    assert single_item_calls == 1
    assert len(result.buildings) == 3
    ids = {b.pand_id for b in result.buildings}
    assert "0363100012253924" in ids
    assert "0363100000000001" in ids
    assert "0363100000000002" in ids


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_accelerated_mode_skips_near_ring_prefetch(mock_get_client):
    """Near-ring prefetch is skipped in accelerated mode (redundant with quadrants)."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    import app.services.three_d_bag as mod
    if mod.settings.three_d_conservative_mode:
        pytest.skip("Only applies in accelerated mode")

    bbox_resp = _make_3dbag_response([
        _make_feature("0363100000000001"),
        _make_feature("0363100000000002"),
    ])
    seen_urls: list[str] = []

    def side_effect(url, **kwargs):
        s_url = str(url)
        seen_urls.append(s_url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    # No near-ring URL (108m radius) should appear — only quadrant URLs
    near_ring_urls = [u for u in seen_urls if "bbox=120897,486897" in u]
    assert len(near_ring_urls) == 0
    assert len(result.buildings) >= 1


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_keeps_completed_near_ring_context_when_bbox_has_context(
    mock_get_client,
):
    """Keep prefetched near-ring buildings to avoid dropping close context."""
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Near-ring prefetch only applies in conservative mode")

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    bbox_resp = _make_3dbag_response([_make_feature("0363100000000001")])
    near_resp = _make_3dbag_response([_make_feature("0363100000000002")])

    async def side_effect(url, **kwargs):
        s_url = str(url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        if "bbox=120870,486870,121140,487140" in s_url:
            # Near-ring prefetch (rd ±135m).
            return _make_mock_resp(near_resp)
        if "bbox=120855,486855,121155,487155" in s_url:
            # Broader bbox query (rd ±150m): still has context, but misses one close building.
            await asyncio.sleep(0.02)
            return _make_mock_resp(bbox_resp)
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    ids = {b.pand_id for b in result.buildings}
    assert "0363100012253924" in ids
    assert "0363100000000001" in ids
    assert "0363100000000002" in ids
    assert len(result.buildings) == 3


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_fetches_bbox_next_page(mock_get_client):
    """Bbox pagination should include buildings from follow-up pages."""
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Sequential pagination only applies in conservative mode")

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    first_page = _make_3dbag_response(
        [_make_feature("0363100000000001")],
        next_link=(
            "https://api.3dbag.nl/collections/pand/items?"
            "bbox=120855,486855,121155,487155&offset=101"
        ),
    )
    second_page = _make_3dbag_response([_make_feature("0363100000000002")])

    def side_effect(url, **kwargs):
        s_url = str(url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        if "bbox=" in s_url and "offset=101" in s_url:
            return _make_mock_resp(second_page)
        if "bbox=" in s_url:
            return _make_mock_resp(first_page)
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    ids = {b.pand_id for b in result.buildings}
    assert "0363100012253924" in ids
    assert "0363100000000001" in ids
    assert "0363100000000002" in ids
    assert len(result.buildings) == 3
    assert result.message is None



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
        s_url = str(url)
        if "NL.IMBAG.Pand.0363100012253924" in s_url:
            raise direct_error
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
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


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_target_found_from_bbox_when_direct_fails(mock_get_client):
    """If direct fetch fails but bbox contains target, keep target_pand_id set."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    target_id = "0363100012253924"
    direct_error = httpx.HTTPStatusError(
        "Not Found", request=MagicMock(), response=MagicMock(status_code=404)
    )
    bbox_data = _make_3dbag_response([
        _make_feature("0363100099999999"),
        _make_feature(target_id),
    ])

    def route(url, **kwargs):
        s_url = str(url)
        if f"NL.IMBAG.Pand.{target_id}" in s_url:
            raise direct_error
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_data)

    mock_client.get.side_effect = route

    result = await get_neighborhood_3d(
        pand_id=target_id,
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    assert result.target_pand_id == target_id
    assert result.buildings[0].pand_id == target_id
    assert result.message is None or "Target building not found" not in (result.message or "")


# --- New tests for direct fetch + parallel strategy ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_target_via_direct(mock_get_client):
    """Target found via direct fetch even when bbox doesn't contain it."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    # Bbox only has a different building
    bbox_data = _make_3dbag_response([_make_feature("0363100099999999")])

    mock_client.get.side_effect = _route_responses(_make_mock_resp(bbox_data))

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
    # Bbox also has the same target + another building
    bbox_data = _make_3dbag_response([
        _make_feature(pand_id),
        _make_feature("0363100099999999"),
    ])

    mock_client.get.side_effect = _route_responses(_make_mock_resp(bbox_data))

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

    bbox_data = _make_3dbag_response([])

    mock_client.get.side_effect = _route_responses(_make_mock_resp(bbox_data))

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

    bbox_data = _make_3dbag_response([])

    mock_client.get.side_effect = _route_responses(_make_mock_resp(bbox_data))

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
async def test_fetch_bbox_partial_failure(mock_get_client):
    """Second bbox page failure still returns partial neighborhood result."""
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Sequential pagination only applies in conservative mode")

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    first_page = _make_3dbag_response(
        [_make_feature("0363100000000001")],
        next_link=(
            "https://api.3dbag.nl/collections/pand/items?"
            "bbox=120855,486855,121155,487155&offset=101"
        ),
    )

    def side_effect(url, **kwargs):
        s_url = str(url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        if "bbox=" in s_url and "offset=101" in s_url:
            raise httpx.TimeoutException("read timeout")
        if "bbox=" in s_url:
            return _make_mock_resp(first_page)
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924", # target
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    # Target + 1 neighbor from Q0
    assert len(result.buildings) == 2
    ids = {b.pand_id for b in result.buildings}
    assert "0363100000000001" in ids
    assert result.message is not None
    assert result.message.startswith("Partial neighborhood data")


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_fallback_returns_context_after_first_page_timeout(mock_get_client):
    """When primary bbox page times out, reduced-radius fallback should return context."""
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Resilient backup path only applies in conservative mode")

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    bbox_resp = _make_3dbag_response([_make_feature("0363100000000001")])
    bbox_calls = 0

    def side_effect(url, **kwargs):
        nonlocal bbox_calls
        s_url = str(url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        if "bbox=" in s_url:
            bbox_calls += 1
            # Simulate timeout on primary paginated query (limit=100), not on near-neighbor query.
            if "limit=100" in s_url and "offset=" not in s_url:
                raise httpx.TimeoutException("primary bbox timeout")
            return _make_mock_resp(bbox_resp)
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    assert bbox_calls >= 2
    assert len(result.buildings) == 2
    ids = {b.pand_id for b in result.buildings}
    assert "0363100012253924" in ids
    assert "0363100000000001" in ids
    assert result.message is not None
    assert result.message.startswith("Partial neighborhood data")


# --- LoD 2.2 surface extraction tests ---

# Flat-roof test geometry: 4 ground corners at z=1750, 4 roof corners at z=10000
# scale=[0.001,0.001,0.001], translate=[121000,487000,0]
# center_x=121005, center_y=487005
LOD22_VERTICES = [
    [0, 0, 1750],         # 0: ground corner (121000, 487000, 1.75)
    [10000, 0, 1750],     # 1: ground corner (121010, 487000, 1.75)
    [10000, 10000, 1750], # 2: ground corner (121010, 487010, 1.75)
    [0, 10000, 1750],     # 3: ground corner (121000, 487010, 1.75)
    [0, 0, 10000],        # 4: roof corner  (121000, 487000, 10.0)
    [10000, 0, 10000],    # 5: roof corner  (121010, 487000, 10.0)
    [10000, 10000, 10000],# 6: roof corner  (121010, 487010, 10.0)
    [0, 10000, 10000],    # 7: roof corner  (121000, 487010, 10.0)
]


def _make_lod22_city_objects():
    """Build CityObjects dict with a parent Building + child BuildingPart with LoD 2.2."""
    parent_name = "NL.IMBAG.Pand.0363100012253924"
    part_name = f"{parent_name}-0"

    parent = {
        "type": "Building",
        "attributes": {
            "identificatie": parent_name,
            "b3_h_maaiveld": 1.75,
            "b3_h_dak_max": 10.0,
            "oorspronkelijkbouwjaar": 1917,
        },
        "geometry": [
            {
                "lod": "0",
                "type": "MultiSurface",
                "boundaries": [[[0, 1, 2, 3]]],
            }
        ],
        "children": [part_name],
    }

    # Solid boundaries: [outer_shell] where outer_shell = [surface, surface, ...]
    # Each surface = [outer_ring, hole_ring, ...]
    # Flat roof (verts 4,5,6,7) + ground (verts 0,1,2,3) + 4 wall surfaces
    part = {
        "type": "BuildingPart",
        "attributes": {},
        "parents": [parent_name],
        "geometry": [
            {
                "lod": "2.2",
                "type": "Solid",
                "boundaries": [[
                    [[4, 5, 6, 7]],   # roof (flat, all at z=10.0)
                    [[0, 3, 2, 1]],   # ground (all at z=1.75)
                    [[0, 1, 5, 4]],   # wall south
                    [[1, 2, 6, 5]],   # wall east
                    [[2, 3, 7, 6]],   # wall north
                    [[3, 0, 4, 7]],   # wall west
                ]],
            }
        ],
    }

    city_objects = {parent_name: parent, part_name: part}
    return city_objects, parent_name, part_name


def test_extract_lod22_surfaces_basic():
    """Correct surfaces are extracted with proper vertex coordinates."""
    city_objects, parent_name, _ = _make_lod22_city_objects()
    parent = city_objects[parent_name]

    result = _extract_lod22_surfaces(
        parent, city_objects, LOD22_VERTICES, SCALE, TRANSLATE, CENTER_X, CENTER_Y
    )

    assert result is not None
    # 6 surfaces: 1 roof + 1 ground + 4 walls
    assert len(result) == 6

    # First surface is the roof (verts 4,5,6,7 at z=10.0)
    roof = result[0]
    assert len(roof) == 4
    # Vertex 4: real=(121000,487000,10.0), offset=(-5,-5,10.0)
    assert roof[0] == [-5.0, -5.0, 10.0]
    # Vertex 5: real=(121010,487000,10.0), offset=(5,-5,10.0)
    assert roof[1] == [5.0, -5.0, 10.0]


def test_extract_lod22_surfaces_no_children():
    """Returns None when building has no children."""
    city_object = {"type": "Building", "attributes": {}, "geometry": []}
    result = _extract_lod22_surfaces(
        city_object, {}, LOD22_VERTICES, SCALE, TRANSLATE, CENTER_X, CENTER_Y
    )
    assert result is None


def test_extract_lod22_surfaces_no_lod22_geom():
    """Returns None when child exists but lacks LoD 2.2 geometry."""
    parent_name = "NL.IMBAG.Pand.0363100012253924"
    part_name = f"{parent_name}-0"
    parent = {
        "type": "Building", "children": [part_name],
        "attributes": {}, "geometry": [],
    }
    child = {
        "type": "BuildingPart",
        "geometry": [{"lod": "1.3", "type": "Solid", "boundaries": []}],
    }
    city_objects = {parent_name: parent, part_name: child}

    result = _extract_lod22_surfaces(
        parent, city_objects, LOD22_VERTICES, SCALE, TRANSLATE, CENTER_X, CENTER_Y
    )
    assert result is None


@patch("app.services.three_d_bag.settings")
def test_parse_building_with_lod22_flag_enabled(mock_settings):
    """roof_surfaces populated when feature flag is on and city_objects provided."""
    mock_settings.enable_lod22_roofs = True
    city_objects, parent_name, _ = _make_lod22_city_objects()
    parent = city_objects[parent_name]

    result = _parse_building(
        parent, LOD22_VERTICES, SCALE, TRANSLATE, CENTER_X, CENTER_Y,
        city_objects=city_objects,
    )

    assert result is not None
    assert result.roof_surfaces is not None
    assert len(result.roof_surfaces) == 6


@patch("app.services.three_d_bag.settings")
def test_parse_building_with_lod22_flag_disabled(mock_settings):
    """roof_surfaces is None when feature flag is off."""
    mock_settings.enable_lod22_roofs = False
    city_objects, parent_name, _ = _make_lod22_city_objects()
    parent = city_objects[parent_name]

    result = _parse_building(
        parent, LOD22_VERTICES, SCALE, TRANSLATE, CENTER_X, CENTER_Y,
        city_objects=city_objects,
    )

    assert result is not None
    assert result.roof_surfaces is None


@patch("app.services.three_d_bag.settings")
def test_parse_building_lod22_graceful_fallback(mock_settings):
    """Exception during LoD 2.2 parse results in None, not crash."""
    mock_settings.enable_lod22_roofs = True
    city_objects, parent_name, part_name = _make_lod22_city_objects()
    parent = city_objects[parent_name]
    # Corrupt the child's geometry to cause an exception
    city_objects[part_name]["geometry"] = [
        {"lod": "2.2", "type": "Solid", "boundaries": "not-a-list"}
    ]

    result = _parse_building(
        parent, LOD22_VERTICES, SCALE, TRANSLATE, CENTER_X, CENTER_Y,
        city_objects=city_objects,
    )

    assert result is not None
    assert result.roof_surfaces is None


@pytest.mark.asyncio
@patch("app.services.three_d_bag.settings")
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_building_with_lod22(mock_get_client, mock_settings):
    """Integration test: target building fetch includes roof_surfaces when flag on."""
    mock_settings.enable_lod22_roofs = True
    mock_settings.three_d_bag_base = "https://api.3dbag.nl"
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    # Build a single-item response with BuildingPart child
    city_objects_dict, parent_name, part_name = _make_lod22_city_objects()
    data = {
        "type": "CityJSONFeature",
        "id": parent_name,
        "feature": {
            "CityObjects": city_objects_dict,
            "vertices": LOD22_VERTICES,
        },
        "metadata": {
            "transform": {"scale": SCALE, "translate": TRANSLATE},
        },
    }
    mock_client.get.return_value = _make_mock_resp(data)

    result = await _fetch_target_building("0363100012253924", CENTER_X, CENTER_Y)

    assert result is not None
    assert result.pand_id == "0363100012253924"
    assert result.roof_surfaces is not None
    assert len(result.roof_surfaces) == 6


@pytest.mark.asyncio
@patch("app.services.three_d_bag.settings")
@patch("app.services.three_d_bag._fetch_target_building")
async def test_enrich_with_lod22_skips_blocks_that_already_have_roofs(
    mock_fetch_target_building, mock_settings,
):
    """Only blocks missing roof_surfaces should trigger single-item enrichment fetches."""
    mock_settings.enable_lod22_roofs = True

    already_lod22 = BuildingBlock(
        pand_id="0363100000000001",
        ground_height=1.0,
        building_height=10.0,
        footprint=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
        roof_surfaces=[[[0.0, 0.0, 10.0], [1.0, 0.0, 10.0], [1.0, 1.0, 10.0]]],
    )
    missing_lod22 = BuildingBlock(
        pand_id="0363100000000002",
        ground_height=1.0,
        building_height=9.0,
        footprint=[[2.0, 0.0], [3.0, 0.0], [3.0, 1.0]],
        roof_surfaces=None,
    )
    enriched_missing = BuildingBlock(
        pand_id="0363100000000002",
        ground_height=1.0,
        building_height=9.0,
        footprint=[[2.0, 0.0], [3.0, 0.0], [3.0, 1.0]],
        roof_surfaces=[[[2.0, 0.0, 9.0], [3.0, 0.0, 9.0], [3.0, 1.0, 9.0]]],
    )
    mock_fetch_target_building.return_value = enriched_missing

    enriched, partial = await _enrich_with_lod22(
        [already_lod22, missing_lod22],
        center_x=121005.0,
        center_y=487005.0,
    )

    assert partial is False
    assert mock_fetch_target_building.call_count == 1
    assert enriched[0].roof_surfaces is not None
    assert enriched[1].roof_surfaces is not None


@pytest.mark.asyncio
@patch("app.services.three_d_bag.settings")
@patch("app.services.three_d_bag._get_client")
async def test_neighborhood_context_gets_lod22_from_bbox_without_enrichment(
    mock_get_client, mock_settings,
):
    """Context buildings should carry LoD2.2 roofs from bbox payload directly."""
    mock_settings.enable_lod22_roofs = True
    mock_settings.enable_lod22_context_enrichment = False
    mock_settings.three_d_bag_base = "https://api.3dbag.nl"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    target_id = "0363100012253924"
    neighbor_id = "0363100099999999"
    bbox_data = _make_3dbag_response([_make_feature_with_lod22_child(neighbor_id)])

    mock_client.get.side_effect = _route_responses(_make_mock_resp(bbox_data))

    result = await get_neighborhood_3d(
        pand_id=target_id,
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    neighbor = next((b for b in result.buildings if b.pand_id == neighbor_id), None)
    assert neighbor is not None
    assert neighbor.roof_surfaces is not None
    assert len(neighbor.roof_surfaces) == 6


def test_accelerated_mode_constants_within_latency_bounds():
    """Accelerated defaults must stay within latency-safe bounds."""
    import app.services.three_d_bag as mod

    if mod.settings.three_d_conservative_mode:
        pytest.skip("Only applies in accelerated mode")

    assert mod.BBOX_MAX_PAGES <= 1
    assert mod.BBOX_FETCH_BUDGET <= 35.0
    assert mod.BBOX_FETCH_RETRIES <= 4
    assert mod.DEFAULT_RADIUS <= 120.0


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_default_radius_produces_quadrant_bbox_urls(mock_get_client):
    """Accelerated mode should produce 4 quadrant bbox URLs at 120m radius."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    seen_urls: list[str] = []
    bbox_resp = _make_3dbag_response([_make_feature("0363100000000001")])

    def side_effect(url, **kwargs):
        s_url = str(url)
        seen_urls.append(s_url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    import app.services.three_d_bag as mod
    if mod.settings.three_d_conservative_mode:
        pytest.skip("Only applies in accelerated mode")

    await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    bbox_urls = [u for u in seen_urls if "bbox=" in u]
    # Should have 4 quadrant bbox URLs (no near-ring in accelerated mode)
    assert len(bbox_urls) == 4
    # Verify quadrant pattern: center is (121005, 487005), radius 120
    assert any("bbox=121005,487005," in u for u in bbox_urls)  # NE
    assert any("bbox=120885,487005," in u for u in bbox_urls)  # NW
    assert any("bbox=121005,486885," in u for u in bbox_urls)  # SE
    assert any("bbox=120885,486885," in u for u in bbox_urls)  # SW


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_neighborhood_3d_building_count_floor_at_reduced_radius(mock_get_client):
    """Dense neighborhoods should still return a usable building count at 150m."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    target_id = "0363100012253924"
    features = [
        _make_feature(f"036310009999{i:04d}", h_maaiveld=0.5, h_dak_max=10.0 + i, year=1990)
        for i in range(9)
    ]
    bbox_resp = _make_3dbag_response(features)

    def side_effect(url, **kwargs):
        s_url = str(url)
        match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
        if match:
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id=target_id,
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
        radius=150.0,
    )

    assert result.target_pand_id == target_id
    assert len(result.buildings) >= 5
    assert result.buildings[0].pand_id == target_id


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_neighborhood_3d_target_recovered_at_reduced_radius(mock_get_client):
    """If direct fetch fails, bbox fallback should still recover the target."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    target_id = "0363100012253924"
    features = [
        _make_feature(target_id, h_maaiveld=0.5, h_dak_max=12.0, year=1917),
        _make_feature("0363100099999999", h_maaiveld=0.5, h_dak_max=8.0, year=1990),
    ]
    bbox_resp = _make_3dbag_response(features)

    def side_effect(url, **kwargs):
        s_url = str(url)
        if "/items/NL.IMBAG.Pand." in s_url:
            raise httpx.HTTPStatusError(
                "502",
                request=MagicMock(),
                response=MagicMock(status_code=502),
            )
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id=target_id,
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
        radius=150.0,
    )

    assert result.target_pand_id == target_id
    assert len(result.buildings) >= 2


def test_surrounding_context_threshold_enables_sunlight():
    """target + at least one neighbor is sufficient for sunlight computation."""
    response = Neighborhood3DResponse(
        address_id="0363010000696734",
        target_pand_id="0363100012253924",
        center=Neighborhood3DCenter(lat=52.37, lng=4.89, rd_x=121005.0, rd_y=487005.0),
        buildings=[
            BuildingBlock(
                pand_id="0363100012253924",
                ground_height=0.5,
                building_height=10.0,
                footprint=[[0, 0], [10, 0], [10, 8], [0, 8]],
            ),
            BuildingBlock(
                pand_id="0363100099999999",
                ground_height=0.5,
                building_height=8.0,
                footprint=[[15, 0], [22, 0], [22, 7], [15, 7]],
            ),
        ],
    )

    has_target = response.target_pand_id is not None and any(
        b.pand_id == response.target_pand_id for b in response.buildings
    )
    assert has_target
    assert len(response.buildings) >= 2


def test_conservative_mode_preserves_exact_pre_optimization_constants():
    """Conservative mode must restore exact pre-optimization constant values."""
    import importlib

    import app.config as config_mod
    import app.services.three_d_bag as mod

    if config_mod.settings.three_d_conservative_mode:
        pytest.skip("Test expects accelerated mode by default")

    # Prove accelerated defaults are active before switching modes.
    assert mod.DEFAULT_RADIUS == 120.0
    assert mod.BBOX_MAX_PAGES == 1
    assert mod.BBOX_FETCH_BUDGET == 35.0

    PRE_OPT = {
        "BBOX_MAX_PAGES": 5,
        "BBOX_FETCH_BUDGET": 80.0,
        "BBOX_PAGE_TIMEOUT": 65.0,
        "FALLBACK_PAGE_TIMEOUT": 65.0,
        "NEARBY_CONTEXT_MIN_RADIUS": 100.0,
        "NEARBY_CONTEXT_TIMEOUT": 65.0,
        "NEARBY_CONTEXT_MAX_PAGES": 5,
        "IMMEDIATE_CONTEXT_TIMEOUT": 15.0,
        "PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS": 5.0,
        "PRIMARY_WAIT_AFTER_BACKUP_SECONDS": 10.0,
        "TARGET_FETCH_TIMEOUT": 30.0,
        "TARGET_FETCH_RETRIES": 6,
        "TARGET_FETCH_BUDGET": 999.0,
        "BBOX_FETCH_RETRIES": 10,
        "RETRY_BACKOFF_BASE": 0.35,
        "DEFAULT_RADIUS": 150.0,
    }

    with patch.object(config_mod.settings, "three_d_conservative_mode", True):
        mod = importlib.reload(mod)
        try:
            for name, expected in PRE_OPT.items():
                actual = getattr(mod, name)
                assert actual == expected, (
                    f"{name}: expected {expected}, got {actual}"
                )
            conservative_target_worst_case = (
                mod.TARGET_FETCH_TIMEOUT * mod.TARGET_FETCH_RETRIES
                + sum(
                    min(mod.RETRY_BACKOFF_BASE * i, 2.0)
                    for i in range(1, mod.TARGET_FETCH_RETRIES)
                )
            )
            assert mod.TARGET_FETCH_BUDGET > conservative_target_worst_case + 30.0
        finally:
            importlib.reload(mod)


# --- single-flight dedup tests ---


@pytest.mark.asyncio
async def test_single_flight_dedup_shares_result():
    """Two concurrent calls with same coordinates should share one in-flight request."""
    import app.services.three_d_bag as mod

    mod._in_flight.clear()
    call_count = 0
    response = Neighborhood3DResponse(
        address_id="0123456789012345",
        target_pand_id="0123456789012345",
        center=Neighborhood3DCenter(lat=52.37, lng=4.89, rd_x=121000.0, rd_y=487000.0),
        buildings=[
            BuildingBlock(
                pand_id="0123456789012345",
                ground_height=1.0,
                building_height=10.0,
                footprint=[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            )
        ],
        message=None,
    )

    async def counting_impl(**kwargs):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.01)
        return response

    with patch.object(mod, "_get_neighborhood_3d_impl", side_effect=counting_impl):
        r1, r2 = await asyncio.gather(
            mod.get_neighborhood_3d("0123456789012345", 121000.0, 487000.0, 52.37, 4.89),
            mod.get_neighborhood_3d("0123456789012345", 121000.0, 487000.0, 52.37, 4.89),
        )

    assert call_count == 1
    assert r1.target_pand_id == r2.target_pand_id
    mod._in_flight.clear()


@pytest.mark.asyncio
async def test_single_flight_dedup_different_coords_separate():
    """Concurrent calls with different coords should not deduplicate."""
    import app.services.three_d_bag as mod

    mod._in_flight.clear()
    call_count = 0

    async def counting_impl(**kwargs):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.01)
        return Neighborhood3DResponse(
            address_id=kwargs["pand_id"],
            target_pand_id=kwargs["pand_id"],
            center=Neighborhood3DCenter(
                lat=kwargs["lat"], lng=kwargs["lng"], rd_x=kwargs["rd_x"], rd_y=kwargs["rd_y"]
            ),
            buildings=[],
            message=None,
        )

    with patch.object(mod, "_get_neighborhood_3d_impl", side_effect=counting_impl):
        await asyncio.gather(
            mod.get_neighborhood_3d("0123456789012345", 121000.0, 487000.0, 52.37, 4.89),
            mod.get_neighborhood_3d("0123456789012345", 121010.0, 487010.0, 52.37, 4.89),
        )

    assert call_count == 2
    mod._in_flight.clear()


@pytest.mark.asyncio
async def test_single_flight_dedup_cleanup_after_error():
    """Failed in-flight requests should be removed from the dedup map."""
    import app.services.three_d_bag as mod

    mod._in_flight.clear()

    with patch.object(mod, "_get_neighborhood_3d_impl", side_effect=RuntimeError("boom")):
        with pytest.raises(RuntimeError, match="boom"):
            await mod.get_neighborhood_3d("0123456789012345", 121000.0, 487000.0, 52.37, 4.89)

    assert len(mod._in_flight) == 0


# --- _compute_building_orientation tests ---


class TestComputeBuildingOrientation:
    """Test building orientation estimation from footprint geometry."""

    def test_east_west_rectangle(self):
        """Longest edge horizontal (E-W) -> ~90 degrees."""
        # 20m wide (E-W) x 5m deep (N-S)
        footprint = [[0, 0], [20, 0], [20, 5], [0, 5]]
        result = _compute_building_orientation(footprint)
        assert result is not None
        assert abs(result - 90.0) < 1.0

    def test_north_south_rectangle(self):
        """Longest edge vertical (N-S) -> ~0 degrees."""
        # 5m wide x 20m deep
        footprint = [[0, 0], [5, 0], [5, 20], [0, 20]]
        result = _compute_building_orientation(footprint)
        assert result is not None
        assert result < 1.0 or result > 179.0  # near 0 or 180 (both map to ~0)

    def test_diagonal_rectangle(self):
        """45-degree diagonal -> ~45 degrees."""
        # Rectangle along NE-SW axis
        footprint = [[0, 0], [10, 10], [9, 11], [-1, 1]]
        result = _compute_building_orientation(footprint)
        assert result is not None
        assert abs(result - 45.0) < 5.0

    def test_square_returns_value(self):
        """Square (all edges equal) -> returns some value (first longest)."""
        footprint = [[0, 0], [10, 0], [10, 10], [0, 10]]
        result = _compute_building_orientation(footprint)
        assert result is not None
        assert 0 <= result < 180

    def test_degenerate_too_few_vertices(self):
        """<3 vertices -> None."""
        assert _compute_building_orientation([[0, 0], [1, 0]]) is None
        assert _compute_building_orientation([[0, 0]]) is None
        assert _compute_building_orientation([]) is None

    def test_tiny_edges_below_threshold(self):
        """All edges < 0.1m -> None."""
        footprint = [[0, 0], [0.05, 0], [0.05, 0.05]]
        result = _compute_building_orientation(footprint)
        assert result is None


# --- Quadrant bbox splitting tests ---


class TestQuadrantBboxes:
    def test_four_quadrants_tile_correctly(self):
        """4 quadrants should tile the full bbox with no gaps."""
        cx, cy, r = 121005.0, 487005.0, 120.0
        quads = _quadrant_bboxes(cx, cy, r)
        assert len(quads) == 4
        labels = {q[0] for q in quads}
        assert labels == {"NE", "NW", "SE", "SW"}

        ne = next(q for q in quads if q[0] == "NE")
        assert ne[1] == f"{cx:.0f},{cy:.0f},{cx + r:.0f},{cy + r:.0f}"

        nw = next(q for q in quads if q[0] == "NW")
        assert nw[1] == f"{cx - r:.0f},{cy:.0f},{cx:.0f},{cy + r:.0f}"

        se = next(q for q in quads if q[0] == "SE")
        assert se[1] == f"{cx:.0f},{cy - r:.0f},{cx + r:.0f},{cy:.0f}"

        sw = next(q for q in quads if q[0] == "SW")
        assert sw[1] == f"{cx - r:.0f},{cy - r:.0f},{cx:.0f},{cy:.0f}"

    def test_full_coverage_matches_single_bbox(self):
        """Union of 4 quadrant bboxes equals the original single bbox."""
        cx, cy, r = 121005.0, 487005.0, 120.0
        quads = _quadrant_bboxes(cx, cy, r)
        all_coords = []
        for _, bbox_str in quads:
            parts = [float(p) for p in bbox_str.split(",")]
            all_coords.append(parts)
        min_x = min(c[0] for c in all_coords)
        min_y = min(c[1] for c in all_coords)
        max_x = max(c[2] for c in all_coords)
        max_y = max(c[3] for c in all_coords)
        assert min_x == cx - r
        assert min_y == cy - r
        assert max_x == cx + r
        assert max_y == cy + r


# --- Parallel quadrant fetch tests ---


def _quadrant_route(center_x, center_y, radius, quadrant_responses):
    """Build a side_effect that routes bbox URLs to per-quadrant responses.

    quadrant_responses: dict mapping label ("NE","NW","SE","SW") to mock response.
    Uses bbox= prefix anchoring to avoid substring collisions between quadrants.
    """
    cx, cy, r = center_x, center_y, radius
    # Build exact bbox prefix for each quadrant
    bbox_prefixes = {
        "NE": f"bbox={cx:.0f},{cy:.0f},",
        "NW": f"bbox={cx - r:.0f},{cy:.0f},",
        "SE": f"bbox={cx:.0f},{cy - r:.0f},",
        "SW": f"bbox={cx - r:.0f},{cy - r:.0f},",
    }

    def side_effect(url, **kwargs):
        s_url = str(url)
        for label, prefix in bbox_prefixes.items():
            if prefix in s_url and label in quadrant_responses:
                resp = quadrant_responses[label]
                if isinstance(resp, Exception):
                    raise resp
                return resp
        return _make_mock_resp(_make_3dbag_response([]))

    return side_effect


@pytest.mark.asyncio
async def test_fetch_single_quadrant_direct_behavior():
    """Direct unit coverage for single quadrant URL/parse/partial behavior."""
    cx, cy = 121005.0, 487005.0
    bbox = "121005,487005,121125,487125"
    response = _make_3dbag_response(
        [_make_feature("0363100000000001")],
        next_link="https://api.3dbag.nl/collections/pand/items?offset=101",
    )

    mock_client = AsyncMock()
    mock_get_json = AsyncMock(return_value=response)

    with (
        patch("app.services.three_d_bag._get_client", return_value=mock_client),
        patch("app.services.three_d_bag._get_json_with_retries", mock_get_json),
    ):
        buildings, partial = await _fetch_single_quadrant(cx, cy, bbox, "NE")

    assert len(buildings) == 1
    assert buildings[0].pand_id == "0363100000000001"
    assert partial is True
    called_url = str(mock_get_json.call_args.args[1])
    assert f"bbox={bbox}" in called_url
    assert "limit=" in called_url


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_merges_all_quadrants(mock_get_client):
    """All 4 quadrant results are merged into a single building list."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000001")])),
        "NW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")])),
        "SE": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000003")])),
        "SW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000004")])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert len(buildings) == 4
    ids = {b.pand_id for b in buildings}
    assert ids == {
        "0363100000000001", "0363100000000002",
        "0363100000000003", "0363100000000004",
    }
    assert partial is False


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_deduplicates(mock_get_client):
    """Building appearing in 2 adjacent quadrants is returned only once."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    shared_id = "0363100000000099"
    cx, cy, r = 121005.0, 487005.0, 120.0
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": _make_mock_resp(_make_3dbag_response([
            _make_feature("0363100000000001"),
            _make_feature(shared_id),
        ])),
        "NW": _make_mock_resp(_make_3dbag_response([
            _make_feature("0363100000000002"),
            _make_feature(shared_id),  # duplicate
        ])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    ids = [b.pand_id for b in buildings]
    assert ids.count(shared_id) == 1
    assert len(buildings) == 3


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_partial_on_one_failure(mock_get_client):
    """If one quadrant fails, return partial=True with buildings from other 3."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": httpx.TimeoutException("read timeout"),
        "NW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")])),
        "SE": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000003")])),
        "SW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000004")])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert partial is True
    assert len(buildings) == 3
    ids = {b.pand_id for b in buildings}
    assert "0363100000000002" in ids
    assert "0363100000000003" in ids
    assert "0363100000000004" in ids


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_all_fail(mock_get_client):
    """If all quadrants fail, return empty + partial=True."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    mock_client.get.side_effect = httpx.TimeoutException("total failure")

    buildings, partial = await _fetch_bbox_parallel_quadrants(121005.0, 487005.0, 120.0)

    assert buildings == []
    assert partial is True


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_partial_when_has_next_page(mock_get_client):
    """Quadrant with more pages signals partial=True even though fetch succeeded."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0
    resp_with_next = _make_3dbag_response(
        [_make_feature("0363100000000001")],
        next_link="https://api.3dbag.nl/collections/pand/items?offset=101",
    )
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": _make_mock_resp(resp_with_next),
        "NW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")])),
        "SE": _make_mock_resp(_make_3dbag_response([])),
        "SW": _make_mock_resp(_make_3dbag_response([])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert partial is True  # NE had more pages
    assert len(buildings) == 2


@pytest.mark.asyncio
@patch("app.services.three_d_bag.BBOX_FETCH_BUDGET", 0.05)
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_budget_preserves_completed(mock_get_client):
    """Budget timeout should keep completed quadrant data instead of dropping all."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0

    async def side_effect(url, **kwargs):
        s_url = str(url)
        # Make NE slow so it stays pending past budget; others return quickly.
        if f"bbox={cx:.0f},{cy:.0f}," in s_url:
            await asyncio.sleep(0.2)
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000001")]))
        if f"bbox={cx - r:.0f},{cy:.0f}," in s_url:
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")]))
        if f"bbox={cx:.0f},{cy - r:.0f}," in s_url:
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000003")]))
        if f"bbox={cx - r:.0f},{cy - r:.0f}," in s_url:
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000004")]))
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert partial is True
    # 3 fast quadrants should still be returned even when one timed out.
    assert len(buildings) == 3


@pytest.mark.asyncio
@patch("app.services.three_d_bag.settings")
@patch("app.services.three_d_bag._get_client")
async def test_conservative_mode_uses_sequential_path(mock_get_client, mock_settings):
    """Conservative mode should use sequential _fetch_bbox_paginated, not parallel quadrants."""
    mock_settings.three_d_conservative_mode = True
    mock_settings.enable_lod22_roofs = True
    mock_settings.enable_lod22_context_enrichment = False
    mock_settings.three_d_bag_base = "https://api.3dbag.nl"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    seen_urls: list[str] = []
    bbox_resp = _make_3dbag_response([_make_feature("0363100000000001")])

    def side_effect(url, **kwargs):
        s_url = str(url)
        seen_urls.append(s_url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
        radius=150.0,
    )

    # Conservative should produce ONE large bbox URL (sequential), not 4 quadrants.
    # Bbox at 150m: 120855,486855,121155,487155 (with limit=100)
    bbox_urls = [u for u in seen_urls if "bbox=" in u and "limit=100" in u]
    assert len(bbox_urls) >= 1
    assert any("bbox=120855,486855,121155,487155" in u for u in bbox_urls)
    assert result.buildings is not None
