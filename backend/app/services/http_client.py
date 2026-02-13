"""Shared loop-aware httpx client factory.

Prevents the stale-event-loop bug: httpx.AsyncClient.is_closed does not
detect a dead event loop, only explicit .aclose(). This helper tracks
the loop ID and recreates the client on loop change, with safe async
cleanup of the old client.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class LoopAwareClient:
    """Manages a single httpx.AsyncClient that auto-recreates on loop change."""

    def __init__(self, **client_kwargs: Any):
        self._kwargs = client_kwargs
        self._client: httpx.AsyncClient | None = None
        self._loop_id: int | None = None

    def get(self) -> httpx.AsyncClient:
        loop_id = id(asyncio.get_running_loop())
        if self._client is None or self._client.is_closed or self._loop_id != loop_id:
            old = self._client
            self._client = httpx.AsyncClient(**self._kwargs)
            self._loop_id = loop_id
            if old is not None and not old.is_closed:
                self._schedule_close(old)
        return self._client

    def _schedule_close(self, client: httpx.AsyncClient) -> None:
        """Best-effort async cleanup using public API only."""
        try:
            task = asyncio.get_running_loop().create_task(self._safe_close(client))
            task.add_done_callback(self._on_close_done)
        except RuntimeError:
            pass  # Loop closing — let GC handle it

    @staticmethod
    async def _safe_close(client: httpx.AsyncClient) -> None:
        try:
            await client.aclose()
        except Exception:
            pass  # Swallow: old loop may be dead, connection pool may be stale

    @staticmethod
    def _on_close_done(task: asyncio.Task) -> None:
        exc = task.exception() if not task.cancelled() else None
        if exc:
            logger.debug("httpx client cleanup exception (benign): %s", exc)

    async def close(self) -> None:
        """Explicit shutdown. Called from app lifespan."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._client = None
        self._loop_id = None
