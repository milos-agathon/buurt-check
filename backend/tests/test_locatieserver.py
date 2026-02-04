import pytest

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

    # Reset the client so httpx_mock is used
    import app.services.locatieserver as ls
    ls._client = None

    results = await suggest("kalverstraat 1 amsterdam", limit=5)
    assert len(results) == 2
    assert results[0].id == "adr-abc123"
    assert results[0].display_name == "Kalverstraat 1, 1012NX Amsterdam"
    assert results[0].score == 7.5

    ls._client = None


@pytest.mark.asyncio
async def test_suggest_empty_results(httpx_mock):
    httpx_mock.add_response(
        json={
            "response": {"numFound": 0, "start": 0, "maxScore": 0, "docs": []},
            "highlighting": {},
        }
    )

    import app.services.locatieserver as ls
    ls._client = None

    results = await suggest("xyznonexistent")
    assert results == []

    ls._client = None


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

    import app.services.locatieserver as ls
    ls._client = None

    result = await lookup("adr-abc123")
    assert result is not None
    assert result.street == "Kalverstraat"
    assert result.house_number == "1"
    assert result.latitude == 52.37250408
    assert result.longitude == 4.89214036
    assert result.rd_x == 121286.0
    assert result.rd_y == 487296.0
    assert result.adresseerbaar_object_id == "0363010000696734"

    ls._client = None


@pytest.mark.asyncio
async def test_lookup_not_found(httpx_mock):
    httpx_mock.add_response(
        json={"response": {"numFound": 0, "docs": []}}
    )

    import app.services.locatieserver as ls
    ls._client = None

    result = await lookup("adr-nonexistent")
    assert result is None

    ls._client = None


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

    import app.services.locatieserver as ls
    ls._client = None

    result = await lookup("adr-toev")
    assert result is not None
    assert result.addition == "3"

    ls._client = None
