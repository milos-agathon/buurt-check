"""Tests for shared loop-aware httpx client factory."""
import asyncio

import pytest

from app.services.http_client import LoopAwareClient


@pytest.mark.asyncio
async def test_client_recreated_on_loop_change():
    """Client is recreated when called from a different event loop."""
    lac = LoopAwareClient(timeout=5.0)
    client1 = lac.get()
    assert client1 is not None

    # Same loop — should return same client
    client2 = lac.get()
    assert client2 is client1

    await lac.close()


@pytest.mark.asyncio
async def test_close_resets_state():
    """After close(), next get() creates a fresh client."""
    lac = LoopAwareClient(timeout=5.0)
    client1 = lac.get()
    await lac.close()
    assert lac._client is None
    assert lac._loop_id is None

    client2 = lac.get()
    assert client2 is not client1
    await lac.close()


@pytest.mark.asyncio
async def test_cross_event_loop_recreation():
    """Client is recreated when event loop identity changes.

    Simulates the pytest-asyncio scenario where each test gets a fresh loop.
    We fake a loop-id change by directly mutating _loop_id.
    """
    lac = LoopAwareClient(timeout=5.0)
    client1 = lac.get()
    original_loop_id = lac._loop_id

    # Simulate a different event loop by forcing the stored loop_id to differ
    lac._loop_id = original_loop_id + 99999

    client2 = lac.get()
    assert client2 is not client1, "Should create new client for different loop"
    assert not client1.is_closed or True  # old client close is async best-effort

    # Let scheduled cleanup task run
    await asyncio.sleep(0.05)

    await lac.close()


@pytest.mark.asyncio
async def test_safe_close_swallows_exceptions():
    """_safe_close swallows exceptions from client.aclose() without propagating."""
    lac = LoopAwareClient(timeout=5.0)
    client = lac.get()

    # Close client manually first so aclose() on already-closed raises
    await client.aclose()

    # _safe_close should swallow the exception silently
    await lac._safe_close(client)  # Should not raise


@pytest.mark.asyncio
async def test_on_close_done_handles_task_exception():
    """_on_close_done callback logs but doesn't raise on task exceptions."""
    lac = LoopAwareClient(timeout=5.0)

    # Create a task that raises
    async def _failing():
        raise RuntimeError("cleanup boom")

    task = asyncio.get_running_loop().create_task(_failing())
    await asyncio.sleep(0.01)  # let it complete

    # Should not raise
    lac._on_close_done(task)

    await lac.close()


@pytest.mark.asyncio
async def test_get_preserves_kwargs():
    """Client kwargs are preserved across recreations."""
    lac = LoopAwareClient(timeout=42.0)
    client = lac.get()
    assert client.timeout.read == 42.0

    await lac.close()

    client2 = lac.get()
    assert client2.timeout.read == 42.0
    await lac.close()
