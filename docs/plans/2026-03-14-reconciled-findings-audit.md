# Buurt Check - Reconciled Findings Audit

**Date:** 2026-03-14
**Method:** Source verification against the current workspace
**Scope:** Backend PDF/chart rendering, property warnings, viewing questions, 3D/sunlight flows, frontend dossier section composition, mounted-card localization, and sentinel validation

This report updates the earlier 17-item audit. Duplicates were merged, weak claims were downgraded or removed, and each retained finding below was verified against the source.

## Summary

| Severity | Count | Notes |
|----------|-------|-------|
| P1 | 16 | Data correctness, misleading summary logic, or missing core user-facing content |
| P2 | 29 | UX inconsistencies, viewer/PDF drift, chart mismatches, and incomplete degraded or bilingual states |
| Total | 45 | Confirmed findings (12 original + 6 second-pass + 2 third-pass + 4 fourth-pass + 3 fifth-pass + 4 sixth-pass + 7 seventh-pass + 3 eighth-pass + 4 ninth-pass) |

Severity mapping in this revision: P1 findings are #1-6, #25, #28-31, #35, and #42-45. All other findings are P2. The later "pass" headings preserve discovery order, not severity.

Primary themes:

- Crime data is still under-threaded in PDF output.
- `AttentionSummary` duplicates summary logic locally and has drifted from the rest of the product.
- The viewer and PDF checklist flows are not fully aligned for crime-related guidance.
- Shortlist items snapshot dossier scores too early and can carry stale or permanently missing comparison data.
- Graceful degradation is incomplete in several components that treat missing data as zero or hide sections silently.
- Chart legend/label colors don't always match the data they represent (age profile, risk grid).
- Raw API values used directly as CSS widths without normalization (TierBSignalsCard crime bars).
- 3D heatmap has an unguarded array access that can produce black patches from NaN vertex colors.
- Sunlight comparison data is computed by the backend but never displayed in the frontend viewer.
- CBS and crime aggregation code can silently underreport partial sub-category data.
- Non-finite raster values can bypass numeric sanitization, be misclassified as real high risk, and even break JSON serialization in risk-card responses.
- Some backend responses intentionally return `message` without full data, but the frontend still drops those states instead of rendering muted fallback cards.
- Tier B crime fallback copy still collapses distinct backend failure and no-data states into the same raw-count explanation.
- Degraded-state contracts exist in backend payloads and design specs, but the 3D viewer and risk tiles do not consistently surface them.
- LaTeX primary rendering path omits crime viewing question augmentation that the fpdf2 fallback includes.
- 3D snapshot capture uses a different emissive color than the interactive viewer for the target building.
- Water risk classification bypasses sentinel validation that heat stress and other WMS-based categories enforce.
- Several dossier sections are still fetched, translated, and tested in isolation, but never mounted in the interactive viewer.
- The app computes sunlight analysis and coverage metadata that are surfaced in export flows or counters, but not shown as buyer-facing dossier content.
- Locale-aware number formatting and bilingual checklist affordances are still incomplete in active dossier and viewer components.
- Crime source dates still leak opaque CBS yearly period codes (`YYYYJJ00`) in active viewer and PDF surfaces.
- The viewer still renders grayscale BRT ground tiles instead of the documented orthophoto imagery.
- The live risk grid still omits the sunlight card and never renders the documented four-card `2x2` layout.
- Export requests still substitute postal `city` for `municipality`, which can change municipality-sensitive property warnings in the PDF only.
- Shadow-analysis evidence is inconsistent across capture, export selection, and LaTeX rendering: the client captures June morning/afternoon views, then the primary PDF path can collapse them to one image while labeling them as seasonal noon analysis.

---

## P1 - High Severity Findings

### 1. Crime summary chart in the PDF does not communicate crime severity correctly

**Affected code**

- `backend/app/services/chart_renderer.py:985-1008`

**Why this is a bug**

The livability row uses severity-aware color mapping and body-size typography. The crime row immediately below it is hard-coded to `C_MUTE_1` gray and uses `TYPE_CAPTION_PT`, which makes a critical crime score look visually similar to a good one and makes the row appear secondary.

This is one issue, not two separate bugs: the wrong color and smaller typography both contribute to the same misleading chart output.

**How to solve it**

1. Compute crime severity from the score with the same helper path used elsewhere in the chart.
2. Replace the hard-coded gray bar fill with `_severity_color(...)`.
3. Promote the crime score and label typography to match the livability row unless there is an explicit product decision to rank it lower.
4. Add a regression test or visual fixture for at least one good crime score and one critical crime score.

**Definition of done**

- A critical crime score renders with the critical severity color.
- A good crime score renders with the good severity color.
- Crime label and score typography match the livability row in the same chart.
- Visual regression coverage exists for the chart output.

---

### 2. Viewing checklist hides backend-generated confirmation questions for good categories

**Affected code**

- `backend/app/services/viewing_questions.py:388-479`
- `frontend/src/components/ViewingChecklist.tsx:25-28`
- `frontend/src/components/ViewingChecklist.test.tsx:59-63`
- `backend/CLAUDE.md:136`

**Why this is a bug**

The backend explicitly generates `QuestionCategory` entries for good-scoring categories so the user still gets lightweight confirmation questions. The frontend then filters those categories out and an existing test locks in that stale behavior.

This contradicts the documented viewing-question bifurcation and means users never see the confirmation prompts the backend is already producing.

**How to solve it**

1. Remove the severity filter that drops `good` categories.
2. Keep the UX readable by ordering categories so flagged ones appear first and good ones appear after them.
3. Update the component tests to expect good-category confirmation questions instead of asserting that they are hidden.
4. Verify the checklist shows a dedicated empty or unavailable state when there are truly no categories.

**Definition of done**

- A dossier with only good categories still renders the checklist with confirmation questions.
- A mixed dossier shows flagged categories first and good categories after them.
- The stale test expectation is removed and replaced with positive coverage for good-category rendering.
- No backend-generated category is silently discarded by the checklist component.

---

### 3. Climate viewing questions can leak the raw string `"unavailable"` into user-facing copy

**Affected code**

- `backend/app/services/viewing_questions.py:167-174`

**Why this is a bug**

`heat_level` and `water_level` are appended when they are truthy. The enum value `"unavailable"` is truthy, so the final text can contain phrases like `heat: unavailable` and `water: unavailable`.

That leaks internal state directly into the checklist instead of presenting a clean unavailable state.

**How to solve it**

1. Treat `RiskLevel.unavailable` as a non-display value in `_climate_questions`.
2. Only include heat and water level strings when the value is meaningful for users.
3. Add a unit test covering both levels set to `"unavailable"`.
4. Keep the rest of the question text intact when those details are omitted.

**Definition of done**

- No climate viewing question renders the literal word `"unavailable"` in English or Dutch.
- Climate questions still render correctly when one level is available and the other is not.
- Tests cover unavailable heat/water combinations.

---

### 4. PDF cover-page key concern box drops the crime summary text

**Affected code**

- `backend/app/services/pdf_export.py:479-537`
- `backend/app/services/pdf_export.py:3128-3135`
- `backend/app/services/pdf_export.py:3514-3541`

**Why this is a bug**

`_risk_concerns()` already accepts `crime_summary`, but the cover-page flow only passes `crime_score`. As a result, crime can appear as a key concern with an empty summary while noise, air quality, and climate concerns include explanatory text.

This makes crime look half-implemented on the most visible PDF page.

**How to solve it**

1. Extract localized crime meaning text from `tier_b.crime.meaning_en` / `meaning_nl` at the cover-page call site.
2. Thread that value through `_draw_cover_page(...)` into `_risk_concerns(...)`.
3. Add PDF-generation coverage for a poor or critical crime case.
4. Confirm the correct language variant is used for EN and NL exports.

**Definition of done**

- Poor or critical crime can appear in the cover-page key concern box with non-empty summary text.
- English exports use `meaning_en`; Dutch exports use `meaning_nl`.
- Existing concern rendering for noise, air quality, climate, and sunlight remains unchanged.

---

### 5. `AttentionSummary` is built from stale local logic instead of a canonical summary source

**Affected code**

- `frontend/src/components/AttentionSummary.tsx:15-38`
- `frontend/src/components/AttentionSummary.tsx:55-56`
- `frontend/src/App.tsx:498-499`
- `frontend/src/App.tsx:2804-2806`
- `backend/app/models/property_warnings.py:48-52`
- `backend/app/services/property_warnings.py:21-60`
- `backend/app/services/property_warnings.py:181-188`

**Why this is a bug**

The app already fetches `propertyWarnings`, which includes an `attention_summary` model, but the UI does not use it. Instead, `AttentionSummary` recomputes a separate local summary from `riskCards` only.

That duplicated logic has drifted in three ways:

- it skips sunlight entirely even though the product models and translations expect four risk categories,
- it hard-codes `total = 3`,
- it cannot represent property-level flags from `propertyWarnings.attention_summary` such as foundation or lead-pipe signals.

There is a second gap behind the same problem: the backend `attention_summary` payload itself is not currently canonical for environmental risks, because `build_attention_summary(...)` is called with all environmental `risk_scores` hard-coded to `None`. That means the frontend cannot simply swap to `propertyWarnings.attention_summary` as-is and call the problem solved.

This is the root cause behind several misleading summary states at the top of the dossier.

**How to solve it**

1. Stop treating `AttentionSummary` as a standalone local calculator.
2. Create one canonical summary builder that merges:
   - four environmental risk categories from `riskCards` (`noise`, `air_quality`, `climate_stress`, `sunlight`),
   - property-level flags from `propertyWarnings.attention_summary`.
3. Ensure the backend `attention_summary` payload is either populated with real environmental scores or explicitly treated as property-only metadata so the contract is honest.
4. Pass the merged result into `AttentionSummary` instead of only `riskCards`.
5. Derive the assessed and total category counts from actual available inputs rather than hard-coding `3`.
6. Add integration coverage for:
   - sunlight-only flagging,
   - property-only flags,
   - mixed environmental and property flags.

**Definition of done**

- `AttentionSummary` can surface sunlight and property-level flags.
- The backend `attention_summary` contract no longer advertises four risk categories while internally carrying none of them.
- Missing-category counts no longer assume only three environmental categories exist.
- The component no longer contains ad hoc summary logic that duplicates another source of truth.
- Tests cover merged summary behavior end to end.

---

### 6. Viewing-question severity fallback can mislabel serious categories as moderate

**Affected code**

- `backend/app/services/viewing_questions.py:379`
- `backend/app/services/viewing_questions.py:406`
- `backend/app/services/viewing_questions.py:434`
- `backend/app/services/viewing_questions.py:462`

**Why this is a bug**

When a category is included because its score is below 70, the severity falls back to `"moderate"` if the card severity is missing. That means a critical or poor score can be shown under the wrong severity label in the checklist.

This is partly masked today because upstream risk-card generation usually sets severity correctly, but the fallback is still wrong and can mislead the user if that upstream field is absent.

**How to solve it**

1. Replace the `"moderate"` fallback with `severity_from_score(score)` when `score` is present.
2. Keep `"good"` only for the explicit good-question branches.
3. Add tests for scores in all four severity buckets with `severity=None`.
4. Leave unavailable categories out rather than inventing a severity.

**Definition of done**

- Score-only categories derive `critical`, `poor`, `moderate`, or `good` correctly from the score.
- No low score can appear as `"moderate"` just because the severity field is missing.
- Regression tests cover all fallback branches.

---

## P2 - Medium Severity Findings

### 7. Compare screen renders unavailable scores as 0% bars

**Affected code**

- `frontend/src/components/CompareScreen.tsx:267-269`
- `frontend/src/components/ui/ScoreBar.tsx:17-40`

**Why this is a bug**

The score text shows `--` for missing data, but the bar still renders with `score ?? 0`, which produces a 0% bar and an unavailable-colored dot. That makes "no data" visually resemble a real score of zero.

**How to solve it**

1. Do not render `ScoreBar` when the score is `null` or `undefined`.
2. Replace it with an explicit unavailable placeholder or empty track.
3. Add a compare-screen test for unavailable metrics.

**Definition of done**

- Missing scores do not render as 0% filled bars.
- The compare card clearly distinguishes unavailable data from a real score of `0`.
- Test coverage exists for unavailable metrics.

---

### 8. Livability card silently hides partial-data sections instead of explaining what is missing

**Affected code**

- `frontend/src/components/LivabilityCard.tsx:89`
- `frontend/src/components/LivabilityCard.tsx:112`
- `frontend/src/components/LivabilityCard.tsx:141`

**Why this is a bug**

When dimensions, trend data, or comparison rows are empty, the card simply removes those sections. Users get a shorter card with no indication whether the section is intentionally absent or temporarily unavailable.

That breaks the product principle of graceful degradation.

**How to solve it**

1. Replace silent omission with subsection-level unavailable copy.
2. Keep the section headers visible when the parent livability response is available but a subsection is missing.
3. Add tests for partial-data livability payloads.

**Definition of done**

- Missing dimensions, trend, or comparison data produces explicit unavailable messaging.
- Users can tell the difference between "no subsection data" and "section not applicable".
- Partial-data states are covered by component tests.

---

### 9. Viewer checklist omits crime questions that the `fpdf2` PDF fallback includes

**Affected code**

- `backend/app/services/viewing_questions.py:360-483`
- `backend/app/services/pdf_export.py:3761-3777`
- `backend/app/services/pdf_export.py:6079`
- `frontend/src/App.tsx:3078-3085`

**Why this is a bug**

The live viewer checklist only renders categories returned by `build_viewing_questions(...)`, which are based on risk cards. The fpdf2 PDF fallback path augments those questions with a crime category via `_with_crime_viewing_questions(...)` at line 6079 before rendering.

That means the viewer omits crime viewing questions. **Note:** Finding #25 (fifth-pass) further reveals that the LaTeX primary rendering path also omits this augmentation, so crime viewing questions currently only appear in fpdf2-generated PDFs — not in the viewer or the primary LaTeX PDFs.

**How to solve it**

1. Decide one canonical checklist composition rule for both viewer and PDF.
2. If crime belongs in the viewing checklist, inject the crime category into the viewer flow the same way it is injected for the PDF.
3. If crime should not belong in the viewer, remove the PDF-only augmentation and document that decision explicitly.
4. Add integration coverage that compares viewer and PDF checklist category composition for entitled users with crime data.

**Definition of done**

- Viewer and PDF checklist category sets are aligned for the same entitled dossier.
- Crime questions either appear in both places or in neither place, by explicit product decision.
- Tests cover the entitled-crime case and prevent viewer/PDF drift.

---

### 10. Neighborhood age bars render missing values as 0%

**Affected code**

- `frontend/src/components/NeighborhoodStatsCard.tsx:63-70`

**Why this is a bug**

The percentage label correctly shows `-` when a band value is missing, but the bar fill still uses `band.value ?? 0`. This creates contradictory signals in the same row.

**How to solve it**

1. Skip the filled bar when the age-band value is missing.
2. Optionally render a neutral unavailable state for the track.
3. Add a test for missing age-band values.

**Definition of done**

- Missing age-band values do not render as 0% bars.
- Text and visual treatment are consistent for unavailable rows.
- Component tests cover at least one missing age band.

---

### 11. `AttentionSummary` disappears completely on risk fetch failure instead of showing an error or fallback state

**Affected code**

- `frontend/src/App.tsx:2797-2806`
- `frontend/src/components/AttentionSummary.tsx:52-53`

**Why this is a bug**

`App.tsx` still mounts the attention-summary section when `riskError` exists, but `AttentionSummary` immediately returns `null` if `riskCards` is absent. So a failed risk-card fetch produces an empty top-of-dossier section with no retry affordance, no fallback summary, and no explanation to the user.

This is a graceful-degradation failure in one of the most visible parts of the dossier.

**How to solve it**

1. Stop letting `AttentionSummary` silently disappear when risk loading fails.
2. Pass explicit loading and error state into the component, or render a parent-level fallback when `riskError` is present.
3. Provide at minimum an explanatory message and retry action.
4. Add a component or integration test for the failed-risk-fetch state.

**Definition of done**

- A risk-card fetch failure produces visible user feedback in the attention-summary region.
- Users have a retry path from that state.
- The top-of-dossier summary area never collapses into empty space when the section is mounted due to an error.
- Test coverage exists for the error path.

---

### 12. Risk summary grid enforces a minimum bar width that exaggerates the lowest scores

**Affected code**

- `backend/app/services/chart_renderer.py:617-618`

**Why this is a bug**

`max(1.2, ...)` guarantees a visible fill even for extremely low scores. That makes a score near zero look materially larger than it really is and distorts the intended score-to-bar mapping at the most critical end of the scale.

**How to solve it**

1. Remove the hard minimum width or replace it with a less misleading visual treatment.
2. If tiny scores need a visible affordance, use a dot or marker that is visually distinct from proportional bar length.
3. Add a visual regression covering low-score cells.

**Definition of done**

- Very low scores no longer look inflated relative to the bar track.
- Any fallback visibility treatment is clearly distinguishable from the proportional bar fill.
- Visual coverage exists for scores near zero.

---

## Addendum — Net-New Findings (Second Pass)

The following findings were identified in a second-pass deep audit of chart rendering, LaTeX templates, frontend comparison components, and the 3D viewer. Each was cross-verified against source code to eliminate false positives.

### 13. TierBSignalsCard crime comparison bars use raw per-1,000 rate as a percentage width

**Affected code**

- `frontend/src/components/TierBSignalsCard.tsx:108`
- `frontend/src/components/TierBSignalsCard.tsx:119`

**Why this is a bug**

The crime comparison bar widths are set to `Math.min(100, data.crime.total_per_1000!)` percent. The value `total_per_1000` is a crime rate (e.g., 52 incidents per 1,000 residents), not a percentage or 0–100 score. The bar accidentally looks plausible for typical Dutch values (20–100 range) but:

- A very safe area at 18/1,000 renders an 18% bar, which looks disproportionately tiny next to the national average bar at 52%.
- A high-crime area at 120/1,000 is clamped to 100%, making it visually identical to 100/1,000.
- The relative proportions between the area bar and the national bar are distorted because the implicit 0–100 scale doesn't match the actual data range (~20–120).
- No `Math.max(0, ...)` lower bound exists, so a negative value (data corruption) would produce negative CSS width.

This is the only chart in the product that uses raw API values directly as percentage widths instead of normalized 0–100 scores.

**How to solve it**

1. Normalize both `total_per_1000` and `nationalRate` to 0–100% relative to a sensible domain (e.g., 0–max(local, national, 100) or the same scoring formula used in `normalize_crime_score()`).
2. Add `Math.max(0, ...)` to prevent negative widths.
3. Add a test for edge-case crime rates (very low, very high, equal to national).

**Definition of done**

- Crime bar widths are proportional to a well-defined scale, not raw per-1,000 rates.
- A rate of 120/1,000 is visually distinguishable from 100/1,000.
- No negative CSS width is possible.
- Test coverage exists for extreme crime rate values.

---

### 14. LaTeX "Comparison Charts" heading can orphan at page bottom

**Affected code**

- `backend/app/services/templates/dossier.tex.j2:73-76`

**Why this is a bug**

The `\Needspace{58mm}` on line 76 protects each chart *inside* the loop, but the section heading on line 74 (`\subsection*{Comparison Charts}`) has no `\Needspace` guard of its own. If less than ~15mm of page space remains when the heading is reached, the heading renders alone at the bottom of one page while all charts start on the next page.

This was already identified in the 2026-03-09 design audit as the "orphaned heading anti-pattern" but was never fixed.

**How to solve it**

1. Add `\Needspace{110mm}` before line 74 to reserve space for both the heading and at least one chart block.
2. Alternatively, attach the heading to the first chart via `\Needspace` that covers heading height + first chart height.

**Definition of done**

- The "Comparison Charts" heading never appears alone at the bottom of a page.
- At least one chart block always follows the heading on the same page.
- Visual regression coverage for a dossier where comparison charts would land at a page break.

---

### 15. PDF age-profile chart renders None values as 0-width bars instead of unavailable state

**Affected code**

- `backend/app/services/chart_renderer.py:864`
- `backend/app/services/chart_renderer.py:876`

**Why this is a bug**

When an age band value is `None`, the code at line 864 converts it to `0.0` and plots a zero-width bar. The text label correctly shows "—" at line 888, but the bar renders at zero width, making the chart row look like a 0% share rather than missing data. This is the PDF-side equivalent of existing Finding 10 (frontend NeighborhoodStatsCard), creating the same contradictory text-vs-bar signal.

**How to solve it**

1. Skip rendering the bar for age bands where the raw value is None.
2. Render the "—" text in the same position but with no bar behind it.
3. Add a chart-generation test for partial age data with one or more None bands.

**Definition of done**

- Missing age-band data produces no bar in the PDF chart.
- The "—" label renders clearly without a misleading zero-width bar.
- Chart tests cover partial age data.

---

### 16. PDF age-profile legend color does not match bar color

**Affected code**

- `backend/app/services/chart_renderer.py:876` (bars use `C_ACCENT` = `#2EC4B6`)
- `backend/app/services/chart_renderer.py:906` (legend uses `C_ACCENT_DARK` = `#187E76`)

**Why this is a bug**

The "This neighborhood" bars are rendered in Arctic Teal (`C_ACCENT`, #2EC4B6), but the legend text for "This neighborhood" / "Deze buurt" is colored `C_ACCENT_DARK` (#187E76). Users cannot visually match the legend to the bars because the colors are noticeably different — one is a bright teal, the other a darker forest teal.

In contrast, the "Netherlands" legend correctly matches its bars: both use `C_MUTE_2` / `C_REFERENCE` gray tones.

**How to solve it**

1. Change the legend text color at line 906 from `C_ACCENT_DARK` to `C_ACCENT` to match the bar fill.
2. If `C_ACCENT` fails WCAG contrast on the chart background, use `C_ACCENT_TEXT` (#1C8C83) for both the bar and legend, per the design rules.

**Definition of done**

- Legend text color matches the corresponding bar fill color.
- WCAG AA contrast is maintained for legend text on the chart background.

---

### 17. PDF risk grid category labels use low-contrast gray on light background

**Affected code**

- `backend/app/services/chart_renderer.py:584-592`

**Why this is a bug**

Category labels (e.g., "NOISE", "AIR QUALITY") are rendered in `C_MUTE_1` (#B4C0CE) on a `C_TILE_BG` (#F8F9FA) background. The contrast ratio between these two colors is approximately 1.6:1, which fails WCAG AA (requires 4.5:1 for normal text, 3:1 for large text). These labels are essential information — they identify which risk category each tile represents — so they cannot be treated as decorative.

**How to solve it**

1. Change the category label color to `C_REFERENCE` (#637892) which provides adequate contrast on #F8F9FA.
2. Alternatively use `C_PRIMARY` (#1C2D3F) for maximum legibility.
3. Add a contrast ratio check to chart renderer tests.

**Definition of done**

- Category labels meet WCAG AA contrast ratio (minimum 3:1 for the uppercase large-text rendering, preferably 4.5:1).
- Labels are clearly legible when printed.

---

### 18. 3D heatmap vertex colors corrupt to black when `perPointAnnual` array index is out of bounds

**Affected code**

- `frontend/src/components/NeighborhoodViewer3D.tsx:674-676`
- `frontend/src/utils/heatmapColors.ts:28-35`

**Why this is a bug**

The heatmap coloring loop retrieves sun-hours for each vertex via `perPointAnnual[nearest.index]`. If `nearest.index` exceeds the array length (which can happen when the KD-tree returns an index from a differently-sized point cloud), `sampleHours` is `undefined`. This `undefined` is passed to `sunHoursToColor()`, which computes `(undefined - min) / span` → `NaN`. The NaN propagates through all RGB components and is written to the Three.js color buffer via `colors.setXYZ(i, NaN, NaN, NaN)`.

Three.js renders NaN vertex colors as black, producing black patches on the heatmap that look like rendering artifacts. The bug is silent — no console error, no fallback color.

**How to solve it**

1. Add a bounds check before using `sampleHours`: if undefined or non-finite, use a neutral fallback color.
2. Add a `Number.isFinite()` guard in `sunHoursToColor()` as defense-in-depth.
3. Add a test for mismatched point cloud sizes.

**Definition of done**

- Out-of-bounds array access produces a neutral/fallback vertex color, not black.
- `sunHoursToColor()` validates its input and returns a safe fallback for non-finite values.
- No NaN values can reach the Three.js color buffer.

---

## Third-Pass Findings

### 19. Frontend sunlight comparison data is never displayed — backend data is wasted

**Affected code**

- `frontend/src/App.tsx:2440-2460` (`buildComparisons` function)
- `frontend/src/App.tsx:2466-2508` (`getDetailProps` function)
- `frontend/src/components/RiskTilesGrid.tsx:26-51`
- `backend/app/services/risk_comparisons.py:136` (sunlight comparisons ARE generated)

**Why this is a bug**

The backend generates `riskComparisons.sunlight` containing address-vs-city-vs-NL-vs-daylight-target comparison rows (confirmed at `risk_comparisons.py:136`). However:

1. `RiskTilesGrid` only renders 3 tiles (noise, air, climate) — sunlight has no tile and therefore no tap-to-expand detail view.
2. `buildComparisons()` maps `'noise'` → `riskComparisons.noise`, `'air'` → `.air_quality`, `'climate'` → `.climate_stress`, and falls through to `[]` for everything else. Sunlight comparisons are never extracted.
3. `getDetailProps()` returns `null` for the `default` case, meaning even if sunlight were tapped, no detail view with comparisons would render.

The backend computes and transfers this data on every dossier fetch. The PDF path DOES render sunlight comparisons (via `_build_risk_detail_data` which reads all four categories). So the frontend viewer never shows sunlight comparison bars that the PDF includes, creating a viewer-vs-PDF information gap.

**How to solve it**

1. Either add a sunlight tile to `RiskTilesGrid` with a `getDetailProps('sunlight')` case and a `buildComparisons('sunlight')` mapping to `riskComparisons.sunlight`, or
2. Display sunlight comparisons in the existing sunlight section of the dossier (near the 3D viewer / shadow panels), or
3. If sunlight comparisons are intentionally frontend-only omissions, stop generating them in the backend to avoid wasted computation and bandwidth.

**Definition of done**

- Sunlight comparison data is either displayed in the frontend viewer or no longer computed/transferred.
- Viewer and PDF show consistent comparison data for all four risk categories.

---

### 20. CBS age profile silently underreports when one sub-band is a sentinel but the other is valid

**Affected code**

- `backend/app/services/cbs.py:106-112`

**Why this is a bug**

The age aggregation at line 108 uses `(age_0_14 or 0.0) + (age_15_24 or 0.0)`. When only one sub-band has valid data (e.g., `age_0_14 = 18.0`) and the other is `None` (sentinel value from CBS), the sum becomes `18.0 + 0.0 = 18.0` instead of being flagged as incomplete. This underreports the 0–24 age group — the chart shows 18% when the real value should be higher (the 15–24 band was missing, not zero).

The same pattern applies to the 25–64 group at lines 110–112.

The downstream impact is that age profile charts (both frontend NeighborhoodStatsCard and PDF `render_age_distribution`) display these underreported totals as though they are complete, with no visual indicator that one sub-band was missing. This is especially misleading because the bars are rendered proportionally — an underreported 18% bar looks materially different from a correct ~28% bar.

**How to solve it**

1. Mark the aggregated band as `None` when any contributing sub-band is `None`, rather than substituting 0.0.
2. Alternatively, keep the partial sum but annotate the `AgeProfile` with a `partial` flag per band, and render a visual indicator (e.g., hatched bar or asterisk) downstream.
3. Add a test where one sub-band in a group is a sentinel to verify the aggregation behavior.

**Definition of done**

- An age group with one missing sub-band either shows as unavailable or is visually distinguished from a complete band.
- Charts downstream (frontend and PDF) never display a partial sum as though it were a complete one.
- Tests cover the partial-sub-band scenario.

---

## Fourth-Pass Findings

### 21. Neighborhood stats section drops valid CBS fallback responses and leaves an empty shell

**Affected code**

- `backend/app/services/cbs.py:327-342`
- `backend/app/models/neighborhood.py:43-48`
- `frontend/src/App.tsx:3029-3037`
- `frontend/src/components/NeighborhoodStatsCard.tsx:112`
- `frontend/src/components/NeighborhoodStatsCard.test.tsx:51-60`
- `docs/design-prd.md:867`

**Why this is a bug**

The CBS service intentionally returns successful `NeighborhoodStatsResponse` objects with `stats=None` and a `message` when no buurt match is found or parsing fails. The dossier still mounts the neighborhood section for that response, but `NeighborhoodStatsCard` immediately returns `null` when `stats?.stats` is missing.

The result is a visible section header with no card body, even though the backend supplied a valid degraded-state response. This directly conflicts with the product requirement to show a muted info card when neighborhood statistics are not yet available.

**How to solve it**

1. Add an explicit unavailable-state branch in `NeighborhoodStatsCard` for responses that exist but have `stats=None`.
2. Map backend message codes such as `CBS_NO_BUURT_FOUND` and `CBS_PARSE_FAILED` to localized user-facing copy.
3. Keep retry UI for transport errors only; message-only responses should render as informational fallback cards, not disappear.
4. Replace the current empty-DOM test expectation with positive coverage for the muted fallback state.

**Definition of done**

- A successful CBS response with `stats=None` renders a visible fallback card instead of empty space.
- The fallback copy is localized and explains that statistics are unavailable for this neighborhood.
- The dossier no longer shows a neighborhood section header with a blank body.
- Tests cover `CBS_NO_BUURT_FOUND` and at least one other message-only response.

---

### 22. Viewing checklist has no empty or unavailable state when the backend returns zero categories

**Affected code**

- `backend/app/services/viewing_questions.py:365-483`
- `frontend/src/App.tsx:3062-3086`
- `frontend/src/components/ViewingChecklist.tsx:25-47`
- `backend/app/services/pdf_export.py:6105-6128`

**Why this is a bug**

`build_viewing_questions(...)` can legitimately return a successful response with `categories=[]`. The viewer currently treats that as "render nothing": `App.tsx` only mounts the action section when `categories.length > 0` or an error exists, and `ViewingChecklist` also returns `null` if no categories remain.

That means a successful but empty checklist response removes the entire on-screen section instead of showing a graceful fallback. The PDF flow already handles this case with an explicit unavailable box, so the viewer and export diverge again.

**How to solve it**

1. Mount the viewing-checklist region whenever the viewing-questions fetch completes successfully, even if `categories` is empty.
2. Add a dedicated empty or unavailable state to `ViewingChecklist` for zero-category responses.
3. Keep the empty-state logic separate from the "show good categories" fix so the component does not regress back to returning `null`.
4. Add tests for a successful zero-category response and viewer/PDF parity for the unavailable case.

**Definition of done**

- A successful zero-category response renders a visible fallback state instead of removing the section.
- The action phase remains present when the backend returns no viewing questions.
- Viewer and PDF both provide explicit fallback messaging when questions are unavailable.
- Tests cover the zero-category path.

---

### 23. 3D viewer suppresses backend partial-data and missing-target messages

**Affected code**

- `backend/app/services/three_d_bag.py:882-900`
- `frontend/src/types/api.ts:95-100`
- `frontend/src/App.tsx:2967-3001`
- `frontend/src/components/NeighborhoodViewer3D.tsx:86-100`

**Why this is a bug**

The backend already computes `Neighborhood3DResponse.message` for degraded-but-usable states such as partial surrounding-building coverage and "Target building not found in 3D data". The frontend type preserves that field, but the dossier never renders it.

If `buildings.length > 0`, the viewer is shown with no warning at all. If `buildings.length === 0`, the UI falls back to a generic no-data message. Users therefore never learn that the 3D scene is partial or that the highlighted target building could not be identified.

**How to solve it**

1. Thread `neighborhood3D.message` through the dossier section into the viewer UI.
2. Replace raw backend English strings with stable message codes plus localized frontend copy, or localize the messages server-side before exposing them.
3. Render the degraded-state note inline above or below the 3D viewer when buildings are still available.
4. Add tests for both partial-neighborhood and missing-target responses.

**Definition of done**

- Partial 3D coverage is explicitly disclosed to the user when the viewer still renders.
- Missing-target cases produce visible explanatory copy instead of silently falling back to a generic scene.
- No degraded 3D state is hidden just because `buildings.length > 0`.
- Tests cover both degraded-but-usable response shapes.

---

### 24. Unavailable risk tiles do not follow the degraded-state contract

**Affected code**

- `backend/app/services/risk_cards.py:543-776`
- `frontend/src/components/RiskTilesGrid.tsx:29-49`
- `frontend/src/components/RiskTile.tsx:18-50`
- `frontend/src/App.tsx:930-939`
- `docs/design-prd.md:805`
- `docs/design-spec.md:2294-2310`

**Why this is a bug**

The backend already emits unavailable and timeout states for risk cards, but the tile grid does not surface them as a dedicated degraded state. `RiskTilesGrid` never passes summary text into `RiskTile`, unavailable tiles still render as interactive buttons, and the tap handler still opens the detail view for entitled users.

That conflicts with the current design contract, which requires unavailable tiles to show "Data temporarily unavailable", hide the normal detail affordances, and disable tap behavior. The current UI therefore presents unavailable data as if a normal detail card still exists behind it.

**How to solve it**

1. Pass per-card unavailable state and summary text into `RiskTile`.
2. Render a dedicated unavailable variant with muted copy, no normal severity badge, and no chevron-style affordance.
3. Disable tile tap behavior when the card is unavailable.
4. Add tests for unavailable or timeout states for noise, air, and climate tiles.

**Definition of done**

- Unavailable risk tiles show explicit unavailable copy instead of an empty placeholder state.
- Users cannot open a normal risk-detail flow from an unavailable tile.
- The tile presentation matches the documented degraded-state contract.
- Tests cover unavailable risk-card rendering and disabled interaction.

---

## Fifth-Pass Findings

### 25. LaTeX full dossier viewing questions lack crime augmentation (primary path gap)

**Affected code**

- `backend/app/services/pdf_export.py:2941` (LaTeX path passes raw `viewing_questions`)
- `backend/app/services/pdf_export.py:6079` (fpdf2 path calls `_with_crime_viewing_questions`)
- `backend/app/services/pdf_export.py:3761-3778` (`_with_crime_viewing_questions` definition)

**Why this is a bug**

The fpdf2 fallback path calls `_with_crime_viewing_questions(viewing_questions, tier_b_data)` at line 6079 before rendering the checklist page. This injects crime-specific viewing questions (e.g., "Ask about break-in history") when tier_b crime data is available.

The LaTeX primary rendering path at line 2941 passes `viewing_questions=_model_to_dict(viewing_questions)` to `render_dossier()` **without** calling `_with_crime_viewing_questions()` first. The dossier.tex.j2 template renders whatever categories it receives, so crime viewing questions never appear in LaTeX-generated PDFs.

Since LaTeX is the primary rendering path (fpdf2 is the fallback), the majority of PDF dossiers lack crime viewing questions. This means the mismatch described in Finding #9 is narrower than it first appears: the augmentation exists only in `fpdf2` output, not in LaTeX.

**How to solve it**

1. Call `_with_crime_viewing_questions(viewing_questions, tier_b)` in `_generate_full_dossier_latex()` before passing viewing_questions to `render_dossier()`.
2. Verify the augmented questions render correctly in the LaTeX template's viewing checklist section.
3. Add a test that generates a LaTeX dossier with crime data and asserts the crime category appears in the rendered viewing questions.

**Definition of done**

- LaTeX-generated dossiers include crime viewing questions when tier_b crime data is available.
- Both rendering paths produce equivalent checklist content for the same input data.
- Test coverage exists for the LaTeX crime-augmented checklist.

---

### 26. 3D viewer snapshot capture uses wrong emissive color for target building

**Affected code**

- `frontend/src/components/NeighborhoodViewer3D.tsx:1021` (snapshot: `emissive: 0x59DCD0`)
- `frontend/src/components/NeighborhoodViewer3D.tsx:1368` (interactive: `emissive: 0x57D4C8`)
- `frontend/src/styles/tokens.css:60` (`--teal-300: #57D4C8`)

**Why this is a bug**

The interactive viewer creates the target building material at line 1368 with `emissive: 0x57D4C8`, which matches the design token `--teal-300`. However, the snapshot capture path (used to generate the 3D viewer image for PDF export) at line 1021 uses `emissive: 0x59DCD0` — a different, slightly brighter teal.

This means the target building in PDF dossier snapshots has a visibly different glow color than what users see in the interactive viewer. The emissive intensity also differs: 0.55 in the snapshot vs 0.40 (light mode) in the interactive path.

**How to solve it**

1. Change line 1021 from `0x59DCD0` to `0x57D4C8` to match the design token.
2. Extract the emissive color to a named constant alongside `TARGET_COLOR` to prevent future drift.
3. Review the emissive intensity difference (0.55 vs 0.40) and decide whether the snapshot should match the interactive viewer or intentionally boost for print clarity.

**Definition of done**

- Snapshot and interactive paths use the same emissive color value.
- The emissive color value matches the design token `--teal-300` (#57D4C8).
- The value is defined as a named constant to prevent future inconsistency.

---

### 27. Water risk classification bypasses sentinel validation used by all other climate sub-classifiers

**Affected code**

- `backend/app/services/risk_cards.py:478-525` (`_classify_water_from_properties`)
- `backend/app/services/risk_cards.py:313-324` (`_sanitize_raster_value`)
- `backend/app/services/risk_cards.py:430` (heat stress uses `_sanitize_raster_value`)

**Why this is a bug**

The heat stress classifier at line 430 calls `_sanitize_raster_value(float(value), min_value=0.0)` to reject sentinel values (-999, -9999, >=1e30) before interpreting numeric data. The noise and air quality classifiers similarly call this function.

However, `_classify_water_from_properties()` at lines 478-525 does NOT call `_sanitize_raster_value()` for any of its numeric property checks: `klasse_*` (line 482), `overstromi*` (line 493), `GRIDCODE` (line 511), or `ror` (line 519). All values pass directly through `isinstance(value, (int, float))` into threshold comparison.

If a sentinel value (-999) enters any of these branches:

- `klasse` field: -999 passes `klasse <= 1` → returns `RiskLevel.low` (should be unavailable)
- `overstromi` field: -999 passes `numeric <= 0` → returns `RiskLevel.low` (should be unavailable)
- `GRIDCODE` field: -999 passes `grid <= 1` → returns `RiskLevel.low` (should be unavailable)
- `ror` field: -999 passes `ror <= 2` → returns `RiskLevel.low` (should be unavailable)

While WFS vector features are less likely to contain raster-style sentinels than WMS responses, the inconsistency creates an unguarded data path. Every other climate sub-classifier validates numeric input; this one does not.

**How to solve it**

1. Apply `_sanitize_raster_value()` to each numeric extraction in `_classify_water_from_properties()` before threshold comparison.
2. If sanitization returns None, skip to the next property key (same pattern used in heat classification).
3. Add a test passing sentinel values (-999, 1e30) through water classification to verify they produce `RiskLevel.unavailable`.

**Definition of done**

- Sentinel values in water risk WFS properties produce `RiskLevel.unavailable`, not `RiskLevel.low`.
- All numeric extraction paths in `_classify_water_from_properties()` validate input.
- Tests cover sentinel values in at least two of the four extraction branches.

---

## Sixth-Pass Findings

### 28. Property warnings are fetched and counted, but never rendered in the dossier

**Affected code**

- `frontend/src/App.tsx:1249-1284`
- `frontend/src/App.tsx:1596-1613`
- `frontend/src/App.tsx:2553-2558`
- `frontend/src/App.tsx:2853-2919`
- `frontend/src/components/PropertyWarningsCard.tsx:29-176`
- `backend/app/services/templates/dossier.tex.j2:222-347`
- `docs/design-spec.md:499`

**Why this is a bug**

The app fetches `propertyWarnings`, auto-retries it, and includes it in the coverage summary. The component that renders foundation risk, erfpacht, VvE, and asbestos warnings still exists and is fully tested.

But the dossier screen never mounts `PropertyWarningsCard`. The house phase jumps from `BuildingFactsCard` directly to risk tiles, so entitled users never see the property-warning content the backend fetched and the PDF export still renders.

This is a major viewer/PDF and state/UI mismatch: the coverage strip can count property warnings as loaded even though the user has no way to see them in the interactive dossier.

**How to solve it**

1. Add a dedicated property-warnings section back into the house phase of `App.tsx`.
2. Pass `propertyWarnings`, `propertyWarningsLoading`, `propertyWarningsError`, and the retry handler into `PropertyWarningsCard`.
3. Render a locked section for non-entitled users if property warnings remain premium content.
4. Add integration coverage for loaded, loading, error, and locked states.

**Definition of done**

- Entitled users can see property warnings in the interactive dossier.
- Loading and error states for property warnings are visible and actionable.
- The coverage summary no longer counts invisible property-warnings data as loaded.
- Tests cover the section mount and retry path.

---

### 29. Soil & Pipes section is missing from the dossier, hiding lead-pipe guidance

**Affected code**

- `frontend/src/components/SoilInfoCard.tsx:10-60`
- `frontend/src/App.tsx:2853-2919`
- `frontend/src/i18n/en.json:565-578`
- `frontend/src/i18n/nl.json:565-578`
- `backend/app/services/pdf_export.py:5826-5865`
- `docs/design-spec.md:545`

**Why this is a bug**

`SoilInfoCard` exists, has translations in both languages, and includes the lead-pipe warning sub-section that should appear when pre-1960 construction is flagged. The PDF export also renders a soil section.

But the main dossier never imports or renders `SoilInfoCard`. That means users do not see the soil due-diligence guidance, the Bodemloket link, or any lead-pipe warning in the interactive viewer.

This removes an explicitly documented house-phase section and creates another viewer/PDF inconsistency.

**How to solve it**

1. Mount `SoilInfoCard` in the house phase, ideally after property warnings.
2. Feed it `leadPipeFlagged` and `constructionYear` from `propertyWarnings.lead_pipe` and/or `buildingResponse`.
3. Render a locked state for non-entitled users if the section is premium.
4. Add integration tests for both the base soil card and the lead-pipe warning variant.

**Definition of done**

- The dossier shows the Soil & Pipes section in the house phase.
- Pre-1960 properties surface the lead-pipe warning in the interactive viewer.
- Viewer and PDF both include soil guidance for the same report.
- Tests cover the mounted section and lead-pipe flag behavior.

---

### 30. Sunlight analysis and shadow snapshots are computed, but never shown in the dossier

**Affected code**

- `frontend/src/App.tsx:509-514`
- `frontend/src/App.tsx:2987-3010`
- `frontend/src/App.tsx:3270-3273`
- `frontend/src/components/SunlightRiskCard.tsx:50-110`
- `frontend/src/components/ShadowSnapshots.tsx:22-90`
- `docs/design-prd.md:787-805`
- `docs/design-spec.md:856-873`

**Why this is a bug**

The app stores `sunlight` and `shadowSnapshots` in dossier state. `NeighborhoodViewer3D` actively computes both via `onSunlightAnalysis` and `onShadowSnapshots`, and the export flow consumes them when generating the dossier.

But the interactive dossier never renders `SunlightRiskCard` or `ShadowSnapshots`, and the 3D viewer does not expose the specified sunlight summary badge that should open the sunlight card. Buyers therefore never see the sunlight analysis they waited for, even though the app computed it successfully.

This is broader than Finding #19: not only are sunlight comparison rows wasted, the entire computed sunlight section is missing from the dossier UI.

**How to solve it**

1. Add a sunlight section to the neighborhood phase that renders `SunlightRiskCard` for loading, unavailable, and success states.
2. Render `ShadowSnapshots` when snapshot images are available.
3. Add a sunlight summary badge or equivalent CTA in the 3D viewer that opens or scrolls to the sunlight section.
4. Add integration tests for successful sunlight analysis, unavailable sunlight, and snapshot rendering.

**Definition of done**

- Buyers can see the computed sunlight analysis in the interactive dossier.
- Shadow snapshots appear in the viewer flow when available.
- Unavailable sunlight states render a visible fallback card instead of disappearing into export-only logic.
- Tests cover success, failure, and snapshot-visible states.

---

### 31. Summary strip risk pills are fully built but never mounted

**Affected code**

- `frontend/src/components/SummaryStrip.tsx:7-64`
- `frontend/src/App.tsx:2810-2850`
- `docs/design-prd.md:388-417`
- `docs/design-spec.md:602-620`

**Why this is a bug**

`SummaryStrip` exists as a dedicated component, has category icons including sunlight, and has its own tests and i18n pill labels. However, `App.tsx` never imports or renders it anywhere in the dossier.

Users therefore lose the top-of-dossier quick-scan risk pills and their tap targets, even though the rest of the architecture still assumes this summary surface exists. The address header currently renders a coverage strip instead, which is operational metadata rather than the risk summary specified in the product docs.

**How to solve it**

1. Build a pill array from the current risk scores plus sunlight when available.
2. Render `SummaryStrip` under the address header.
3. Wire pill taps to open the correct risk detail or scroll to the sunlight section.
4. Add an integration test asserting the pills match the underlying scores.

**Definition of done**

- The dossier shows the risk summary strip beneath the address header.
- Pill values match the underlying risk-card data.
- Sunlight is included when sunlight analysis is available.
- Tapping a pill navigates to the correct detail surface.

---

## Seventh-Pass Findings

### 32. Viewing checklist never exposes the alternate-language translations already present in the payload

**Affected code**

- `frontend/src/components/ViewingChecklist.tsx:22-74`
- `frontend/src/components/ViewingChecklist.test.tsx:58-107`
- `docs/design-prd.md:478-485`
- `docs/design-spec.md:1213-1217`

**Why this is a bug**

The checklist payload already carries both `text_en` and `text_nl` for every question, and the design contract explicitly requires a collapsible `Show in Dutch` / `Show in English` affordance so buyers can show the alternate language to a seller or agent during a viewing.

The current component chooses exactly one string with `const text = isNl ? q.text_nl : q.text_en` and discards the other. There is no per-group toggle, no alternate-language reveal, and the existing tests only assert single-language rendering.

That breaks the product's bilingual-by-default promise and fails the documented success criterion that checklist translations must be accessible in both languages from the same viewing flow.

**How to solve it**

1. Add a per-group toggle that reveals the alternate-language version of each question under the primary-language list.
2. Keep the current app language as the default visible text, with the alternate language collapsed by default.
3. Add tests for both EN -> NL and NL -> EN toggle behavior.
4. Verify checkbox state remains stable when the alternate-language copy is expanded or collapsed.

**Definition of done**

- Each checklist group offers a visible alternate-language affordance.
- Buyers can reveal Dutch text from an English session and English text from a Dutch session.
- The alternate text comes from the existing backend payload, not a second fetch.
- Tests cover the bilingual toggle in both locales.

---

### 33. Mounted neighborhood and crime cards format numbers with the wrong locale

**Affected code**

- `frontend/src/components/NeighborhoodStatsCard.tsx:35-39`
- `frontend/src/components/NeighborhoodStatsCard.tsx:69-80`
- `frontend/src/components/NeighborhoodStatsCard.test.tsx:80-91`
- `frontend/src/components/TierBSignalsCard.tsx:14-22`
- `frontend/src/components/TierBSignalsCard.tsx:111-142`
- `frontend/src/components/TierBSignalsCard.test.tsx:27-67`

**Why this is a bug**

The app is explicitly bilingual, but two mounted dossier cards ignore the active locale when formatting numbers:

- `NeighborhoodStatsCard` hard-codes `nl-NL` for euro values, so English UI still shows Dutch punctuation such as `€520.000` instead of `€520,000`.
- The same card renders other indicator values and age percentages via raw string interpolation, so Dutch UI keeps English-style decimals like `0.8 km` instead of `0,8 km`.
- `TierBSignalsCard` uses `toFixed(1)` for per-1,000 crime rates and comparison values, so Dutch users see `12.5` rather than `12,5`.

The existing neighborhood test suite even locks in the Dutch thousands separator while running under English. This is user-facing formatting drift in active dossier content, not just a cosmetic test issue.

**How to solve it**

1. Centralize locale-aware number formatting with `Intl.NumberFormat` keyed off the current i18n language.
2. Use that helper for currency, percentages, distances, and crime-rate decimals in mounted cards.
3. Update the English and Dutch component tests to assert locale-appropriate separators.
4. Audit nearby mounted components for similar raw-number rendering before closing the issue.

**Definition of done**

- English and Dutch dossier cards display different separators when the locale requires it.
- Currency, percentage, distance, and crime-rate values all follow the active language.
- The stale English test expectation for Dutch currency formatting is removed.
- Tests cover both locales for the affected mounted cards.

---

### 34. Violent crime aggregation silently converts `None` sub-categories to `0.0`

**Affected code**

- `backend/app/services/tier_b.py:258-263`
- `frontend/src/components/TierBSignalsCard.tsx:127-143`

**Why this is a bug**

The violent-crime total is built with `sum(v or 0.0 for v in violent_entries)`. That silently converts suppressed or missing CBS sub-categories from `None` to `0.0`.

If one violent-crime component is present and another is suppressed, the total is underreported but still presented as complete data. For example, `5.0 + None` becomes `5.0` instead of surfacing that the violent-crime total is partial or unavailable.

This is the same failure mode already confirmed for CBS age-band aggregation in Finding #20: partial data is silently turned into a complete-looking total.

**How to solve it**

1. Treat any `None` entry in `violent_entries` as partial data instead of summing it as zero.
2. Either return `None` for the aggregate or add an explicit `partial` flag to the crime model and UI.
3. Add a unit test where one violent-crime sub-category is present and another is suppressed.
4. Ensure the frontend copy distinguishes partial or unavailable violent-crime totals from true zero values.

**Definition of done**

- Violent-crime totals built from partial CBS data are not displayed as complete values.
- Missing sub-categories no longer default to `0.0` in the aggregate.
- Tests cover the mixed `float` + `None` case.

---

### 35. NaN raster values bypass sanitization, can be misclassified as high risk, and can break JSON serialization

**Affected code**

- `backend/app/services/risk_cards.py:120-125`
- `backend/app/services/risk_cards.py:294-306`
- `backend/app/services/risk_cards.py:313-323`
- `backend/app/services/risk_cards.py:430`
- `backend/app/services/risk_cards.py:555`
- `backend/app/services/risk_cards.py:600-618`

**Why this is a bug**

Both numeric helper paths only reject sentinel bounds; they do not reject non-finite values. `_extract_numeric(...)` accepts `float('nan')`, `_sanitize_raster_value(...)` returns that NaN unchanged, and `_risk_from_threshold(...)` then falls through to `RiskLevel.high` because all `<=` comparisons against NaN are false.

That means corrupt WMS/WFS payloads can be reported as severe real-world risk instead of unavailable. The same NaN can also propagate into rounded numeric fields (`lden_db`, `pm25_ug_m3`, `no2_ug_m3`, climate values), which is a data-correctness problem rather than a cosmetic one.

It is also a transport bug: FastAPI / Starlette JSON serialization rejects `NaN` as non-compliant JSON, so an un-sanitized non-finite value can turn a risk-card response into a `500` instead of a degraded unavailable state.

This behavior was reproduced directly in the current workspace:

- `_sanitize_raster_value(float('nan'), min_value=0.0)` returns `nan`
- `_extract_numeric({'GRAY_INDEX': float('nan')})` returns `(nan, 'GRAY_INDEX')`
- `_risk_from_threshold(float('nan'), 53.0, 63.0)` returns `RiskLevel.high`

**How to solve it**

1. Reject non-finite values in both `_extract_numeric(...)` and `_sanitize_raster_value(...)` via `math.isfinite(...)`.
2. Add a defensive non-finite guard to `_risk_from_threshold(...)` or its callers so invalid values cannot silently map to `high`.
3. Add regression tests for `NaN`, `inf`, and `-inf` across noise, air, and climate sampling paths.

**Definition of done**

- Non-finite raster values are treated as unavailable, not high risk.
- No NaN or infinity value can reach serialized risk-card numeric fields.
- Tests cover non-finite values in at least two WMS-based risk builders.

---

### 36. 3D viewer still uses grayscale BRT ground tiles instead of the documented orthophoto imagery

**Affected code**

- `frontend/src/components/NeighborhoodViewer3D.tsx:1573`
- `docs/design-prd.md:509`
- `docs/design-prd.md:523`
- `docs/design-prd.md:608-609`

**Why this is a bug**

The product spec describes the 3D viewer as using orthophoto-based ground context, with "ground orthophoto visible" on first render. The live viewer instead loads grayscale BRT WMTS tiles:

- `https://service.pdok.nl/brt/achtergrondkaart/.../grijs/...`

That removes the aerial ground context the viewer is supposed to provide and makes the live 3D scene materially different from the documented product. It also weakens client-side export snapshots because they are captured from the same scene.

**How to solve it**

1. Replace the grayscale BRT ground tiles with the intended orthophoto tile source.
2. Keep attribution and fallback behavior explicit if orthophoto tiles are unavailable.
3. Re-test light and dark themes so contrast adjustments do not wash out the imagery.
4. Update any screenshots or visual-regression baselines that currently assume grayscale ground tiles.

**Definition of done**

- The viewer ground plane uses orthophoto imagery in the normal path.
- First-render visuals match the documented "ground orthophoto visible" requirement.
- Client-side snapshots show the same orthophoto ground context.

---

### 37. 3D heatmap legend ignores the active locale for decimal hour labels

**Affected code**

- `frontend/src/components/HeatmapLegend.tsx:17-32`
- `frontend/src/components/HeatmapLegend.test.tsx:35-48`
- `frontend/src/components/NeighborhoodViewer3D.tsx:2070-2073`

**Why this is a bug**

`HeatmapLegend` is mounted in the active 3D viewer, but its `formatHours()` helper uses `rounded.toFixed(1)` and `String(rounded)` directly. That means Dutch users still see English-style decimals such as `1.2h` instead of `1,2h`.

The existing test suite only verifies the translated title, not the numeric label formatting, so the locale bug is invisible to coverage. This is the same bilingual contract drift already confirmed in mounted dossier cards, but on an always-visible viewer control.

**How to solve it**

1. Format heatmap hour labels with `Intl.NumberFormat` using the active i18n language.
2. Reuse the same locale-aware number helper adopted for other mounted components so viewer labels stay consistent with dossier cards.
3. Add EN and NL tests that assert different decimal separators when `minHours` or `maxHours` include fractional values.

**Definition of done**

- Dutch heatmap labels render fractional hours with a comma.
- English heatmap labels render fractional hours with a dot.
- Tests cover fractional min/max labels in both locales.

---

### 38. `LivabilityDetailView` silently drops partial-data sections and blank trend slots

**Affected code**

- `backend/app/api/address.py:901-915`
- `frontend/src/components/LivabilityDetailView.tsx:39-179`
- `frontend/src/components/LivabilityDetailView.test.tsx:124-138`

**Why this is a bug**

The backend intentionally returns the current livability score even when trend or comparison sub-fetches fail; in that case it sets `current.trend = []` and `current.comparison = []` rather than failing the whole endpoint. The detail modal then silently removes the affected sections:

- no dimensions section when `data.dimensions.length === 0`
- no trend section when `data.trend.length <= 1`
- no comparison section when `data.comparison.length === 0`

There is a second partial-data gap inside the per-dimension trend chart: when one year lacks a dimension entry, the component renders an empty `.livability-detail__dim-trend-bar-slot` with no unavailable marker or explanatory text.

So a user can explicitly open the detailed livability analysis and still receive a shorter, partially blank modal with no indication that data is missing. Existing tests even codify that omission by asserting the per-dimension trend section is absent when trend dimensions are empty.

This is the detail-view counterpart to Finding #8; fixing only the summary card would still leave degraded livability data unexplained in the modal.

**How to solve it**

1. Add explicit subsection-level fallback copy for missing dimensions, trend, and comparison data in `LivabilityDetailView`.
2. Mark missing per-year dimension values inside the dimension-trend chart with an unavailable glyph, label, or patterned slot rather than an empty placeholder.
3. Replace the current omission-based tests with positive coverage for degraded detail states.

**Definition of done**

- The livability detail modal explains when trend, dimension, or comparison data is unavailable.
- Missing per-year dimension values are visibly marked as unavailable rather than rendering as blank space.
- Tests cover partial-data detail payloads instead of locking in silent omission.

---

## Eighth-Pass Findings

### 39. Shortlist entries can freeze incomplete dossier scores and permanently poison Compare data

**Affected code**

- `frontend/src/App.tsx:801-823`
- `frontend/src/App.tsx:3152-3160`
- `frontend/src/services/shortlist.ts:42-47`
- `frontend/src/components/CompareScreen.tsx:43-79`
- `frontend/src/components/CompareScreen.tsx:251-268`

**Why this is a bug**

`handleBookmark()` snapshots whatever scores happen to be loaded at tap time into `ShortlistItem.riskScores`. But the save affordance is only blocked while `loading || buildingLoading`; it does **not** wait for `riskLoading`, sunlight completion, or later neighborhood enrichments.

So users can save a dossier before noise, air, climate, or especially sunlight have finished loading. `addToShortlist()` then refuses duplicate VBOs instead of refreshing the existing entry, and `CompareScreen` reads only the persisted shortlist snapshot. The result is a sticky stale state: Compare can keep showing `--` or outdated values for an address that later received complete scores, unless the user manually removes and re-adds it.

This is separate from Finding #7. Finding #7 covers how Compare visually misrenders an unavailable saved score as a `0%` bar. This finding is about how the shortlist store can preserve missing or stale scores in the first place.

**How to solve it**

1. Either disable bookmarking until the minimum comparison score set is loaded, or allow saved shortlist items to be refreshed as new dossier scores arrive.
2. Change shortlist persistence from "reject duplicate VBO" to "upsert by VBO" so revisiting the same address can update stale scores.
3. Add explicit coverage for the late-arriving sunlight score, since that analysis commonly finishes after the rest of the dossier.
4. Add an integration test that bookmarks before risk/sunlight completion and verifies the saved item updates once the data arrives.

**Definition of done**

- Saving a dossier early does not permanently freeze missing or stale comparison scores.
- Revisiting an already-saved address refreshes its stored risk snapshot instead of forcing a remove/re-add workflow.
- Compare reflects the latest available shortlist scores for noise, air, climate, and sunlight.

---

### 40. Tier B crime fallback copy mislabels lookup failures and no-data states as raw-count fallbacks

**Affected code**

- `backend/app/services/tier_b.py:177-195`
- `backend/app/services/tier_b.py:271-275`
- `frontend/src/components/TierBSignalsCard.tsx:68-71`
- `frontend/src/components/TierBSignalsCard.tsx:145-149`
- `frontend/src/components/TierBSignalsCard.test.tsx:96-110`

**Why this is a bug**

The backend distinguishes several materially different crime states:

- `CRIME_NO_BUURT_CODE`
- `CRIME_PERIOD_LOOKUP_FAILED`
- `CRIME_LOOKUP_FAILED`
- `CRIME_MUNICIPALITY_LEVEL`
- `CRIME_NO_POPULATION`
- `CRIME_NO_DATA`

The frontend only special-cases `CRIME_MUNICIPALITY_LEVEL`. For every other state where `total_per_1000` is missing, it renders the same raw-count note and the same population-based disclaimer.

That is incorrect for at least four real paths:

- `CRIME_LOOKUP_FAILED` and `CRIME_PERIOD_LOOKUP_FAILED`: data retrieval failed, but the UI says raw registered totals are being shown.
- `CRIME_NO_DATA`: CBS returned no crime data, but the UI says the issue is missing population.
- `CRIME_NO_BUURT_CODE`: no valid buurt lookup exists, but the UI again implies raw counts are present.

The existing component test locks in this misclassification by asserting that `CRIME_NO_DATA` should show the raw-count fallback copy.

**How to solve it**

1. Replace the current binary check with an explicit mapping from backend `message` code to user-facing state.
2. Show the raw-count note and population disclaimer only when raw counts are actually present and the fallback reason is genuinely population-related.
3. Add dedicated unavailable/error copy for lookup failures, no-data responses, and missing buurt codes.
4. Update tests to cover each backend message code separately instead of collapsing them into one expectation.

**Definition of done**

- Lookup failures no longer masquerade as successful raw-count fallbacks.
- `CRIME_NO_DATA` renders as a no-data state, not a population-data warning.
- The component test suite covers all backend Tier B message codes with distinct expectations.

---

### 41. Crime source dates leak raw CBS yearly period codes in the viewer and PDFs

**Affected code**

- `backend/app/services/tier_b.py:290-301`
- `frontend/src/components/TierBSignalsCard.tsx:27-33`
- `frontend/src/components/TierBSignalsCard.tsx:68`
- `frontend/src/components/TierBSignalsCard.tsx:152-156`
- `backend/app/services/pdf_export.py:3925-3937`
- `backend/app/services/templates/dossier.tex.j2:207`
- `backend/app/services/templates/dossier.tex.j2:215`
- `frontend/src/utils/dataCoverage.ts:121-126`

**Why this is a bug**

Tier B crime data stores yearly CBS periods as codes like `2025JJ00`. The viewer component has a formatter for monthly codes like `2025MM12`, but it does not format yearly `JJ00` codes. It prints `source_date` or `yearly_period` directly in the crime source line.

The same raw value is then printed directly in both PDF rendering paths:

- `fpdf2` appends `crime.source_date` / `crime.yearly_period` verbatim.
- the LaTeX template emits the same raw string.

So users can see opaque internal CBS period codes such as `2025JJ00` in active dossier surfaces instead of a readable year. This is inconsistent with the rest of the product: the coverage strip already has a parser that understands `YYYYJJ00` and formats it as a normal date/year.

**How to solve it**

1. Normalize CBS yearly period codes before rendering crime source metadata, either in the backend response or via a shared formatter.
2. Reuse one formatting path across the interactive crime card, the `fpdf2` PDF path, and the LaTeX template.
3. Add regression coverage for both `YYYYJJ00` and `YYYYMM##` CBS period strings.

**Definition of done**

- Crime source lines never display raw `YYYYJJ00` codes in the viewer or exported PDFs.
- Yearly crime periods render as a readable localized year.
- Monthly periods continue to render in localized month-year form.

---

## Ninth-Pass Findings

### 42. Risk tile grid omits the sunlight card and never renders the documented four-card `2x2` layout

**Affected code**

- `frontend/src/components/RiskTilesGrid.tsx:26-50`
- `frontend/src/components/RiskTilesGrid.css:1-4`
- `frontend/src/components/RiskTileSkeleton.tsx:6-19`
- `frontend/src/components/RiskTileSkeleton.css:1-5`
- `frontend/src/types/api.ts:240-246`
- `frontend/CLAUDE.md:62`
- `frontend/CLAUDE.md:171`
- `docs/design-prd.md:1022-1024`
- `docs/design-prd.md:1433`

**Why this is a bug**

The active risk-card contract now includes `sunlight`, and the full-dossier spec says the risk analysis page should show all four risk cards. The mounted grid does neither:

- `RiskTilesGrid` renders only noise, air, and climate.
- The live grid CSS hard-codes a single column at all widths.
- The loading skeleton still renders four placeholders, but its CSS is also permanently single-column.

So the interactive dossier can never display the documented four-card analysis, and it never reaches the expected `2x2` mobile layout except as a loading illusion.

**How to solve it**

1. Add the sunlight tile to `RiskTilesGrid`, using the same score/severity/detail-tap contract as the other categories.
2. Make the live grid and skeleton share the same responsive `2x2` CSS, degrading to one column only at the documented smallest-phone breakpoint.
3. Add component coverage for four rendered cards when sunlight data is present.
4. Add visual checks for the `375px`, `360px`, and `320px` layouts called out in the frontend guidance.

**Definition of done**

- Full dossier risk analysis renders four cards when sunlight data is available.
- The default mobile layout is a `2x2` grid, with single-column fallback only at the documented smallest breakpoint.
- `RiskTileSkeleton` mirrors the live grid structure and no longer causes layout drift.

---

### 43. Full-dossier export passes `city` instead of `municipality` into municipality-sensitive property-warning logic

**Affected code**

- `frontend/src/types/api.ts:37-57`
- `frontend/src/App.tsx:1260-1268`
- `frontend/src/App.tsx:1926-1934`
- `frontend/src/App.tsx:3263-3265`
- `frontend/src/components/ExportBottomSheet.tsx:13-31`
- `frontend/src/services/api.ts:359-403`
- `frontend/src/services/api.ts:523-557`
- `backend/app/api/address.py:1033-1040`
- `backend/app/api/address.py:1397-1404`
- `backend/app/services/property_warnings.py:141-155`
- `backend/app/services/foundation_risk.py:69-83`
- `backend/app/services/foundation_risk.py:197-207`

**Why this is a bug**

The live dossier fetches property warnings with `address.municipality`, but the export flow never carries that field end-to-end. Instead:

- `ResolvedAddress` contains both `city` and `municipality`.
- Interactive warning fetches pass `municipality`.
- `ExportBottomSheet` and `ExportOptions` expose only `city`.
- The export endpoint then forwards `municipality=body.city`.

In Dutch addressing, postal city and municipality are not interchangeable. That means the export-only property-warning path can evaluate erfpacht detection and soft-soil foundation heuristics against the wrong municipality and disagree with the live dossier for the same address.

**How to solve it**

1. Add `municipality` to the frontend export props, export payload, and backend `ExportRequest`.
2. Pass the real municipality from `ResolvedAddress` all the way through `_fetch_property_warnings_for_export(...)`.
3. Keep `city` separate for display-only PDF text so those two concepts do not get conflated again.
4. Add an integration test with an address where `city != municipality`.

**Definition of done**

- Export and interactive property-warning requests use the same municipality value.
- Erfpacht and foundation-warning results match between live dossier and exported dossier for the same address.
- Tests cover an address whose postal city differs from its municipality.

---

### 44. Shadow snapshot capture still uses June morning/afternoon views instead of the documented December morning/noon/evening evidence

**Affected code**

- `frontend/src/components/NeighborhoodViewer3D.tsx:882-884`
- `frontend/src/components/NeighborhoodViewer3D.tsx:1073-1089`
- `frontend/src/components/ExportBottomSheet.tsx:169-171`
- `frontend/src/i18n/en.json:288`
- `frontend/src/i18n/nl.json:288`
- `frontend/src/components/ShadowSnapshots.test.tsx:59-67`
- `docs/design-prd.md:965`
- `docs/design-prd.md:1022-1024`

**Why this is a bug**

The product docs and export requirements call for winter-solstice shadow evidence: morning, noon, and evening on December 21, with a noon winter snapshot on the cover. The current client capture pipeline does something else entirely:

- The viewer comments and subtitle explicitly describe summer-solstice output.
- `snapshotConfigs` hard-code `month: 5, day: 21` (June 21) and only two times of day: `09:00` and `15:00`.
- `ExportBottomSheet` tries to pick a noon snapshot, but because no `12:00` image exists it usually falls back to the top morning image.

So the system is exporting shadow evidence from the wrong season and often the wrong time of day, even though the UI and spec position it as buyer-facing sunlight due diligence.

**How to solve it**

1. Change the client snapshot schedule to the documented December 21 morning/noon/evening set, or explicitly revise the product contract if summer analysis is the intended behavior.
2. Ensure the primary export snapshot is the actual winter-noon frame, not a fallback to the first or top image.
3. Update i18n copy, comments, and tests so they match the real capture behavior.
4. Verify both quick-brief and full-dossier export paths consume the corrected snapshot set.

**Definition of done**

- Snapshot capture season and times match the documented product behavior.
- The primary export shadow image is a real noon-winter snapshot.
- UI copy and tests no longer lock in the wrong summer-solstice contract.

---

### 45. LaTeX full dossier collapses multi-snapshot shadow evidence to one image and mislabels it as seasonal noon analysis

**Affected code**

- `frontend/src/components/ExportBottomSheet.tsx:156-171`
- `frontend/src/services/api.ts:394-399`
- `backend/app/services/pdf_export.py:2184-2218`
- `backend/app/services/pdf_export.py:2669-2684`
- `backend/app/services/pdf_export.py:2937-2957`
- `backend/app/services/pdf_export.py:4851-4852`
- `backend/app/services/templates/dossier.tex.j2:123-132`

**Why this is a bug**

The normal client export path sends `shadow_images`, not separate winter/equinox/summer images. In the LaTeX pipeline, that payload is then collapsed like this:

- `_primary_shadow_from_triptych()` selects a single "primary" image.
- Asset preparation decodes that one image into `shadow_winter` and leaves the equinox/summer slots empty unless dedicated fields were supplied.
- The LaTeX template renders whatever images it receives and captions them as "Seasonal snapshots at 12:00 local time."

So the primary full-dossier path can show a single client snapshot while claiming it is a seasonal noon set. The older `fpdf2` fallback still renders the full shadow triptych, which means the two PDF paths disagree about the same evidence.

**How to solve it**

1. Preserve the full `shadow_images` collection in the LaTeX path instead of collapsing it to one primary image.
2. Only use the seasonal caption when the payload actually contains seasonal/noon images.
3. Thread through accurate per-image labels or time metadata so the caption reflects what was rendered.
4. Add parity tests between the LaTeX and `fpdf2` dossier paths for shadow imagery.

**Definition of done**

- LaTeX full dossiers render the same set of shadow images the client submitted.
- Captions accurately describe the rendered season/time evidence.
- The LaTeX and `fpdf2` full-dossier paths no longer diverge on shadow-analysis content.

---

## Addendum — Dropped Seventh-Pass Claims

These findings from the seventh-pass audit were investigated and rejected:

- `shadowSnapshots state variable is orphaned`: Partially true but not a bug. The state is declared, reset on address change, and passed to `ExportBottomSheet`. The snapshot population happens via the `onShadowSnapshots` callback from `NeighborhoodViewer3D`, which sets the state when forge3d snapshots complete. The "never set" claim was due to incomplete code search — the callback IS wired in `App.tsx`.
- `riskComparisons fire-and-forget race condition`: Not a real race. Both promises use the same `requestSignal` from the address abort controller. When the user switches addresses, ALL in-flight requests abort, and the `isActiveDossierRequest(requestId)` guard at the end of each promise prevents stale data from reaching state. The guard is sufficient.
- `pdf_export.py division by zero in _scaled_chart_height`: Not reachable. The `width` parameter comes from `_usable_width()` which computes `page_width - 2 * margin`, both of which are positive constants. The result is always > 0.
- `Missing loading state check in retry effect (line 1602)`: The effect at 1602 has an additional guard via `riskComparisonsError` — it only fires when BOTH comparisons and error are null, meaning neither a successful fetch nor a failed fetch has completed. This correctly represents "initial state before any fetch" and the retry is appropriate.
- `Material backup null safety (line 1277)`: The backup Map is populated by the same loop that iterates materials, and only populated with non-null clones. The backup can never be null.
- `Quick brief missing tier_b in LaTeX path`: By design. Quick briefs are Tier A only. The quick brief product intentionally excludes crime data.
- `3D viewer crashes on empty buildings array`: Overstated in the current product flow. `App.tsx` only mounts `NeighborhoodViewer3D` when `buildings.length > 0`.
- `3D viewer basemap tiles reference retired PDOK BRT endpoint`: Not retained without current official-source verification because this is a temporal external claim. The confirmed issue kept in the main list is narrower: the viewer still uses grayscale BRT tiles instead of the documented orthophoto ground imagery.
- `Viewing question severity fallback labels can misrepresent actual score severity`: Duplicate of confirmed Finding #6.
- `3D viewer dark-mode basemap canvas textures leak memory`: Not strongly verified. The claim depends on browser and GPU implementation details that were not measured in this audit.
- `_classify_water_from_properties sentinel -999 path`: Duplicate of confirmed Finding #27.
- `PropertyWarningsCard empty clean-property section`: Real follow-on risk, but not retained as a standalone current-product finding because the card is not mounted in the interactive dossier today. The current user-facing bug is already captured by Finding #28.
- `LivabilityResponse` discriminated-union mismatch`: Better described as a type-hardening issue than an active user-visible bug.
- `CrimeStatsCard.severity typed as plain string`: Better described as a backend/frontend type-hardening issue than an active runtime defect.
- `_extract_numeric()` skips -998 sentinels`: Hardening concern, not a confirmed bug under the documented sentinel contracts.

---

## Addendum — Dropped Second-Pass Claims

These subagent findings were investigated and rejected as false positives:

- `Jinja2 empty-list truthiness for livability.dimensions`: False positive. Empty lists `[]` are falsy in Jinja2 (same as Python), so the `{% if livability.dimensions %}` guard correctly skips empty lists.
- `Climate score becomes None due to enum .value passing "unavailable"`: False positive. `normalize_climate_score()` correctly handles `"unavailable"` — the `in level_map` check at line 63 rejects it, and both-unavailable correctly returns None (no data).
- `Sunlight comparison missing SVF score extraction`: Weak claim. The `_address_score` function at line 78–83 checks `cards.sunlight.score` first (which is set by the risk_cards pipeline when SVF is computed), then falls back to winter_hours. The SVF score is threaded via the score field upstream.
- `Comparison chart X-axis ticks don't scale with dynamic range`: By design. The ticks at [0, 20, 40, 70, 100] represent severity thresholds, not a data-driven axis. Values beyond 100 are rare edge cases from baseline comparisons and the extra space is intentional padding.
- `RiskDetailView footer i18n issue with null sourceDate`: Not a bug. The ternary at line 187 correctly falls back to showing just `source` without the date template when `sourceDate` is falsy.
- `ParallelCoordinates string coordinates`: Already in original appendix as a non-actionable sloppy-but-working issue.

---

## Addendum — Dropped Fifth-Pass Claims

These findings from the fifth-pass audit were investigated and rejected:

- `building3d cache key missing lat/lng/rd_x/rd_y`: False positive. A `pand_id` uniquely determines a building's physical location. The lat/lng/rd_x/rd_y params come from the PDOK lookup for that pand_id and are deterministic. The cache key is practically correct even though it doesn't include all query params.
- `neighborhood3d cache key missing lat/lng`: Same reasoning as above. The key includes `rd_x:.0f` and `rd_y:.0f`, and lat/lng are WGS84 equivalents of the same coordinates.
- `RiskTilesGrid crash on null risks.noise`: Very unlikely. TypeScript `RiskCardsResponse` requires noise/air_quality/climate_stress as mandatory fields. If `risks` is defined, these nested objects will be present. Only malformed API responses could trigger this, and that's a transport error, not a component bug.
- `Backend hardcoded bilingual strings in pdf_export.py and viewing_questions.py`: By design. The PDF is generated server-side and cannot use the frontend i18n system. Backend bilingual strings are the intended architecture for server-rendered content.
- `Quick brief omits crime from risk summary table`: Likely by design. The quick brief function signature does not accept `tier_b` data, and the brief is scoped to Tier A environmental risk categories. Crime is a Tier B feature not included in the brief product.
- `fpdf2 vs LaTeX livability chart rendering gap`: False positive. The dossier.tex.j2 template at line 166 correctly renders `livability_chart` with a full livability section including dimensions, trend, comparison, and chart image. Both paths render livability equivalently.
- `fpdf2 vs LaTeX crime detail rendering asymmetry`: Overstated. The dossier.tex.j2 template at lines 198-204 renders a dedicated crime section with total, national, burglary, and violent breakdowns. Both paths have crime detail rendering, just with different visual layouts (LaTeX uses structured text; fpdf2 uses card-style rendering).
- `Frontend i18n parity violations`: False positive. All 627 keys in en.json have matching keys in nl.json. No parity violations found.
- `Suggest endpoint caching old empty responses`: Not an active bug. The code at lines 296-299 has a safeguard that correctly rejects cached empty lists. This is historical defense code that works correctly.

---

## Appendix - Dropped or Reframed Claims

These items were intentionally removed from the revised bug list because they are overstated, unreachable under the current contracts, or better described as hardening work:

- `AttentionSummary ignores crime`: misframed as a direct bug. The component only receives `riskCards` today; crime lives in `tierBData`. This is better treated as part of the broader summary-architecture issue in Finding 5.
- `AttentionSummary thresholds are a frontend-only bug`: not accurate. The same `30/50` logic exists in `backend/app/services/property_warnings.py`, so this is a product inconsistency and source-of-truth issue, not a frontend-only defect.
- `LivabilityCard` needs a null guard for `normalized_score`: weak claim. `normalized_score` is required by both the frontend type contract and backend Pydantic model.
- `render_risk_comparison()` crashes if all bar values are `None`: effectively unreachable in current usage because the function requires `address_score: int` and seeds `bar_rows` with it.
- `ParallelCoordinates` circle coordinates are strings, not numbers`: technically sloppy, but not a meaningful user-facing defect in the current implementation.
- `severity_from_score()` lacks input-range validation`: worth hardening, but not an active user-visible bug under the current normalized-score callers.
- `AnimatedScore` race condition`: plausible but not verified strongly enough to keep in the confirmed list.
