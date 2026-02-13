"""Bounded product metrics with in-memory storage.

Counters and latency histograms for operational visibility.
Gated behind BUURT_METRICS_ENABLED config flag (defaults to False).
"""

from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock

MAX_LATENCY_SAMPLES = 1000

_counters: dict[str, int] = defaultdict(int)
_latencies: dict[str, deque] = defaultdict(
    lambda: deque(maxlen=MAX_LATENCY_SAMPLES)
)
_lock = Lock()


def inc(name: str, amount: int = 1) -> None:
    """Increment a counter by name."""
    with _lock:
        _counters[name] += amount


def record_latency(name: str, ms: float) -> None:
    """Record a latency sample (milliseconds)."""
    with _lock:
        _latencies[name].append(ms)


def snapshot() -> dict:
    """Return a snapshot of all counters and latency percentiles."""
    with _lock:
        counters = dict(_counters)
        latencies = {}
        for name, samples in _latencies.items():
            if not samples:
                continue
            sorted_samples = sorted(samples)
            n = len(sorted_samples)
            latencies[name] = {
                "count": n,
                "p50": sorted_samples[int(n * 0.5)],
                "p95": sorted_samples[min(int(n * 0.95), n - 1)],
                "p99": sorted_samples[min(int(n * 0.99), n - 1)],
            }
    return {"counters": counters, "latencies": latencies}


def reset() -> None:
    """Reset all metrics. Used in tests."""
    with _lock:
        _counters.clear()
        _latencies.clear()
