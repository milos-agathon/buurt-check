"""Tests for the Leefbaarometer livability service (15 tests).

13 service-level tests + 2 endpoint-level cache tests.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models.livability import (
    LivabilityComparison,
    LivabilityResponse,
    LivabilityTrendPoint,
)
from app.services.leefbaarometer import (
    get_livability,
    get_livability_comparison,
    get_livability_trend,
)

# ───────── Mock data (from live API response) ──────────

MOCK_BUURT_RESPONSE = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "id": "buurtscore24.4272",
            "properties": {
                "gemeente": "Amsterdam",
                "name": "Elandsgrachtbuurt",
                "id": "BU0363AB10",
                "scale": "buurt",
                "year": "2024",
                "kscore": 9,
                "kfys": 5,
                "konv": 3,
                "ksoc": 3,
                "kvrz": 9,
                "kwon": 5,
            },
        }
    ],
    "totalFeatures": 1,
    "numberMatched": 1,
    "numberReturned": 1,
}

MOCK_EMPTY_RESPONSE = {
    "type": "FeatureCollection",
    "features": [],
    "totalFeatures": 0,
    "numberMatched": 0,
    "numberReturned": 0,
}

MOCK_WIJK_RESPONSE = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "gemeente": "Amsterdam",
                "name": "Centrum-West",
                "id": "WK036302",
                "scale": "wijk",
                "year": "2024",
                "kscore": 7,
                "kfys": 4,
                "konv": 3,
                "ksoc": 4,
                "kvrz": 8,
                "kwon": 5,
            },
        }
    ],
    "totalFeatures": 1,
}

MOCK_GEMEENTE_RESPONSE = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "gemeente": "Amsterdam",
                "name": "Amsterdam",
                "id": "GM0363",
                "scale": "gemeente",
                "year": "2024",
                "kscore": 6,
                "kfys": 5,
                "konv": 4,
                "ksoc": 5,
                "kvrz": 7,
                "kwon": 4,
            },
        }
    ],
    "totalFeatures": 1,
}


def _make_mock_response(data: dict, content_type: str = "application/json") -> MagicMock:
    resp = MagicMock()
    resp.json.return_value = data
    resp.status_code = 200
    resp.headers = {"content-type": content_type}
    resp.raise_for_status = MagicMock()
    return resp


def _mock_client(response: MagicMock) -> AsyncMock:
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    return client


# ═══════ Service-level tests (13) ═══════


@pytest.mark.asyncio
async def test_livability_happy_path():
    """Valid WFS response → correct LivabilityResponse with available=true."""
    mock_resp = _make_mock_response(MOCK_BUURT_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is not None
    assert isinstance(result, LivabilityResponse)
    assert result.available is True
    assert result.buurt_name == "Elandsgrachtbuurt"
    assert result.gemeente == "Amsterdam"


@pytest.mark.asyncio
async def test_livability_field_mapping():
    """kscore maps to overall_score, kfys maps to physical dimension."""
    mock_resp = _make_mock_response(MOCK_BUURT_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is not None
    assert result.overall_score == 9
    phys = next((d for d in result.dimensions if d.name == "physical"), None)
    assert phys is not None
    assert phys.raw_score == 5


@pytest.mark.asyncio
async def test_livability_score_normalization():
    """kscore=1→0, kscore=5→50, kscore=9→100."""
    from app.services.leefbaarometer import _normalize_score

    assert _normalize_score(1) == 0
    assert _normalize_score(5) == 50
    assert _normalize_score(9) == 100


@pytest.mark.asyncio
async def test_livability_all_dimensions_present():
    """All 5 dimensions in response."""
    mock_resp = _make_mock_response(MOCK_BUURT_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is not None
    assert len(result.dimensions) == 5


@pytest.mark.asyncio
async def test_livability_dimension_names():
    """physical, safety, social, amenities, housing."""
    mock_resp = _make_mock_response(MOCK_BUURT_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is not None
    names = {d.name for d in result.dimensions}
    assert names == {"physical", "safety", "social", "amenities", "housing"}


@pytest.mark.asyncio
async def test_livability_no_features():
    """totalFeatures=0 → returns None."""
    mock_resp = _make_mock_response(MOCK_EMPTY_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(0, 0)

    assert result is None


@pytest.mark.asyncio
async def test_livability_timeout():
    """httpx timeout → returns None (graceful degradation)."""
    mock_cl = AsyncMock()
    mock_cl.get = AsyncMock(side_effect=httpx.TimeoutException("timed out"))

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is None


@pytest.mark.asyncio
async def test_livability_xml_error_response():
    """WFS returns XML error → returns None."""
    mock_resp = _make_mock_response(
        {"error": "xml"}, content_type="application/xml"
    )
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is None


@pytest.mark.asyncio
async def test_trend_returns_historical_series():
    """Multiple years returned, sorted chronologically."""
    call_count = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        # Return data for all requests
        return _make_mock_response(MOCK_BUURT_RESPONSE)

    mock_cl = AsyncMock()
    mock_cl.get = _side_effect

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability_trend(121000, 487000)

    assert len(result) >= 1
    assert all(isinstance(p, LivabilityTrendPoint) for p in result)
    # Check sorted
    years = [p.year for p in result]
    assert years == sorted(years)


@pytest.mark.asyncio
async def test_trend_partial_failure():
    """One historical year fails → others still returned."""
    call_idx = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_idx
        call_idx += 1
        if call_idx == 3:
            raise httpx.TimeoutException("timed out")
        return _make_mock_response(MOCK_BUURT_RESPONSE)

    mock_cl = AsyncMock()
    mock_cl.get = _side_effect

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability_trend(121000, 487000)

    # Should have 8 results (9 minus 1 failure)
    assert len(result) == 8


@pytest.mark.asyncio
async def test_trend_empty_when_no_data():
    """Point outside coverage → empty trend list."""
    mock_resp = _make_mock_response(MOCK_EMPTY_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability_trend(0, 0)

    assert result == []


@pytest.mark.asyncio
async def test_comparison_returns_wijk_and_gemeente():
    """Both wijk and gemeente rows present."""
    call_idx = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_idx
        call_idx += 1
        type_name = kwargs.get("params", {}).get("typeName", "")
        if isinstance(type_name, str) and "wijk" in type_name:
            return _make_mock_response(MOCK_WIJK_RESPONSE)
        return _make_mock_response(MOCK_GEMEENTE_RESPONSE)

    mock_cl = AsyncMock()
    mock_cl.get = _side_effect

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability_comparison(121000, 487000)

    assert result is not None
    assert isinstance(result, LivabilityComparison)
    levels = {r.level for r in result.rows}
    assert "wijk" in levels or "gemeente" in levels


@pytest.mark.asyncio
async def test_comparison_partial_failure():
    """Wijk fails → gemeente still returned."""
    call_idx = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_idx
        call_idx += 1
        if call_idx == 1:
            raise httpx.TimeoutException("timed out")
        return _make_mock_response(MOCK_GEMEENTE_RESPONSE)

    mock_cl = AsyncMock()
    mock_cl.get = _side_effect

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability_comparison(121000, 487000)

    assert result is not None
    assert len(result.rows) >= 1


# ═══════ Endpoint cache tests (2) ═══════


@pytest.mark.asyncio
async def test_endpoint_cache_hit():
    """First call caches, second call returns cached data without hitting WFS."""
    from starlette.testclient import TestClient

    from app.main import app

    mock_resp = _make_mock_response(MOCK_BUURT_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    cache_store: dict[str, object] = {}

    async def mock_cache_get(key: str):
        return cache_store.get(key)

    async def mock_cache_set(key: str, value: object, ttl: int = 0):
        cache_store[key] = value

    with (
        patch("app.services.leefbaarometer._client") as m_client,
        patch("app.api.address.cache_get", side_effect=mock_cache_get),
        patch("app.api.address.cache_set", side_effect=mock_cache_set),
    ):
        m_client.get.return_value = mock_cl

        client = TestClient(app)

        # First call — should hit WFS
        resp1 = client.get(
            "/api/address/0363200012345678/livability",
            params={"rd_x": "121000", "rd_y": "487000"},
        )
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["available"] is True

        # Record WFS call count after first request
        wfs_call_count_after_first = m_client.get.call_count

        # Second call — should come from cache, WFS call count must NOT increase
        resp2 = client.get(
            "/api/address/0363200012345678/livability",
            params={"rd_x": "121000", "rd_y": "487000"},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["available"] is True
        assert data2["buurt_name"] == data1["buurt_name"]

        # Assert WFS was NOT called again on second request (cache hit)
        assert m_client.get.call_count == wfs_call_count_after_first


@pytest.mark.asyncio
async def test_endpoint_no_cache_on_empty():
    """When no data, endpoint returns available:false and does NOT cache.

    Calls endpoint twice to prove both: no cache write on empty, and
    repeated WFS fetch on subsequent call.
    """
    from starlette.testclient import TestClient

    from app.main import app

    mock_resp = _make_mock_response(MOCK_EMPTY_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    cache_store: dict[str, object] = {}

    async def mock_cache_get(key: str):
        return cache_store.get(key)

    async def mock_cache_set(key: str, value: object, ttl: int = 0):
        cache_store[key] = value

    with (
        patch("app.services.leefbaarometer._client") as m_client,
        patch("app.api.address.cache_get", side_effect=mock_cache_get),
        patch("app.api.address.cache_set", side_effect=mock_cache_set),
    ):
        m_client.get.return_value = mock_cl

        client = TestClient(app)

        # First call — no data
        resp1 = client.get(
            "/api/address/0363200012345678/livability",
            params={"rd_x": "121000", "rd_y": "487000"},
        )
        assert resp1.status_code == 200
        assert resp1.json()["available"] is False

        # Verify nothing was cached
        assert len(cache_store) == 0

        # Record WFS call count after first request
        wfs_call_count_after_first = m_client.get.call_count

        # Second call — should hit WFS again (not cached)
        resp2 = client.get(
            "/api/address/0363200012345678/livability",
            params={"rd_x": "121000", "rd_y": "487000"},
        )
        assert resp2.status_code == 200
        assert resp2.json()["available"] is False

        # Assert WFS was called again (empty results were NOT cached)
        assert m_client.get.call_count > wfs_call_count_after_first

        # Still nothing in cache
        assert len(cache_store) == 0
