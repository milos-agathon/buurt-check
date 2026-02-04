import json
import logging
import time

import redis.asyncio as redis

from app.config import settings

logger = logging.getLogger(__name__)

_pool: redis.Redis | None = None

_COOLDOWN_SECONDS = 30
_circuit_open_until: float = 0.0


def _circuit_is_open() -> bool:
    return time.monotonic() < _circuit_open_until


def _trip_circuit() -> None:
    global _circuit_open_until
    _circuit_open_until = time.monotonic() + _COOLDOWN_SECONDS


def _get_redis() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=0.5,
            socket_connect_timeout=0.5,
        )
    return _pool


async def cache_get(key: str) -> dict | list | None:
    """Get a cached value. Returns None if Redis is unavailable or key doesn't exist."""
    if _circuit_is_open():
        return None
    try:
        r = _get_redis()
        value = await r.get(key)
        if value is None:
            return None
        return json.loads(value)
    except Exception:
        logger.debug("Cache get failed for key=%s", key, exc_info=True)
        _trip_circuit()
        return None


async def cache_set(key: str, value: dict | list, ttl: int | None = None) -> None:
    """Set a cached value. Silently skips if Redis is unavailable."""
    if _circuit_is_open():
        return
    try:
        r = _get_redis()
        serialized = json.dumps(value)
        if ttl:
            await r.setex(key, ttl, serialized)
        else:
            await r.set(key, serialized)
    except Exception:
        logger.debug("Cache set failed for key=%s", key, exc_info=True)
        _trip_circuit()
