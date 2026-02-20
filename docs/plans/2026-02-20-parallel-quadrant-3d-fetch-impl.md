# Parallel Quadrant 3D Fetch — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce 3D neighborhood cold load from ~60-76s to under 30s by splitting the single sequential bbox fetch into 4 parallel quadrant queries at 120m radius.

**Architecture:** New `_fetch_bbox_parallel_quadrants()` function replaces `_fetch_bbox_paginated()` in the accelerated path. Conservative mode retains the old sequential path. Deduplication by pand_id merges quadrant results. Frontend timeout reduced to match.

**Tech Stack:** Python asyncio (parallel gather), httpx, Pydantic v2, Vitest

---

### Task 1: Add `_quadrant_bboxes` helper + tests

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (after line 25, constants section)
- Test: `backend/tests/test_three_d_bag.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_three_d_bag.py` after the imports (line 17), add the new import:

```python
from app.services.three_d_bag import (
    _compute_building_orientation,
    _enrich_with_lod22,
    _extract_lod22_surfaces,
    _fetch_bbox_quick_context,
    _fetch_target_building,
    _parse_building,
    _quadrant_bboxes,  # NEW
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

        # NE quadrant: center to +radius in both axes
        ne = next(q for q in quads if q[0] == "NE")
        assert ne[1] == f"{cx:.0f},{cy:.0f},{cx + r:.0f},{cy + r:.0f}"

        # NW quadrant: -radius to center on X, center to +radius on Y
        nw = next(q for q in quads if q[0] == "NW")
        assert nw[1] == f"{cx - r:.0f},{cy:.0f},{cx:.0f},{cy + r:.0f}"

        # SE quadrant: center to +radius on X, -radius to center on Y
        se = next(q for q in quads if q[0] == "SE")
        assert se[1] == f"{cx:.0f},{cy - r:.0f},{cx + r:.0f},{cy:.0f}"

        # SW quadrant: -radius to center in both axes
        sw = next(q for q in quads if q[0] == "SW")
        assert sw[1] == f"{cx - r:.0f},{cy - r:.0f},{cx:.0f},{cy:.0f}"

    def test_full_coverage_matches_single_bbox(self):
        """Union of 4 quadrant bboxes equals the original single bbox."""
        cx, cy, r = 121005.0, 487005.0, 120.0
        quads = _quadrant_bboxes(cx, cy, r)
        # Parse all bbox strings into (x0, y0, x1, y1)
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
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "feat: add _quadrant_bboxes helper for parallel 3DBAG fetch"
```

---

### Task 2: Add `_fetch_bbox_parallel_quadrants` function + tests

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (after `_fetch_bbox_paginated`, ~line 447)
- Test: `backend/tests/test_three_d_bag.py`

**Step 1: Write the failing tests**

Add import at top of test file:

```python
from app.services.three_d_bag import (
    ...
    _fetch_bbox_parallel_quadrants,  # NEW
    ...
)
```

Add tests at end of file:

```python
# --- Parallel quadrant fetch tests ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_merges_all_quadrants(mock_get_client):
    """All 4 quadrant results are merged into a single building list."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    # Each quadrant returns a different building
    def side_effect(url, **kwargs):
        s_url = str(url)
        if "121005,487005" in s_url:  # NE
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000001")]))
        if "120885,487005" in s_url:  # NW
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000002")]))
        if "121005,486885" in s_url:  # SE
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000003")]))
        if "120885,486885" in s_url:  # SW
            return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000004")]))
        return _make_mock_resp(_make_3dbag_response([]))

    mock_client.get.side_effect = side_effect

    buildings, partial = await _fetch_bbox_parallel_quadrants(121005.0, 487005.0, 120.0)

    assert len(buildings) == 4
    ids = {b.pand_id for b in buildings}
    assert ids == {"0363100000000001", "0363100000000002", "0363100000000003", "0363100000000004"}
    assert partial is False


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_deduplicates(mock_get_client):
    """Building appearing in 2 adjacent quadrants is returned only once."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    shared_id = "0363100000000099"
    ne_resp = _make_3dbag_response([
        _make_feature("0363100000000001"),
        _make_feature(shared_id),
    ])
    nw_resp = _make_3dbag_response([
        _make_feature("0363100000000002"),
        _make_feature(shared_id),  # duplicate
    ])
    empty_resp = _make_3dbag_response([])

    def side_effect(url, **kwargs):
        s_url = str(url)
        if "121005,487005" in s_url:  # NE
            return _make_mock_resp(ne_resp)
        if "120885,487005" in s_url:  # NW
            return _make_mock_resp(nw_resp)
        return _make_mock_resp(empty_resp)

    mock_client.get.side_effect = side_effect

    buildings, partial = await _fetch_bbox_parallel_quadrants(121005.0, 487005.0, 120.0)

    ids = [b.pand_id for b in buildings]
    assert ids.count(shared_id) == 1  # deduplicated
    assert len(buildings) == 3  # 2 unique + 1 shared


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_bbox_parallel_quadrants_partial_on_one_failure(mock_get_client):
    """If one quadrant fails, return partial=True with buildings from other 3."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    def side_effect(url, **kwargs):
        s_url = str(url)
        if "121005,487005" in s_url:  # NE — fails
            raise httpx.TimeoutException("read timeout")
        return _make_mock_resp(_make_3dbag_response([_make_feature("0363100000000001")]))

    mock_client.get.side_effect = side_effect

    buildings, partial = await _fetch_bbox_parallel_quadrants(121005.0, 487005.0, 120.0)

    assert partial is True
    # 3 quadrants succeeded, each with 1 building (but some share same id from factory)
    assert len(buildings) >= 1


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
    """Fetch a single quadrant bbox page."""
    client = _get_client()
    url = f"{settings.three_d_bag_base}/collections/pand/items?bbox={bbox_str}&limit={BBOX_PAGE_LIMIT}"
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
    return buildings, False


async def _fetch_bbox_parallel_quadrants(
    center_x: float, center_y: float, radius: float
) -> tuple[list[BuildingBlock], bool]:
    """Fetch surrounding buildings via 4 parallel quadrant bbox queries.

    Splits the square bbox into NE/NW/SE/SW quadrants, fetches all 4
    concurrently (single page each), then deduplicates by pand_id.
    """
    quadrants = _quadrant_bboxes(center_x, center_y, radius)
    start = time.monotonic()

    results = await asyncio.gather(
        *[
            _fetch_single_quadrant(center_x, center_y, bbox_str, label)
            for label, bbox_str in quadrants
        ],
        return_exceptions=True,
    )

    seen_ids: set[str] = set()
    buildings: list[BuildingBlock] = []
    partial = False

    for result in results:
        if isinstance(result, Exception):
            logger.warning("Quadrant fetch exception: %s", result)
            partial = True
            continue
        quadrant_buildings, quadrant_partial = result
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
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "feat: add _fetch_bbox_parallel_quadrants with dedup and partial failure handling"
```

---

### Task 3: Update accelerated constants + wire parallel path into `_fetch_bbox_resilient`

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (lines 44-60 accelerated constants + `_fetch_bbox_resilient` at line 508)

**Step 1: Update accelerated mode constants**

Change lines 44-60 in `three_d_bag.py`:

```python
else:
    # Accelerated mode defaults — parallel quadrant strategy.
    DEFAULT_RADIUS = 120.0
    BBOX_MAX_PAGES = 1
    BBOX_FETCH_BUDGET = 35.0
    BBOX_PAGE_TIMEOUT = 30.0
    TARGET_FETCH_RETRIES = 4
    BBOX_FETCH_RETRIES = 6
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

**Step 2: Update `_fetch_bbox_resilient` to use parallel path in accelerated mode**

Replace the `_fetch_bbox_resilient` function (lines 508-578) — change line 515 to call the parallel function when not in conservative mode:

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
    # ... rest of conservative path unchanged ...
```

Keep the entire conservative path body unchanged — just wrap it in the `if not ... else` guard.

**Step 3: Run the full test suite**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py -v`
Expected: PASS. Some existing tests may need bbox string adjustments due to radius 150->120. Check:
- `test_default_radius_produces_150m_bbox_url` (line 1379) — update expected bbox strings from `120855,486855,121155,487155` to quadrant-based strings
- `test_get_neighborhood_3d_prefetches_near_ring_without_duping_context` (line 578) — near ring bbox string may change
- `test_accelerated_mode_constants_within_latency_bounds` (line 1364) — update `DEFAULT_RADIUS <= 150.0` to `<= 120.0`

For each failing test: update the expected values to match the new 120m radius / parallel quadrant behavior.

**Step 4: Run ruff**

Run: `cd backend && ruff check .`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "feat: wire parallel quadrant fetch into accelerated mode, radius 150->120m"
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
Expected: PASS (cache key tests may need string update if they assert on version)

**Step 3: Commit**

```bash
git add backend/app/api/address.py
git commit -m "chore: bump neighborhood3d cache version to v26 for parallel quadrant fetch"
```

---

### Task 5: Reduce frontend timeout 90s -> 40s

**Files:**
- Modify: `frontend/src/services/api.ts` (line 80)

**Step 1: Update timeout**

Change line 80 in `frontend/src/services/api.ts`:

```typescript
// Before:
const timeoutId = setTimeout(() => controller.abort(), 90000);

// After:
const timeoutId = setTimeout(() => controller.abort(), 40000);
```

**Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "perf: reduce neighborhood3D timeout from 90s to 40s (backend budget is 35s)"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `backend/CLAUDE.md` (3DBAG section)

**Step 1: Update scope mode docs**

In `backend/CLAUDE.md`, update the 3DBAG section to reflect:

- Accelerated mode: "4 parallel quadrant queries at 120m radius, 1 page each, budget 35s. ~120-150 buildings."
- Conservative mode: unchanged
- Cache version: v26

**Step 2: Commit**

```bash
git add backend/CLAUDE.md
git commit -m "docs: update 3DBAG scope modes for parallel quadrant fetch"
```

---

### Task 7: Run full test suites + ruff

**Step 1: Backend tests**

Run: `cd backend && python -m pytest -x -q -m "not live"`
Expected: 432+ tests PASS

**Step 2: Ruff**

Run: `cd backend && ruff check .`
Expected: Clean

**Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: Clean

**Step 4: Frontend tests**

Run: `cd frontend && npm run test`
Expected: 448+ tests PASS

---

### Task 8: Manual live verification

**Step 1: Start backend**

Run: `cd backend && uvicorn app.main:app --reload --port 8000`

**Step 2: Test with curl**

```bash
# Amsterdam Centrum — Damrak 1
curl -w "\nTotal time: %{time_total}s\n" \
  "http://localhost:8000/api/address/0363010000696734/neighborhood3d?pand_id=0363100012253924&rd_x=121387&rd_y=487373&lat=52.3745&lng=4.8957"
```

Expected: Response in ~26-29s (cold) with ~120+ buildings. Verify `buildings` array is non-empty and `target_pand_id` is set.

**Step 3: Verify conservative rollback**

Set `BUURT_THREE_D_CONSERVATIVE_MODE=True` in environment, restart backend, repeat curl. Should take ~50-60s (old sequential behavior).
