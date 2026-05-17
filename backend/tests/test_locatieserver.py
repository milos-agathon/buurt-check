from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services import locatieserver
from app.services.locatieserver import _parse_wkt_point, lookup, suggest


def test_parse_wkt_point_valid():
    result = _parse_wkt_point("POINT(4.89214036 52.37250408)")
    assert result == (4.89214036, 52.37250408)


def test_parse_wkt_point_rd():
    result = _parse_wkt_point("POINT(121286 487296)")
    assert result == (121286.0, 487296.0)


def test_parse_wkt_point_none():
    assert _parse_wkt_point(None) is None


def test_parse_wkt_point_empty():
    assert _parse_wkt_point("") is None


def test_parse_wkt_point_invalid():
    assert _parse_wkt_point("not a point") is None


@pytest.mark.asyncio
async def test_suggest_returns_suggestions(httpx_mock):
    httpx_mock.add_response(
        json={
            "response": {
                "numFound": 2,
                "start": 0,
                "maxScore": 7.5,
                "docs": [
                    {
                        "type": "adres",
                        "weergavenaam": "Kalverstraat 1, 1012NX Amsterdam",
                        "id": "adr-abc123",
                        "score": 7.5,
                    },
                    {
                        "type": "adres",
                        "weergavenaam": "Kalverstraat 10, 1012NX Amsterdam",
                        "id": "adr-def456",
                        "score": 6.0,
                    },
                ],
            },
            "highlighting": {
                "adr-abc123": {"suggest": ["<b>Kalverstraat</b> <b>1</b>, Amsterdam"]},
                "adr-def456": {"suggest": ["<b>Kalverstraat</b> 10, Amsterdam"]},
            },
        }
    )

    locatieserver._client._client = None

    results = await suggest("kalverstraat 1 amsterdam", limit=5)
    assert len(results) == 2
    assert results[0].id == "adr-abc123"
    assert results[0].display_name == "Kalverstraat 1, 1012NX Amsterdam"
    assert results[0].score == 7.5

    locatieserver._client._client = None


@pytest.mark.asyncio
async def test_suggest_empty_results(httpx_mock):
    httpx_mock.add_response(
        json={
            "response": {"numFound": 0, "start": 0, "maxScore": 0, "docs": []},
            "highlighting": {},
        }
    )
    httpx_mock.add_response(
        json={
            "response": {"numFound": 0, "start": 0, "maxScore": 0, "docs": []},
            "highlighting": {},
        }
    )

    locatieserver._client._client = None

    results = await suggest("xyznonexistent")
    assert results == []

    locatieserver._client._client = None


@pytest.mark.asyncio
async def test_lookup_returns_address(httpx_mock):
    httpx_mock.add_response(
        json={
            "response": {
                "numFound": 1,
                "docs": [
                    {
                        "id": "adr-abc123",
                        "nummeraanduiding_id": "0363200000158443",
                        "adresseerbaarobject_id": "0363010000696734",
                        "weergavenaam": "Kalverstraat 1, 1012NX Amsterdam",
                        "straatnaam": "Kalverstraat",
                        "huisnummer": 1,
                        "postcode": "1012NX",
                        "woonplaatsnaam": "Amsterdam",
                        "gemeentenaam": "Amsterdam",
                        "provincienaam": "Noord-Holland",
                        "centroide_ll": "POINT(4.89214036 52.37250408)",
                        "centroide_rd": "POINT(121286 487296)",
                        "buurtcode": "BU0363AD07",
                        "wijkcode": "WK0363AD",
                    }
                ],
            }
        }
    )

    locatieserver._client._client = None

    result = await lookup("adr-abc123")
    assert result is not None
    assert result.street == "Kalverstraat"
    assert result.house_number == "1"
    assert result.latitude == 52.37250408
    assert result.longitude == 4.89214036
    assert result.rd_x == 121286.0
    assert result.rd_y == 487296.0
    assert result.adresseerbaar_object_id == "0363010000696734"

    locatieserver._client._client = None


@pytest.mark.asyncio
async def test_lookup_not_found(httpx_mock):
    httpx_mock.add_response(json={"response": {"numFound": 0, "docs": []}})

    locatieserver._client._client = None

    result = await lookup("adr-nonexistent")
    assert result is None

    locatieserver._client._client = None


@pytest.mark.asyncio
async def test_lookup_maps_huisnummertoevoeging(httpx_mock):
    httpx_mock.add_response(
        json={
            "response": {
                "numFound": 1,
                "docs": [
                    {
                        "id": "adr-toev",
                        "weergavenaam": "Keizersgracht 100-3, Amsterdam",
                        "straatnaam": "Keizersgracht",
                        "huisnummer": 100,
                        "huisnummertoevoeging": "3",
                        "postcode": "1015AA",
                        "woonplaatsnaam": "Amsterdam",
                        "centroide_ll": "POINT(4.884 52.367)",
                        "centroide_rd": "POINT(121000 487000)",
                    }
                ],
            }
        }
    )

    locatieserver._client._client = None

    result = await lookup("adr-toev")
    assert result is not None
    assert result.addition == "3"

    locatieserver._client._client = None


@pytest.mark.asyncio
async def test_reverse_addresses_uses_locatieserver_reverse_endpoint():
    reverse_response = MagicMock()
    reverse_response.raise_for_status.return_value = None
    reverse_response.json.return_value = {
        "response": {
            "docs": [
                {
                    "id": "adr-provider-1",
                    "weergavenaam": "IJburglaan 1000, 1087JK Amsterdam",
                    "type": "adres",
                    "score": 1.0,
                    "adresseerbaarobject_id": "0363010000987651",
                    "nummeraanduiding_id": "0363200000987651",
                    "straatnaam": "IJburglaan",
                    "huisnummer": 1000,
                    "postcode": "1087JK",
                    "woonplaatsnaam": "Amsterdam",
                    "gemeentenaam": "Amsterdam",
                    "provincienaam": "Noord-Holland",
                    "centroide_ll": "POINT(5.0001 52.3551)",
                    "centroide_rd": "POINT(126260 486810)",
                    "buurtcode": "BU0363AA01",
                    "wijkcode": "WK0363AA",
                },
                {
                    "id": "adr-provider-2",
                    "weergavenaam": "IJburglaan 1002, 1087JK Amsterdam",
                    "type": "adres",
                    "score": 0.8,
                    "adresseerbaarobject_id": "0363010000987652",
                    "nummeraanduiding_id": "0363200000987652",
                    "straatnaam": "IJburglaan",
                    "huisnummer": 1002,
                    "postcode": "1087JK",
                    "woonplaatsnaam": "Amsterdam",
                    "centroide_ll": "POINT(5.0002 52.3552)",
                    "centroide_rd": "POINT(126270 486820)",
                },
            ]
        }
    }

    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=reverse_response)

    with patch.object(locatieserver._client, "get", return_value=mock_client):
        result = await locatieserver.reverse_addresses(
            latitude=52.355,
            longitude=5.0,
            distance_m=75,
            limit=2,
        )

    assert [address.id for address in result] == ["adr-provider-1", "adr-provider-2"]
    assert result[0].adresseerbaar_object_id == "0363010000987651"
    assert result[0].house_number == "1000"
    assert result[0].postcode == "1087JK"
    mock_client.get.assert_awaited_once()
    call = mock_client.get.await_args
    assert call.args[0] == "/reverse"
    assert call.kwargs["params"] == {
        "lat": "52.355000",
        "lon": "5.000000",
        "type": "adres",
        "distance": 75,
        "rows": 2,
        "fl": "*",
    }


@pytest.mark.asyncio
async def test_suggest_falls_back_to_free_results_when_suggest_is_empty():
    empty_response = MagicMock()
    empty_response.raise_for_status.return_value = None
    empty_response.json.return_value = {
        "response": {"docs": []}
    }

    free_response = MagicMock()
    free_response.raise_for_status.return_value = None
    free_response.json.return_value = {
        "response": {
            "docs": [
                {
                    "id": "adr-1",
                    "weergavenaam": "IJburglaan 1000, 1087JK Amsterdam",
                    "type": "adres",
                    "score": 9.8,
                }
            ]
        }
    }

    mock_client = MagicMock()
    mock_client.get = AsyncMock(side_effect=[empty_response, free_response])

    with patch.object(locatieserver._client, "get", return_value=mock_client):
        result = await locatieserver.suggest("  IJburglaan   1000   Amsterdam  ", 3)

    assert len(result) == 1
    assert result[0].display_name == "IJburglaan 1000, 1087JK Amsterdam"
    assert mock_client.get.await_count == 2
    first_call = mock_client.get.await_args_list[0]
    second_call = mock_client.get.await_args_list[1]
    assert first_call.args[0] == "/suggest"
    assert second_call.args[0] == "/free"
    assert first_call.kwargs["params"]["q"] == "IJburglaan 1000 Amsterdam"
    assert second_call.kwargs["params"]["q"] == "IJburglaan 1000 Amsterdam"


@pytest.mark.asyncio
async def test_suggest_retries_once_on_retryable_http_status():
    request = httpx.Request("GET", "https://example.test/suggest")
    retryable_response = httpx.Response(502, request=request)

    first = MagicMock()
    first.raise_for_status.side_effect = httpx.HTTPStatusError(
        "bad gateway",
        request=request,
        response=retryable_response,
    )

    second = MagicMock()
    second.raise_for_status.return_value = None
    second.json.return_value = {
        "response": {
            "docs": [
                {
                    "id": "adr-1",
                    "weergavenaam": "Keizersgracht 1, Amsterdam",
                    "type": "adres",
                    "score": 1.0,
                }
            ]
        }
    }

    mock_client = MagicMock()
    mock_client.get = AsyncMock(side_effect=[first, second])

    with patch.object(locatieserver._client, "get", return_value=mock_client):
        result = await locatieserver.suggest("keizersgracht", 3)

    assert len(result) == 1
    assert result[0].display_name == "Keizersgracht 1, Amsterdam"
    assert mock_client.get.await_count == 2


@pytest.mark.asyncio
async def test_suggest_does_not_retry_non_retryable_http_status():
    request = httpx.Request("GET", "https://example.test/suggest")
    response = httpx.Response(400, request=request)

    failing = MagicMock()
    failing.raise_for_status.side_effect = httpx.HTTPStatusError(
        "bad request",
        request=request,
        response=response,
    )

    mock_client = MagicMock()
    mock_client.get = AsyncMock(return_value=failing)

    with patch.object(locatieserver._client, "get", return_value=mock_client):
        with pytest.raises(httpx.HTTPStatusError):
            await locatieserver.suggest("x", 3)

    assert mock_client.get.await_count == 1
