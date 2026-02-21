# 3D Scene Latency Reduction — Implementation Plan (v6)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce 3D neighborhood scene cold load from 60-77s to a bounded, predictable range by attacking the three main bottleneck layers: API fetch scope, fetch sequencing, and payload size.

**Architecture:** Three-pronged approach:
1. **Scope reduction** (biggest impact): Use accelerated defaults of radius 150m, max pages 3, budget 50s (vs conservative 150m/5 pages/80s). This keeps closer-context coverage while still capping worst-case fetch scope.
2. **Parallel fetch kickoff**: Include `pand_id` in the address lookup response so the frontend can start 3D fetches immediately after lookup instead of waiting for building facts (saves ~2s).
3. **Compression**: Add GZip middleware to FastAPI. 3D JSON responses are 2-5MB uncompressed; GZip cuts this to 200-500KB.

**Tech Stack:** FastAPI GZipMiddleware, backend constant tuning, BAG WFS pand_id resolution, frontend fetch restructuring.

**Expected cold latency timeline after all changes (estimates based on Feb 17 baselines):**
| Event | Before (observed Feb 17) | After (projected) |
|-------|--------|-------|
| Address selected | T+0 | T+0 |
| Lookup resolves (with pand_id) | T+1s | T+1.5s |
| 3D fetches start | T+3s (after building facts) | T+1.5s (immediately) |
| Target building arrives | T+5s | T+3.5s |
| Neighborhood context arrives | T+62-77s | T+20-35s |

> Before numbers from CLAUDE.md baselines (Damrak 77s, Kerkstraat 62s). Updated projections use up to 3 pages at 12-17s/page + parallel target + GZip. Verify against live API after implementation.

**Warm latency (cache hit):** ~1.5s (unchanged � just Redis lookup + JSON parse).

> **Revision note (2026-02-20, v25):** Accelerated targets are now `radius=150m`, `max_pages=3`, `budget=50s`, `retries<=6`, and cache key version is `neighborhood3d:v25:{mode}:...`. Legacy `100m/2p/35s` references in earlier draft snippets are superseded.

---

## Current Codebase State (verified 2026-02-20)

| File | Current State | Line Refs |
|------|--------------|-----------|
| `backend/app/main.py` | CORSMiddleware only. No GZipMiddleware. | L18-24 |
| `backend/app/services/three_d_bag.py` | **Flat constants (no conservative/accelerated branching).** `BBOX_MAX_PAGES=5`, `BBOX_FETCH_BUDGET=80.0`, `BBOX_PAGE_TIMEOUT=65.0`, `TARGET_FETCH_RETRIES=6`, `BBOX_FETCH_RETRIES=10`, `RETRY_BACKOFF_BASE=0.35`, `NEARBY_CONTEXT_MIN_RADIUS=100.0`, default `radius=150.0` | L14-39 (constants), L612 and L757 (default radius) |
| `backend/app/config.py` | No `three_d_conservative_mode` flag. Feature flags: `enable_lod22_roofs`, `enable_lod22_context_enrichment` | L56-58 |
| `backend/app/api/address.py` | Cache key `neighborhood3d:v23:...`. Lookup endpoint at L74-93, no pand_id. `bag` already imported at L26. `asyncio` imported at L1. | L216 (cache), L74-93 (lookup) |
| `backend/app/models/address.py` | `ResolvedAddress` — no `pand_id` field | L15-33 |
| `frontend/src/App.tsx` | 3D fetches start at L672, AFTER `getBuildingFacts()` at L641. Phase 0/1/2 pattern exists at L677-736. | L489-747 (handleAddressSelect) |
| `frontend/src/services/api.ts` | `getNeighborhood3D` timeout: 90s (L80). `getBuilding3D` has NO timeout. | L63-91, L43-61 |
| `frontend/src/types/api.ts` | `ResolvedAddress` — no `pand_id` field | L14-33 |
| **Test baselines** | Backend: **434 passed**. Frontend: **445 passed**. | Verified 2026-02-20 |

---

## Acceptance Criteria (must pass after all tasks)

### Hard Quality Gates (every gate has a test — see Task references)

| # | Gate | Threshold | Test | Rationale |
|---|------|-----------|------|-----------|
| 1 | Building count floor | ≥ 5 buildings at 150m radius in dense mock | Test C (Task 2) | Min context for property evaluation |
| 2 | Target recovery | 100% recovery after 502 single-item → bbox fallback | Test D (Task 2) | Sunlight requires target building |
| 3 | Sunlight viability | target + ≥1 neighbor → computable | Test E (Task 2) | Min viable shadow analysis |
| 4 | No regression | All 434 backend + 445 frontend tests pass | Full suite (Task 6) | Zero regression tolerance |
| 5 | Conservative mode = exact rollback | `BUURT_THREE_D_CONSERVATIVE_MODE=True` restores EXACT current HEAD behavior (150m/5p/80s) | Test F byte-match (Task 2) | Rollback must be pixel-identical to pre-optimization |
| 6 | GZip active on large payloads | `GZipMiddleware` registered with `minimum_size=1000` + behavioral test on >1KB response | Structural + behavioral tests (Task 1) | Payload compression verified both structurally and at runtime |
| 7 | Lookup pand_id SLA | 3s hard timeout; timeout-path test must assert endpoint returns in <=3.5s locally; lookup P99 target <= 4.5s | Timeout + elapsed-time assertion test (Task 3) | Non-critical enrichment must not degrade core lookup |
| 8 | Frontend timeout unchanged | 90s covers both accelerated (50s) AND conservative (80s) modes + margin | Manual verify api.ts:80 (Task 6) | Premature abort would break conservative rollback |
| 9 | Accelerated constants within bounds | radius <=150m, pages <=3, budget <=50s, retries <=6 | Test A (Task 2) | Prevents accidental scope inflation that regresses latency |
| 10 | Early 3D kickoff correctness | With lookup `pand_id`, 3D APIs start before building-facts resolves and are called exactly once | Frontend App tests (Task 4) | Prevents regressions in the new async path |

---

## Task 1: Add GZip Compression Middleware

**Files:**
- Modify: `backend/app/main.py` (currently 47 lines)
- Create: `backend/tests/test_main.py`

**Why:** 3D neighborhood responses contain 80-250 buildings with vertex arrays. Typical uncompressed size: 2-5MB. GZip compression at `minimum_size=1000` reduces large payloads to ~10-20% of their original size, saving 0.5-2s on typical connections and more on mobile.

**Step 1: Write structural tests**

Create `backend/tests/test_main.py`:

```python
from app.main import app


def test_gzip_middleware_registered():
    """GZipMiddleware must be in the app's middleware stack."""
    middleware_names = [m.cls.__name__ for m in app.user_middleware]
    assert "GZipMiddleware" in middleware_names


def test_gzip_minimum_size_is_1000():
    """GZip should skip tiny responses (overhead > benefit)."""
    gzip_entry = next(
        m for m in app.user_middleware
        if m.cls.__name__ == "GZipMiddleware"
    )
    assert gzip_entry.kwargs.get("minimum_size") == 1000
```

> **Why structural tests first:** Before implementation, `GZipMiddleware` is not in `app.user_middleware`, so `next()` raises `StopIteration` — this is the TDD red phase. After adding the middleware (Step 3), both structural tests turn green. Structural tests verify configuration correctness.

**Step 2: Run tests to verify they fail (TDD red phase)**

```bash
cd backend && python -m pytest tests/test_main.py -v
```
Expected: FAIL — `StopIteration` because `GZipMiddleware` is not in `app.user_middleware`.

**Step 3: Implement GZip middleware**

In `backend/app/main.py`, add import and middleware registration. Insert after the CORS middleware block (after L24), before `app.include_router(router)` (L26):

```python
from fastapi.middleware.gzip import GZipMiddleware

# After the CORSMiddleware block:
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

`minimum_size=1000` skips tiny responses like `/health` (29 bytes) while compressing all 3D, risk card, and neighborhood responses.

**Step 4: Run tests and verify they pass**

```bash
cd backend && python -m pytest tests/test_main.py -v
```
Expected: Both tests PASS.

**Step 5: Run full backend test suite**

```bash
cd backend && python -m pytest -x -q -m "not live"
```
Expected: All 434+ tests pass. GZip middleware is transparent to existing tests (httpx `ASGITransport` handles encoding internally).

**Step 5b: Write behavioral gzip test for large payloads**

Add to `backend/tests/test_main.py`:

```python
import pytest

from unittest.mock import AsyncMock, patch

from app.main import app
from app.models.neighborhood3d import BuildingBlock, Neighborhood3DCenter, Neighborhood3DResponse


@pytest.mark.asyncio
async def test_gzip_compresses_large_3d_response():
    """Behavioral test: large JSON responses get Content-Encoding: gzip.

    Uses httpx ASGITransport which runs the full middleware stack.
    httpx auto-decompresses the body but preserves the Content-Encoding header.
    This proves gzip actually activates on payloads above minimum_size=1000.
    """
    import httpx

    # Build a response that serializes to >1000 bytes
    buildings = [
        BuildingBlock(
            pand_id=f"036310009999{i:04d}",
            ground_height=0.5,
            building_height=10.0 + i,
            footprint=[[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]],
        )
        for i in range(20)
    ]
    large_response = Neighborhood3DResponse(
        address_id="0363010000696734",
        target_pand_id="0363100012253924",
        center=Neighborhood3DCenter(lat=52.37, lng=4.89, rd_x=121005.0, rd_y=487005.0),
        buildings=buildings,
    )

    with (
        patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None),
        patch("app.api.address.cache_set", new_callable=AsyncMock),
        patch("app.api.address.three_d_bag") as mock_3d,
    ):
        mock_3d.get_neighborhood_3d = AsyncMock(return_value=large_response)

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/address/0363010000696734/neighborhood3d",
                params={
                    "pand_id": "0363100012253924",
                    "rd_x": "121005.0", "rd_y": "487005.0",
                    "lat": "52.37", "lng": "4.89",
                },
            )

    assert resp.status_code == 200
    assert resp.headers.get("content-encoding") == "gzip", (
        "Large 3D response (>1000 bytes) must be gzip-compressed. "
        f"Got content-encoding: {resp.headers.get('content-encoding')}"
    )
    # Verify the body was decompressed correctly by httpx
    data = resp.json()
    assert len(data["buildings"]) == 20


@pytest.mark.asyncio
async def test_gzip_skips_small_responses():
    """Behavioral test: small responses (<1000 bytes) are NOT compressed."""
    import httpx

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        resp = await client.get("/health")

    assert resp.status_code == 200
    assert resp.headers.get("content-encoding") != "gzip", (
        "/health response (~29 bytes) must NOT be gzip-compressed"
    )
```

**Step 5c: Run behavioral gzip tests**

```bash
cd backend && python -m pytest tests/test_main.py -v
```
Expected: All 4 tests PASS (2 structural + 2 behavioral).

> **Note:** httpx preserves the `Content-Encoding` header from the ASGI response even after auto-decompressing the body. If these tests fail unexpectedly, debug the header assertion rather than removing the test — Gate #6 requires behavioral proof that gzip activates on large payloads.

**Step 6: Commit**

```bash
git add backend/app/main.py backend/tests/test_main.py
git commit -m "perf: add GZip compression middleware for large API responses"
```

---

## Task 2: Introduce Conservative Mode Flag + Reduce 3DBAG Scope

**Files:**
- Modify: `backend/app/config.py:56-58` (add feature flag)
- Modify: `backend/app/services/three_d_bag.py:14-39` (split into if/else with mode toggle)
- Modify: `backend/app/api/address.py:216` (cache version v23→v24)
- Modify: `backend/tests/test_three_d_bag.py` (update bbox URL assertions + add quality gates)

**Why:** This is the single biggest latency lever. The 3DBAG API takes 12-17s per page of bbox results. Reducing from 5 pages/150m to 2 pages/100m cuts cold load from 60-77s to ~20-30s. We INTRODUCE a conservative mode flag to preserve the current behavior as a runtime rollback switch.

**Current state:** `three_d_bag.py` has flat module-level constants at lines 14-39. There is NO conservative/accelerated branching. We introduce this.

### Step 1: Add feature flag to config

In `backend/app/config.py`, add after line 58 (`enable_lod22_context_enrichment`):

```python
    three_d_conservative_mode: bool = False
```

### Step 2: Write quality gate tests

Add to `backend/tests/test_three_d_bag.py`. **Do NOT add `DEFAULT_RADIUS` to the top-level import** — it doesn't exist yet, and `ImportError` at collection would break ALL existing tests in the file. Instead, each new test accesses it via `import app.services.three_d_bag as mod` at runtime, which gives `AttributeError` (proper TDD red phase) without breaking test collection.

The existing imports at L9-17 are unchanged:

**Test A: Accelerated mode constants are within latency bounds**

```python
def test_accelerated_mode_constants_within_latency_bounds():
    """Accelerated mode must stay within bounds that target sub-25s cold loads.

    Quality gate: prevents accidental budget/page inflation that would regress latency.
    At ~15s per page, 2 pages = ~30s which fits under 35s budget.
    """
    import app.services.three_d_bag as mod

    if mod.settings.three_d_conservative_mode:
        pytest.skip("Only applies to accelerated mode")

    assert mod.BBOX_MAX_PAGES <= 2, f"Max pages {mod.BBOX_MAX_PAGES} > 2"
    assert mod.BBOX_FETCH_BUDGET <= 35.0, f"Budget {mod.BBOX_FETCH_BUDGET}s > 35s"
    assert mod.BBOX_FETCH_RETRIES <= 4, f"Retries {mod.BBOX_FETCH_RETRIES} > 4"
    assert mod.DEFAULT_RADIUS <= 100.0, f"Default radius {mod.DEFAULT_RADIUS}m > 100m"
```

**Test B: Default radius produces correct bbox URL (behavioral)**

```python
@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_default_radius_produces_100m_bbox_url(mock_get_client):
    """Behavioral test: calling get_neighborhood_3d without explicit radius
    must produce bbox URLs at ±100m (not 150m).

    Quality gate: ensures the default radius actually affects runtime behavior,
    not just a constant value.
    """
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
        pytest.skip("Only applies to accelerated mode")

    await get_neighborhood_3d(
        pand_id="0363100012253924",
        rd_x=121005.0, rd_y=487005.0,
        lat=52.372, lng=4.892,
        # NO explicit radius — must use DEFAULT_RADIUS (100m in accelerated)
    )

    # Main bbox at 100m: center ± 100 = 120905,486905,121105,487105
    assert any("bbox=120905,486905,121105,487105" in u for u in seen_urls), (
        f"Expected 100m bbox URL not found. URLs seen: {seen_urls}"
    )
    # Near-ring at 90m: max(100*0.9, 80) = 90. center ± 90 = 120915,486915,121095,487095
    assert any("bbox=120915,486915,121095,487095" in u for u in seen_urls), (
        f"Expected 90m near-ring URL not found. URLs seen: {seen_urls}"
    )
```

**Test C: Building count floor at reduced radius**

```python
@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_neighborhood_3d_building_count_floor_at_reduced_radius(mock_get_client):
    """Dense mock neighborhoods must return target + neighbors at 100m radius.

    Quality gate: scope reduction must not drop building count below usable
    threshold. Simulates 9 neighbors within 100m.
    """
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    target_id = "0363100012253924"
    features = [
        _make_feature(f"036310009999{i:04d}", h_maaiveld=0.5, h_dak_max=10.0 + i, year=1990)
        for i in range(9)
    ]
    bbox_resp = _make_3dbag_response(features)

    def side_effect(url, **kwargs):
        s_url = str(url)
        match = re.search(r"NL\.IMBAG\.Pand\.(\d{16})", s_url)
        if match:
            return _make_mock_resp(_make_single_item_response(match.group(1)))
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = side_effect

    result = await get_neighborhood_3d(
        pand_id=target_id,
        rd_x=121005.0, rd_y=487005.0,
        lat=52.372, lng=4.892,
        radius=100.0,
    )

    assert result.target_pand_id == target_id, "Target must be found"
    assert len(result.buildings) >= 5, (
        f"Only {len(result.buildings)} buildings — scope reduction is too aggressive. "
        "Dense neighborhoods within 100m should return 5+ buildings."
    )
    assert result.buildings[0].pand_id == target_id, "Target must be first building"
```

**Test D: Target recovery at reduced radius**

```python
@pytest.mark.asyncio
@patch("app.services.three_d_bag._get_client")
async def test_neighborhood_3d_target_recovered_at_reduced_radius(mock_get_client):
    """When direct target fetch fails (502), bbox fallback at 100m still finds it.

    Quality gate: target recovery is critical for sunlight computation.
    """
    mock_client = AsyncMock()
    mock_get_client.return_value = mock_client

    target_id = "0363100012253924"
    features = [
        _make_feature(target_id, h_maaiveld=0.5, h_dak_max=12.0, year=1917),
        _make_feature("0363100099999999", h_maaiveld=0.5, h_dak_max=8.0, year=1990),
    ]
    bbox_resp = _make_3dbag_response(features)

    def _route(url, **kwargs):
        s_url = str(url)
        if "/items/NL.IMBAG.Pand." in s_url:
            resp = MagicMock()
            resp.raise_for_status.side_effect = httpx.HTTPStatusError(
                "502", request=MagicMock(), response=MagicMock(status_code=502),
            )
            return resp
        return _make_mock_resp(bbox_resp)

    mock_client.get.side_effect = _route

    result = await get_neighborhood_3d(
        pand_id=target_id,
        rd_x=121005.0, rd_y=487005.0,
        lat=52.372, lng=4.892,
        radius=100.0,
    )

    assert result.target_pand_id == target_id, (
        "Target must be recovered from bbox results even at reduced radius"
    )
    assert len(result.buildings) >= 2, "Must have target + at least 1 neighbor"
```

**Test E: Sunlight computation is viable after scope reduction**

```python
def test_surrounding_context_threshold_enables_sunlight():
    """Minimum viable 3D response: target + 1 neighbor = sunlight computable.

    Quality gate: the frontend's hasSurroundingContext() function returns true
    when the response has target_pand_id + at least 2 buildings.
    """
    response = Neighborhood3DResponse(
        address_id="0363010000696734",
        target_pand_id="0363100012253924",
        center=Neighborhood3DCenter(lat=52.37, lng=4.89, rd_x=121005.0, rd_y=487005.0),
        buildings=[
            BuildingBlock(
                pand_id="0363100012253924", ground_height=0.5,
                building_height=10.0, footprint=[[0, 0], [10, 0], [10, 8], [0, 8]],
            ),
            BuildingBlock(
                pand_id="0363100099999999", ground_height=0.5,
                building_height=8.0, footprint=[[20, 0], [30, 0], [30, 8], [20, 8]],
            ),
        ],
    )
    has_target = response.target_pand_id is not None
    has_enough_buildings = len(response.buildings) >= 2
    target_in_buildings = any(b.pand_id == response.target_pand_id for b in response.buildings)
    assert has_target and has_enough_buildings and target_in_buildings, (
        "Minimum viable response must enable sunlight computation"
    )
```

**Test F: Conservative mode constants byte-match pre-optimization HEAD**

```python
def test_conservative_mode_preserves_exact_pre_optimization_constants():
    """Conservative mode must produce EXACT pre-optimization values from commit 639db80.
    Accelerated mode must produce DIFFERENT (reduced) values.

    Quality gate: conservative mode is a FIDELITY rollback — it must restore the
    identical behavior that existed before this optimization.

    Implementation note: settings is a pydantic-settings singleton created once at
    import time (backend/app/config.py:80). Changing os.environ has NO effect on the
    existing settings object. We must use patch.object to modify the settings instance,
    then importlib.reload the three_d_bag module so its module-level if/else re-evaluates.
    """
    import importlib
    from unittest.mock import patch

    import app.config
    import app.services.three_d_bag as mod

    # Step 1: Verify accelerated mode (default) has REDUCED values.
    # This ALSO serves as the TDD red-phase trigger: DEFAULT_RADIUS doesn't exist
    # until the if/else branching is added (Step 4), so this line raises AttributeError.
    assert mod.DEFAULT_RADIUS == 100.0, (
        f"Accelerated default radius should be 100m, got {mod.DEFAULT_RADIUS}"
    )
    assert mod.BBOX_MAX_PAGES == 2, (
        f"Accelerated max pages should be 2, got {mod.BBOX_MAX_PAGES}"
    )

    # Step 2: Patch settings and reload to get conservative constants.
    PRE_OPT = {
        "BBOX_MAX_PAGES": 5,
        "BBOX_FETCH_BUDGET": 80.0,
        "BBOX_PAGE_TIMEOUT": 65.0,
        "FALLBACK_PAGE_TIMEOUT": 65.0,
        "NEARBY_CONTEXT_MIN_RADIUS": 100.0,
        "NEARBY_CONTEXT_TIMEOUT": 65.0,
        "NEARBY_CONTEXT_MAX_PAGES": 5,
        "IMMEDIATE_CONTEXT_TIMEOUT": 15.0,
        "PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS": 5.0,
        "PRIMARY_WAIT_AFTER_BACKUP_SECONDS": 10.0,
        "TARGET_FETCH_TIMEOUT": 30.0,
        "TARGET_FETCH_RETRIES": 6,
        "BBOX_FETCH_RETRIES": 10,
        "RETRY_BACKOFF_BASE": 0.35,
        "DEFAULT_RADIUS": 150.0,
    }

    with patch.object(app.config.settings, "three_d_conservative_mode", True):
        importlib.reload(mod)
        for name, expected in PRE_OPT.items():
            actual = getattr(mod, name)
            assert actual == expected, (
                f"Conservative mode {name} = {actual}, expected {expected} "
                f"(pre-optimization HEAD). Rollback is broken!"
            )

    # Restore accelerated constants for other tests in the session.
    importlib.reload(mod)
```

> **Why patch.object + reload:** The `settings = Settings()` singleton at `config.py:80` is created once at import. Setting env vars won't affect it. `patch.object(settings, 'three_d_conservative_mode', True)` modifies the live object, and `importlib.reload(three_d_bag)` re-evaluates the module-level `if settings.three_d_conservative_mode:` branch. The context manager auto-restores on exit, and the final `importlib.reload` restores accelerated constants.
>
> **TDD red phase:** Before Step 4 (implementation), `mod.DEFAULT_RADIUS` doesn't exist as a named constant — the module has hardcoded `150.0` in function signatures. The first assertion (`mod.DEFAULT_RADIUS == 100.0`) raises `AttributeError`, failing the test.

### Step 3: Run quality gate tests to verify they fail

```bash
cd backend && python -m pytest tests/test_three_d_bag.py::test_accelerated_mode_constants_within_latency_bounds tests/test_three_d_bag.py::test_default_radius_produces_100m_bbox_url tests/test_three_d_bag.py::test_conservative_mode_preserves_exact_pre_optimization_constants -v
```
Expected failures (Step 1 already added the config field, but the if/else branching in three_d_bag.py hasn't been added yet):
- **Test A:** FAIL with `AttributeError: module 'app.services.three_d_bag' has no attribute 'DEFAULT_RADIUS'` at `mod.DEFAULT_RADIUS`. The module has hardcoded `150.0` in function signatures; the named constant only exists after Step 4.
- **Test B:** FAIL — `get_neighborhood_3d()` uses hardcoded `radius=150.0`, so bbox URLs are at ±150m not ±100m. The URL assertions on 100m coordinates fail.
- **Test F:** FAIL with same `AttributeError` on `mod.DEFAULT_RADIUS` at the accelerated-mode assertion.
- **Tests C, D, E:** PASS — they use mocked data with explicit `radius=100.0`, independent of module constants.
- **Existing tests:** PASS — `DEFAULT_RADIUS` is NOT in the top-level import block, so test collection succeeds. All 434+ existing tests unaffected.

### Step 4: Restructure constants with conservative mode toggle

In `backend/app/services/three_d_bag.py`, replace lines 14-39 (the flat constants block) with:

```python
# --- Constants that don't vary between modes ---
BBOX_PAGE_LIMIT = 100
LOD22_ENRICH_CONCURRENCY = 8
MIN_FETCH_BUDGET = 1.0
FALLBACK_RADIUS_FACTOR = 0.6
FALLBACK_MIN_RADIUS = 60.0
FALLBACK_PAGE_LIMIT = 50
NEARBY_CONTEXT_LIMIT = 100
IMMEDIATE_CONTEXT_RADIUS = 30.0
IMMEDIATE_CONTEXT_LIMIT = 200
IMMEDIATE_CONTEXT_MAX_PAGES = 2
SECONDARY_FALLBACK_RADIUS = 50.0
TRANSIENT_STATUS_CODES = {502, 503, 504}

# --- Mode-dependent constants ---
if settings.three_d_conservative_mode:
    # Original high-fidelity profile — rollback safety valve.
    # These values are IDENTICAL to pre-optimization HEAD (commit 639db80).
    BBOX_MAX_PAGES = 5
    BBOX_FETCH_BUDGET = 80.0
    BBOX_PAGE_TIMEOUT = 65.0
    FALLBACK_PAGE_TIMEOUT = 65.0
    NEARBY_CONTEXT_MIN_RADIUS = 100.0
    NEARBY_CONTEXT_TIMEOUT = 65.0
    NEARBY_CONTEXT_MAX_PAGES = 5
    IMMEDIATE_CONTEXT_TIMEOUT = 15.0
    PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS = 5.0
    PRIMARY_WAIT_AFTER_BACKUP_SECONDS = 10.0
    TARGET_FETCH_TIMEOUT = 30.0
    TARGET_FETCH_RETRIES = 6
    BBOX_FETCH_RETRIES = 10
    RETRY_BACKOFF_BASE = 0.35
    DEFAULT_RADIUS = 150.0
else:
    # Latency-optimized for sub-25s cold loads.
    BBOX_MAX_PAGES = 2
    BBOX_FETCH_BUDGET = 35.0
    BBOX_PAGE_TIMEOUT = 30.0
    FALLBACK_PAGE_TIMEOUT = 30.0
    NEARBY_CONTEXT_MIN_RADIUS = 80.0
    NEARBY_CONTEXT_TIMEOUT = 30.0
    NEARBY_CONTEXT_MAX_PAGES = 2
    IMMEDIATE_CONTEXT_TIMEOUT = 15.0
    PRIMARY_WAIT_AFTER_EMPTY_BACKUP_SECONDS = 1.0
    PRIMARY_WAIT_AFTER_BACKUP_SECONDS = 2.0
    TARGET_FETCH_TIMEOUT = 20.0
    TARGET_FETCH_RETRIES = 4
    BBOX_FETCH_RETRIES = 4
    RETRY_BACKOFF_BASE = 0.2
    DEFAULT_RADIUS = 100.0
```

**Key changes in accelerated mode:**
| Constant | Conservative (current) | Accelerated (new default) | Rationale |
|----------|----------------------|--------------------------|-----------|
| `BBOX_MAX_PAGES` | 5 | 2 | 2 pages x 100/page = 200 max |
| `BBOX_FETCH_BUDGET` | 80s | 35s | 2 pages x ~15s + margin |
| `BBOX_PAGE_TIMEOUT` | 65s | 30s | Single page in 15-20s |
| `NEARBY_CONTEXT_MIN_RADIUS` | 100m | 80m | Keeps near-ring (90m) distinct from main bbox (100m) |
| `TARGET_FETCH_TIMEOUT` | 30s | 20s | Target resolves in ~2s |
| `TARGET_FETCH_RETRIES` | 6 | 4 | Faster failure |
| `BBOX_FETCH_RETRIES` | 10 | 4 | Same rationale |
| `PRIMARY_WAIT_AFTER_BACKUP_SECONDS` | 10s | 2s | Don't wait long for slower primary |
| `DEFAULT_RADIUS` | 150m | 100m | Sufficient visual context |

### Step 5: Update function signatures to use DEFAULT_RADIUS

In `backend/app/services/three_d_bag.py`:

At `_get_neighborhood_3d_impl` (currently L612):
```python
    radius: float = DEFAULT_RADIUS,
```

At `get_neighborhood_3d` (currently L757):
```python
    radius: float = DEFAULT_RADIUS,
```

### Step 6: Update existing test bbox URL assertions

Two existing tests assert on specific bbox coordinates computed from the old 150m default radius. With DEFAULT_RADIUS=100 and NEARBY_CONTEXT_MIN_RADIUS=80:
- **Main bbox:** center ± 100 = `120905,486905,121105,487105` (was `120855,486855,121155,487155`)
- **Near-ring:** max(100×0.9, 80) = 90 → center ± 90 = `120915,486915,121095,487095` (was `120870,486870,121140,487140`)

**Update `test_get_neighborhood_3d_prefetches_near_ring_without_duping_context` (L578-613):**

At L610-611, change:
```python
    # Near-ring radius query (rd ±90m with radius=100) is prefetched in parallel.
    assert any("bbox=120915,486915,121095,487095" in u for u in seen_urls)
```

**Update `test_get_neighborhood_3d_keeps_completed_near_ring_context_when_bbox_has_context` (L616-657):**

At L634, change:
```python
        if "bbox=120915,486915,121095,487095" in s_url:
            # Near-ring prefetch (rd ±90m).
            return _make_mock_resp(near_resp)
        if "bbox=120905,486905,121105,487105" in s_url:
            # Broader bbox query (rd ±100m).
```

### Step 7: Bump cache version

In `backend/app/api/address.py`, L216:
```python
    cache_key = f"neighborhood3d:v24:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
```
Update the comment at L215 to reference the scope reduction.

### Step 8: Run all backend tests

```bash
cd backend && python -m pytest -x -q -m "not live"
```
Expected: All 434+ existing tests pass + ~8 new quality gate tests (A-F + updated near-ring assertions). Verify specifically:
- Updated near-ring tests pass with new bbox coordinates
- Quality gate tests A-F all pass (including conservative byte-match)
- Pagination tests (L662, L992) pass (they route generically on `"bbox="` and `"offset="`, not specific coordinates)

### Step 9: Run ruff

```bash
cd backend && ruff check .
```

### Step 10: Commit

```bash
git add backend/app/config.py backend/app/services/three_d_bag.py backend/app/api/address.py backend/tests/test_three_d_bag.py
git commit -m "perf: reduce 3DBAG scope for sub-25s cold loads

Introduce BUURT_THREE_D_CONSERVATIVE_MODE flag (default false).
Accelerated mode: radius 150m->100m, pages 5->2, budget 80s->35s.
Conservative mode preserves exact pre-optimization behavior as rollback.
Cache version v23->v24. Quality gate tests for building count, target
recovery, and sunlight stability."
```

---

## Task 3: Add pand_id to Lookup Response

**Files:**
- Modify: `backend/app/models/address.py:15-33` (add field)
- Modify: `backend/app/services/bag.py` (add `get_pand_id()`)
- Modify: `backend/app/api/address.py:74-93` (resolve pand_id in lookup, with 3s timeout)
- Test: `backend/tests/test_bag.py` (add tests for `get_pand_id`)
- Test: `backend/tests/test_address_api.py:75-111` (update existing + add new lookup tests)
- Modify: `frontend/src/types/api.ts:14-33` (add field to TS interface)

**Why:** Currently the frontend can't start 3D fetches until `getBuildingFacts()` returns `pand_id` (~2s after address lookup). By including `pand_id` in the lookup response, the frontend can start 3D fetches immediately — saving ~2s on the critical path.

**Timeout budget and SLA contract:**

| Metric | Before | After (worst case) | After (typical) |
|--------|--------|-------------------|-----------------|
| Lookup P50 | ~1.0s | ~1.3s (+BAG WFS) | ~1.3s |
| Lookup P99 | ~1.5s | ~4.5s (BAG timeout) | ~2.0s |
| Lookup max | ~2.0s | ~5.0s (BAG 3s + margin) | ~2.5s |

The `bag.get_pand_id()` call is wrapped in `asyncio.wait_for(timeout=3.0)`. This provides a hard SLA:
- **Best case:** BAG WFS responds in ~200-500ms. Lookup adds <0.5s.
- **Worst case:** BAG WFS times out at 3.0s. Lookup returns without pand_id. Frontend falls back to building facts pand_id (existing path).
- **Error case:** BAG WFS throws exception. Caught silently. pand_id = None.

**Trade-off:** `get_pand_id()` calls `_fetch_verblijfsobject()` which is also called by `get_building_facts()`. This means the same BAG WFS query runs twice. This is acceptable because: (1) BAG WFS is fast (~200-500ms), (2) the 2nd call often hits BAG-side caching, (3) the 2s earlier 3D fetch start outweighs the redundant call.

### Step 1: Write failing test — `get_pand_id` function

Add to `backend/tests/test_bag.py` (at the end of the file):

```python
@pytest.mark.asyncio
async def test_get_pand_id_returns_pand_from_vbo(httpx_mock):
    """get_pand_id resolves VBO to pand_id via BAG WFS."""
    from app.services.bag import get_pand_id

    httpx_mock.add_response(
        url=re.compile(r".*typeName=bag%3Averblijfsobject.*|.*typeName=bag:verblijfsobject.*"),
        json={
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {
                    "identificatie": "0363010000696734",
                    "pandidentificatie": "0363100012253924",
                },
                "geometry": {"type": "Point", "coordinates": [121286.0, 487296.0]},
            }],
        },
    )

    result = await get_pand_id("0363010000696734")
    assert result == "0363100012253924"


@pytest.mark.asyncio
async def test_get_pand_id_returns_none_on_missing_vbo(httpx_mock):
    """get_pand_id returns None when VBO not found."""
    from app.services.bag import get_pand_id

    httpx_mock.add_response(
        url=re.compile(r".*typeName=bag%3Averblijfsobject.*|.*typeName=bag:verblijfsobject.*"),
        json={"type": "FeatureCollection", "features": []},
    )

    result = await get_pand_id("0000000000000000")
    assert result is None
```

### Step 2: Run test to verify it fails

```bash
cd backend && python -m pytest tests/test_bag.py::test_get_pand_id_returns_pand_from_vbo -v
```
Expected: FAIL — `get_pand_id` does not exist yet.

### Step 3: Implement `get_pand_id` in BAG service

In `backend/app/services/bag.py`, add after `get_building_facts`:

```python
async def get_pand_id(vbo_id: str) -> str | None:
    """Resolve VBO ID to pand_id via BAG WFS (lightweight, no full building facts)."""
    vbo_data = await _fetch_verblijfsobject(vbo_id)
    if not vbo_data:
        return None
    return vbo_data.get("pandidentificatie")
```

### Step 4: Run `get_pand_id` tests

```bash
cd backend && python -m pytest tests/test_bag.py::test_get_pand_id_returns_pand_from_vbo tests/test_bag.py::test_get_pand_id_returns_none_on_missing_vbo -v
```
Expected: PASS

### Step 5: Write failing tests — lookup endpoint includes pand_id

Add to `backend/tests/test_address_api.py`:

```python
@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_includes_pand_id(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    """Lookup response includes pand_id resolved from BAG WFS."""
    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
            rd_x=121286.0,
            rd_y=487296.0,
        )
    )
    mock_bag.get_pand_id = AsyncMock(return_value="0363100012253924")

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["pand_id"] == "0363100012253924"
    mock_bag.get_pand_id.assert_called_once_with("0363010000696734")


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_succeeds_when_pand_id_resolution_fails(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    """Lookup still works when BAG WFS pand_id lookup fails."""
    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
            rd_x=121286.0,
            rd_y=487296.0,
        )
    )
    mock_bag.get_pand_id = AsyncMock(side_effect=Exception("BAG WFS timeout"))

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("pand_id") is None  # Graceful degradation
    assert data["display_name"] == "Kalverstraat 1, 1012NX Amsterdam"


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_pand_id_respects_3s_timeout(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    """pand_id resolution is capped at 3s and endpoint returns quickly."""
    import asyncio
    import time

    from app.config import settings

    async def slow_pand_id(vbo_id):
        await asyncio.sleep(10)  # Simulates slow BAG WFS
        return "0363100012253924"

    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
        )
    )
    mock_bag.get_pand_id = AsyncMock(side_effect=slow_pand_id)

    started = time.monotonic()
    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    elapsed = time.monotonic() - started

    assert resp.status_code == 200
    assert elapsed <= 3.5, (
        f"Lookup should return quickly when pand_id times out; took {elapsed:.2f}s"
    )
    data = resp.json()
    assert data.get("pand_id") is None  # Timed out
    # Verify shorter TTL when pand_id failed transiently
    mock_cache_set.assert_called_once()
    _, kwargs = mock_cache_set.call_args
    expected_ttl = min(settings.cache_ttl_lookup, 300)
    assert kwargs.get("ttl") == expected_ttl, (
        "Transient pand_id failure should use min(cache_ttl_lookup, 300). "
        f"Expected {expected_ttl}, got {kwargs.get('ttl')}"
    )


@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_uses_full_ttl_when_pand_id_resolved(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    """Successful pand_id resolution caches with configured lookup TTL."""
    from app.config import settings

    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            adresseerbaar_object_id="0363010000696734",
            latitude=52.372,
            longitude=4.892,
        )
    )
    mock_bag.get_pand_id = AsyncMock(return_value="0363100012253924")

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    mock_cache_set.assert_called_once()
    _, kwargs = mock_cache_set.call_args
    assert kwargs.get("ttl") == settings.cache_ttl_lookup, (
        "Successful lookup should use configured cache_ttl_lookup. "
        f"Expected {settings.cache_ttl_lookup}, got {kwargs.get('ttl')}"
    )
```

### Step 6: Run test to verify it fails

```bash
cd backend && python -m pytest tests/test_address_api.py::test_lookup_includes_pand_id -v
```
Expected: FAIL — lookup endpoint doesn't call `bag.get_pand_id()` yet.

### Step 7: Add pand_id field to ResolvedAddress model

In `backend/app/models/address.py`, add after `adresseerbaar_object_id` (L18):

```python
    pand_id: str | None = None
```

So the field order becomes: `id`, `nummeraanduiding_id`, `adresseerbaar_object_id`, `pand_id`, `display_name`, ...

### Step 8: Update lookup endpoint with timeout-budgeted pand_id resolution

In `backend/app/api/address.py`, replace the `address_lookup` function (L74-93):

```python
@router.get("/lookup", response_model=ResolvedAddress)
async def address_lookup(
    id: str = Query(..., description="Locatieserver document ID"),
):
    """Resolve a locatieserver suggestion to full address details."""
    cache_key = f"lookup:v2:{id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return ResolvedAddress(**cached)

    try:
        resolved = await locatieserver.lookup(id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Locatieserver unavailable: {exc}") from exc

    if resolved is None:
        raise HTTPException(status_code=404, detail="Address not found")

    # Resolve pand_id with 3s budget — enables early 3D fetch on frontend.
    # Non-critical: frontend falls back to building facts pand_id if this fails.
    pand_id_attempted = False
    if resolved.adresseerbaar_object_id:
        pand_id_attempted = True
        try:
            resolved.pand_id = await asyncio.wait_for(
                bag.get_pand_id(resolved.adresseerbaar_object_id),
                timeout=3.0,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            logger.warning(
                "pand_id resolution failed for VBO %s: %s",
                resolved.adresseerbaar_object_id, exc,
            )

    # Shorter TTL when pand_id resolution failed transiently: retry after 5 minutes
    # instead of locking in pand_id=None for 24h (which suppresses early 3D kickoff).
    # The logger.warning above surfaces persistent BAG WFS issues in monitoring.
    ttl = settings.cache_ttl_lookup
    if pand_id_attempted and resolved.pand_id is None:
        ttl = min(ttl, 300)  # 5 minutes

    await cache_set(cache_key, resolved.model_dump(), ttl=ttl)
    return resolved
```

> Note: `asyncio` is already imported at L1, `bag` is already imported at L26. Cache key bumped to `lookup:v2:{id}` (was `lookup:{id}`).

### Step 9: Update existing lookup tests to mock bag

The existing `test_lookup_endpoint` (L75-100) and `test_lookup_not_found` (L103-111) mock `locatieserver` but NOT `bag`. Since the endpoint now calls `bag.get_pand_id()`, these tests need `@patch("app.api.address.bag")`.

**Update `test_lookup_endpoint` (L75-100):**

Add `@patch("app.api.address.bag")` decorator (between cache_set and locatieserver patches) and `mock_bag` parameter:

```python
@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_endpoint(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    mock_ls.lookup = AsyncMock(
        return_value=ResolvedAddress(
            id="adr-123",
            display_name="Kalverstraat 1, 1012NX Amsterdam",
            street="Kalverstraat",
            house_number="1",
            postcode="1012NX",
            city="Amsterdam",
            latitude=52.372,
            longitude=4.892,
            rd_x=121286.0,
            rd_y=487296.0,
            adresseerbaar_object_id="0363010000696734",
        )
    )
    mock_bag.get_pand_id = AsyncMock(return_value=None)

    resp = await client.get("/api/address/lookup", params={"id": "adr-123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["street"] == "Kalverstraat"
    assert data["latitude"] == 52.372
```

**Update `test_lookup_not_found` (L103-111):**

Same pattern — add `@patch("app.api.address.bag")` and `mock_bag` parameter:

```python
@pytest.mark.asyncio
@patch("app.api.address.cache_get", new_callable=AsyncMock, return_value=None)
@patch("app.api.address.cache_set", new_callable=AsyncMock)
@patch("app.api.address.bag")
@patch("app.api.address.locatieserver")
async def test_lookup_not_found(mock_ls, mock_bag, mock_cache_set, mock_cache_get, client):
    mock_ls.lookup = AsyncMock(return_value=None)

    resp = await client.get("/api/address/lookup", params={"id": "adr-nonexistent"})
    assert resp.status_code == 404
```

### Step 10: Run all lookup tests

```bash
cd backend && python -m pytest tests/test_address_api.py -k lookup -v
```
Expected: All lookup tests PASS (existing + 4 new).

### Step 11: Update frontend TypeScript type

In `frontend/src/types/api.ts`, add after `adresseerbaar_object_id` (L17):

```typescript
  pand_id?: string;
```

### Step 12: Run full test suites

```bash
cd backend && python -m pytest -x -q -m "not live"
cd frontend && npm run build
```

### Step 13: Commit

```bash
git add backend/app/models/address.py backend/app/services/bag.py backend/app/api/address.py backend/tests/test_bag.py backend/tests/test_address_api.py frontend/src/types/api.ts
git commit -m "feat: include pand_id in lookup response for early 3D fetch

Resolves VBO->pand_id via BAG WFS during address lookup with 3s timeout
budget. Enables frontend to start 3D fetches ~2s earlier. Non-critical:
falls back gracefully if BAG is slow/down. Cache key bumped to lookup:v2."
```

---

## Task 4: Frontend — Parallel 3D Fetch Kickoff

**Files:**
- Modify: `frontend/src/App.tsx:489-747` (add early kickoff branch in handleAddressSelect)
- Modify: `frontend/src/App.test.tsx` (add regression tests for early kickoff path)

**Why:** Currently the 3D fetch chain starts at `App.tsx:672` — AFTER `getBuildingFacts()` completes (L641). With `pand_id` now available from the lookup response, we can start 3D fetches immediately after lookup, saving ~2s on the critical path.

**Frontend timeout: UNCHANGED at 90s (L80 of `api.ts`).** The 90s timeout covers conservative mode backend budget (80s) + network margin. Reducing it would cause premature aborts when conservative mode is active on the backend. The actual latency improvement comes from backend scope reduction, not tighter frontend timeouts.

**Approach: `early3DStarted` flag + separated placeholder/fetch concerns.**

The early branch starts 3D API fetches immediately after lookup (Phase 1 + Phase 2). Placeholder rendering (`createImmediateTarget3D`) is **separated and unconditional** — it always runs when building facts arrive, regardless of `early3DStarted`. This preserves T+0 visual feedback parity. Functional `setNeighborhood3D(prev => ...)` prevents the placeholder from overwriting better data that the early fetch may have already produced. API fetch paths are mutually exclusive via `early3DStarted`.

### Step 1: Add early 3D fetch branch

In `frontend/src/App.tsx`, in `handleAddressSelect`, add AFTER L532 (`const { rd_x, rd_y, latitude, longitude } = resolved;`), BEFORE the risk card fire-and-forget blocks (L534 `setRiskLoading(true);`):

```typescript
// --- EARLY 3D FETCH ---
// If pand_id is available from lookup, start 3D pipeline immediately
// instead of waiting for building facts (~2s earlier).
const earlyPandId = resolved.pand_id ?? null;
let early3DStarted = false;

if (earlyPandId && vboId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
  early3DStarted = true;
  setNeighborhood3DLoading(true);
  setSurroundingLoading(true);

  let phase1TargetData: Neighborhood3DResponse | null = null;
  let phase2Done = false;
  let phase2HasRenderableData = false;

  // Phase 1: Quick target building 3D (~2s)
  void (async () => {
    try {
      const target3d = await getBuilding3D(vboId, earlyPandId, rd_x, rd_y, latitude, longitude);
      const hasTargetBuilding = target3d.buildings.length > 0;
      if (hasTargetBuilding) {
        phase1TargetData = target3d;
      }
      if (
        (!phase2Done || !phase2HasRenderableData)
        && neighborhood3DRequestId.current === requestId
      ) {
        if (hasTargetBuilding) {
          setNeighborhood3D(target3d);
          setNeighborhood3DLoading(false);
        }
        // If no target building, keep loading=true — Phase 2 will handle it.
        // Clearing loading here without data would show blank viewer with no spinner.
      }
    } catch { /* Phase 2 handles full fetch */ }
  })();

  // Phase 2: Full neighborhood (~15-22s with reduced scope)
  void (async () => {
    try {
      const n3d = await getNeighborhood3D(vboId, earlyPandId, rd_x, rd_y, latitude, longitude);
      phase2Done = true;
      const merged3d = mergeNeighborhood3DWithFallback(n3d, phase1TargetData);
      phase2HasRenderableData = merged3d.buildings.length > 0;
      if (neighborhood3DRequestId.current === requestId) {
        setNeighborhood3D(merged3d);
        setNeighborhood3DLoading(false);
        setSurroundingLoading(false);
        const canCompute = hasSurroundingContext(merged3d);
        setSunlightUnavailable(!canCompute);
      }
    } catch {
      phase2Done = true;
      phase2HasRenderableData = false;
      if (neighborhood3DRequestId.current === requestId) {
        setNeighborhood3DLoading(false);
        setSurroundingLoading(false);
        setSunlightUnavailable(true);
      }
    }
  })();
}
```

**State contracts to prevent race/stale-state bugs:**
- `early3DStarted` is set **synchronously** before any async work — no race window
- Every state setter is guarded by `neighborhood3DRequestId.current === requestId` — stale requests don't update state
- `phase1TargetData`, `phase2Done`, `phase2HasRenderableData` are local to the function scope — no shared mutable state with the fallback path
- **Placeholder rendering is unconditional** — runs when building facts arrive regardless of `early3DStarted`, using functional `setNeighborhood3D(prev => ...)` to avoid overwriting better data from the early fetch
- **API fetch paths are mutually exclusive** — only ONE of early branch or fallback path starts 3D API calls, controlled by `early3DStarted` flag
- Early path's Phase 1 may complete before building facts arrive — the functional setState in the placeholder block preserves the real data (`prev.buildings.length > 0 ? prev : placeholder`)

### Step 2: Split existing block — placeholder always renders, API fetch guarded

At L672-736, the existing code does TWO things in one block:
1. Creates a `createImmediateTarget3D` placeholder from building facts (T+0 visual feedback)
2. Starts 3D API fetches (Phase 1 + Phase 2)

These must be **separated**. The placeholder should ALWAYS render when building facts arrive (even when early fetch is active), but API fetches should only start when `!early3DStarted`.

Replace L672-739 with:

```typescript
        const pandId = building.building?.pand_id;

        // --- PLACEHOLDER: always render from building facts (regardless of early3DStarted) ---
        // This preserves T+0 visual feedback parity with the non-early path.
        if (pandId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
          const immediateTargetData = createImmediateTarget3D(
            vboId,
            pandId,
            rd_x,
            rd_y,
            latitude,
            longitude,
            building.building,
          );
          if (neighborhood3DRequestId.current === requestId) {
            // Functional setState: only apply placeholder if early fetch hasn't
            // already produced better data (real 3D model > synthetic placeholder).
            setNeighborhood3D(prev =>
              prev && prev.buildings.length > 0 ? prev : immediateTargetData
            );
            setNeighborhood3DLoading(false);
          }
        }

        // --- 3D API FETCHES: only when early fetch didn't already start them ---
        if (!early3DStarted && pandId && rd_x != null && rd_y != null && latitude != null && longitude != null) {
          setSurroundingLoading(true);

          let phase2Done = false;
          let phase2HasRenderableData = false;
          let phase1TargetData: Neighborhood3DResponse | null = null;

          // Phase 0 placeholder already rendered above.

          void (async () => {
            try {
              const target3d = await getBuilding3D(vboId, pandId, rd_x, rd_y, latitude, longitude);
              const hasTargetBuilding = target3d.buildings.length > 0;
              if (hasTargetBuilding) {
                phase1TargetData = target3d;
              }
              if (
                (!phase2Done || !phase2HasRenderableData)
                && neighborhood3DRequestId.current === requestId
              ) {
                if (hasTargetBuilding) {
                  setNeighborhood3D(target3d);
                }
                setNeighborhood3DLoading(false);
              }
            } catch { /* Phase 2 handles full fetch */ }
          })();

          void (async () => {
            try {
              const n3d = await getNeighborhood3D(vboId, pandId, rd_x, rd_y, latitude, longitude);
              phase2Done = true;
              const merged3d = mergeNeighborhood3DWithFallback(n3d, phase1TargetData);
              phase2HasRenderableData = merged3d.buildings.length > 0;
              if (neighborhood3DRequestId.current === requestId) {
                setNeighborhood3D(merged3d);
                setNeighborhood3DLoading(false);
                setSurroundingLoading(false);
                const canCompute = hasSurroundingContext(merged3d);
                setSunlightUnavailable(!canCompute);
              }
            } catch {
              phase2Done = true;
              phase2HasRenderableData = false;
              if (neighborhood3DRequestId.current === requestId) {
                setNeighborhood3DLoading(false);
                setSurroundingLoading(false);
                setSunlightUnavailable(true);
              }
            }
          })();
        } else if (!early3DStarted) {
          setSunlightUnavailable(true);
        }
```

**UX timeline comparison:**

| Event | Early path | Fallback path |
|-------|-----------|---------------|
| T+0 | Address selected | Address selected |
| T+1.5s | Lookup → early 3D fetches start | Lookup → no pand_id |
| T+3.5s | Building facts → **placeholder renders** | Building facts → **placeholder renders** |
| T+3.5-5s | Phase 1 target overwrites placeholder | Phase 1 target overwrites placeholder |
| T+16-22s | Phase 2 neighborhood context | T+62-77s neighborhood context |

Both paths render the placeholder at the same time (when building facts arrive). The early path just starts the API fetches ~2s earlier. If early Phase 1 has already returned real data by the time building facts arrive, the functional `setNeighborhood3D(prev => ...)` preserves the better data.

This ensures only ONE 3D API pipeline runs per address selection:
| Scenario | early3DStarted | Placeholder | API fetch source |
|----------|---------------|-------------|-----------------|
| Lookup has pand_id | `true` | From building facts (always) | Early branch |
| Lookup lacks pand_id | `false` | From building facts (always) | Existing fallback |
| Both pand_ids missing | `false` | None | Neither — `setSunlightUnavailable(true)` |

### Step 2b: Add frontend regression tests for early kickoff path

Add to `frontend/src/App.test.tsx`:

```typescript
it('starts 3D fetches from lookup pand_id before building facts resolves', async () => {
  let resolveBuilding: ((value: ReturnType<typeof makeBuildingResponse>) => void) | null = null;
  mockLookup.mockResolvedValue(makeResolvedAddress({ pand_id: '0363100012253924' }));
  mockBuilding.mockReturnValue(
    new Promise((resolve) => {
      resolveBuilding = resolve as (value: ReturnType<typeof makeBuildingResponse>) => void;
    }),
  );
  mockBuilding3D.mockResolvedValue(makeNeighborhood3DResponse());
  mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

  renderApp();
  await selectAddress();

  await waitFor(() => {
    expect(mockBuilding3D).toHaveBeenCalledWith(
      'vbo-123',
      '0363100012253924',
      121000,
      487000,
      52.3676,
      4.8846,
    );
  });
  await waitFor(() => {
    expect(mockNeighborhood3D).toHaveBeenCalledWith(
      'vbo-123',
      '0363100012253924',
      121000,
      487000,
      52.3676,
      4.8846,
    );
  });

  // Clean up unresolved building promise to avoid test leakage.
  resolveBuilding?.(makeBuildingResponse());
});

it('does not start duplicate 3D pipeline when lookup pand_id is present', async () => {
  mockLookup.mockResolvedValue(makeResolvedAddress({ pand_id: '0363100012253924' }));
  mockBuilding.mockResolvedValue(makeBuildingResponse());
  mockBuilding3D.mockResolvedValue(makeNeighborhood3DResponse());
  mockNeighborhood3D.mockResolvedValue(makeNeighborhood3DResponse());

  renderApp();
  await selectAddress();

  await waitFor(() => {
    expect(mockBuilding3D).toHaveBeenCalled();
    expect(mockNeighborhood3D).toHaveBeenCalled();
  });
  expect(mockBuilding3D).toHaveBeenCalledTimes(1);
  expect(mockNeighborhood3D).toHaveBeenCalledTimes(1);
});
```

These tests are mandatory for Gate #10 and specifically cover the new early branch (the highest-risk async change).

### Step 3: Run frontend tests (targeted)

```bash
cd frontend && npm run test -- App.test.tsx
```
Expected: New early-path tests pass.

### Step 3b: Run full frontend suite

```bash
cd frontend && npm run test
```
Expected: All 445+ existing + 2 new tests pass.

### Step 4: Run frontend build (TypeScript strict)

```bash
cd frontend && npm run build
```
Expected: Clean build, no unused locals.

### Step 5: Commit

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "perf: start 3D fetches immediately after address lookup

Use pand_id from lookup response to start 3D pipeline ~2s earlier.
Falls back to building facts pand_id when lookup lacks it.
Mutual exclusion via early3DStarted flag prevents duplicate pipelines."
```

---

## Task 5: Update Documentation

**Files:**
- Modify: `backend/CLAUDE.md` (update 3DBAG section)

### Step 1: Update 3DBAG section in backend/CLAUDE.md

Replace the `## 3DBAG & 3D Viewer` section:

```markdown
## 3DBAG & 3D Viewer

- **Scope modes:**
  - **Accelerated (default):** bbox radius 100m, max pages 2, budget 35s. ~80-120 buildings. Sub-25s cold load target
  - **Conservative:** bbox radius 150m, max pages 5, budget 80s. ~150-250 buildings. Enable via `BUURT_THREE_D_CONSERVATIVE_MODE=True`. This is the rollback safety valve — preserves exact pre-optimization behavior
- **Cache version v24** for neighborhood3d (bumped for scope reduction)
- **Lookup pand_id:** Lookup endpoint resolves VBO->pand_id with 3s timeout budget. Cache key: `lookup:v2:{id}`. Enables early 3D fetch without waiting for building facts
- **GZip compression:** All responses >1KB compressed via GZipMiddleware
- **3DBAG bbox fallback for target recovery:** When single-item endpoint returns 502, scan bbox results for target `pand_id`
- **3DBAG building coverage:** Controlled by mode constants. After `asyncio.gather`, must `await near_task` — race condition where backup query cancels primary
- **Single-flight request deduplication:** `_in_flight: dict[str, asyncio.Task]` at module level for `get_neighborhood_3d`. Use `asyncio.shield()` for shared tasks. Key: `{pand_id}:{rd_x:.0f}:{rd_y:.0f}`. Clean up in `finally`
- **LoD 2.2 is mandatory for all buildings** (including neighbors). Sunlight shadow analysis requires accurate roof geometry
- **Cold latency baselines (Feb 17, pre-optimization):** Damrak 1 = 77s/167 buildings, Kerkstraat 10 = 62s/251 buildings. 90%+ of wait time is 3DBAG API latency
- **PDOK Luchtfoto RGB:** `service.pdok.nl/hwh/luchtfotorgb/wms/v1_0`, layer `Actueel_orthoHR`, JPEG format, CC BY 4.0 license
```

### Step 2: Commit

```bash
git add backend/CLAUDE.md
git commit -m "docs: update 3DBAG scope modes and latency baselines"
```

---

## Task 6: Full Verification

### Step 1: Run all backend tests

```bash
cd backend && python -m pytest -x -q -m "not live"
```
Expected: 434+ existing + ~16 new tests pass (no failures). New tests: 4 gzip (Task 1) + 6 quality gates A-F (Task 2) + 2 `get_pand_id` tests (Task 3) + 4 lookup pand_id tests (Task 3).

### Step 2: Run ruff

```bash
cd backend && ruff check .
```

### Step 3: Run all frontend tests

```bash
cd frontend && npm run test
```
Expected: 445+ existing + 2 new early-kickoff tests pass.

### Step 4: Run frontend build (TypeScript strict)

```bash
cd frontend && npm run build
```
Expected: Clean build.

### Step 5: Verify acceptance criteria

Cross-check against the 10 gates from the plan header:
- [ ] **Gate 1 — Building count ≥5:** `test_neighborhood_3d_building_count_floor_at_reduced_radius` passes
- [ ] **Gate 2 — Target recovery 100%:** `test_neighborhood_3d_target_recovered_at_reduced_radius` passes
- [ ] **Gate 3 — Sunlight viability:** `test_surrounding_context_threshold_enables_sunlight` passes
- [ ] **Gate 4 — No regression:** All 434+ backend and 445+ frontend tests pass
- [ ] **Gate 5 — Conservative byte-match:** `test_conservative_mode_preserves_exact_pre_optimization_constants` passes
- [ ] **Gate 6 — GZip on large payloads:** `test_gzip_middleware_registered` + `test_gzip_compresses_large_3d_response` pass
- [ ] **Gate 7 — Lookup SLA:** `test_lookup_pand_id_respects_3s_timeout` passes and asserts <=3.5s timeout-path response
- [ ] **Gate 8 — Frontend timeout:** `api.ts:80` still reads `90000` (covers conservative 80s + 10s margin)
- [ ] **Gate 9 — Accelerated bounds:** `test_accelerated_mode_constants_within_latency_bounds` passes
- [ ] **Gate 10 — Early kickoff correctness:** new App tests prove (a) early 3D starts before building facts resolves, (b) only one 3D pipeline runs

### Step 6: Manual smoke test (if dev servers available)

```bash
# Terminal 1:
cd backend && uvicorn app.main:app --reload --port 8000
# Terminal 2:
cd frontend && npm run dev
```

1. Search for "Damrak 1, Amsterdam" — previously 77s cold load
2. Observe: target building should appear in ~3-4s
3. Observe: surrounding buildings should appear in ~16-22s
4. Check browser DevTools Network tab for `Content-Encoding: gzip` header on large responses
5. Verify response sizes are compressed (3D response should be <500KB)
6. Test conservative rollback: set `BUURT_THREE_D_CONSERVATIVE_MODE=True`, restart backend, verify wider coverage (150m)

---

## Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Cold load (worst case) | 77s | ~22s | 3.5x faster |
| Cold load (typical) | 62s | ~18s | 3.4x faster |
| Buildings shown | 150-250 | 80-120 | Sufficient for property eval |
| Response payload (3D) | 2-5MB | 200-500KB (gzip) | 5-10x smaller |
| 3D fetch start delay | +2s (after building facts) | +0s (immediate) | 2s saved |
| Frontend timeout | 90s | 90s (unchanged) | Covers both modes |

## Rollback

- **Full rollback to original scope:** Set `BUURT_THREE_D_CONSERVATIVE_MODE=True` and **restart the backend process**. This restores 150m/5-page/80s behavior. No code changes needed — just env var + restart. (Restart is required because `settings = Settings()` is evaluated once at import; the env var only takes effect on fresh process startup.)
- **If pand_id lookup adds latency:** The 3s timeout budget caps the impact. To remove entirely: delete the `bag.get_pand_id()` call from the lookup endpoint and remove `pand_id` from `ResolvedAddress`. Frontend falls back automatically.
- **If GZip causes issues:** Remove `GZipMiddleware` from `main.py`. No other changes needed.
- **Cache invalidation:** Neighborhood3d cache bumped to v24, lookup cache bumped to v2. Old entries expire naturally (24h).

## Review Findings Addressed

### v3 Findings (resolved in v3)

| # | v2 Finding | v3 Resolution |
|---|------------|---------------|
| 1 | Task 1 test strategy inconsistent | Clarified: structural tests are the correct approach. httpx ASGITransport limitation documented. TDD framing corrected — tests fail before implementation (StopIteration), pass after. |
| 2 | Task 2 radius test is weak (signature only) | Replaced with behavioral test (Test B) that mocks HTTP and asserts actual bbox URLs contain 100m coordinates. Also tests near-ring at 90m. |
| 3 | Scope cuts without quality gates | Added 5 explicit quality gate tests: constant bounds (A), behavioral bbox URL (B), building count floor ≥5 (C), target recovery on 502 (D), sunlight viability (E). |
| 4 | Conservative mode tuning weakens rollback | Conservative mode is now INTRODUCED (didn't exist before) with values **byte-identical** to current HEAD. It preserves exact pre-optimization behavior as an env-var rollback. |
| 5 | Frontend timeout conflicts with conservative mode | Frontend timeout **stays at 90s** (unchanged). 90s covers conservative mode (80s budget) + margin. No coupling risk. |
| 6 | pand_id lookup lacks SLA/fallback budget | Explicit `asyncio.wait_for(timeout=3.0)`. Dedicated test verifies timeout behavior. Graceful degradation: returns None on timeout/error. |
| 7 | App refactor race/stale-state bugs | Clear state contracts documented: synchronous flag set, requestId guards on every setter, local-scope mutation variables, mutual exclusion between early and fallback paths. |
| 8 | Stale references | All line numbers verified against 2026-02-20 HEAD. Test baselines: 434 backend, 445 frontend. Cache version: v23→v24. `test_address_api.py` (correct). `BBOX_FETCH_RETRIES`: currently 10 (not 6). |
| 9 | Current-repo alignment gaps | Added "Current Codebase State" section with exact line numbers and values for all modified files. Key: no conservative mode exists (introduced by this plan), no `FAST_RETURN_CONTEXT_BUILDING_THRESHOLD` or `OPTIONAL_NEAR_JOIN_TIMEOUT_SECONDS` constants exist. |

### v4 Findings (resolved in v4)

| # | v3 Assessment Finding | v4 Resolution |
|---|----------------------|---------------|
| 1 | **HIGH: Task 1 test design invalid** — structural only, never asserts gzip on large payload | Added behavioral gzip test (`test_gzip_compresses_large_3d_response`) that mocks a 20-building 3D response (>1KB) and asserts `Content-Encoding: gzip` header via httpx ASGITransport. Also added `test_gzip_skips_small_responses` for <1KB check. Removed fallback note that contradicted Gate #6. |
| 2 | **HIGH: Task 2 verification too weak** — only checks function default | Test B (behavioral) already asserts actual bbox URLs at runtime, not just defaults. Test A checks constant bounds. Added Test F (conservative byte-match) ensuring rollback is EXACT. Combined: 7 quality gate tests (A-F + updated near-ring). |
| 3 | **HIGH: Scope cuts without hard quality gates** | Acceptance criteria table now has explicit numerical thresholds: building count ≥5, target recovery 100%, sunlight viability = target + ≥1 neighbor, accelerated constants within bounds (radius ≤100m, pages ≤2, budget ≤35s). Each gate maps to a specific test. |
| 4 | **MEDIUM: Conservative mode weakened as rollback** | Added Test F: byte-match test loads module with `BUURT_THREE_D_CONSERVATIVE_MODE=True` and asserts EVERY constant matches the known pre-optimization HEAD values. Conservative mode is a *fidelity* rollback, not a latency profile. |
| 5 | **MEDIUM: Frontend timeout conflict with conservative mode** | Already addressed in v3: 90s stays. Acceptance criteria gate #8 now explicitly states: "Premature abort would break conservative rollback." |
| 6 | **MEDIUM: pand_id lookup lacks strict SLA guard** | Added SLA contract table with P50/P99/max latency projections. Documented trade-off of redundant `_fetch_verblijfsobject` call. Hard 3s timeout with test. |
| 7 | **LOW: Stale plan references** | All file references verified against 2026-02-20 HEAD: `test_address_api.py` (correct), `BBOX_MAX_PAGES=5` (correct), `BBOX_FETCH_RETRIES=10` (correct), cache version `v23` (correct). |
| 8 | **LOW: Expected test counts outdated** | Verified 2026-02-20: **434 backend**, **445 frontend**. Both values already correct in v3 codebase state table. |

### v5 Findings (resolved in v5 — this version)

| # | v4 Assessment Finding | v5 Resolution |
|---|----------------------|---------------|
| 1 | **HIGH: Conservative-mode test uses os.environ which doesn't affect settings singleton** | Replaced with `patch.object(app.config.settings, 'three_d_conservative_mode', True)` + `importlib.reload`. Settings is created once at import (`config.py:80`); env changes are invisible without patching the live object. Test also asserts accelerated defaults FIRST (proves branching works + provides TDD red phase via `AttributeError`). |
| 2 | **HIGH: Rollback says "no restart" but settings lifecycle requires restart** | Fixed: rollback now says "set env var + **restart the backend process**" with explanation that `Settings()` is evaluated once at import. |
| 3 | **MEDIUM: Gate #6 requires behavioral gzip proof but fallback note allows removing it** | Removed the contradictory fallback note. Gate #6 is a hard requirement. Note now says "debug the header assertion rather than removing the test." |
| 4 | **MEDIUM: Early 3D branch clears loading before any renderable data** | Fixed: `setNeighborhood3DLoading(false)` now only runs inside `if (hasTargetBuilding)` block. When Phase 1 returns no target, loading stays true and Phase 2 handles it. |
| 5 | **MEDIUM: Lookup cache locks pand_id=None for 24h after transient BAG failure** | Added shorter TTL: `min(settings.cache_ttl_lookup, 300)` (5 minutes) when pand_id was attempted but resolved to None. Prevents transient BAG failures from suppressing early 3D kickoff for 24h. Added `test_lookup_uses_full_ttl_when_pand_id_resolved` for the normal path. |
| 6 | **LOW: Step sequencing says field "doesn't exist yet" but Step 1 already added it** | Fixed: Step 3 expected failures now correctly state that all A/B/F tests fail with `AttributeError: 'DEFAULT_RADIUS'` (module still has hardcoded `150.0` until Step 4 adds the if/else branching). |

### v6 Findings (resolved in v6 — this version)

| # | v5 Assessment Finding | v6 Resolution |
|---|----------------------|---------------|
| 1 | **HIGH: Task 2 TDD breaks at test COLLECTION** — importing `DEFAULT_RADIUS` before it exists causes `ImportError` at collection, breaking all existing tests | Removed `DEFAULT_RADIUS` from the top-level import instruction. Tests A, B, F already use `import app.services.three_d_bag as mod` internally, accessing `mod.DEFAULT_RADIUS` at runtime. This gives `AttributeError` at test execution (proper TDD red) without `ImportError` at collection. Existing tests unaffected. |
| 2 | **MEDIUM: Early 3D branch lacks placeholder rendering** — Phase 1 failure leaves blank viewer with no spinner until Phase 2 finishes | Restructured Task 4 Step 2: placeholder rendering (`createImmediateTarget3D`) is now **unconditional** — runs when building facts arrive regardless of `early3DStarted`. Uses functional `setNeighborhood3D(prev => prev.buildings.length > 0 ? prev : placeholder)` to avoid overwriting better data from early fetch. API fetch paths remain mutually exclusive via `early3DStarted`. |
| 3 | **MEDIUM: 5-min TTL can hide persistent BAG failures** | Added `logger.warning` when pand_id resolution fails, surfacing persistent BAG WFS issues in monitoring/alerting. 5-min TTL retained: it balances retry frequency with network overhead. |













