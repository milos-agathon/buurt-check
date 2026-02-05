# F3 Risk Cards — Hardening & Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the critical noise layer regex bug, expand climate layer coverage for nationwide addresses, update test baselines and CLAUDE.md to reflect accurate findings, and add live E2E verification.

**Architecture:** F3 is 90% complete. The service/model/API/frontend/i18n/test chain is fully wired end-to-end. Three issues need fixing: (1) a regex mismatch that causes noise cards to always return "unavailable" against live data, (2) climate layers that only cover specific regions (not nationwide), and (3) stale documentation claiming the ALO endpoint doesn't have noise data.

**Tech Stack:** Python (FastAPI, httpx, pydantic), TypeScript (React, Vitest), RIVM WMS, Klimaateffectatlas WMS/WFS

---

## Current State Assessment

### What works
- Backend: 86 tests pass. Service, models, API route, caching, error handling all wired.
- Frontend: 104 tests pass. RiskCardsPanel, SunlightRiskCard, OverlayControls all render correctly.
- Full i18n (EN/NL) with all required card elements (score, meaning, viewing question, source+date, disclaimer).
- Type alignment between backend models and frontend interfaces is perfect.
- Graceful degradation: all cards handle unavailable state properly.
- Non-blocking async fetch with race condition prevention in App.tsx.

### Critical bugs found

#### BUG 1: Noise layer regex mismatch (HIGH — noise card always returns "unavailable" against live data)

**Root cause:** `_select_noise_layer()` at `backend/app/services/risk_cards.py:234` uses:
```python
pattern = re.compile(r"^rivm_(\d{8})_g_geluidkaart_lden_wegverkeer$")
```

But the actual RIVM ALO layer names are:
```
rivm_20250101_Geluid_lden_wegverkeer_2022
rivm_20220601_Geluid_lden_wegverkeer_2020
rivm_Geluid_lden_wegverkeer_actueel
```

Key differences:
- Code expects `_g_geluidkaart_` → actual is `_Geluid_` (capital G, no `kaart`)
- Code expects no trailing suffix → actual has `_YYYY` data year suffix
- Code has no fallback for `_actueel` (no-date) variants
- The fallback (line 246) searches `geluidkaart_lden_wegverkeer` which also doesn't match

**Impact:** Every noise card query returns `level: unavailable` when hitting live RIVM data.

**Fix:** Update regex to `^rivm_(\d{8})_[Gg]eluid_lden_wegverkeer_\d{4}$` and add case-insensitive fallback for `geluid_lden_wegverkeer`.

#### BUG 2: Climate layers only cover specific Dutch regions (MEDIUM)

**Root cause:** `_CLIMATE_HEAT_LAYERS` and `_CLIMATE_WATER_LAYERS` at lines 28-42 contain:
- Heat: 1 national raster (`wpn:s0149_hittestress_warme_nachten_huidig`) + 4 regional vector layers (Zuid-Holland, Twente, Maastricht, Haarlemmermeer)
- Water: All 5 are regional vector layers (Etten, MRA, Rotterdam, Twente, Maastricht)

For addresses in Amsterdam, Utrecht, Groningen, etc., climate cards will likely return "unavailable" because no matching regional layer exists.

**Fix:** Add national-coverage fallback layers. The `wpn:` namespace contains national layers. Need to identify the best national water/flood layer from Klimaateffectatlas.

#### BUG 3: Stale CLAUDE.md documentation (LOW)

The CLAUDE.md and MEMORY.md both state "RIVM noise WMS is NOT at the `alo` endpoint." This is incorrect — verified that noise layers DO exist at `https://data.rivm.nl/geo/alo/wms`. The confusion arose because GetCapabilities is very large and noise layers appear late in the document.

Also, test baselines are stale: documented as 73 backend / 98 frontend, actual is 86 / 104.

---

## Implementation Tasks

### Task 1: Fix noise layer regex pattern

**Files:**
- Modify: `backend/app/services/risk_cards.py:233-248`
- Modify: `backend/tests/test_risk_cards.py` (update test data to use real layer names)

**Step 1: Write the failing test**

Add a test in `backend/tests/test_risk_cards.py` that uses real RIVM layer names:

```python
def test_select_noise_layer_matches_real_rivm_names():
    """Real RIVM ALO layer names use Geluid_lden_wegverkeer_YYYY pattern."""
    layers = [
        "rivm_20220601_Geluid_lden_wegverkeer_2020",
        "rivm_20250101_Geluid_lden_wegverkeer_2022",
        "rivm_Geluid_lden_wegverkeer_actueel",
        "rivm_20250101_Geluid_lnight_wegverkeer_2022",
    ]
    result = _select_noise_layer(layers)
    assert result == "rivm_20250101_Geluid_lden_wegverkeer_2022"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_risk_cards.py::test_select_noise_layer_matches_real_rivm_names -v`
Expected: FAIL — returns `None` because regex doesn't match.

**Step 3: Fix `_select_noise_layer()`**

```python
def _select_noise_layer(layer_names: list[str]) -> str | None:
    # Primary: dated layers like rivm_20250101_Geluid_lden_wegverkeer_2022
    pattern = re.compile(r"^rivm_(\d{8})_[Gg]eluid_lden_wegverkeer_\d{4}$")
    matches: list[tuple[str, str]] = []
    for layer in set(layer_names):
        m = pattern.match(layer)
        if m:
            matches.append((m.group(1), layer))
    if matches:
        matches.sort()
        return matches[-1][1]

    # Fallback: any layer containing geluid_lden_wegverkeer (case-insensitive)
    fallback = [
        layer for layer in set(layer_names)
        if "geluid_lden_wegverkeer" in layer.lower()
    ]
    # Prefer dated layers over "actueel" variants
    dated = [l for l in fallback if re.search(r"\d{8}", l)]
    if dated:
        return sorted(dated)[-1]
    return sorted(fallback)[-1] if fallback else None
```

**Step 4: Update existing test to use real naming**

Update `test_select_noise_layer_prefers_latest_date` to use `Geluid` instead of `g_geluidkaart`:

```python
def test_select_noise_layer_prefers_latest_date():
    layers = [
        "rivm_20220601_Geluid_lden_wegverkeer_2020",
        "rivm_20250101_Geluid_lden_wegverkeer_2022",
        "other_layer",
    ]
    result = _select_noise_layer(layers)
    assert result == "rivm_20250101_Geluid_lden_wegverkeer_2022"
```

**Step 5: Run all tests to verify**

Run: `cd backend && python -m pytest tests/test_risk_cards.py -v`
Expected: ALL PASS

**Step 6: Run ruff check**

Run: `cd backend && python -m ruff check`
Expected: No errors

**Step 7: Commit**

```bash
git add backend/app/services/risk_cards.py backend/tests/test_risk_cards.py
git commit -m "fix: update noise layer regex to match real RIVM naming convention

RIVM ALO layers use 'Geluid_lden_wegverkeer_YYYY' pattern, not
'g_geluidkaart_lden_wegverkeer'. Old regex caused noise cards to
always return 'unavailable' against live data."
```

---

### Task 2: Add national-coverage climate layers

**Files:**
- Modify: `backend/app/services/risk_cards.py:28-42`
- Modify: `backend/tests/test_risk_cards.py` (add test for national layer selection)

**Step 1: Research national climate layers**

Query the Klimaateffectatlas layer index to find national-coverage layers:
```bash
curl -s "https://maps1.klimaatatlas.net/geoserver/rest/layers.json" | python -m json.tool | grep -i "wpn\|landelijk\|nl_\|national"
```

Look for layers in the `wpn:` (national) namespace that cover heat stress and water/flood risk nationally.

**Step 2: Write the failing test**

```python
def test_climate_heat_layers_include_national_first():
    """First heat layer should be national-coverage (wpn: namespace)."""
    from app.services.risk_cards import _CLIMATE_HEAT_LAYERS
    first_layer, _ = _CLIMATE_HEAT_LAYERS[0]
    assert first_layer.startswith("wpn:"), f"First heat layer should be national: {first_layer}"


def test_climate_water_layers_include_national():
    """At least one water layer should be national-coverage."""
    from app.services.risk_cards import _CLIMATE_WATER_LAYERS
    national = [l for l, _ in _CLIMATE_WATER_LAYERS if l.startswith("wpn:")]
    assert len(national) >= 1, "Need at least one national water layer for coverage"
```

**Step 3: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_risk_cards.py::test_climate_water_layers_include_national -v`
Expected: FAIL — no `wpn:` water layer exists yet.

**Step 4: Update climate layer lists**

Based on research in Step 1, update `_CLIMATE_HEAT_LAYERS` and `_CLIMATE_WATER_LAYERS` to put national-coverage layers first. The `wpn:` namespace is confirmed to have national layers. Example update (layer names to be confirmed by research):

```python
_CLIMATE_HEAT_LAYERS: list[tuple[str, str]] = [
    # National coverage first — these work for any Dutch address
    ("wpn:s0149_hittestress_warme_nachten_huidig", "raster"),
    ("wpn:s0150_hittestress_tropische_nachten_huidig", "raster"),  # TBD from research
    # Regional fallbacks for richer data where available
    ("zh:1821_pzh_ouderenenhitte", "vector"),
    ("twn_klimaatatlas:1830_twn_hitte_percentage_ouderen", "vector"),
    ("maastricht_klimaatatlas:1811_maastricht_hitte_urgentiekaart", "vector"),
    ("haarlemmermeer_klimaatatlas:1815_haarlemmermeer_risico_hitte", "vector"),
]

_CLIMATE_WATER_LAYERS: list[tuple[str, str]] = [
    # National coverage first
    ("wpn:s0XXX_waterdiepte_t100_huidig", "raster"),  # TBD from research
    # Regional fallbacks
    ("etten:gr1_t100", "vector"),
    ("mra_klimaatatlas:1826_mra_begaanbaarheid_wegen_70mm", "vector"),
    ("rotterdam_klimaatatlas:1842_rotterdam_begaanbaarheid_wegen", "vector"),
    ("twn_klimaatatlas:1830_twn_begaanbaarheid_wegen_nens_70mm", "vector"),
    ("maastricht_klimaatatlas:1811_maastricht_begaanbaarheid_wegen2024", "vector"),
]
```

**Note:** Exact national water layer names must come from Step 1 research. Do NOT guess layer names — query the actual index.

**Step 5: Run all tests**

Run: `cd backend && python -m pytest tests/test_risk_cards.py -v`
Expected: ALL PASS

**Step 6: Run ruff check**

Run: `cd backend && python -m ruff check`
Expected: No errors

**Step 7: Commit**

```bash
git add backend/app/services/risk_cards.py backend/tests/test_risk_cards.py
git commit -m "feat: add national-coverage climate layers for nationwide address support

Regional-only layers caused climate cards to return 'unavailable' for
addresses outside Zuid-Holland, Twente, Maastricht, etc. National wpn:
layers now appear first in the priority list."
```

---

### Task 3: Add live E2E smoke test for risk cards

**Files:**
- Create: `backend/tests/test_risk_cards_live.py` (marked with `@pytest.mark.live`, skipped by default)

**Step 1: Write the live test**

```python
"""Live integration tests for F3 risk cards.

Skipped by default (require network). Run with:
    pytest tests/test_risk_cards_live.py -m live -v
"""
import pytest
from app.services.risk_cards import (
    _get_alo_layers,
    _select_noise_layer,
    _build_noise_card,
    _build_air_card,
    _build_climate_card,
    _utc_now_iso_date,
)

pytestmark = pytest.mark.live


# Amsterdam Centraal: RD ~121000, 487000
AMSTERDAM_RD_X = 121000.0
AMSTERDAM_RD_Y = 487000.0

# Rotterdam Centraal: RD ~92500, 437500
ROTTERDAM_RD_X = 92500.0
ROTTERDAM_RD_Y = 437500.0


@pytest.mark.asyncio
async def test_alo_layers_include_noise():
    """GetCapabilities returns at least one road traffic noise layer."""
    layers = await _get_alo_layers()
    noise = [l for l in layers if "geluid" in l.lower() and "lden" in l.lower() and "wegverkeer" in l.lower()]
    assert len(noise) >= 1, f"No noise layers found among {len(layers)} ALO layers"


@pytest.mark.asyncio
async def test_noise_card_amsterdam():
    """Noise card returns a real Lden value for Amsterdam."""
    card = await _build_noise_card(AMSTERDAM_RD_X, AMSTERDAM_RD_Y, _utc_now_iso_date())
    assert card.level != "unavailable", f"Noise unavailable: {card.message}"
    assert card.lden_db is not None
    assert 30 <= card.lden_db <= 90, f"Implausible Lden: {card.lden_db}"


@pytest.mark.asyncio
async def test_air_card_amsterdam():
    """Air quality card returns PM2.5 and/or NO2 for Amsterdam."""
    card = await _build_air_card(AMSTERDAM_RD_X, AMSTERDAM_RD_Y, _utc_now_iso_date())
    assert card.level != "unavailable", f"Air quality unavailable: {card.message}"
    has_data = card.pm25_ug_m3 is not None or card.no2_ug_m3 is not None
    assert has_data, "Neither PM2.5 nor NO2 returned"


@pytest.mark.asyncio
async def test_climate_card_amsterdam():
    """Climate stress card returns heat and/or water signal for Amsterdam."""
    card = await _build_climate_card(AMSTERDAM_RD_X, AMSTERDAM_RD_Y, _utc_now_iso_date())
    # At minimum, heat should work (national layer)
    assert card.heat_level != "unavailable" or card.water_level != "unavailable", \
        f"Both heat and water unavailable: {card.message}"


@pytest.mark.asyncio
async def test_noise_card_rotterdam():
    """Noise card returns a real Lden value for Rotterdam."""
    card = await _build_noise_card(ROTTERDAM_RD_X, ROTTERDAM_RD_Y, _utc_now_iso_date())
    assert card.level != "unavailable", f"Noise unavailable: {card.message}"
    assert card.lden_db is not None
```

**Step 2: Configure pytest marker**

Add to `backend/pyproject.toml` under `[tool.pytest.ini_options]`:
```toml
markers = [
    "live: marks tests that require network access to external APIs (deselect with '-m \"not live\"')",
]
```

**Step 3: Verify the live tests pass**

Run: `cd backend && python -m pytest tests/test_risk_cards_live.py -m live -v --timeout=30`
Expected: All 5 pass (may take 10-15 seconds per test due to WMS queries)

**Step 4: Verify regular tests still skip live tests**

Run: `cd backend && python -m pytest -v --tb=short`
Expected: 86+ tests pass, live tests are NOT collected (no `live` marker selected)

**Step 5: Commit**

```bash
git add backend/tests/test_risk_cards_live.py backend/pyproject.toml
git commit -m "test: add live E2E smoke tests for F3 risk cards

Verifies noise/air/climate cards return real data for Amsterdam and
Rotterdam coordinates. Skipped by default; run with -m live."
```

---

### Task 4: Update CLAUDE.md and MEMORY.md with corrected findings

**Files:**
- Modify: `CLAUDE.md` (correct RIVM endpoint note, update test baselines, update project status)
- Modify: `C:\Users\milos\.claude\projects\d--buurt-check\memory\MEMORY.md` (correct RIVM note, update baselines)

**Step 1: Update CLAUDE.md**

1. In "Current project status" section, change test baselines:
   - Backend: 73 → 86+
   - Frontend: 98 → 104+

2. In "What's next" section, update F3 status:
   - Change "Implement F3 risk cards" to "F3 risk cards implemented — hardening in progress (noise regex fix, climate layer coverage)"

3. In "RIVM WMS endpoint correction" section (bottom), replace:
   > The noise data is NOT at `https://data.rivm.nl/geo/alo/wms` — that endpoint contains green/livability layers. The correct noise endpoint needs to be located for F3.

   With:
   > **RIVM noise layers ARE at the `alo` endpoint** (`https://data.rivm.nl/geo/alo/wms`). The GetCapabilities response is very large; noise layers appear late in the document. Layer naming pattern: `rivm_{YYYYMMDD}_Geluid_lden_wegverkeer_{YYYY}` (e.g., `rivm_20250101_Geluid_lden_wegverkeer_2022`). Also available: `rivm_Geluid_lden_wegverkeer_actueel` (no date prefix). The `gcn` endpoint is for air quality only.

4. In the "What's next" quality gates, update baselines:
   - `ruff check`, backend pytest (86+), frontend vitest (104+), `npm run build`

**Step 2: Update MEMORY.md**

1. Update backend test baseline: 73 → 86+
2. Update frontend test baseline: 98 → 104+
3. Replace RIVM noise note with corrected information

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: correct RIVM noise endpoint info and update test baselines

- RIVM noise IS at alo endpoint (was incorrectly documented as not)
- Layer naming: rivm_{date}_Geluid_lden_wegverkeer_{year}
- Backend tests: 73 → 86, Frontend tests: 98 → 104"
```

---

### Task 5: Verify frontend build and full test suite

**Files:** None (verification only)

**Step 1: Run backend tests**

Run: `cd backend && python -m pytest -v --tb=short`
Expected: 86+ tests pass, 0 failures

**Step 2: Run ruff check**

Run: `cd backend && python -m ruff check`
Expected: No errors

**Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: 104+ tests pass, 0 failures

**Step 4: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds (TypeScript strict mode, no unused vars/params)

**Step 5: Run live smoke tests (if network available)**

Run: `cd backend && python -m pytest tests/test_risk_cards_live.py -m live -v --timeout=30`
Expected: 5 live tests pass

---

## PRD Compliance Summary (Post-Fix)

| PRD Requirement | Status | Notes |
|---|---|---|
| Road traffic noise (Lden) card | FIX NEEDED (Task 1) | Regex mismatch → always "unavailable" on live data |
| PM2.5 / NO2 air quality card | COMPLETE | GCN WMS working, dual-pollutant card |
| Climate stress (heat/water) card | PARTIAL (Task 2) | National heat works, water coverage limited to specific regions |
| Sunlight exposure card | COMPLETE | F2c, winter-solstice-based risk classification |
| Score/level per card | COMPLETE | low/medium/high/unavailable with color coding |
| What it means (EN/NL) | COMPLETE | All meaning keys present for all levels |
| What to ask at viewing | COMPLETE | Actionable questions for all 4 card types |
| Source + date | COMPLETE | Source name + publication date + sampling timestamp |
| Disclaimers | COMPLETE | "Indicative open-data signal" disclaimer |
| Bilingual | COMPLETE | EN + NL with identical structure |
| Graceful degradation | COMPLETE | Cards show "unavailable" instead of crashing |

## Task Dependency Graph

```
Task 1 (noise regex fix) ─────────────────────┐
                                                │
Task 2 (climate layers) ──────────────────────┤
                                                ├──→ Task 5 (verify all)
Task 3 (live E2E tests) ─── depends on 1,2 ──┤
                                                │
Task 4 (docs update) ─────────────────────────┘
```

Tasks 1 and 2 are independent and can be parallelized.
Task 3 depends on Tasks 1 and 2 (live tests need the regex fix to pass).
Task 4 can run in parallel with anything.
Task 5 is the final verification gate.
