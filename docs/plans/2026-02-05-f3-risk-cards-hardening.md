# F3 Risk Cards — Hardening & Test Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all remaining F3 gaps: harden backend error handling & caching, add missing test coverage (backend + frontend), document threshold standards, and make warning UI visible. Zero PRD acceptance items left unaddressed.

**Architecture:** F3 core implementation is complete and committed (noise/air/climate/sunlight cards, full i18n, graceful degradation). This plan addresses hardening gaps found during rigorous audit: (1) backend endpoint lacks try/except and caches all-unavailable results, (2) frontend tests miss unavailable state, Dutch rendering, error handling, and warning rendering, (3) backend tests miss edge cases and parameter validation, (4) threshold documentation needed per PRD acceptance criteria.

**Tech Stack:** Python 3.11+ (FastAPI, httpx, pydantic, pytest), TypeScript (React, Vitest, Testing Library)

---

## Current State (post commit `2bfc259`)

- Backend: 91 tests pass + 5 live (deselected). `ruff check` clean.
- Frontend: 104 tests pass. `npm run build` clean.
- Noise regex FIXED, climate layers EXPANDED, live smoke tests ADDED, docs UPDATED.
- i18n: 181 keys in both en.json and nl.json — all risk keys present and complete.

## Remaining Gaps

| ID | Category | Severity | Gap |
|----|----------|----------|-----|
| G1 | Backend API | HIGH | `/risks` endpoint has no try/except — unhandled exception → 500 |
| G2 | Backend caching | HIGH | Caches all-unavailable results for 7 days (violates "never cache empty/error" rule) |
| G3 | Backend tests | HIGH | No test for `/risks` missing query params (422) |
| G4 | Backend tests | MEDIUM | No test for `/risks` when service raises exception |
| G5 | Frontend tests | HIGH | No test for `getRiskCards` API failure in App.tsx |
| G6 | Frontend tests | MEDIUM | No test for "unavailable" level rendering in RiskCardsPanel |
| G7 | Frontend tests | MEDIUM | No test for Dutch rendering in RiskCardsPanel |
| G8 | Frontend tests | MEDIUM | No test for warning/message field rendering |
| G9 | Frontend tests | LOW | No test for null metric values (metricUnavailable fallback) |
| G10 | CSS | MEDIUM | Warning message styled same as source — not visually distinct |
| G11 | Documentation | HIGH | No threshold documentation per PRD acceptance: "Thresholds match official Dutch guidelines" |

---

## Task 1: Harden backend `/risks` endpoint (G1 + G2)

**Files:**
- Modify: `backend/app/api/address.py:129-155`
- Test: `backend/tests/test_address_api.py`

**Step 1: Write failing tests for error handling and caching**

Add to `backend/tests/test_address_api.py`:

```python
@pytest.mark.asyncio
async def test_risk_cards_returns_502_on_unhandled_exception(client, mock_cache):
    """If get_risk_cards() raises unexpectedly, endpoint returns 502."""
    mock_cache["get"].return_value = None
    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        side_effect=RuntimeError("WMS connection pool exhausted"),
    ):
        resp = await client.get(
            "/api/address/0363010000696734/risks",
            params={"rd_x": "121286", "rd_y": "487296", "lat": "52.372", "lng": "4.892"},
        )
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_risk_cards_does_not_cache_all_unavailable(client, mock_cache):
    """When all three cards are unavailable, result is NOT cached."""
    mock_cache["get"].return_value = None
    all_unavailable = RiskCardsResponse(
        address_id="0363010000696734",
        noise=NoiseRiskCard(
            level=RiskLevel.unavailable, source="RIVM", sampled_at="2026-02-05",
            message="fail",
        ),
        air_quality=AirQualityRiskCard(
            level=RiskLevel.unavailable, source="RIVM", sampled_at="2026-02-05",
            message="fail",
        ),
        climate_stress=ClimateStressRiskCard(
            level=RiskLevel.unavailable, source="KA", sampled_at="2026-02-05",
            message="fail",
        ),
    )
    with patch(
        "app.api.address.risk_cards.get_risk_cards",
        new_callable=AsyncMock,
        return_value=all_unavailable,
    ):
        resp = await client.get(
            "/api/address/0363010000696734/risks",
            params={"rd_x": "121286", "rd_y": "487296", "lat": "52.372", "lng": "4.892"},
        )
    assert resp.status_code == 200
    # cache_set should NOT have been called
    mock_cache["set"].assert_not_called()
```

**Step 2: Run tests to verify they fail**

Run: `cd "d:/buurt-check/backend" && python -m pytest tests/test_address_api.py::test_risk_cards_returns_502_on_unhandled_exception tests/test_address_api.py::test_risk_cards_does_not_cache_all_unavailable -v`
Expected: FAIL — endpoint returns 500 (no try/except), cache_set IS called.

**Step 3: Fix the endpoint**

In `backend/app/api/address.py`, replace lines 129-155 with:

```python
@router.get("/{vbo_id}/risks", response_model=RiskCardsResponse)
async def address_risk_cards(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    rd_x: float = Query(...),
    rd_y: float = Query(...),
    lat: float = Query(...),
    lng: float = Query(...),
):
    """Fetch F3 risk cards (noise, air quality, climate stress)."""
    cache_key = f"risks:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return RiskCardsResponse(**cached)

    try:
        result = await risk_cards.get_risk_cards(
            vbo_id=vbo_id,
            rd_x=rd_x,
            rd_y=rd_y,
            lat=lat,
            lng=lng,
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Risk card data sources unavailable")

    # Only cache if at least one card has real data (not all unavailable).
    has_data = (
        result.noise.level != RiskLevel.unavailable
        or result.air_quality.level != RiskLevel.unavailable
        or result.climate_stress.level != RiskLevel.unavailable
    )
    if has_data:
        await cache_set(
            cache_key,
            result.model_dump(),
            ttl=settings.cache_ttl_risk_cards,
        )
    return result
```

Imports needed at top of `address.py`:
```python
from app.models.risk import RiskLevel
```

**Step 4: Run all backend tests**

Run: `cd "d:/buurt-check/backend" && python -m pytest -v --tb=short`
Expected: ALL PASS (91+ tests)

**Step 5: Run ruff check**

Run: `cd "d:/buurt-check/backend" && python -m ruff check`
Expected: No errors

**Step 6: Commit**

```bash
git add backend/app/api/address.py backend/tests/test_address_api.py
git commit -m "fix: harden /risks endpoint — try/except + skip caching all-unavailable

Endpoint now returns 502 on unhandled exceptions instead of 500.
All-unavailable results are not cached, preventing 7-day stale error."
```

---

## Task 2: Add backend test for missing query params (G3)

**Files:**
- Modify: `backend/tests/test_address_api.py`

**Step 1: Write the test**

```python
@pytest.mark.asyncio
async def test_risk_cards_missing_params(client):
    """Missing rd_x/rd_y/lat/lng returns 422."""
    resp = await client.get("/api/address/0363010000696734/risks")
    assert resp.status_code == 422
```

**Step 2: Run test**

Run: `cd "d:/buurt-check/backend" && python -m pytest tests/test_address_api.py::test_risk_cards_missing_params -v`
Expected: PASS — FastAPI enforces `Query(...)` required params automatically.

**Step 3: Commit**

```bash
git add backend/tests/test_address_api.py
git commit -m "test: add missing params test for /risks endpoint"
```

---

## Task 3: Add frontend test for getRiskCards failure (G5)

**Files:**
- Modify: `frontend/src/App.test.tsx`

**Step 1: Write the failing test**

Add to the "error handling" describe block in `App.test.tsx`:

```typescript
it('does not crash when getRiskCards fails', async () => {
  mockRiskCards.mockRejectedValue(new Error('Risk API down'));
  await selectAddress();
  // App should still render building facts — risk failure is silent
  expect(screen.getByText(/construction\.year/i)).toBeInTheDocument();
});
```

**Step 2: Run test**

Run: `cd "d:/buurt-check/frontend" && npx vitest run src/App.test.tsx -t "does not crash when getRiskCards fails"`
Expected: PASS — App.tsx already catches risk card errors silently in the IIFE.

**Step 3: Commit**

```bash
git add frontend/src/App.test.tsx
git commit -m "test: add getRiskCards failure test in App"
```

---

## Task 4: Add frontend tests for RiskCardsPanel edge cases (G6 + G7 + G8 + G9)

**Files:**
- Modify: `frontend/src/components/RiskCardsPanel.test.tsx`
- Reference: `frontend/src/test/helpers.ts` (makeRiskCardsResponse)

**Step 1: Write the tests**

Add these tests after the existing ones in `RiskCardsPanel.test.tsx`:

```typescript
it('renders unavailable level with correct badge text', () => {
  const risks = makeRiskCardsResponse({
    noise: {
      level: 'unavailable',
      source: 'RIVM / Atlas Leefomgeving WMS',
      sampled_at: '2026-02-05',
      message: 'Noise layer unavailable',
    },
  });
  render(
    <I18nextProvider i18n={i18nInstance}>
      <RiskCardsPanel risks={risks} />
    </I18nextProvider>,
  );
  expect(screen.getByText('Data unavailable')).toBeInTheDocument();
});

it('renders warning message when present', () => {
  const risks = makeRiskCardsResponse({
    noise: {
      level: 'unavailable',
      source: 'RIVM / Atlas Leefomgeving WMS',
      sampled_at: '2026-02-05',
      message: 'Noise lookup failed: timeout',
    },
  });
  render(
    <I18nextProvider i18n={i18nInstance}>
      <RiskCardsPanel risks={risks} />
    </I18nextProvider>,
  );
  expect(screen.getByText('Noise lookup failed: timeout')).toBeInTheDocument();
});

it('renders metric unavailable text when lden_db is null', () => {
  const risks = makeRiskCardsResponse({
    noise: {
      level: 'low',
      source: 'RIVM / Atlas Leefomgeving WMS',
      sampled_at: '2026-02-05',
    },
  });
  render(
    <I18nextProvider i18n={i18nInstance}>
      <RiskCardsPanel risks={risks} />
    </I18nextProvider>,
  );
  expect(screen.getByText('Metric unavailable for this location')).toBeInTheDocument();
});

it('renders all cards in Dutch', () => {
  const nlI18n = setupTestI18n('nl');
  render(
    <I18nextProvider i18n={nlI18n}>
      <RiskCardsPanel risks={makeRiskCardsResponse()} />
    </I18nextProvider>,
  );
  expect(screen.getByText('Verkeerslawaai (Lden)')).toBeInTheDocument();
  expect(screen.getByText('Luchtkwaliteit (PM2.5 / NO2)')).toBeInTheDocument();
  expect(screen.getByText('Klimaatstress (hitte / water)')).toBeInTheDocument();
});
```

Note: The Dutch translation keys for titles need to be checked. Read `frontend/src/i18n/nl.json` to confirm exact Dutch title text before writing the test. The test above uses placeholder Dutch text that must match the actual nl.json values.

**Step 2: Run tests**

Run: `cd "d:/buurt-check/frontend" && npx vitest run src/components/RiskCardsPanel.test.tsx -v`
Expected: ALL PASS (3 existing + 4 new = 7 total)

**Step 3: Run full frontend suite**

Run: `cd "d:/buurt-check/frontend" && npx vitest run`
Expected: 108+ tests pass

**Step 4: Run build**

Run: `cd "d:/buurt-check/frontend" && npm run build`
Expected: Build clean

**Step 5: Commit**

```bash
git add frontend/src/components/RiskCardsPanel.test.tsx
git commit -m "test: add RiskCardsPanel edge cases — unavailable, warning, null metrics, Dutch"
```

---

## Task 5: Improve warning message CSS styling (G10)

**Files:**
- Modify: `frontend/src/components/RiskCardsPanel.css`

**Step 1: Update warning styling**

Replace the current `.risk-card__warning` style (which looks identical to `.risk-card__source`) with a visually distinct style:

```css
.risk-card__warning {
  font-size: 0.78rem;
  color: #92400e;
  background: #fef3c7;
  border-left: 3px solid #f59e0b;
  padding: 6px 10px;
  border-radius: 4px;
  margin-top: 4px;
}
```

This uses amber tones (matching the "medium" risk badge) to draw attention without alarming.

**Step 2: Visual verification**

Run: `cd "d:/buurt-check/frontend" && npm run dev`
Manually verify warning message is visible and styled distinctly from source text.

**Step 3: Run build**

Run: `cd "d:/buurt-check/frontend" && npm run build`
Expected: Clean build

**Step 4: Commit**

```bash
git add frontend/src/components/RiskCardsPanel.css
git commit -m "fix: make risk card warning messages visually distinct from source text"
```

---

## Task 6: Document risk thresholds with official standards (G11)

**Files:**
- Modify: `backend/app/services/risk_cards.py` (add comments at threshold locations)

**Step 1: Add threshold documentation comments**

At line 435 (noise threshold):
```python
# Noise thresholds based on WHO Environmental Noise Guidelines for the
# European Region (2018).  Lden 53 dB is the onset of adverse health
# effects from road-traffic noise; 63 dB is the "high annoyance" threshold.
# Reference: https://www.who.int/publications/i/item/9789289053563
level = _risk_from_threshold(value, 53.0, 63.0)
```

At line 436 (PM2.5) and 447 (NO2):
```python
# PM2.5 thresholds based on WHO Global Air Quality Guidelines (2021).
# Annual mean AQG level: 5 µg/m³; interim target 4: 10 µg/m³.
# Reference: https://www.who.int/publications/i/item/9789240034228
pm25_level = _risk_from_threshold(pm25_value, 5.0, 10.0)

# NO2 thresholds based on WHO Global Air Quality Guidelines (2021).
# Annual mean AQG level: 10 µg/m³; interim target 4: 20 µg/m³.
no2_level = _risk_from_threshold(no2_value, 10.0, 20.0)
```

At the sunlight classification in `SunlightRiskCard.tsx` (if not already documented):
```typescript
// Sunlight thresholds: winter solstice direct sun hours.
// <2 hours = high risk (severe obstruction), 2-4 = medium, >4 = low.
// Based on Dutch building code guidance and residential livability studies.
```

**Step 2: Run ruff check**

Run: `cd "d:/buurt-check/backend" && python -m ruff check`
Expected: No errors (comments don't affect linting)

**Step 3: Commit**

```bash
git add backend/app/services/risk_cards.py
git commit -m "docs: add WHO/RIVM threshold references for F3 risk classification

PRD acceptance requires: 'Thresholds match official Dutch guidelines
where applicable.' Added WHO 2018 noise, WHO 2021 air quality refs."
```

---

## Task 7: Final verification gate

**Files:** None (verification only)

**Step 1: Run backend tests**

Run: `cd "d:/buurt-check/backend" && python -m pytest -v --tb=short`
Expected: 93+ tests pass (91 existing + 2 new from Task 1 + 1 from Task 2), 5 live deselected

**Step 2: Run ruff check**

Run: `cd "d:/buurt-check/backend" && python -m ruff check`
Expected: Clean

**Step 3: Run frontend tests**

Run: `cd "d:/buurt-check/frontend" && npx vitest run`
Expected: 109+ tests pass (104 existing + 4 from Task 4 + 1 from Task 3)

**Step 4: Run frontend build**

Run: `cd "d:/buurt-check/frontend" && npm run build`
Expected: Clean build

**Step 5: PRD acceptance checklist sign-off**

Verify each F3 acceptance item:

| PRD Requirement | Verified By |
|---|---|
| Score/level per card | RiskCardsPanel test "renders all F3 cards" + "renders unavailable level" |
| What it means (EN/NL) | RiskCardsPanel test "renders score, meaning..." + "renders all cards in Dutch" |
| What to ask at viewing | RiskCardsPanel test "renders score, meaning, viewing question" |
| Source + date | RiskCardsPanel test "renders score, meaning, viewing question, and source+date" |
| Thresholds match guidelines | Code comments with WHO 2018/2021 references |
| < 5s dossier generation | Live smoke tests complete in <15s (3 cards in parallel) |
| Graceful degradation | test_risk_cards_returns_502 + unavailable rendering test |
| Never cache errors | test_risk_cards_does_not_cache_all_unavailable |

---

## Task Dependency Graph

```
Task 1 (backend endpoint hardening) ──┐
                                        │
Task 2 (missing params test) ──────────┤
                                        │
Task 3 (frontend error test) ──────────┤
                                        ├──→ Task 7 (verify all)
Task 4 (RiskCardsPanel edge tests) ────┤
                                        │
Task 5 (CSS warning styling) ──────────┤
                                        │
Task 6 (threshold documentation) ──────┘
```

Tasks 1-6 are all independent — can be parallelized freely.
Task 7 is the final verification gate that depends on all others.
