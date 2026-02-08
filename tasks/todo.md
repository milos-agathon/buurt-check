# Fix Plan: LoD 2.2 + Basemap Coverage + Performance + Full Rebuild

## Context

Five user-reported issues after the F2 enhancement work:
1. **LoD 2.2 roof geometry not showing** — flat tops despite flag enabled
2. **Not all buildings rendered** — some buildings missing from the 3D view
3. **Buildings outside basemap** — gray base ground visible instead of street map
4. **Gray base layer visible** — 1000m ground plane dwarfs the ~377m basemap tile
5. **>20 second 3D render time** — single monolithic endpoint blocks until bbox completes

## Root Cause Analysis

### Issue 1: LoD 2.2 not showing
- Feature flag `enable_lod22_roofs: bool = True` in `config.py:24` is correct
- `.env` has `BUURT_ENABLE_LOD22_ROOFS=true` and `model_config` has `env_file=".env"` — correct
- Backend parsing code + frontend rendering code are correct end-to-end
- **Root cause: Stale Redis cache.** Cached `neighborhood3d:*` responses from when flag was `false` have `roof_surfaces: null`. 24h TTL means old responses persist. Must flush cache.

### Issue 2: Not all buildings rendered
- `MAX_PAGES=2` at `limit=20` = max 40 buildings per bbox fetch. Dense areas (Amsterdam) have 100+ buildings in 250m — page 2 cutoff drops many.
- Reducing radius from 250 to 150 in the previous attempt helped the area but we also cut MAX_PAGES to 2, which may still be too few.
- **Root cause:** `MAX_PAGES=2` is too aggressive. Restore to `MAX_PAGES=3` which gives up to 60 buildings (adequate for 150m radius).

### Issue 3 + 4: Buildings outside basemap / Gray base layer visible
- `GROUND_SIZE=1000` creates a huge gray plane. The basemap tile at zoom 16 is only ~377m at Dutch latitudes. The gray plane extends 311m beyond the tile in all directions.
- The basemap tile is correctly sized and positioned, but it's sitting ON TOP of the gray plane which is 2.7x larger.
- **Root cause:** The base ground plane should not be visible. Replace single ground design with: basemap tile as the primary ground + extend coverage with a 2x2 tile grid covering ~750m in each direction.

### Issue 5: >20 second 3D render time
- The planned two-phase progressive loading (`/building3d` fast + `/neighborhood3d` slow) was never implemented.
- Only `/neighborhood3d` exists, which runs `asyncio.gather(target_fetch, bbox_fetch)` — total time = max(2s, 12-17s) = 12-17s.
- Frontend renders nothing until the full response arrives.
- **Root cause:** No separate fast endpoint. Must implement `/building3d` backend endpoint + frontend two-phase fetch.

---

## Fix Steps

### Step 1: Flush Redis cache (LoD 2.2 fix)
**Action:** Write a Python script to flush `neighborhood3d:*` and `building3d:*` keys from Redis programmatically since `redis-cli` is not available on this machine.

**File:** Run inline via backend Python environment.

### Step 2: Restore MAX_PAGES=3 (missing buildings fix)
**File:** `backend/app/services/three_d_bag.py`

**Changes:**
- `MAX_PAGES` from `2` back to `3`
- Keep `radius=150.0` (correct — smaller area means fewer pages needed, 3 pages at 20/page = 60 buildings is plenty)

### Step 3: 2x2 basemap tile grid (basemap coverage fix)
**File:** `frontend/src/components/NeighborhoodViewer3D.tsx`

**Problem:** Single tile (~377m) doesn't cover all buildings. Gray 1000m ground plane is visible.

**Fix:** Replace single tile + large gray ground with a 2x2 tile grid:
1. Remove the 1000m gray ground plane entirely — replace with a smaller, darker fallback plane
2. Load 4 tiles (the tile containing the query point + 3 neighbors to ensure full coverage)
3. Each tile sized to its real-world dimensions, positioned correctly
4. The 2x2 grid covers ~750m x ~750m — more than enough for 150m radius

**Detailed approach:**
- Calculate which tile the query point is in (existing logic)
- Determine which quadrant of the tile the point is in (fracX < 0.5 → need tile to the left; fracY < 0.5 → need tile above)
- Load 4 tiles: [baseX, baseY], [baseX+1, baseY], [baseX, baseY+1], [baseX+1, baseY+1] where baseX/baseY are chosen so the query point is near the center of the 2x2 grid
- Position each tile mesh at the correct offset
- Keep a small fallback ground plane (same size as 2x2 grid) in neutral color at y=-0.01 for shadow receiving

### Step 4: Add `/building3d` endpoint (performance fix — backend)
**File:** `backend/app/api/address.py`

**Add new endpoint:**
```python
@router.get("/{vbo_id}/building3d", response_model=Neighborhood3DResponse)
async def building_3d(vbo_id, pand_id, rd_x, rd_y, lat, lng):
    # Fetch ONLY the target building (fast, ~2s)
    # Uses _fetch_target_building() directly, no bbox
```

**Cache key:** `building3d:{pand_id}` (separate from neighborhood3d cache)

### Step 5: Add `getBuilding3D` API function (performance fix — frontend API)
**File:** `frontend/src/services/api.ts`

**Add:**
```typescript
export async function getBuilding3D(vboId, pandId, rdX, rdY, lat, lng): Promise<Neighborhood3DResponse> {
  // Calls /address/{vbo_id}/building3d with 5s timeout
}
```

### Step 6: Two-phase progressive loading (performance fix — frontend App)
**File:** `frontend/src/App.tsx`

**Change the 3D fetch from single-call to two-phase:**
1. **Phase 1:** Call `getBuilding3D()` — returns in ~2s. Set `neighborhood3D` immediately so the 3D viewer renders the target building.
2. **Phase 2:** Call `getNeighborhood3D()` — returns in 12-17s. Merge/replace buildings. Sunlight and snapshots deferred until Phase 2 completes.

**Rendering changes:**
- 3D viewer shows target building immediately after Phase 1 (~2s)
- Surrounding buildings appear when Phase 2 completes (~12-17s)
- Sunlight/shadow analysis only runs after Phase 2 (needs surrounding buildings for obstruction checks)

### Step 7: Restart backend + rebuild frontend
**Commands:**
- Kill any running backend, start fresh with `uvicorn`
- Build frontend with `npm run build`, start dev server with `npm run dev`

---

## Files Modified

| File | Change |
|------|--------|
| `backend/app/services/three_d_bag.py` | `MAX_PAGES=3`, add `get_building_3d()` |
| `backend/app/api/address.py` | Add `/building3d` endpoint |
| `frontend/src/services/api.ts` | Add `getBuilding3D()` function |
| `frontend/src/App.tsx` | Two-phase 3D fetch (building3d then neighborhood3d) |
| `frontend/src/components/NeighborhoodViewer3D.tsx` | 2x2 tile grid basemap, remove oversized gray ground |

## Verification

1. **LoD 2.2:** After Redis flush, buildings with LoD 2.2 in 3DBAG should show roof geometry
2. **All buildings:** MAX_PAGES=3 with 150m radius covers up to 60 buildings
3. **Basemap coverage:** 2x2 tile grid (~750m) covers all buildings at 150m radius
4. **No gray base:** Small fallback ground hidden beneath tile grid
5. **Performance:** Target building visible in ~2-3s, neighborhood fills in at ~12-17s
6. **Tests:** Backend pytest (161+), frontend vitest (150+), `npm run build`, `ruff check`
