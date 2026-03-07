# Dossier PDF Quality Audit — Reassessment (2026-03-07)

**Visual PDF inspected:** `buurt-check-full-dossier-0518010000455781.pdf` (8 pages, Suezkade 51A 2517BW 's-Gravenhage, EN, generated 2026-03-07T19:27:29+00:00)
**Code assessed at:** `923aa77` (HEAD, 2026-03-07)
**Render paths:** LaTeX (primary, lualatex available) + fpdf2 fallback via `pdf_export.py`

---

## Summary

| # | Requirement | Verdict | Notes |
|---|-------------|---------|-------|
| 1 | Crime in risk grid + exec summary | **CLOSED (code)** | Code correct at HEAD. This PDF pre-dates deployment — see details. |
| 2 | Location map or placeholder | **CLOSED (code)** | LaTeX `else` branch renders placeholder. This PDF missing it — same deployment note. |
| 3 | Comparison chart x-axis label overlap | **FIXED** | X-axis ticks (0/20/40/70/100) now rendered inside matplotlib chart; duplicate fpdf2 labels removed. |
| 4 | Climate source line truncation | **COSMETIC** | Right-edge truncation on long layer IDs persists. |
| 19 | Shadow analysis before exec summary | **FIXED** | fpdf2 cover page reordered: exec summary → risk grid → shadow triptych. |
| 20 | Sunlight score missing from risk grid | **FIXED** | Added fallback: extract score from risks.sunlight when explicit param is None. |
| 5 | CBS quartile indicators | CLOSED | All 7 indicators show Q1–Q4 labels + legend. |
| 6 | Raw measurement rows | CLOSED | Lden dB, PM2.5/NO₂ µg/m³, WHO thresholds, heat/water levels all present. |
| 7 | Unit definitions | CLOSED | Lden, PM2.5, NO₂ explanations + climate model note present. |
| 8 | Climate scenario disclosure | CLOSED | Layers + scenario + source present (truncation is cosmetic item #4). |
| 9 | Page density ≤30% empty | CLOSED | No catastrophically empty pages. Worst ~40% on cover (acceptable). |
| 10 | Comparison charts inline | CLOSED | All charts render inline with legend/axis/source. No orphaned pages. |
| 11 | Score bars visible ≥3mm | CLOSED | Full-width colored bars on each risk card. |
| 12 | Comparison bar colors | CLOSED | Teal/gray/dashed differentiation + explicit legend. |
| 13 | Address row first | CLOSED | "This address" is top row in every chart. |
| 14 | Data-ink ratio | CLOSED | Clean axes at 0/20/40/70/100, light gridlines. |
| 15 | Orphaned page breaks | CLOSED | No orphaned single-element pages. |
| 16 | MUTED/BORDER contrast | CLOSED | Source text readable throughout. |
| 17 | Left-aligned text | CLOSED | All body text left-aligned. |
| 18 | Locale-aware numbers | CLOSED | "18,414 per km²", "€398,000", "8.8 µg/m³" — correct EN format. |

**Totals: 14 CLOSED, 2 CLOSED (code-verified, pending visual confirmation), 2 COSMETIC.**

---

## Item 1 — Crime in risk grid + executive summary

**Status: CLOSED (code-verified, pending visual confirmation)**

**Visual (this PDF):** Risk Summary grid shows 4 tiles (Noise 80, Air 77, Climate 15, Sunlight —). Executive summary reads "Of the 3 risk categories, 2 good, 1 critical." Crime renders under SAFETY on page 5 with full detail (score 65, Moderate, 47.6/1,000 residents, burglary 0.7, violent 3.3, source CBS 2025JJ00) but is NOT counted in the grid or exec summary. The viewing checklist page repeats the same 4-tile grid.

**Code at HEAD (`923aa77`):**

- `_generate_executive_summary()` (line 194): Accepts `crime_score` param; appends `("crime", "criminaliteit", crime_score)` to categories when not None (line 217-218). Category count and severity distribution include crime.
- `_build_risk_cells()` (line 2115-2116): Receives `crime_score=crime_score`. Appends 5th cell when crime present. Grid uses `cols=5` when 5 cells exist (line 2128).
- LaTeX template (`dossier.tex.j2`, lines 53-58): Conditional row renders crime in the risk scores table.
- Test coverage: `test_crime_score_included_in_summary`, `test_risk_cells_include_crime`, `test_full_dossier_latex_uses_crime_in_summary_and_risk_grid` all assert correct behavior.

**Assessment:** Code is structurally correct and tested. The discrepancy between the PDF (generated 19:27 UTC) and committed code (fix landed 06:46 UTC the previous day) most likely indicates the PDF was generated from a running deployment that hadn't restarted with the latest code. No code fix needed — needs visual re-verification after deployment refresh.

---

## Item 2 — Location map or visible placeholder

**Status: CLOSED (code-verified, pending visual confirmation)**

**Visual (this PDF):** No location map and no placeholder on any page. Cover goes directly from address header to Shadow Analysis.

**Code at HEAD:**

- LaTeX template (`dossier.tex.j2`, lines 108-121): Has complete `if/else` — when `location_map` is falsy, renders a bilingual `\fcolorbox` placeholder reading "Location map unavailable / PDOK aerial imagery did not load during export."
- fpdf2 path (`_draw_location_map`, line 2602+): Calls `_draw_location_map_placeholder()` when `location_map_b64` is None. Renders teal-light box with bilingual text.
- Both paths include source attribution even in placeholder state.

**Assessment:** Same deployment-lag explanation as Item 1. Code is correct with `else` branch in both render paths. Needs visual re-verification after deployment refresh.

---

## Item 3 — Comparison chart label overlap (COSMETIC)

**Visual (this PDF):** In all five comparison charts (Noise, Air Quality, Climate Stress, Sunlight, Livability), row labels ("This address", "Peer baseline (urbanization)", "Netherlands") overlap with each other and with score values. The text is readable but visually cluttered — labels appear double-printed at slight offsets.

**Code at HEAD:** Commit `0fc8450` (2026-03-06) addressed a specific case: skipping address rows with None value to prevent label collision. However, the visual overlap in this PDF occurs on rows that DO have values (Noise 80, Air 77, Climate 15), so the fix targets a narrower case than the general overlap problem.

**Root cause:** The chart images (rendered by `chart_renderer.py`) position y-axis labels at fixed row heights (7.0mm per row). When labels are long (e.g., "Peer baseline (urbanization)"), they collide with adjacent row labels. The 2.5mm address-gap helps separate address rows from reference rows, but doesn't prevent intra-group overlap.

**Impact:** Low. All data is present and decipherable. This is a density/typography issue, not a data-loss issue.

---

## Item 4 — Climate source line right-edge truncation (COSMETIC)

**Visual (this PDF):** Climate Stress source attribution truncates at right margin: "...wpn:s0149_hittestress_warme_nachten_huidig, etten:grl_t100 · Curren..." The layer names and "Current climate" label overflow the text area.

**Code at HEAD:** LaTeX template (line 64) wraps climate disclosure in `\parbox{\linewidth}{\raggedright ...}`, and `_format_wrapped_latex_metadata()` inserts `\allowbreak` after separators, colons, commas, and underscores. This should enable soft-wrapping.

**Assessment:** The soft-wrap fix exists in code but may not be effective for this specific string because the individual segments between break opportunities are still wider than the available line width. The layer ID `wpn:s0149_hittestress_warme_nachten_huidig` is a single long token even with underscore breaks.

**Impact:** Very low. Layer IDs are technical metadata; the important parts (source name "Klimaateffectatlas") are visible.

---

## What's working well

The dossier is a comprehensive 8-page document with strong information density:

- **Shadow triptych** (pages 1-2): Winter/equinox/summer at 12:00 CET with correct timestamps, N-arrow, 50m scale bar, legend (shadow + target building), and 3DBAG/SunCalc attribution.
- **Risk detail cards** (pages 3-4): Each has score + severity label, colored score bar with tick marks at 20/40/70, plain-language meaning, raw measurements with units, WHO/target guidelines, comparison chart with teal/gray/dashed legend, and source + date.
- **Neighborhood stats** (page 5): CBS indicators with Q1-Q4 quartile labels (Population density Q4, Avg household Q2, Single-person Q4, Owner-occupied Q2, Avg property value Q3, Train station Q2, Supermarket Q1), age distribution bar chart with interpretation, urbanization class.
- **Crime section** (page 5): Full detail card with score 65/Moderate, rate per 1,000, burglary + violent breakdown, CBS source + period, disclaimer about municipal vs street-level data.
- **Livability** (page 6): Score 100/Good with gauge, 5-dimension radar chart (Physical environment 50, Safety 25, Amenities 100, Social cohesion 25, Housing quality 62), trend timeline 2002-2024 showing improvement, wijk + gemeente comparison bars, Leefbaarometer source.
- **Property checks** (page 7): 8 checks (asbestos, foundation, ground lease, VvE, lead pipes, soil contamination, direct sun, shadow snapshots) each with source attribution and actionable guidance.
- **Viewing checklist** (pages 7-8): Climate-specific viewing questions with checkboxes, scoring methodology with formulas, 8-row data sources table (BAG, 3DBAG, RIVM×2, Klimaateffectatlas, CBS×2, Leefbaarometer, SunCalc), sunlight analysis method (5 parameters), peer baseline explanation, limitations disclaimer, full report provenance (ID, VBO, Pand, Buurt, coordinates in both WGS84 + RD, methodology version), and blank viewing notes section.
