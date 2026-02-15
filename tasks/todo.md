# Phase 1B Implementation Plan — v7 (Execution-Ready)

**Date:** 2026-02-15
**Author:** Senior engineer review, v7 addressing 3 consistency defects from v6 review
**Base branch:** `main` (after merging `feat/mobile-ui-premium`)
**Scope:** Full Phase 1B from design spec: Leefbaarometer livability (score + trend + comparison + detail view), Bodemloket soil contamination (revised scope), lead pipe proxy, fix Phase 1A property warnings bug, AttentionSummary extension, CLAUDE.md corrections

---

## Code Review Issue Resolution Matrix

### Issues resolved in v3 (from original no-go verdict)

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | **Critical** | Livability scope under-implemented — design requires trend + comparison + detail drilldown | Steps 3-4 fetch historical data (12 releases exist, 9 selected) + wijk/gemeente comparison. Steps 9-10 implement LivabilityCard + LivabilityDetailView |
| 2 | **High** | Soil contamination strategy drifts from design without reconciliation | **Design Revision** section reconciles. Revised scope: static info card + lead pipe proxy + link to bodemloket.nl |
| 3 | **High** | AttentionSummary adds livability flags not in spec, omits soil-derived flags | Step 13 adds lead pipe flag, does NOT add livability flags (not in design spec) |
| 4 | **Medium** | Livability API/client contract inconsistent | Single contract: backend always 200, `{available: false}` for no data, frontend returns null |
| 5 | **Medium** | Dossier placement contradictory in two steps | One canonical order in Step 16 matching design spec lines 586-601 |
| 6 | **Medium** | Merge pre-step `git stash push` won't stash untracked file | Step 0 uses `mv` command |

### Issues resolved in v4 (from v3 review — this revision)

| # | Severity | Issue | Root cause | Resolution |
|---|----------|-------|------------|------------|
| 7 | **High** | `LivabilityComparison` type undefined — service return type and endpoint `isinstance` check reference it, but only `LivabilityComparisonRow` is defined in models | Missing model definition in Step 4 | Added `LivabilityComparison` model with `rows: list[LivabilityComparisonRow]` to Step 4. Return type in Step 3c and `isinstance` check in Step 4 endpoint code now both reference this defined model. |
| 8 | **High** | SoilInfoCard contradictory — says "no API call" but props pass RD coords for WMS overlay; lead pipe sub-section needs construction year not in props | Mixed scope: card was meant to be static but WMS overlay reference crept in; props omitted required data for conditional rendering | Removed WMS overlay entirely from SoilInfoCard (card is now purely static, zero API calls). Props changed to `leadPipeFlagged?: boolean` + `constructionYear?: number`. Data sourced from PropertyWarningsResponse and BuildingFacts in parent. |
| 9 | **Medium** | Historical livability scope inconsistent — "12 releases" (line 16), 9 in code (line 266), "15 releases" (line 1059) | Copy errors from iterating between research (12 exist) and selection (9 chosen) | Standardized everywhere: **12 biennial releases exist** (02 through 24), **9 selected** for trend display (02, 08, 12, 14, 16, 18, 20, 22, 24), **3 skipped** (04, 06, 10 — earlier methodology, less comparable). Every reference in the plan now uses these exact numbers. |
| 10 | **Medium** | Endpoint contract drifts from design doc — design says `GET /api/address/livability?rd_x=...&rd_y=...`, plan uses `GET /{vbo_id}/livability` | Design doc written before codebase URL convention was established | Added **Design Revision: Livability Endpoint Path** section reconciling the difference. `/{vbo_id}/` prefix is consistent with all 14 existing endpoints. |
| 11 | **Medium** | Radar chart deviation unapproved — design spec says radar chart (line 458), plan replaces with bars | Unilateral scope change without formal reconciliation | Added **Design Revision: Visualization Choice** section documenting the deviation with rationale. Decision finalized in v5 (Issue #14) — horizontal bars chosen. No approval gate remains. |
| 12 | **Low** | Shell commands use `/d/...` Git Bash paths | Copy from earlier sessions | All commands now use relative paths from project working directory (`D:\buurt-check`). Shell is Git Bash per environment config, but relative paths are more portable. |

### Issues resolved in v5 (from v4 review — this revision)

| # | Severity | Issue | Root cause | Resolution |
|---|----------|-------|------------|------------|
| 13 | **High** | Livability caching strategy internally inconsistent — Step 3 caches current score at `livability:{rd_x}:{rd_y}`, Step 4 caches assembled response (current+trend+comparison) at same key | Two caching levels writing different shapes to overlapping keys | **Single-level caching at endpoint only** (Step 4). Per-function caching removed from Step 3. Cache key renamed to `livability_full:{rd_x:.0f}:{rd_y:.0f}` to disambiguate from any stale per-function entries. Service functions are pure (no caching). Endpoint caches the fully assembled `LivabilityResponse` (always includes trend + comparison). One key, one shape, no ambiguity. |
| 14 | **Medium** | Plan not execution-ready — bars vs radar visualization requires stakeholder approval (line 90), blocking execution | Deferred decision carried from v3 without resolution | **Decision finalized: horizontal bars.** Five rationale points documented. No approval gate remains. Radar chart can be added as zero-backend-change follow-up if explicitly requested post-ship. |
| 15 | **Medium** | Lead pipe signal duplicated in SoilInfoCard (Step 11) and PropertyWarningsCard (Step 12) — same warning in two places over-weights one signal and clutters dossier | Lead pipe fits both cards thematically; both steps independently added it | **Lead pipe appears in SoilInfoCard ONLY** (thematically grouped with soil/environmental contamination per design spec lines 437-443). Step 12 removed. `warnings.lead_pipe.*` i18n keys removed (replaced by existing `soil.lead_pipe_*` keys). Backend `LeadPipeWarning` model and `PropertyWarningsResponse.lead_pipe` field unchanged (AttentionSummary still references them). |
| 16 | **Low** | i18n mismatch for lead pipe text — SoilInfoCard component spec uses interpolated year `{constructionYear}` (Step 11 line 835) but i18n key `soil.lead_pipe_note` has non-interpolated generic text (Step 14 line 943) | Copy inconsistency between component spec and i18n key definition | `soil.lead_pipe_note` updated to use i18next `{{constructionYear}}` interpolation. Component renders via `t('soil.lead_pipe_note', { constructionYear })`. Text aligned with Step 11 component spec. |
| 17 | **Low** | Missing review section per CLAUDE.md requirement (line 184: "Add a review section to tasks/todo.md") | Process gap — plan ended with file summaries | Added **## Review** section at end of plan with post-implementation acceptance criteria checklist and lessons-learned template to be filled during/after execution. |

### Issues resolved in v6 (from v5 review — this revision)

| # | Severity | Issue | Root cause | Resolution |
|---|----------|-------|------------|------------|
| 18 | **Medium** | Lead pipe UI location still contradicts itself — Step 12 says removed/deduplicated to SoilInfoCard, but Step 16 dossier layout (line 1050) still lists "lead pipe" inside PropertyWarningsCard | Copy error: Step 16 dossier comment not updated when Issue #15 removed Step 12 | Fixed Step 16 dossier layout: PropertyWarningsCard now lists only its 4 sub-cards (foundation + erfpacht + VvE + asbestos). Lead pipe appears in SoilInfoCard ONLY. PropertyWarningsCard is NOT modified for lead pipe — consistent with Step 12 removal. |
| 19 | **Medium** | Cache tests in `test_leefbaarometer.py` (Step 5 tests #9 and #10) target service-level caching, but Steps 3-4 define endpoint-only caching with pure service functions | Tests written before caching strategy was consolidated to endpoint-only in Issue #13 | Removed `test_livability_cache_hit` and `test_livability_no_cache_on_empty` from Step 5 (service tests). Added 2 endpoint-level cache tests to Step 5 in a separate **Endpoint cache tests** section that tests caching through the HTTP endpoint via `TestClient`. Service tests remain pure (no caching assertions). Total Step 5 test count unchanged: 15 tests (13 service + 2 endpoint). |
| 20 | **Low** | Model defaults use mutable literals (`= []`) instead of `Field(default_factory=list)` in Steps 4 and 6 | Inconsistent with project convention (e.g., `neighborhood3d.py:25`, `building.py:11-12` use `Field(default_factory=list)`) | All `= []` in planned model definitions replaced with `Field(default_factory=list)`. Affects `LivabilityComparison.rows`, `LivabilityResponse.trend`, `LivabilityResponse.comparison`, `LivabilityResponse.messages`, and `LeadPipeWarning.messages`. While Pydantic v2 handles mutable defaults safely, `Field(default_factory=list)` is the established project convention and should be followed for consistency. |

### Issues resolved in v7 (from v6 review — consistency normalization)

| # | Severity | Issue | Root cause | Resolution |
|---|----------|-------|------------|------------|
| 21 | **Medium** | Step 10 (line 821) says bars are "pending stakeholder approval" but visualization decision was finalized as non-blocking in v5 (Issue #14) | Copy error: Step 10 wording not updated when Issue #14 finalized the bars decision | Normalized wording to "decision finalized in v5, Issue #14". Consistent with lines 106, 115, and 1155. |
| 22 | **Low** | Soil revision table says frontend static card tests are 5 (line 83) but Step 15 defines 6 SoilInfoCard tests (lines 1043-1052) | Off-by-one: table was written before Issue #8 added the 6th test (lead pipe conditional rendering) | Updated soil revision table from "5 tests" to "6 tests". Matches Step 15 exactly. |
| 23 | **Low** | v4 Issue #11 resolution text still says "Stakeholder approves or rejects as part of this plan review" | Historical wording not updated when v5 finalized the decision (Issue #14) | Updated to "Decision finalized in v5 (Issue #14) — horizontal bars chosen. No approval gate remains." Eliminates conflicting approval-gate language from historical context. |

### Open question resolutions (v6)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Should lead pipe be shown only in SoilInfoCard, or also in PropertyWarningsCard? | **SoilInfoCard ONLY** | Design spec lines 437-443 place lead expectation within the soil contamination section. Showing the same warning in two places over-weights a single signal and clutters the dossier. Backend `PropertyWarningsResponse.lead_pipe` field is unchanged — AttentionSummary still reads it for the flag count (Step 13). PropertyWarningsCard keeps its original 4 sub-cards (foundation, erfpacht, VvE, asbestos) unchanged. |
| Do you want cache tests in `test_leefbaarometer.py` to target endpoint behavior? | **Yes — endpoint-level cache tests** | Service functions are pure (Step 3 caching note, Step 4 Issue #13 fix). Caching happens exclusively at the endpoint level. Cache behavior should be tested through the HTTP endpoint, not by mocking Redis calls on service functions. Two endpoint tests added to Step 5 using FastAPI `TestClient` to verify cache-hit returns same data and empty results are not cached. |

---

## Design Revision: Soil Contamination Scope

**Original design spec** (2026-02-13-premium-features-design.md lines 400-447):
- Backend service `soil_contamination.py` calling Bodemloket WFS
- Returns contamination records, severity, remediation status, historical land use
- 4-part card with severity badge (Clean/Record Found/Serious/No Data)
- Feeds into AttentionSummary (line 260, 447)

**Live API findings (verified 2026-02-15):**
- Bodemloket **WFS does not exist** (all known endpoints return 404)
- Bodemloket **GetFeatureInfo is non-functional** (returns empty XML for ALL queries)
- **Only GetMap works** (returns PNG tiles for visual overlay)
- Loodverwachtingskaart has **no published API**

**Revised acceptance criteria:**

| Original requirement | Revised requirement | Rationale |
|---------------------|---------------------|-----------|
| API-backed severity badge | Static info card with compliance warning + link to bodemloket.nl | GetFeatureInfo returns nothing |
| Contamination type, severity, remediation status | Not feasible via API | No structured data extractable |
| `backend/app/services/soil_contamination.py` | No backend service | No API to call |
| `GET /api/address/soil-contamination` endpoint | No endpoint | No backend service |
| `backend/tests/test_soil_contamination.py` (6 tests) | Frontend-only static card tests (6 tests) | Static content, no service logic |
| Soil feeds into AttentionSummary flag | Lead pipe warning feeds into AttentionSummary as soil-relevant proxy | Cannot derive structured severity from API |
| SoilInfoCard shows WMS tile overlay (visual) | SoilInfoCard is purely static — no API calls, no WMS overlay | **Issue #8 fix:** WMS overlay contradicts "no API call" requirement. Removed entirely. |

---

## Design Revision: Livability Endpoint Path (Issue #10)

**Original design spec** (line 532): `GET /api/address/livability?rd_x=...&rd_y=...`

**Revised:** `GET /api/address/{vbo_id}/livability?rd_x=...&rd_y=...`

**Rationale:** All 14 existing endpoints in `address.py` use the `/{vbo_id}/` path prefix pattern:
- `/{vbo_id}/building`, `/{vbo_id}/risks`, `/{vbo_id}/neighborhood`, `/{vbo_id}/tier-b`, `/{vbo_id}/property-warnings`, `/{vbo_id}/export`, `/{vbo_id}/wms-tile`, `/{vbo_id}/viewing-questions`, `/{vbo_id}/risk-comparisons`, `/{vbo_id}/building3d`, `/{vbo_id}/neighborhood3d`

Breaking this pattern would be inconsistent and would require different frontend routing logic. The `vbo_id` is available in the frontend at the point of the livability call (it's resolved from address lookup) and provides a natural cache namespace.

---

## Design Revision: Visualization Choice (Issue #11, finalized Issue #14)

**Original design spec** (line 458): "Full 5-dimension radar chart with scores"

**Decision: Horizontal bar chart with 5 dimensions.** This is final and does not block execution.

**Rationale:**
1. Every visualization in the app uses horizontal bars: age distribution in NeighborhoodStatsCard, comparison bars in RiskDetailView, dimension bars in LivabilityCard summary
2. A radar chart introduces a new visual paradigm and typically requires a chart library dependency (recharts, chart.js, or custom SVG)
3. Horizontal bars maintain visual consistency across the entire dossier
4. The data model and backend are identical — this is a frontend-only rendering decision
5. If radar chart is required, it can be added as a follow-up without any backend or data model changes

**No approval gate.** Radar chart can be swapped in post-ship with zero backend changes if explicitly requested.

---

## Verified Quality Gate Baselines

| Gate | Main (pre-merge) | Feature branch | Post-merge (expected) |
|------|-------------------|----------------|----------------------|
| `ruff check` | Clean | Clean | Clean |
| `pytest -m "not live"` | 328 passed | 381 passed | 381 passed |
| `npm run build` | Clean | Clean | Clean |
| `npx vitest run` | 338 passed | 385 passed | 385 passed |

Merge simulation verified: clean merge, 0 conflicts, 75 files changed, all gates pass post-merge.

---

## Step 0: Merge `feat/mobile-ui-premium` to `main`

**Goal:** Unify codebase. All Phase 1A code (property warnings, AttentionSummary, Framer Motion, DossierSheet, skeleton loading) lives on the feature branch.

**Pre-step: resolve untracked file collision**
```bash
# docs/plans/2026-02-13-premium-features-design.md is untracked on main
# but tracked in feature branch history. Move it aside before merge.
mv docs/plans/2026-02-13-premium-features-design.md docs/plans/2026-02-13-premium-features-design.md.bak
```
**Why `mv` and not `git stash`:** `git stash push -- <file>` only stashes tracked files. The `-u` flag stashes ALL untracked files, not just the specified one. `mv` is simpler and deterministic.

**Merge command:**
```bash
git merge feat/mobile-ui-premium --no-ff -m "feat: merge Phase 1A (property warnings, mobile UI premium)"
# Then restore the backup if the merge didn't bring its own version:
# mv docs/plans/2026-02-13-premium-features-design.md.bak docs/plans/2026-02-13-premium-features-design.md
```

**Post-merge convention fix (Issue #20 — mutable defaults in merged models):**
After merge, update `backend/app/models/property_warnings.py` to replace `messages: list[str] = []` with `messages: list[str] = Field(default_factory=list)` in all 4 existing models (FoundationRisk, ErfpachtWarning, VvEInfo, AsbestosWarning). This aligns the merged code with project convention before adding new models. Commit separately: `refactor(backend): align property warning model defaults with Field(default_factory=list) convention`

**Post-merge verification (mandatory — do NOT skip):**
```bash
# Backend (run from project root)
ruff check backend/
pytest backend/ -q -m "not live"
# Expected: 381 passed, 9 deselected

# Frontend (run from frontend/)
cd frontend && npm run build && npx vitest run && cd ..
# Expected: 385 passed
```

**If any gate fails:** Stop and fix before proceeding. Do NOT continue with failing tests.

**Commit:** This is the merge commit itself. No separate commit needed.

---

## Step 1: Fix Critical Bug — Property Warnings Frontend Call

**Problem:** `App.tsx` calls `getPropertyWarnings(vboId, rd_x, rd_y, { municipality })` but does NOT pass `constructionYear` or `numUnits`. The backend endpoint accepts these as optional query params, and the service logic depends on them for foundation risk classification (construction year), VvE detection (num_units > 1), and asbestos flagging (construction year < 1994).

**Root cause:** The property warnings fetch fires as a parallel IIFE alongside building facts. At the time it fires, `buildingFacts` may not yet be resolved. The construction year and num_units come from the building facts response.

**Fix approach (sequential dependency):**
Move the property warnings fetch to fire AFTER building facts resolves. Chain them inside a single IIFE. Building facts still runs in parallel with other fetches (risks, stats, etc.), but property warnings waits for building facts within that IIFE.

```typescript
// In handleAddressSelect — ONE IIFE for building facts -> property warnings chain:
void (async () => {
  try {
    setBuildingLoading(true);
    const facts = await getBuildingFacts(vboId);
    if (neighborhood3DRequestId.current !== requestId) return;
    setBuildingFacts(facts);
    setBuildingLoading(false);

    // NOW fire property warnings with full context
    setPropertyWarningsLoading(true);
    try {
      const warnings = await getPropertyWarnings(vboId, rd_x, rd_y, {
        constructionYear: facts?.building?.construction_year ?? undefined,
        numUnits: facts?.building?.num_units ?? undefined,
        municipality: resolved.municipality ?? undefined,
      });
      if (neighborhood3DRequestId.current !== requestId) return;
      setPropertyWarnings(warnings);
    } catch {
      if (neighborhood3DRequestId.current !== requestId) return;
      setPropertyWarningsError(true);
    } finally {
      if (neighborhood3DRequestId.current === requestId) {
        setPropertyWarningsLoading(false);
      }
    }
  } catch {
    if (neighborhood3DRequestId.current !== requestId) return;
    setBuildingError(true);
    setBuildingLoading(false);
  }
})();
```

**Note on request-id guard pattern:** Every `finally` block and every `catch` block checks `neighborhood3DRequestId.current === requestId` before updating state. This prevents stale-request race conditions.

**File changes:**
- `frontend/src/App.tsx` — restructure building facts IIFE to chain property warnings after it
- `frontend/src/services/api.ts` — verify `getPropertyWarnings()` signature passes all 3 optional params

**Verification:**
- Property warnings card shows foundation risk level (not always "unavailable")
- VvE card appears for multi-unit buildings
- Asbestos card appears for pre-1994 buildings

**Tests:** Existing tests should pass. Add 1 integration test verifying all params are forwarded.

**Commit:** `fix: pass constructionYear and numUnits to property warnings endpoint`

---

## Step 2: Update CLAUDE.md — Leefbaarometer + Bodemloket Corrections

**Problem:** CLAUDE.md contains incorrect Leefbaarometer field names, scale, and Bodemloket claims.

**Leefbaarometer corrections (Section I):**

Current (wrong):
```
- 5 dimensions: `_fys` (physical), `_onv` (safety), `_soc` (social cohesion), `_vrz` (amenities), `_won` (housing quality). Scale: 1-10. Overall: `lbm` field.
```

Corrected (verified live 2026-02-15):
```
- 5 dimensions: `kfys` (physical), `konv` (safety), `ksoc` (social cohesion), `kvrz` (amenities), `kwon` (housing quality). Scale: 1-9 (NOT 1-10). Overall: `kscore` field (NOT `lbm`).
- Feature types: `buurtscore{YY}` (buurt), `wijkscore{YY}` (wijk), `gemeentescore{YY}` (gemeente), `pc4score{YY}` (postcode).
- Historical data: 12 biennial releases exist (buurtscore02 through buurtscore24). 9 selected for trend: 02, 08, 12, 14, 16, 18, 20, 22, 24.
- Trend layers: `buurtontwikkeling{BASE}_{TARGET}` for pre-computed change between measurement years.
- CQL_FILTER syntax: `INTERSECTS(geom,POINT(rd_x rd_y))` — NO space after comma in INTERSECTS.
```

**Bodemloket corrections (Section J):**

Current (partially wrong):
```
- WMS only. GetFeatureInfo returns only reference IDs, NOT contamination severity.
```

Corrected:
```
- WMS only (no WFS — returns 404). GetFeatureInfo is NON-FUNCTIONAL (returns empty XML for all queries, verified 2026-02-15 across Amsterdam, Rotterdam, IJmuiden). Only GetMap (image tiles) works.
- Practical scope: link to bodemloket.nl only. No structured data extraction possible via API.
```

**File:** `CLAUDE.md` — Sections I and J

**Commit:** `docs: correct Leefbaarometer field names/scale and Bodemloket status in CLAUDE.md`

---

## Step 3: Backend — Leefbaarometer Service (Full Scope: Current + Trend + Comparison)

**New file:** `backend/app/services/leefbaarometer.py`

**Uses:** `LoopAwareClient` from `http_client.py` (per CLAUDE.md convention for new services)

**Three functions covering the full 1B-1 + 1B-3 scope:**

### 3a. Current livability score

```python
async def get_livability(rd_x: float, rd_y: float) -> LivabilityResponse | None
```

WFS query:
```python
params = {
    "service": "WFS",
    "version": "2.0.0",
    "request": "GetFeature",
    "typeName": "lbm3:buurtscore24",
    "CQL_FILTER": f"INTERSECTS(geom,POINT({rd_x} {rd_y}))",  # NO space after comma
    "outputFormat": "application/json",
    "srsName": "EPSG:28992",
}
```

Response parsing (field mapping — verified live):
```python
props = data["features"][0]["properties"]
kscore = props["kscore"]     # int, 1-9 (overall)
kfys = props["kfys"]         # int, 1-9 (physical)
konv = props["konv"]         # int, 1-9 (safety)
ksoc = props["ksoc"]         # int, 1-9 (social)
kvrz = props["kvrz"]         # int, 1-9 (amenities)
kwon = props["kwon"]         # int, 1-9 (housing)
gemeente = props["gemeente"]
buurt_name = props["name"]
buurt_code = props["id"]     # e.g., "BU0363AB10"
year = props["year"]         # e.g., "2024"
```

Score normalization (1-9 to 0-100):
```python
normalized = round((raw_score - 1) / 8 * 100)
# kscore=1 -> 0, kscore=5 -> 50, kscore=9 -> 100
```

### 3b. Historical trend data

```python
async def get_livability_trend(rd_x: float, rd_y: float) -> list[LivabilityTrendPoint]
```

Fetches the same point across multiple historical feature types in parallel:
```python
# 12 biennial releases exist (02 through 24).
# 9 selected for trend — skipping 04, 06, 10 (earlier methodology, less comparable).
HISTORICAL_YEARS = ["02", "08", "12", "14", "16", "18", "20", "22", "24"]

async def _fetch_year(year_suffix: str, rd_x: float, rd_y: float) -> LivabilityTrendPoint | None:
    params = {
        "typeName": f"lbm3:buurtscore{year_suffix}",
        "CQL_FILTER": f"INTERSECTS(geom,POINT({rd_x} {rd_y}))",
        # ... same as current query
    }
    # returns LivabilityTrendPoint(year=props["year"], kscore=..., kfys=..., etc.)

# Parallel fetch with asyncio.gather, tolerant of individual failures:
results = await asyncio.gather(*[_fetch_year(y, rd_x, rd_y) for y in HISTORICAL_YEARS], return_exceptions=True)
return [r for r in results if isinstance(r, LivabilityTrendPoint)]
```

### 3c. Comparison data (wijk + gemeente averages)

```python
async def get_livability_comparison(rd_x: float, rd_y: float) -> LivabilityComparison | None
```

**Return type:** `LivabilityComparison` — a container model defined in Step 4 (Issue #7 fix). Contains `rows: list[LivabilityComparisonRow]`.

Fetches wijk-level and gemeente-level scores at the same point:
```python
# Wijk average
wijk_params = {
    "typeName": "lbm3:wijkscore24",
    "CQL_FILTER": f"INTERSECTS(geom,POINT({rd_x} {rd_y}))",
    # ...
}

# Gemeente average
gemeente_params = {
    "typeName": "lbm3:gemeentescore24",
    "CQL_FILTER": f"INTERSECTS(geom,POINT({rd_x} {rd_y}))",
    # ...
}

# Parallel fetch
wijk_task = _fetch_score("lbm3:wijkscore24", rd_x, rd_y)
gemeente_task = _fetch_score("lbm3:gemeentescore24", rd_x, rd_y)
wijk, gemeente = await asyncio.gather(wijk_task, gemeente_task, return_exceptions=True)

rows = []
if isinstance(wijk, LivabilityComparisonRow):
    rows.append(wijk)
if isinstance(gemeente, LivabilityComparisonRow):
    rows.append(gemeente)
return LivabilityComparison(rows=rows) if rows else None
```

### Error handling (all functions):
- `totalFeatures == 0` → return `None` (point outside coverage)
- Content-Type check: if XML instead of JSON → log warning, return `None`
- httpx timeout: 5s per individual query (point queries are <100ms typically)
- Never cache empty/error responses
- Individual historical year failures don't fail the whole trend — return partial data

### Caching (Issue #13 fix — single-level, endpoint only):
- **Service functions do NOT cache.** `get_livability()`, `get_livability_trend()`, and `get_livability_comparison()` are pure functions — they always query the WFS.
- **Caching happens exclusively in the endpoint** (Step 4) after assembling the full response.
- Cache key: `livability_full:{rd_x:.0f}:{rd_y:.0f}`, TTL 30 days.
- Shape is always `LivabilityResponse` with `trend` and `comparison` populated.
- Only cache when current score is available (`totalFeatures >= 1`).
- This avoids cache-shape ambiguity: one key, one shape, no partial payloads.

### Config additions to `backend/app/config.py`:
```python
leefbaarometer_wfs_base: str = "https://geo.leefbaarometer.nl/lbm3/ows"
cache_ttl_livability: int = 2592000  # 30 days
```

---

## Step 4: Backend — Leefbaarometer Models + Endpoint

**New file:** `backend/app/models/livability.py`

```python
from pydantic import BaseModel, Field
from typing import Literal

class LivabilityDimension(BaseModel):
    name: Literal["physical", "safety", "social", "amenities", "housing"]
    raw_score: int = Field(..., ge=1, le=9)   # Original 1-9 scale
    normalized_score: int = Field(..., ge=0, le=100)  # 0-100 for display
    label_code: str  # i18n key: "livability.dimension.physical"

class LivabilityTrendPoint(BaseModel):
    year: str                          # "2002", "2008", ..., "2024"
    overall_score: int = Field(..., ge=1, le=9)
    overall_normalized: int = Field(..., ge=0, le=100)
    dimensions: list[LivabilityDimension]

class LivabilityComparisonRow(BaseModel):
    level: Literal["buurt", "wijk", "gemeente"]
    name: str                          # "Elandsgrachtbuurt" / "Centrum-West" / "Amsterdam"
    overall_score: int = Field(..., ge=1, le=9)
    overall_normalized: int = Field(..., ge=0, le=100)
    dimensions: list[LivabilityDimension]

class LivabilityComparison(BaseModel):
    """Container for comparison rows. Issue #7 fix — this model was missing in v3."""
    rows: list[LivabilityComparisonRow] = Field(default_factory=list)  # Issue #20 fix

class LivabilityResponse(BaseModel):
    available: bool = True
    buurt_code: str
    buurt_name: str
    gemeente: str
    year: str
    overall_score: int = Field(..., ge=1, le=9)       # Raw 1-9
    overall_normalized: int = Field(..., ge=0, le=100) # 0-100
    dimensions: list[LivabilityDimension]
    trend: list[LivabilityTrendPoint] = Field(default_factory=list)             # Historical series (1B-1 sparkline) — Issue #20 fix
    comparison: list[LivabilityComparisonRow] = Field(default_factory=list)     # buurt vs wijk vs gemeente (1B-1 comparison) — Issue #20 fix
    source: str = "Leefbaarometer 3.0, Ministerie van BZK"
    source_date: str | None = None
    messages: list[str] = Field(default_factory=list)  # Issue #20 fix
```

**API/client contract (consistent across backend, frontend, tests):**

| Scenario | Backend HTTP status | Response body | Frontend `getLivability()` return |
|----------|--------------------|--------------|---------------------------------|
| Data found | 200 | `LivabilityResponse` with `available: true` | `LivabilityResponse` object |
| No data (point outside coverage) | 200 | `{"available": false, "message": "LIVABILITY_NO_DATA"}` | `null` |
| Server error | 500 | Error body | Throws (caught by IIFE catch block) |
| Timeout | N/A (httpx timeout) | N/A | Throws (caught by IIFE catch block) |

**Why always 200:** The vbo_id is valid; the system successfully determined that no livability data exists for this location. This is a valid business response, not an error. Frontend checks `data.available === false` and returns `null`.

**Endpoint in `backend/app/api/address.py`:**

**Note (Issue #10 reconciliation):** Design doc specifies `GET /api/address/livability?rd_x=...&rd_y=...` without vbo_id. This plan uses `GET /api/address/{vbo_id}/livability` for consistency with all 14 existing endpoints. See Design Revision: Livability Endpoint Path section above.

```python
@router.get("/{vbo_id}/livability")
async def address_livability(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
):
    # Parallel: current + trend + comparison
    current = await get_livability(rd_x, rd_y)
    if current is None:
        return {"available": False, "message": "LIVABILITY_NO_DATA"}

    trend_task = get_livability_trend(rd_x, rd_y)
    comparison_task = get_livability_comparison(rd_x, rd_y)
    trend, comparison = await asyncio.gather(trend_task, comparison_task, return_exceptions=True)

    current.trend = trend if isinstance(trend, list) else []
    current.comparison = comparison.rows if isinstance(comparison, LivabilityComparison) else []
    return current
```

**Issue #7 resolution trace:** `get_livability_comparison()` returns `LivabilityComparison | None` (Step 3c). `LivabilityComparison` is defined above with `rows: list[LivabilityComparisonRow]`. The `isinstance(comparison, LivabilityComparison)` check in the endpoint now references a defined type. If comparison fails (returns exception from `asyncio.gather`), it won't match `isinstance` and falls back to `[]`.

**Execution flow:** Current score fetched first (fast, <100ms). If no data, return immediately. If data exists, fetch trend + comparison in parallel (9 historical queries + 2 scale queries — all fast point queries, <100ms each, parallelized). Total endpoint time: <500ms typical.

**Cache (Issue #13 fix — this is the ONLY cache point for livability):**
- Key: `livability_full:{rd_x:.0f}:{rd_y:.0f}` — the `_full` suffix disambiguates from any stale per-function entries if they existed in a previous cache version.
- TTL: 30 days.
- Shape: always the fully assembled `LivabilityResponse` with `trend` and `comparison` populated.
- Only cache when `current is not None` (i.e., `available == True`).
- On cache hit, return immediately — avoids all 11 WFS queries (1 current + 9 historical + 2 comparison).
- Service functions (`get_livability`, `get_livability_trend`, `get_livability_comparison`) do NOT cache — they are pure. See Step 3 caching note.

**Commit:** `feat(backend): add Leefbaarometer livability service with trend and comparison data`

---

## Step 5: Backend — Leefbaarometer Tests

**New file:** `backend/tests/test_leefbaarometer.py`

**Minimum 15 tests (expanded from v2's 10 to cover trend + comparison):**

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `test_livability_happy_path` | Valid WFS response → correct LivabilityResponse with available=true |
| 2 | `test_livability_field_mapping` | `kscore` maps to `overall_score`, `kfys` maps to physical dimension |
| 3 | `test_livability_score_normalization` | kscore=1→0, kscore=5→50, kscore=9→100 |
| 4 | `test_livability_all_dimensions_present` | All 5 dimensions in response with correct names |
| 5 | `test_livability_dimension_names` | physical, safety, social, amenities, housing |
| 6 | `test_livability_no_features` | `totalFeatures=0` → returns None |
| 7 | `test_livability_timeout` | httpx timeout → returns None (graceful degradation) |
| 8 | `test_livability_xml_error_response` | WFS returns XML error → returns None |
| 9 | `test_trend_returns_historical_series` | Multiple years returned, sorted chronologically |
| 10 | `test_trend_partial_failure` | One historical year fails → others still returned |
| 11 | `test_trend_empty_when_no_data` | Point outside coverage → empty trend list |
| 12 | `test_comparison_returns_wijk_and_gemeente` | Both wijk and gemeente rows present in `LivabilityComparison.rows` |
| 13 | `test_comparison_partial_failure` | Wijk fails → gemeente still returned in `LivabilityComparison.rows` |

### Endpoint cache tests (Issue #19 fix — caching is endpoint-only, NOT service-level)

These 2 tests live in the same `test_leefbaarometer.py` file but test the endpoint via `TestClient`, not the service functions directly. This matches the caching architecture: service functions are pure (Steps 3-4), caching happens at the endpoint (Step 4 Issue #13).

| # | Test | What it verifies |
|---|------|------------------|
| 14 | `test_endpoint_cache_hit` | First endpoint call caches response at `livability_full:{rd_x:.0f}:{rd_y:.0f}`. Second call with same coordinates returns cached data without hitting WFS (mock WFS called exactly once). Uses `TestClient` + mocked Redis + mocked httpx. |
| 15 | `test_endpoint_no_cache_on_empty` | When `totalFeatures=0` (no data), endpoint returns `{available: false}` and does NOT write to cache. Subsequent call with same coordinates hits WFS again. Uses `TestClient` + mocked Redis + mocked httpx. |

**Total: 15 tests** (13 service-level + 2 endpoint-level). Test count unchanged from v5.

**Mock data (from live API response):**
```python
MOCK_BUURT_RESPONSE = {
    "type": "FeatureCollection",
    "features": [{
        "type": "Feature",
        "id": "buurtscore24.4272",
        "properties": {
            "gemeente": "Amsterdam",
            "name": "Elandsgrachtbuurt",
            "id": "BU0363AB10",
            "scale": "buurt",
            "year": "2024",
            "kscore": 9, "kfys": 5, "konv": 3, "ksoc": 3, "kvrz": 9, "kwon": 5,
            "afw": 0.239019, "fys": 0.0435728, "onv": -0.0822578,
            "soc": -0.0318364, "vrz": 0.300065, "won": 0.00947524,
        }
    }],
    "totalFeatures": 1, "numberMatched": 1, "numberReturned": 1,
}

MOCK_WIJK_RESPONSE = {
    # Same structure, "scale": "wijk", "id": "WK036302", "name": "Centrum-West"
}

MOCK_GEMEENTE_RESPONSE = {
    # Same structure, "scale": "gemeente", "id": "GM0363", "name": "Amsterdam"
}
```

**httpx mock pattern (per backend convention):**
```python
mock_client = AsyncMock()
mock_response = MagicMock()
mock_response.json.return_value = MOCK_BUURT_RESPONSE
mock_response.status_code = 200
mock_response.headers = {"content-type": "application/json"}
mock_client.get.return_value = mock_response
```

**Commit:** `test(backend): add Leefbaarometer service tests (15 tests)`

---

## Step 6: Backend — Lead Pipe Proxy Warning

**Problem:** No API exists for lead pipe risk. Use BAG construction year < 1960 as proxy (same heuristic as Dutch water utilities). Per CLAUDE.md Section K.

**Implementation:** Add to existing `property_warnings.py` service (already on `main` after merge).

**Model addition to `backend/app/models/property_warnings.py`:**
```python
class LeadPipeWarning(BaseModel):
    flagged: bool  # True if construction_year < 1960
    construction_year: int | None = None
    messages: list[str] = Field(default_factory=list)  # e.g., ["LEAD_PIPE_PRE_1960"] — Issue #20 fix
```

Add `lead_pipe: LeadPipeWarning` field to `PropertyWarningsResponse`.

**Logic in `get_property_warnings()`:**
```python
lead_pipe = LeadPipeWarning(
    flagged=construction_year is not None and construction_year < 1960,
    construction_year=construction_year if (construction_year and construction_year < 1960) else None,
    messages=["LEAD_PIPE_PRE_1960"] if (construction_year and construction_year < 1960) else [],
)
```

**AttentionSummary integration in `build_attention_summary()`:**
```python
if lead_pipe.flagged:
    flags.append(AttentionFlag(
        category="lead_pipe",
        severity="info",
        label="Lead pipe risk (pre-1960 construction)",
    ))
```

**Tests:** Add 4 tests to existing `backend/tests/test_property_warnings.py`:
1. Pre-1960 building → flagged, message present
2. Post-1960 building → not flagged
3. No construction year → not flagged
4. Attention summary includes lead pipe flag when pre-1960

**Commit:** `feat(backend): add lead pipe proxy warning to property warnings`

---

## Step 7: Frontend — Types for Livability + Lead Pipe

**File:** `frontend/src/types/api.ts`

**Add:**
```typescript
// Livability types (matching backend models from Step 4)
export interface LivabilityDimension {
  name: 'physical' | 'safety' | 'social' | 'amenities' | 'housing';
  raw_score: number;        // 1-9
  normalized_score: number; // 0-100
  label_code: string;
}

export interface LivabilityTrendPoint {
  year: string;
  overall_score: number;
  overall_normalized: number;
  dimensions: LivabilityDimension[];
}

export interface LivabilityComparisonRow {
  level: 'buurt' | 'wijk' | 'gemeente';
  name: string;
  overall_score: number;
  overall_normalized: number;
  dimensions: LivabilityDimension[];
}

export interface LivabilityResponse {
  available: boolean;
  buurt_code: string;
  buurt_name: string;
  gemeente: string;
  year: string;
  overall_score: number;       // 1-9 raw
  overall_normalized: number;  // 0-100
  dimensions: LivabilityDimension[];
  trend: LivabilityTrendPoint[];
  comparison: LivabilityComparisonRow[];
  source: string;
  source_date?: string;
  messages: string[];
}

// Lead pipe warning (added to PropertyWarningsResponse)
export interface LeadPipeWarning {
  flagged: boolean;
  construction_year?: number;
  messages: string[];
}
```

Add `lead_pipe: LeadPipeWarning` to existing `PropertyWarningsResponse` interface.

**Commit:** `feat(frontend): add livability and lead pipe TypeScript types`

---

## Step 8: Frontend — API Client + App.tsx Wiring

**File:** `frontend/src/services/api.ts`

**Add function (consistent contract per Step 4):**
```typescript
export async function getLivability(
  vboId: string,
  rdX: number,
  rdY: number,
): Promise<LivabilityResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s (trend fetch takes longer)
  try {
    const resp = await fetch(
      `/api/address/${vboId}/livability?rd_x=${rdX}&rd_y=${rdY}`,
      { signal: controller.signal }
    );
    if (!resp.ok) throw new Error(`Livability fetch failed: ${resp.status}`);
    const data = await resp.json();
    // Contract: backend always returns 200. Check `available` field.
    if (data.available === false) return null;
    return data as LivabilityResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Contract consistency:**
- Backend: always 200 for valid vbo_id
- `data.available === false` → frontend returns `null`
- `!resp.ok` (5xx, network) → throws → caught by IIFE catch block

**File:** `frontend/src/App.tsx`

**Add state variables:**
```typescript
const [livability, setLivability] = useState<LivabilityResponse | null>(null);
const [livabilityLoading, setLivabilityLoading] = useState(false);
const [livabilityError, setLivabilityError] = useState(false);
```

**Add to handleAddressSelect (as parallel IIFE with request-id guard):**
```typescript
// Reset
setLivability(null);
setLivabilityLoading(true);
setLivabilityError(false);

void (async () => {
  try {
    const data = await getLivability(vboId, rd_x, rd_y);
    if (neighborhood3DRequestId.current !== requestId) return;
    setLivability(data);
  } catch {
    if (neighborhood3DRequestId.current !== requestId) return;
    setLivabilityError(true);
  } finally {
    if (neighborhood3DRequestId.current === requestId) {
      setLivabilityLoading(false);
    }
  }
})();
```

**Commit:** `feat(frontend): add getLivability API client and App.tsx wiring`

---

## Step 9: Frontend — LivabilityCard Component (Summary Badge + Dimensions + Sparkline)

**New file:** `frontend/src/components/LivabilityCard.tsx`
**New file:** `frontend/src/components/LivabilityCard.css`

This is the 1B-1 summary card in the dossier. Tapping it opens LivabilityDetailView (Step 10).

**Props:**
```typescript
interface LivabilityCardProps {
  data?: LivabilityResponse | null;
  loading?: boolean;
  error?: boolean;
  onTap?: () => void;  // Opens detail view
}
```

**Rendering:**
- **Loading:** Skeleton card (reuse existing `SkeletonCard` pattern)
- **Error:** "Livability data unavailable" message
- **No data (null):** "No livability data for this location" message

**Content when data available (matching 1B-1 spec, design doc lines 359-363):**

1. **Overall score badge:** Large number showing raw score (X/9) with color coding
   - 7-9: teal/green (good)
   - 5-6: amber (moderate)
   - 1-4: coral/red (poor)

2. **5 dimension bars:** Horizontal bars showing raw_score (1-9) with i18n labels
   - Physical environment (`kfys`)
   - Safety (`konv`)
   - Social cohesion (`ksoc`)
   - Amenities (`kvrz`)
   - Housing quality (`kwon`)

3. **Trend sparkline (design doc line 362):** Small inline SVG sparkline showing `trend[]` data points (overall_score over time). Color indicates direction: teal if improving (latest > earliest), coral if declining.

4. **Neighborhood comparison (design doc line 363):** Compact comparison row showing "Your address: X.X | [Wijk name]: Y.Y | [Gemeente]: Z.Z" from `comparison[]` data.

5. **Buurt name + source + year:** "Elandsgrachtbuurt, Amsterdam — Leefbaarometer 3.0 · 2024"

6. **Tap affordance:** Subtle chevron icon indicating drilldown is available

**CSS:** Use existing design system tokens. BEM naming: `livability-card__*`. All colors via `var(--token)`.

---

## Step 10: Frontend — LivabilityDetailView Component (1B-3 Trend Detail)

**New file:** `frontend/src/components/LivabilityDetailView.tsx`
**New file:** `frontend/src/components/LivabilityDetailView.css`

This is the 1B-3 detail view (design doc lines 453-464) opened by tapping LivabilityCard.

**Props:**
```typescript
interface LivabilityDetailViewProps {
  data: LivabilityResponse;
  onClose: () => void;
}
```

**Content (matching 1B-3 spec, design doc lines 457-462):**

1. **Full 5-dimension visual:** Horizontal bar chart showing all 5 dimensions with scores (1-9 scale). Same bar style as NeighborhoodStatsCard age bars. **See Design Revision: Visualization Choice** — horizontal bars replace the radar chart from the design spec (decision finalized in v5, Issue #14).

2. **Trend chart (design doc line 459):** Larger version of the sparkline. Shows overall_score trajectory across available historical years (up to 9 data points from 2002-2024, see Step 3b) with labeled axes. Each data point shows year + score. Color-coded line.

3. **Per-dimension trend (design doc line 459):** Below the overall trend, show mini trend lines for each dimension if data is available (trend points have per-dimension scores).

4. **Comparison bars (design doc line 461):** Three horizontal bars side by side for each dimension:
   - Your address (buurt-level): teal
   - [Wijk name]: gray
   - [Gemeente name]: light gray
   Labels show score values.

5. **Source + date:** "Leefbaarometer 3.0, Ministry of the Interior (BZK) · Latest measurement: [year]"

**Rendering pattern:** Full-screen overlay (same pattern as `RiskDetailView`). Slides up from bottom. Uses existing modal/overlay styling.

---

## Step 11: Frontend — SoilInfoCard Component (Static — No API Calls)

**New file:** `frontend/src/components/SoilInfoCard.tsx`
**New file:** `frontend/src/components/SoilInfoCard.css`

**This is a purely static informational card.** No backend endpoint. No API call. No loading state. No WMS overlay. (Issue #8 fix: removed all API-dependent features to resolve the contradiction.)

**Props (Issue #8 fix — added leadPipeFlagged and constructionYear):**
```typescript
interface SoilInfoCardProps {
  leadPipeFlagged?: boolean;   // From PropertyWarningsResponse.lead_pipe.flagged
  constructionYear?: number;   // From BuildingFacts.building.construction_year
}
```

**Data flow:** Parent component (App.tsx dossier section) passes these values from existing state:
- `leadPipeFlagged={propertyWarnings?.lead_pipe?.flagged}`
- `constructionYear={buildingFacts?.building?.construction_year}`

**Content:**
```
Title: "Soil Contamination Check"
Icon: Warning/info icon (amber badge, matching PropertyWarningsCard severity style)

Body:
"Dutch law requires buyers to investigate soil contamination (onderzoeksplicht).
Soil contamination can cost EUR 25,000-100,000+ to remediate. Check the official
Bodemloket registry for this property's soil status."

Link button: "Check on Bodemloket.nl →"
  href: https://www.bodemloket.nl/
  target: _blank
  rel: noopener noreferrer

Viewing questions (collapsible, same pattern as PropertyWarningsCard sub-cards):
1. "Has a soil investigation (bodemonderzoek) been conducted for this property?"
2. "Are there underground storage tanks that have not been removed?"
3. "If renovation is planned: will it disturb contaminated soil layers?"

Lead pipe sub-section (shown ONLY when leadPipeFlagged === true):
  Title: t('soil.lead_pipe_title')
  Body: t('soil.lead_pipe_note', { constructionYear })
  — renders as: "Built in [year], before 1960. Original water supply pipes may
  contain lead. If the property has a garden used by young children, or original
  pre-1960 water pipes, request a lead test (loodtest)."
  (Issue #16 fix: i18n key uses {{constructionYear}} interpolation, matching component rendering)
  Viewing question: t('soil.lead_pipe_viewing_question')

Disclaimer:
"Absence of a record does not guarantee clean soil. Only a professional
bodemonderzoek can confirm soil condition."
```

---

## Step 12: REMOVED — Lead Pipe Deduplicated to SoilInfoCard Only (Issue #15)

**Original v4 content:** Added a lead pipe sub-card to PropertyWarningsCard.

**Removed in v5:** Lead pipe now appears ONLY in SoilInfoCard (Step 11), where it is thematically grouped with soil/environmental contamination per design spec lines 437-443. Showing the same lead pipe warning in both PropertyWarningsCard AND SoilInfoCard would over-weight one signal and clutter the dossier with redundant information.

**What remains unchanged:**
- Backend `LeadPipeWarning` model and `PropertyWarningsResponse.lead_pipe` field — still computed (Step 6)
- `AttentionSummary` still reads `warnings?.lead_pipe?.flagged` for the flag count (Step 13)
- `SoilInfoCard` receives `leadPipeFlagged` prop from `propertyWarnings?.lead_pipe?.flagged` (Step 11)
- `PropertyWarningsCard.tsx` is NOT modified for lead pipe (it keeps its existing 4 sub-cards: foundation, erfpacht, VvE, asbestos)

---

## Step 13: Frontend — Extend AttentionSummary

**File:** `frontend/src/components/AttentionSummary.tsx`

**What IS added (per design spec):**
- Lead pipe flag (soil-relevant signal, closest proxy for soil contamination input from spec line 260)
```typescript
if (warnings?.lead_pipe?.flagged) {
  flags.push({
    category: 'lead_pipe',
    severity: 'info',
    label: t('warnings.attention.lead_pipe'),
  });
}
```

**What is NOT added (deliberate omission):**
- Livability threshold flags — NOT in design spec lines 254-261
- Soil contamination data-driven flags — cannot derive from API (GetFeatureInfo non-functional)

**Update AttentionSummary props to accept livability (for future use, not for flags):**
```typescript
interface Props {
  riskCards?: RiskCardsResponse;
  warnings?: PropertyWarningsResponse;   // Now includes lead_pipe
  sunlightScore?: number;
  livability?: LivabilityResponse | null; // Available but NOT used for flags per spec
}
```

---

## Step 14: i18n — New Translation Keys

**Add to `frontend/src/i18n/en.json` and `nl.json`:**

### Livability (~22 keys):
```json
{
  "livability.title": "Livability Score",
  "livability.subtitle": "Neighborhood quality assessment",
  "livability.overall": "Overall",
  "livability.score_label": "out of 9",
  "livability.dimension.physical": "Physical Environment",
  "livability.dimension.safety": "Safety",
  "livability.dimension.social": "Social Cohesion",
  "livability.dimension.amenities": "Amenities & Services",
  "livability.dimension.housing": "Housing Quality",
  "livability.buurt_label": "Neighborhood",
  "livability.source": "Leefbaarometer 3.0, Ministry of the Interior (BZK)",
  "livability.unavailable": "Livability data not available for this location",
  "livability.error": "Could not load livability data",
  "livability.good": "Good livability",
  "livability.moderate": "Moderate livability",
  "livability.poor": "Low livability",
  "livability.year_label": "Data year",
  "livability.trend_improving": "Improving",
  "livability.trend_declining": "Declining",
  "livability.trend_stable": "Stable",
  "livability.comparison_label": "Compared to area",
  "livability.detail_title": "Livability Analysis"
}
```

### Soil info + lead pipe (~12 keys — Issue #15 + #16 fix):
```json
{
  "soil.title": "Soil Contamination Check",
  "soil.description": "Dutch law requires buyers to investigate soil contamination (onderzoeksplicht). Soil contamination can cost EUR 25,000-100,000+ to remediate.",
  "soil.link_label": "Check on Bodemloket.nl",
  "soil.question_1": "Has a soil investigation (bodemonderzoek) been conducted for this property?",
  "soil.question_2": "Are there underground storage tanks that have not been removed?",
  "soil.question_3": "If renovation is planned: will it disturb contaminated soil layers?",
  "soil.disclaimer": "Absence of a record does not guarantee clean soil. Only a professional bodemonderzoek can confirm soil condition.",
  "soil.source": "Bodemloket (National Soil Information System)",
  "soil.lead_pipe_title": "Lead Pipe Risk",
  "soil.lead_pipe_note": "Built in {{constructionYear}}, before 1960. Original water supply pipes may contain lead. If the property has a garden used by young children, or original pre-1960 water pipes, request a lead test (loodtest).",
  "soil.lead_pipe_viewing_question": "Does this property have original water pipes (pre-1960)? Has a lead test been conducted on soil or drinking water?",
  "soil.lead_pipe_source": "Construction year: BAG Kadaster. Lead pipe risk proxy based on Dutch water utility guidelines."
}
```

**Issue #16 fix:** `soil.lead_pipe_note` now uses i18next `{{constructionYear}}` interpolation, matching the SoilInfoCard component which renders `t('soil.lead_pipe_note', { constructionYear })`. The text aligns with Step 11's component spec.

**Issue #15 fix:** The duplicate `warnings.lead_pipe.*` keys (title, description, question_1, source) that v4 used for PropertyWarningsCard are **removed**. Lead pipe i18n lives exclusively under the `soil.*` namespace. SoilInfoCard is the single source of lead pipe UI.

### Attention summary additions (~2 keys):
```json
{
  "warnings.attention.lead_pipe": "Lead pipe risk (pre-1960 construction)",
  "dossier.soilCheck": "Soil & Lead"
}
```

### Dutch translations:
Parallel structure in `nl.json` with proper Dutch text for all ~36 keys above.

**Total new keys: ~36 per language** (v4 was ~38; removed 4 duplicate `warnings.lead_pipe.*` keys, added 2 `soil.lead_pipe_title` + `soil.lead_pipe_source`).

---

## Step 15: Frontend Tests

### New file: `frontend/src/components/LivabilityCard.test.tsx`

**Minimum 10 tests:**

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `renders overall score badge` | Score value shown with correct color coding |
| 2 | `renders all 5 dimensions` | All dimension names and bars present |
| 3 | `renders buurt name and gemeente` | Location context displayed |
| 4 | `renders source attribution` | "Leefbaarometer 3.0" shown |
| 5 | `renders loading skeleton` | Skeleton card when loading=true |
| 6 | `renders error state` | Error message when error=true |
| 7 | `renders unavailable state` | "Not available" message when data=null |
| 8 | `renders trend sparkline` | SVG sparkline present when trend data exists |
| 9 | `renders comparison row` | Buurt/wijk/gemeente scores shown |
| 10 | `renders in Dutch (NL)` | i18n keys resolve correctly in NL |

### New file: `frontend/src/components/LivabilityDetailView.test.tsx`

**Minimum 6 tests:**

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `renders all 5 dimension bars` | Horizontal bars with scores |
| 2 | `renders trend chart` | Overall trend line present |
| 3 | `renders comparison bars` | Three levels shown (buurt/wijk/gemeente) |
| 4 | `renders source and year` | Attribution displayed |
| 5 | `calls onClose when close button pressed` | Close callback fires |
| 6 | `renders in Dutch (NL)` | i18n correct |

### New file: `frontend/src/components/SoilInfoCard.test.tsx`

**Minimum 6 tests (expanded from v3's 5 — Issue #8 fix adds lead pipe conditional rendering):**

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `renders title and description` | Static content present |
| 2 | `renders bodemloket link` | Link href correct, opens in new tab |
| 3 | `renders viewing questions` | All 3 questions present |
| 4 | `renders disclaimer` | Disclaimer text present |
| 5 | `renders lead pipe section when flagged` | Lead pipe note shown when `leadPipeFlagged=true` |
| 6 | `hides lead pipe section when not flagged` | Lead pipe note hidden when `leadPipeFlagged=false` |

### Add to existing `frontend/src/services/api.test.ts`:

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `getLivability returns data` | Successful fetch + parse with trend/comparison |
| 2 | `getLivability returns null when available=false` | Contract: backend 200 + available:false → null |
| 3 | `getLivability handles timeout` | AbortController fires, throws |

**Commit:** `test(frontend): add livability, detail view, and soil info tests`

---

## Step 16: Dossier Layout Update (Single Canonical Order)

**One canonical dossier order, matching design spec lines 586-601:**

```
DossierSheet:
  ├── AttentionSummary (renders only after ALL data resolves, animates in via SPRING_REVEAL)
  ├── AddressHeader + bookmark
  ├── SummaryStrip (risk score pills)
  ├── BuildingFactsCard
  ├── RiskTilesGrid (2x2: noise, air, climate, sunlight)
  ├── PropertyWarningsCard (foundation + erfpacht + VvE + asbestos)               ← UNCHANGED (Issue #18 fix: no lead pipe here)
  ├── SoilInfoCard (NEW — static, link to bodemloket.nl, lead pipe note)          ← NEW
  │     props: leadPipeFlagged={propertyWarnings?.lead_pipe?.flagged}
  │            constructionYear={buildingFacts?.building?.construction_year}
  ├── LivabilityCard (NEW — Leefbaarometer score + sparkline + comparison)        ← NEW
  ├── 3D Viewer (NeighborhoodViewer3D)
  ├── NeighborhoodStatsCard
  ├── TierBSignalsCard
  ├── ViewingChecklist
  └── ActionBar (PDF export, share)
```

**This order is used in exactly ONE place** (App.tsx render section). No other step references a different order.

**Rationale for placement:** Design spec line 595-596 places PropertyWarningsCard before LivabilityCard before 3D Viewer. SoilInfoCard is logically grouped with PropertyWarningsCard (both are "things to check") and placed between property warnings and livability (which is a neighborhood quality signal).

---

## Step 17: Quality Gates (Final Verification)

**All gates MUST pass before marking complete:**

```bash
# Backend (run from project root)
ruff check backend/
pytest backend/ -q -m "not live"
# Expected: 381 (post-merge) + 15 (leefbaarometer) + 4 (lead pipe) = 400+ passed

# Frontend (run from frontend directory)
cd frontend && npm run build && npx vitest run && cd ..
# Expected: 385 (post-merge) + 10 (livability card) + 6 (detail view) + 6 (soil card) + 3 (api) = 410+ passed

# i18n key count match
# en.json keys == nl.json keys (both ~395 + 36 = ~431)
```

**Test count accounting:**
- Backend: 381 (post-merge) + 15 (leefbaarometer) + 4 (lead pipe) = **400+ minimum**
- Frontend: 385 (post-merge) + 10 (livability card) + 6 (detail view) + 6 (soil card) + 3 (api) = **410+ minimum**
- i18n: ~431 keys per language (395 existing + 36 new — v4 was +38, reduced by Issue #15 dedup)

---

## Commit Strategy

| # | Message | Steps covered |
|---|---------|---------------|
| 0 | `feat: merge Phase 1A (property warnings, mobile UI premium)` | Step 0 (merge commit) |
| 0b | `refactor(backend): align property warning model defaults with Field(default_factory=list) convention` | Step 0 post-merge fix (Issue #20) |
| 1 | `fix: pass constructionYear and numUnits to property warnings endpoint` | Step 1 |
| 2 | `docs: correct Leefbaarometer fields/scale and Bodemloket status in CLAUDE.md` | Step 2 |
| 3 | `feat(backend): add Leefbaarometer livability service with trend and comparison` | Steps 3-4 |
| 4 | `test(backend): add Leefbaarometer service tests (15 tests)` | Step 5 |
| 5 | `feat(backend): add lead pipe proxy warning to property warnings` | Step 6 |
| 6 | `feat(frontend): add livability and lead pipe TypeScript types` | Step 7 |
| 7 | `feat(frontend): add getLivability API client and App.tsx wiring` | Step 8 |
| 8 | `feat(frontend): add LivabilityCard with sparkline and comparison` | Step 9 |
| 9 | `feat(frontend): add LivabilityDetailView with trend and comparison bars` | Step 10 |
| 10 | `feat(frontend): add SoilInfoCard and extend AttentionSummary with lead pipe flag` | Steps 11, 13 (Step 12 removed — Issue #15) |
| 11 | `feat(i18n): add livability, soil, and lead pipe translation keys (EN+NL)` | Step 14 |
| 12 | `test(frontend): add livability, detail view, and soil info tests` | Step 15 |
| 13 | `feat(frontend): wire dossier layout with new cards` | Step 16 |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| **Leefbaarometer: full scope (score + trend + comparison)** | Design spec requires trend sparkline (line 362), neighborhood comparison (line 363), and trend detail drilldown (1B-3, lines 453-464). API supports all three via historical feature types + wijk/gemeente-level queries. All are point queries (<100ms each), parallelizable. |
| **Leefbaarometer: 1-9 scale, not 1-10** | Empirically verified with 500-buurt sample. Zero occurrences of score 10. Max observed: 9. Field names use `k` prefix (`kscore`, `kfys`). |
| **Score normalization: (kscore-1)/8 * 100** | Linear mapping from 1-9 to 0-100. kscore=1→0, kscore=5→50, kscore=9→100. Consistent with 0-100 scoring used throughout the app. |
| **Bodemloket: link-only, not API integration** | GetFeatureInfo is completely non-functional (verified live 2026-02-15). WFS returns 404. Design spec explicitly revised (see Design Revision section). |
| **SoilInfoCard: purely static, no WMS overlay** | **Issue #8 fix.** WMS overlay contradicts "no API call" requirement. Overlay would require either CORS bypass (backend proxy) or direct fetch (blocked). Removed entirely to make the card genuinely static. Lead pipe data passed via props from existing state. |
| **AttentionSummary: lead pipe flag yes, livability flag no, soil data flag no** | Design spec lists soil contamination as input (line 260) but NOT livability. Lead pipe is closest structured signal. Soil contamination data unavailable from API. |
| **API contract: always 200 for valid vbo_id** | Backend returns `{available: false}` for no data (not 404). Frontend checks `data.available` field, returns null. Tests verify null for `{available: false}`. |
| **LivabilityComparison container model** | **Issue #7 fix.** Added `LivabilityComparison(BaseModel)` with `rows: list[LivabilityComparisonRow]` so that `get_livability_comparison()` return type and endpoint `isinstance` check both reference a defined model. Alternative was `list[LivabilityComparisonRow]` direct return, but container model enables future metadata fields. |
| **Endpoint path: `/{vbo_id}/livability`** | **Issue #10 fix.** Design doc uses `/livability?rd_x=...&rd_y=...` without vbo_id. Revised for consistency with all 14 existing `/{vbo_id}/` endpoints. See Design Revision section. |
| **Bar chart, not radar chart for detail view** | **Issue #11 + #14 fix.** Design spec mentions radar chart (line 458). Horizontal bars chosen for visual consistency with all other app visualizations. No new library dependency. **Decision finalized in v5 — no approval gate.** Radar chart can be added post-ship with zero backend changes. |
| **Livability caching: endpoint-only, single key** | **Issue #13 fix, tests aligned in Issue #19.** Key `livability_full:{rd_x:.0f}:{rd_y:.0f}`, TTL 30 days. Service functions are pure (no caching). One key, one shape (`LivabilityResponse` with trend + comparison always populated), no ambiguity. `_full` suffix disambiguates from any stale per-function entries. Cache tests use `TestClient` (endpoint-level), not service mocks. |
| **Model defaults: `Field(default_factory=list)`, not `= []`** | **Issue #20 fix.** Project convention established in `neighborhood3d.py:25` and `building.py:11-12`. While Pydantic v2 handles mutable defaults safely (it copies them per instance), `Field(default_factory=list)` is the project standard. All list-default fields in new models follow this convention. |
| **Lead pipe: SoilInfoCard only, not PropertyWarningsCard** | **Issue #15 fix, reconfirmed Issue #18.** Design spec places lead expectation within soil contamination section (lines 437-443). Showing same warning in two places over-weights one signal. SoilInfoCard is the single owner. PropertyWarningsCard keeps its original 4 sub-cards (foundation, erfpacht, VvE, asbestos) — unchanged. `warnings.lead_pipe.*` i18n keys removed; `soil.lead_pipe_*` keys are canonical. Backend model and AttentionSummary flag unchanged. |
| **Lead pipe i18n: interpolated construction year** | **Issue #16 fix.** `soil.lead_pipe_note` uses `{{constructionYear}}` i18next interpolation. Component renders `t('soil.lead_pipe_note', { constructionYear })`. Text matches Step 11 component spec exactly. |
| **Dossier order: PropertyWarnings → SoilInfo → Livability → 3D → Stats** | Matches design spec lines 586-601. Used in exactly one place (App.tsx). |
| **Merge pre-step: mv, not git stash** | `git stash push -- <file>` won't stash untracked files. `mv` is simpler and deterministic. |
| **Historical years: 12 exist, 9 selected** | **Issue #9 fix.** Leefbaarometer has 12 biennial releases (buurtscore02 through buurtscore24). 9 selected for trend display: 02, 08, 12, 14, 16, 18, 20, 22, 24. Three skipped (04, 06, 10): earlier methodology is less comparable to post-2012 releases. |
| **Property warnings: sequential dependency on building facts** | Can't pass construction_year/num_units without building facts response. Sequential within a single IIFE; IIFE itself runs in parallel with other fetches. |
| **Lead pipe: construction year < 1960 proxy** | No API for Loodverwachtingskaart. BAG construction year already available. Same heuristic as Dutch water utilities. |
| **Shell commands: relative paths** | **Issue #12 fix.** All commands use relative paths from project working directory. Shell is Git Bash per environment config, but relative paths are more portable. |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Leefbaarometer historical queries slow down endpoint | Low (point queries <100ms each) | Low — cached after first call | 30-day cache. `asyncio.gather` parallelizes all 9 historical + 2 comparison queries. Individual failures don't block response. |
| Leefbaarometer rate limiting on 11 parallel queries | Very Low (no limits observed) | Medium — partial data | `return_exceptions=True` in gather. Return partial trend/comparison data. Log warning. |
| BRO WFS still returns 404 after merge | High | Medium — foundation risk shows "unavailable" | Already handled by graceful degradation in foundation_risk.py. Subsidence from Klimaateffectatlas still works. |
| Leefbaarometer WFS becomes unavailable | Low | Medium — livability card shows error | 30-day cache survives short outages. Graceful degradation: card shows "unavailable". |
| Merge collision on untracked file | Medium | Low — easily resolved | Step 0 pre-step: `mv` the file before merge. |
| Test count regression after merge | Low | High — quality gate violation | Post-merge verification is mandatory before proceeding. |
| Radar chart requested post-ship | Very Low | Low — horizontal bars ship now | **Issue #14:** Decision finalized. Radar chart can be added as follow-up with zero backend changes. Bar chart is consistent with all existing app visualizations. |
| Trend data has coverage gaps for older years | Medium | Low — sparkline handles gracefully | Sparkline draws lines between available points. Missing years don't break the visualization. |
| `LivabilityComparison` model evolution | Very Low | Low | Container model allows adding metadata (e.g., data year, confidence) without breaking existing `.rows` access pattern. |

---

## Files Created/Modified Summary

### New Files (11)
| File | Purpose |
|------|---------|
| `backend/app/services/leefbaarometer.py` | WFS service: current score + historical trend + wijk/gemeente comparison |
| `backend/app/models/livability.py` | Pydantic models: LivabilityDimension, LivabilityTrendPoint, LivabilityComparisonRow, **LivabilityComparison** (Issue #7), LivabilityResponse |
| `backend/tests/test_leefbaarometer.py` | 15 tests for livability service (current + trend + comparison) |
| `frontend/src/components/LivabilityCard.tsx` | Summary card: score badge + 5 dimension bars + trend sparkline + comparison row |
| `frontend/src/components/LivabilityCard.css` | Styles for livability card |
| `frontend/src/components/LivabilityDetailView.tsx` | Detail view: full dimension bars + trend chart + per-dimension trends + comparison bars |
| `frontend/src/components/LivabilityDetailView.css` | Styles for detail view |
| `frontend/src/components/SoilInfoCard.tsx` | **Purely static card** (Issue #8): compliance warning + bodemloket.nl link + lead pipe note. Props: `leadPipeFlagged`, `constructionYear`. No API calls. |
| `frontend/src/components/SoilInfoCard.css` | Styles for soil info card |
| `frontend/src/components/LivabilityCard.test.tsx` | 10 tests for summary card |
| `frontend/src/components/LivabilityDetailView.test.tsx` | 6 tests for detail view |

### Modified Files (11) — reduced from v4's 12 (Issue #15: PropertyWarningsCard no longer modified for lead pipe)
| File | Change |
|------|--------|
| `CLAUDE.md` | Correct Leefbaarometer field names/scale (Section I) and Bodemloket status (Section J) |
| `backend/app/config.py` | Add `leefbaarometer_wfs_base`, `cache_ttl_livability` |
| `backend/app/api/address.py` | Add `/{vbo_id}/livability` endpoint with trend + comparison (Issue #10: reconciled from design doc). Endpoint-level caching only (Issue #13). |
| `backend/app/services/property_warnings.py` | Add `LeadPipeWarning` logic + AttentionSummary flag |
| `backend/app/models/property_warnings.py` | Add `LeadPipeWarning` to response model |
| `backend/tests/test_property_warnings.py` | Add 4 lead pipe tests |
| `frontend/src/App.tsx` | Fix property warnings call (Step 1), add livability state + fetch (Step 8), render new cards with correct prop passing (Step 16) |
| `frontend/src/services/api.ts` | Add `getLivability()` function with consistent contract |
| `frontend/src/types/api.ts` | Add `LivabilityResponse`, `LivabilityDimension`, `LivabilityTrendPoint`, `LivabilityComparisonRow`, `LeadPipeWarning` types |
| `frontend/src/components/AttentionSummary.tsx` | Add lead pipe flag (NOT livability flag, per design spec) |
| `frontend/src/i18n/en.json` + `nl.json` | Add ~36 new keys per language (Issue #15: deduplicated lead pipe keys) |

---

## Review (Issue #17 — per CLAUDE.md line 184)

### Post-Implementation Acceptance Criteria

_Check each item after the corresponding step is completed. All must be checked before marking the plan complete._

- [ ] **Step 0:** Merge clean — `ruff check`, `pytest -m "not live"` (381+), `npm run build`, `vitest run` (385+) all pass
- [ ] **Step 1:** Property warnings card shows correct foundation risk level (not always "unavailable"); VvE card appears for apartments; asbestos card for pre-1994
- [ ] **Step 2:** CLAUDE.md Section I field names corrected (`kscore`, `kfys`, `konv`, `ksoc`, `kvrz`, `kwon`, scale 1-9); Section J Bodemloket updated
- [ ] **Steps 3-4:** Leefbaarometer endpoint returns current score + 5 dimensions + trend (up to 9 points) + wijk/gemeente comparison. Caching at endpoint level only (`livability_full:*` key). Service functions are pure.
- [ ] **Step 5:** 15 Leefbaarometer tests pass: 13 service-level (normalization, dimensions, trend, comparison) + 2 endpoint-level cache tests via TestClient (Issue #19: cache tests target endpoint, not service)
- [ ] **Step 6:** Lead pipe warning flagged for pre-1960, not flagged for post-1960/unknown. AttentionSummary includes lead pipe flag.
- [ ] **Step 7:** TypeScript types compile cleanly with `npm run build`
- [ ] **Step 8:** `getLivability()` returns data for valid coords, `null` for `available:false`, throws on error. App.tsx state wired correctly.
- [ ] **Step 9:** LivabilityCard renders: overall score badge (color-coded), 5 dimension bars, trend sparkline, comparison row, buurt name + source
- [ ] **Step 10:** LivabilityDetailView renders: full dimension bars, trend chart with historical points, per-dimension trends, comparison bars (buurt/wijk/gemeente)
- [ ] **Step 11:** SoilInfoCard renders: static content, bodemloket.nl link, viewing questions. Lead pipe section visible ONLY when `leadPipeFlagged=true`. Uses `t('soil.lead_pipe_note', { constructionYear })` interpolation.
- [ ] **Step 12:** VERIFIED REMOVED — PropertyWarningsCard does NOT contain a lead pipe sub-card (Issue #18 confirmed: dossier layout also reflects this)
- [ ] **Step 13:** AttentionSummary counts lead pipe flag. Does NOT add livability threshold flags.
- [ ] **Step 14:** `en.json` and `nl.json` key counts match. `soil.lead_pipe_note` contains `{{constructionYear}}`. No `warnings.lead_pipe.*` keys exist.
- [ ] **Step 15:** All frontend tests pass: 10 (LivabilityCard) + 6 (LivabilityDetailView) + 6 (SoilInfoCard) + 3 (api)
- [ ] **Step 16:** Dossier layout matches canonical order (AttentionSummary → AddressHeader → SummaryStrip → BuildingFacts → RiskTiles → PropertyWarnings → SoilInfo → Livability → 3D → Stats → TierB → Checklist → ActionBar)
- [ ] **Step 17:** All quality gates pass — backend 400+, frontend 410+, i18n ~431 keys, ruff clean, build clean

### Lessons Learned

_To be filled during and after implementation. Capture patterns that should inform future plans._

| # | Lesson | Category |
|---|--------|----------|
| | _(fill during implementation)_ | |

### Change Log

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-02-15 | Initial plan |
| v2 | 2026-02-15 | Address first round of review feedback |
| v3 | 2026-02-15 | Critical scope + contract fixes from no-go verdict |
| v4 | 2026-02-15 | 6 issues from v3 code review (undefined type, contradictory SoilInfoCard, historical year counts, endpoint path, radar chart, shell paths) |
| v5 | 2026-02-15 | 5 issues from v4 code review: caching consistency (#13), bars decision finalized (#14), lead pipe dedup (#15), i18n interpolation (#16), review section (#17) |
| v6 | 2026-02-15 | 3 issues from v5 code review: lead pipe dossier layout contradiction (#18), cache test placement aligned with endpoint-only strategy (#19), mutable default literals → `Field(default_factory=list)` (#20). Both open questions resolved. |
| v7 | 2026-02-15 | 3 consistency defects from v6 review: (1) Step 10 line 821 visualization wording normalized from "pending stakeholder approval" to "decision finalized in v5" (Issue #14 alignment); (2) Soil revision table frontend test count corrected from 5 to 6 (matching Step 15's 6 SoilInfoCard tests); (3) v4 Issue #11 resolution text updated from "Stakeholder approves or rejects" to "Decision finalized in v5 — no approval gate remains". No structural or code changes. |
