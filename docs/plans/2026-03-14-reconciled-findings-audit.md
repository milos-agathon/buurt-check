# Buurt Check - Reconciled Findings Audit

**Date:** 2026-03-14
**Method:** Source verification against the current workspace
**Scope:** Backend PDF/chart rendering, viewing questions, and frontend dossier summary/checklist components

This report updates the earlier 17-item audit. Duplicates were merged, weak claims were downgraded or removed, and each retained finding below was verified against the source.

## Summary

| Severity | Count | Notes |
|----------|-------|-------|
| P1 | 8 | Data correctness, misleading summary logic, or missing user-facing content |
| P2 | 12 | UX inconsistencies, viewer/PDF drift, chart mismatches, and missing unavailable or error states |
| Total | 20 | Confirmed findings (12 original + 6 second-pass + 2 third-pass) |

Primary themes:

- Crime data is still under-threaded in PDF output.
- `AttentionSummary` duplicates summary logic locally and has drifted from the rest of the product.
- The viewer and PDF checklist flows are not fully aligned for crime-related guidance.
- Graceful degradation is incomplete in several components that treat missing data as zero or hide sections silently.
- Chart legend/label colors don't always match the data they represent (age profile, risk grid).
- Raw API values used directly as CSS widths without normalization (TierBSignalsCard crime bars).
- 3D heatmap has an unguarded array access that can produce black patches from NaN vertex colors.
- Sunlight comparison data is computed by the backend but never displayed in the frontend viewer.
- CBS age profile aggregation can silently underreport when one sub-band is a sentinel.

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
4. Verify the checklist still renders nothing only when there are truly no categories.

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

### 9. Viewer checklist omits crime questions that the PDF checklist already includes

**Affected code**

- `backend/app/services/viewing_questions.py:360-483`
- `backend/app/services/pdf_export.py:3761-3777`
- `backend/app/services/pdf_export.py:6079`
- `frontend/src/App.tsx:3078-3085`

**Why this is a bug**

The live viewer checklist only renders categories returned by `build_viewing_questions(...)`, which are based on risk cards. The PDF checklist explicitly augments those questions with a crime category via `_with_crime_viewing_questions(...)` before rendering.

That means the same entitled dossier can show crime viewing questions in the export but not in the on-screen checklist, creating a user-facing mismatch between the viewer and the PDF.

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

When an age band value is `None`, the code at line 864 converts it to `0.0` and plots a zero-width bar. The text label correctly shows "—" at line 888, but the bar renders at zero width, making the chart row look like a 0% share rather than missing data. This is the PDF-side equivalent of existing Finding 9 (frontend NeighborhoodStatsCard), creating the same contradictory text-vs-bar signal.

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

## Addendum — Dropped Second-Pass Claims

These subagent findings were investigated and rejected as false positives:

- `Jinja2 empty-list truthiness for livability.dimensions`: False positive. Empty lists `[]` are falsy in Jinja2 (same as Python), so the `{% if livability.dimensions %}` guard correctly skips empty lists.
- `Climate score becomes None due to enum .value passing "unavailable"`: False positive. `normalize_climate_score()` correctly handles `"unavailable"` — the `in level_map` check at line 63 rejects it, and both-unavailable correctly returns None (no data).
- `Sunlight comparison missing SVF score extraction`: Weak claim. The `_address_score` function at line 78–83 checks `cards.sunlight.score` first (which is set by the risk_cards pipeline when SVF is computed), then falls back to winter_hours. The SVF score is threaded via the score field upstream.
- `Comparison chart X-axis ticks don't scale with dynamic range`: By design. The ticks at [0, 20, 40, 70, 100] represent severity thresholds, not a data-driven axis. Values beyond 100 are rare edge cases from baseline comparisons and the extra space is intentional padding.
- `RiskDetailView footer i18n issue with null sourceDate`: Not a bug. The ternary at line 187 correctly falls back to showing just `source` without the date template when `sourceDate` is falsy.
- `ParallelCoordinates string coordinates`: Already in original appendix as a non-actionable sloppy-but-working issue.

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
