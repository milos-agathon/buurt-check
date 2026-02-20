# Parallel Quadrant 3D Fetch — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce 3D neighborhood cold load from ~60-76s to under 30s by splitting the single sequential bbox fetch into 4 parallel quadrant queries at 120m radius.

**Architecture:** New `_fetch_bbox_parallel_quadrants()` function replaces `_fetch_bbox_paginated()` in the accelerated path. Conservative mode retains the old sequential path unchanged. Deduplication by pand_id merges quadrant results. Near-ring prefetch skipped in accelerated mode (redundant — subset of quadrant coverage). Frontend timeout unchanged at 90s (must support conservative mode's 80s budget).

**Tech Stack:** Python asyncio (parallel gather), httpx, Pydantic v2

**Shadow analysis trade-off:** Radius reduction from 150m to 120m reduces coverage area by 36% (90,000 sq-m to 57,600 sq-m). Probe data shows ~124 buildings at 120m vs ~180 at 150m for Amsterdam Centrum. This was an explicit design decision to guarantee sub-30s full-scene loads. Shadow analysis accuracy decreases slightly for buildings near the 120-150m fringe that are no longer included. Conservative mode (150m, sequential) remains available for shadow-critical use cases.

**Revision note (2026-02-20, v2):** Critical fix from Claude vs Codex adversarial review: replaced `asyncio.wait_for(asyncio.gather(...))` with `asyncio.wait(tasks, timeout=BBOX_FETCH_BUDGET)` in `_fetch_bbox_parallel_quadrants`. The original pattern discarded ALL completed quadrant results when the budget expired — if 3/4 quadrants finished in 34s and the 4th was slow, the `except asyncio.TimeoutError` branch returned `([], True)`, throwing away all successful data. The fix uses `asyncio.wait(tasks, timeout=BBOX_FETCH_BUDGET)` which returns `(done, pending)` sets, preserving results from completed quadrants while cancelling only pending ones. Added budget-timeout regression test to verify this behavior.

**Frontend timeout:** Stays at 90s (unchanged). The design doc Section 2 suggests reducing to 40s — this is INCORRECT. 90s must remain to support conservative mode's 80s budget + margin.

**Verified pre-conditions:** `_parse_bbox_page` exists in `three_d_bag.py` (verified by symbol name; line numbers shift as the file evolves). `import asyncio` is already present and this amendment also adds `import time` in the test file where `time.monotonic()` is used. Target fetch wall-clock is bounded by `TARGET_FETCH_BUDGET` (30s) via `_fetch_target_budgeted` wrapper. Without the budget, worst-case is `TARGET_FETCH_TIMEOUT(25s) * TARGET_FETCH_RETRIES(4) + backoff = ~101.5s`. This amendment bounds the target leg only; current `_fetch_bbox_resilient` fallback paths remain independently timed until parent Task 3 lands. See `2026-02-20-target-fetch-budget-fix.md`.

---

### Task 1: Add `_quadrant_bboxes` helper + tests

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (after line 25, constants section)
- Test: `backend/tests/test_three_d_bag.py`

**Step 1: Write the failing test**

In `backend/tests/test_three_d_bag.py`, update the import block (lines 9-17) to add `_quadrant_bboxes`:

```python
from app.services.three_d_bag import (
    _compute_building_orientation,
    _enrich_with_lod22,
    _extract_lod22_surfaces,
    _fetch_bbox_quick_context,
    _fetch_target_building,
    _parse_building,
    _quadrant_bboxes,
    get_neighborhood_3d,
)
```

Add test at end of file:

```python
# --- Quadrant bbox splitting tests ---


class TestQuadrantBboxes:
    def test_four_quadrants_tile_correctly(self):
        """4 quadrants should tile the full bbox with no gaps."""
        cx, cy, r = 121005.0, 487005.0, 120.0
        quads = _quadrant_bboxes(cx, cy, r)
        assert len(quads) == 4
        labels = {q[0] for q in quads}
        assert labels == {"NE", "NW", "SE", "SW"}

        ne = next(q for q in quads if q[0] == "NE")
        assert ne[1] == f"{cx:.0f},{cy:.0f},{cx + r:.0f},{cy + r:.0f}"

        nw = next(q for q in quads if q[0] == "NW")
        assert nw[1] == f"{cx - r:.0f},{cy:.0f},{cx:.0f},{cy + r:.0f}"

        se = next(q for q in quads if q[0] == "SE")
        assert se[1] == f"{cx:.0f},{cy - r:.0f},{cx + r:.0f},{cy:.0f}"

        sw = next(q for q in quads if q[0] == "SW")
        assert sw[1] == f"{cx - r:.0f},{cy - r:.0f},{cx:.0f},{cy:.0f}"

    def test_full_coverage_matches_single_bbox(self):
        """Union of 4 quadrant bboxes equals the original single bbox."""
        cx, cy, r = 121005.0, 487005.0, 120.0
        quads = _quadrant_bboxes(cx, cy, r)
        all_coords = []
        for _, bbox_str in quads:
            parts = [float(p) for p in bbox_str.split(",")]
            all_coords.append(parts)
        min_x = min(c[0] for c in all_coords)
        min_y = min(c[1] for c in all_coords)
        max_x = max(c[2] for c in all_coords)
        max_y = max(c[3] for c in all_coords)
        assert min_x == cx - r
        assert min_y == cy - r
        assert max_x == cx + r
        assert max_y == cy + r
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py::TestQuadrantBboxes -v`
Expected: FAIL with `ImportError: cannot import name '_quadrant_bboxes'`

**Step 3: Write minimal implementation**

Add to `backend/app/services/three_d_bag.py` after line 25 (after `TRANSIENT_STATUS_CODES`):

```python
def _quadrant_bboxes(
    cx: float, cy: float, r: float
) -> list[tuple[str, str]]:
    """Split a square bbox into 4 quadrant bboxes for parallel fetching."""
    return [
        ("NE", f"{cx:.0f},{cy:.0f},{cx + r:.0f},{cy + r:.0f}"),
        ("NW", f"{cx - r:.0f},{cy:.0f},{cx:.0f},{cy + r:.0f}"),
        ("SE", f"{cx:.0f},{cy - r:.0f},{cx + r:.0f},{cy:.0f}"),
        ("SW", f"{cx - r:.0f},{cy - r:.0f},{cx:.0f},{cy:.0f}"),
    ]
```

**Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py::TestQuadrantBboxes -v`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
cd backend && ruff check . && ruff format .
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "feat: add _quadrant_bboxes helper for parallel 3DBAG fetch"
```

---

### Task 2: Add `_fetch_bbox_parallel_quadrants` function + tests

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (after `_fetch_bbox_paginated`, ~line 447)
- Test: `backend/tests/test_three_d_bag.py`

**IMPORTANT — Test URL routing:** The bbox strings for adjacent quadrants share substrings (e.g., `"121005,487005"` appears in both NE `"bbox=121005,487005,121125,487125"` and SW `"bbox=120885,486885,121005,487005"`). All test `side_effect` functions MUST anchor matches with `"bbox="` prefix and trailing comma: `f"bbox={cx:.0f},{cy:.0f},"` to avoid mis-routing.

**Step 1: Write the failing tests**

Update import block to add `_fetch_bbox_parallel_quadrants`.

Add tests at end of file:

```python
# --- Parallel quadrant fetch tests ---


def _quadrant_route(center_x, center_y, radius, quadrant_responses):
    """Build a side_effect that routes bbox URLs to per-quadrant responses.

    quadrant_responses: dict mapping label ("NE","NW","SE","SW") to mock response.
    Uses bbox= prefix anchoring to avoid substring collisions between quadrants.
    """
    cx, cy, r = center_x, center_y, radius
    # Build exact bbox prefix for each quadrant
    bbox_prefixes = {
        "NE": f"bbox={cx:.0f},{cy:.0f},",
        "NW": f"bbox={cx - r:.0f},{cy:.0f},",
        "SE": f"bbox={cx:.0f},{cy - r:.0f},",
        "SW": f"bbox={cx - r:.0f},{cy - r:.0f},",
    }

    def side_effect(url, **kwargs):
        s_url = str(url)
        for label, prefix in bbox_prefixes.items():
            if prefix in s_url and label in quadrant_responses:
                resp = quadrant_responses[label]
                if isinstance(resp, Exception):
                    raise resp
                return resp
        return _make_mock_resp(_make_3dbag_response([]))

    return side_effect


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_merges_all_quadrants(mock_get_client):
    """All 4 quadrant results are merged into a single building list."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000001")])),
        "NW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")])),
        "SE": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000003")])),
        "SW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000004")])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert len(buildings) == 4
    ids = {b.pand_id for b in buildings}
    assert ids == {
        "0363100000000001", "0363100000000002",
        "0363100000000003", "0363100000000004",
    }
    assert partial is False


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_deduplicates(mock_get_client):
    """Building appearing in 2 adjacent quadrants is returned only once."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    shared_id = "0363100000000099"
    cx, cy, r = 121005.0, 487005.0, 120.0
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": _make_mock_resp(_make_3dbag_response([
            _make_feature("0363100000000001"),
            _make_feature(shared_id),
        ])),
        "NW": _make_mock_resp(_make_3dbag_response([
            _make_feature("0363100000000002"),
            _make_feature(shared_id),  # duplicate
        ])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    ids = [b.pand_id for b in buildings]
    assert ids.count(shared_id) == 1
    assert len(buildings) == 3


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_partial_on_one_failure(mock_get_client):
    """If one quadrant fails, return partial=True with buildings from other 3."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": httpx.TimeoutException("read timeout"),
        "NW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")])),
        "SE": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000003")])),
        "SW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000004")])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert partial is True
    assert len(buildings) == 3
    ids = {b.pand_id for b in buildings}
    assert "0363100000000002" in ids
    assert "0363100000000003" in ids
    assert "0363100000000004" in ids


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_all_fail(mock_get_client):
    """If all quadrants fail, return empty + partial=True."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    mock_client.get.side_effect = httpx.TimeoutException("total failure")

    buildings, partial = await _fetch_bbox_parallel_quadrants(121005.0, 487005.0, 120.0)

    assert buildings == []
    assert partial is True


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_partial_when_has_next_page(mock_get_client):
    """Quadrant with more pages signals partial=True even though fetch succeeded."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0
    resp_with_next = _make_3dbag_response(
        [_make_feature("0363100000000001")],
        next_link="https://api.3dbag.nl/collections/pand/items?offset=101",
    )
    mock_client.get.side_effect = _quadrant_route(cx, cy, r, {
        "NE": _make_mock_resp(resp_with_next),
        "NW": _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")])),
        "SE": _make_mock_resp(_make_3dbag_response([])),
        "SW": _make_mock_resp(_make_3dbag_response([])),
    })

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert partial is True  # NE had more pages
    assert len(buildings) == 2


@pytest.mark.asyncio
@patch("app.services.three_d_bag.BBOX_FETCH_BUDGET", 0.05)
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_budget_preserves_completed(mock_get_client):
    """Budget timeout should keep completed quadrant data instead of dropping all."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    cx, cy, r = 121005.0, 487005.0, 120.0

    async def side_effect(url, **kwargs):
        s_url = str(url)
        # Make NE slow so it stays pending past budget; others return quickly.
        if f"bbox={cx:.0f},{cy:.0f}," in s_url:
            await asyncio.sleep(0.2)
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000001")]))
        if f"bbox={cx - r:.0f},{cy:.0f}," in s_url:
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")]))
        if f"bbox={cx:.0f},{cy - r:.0f}," in s_url:
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000003")]))
        if f"bbox={cx - r:.0f},{cy - r:.0f}," in s_url:
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000004")]))
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    buildings, partial = await _fetch_bbox_parallel_quadrants(cx, cy, r)

    assert partial is True
    # 3 fast quadrants should still be returned even when one timed out.
    assert len(buildings) == 3
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py::test_fetch_bbox_parallel_quadrants_merges_all_quadrants -v`
Expected: FAIL with `ImportError`

**Step 3: Write implementation**

Add to `backend/app/services/three_d_bag.py` after `_fetch_bbox_paginated` (after line 446):

```python
async def _fetch_single_quadrant(
    center_x: float,
    center_y: float,
    bbox_str: str,
    label: str,
) -> tuple[list[BuildingBlock], bool]:
    """Fetch a single quadrant bbox page.

    Returns (buildings, partial). partial=True if fetch failed or page has more results.
    """
    client = _get_client()
    url = (
        f"{settings.three_d_bag_base}/collections/pand/items"
        f"?bbox={bbox_str}&limit={BBOX_PAGE_LIMIT}"
    )
    try:
        data = await _get_json_with_retries(
            client,
            url,
            timeout=httpx.Timeout(BBOX_PAGE_TIMEOUT, connect=3.0),
            attempts=BBOX_FETCH_RETRIES,
        )
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.warning("Quadrant %s fetch failed: %s", label, exc)
        return [], True

    buildings = _parse_bbox_page(data, center_x, center_y)
    has_next = any(link.get("rel") == "next" for link in data.get("links", []))
    if has_next:
        logger.info("Quadrant %s has more pages (not fetched)", label)
    return buildings, has_next


async def _fetch_bbox_parallel_quadrants(
    center_x: float, center_y: float, radius: float
) -> tuple[list[BuildingBlock], bool]:
    """Fetch surrounding buildings via 4 parallel quadrant bbox queries.

    Splits the square bbox into NE/NW/SE/SW quadrants, fetches all 4
    concurrently (single page each), then deduplicates by pand_id.
    Enforces BBOX_FETCH_BUDGET as an outer timeout guard.
    """
    quadrants = _quadrant_bboxes(center_x, center_y, radius)
    start = time.monotonic()
    tasks = [
        asyncio.create_task(_fetch_single_quadrant(center_x, center_y, bbox_str, label))
        for label, bbox_str in quadrants
    ]
    done, pending = await asyncio.wait(tasks, timeout=BBOX_FETCH_BUDGET)

    partial = False
    if pending:
        partial = True
        logger.warning(
            "Parallel quadrant fetch hit budget (done=%d pending=%d of %d)",
            len(done),
            len(pending),
            len(tasks),
        )
        for task in pending:
            task.cancel()

    seen_ids: set[str] = set()
    buildings: list[BuildingBlock] = []
    results: list[tuple[list[BuildingBlock], bool]] = []
    for task in done:
        try:
            results.append(task.result())
        except Exception as exc:
            logger.warning("Quadrant fetch exception: %s", exc)
            partial = True
    for quadrant_buildings, quadrant_partial in results:
        if quadrant_partial:
            partial = True
        for b in quadrant_buildings:
            if b.pand_id not in seen_ids:
                seen_ids.add(b.pand_id)
                buildings.append(b)

    duration = time.monotonic() - start
    logger.info(
        "Parallel quadrant fetch: %d buildings in %.2fs (4 quadrants)%s",
        len(buildings),
        duration,
        " [partial]" if partial else "",
    )
    return buildings, partial
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py -k "parallel_quadrants" -v`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
cd backend && ruff check . && ruff format .
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "feat: add _fetch_bbox_parallel_quadrants with dedup, budget guard, and partial signaling"
```

---

### Task 3: Update accelerated constants + wire parallel path into `_fetch_bbox_resilient`

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (lines 44-60 accelerated constants, `_fetch_bbox_resilient` at line 508)

**Step 1: Update accelerated mode constants**

Change lines 44-60 in `three_d_bag.py`. Only `DEFAULT_RADIUS`, `BBOX_MAX_PAGES`, `BBOX_FETCH_BUDGET`, `BBOX_PAGE_TIMEOUT`, and `BBOX_FETCH_RETRIES` change. Keep the rest:

```python
else:
    # Accelerated mode defaults — parallel quadrant strategy.
    DEFAULT_RADIUS = 120.0
    BBOX_MAX_PAGES = 1
    BBOX_FETCH_BUDGET = 35.0
    BBOX_PAGE_TIMEOUT = 30.0
    TARGET_FETCH_RETRIES = 4
    BBOX_FETCH_RETRIES = 4
    RETRY_BACKOFF_BASE = 0.25
    FALLBACK_PAGE_TIMEOUT = 30.0
    NEARBY_CONTEXT_MIN_RADIUS = 100.0
    NEARBY_CONTEXT_TIMEOUT = 30.0
    NEARBY_CONTEXT_MAX_PAGES = 3
    IMMEDIATE_CONTEXT_TIMEOUT = 15.0
    PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS = 3.0
    PRIMARY_WAIT_AFTER_BACKUP_SECONDS = 8.0
    TARGET_FETCH_TIMEOUT = 25.0
```

Note: `BBOX_FETCH_RETRIES` reduced from 6 to 4 — with 4 parallel quadrants, each retrying 4 times at 30s timeout, worst-case per-quadrant is ~120s, but the `BBOX_FETCH_BUDGET=35s` outer `wait_for` will cancel all before that.

**Step 2: Replace `_fetch_bbox_resilient` with full code**

Replace the entire function (lines 508-578) with:

```python
async def _fetch_bbox_resilient(
    center_x: float,
    center_y: float,
    radius: float,
) -> tuple[list[BuildingBlock], bool]:
    """Fetch neighborhood context with a fast backup path to avoid target-only drops."""
    # Accelerated mode: use parallel quadrant strategy (no sequential pagination).
    if not settings.three_d_conservative_mode:
        return await _fetch_bbox_parallel_quadrants(center_x, center_y, radius)

    # Conservative mode: original sequential paginated fetch with backup.
    backup_radius = max(FALLBACK_MIN_RADIUS, radius * FALLBACK_RADIUS_FACTOR)
    primary_task = asyncio.create_task(_fetch_bbox_paginated(center_x, center_y, radius))
    backup_task = asyncio.create_task(_fetch_bbox_quick_context(center_x, center_y, backup_radius))

    done, _pending = await asyncio.wait(
        {primary_task, backup_task},
        return_when=asyncio.FIRST_COMPLETED,
    )
    first_task = next(iter(done))

    if first_task is primary_task:
        primary_buildings, primary_partial = _task_result_or_partial(primary_task)
        if primary_buildings:
            backup_task.cancel()
            return primary_buildings, primary_partial
        backup_buildings, backup_partial = await backup_task
        if not backup_buildings:
            secondary_buildings, secondary_partial = await _fetch_bbox_quick_context(
                center_x,
                center_y,
                SECONDARY_FALLBACK_RADIUS,
            )
            if secondary_buildings:
                return secondary_buildings, True
            return [], primary_partial or backup_partial or secondary_partial
        return backup_buildings, primary_partial or backup_partial

    backup_buildings, backup_partial = _task_result_or_partial(backup_task)

    wait_timeout = (
        PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS
        if not backup_buildings
        else PRIMARY_WAIT_AFTER_BACKUP_SECONDS
    )
    try:
        primary_buildings, primary_partial = await asyncio.wait_for(
            primary_task,
            timeout=wait_timeout,
        )
    except asyncio.TimeoutError:
        primary_task.cancel()
        primary_buildings, primary_partial = [], True
    except Exception:
        primary_task.cancel()
        primary_buildings, primary_partial = [], True

    if len(primary_buildings) >= len(backup_buildings):
        if primary_buildings:
            return primary_buildings, primary_partial
    if backup_buildings:
        return backup_buildings, backup_partial or True

    secondary_buildings, secondary_partial = await _fetch_bbox_quick_context(
        center_x,
        center_y,
        SECONDARY_FALLBACK_RADIUS,
    )
    if secondary_buildings:
        return secondary_buildings, True
    return [], backup_partial or primary_partial or secondary_partial
```

**Step 3: Skip near-ring prefetch in accelerated mode**

In `_get_neighborhood_3d_impl` (line 626), the near-ring prefetch at `near_radius = max(radius * 0.9, 100) = 108m` is a strict subset of the 120m quadrant coverage. Skip it in accelerated mode to avoid a wasted HTTP request:

Replace lines 636-646:

```python
    """Fetch 3D building data from 3DBAG for the neighborhood around a point."""
    near_task: asyncio.Task | None = None
    if settings.three_d_conservative_mode:
        # Near-ring prefetch only useful in conservative mode where bbox is paginated.
        # In accelerated mode, parallel quadrants already cover the full radius.
        near_radius = max(radius * 0.9, NEARBY_CONTEXT_MIN_RADIUS)
        near_task = asyncio.create_task(
            _fetch_bbox_quick_context(
                rd_x,
                rd_y,
                near_radius,
                limit=NEARBY_CONTEXT_LIMIT,
                timeout_s=NEARBY_CONTEXT_TIMEOUT,
                max_pages=NEARBY_CONTEXT_MAX_PAGES,
            )
        )
```

Then update the near-ring await block (around line 668-674) to handle the None case:

```python
    near_buildings: list[BuildingBlock] = []
    near_partial = False
    if near_task is not None:
        try:
            near_buildings, near_partial = await near_task
        except Exception:
            near_buildings, near_partial = [], True
```

**Step 4: Run the full test suite and fix breaking tests**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py -v`

The following tests will break and need updating:

**A. `test_accelerated_mode_constants_within_latency_bounds` (line 1364)**

Replace with:

```python
def test_accelerated_mode_constants_within_latency_bounds():
    """Accelerated defaults must stay within latency-safe bounds."""
    import app.services.three_d_bag as mod

    if mod.settings.three_d_conservative_mode:
        pytest.skip("Only applies in accelerated mode")

    assert mod.BBOX_MAX_PAGES <= 1
    assert mod.BBOX_FETCH_BUDGET <= 35.0
    assert mod.BBOX_FETCH_RETRIES <= 4
    assert mod.DEFAULT_RADIUS <= 120.0
```

**B. `test_default_radius_produces_150m_bbox_url` (line 1379)**

This test asserts a single 150m bbox URL which no longer exists. Replace with a test that verifies quadrant URLs are produced:

```python
@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_default_radius_produces_quadrant_bbox_urls(mock_get_client):
    """Accelerated mode should produce 4 quadrant bbox URLs at 120m radius."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    seen_urls: list[str] = []
    bbox_resp = _make_3dbag_response([_make_feature("0363100000000001")])

    def side_effect(url, **kwargs):
        s_url = str(url)
        seen_urls.append(s_url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    import app.services.three_d_bag as mod
    if mod.settings.three_d_conservative_mode:
        pytest.skip("Only applies in accelerated mode")

    await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    bbox_urls = [u for u in seen_urls if "bbox=" in u]
    # Should have 4 quadrant bbox URLs (no near-ring in accelerated mode)
    assert len(bbox_urls) == 4
    # Verify quadrant pattern: center is (121005, 487005), radius 120
    assert any("bbox=121005,487005," in u for u in bbox_urls)  # NE
    assert any("bbox=120885,487005," in u for u in bbox_urls)  # NW
    assert any("bbox=121005,486885," in u for u in bbox_urls)  # SE
    assert any("bbox=120885,486885," in u for u in bbox_urls)  # SW
```

**C. `test_get_neighborhood_3d_prefetches_near_ring_without_duping_context` (line 578)**

Near-ring is now skipped in accelerated mode. Rename and update to verify no near-ring request is made:

```python
@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_accelerated_mode_skips_near_ring_prefetch(mock_get_client):
    """Near-ring prefetch is skipped in accelerated mode (redundant with quadrants)."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    import app.services.three_d_bag as mod
    if mod.settings.three_d_conservative_mode:
        pytest.skip("Only applies in accelerated mode")

    bbox_resp = _make_3dbag_response([
        _make_feature("0363100000000001"),
        _make_feature("0363100000000002"),
    ])
    seen_urls: list[str] = []

    def side_effect(url, **kwargs):
        s_url = str(url)
        seen_urls.append(s_url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )

    # No near-ring URL (108m radius) should appear — only quadrant URLs
    near_ring_urls = [u for u in seen_urls if "bbox=120897,486897" in u]
    assert len(near_ring_urls) == 0
    assert len(result.buildings) >= 1
```

**D. `test_get_neighborhood_3d_fetches_bbox_next_page` (line 662)**

Sequential pagination is only used in conservative mode. Skip this test in accelerated mode:

Add at the top of the test function:

```python
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Sequential pagination only applies in conservative mode")
```

**E. `test_fetch_bbox_partial_failure` (line 992)**

Same as D — sequential second-page timeout is conservative-mode-only:

Add at the top of the test function:

```python
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Sequential pagination only applies in conservative mode")
```

**F. `test_fetch_bbox_fallback_returns_context_after_first_page_timeout` (line 1037)**

Same — backup/fallback resilience is conservative-mode-only:

Add at the top:

```python
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Resilient backup path only applies in conservative mode")
```

**G. `test_get_neighborhood_3d_keeps_completed_near_ring_context_when_bbox_has_context` (line 618)**

Near-ring is skipped in accelerated mode. Add skip:

```python
    import app.services.three_d_bag as mod
    if not mod.settings.three_d_conservative_mode:
        pytest.skip("Near-ring prefetch only applies in conservative mode")
```

**Step 5: Add conservative-mode fallback test**

```python
@pytest.mark.asyncio
@patch("app.services.three_d_bag.settings")
@patch("app.services.three_d_bag._get_client")
async def test_conservative_mode_uses_sequential_path(mock_get_client, mock_settings):
    """Conservative mode should use sequential _fetch_bbox_paginated, not parallel quadrants."""
    mock_settings.three_d_conservative_mode = True
    mock_settings.enable_lod22_roofs = True
    mock_settings.enable_lod22_context_enrichment = False
    mock_settings.three_d_bag_base = "https://api.3dbag.nl"

    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    seen_urls: list[str] = []
    bbox_resp = _make_3dbag_response([_make_feature("0363100000000001")])

    def side_effect(url, **kwargs):
        s_url = str(url)
        seen_urls.append(s_url)
        if "NL.IMBAG.Pand." in s_url:
            match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
            assert match is not None
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
        radius=150.0,
    )

    # Conservative should produce ONE large bbox URL (sequential), not 4 quadrants.
    # Bbox at 150m: 120855,486855,121155,487155 (with limit=100)
    bbox_urls = [u for u in seen_urls if "bbox=" in u and "limit=100" in u]
    assert len(bbox_urls) >= 1
    assert any("bbox=120855,486855,121155,487155" in u for u in bbox_urls)
    assert result.buildings is not None
```

**Step 6: Run full test suite**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py -v`
Expected: All tests PASS

**Step 7: Run ruff**

Run: `cd backend && ruff check . && ruff format .`
Expected: Clean

**Step 8: Commit**

```bash
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "feat: wire parallel quadrant fetch into accelerated mode, skip redundant near-ring"
```

---

### Task 4: Bump cache version v25 -> v26

**Files:**
- Modify: `backend/app/api/address.py` (line 237)

**Step 1: Update cache key**

Change line 237 in `backend/app/api/address.py`:

```python
# Before:
cache_key = f"neighborhood3d:v25:{mode}:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"

# After:
cache_key = f"neighborhood3d:v26:{mode}:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
```

**Step 2: Run affected API tests**

Run: `cd backend && python -m pytest tests/test_address_api.py -k "neighborhood3d" -v`
Expected: PASS (update any tests that assert on the version string)

**Step 3: Run ruff**

Run: `cd backend && ruff check . && ruff format .`

**Step 4: Commit**

```bash
git add backend/app/api/address.py
git commit -m "chore: bump neighborhood3d cache version to v26 for parallel quadrant fetch"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `backend/CLAUDE.md` (3DBAG section)

**Step 1: Update scope mode docs**

In `backend/CLAUDE.md`, update the 3DBAG section to reflect:

- Accelerated (default): "4 parallel quadrant queries at 120m radius, 1 page each, budget 35s. ~120-150 buildings. Near-ring prefetch skipped (redundant with quadrant coverage)."
- Conservative: "bbox radius 150m, max pages 5, budget 80s. ~150-250 buildings. Sequential pagination with backup fallback." (fix: was incorrectly listed as "3 pages/50s" in some docs)
- Cache version: v26
- Frontend timeout: "90s — unchanged, must support conservative mode's 80s budget"

**Step 2: Commit**

```bash
cd backend && ruff check . && ruff format .
git add backend/CLAUDE.md
git commit -m "docs: update 3DBAG scope modes for parallel quadrant fetch"
```

---

### Task 6: Run full test suites + quality gates

**Step 1: Backend tests**

Run: `cd backend && python -m pytest -x -q -m "not live"`
Expected: 432+ tests PASS

**Step 2: Ruff**

Run: `cd backend && ruff check . && ruff format .`
Expected: Clean

**Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: Clean (no frontend code changes — timeout stays at 90s)

**Step 4: Frontend tests**

Run: `cd frontend && npm run test`
Expected: 448+ tests PASS

---

### Task 7: Manual live verification

**Step 1: Start backend**

Run: `cd backend && uvicorn app.main:app --reload --port 8000`

**Step 2: Test with curl (accelerated mode)**

```bash
curl -w "\nTotal time: %{time_total}s\n" \
  "http://localhost:8000/api/address/0363010000696734/neighborhood3d?pand_id=0363100012253924&rd_x=121387&rd_y=487373&lat=52.3745&lng=4.8957"
```

Expected: Response in ~26-29s (cold) with ~120+ buildings. Verify `buildings` array is non-empty and `target_pand_id` is set.

**Step 3: Verify conservative rollback**

Set `BUURT_THREE_D_CONSERVATIVE_MODE=True` in environment, restart backend, repeat curl. Should take ~50-70s (old sequential behavior) and the frontend 90s timeout should not abort.

**Step 4: Test a second location (Rotterdam)**

```bash
curl -w "\nTotal time: %{time_total}s\n" \
  "http://localhost:8000/api/address/0599010000507306/neighborhood3d?pand_id=0599100000652918&rd_x=92365&rd_y=437943&lat=51.9225&lng=4.4792"
```

Expected: Response with buildings in similar timeframe. Confirms approach generalizes beyond Amsterdam.

---

## Adversarial review findings (2026-02-20)

Consolidated findings from Claude and Codex adversarial reviews.

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | **Budget timeout loses completed data** — `asyncio.wait_for(asyncio.gather(...))` discards all results on timeout | CRITICAL | Replaced with `asyncio.wait(tasks, timeout=BBOX_FETCH_BUDGET)` which returns `(done, pending)` sets. Completed quadrant results are always preserved. New regression test `test_fetch_bbox_parallel_quadrants_budget_preserves_completed` verifies this. **Note:** The conservative-mode path in `_fetch_bbox_resilient` (Task 3, Step 2) retains `asyncio.wait_for(primary_task, timeout=wait_timeout)` — this is intentional and correct. It waits on a SINGLE already-running task with a short grace period, not a gather of multiple tasks, so the data-loss problem does not apply. |
| 2 | **Conservative-mode test uses accelerated constants** — module constants resolved at import time, patching settings at runtime doesn't change them | LOW (pre-existing) | Pre-existing architectural limitation across all module-level constant tests. The conservative-mode fallback test (Step 5) explicitly patches `mock_settings` and tests the routing decision, not constant values. Not a blocker for this plan. |
| 3 | **Timeout chain not end-to-end bounded** — target fetch has no outer wall-clock guard | **CRITICAL (partially fixed)** | Original analysis was wrong: worst-case is 101.5s, not 33s (`25s × 4 attempts + backoff`). Fixed for the target leg by adding `TARGET_FETCH_BUDGET=30s` and `_fetch_target_budgeted()` wrapper using `asyncio.wait_for`. Current HEAD still relies on `_fetch_bbox_resilient`, whose backup/secondary fallback paths are not covered by `BBOX_FETCH_BUDGET`, so end-to-end gather wall-clock is not yet strictly bounded. Parent Task 3 completes the end-to-end bound (35s target once quadrant-budget path is active). See `2026-02-20-target-fetch-budget-fix.md`. |
| 4 | **Conservative test coverage reduced** — 4 tests skip in accelerated mode | MEDIUM | Inherent to mode-specific behavior. Tests D, E, F, G test sequential pagination which only exists in conservative mode. The new parallel quadrant tests (6 tests) cover the accelerated path. Net coverage INCREASES (6 new > 4 skipped). |
| 5 | **Upstream fan-out risk** — 4 quadrants × 4 retries = 16 potential requests | LOW | Worth monitoring but not a blocker. Each quadrant has its own error handling. The 35s budget caps total wall-clock regardless of retry count. Log message includes quadrant label for debugging. |
| 6 | **`_parse_bbox_page` existence** — called but not verified | RESOLVED | Verified: symbol exists in `three_d_bag.py` and is already used by `_fetch_bbox_paginated`. |
| 7 | **Frontend timeout contradicts design doc** | RESOLVED | Design doc Section 2 says "90s -> 40s" but impl plan correctly keeps 90s. Added explicit note in plan header. 90s must remain for conservative mode's 80s budget + margin. |
| 8 | **Cache key lat/lng audit** | LOW (pre-existing) | Pre-existing pattern. Not introduced by this plan. |
