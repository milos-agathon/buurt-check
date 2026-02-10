# Phase 3 Rigorous Assessment Report

Date: 2026-02-10
Assessor: Senior engineer review of `docs/implementation-assessment-2026-02-10.md` Phase 3 claims
Method: Source code inspection via parallel subagent deep analysis with line-level evidence

---

## Executive Summary

| Phase 3 Item | Assessment Claim | Actual Status | Verdict |
|---|---|---|---|
| 8a. PDF full dossier backend | "API hard-restricts to quick_brief" | Both templates implemented + dispatched | **WRONG** |
| 8b. PDF full dossier frontend | "Exposes only Quick Brief" | Both template buttons rendered | **WRONG** |
| 8c. PDF export UX polish | "Richer progress/share not implemented" | Linear bar exists; circular ring + share sheet missing | **PARTIALLY ACCURATE** |
| 9a. Parallel coordinates existence | "No parallel-coordinates component" | Component exists, imported, rendered, tested | **WRONG** |
| 9b. Parallel coordinates visual spec | (Not explicitly claimed) | Series colors wrong; data point size off | **REAL GAP** |
| 10. Tier B cards | "No crime endpoint/service/component found" | Fully implemented across backend + frontend | **WRONG** |

**Phase 3 status: Core functionality complete for all 3 items. Remaining gaps are visual polish only.**

---

## Item 8: PDF Export

### Assessment Claims
> "API hard-restricts template to quick_brief."
> "Full dossier and richer progress/share behavior are not implemented."
> "frontend/src/components/ExportBottomSheet.tsx exposes only Quick Brief display option."

### 8a. Backend: Both Templates Implemented

**Endpoint validation** (`address.py:400-404`):
```python
if template not in ("quick_brief", "full_dossier"):
    raise HTTPException(...)
```

**Dispatch** (`address.py:453-474`):
```python
if template == "full_dossier":
    pdf_bytes = generate_full_dossier(...)
else:
    pdf_bytes = generate_quick_brief(...)
```

**`generate_quick_brief()`** (`pdf_export.py:193-272`): 1 page — header, address, shadow snapshot, risk table, viewing questions (max 8), footer.

**`generate_full_dossier()`** (`pdf_export.py:275-431`): 4 pages:
- Page 1: Cover + summary + building facts + shadow + risk overview (5-column table)
- Page 2: Risk details — each category expanded with score/100, meaning, source
- Page 3: Full viewing checklist (unlimited questions)
- Page 4: Methodology + 16 blank lines for handwritten notes

**Verdict: Assessment claim "hard-restricts to quick_brief" is WRONG.** Both templates are fully implemented.

### 8b. Frontend: Both Templates Exposed

**Template state** (`ExportBottomSheet.tsx:42`):
```tsx
const [template, setTemplate] = useState<'quick_brief' | 'full_dossier'>('quick_brief');
```

**Both buttons rendered** (`ExportBottomSheet.tsx:101-117`):
```tsx
<button onClick={() => setTemplate('quick_brief')} ... />
<button onClick={() => setTemplate('full_dossier')} ... />
```

**Test verifies full dossier selection** (`ExportBottomSheet.test.tsx:55`):
```tsx
fireEvent.click(screen.getByText('Full Dossier'));
```

**Verdict: Assessment claim "exposes only Quick Brief" is WRONG.** Both template buttons are functional.

### 8c. Export UX Polish: Visual Spec Gaps

The export flow IS functional end-to-end but has visual specification gaps:

| Spec Requirement (design-spec.md §11) | Implemented? | Gap |
|---|---|---|
| Template selector as card layout with page illustrations | No | Simple buttons, no illustrations or sublabels ("1 page"/"3-4 pages") |
| Language segmented control (160x36px) | No | Read-only text display of current language |
| Circular progress ring (40px, 3px stroke) around document icon | No | Horizontal linear progress bar instead |
| Download icon (18px, white) on generate button | No | Text-only button |
| System share sheet (SC-11e) | No | Browser download only |
| Shadow snapshots toggle | Yes | Checkbox present, conditional on `hasShadows` |
| Progress stage text | Yes | Shows collecting/rendering/downloading stages |
| Error state display | Yes | Error message shown on failure |

**Verdict: Assessment claim about "richer progress/share" is PARTIALLY ACCURATE.** The progress bar exists but is linear (not circular ring). System share is missing entirely. These are visual polish items, not functional gaps.

### Summary: Item 8

| Aspect | Status |
|---|---|
| Backend quick_brief | DONE |
| Backend full_dossier | DONE |
| Frontend template selection | DONE |
| Frontend progress feedback | DONE (linear bar, not circular ring) |
| Visual spec compliance | PARTIAL — 5 polish gaps |
| System share sheet | MISSING |

---

## Item 9: Compare Visualization (Parallel Coordinates)

### Assessment Claims
> "Compare view lacks parallel-coordinates chart requirement."
> "CompareScreen renders rows with ScoreBar, no parallel-coordinates component."

### 9a. Component Exists and Is Fully Integrated

**Component file:** `frontend/src/components/ui/ParallelCoordinates.tsx` (142 lines)

**Import in CompareScreen** (`CompareScreen.tsx:6`):
```tsx
import ParallelCoordinates from './ui/ParallelCoordinates';
```

**Data preparation** (`CompareScreen.tsx:52-65`):
```tsx
const chartAxes = filteredMetrics.map((metric) => ({
  key: metric.key,
  label: t(metric.labelKey),
}));
const chartSeries = items.map((item) => ({
  id: item.vboId,
  label: item.address,
  values: {
    noise: item.riskScores.noise,
    air: item.riskScores.air,
    climate: item.riskScores.climate,
    sunlight: item.riskScores.sunlight,
  },
}));
```

**Conditional rendering** (`CompareScreen.tsx:91-96`):
```tsx
{chartAxes.length >= 2 && (
  <section className="compare-screen__chart">
    <h3 className="compare-screen__chart-title">{t('compare.parallelTitle')}</h3>
    <ParallelCoordinates axes={chartAxes} series={chartSeries} />
  </section>
)}
```

**CompareScreen renders BOTH visualizations:**
1. Parallel coordinates chart (SVG, lines 91-96)
2. Metric rows with ScoreBars (detailed numeric comparison, lines 98-128)

**Test coverage:**
- `ParallelCoordinates.test.tsx` — 2 tests (renders axes/polylines/legend; null when <2 axes)
- `CompareScreen.test.tsx:82-88` — integration test verifies chart renders inside CompareScreen

**Verdict: Assessment claim "no parallel-coordinates component" is WRONG.** The component exists, is imported, rendered conditionally, and tested.

### 9b. Visual Specification Mismatches (Real Gap)

**Series colors** (`ParallelCoordinates.tsx:25`):
```tsx
const SERIES_COLORS = ['#1C8C83', '#2EC4B6', '#2E4459'];
```

**Design spec requires** (design-spec.md §15.6 / design-prd.md §8.2):

| Address | Spec Color | Spec Name | Current Color | Current Name | Match? |
|---|---|---|---|---|---|
| 1 | `#00897B` | Electric Teal | `#1C8C83` | Teal 600 | Minor mismatch |
| 2 | `#E8913A` | Warm Amber | `#2EC4B6` | Arctic Teal | **WRONG** — should be amber |
| 3 | `#7C4DFF` | Purple | `#2E4459` | Dark slate | **WRONG** — should be purple |

Address 2 and 3 colors are critically wrong — all three lines use teal/slate shades that blend together, making the chart hard to read.

**Data point sizing:**

| Property | Spec | Current | Gap |
|---|---|---|---|
| Circle radius | 4px (8px diameter) | 3px (6px diameter) | 25% too small |
| Circle stroke | 2px | 1.2px | 40% too thin |
| Line stroke | 2px | 2.2px | Minor (10% thicker) |

### Concrete Fix for Item 9

**File:** `frontend/src/components/ui/ParallelCoordinates.tsx`

**Line 25** — change series colors:
```tsx
// FROM:
const SERIES_COLORS = ['#1C8C83', '#2EC4B6', '#2E4459'];
// TO:
const SERIES_COLORS = ['#00897B', '#E8913A', '#7C4DFF'];
```

**Lines 111-118** — increase data point radius:
```tsx
// Change r="3" to r="4"
```

**File:** `frontend/src/components/ui/ParallelCoordinates.css`

**Line 34** — fix stroke width:
```css
/* FROM: stroke-width: 2.2; */
/* TO:   stroke-width: 2; */
```

**Lines 40-44** — fix point stroke:
```css
/* FROM: stroke-width: 1.2; */
/* TO:   stroke-width: 2; */
```

These are 4 line changes in 2 files. Estimated effort: 5 minutes.

### Summary: Item 9

| Aspect | Status |
|---|---|
| ParallelCoordinates component | DONE |
| Integration in CompareScreen | DONE |
| Test coverage | DONE |
| SVG math (axes, scaling, polylines) | DONE |
| Series colors per spec | **NOT DONE** — 2 critical color mismatches |
| Data point sizing per spec | **NOT DONE** — radius and stroke too small |

---

## Item 10: Tier B Cards (Crime + Energy Label)

### Assessment Claim
> "No crime endpoint/service/component usage found."
> F6 listed as "Missing."

### Evidence of Full Implementation

The assessment missed these because the files are untracked in git (new, not yet committed). But they are fully functional.

#### Backend

| Component | File | Lines | Status |
|---|---|---|---|
| Models | `backend/app/models/tier_b.py` | 27 | `EnergyLabelCard`, `CrimeStatsCard`, `TierBResponse` |
| Service | `backend/app/services/tier_b.py` | 274 | Parallel fetch: EP-Online + CBS OData 47018NED/47022NED + population |
| Endpoint | `backend/app/api/address.py:338-378` | 40 | `GET /{vbo_id}/tier-b` with caching (7d TTL) |
| Config | `backend/app/config.py:22-27,40` | 6 | URLs + API key + TTL externalized |
| Tests | `backend/tests/test_address_api.py` | ~30 | Endpoint + caching test with mocked service |

**Service details** (`tier_b.py`):
- `_get_energy_label()` calls EP-Online API v5 (`PandEnergielabel/Adres`)
- `_get_crime_stats()` calls CBS OData yearly (47018NED) + monthly (47022NED)
- `_fetch_population()` gets resident count from CBS for per-1,000 normalization
- `get_tier_b_data()` orchestrates via `asyncio.gather()`
- Graceful degradation with 8+ distinct error codes (`ENERGY_AUTH_REQUIRED`, `CRIME_NO_DATA`, etc.)

#### Frontend

| Component | File | Lines | Status |
|---|---|---|---|
| Component | `frontend/src/components/TierBSignalsCard.tsx` | 126 | 3 states (loading/error/data), energy label with color coding, crime metrics |
| Styles | `frontend/src/components/TierBSignalsCard.css` | 120 | Responsive grid, severity colors, disclaimer box |
| Tests | `frontend/src/components/TierBSignalsCard.test.tsx` | 74 | 3 tests: loading, data rendering, fallback messages |
| API client | `frontend/src/services/api.ts:228-256` | 28 | `getTierBData()` with 20s timeout |
| Types | `frontend/src/types/api.ts:230-248` | 18 | `TierBResponse`, `EnergyLabelCard`, `CrimeStatsCard` |
| i18n | `frontend/src/i18n/en.json + nl.json` | 20+ keys | Full EN/NL coverage |

#### App Integration

**State** (`App.tsx:116-118`):
```tsx
const [tierBData, setTierBData] = useState<TierBResponse | null>(null);
const [tierBLoading, setTierBLoading] = useState(false);
const [tierBError, setTierBError] = useState(false);
```

**Fetch** (`App.tsx:365-382`): Fire-and-forget IIFE with race condition guard.

**Render** (`App.tsx:707-713`): Three-state conditional rendering.

**Loading screen integration** (`App.tsx`): Shows `loading.warning.tierB` toast on fetch failure.

### What Tier B Includes

| Signal | Data Source | Fields |
|---|---|---|
| **Energy label** | EP-Online v5 | label (A-G), source, source_date, message |
| **Crime — yearly** | CBS 47018NED | total_per_1000, burglary_per_1000, violent_per_1000 |
| **Crime — monthly** | CBS 47022NED | monthly_total_per_1000, monthly_period |

**Mandatory disclaimers present:** "Crime values are registered incidents per 1,000 residents, not total incidents. Data is indicative." (`TierBSignalsCard.tsx:122`, translated in both languages)

**Verdict: Assessment claim "Missing" is WRONG.** Tier B is fully implemented end-to-end.

### Note on EP-Online Authentication

The energy label API may require an API key (`BUURT_ENERGY_LABEL_API_KEY` env var). The service handles auth failures gracefully with `ENERGY_AUTH_REQUIRED` message code. Without a key, energy labels show as unavailable while crime data still works.

---

## Overall Phase 3 Summary

### Complete (core functionality)

| Item | Status | Evidence |
|---|---|---|
| **8. PDF export** | DONE (both templates) | Backend: `generate_quick_brief()` + `generate_full_dossier()`. Frontend: both template buttons. |
| **9. Parallel coordinates** | DONE (component integrated) | `ParallelCoordinates.tsx` imported at `CompareScreen.tsx:6`, rendered at lines 91-96, tested. |
| **10. Tier B cards** | DONE (full stack) | Backend models/service/endpoint + frontend component/styles/tests/i18n/App integration. |

### Remaining Gaps (visual polish only)

| Gap | Severity | Effort | Files |
|---|---|---|---|
| **Parallel coordinates series colors** | High (readability) | 1 line change | `ParallelCoordinates.tsx:25` |
| **Parallel coordinates data point size** | Medium | 1 line + 1 CSS rule | `ParallelCoordinates.tsx:114`, `ParallelCoordinates.css:42` |
| **Export template selector cards** | Low (cosmetic) | Moderate — redesign buttons to cards with illustrations | `ExportBottomSheet.tsx`, `ExportBottomSheet.css` |
| **Export circular progress ring** | Low (cosmetic) | Moderate — replace linear bar with SVG ring | `ExportBottomSheet.tsx`, `ExportBottomSheet.css` |
| **Export language segmented control** | Low (cosmetic) | Small — add selectable EN/NL toggle | `ExportBottomSheet.tsx` |
| **Export download icon on button** | Low (cosmetic) | Trivial — add SVG icon | `ExportBottomSheet.tsx` |
| **System share sheet** | Medium (feature) | Moderate — Web Share API integration | `ExportBottomSheet.tsx` |

### Concrete Implementation Steps for Remaining Gaps

**1. Fix parallel coordinates colors (5 minutes)**
```
File: frontend/src/components/ui/ParallelCoordinates.tsx
Line 25: Change SERIES_COLORS to ['#00897B', '#E8913A', '#7C4DFF']
Line 114: Change r="3" to r="4"

File: frontend/src/components/ui/ParallelCoordinates.css
Line 34: Change stroke-width: 2.2 to stroke-width: 2
Line 42: Change stroke-width: 1.2 to stroke-width: 2
```

**2. Add system share (if desired for MVP)**
```
File: frontend/src/components/ExportBottomSheet.tsx
After PDF blob is created, check navigator.share availability:
  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    await navigator.share({ files: [pdfFile], title: 'Viewing Briefing' });
  } else {
    // fallback to download (current behavior)
  }
```

**3. Export UX polish (lower priority)**
- Template cards: Replace `<button>` with card divs containing mini page SVG illustrations
- Progress ring: Replace linear `<div>` bar with SVG `<circle>` with `stroke-dasharray` animation
- Language control: Add `<LanguageToggle>` component (already exists elsewhere in app)
- Download icon: Add inline SVG to generate button

---

## Assessment Report Accuracy Score (Phase 3)

Of the 5 specific claims about Phase 3:
- **4 claims were WRONG** (API restriction, full dossier missing, frontend template single-option, Tier B missing)
- **1 claim was PARTIALLY ACCURATE** (progress/share behavior gaps exist but scope was overstated)

**Phase 3 accuracy: ~10%** (0.5 correct out of 5 claims).

---

## Cumulative Assessment Report Accuracy

| Phase | Claims | Wrong | Partially Accurate | Accurate | Accuracy |
|---|---|---|---|---|---|
| Phase 1 | 3 | 3 | 0 | 0 | 0% |
| Phase 2 | 6 | 5 | 0 | 1 | 17% |
| Phase 3 | 5 | 4 | 1 | 0 | ~10% |
| **Total** | **14** | **12** | **1** | **1** | **~11%** |

The implementation assessment report's technical claims have an **89% error rate** across all three phases. The root cause is consistent: the assessment was generated against a stale code snapshot that predates significant development work.
