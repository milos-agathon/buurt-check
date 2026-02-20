# Design: Parallel Quadrant 3D Fetch

**Date:** 2026-02-20
**Goal:** Reduce 3D Neighborhood view cold load from ~60-76s to under 30s while preserving full LoD 2.2 and neighborhood coverage.
**Metric:** Time to full scene (all neighbors visible + shadow snapshots captured).

## Problem

Each 3DBAG bbox page takes 12-17s of irreducible server-side processing. Pages are fetched sequentially (cursor pagination). At 150m radius with 167-251 buildings, 3-5 sequential pages = 50-76s just for API calls. 90%+ of the latency is the 3DBAG server, not network or frontend rendering.

## Approach: Parallel Quadrant Fetching

Split the single large bbox into 4 quadrant bboxes and fetch all 4 in parallel. Each quadrant is small enough to fit in a single page, eliminating sequential pagination entirely.

```
         120m
    +-------+-------+
    |  NW   |  NE   |  120m
    |       |       |
    +----(center)---+
    |  SW   |  SE   |  120m
    |       |       |
    +-------+-------+
```

### Probe Results (2026-02-20, Amsterdam Centrum Damrak 1)

**Rate limit verification:** 3DBAG handles 4 concurrent requests with no HTTP errors, no 429s, and no explicit throttling. Individual request times inflate slightly under concurrent load (natural server contention).

| Strategy | Radius | Buildings | Wall Clock (range) | Pages needed |
|----------|--------|-----------|-------------------|--------------|
| Current sequential | 150m | ~200 (3 pages) | 42-51s | 3-5 |
| 4 quadrants | 150m | 180 | 25-33s | NW+SE overflow |
| **4 quadrants** | **120m** | **124** | **24-27s** | **None (complete set)** |
| 2 halves | 120m | 100 | 13-17s | NORTH overflows |

**Decision:** 4 quadrants at 120m. Gets 124 buildings (complete neighborhood, no pagination needed) in 24-27s wall clock. Total with lookup + target: **26-29s**.

### Why Not 150m?

At 150m, quadrants NW and SE have "more pages" (>50 buildings per quadrant). Wall clock 25-33s sometimes exceeds 30s target. At 120m, all quadrants fit in a single page with no overflow.

### Why Not 2 Halves?

At 120m, 2 halves return only 100 buildings (vs 124 for quadrants) and the north half still overflows. At 150m, both halves overflow. 4 quadrants provide better building coverage at any radius.

## Design

### Section 1: Backend — Parallel Quadrant Fetch

**Core change:** Replace `_fetch_bbox_paginated()` (sequential pages over single bbox) with `_fetch_bbox_parallel_quadrants()` (4 concurrent bbox queries).

```python
async def _fetch_bbox_parallel_quadrants(center_x, center_y, radius=120):
    # Split bbox into 4 quadrants (NE, NW, SE, SW)
    quadrants = [
        (center_x, center_y, center_x + radius, center_y + radius),       # NE
        (center_x - radius, center_y, center_x, center_y + radius),       # NW
        (center_x, center_y - radius, center_x + radius, center_y),       # SE
        (center_x - radius, center_y - radius, center_x, center_y),       # SW
    ]
    # Fire all 4 via asyncio.gather()
    results = await asyncio.gather(*[fetch_single_page(q) for q in quadrants])
    # Deduplicate by pand_id (buildings at quadrant boundaries)
    seen = set()
    merged = []
    for building in itertools.chain.from_iterable(results):
        if building.pand_id not in seen:
            seen.add(building.pand_id)
            merged.append(building)
    return merged
```

**Constants (accelerated mode):**

| Constant | Before | After |
|----------|--------|-------|
| `DEFAULT_RADIUS` | 150m | 120m |
| `BBOX_MAX_PAGES` | 3 | 1 (per quadrant) |
| `BBOX_FETCH_BUDGET` | 50s | 35s |
| `BBOX_PAGE_TIMEOUT` | 40s | 30s |

**Deduplication:** Buildings at quadrant boundaries may appear in 2 adjacent quadrants. Filter by `pand_id` set after merging all 4 results. Cheap — pand_id is already parsed.

**Partial failure:** If any quadrant fails (timeout/502), the other 3 still return. Graceful degradation: 3/4 of the area covered + `partial=True` flag. Same behavior as current partial-page failures.

**Single-flight dedup:** Unchanged — keyed on `{pand_id}:{rd_x:.0f}:{rd_y:.0f}`.

**Cache:** Bump version v25 -> v26. Key structure unchanged. Mode discriminator already in key.

### Section 2: Frontend — Minimal Changes

The API response shape is identical. The frontend doesn't know or care about the backend fetch strategy.

**Changes:**
- `getNeighborhood3D` AbortController timeout: **stays at 90s** (must support conservative mode's 80s budget + margin; reducing to 40s would break conservative rollback)

**No changes to:** geometry pipeline, chunked rendering, shadow snapshots, loading skeleton behavior.

### Section 3: Conservative Mode & Rollback

**`BUURT_THREE_D_CONSERVATIVE_MODE=True`:** Restores old sequential `_fetch_bbox_paginated()` with 150m/3 pages/50s budget. Zero-risk rollback via env var.

**`False` (default):** New parallel quadrant path with 120m/4 queries/35s budget.

**Cache:** Both modes share v26. The cache key already includes `{accelerated|conservative}` discriminator — no cross-contamination.

### Section 4: Testing Strategy

**Backend unit tests (new):**
1. Quadrant bbox splitting — 4 bboxes tile correctly, no gaps
2. Deduplication — shared boundary building appears exactly once in merged result
3. Partial failure — 1 quadrant timeout, 3 succeed, partial=True
4. All quadrants fail — empty result, partial=True
5. Conservative mode fallback — flag enabled, sequential path used

**Existing tests:** Mock setup changes from sequential pages to 4 concurrent responses. Same `_get_json_with_retries` mock point.

**Frontend tests:** None needed — response shape unchanged.

**Manual verification:** Probe script against Rotterdam to confirm approach generalizes.

### Section 5: Migration & Deployment

- No database migrations (stateless aggregator)
- Cache version bump v25 -> v26 (old entries expire naturally, 24h TTL)
- Feature flag gated — `BUURT_THREE_D_CONSERVATIVE_MODE=True` reverts instantly
- Same API endpoint + response schema — frontend deploys independently

**Rollout:**
1. Deploy backend (conservative mode off by default)
2. Monitor logs for quadrant fetch times + building counts
3. If issues -> flip conservative mode flag
4. Deploy frontend timeout reduction after backend is stable

### Files Touched

- `backend/app/services/three_d_bag.py` — new quadrant fetch function, updated constants
- `backend/tests/test_three_d_bag.py` — new tests + updated mocks
- `backend/CLAUDE.md` — update scope mode documentation
- `frontend/src/services/api.ts` — timeout constant change

## Expected Outcome

| Metric | Current | After |
|--------|---------|-------|
| Cold load (full scene) | 50-76s | **26-29s** |
| Buildings fetched | 150-250 | ~124 |
| Radius | 150m | 120m |
| API requests | 3-5 sequential | 4 parallel + 1 target |
| Rollback | Env var switch | Same |
