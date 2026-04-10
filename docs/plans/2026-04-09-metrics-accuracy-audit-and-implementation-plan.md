# Metrics Accuracy Audit - Consolidated Implementation Plan

Date: 2026-04-09
Consolidated: 2026-04-10
Owner: Milos / Codex
Status: Complete
Scope: Customer-visible metric computation, normalization, comparison semantics, source/date provenance, and rendering across backend, frontend, and PDF/export surfaces.

## Objective

Make every customer-visible metric mathematically defensible, honestly labeled, source-attributed, and protected by semantic regression tests. This document replaces the prior append-only audit log with one implementation-ready backlog.

## Current Verified Baseline

The following facts were checked against the current repository state during consolidation:

- Neighborhood indicators still expose only `quartile` and no direction, precision, or per-indicator source-year metadata.
- Risk comparison rows still emit `label_code="city_avg"` for urbanization-modeled peer baselines. The PDF already relabels this row as a peer baseline, but the interactive app still renders `City average`.
- `RiskDetailView` still collapses `who_limit`, `adaptation_target`, and `daylight_target` into the `who` legend bucket.
- `LivabilityDetailView` still maps `gemeente` comparison rows to the `nl` legend bucket even though the backend emits only `wijk` and `gemeente`, not NL.
- `risk_comparisons.py` still maps air quality reference row to `("who_limit", 75)`, while WHO AQG-compliant raw air values map to score `100`.
- Risk-card warning codes exist in backend payloads and i18n (`risk.warning.*`) but are not consistently surfaced in risk tiles, detail views, PDF sections, or viewing questions.
- `sunlightAnalysis.ts` still counts each sampled timestamp as a full interval and weights annual averages by daylight sample count, not days per month.
- Sunlight methodology in the PDF now discloses the target plane as roof surface, but primary app/PDF copy and viewing questions still include living-space claims that the roof metric does not prove.
- Crime municipality fallback still fetches buurt population before fallback and reuses that denominator for municipality crime counts.
- Crime periods can be newer than the fixed CBS Wijken & Buurten 2024 population denominator.
- Foundation fallback omissions do not always drop pre-1970 buildings to `low`; current behavior downgrades omitted soft-soil municipalities from `high` to `medium` for pre-1970 construction and from `medium` to `low` for 1970-1990 construction.

## Criticality Scale

- `Critical`: Customer-visible arithmetic error or strong false claim that can materially mislead a purchase decision.
- `High`: Significant semantic/provenance mismatch that weakens trust or can mislead in common cases.
- `Medium`: Customer-visible heuristic, labeling, or maintenance issue with narrower impact.
- `Low`: Low-impact date/caption drift or cleanup.

## Implementation Rules

1. Do not fix ambiguous metric meaning with copy alone. Add backend contract metadata when the frontend or PDF needs semantic context.
2. Do not call modeled, heuristic, approximate, or fallback values observed facts. Label the method and scope.
3. Keep one canonical severity taxonomy: `good >= 70`, `moderate >= 40`, `poor >= 20`, `critical < 20`.
4. Every task must include at least one semantic regression test that fails on the current misleading behavior.
5. App and PDF wording must agree for the same metric, benchmark, scope, and source date.
6. Preserve backward compatibility where practical, but new UI/PDF logic should prefer explicit semantic fields over legacy label-code heuristics.

## Delivery Sequence

Phase 1 fixes the most dangerous customer-facing falsehoods and arithmetic bugs:

1. ~~A12 crime fallback denominator and scope~~
2. ~~A09 sunlight integration and annual weighting~~
3. ~~A07 WHO summary boundary truthfulness~~
4. ~~A04 air benchmark honesty~~
5. ~~A03 risk comparison semantic contract~~
6. ~~A06 risk-card warning propagation~~
7. ~~A10 sunlight target-plane honesty~~
8. ~~A11 TNO benchmark relabeling~~
9. ~~A08 climate WFS classification hardening~~

Phase 2 fixes high-impact provenance, display, and source semantics:

1. ~~A01 neighborhood direction and precision~~
2. ~~A02 neighborhood mixed-year provenance~~
3. ~~A13 crime baseline and denominator provenance~~
4. ~~A14 livability class/deviation semantics~~
5. ~~A15 attention and asbestos threshold alignment~~
6. ~~A17 foundation fallback list provenance~~

Phase 3 completes narrower product semantics and regression hardening:

1. ~~A05 benchmark provenance artifact~~
2. ~~A16 erfpacht heuristic wording~~
3. ~~A18 seasonal shadow date reference~~
4. ~~A19 semantic regression gate~~

## Implementation Tasks

### ~~A01. Add Direction, Favorability, and Precision Metadata to Neighborhood Indicators~~

Criticality: Critical
Covers: F1, F25
Depends on: None

Problem:

- `NeighborhoodIndicator` carries only `quartile`.
- CBS distance indicators use raw quartile `1` for short distances, but the frontend fills fewer dots for quartile `1`, making good access look weak.
- Unitless values such as `avg_household_size=1.8` render as `2` in app and PDF.
- PDF `_quartile_label()` labels distance quartile `1` as `bottom 25%`.

Required implementation:

1. In `backend/app/models/neighborhood.py`, extend `NeighborhoodIndicator` with explicit metadata:
   - `quartile_direction: Literal["higher_value", "lower_value"] | None`
   - `favorable_quartile: int | None` where `4` always means more favorable
   - `precision: int | None`
2. In `backend/app/services/cbs.py`, populate:
   - `distance_to_train_km`, `distance_to_supermarket_km`: `quartile_direction="lower_value"`, `favorable_quartile=5 - quartile`, `precision=1`
   - `avg_household_size`: `precision=1`, no favorability claim
   - percentages: `precision=1` unless the source value is integer and product intentionally wants whole percentages
   - population density and average property value: `precision=0`
3. In `frontend/src/types/api.ts`, mirror the new fields.
4. Update `frontend/src/components/ui/QuartileDots.tsx` to accept a semantic mode:
   - favorability mode uses `favorable_quartile`
   - distribution mode uses raw `quartile` without implying better/worse
5. Update `frontend/src/components/NeighborhoodStatsCard.tsx` to format by `indicator.precision` instead of `unit` alone.
6. Update `backend/app/services/pdf_export.py` so `_format_indicator_text()` preserves `precision` and labels distance quartiles as favorable access, not `bottom 25%`.

Required tests:

- Backend CBS parse test for `distance_to_train_km=0.8`: raw `quartile=1`, `favorable_quartile=4`, direction `lower_value`.
- Frontend `QuartileDots` test proving lower-is-better access renders the favorable state, not one filled dot.
- PDF test replacing the current `test_quartile_with_distance` expectation: it must not contain `bottom 25%` for a short train distance.
- Frontend and PDF tests proving `avg_household_size=1.8` renders as `1.8`, not `2`.

Done when:

- Access metrics cannot be rendered with inverted quality.
- Descriptive metrics are not accidentally treated as "better" just because a quartile is high.
- App and PDF use the same precision rules.

### ~~A02. Carry Mixed-Year CBS Provenance Through the Neighborhood Contract~~

Criticality: High
Covers: F15
Depends on: A01 recommended

Problem:

- `cbs.py` backfills missing 2024 housing/access fields from the 2023 CBS dataset.
- `NeighborhoodStatsResponse.source_year` remains `2024`, and PDF text hardcodes `CBS Wijken & Buurten 2024`.
- Users cannot see which displayed values came from 2023.

Required implementation:

1. Add per-indicator `source_year: int | None` and optional `source_note: str | None` to `NeighborhoodIndicator`.
2. In `cbs.py`, have `_make_indicator(..., source_year=2024)` set source metadata.
3. In `_merge_missing_housing_access()`, preserve the fallback indicator's `source_year=2023` for each substituted field.
4. Extend `NeighborhoodStatsResponse` with:
   - `source_years: list[int]`
   - `mixed_source_years: bool`
   - `source_notes: list[str]`
5. Keep legacy `source_year` as the newest year for compatibility, but stop using it as the only rendered truth.
6. Update `NeighborhoodStatsCard`, source freshness logic in `App.tsx`, and PDF neighborhood sections to show copy such as `CBS Wijken & Buurten 2024; 2023 backfill for train distance and property value`.

Required tests:

- Backend test for the 2023 backfill path asserting substituted fields have `source_year=2023`.
- Frontend test asserting mixed source copy appears when `mixed_source_years=true`.
- PDF text extraction test proving the neighborhood source line does not say 2024-only when a 2023 backfill field is present.

Done when:

- No 2023 backfilled neighborhood value is presented as unambiguously 2024.
- Freshness indicators and source labels are consistent in app and PDF.

### ~~A03. Replace Risk Comparison Label Heuristics With an Explicit Semantic Contract~~

Criticality: Critical
Covers: F2, F3 risk half
Depends on: None

Problem:

- Backend emits urbanization-modeled peer baselines with `label_code="city_avg"`.
- Frontend renders that as `City average`.
- Reference rows for WHO, adaptation, and daylight targets all share the `who` legend bucket.

Required implementation:

1. Extend `RiskComparisonRow` in `backend/app/models/risk.py`:
   - `role: Literal["address", "peer", "national", "reference"]`
   - `benchmark_family: str`
   - `label_key: str`
   - `scope: Literal["address", "urbanization_peer", "national", "reference"]`
2. In `risk_comparisons.py`, populate:
   - urbanization row: `role="peer"`, `benchmark_family="urbanization_peer"`, `label_key="risk.detail.peerUrbanization"`
   - national row: `role="national"`, `benchmark_family="national_model"`
   - reference rows: category-specific families such as `who_noise_lden`, `climate_adaptation_target`, `daylight_target`
3. Keep legacy `label_code` temporarily for backward compatibility, but make app/PDF rendering prefer `label_key`, `role`, and `benchmark_family`.
4. Update `frontend/src/App.tsx` to remove `city_avg -> cityAvg` customer rendering.
5. Update `RiskDetailView` legend color keys to include `peer`, `national`, `who`, `climate_target`, and `daylight_target`.
6. Update i18n in EN/NL:
   - `Peer baseline (urbanization)`
   - `National baseline`
   - `WHO noise guideline`
   - `Climate adaptation target`
   - `Daylight target`
7. Update PDF comparison builder to use explicit `role` and `benchmark_family`, keeping its existing fallback only for legacy payloads.

Required tests:

- Backend risk comparison test asserting role/family/key for every row.
- Frontend detail-view test asserting peer rows never render `City average`.
- Frontend legend test proving adaptation/daylight targets do not appear under a WHO legend.
- PDF test proving app/PDF labels match for peer, national, and reference rows.

Done when:

- No customer surface calls an urbanization-modeled baseline a city average.
- Legend semantics come from explicit row metadata, not hardcoded label-code grouping.

### ~~A04. Rename or Revalue the Air Comparison Reference Row~~

Criticality: Critical
Covers: F22
Depends on: A03

Problem:

- `_REFERENCE_ROW_BY_CATEGORY["air_quality"] = ("who_limit", 75)`.
- Under current scoring, actual WHO AQG compliance maps to score `100` for PM2.5 `5 ug/m3` and NO2 `10 ug/m3`.
- The app labels score `75` as `WHO guideline`, which is false.

Required implementation:

1. Treat the existing score `75` row as an internal/interim target, not WHO AQG.
2. Replace `who_limit` for air with a new code/family:
   - `label_code="air_interim_target"` or `benchmark_family="air_interim_target"`
   - label: `Air quality target` / `Luchtkwaliteitsdoel`
3. Keep raw WHO AQG thresholds visible in measurement/reference tables:
   - PM2.5 WHO AQG: `5 ug/m3`
   - NO2 WHO AQG: `10 ug/m3`
4. If the product requires a true WHO row in comparison charts, add it at score `100` and label it `WHO AQG`; do not reuse the score `75` row.

Required tests:

- Backend test asserting no air reference row with value `75` has WHO label/family.
- Frontend test asserting the air dashed row label is not `WHO guideline`.
- PDF test asserting the air chart and app use the same benchmark label.

Done when:

- A buyer cannot interpret score `75` as raw WHO AQG compliance.
- WHO threshold values remain visible as measurement context.

### ~~A05. Move Hardcoded Risk Benchmarks Into a Versioned Provenance Artifact~~

Criticality: Medium
Covers: F5
Depends on: A03, A04 recommended

Problem:

- `_NL_BASELINES`, `_URBAN_BASELINES`, `_REFERENCE_ROW_BY_CATEGORY`, and source/date constants live as code literals.
- There is no repo-local derivation record or review cadence.

Required implementation:

1. Create a versioned benchmark artifact, preferably `backend/app/data/risk_benchmarks.json` plus `docs/data/risk-benchmarks.md`.
2. Include for every benchmark:
   - category
   - role
   - benchmark family
   - urbanization level if applicable
   - score
   - source
   - source date
   - derivation summary
   - owner
   - review due date
3. Load benchmarks through a typed parser in `risk_comparisons.py`.
4. Validate values at import/test time: scores 0-100, all categories complete, all source dates present.

Required tests:

- Unit test that fails if any benchmark row lacks source/date/family.
- Snapshot-style test for the benchmark artifact schema.
- Risk comparison service test proving generated rows come from the artifact, not duplicated literals.

Done when:

- Benchmark values are auditable without reading service internals.
- A benchmark change creates a visible data/spec diff.

### ~~A06. Surface Risk-Card Warning States End to End~~

Criticality: Critical
Covers: F16
Depends on: None

Problem:

- Backend risk cards expose `message` states such as `AIR_PARTIAL`, `AIR_NO_VALUE`, `CLIMATE_PARTIAL`, and lookup failures.
- Existing i18n warning keys exist, but app and PDF mostly render only score/summary/source.
- Partial data can therefore look like a fully observed category claim.

Required implementation:

1. Keep `message` for compatibility, but add `warnings: list[str] = Field(default_factory=list)` to risk card models if multiple warnings can apply.
2. Normalize backend output so each card exposes either no warnings or one or more stable warning codes.
3. Update frontend types and pass warning codes through `App.tsx` into:
   - `RiskTile`
   - `RiskTilesGrid`
   - `RiskDetailView`
   - any summary or checklist callout that restates risk meaning
4. Render warning copy with `t('risk.warning.${code}', code)`.
5. Update PDF risk detail sections to print limitations next to the affected metric.
6. Update `viewing_questions.py` so partial-data cards produce caveated questions instead of unconditional "good" or full-category prompts.

Required tests:

- Backend test asserting partial cards emit warning codes.
- Frontend tile/detail tests for `AIR_PARTIAL` and `CLIMATE_PARTIAL`.
- PDF extraction test proving a partial warning appears near the relevant risk category.
- Viewing-question test proving partial cards include a caveat.

Done when:

- A partial/no-value risk card cannot reach any customer surface as an unqualified full-category claim.

### ~~A07. Make WHO-Linked Summary Copy Depend on Raw Thresholds, Not Generic Severity~~

Criticality: Critical
Covers: F20
Depends on: None

Problem:

- `noise_summary()` says `well below WHO noise guidelines` for every `good` score.
- `air_summary()` says `meets WHO guidelines` for every `good` score.
- Current scoring makes `55 dB`, `PM2.5 11`, and `NO2 19` score `70`, which is `good` but above WHO AQG/onset thresholds used elsewhere.

Required implementation:

1. In `backend/app/services/scoring.py`, base WHO wording on raw values:
   - noise WHO wording only when `lden_db <= 53.0`
   - PM2.5 WHO wording only when observed PM2.5 `<= 5.0`
   - NO2 WHO wording only when observed NO2 `<= 10.0`
2. For values above WHO thresholds but still score `>=70`, use relative wording:
   - `Relatively low road noise for an urban setting`
   - `Good relative air quality, but above WHO AQG for ...`
3. Keep app/PDF consuming backend summaries, and remove any frontend/PDF copy that reintroduces WHO compliance based only on severity.

Required tests:

- `noise_summary(normalize_noise_score(55), 55)` must not include `WHO` compliance/headroom wording.
- `air_summary(normalize_air_score(11, None), 11, None)` must not say `meets WHO`.
- `air_summary(normalize_air_score(None, 19), None, 19)` must not say `meets WHO`.
- Happy-path tests still allow WHO wording for values at or below actual thresholds.

Done when:

- No summary claims WHO compliance unless the raw metric actually satisfies the relevant WHO threshold.

### ~~A08. Replace Climate WFS Heuristics With Layer-Specific Classifiers~~

Criticality: Critical
Covers: F10
Depends on: None

Problem:

- `_classify_heat_from_properties()` and `_classify_water_from_properties()` apply generic numeric thresholds to undocumented WFS attributes.
- A layer with an unexpected numeric scale can silently misclassify climate risk.
- Overall climate risk uses the worst layer, so one misclassified layer can promote the whole card.

Required implementation:

1. Replace tuple entries in `_CLIMATE_HEAT_LAYERS` and `_CLIMATE_WATER_LAYERS` with typed specs:
   - layer name
   - sample type (`raster` or `vector`)
   - expected property keys
   - unit/scale
   - thresholds
   - source/rationale
2. Remove generic fallback thresholds for undocumented numeric fields.
3. If a sampled layer does not match its spec, return unavailable for that layer and add a warning code such as `CLIMATE_LAYER_UNMAPPED`.
4. Keep climate aggregation as worst-of-valid-layers only.
5. Add a short service-level documentation block explaining each curated layer's semantics.

Required tests:

- Fixture test for each curated heat/water layer using recorded representative properties.
- Test proving an unknown numeric field does not get classified by fallback heuristics.
- Test proving `CLIMATE_LAYER_UNMAPPED` warning is surfaced when a curated layer schema drifts.

Done when:

- Climate risk levels are derived only from documented layer semantics.
- Adding a climate layer requires adding a classifier and tests.

### ~~A09. Correct Sunlight Time Integration and Annual Weighting~~

Criticality: Critical
Covers: F4, F21
Depends on: None

Problem:

- `getSampleMinutesForDay()` includes both endpoints, and `analyzeSunlight()` adds a full interval for every sampled timestamp.
- A 1-hour daylight window at 30-minute resolution currently counts as 1.5 hours.
- `annualAverage` is weighted by daylight sample counts, not calendar days per month.

Required implementation:

1. Replace timestamp counting with interval integration in `frontend/src/utils/sunlightAnalysis.ts`.
2. Implement `getSampleIntervalsForDay(sunriseHour, sunsetHour, intervalMinutes)` returning clipped intervals with:
   - `startMinute`
   - `endMinute`
   - `midpointMinute`
   - `durationHours`
3. Raycast once at each interval midpoint and add `durationHours` when unblocked.
4. Compute annual daily averages using calendar day weights:
   - representative monthly daily mean multiplied by days in month
   - divide by days in year
5. Recompute roof, facade, ground, and per-point annuals from the same corrected duration model.
6. Add `method_version` to `SunlightResult`, frontend submission payload, backend `SunlightRiskCard`, and cache handling. Suggested value: `sunlight-v2-interval-dayweighted`.
7. Skip or invalidate cached sunlight cards without the new method version when generating exports.

Required tests:

- 1-hour daylight window at 30-minute resolution returns 1.0 hour, not 1.5.
- Non-aligned daylight window uses clipped durations within documented tolerance.
- Blocked/unblocked midpoint cases near sunrise/sunset are covered.
- Annual average for synthetic Jan-Jun 2h/day and Jul-Dec 4h/day is day-count weighted, not daylight-slot weighted.
- API submit/roundtrip test preserves `method_version`.

Done when:

- Displayed sunlight hours and scores are based on interval duration, not sample count.
- Annual averages are truthful daily calendar averages or explicitly labeled otherwise.

### ~~A10. Make Sunlight Target-Plane Semantics Visible at the First Claim~~

Criticality: Critical
Covers: F23
Depends on: A09 recommended

Problem:

- Primary sunlight score is computed from roof mean winter hours.
- App copy, viewing questions, and PDF action items still imply living-space daylight.
- PDF methodology discloses roof target plane later, but that is too late to correct the headline claim.

Required implementation:

1. Add target-plane metadata to `SunlightResult` and `SunlightRiskCard`:
   - `target_plane: Literal["roof", "facade", "ground", "interior_proxy"]`
   - for current implementation, set `target_plane="roof"`
2. Rename app labels and summary copy to roof/clear-sky exposure unless a facade/interior metric is used.
3. Update `scoring.sunlight_summary()`:
   - do not say `adequate direct sun year-round` without naming the roof plane
4. Rewrite `sunlight.meaning.good`, sunlight viewing tips, and `viewing_questions.py` living-room prompts:
   - ask buyers to verify rooms because the model is roof/facade proxy data
   - do not claim the model has measured living-room daylight
5. Update PDF executive summary and checklist action text that currently says `living spaces`.

Required tests:

- Frontend test proving the first visible sunlight claim includes roof/clear-sky scope.
- Backend summary test proving sunlight summaries mention the target plane or avoid whole-home claims.
- PDF extraction test proving `living spaces` wording is absent unless a matching interior/facade metric is used.

Done when:

- The first visible sunlight score describes the plane it actually measures.
- Living-space claims only appear as viewing questions to verify, not as computed facts.

### ~~A11. Remove the TNO Label From the Current Winter Roof-Hours Heuristic~~

Criticality: Critical
Covers: F24
Depends on: A10 recommended

Problem:

- Current benchmark uses `50% / 80% of 7.5 winter roof hours`.
- Dutch TNO bezonningsnorm references are season-window and window/facade-point based.
- The current method is not the TNO norm, even with an informational disclaimer.

Required implementation:

1. Do not implement true TNO in this pass unless there is a source-backed specification ready.
2. Relabel the existing heuristic to a neutral internal benchmark:
   - `winter possible-sun ratio`
   - `winter roof exposure ratio`
3. Rename code to remove TNO semantics:
   - `getTNOBenchmark()` -> `getWinterExposureRatioLevel()`
   - `TNO_WINTER_REFERENCE_POSSIBLE_HOURS` -> `WINTER_ROOF_REFERENCE_POSSIBLE_HOURS`
   - PDF `_TNO_*` constants -> neutral names
4. Update EN/NL i18n and PDF reference text so the string `TNO` is not shown for this heuristic.
5. Keep the disclaimer that the benchmark is indicative and not a compliance assessment.

Required tests:

- Frontend benchmark tests assert the new neutral label.
- Component test fails if `TNO` appears while the 7.5h roof-ratio heuristic is active.
- PDF test fails if `TNO` appears in benchmark text generated from the replacement constants.

Done when:

- The named TNO norm is no longer attached to a non-TNO algorithm.

### ~~A12. Fix Municipality Crime Fallback Denominators and Scope Labels Together~~

Criticality: Critical
Covers: F17, F19
Depends on: None

Problem:

- `tier_b.py` fetches buurt population before determining whether crime rows fall back to municipality scope.
- When fallback uses `GMxxxx` crime rows, rates still divide by buurt population.
- UI/PDF labels can still say `This area` or `This address` for municipality-wide values.

Required implementation:

1. Add explicit crime scope fields to `CrimeStatsCard`:
   - `scope: Literal["buurt", "gemeente"]`
   - `area_code: str | None`
   - `area_name: str | None`
   - `population: float | None`
   - `population_year: int | None`
2. Split population lookup by scope:
   - buurt scope: current `/collections/buurten/items` with `buurtcode`
   - gemeente scope: `/collections/gemeenten/items` with `gemeentecode` or another verified CBS Wijken & Buurten municipality source
3. Compute all rates only when numerator scope and denominator scope match:
   - `total_per_1000`
   - `burglary_per_1000`
   - `violent_per_1000`
   - `monthly_total_per_1000`
4. If municipality population cannot be fetched, emit counts plus warning; do not emit per-1,000 rates or score.
5. Update frontend and PDF labels based on `scope`:
   - buurt: `This neighborhood`
   - gemeente: `Municipality context`
6. Update `backend/app/services/templates/dossier.tex.j2` if it renders crime labels independently.

Required tests:

- Backend test: buurt numerator uses buurt denominator.
- Backend test: municipality fallback numerator uses municipality denominator.
- Backend test: municipality fallback with missing municipality population suppresses rates and score.
- Frontend test: municipality fallback renders `Municipality context`, not `This area`.
- PDF test: municipality fallback renders `Municipality context`, not `This address`.

Done when:

- Municipality crime counts are never divided by buurt population.
- The primary scope label is truthful without relying on a footnote.

### ~~A13. Align Crime National Baseline, Score Narrative, and Denominator Provenance~~

Criticality: High
Covers: F6, F13, F26
Depends on: A12

Problem:

- `national_per_1000` uses live CBS national crime count divided by fixed `_NL_POPULATION_ESTIMATE = 17_900_000`.
- `normalize_crime_score()` docstring references a national average anchor that is independent of the displayed national comparison bar.
- Local crime rates can show 2025 crime periods while using 2024 population denominators.

Required implementation:

1. Add denominator provenance to `CrimeStatsCard`:
   - `population_source`
   - `population_year`
   - `population_is_estimate`
   - `national_population_source`
   - `national_population_year`
   - `national_population_is_estimate`
2. Either fetch period-matched CBS population denominators or explicitly label them as fixed/latest-available estimates.
3. Update `crime_summary()` so it does not claim `below national average` unless passed a current `national_per_1000` for comparison.
4. If the score anchor remains fixed at 20/1000 to 100/1000, document it as a risk-band model, not as the national average.
5. Update frontend/PDF source lines to disclose numerator period and denominator year.

Required tests:

- Backend test with `2025JJ00` crime and 2024 population asserts denominator-year metadata is present.
- Summary test proving national-average language depends on supplied national comparison, not a stale docstring constant.
- Frontend/PDF tests assert denominator-year disclosure when crime period and population year differ.

Done when:

- Crime score, comparison bar, and source line no longer imply a false period-matched national/local denominator.

### ~~A14. Rework Livability Class, Deviation, and Legend Semantics~~

Criticality: High
Covers: F3 livability half, F18
Depends on: None

Problem:

- Leefbaarometer `kscore` and `k*` fields are integer classes, but the app maps them to exact 0-100 bars.
- Dimensions are deviations from national average in the source model, but UI/PDF render them like generic risk scores.
- `gemeente` comparison rows are mapped to the NL legend bucket.

Required implementation:

1. Extend backend livability models:
   - preserve `overall_class` and dimension class values
   - add `class_label` if available or derive stable labels for 1-9
   - optionally include continuous deviation fields (`afw`, `fys`, `onv`, `soc`, `vrz`, `won`) when present
2. Keep `overall_normalized` only as a derived display helper, not the primary truth.
3. Update frontend and PDF:
   - render overall livability as class/band
   - render dimensions as deviation-from-national-average where data exists
   - avoid risk-style `good/moderate/poor/critical` thresholds unless product copy clearly says these are internal bands
4. Add `compare.legend.municipality` and map `gemeente` to municipality, not NL.
5. Only render an NL legend row if the backend emits an actual national row.

Required tests:

- Backend fixture with class integers and deviation doubles proves both are carried in the response.
- Frontend detail test proves `gemeente` renders as municipality legend.
- Frontend/PDF tests prove a class `5` dimension is described as around-average/neutral, not as a failing `50/100`.

Done when:

- Livability surfaces preserve class/deviation semantics and do not imply unavailable precision.

### ~~A15. Canonicalize Attention Severity and Asbestos Thresholds~~

Criticality: High
Covers: F8, F9
Depends on: None

Problem:

- `property_warnings.py` and `frontend/src/utils/attentionSummary.ts` use inline `<30` and `<50` thresholds.
- Canonical severity thresholds live in `scoring.py`.
- Asbestos response uses `<1994`, but attention summary uses `<1980`.

Required implementation:

1. Change `AttentionFlag.severity` to use canonical values where possible:
   - `critical`
   - `poor`
   - `moderate`
   - `info`
2. In backend attention summary, call `severity_from_score()` instead of inline thresholds.
3. In frontend attention summary, use risk card `severity` when present; otherwise use one shared helper matching backend thresholds.
4. Use one asbestos threshold for the current product surface: `<1994` as asbestos-era awareness.
5. If a structural-asbestos subcategory is desired, add a separate field and separate copy; do not silently mix it into the main flag.

Required tests:

- Backend property-warning test iterating boundary scores 19/20/39/40/69/70.
- Frontend attention-summary test for scores 28 and 45 proving no over-promotion to critical/elevated relative to canonical severity.
- Backend test proving a 1985 building is either flagged in both asbestos response and attention summary or explicitly split into two named semantics.

Done when:

- Attention flags cannot disagree with risk-card severity because of duplicated thresholds.
- Asbestos attention behavior is intentionally aligned or intentionally split with visible semantics.

### ~~A16. Relabel Erfpacht Heuristics as Municipality-Based Verification Prompts~~

Criticality: Medium
Covers: F11
Depends on: None

Problem:

- Backend model field `detected` and PDF text still allow `Ground lease detected` wording.
- The actual check is a hardcoded municipality prevalence list, not Kadaster per-property evidence.
- The interactive card is partially mitigated with `Likely` and a municipality-only note, but all surfaces should align.

Required implementation:

1. Add explicit fields to `ErfpachtWarning`:
   - `scope: Literal["municipality", "property"]`
   - `verified_property_level: bool = False`
2. Keep `detected` only as legacy compatibility or rename it in a versioned contract.
3. Update backend attention labels and PDF wording:
   - use `Erfpacht common in this municipality - verify status`
   - reserve `detected` or `confirmed` for property-level evidence only
4. Correct PDF source copy from `Municipal ground lease registry` to `Municipal ground-lease prevalence list` unless a real registry is queried.

Required tests:

- Frontend and PDF tests fail if municipality-based warnings render `detected`.
- Backend test asserts municipality-based output has `verified_property_level=False`.

Done when:

- Customer-facing copy no longer implies the app has confirmed leasehold for the specific property.

### ~~A17. Expand and Document Foundation Soft-Soil Fallback Coverage~~

Criticality: High
Covers: F12
Depends on: None

Problem:

- `SOFT_SOIL_MUNICIPALITIES` omits known soft-soil municipalities such as Utrecht and Den Haag.
- Current fallback downgrades omitted pre-1970 municipalities from `high` to `medium`, and 1970-1990 municipalities from `medium` to `low`.
- The fallback list has limited provenance and review process.

Required implementation:

1. Move the fallback municipality list to a documented data structure with:
   - municipality name
   - source
   - source date
   - review date
   - rationale
2. Add at least Utrecht and Den Haag after source verification.
3. If a municipality cannot be classified and soil data is missing, prefer a transparent `FOUNDATION_YEAR_ONLY` caveat over silently reassuring copy.
4. Update user-facing copy to distinguish:
   - soil-data-backed result
   - municipality fallback result
   - year-only result

Required tests:

- Backend tests for Utrecht and Den Haag:
   - pre-1970 -> high when municipality fallback applies
   - 1970-1990 -> medium when municipality fallback applies
- Test proving unlisted municipality with no soil data carries `FOUNDATION_YEAR_ONLY`.
- Frontend/PDF tests proving fallback caveat appears.

Done when:

- Common soft-soil municipalities are not silently downgraded by omission.
- Fallback confidence is visible to the buyer.

### ~~A18. Remove Literal 2026 Coupling From Seasonal Shadow Evidence~~

Criticality: Low
Covers: F14
Depends on: None

Problem:

- `shadow_prewarm.py` hardcodes `2026-03-20`, `2026-06-21`, and `2026-12-21`.
- Future captions or evidence metadata can become stale.

Required implementation:

1. Replace literal year in `_SEASONAL_RENDER_SPECS` with a helper:
   - `seasonal_shadow_dates(year: int) -> tuple[(label, date_iso)]`
2. Use current report/evidence year when available; otherwise use current calendar year.
3. If the app uses civil reference dates rather than exact astronomical events, label them as `seasonal reference dates`.
4. Update tests to assert dynamic year behavior, not literal 2026 strings.

Required tests:

- Unit test for `seasonal_shadow_dates(2027)` proving output dates use 2027.
- Test proving no user-facing caption hardcodes 2026 unless report year is 2026.

Done when:

- Seasonal shadow generation is not tied to the year the constant was written.

### ~~A19. Add a Cross-Surface Semantic Regression Gate~~

Criticality: High
Covers: F7 and all task-specific regression gaps
Depends on: A01-A18 as applicable

Problem:

- Existing tests often assert transport/rendering stability while preserving misleading semantics.
- Several current tests explicitly encode wrong behavior, such as distance quartile `bottom 25%` and sunlight 1h -> 1.5h.

Required implementation:

1. Add a semantic regression test matrix covering app, backend, and PDF for each corrected behavior.
2. Replace tests that currently assert misleading behavior.
3. Add fixtures that represent edge/boundary truthfulness cases:
   - lower-is-better access quartile
   - peer baseline versus city average
   - WHO boundary values
   - partial risk cards
   - municipality crime fallback
   - sunlight 1-hour interval
   - livability class 5/deviation near zero
4. Keep focused test commands documented in the PR or task branch.

Required verification commands:

```bash
cd backend && pytest -q tests/test_scoring.py tests/test_cbs.py tests/test_risk_comparisons.py tests/test_tier_b.py tests/test_property_warnings.py tests/test_foundation_risk.py tests/test_leefbaarometer.py tests/test_pdf_export.py
cd frontend && npm exec vitest run src/components/NeighborhoodStatsCard.test.tsx src/components/ui/QuartileDots.test.tsx src/components/RiskDetailView.test.tsx src/components/RiskTilesGrid.test.tsx src/components/SunlightRiskCard.test.tsx src/components/TierBSignalsCard.test.tsx src/components/LivabilityDetailView.test.tsx src/components/AttentionSummary.test.tsx src/utils/sunlightAnalysis.test.ts src/utils/standardsBenchmark.test.ts
```

Before commit, still run the project gates:

```bash
cd backend && ruff check . && pytest -x -q -m "not live"
cd frontend && npm run build && npm run test
```

Done when:

- A future code change cannot reintroduce the audited misleading semantics without a targeted test failure.

## Task Criticality Table

| Task name | Criticality |
| --- | --- |
| ~~A01. Add direction, favorability, and precision metadata to neighborhood indicators~~ | Critical |
| ~~A02. Carry mixed-year CBS provenance through the neighborhood contract~~ | High |
| ~~A03. Replace risk comparison label heuristics with an explicit semantic contract~~ | Critical |
| ~~A04. Rename or revalue the air comparison reference row~~ | Critical |
| ~~A05. Move hardcoded risk benchmarks into a versioned provenance artifact~~ | Medium |
| ~~A06. Surface risk-card warning states end to end~~ | Critical |
| ~~A07. Make WHO-linked summary copy depend on raw thresholds, not generic severity~~ | Critical |
| ~~A08. Replace climate WFS heuristics with layer-specific classifiers~~ | Critical |
| ~~A09. Correct sunlight time integration and annual weighting~~ | Critical |
| ~~A10. Make sunlight target-plane semantics visible at the first claim~~ | Critical |
| ~~A11. Remove the TNO label from the current winter roof-hours heuristic~~ | Critical |
| ~~A12. Fix municipality crime fallback denominators and scope labels together~~ | Critical |
| ~~A13. Align crime national baseline, score narrative, and denominator provenance~~ | High |
| ~~A14. Rework livability class, deviation, and legend semantics~~ | High |
| ~~A15. Canonicalize attention severity and asbestos thresholds~~ | High |
| ~~A16. Relabel erfpacht heuristics as municipality-based verification prompts~~ | Medium |
| ~~A17. Expand and document foundation soft-soil fallback coverage~~ | High |
| ~~A18. Remove literal 2026 coupling from seasonal shadow evidence~~ | Low |
| ~~A19. Add a cross-surface semantic regression gate~~ | High |
