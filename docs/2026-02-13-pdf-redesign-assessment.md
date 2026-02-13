# PDF Redesign Plan — Rigorous Assessment Report

**Date:** 2026-02-13
**Documents assessed:**
- `docs/plans/2026-02-13-pdf-redesign-design.md` (design doc, approved)
- `docs/plans/2026-02-13-pdf-redesign-implementation.md` (implementation plan, 10 tasks)

**Method:** Each section of both documents verified against actual source code at HEAD (`78ddf51`). All function signatures, model fields, API contracts, and data flow paths traced end-to-end. Checked against `docs/ui-principles.md` for design compliance.

---

## Executive Summary

The design doc is sound and internally consistent. The implementation plan has **5 high-severity issues** that would cause bugs, data loss, or broken functionality if executed as-is, **4 medium-severity issues** that reduce quality or violate project conventions, and **3 low-severity issues**. The plan should be revised before execution.

---

## Finding 1 — HIGH: Base64 Shadow Image in GET Query String Exceeds URL Limits

**What the plan does:**
The existing export flow (unchanged by the plan) sends a base64-encoded shadow PNG as a GET query parameter:
- `api.ts:224-225`: `params.set('shadow_image', options.shadowImageB64)`
- `api.ts:237`: `fetch(\`/api/address/${vboId}/export?${params}\`)`
- `address.py:476`: `shadow_image: str | None = Query(None)`

**Problem:**
A 3D shadow snapshot at 170mm print width is typically 50-200KB of PNG data. Base64 encoding adds ~33% overhead, producing 70-270KB of URL-encoded text. Browser URL limits are typically 2,048-8,192 characters (varies by browser/server). A 100KB image becomes ~137KB base64 = ~137,000 characters — **far exceeding all URL length limits.**

This means shadow images silently fail for most real-world exports. The URL is truncated or rejected, and the PDF is generated without the shadow (best case) or the request fails entirely (worst case).

This violates `ui-principles.md:104` ("Performance is Credibility") and `:112` ("Keep initial payloads under 500KB").

**Fix:**
Switch from GET with query param to POST with JSON body:
```python
# Backend: change GET to POST
@router.post("/{vbo_id}/export")
async def export_briefing(
    vbo_id: str = Path(...),
    body: ExportRequest = Body(...),  # Pydantic model with shadow_image field
):
```
```typescript
// Frontend: POST with JSON body
const resp = await fetch(`${API_BASE}/address/${vboId}/export`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...params, shadow_image: shadowImageB64 }),
  signal: controller.signal,
});
```

Alternatively, keep GET for metadata + optional POST body for the image. Either way, the base64 data must leave the query string.

---

## Finding 2 — HIGH: Tier-B API Parameter Naming Mismatch + Missing Fields

**What the plan says (line 1683-1695):**
```python
postcode: str | None = Query(None)
huisnummer: str | None = Query(None)  # <-- Dutch naming
```
Then passes:
```python
tier_b.get_tier_b_data(
    house_number=huisnummer,  # <-- translates Dutch → English
    house_letter=None,        # <-- always None
    addition=None,            # <-- always None
)
```

**What the actual codebase uses:**
- `address.py:428-430` — existing `/tier-b` endpoint uses `house_number`, `house_letter`, `addition` (English)
- `tier_b.py:261-273` — `get_tier_b_data()` signature: `house_number`, `house_letter`, `addition`
- `tier_b.py:111-116` — `_get_energy_label()` uses all four fields for EP-Online lookup
- `frontend/src/types/api.ts:20-22` — `ResolvedAddress` has `house_number`, `house_letter`, `addition`, `postcode`

**Problems:**
1. **Naming inconsistency.** `huisnummer` (Dutch) vs every other endpoint's `house_number` (English).
2. **Missing fields.** `house_letter` and `addition` hardcoded to `None` reduces EP-Online hit rate. "Keizersgracht 123A" has `house_letter="A"`, "Keizersgracht 123-2" has `addition="2"`. Without these, energy label lookups fail for many addresses.
3. **Frontend has the data.** `ResolvedAddress` stores all fields, but the plan never threads them.

**Fix:**
Add to export endpoint: `house_number`, `house_letter`, `addition`, `postcode` (matching `/tier-b` naming). Pass all four to `get_tier_b_data()`.

---

## Finding 3 — HIGH: Frontend Data Flow Incomplete (App.tsx Not Updated)

**What the plan says (Task 9, line 1757-1795):**
- Modify `api.ts` + `ExportBottomSheet.tsx`

**What's missing:**
- `App.tsx:866-883` renders `<ExportBottomSheet>` without `postcode`, `house_number`, `house_letter`, `addition`, or `buurt_code` props
- These values exist on `address` state in App.tsx but are never threaded through

**The full data path requires 3 file changes, not 2:**
1. `ExportBottomSheet.tsx` — add props
2. `App.tsx` — pass from `address` state
3. `api.ts` — add to `ExportOptions` and URL params

**Fix:** Add App.tsx to Task 9's file list. Thread all address fields.

---

## Finding 4 — HIGH: Export Endpoint Bypasses Cache + Uses Sequential Fetches

**What the plan does (line 1631-1658):**
```python
# Direct service calls — no cache check, sequential execution
nb_resp = await cbs.get_neighborhood_stats(vbo_id=vbo_id, lat=lat, lng=lng)
tier_b_data = await tier_b.get_tier_b_data(vbo_id=vbo_id, ...)
```

**What the existing endpoints do (address.py:288-315, 433-463):**
```python
# Cache-first pattern
cache_key = f"neighborhood:{buurt_code}" if buurt_code else f"neighborhood:{lat:.4f}:{lng:.4f}"
cached = await cache_get(cache_key)
if cached is not None:
    return NeighborhoodStatsResponse(**cached)
result = await cbs.get_neighborhood_stats(...)
```

**Impact:**
- By export time, data is **already cached** from dossier screen endpoint calls
- Direct service calls ignore this cache, adding ~5-15s of unnecessary external API calls
- Sequential execution compounds: neighborhood (1-3s) + tier-b (2-5s) = 3-8s that could run in parallel
- If APIs are slow/down, export fails despite cached data existing

Also missing: `buurt_code` not passed to CBS call (plan line 1632), forcing bbox fallback (slower, may return wrong buurt on boundary).

**Fix:**
Cache-first pattern + `asyncio.gather()` for parallel fetch:
```python
async def _fetch_neighborhood_cached(vbo_id, lat, lng, buurt_code):
    cache_key = (f"neighborhood:{buurt_code}" if buurt_code
                 else f"neighborhood:{lat:.4f}:{lng:.4f}")
    cached = await cache_get(cache_key)
    if cached:
        return NeighborhoodStatsResponse(**cached).stats
    try:
        resp = await cbs.get_neighborhood_stats(
            vbo_id=vbo_id, lat=lat, lng=lng, buurt_code=buurt_code)
        return resp.stats if resp else None
    except Exception:
        return None

# Parallel
neighborhood_stats, tier_b_data = await asyncio.gather(
    _fetch_neighborhood_cached(...),
    _fetch_tier_b_cached(...),
)
```

---

## Finding 5 — HIGH: Page Count Claims Are Contradictory and Untested

**Plan claims:** "Quick Brief stays 1 page. Full Dossier expands from 4 to 5 pages."
**Design doc line 133:** "No max question limit — flows to additional pages if needed."

These cannot both be true. The checklist with `max_questions=None` (plan line 1437) will overflow page 4 when many questions exist. `pdf.set_auto_page_break(auto=True)` enables automatic overflow.

**No test verifies page count.** All tests check `%PDF-` prefix and byte length only.

**Fix:**
1. Acknowledge "5+ pages" (5 minimum, more if checklist overflows). Update i18n strings.
2. Add page count tests using fpdf2's `pages_count` attribute (accessible on the FPDF object before `output()`):
```python
def test_quick_brief_single_page():
    pdf = _generate_quick_brief_as_pdf(...)  # Return FPDF object before output()
    assert pdf.pages_count == 1

def test_full_dossier_minimum_pages():
    pdf = _generate_full_dossier_as_pdf(...)
    assert pdf.pages_count >= 5
```
If Quick Brief overflows, dynamically reduce `max_questions` or cap shadow image height.

---

## Finding 6 — MEDIUM: Risk Grid Collapses When Risks Are Unavailable

**Plan code (line 755-778):**
```python
def _build_risk_cells(risks, sunlight_score, is_nl):
    cells = []
    if risks:  # Only adds 3 cells if risks is truthy
        for cat_key, ... in [...]:
            cells.append(...)
    cells.append(("Sunlight", sunlight_score, ...))  # Always 1 cell
    return cells
```

When `risks=None`, the grid has 1 cell instead of 4. This violates `ui-principles.md:72` ("Be transparent about gaps... show 'Data unavailable' per-card. Never break the dossier") and the design doc's 2x2 grid requirement.

**Fix:** Always produce 4 cells with "N/A" placeholders when risks unavailable.

---

## Finding 7 — MEDIUM: Design Doc Specifies `floor_area`, Plan Omits It

Design doc line 73 lists `floor_area` as required data. Line 231 says "Quick Brief signature gains optional `floor_area` param." The implementation plan's `generate_quick_brief()` (line 682) has no `floor_area` parameter.

`BuildingFacts.floor_area_m2: int | None` exists in the model. The export endpoint already fetches building facts but doesn't extract `floor_area_m2`.

**Fix:** Add `floor_area: int | None = None` to both PDF functions. Display: "Built 1875 · Residential · 85 m²".

---

## Finding 8 — MEDIUM: Test Strategy Is Smoke-Only + Proposed Tests Are Technically Brittle

**Plan tests check only:** `%PDF-` prefix + byte length (`> 500`, `> 1000`, `> 2000`).

The design doc's test strategy (line 240-248) promises "check rect drawing calls via mock", "check PDF metadata for Satoshi", "test energy badges A-G", "test unavailable indicators render as '--'" — **none implemented.**

**Additionally:** Raw byte assertions like `assert b"Keizersgracht" in pdf_bytes` (proposed in the original Finding 7 fix) are **unreliable with fpdf2 TTF/Unicode fonts.** fpdf2 compresses PDF content streams and encodes text using font-specific CID mappings. Generated PDF bytes typically do NOT contain plain-text strings. This was verified locally: text strings were not findable via byte search in actual fpdf2-generated PDFs.

**Correct test approaches:**
1. **Page count:** Use `pdf.pages_count` on the FPDF object before calling `output()`. Refactor generators to optionally return the FPDF instance.
2. **Drawing calls:** Spy/mock `rect()`, `cell()`, `set_fill_color()` on the BuurtCheckPDF instance to verify score bars, checkboxes, and severity colors are drawn with correct parameters.
3. **PDF text extraction:** If content verification is needed, use `pdfplumber` or `PyPDF2` (add as test dep) to extract text from generated bytes. This correctly handles font encoding and compression.
4. **Structural assertions:** Count `add_page()` calls, verify `section_title` is set per page, check `set_font("Satoshi", ...)` calls happen.

```python
from unittest.mock import patch, call

def test_quick_brief_draws_4_risk_cells():
    """Verify 4 score bars are drawn in the risk grid."""
    with patch.object(BuurtCheckPDF, 'draw_score_bar') as mock_bar:
        generate_quick_brief(
            address="Test", risks=_make_risks(), sunlight_score=80,
            viewing_questions=_make_viewing_questions(),
        )
        assert mock_bar.call_count == 4

def test_quick_brief_page_count():
    """Quick Brief must be exactly 1 page."""
    with patch.object(BuurtCheckPDF, 'output', wraps=None) as mock_out:
        # Intercept the FPDF object to check pages_count
        ...
```

---

## Finding 9 — MEDIUM: PDF Does Not Enforce UI Principles Acceptance Criteria

The assessment (and plan) do not verify compliance with `docs/ui-principles.md`. Key acceptance criteria missing:

| Principle | Ref | What to verify in PDF |
|-----------|-----|----------------------|
| **4-part risk hierarchy** | `:33-37` | Every risk category must show: (1) score+severity, (2) what it means, (3) viewing questions, (4) source+date. Plan's risk details page has score+severity+summary+source but **viewing questions are on a separate page**, breaking the hierarchy. |
| **Bilingual resilience** | `:126, :177` | Dutch strings are 20-30% longer than English. No test verifies Quick Brief still fits 1 page with NL text. No truncation test. |
| **5-8 indicator cap** | `:12` | Neighborhood page has 9 indicators + energy + crime = 11 data points. Exceeds "5-8 indicators per section" guideline. |
| **Standalone artifact** | `:122` | "The exported briefing should work as a standalone artifact — not a screenshot of the app." The plan's checklist page (p.4) correctly adds a risk strip for standalone use, but the risk details page (p.2) has no address header — a reader receiving only p.2 has no context. |
| **Source + date on every risk** | `:69` | Plan draws source at the end of each risk detail block, which is correct. But if `source_date` is None, the plan shows nothing — should show "Date unknown" per existing convention. |

**Fix:** Add acceptance criteria to Task 10 that explicitly verify each UI principle:
1. Test Quick Brief in NL to verify 1-page constraint holds with longer strings
2. Add address line to risk details page header for standalone readability
3. Ensure `source_date` fallback shows "Dataset date unknown" / "Brondatum onbekend"
4. Consider grouping neighborhood indicators into subsections (People / Housing / Access) each with 3-4 items to honor the 5-8 spirit

---

## Finding 10 — LOW: i18n Full Dossier Description Says "3-4 pages"

- `en.json:262`: `"export.fullDossierMeta": "3-4 pages"`
- `nl.json:262`: `"export.fullDossierMeta": "3-4 pagina's"`

After redesign: Full Dossier is 5+ pages.

**Fix:** Update both files + `ExportBottomSheet.tsx` fallback to "5+ pages" / "5+ pagina's".

---

## Finding 11 — LOW: `git add -A` in Final Commit Step

Plan line 1832: `git add -A` may capture unrelated/sensitive files.

**Fix:** Use explicit file paths in commit step.

---

## Finding 12 — LOW: Test Baseline Drift in Documentation

Plan line 13: "293 backend non-live tests" — **correct** (verified).
`CLAUDE.md`: "275 non-live" — outdated.
Project-level memory (`MEMORY.md` in `.claude/projects/`): "288 non-live" — outdated (not in repo, project-level config).

**Fix:** Update CLAUDE.md baseline after implementation. Project memory updates are a separate concern (not in repo).

---

## Summary Table

| # | Severity | Finding | Plan Task | Fix Required |
|---|----------|---------|-----------|--------------|
| 1 | HIGH | Base64 shadow in GET query exceeds URL limits | 7, 9 | Switch to POST or multipart |
| 2 | HIGH | Tier-B param naming + missing house_letter/addition | 7, 9 | Rename, thread all fields |
| 3 | HIGH | Frontend wiring incomplete (App.tsx not in scope) | 9 | Add App.tsx, thread props |
| 4 | HIGH | Export bypasses cache + sequential fetches | 7 | Cache-first + asyncio.gather() |
| 5 | HIGH | Page count contradictory and untested | 4, 5, 6 | Acknowledge 5+, add page tests |
| 6 | MEDIUM | Risk grid collapses to 1 cell when risks=None | 4, 5 | Always produce 4 cells |
| 7 | MEDIUM | Design says floor_area, plan omits it | 4 | Add param or update design |
| 8 | MEDIUM | Tests smoke-only + proposed text-byte assertions brittle | 2-6 | Mock drawing calls, use pdfplumber |
| 9 | MEDIUM | PDF doesn't enforce ui-principles acceptance criteria | 10 | Add bilingual, 4-part, standalone checks |
| 10 | LOW | i18n says "3-4 pages", should be "5+" | 9 (new) | Update en.json, nl.json |
| 11 | LOW | git add -A captures unrelated files | 10 | Use explicit paths |
| 12 | LOW | Test baseline drift in CLAUDE.md | — | Update after implementation |

---

## Concrete Remediation Steps

### Step 1: Switch Export to POST (Finding 1)

**Backend (`address.py`):**
```python
from pydantic import BaseModel as PydanticBaseModel

class ExportRequest(PydanticBaseModel):
    rd_x: float
    rd_y: float
    lat: float
    lng: float
    address: str
    template: str = "quick_brief"
    language: str = "en"
    shadow_image: str | None = None
    street: str | None = None
    city: str | None = None
    buurt_code: str | None = None
    postcode: str | None = None
    house_number: str | None = None
    house_letter: str | None = None
    addition: str | None = None

@router.post("/{vbo_id}/export")
async def export_briefing(
    vbo_id: str = Path(..., pattern=r"^[0-9]{16}$"),
    body: ExportRequest = Body(...),
):
```

**Frontend (`api.ts`):**
```typescript
const resp = await fetch(`${API_BASE}/address/${options.vboId}/export`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rd_x: options.rdX, rd_y: options.rdY,
    lat: options.lat, lng: options.lng,
    address: options.address,
    template: options.template || 'quick_brief',
    language: options.language || 'en',
    shadow_image: options.shadowImageB64 || null,
    street: options.street || null,
    city: options.city || null,
    buurt_code: options.buurtCode || null,
    postcode: options.postcode || null,
    house_number: options.houseNumber || null,
    house_letter: options.houseLetter || null,
    addition: options.addition || null,
  }),
  signal: controller.signal,
});
```

### Step 2: Revise Task 7 — Cache-First + Parallel Fetch (Finding 4)

Use cache-first helpers + `asyncio.gather()` as shown in Finding 4 fix above. Add `buurt_code` to CBS call.

### Step 3: Revise Task 9 — Complete Frontend Wiring (Findings 2, 3)

Add `App.tsx` to file list. Thread `postcode`, `houseNumber`, `houseLetter`, `addition`, `buurtCode` through `ExportBottomSheet` → `api.ts` → backend.

### Step 4: Fix `_build_risk_cells()` — Always 4 Cells (Finding 6)

Produce placeholder cells with "N/A" when `risks=None`.

### Step 5: Replace Smoke Tests with Structural Tests (Finding 8)

- **Page count:** Refactor generators to return FPDF instance, check `pages_count`
- **Drawing calls:** Mock `draw_score_bar`, `draw_checkbox`, `draw_comparison_chart` to verify call counts and parameters
- **Content text:** Add `pdfplumber` as test dep for text extraction if needed
- **NL page overflow:** Test Quick Brief with NL language to verify 1-page constraint with longer strings

### Step 6: Add UI Principles Acceptance Criteria (Finding 9)

Add to Task 10 verification checklist:
- [ ] Quick Brief NL fits 1 page (Dutch 20-30% longer)
- [ ] Every risk detail block has score+severity, meaning, source+date
- [ ] Risk details page has address context for standalone readability
- [ ] `source_date=None` shows "Dataset date unknown" / "Brondatum onbekend"
- [ ] Neighborhood page indicators grouped into subsections of 3-4

### Step 7: Update i18n + Baselines (Findings 10, 12)

- Update `en.json`/`nl.json` "3-4 pages" → "5+ pages"
- Update CLAUDE.md test baselines after implementation

---

## Recommendation

**Do not execute the plan as-is.** The 5 high-severity issues (GET payload size, param mismatch, incomplete wiring, cache bypass, contradictory page counts) would cause real bugs. The 4 medium issues (grid collapse, missing floor_area, brittle tests, missing UI-principles checks) reduce quality below codebase standards.

Apply the 7 remediation steps above, then the plan is solid and can proceed.
