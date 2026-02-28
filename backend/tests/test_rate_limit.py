"""Tests for rate limiting with slowapi."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
import pytest_asyncio

from app.main import app
from app.rate_limit import limiter


@pytest_asyncio.fixture
async def rate_client():
    """Client for rate limit tests — each test gets a fresh limiter state."""
    limiter.reset()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _mock_suggest():
    """Patch suggest endpoint dependencies to return fast."""
    return patch(
        "app.api.address.cache_get",
        new_callable=AsyncMock,
        return_value=[
            {"display_name": "Test", "id": "t1", "type": "adres", "score": 10.0}
        ],
    )


def _mock_risks():
    """Patch risk cards dependencies to return fast."""
    _unavailable = {
        "level": "unavailable",
        "source": "test",
        "sampled_at": "2026-01-01T00:00:00",
    }
    cached = {
        "address_id": "0363010012345678",
        "noise": _unavailable,
        "air_quality": _unavailable,
        "climate_stress": _unavailable,
    }
    return patch(
        "app.api.address.cache_get",
        new_callable=AsyncMock,
        return_value=cached,
    )


# --- Rate limit header tests ---


@pytest.mark.asyncio
async def test_rate_limit_headers_on_health(rate_client):
    """Normal responses include X-RateLimit-* headers."""
    resp = await rate_client.get("/health")
    assert resp.status_code == 200
    assert "x-ratelimit-limit" in resp.headers
    assert "x-ratelimit-remaining" in resp.headers
    assert "x-ratelimit-reset" in resp.headers


@pytest.mark.asyncio
async def test_suggest_rate_limit_header_shows_30(rate_client):
    """Suggest endpoint advertises its 30/minute limit."""
    with _mock_suggest():
        resp = await rate_client.get("/api/address/suggest", params={"q": "test"})
    assert resp.status_code == 200
    assert resp.headers.get("x-ratelimit-limit") == "30"


@pytest.mark.asyncio
async def test_risks_rate_limit_header_shows_10(rate_client):
    """Risks endpoint advertises its 10/minute limit."""
    with _mock_risks():
        resp = await rate_client.get(
            "/api/address/0363010012345678/risks",
            params={"rd_x": "121000", "rd_y": "487000", "lat": "52.37", "lng": "4.89"},
        )
    assert resp.status_code == 200
    assert resp.headers.get("x-ratelimit-limit") == "10"


# --- 429 exceeded tests ---


@pytest.mark.asyncio
async def test_suggest_returns_429_after_30_requests(rate_client):
    """Suggest endpoint returns 429 after exceeding 30/minute limit."""
    with _mock_suggest():
        for i in range(30):
            resp = await rate_client.get(
                "/api/address/suggest", params={"q": f"test{i}"}
            )
            assert resp.status_code == 200, f"Request {i+1} should succeed"

        # 31st request should be rate limited
        resp = await rate_client.get(
            "/api/address/suggest", params={"q": "overflow"}
        )
    assert resp.status_code == 429
    assert "retry-after" in resp.headers


@pytest.mark.asyncio
async def test_risks_returns_429_after_10_requests(rate_client):
    """Risks endpoint returns 429 after exceeding 10/minute limit."""
    with _mock_risks():
        for i in range(10):
            resp = await rate_client.get(
                "/api/address/0363010012345678/risks",
                params={
                    "rd_x": "121000",
                    "rd_y": "487000",
                    "lat": "52.37",
                    "lng": "4.89",
                },
            )
            assert resp.status_code == 200, f"Request {i+1} should succeed"

        # 11th request should be rate limited
        resp = await rate_client.get(
            "/api/address/0363010012345678/risks",
            params={
                "rd_x": "121000",
                "rd_y": "487000",
                "lat": "52.37",
                "lng": "4.89",
            },
        )
    assert resp.status_code == 429
    assert "retry-after" in resp.headers


@pytest.mark.asyncio
async def test_export_returns_429_after_5_requests(rate_client):
    """Export endpoint returns 429 after exceeding 5/minute limit."""
    mock_building = AsyncMock(return_value=None)
    mock_risks = AsyncMock(return_value=None)

    with (
        patch("app.api.address._fetch_building_for_export", mock_building),
        patch("app.api.address._fetch_risks_for_export", mock_risks),
    ):
        for i in range(5):
            resp = await rate_client.post(
                "/api/address/0363010012345678/export",
                json={
                    "rd_x": 121000,
                    "rd_y": 487000,
                    "lat": 52.37,
                    "lng": 4.89,
                    "address": "Test 1, Amsterdam",
                },
            )
            assert resp.status_code == 200, f"Request {i+1} should succeed"

        # 6th request should be rate limited
        resp = await rate_client.post(
            "/api/address/0363010012345678/export",
            json={
                "rd_x": 121000,
                "rd_y": 487000,
                "lat": 52.37,
                "lng": 4.89,
                "address": "Test 1, Amsterdam",
            },
        )
    assert resp.status_code == 429
    assert "retry-after" in resp.headers


@pytest.mark.asyncio
async def test_default_limit_returns_429_after_20_requests(rate_client):
    """Endpoints without specific limit use default 20/minute."""
    for i in range(20):
        resp = await rate_client.get("/health")
        assert resp.status_code == 200, f"Request {i+1} should succeed"

    # 21st request should be rate limited
    resp = await rate_client.get("/health")
    assert resp.status_code == 429
    assert "retry-after" in resp.headers


@pytest.mark.asyncio
async def test_429_response_is_json(rate_client):
    """429 responses return JSON with error detail."""
    for _ in range(20):
        await rate_client.get("/health")

    resp = await rate_client.get("/health")
    assert resp.status_code == 429
    data = resp.json()
    assert "error" in data
    assert "Rate limit exceeded" in data["error"]


@pytest.mark.asyncio
async def test_rate_limits_are_per_endpoint(rate_client):
    """Hitting one endpoint's limit does not affect another endpoint."""
    # Exhaust the /health default limit (20/min)
    for _ in range(20):
        resp = await rate_client.get("/health")
        assert resp.status_code == 200

    # /health should be rate limited now
    resp = await rate_client.get("/health")
    assert resp.status_code == 429

    # But /suggest should still work (separate 30/min limit)
    with _mock_suggest():
        resp = await rate_client.get(
            "/api/address/suggest", params={"q": "test"}
        )
    assert resp.status_code == 200
