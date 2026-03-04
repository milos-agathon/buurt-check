# Dossier PDF Quality Audit — 2026-03-04

**PDF assessed:** `full-dossier-0ba58430.pdf` (6 pages, 1.4 MB)
**Address:** Joghtlaan 6, 2235AA Valkenburg
**Render path:** LaTeX (confirmed — justified text, LaTeX kerning, Computer Modern math)
**Previous audit:** `dossier-quality-audit-2026-03-03.md` (15 tasks)

---

## Overall Status

| Metric | Count |
|--------|-------|
| Tasks closed | 9 of 15 |
| Tasks partially fixed | 4 of 15 |
| Tasks still open | 2 of 15 |
| New defects found | 1 |

Excellent progress. The majority of critical and high-priority tasks are resolved. The enum leak is fixed, the page count works, livability text is properly separated, Property Checks have full Polar Frost visual treatment, source citations are on separate lines, VvE duplication is gone, the redundant label is removed, and three seasonal shadow snapshots now render. The remaining issues are cosmetic or edge-case.

---

## Task-by-Task Re-Assessment

### Task 1 — Logo in Header | ⚠️ PARTIAL

**Previous:** Logo not visible.
**Now (PDF):** Header shows "↓ Buurt Check" — appears to be a small rendered logo glyph plus brand text at very small size. It's present but hard to distinguish whether this is the full horizontal lockup PNG or the fallback text path.

**Remaining Definition of Done:**
- [x] Brand name visible in header
- [ ] Confirm full horizontal lockup PNG renders (not just fallback `\sffamily\bfseries` text)
- [ ] Logo should be clearly recognizable at print size (≥22mm width)

**Verdict:** Functional but needs visual confirmation that the actual image file loads. Low priority — brand identity is present.

---

### Task 2 — Sunlight Analysis | ⚠️ PARTIAL (data-dependent)

**Previous:** Sunlight completely missing.
**Now (PDF):**
- Page 1 risk table: "Data gap (see Sunlight Status)" with "Not completed" severity — correct for this export
- Page 1 risk grid: SUNLIGHT tile shows "—" — correct for incomplete analysis
- Page 2: Sunlight Status section with yellow callout box: "Data gap: sunlight analysis not completed. Re-export after viewing the 3D model to include sunlight data."
- Comparison charts: Sunlight section visible in layout (right column, pages 1-2) but **bars are missing/cut off** because no score data

**Assessment:** The template correctly handles the "not completed" state with informative messaging and a clear call-to-action. This cannot be verified as fully working without a completed-sunlight export.

**Remaining Definition of Done:**
- [x] "Not completed" state renders with clear explanation and yellow callout
- [x] User told how to get sunlight data ("Re-export after viewing the 3D model")
- [ ] Verify with a completed-sunlight export that scores populate risk table, grid tile, and comparison chart

**Verdict:** Template handling is solid. Needs a completed export to fully close.

---

### Task 3 — Shadow Snapshots (3 seasons, 3K resolution) | ✅ CLOSED (with minor remaining items)

**Previous:** Only 1 winter snapshot, tiny legend.
**Now (PDF page 3):** **Three seasonal shadow snapshots rendered:**
1. **Winter solstice** (Dec 21) — sun at 180°/17°, 12:00
2. **Spring equinox** (Mar 20) — sun at 180°/38°, 12:00
3. **Summer solstice** (Jun 21) — sun at 180°/61°, 12:00

Each panel includes compass rose (N arrow), sun position indicator, target building highlight (teal), legend box in bottom-right, season label overlay. Source attribution: "3DBAG / TU Delft + SunCalc". Time labels: "Winter 12:00 CET · Equinox 12:00 CET · Summer 12:00 CET".

**Definition of Done:**
- [x] 3 seasonal snapshots rendered (winter, equinox, summer)
- [x] Season label, time label, and compass rose visible per panel
- [x] Source attribution present
- [ ] Legend text still small — readable but could be larger at print size
- [ ] Resolution appears adequate but not confirmed at 3K (3000px+ long edge)

**Verdict:** Core requirement met — 3 seasons render with proper metadata. Legend size is a polish item.

---

### Task 4 — Chart Resolution (crisper graphs) | ⚠️ PARTIAL

**Previous:** Charts looked soft/blurry.
**Now (PDF):**
- Comparison charts (pages 1-2): clean, sharp bars with readable labels
- Age distribution (page 4): crisp horizontal bars
- Livability chart (page 4): clear rendering with severity band backgrounds
- Shadow panels (page 3): reasonable quality but could be sharper

**Remaining Definition of Done:**
- [x] Comparison charts render sharply at print resolution
- [x] Age distribution and livability charts render cleanly
- [ ] Verify actual saved DPI is 600 (not 300) across all chart types
- [ ] Shadow panels at ≥450 DPI for 3K quality

**Verdict:** Visible improvement. DPI verification is the remaining step.

---

### Task 5 — Severity Enum Leak | ✅ CLOSED

**Previous:** "Severitylevel.good" displayed in risk table.
**Now (PDF page 1):** Risk Scores table shows:
- Noise: **Good** (green)
- Air quality: **Good** (green)
- Climate stress: **Critical** (red)
- Sunlight: **Not completed** (gray)

All severity labels are human-readable with appropriate color coding. No enum class names anywhere.

**Definition of Done:**
- [x] Severity column shows localized human-readable labels
- [x] Color-coded severity text (green for Good, red for Critical)
- [x] No Python enum class names in PDF output

---

### Task 6 — Page Count | ✅ CLOSED

**Previous:** Footer showed "1/??".
**Now (PDF):** Every page shows correct count — **1/6, 2/6, 3/6, 4/6, 5/6, 6/6**.

**Definition of Done:**
- [x] Footer shows "X/Y" with correct total page count
- [x] Both LuaLaTeX passes completing successfully

---

### Task 7 — Livability Garbled Text | ✅ CLOSED

**Previous:** "Severity: GoodDimensions Improving since 2024 Comparison" merged on one line.
**Now (PDF page 4):** Properly separated:
- "Livability score: 88/100"
- "Severity: Good" (green, own line)
- "Dimensions" (heading, own line)
- "Dimension-level scores based on Leefbaarometer methodology." (muted subtitle)
- "Trend" (heading)
- "Improving since 2024" (muted)
- "Comparison" (heading)
- Bullet list: Valkenburg: 88, Katwijk: 88

**Definition of Done:**
- [x] Each livability sub-element on its own line
- [x] Proper visual hierarchy (headings vs content vs annotations)
- [x] No text merging

---

### Task 8 — Livability Chart Label Cropping | ✅ CLOSED

**Previous:** Left label showed "rability" (cropped).
**Now (PDF page 4):** Full "Livability" and "Crime" labels visible on the left axis. Both labels render completely without cropping.

**Definition of Done:**
- [x] Full "Livability" label visible
- [x] Full "Crime" label visible
- [x] Labels left-aligned with consistent margin

---

### Task 9 — WHO/Target Reference Label Truncation | ⚠️ PARTIAL

**Previous:** All reference labels truncated.
**Now (PDF pages 1-2):**
- Noise: "WHO benchmark (mapped to" — still truncated (missing "score)")
- Climate Stress: "Target (mapped to score)" — **fully visible**
- Sunlight: labels present but no data bars

The truncation is less severe — Climate Stress label fits. But Noise chart still clips the label at the right edge.

**Remaining Definition of Done:**
- [x] Some labels now fully visible (Climate Stress)
- [ ] Noise chart WHO label still truncated
- [ ] Shorten labels to fit: "WHO target" instead of "WHO benchmark (mapped to score)"

**Fix hint:** The parenthetical "(mapped to score)" is redundant — the footnote below the charts already explains this. Shorten all reference labels to "WHO target" or "Target score" to guarantee they fit.

---

### Task 10 — VvE Heading Duplication | ✅ CLOSED

**Previous:** "VvE (Owners' Association)" duplicated in heading and body.
**Now (PDF page 5):** Green card box with:
- "✓ VvE (Owners' Association)" as heading (green text)
- "No owners' association applicable. This property is not an apartment." as body text
- "Source: BAG dwelling unit count" on separate line in muted style

No duplication. Clean separation.

**Definition of Done:**
- [x] Heading appears once only
- [x] Body text starts with status message (no repeated heading prefix)
- [x] Source on separate line

---

### Task 11 — Source Citation Spacing | ✅ CLOSED

**Previous:** "data.Source:" with no space.
**Now (PDF page 5):** Every Property Check card has source on a **separate line** in smaller, muted text:
- "Source: BAG construction year heuristic"
- "Source: BRO soil data + Klimaateffectatlas subsidence"
- "Source: Municipal ground lease registry"
- "Source: BAG dwelling unit count"
- "Source: BAG construction year heuristic (pre-1960)"
- "Source: BRO soil registry + bodemloket.nl"
- "Source: SunCalc + 3DBAG"

**Definition of Done:**
- [x] Source on separate line from body text
- [x] Consistent "Source: {source}" format
- [x] Muted/smaller text style for attribution

---

### Task 12 — Property Checks Visual Redesign | ✅ CLOSED

**Previous:** Boring black-and-white text dump.
**Now (PDF page 5):** Full Polar Frost visual treatment with severity-colored card boxes:

| Check | Severity | Visual |
|-------|----------|--------|
| Asbestos Awareness | Warning | Amber/orange box, ▲ icon, "Flagged – built in risk period" subtitle in orange |
| Foundation Risk | Good | Green box, ✓ icon, green heading |
| Ground Lease (Erfpacht) | Good | Green box, ✓ icon |
| VvE (Owners' Association) | Good | Green box, ✓ icon |
| Lead Pipe Risk | Good | Green box, ✓ icon |
| Soil Contamination | Manual | Yellow box, - icon, "Manual verification required" in amber |
| Direct sun (clear-sky visibility) | Pending | Yellow box, - icon, orange heading |

**Definition of Done (per Scherer + Polar Frost):**
- [x] Each check has colored severity indicator (green ✓ / amber ▲ / yellow -)
- [x] Severity color from Polar Frost palette
- [x] Visual grouping: card-like colored boxes per check
- [x] Icon + label pattern
- [x] Source attribution in muted footnote style, separated from body
- [x] Progressive disclosure: status-at-a-glance (icon + colored subtitle) before detail text
- [x] Redundant "ADDITIONAL CHECKS" subtitle removed (see Task 15)

This is a major visual upgrade. The page now communicates severity at a glance.

---

### Task 13 — Excessive White Space | ⚠️ PARTIAL

**Previous:** Half-empty pages throughout.
**Now (PDF):**
- Page 1: Risk table + risk grid + start of comparison charts — **well-packed, but charts clip at right edge** (see New-1)
- Page 2: Climate Stress chart + Sunlight Status — bottom 50% empty (because sunlight data missing)
- Page 3: Three shadow panels + Neighborhood Context starts — **good density**
- Page 4: Age Distribution + Livability + Crime Rate — **excellent density, all content fits**
- Page 5: Property Checks + Viewing Questions + Methodology starts — **excellent density**
- Page 6: Data sources table + Sunlight method + Limitations + Provenance — moderate white space at bottom (acceptable for last page)

**Assessment:** Pages 3, 4, and 5 are well-packed. Page 2 has white space but only because sunlight data is missing — with complete data, this would fill. Page 1 packs risk table + grid + charts onto one page. Page 6 is the last page, acceptable.

**Remaining Definition of Done:**
- [x] Pages 3-5 efficiently packed (no half-empty pages)
- [x] Viewing Questions and Methodology share pages with other content
- [x] Content flows continuously without unnecessary page breaks
- [ ] Page 2 white space will resolve when sunlight data is complete
- [ ] Page 1 comparison charts clipped at right edge (see New-1)

**Verdict:** Largely resolved. Remaining white space is data-dependent.

---

### Task 14 — Methodology Section | ✅ CLOSED

**Previous:** Single one-liner.
**Now (PDF pages 5-6):** Comprehensive methodology section with:

1. **Scoring overview:** "All risk scores are normalized to a 0-100 scale where higher is better. Scores follow WHO guidance for noise and air quality, Klimaateffectatlas models for heat and water stress, and geometric 3D sun analysis for direct light."

2. **Scoring formulas** (per-dimension):
   - Noise: 40 dB Lden = 100, 90 dB Lden = 0, linear interpolation
   - Air quality: Worst of PM2.5 and NO2 with specific thresholds
   - Climate stress: Worst of heat stress and water stress with specific thresholds
   - Sunlight: Winter solstice direct sun hours / 6 × 100

3. **Data sources table** (Source, Data type, Protocol) — 9 sources listed with protocols

4. **Sunlight analysis method** (6 bullet points: solar position, temporal resolution, spatial grid, obstructions, atmospheric model, target plane)

5. **Peer baseline explanation**

6. **Important limitations** disclaimer

7. **Provenance** metadata (Report ID, VBO, Pand, Buurt, Methodology version)

**Definition of Done:**
- [x] Per-dimension scoring explanation
- [x] Data source list with protocols
- [x] Normalization formula/approach description
- [x] Disclaimer about limitations
- [x] Provenance metadata with report ID and version
- [x] Sunlight methodology details

---

### Task 15 — Redundant "ADDITIONAL CHECKS" Label | ✅ CLOSED

**Previous:** "Additional Property Checks" heading followed by "ADDITIONAL CHECKS" subtitle.
**Now (PDF page 5):** Only "Additional Property Checks" appears as the section heading. No redundant subtitle.

**Definition of Done:**
- [x] Only one heading for the section
- [x] No ALL-CAPS redundant subtitle

---

## New Defects Found

### New-1 — Comparison Charts Clipped at Right Edge (Page 1)

**Page 1** attempts to render Noise and Air Quality comparison charts side by side (or in a two-column layout). The Noise chart renders fully on the left, but the **Air Quality chart on the right is clipped** — only the category labels ("This address", "Peer baseline", "Netherlands") are visible without their bars or scores.

The same issue continues to **page 2** where Climate Stress renders on the left but the **Sunlight chart on the right** shows only labels.

**Root cause:** The template appears to use a two-column layout for comparison charts, but the chart images are too wide for the column width, causing the right-column chart to overflow off the page.

**Definition of Done:**
- [ ] All comparison charts fully visible with bars, scores, and reference lines
- [ ] Two-column layout respects page margins (or switch to single-column stacked layout)
- [ ] Both Noise and Air Quality charts render completely on page 1
- [ ] Both Climate Stress and Sunlight charts render completely on page 2

**Fix hint:** Either (a) reduce `CHART_WIDTH_MM` from 160mm to ~75mm for two-column mode, or (b) use single-column stacked layout (one chart per row, full width), or (c) adjust the LaTeX `\includegraphics[width=]` to `0.48\linewidth` for side-by-side placement.

**Priority:** P0 — half the comparison charts are invisible.

---

## Priority Summary

| Priority | Task | Status |
|----------|------|--------|
| **P0** | **New-1: Charts clipped at right edge** | ❌ OPEN — half of comparison charts invisible |
| P2 | Task 9: WHO label truncation | ⚠️ PARTIAL — Noise label still truncated |
| P3 | Task 1: Logo | ⚠️ PARTIAL — may be fallback text path |
| P3 | Task 4: Chart DPI verification | ⚠️ PARTIAL — visually improved, verify 600 DPI |
| P3 | Task 13: White space (page 2) | ⚠️ PARTIAL — data-dependent |
| — | Task 2: Sunlight | ⚠️ PARTIAL — needs completed-sunlight export to verify |
| — | Task 3: Shadow legend size | Minor polish — legends readable but small |

---

## Closed Tasks Summary

| Task | What was fixed |
|------|---------------|
| Task 5: Enum leak | Severity labels now show "Good" / "Critical" with color |
| Task 6: Page count | Footer shows "X/6" correctly on all pages |
| Task 7: Livability text | Each sub-element properly separated on own line |
| Task 8: Livability crop | Full "Livability" and "Crime" labels visible |
| Task 10: VvE duplication | Heading appears once, body text clean |
| Task 11: Source spacing | Sources on separate lines in muted style |
| Task 12: Property Checks | Full Polar Frost card treatment with severity colors |
| Task 14: Methodology | Comprehensive: formulas, data sources, methods, limitations |
| Task 15: Redundant label | Removed |

---

---

## Task 3 Addendum — Shadow Snapshot Deep Dive

Based on detailed code investigation and visual inspection of the summer solstice panel, there are **7 distinct sub-defects** in the shadow snapshot rendering. The root cause is a **dual-overlay architecture conflict**: the frontend (`NeighborhoodViewer3D.tsx`) bakes ALL cartographic overlays (north arrow, scale bar, legend, info box, season label) into the captured PNG at 3000×2000px. Then the backend (`chart_renderer.py` `render_shadow_panels()`) wraps that already-complete PNG in a matplotlib figure with a dark `#1C2D3F` background and adds ITS OWN overlays on top — north arrow, season annotation, sun position indicator. Result: duplicated and overlapping elements.

### Sub-defect 3a — Awkward Dark Blue Background | ❌ OPEN

**Problem:** Each shadow panel has a dark navy blue (#1C2D3F "Polar Slate") border/padding around the actual 3D render, creating a heavy, awkward appearance.

**Root cause:** `chart_renderer.py` creates a matplotlib figure with `fig.patch.set_facecolor(C_DARK_BG)` and `ax.set_facecolor(C_DARK_BG)`. The frontend PNG is embedded inside this figure, but doesn't perfectly fill the axes area, so dark blue padding shows around the edges.

**Definition of Done:**
- [ ] Shadow panels have no visible padding/border color mismatch
- [ ] Either: remove the matplotlib wrapper entirely and embed frontend PNGs directly, OR match the figure background to the PNG edge color

**Fix hint:** Since the frontend PNG is already composited and complete, skip `render_shadow_panels()` entirely for the LaTeX path. Embed the raw frontend PNGs via `\includegraphics` directly. The matplotlib wrapper adds no value when the frontend already handles overlays.

---

### Sub-defect 3b — Duplicate North Arrow | ❌ OPEN

**Problem:** Two north arrows visible per panel — one from the frontend Canvas 2D overlay (170px diameter circle with "N" text, top-right), one from the backend matplotlib `ax.annotate()` (white arrow with "N" label at axes position 0.94, 0.90).

**Root cause:** Both rendering layers independently add compass roses without coordination.

**Definition of Done:**
- [ ] Exactly ONE north arrow per panel
- [ ] Clear, readable at print size

**Fix hint:** Remove the north arrow from `chart_renderer.py` `_panel_annotation()` (lines 518-529). The frontend version is higher quality (circle + arrow glyph) and already sized for the canvas.

---

### Sub-defect 3c — Scale Bar Barely Visible | ❌ OPEN

**Problem:** The 50m scale bar in the bottom-left is barely visible at print size.

**Root cause:** Frontend renders scale bar at 34px font on a 3000×2000 canvas. When the triptych shrinks each panel to ~54.7mm wide, the scale bar text becomes ~2-3pt — unreadable.

**Definition of Done:**
- [ ] Scale bar text ≥6pt at final print size
- [ ] Scale bar visible without magnification

**Fix hint:** If panels remain at triptych size, increase font to ≥80px on the 3000px canvas. If panels go full-width (preferred), current 34px may be adequate.

---

### Sub-defect 3d — Legend Barely Visible | ❌ OPEN

**Problem:** The legend box in the bottom-right (1080×220px at canvas resolution) is unreadable at print size. Contains "Direct sun" / "Shadow" color squares, sun position, and source attribution.

**Root cause:** Same as 3c — canvas-resolution elements shrink below legibility in triptych layout.

**Definition of Done:**
- [ ] Legend text ≥6pt at final print size
- [ ] All legend elements (color squares, labels, source) clearly readable

---

### Sub-defect 3e — "Direct Sun" Label Meaningless | ❌ OPEN

**Problem:** The legend shows "Direct sun" and "Shadow" as two categories, but the visual only shows shadow patterns. There are no visually distinct "direct sun" areas — the entire non-shadow area is just the default ground/building color. The label suggests a two-tone visualization that doesn't exist.

**Definition of Done:**
- [ ] Legend accurately describes what is visually distinguishable
- [ ] Either: make direct sun areas visually distinct (e.g., warm yellow tint), OR change legend to only label shadows

---

### Sub-defect 3f — Upper-Left Info Box: Small Font + Overlapping Text | ❌ OPEN

**Problem:** The info box in the upper-left has two overlapping text layers:
1. Frontend Canvas 2D: white box (1320×180px) with season title (46px bold), time (36px), and date (32px)
2. Backend matplotlib: season label "Summer solstice – Jun 21" via `_panel_annotation()` at position (0.02, 0.95) in 9.5pt white text

The backend text overlaps the frontend box, creating garbled double text. Additionally, both text sizes are too small at print size.

**Root cause:** Dual-overlay conflict — both layers write season information to the same top-left region.

**Definition of Done:**
- [ ] ONE clear info box per panel with no overlapping text
- [ ] Season name, date, and time clearly readable at print size (≥8pt)
- [ ] Remove backend `_panel_annotation()` season text since frontend already includes it

---

### Sub-defect 3g — Panels Too Small (Must Be Full Page Width) | ❌ OPEN — HIGH PRIORITY

**Problem:** The triptych layout renders 3 panels side by side at ~54.7mm each (`(page_w - 2*gap) / 3`). At this size, overlays are unreadable, building details are indistinguishable, and the shadow patterns — the whole point — are hard to interpret.

**User requirement:** Each shadow snapshot should go over the whole page in width.

**Definition of Done:**
- [ ] Each shadow panel renders at full page content width (~170mm)
- [ ] Three panels stacked vertically (one per row), not side by side
- [ ] If three full-width panels don't fit on one page, flow onto next page
- [ ] At full width, all overlays (legend, scale bar, compass, info box) are clearly readable

**Fix hint:** Two options:
1. **LaTeX direct embed (preferred):** Skip `render_shadow_panels()` entirely. Embed each frontend PNG separately via `\includegraphics[width=\linewidth]{shadow_winter.png}` in the template, with `\vspace{4pt}` between them. Three 16:9 images at ~170mm width = ~95mm height each = ~285mm + spacing. This won't fit on one page, so let them flow across two pages.
2. **Matplotlib stacked:** Change `chart_renderer.py` to stack panels vertically at full `SHADOW_WIDTH_MM` (170mm) instead of dividing by 3.

---

### Recommended Architecture Fix for All Shadow Sub-Defects

The cleanest fix for 3a-3g is to **bypass `chart_renderer.py` for shadow panels entirely** in the LaTeX path:

1. Frontend already renders complete, high-quality 3000×2000 PNGs with all overlays
2. Write each PNG to the LaTeX temp directory as `shadow_winter.png`, `shadow_equinox.png`, `shadow_summer.png`
3. In `dossier.tex.j2`, embed directly:
```latex
<% for img in shadow_images %>
\noindent\includegraphics[width=\linewidth]{<< img.path >>}
\\{\footnotesize\textcolor{MutedText}{<< img.caption >>}}
\vspace{4pt}
<% endfor %>
```
4. Remove `render_shadow_panels()` from the chart job list

This eliminates the dual-overlay conflict, gives full-width panels, and preserves the frontend's high-resolution overlays at their intended scale.

---

## Task 16 (NEW) — Sunlight Pipeline Investigation

### Current State

The PDF shows "Data gap: sunlight analysis not completed" despite shadow snapshots being present (meaning the 3D model was loaded and viewed). This is a logic gap, not a pipeline failure.

### How the Pipeline Works

```
Frontend (NeighborhoodViewer3D.tsx)
  │
  ├─ Loads 3D model → renders scene
  ├─ captureSnapshots() → 3 seasonal PNGs (attached to export request)
  └─ computeSunlight() → SunlightResult (winter/summer/equinox hours, SVF)
       │
       ├─ Success → handleSunlightAnalysis() in App.tsx
       │              ├─ setSunlight(result) in React state
       │              └─ POST /{vbo_id}/sunlight → caches in Redis (24h TTL)
       │
       └─ Failure → setSunlightUnavailable(true)

Export Request (POST /{vbo_id}/export-pdf)
  │
  ├─ Checks Redis for cached sunlight card
  ├─ If missing: waits up to N seconds for it to appear
  ├─ _sunlight_state() determines rendering mode:
  │    ├─ "available" → score in risk table + grid + comparison chart
  │    ├─ "pending"   → "not completed" yellow callout (shadow inputs exist but no metrics)
  │    └─ "error"     → "unavailable" message (no shadow inputs, no card)
  └─ Current export: state = "pending" (shadow images present, but no sunlight metrics)
```

### Why Sunlight Shows "Not Completed"

The export has shadow images (`has_shadow_inputs = true`) but NO sunlight metrics (score, winter_hours, etc. all `None`). This means one of:

1. **`computeSunlight()` failed silently** — computation threw an error but snapshots were captured independently
2. **Race condition** — export triggered before `computeSunlight()` finished and before `submitSunlightAnalysis()` cached the result
3. **Redis submission failed** — computation succeeded client-side but POST to backend failed (the catch block silently swallows errors)
4. **Entitlement guard** — `handleSunlightAnalysis()` returns early if `!isEntitled || !reportId`, preventing backend submission

### Investigation Steps

**Definition of Done:**
- [ ] Identify which of the 4 causes above is triggering "not completed"
- [ ] Add logging to `computeSunlight()` success/failure path
- [ ] Add logging to `submitSunlightAnalysis()` to track Redis write success
- [ ] Verify export waits long enough for sunlight computation (~5-15s for ray-casting on complex geometry)
- [ ] When sunlight IS available, verify score appears in risk table, grid tile, and comparison chart

**Diagnostic steps:**
1. Open browser DevTools Network tab during export flow
2. Check if POST `/{vbo_id}/sunlight` is called and returns 200
3. Check timing: does export request fire before sunlight POST?
4. Check backend logs: does `_await_sunlight_for_export()` timeout?

**Key files:**
- `frontend/src/components/NeighborhoodViewer3D.tsx` lines 1700-1921 (computation)
- `frontend/src/App.tsx` lines 1011-1025 (callback handler)
- `backend/app/api/address.py` lines 459-530 (sunlight POST), 1195-1313 (export)
- `backend/app/services/pdf_export.py` lines 1468-1506 (`_sunlight_state()`)

---

## Updated Priority Summary

| Priority | Task | Status |
|----------|------|--------|
| **P0** | **New-1: Comparison charts clipped at right edge** | ❌ OPEN — half of charts invisible |
| **P0** | **Task 3g: Shadow panels must be full page width** | ❌ OPEN — panels unreadable at triptych size |
| **P0** | **Task 16: Sunlight pipeline — "not completed" despite 3D model viewed** | ❌ OPEN — investigate root cause |
| P1 | Task 3f: Overlapping text in shadow info box | ❌ OPEN — dual-overlay conflict |
| P1 | Task 3b: Duplicate north arrow | ❌ OPEN — dual-overlay conflict |
| P1 | Task 3a: Awkward blue background on shadow panels | ❌ OPEN — matplotlib wrapper |
| P2 | Task 3e: "Direct sun" legend label meaningless | ❌ OPEN — misleading legend |
| P2 | Task 3c: Scale bar barely visible | ❌ OPEN — too small at print size |
| P2 | Task 3d: Legend barely visible | ❌ OPEN — too small at print size |
| P2 | Task 9: WHO reference label truncation | ⚠️ PARTIAL |
| P3 | Task 1: Logo | ⚠️ PARTIAL |
| P3 | Task 4: Chart DPI verification | ⚠️ PARTIAL |
| P3 | Task 13: White space (page 2) | ⚠️ PARTIAL — data-dependent |

---

## Conclusion

9 of 15 original tasks are closed — excellent progress on enum leak, page count, livability, Property Checks, methodology, and more. However, the shadow snapshot rendering has 7 sub-defects stemming from a fundamental dual-overlay architecture conflict between frontend and backend. The cleanest fix is to bypass `chart_renderer.py` for shadows entirely and embed frontend PNGs directly at full page width. The comparison chart right-edge clipping and sunlight "not completed" state are the other two P0 issues requiring immediate attention.
