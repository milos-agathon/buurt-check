# F2 Reliability & Performance Fix Plan

## Problem Statement

F2 (3D neighborhood viewer) fails its core acceptance criterion: "render surrounding buildings within 250m" (PRD line 202). Live testing shows:
- **87.5% of requests return only the target building** (no neighbors)
- Root cause: 3DBAG bbox endpoint often takes >10s, hitting the backend httpx timeout
- When bbox does succeed (~20s), the frontend 15s abort sometimes kills valid results
- Performance target is <8s (PRD line 332), actual is 10-20s

Additionally, F2b (static shadow snapshots) and overlay toggles are unimplemented.

## Scope & Non-Scope

### In scope (this plan)
1. Fix the timeout chain so bbox reliably returns neighbors
2. Improve perceived performance with progressive loading
3. Make frontend resilient to slow backend responses
4. Increase observability (response metadata)

### Out of scope (deferred)
- **F2b static snapshots** — Depends on F5 (PDF export). No value without the PDF pipeline.
- **F2c annual sunlight deepening** — Current 3-date heuristic is acceptable for MVP.
- **Overlay toggles (noise/air/climate)** — These are F3 scope, not F2.
- **3DBAG fallback to 3D Tiles** — Premature optimization. Fix timeout first.

## Root Cause Analysis

The timeout chain has three layers, all misconfigured:

```
User clicks address
  → Frontend fires getNeighborhood3D()
    → AbortController: 15s timeout (too short for slow 3DBAG)
  → Backend receives request
    → asyncio.gather runs two fetches in parallel:
      a) _fetch_target_building: single-item, fast (~1-2s) ✅
      b) _fetch_bbox_buildings: paginated, slow (~8-20s per page) ❌
    → httpx client timeout: 10s (too short for bbox pages)
    → Bbox frequently times out → 0 neighbors → only target returned
```

The fix must:
1. Give 3DBAG more time per request (it's genuinely slow)
2. Give the frontend more time to wait (or update progressively)
3. Stream partial results to avoid all-or-nothing

---

## Implementation Steps

### Step 1: Increase backend HTTP timeout for 3DBAG

**File:** `backend/app/services/three_d_bag.py`

**Problem:** Hardcoded `timeout=10.0` at line 16. 3DBAG bbox responses regularly take 11-15s.

**Change:** Make timeout configurable and increase default to 20s.

```python
# three_d_bag.py line 13-17
def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=settings.three_d_bag_timeout)
    return _client
```

**File:** `backend/app/config.py`

Add: `three_d_bag_timeout: float = 20.0`

**Tests:**
- Existing tests unaffected (they mock the client)
- Add 1 config test: verify `settings.three_d_bag_timeout` defaults to 20.0

### Step 2: Increase frontend timeout to match

**File:** `frontend/src/services/api.ts`

**Problem:** Frontend aborts at 15s (line 46-47). Backend can now take up to 20s per page × multiple pages. Need to allow enough time.

**Change:** Increase to 30s. The user sees a loading indicator (from previous bug fix), so this is acceptable UX.

```typescript
const timeoutId = setTimeout(() => controller.abort(), 30000);
```

**Test update:** Existing `sends AbortSignal for timeout` test still passes (tests signal presence, not value).

### Step 3: Progressive loading — return target immediately, stream bbox

**File:** `backend/app/api/address.py`

**Problem:** The endpoint waits for both target AND bbox to complete before returning anything. If bbox takes 20s, user waits 20s even though target is available in 2s.

**Approach:** Split into two-phase loading:
1. Keep the existing endpoint behavior (returns combined result)
2. Add a new lightweight endpoint that returns just the target building immediately
3. Frontend fetches target first (fast), then full neighborhood (slow)

**New endpoint:** `GET /{vbo_id}/neighborhood3d/target`

```python
@router.get("/{vbo_id}/neighborhood3d/target", response_model=Neighborhood3DResponse)
async def neighborhood_3d_target(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    pand_id: str = Query(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
):
    """Fast endpoint: fetch only the target building (no bbox neighbors)."""
    target = await three_d_bag._fetch_target_building(pand_id, rd_x, rd_y)
    buildings = [target] if target else []
    center = Neighborhood3DCenter(lat=lat, lng=lng, rd_x=rd_x, rd_y=rd_y)
    return Neighborhood3DResponse(
        address_id=vbo_id,
        target_pand_id=pand_id if target else None,
        center=center,
        buildings=buildings,
    )
```

**Frontend change:** `frontend/src/App.tsx` and `frontend/src/services/api.ts`

Add `getNeighborhood3DTarget()` API function. Update `handleAddressSelect`:
1. Fire target-only fetch immediately → render 3D viewer with just target (~2s)
2. Fire full neighborhood fetch in background → merge buildings when complete
3. User sees target building immediately, neighbors appear progressively

```typescript
// api.ts
export async function getNeighborhood3DTarget(...): Promise<Neighborhood3DResponse> {
  // same params, different endpoint suffix
}
```

```typescript
// App.tsx handleAddressSelect — inside the pand_id block:
// Phase 1: fast target-only fetch
setNeighborhood3DLoading(true);
void (async () => {
  try {
    // Fast: just the target
    const target = await getNeighborhood3DTarget(vboId, pandId, rd_x, rd_y, latitude, longitude);
    if (neighborhood3DRequestId.current === requestId) {
      setNeighborhood3D(target);
      setNeighborhood3DLoading(false);
    }
    // Slow: full neighborhood (replaces target-only when done)
    const full = await getNeighborhood3D(vboId, pandId, rd_x, rd_y, latitude, longitude);
    if (neighborhood3DRequestId.current === requestId) {
      setNeighborhood3D(full);
    }
  } catch {
    if (neighborhood3DRequestId.current === requestId) {
      setNeighborhood3DLoading(false);
    }
  }
})();
```

**Tests:**
- Backend: +2 tests for target-only endpoint (success, target not found)
- Frontend: +1 test for progressive loading (target renders first, then neighborhood)
- Update existing test: "renders 3D viewer when neighborhood data is available" — mock both calls

### Step 4: Add response metadata for observability

**File:** `backend/app/models/neighborhood3d.py`

**Problem:** No way to know from the response how long the fetch took, how many pages were fetched, or if the bbox timed out. Makes debugging impossible.

**Change:** Add optional metadata fields to `Neighborhood3DResponse`:

```python
class Neighborhood3DResponse(BaseModel):
    # ... existing fields ...
    fetch_duration_ms: int | None = None
    bbox_pages_fetched: int | None = None
```

**File:** `backend/app/services/three_d_bag.py`

Track and return page count from `_fetch_bbox_buildings`:

```python
async def _fetch_bbox_buildings(...) -> tuple[list[BuildingBlock], int]:
    # ... existing logic ...
    return buildings, page  # return page count
```

Update `get_neighborhood_3d` to:
1. Record start time
2. Unpack page count from bbox result
3. Set metadata on response

**Tests:**
- Update existing tests that call `_fetch_bbox_buildings` (now returns tuple)
- +1 test: verify metadata fields populated in response

### Step 5: Backend timeout per-page with partial return

**File:** `backend/app/services/three_d_bag.py`

**Problem:** If page 1 succeeds but page 2 times out, we lose page 1's buildings too (the loop breaks on error). This is already handled — the `break` on line 146 exits the loop but keeps buildings from previous pages.

**Verify:** This is already correct. The `except` block does `break`, not `return []`. Buildings accumulated from prior pages are preserved.

No change needed — document this in a code comment for clarity.

### Step 6: Reduce bbox radius for dense areas (optional optimization)

**File:** `backend/app/services/three_d_bag.py`

**Current:** Fixed 250m radius.

**Optional:** If the first page returns >50 buildings, skip remaining pages. Dense areas with many buildings need less radius to provide context.

```python
# After processing features on each page:
if len(buildings) >= 50:
    break  # enough context, skip remaining pages
```

This is a safe optimization — 50 buildings provide plenty of neighborhood context while avoiding slow pagination in dense city centers.

**Test:** +1 test: verify early exit when buildings >= 50.

---

## Files to Modify

| File | Changes |
|------|---------|
| `backend/app/config.py` | Add `three_d_bag_timeout: float = 20.0` |
| `backend/app/services/three_d_bag.py` | Use config timeout, return page count from bbox, add early-exit at 50 buildings, add comment on partial-result behavior |
| `backend/app/api/address.py` | Add `/neighborhood3d/target` endpoint, add metadata to full endpoint response |
| `backend/app/models/neighborhood3d.py` | Add `fetch_duration_ms`, `bbox_pages_fetched` fields |
| `frontend/src/services/api.ts` | Add `getNeighborhood3DTarget()`, increase timeout to 30s |
| `frontend/src/App.tsx` | Two-phase loading: target first, then full neighborhood |
| `backend/tests/test_address_api.py` | +2 tests for target endpoint |
| `backend/tests/test_three_d_bag.py` | Update for tuple return, +1 metadata test, +1 early-exit test |
| `frontend/src/services/api.test.ts` | +1 test for target API function |
| `frontend/src/App.test.tsx` | +1 test for progressive loading |

## Test Targets

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend | 71 | 76 | +5 |
| Frontend | 79 | 81 | +2 |

## Verification

```bash
# Backend
cd "D:/buurt-check/backend"
python -m ruff check app tests
python -m pytest tests/ -v  # >= 76 tests, 0 failures

# Frontend
cd "D:/buurt-check/frontend"
npm run build               # TypeScript strict, clean
npx vitest run              # >= 81 tests, 0 failures
```

### Live verification (manual)
After implementation, test with at least 3 addresses:
1. `Kalverstraat 1, Amsterdam` (dense city center)
2. `Binnenhof 1, Den Haag` (government district)
3. A suburban address (lower density)

For each, verify:
- Target building appears within 3s (progressive loading)
- Neighborhood buildings appear within 20s
- Building count > 1 in final response
- `fetch_duration_ms` and `bbox_pages_fetched` visible in API response

## Risk Assessment

- **Low risk:** Steps 1-2 (timeout tuning) — simple config changes
- **Medium risk:** Step 3 (progressive loading) — new endpoint + frontend state changes, but isolated to F2 flow
- **Low risk:** Step 4 (metadata) — additive, no behavior change
- **Low risk:** Step 6 (early exit) — safe optimization with clear threshold
