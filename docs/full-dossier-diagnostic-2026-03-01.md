# Full Dossier Diagnostic Report

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

**Senior Data Visualization & Analytics Expert Review**
**Merged findings from two independent audits (codebase-grounded + methodology-focused)**

**Address tested:** Example Street 12, 1234AB Sample City
**Report date:** 01 March 2026
**Pages:** 7 | **Images:** 2 (identical) | **Language:** NL

---

## Executive Summary

The Full Dossier PDF is **structurally incomplete**, **visually underpowered**, and **typographically under-designed** for a paid product. Findings across **11 epics** cluster into four themes:

**Content gaps (~40% of paid content is missing or broken):**
1. Shadow snapshot is illegible — hero visualization is a dark blur (427x265px at ~64 effective DPI)
2. Sunlight analysis missing — entire ray-casting computation shows "N.v.t."
3. Livability section entirely absent — Leefbaarometer data never fetched for export
4. Property warnings 75% hollow — only asbestos shown; 4 of 5 warnings discarded

**Semantic and trust risks (what IS shown can be misread):**
5. Score vs. unit ambiguity — "WHO guideline 74" could be misread as 74 dB instead of 74/100
6. "City average" label misrepresents urbanization baseline — not a real municipal average
7. No reproducibility metadata — report cannot be audited or re-run by a third party

**Data visualization failures (every chart is broken as an information graphic):**
8. Score bars are 1.0mm hairlines — 8 pixels at 200 DPI, invisible at arm's length on printed A4
9. Comparison charts have no x-axis, no scale declaration, no legend — violating every foundational chart design rule
10. Two comparison bar colors (MUTED #8A9BB0 and BORDER #E2E7ED) are indistinguishable in grayscale print; BORDER has only 1.3:1 contrast against white — effectively invisible
11. "Dit adres" (the hero data point) is buried as the LAST row in every chart — wrong reading order
12. Data-ink ratio is critically low — text numbers carry 90%+ of information, bars are decorative hairlines
13. Zero chart type variety across 7 pages — every visualization is a horizontal bar

**Typography, layout, and print quality failures:**
14. 16+ type styles with 6 indistinguishable levels in the 7-10pt range — visual noise, not hierarchy
15. Body text at ~85-90 characters per line exceeds the 45-75 readability optimum by 20-40%
16. Justified text on page 7 creates visible word-spacing rivers between long Dutch/English terms
17. Italic font fallback maps to Regular — all italic styling is invisible (caption, disclaimers)
18. Number formatting mixes Dutch thousands (1.000) with English decimal (12.0) in same sentence
19. Pages 1, 3, 4, 6 are 40-85% empty — a 7-page report with ~3.5 pages of actual content
20. Page 3 is an orphaned spillover (~15% utilized) from page 2's auto page break
21. Shadow image at 427x265px displayed at 170mm = ~64 effective DPI — far below 150 DPI print minimum
22. MUTED text (#8A9BB0, 2.75:1) fails WCAG AA 4.5:1 for source/provenance lines carrying essential info
23. Only branded element: 6mm teal stripe + 9pt text. No logo, no section bands, no visual identity

**Dominant architectural insight:** The gap is **not missing data** — it's **missing rendering code**. The pipeline computes livability, property warnings, crime scores, CBS quartiles, facade analysis, and SVF — all of which are available as structured data but dropped at the PDF rendering boundary. The visual design gap is equally fundamental — the PDF uses `fpdf2` drawing primitives at their simplest defaults (1mm bars, no axes, no legends) rather than constructing proper data visualizations.

---

## Epic Overview

| Epic | Title | Stories | Priority | Theme |
|------|-------|---------|----------|-------|
| E1 | Shadow & 3D Visualization | 3 stories | P0 | Content gap |
| E2 | Sunlight Analysis Completeness | 5 stories | P0 + P2 | Content gap |
| E3 | Missing Premium Content | 3 stories | P0 | Content gap |
| E4 | Comparison Semantics & Trust | 4 stories | P0 + P2 | Trust risk |
| E5 | Report Provenance & Auditability | 4 stories | P0 + P2 | Trust risk |
| E6 | Neighborhood & Crime Data Enrichment | 5 stories | P1 | Quality gap |
| E7 | Spatial Context & Cartography | 1 story | P1 | Quality gap |
| E8 | Information Architecture & Polish | 4 stories | P2/P3 | Polish |
| E9 | Data Visualization Quality | 6 stories | P0/P1 | Design — charts |
| E10 | Typography & Readability | 5 stories | P1/P2 | Design — type |
| E11 | Report Layout, Print Quality & Brand | 5 stories | P1/P2 | Design — layout |

---

## E1 — Shadow & 3D Visualization

**Epic goal:** Make the shadow snapshot — the dossier's most differentiated visual — legible, informative, and cartographically sound.

**Current state:** The hero image is 427x265px, nearly pitch black. Target building is a 10-pixel teal speck. Neighbor buildings are invisible. No cartographic elements. Same image appears twice (cover + page 5). Only the noon snapshot is used; morning and evening are discarded.

---

### E1-S1: Fix shadow snapshot render quality

**Description:** Re-render the shadow snapshot with a light ground plane, visible building volumes, and distinguishable target highlight so a reader can immediately identify the property and its shadow context.

**Why:** The shadow snapshot is the single most differentiated visualization in buurt-check — a 3D ray-cast analysis no competitor offers. If the customer cannot see buildings, shadows, or orientation, the technical differentiator is wasted on a dark rectangle.

**Root cause:** `NeighborhoodViewer3D.tsx` renders at overhead view (0, 200, 0.1) using dark theme colors (dark buildings, darker sky). Canvas size (427x265) loses detail. Renderer outputs a low-contrast scene optimized for the dark-themed interactive viewer, not for PDF print.

**How to fix:**
- Increase resolution to at least 800x500 (2x scale)
- Use white/light-gray ground plane instead of dark background
- Render buildings in mid-gray (0x888888) with target in bright teal (0x2EC4B6)
- Render shadow regions as dark gray or semi-transparent blue overlay on ground
- Add a contrasting target footprint outline with subtle halo

**Definition of done:**
- [ ] Shadow image renders at >= 800x500px
- [ ] Ground plane is white or light gray
- [ ] Target building is visually distinguishable from neighbors at arm's length (print test)
- [ ] Shadow regions on the ground are visible and readable
- [ ] Image passes a "3-second test": a new viewer can identify the target building and its shadow pattern within 3 seconds

---

### E1-S2: Add shadow triptych (morning, noon, evening)

**Description:** Include all three shadow snapshots (09:00, 12:00, 17:00) as a side-by-side triptych instead of a single noon image. Remove the redundant duplicate on page 5.

**Why:** Shadow patterns change dramatically throughout the day. The morning and evening snapshots show critical information (east/west obstructions, afternoon shade) that the noon-only snapshot hides. The data already exists in `ShadowSnapshot[]` but only `hour === 12` is extracted at `ExportBottomSheet.tsx:129`.

**How to fix:**
- Send all three snapshots from `ExportBottomSheet.tsx` to the export API
- Expand `generate_full_dossier()` to accept an array of shadow images
- Render as a 3-panel row with captions: "09:00 | 12:00 | 17:00"
- Show triptych once (cover page only), remove duplicate on property checks page

**Definition of done:**
- [ ] All three shadow snapshots (09:00, 12:00, 17:00) appear in the PDF
- [ ] Laid out as a triptych with individual time labels
- [ ] Shadow image appears on exactly one page (not duplicated)
- [ ] Each panel has consistent scale/extent/orientation

---

### E1-S3: Add cartographic elements to shadow figure

**Description:** Add standard cartographic reading aids — north arrow, scale bar, extent label, timestamp with timezone, basemap source attribution, and shadow legend — to the shadow figure.

**Why:** Without scale and orientation, users cannot verify whether the shadow pattern is plausible for their street canyon. Without a known extent, readers cannot compare across addresses. The caption "Winterzonnewende, 12:00" lacks timezone and CRS. The image looks like a marketing graphic, not an analytical figure.

**How to fix:**
- Overlay or caption: north arrow, scale bar ("50m"), extent label ("250m radius")
- Target footprint outline in contrasting stroke
- Basemap source attribution ("3DBAG / TU Delft")
- Time+date+timezone in ISO-like format: `2026-12-21 12:00 CET (Europe/Amsterdam)`
- Shadow legend: "Direct sun / Shadow" (even if binary, state it)

**Definition of done:**
- [ ] North arrow visible in or adjacent to shadow figure
- [ ] Scale bar with distance label present
- [ ] Timestamp includes timezone (CET or Europe/Amsterdam)
- [ ] Shadow legend explains what shaded vs unshaded areas represent
- [ ] Basemap source is attributed

---

## E2 — Sunlight Analysis Completeness

**Epic goal:** Ensure the sunlight analysis — the product's most computationally sophisticated feature — is always present in paid dossiers and rendered with the depth its underlying data supports.

**Current state:** Sunlight shows "N.v.t." (N/A) across all pages. Even when computed, the PDF only receives `winter_hours`, `summer_hours`, `equinox_hours`, `svf` — dropping facade results, ground averages, anisotropic SVF, and irradiance. When hours are available, they render as a single prose sentence. No methodology disclosure.

---

### E2-S1: Gate export on sunlight computation completion

**Description:** Disable the "Export Full Dossier" button until sunlight analysis has completed and `sunlightScore !== null`.

**Why:** For the test address, climate stress is Critical (15/100). The sunlight analysis is the most important counterbalancing data point. Its complete absence ("N.v.t.") in a paid product is a credibility disaster. The sunlight system is the most technically sophisticated feature (CPU ray-casting, 12 days, 30-minute sampling, SVF) — showing "N/A" wastes the entire investment.

**Root cause:** `_do_export_briefing()` accepts `sunlight_score` but the frontend may trigger export before `submitSunlightAnalysis()` completes. No blocking gate exists.

**How to fix:**
- Frontend check in `ExportBottomSheet.tsx`: disable export CTA until `sunlightScore !== null`
- Show a progress indicator: "Sunlight analysis computing... (X%)" while Worker runs
- If Worker fails, show explicit error state (not silent N/A)

**Definition of done:**
- [ ] Export button is disabled when `sunlightScore === null`
- [ ] User sees progress indicator while sunlight computes
- [ ] If sunlight fails, export shows explicit error (not silent "N.v.t.")
- [ ] Paid dossier never contains "N.v.t." for sunlight unless there is a genuine data unavailability (no 3D geometry)

---

### E2-S2: Extend sunlight data submission to backend

**Description:** Expand `submitSunlightAnalysis()` to send the full analysis payload — not just the 4 summary fields — so the PDF can render detailed sunlight data.

**Why:** Currently only `winter_hours`, `summer_hours`, `equinox_hours`, `svf` are submitted to `POST /{vbo_id}/sunlight`. The client computes facade results, annual average, ground average, anisotropic SVF, and irradiance — all silently discarded at the submission boundary. The paid PDF can only show what the backend has.

**How to fix:**
- Extend `SunlightSubmission` model to accept: `facadeResults[]`, `annualAverage`, `groundAnnualAverage`, `svfAnisotropic`, `irradianceKwhM2`
- Extend `SunlightRiskCard` model to store these
- Update `submitSunlightAnalysis()` in `address.py` to persist them
- Pass them through to `generate_full_dossier()`

**Definition of done:**
- [ ] `SunlightSubmission` accepts facade, ground, anisotropic SVF, and irradiance fields
- [ ] Backend stores and returns the expanded fields
- [ ] Frontend submits all available fields from `SunlightResult`
- [ ] PDF export function receives the expanded sunlight data

---

### E2-S3: Add sunlight seasonal chart and SVF visualization

**Description:** Replace the single-line prose sunlight summary with visual elements: a 3-bar seasonal hours chart and an SVF gauge.

**Why:** The sunlight system is the most sophisticated computational feature. Rendering it as one line of text ("winter 2.3h/day, equinox 4.1h/day, summer 6.2h/day") undersells the analysis. Visual treatment would show seasonal variation and sky openness at a glance.

**How to fix:**
- Add 3 horizontal bars for winter/equinox/summer hours with labels
- Add SVF percentage with visual gauge ("highly open" >= 0.6 | "moderate" >= 0.3 | "enclosed" < 0.3)
- Add one-line interpretation below

**Definition of done:**
- [ ] Seasonal hours appear as horizontal bars (not prose)
- [ ] SVF percentage appears with gauge/badge and plain-language interpretation
- [ ] Visualization is consistent with the comparison chart style used for other risks

---

### E2-S4: Add facade orientation table

**Description:** When facade analysis data is available, render a compact N/S/E/W table showing winter, equinox, and summer hours per facade orientation.

**Why:** Facade orientation is actionable information. A buyer choosing between apartments in the same building needs to know "south-facing gets 5.8h winter sun, north-facing gets 1.2h." This data exists in `facadeResults` but is never shown in the PDF.

**How to fix:**
- Add a table: `FACADE | WINTER | EQUINOX | SUMMER`
- Include N/S/E/W rows from `facadeResults[]`
- Add one-line interpretation: "South-facing facade receives 5.8h winter sun — excellent for passive heating"
- Add target plane definition: "Hours measured at roof surface (clear-sky geometric analysis)"

**Definition of done:**
- [ ] Facade table appears when `facadeResults.length > 0`
- [ ] All four cardinal directions shown with seasonal hours
- [ ] Table includes one-line interpretation
- [ ] Gracefully absent when facade data unavailable (no empty table)

---

### E2-S5: Disclose sunlight methodology inputs in PDF

**Description:** Add a structured methodology disclosure for the sunlight analysis — specifying algorithm, temporal resolution, spatial resolution, obstruction set, and atmospheric assumptions.

**Why:** For decision-grade sunlight analysis, the dossier must be auditable. A mortgage advisor or building inspector needs to know: what algorithm? what time resolution? what counts as an obstruction? Currently, the methodology page says nothing about sunlight computation specifics.

**How to fix:**
Add to methodology page:
- Solar position algorithm: SunCalc (azimuth clockwise from north, altitude from horizon)
- Temporal resolution: 30-minute intervals, 12 representative days/year (21st of each month)
- Spatial resolution: 1m roof grid, up to 256 sample points
- Obstruction set: 3DBAG building meshes only; vegetation and infrastructure excluded
- Atmospheric conditions: clear-sky geometric analysis (no cloud/weather adjustment)
- Target plane: roof surface analysis (not window plane or balcony plane)

**Definition of done:**
- [ ] Methodology page includes a "Sunlight Analysis Method" subsection
- [ ] All six parameters above are stated in plain language
- [ ] Disclosure explicitly notes what is excluded (vegetation, weather, terrain slope)

---

## E3 — Missing Premium Content

**Epic goal:** Wire up the existing backend data models (livability, property warnings) to the PDF rendering layer, ensuring the paid dossier contains more content than the free viewer — not less.

**Current state:** Livability is never fetched for export. Property warnings page only renders asbestos; foundation risk, erfpacht, VvE, and lead pipe are silently discarded despite being computed.

---

### E3-S1: Add livability (Leefbaarometer) section to dossier

**Description:** Fetch livability data in the export pipeline and render it as a dedicated page or integrated section showing overall score, 5-dimension breakdown, historical trend, and comparison rows.

**Why:** For a product named "buurt-check" (neighborhood check), the Dutch government's official Leefbaarometer is arguably the most relevant data point. Its complete absence from the paid dossier is a critical gap. The free viewer already shows it.

**Root cause:** `_do_export_briefing()` in `address.py` never calls `get_livability_for_address()`. `generate_full_dossier()` has no `livability` parameter. Models and services exist in `backend/app/models/livability.py` and `backend/app/services/leefbaarometer.py`.

**How to fix:**
- Fetch livability in export route alongside `neighborhood_stats`
- Add `livability: LivabilityResponse | None` to `generate_full_dossier()`
- Render: overall score badge, 5-dimension horizontal bars or radar, 20-year trend sparkline, wijk/gemeente comparison rows
- Bilingual labels from `meaning_en`/`meaning_nl`

**Definition of done:**
- [ ] `_do_export_briefing()` fetches livability data
- [ ] Livability section appears in the PDF when data is available
- [ ] Shows overall score (0-100) with severity badge
- [ ] Shows 5-dimension breakdown (physical, safety, social, amenities, housing)
- [ ] Shows historical trend (at least 3 data points)
- [ ] Shows comparison context (buurt vs wijk vs gemeente)
- [ ] Gracefully shows "unavailable" when data missing (not blank)

---

### E3-S2: Render all 5 property warning categories

**Description:** Expand `_draw_property_checks_page()` to render foundation risk, erfpacht, VvE, and lead pipe warnings in addition to the existing asbestos section.

**Why:** The "Additional Property Checks" section is premium content gated behind payment. Currently only 1 of 5 warning categories is shown. The free viewer displays all five. Paying customers get less than free users — directly contradicting the value proposition.

**Root cause:** `_draw_property_checks_page()` at line 980 in `pdf_export.py` accepts `property_warnings` but only reads `property_warnings.asbestos`. The other four sub-objects are passed in but never accessed.

**How to fix:**
Render each with `_draw_checks_subsection()`:
1. **Foundation risk:** level + soil type + subsidence rate + interpretation
2. **Erfpacht:** detected + confidence + municipality + actionable advice
3. **VvE:** is_apartment + num_units + advice (reserve fund, meeting minutes)
4. **Lead pipe:** flagged + construction year + advice (water test, pipe records)

**Definition of done:**
- [ ] All 5 warning categories render when data is available
- [ ] Each has: title, body with interpretation, source line
- [ ] Unflagged warnings show "No risk signal detected" (not omitted)
- [ ] Page handles variable content height (auto page-break if >1 page)

---

### E3-S3: Make soil section transparent about limitations

**Description:** Replace the misleading "Soil Contamination Check" section — which contains no soil data — with an honest "Manual Verification Required" section including a direct link to Bodemloket.

**Why:** The current section copies the climate summary into a field titled "Soil Contamination Check" and tells the user to check Bodemloket themselves. This is fake presence: a section that looks comprehensive but delivers no analysis. BRO endpoints return 404 and Bodemloket GetFeatureInfo is non-functional (documented in CLAUDE.md).

**How to fix:**
- Rename to "Soil Contamination — Manual Verification Required"
- Remove the copy-pasted climate summary
- State clearly: "No automated parcel-level soil contamination data is available. Automated extraction from Bodemloket is not reliable."
- Include actionable link: "Request a soil report via bodemloket.nl for postcode [2235BV]"

**Definition of done:**
- [ ] Section title clearly signals manual action required
- [ ] No misleading re-use of climate data in the soil section
- [ ] Includes Bodemloket link or QR code with the relevant postcode
- [ ] Explicitly states why automation is not provided

---

## E4 — Comparison Semantics & Trust

**Epic goal:** Eliminate the two most dangerous misinterpretation risks in the comparison charts — score/unit confusion and mislabeled baselines — and add the visual cues needed for correct reading.

**Current state:** Comparison charts show "WHO-richtlijn 74" which could be misread as 74 dB (it's actually a 74/100 score). "Stadsgemiddelde" implies a municipal average but the system uses urbanization-level baselines. No chart legend. No scale declaration.

---

### E4-S1: Add score scale declaration to comparison charts

**Description:** Add a mandatory caption under every comparison chart stating that bars are on the 0-100 score scale (not physical units) and that higher is better.

**Why:** "WHO-richtlijn 74" looks like "WHO guideline = 74 dB." A reader who knows the WHO recommends 53 dB Lden will be confused or misled. This is a high-risk semantic failure that undermines the entire comparison framework. Potential legal exposure if construed as publishing a factual threshold that doesn't exist.

**Root cause:** `draw_comparison_chart()` at line 163 in `pdf_export.py` renders bars without scale declaration. `_build_risk_detail_data()` at line 715 labels rows with names implying physical units.

**How to fix:**
- Add caption line under chart: "Reference bars are on the buurt-check 0-100 score scale (not dB / ug/m3). Higher = better."
- Rename "WHO-richtlijn" to "WHO benchmark (mapped to score)" / "WHO-doel (op scoreschaal)"

**Definition of done:**
- [ ] Every comparison chart has a scale declaration caption
- [ ] Caption explicitly states "0-100 score scale" and "higher = better"
- [ ] WHO/target rows are labeled to prevent unit confusion
- [ ] A non-expert reader shown the chart in isolation correctly identifies the scale (user test)

---

### E4-S2: Relabel "City average" to "Peer baseline (urbanization)"

**Description:** Rename the "Stadsgemiddelde" / "City average" comparison row to accurately reflect that it's a modeled reference from CBS urbanization category, not a real municipal distribution average.

**Why:** The backend computes reference values from urbanization-level lookup tables (via `scoring.py`), not from actual Katwijk municipal statistics. If a user cross-references against real Katwijk data and finds a different number, trust collapses. This is a labeling misrepresentation.

**How to fix:**
- Replace `"Stadsgemiddelde"` with `"Vergelijkingswaarde (stedelijkheid)"` in `_COMPARISON_LABELS` dict at `pdf_export.py:724`
- Replace English `"City average"` with `"Peer baseline (urbanization)"`
- Add one-line disclosure in methodology: "Where 'peer baseline' is shown, values are modeled from the address's urbanization category (CBS), not averaged from the municipality's full distribution."

**Definition of done:**
- [ ] No PDF page contains "Stadsgemiddelde" or "City average" unless actual municipal distribution is computed
- [ ] Replacement label clearly indicates modeled nature
- [ ] Methodology page includes one-line disclosure about baseline computation
- [ ] Same fix applied in both NL and EN language paths

---

### E4-S3: Add raw measurement factsheet rows to risk detail page

**Description:** Show the actual measured values (dB, ug/m3, level) as a prominent factsheet row above each comparison chart, separate from the 0-100 score bars.

**Why:** The risk detail page (Page 2) buries raw measurements in prose summaries. A data-literate buyer wants both the number AND the score. Separating unit-based measurements from score-based comparisons also resolves the score/unit ambiguity structurally.

**How to fix:**
- Extract `lden_db`, `pm25_ug_m3`, `no2_ug_m3`, `heat_level`, `water_level`, `svf_percent` from risk card models
- Add factsheet row above each chart: "Measured: 65.0 dB Lden | WHO limit: 53 dB Lden"
- Color the measurement: green if below guideline, amber if near, red if above
- Define the measurement unit (e.g., "Lden = day-evening-night weighted noise level")

**Definition of done:**
- [ ] Every risk category on Page 2 shows raw measurement above its comparison chart
- [ ] Measurement row includes value + unit + guideline value + guideline unit
- [ ] Unit is defined (at least on first occurrence or in glossary)
- [ ] Visual separation between "measured (units)" and "scored (0-100)" is unambiguous

---

### E4-S4: Add comparison chart legend

**Description:** Add a compact one-line legend below the "How it compares" heading explaining what each bar color/pattern represents.

**Why:** Color alone fails WCAG accessibility (5% colorblind). Grayscale printing makes TEAL and BORDER indistinguishable. The dashed-vs-solid distinction is subtle. New readers can't decode bars without reading row labels.

**How to fix:**
- One-line legend: "[teal] This address  [gray] Peer baseline  [dashed amber] WHO/Target benchmark"
- Strengthen visual distinction: address bar bold + color; guideline bars clearly dashed; averages lighter
- Don't rely on color alone — add pattern or icon differentiation

**Definition of done:**
- [ ] Chart legend appears on first comparison chart (at minimum)
- [ ] Legend is legible in grayscale print
- [ ] Three bar types (address, baseline, guideline) are distinguishable without color

---

## E5 — Report Provenance & Auditability

**Epic goal:** Make the dossier reproducible and auditable — a third party can identify the exact inputs, re-run the analysis, and verify the scores.

**Current state:** PDF has no report ID, no coordinates, no canonical identifiers, no layer names, no score formulas, and no PDF document metadata. Source dates are inconsistent ("Brondatum onbekend"). Data sources table lists only 5 of 8+ sources actually queried.

---

### E5-S1: Add provenance block to PDF

**Description:** Add a structured metadata block containing report ID, coordinates (WGS84 + EPSG:28992), canonical identifiers (VBO, pand, buurt, gemeente), geocoding method, and methodology version.

**Why:** A defensible report must be reproducible. A mortgage advisor, building inspector, or legal dispute requires verifiable inputs. Currently you cannot re-run the report (no coordinates), verify scores (no formula), or uniquely identify it (no report_id).

**How to fix:**
- Pass coordinates, IDs, and report_id from the export API to `generate_full_dossier()`
- Render a "Report Details" block (footer panel or appendix page):
  ```
  Report ID: rpt_abc123xyz | Generated: 2026-03-01T14:23:00+01:00
  VBO: 0441010000123456 | Pand: 0441100000654321
  Buurt: BU04410203 | Gemeente: Katwijk (0537)
  Coordinates: 52.1831N, 4.4328E (WGS84) / 92145, 467832 (EPSG:28992)
  Geocoding: BAG address point (building centroid)
  Methodology: v2.1 (2026-02-28)
  ```

**Definition of done:**
- [ ] PDF contains a unique report_id
- [ ] WGS84 and EPSG:28992 coordinates are printed
- [ ] VBO ID, pand ID, buurt code, gemeente code/name are printed
- [ ] Methodology version is printed
- [ ] A third party can use the printed coordinates + IDs to re-query the same data sources

---

### E5-S2: Disclose score formulas in methodology page

**Description:** Add plain-language descriptions of the 0-100 scoring formulas for each risk category to the methodology page.

**Why:** Without formula disclosure, "score 50" is a black box. Users cannot reason about what the number means or verify it against raw data. This also prevents the score from being treated as a factual measurement when it's actually a normalized index.

**How to fix:**
Add to methodology page:
- Noise: "40 dB Lden = 100 (excellent), 90 dB Lden = 0 (critical), linear interpolation"
- Air quality: "Worst-of-two pollutant score. PM2.5 anchor: WHO AQG 5 ug/m3 = 100. NO2 anchor: WHO AQG 10 ug/m3 = 100."
- Climate: "Maximum risk across available layers. Categorical: low risk = 85, medium = 50, high = 15."
- Sunlight: "Winter solstice direct sun hours / 6 hours * 100. 6+ hours = 100."

**Definition of done:**
- [ ] Every risk category's scoring formula is described in plain language
- [ ] Formula includes the anchor values/thresholds and normalization method
- [ ] Reader can manually verify a score given the raw measurement and the formula
- [ ] Formulas match the actual implementation in `scoring.py`

---

### E5-S3: Complete data sources table with layer names and dates

**Description:** Expand the methodology page data sources table to list every API endpoint queried, with specific layer names, data publication years, and retrieval dates.

**Why:** The current table lists only 5 of 8+ sources. A methodology page that doesn't list all sources undermines the credibility it's meant to establish. Layer-level specificity enables verification and flags stale data.

**How to fix:**
Expand table format:
```
Source              Data                     Layer/Endpoint      Data Year  Retrieved
BAG (Kadaster)      Building footprint       WFS verblijfsobject 2026       2026-03-01
RIVM                Noise (Lden road)        alo:lden_wegen      2025       2026-03-01
Klimaateffectatlas  Flood risk               [specific layer ID] 2023       2026-03-01
...
```

**Definition of done:**
- [ ] Every data source queried for this address is listed
- [ ] Each row includes source, data type, layer/endpoint name, data publication year, retrieval date
- [ ] No "Brondatum onbekend" (source date unknown) — parse from layer metadata or hardcode known year

---

### E5-S4: Set PDF document metadata and validate font embedding

**Description:** Populate PDF document properties (Title, Author, Subject, Keywords) and validate font embedding across major PDF engines.

**Why:** Empty metadata weakens professionalism and traceability (users can't identify dossier versions in email chains). Font embedding issues cause rendering warnings in MuPDF and potentially failures in corporate email systems or print workflows.

**How to fix:**
- Set via fpdf2: `pdf.set_title(...)`, `pdf.set_author("buurt-check")`, `pdf.set_subject(...)`, `pdf.set_keywords(...)`
- Add report_id to header or footer
- Test font rendering in Adobe Reader, Chrome PDF viewer, macOS Preview, MuPDF

**Definition of done:**
- [ ] PDF Title contains address string
- [ ] PDF Author = "buurt-check"
- [ ] PDF Keywords include report_id and date
- [ ] Satoshi font renders without warnings in Adobe Reader, Chrome, Preview
- [ ] Report ID visible in header or footer of every page

---

## E6 — Neighborhood & Crime Data Enrichment

**Epic goal:** Upgrade raw numbers to interpreted, contextualized data points — transforming the neighborhood and crime sections from data tables into analytical content.

**Current state:** Crime shows only raw rate (12.0/1000) with no score, severity, or national comparison. CBS indicators lack quartile context. Age distribution has no interpretation. Climate section omits scenario and time horizon.

---

### E6-S1: Render crime as scored risk card

**Description:** Replace the raw crime rate display with a full risk card: score badge, severity, meaning text, national comparison, and data year.

**Why:** "12.0 per 1,000" is meaningless without context. The free viewer shows score + severity + comparison chart + meaning text. The paid PDF shows only the raw rate — a downgrade from the free product. All the needed fields exist in `TierBResponse.crime` (`score`, `severity`, `meaning_en`/`meaning_nl`, `national_per_1000`, `source_date`).

**How to fix:**
- Add crime score badge (0-100) colored by severity
- Show severity label + meaning sentence
- Add comparison row: this address vs national average
- Show source + year: "Bron: CBS OData Misdrijven, 2023"
- Keep burglary/violent breakdown as secondary detail

**Definition of done:**
- [ ] Crime section shows score (0-100) with severity badge
- [ ] Meaning sentence rendered in both NL and EN
- [ ] National average comparison visible
- [ ] Source includes data year
- [ ] Burglary and violence sub-rates still shown as detail lines

---

### E6-S2: Add CBS quartile indicators to neighborhood stats

**Description:** Show the national quartile position (Q1-Q4) alongside every neighborhood indicator value.

**Why:** "EUR428,000 avg property value" is context-free. "EUR428,000 (Q3 nationally)" immediately contextualizes it. Quartile data is already computed in `cbs.py` but `_draw_indicator()` at lines 1133-1155 discards `indicator.quartile`.

**How to fix:**
- Modify `_draw_indicator()` to render quartile (1-4) as text badge or colored dot
- Options: "(Q3)", "Top 25%", or small colored dot (Q1=green, Q4=red)

**Definition of done:**
- [ ] Every neighborhood indicator with a quartile shows it next to the value
- [ ] Quartile meaning is clear (Q1 = bottom 25%, Q4 = top 25%)
- [ ] Indicators without quartile data gracefully omit the badge

---

### E6-S3: Add age distribution interpretation

**Description:** Add a one-line plain-language interpretation below the age distribution chart.

**Why:** Raw percentages (33%/52%/16%) are meaningless without context. The chart should answer: "Is this a young neighborhood, aging, or balanced?" This follows product principle #1: "Consequences over data."

**How to fix:**
- Compare against national averages to generate interpretation
- One-line: "Younger than average — family-oriented neighborhood" or "Aging population — mature residential area"

**Definition of done:**
- [ ] Age chart includes one-line interpretation below bars
- [ ] Interpretation is bilingual (NL + EN)
- [ ] Characterization is based on deviation from national average, not arbitrary thresholds

---

### E6-S4: Specify climate scenario and time horizon

**Description:** Disclose which Klimaateffectatlas layer(s) were sampled, their scenario/time horizon, and the attribute meaning.

**Why:** Climate stress is Critical (15/100) — the most alarming score. A buyer needs to know: current risk or 2050 projection? What does "high water stress" mean quantitatively? Currently the source date is "Brondatum onbekend" and no layer specifics are disclosed. Climate atlas layers include regional enrichments with varying meaning between municipalities.

**How to fix:**
- Print specific layer ID(s) used (e.g., "waterdiepte_T100_huidig")
- State scenario: "Current climate conditions" or "2050 projection, moderate scenario"
- Define attribute: "Maximum water depth (cm) during 1-in-100-year rainfall"
- Replace "Brondatum onbekend" with parsed or hardcoded atlas version year

**Definition of done:**
- [ ] Climate section names the specific layer(s) sampled
- [ ] Scenario and time horizon are stated
- [ ] Attribute meaning is translated to plain language
- [ ] Source date is resolved (no "unknown")

---

### E6-S5: Define measurement units in risk detail page

**Description:** Add brief unit definitions for technical abbreviations (Lden, PM2.5, NO2) and disclose measurement specifics (averaging time, source type).

**Why:** "65.0 dB Lden" means different things than "65.0 dB LAeq" or "65.0 dB Lnight." A buyer comparing against other sources needs to know which metric is cited. PM2.5 and NO2 are abbreviated without defining the pollutants. Whether noise is road-traffic-only or combined sources is not stated.

**How to fix:**
- Add brief definitions on first use: "Lden = day-evening-night weighted noise level (road traffic)"
- State averaging time for air quality: "Annual mean concentration"
- Add a compact glossary to methodology page

**Definition of done:**
- [ ] Every technical abbreviation is defined on first use or in methodology glossary
- [ ] Noise metric specifies source type (road traffic, combined, etc.)
- [ ] Air quality specifies averaging time (annual mean)
- [ ] A non-specialist reader can understand what each measurement represents

---

## E7 — Spatial Context & Cartography

**Epic goal:** Add at least one map to the dossier so the property has geographic context.

**Current state:** 7-page report, 0 maps, 0 street-level context. Every competing Dutch property report includes at least one map.

---

### E7-S1: Add static location map to dossier

**Description:** Generate a server-side static map tile (PDOK BRT/BGT) at ~500m radius and embed it on the cover or neighborhood page with a pin at the address location.

**Why:** A map serves as a credibility anchor (the system knows where this address is) and provides spatial context (what surrounds the property). Its absence signals "auto-generated without spatial awareness."

**How to fix:**
- Generate via PDOK WMS `GetMap` endpoint (~200ms, cacheable)
- 500m radius, 600x400px minimum
- Red pin at address centroid
- Compass rose + scale bar
- Optional: 5-minute walk isochron

**Definition of done:**
- [ ] PDF contains at least one static map showing the address location
- [ ] Map shows surrounding neighborhood context (~500m radius)
- [ ] Address location is clearly marked (pin/marker)
- [ ] Map has compass rose and scale bar
- [ ] Map source is attributed

---

## E8 — Information Architecture & Polish

**Epic goal:** Improve information density and presentation quality — fill wasted space with useful content, add a narrative summary, and fix accessibility gaps.

**Current state:** Half of page 7 is blank ruled lines. Cover page has no narrative summary. Provenance text uses decorative-only styling below WCAG minimums.

---

### E8-S1: Add executive summary narrative to cover page

**Description:** Generate a 3-5 sentence bilingual summary on the cover that synthesizes risk scores, neighborhood character, and action items.

**Why:** Decision-makers read summaries first. The cover currently shows data tiles without narrative. A summary immediately communicates value and justifies the purchase.

**How to fix:**
- Generate from: risk severity distribution, top concern, neighborhood character, action items
- Place between shadow image and risk grid on Page 1
- Bilingual (NL default, EN secondary)

**Definition of done:**
- [ ] Cover page contains a 3-5 sentence narrative summary
- [ ] Summary mentions the top risk concern and key action items
- [ ] Available in both NL and EN
- [ ] Summary accurately reflects the scores shown elsewhere in the dossier

---

### E8-S2: Reduce or remove blank notes section

**Description:** Shrink the 12 blank ruled lines (96mm of dead space) on page 7 to 3-4 lines or remove entirely.

**Why:** Half of page 7 is blank. In a digital-first product, ruled lines are dead space that dilutes information density. The reclaimed space can host the provenance block (E5-S1) or livability data.

**Definition of done:**
- [ ] Notes section is <= 4 lines (or removed entirely)
- [ ] Reclaimed space is used for other content (provenance block, glossary, or nothing)

---

### E8-S3: Promote provenance text to WCAG-passing contrast

**Description:** Upgrade source and disclaimer lines from MUTED color (#8A9BB0, 2.75:1 contrast) and 7-8pt font to a WCAG-AA-passing style.

**Why:** Source lines contain critical information (data origin, publication date, limitations) but are visually invisible. The design system's own rules state `--color-text-tertiary` is "decorative only, never essential info." WCAG 2.2 requires 4.5:1 for normal text. 2.75:1 fails both thresholds.

**How to fix:**
- Use `--color-text-secondary` (#637892, ~4.5:1) instead of MUTED
- Increase to 9-10pt minimum
- Remove italic at small sizes (reduces readability)

**Definition of done:**
- [ ] All source/disclaimer lines use a color with >= 4.5:1 contrast against background
- [ ] Font size >= 9pt for provenance text
- [ ] Consistent styling across all pages (not varying per section)

---

### E8-S4: Add "Premium analyses included" indicator

**Description:** Add a visible marker in the PDF distinguishing premium-only content from free-tier content.

**Why:** The product model requires strict separation between free viewer and paid PDF. Buyers should see what they paid for. A visible "Premium" badge on sections like property warnings, livability detail, and shadow triptych reinforces value.

**Definition of done:**
- [ ] Premium-only sections are visually marked (badge, icon, or section header)
- [ ] Free-tier content is not marked as premium
- [ ] Marking is subtle but visible (not distracting)

---

## E9 — Data Visualization Quality

**Epic goal:** Transform charts from decorative accents into primary data carriers — with proper axes, scales, legends, visual hierarchy, and chart-type variety that match the depth of the underlying analysis.

**Current state (evidence from visual inspection of all 7 pages rendered at 200 DPI + code audit of every drawing primitive in `pdf_export.py`):**

The dossier contains exactly three visual element types: (1) score bars in risk grid tiles, (2) horizontal bar comparison charts, and (3) age distribution bars. All use identical 3.0mm bar height (or smaller: 1.0-1.2mm for score bars). No chart has an x-axis, scale label, gridline, or legend. The comparison charts use four bar types differentiated only by fill color, two of which (MUTED #8A9BB0 at ~0.38 luminance and BORDER #E2E7ED at ~0.80 luminance) merge in grayscale. The "Dit adres" row — the hero data point — is placed LAST (bottom) in every chart. Data-ink ratio is critically low: numeric text carries 90%+ of informational weight; bars are decorative hairlines. The only image is a dark 427x265px shadow snapshot. Zero sparklines, gauges, bullet charts, radar charts, dot plots, or icons appear anywhere.

---

### E9-S1: Score bars are invisible 1mm hairlines

**Description:** Risk grid score bars are 1.0mm tall; risk detail bars are 1.2mm. At these heights they function as colored lines, not data visualizations. The severity-colored fill and the BORDER gray track occupy the same single-pixel row at viewing distance.

**Why (exact measurements from code):**
- `pdf_export.py:146`: `draw_score_bar()` default `height=1.0` (mm)
- `pdf_export.py:681`: risk detail bars call `height=1.2`
- `pdf_export.py:247`: risk grid bars use default 1.0, inset with 10% margin
- At 200 DPI rendering, 1.0mm = ~8 pixels — thinner than a standard underline
- At arm's length (~60cm) on printed A4, 1mm is below the visual acuity threshold for reading color-fill proportion
- The bar FILL (severity color) and the TRACK (BORDER #E2E7ED) are the same height — making fill-vs-track contrast impossible to perceive at any score value
- **Visible on Page 1:** "Geluid 50" shows a 1mm amber stripe; "Klimaat 15" shows a 1mm dark-red stripe barely distinguishable from the gray track. "Zonlicht —" shows a 1mm gray stripe with no fill — identical to BORDER.

**How to fix:**
- Risk grid bars: increase to 3-4mm with a visible track taller than fill (e.g., 4mm track, fill proportional within it)
- Risk detail bars: increase to 5-6mm with rounded ends
- Add severity zone markers: thin vertical tick lines at scores 20, 40, 70 to show good/moderate/poor/critical boundaries
- Ensure minimum score (e.g., score=5) still produces a visible fill segment (not just a pixel sliver)

**Definition of done:**
- [ ] All score bars visible at arm's length (60cm) on printed A4
- [ ] Bar height >= 3mm in grids, >= 5mm in detail views
- [ ] Fill color distinguishable from track at every score value (including 5/100 and 95/100)
- [ ] Print test: bars readable in 300 DPI laser grayscale output
- [ ] Severity zones optionally marked with tick lines at 20/40/70

---

### E9-S2: Comparison charts have no axis, no scale, no title

**Description:** Every comparison chart (`draw_comparison_chart()` at line 163) renders horizontal bars without a numeric x-axis, without tick marks, without a scale declaration, and without a chart title. The only contextual label is "HOE HET VERGELIJKT" (8pt MUTED ALL-CAPS SatoshiMedium) — a section label describing the chart type, not the data.

**Why (foundational chart design violations):**
- **No axis:** Bars float between `label_w=40mm` and `score_w=15mm` with no gridlines, tick marks, or "0" / "100" endpoint labels. The reader must mentally map bar length to score without any reference framework.
- **No scale declaration:** "WHO-richtlijn 74" reads naturally as "the WHO guideline IS 74 dB" — because nothing says "74 is a score on a 0-100 scale." This is the semantic root of the score-vs-unit ambiguity (E4-S1).
- **No chart title:** "HOE HET VERGELIJKT" doesn't state WHAT is being compared. The category name ("Geluid") appears ~30mm above in the left-accent header, not inline with the chart.
- **No legend:** Four bar types (solid teal, solid medium-gray, solid light-gray, dashed amber) have no legend explaining what each represents.
- In formal data visualization (Cairo, Few, Schwabish, Tufte): every chart requires at minimum (1) a title stating what is shown, (2) axis labels, (3) a scale declaration, and (4) a legend if multiple series are present. This chart has zero of four.
- **Visible on Page 2:** The Noise comparison chart shows four bars with right-aligned numbers (64, 66, 74, 50) — but a reader unfamiliar with the system cannot tell whether these are dB, ug/m3, or scores. The bars provide no independent reading frame.

**How to fix:**
- Add baseline axis at x=0 and maximum at x=100 below the bar area
- Add light gridlines at 25, 50, 75 (BORDER color, 0.1mm) for reading reference
- Add one-line scale declaration beneath each chart: "Score op schaal 0-100 (hoger = beter)" / "Score on 0-100 scale (higher = better)"
- Add inline chart title including the category name: "Geluid — Vergelijking met referenties"
- Add one-line legend on first occurrence: "[teal] Dit adres [gray] Vergelijkingswaarde [dashed] Richtlijn"

**Definition of done:**
- [ ] Every comparison chart has 0 and 100 axis labels
- [ ] Gridlines at 25/50/75 provide reading reference
- [ ] Scale declaration states "0-100, higher = better" below each chart
- [ ] Chart title includes the category name
- [ ] Legend appears on at least the first comparison chart
- [ ] A non-expert reader can correctly interpret the chart without reading surrounding text

---

### E9-S3: Comparison bar colors are indistinguishable

**Description:** The four comparison bar types use TEAL (#2EC4B6 solid), MUTED (#8A9BB0 solid), BORDER (#E2E7ED solid), and AMBER (#EAB308 dashed). The two gray fills merge in grayscale print, and BORDER is invisible against the white page.

**Why (contrast measurements):**
- MUTED (#8A9BB0): luminance ~0.38, contrast vs white ~2.5:1
- BORDER (#E2E7ED): luminance ~0.80, contrast vs white ~1.3:1 — **effectively invisible**
- MUTED vs BORDER: luminance ratio ~2.1:1 — distinguishable on screen in isolation but NOT at 8pt label distance when scanning a printed page
- The "Nederland" bar (BORDER fill) disappears into the white page background. The track BEHIND the bar is also BORDER-colored (line 191: `set_fill_color(*BORDER)` for the track). So the "Nederland" bar is BORDER fill on a BORDER track — literally zero contrast.
- AMBER dashing is rendered via `set_line_width(bar_h)` + individual line segments (line 196-203) — a crude blocky pattern, not a proper dash. Each dash is 1.5mm long with 1mm gaps at 3mm "bar" height. The result is a row of thick yellow squares, not an elegant dashed bar.
- **Visible on Page 2:** In the Noise chart, "Stadsgemiddelde" and "Nederland" are two shades of gray that require deliberate comparison to distinguish. In the Climate chart, "Dit adres" (score 15) has a tiny teal bar while "Doelstelling" (score 70) has a medium amber-dashed bar — these two are clearly different, but the two gray bars between them blur.

**How to fix:**
- Replace BORDER bar fill with a substantially darker gray (e.g., #8AA0B4, ~3.5:1 vs white)
- Add pattern differentiation: solid (address), hatched (peer), dotted (national), dashed (guideline)
- Ensure every pair of bar types has >= 3:1 luminance ratio difference
- Fix dashing: use proper dash-gap pattern at bar_h height or switch to a cleaner pattern fill
- Test: print page in grayscale at 300 DPI on a laser printer — all 4 types must be distinguishable

**Definition of done:**
- [ ] All 4 bar types are distinguishable in 300 DPI grayscale laser print
- [ ] No two adjacent bars share the same visual pattern
- [ ] "Nederland" bar (currently BORDER #E2E7ED) replaced with a fill having >= 3:1 contrast vs white
- [ ] Dashed bars render with clean dash spacing (not the current `set_line_width(bar_h)` hack)

---

### E9-S4: "Dit adres" row buried at bottom of every chart

**Description:** In every comparison chart, "Dit adres" (This address) — the data point the reader bought the report for — is rendered as the LAST row (bottom). Reference rows appear first: "Stadsgemiddelde" (top), "Nederland," "WHO-richtlijn," then "Dit adres" (bottom).

**Why (visual reading order):**
- The reader buys this report for ONE address. The first thing they search for is "how does MY address compare?" Placing it last forces downward scanning through 3 reference rows before reaching the answer.
- In horizontal bar chart design (Few, Schwabish): the hero/subject row should be placed FIRST (top) or visually emphasized with heavier weight, contrasting color, or bold label.
- "Dit adres" uses TEAL (the most saturated color — good), but its bottom position is the least prominent. The reader's eye enters the chart at the top and may stop at "Stadsgemiddelde: 64" before reaching "Dit adres: 50."
- Additionally, the reference rows lack context until you reach the address row — you see "64, 66, 74" but don't know what the address scored until you reach the bottom.
- **Visible on Page 2:** In all three visible comparison charts (Noise, Air, Climate), "Dit adres" is consistently last. The teal bar at the bottom is visually the weakest row despite being informationally the most important.
- Code evidence: `_comp_rows()` at line 733 preserves the order from `category_rows` which comes from the backend. The backend returns address first in the response model, but the comparison chart renders them in the order given, and `_COMPARISON_LABELS` dict ordering at line 724 places "address" before "city_avg" — however, the actual rendering order depends on `row.label_code` iteration order from the comparison response. The visual result is that reference rows appear above the address row.

**How to fix:**
- Sort chart rows so "Dit adres" is FIRST (top) in every comparison chart
- Use a heavier bar (5mm vs 3mm for reference rows) for the address row
- Add a subtle background highlight (very light teal wash) behind the address row
- Consider a visual gap (1-2mm) between "Dit adres" and the reference rows to separate "your data" from "context data"

**Definition of done:**
- [ ] "Dit adres" is the FIRST (top) row in every comparison chart
- [ ] Address bar is visually heavier or more prominent than reference bars
- [ ] A reader's eye naturally lands on the address score first, then scans reference rows for context
- [ ] Visual gap or separator distinguishes the address row from reference rows

---

### E9-S5: Data-ink ratio critically low — text carries data, bars are decorative

**Description:** Across the entire dossier, numeric text (score numbers, percentages, rates) carries 90%+ of the informational load. Graphical elements (bars, grids) are thin decorative accents that cannot communicate data independently.

**Why (Tufte data-ink principle, chart-by-chart):**
- **Risk grid tiles (Pages 1, 6):** The 24pt SatoshiBlack score number IS the data. The 1mm bar below it adds zero information a reader couldn't get from the number alone. Remove the bar entirely and the tile loses nothing. But remove the number and keep only the bar — the tile becomes unreadable.
- **Comparison charts (Pages 2-3):** The right-aligned score numbers (e.g., "64", "66", "74", "50") carry all information. A reader could black out all bars and still read the chart from numbers alone. But black out the numbers and keep only the bars — the chart becomes uninterpretable because there are no axes, no gridlines, and two of four bar colors are near-invisible.
- **Age distribution (Page 4):** "33%", "52%", "16%" in bold carry the information. The teal bars provide visual reinforcement but no independent data (no national average overlay, no comparison context).
- **Crime section (Page 4):** Pure text — "12.0 per 1.000 inwoners", "Inbraak: 0.0", "Geweld: 0.5". Zero graphical elements.
- **Neighborhood indicators (Page 4):** Pure text — "8,351 per km2", "€428,000", "5.2 km". Zero graphical elements.
- The design pattern is: "number first, bar as optional decorative accent." For a paid data visualization report, this is backwards. The graphic should BE the primary data carrier, with numbers as precision annotations.

**How to fix:**
- Redesign score bars as primary data carriers: wider (5-6mm), with threshold markers at 20/40/70, readable without the adjacent number
- Make comparison charts self-sufficient: with axes, gridlines, and legend, a reader should be able to interpret the chart by covering the score numbers
- Add comparison context to age bars: overlay national average as thin vertical reference lines
- Add at least one visualization where the GRAPHIC is primary (e.g., radar chart for livability, gauge for SVF, sparkline for trend)
- For indicator rows: add small inline sparkline or bar next to the value to provide visual context

**Definition of done:**
- [ ] At least one chart in the dossier can be fully interpreted by covering the numbers and reading only the graphical elements
- [ ] Score bars in detail view have threshold markers (at 20, 40, 70) making them independently readable
- [ ] Comparison charts have axes/gridlines enabling bar-length interpretation without score labels
- [ ] At least two indicator rows include a visual element beyond plain text

---

### E9-S6: Zero chart type variety — horizontal bars only

**Description:** The entire 7-page dossier uses exactly one chart type: horizontal bar. Every comparison chart (x4 categories), every age distribution bar (x3 bands), every score bar (x8 in grid tiles + x4 in detail) — all horizontal bars at 1.0-3.0mm height. No sparklines, gauges, bullet charts, radar charts, dot plots, small multiples, or icon badges appear anywhere.

**Why (visual variety and cognitive engagement):**
- Cairo's "The Functional Art": variety in chart type signals variety in data type. All data types rendered the same way implies all data is the same type — but risk scores, age distributions, crime rates, and sunlight hours are fundamentally different measures.
- The reader habituates to repeated patterns. By the 3rd comparison chart (Climate, page 2), the layout is entirely predictable and the reader skims. By page 4's age bars, no visual element surprises.
- The backend computes 6+ distinct data types suitable for different chart forms:
  - Risk scores (0-100): bullet chart or gauge
  - Seasonal variation (winter/equinox/summer hours): grouped bar, small multiples, or line
  - 5-dimension profile (livability): radar/spider chart
  - Time series (livability trend): sparkline or area chart
  - Percentages (age, ownership): stacked bar, waffle chart
  - Binary/categorical (property warnings): icon badges, status chips
- The horizontal bar is the lowest-information chart type — it encodes only one variable (length) against a single axis. More expressive chart types (bullet, radar, sparkline) encode 2-3 variables in the same space.

**How to fix — implement at least 3 of these:**
1. **Bullet chart** for risk detail scores — combines current value, target range, and severity bands in one mark. Replaces score bar + comparison chart with a single, denser visualization.
2. **Sparkline** for livability 20-year trend — tiny inline line chart, very high data density, no axis needed
3. **Radar/spider chart** for livability 5 dimensions — shows the neighborhood profile shape at a glance
4. **Gauge or arc** for SVF (sky view factor) — naturally represents 0-100% openness
5. **Small multiples** for shadow triptych — three consistent 3D panels (already planned in E1-S2)
6. **Dot plot** for comparison — reference values as dots on a shared axis, address as a highlighted dot, avoiding bar-length confusion
7. **Icon badges** for property warnings — small visual icons (asbestos, foundation, pipe) alongside text

**Definition of done:**
- [ ] At least 3 distinct chart types appear across the dossier (not counting plain score bars)
- [ ] Each chart type matches the data type it represents (comparative, compositional, temporal, spatial)
- [ ] New charts use Polar Frost design tokens (TEAL, SLATE, MUTED, severity colors, Satoshi font)
- [ ] A reader flipping through the pages sees visual variety — no two adjacent sections look identical

---

## E10 — Typography & Readability

**Epic goal:** Establish a clear, consistent typographic hierarchy with appropriate line length, leading, alignment, and locale-aware number formatting — making the dossier comfortable to read and professionally typeset.

**Current state (complete audit of every `set_font()` call in `pdf_export.py` + visual inspection):**

The dossier uses **17 distinct type styles** (weight x size x color combinations). The bottom 6 levels (7pt-10pt in Regular/Medium/MUTED/SLATE) are indistinguishable at reading distance — they all render as "small text." Body text runs at ~85-90 characters per line, exceeding the 45-75 character readability optimum by 20-40%. The methodology paragraph on page 7 uses fpdf2's default justified alignment, producing visible word-spacing rivers between long Dutch/English technical terms. The italic font is mapped to Regular (`"I" -> "Satoshi-Regular.ttf"` at line 87), making all italic styling invisible. Number formatting uses Python's default period decimal (12.0) in a Dutch-language document where decimal comma (12,0) is expected, while simultaneously displaying Dutch-style period thousands (1.000) — creating ambiguous mixed formatting.

---

### E10-S1: 17 type styles with 6 indistinguishable bottom levels

**Description:** The dossier uses the following 17 distinct type styles (complete audit of all `set_font()` calls):

| # | Font | Size | Color | Usage | Code reference |
|---|------|------|-------|-------|---------------|
| 1 | SatoshiBlack | 24pt | severity | Grid score numbers | line 239 |
| 2 | SatoshiBlack | 20pt | SLATE | Cover address | line 620 via `font_size=20` |
| 3 | SatoshiBlack | 14pt | severity | Detail score numbers | line 674 |
| 4 | SatoshiBlack | 9pt | SLATE | Header brand name | line 105 |
| 5 | Satoshi Bold | 16pt | SLATE | Buurt name (page 4) | line 802 |
| 6 | Satoshi Bold | 14pt | SLATE | Risk category name | line 670 |
| 7 | Satoshi Bold | 12pt | SLATE/AMBER | Section headers | lines 989, 1194, 1236, 1260 |
| 8 | Satoshi Bold | 11pt | SLATE | Subsection headers, crime | lines 382, 911, 969, 1122 |
| 9 | Satoshi Bold | 10pt | MUTED | Address context (page 2) | line 653 |
| 10 | Satoshi Bold | 9pt | SLATE | Indicator values, age %s | lines 290, 322 |
| 11 | Satoshi Bold | 8pt | SLATE | Comparison chart scores | line 209 |
| 12 | SatoshiMedium | 8pt | MUTED | Section labels (ALL-CAPS) | lines 300, 400 |
| 13 | SatoshiMedium | 7pt | MUTED | Grid category labels | line 233 |
| 14 | Satoshi Regular | 10pt | SLATE | Body text, summaries | lines 693, 915, 971, 1202, 1244 |
| 15 | Satoshi Regular | 9pt | SLATE/MUTED | Indicator labels, questions, severity, date | lines 275, 318, 407, 471, etc. |
| 16 | Satoshi Regular | 8pt | SLATE/MUTED | Source lines, chart labels, section labels | lines 183, 708, 882, 973 |
| 17 | Satoshi Regular | 7pt | MUTED | Footer text, shadow caption | lines 130, 438, 522 |

**Levels 12-17 are indistinguishable at reading distance.** The difference between SatoshiMedium 8pt MUTED, Satoshi Regular 9pt SLATE, Satoshi Regular 8pt MUTED, and Satoshi Regular 7pt MUTED is invisible on a printed A4 page. They all render as "small grayish text."

**Why (typographic hierarchy principles):**
- Each step in a type hierarchy should differ by at least 2pt AND either weight or color change (Bringhurst, Lupton)
- Having 6 near-identical styles in the 7-10pt range creates visual noise — readers cannot decode which hierarchy level they are reading
- The size progression through the bottom levels is: 10 -> 9 -> 8 -> 7, which is a 1pt step each — below the perceptible threshold at body-text reading distance
- 17 levels for a 7-page document is excessive. Professional reports typically use 5-8 levels.

**How to fix:**
- Consolidate to 7-8 levels:
  - Display: 24pt Black (grid scores) — keep
  - Headline: 16-20pt Black/Bold (addresses, buurt names) — keep
  - Section: 12pt Bold (section headers) — merge 11pt and 14pt Bold into this
  - Body: 10pt Regular (all body text) — keep
  - Label: 9pt Medium (section labels, indicator labels) — merge current 8pt/9pt variants
  - Caption: 8pt Regular secondary color (sources, disclaimers) — single style for all small text
  - Footer: 7pt (footer only)
- Ensure minimum 2pt jump between adjacent levels
- Use color change OR weight change between levels, not both simultaneously at small sizes

**Definition of done:**
- [ ] Type style count reduced to <= 8 distinct levels
- [ ] Every adjacent pair of levels differs by >= 2pt AND/OR a clear weight/color change
- [ ] A reader can identify which hierarchy level any text belongs to within 1 second
- [ ] Documented as a type style table in code comments

---

### E10-S2: Line length exceeds readability optimum

**Description:** Body text content width is ~170mm (A4 width 210mm minus 10mm left/right margins). At 10pt Satoshi Regular, this produces approximately 85-90 characters per line.

**Why (readability research):**
- Bringhurst's "Elements of Typographic Style" recommends 45-75 characters per line (optimal: 66) for comfortable reading
- At 85-90 characters, the reader's eye loses track returning from line end to next line start — increasing fatigue and re-reading
- The fpdf2 default margin is 10mm — very slim for A4. Professional A4 reports use 15-25mm margins
- **Visible on Pages 2 and 7:** Long prose summaries ("Matig geluid (65 dB) — nabij WHO-hinderdrempel" and the methodology paragraph) are notably harder to scan than the shorter indicator rows on page 4
- The issue compounds with justified text (E10-S3) — wider columns produce more variable word spacing

**How to fix:**
- Increase margins to 20mm left/right (reducing content width to 170mm -> 150mm, ~75 chars/line)
- OR set a `max_text_width = 140` for prose text blocks while keeping charts and grids at full width
- Adjust chart widths, comparison charts, and risk grid proportionally when margins increase

**Definition of done:**
- [ ] Body text lines do not exceed 80 characters at any font size
- [ ] Margins are >= 15mm on each side (content width <= 180mm)
- [ ] Charts and indicator rows may extend wider than prose text
- [ ] Reading comfort improved on prose-heavy pages (2, 5, 7)

---

### E10-S3: Justified text creates visible word-spacing rivers

**Description:** The methodology paragraph on page 7 uses fpdf2's `multi_cell()` default justified alignment. At 170mm column width with 10pt text, this produces visible word-spacing variation — gaps of ~3mm between long technical terms vs ~1.5mm for short words.

**Why (visible on Page 7):**
- fpdf2's `multi_cell()` defaults to justified alignment ("J") for all lines except the last
- At 170mm width, each line has relatively few words, so the spacing adjustment per gap is large
- Long technical terms ("Klimaateffectatlas," "overstromings-/hittemodellen," "3D-gebouwgeometrie," "Environmental Noise Guidelines") reduce word count per line, creating especially wide gaps
- The methodology paragraph text: "...gebaseerd op WHO Environmental Noise Guidelines (2018), WHO Global Air Quality Guidelines (2021), en Klimaateffectatlas..." — visible rivers of white between "Environmental," "Noise," "Guidelines," "(2018),"
- Left-aligned text produces a ragged right edge but consistent word spacing — always preferred at this column width
- This also affects the limitations paragraph on page 7 and the property checks bodies on page 5

**How to fix:**
- Pass `align="L"` to all `multi_cell()` calls for prose text: `pdf.multi_cell(0, 5, text, align="L")`
- Justified text is acceptable ONLY if column width drops below ~100mm (e.g., in a two-column layout)
- Affected calls: lines 694, 946, 972, 1125, 1219, 1254

**Definition of done:**
- [ ] No justified-alignment prose text remains in the dossier
- [ ] All `multi_cell()` calls for body text use `align="L"`
- [ ] Word spacing is visually consistent across all paragraphs
- [ ] Center-aligned grid contents and right-aligned scores remain unchanged

---

### E10-S4: Italic fallback renders as Regular — invisible styling

**Description:** Font registration maps Italic to Regular: `("I", "Satoshi-Regular.ttf")` at line 87. All text styled as italic renders identically to regular — the styling intent is completely invisible.

**Why (affected text + intent):**
- `line 438`: Shadow caption `set_font("Satoshi", "I", 7)` — "Winterzonnewende, 12:00" — intended as caption/supplementary style but renders identical to body text
- `line 937`: Crime disclaimer `set_font("Satoshi", "I", 8)` — "Criminaliteitscijfers zijn per gemeente..." — intended to signal editorial/qualifying text
- `line 522`: "See Full Dossier" note `set_font("Satoshi", "I", 7)` — same issue
- If italic signals "this is supplementary/editorial/caption" and it renders as regular, the reader loses the typographic cue that distinguishes fact from commentary
- MuPDF font rendering warnings confirm compatibility issues with all 5 Satoshi variants

**How to fix (pick one):**
- **Option A:** Include a true Satoshi-Italic.ttf and register properly (if the Satoshi font family includes an italic variant)
- **Option B:** Remove all italic usage entirely. Replace with a consistent alternative: MUTED color + smaller size for captions, parenthetical text for disclaimers
- Either approach must be consistent — no invisible style changes

**Definition of done:**
- [ ] All italic text either renders as true italic OR all italic usage is eliminated
- [ ] Captions, disclaimers, and supplementary text have a consistent, distinct visual treatment
- [ ] No invisible font style changes exist in the document
- [ ] MuPDF font warnings resolved or documented as non-blocking

---

### E10-S5: Number formatting locale inconsistency

**Description:** The dossier language is Dutch ("nl") but number formatting uses Python's default period as decimal separator. This creates ambiguous mixed formatting within the same sentence.

**Why (specific examples from rendered pages):**
- **Page 4 crime section:** "12.0 per 1.000 inwoners" — "12.0" uses English decimal (period), "1.000" uses Dutch thousands separator (period). The sentence mixes conventions, and "1.000" could be misread as one-point-zero.
- **Page 4 indicators:** `f"{val:,.0f}/km2"` at line 1148 produces "8,351/km2" — in Dutch, this reads as "8 decimal 351" (the comma is the Dutch decimal separator). The intended reading is "8 thousand 351."
- **Page 4 WOZ value:** `f"EUR{val:,.0f}"` at line 1144 produces "EUR428,000" — in Dutch, "428,000" reads as "428 decimal zero zero zero" = 428.
- **Page 2 summary text:** "PM2.5: 8.1, NO2: 12.7 ug/m3" — period-decimal in Dutch text
- Python f-strings always produce period-decimal regardless of locale. The `,:` format flag produces comma-thousands regardless of locale.
- The inconsistency undermines trust: a careful Dutch reader will notice that numbers don't follow Dutch conventions.

**How to fix:**
- Create a `format_number(value: float, unit: str, locale: str) -> str` helper:
  - Dutch: `12,0 per 1.000 inwoners`, `EUR 428.000`, `8.351/km2`
  - English: `12.0 per 1,000 residents`, `EUR428,000`, `8,351/km2`
- Apply to all numeric output: `_draw_indicator()`, crime section, risk summaries, age percentages
- Use Python's `locale` module or manual string replacement

**Definition of done:**
- [ ] All numbers use the correct decimal/thousands separator for the document language
- [ ] Dutch mode: decimal comma (12,0), period thousands (1.000), space before unit
- [ ] English mode: decimal period (12.0), comma thousands (1,000)
- [ ] EUR formatting follows locale conventions (EUR 428.000 in NL vs EUR428,000 in EN)
- [ ] No ambiguous number formatting exists in either language mode

---

## E11 — Report Layout, Print Quality & Brand Identity

**Epic goal:** Eliminate wasted space, fix page-flow errors, ensure print-quality images, meet accessibility contrast thresholds, and establish a recognizable visual identity for a paid product.

**Current state (page-by-page utilization measured from 200 DPI renders):**

| Page | Content | Empty | Content area |
|------|---------|-------|-------------|
| 1 (Cover) | ~45% | ~55% | Address + shadow image + risk grid + date line. Bottom 55% completely blank. |
| 2 (Risk Details) | ~95% | ~5% | Dense: 3 risk categories with comparison charts. Good density. |
| 3 (Risk Details overflow) | ~15% | ~85% | Orphaned: only Zonlicht section spillover from page 2. Worst page. |
| 4 (Neighborhood) | ~55% | ~45% | Indicators + age bars + crime. Bottom 45% blank after crime section. |
| 5 (Property Checks) | ~65% | ~35% | 4 subsections + shadow image. Reasonable but improvable. |
| 6 (Checklist) | ~40% | ~60% | Risk grid + 6 questions. Only 2 of 3+ categories shown. Bottom 60% blank. |
| 7 (Methodology) | ~50% | ~50% | Methodology + sources + limitations + 12 ruled note lines. Half is dead space. |

**Weighted average content utilization: ~52%.** A 7-page paid report contains ~3.6 pages of actual content. No grid system, no column structure, single-column layout that wastes A4 width. Shadow image embedded at ~64 effective DPI (below 150 DPI print minimum). MUTED text at 2.75:1 contrast fails WCAG AA. Only branded element: 6mm teal stripe + 9pt text.

---

### E11-S1: Pages are 40-85% empty — wasted paid real estate

**Description:** Four of seven pages (1, 3, 4, 6) have 45-85% empty space. The report feels stretched — a 7-page cover price with 3.6 pages of actual content.

**Why (page-by-page, visible in rendered PNGs):**
- **Page 1 (Cover):** After the risk grid (~135mm from top), only "Opgesteld: 01 March 2026" appears. The bottom ~130mm (55%) is completely blank white — no summary, no map, no narrative.
- **Page 3 (Risk Details overflow):** Only the Zonlicht section (~40mm of content) occupies the page. The remaining ~220mm (85%) is blank. This is an auto page break issue, not a content decision.
- **Page 4 (Neighborhood):** After the crime section (~145mm from top), the bottom ~115mm (45%) is blank. Space available for livability, additional crime context, or comparison data.
- **Page 6 (Checklist):** Risk grid + 6 viewing questions occupy ~105mm. The bottom ~155mm (60%) is blank. Only 2 of 3+ question categories are shown (Noise and Climate; Air quality is absent likely because data was available but the viewing questions lacked air quality entries for this address).
- The only dense page is Page 2 (risk details) at ~95% utilization — proving the layout CAN be dense when content fills it.

**How to fix:**
- **Page 1:** Fill bottom half with executive summary (E8-S1) and/or location map (E7-S1)
- **Page 3:** Eliminate by preventing overflow (see E11-S2) or by moving Zonlicht to a dedicated sunlight page with expanded visuals (E2-S3, E2-S4)
- **Page 4:** Will fill when livability (E3-S1) and scored crime (E6-S1) are added
- **Page 6:** Add air quality and sunlight questions (currently absent). Consider merging checklist into property checks page
- **Page 7:** Reduce 12 note lines (96mm) to 3-4 lines (E8-S2), use reclaimed space for methodology depth (E5-S2, E5-S3)
- Target: <= 7 pages, every page >= 70% utilized

**Definition of done:**
- [ ] No page in the dossier is more than 30% empty (measured visually)
- [ ] No near-blank page exists (every page has >= 70% content utilization)
- [ ] Content flows naturally without forced page breaks creating gaps
- [ ] Total page count reflects actual content density

---

### E11-S2: Orphaned page break creates near-empty page 3

**Description:** The risk detail section overflows from page 2 onto page 3 at the Zonlicht category. Only the Zonlicht header, severity ("N.v.t."), comparison chart (3 bars), and source line appear on page 3 — approximately 40mm of content on a 260mm usable page.

**Why (layout mechanics):**
- `pdf_export.py:80`: `set_auto_page_break(auto=True, margin=20)` — fpdf2 triggers a page break when the Y position approaches 20mm from the bottom
- The Klimaatstress comparison chart (4 rows x 7mm = 28mm) pushes Y past the threshold, so Zonlicht starts on a fresh page
- The orphaned Zonlicht section has NO page context: no address reference, no "Risk Details" section header. A reader seeing page 3 in isolation sees "Zonlicht — N.v.t." with no way to know which address this belongs to.
- The visual pacing collapses: the reader turns from a dense page 2 to a nearly empty page 3. The contrast undermines the report's professional impression.

**How to fix:**
- **Option A:** Calculate remaining space before each risk category. If the next category won't fit, start a new page WITH the address context repeated at top.
- **Option B:** Use tighter vertical spacing in the risk detail section to fit all 4 categories on 1 page. Current spacing: 4mm between categories (line 712: `pdf.ln(4)`). Reducing summary text leading from 5mm to 4.5mm and inter-section spacing from 4mm to 2mm could save ~20mm.
- **Option C:** Redesign the risk detail layout as a 2-column grid: 2 categories per row. This halves the vertical space requirement.
- **Option D:** Move Zonlicht to a dedicated sunlight page (which E2 epics will fill with expanded data)

**Definition of done:**
- [ ] No page has less than 50% content utilization due to auto page break overflow
- [ ] If a section continues across a page break, the new page repeats address and section context
- [ ] The risk detail section either fits on one page or breaks cleanly with both pages well-utilized
- [ ] Page 3 is no longer an orphaned near-blank page

---

### E11-S3: Shadow image at ~64 effective DPI — below print quality

**Description:** The shadow snapshot is 427x265 native pixels, embedded at 170mm width (~6.7 inches). Effective resolution: 427 / 6.7 = ~64 DPI. The same image appears twice (pages 1 and 5, both referencing xref=17).

**Why (print quality standards):**
- 150 DPI is the minimum for acceptable print quality; 300 DPI is standard for professional documents
- At 64 DPI, individual pixels are ~0.4mm squares — visible as blocky artifacts in print
- The shadow image is already the darkest, most detailed element in the report. Low resolution compounds the illegibility of the dark scene (E1-S1).
- At 300 DPI for 170mm width: need 170/25.4 x 300 = **2008 pixels wide**. At 200 DPI minimum: **1339 pixels wide**.
- The duplicate embedding (same xref=17 on pages 1 and 5) wastes PDF file size. At higher resolution, this waste compounds.
- **Visible on Pages 1 and 5:** The shadow image has visible pixel boundaries between dark building polygons and slightly-less-dark ground plane. The teal target highlight is a ~10-pixel blob.

**How to fix:**
- Increase Three.js renderer canvas for PDF export to minimum 1600x1000px (2x current), ideally 2000x1200px
- Use a temporary offscreen canvas at print resolution if the interactive viewer canvas is smaller
- Embed the high-resolution image once; display on page 1 only (deduplicate page 5 instance per E1-S2 triptych plan)
- fpdf2 will scale to `w=170` without upsampling if the source image is high-resolution

**Definition of done:**
- [ ] Shadow image native resolution >= 1600x1000px (>= 240 DPI at 170mm display width)
- [ ] No visible pixel artifacts when printed at 300 DPI
- [ ] Image appears only ONCE in the dossier (deduplicate page 1 + page 5 copies)
- [ ] File size impact of higher resolution is acceptable (< 500KB increase)

---

### E11-S4: MUTED and BORDER colors fail print and accessibility contrast

**Description:** Two palette colors used throughout the document fail minimum contrast thresholds for their usage contexts:

| Color | Hex | Contrast vs white | Usage | Threshold |
|-------|-----|-------------------|-------|-----------|
| MUTED | #8A9BB0 | ~2.75:1 | Source lines, section labels, grid labels, footer, captions (7-8pt) | WCAG AA: 4.5:1 (normal text) |
| BORDER | #E2E7ED | ~1.3:1 | "Nederland" comparison bar fill, score bar track | WCAG: 3:1 (non-text graphical elements) |

**Why (specific violations):**
- **MUTED as text:** Source lines like "Bron: RIVM (Dutch National Health Institute) - 2025-01-01" carry essential provenance information. At 8pt in #8A9BB0 on white, they fail WCAG AA (4.5:1) and even WCAG AAA large text (3:1 for >= 18pt). The design system's own rules state: `--color-text-tertiary (#8A9BB0, 2.75:1) — decorative only, never essential info.` But in the PDF, MUTED carries provenance data that is legally and professionally essential.
- **BORDER as bar fill:** The "Nederland" comparison bar uses BORDER (#E2E7ED) as fill color (line 727: `"nl_avg": (..., BORDER, False)`). The track behind it is ALSO BORDER (line 191: `set_fill_color(*BORDER)`). So the "Nederland" bar is BORDER on BORDER — zero contrast. The bar is invisible.
- **MUTED as grid label:** Risk grid category labels ("GELUID", "LUCHT") are SatoshiMedium 7pt in MUTED — the lightest text on the page. At this size and contrast, they may be illegible to readers with moderate vision impairment.
- On grayscale laser printers (common in offices/banks), BORDER will print as white and MUTED will print as a barely-visible light gray.

**How to fix:**
- Replace MUTED text usage with `--color-text-secondary` (#637892, ~4.5:1 contrast) for all essential information (source lines, section labels, indicator labels)
- Keep MUTED only for truly decorative elements (footer disclaimer text, if even that)
- Replace BORDER comparison bar fill with a visibly darker neutral (e.g., #8AA0B4, ~3.5:1)
- Keep BORDER for actual borders/dividers (where high contrast isn't needed)
- Document contrast ratios as code comments on each color constant in `pdf_export.py`

**Definition of done:**
- [ ] All text carrying essential information has >= 4.5:1 contrast against white (WCAG AA)
- [ ] All graphical data elements (bars, fills) have >= 3:1 contrast against background (WCAG non-text)
- [ ] BORDER (#E2E7ED) is NEVER used as a data-carrying fill — only as decorative borders/dividers
- [ ] Contrast ratios documented in code comments for each color constant
- [ ] Print test: all text and chart elements legible in 300 DPI grayscale laser output

---

### E11-S5: Minimal brand presence for a paid product

**Description:** The only branded elements in the PDF are: (1) a 6mm teal stripe across the top of every page, (2) "buurt-check" in SatoshiBlack 9pt in the header, and (3) "buurt-check" in Regular 7pt MUTED in the footer. No logo mark, no section color bands, no visual signature, no branded graphic anywhere.

**Why (competitive context):**
- For a product customers pay for, visual identity establishes perceived value. The current dossier looks like a generic data export, not a branded intelligence report.
- Competing Dutch property reports (NVM, Calcasa, Funda) have prominent logos, branded color bands, watermarks, and consistent visual identities.
- The 6mm teal stripe (code: `self.rect(0, 0, self.w, 6, "F")` at line 102) is the ONLY visual element that distinguishes this from any other PDF generated by fpdf2.
- The section title in the header (right-aligned, MUTED 9pt Regular) is so muted it's barely visible — it doesn't contribute to branding.
- The footer disclaimer ("Data is indicatief. Verifieer op locatie.") occupies the same visual weight as the brand name — the brand doesn't dominate its own space.

**How to fix:**
- **Cover page:** Larger brand lockup — wordmark in SatoshiBlack 14pt+ or logo mark if one exists
- **Section headers:** Add light teal background bands (#E8F8F6) behind section titles instead of plain text
- **Footer:** Increase brand name weight/size; consider a small icon/mark next to it
- **Page backgrounds:** Subtle teal tint (#FAFCFC) on premium section backgrounds to distinguish paid content
- **Color accent expansion:** Use TEAL more actively — callout box left borders, section divider accents, pull-quote backgrounds
- **Consistent element:** A branded element that appears on every page beyond the header stripe — e.g., a colored sidebar rule, a section icon system, or a teal accent on page numbers

**Definition of done:**
- [ ] A first-time reader can identify "this is a buurt-check report" from visual design alone (without reading text)
- [ ] Brand presence visible on every page but not overwhelming
- [ ] Visual treatment consistent across all pages
- [ ] Branded elements use Polar Frost design tokens (no hardcoded hex values)
- [ ] At least one visual element beyond the header stripe establishes brand identity

---

## Priority & Impact Matrix

| # | Epic | Story | Severity | Impact | Effort | Data Exists? |
|---|------|-------|----------|--------|--------|---|
| 1 | E1 | S1: Fix shadow render quality | P0 | Critical | Medium | Yes |
| 2 | E1 | S2: Add shadow triptych | P0 | High | Low | Yes |
| 3 | E1 | S3: Add cartographic elements | P0 | Medium | Low | N/A |
| 4 | E2 | S1: Gate export on sunlight | P0 | Critical | Low | Yes |
| 5 | E2 | S2: Extend sunlight submission | P0 | High | Medium | Yes |
| 6 | E3 | S1: Add livability section | P0 | Critical | Medium | Yes |
| 7 | E3 | S2: Render all property warnings | P0 | High | Low | Yes |
| 8 | E4 | S1: Add score scale declaration | P0 | High | Low | N/A |
| 9 | E4 | S2: Relabel city average | P0 | High | Low | N/A |
| 10 | E5 | S1: Add provenance block | P0 | High | Low-Med | Yes |
| 11 | E9 | S2: Add axis, scale, legend to comparison charts | P0 | Critical | Low | N/A (rendering) |
| 12 | E6 | S1: Render crime as risk card | P1 | High | Low | Yes |
| 13 | E6 | S2: Add CBS quartile indicators | P1 | High | Low | Yes |
| 14 | E4 | S3: Add raw measurement rows | P1 | Medium | Low | Yes |
| 15 | E7 | S1: Add static location map | P1 | High | Medium | Can generate |
| 16 | E6 | S4: Specify climate scenario | P1 | Medium | Low | Partially |
| 17 | E6 | S5: Define measurement units | P1 | Medium | Low | Yes |
| 18 | E9 | S1: Make score bars visible (1mm -> 5mm) | P1 | High | Low | N/A (rendering) |
| 19 | E9 | S3: Differentiate comparison bar colors | P1 | High | Low | N/A (rendering) |
| 20 | E9 | S4: Move "Dit adres" to top of charts | P1 | High | Low | N/A (rendering) |
| 21 | E9 | S5: Fix data-ink ratio | P1 | Medium | Medium | N/A (design) |
| 22 | E11 | S1: Eliminate empty pages (40-85% blank) | P1 | High | Medium | N/A (layout) |
| 23 | E11 | S2: Fix orphaned page 3 overflow | P1 | High | Low | N/A (layout) |
| 24 | E11 | S4: Fix MUTED/BORDER contrast failures | P1 | High | Low | N/A (accessibility) |
| 25 | E10 | S3: Remove justified text (word-spacing rivers) | P1 | Medium | Trivial | N/A (rendering) |
| 26 | E10 | S5: Fix number formatting locale | P1 | Medium | Low | N/A (rendering) |
| 27 | E8 | S1: Add executive summary | P2 | Medium | Medium | Can generate |
| 28 | E2 | S3: Sunlight seasonal chart | P2 | Medium | Medium | Yes |
| 29 | E2 | S4: Facade orientation table | P2 | Medium | Medium | Yes |
| 30 | E4 | S4: Add chart legend | P2 | Medium | Low | N/A |
| 31 | E5 | S2: Disclose score formulas | P2 | Medium | Low | Yes |
| 32 | E5 | S3: Complete data sources table | P2 | Low | Low | Yes |
| 33 | E3 | S3: Fix soil section honesty | P2 | Medium | Low | No |
| 34 | E8 | S2: Reduce notes section | P2 | Low | Trivial | N/A |
| 35 | E2 | S5: Disclose sunlight methodology | P2 | Medium | Low | Yes |
| 36 | E9 | S6: Add chart type variety (3+ types) | P2 | Medium | Medium | N/A (design) |
| 37 | E10 | S1: Consolidate 17 type styles to 8 | P2 | Medium | Low | N/A (rendering) |
| 38 | E10 | S2: Reduce line length to 75 chars | P2 | Low | Low | N/A (layout) |
| 39 | E10 | S4: Fix italic fallback (invisible styling) | P2 | Low | Low | N/A (rendering) |
| 40 | E11 | S3: Increase shadow image to 240+ DPI | P2 | Medium | Low | N/A (rendering) |
| 41 | E8 | S3: Promote provenance to WCAG contrast | P2 | Medium | Low | N/A |
| 42 | E6 | S3: Age distribution interpretation | P3 | Low | Low | Yes |
| 43 | E5 | S4: PDF metadata + fonts | P3 | Low | Low | N/A |
| 44 | E8 | S4: Premium content indicator | P3 | Low | Low | N/A |
| 45 | E11 | S5: Strengthen brand presence | P3 | Medium | Medium | N/A (design) |

---

## Phased Delivery Plan

### Phase 1 — Critical content + trust fixes, blocks launch (P0: rows 1-11)

**Epics touched:** E1, E2, E3, E4, E5, E9
**Estimated scope:** 11 stories
**Goal:** The paid dossier contains more content than the free viewer, scores cannot be misinterpreted, charts have basic reading aids, and the report can be audited.

Key deliverables:
- Legible shadow triptych with cartographic elements
- Sunlight analysis always present in paid dossier
- Livability section rendered
- All 5 property warnings rendered
- Comparison charts labeled with score scale declaration + axis + legend
- "City average" relabeled to match actual computation
- Provenance block with report ID, coordinates, identifiers

### Phase 2 — Data enrichment + visual design + accessibility (P1: rows 12-26)

**Epics touched:** E4, E6, E7, E9, E10, E11
**Estimated scope:** 15 stories
**Goal:** Every data point is contextualized, charts are readable and distinct, typography is clean, pages are dense, and contrast meets WCAG AA.

Key deliverables:
- Crime scored + interpreted as risk card
- CBS quartiles shown on every indicator
- Raw measurements + unit definitions on risk detail page
- Static location map
- Climate scenario specified
- Score bars visible at 5mm height (not 1mm hairlines)
- Comparison chart bar colors fully differentiated (all 4 types distinguishable in grayscale)
- "Dit adres" moved to top of every chart (correct reading order)
- Data-ink ratio improved (bars as primary data carriers)
- Pages consolidated — no page > 30% empty
- Orphaned page 3 eliminated
- MUTED/BORDER contrast failures fixed (WCAG AA compliance)
- Justified text removed, number locale formatting fixed

### Phase 3 — Polish, depth, and brand (P2/P3: rows 27-45)

**Epics touched:** E2, E3, E4, E5, E8, E9, E10, E11
**Estimated scope:** 19 stories
**Goal:** The dossier is comprehensive, visually diverse, typographically refined, and stands up to expert scrutiny as a branded professional product.

Key deliverables:
- Executive summary narrative on cover
- Sunlight seasonal chart, SVF gauge, facade table
- Chart legends, score formula disclosure, complete data sources
- Soil section honesty, age interpretation
- 3+ chart type variety (bullet charts, sparklines, radar, gauges)
- Type scale consolidated from 17 to 8 levels
- Line length reduced to 75 chars, italic fallback resolved
- Shadow image at 240+ DPI for print quality
- PDF metadata, premium indicators
- Brand visual identity strengthened beyond header stripe

---

## Codebase Integration Points

**Files to modify for Phase 1 (P0 — content + trust + chart foundations):**
- `frontend/src/components/NeighborhoodViewer3D.tsx` — shadow render quality + cartographic elements
- `frontend/src/components/ExportBottomSheet.tsx` — include all 3 shadows + gate on sunlight
- `backend/app/api/address.py` — fetch livability in `_do_export_briefing`, pass coordinates/IDs
- `backend/app/services/pdf_export.py` — expand `generate_full_dossier` signature, render all property warnings, add provenance block, fix comparison labels, add score scale declaration, add x-axis/gridlines/legend to `draw_comparison_chart()`
- `backend/app/services/scoring.py` — document formulas for methodology text
- `backend/app/models/risk.py` — extend `SunlightSubmission` for expanded payload

**Files to modify for Phase 2 (P1 — design quality + accessibility + layout):**
- `backend/app/services/pdf_export.py` — primary target, 15+ changes:
  - `draw_score_bar()` line 146: `height=1.0` -> `height=5.0` (detail), `height=3.0` (grid)
  - `draw_comparison_chart()` line 163: reorder rows (Dit adres first), replace BORDER bar color, fix dashed rendering, add gridlines at 25/50/75
  - `_COMPARISON_LABELS` line 724: reorder to put "address" first
  - `_draw_risk_details_page()` line 643: add remaining-space calculation before each category to prevent orphaned overflow
  - `_draw_methodology_page()` line 1192: add `align="L"` to `multi_cell()` calls
  - All `multi_cell()` calls across file: audit for justified text, add `align="L"`
  - Color constants lines 28-33: replace MUTED with WCAG-passing color for text usage, add darker neutral for bar fills
  - `_draw_indicator()` line 1133: add locale-aware number formatting
  - Crime section lines 907-962: add locale-aware number formatting
  - Page break logic: add Y-space checks before risk categories
- `frontend/src/components/NeighborhoodViewer3D.tsx` — increase export canvas resolution to 1600x1000+
- `frontend/src/components/ExportBottomSheet.tsx` — deduplicate shadow image (send once, not twice)

**Files to modify for Phase 3 (P2/P3 — polish + variety + brand):**
- `backend/app/services/pdf_export.py` — new chart primitives: `draw_bullet_chart()`, `draw_sparkline()`, `draw_radar_chart()`, `draw_gauge()`; type scale consolidation; section color bands; brand elements
- `BuurtCheckPDF.__init__()` line 75: increase margins from 10mm to 20mm
- `BuurtCheckPDF._register_fonts()` line 82: resolve italic fallback (add true italic or remove usage)
- `BuurtCheckPDF.header()` line 99: expand brand presence (larger wordmark, section color bands)

**Backend models that already have the data (no new data pipelines needed):**
- `PropertyWarningsResponse` — all 5 sub-objects exist (asbestos, foundation, erfpacht, vve, lead_pipe)
- `TierBResponse.crime` — score, severity, meaning, national_per_1000 all computed
- `NeighborhoodStats` — quartile on every indicator
- `SunlightRiskCard` — svf_percent, svf_score stored but not rendered
- `LivabilityResponse` — 5 dimensions, trend, comparison all available

**The dominant pattern across all issues:**
The gap is **not missing data** — it's **missing rendering code AND missing chart design**. The data infrastructure is solid; the PDF layer uses fpdf2's simplest drawing primitives at default settings (1mm bars, no axes, no legends, 10mm margins, justified text, default font sizes). Most P0/P1 items require (a) wiring existing model fields to PDF drawing calls, and (b) upgrading `draw_comparison_chart()` and `draw_score_bar()` from basic rectangles to proper data visualizations.

---

## External Benchmarks Referenced

- **WHO Environmental Noise Guidelines (2018):** Lden thresholds for health impact assessment
- **WHO Global Air Quality Guidelines (2021):** PM2.5 AQG 5 ug/m3, NO2 AQG 10 ug/m3 (annual mean)
- **WCAG 2.2:** 4.5:1 contrast for normal text, 3:1 for non-text graphical elements
- **3DBAG (TU Delft):** Building geometry from BAG + AHN elevation model
- **SunCalc:** Solar position algorithm (azimuth/altitude from date, time, coordinates)
- **NREL SPA:** Solar Position Algorithm — industry reference for high-precision solar azimuth/zenith
- **Klimaateffectatlas:** Dutch climate impact atlas (flood/heat/drought scenarios)
- **Leefbaarometer:** Government neighborhood livability index (5 dimensions, 2002-2024)
- **CBS Wijken & Buurten:** National neighborhood statistics with quartile distributions

---

## Conclusion

The Full Dossier is currently **40% incomplete** as a paid product, carries **two unforced semantic risks** (score-unit ambiguity and misleading baseline labels), has **fundamentally broken data visualizations** (no axes, no scale, no legend, 1mm invisible bars, indistinguishable colors, hero data point buried last), suffers from **typographic inconsistency** (17 styles, mixed locale formatting, invisible italic, justified text rivers), and is **52% empty space** across 7 pages.

Across **11 epics and 45 stories (with 180+ definition-of-done checkboxes)**, the remediation path prioritizes:
1. **Phase 1 (P0):** Make the paid product contain more than the free viewer, eliminate misinterpretation risks, and give comparison charts basic reading aids (axis + scale + legend) — 11 stories
2. **Phase 2 (P1):** Contextualize every data point, make charts readable and distinct (5mm bars, differentiated colors, correct reading order), eliminate empty pages, fix accessibility contrast, and clean up typography — 15 stories
3. **Phase 3 (P2/P3):** Add narrative polish, visual variety (3+ chart types), typographic refinement, print-quality images, methodology depth, and brand presence — 19 stories

The effort is moderate because the data infrastructure already exists. Most P0 and P1 stories require wiring existing backend model fields to existing PDF drawing primitives and adjusting rendering parameters — not building new data pipelines or design systems.
