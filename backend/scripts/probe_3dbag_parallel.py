"""
Probe 3DBAG API for parallel request tolerance.

Tests 4-quadrant and 2-half parallel bbox strategies against a sequential baseline.

Usage:
    python backend/scripts/probe_3dbag_parallel.py
"""

import asyncio
import time

import httpx

# Amsterdam Centrum -- Damrak 1 (known baseline: 77s/167 buildings at 150m)
CENTER_X = 121387.0
CENTER_Y = 487373.0
RADIUS = 120.0
BASE_URL = "https://api.3dbag.nl/collections/pand/items"
PAGE_LIMIT = 100


def _quadrant_bboxes(cx: float, cy: float, r: float) -> list[tuple[str, str]]:
    """Split a square bbox into 4 quadrant bboxes."""
    return [
        ("NE", f"{cx:.0f},{cy:.0f},{cx + r:.0f},{cy + r:.0f}"),
        ("NW", f"{cx - r:.0f},{cy:.0f},{cx:.0f},{cy + r:.0f}"),
        ("SE", f"{cx:.0f},{cy - r:.0f},{cx + r:.0f},{cy:.0f}"),
        ("SW", f"{cx - r:.0f},{cy - r:.0f},{cx:.0f},{cy:.0f}"),
    ]


def _half_bboxes(cx: float, cy: float, r: float) -> list[tuple[str, str]]:
    """Split a square bbox into 2 halves (north/south)."""
    return [
        ("NORTH", f"{cx - r:.0f},{cy:.0f},{cx + r:.0f},{cy + r:.0f}"),
        ("SOUTH", f"{cx - r:.0f},{cy - r:.0f},{cx + r:.0f},{cy:.0f}"),
    ]


async def _fetch_bbox(
    client: httpx.AsyncClient, label: str, bbox: str
) -> dict:
    """Fetch one bbox and return timing + result metadata."""
    url = f"{BASE_URL}?bbox={bbox}&limit={PAGE_LIMIT}"
    t0 = time.monotonic()
    try:
        resp = await client.get(url, timeout=httpx.Timeout(45.0, connect=5.0))
        elapsed = time.monotonic() - t0
        if resp.status_code == 200:
            data = resp.json()
            n_features = len(data.get("features", []))
            has_next = any(
                link.get("rel") == "next"
                for link in data.get("links", [])
            )
            return {
                "label": label,
                "status": 200,
                "elapsed_s": round(elapsed, 2),
                "buildings": n_features,
                "has_next_page": bool(has_next),
            }
        else:
            return {
                "label": label,
                "status": resp.status_code,
                "elapsed_s": round(elapsed, 2),
                "buildings": 0,
                "has_next_page": False,
                "error": resp.text[:200],
            }
    except Exception as exc:
        elapsed = time.monotonic() - t0
        return {
            "label": label,
            "status": "error",
            "elapsed_s": round(elapsed, 2),
            "buildings": 0,
            "has_next_page": False,
            "error": str(exc)[:200],
        }


async def _run_single(client: httpx.AsyncClient) -> dict:
    """Baseline: single full-bbox request."""
    bbox = (
        f"{CENTER_X - RADIUS:.0f},{CENTER_Y - RADIUS:.0f},"
        f"{CENTER_X + RADIUS:.0f},{CENTER_Y + RADIUS:.0f}"
    )
    return await _fetch_bbox(client, "FULL", bbox)


async def _run_parallel(
    client: httpx.AsyncClient, bboxes: list[tuple[str, str]]
) -> list[dict]:
    """Fire N bbox requests in parallel, return all results."""
    t0 = time.monotonic()
    results = await asyncio.gather(
        *[_fetch_bbox(client, label, bbox) for label, bbox in bboxes]
    )
    wall_clock = round(time.monotonic() - t0, 2)
    for r in results:
        r["wall_clock_s"] = wall_clock
    return list(results)


def _print_results(results: list[dict], baseline_elapsed: float) -> None:
    total_buildings = sum(r["buildings"] for r in results)
    wall_clock = results[0].get("wall_clock_s", 0)

    for r in results:
        status_str = (
            f"HTTP {r['status']}" if isinstance(r["status"], int) else r["status"]
        )
        extra = f" ERROR: {r.get('error', '')}" if r.get("error") else ""
        next_str = " [more pages]" if r.get("has_next_page") else ""
        print(
            f"  {r['label']}: {status_str}, "
            f"{r['buildings']} bldgs, "
            f"{r['elapsed_s']}s{next_str}{extra}"
        )

    print(f"  Total buildings: {total_buildings}")
    print(f"  Wall clock: {wall_clock}s")

    max_elapsed = max(r["elapsed_s"] for r in results)
    any_errors = any(r["status"] != 200 for r in results)
    if any_errors:
        print("  [!] SOME REQUESTS FAILED -- possible throttling")
    elif max_elapsed > baseline_elapsed * 1.5:
        print(
            f"  [!] Slowest ({max_elapsed}s) > 1.5x baseline "
            f"({baseline_elapsed}s) -- possible contention"
        )
    else:
        print("  [OK] All returned within normal range")


async def main():
    print("=" * 60)
    print("3DBAG Parallel Request Probe")
    print(f"Center: ({CENTER_X}, {CENTER_Y}), Radius: {RADIUS}m")
    print("=" * 60)

    async with httpx.AsyncClient() as client:
        # Baseline
        print("\n--- Baseline: Single full-bbox request ---")
        baseline = await _run_single(client)
        print(f"  Status: {baseline['status']}")
        print(f"  Buildings: {baseline['buildings']}")
        print(f"  Has next page: {baseline['has_next_page']}")
        print(f"  Elapsed: {baseline['elapsed_s']}s")
        base_t = baseline["elapsed_s"]

        # 4-quadrant trials
        for trial in range(1, 4):
            print(f"\n--- Trial {trial}: 4 parallel quadrants ---")
            await asyncio.sleep(5)
            quads = _quadrant_bboxes(CENTER_X, CENTER_Y, RADIUS)
            results = await _run_parallel(client, quads)
            _print_results(results, base_t)

        # 2-half trials
        for trial in range(1, 4):
            print(f"\n--- Trial {trial}: 2 parallel halves ---")
            await asyncio.sleep(5)
            halves = _half_bboxes(CENTER_X, CENTER_Y, RADIUS)
            results = await _run_parallel(client, halves)
            _print_results(results, base_t)

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
