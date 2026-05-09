# Dossier PDF Quality Audit — 2026-03-03

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

**Input:** `tasks/full-dossier.pdf` (Joghtlaan 6, 2235AA Valkenburg)
**Render path:** LaTeX (confirmed — justified text, LaTeX kerning, matplotlib charts)
**Reference:** `docs/full-dossier-diagnostic-2026-03-01.md` (Epics 1–4)

---

## Overall Status

The LaTeX pipeline IS executing end-to-end: chart_renderer → Jinja2 templates → LuaLaTeX → PDF. Matplotlib comparison charts render correctly. Muted comparison bars, direct labels, and Scherer-style design principles are visible.

However, the output has **19 defects across 7 categories**: template rendering bugs, chart sizing issues, content gaps, branding, resolution, visual design, and white space.

Of the original 14 diagnostic findings: **7 fixed, 4 partially fixed, 3 not fixed.**

---

## Tasks

### Task 1 — Fix Buurt Check Logo in Header

**Problem:** Every page header shows a tiny broken "J" artifact next to "Buurt Check" instead of the actual logo. The PNG embed is either corrupt, mispositioned, or the wrong dimensions.

**Root cause:** `preamble.tex.j2` uses `\includegraphics[height=4.2mm]{logo_path}` but the image is either not found at compile time or its aspect ratio causes clipping in the header space.

**Definition of Done:**

- [ ] The horizontal lockup logo renders cleanly in every page header at legible size (minimum 20mm wide × 5mm tall)
- [ ] Logo is crisp at 300 DPI print resolution — no artifacts, no clipping, no "J" fragment
- [ ] Fallback: if PNG is missing, display "buurt-check" as clean text in SatoshiBold, not a broken image fragment
- [ ] Visual regression test updated with new baseline showing logo

---

### Task 2 — Fix Sunlight Analysis (Missing Everywhere)

**Problem:** Sunlight analysis data is absent from the entire dossier. Page 1 risk grid shows a dash (—) for Sunlight. The risk scores table shows `Sunlight: - / –`. Page 2 shows "Sunlight analysis is still processing." This is a critical gap — sunlight is one of the 4 core risk categories.

**Root cause:** The sunlight computation is client-side (Three.js ray-casting) and POSTed back. If the user exports the PDF before the frontend completes computation, sunlight data is `None`. The current `_sunlight_state()` returns "pending" but this means the dossier ships with a permanently missing risk category.

**Definition of Done:**

- [ ] If sunlight data is available at export time, it renders with score, severity, comparison chart, and detail section — identical treatment to Noise/Air/Climate
- [ ] If sunlight data is NOT available, the PDF clearly communicates this is a data gap, not a feature: "Sunlight analysis was not completed before export. Re-export after viewing the 3D model to include sunlight data." — with visual emphasis (not just body text)
- [ ] The export endpoint blocks for up to 5 seconds waiting for sunlight data before falling back to the pending message (configurable timeout)
- [ ] No bare "—" or "N/A" without explanation anywhere in the dossier

---

### Task 3 — Shadow Snapshots: Three Seasons at 3K Resolution

**Problem:** Page 3 shows only ONE shadow snapshot (winter solstice, 12:00). The diagnostic specified three seasonal panels (winter solstice, equinox, summer solstice). The caption says "Equinox and summer analysis requires additional 3D computation" — meaning the data pipeline only renders winter. Additionally, the existing image resolution is too low for print — fine details (building edges, street labels, compass rose text) are blurry.

**Root cause:** The frontend only submits one shadow image (winter solstice noon). The triptych layout in `_draw_shadow_triptych()` exists but receives only 1 image, falling back to a single full-width embed.

**Definition of Done:**

- [ ] Three shadow panels rendered: winter solstice (Dec 21), spring equinox (Mar 20), summer solstice (Jun 21) — all at 12:00 local time
- [ ] Each panel rendered at minimum 3000×2000px resolution (3K) for print clarity at 300 DPI full-width on A4
- [ ] Each panel has a clearly visible legend: compass rose (≥12mm), sun position with azimuth/altitude, time label, season label — all at minimum 10pt equivalent font size
- [ ] Three panels arranged as a triptych (side-by-side) or stacked vertically if space requires
- [ ] Shadow/sunlight areas are distinguishable without squinting — color scale or contrast must be obvious at A4 print size
- [ ] If equinox/summer images are not available at export time, render winter at full width with explicit "Additional seasons require re-export after 3D computation" message

---

### Task 4 — Increase Chart Resolution (All Graphs Crisper)

**Problem:** All matplotlib-rendered charts (comparison bars, age distribution, livability dot chart) appear soft/blurry when viewed at 100% zoom or printed. They lack the crispness expected of a professional report.

**Root cause:** Charts are rendered as PNG at 300 DPI via `chart_renderer._save_figure()`. However, the figure dimensions may be too small (causing upscaling artifacts), and PNG rasterization at 300 DPI for a 160mm-wide chart is only ~1890px — below the crispness threshold for modern displays and high-quality print.

**Definition of Done:**

- [ ] All charts rendered at minimum 600 DPI (or as PDF vector graphics via `output_format="pdf"` for maximum crispness)
- [ ] Chart figure width set to actual embed width at target DPI — no upscaling
- [ ] Text in charts is sharp at 100% zoom in a PDF viewer and on A4 print
- [ ] Anti-aliasing enabled for all chart elements
- [ ] Switch from `output_format="png"` to `output_format="pdf"` for vector output where LuaLaTeX supports it (comparison charts, age distribution, livability) — PNG only for raster content (shadow images)

---

### Task 5 — Fix Severity Enum Leak in Risk Scores Table

**Problem:** Page 1 risk scores table shows raw Python enum representations: "Severitylevel.good" and "Severitylevel.critical" instead of "Good" and "Critical".

**Root cause:** `dossier.tex.j2` lines 33–36 use the `sev_label` filter on `risks.noise.severity`. The filter receives the enum object itself (not `.value`), causing `str()` to produce the repr string. The `_sev_label` filter in `latex_env.py` does `str(severity)` which returns `Severitylevel.good` for an enum.

**Definition of Done:**

- [ ] Risk scores table shows "Good", "Moderate", "Poor", or "Critical" — never "Severitylevel.*"
- [ ] `_sev_label` filter handles both string values and enum objects: `getattr(severity, 'value', str(severity))`
- [ ] Severity text is colored using the appropriate severity color (green/amber/red/crimson)
- [ ] Unit test asserts no "Severitylevel" string appears in rendered PDF text

---

### Task 6 — Fix Page Count "??" in Footer

**Problem:** Every page footer shows "1/??" instead of "1/7". The total page count never resolves.

**Root cause:** `preamble.tex.j2` uses `\pageref{LastPage}` from the `lastpage` package, but `compile_latex_to_pdf()` in `latex_env.py` runs LuaLaTeX only once. The `lastpage` package requires two compilation passes to resolve forward references.

**Definition of Done:**

- [ ] Footer shows correct page count on every page (e.g., "1/7", "2/7", etc.)
- [ ] `compile_latex_to_pdf()` runs LuaLaTeX twice (first pass generates `.aux`, second pass resolves `\pageref`)
- [ ] Performance: total compilation time still under 4 seconds (adjust timeout to accommodate two passes)
- [ ] Unit test asserts no "??" appears in footer text

---

### Task 7 — Fix Livability Section Garbled Text

**Problem:** Page 4 livability section shows: "Severity: GoodDimensions Improving since 2024 Comparison" — all concatenated on one line with no separation.

**Root cause:** `dossier.tex.j2` lines 106–124 are missing LaTeX line breaks (`\\`) between the severity value, "Dimensions" label, trend text, and "Comparison" label. Jinja2's `trim_blocks=True` strips whitespace between block tags, causing adjacent text to merge.

**Definition of Done:**

- [ ] Livability section renders with clear visual separation: Severity on its own line, Dimensions as a labeled section, Trend as a labeled section, Comparison as a labeled section
- [ ] Each sub-section has proper heading treatment (bold label, body text below)
- [ ] The overall livability section follows the Polar Frost card pattern: structured, with breathing room between elements
- [ ] No concatenated text anywhere in the livability block

---

### Task 8 — Fix Livability Chart Label Cropping


**Root cause:** `chart_renderer.py` uses `savefig.bbox="tight"` in the SchererTheme rcParams, which clips the figure to visible data bounds and removes axis label margins. The y-axis label "Livability" extends into the left margin area that `tight` bbox removes.

**Definition of Done:**

- [ ] All score values fully visible (no cropping at edges)
- [ ] Fix via one of: `fig.subplots_adjust(left=0.18, right=0.92)`, or remove `savefig.bbox="tight"` for this chart, or use `\includegraphics[width=0.92\linewidth]` in template
- [ ] Visual regression test verifies no label cropping

---

### Task 9 — Fix WHO/Target Reference Label Truncation

**Problem:** On every comparison chart, the reference line label is truncated: "WHO benchmark (mapped t" (Noise/Air) and "Daylight target (mapped to score" (Sunlight). Text runs off the right edge of the chart.

**Root cause:** `chart_renderer.py` line 365 positions reference labels at `x + 0.8` with `ha="left"`. When the reference value is near 70–100 on the 0–100 scale, the label extends beyond `max_x` and gets clipped by the figure bounds.

**Definition of Done:**

- [ ] All reference line labels fully visible — no truncation on any chart
- [ ] Fix: either shorten labels (e.g., "WHO limit" instead of "WHO benchmark (mapped to score)"), or position labels at `x - 0.8` with `ha="right"`, or extend `max_x` to accommodate label text width
- [ ] Consistent treatment across all 4 risk comparison charts
- [ ] Visual regression test updated

---

### Task 10 — Fix VvE Heading Duplication

**Problem:** Page 5 shows "VvE (Owners' Association)VvE (Owners' Association)No owners' association applicable." — the heading text appears twice.

**Root cause:** `dossier.tex.j2` line 196 has a redundant English fallback that outputs the heading text as body text after the `\subsection*{}` already rendered it.

**Definition of Done:**

- [ ] VvE heading appears exactly once
- [ ] Delete the redundant line 196 from the template
- [ ] No other property check headings are duplicated (verify all 8 checks)

---

### Task 11 — Fix Source Citation Spacing

**Problem:** Throughout page 5, source citations run directly into body text: "...available building data.Source: BAG construction year heuristic" — no space or line break before "Source:".

**Root cause:** Jinja2 `lstrip_blocks=True` strips leading whitespace between block tags in `dossier.tex.j2`, causing adjacent text blocks to merge.

**Definition of Done:**

- [ ] Every source citation appears on its own line, visually distinct from body text
- [ ] Source text styled in caption size (7.5pt), muted color (`MutedText`), preceded by a line break
- [ ] Consistent formatting across all 8 property checks
- [ ] Pattern: body text → `\\` → `{\footnotesize\textcolor{MutedText}{Source: ...}}`

---

### Task 12 — Redesign Additional Property Checks (Page 5)

**Problem:** Page 5 "Additional Property Checks" is visually boring — plain black text on white background, no visual hierarchy, no color, no severity indicators. It violates the Polar Frost design philosophy ("editorial restraint" does not mean "no design") and Scherer principles (P6: color as communication tool, P13: highlight/mute pattern, P17: interpretive subtitles).

**Design direction** (from `docs/design-prd.md` and `docs/ui-principles.md`):
- Every element should feel like "a beautifully designed intelligence briefing prepared by a trusted advisor"
- "White space is the main design material" — but this page has neither white space NOR visual interest
- Risk/property data should follow the 4-part hierarchy: score/severity → meaning → what to check → source
- Use the Polar Frost severity scale: Green (✓ circle) for no risk, Amber (— dash) for attention needed, Red (▲ triangle) for flagged

**Scherer principles to apply:**
- P6: Color as communication, not decoration — use severity colors to encode each check's status (clear/flagged/unavailable)
- P13: Highlight + mute — items that need attention (Asbestos: flagged) should be visually prominent; items that are clear (Foundation: no risk) should be muted
- P17: Subtitle as context — "Asbestos Awareness" heading should have an interpretive subtitle like "Flagged — built in risk period (1983)"
- P28: Progressive disclosure — clear items can be compact; flagged items expanded

**Definition of Done:**

- [ ] Each property check has a visual severity indicator: green checkmark (no risk detected), amber dash (uncertain/manual verification), red triangle (risk flagged)
- [ ] Flagged items (Asbestos) are visually prominent: colored left border accent (like risk detail cards on page 2), bold status line, expanded body text
- [ ] Clear items (Foundation, Lead Pipe, Ground Lease) are visually compact: green checkmark + one-line summary, muted styling
- [ ] "Manual verification required" items (Soil Contamination) use amber styling with a call-to-action
- [ ] Source citations in `MutedText` caption style on separate lines
- [ ] Section uses card-like containers or subtle dividers — not just stacked paragraphs
- [ ] Overall page feels like it belongs in the same dossier as the comparison charts — designed, not an afterthought
- [ ] Typography follows Polar Frost type scale: subsection headings in SemiBold (or `\textbf{}`), body in Regular, sources in caption

---

### Task 13 — Eliminate Excessive White Space

**Problem:** Every page has 30–55% empty white space. Pages 6 and 7 are 70–80% empty. The dossier is 7 pages when the content could fit in 4–5. This contradicts Scherer P7 ("generous, intentional whitespace — not accidental") and the Polar Frost principle ("white space is the primary design material" — implying it should be *designed*, not leftover).

**Root cause:** LaTeX content-driven pagination works, but sections are spread too thin across pages. The methodology section is nearly empty (one sentence). Viewing questions are sparse when only one risk category triggers questions.

**Definition of Done:**

- [ ] Total page count is 5 or fewer for a standard dossier with 3 scored risk categories
- [ ] No page is more than 25% empty (except the last page, which may have provenance/notes)
- [ ] Sections flow continuously — a new page break only occurs when content genuinely won't fit
- [ ] Methodology section either has substantial content (scoring formulas, data sources, sunlight method — port from fpdf2 path) or is folded into the final page alongside provenance
- [ ] Viewing questions page is consolidated with methodology/provenance if questions are sparse

---

### Task 14 — Populate Methodology Section

**Problem:** Page 7 methodology is one sentence: "How we score risks: indicators are normalized to a 0–100 scale where higher is better." The fpdf2 path has detailed content: scoring formulas per category, data sources table with protocols, sunlight analysis method (SunCalc + 3DBAG), and an "Important limitations" disclaimer. None of this reaches the LaTeX template.

**Root cause:** `render_dossier()` in `latex_env.py` has no `methodology` parameter. The template has a hardcoded one-liner. The detailed methodology data from `_draw_methodology_page()` in the fpdf2 path is never extracted into a shareable data structure.

**Definition of Done:**

- [ ] Methodology section includes: scoring normalization explanation, per-category scoring formulas (Noise: 40 dB Lden = 100, 90 dB = 0; Air: worst of PM2.5/NO2; Climate: heat + water; Sunlight: winter solstice hours), data sources table (source → data type → protocol), sunlight analysis method, and "Important limitations" disclaimer
- [ ] Content matches what the fpdf2 path already generates
- [ ] Data passed to template via `render_dossier()` parameter — not hardcoded in .tex.j2
- [ ] Bilingual: methodology text available in both EN and NL

---

### Task 15 — Add "ADDITIONAL CHECKS" Redundant Label

**Problem:** Page 5 has both "Additional Property Checks" as the `\section*{}` heading and "ADDITIONAL CHECKS" as a sub-label immediately below. The sub-label is redundant.

**Definition of Done:**

- [ ] Remove the redundant "ADDITIONAL CHECKS" sub-label
- [ ] Section heading "Additional Property Checks" is sufficient on its own

---

## Original 14 Findings: Resolution Matrix

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| F1 | Logo missing from header | **NOT FIXED** | Broken "J" artifact. Task 1. |
| F2 | Clunky typography | **MOSTLY FIXED** | LaTeX typesetting with proper kerning/justification. Not Inter font but acceptable. |
| F3 | Tiny shadow snapshots | **PARTIALLY FIXED** | Full-width single image, dark bg, compass rose. Only 1 season. Task 3. |
| F4 | Sunlight always N/A | **PARTIALLY FIXED** | Pending message exists but sunlight data is completely absent. Task 2. |
| F5 | Excessive white space | **NOT FIXED** | Every page 30–55% empty. Pages 6–7 are 70–80% empty. Task 13. |
| F6 | Bar plots uneven sizing | **FIXED** | Matplotlib charts, consistent sizing, direct labels. |
| F7 | Unnecessary legend | **MOSTLY FIXED** | No per-chart legend. Global explanation block on page 2 remains. |
| F8 | Gold overpowers teal | **FIXED** | Muted grays for comparisons, teal accent dominant. |
| F9 | Misaligned bars | **FIXED** | Matplotlib handles alignment cleanly. |
| F10 | Source text overflow | **PARTIAL** | No right-margin overflow on charts. Source text runs together on page 5. Task 11. |
| F11 | Bars overflow severity | **FIXED** | No bar/label collision in grid or charts. |
| F12 | Incomplete graph | **FIXED** | No truncated chart fragments. |
| F13 | Empty pages | **NOT FIXED** | Pages 6–7 mostly empty. Task 13. |
| F14 | Garbled line plot | **FIXED** | No garbled plots anywhere. |

**Score: 7 fixed, 4 partially fixed, 3 not fixed.**

---

## Priority Order

| Priority | Tasks | Impact |
|----------|-------|--------|
| P0 — Urgent | Task 2 (Sunlight), Task 5 (Enum leak) | Core data missing + visibly broken text |
| P1 — High | Task 3 (Shadow 3K), Task 4 (Chart resolution), Task 9 (WHO labels) | Data quality + print readability |
| P2 — High | Task 7 (Livability garble), Task 8 (Chart crop), Task 10 (VvE dupe) | Visual bugs — immediately noticeable |
| P3 — Medium | Task 1 (Logo), Task 6 (Page count), Task 12 (Property checks design) | Branding + polish |
| P4 — Medium | Task 11 (Source spacing), Task 13 (White space), Task 14 (Methodology) | Completeness + layout |
| P5 — Low | Task 15 (Redundant label) | Minor cleanup |
