from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.wms_tile import get_wms_tile

# --- Service-level tests ---


@pytest.mark.asyncio
@patch("app.services.wms_tile._get_client")
@patch("app.services.wms_tile._get_alo_layers", new_callable=AsyncMock)
@patch("app.services.wms_tile._select_noise_layer")
async def test_get_wms_tile_noise_success(
    mock_select, mock_layers, mock_get_client
):
    mock_layers.return_value = ["rivm_20250101_Geluid_lden_wegverkeer_2022"]
    mock_select.return_value = "rivm_20250101_Geluid_lden_wegverkeer_2022"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    resp = MagicMock()
    resp.headers = {"content-type": "image/png"}
    resp.content = png_bytes
    resp.raise_for_status.return_value = None
    mock_client.get.return_value = resp

    result = await get_wms_tile("noise", 121000.0, 487000.0)

    assert result is not None
    assert result == png_bytes
    mock_client.get.assert_called_once()
    call_kwargs = mock_client.get.call_args
    assert "GetMap" in str(call_kwargs)


@pytest.mark.asyncio
@patch("app.services.wms_tile._get_client")
@patch("app.services.wms_tile._get_gcn_layers", new_callable=AsyncMock)
@patch("app.services.wms_tile._select_air_layer")
async def test_get_wms_tile_air_success(
    mock_select, mock_layers, mock_get_client
):
    mock_layers.return_value = ["conc_NO2_2024"]
    mock_select.return_value = "conc_NO2_2024"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
    resp = MagicMock()
    resp.headers = {"content-type": "image/png"}
    resp.content = png_bytes
    resp.raise_for_status.return_value = None
    mock_client.get.return_value = resp

    result = await get_wms_tile("air_quality", 121000.0, 487000.0)

    assert result is not None
    assert result == png_bytes


@pytest.mark.asyncio
@patch("app.services.wms_tile._get_client")
@patch("app.services.wms_tile._get_climate_layer_names", new_callable=AsyncMock)
async def test_get_wms_tile_climate_success(mock_climate_layers, mock_get_client):
    mock_climate_layers.return_value = {
        "wpn:s0149_hittestress_warme_nachten_huidig",
        "other_layer",
    }

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 80
    resp = MagicMock()
    resp.headers = {"content-type": "image/png"}
    resp.content = png_bytes
    resp.raise_for_status.return_value = None
    mock_client.get.return_value = resp

    result = await get_wms_tile("climate", 121000.0, 487000.0)

    assert result is not None
    assert result == png_bytes


@pytest.mark.asyncio
@patch("app.services.wms_tile._get_alo_layers", new_callable=AsyncMock)
@patch("app.services.wms_tile._select_noise_layer")
async def test_get_wms_tile_no_layer_available(mock_select, mock_layers):
    mock_layers.return_value = []
    mock_select.return_value = None

    result = await get_wms_tile("noise", 121000.0, 487000.0)
    assert result is None


@pytest.mark.asyncio
@patch("app.services.wms_tile._get_client")
@patch("app.services.wms_tile._get_alo_layers", new_callable=AsyncMock)
@patch("app.services.wms_tile._select_noise_layer")
async def test_get_wms_tile_non_image_response(
    mock_select, mock_layers, mock_get_client
):
    mock_layers.return_value = ["noise_layer"]
    mock_select.return_value = "noise_layer"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    resp = MagicMock()
    resp.headers = {"content-type": "text/xml; charset=utf-8"}
    resp.content = b"<ServiceException>Error</ServiceException>"
    resp.raise_for_status.return_value = None
    mock_client.get.return_value = resp

    result = await get_wms_tile("noise", 121000.0, 487000.0)
    assert result is None


@pytest.mark.asyncio
@patch("app.services.wms_tile._get_client")
@patch("app.services.wms_tile._get_alo_layers", new_callable=AsyncMock)
@patch("app.services.wms_tile._select_noise_layer")
async def test_get_wms_tile_timeout(mock_select, mock_layers, mock_get_client):
    mock_layers.return_value = ["noise_layer"]
    mock_select.return_value = "noise_layer"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client
    mock_client.get.side_effect = httpx.TimeoutException("read timeout")

    result = await get_wms_tile("noise", 121000.0, 487000.0)
    assert result is None


@pytest.mark.asyncio
async def test_get_wms_tile_invalid_type():
    result = await get_wms_tile("unknown", 121000.0, 487000.0)
    assert result is None


# --- Route-level tests ---


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.wms_tile")
async def test_wms_tile_route_success(
    mock_wms_tile, mock_cache_set, mock_cache_get, client
):
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    mock_wms_tile.get_wms_tile = AsyncMock(return_value=png_bytes)

    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": "121000", "rd_y": "487000"},
    )

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content == png_bytes


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.wms_tile")
async def test_wms_tile_route_no_content(
    mock_wms_tile, mock_cache_set, mock_cache_get, client
):
    mock_wms_tile.get_wms_tile = AsyncMock(return_value=None)

    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "noise", "rd_x": "121000", "rd_y": "487000"},
    )

    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_wms_tile_route_invalid_type(client):
    resp = await client.get(
        "/api/address/wms-tile",
        params={"type": "invalid", "rd_x": "121000", "rd_y": "487000"},
    )

    assert resp.status_code == 422
