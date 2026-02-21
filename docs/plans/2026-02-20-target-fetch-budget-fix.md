# Target Fetch Budget Fix â€” Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cap the target building fetch wall-clock at 30s, removing the unbounded ~101.5s target-fetch worst-case tail.

**Architecture:** Add a `TARGET_FETCH_BUDGET` constant and a thin `_fetch_target_budgeted()` wrapper that applies `asyncio.wait_for(timeout=TARGET_FETCH_BUDGET)` around the existing `_fetch_target_building()`. The wrapper catches `asyncio.TimeoutError` and returns `None`, matching the existing failure contract. This amendment guarantees the target leg cannot exceed `TARGET_FETCH_BUDGET` and no longer dominates request latency. On current HEAD, end-to-end gather timing still depends on `_fetch_bbox_resilient` fallback paths; parent Task 3 completes strict end-to-end budgeting. Scope: this change applies only to the target fetch path.

**Tech Stack:** Python asyncio

**Context:** This is an amendment to `docs/plans/2026-02-20-parallel-quadrant-3d-fetch-impl.md`. It fixes Finding #3 (timeout chain), which incorrectly claimed target fetch worst-case was ~33s. The actual worst-case is `TARGET_FETCH_TIMEOUT(25s) * TARGET_FETCH_RETRIES(4) + backoff = ~101.5s`. This fix can be applied before parent Task 3 and immediately removes that target-side tail risk; parent Task 3 then completes strict end-to-end budgeting.

**Terminology note:** In `_get_json_with_retries`, `attempts` uses `range(1, attempts + 1)`. So `TARGET_FETCH_RETRIES=4` means 4 total attempts, not 4 retries after an initial attempt.

**Why `asyncio.wait_for` on the wrapper, not on the gather:** Wrapping the entire gather would reproduce the Finding #1 bug (discarding all completed results on timeout). Wrapping only the target fetch coroutine caps its wall-clock while preserving the bbox result. The wrapper catches `TimeoutError` internally so the gather never sees it.

---

### Task 1: Add `TARGET_FETCH_BUDGET` constant + `_fetch_target_budgeted` wrapper + tests

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (constants section lines 27-60, after `_fetch_target_building` at line 345)
- Test: `backend/tests/test_three_d_bag.py`

**Step 1: Write the failing test**

In `backend/tests/test_three_d_bag.py`, update the import block to add `import time`, `_fetch_target_budgeted`, and `get_target_building_3d`:

```python
import asyncio
import re
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.three_d_bag import (
    _compute_building_orientation,
    _enrich_with_lod22,
    _extract_lod22_surfaces,
    _fetch_bbox_quick_context,
    _fetch_target_budgeted,
    _fetch_target_building,
    _parse_building,
    get_neighborhood_3d,
    get_target_building_3d,
)
```

Add test at end of file:

```python
# --- Target fetch budget tests ---


@pytest.mark.asyncio
@patch("app.services.three_d_bag.TARGET_FETCH_BUDGET", 0.5)
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_budgeted_caps_wall_clock(mock_get_client):
    """Target fetch budget cancels retries that exceed wall-clock limit.

    Without the budget wrapper, 4 attempts at 25s each = ~101.5s worst-case.
    The budget wrapper caps total wall-clock regardless of retry count.
    """
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    call_count = 0

    async def slow_target(url, **kwargs):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(10)  # Each attempt takes 10s, budget is 0.5s
        return _make_mock_resp(_make_single_item_response("0363100012253924"))

    mock_client.get.side_effect = slow_target

    start = time.monotonic()
    result = await _fetch_target_budgeted("0363100012253924", 121005.0, 487005.0)
    elapsed = time.monotonic() - start

    assert result is None  # Budget expired before any attempt completed
    assert elapsed < 2.0, f"Budget should cap wall-clock; took {elapsed:.1f}s"
    assert call_count <= 2, f"Budget should prevent full retry exhaustion; {call_count} calls made"


@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_fetch_target_budgeted_returns_building_on_success(mock_get_client):
    """Budget wrapper passes through successful results unchanged."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    mock_client.get.return_value = _make_mock_resp(
        _make_single_item_response("0363100012253924")
    )

    result = await _fetch_target_budgeted("0363100012253924", 121005.0, 487005.0)

    assert result is not None
    assert result.pand_id == "0363100012253924"
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py::test_fetch_target_budgeted_caps_wall_clock -v`
Expected: FAIL with `ImportError: cannot import name '_fetch_target_budgeted'`

**Step 3: Write implementation**

Add `TARGET_FETCH_BUDGET` to both constant blocks in `backend/app/services/three_d_bag.py`:

In the conservative block (after line 43, after `TARGET_FETCH_TIMEOUT = 30.0`):

```python
    TARGET_FETCH_BUDGET = 999.0
```

Use a no-op budget in conservative mode to preserve rollback behavior. This keeps the "exact pre-optimization constants" contract functionally unchanged while still allowing a shared wrapper call site.

Extend `test_conservative_mode_preserves_exact_pre_optimization_constants` in `backend/tests/test_three_d_bag.py` to validate this constant explicitly:

```python
    PRE_OPT = {
        # ...
        "TARGET_FETCH_BUDGET": 999.0,
    }
```

Add a no-op safety assertion in the same test after constants are checked:

```python
            conservative_target_worst_case = (
                mod.TARGET_FETCH_TIMEOUT * mod.TARGET_FETCH_RETRIES
                + sum(
                    min(mod.RETRY_BACKOFF_BASE * i, 2.0)
                    for i in range(1, mod.TARGET_FETCH_RETRIES)
                )
            )
            assert mod.TARGET_FETCH_BUDGET > conservative_target_worst_case + 30.0
```

This ensures conservative mode remains functionally pre-optimization even after introducing a shared wrapper call site.

In the accelerated block (after line 60, after `TARGET_FETCH_TIMEOUT = 25.0`):

```python
    TARGET_FETCH_BUDGET = 30.0
```

Add the wrapper function after `_fetch_target_building` (after line 345):

```python
async def _fetch_target_budgeted(
    pand_id: str, center_x: float, center_y: float
) -> BuildingBlock | None:
    """Fetch target building with a wall-clock budget.

    Wraps _fetch_target_building with asyncio.wait_for to cap total time
    including all attempts. Without this, 4 attempts at 25s each = ~101.5s
    worst-case. The budget ensures the target leg cannot exceed
    TARGET_FETCH_BUDGET even when retries are still pending.
    """
    try:
        return await asyncio.wait_for(
            _fetch_target_building(pand_id, center_x, center_y),
            timeout=TARGET_FETCH_BUDGET,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "Target fetch for %s exceeded budget of %.0fs",
            pand_id,
            TARGET_FETCH_BUDGET,
        )
        return None
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py -k "fetch_target_budgeted or conservative_mode_preserves_exact_pre_optimization_constants" -v`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
cd backend && ruff check . && ruff format .
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "feat: add TARGET_FETCH_BUDGET to cap target fetch wall-clock at 30s"
```

---

### Task 2: Wire `_fetch_target_budgeted` into target fetch call sites + tests

**Files:**
- Modify: `backend/app/services/three_d_bag.py` (line 649 in `_get_neighborhood_3d_impl`, line 815 in `get_target_building_3d`)
- Test: `backend/tests/test_three_d_bag.py`

**Step 1: Write the failing test**

Add tests at end of `backend/tests/test_three_d_bag.py`:

```python
@pytest.mark.asyncio
@patch("app.services.three_d_bag.TARGET_FETCH_BUDGET", 0.5)
@patch("app.services.three_d_bag._get_client")
async def test_get_neighborhood_3d_impl_bounded_by_budgets(mock_get_client):
    """Target leg wall-clock is bounded by TARGET_FETCH_BUDGET.

    Regression test: without TARGET_FETCH_BUDGET, target fetch retries
    can push wall-clock to ~101.5s. With the budget, target timeout
    no longer dominates gather latency.
    """
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    bbox_resp = _make_3dbag_response([
        _make_feature("0363100000000001"),
        _make_feature("0363100000000002"),
    ])

    call_count = 0

    async def side_effect(url, **kwargs):
        nonlocal call_count
        s_url = str(url)
        if "NL.IMBAG.Pand.0363100012253924" in s_url:
            # Only target fetch is slow â€” will exceed 0.5s budget
            call_count += 1
            await asyncio.sleep(10)
            return _make_mock_resp(_make_single_item_response("0363100012253924"))
        # Bbox, near-ring, and any enrichment calls stay fast
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    start = time.monotonic()
    result = await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )
    elapsed = time.monotonic() - start

    # Wall-clock should be bounded by budget, not by retry exhaustion
    assert elapsed < 5.0, (
        f"gather wall-clock should be bounded by TARGET_FETCH_BUDGET; took {elapsed:.1f}s"
    )
    # Bbox results should still be available (target budget doesn't affect bbox)
    assert len(result.buildings) >= 1
    assert call_count <= 2


@pytest.mark.asyncio
@patch("app.services.three_d_bag.TARGET_FETCH_BUDGET", 0.5)
@patch("app.services.three_d_bag._get_client")
async def test_get_target_building_3d_bounded_by_target_budget(mock_get_client):
    """Phase-1 target-only endpoint must also honor TARGET_FETCH_BUDGET."""
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    async def slow_target(url, **kwargs):
        await asyncio.sleep(10)  # Simulate a slow single-item endpoint
        return _make_mock_resp(_make_single_item_response("0363100012253924"))

    mock_client.get.side_effect = slow_target

    start = time.monotonic()
    result = await get_target_building_3d(
        pand_id="0363100012253924",
        rd_x=121005.0,
        rd_y=487005.0,
        lat=52.372,
        lng=4.892,
    )
    elapsed = time.monotonic() - start

    assert elapsed < 2.0, (
        f"target-only endpoint should be bounded by TARGET_FETCH_BUDGET; took {elapsed:.1f}s"
    )
    assert result.target_pand_id is None
    assert result.buildings == []
    assert result.message == "Target building not found in 3D data"
```

**Step 2: Run test to verify it fails (or takes >10s)**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py::test_get_neighborhood_3d_impl_bounded_by_budgets -v`
Expected: FAIL - test takes ~10s+ because the current code awaits `_fetch_target_building` (unbounded retries) inside the gather.

Run: `cd backend && python -m pytest tests/test_three_d_bag.py::test_get_target_building_3d_bounded_by_target_budget -v`
Expected: FAIL - `get_target_building_3d` still calls `_fetch_target_building` directly, so wall-clock is not budget-capped yet.

**Step 3: Wire the budgeted wrapper**

In `backend/app/services/three_d_bag.py`, line 649, replace:

```python
    target_building, bbox_result = await asyncio.gather(
        _fetch_target_building(pand_id, rd_x, rd_y),
        _fetch_bbox_resilient(rd_x, rd_y, radius),
    )
```

With:

```python
    target_building, bbox_result = await asyncio.gather(
        _fetch_target_budgeted(pand_id, rd_x, rd_y),
        _fetch_bbox_resilient(rd_x, rd_y, radius),
    )
```

Then in `get_target_building_3d` (line 815), replace:

```python
    target = await _fetch_target_building(pand_id, rd_x, rd_y)
```

With:

```python
    target = await _fetch_target_budgeted(pand_id, rd_x, rd_y)
```

This removes the same 101.5s tail risk from the phase-1 target-only endpoint.

**Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py -k "bounded_by_budgets or target_building_3d_bounded_by_target_budget" -v`
Expected: PASS (both tests complete in <5s)

**Step 5: Run the full 3DBAG test suite**

Run: `cd backend && python -m pytest tests/test_three_d_bag.py -v`
Expected: All tests PASS

**Step 6: Commit**

```bash
cd backend && ruff check . && ruff format .
git add backend/app/services/three_d_bag.py backend/tests/test_three_d_bag.py
git commit -m "fix: wire _fetch_target_budgeted into neighborhood and phase-1 target paths"
```

---

### Task 3: Update parent impl plan Finding #3 + run full quality gates

**Files:**
- Modify: `docs/plans/2026-02-20-parallel-quadrant-3d-fetch-impl.md` (line 17 and Finding #3 at line 960)

**Step 1: Fix the incorrect claim at line 17**

Replace:

```
**Verified pre-conditions:** `_parse_bbox_page` exists at `three_d_bag.py:363`. `import asyncio` already present in test file. Target fetch wall-clock is bounded by `TARGET_FETCH_TIMEOUT * TARGET_FETCH_RETRIES` (25s Ã— 4 = worst-case ~33s with backoff) â€” acceptable without an explicit outer guard.
```

With:

```
**Verified pre-conditions:** `_parse_bbox_page` exists in `three_d_bag.py` (verified by symbol name; line numbers may shift). `import asyncio` is already present and this amendment also adds `import time` in the test file where `time.monotonic()` is used. Target fetch wall-clock is bounded by `TARGET_FETCH_BUDGET` (30s) via `_fetch_target_budgeted` wrapper. Without the budget, worst-case is `TARGET_FETCH_TIMEOUT(25s) * TARGET_FETCH_RETRIES(4) + backoff = ~101.5s`. On current HEAD, this amendment bounds the target leg only; `_fetch_bbox_resilient` fallback paths remain independently timed until parent Task 3 lands. See `2026-02-20-target-fetch-budget-fix.md`.
```

**Step 2: Fix Finding #3 at line 960**

Replace:

```
| 3 | **Timeout chain not end-to-end bounded** â€” target fetch has no outer wall-clock guard | LOW | Target fetch uses `TARGET_FETCH_TIMEOUT=25s Ã— TARGET_FETCH_RETRIES=4` with exponential backoff capped at 2s. Theoretical worst-case ~33s. This runs in `asyncio.gather` alongside `_fetch_bbox_resilient`, so the overall wall-clock is `max(target_fetch, bbox_resilient)` â‰ˆ max(33s, 35s) = 35s. Acceptable without an explicit outer budget. |
```

With:

```
| 3 | **Timeout chain not end-to-end bounded** â€” target fetch has no outer wall-clock guard | **CRITICAL (partially fixed)** | Original analysis was wrong: worst-case is 101.5s, not 33s (`25s Ã— 4 attempts + backoff`). Fixed for the target leg by adding `TARGET_FETCH_BUDGET=30s` and `_fetch_target_budgeted()` wrapper using `asyncio.wait_for`. Current HEAD still relies on `_fetch_bbox_resilient`, whose backup/secondary fallback paths are not covered by `BBOX_FETCH_BUDGET`, so end-to-end gather wall-clock is not yet strictly bounded. Parent Task 3 completes strict end-to-end budgeting. See `2026-02-20-target-fetch-budget-fix.md`. |
```

**Step 3: Run backend quality gates**

Run: `cd backend && python -m pytest -x -q -m "not live"`
Expected: 432+ tests PASS

Run: `cd backend && ruff check . && ruff format .`
Expected: Clean

**Step 4: Commit**

```bash
git add docs/plans/2026-02-20-parallel-quadrant-3d-fetch-impl.md
git commit -m "docs: fix Finding #3 â€” target fetch worst-case is 101.5s, not 33s; fixed by budget wrapper"
```

---

## Wall-Clock Budget Summary (after fix)

| Component | Budget | Mechanism |
|-----------|--------|-----------|
| Target fetch | 30s accelerated / 999s conservative (no-op) | `asyncio.wait_for` in `_fetch_target_budgeted` |
| Bbox fetch | 50s pre-parent / 35s post-parent (configured budgets) | Current HEAD uses `_fetch_bbox_resilient` with fallback calls that can exceed the configured budget; parent Task 3 switches to quadrant budget path |
| **Overall gather** | **Target leg bounded now; strict end-to-end bound post-parent** | Current HEAD: target capped at 30s, total still depends on `_fetch_bbox_resilient` fallback timing. After parent Task 3: strict accelerated bound at `max(30s, 35s) = 35s`. |
| Near-ring (conservative only) | skipped in accelerated | N/A |
| Frontend abort | 90s | AbortController (unchanged, supports conservative mode) |

## Why Not Reduce TARGET_FETCH_RETRIES Instead?

Reducing retries from 4 to 1 would also cap wall-clock (~25s), but:
- 3DBAG single-item endpoint has known 502 flakiness (the reason `TARGET_FETCH_RETRIES` was set to 4)
- With retries=1, any transient 502 means no target building (bbox fallback is less reliable for the exact target)
- The budget wrapper preserves retry resilience while still capping wall-clock â€” retries happen naturally within the 30s budget
- At 25s timeout + 0.25s backoff, the budget allows 1 full attempt + part of a retry, which is the sweet spot

