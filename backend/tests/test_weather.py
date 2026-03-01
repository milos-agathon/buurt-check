from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.weather import fetch_tmy_data


@pytest.mark.asyncio
@patch("app.services.weather.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.services.weather.cache_set", new_callable=AsyncMock)
@patch("app.services.weather._get_client")
async def test_fetch_tmy_data_parses_and_caches(
    mock_get_client,
    mock_cache_set,
    mock_cache_get,
):
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.content = b'{"ok": true}'
    mock_response.json.return_value = {
        "outputs": {
            "tmy_hourly": [
                {"time(UTC)": "20050101:0030", "G(h)": 0, "Gb(n)": 0, "Gd(h)": 0},
                {"time(UTC)": "20050621:1200", "G(h)": 800, "Gb(n)": 600, "Gd(h)": 200},
            ]
        }
    }

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_get_client.return_value = mock_client

    result = await fetch_tmy_data(52.37, 4.90)

    assert len(result) == 2
    assert result[0]["date"] == "2005-01-01T00:30:00Z"
    assert result[0]["minute_of_day"] == 30
    assert result[1]["dni_w_m2"] == 600.0
    assert result[1]["dhi_w_m2"] == 200.0
    assert result[1]["ghi_w_m2"] == 800.0

    params = mock_client.get.call_args.kwargs["params"]
    assert params["lat"] == "52.35"
    assert params["lon"] == "4.90"

    mock_cache_get.assert_awaited_once()
    mock_cache_set.assert_awaited_once()


@pytest.mark.asyncio
@patch(
    "app.services.weather.cache_get",
    new_callable=AsyncMock,
    return_value=[{"date": "2005-01-01T00:30:00Z", "minute_of_day": 30}],
)
@patch("app.services.weather._get_client")
async def test_fetch_tmy_data_uses_cache(mock_get_client, mock_cache_get):
    result = await fetch_tmy_data(52.37, 4.90)
    assert len(result) == 1
    assert result[0]["minute_of_day"] == 30
    mock_cache_get.assert_awaited_once()
    mock_get_client.assert_not_called()


@pytest.mark.asyncio
@patch("app.services.weather.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.services.weather.cache_set", new_callable=AsyncMock)
@patch("app.services.weather._get_client")
async def test_fetch_tmy_data_does_not_cache_empty(
    mock_get_client,
    mock_cache_set,
    _mock_cache_get,
):
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.content = b'{"ok": true}'
    mock_response.json.return_value = {"outputs": {"tmy_hourly": []}}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_get_client.return_value = mock_client

    result = await fetch_tmy_data(52.37, 4.90)
    assert result == []
    mock_cache_set.assert_not_awaited()


@pytest.mark.asyncio
@patch("app.api.address.fetch_tmy_data", new_callable=AsyncMock)
async def test_weather_tmy_endpoint_success(mock_fetch_tmy_data, client):
    mock_fetch_tmy_data.return_value = [
        {
            "date": "2005-01-01T00:30:00Z",
            "minute_of_day": 30,
            "ghi_w_m2": 0,
            "dni_w_m2": 0,
            "dhi_w_m2": 0,
        }
    ]

    response = await client.get(
        "/api/address/0363010000696734/weather-tmy?lat=52.37&lng=4.90"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"].startswith("PVGIS TMY v5.2")
    assert payload["grid_resolution_deg"] == 0.05
    assert payload["hourly_records"] == 1
    assert len(payload["data"]) == 1


@pytest.mark.asyncio
@patch("app.api.address.fetch_tmy_data", new_callable=AsyncMock, side_effect=RuntimeError("boom"))
async def test_weather_tmy_endpoint_handles_upstream_errors(_mock_fetch_tmy_data, client):
    response = await client.get(
        "/api/address/0363010000696734/weather-tmy?lat=52.37&lng=4.90"
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "Weather TMY data unavailable"
