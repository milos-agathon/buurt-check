import re
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models.neighborhood3d import BuildingBlock
from app.services.three_d_bag import (
    _compute_building_orientation,
    _extract_lod22_surfaces,
    _fetch_bbox_quick_context,
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


def _route_responses(direct_resp, bbox_resp):
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
async def test_get_neighborhood_3d_fetches_bbox_next_page(mock_get_client):
    """Bbox pagination should include buildings from follow-up pages."""
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
async def test_fetch_bbox_partial_failure(mock_get_client):
    """Second bbox page failure still returns partial neighborhood result."""
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
    direct_data = _make_single_item_response(target_id)
    bbox_data = _make_3dbag_response([_make_feature_with_lod22_child(neighbor_id)])

    mock_client.get.side_effect = _route_responses(
        _make_mock_resp(direct_data), _make_mock_resp(bbox_data)
    )

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
