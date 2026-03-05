# P0 Implementation Assessment — 2026-03-05

**PDF assessed:** `full-dossier.pdf` (7 pages, 1.4 MB)
**Address:** Talmaweg 1a, Barendrecht
**Baseline document:** `p0-reassessment-2026-03-04.md` (assessed Joghtlaan 7, Valkenburg)
**Method:** Visual inspection of exported PDF + static code analysis of backend/frontend source
**Note:** Test suite execution was not possible in this environment (no pip/npm access). All verdicts below are based on visual evidence and code reading only.

---

## P0-1 — Comparison Charts Clipped at Right Edge

**Previous verdict (2026-03-04):** CLOSED
**Current verdict:** ✅ CONFIRMED CLOSED

### Visual evidence (this PDF)

All four comparison charts render in single-column stacked layout at full page width (~170mm):

| Chart | Page | Bars visible | Scores | Reference line | Label |
|-------|------|-------------|--------|----------------|-------|
| Noise | 1 | 3/3 (address 64, peer 59, NL 66) | ✅ | WHO benchmark dashed | Fully visible |
| Air Quality | 2 | 3/3 (address 68, peer 62, NL 68) | ✅ | WHO benchmark dashed | Fully visible |
| Climate Stress | 2 | 3/3 (address 15, peer 53, NL 61) | ✅ | Target dashed | Fully visible |
| Sunlight | 2 | 2/2 (peer 56, NL 63 — no address bar) | ✅ | Daylight target dashed | Fully visible |

No clipping, truncation, or overflow on any chart. Reference line labels ("WHO benchmark (mapped to score)", "Target (mapped to score)", "Daylight target (mapped to score)") are all fully legible.

### Code quality

The rendering lives in `pdf_export.py` with a two-tier approach: matplotlib vector charts (primary) falling back to native fpdf2 horizontal bar drawing. Both paths use full content width (`pdf.w - margins`). Bar height is 7mm per row with a 2.5mm gap separating the address bar from peer/national rows. The chart explanatory footnote ("Comparison bars use the buurt-check 0-100 scale...") appears below the last chart on page 2.

### Remaining concerns

None. This P0 is fully resolved.

---

## P0-2 — Shadow Panels Must Be Full Page Width

**Previous verdict (2026-03-04):** CLOSED
**Current verdict:** ✅ CONFIRMED CLOSED

### Visual evidence (this PDF)

Three seasonal shadow snapshots rendered at full page content width, stacked vertically across pages 3-4:

| Panel | Page | Width | Info box | North arrow | Scale bar | Legend |
|-------|------|-------|----------|-------------|-----------|--------|
| Winter solstice | 3 | Full (~170mm) | ✅ Top-left (date, time, timezone) | ✅ Single compass rose (top-right) | ✅ "50m" bottom-left | ✅ "Sunlit area / Shaded area" bottom-right |
| Spring equinox | 3 | Full (~170mm) | ✅ Top-left | ✅ Single | ✅ "50m" | ✅ Full legend |
| Summer solstice | 4 | Full (~170mm) | ✅ Top-left | ✅ Single | ✅ "50m" | ✅ Full legend |

Each panel has a caption below ("Winter solstice · 12:00 CET", etc.) and the section ends with "Source: 3DBAG / TU Delft + SunCalc."

### Code quality

The export endpoint detects 3+ shadow images and routes to `_draw_shadow_triptych()` — but the function name is now misleading since the actual rendering is full-width stacked (not side-by-side). The old triptych layout at ~55mm per panel has been replaced with sequential full-width images preserving 16:9 aspect ratio. Frontend PNGs are embedded directly (no matplotlib wrapper), eliminating the dark blue `#1C2D3F` padding, duplicate north arrows, and overlapping text artifacts from the previous implementation.

### Sub-defect closure (all 7/7)

| Sub-defect | Status | Evidence |
|------------|--------|----------|
| 3a: Blue matplotlib background | ✅ Closed | Scene background only, no wrapper padding |
| 3b: Duplicate north arrow | ✅ Closed | Single compass rose per panel |
| 3c: Scale bar barely visible | ✅ Closed | Enlarged with contrast panel, "50m" label legible |
| 3d: Legend barely visible | ✅ Closed | Enlarged legend box with distinct swatches |
| 3e: "Direct sun" label meaningless | ✅ Closed | Replaced with "Sunlit area (direct rays) / Shaded area" |
| 3f: Overlapping text | ✅ Closed | Single info box per panel, no overlay conflict |
| 3g: Panels too small (55mm) | ✅ Closed | Full page width (~170mm) |

### Remaining concerns

Minor: function name `_draw_shadow_triptych()` no longer describes what it does. Low priority.

---

## P0-3 — Sunlight Pipeline "Not Completed"

**Previous verdict (2026-03-04):** OPEN (two sub-issues: A — data routing, B — analysis never completing)
**Current verdict:** ❌ STILL OPEN — Issue B persists; Issue A shows improvement

### Visual evidence (this PDF)

| Location | Content | Assessment |
|----------|---------|------------|
| Page 1, Risk table | Sunlight → "Data gap (see Sunlight Status)" / "Not completed" | ❌ No score |
| Page 1, Risk grid | SUNLIGHT tile → "—" | ❌ No score |
| Page 2, Sunlight comparison chart | Peer baseline: 56, Netherlands: 63. **No "This address" bar** | ✅ Consistent — address row correctly stripped |
| Page 2, Sunlight Status | Yellow callout: "Data gap: sunlight analysis not completed" | ❌ Not completed |
| Page 6, Property Checks | "Direct sun" → yellow card → "Sunlight analysis was not completed before export" | ❌ Not completed |
| Pages 3-4, Shadow Snapshots | Full 3D renders with building geometry, sun position, shadows | ✅ 3D model loaded successfully |

### Issue A — Data routing inconsistency: IMPROVED

The previous PDF (Joghtlaan 7) showed a score of 60 in the Sunlight comparison chart while the risk table said "Data gap". This PDF (Talmaweg 1a) does NOT show that inconsistency — the address row is correctly stripped from the sunlight comparison chart, and "Data gap" is consistently displayed across all sections.

**Code analysis:** The stripping logic at `address.py:1346-1355` checks `if sunlight_score is None` and removes the address row from the comparison chart. This is working correctly for this export. However, the previous inconsistency likely occurred due to a **timing-dependent code path**: if `_await_sunlight_for_export()` finds data in the cache during the 20s wait, it updates `sunlight_score` but does NOT rebuild `risk_comparisons_data`. The comparison chart was built at line 1342 (before the wait resolves), so a late cache hit would set `sunlight_score` to a value while the comparison data still contains stale address rows — causing the stripping condition (`sunlight_score is None`) to be false, leaving the old address row in place.

**Root cause (latent):** `build_risk_comparisons()` runs at line 1342, before the sunlight wait at line 1273 can update `risks.sunlight`. If a late cache hit occurs, the comparison data isn't rebuilt. The stripping at line 1347 becomes the only guard, but it checks the wrong condition — it strips when score is None, but after a late wait the score is no longer None, so stale comparison rows survive.

**Risk:** The inconsistency is timing-dependent and will resurface whenever the sunlight cache hit arrives during the 20s polling window. The current export just happened to have no cached data at all (full timeout).

### Issue B — Sunlight analysis never completing: STILL OPEN

Across three different addresses (this PDF + two from the 2026-03-04 audit), sunlight consistently shows "not completed" despite shadow snapshots proving the 3D model loaded and rendered successfully. The shadow panels show three seasons with accurate sun positions (winter: az 171° alt 14°, spring: az 164° alt 37°, summer: az 135° alt 55°), confirming the 3D pipeline works.

**Root cause analysis from code:**

The failure chain has three contributing factors:

**Factor 1 — Frontend fire-and-forget submission (App.tsx:1076-1085):**
`handleSunlightAnalysis()` calls `submitSunlightForExport(result, 'analysis')` but wraps it in `.catch(() => undefined)` — swallowing all errors silently. If the POST to `/api/{vbo_id}/sunlight` fails (network, 401, Redis down), the user sees no indication and the backend never caches the data.

**Factor 2 — Race condition between submission and export:**
The user can trigger export before `submitSunlightAnalysis()` completes its round-trip. The sequence is:
1. `computeSunlight()` finishes → state updates
2. `submitSunlightForExport('analysis')` fires (async, not awaited by export)
3. User clicks export → `handleBeforeExportGenerate()` fires `submitSunlightForExport('export')`
4. Backend receives export request, polls cache for 20s
5. If the 'analysis' POST hasn't landed in Redis yet, the 20s wait times out

**Factor 3 — Entitlement guard (App.tsx:1017-1024):**
`submitSunlightForExport()` checks `isEntitled` and `reportId` before POSTing. If entitlement state is stale or reportId hasn't been set, the function returns early without submitting. Since errors are swallowed, this silent early return is invisible.

**Backend wait is well-implemented:** `_await_sunlight_for_export()` (address.py:158-198) polls Redis every 250ms for up to 20s (`pdf_export_sunlight_wait_seconds = 20.0`). The logic is correct — the problem is that data never arrives in the cache, not that the wait is too short.

### Definition of Done status

| Criterion | Status |
|-----------|--------|
| If comparison chart shows address score, risk table must show same score | ⚠️ Passes in this PDF (no address score shown), but latent timing bug can cause inconsistency |
| If sunlight incomplete, comparison chart should NOT show address bar | ✅ Correct in this PDF — address row stripped |
| Consistent state across all PDF sections | ✅ Correct in this PDF (all show "not completed") |
| At least one export produces PDF with sunlight score in risk table | ❌ Not achieved across any tested address |
| Logging confirms full flow: compute → submit → cache → export reads cache | ❌ Not verified (requires runtime debugging) |
| Race condition mitigated | ❌ Not addressed |

---

## Overall Summary

| P0 Item | Code Quality | Visual Quality | Status | Confidence |
|---------|-------------|---------------|--------|------------|
| P0-1: Comparison charts clipped | Good — dual renderer with full-width layout | Excellent — all charts fully visible with scores, bars, reference lines | ✅ CLOSED | High |
| P0-2: Shadow panels too small | Good — direct PNG embed, full-width stacking | Excellent — all 3 seasons rendered with legible overlays | ✅ CLOSED | High |
| P0-3: Sunlight "not completed" | Moderate — wait logic is sound but frontend submission has 3 failure modes | Poor — no sunlight score in any tested export | ❌ OPEN | High |

**Score: 2 of 3 P0 items resolved.** The remaining P0 (sunlight pipeline) requires frontend changes — the backend wait infrastructure is correct, but data never reaches the cache due to frontend submission failures.

---

## Recommended Next Steps for P0-3

**Immediate (fixes the race condition):**

1. In `App.tsx`, make `submitSunlightForExport()` surface errors instead of swallowing them. Replace `.catch(() => undefined)` with `.catch(err => console.error('sunlight submission failed:', err))` at minimum.

2. In `handleBeforeExportGenerate()`, ensure the 'export' submission is truly awaited and its result confirmed before allowing the export POST to fire.

3. Add a `console.warn` when `isEntitled` or `reportId` guards cause early return, so the silent skip is visible in dev tools.

**Structural (fixes the data routing inconsistency):**

4. Move `build_risk_comparisons()` to AFTER the sunlight wait resolves (after line 1285), so comparison data reflects the latest `risks.sunlight` state. This eliminates the need for the address-row stripping workaround at lines 1346-1355.

**Diagnostic (confirms the fix):**

5. Add structured logging to the frontend submission flow: timestamp at compute completion, submission start, submission response, and export request. Compare these timestamps to the backend wait window.
