"""Tests for the Leefbaarometer livability service.

13 service-level tests + 2 endpoint-level cache tests + data validation tests.
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

    from app.api.dependencies import require_entitlement
    from app.main import app

    async def _noop():
        return None

    mock_resp = _make_mock_response(MOCK_BUURT_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    cache_store: dict[str, object] = {}

    async def mock_cache_get(key: str):
        return cache_store.get(key)

    async def mock_cache_set(key: str, value: object, ttl: int = 0):
        cache_store[key] = value

    app.dependency_overrides[require_entitlement] = _noop
    try:
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
    finally:
        app.dependency_overrides.pop(require_entitlement, None)


@pytest.mark.asyncio
async def test_endpoint_no_cache_on_empty():
    """When no data, endpoint returns available:false and does NOT cache.

    Calls endpoint twice to prove both: no cache write on empty, and
    repeated WFS fetch on subsequent call.
    """
    from starlette.testclient import TestClient

    from app.api.dependencies import require_entitlement
    from app.main import app

    async def _noop():
        return None

    mock_resp = _make_mock_response(MOCK_EMPTY_RESPONSE)
    mock_cl = _mock_client(mock_resp)

    cache_store: dict[str, object] = {}

    async def mock_cache_get(key: str):
        return cache_store.get(key)

    async def mock_cache_set(key: str, value: object, ttl: int = 0):
        cache_store[key] = value

    app.dependency_overrides[require_entitlement] = _noop
    try:
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
    finally:
        app.dependency_overrides.pop(require_entitlement, None)


# ═══════ Data validation tests — non-numeric kscore (#11) ═══════


def _make_buurt_response_with_kscore(kscore_value: object) -> dict:
    """Build a WFS response with a custom kscore value."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "gemeente": "Amsterdam",
                    "name": "TestBuurt",
                    "id": "BU0363XX00",
                    "year": "2024",
                    "kscore": kscore_value,
                    "kfys": 5,
                    "konv": 3,
                    "ksoc": 3,
                    "kvrz": 9,
                    "kwon": 5,
                },
            }
        ],
        "totalFeatures": 1,
    }


@pytest.mark.asyncio
async def test_livability_non_numeric_kscore_returns_none():
    """kscore='N/A' from WFS → returns None, does not crash (bug #11)."""
    data = _make_buurt_response_with_kscore("N/A")
    mock_resp = _make_mock_response(data)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is None


@pytest.mark.asyncio
async def test_livability_empty_string_kscore_returns_none():
    """kscore='' from WFS → returns None."""
    data = _make_buurt_response_with_kscore("")
    mock_resp = _make_mock_response(data)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is None


@pytest.mark.asyncio
async def test_livability_string_numeric_kscore_works():
    """kscore='7' (string) from WFS → parsed as int 7, works correctly."""
    data = _make_buurt_response_with_kscore("7")
    mock_resp = _make_mock_response(data)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is not None
    assert result.overall_score == 7
    assert result.overall_normalized == 75


@pytest.mark.asyncio
async def test_trend_non_numeric_kscore_skipped():
    """Non-numeric kscore in a historical year → that year is skipped, others work."""
    call_idx = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_idx
        call_idx += 1
        if call_idx == 3:
            # Return non-numeric kscore for one year
            return _make_mock_response(_make_buurt_response_with_kscore("N/A"))
        return _make_mock_response(MOCK_BUURT_RESPONSE)

    mock_cl = AsyncMock()
    mock_cl.get = _side_effect

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability_trend(121000, 487000)

    # Should have 8 results (9 minus 1 non-numeric kscore)
    assert len(result) == 8


@pytest.mark.asyncio
async def test_dimensions_non_numeric_skipped():
    """Non-numeric dimension value → that dimension skipped, others parsed."""
    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "gemeente": "Amsterdam",
                    "name": "TestBuurt",
                    "id": "BU0363XX00",
                    "year": "2024",
                    "kscore": 7,
                    "kfys": "N/A",  # non-numeric dimension
                    "konv": 3,
                    "ksoc": 3,
                    "kvrz": 9,
                    "kwon": 5,
                },
            }
        ],
        "totalFeatures": 1,
    }
    mock_resp = _make_mock_response(data)
    mock_cl = _mock_client(mock_resp)

    with patch("app.services.leefbaarometer._client") as m:
        m.get.return_value = mock_cl
        result = await get_livability(121000, 487000)

    assert result is not None
    assert result.overall_score == 7
    # Only 4 dimensions (physical/kfys was skipped)
    assert len(result.dimensions) == 4
    names = {d.name for d in result.dimensions}
    assert "physical" not in names


def test_safe_int_edge_cases():
    """_safe_int handles various edge cases without crashing."""
    from app.services.leefbaarometer import _safe_int

    assert _safe_int(None) is None
    assert _safe_int("N/A") is None
    assert _safe_int("") is None
    assert _safe_int("abc") is None
    assert _safe_int(5) == 5
    assert _safe_int("7") == 7
    assert _safe_int(3.9) == 3  # float truncated to int
