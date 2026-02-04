import time

import pytest

import app.cache.redis as cache_module
from app.cache.redis import cache_get, cache_set


@pytest.fixture(autouse=True)
def reset_circuit_breaker():
    """Reset circuit breaker state before each test."""
    cache_module._circuit_open_until = 0.0
    cache_module._pool = None
    yield
    cache_module._circuit_open_until = 0.0
    cache_module._pool = None


@pytest.mark.asyncio
async def test_cache_get_returns_none_when_redis_unavailable():
    result = await cache_get("nonexistent:key")
    assert result is None


@pytest.mark.asyncio
async def test_cache_set_skips_when_redis_unavailable():
    # Should not raise -- just silently skip
    await cache_set("test:key", {"foo": "bar"}, ttl=60)


@pytest.mark.asyncio
async def test_circuit_breaker_skips_after_failure():
    # First call trips the circuit (connects to unavailable Redis)
    await cache_get("trip:circuit")

    # Second call should be near-instant because circuit is open
    start = time.monotonic()
    result = await cache_get("should:skip")
    elapsed = time.monotonic() - start

    assert result is None
    assert elapsed < 0.05  # Should be near-instant, not 500ms


@pytest.mark.asyncio
async def test_circuit_breaker_resets_after_cooldown():
    # Trip the circuit
    cache_module._circuit_open_until = time.monotonic() - 1.0  # Already expired

    # Circuit should be closed, so this will try Redis (and fail with timeout)
    result = await cache_get("after:cooldown")
    assert result is None

    # Circuit should now be tripped again
    assert cache_module._circuit_open_until > time.monotonic()


@pytest.mark.asyncio
async def test_cache_set_skipped_when_circuit_open():
    # Manually trip the circuit
    cache_module._circuit_open_until = time.monotonic() + 30.0

    start = time.monotonic()
    await cache_set("should:skip", {"data": "value"}, ttl=60)
    elapsed = time.monotonic() - start

    assert elapsed < 0.01  # Should be near-instant
