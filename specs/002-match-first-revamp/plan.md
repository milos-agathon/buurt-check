# Implementation Plan: Buurt Check Match-First UI Revamp

**Plan Target**: `specs/002-match-first-revamp` | **Date**: 2026-05-15 | **Spec**: `specs/002-match-first-revamp/spec.md`
**Input**: `docs/prd.md`, `docs/context/current_architecture.md`, `docs/ai/implementation_rules.md`, `.specify/memory/constitution.md`, `docs/ai/latest_handoff.md`, `docs/qa/match_first_revamp_traceability.md`, `specs/002-match-first-revamp/spec.md`, and generated checklists under `specs/002-match-first-revamp/checklists/`

**Planning note**: This plan was regenerated with `SPECIFY_FEATURE_DIRECTORY=specs/002-match-first-revamp` because `docs/ai/latest_handoff.md` and `docs/context/current_architecture.md` identify `002-match-first-revamp` as the active planned feature. `.specify/feature.json` currently points to `specs/002-match-first-revamp`; no alternate feature artifact is active for implementation. Phase 0 must verify the pointer/source-of-truth state and complete evidence scaffolding before product behavior work proceeds.

## Summary

Build the PRD's match-first journey in the existing Buurt Check Vite/React SPA and FastAPI backend:

```text
landing hero -> survey intro -> one-question survey -> review ->
backend matching progress -> animated checkmark success ->
Netherlands results map -> selected-neighborhood detail with scoped 3D ->
house click -> existing Dossier -> back to match map
```

The smallest safe technical approach is to keep app-level React state and the custom hash router in `frontend/src/App.tsx`, keep the existing Dossier route/modules, reuse existing match session/vector/job backend services where present, use deterministic weighted scoring, poll backend job status, add one lightweight 2D map dependency only if the current static map surfaces cannot satisfy pan/zoom/polygon/list sync, and reuse plain Three.js patterns only after a selected neighborhood exists.

No product implementation is performed by this plan.

## Technical Context

**Language/Version**: Backend targets Python 3.12 in CI with FastAPI and Pydantic v2. Frontend uses React 19, TypeScript 5.9, Vite 7, Vitest, Testing Library, Playwright, Framer Motion, Three.js, and i18next.

**Primary Dependencies**: Preserve existing FastAPI, httpx async, pydantic-settings, Redis helper, SQLite/Turso/libsql patterns, React, Framer Motion, Three.js, and i18next. Add `leaflet` plus `@types/leaflet` only for Phase 5 if implementation confirms the current projected/static map surfaces cannot meet the PRD's live Netherlands map requirements. Do not add React Router, Redux, Zustand, React Query, Tailwind, CSS-in-JS, `react-three-fiber`, or `drei`.

**Storage**: Existing SQLite/Turso-compatible bootstrap in `backend/app/db.py`. Use existing match tables/services for sessions, survey answers, preference vectors, jobs, result sets, analytics, and seed neighborhood data where already present. Keep transient UI map state in route/query context and `sessionStorage` first; add idempotent backend columns/tables only when required to restore Dossier round trips, refresh recovery, selected-neighborhood layers, or bridge state that cannot be safely restored from existing session/result data.

**Testing**: Backend `ruff check .`, targeted pytest, and non-live pytest. Frontend `npm run build`, Vitest/Testing Library, i18n/copy/a11y guards, and Playwright for map and Dossier round trips.

**Target Platform**: FastAPI web API plus Vite React SPA. Hash routes are the MVP route contract; clean URL support is optional and must not bypass the custom hash parser.

**Project Type**: Full-stack mobile-first web application.

**Performance Goals**:

- Landing hero headline, primary CTA, language switcher, and secondary search link usable within 2.5 seconds on the target mobile profile without live 3D.
- Matching progress polling every 1-2 seconds.
- Target acceptance profiles for map work are mobile Chromium at 390x844 and desktop Chromium at 1366x768; if local hardware or CI differs, record the actual profile in traceability before marking the phase pass.
- First completed results map usable within 3 seconds on both target profiles, with list-to-map and map-to-list selection feedback within 150 ms after local result data is loaded, and pan/zoom input response within 100 ms for already-loaded result geometry.
- Selected-neighborhood detail shows boundary plus 2D fallback or first scoped 3D content within 3 seconds on both target profiles.
- Zero national 3D building requests.

**Constraints**:

- PRD is the product contract.
- Search remains secondary on landing.
- Survey stays one-question-at-a-time.
- Backend run starts only after final review CTA.
- Progress/success/results require persisted session/job/result state.
- All visible copy uses EN/NL translation keys.
- Matching remains deterministic weighted scoring unless real labels and validation evidence are added later.
- Existing Dossier, risk tiles, entitlement, checkout recovery, `quick_brief`, `full_dossier`, and export contracts are preserved.
- EPSG:28992/RD New is canonical for stored geometry; WGS84 values are derived display fields and must be named explicitly.
- Empty/error/fallback data must not be cached as successful data.

**Scale/Scope**: Nine phases, 0 through 8, covering source-of-truth scaffolding, UI shell, survey/vector, backend matching, progress/success, results map, selected-neighborhood 3D, Dossier bridge, and final QA.

## Constitution Check

*GATE: Passed for planning after the 2026-05-15 final analyze pointer fix; Phase 0 must still verify the active source and complete handoff/QA scaffolding before product behavior work.*

| Gate | Requirement | Status / Evidence |
| --- | --- | --- |
| Required inputs read | Read PRD, architecture, implementation rules, constitution, handoff, traceability, specs, and generated checklist. | PASS. Required reading completed before this plan. |
| Product flow | Preserve canonical match-first journey and demote search. | PASS. Phases follow the required journey; search remains `#/search` as a secondary link only. |
| Minimal UI | One decision per onboarding screen; one survey question at a time. | PASS. Phase 1-2 acceptance keeps onboarding free of dashboards, cards, ads, pricing, or exploratory controls. |
| Bilingual by design | All visible copy behind EN/NL keys; stored values stable. | PASS. Phase acceptance includes i18n parity and copy-guard tests. |
| Map performance | No national 3D; provide 2D, reduced-motion, missing-3D, and list fallbacks. | PASS. Phase 5 is 2D results; Phase 6 scopes 3D to selected neighborhood only. |
| Model honesty | No predictive claims without labels/evaluation. | PASS. MVP uses weighted scoring with evidence, confidence, limitations, and `not_validated_no_labels`. |
| Dossier preservation | Keep existing Dossier modules and contracts. | PASS. Phase 7 adds only bridge/context/back action with regression coverage. |
| Accessibility | Keyboard, focus, screen reader, touch, contrast, reduced motion, and non-map alternatives. | PASS. Each UI phase includes accessibility acceptance and tests. |
| Phase testing | Every phase includes verification gates. | PASS. See phase sections below. |
| Context preservation | Preserve survey/session/result/map/language/Dossier return state. | PASS. Map and return context are explicit contracts in Phases 5-7. |
| Traceability | Update traceability and handoff after every implementation phase. | PASS. Every phase lists rows to update and requires `docs/ai/latest_handoff.md` updates. |
| Small safe changes | Avoid framework rewrites and unrelated scope. | PASS. Current stack is preserved; one possible map dependency is justified only if required. |
| Unsupported claims | Avoid perfect fit, safety, happiness, investment certainty, future value, guarantees, and unvalidated probabilities. | PASS. Copy guards are required in Phase 8 and targeted phases. |
| Conflict handling | Document current conflicts and smallest safe approach. | PASS. See Complexity Tracking and Risks. |

## Plan Audit Updates 2026-05-15

This audit keeps the phase boundaries intact and blocks task generation on the gaps that would otherwise produce ambiguous tasks.

**Critical changes required before tasks**:

- Treat `specs/002-match-first-revamp` as the only planned implementation target for this pass; do not generate implementation tasks from any alternate feature directory unless `.specify/feature.json` is intentionally changed in a future formal promotion.
- Keep the canonical PRD flow exactly as written: landing hero -> survey intro -> one-question survey -> review -> backend matching progress -> checkmark success -> Netherlands results map -> selected-neighborhood detail -> house click -> existing Dossier -> back to match map.
- Synchronize `data-model.md` and `contracts/match-first-api.md` with this plan before task generation, especially job terminal states, Dossier return context, stable API operation metadata, and checkout-safe match return parameters.
- Use existing FastAPI/React/hash-route/i18next/Three.js architecture; any new 2D map dependency is Phase 5-only and must be justified against existing static/projected map limitations.
- Preserve the existing Dossier and paid/free/risk-card contracts; match-origin Dossier URLs must use explicit `match_return`, `match_session`, and `match_context` fields, never checkout `session_id`, as match identity.
- Keep MVP model mode as deterministic weighted scoring with `not_validated_no_labels`; predictive probabilities and model-superiority claims remain absent unless future labels, validation, evaluation, and regression tests exist.

**Over-engineered elements simplified**:

- Server persistence of map viewport/list scroll is not mandatory for MVP when route context plus `sessionStorage` satisfies supported Dossier return and refresh cases; a `PATCH /map-state` endpoint is optional and must be justified in Phase 5 or Phase 7.
- Do not introduce SSE/WebSockets, Celery/RQ/ARQ, a new admin UI, account flows, checkout changes, AI chat, listing marketplace scope, or Dossier redesign for this MVP.
- Do not promote old `001` match report/listings/alerts/admin scope into the match-first MVP unless a later plan explicitly separates that work from the PRD journey.

**Missing implementation details now required in generated tasks**:

- Exact file paths, PRD requirement IDs, canonical journey step, acceptance criteria, and verification command for every task.
- API operation metadata for every endpoint: request, response, stable success/error codes, retry behavior, idempotency, cacheability, and language-independent payload keys.
- State-transition coverage for session create failure, answer persistence failure, review vector readback failure, slow matching, fallback, no strong matches, expired jobs, stale/unavailable results, map/building/amenity failures, Dossier bridge failure, no reliable address, Dossier return failure, and session deletion.
- Accessibility and i18n checks inside each phase, not deferred to final QA.
- Phase closure rows for `docs/qa/match_first_revamp_traceability.md` and `docs/ai/latest_handoff.md`, with missing or partial behavior never marked pass.

## Source-Of-Truth Decision

For implementation continuity, `specs/002-match-first-revamp` remains the active plan target because:

- Phase 1 and Phase 2 closure are documented against `002`.
- Phase 3 tasks and backend work are tracked under `002`.
- `docs/context/current_architecture.md` identifies `002` as the active planned feature.
- The prior pointer drift has been resolved by restoring `.specify/feature.json` to `002`; no alternate feature directory is an implementation source for this plan.

The stricter gate feedback is incorporated here as Phase 0 gates and acceptance constraints, especially around API contracts, analytics, data deletion, selected-neighborhood 3D, Dossier preservation, and context restoration.

## Project Structure

### Documentation

```text
docs/
  ai/latest_handoff.md
  qa/match_first_revamp_traceability.md
  context/current_architecture.md

specs/002-match-first-revamp/
  plan.md
  spec.md
  research.md
  data-model.md
  quickstart.md
  contracts/match-first-api.md
  tasks.md
```

### Backend

```text
backend/
  app/api/match.py
  app/db.py
  app/models/match.py
  app/services/match/
    sessions.py
    survey_schema.py
    survey_constants.py
    preference_vector.py
    jobs.py
    scoring.py
    recommendations.py
    results.py
    neighborhood_features.py
    geometry.py
    buildings.py
    amenities.py
    dossier_bridge.py
    instrumentation.py
  tests/
    test_match_sessions.py
    test_match_preference_vector_builder.py
    test_match_jobs.py
    test_match_results_contract.py
    test_match_neighborhood_layers.py
    test_match_dossier_bridge.py
    test_match_instrumentation.py
```

### Frontend

```text
frontend/
  src/App.tsx
  src/routing/hashRoutes.ts
  src/components/match-first/
    MatchFirstLanding.tsx
    HeroMapBackground.tsx
    SurveyIntro.tsx
    SurveyShell.tsx
    SurveyQuestionScreen.tsx
    SurveyReview.tsx
    MatchingProgressScreen.tsx
    MatchSuccessCheckmark.tsx
    ResultsMap.tsx
    RecommendationList.tsx
    RecommendationCard.tsx
    NeighborhoodDetail.tsx
    NeighborhoodBuildingLayer.tsx
    AmenityTags.tsx
    HouseSelectionPanel.tsx
    DossierBackToMatchMap.tsx
  src/services/
    matchFirstApi.ts
    matchFirstAnalytics.ts
    matchSessionStorage.ts
  src/types/matchFirst.ts
  src/i18n/en.json
  src/i18n/nl.json
  src/test/
    match-first-routing.test.tsx
    match-first-survey.test.tsx
    match-first-progress.test.tsx
    match-first-results-map.test.tsx
    match-first-neighborhood-detail.test.tsx
    match-first-dossier-bridge.test.tsx
    match-first-a11y.test.tsx
    match-first-copy-guard.test.ts
  tests/e2e/
    match-first-flow.spec.ts
    match-first-neighborhood-detail.spec.ts
    match-first-dossier-roundtrip.spec.ts
```

## Route Changes

Preserve existing hash routes including `#/search`, `#/address/{vbo_id}`, `#/briefing`, `#/saved`, `#/compare`, `#/settings`, existing `#/match/*`, shared routes, pack routes, and checkout recovery query parameters.

Primary match-first routes:

```text
#/ or #/match                                      landing hero
#/match/session/{session_id}/intro                 survey intro
#/match/session/{session_id}/question/{step}       one-question survey
#/match/session/{session_id}/review                review and final run CTA
#/match/session/{session_id}/run                   matching progress
#/match/session/{session_id}/success               checkmark success
#/match/session/{session_id}/results               Netherlands results map
#/match/session/{session_id}/neighborhood/{id}     selected-neighborhood detail
#/address/{vbo_id}?match_return=...                existing Dossier with return context
```

Compatibility rules:

- Sessionless `#/match/intro`, `#/match/survey`, and `#/match/quiz` bootstrap or recover to a backend-issued session before accepting answers.
- Direct `run`, `success`, `results`, or `neighborhood` routes must read persisted backend state and render neutral recovery when state is missing; they must not imply completion.
- Dossier `session_id` for checkout must not be confused with match session identifiers. Match context uses explicit `match_session`, `match_return`, or encoded `match_context` fields.

## Component Architecture

- `App.tsx`: top-level custom hash routing, journey orchestration, Dossier integration, route focus management. Keep changes narrow.
- `hashRoutes.ts`: route parser/builders and route contracts.
- `MatchFirstLanding` + `HeroMapBackground`: one dominant CTA, secondary address link, lightweight map atmosphere, reduced-motion/static fallback.
- `SurveyIntro`: one brief purpose screen with one start action.
- `SurveyShell` + `SurveyQuestionScreen`: one-question rendering, validation, progress, answer persistence, back/edit, focus.
- Question inputs: single-select, multi-select, budget/rent range, commute slider, anchor input, all using stable answer IDs.
- `SurveyReview`: concise 5-8 item summary and final run gate with backend vector readback.
- `MatchingProgressScreen`: status polling, localized stage messages, slow/failure/fallback retry states.
- `MatchSuccessCheckmark`: branded completion state backed by terminal job/result state.
- `ResultsMap`: 2D Netherlands map, marker/polygon selection, map/list sync, reduced-motion movement.
- `RecommendationList`: complete non-map alternative for selection and detail entry.
- `NeighborhoodDetail`: selected boundary, fit explanation, tradeoffs, amenities, 2D/3D state, house selection.
- `NeighborhoodBuildingLayer`: plain Three.js only, scoped to selected-neighborhood building payloads.
- `DossierBackToMatchMap`: persistent localized action within existing Dossier shell when match origin exists.

## Survey State Management

Use existing app-level React state and focused helpers; do not add a global state library.

- Backend is canonical for session ID, answer version, raw answers, preference vector, job, result set, and any persisted Dossier return context.
- Route/query context plus `sessionStorage` own ephemeral UI map state for MVP unless Phase 5 or Phase 7 proves backend map-state persistence is needed for supported refresh or Dossier-return cases.
- Frontend mirrors in-progress state in `sessionStorage` for resilience and immediate UI restoration.
- Answers store stable `question_key` and answer IDs, never translated labels.
- Answer updates persist immediately before advancing or reviewing.
- Answer-save failure blocks advancement and shows localized accessible retry.
- Direct question routes redirect/render the earliest incomplete required step unless a complete backend session allows review.
- Changing any answer after results marks result state stale and returns to review; matching reruns only after final confirmation.
- Language changes update display copy only and keep stable stored values.

## I18n Strategy

All new or changed visible strings must live in both `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`.

Key namespaces:

```text
matchFirst.landing.*
matchFirst.surveyIntro.*
matchFirst.survey.questions.*
matchFirst.survey.answers.*
matchFirst.survey.validation.*
matchFirst.review.*
matchFirst.progress.*
matchFirst.success.*
matchFirst.results.*
matchFirst.neighborhood.*
matchFirst.dossier.*
matchFirst.failure.*
matchFirst.analyticsLabels.*    # display labels only
match.warning.*                 # stable backend warning codes rendered by frontend
```

Rules:

- No `t(key, "English fallback")` defaults in match-first surfaces.
- Backend returns stable keys/codes, not translated strings.
- Route recovery, service fallback, validation, map labels, amenity tags, Dossier return, analytics display labels, and tests all require EN/NL parity.

## API Endpoints

Use existing `/api/match` where possible. Endpoint contracts must define request bodies, response bodies, stable success/error codes, retry behavior, idempotency, cacheability, and language-independent payload keys before implementation.

```text
POST   /api/match/sessions
GET    /api/match/sessions/{session_id}
PATCH  /api/match/sessions/{session_id}/answers
DELETE /api/match/sessions/{session_id}
POST   /api/match/sessions/{session_id}/run
GET    /api/match/sessions/{session_id}/status
GET    /api/match/sessions/{session_id}/results
GET    /api/match/neighborhoods/{neighborhood_id}
GET    /api/match/neighborhoods/{neighborhood_id}/map-layers
GET    /api/match/neighborhoods/{neighborhood_id}/buildings
GET    /api/match/neighborhoods/{neighborhood_id}/amenities
POST   /api/match/dossier/from-building
POST   /api/match/analytics
```

Optional only if route/query context plus `sessionStorage` cannot satisfy supported return/refresh cases:

```text
PATCH  /api/match/sessions/{session_id}/map-state
```

Caching:

- Session, status, result, bridge, and failure responses are `no-store` unless a specific safe cache contract is documented.
- Map/layer/building/amenity cache keys include every response-affecting parameter, including `session_id`, `result_set_id`, `neighborhood_id`, `bounds_rd`, `lod`, `limit`, data version, selected-neighborhood scope, and preference/vector version where relevant.
- Empty/error/stale/fallback responses are not cached as successful data.

Before tasks are generated, `contracts/match-first-api.md` must list operation metadata for each endpoint: request shape, response shape, stable success/error codes, retry behavior, idempotency semantics, cacheability, and language-independent payload keys.

## Preference Vector Builder

The vector builder lives in backend match services and consumes persisted raw answers.

Required vector fields:

- `session_id`
- `language`
- `source_answer_version`
- `preference_vector_version`
- `raw_answer_refs`
- hard filters: intent, budget, commute/radius, required anchors, applicable housing constraints
- soft weights: normalized lifestyle and amenity priorities
- avoid/exclusion keys
- anchor context with precision labels and minimization
- housing preferences
- warnings and limitations
- vector/scoring method version

Implementation rules:

- Hard filters stay separate from weighted preferences.
- Budget validation is intent-aware for buy/rent/both.
- Protected traits are rejected or excluded before persistence/scoring.
- Weights are normalized and bounded.
- Exact anchors are minimized; city-level anchors remain acceptable.
- Vector creation/readback is required before run starts.

## Python Matching And Scoring Integration

Use deterministic weighted scoring for MVP.

Backend service responsibilities:

- `sessions.py`: create/read/update/delete sessions, validate answers, persist raw answers and vector metadata.
- `preference_vector.py`: derive stable vectors from answer sets.
- `jobs.py`: create persisted jobs and advance status/stage/progress.
- `neighborhood_features.py`: load seed/official neighborhood feature matrices with source/freshness metadata.
- `scoring.py`: apply hard filters and weighted score components.
- `recommendations.py`: group normal recommendations, near misses, and stretch matches.
- `results.py`: serialize result sets with evidence and map payloads.
- `model_selection.py`: must report weighted scoring unless real labels and validation evidence exist.
- `geometry.py`, `buildings.py`, `amenities.py`: selected-neighborhood layers only.
- `dossier_bridge.py`: building/address resolution into existing Dossier route.
- `instrumentation.py` or `analytics.py`: privacy-safe event persistence.

LLMs may explain already-computed structured results later, but must not create or change score, eligibility, confidence, hard-filter outcomes, reason codes, or source metadata.

## Job Status Model

Separate lifecycle status from progress stage.

Statuses:

```text
created
queued
running
matching_slow
completed
completed_with_fallback
completed_no_strong_matches
failed
expired
cancelled
```

Stages:

```text
created
queued
reading_preferences
building_profile
loading_neighborhood_data
applying_filters
running_models
scoring_tradeoffs
preparing_map
completed
completed_with_fallback
completed_no_strong_matches
failed
expired
```

Rules:

- Polling is MVP default, every 1-2 seconds using backend `poll_after_ms` when provided.
- `running_models` is a stable progress-stage key, not a predictive-model claim.
- Slow threshold is 10,000 ms after the run request is accepted without a terminal job status; the same job continues and emits `match_job_slow` once.
- Completed, fallback, and no-strong-match usable outcomes pass through checkmark success before map results.
- Failed jobs preserve answers and allow retry where the vector is still current.
- Stale or missing result sets render localized recovery instead of fabricated results.

## Matching Output Schema

`MatchResultsResponse` must include:

- `session_id`
- `job_id`
- `result_set_id`
- `preference_vector_version`
- `status`
- `generated_at`
- `runtime_ms`
- `model_mode: weighted_scoring`
- `scoring_version`
- `data_version`
- `evaluation_status: not_validated_no_labels`
- `predictive_probability_available: false`
- `fallback_used`
- `fallback_reason_code`
- `empty_state_code`
- `recommendations[]`
- `near_misses[]`
- `stretch_matches[]`
- `map`
- `limitations[]`

Each recommendation must include:

- `recommendation_id`, `rank`, `neighborhood_id`, `name_key` or source display fields, `municipality`
- `eligibility_status`
- `score` or `fit_score` from 0-100
- `fit_label_key`
- `reason_codes`
- `tradeoff_codes`
- `confidence.score` from 0-100
- `confidence.level_key`: `high`, `medium`, `low`, or `insufficient`
- `confidence.downgrade_reason_codes`
- `component_scores`
- `failed_filters`
- `source_refs`
- `freshness_status`
- `geometry_ref`
- `amenity_refs`
- `limitations`

Predictive probability fields must be absent or explicitly disabled unless future labels, validation data, evaluation results, and regression tests exist.

## Results Map Implementation

Phase 5 implements the first exploratory surface.

- Start centered on the Netherlands for the first completed results view.
- Use the backend `map` payload and recommendation geometry refs.
- Render markers first; add lightweight polygons where available.
- Keep selected recommendation in one state shared by map and list.
- List-to-map selection uses `flyTo` only when reduced motion is false; otherwise `setView`.
- Map-to-list selection highlights and scrolls the corresponding list item.
- Mobile uses a restrained map/list segmented toggle.
- The ranked list remains fully usable without the map.
- No external tile URLs are hardcoded in frontend services; tile config comes from backend config or same-origin proxy if needed.

## Neighborhood 3D Layer Strategy

Phase 6 starts live 3D only after selected-neighborhood entry.

- `GET /map-layers` returns selected boundary, allowed RD New bounds, and layer refs.
- `GET /buildings` requires `neighborhood_id` and `bounds_rd`; backend clips/validates bounds against the selected neighborhood.
- Frontend never requests building data from national results state.
- Viewport paging/LOD is allowed only inside selected-neighborhood bounds.
- Reuse existing plain Three.js cleanup, renderer sizing, device guard, and reduced-motion patterns.
- Missing 3D shows localized explanation and 2D/list fallback.
- Amenity tags are derived from stable preference keys and capped to a concise default set, not all amenities.

## Dossier Bridge Strategy

Preserve existing Dossier modules and routes.

House selection flow:

1. User selects a building/address candidate inside `NeighborhoodDetail`.
2. Frontend calls `POST /api/match/dossier/from-building` with session, neighborhood, building/coordinate, result/vector, and return context.
3. Backend returns `resolved`, `candidates`, `manual_required`, or `unavailable` using stable codes.
4. Resolved VBO opens existing `#/address/{vbo_id}` with match-return context.
5. Existing Dossier loads normally.
6. Persistent localized Back to match map action appears when match context exists.
7. Back restores results/neighborhood state, map center/zoom, list scroll, mobile mode, selected result/house, language, and stale-result state without rerunning matching unless preferences changed.

Route-safety rule: match-origin Dossier links must not write the match session ID into the checkout `session_id` query parameter. Use `match_session` for match identity and preserve any existing checkout `session_id`, `report`, `buyer_resume`, and `lookup` query values unchanged.

Dossier regression protection:

- On-screen Dossier remains free.
- `quick_brief` remains free.
- `full_dossier` still requires server-side buyer/address entitlement before first download.
- Entitlement scope remains `buyer_key + vbo_id`.
- Frontend risk tiles remain Noise, Air, Climate only.
- Sunlight remains paid-report/PDF evidence and must not become a frontend risk tile.

## Analytics Events

Use stable event names and privacy-safe properties. Names should align with existing implementation where present; use aliases only with explicit migration notes.

Required events:

```text
match_landing_cta_shown
match_landing_cta_clicked
match_secondary_address_link_clicked
match_language_changed
match_survey_intro_shown
match_survey_started
match_survey_question_shown
match_survey_answer_saved
match_survey_answer_save_failed
match_survey_validation_failed
match_survey_back_clicked
match_survey_abandoned
match_session_resumed
match_session_create_failed
match_review_viewed
match_review_edit_clicked
match_review_vector_readback_failed
match_survey_completed
match_survey_completion_duration_recorded
match_final_run_cta_clicked
match_job_queued
match_job_running
match_job_slow
match_job_completed
match_job_completed_with_fallback
match_job_completed_no_strong_matches
match_job_failed
match_success_checkmark_shown
match_results_map_opened
match_results_unavailable
match_results_map_interacted
match_results_confidence_sufficient
match_no_strong_matches_shown
match_map_layer_failed
match_recommendation_selected
match_map_feature_selected
match_neighborhood_detail_opened
match_amenity_tag_toggled
match_3d_loaded
match_missing_3d_fallback_shown
match_building_layer_failed
match_amenity_layer_failed
match_3d_interacted
match_house_selected
match_house_checked_count_updated
match_no_reliable_address_shown
match_dossier_opened
match_dossier_bridge_failed
match_back_to_map_clicked
match_back_to_map_return_success
match_dossier_return_failed
match_context_restored
match_results_marked_stale
match_rerun_confirmed
match_session_expired
match_session_delete_requested
match_session_delete_succeeded
match_session_delete_failed
match_quality_feedback_submitted
```

Privacy rules:

- Payloads may include stable IDs, step numbers, stable question keys, route keys, job/result IDs, neighborhood IDs, result rank, stage/status keys, confidence level, fallback/error codes, runtime, and bucket keys.
- Payloads must not include translated labels, free-text answers, exact anchors, precise household/budget details beyond buckets, names, emails, or protected traits.

## Accessibility Implementation

- Route changes move focus to the screen heading or validation alert.
- Survey inputs use semantic radio/checkbox/button/input patterns.
- Validation and sync errors use localized `role="alert"` or live regions.
- Progress uses `role="status"` and friendly stage copy without fake precision.
- Success checkmark has text equivalent and static reduced-motion variant.
- Results map has a complete keyboard-accessible ranked list alternative.
- Map marker actions are mirrored by list controls.
- Touch targets meet mobile requirements.
- Hero/map text contrast is verified across image/fallback backgrounds.
- Motion checks `prefers-reduced-motion` for hero drift, transitions, progress, checkmark, map fly-to, and 3D camera.

## Implementation Phases

### Phase 0: Source-Of-Truth, Handoff, And QA Scaffolding

**Objective**: Resolve planning drift and establish the evidence scaffolding before further behavior work.

**Files likely to change**:

- `.specify/feature.json`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `specs/002-match-first-revamp/plan.md`
- `specs/002-match-first-revamp/tasks.md`
- `specs/002-match-first-revamp/contracts/match-first-api.md`

**Explicit non-goals**:

- No product behavior implementation.
- No Dossier rewrite.
- No dependency installation.
- No map engine selection beyond documented decision gates.

**Acceptance criteria**:

- One active implementation source is documented and verified: `.specify/feature.json` points to `002`, or a future formal promotion includes its own plan/tasks.
- Imported review gates are either resolved, carried into `002` traceability, or explicitly marked as blockers.
- `docs/ai/latest_handoff.md` names the next smallest safe step.
- `docs/qa/match_first_revamp_traceability.md` has rows ready for Phases 3-8 and does not mark missing implementation as pass.
- API contract gaps for retry/idempotency/cacheability are listed before implementation.

**Tests to run**:

- Documentation checks only: `git diff -- specs/002-match-first-revamp/plan.md docs/ai/latest_handoff.md docs/qa/match_first_revamp_traceability.md`
- Optional grep checks for unresolved clarification placeholders.
- No product tests required unless implementation files change.

**Traceability rows to update**:

- Add "Phase 0 planning/source-of-truth" row.
- Link generated checklist gates `CHK-P0-001` through `CHK-P0-018`.
- Mark source-of-truth status as missing/partial/pass with evidence.
- Record that no PRD behavior was implemented in Phase 0.

**Rollback risk**: Low. Documentation and metadata only. If pointer changes cause tooling confusion, revert only the pointer/plan metadata after documenting the chosen active source.

### Phase 1: UI Shell And Route Cleanup

**Objective**: Preserve the documented closed Phase 1 behavior and keep the app's first screen match-first while maintaining legacy routes.

**Files likely to change**:

- `frontend/src/App.tsx`
- `frontend/src/routing/hashRoutes.ts`
- `frontend/src/components/match-first/MatchFirstLanding.tsx`
- `frontend/src/components/match-first/HeroMapBackground.tsx`
- `frontend/src/components/TabBar.tsx`
- `frontend/src/components/TopBar.tsx`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/src/test/match-first-routing.test.tsx`
- `frontend/src/components/match-first/MatchFirstLanding.test.tsx`

**Explicit non-goals**:

- Do not replace the custom router.
- Do not remove search.
- Do not build the live results map.
- Do not add a heavy live 3D hero.

**Acceptance criteria**:

- Root and `#/match` show one dominant match CTA.
- Address search is only a small secondary route/link.
- Language switcher works before survey.
- Hero has reduced-motion/static fallback.
- Existing Dossier/search/shared/pack/match compatibility routes still parse.
- Invalid match routes recover to match flow, not search-first primary action.

**Tests to run**:

- `cd frontend && npm run test -- src/test/match-first-routing.test.tsx src/components/match-first/MatchFirstLanding.test.tsx`
- `cd frontend && npm run test -- src/test/match-i18n.test.ts src/test/match-first-copy-guard.test.ts`
- `cd frontend && npm run build`

**Traceability rows to update**:

- FR-L1 to FR-L6.
- Constitution I, II, III, IV, VII.
- PRD Acceptance 1-3 and 16-17 where touched.
- Handoff entry with commands, residual risks, and next step.

**Rollback risk**: Medium. Route parser changes can break Dossier/checkout recovery. Rollback by restoring route parser/builders and landing wiring while leaving translations harmlessly unused.

### Phase 2: Survey And Preference Vector

**Objective**: Preserve and extend the documented closed Phase 2 flow: backend-issued sessions, one-question survey, answer persistence, validation, review, and vector readiness.

**Files likely to change**:

- `frontend/src/App.tsx`
- `frontend/src/components/match-first/SurveyIntro.tsx`
- `frontend/src/components/match-first/SurveyShell.tsx`
- `frontend/src/components/match-first/SurveyQuestionScreen.tsx`
- `frontend/src/components/match-first/SurveyReview.tsx`
- `frontend/src/components/match-first/surveyQuestions.ts`
- `frontend/src/components/match-first/surveyValidation.ts`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchSessionStorage.ts`
- `frontend/src/types/matchFirst.ts`
- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `backend/app/services/match/sessions.py`
- `backend/app/services/match/survey_schema.py`
- `backend/app/services/match/preference_vector.py`

**Explicit non-goals**:

- Do not start matching before final review CTA.
- Do not show more than one question at a time.
- Do not store translated answer labels.
- Do not build results map or Dossier bridge.

**Acceptance criteria**:

- Survey intro appears before the first question.
- Survey has 10-12 one-question steps plus review.
- Progress, back, validation, persistence, keyboard completion, and refresh recovery work.
- Server-issued session is required before answers are accepted.
- Review blocks run if backend vector is stale, missing, or mismatched.
- Preference vector contains hard filters, normalized weights, raw answer refs, versions, locale, warnings, and no protected scoring traits.

**Tests to run**:

- `cd frontend && npm run test -- src/test/match-first-survey.test.tsx src/components/match-first/SurveyShell.test.tsx src/components/match-first/SurveyReview.test.tsx`
- `cd frontend && npm run test -- src/services/matchFirstApi.test.ts src/services/matchSessionStorage.test.ts src/test/match-i18n.test.ts src/test/match-first-a11y.test.tsx`
- `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_preference_vector_builder.py tests/test_match_survey_schema.py tests/test_match_db_schema.py`
- `cd frontend && npm run build`

**Traceability rows to update**:

- FR-S1 to FR-S7.
- PRD Section 8.3 survey content.
- FR-P1 to FR-P5.
- PRD Acceptance 4-7 and 16.
- Constitution II, III, VII, IX, XIII.
- Handoff entry with any Phase 2 residual risks.

**Rollback risk**: Medium. Session/vector schema changes can affect match endpoints. Rollback by preserving existing schema columns and disabling new survey routes behind neutral recovery, not by deleting user answer data.

### Phase 3: Matching Backend

**Objective**: Verify and complete persisted async matching with deterministic scoring, result persistence, evidence-rich output, fallback states, and status polling.

**Files likely to change**:

- `backend/app/api/match.py`
- `backend/app/db.py`
- `backend/app/models/match.py`
- `backend/app/services/match/jobs.py`
- `backend/app/services/match/scoring.py`
- `backend/app/services/match/recommendations.py`
- `backend/app/services/match/results.py`
- `backend/app/services/match/model_selection.py`
- `backend/app/services/match/neighborhood_features.py`
- `backend/app/services/match/instrumentation.py`
- `backend/tests/test_match_jobs.py`
- `backend/tests/test_match_results_contract.py`
- `backend/tests/test_match_hard_filters.py`
- `backend/tests/test_match_model_honesty.py`

**Explicit non-goals**:

- Do not add Celery/RQ/ARQ unless polling/in-process jobs fail a documented requirement.
- Do not expose predictive probabilities.
- Do not use LLMs to score or rank.
- Do not cache empty/error responses as successful results.

**Acceptance criteria**:

- `POST /run` creates a job only for a complete current vector.
- Job status is persisted and pollable.
- Status/stage transitions cover queued, running, slow, completed, fallback, no-strong-match, failed, expired.
- Results include the full evidence contract and stable error/fallback codes.
- Hard-filter failures are excluded from normal top matches and separated as near/stretched matches where shown.
- `model_mode` is `weighted_scoring`; predictive probability is unavailable.

**Tests to run**:

- `cd backend && ruff check .`
- `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_preference_vector_builder.py tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py`
- `cd backend && pytest -x -q -m "not live"` before closing broad backend phase.

**Traceability rows to update**:

- FR-M1 to FR-M7.
- PRD Sections 14-15, 19.3, 20.2, 21.1, 21.3, 21.4, 27.1.
- PRD Acceptance 7, 18.
- Constitution V, VIII, X, XIII, XV.
- Handoff entry with commands and next frontend integration step.

**Rollback risk**: Medium-high. Job/result schema changes affect future phases. Rollback by leaving tables in place, disabling run endpoint or returning stable retryable codes, and preserving existing older `/api/match/*` endpoints.

### Phase 4: Progress And Success States

**Objective**: Wire review CTA to real backend run/status/results, show friendly progress, failure/fallback recovery, and a branded checkmark only after persisted completion.

**Files likely to change**:

- `frontend/src/App.tsx`
- `frontend/src/components/match-first/MatchingProgressScreen.tsx`
- `frontend/src/components/match-first/MatchSuccessCheckmark.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/types/matchFirst.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/src/test/match-first-progress.test.tsx`
- `frontend/src/components/match-first/MatchSuccessCheckmark.test.tsx`

**Explicit non-goals**:

- Do not show fake local progress.
- Do not route to success/results without backend terminal state.
- Do not expose technical logs or raw model internals.
- Do not add SSE/WebSocket unless polling is proven insufficient.

**Acceptance criteria**:

- Review final CTA calls `POST /run`.
- `#/run` polls backend status and maps stage keys to localized copy.
- Slow, failed, completed-with-fallback, and completed-no-strong-matches states preserve answers and show accessible recovery.
- Checkmark appears for completed usable result states before results map.
- Reduced-motion success is static or near-static.
- Direct success route with no backend completion renders neutral recovery.

**Tests to run**:

- `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/components/match-first/MatchSuccessCheckmark.test.tsx`
- `cd frontend && npm run test -- src/services/matchFirstApi.test.ts src/test/match-first-a11y.test.tsx src/test/match-i18n.test.ts`
- `cd frontend && npm run build`

**Traceability rows to update**:

- PRD Sections 7 Phase 4-5, 14.4-14.6, 17.3-17.4, 21.1, 21.3, 21.4.
- PRD Acceptance 8-9, 16-18.
- Constitution VII, XIII, XV.
- Trace failed/blocked tests honestly.
- Handoff next step should become Phase 5 results map.

**Rollback risk**: Medium. Bad route wiring can imply false completion. Rollback by restoring neutral run/success placeholders while keeping backend endpoints intact.

### Phase 5: Results Map

**Objective**: Show completed recommendations first on a Netherlands-centered map with ranked list, synchronized selection, mobile map/list mode, and non-map alternative.

**Files likely to change**:

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/App.tsx`
- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/components/match-first/RecommendationList.tsx`
- `frontend/src/components/match-first/RecommendationCard.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/types/matchFirst.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/src/test/match-first-results-map.test.tsx`
- `frontend/tests/e2e/match-first-flow.spec.ts`

**Explicit non-goals**:

- Do not start in selected-neighborhood zoom unless restoring explicit saved selection.
- Do not load 3D buildings.
- Do not show all amenities.
- Do not add a dashboard or unrelated metrics to results.

**Acceptance criteria**:

- Results route fetches completed result set and handles stale/unavailable states.
- First completed map opens on Netherlands orientation.
- List and map selection synchronize both ways.
- Selecting a result does not rerun matching.
- Mobile map/list mode persists.
- Keyboard users can inspect and select every recommendation from the list.
- Confidence, reasons, tradeoffs, and limitations are visible without unsupported claims.

**Tests to run**:

- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/match-first-copy-guard.test.ts src/test/match-i18n.test.ts`
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-flow.spec.ts`
- `cd frontend && npm run build`

**Traceability rows to update**:

- PRD FR-R1 to FR-R7.
- PRD Sections 7 Phase 6, 8.8, 11, 16.2, 20.3, 21.
- PRD Acceptance 10-11, 16-18.
- Constitution IV, VII, IX, XIV, XV.
- Handoff next step should become Phase 6 selected-neighborhood detail.

**Rollback risk**: Medium-high if a new map dependency is added. Rollback by preserving non-map ranked list and disabling map pane behind localized map-unavailable fallback.

### Phase 6: Neighborhood 3D Detail

**Objective**: Let users inspect a selected neighborhood with boundary, fit explanation, preference-aware amenities, selected-neighborhood-only 3D/2D building context, and house selection.

**Files likely to change**:

- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `backend/app/services/match/geometry.py`
- `backend/app/services/match/buildings.py`
- `backend/app/services/match/amenities.py`
- `backend/tests/test_match_neighborhood_layers.py`
- `frontend/src/App.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/components/match-first/NeighborhoodBuildingLayer.tsx`
- `frontend/src/components/match-first/AmenityTags.tsx`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/tests/e2e/match-first-neighborhood-detail.spec.ts`

**Explicit non-goals**:

- Do not load national 3D buildings.
- Do not load buildings before selected-neighborhood route.
- Do not use `react-three-fiber` or `drei`.
- Do not make the selected-neighborhood page a full listing marketplace.

**Acceptance criteria**:

- Detail opens only from selected result or explicit saved selection.
- Boundary and selected-neighborhood context render before 3D.
- Building requests require `neighborhood_id` and clipped RD New bounds.
- Backend rejects out-of-bounds/national building requests.
- Missing 3D shows localized 2D/list fallback.
- Amenity tags are preference-aware, source-backed, and capped to a concise default set.
- House selection is possible where reliable address candidates exist.
- Performance budget is measured on named target profiles.

**Tests to run**:

- `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx`
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/match-first-map-performance.test.tsx`
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-neighborhood-detail.spec.ts`
- Canvas/screenshot checks for nonblank 3D or 2D fallback where applicable.

**Traceability rows to update**:

- PRD FR-N1 to FR-N6.
- PRD Sections 7 Phase 7, 8.9, 12, 16.3, 16.4, 21.2.
- PRD Acceptance 12-13, 16-18.
- Constitution IV, VII, IX, XV.
- Handoff next step should become Phase 7 Dossier bridge.

**Rollback risk**: High. 3D and map layers can affect performance. Rollback by disabling 3D layer and retaining selected boundary, ranked list, 2D fallback, amenities, and Dossier selection where possible.

### Phase 7: Dossier Bridge

**Objective**: Resolve selected houses/buildings into the existing Dossier and restore match map state through a persistent Back to match map action.

**Files likely to change**:

- `backend/app/api/match.py`
- `backend/app/services/match/dossier_bridge.py`
- `backend/tests/test_match_dossier_bridge.py`
- `frontend/src/App.tsx`
- `frontend/src/components/match-first/DossierBackToMatchMap.tsx`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchSessionStorage.ts`
- `frontend/src/types/matchFirst.ts`
- `frontend/src/test/match-first-dossier-bridge.test.tsx`
- `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts`
- Existing Dossier tests only where regression coverage is needed.

**Explicit non-goals**:

- Do not redesign Dossier modules.
- Do not change buyer/address entitlement semantics.
- Do not alter checkout recovery except to preserve match context safely.
- Do not add Sunlight as a frontend risk tile.

**Acceptance criteria**:

- Reliable building/address selection opens existing `#/address/{vbo_id}`.
- Candidate/manual/no-address fallback is localized and recoverable.
- Dossier displays persistent Back to match map in loading, empty, error, and normal states when match context exists.
- Back restores session, result set, selected neighborhood/result/house, map center, zoom, list scroll, mobile mode, language, and stale-result state.
- Returning does not rerun matching unless preferences changed.
- User can inspect another house after returning.
- Existing Dossier viewer, risk cards, entitlement, checkout, and export tests still pass.

**Tests to run**:

- `cd backend && pytest -q tests/test_match_dossier_bridge.py tests/test_export_entitlement.py`
- `cd frontend && npm run test -- src/test/match-first-dossier-bridge.test.tsx`
- `cd frontend && npm run test -- src/components/DossierSheet.test.tsx src/components/RiskTilesGrid.test.tsx src/components/ExportBottomSheet.test.tsx` where tests exist.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts`

**Traceability rows to update**:

- PRD FR-D1 to FR-D5.
- PRD Sections 7 Phase 8, 8.10, 13, 21.5, 27.5.
- Dossier/risk-card contract.
- PRD Acceptance 14-15 and 16.
- Constitution VI, VII, IX, XI, XV.
- Handoff next step should become Phase 8 final QA.

**Rollback risk**: High. Dossier flows include payment/export contracts. Rollback by disabling house-to-Dossier bridge entry while keeping existing Dossier and search routes untouched.

### Phase 8: Accessibility, Analytics, Failure States, And Final QA

**Objective**: Close cross-cutting acceptance for accessibility, analytics, failure states, privacy-safe telemetry, copy/model honesty, performance, traceability, and deployment readiness.

**Files likely to change**:

- `frontend/src/test/match-first-a11y.test.tsx`
- `frontend/src/test/match-first-fallbacks.test.tsx`
- `frontend/src/test/match-first-copy-guard.test.ts`
- `frontend/src/test/match-first-context-preservation.test.tsx`
- `frontend/src/test/match-first-map-performance.test.tsx`
- `frontend/src/services/matchFirstAnalytics.ts`
- `backend/app/services/match/instrumentation.py`
- `backend/tests/test_match_first_analytics_api.py`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `specs/002-match-first-revamp/quickstart.md`

**Explicit non-goals**:

- Do not add an MVP admin UI.
- Do not add account, checkout, payment, marketplace, or AI chat scope.
- Do not mark acceptance rows pass without evidence.

**Acceptance criteria**:

- All required fallback states are localized, accessible, and non-deceptive.
- Analytics covers required funnel, job, map, detail, Dossier, failure, fallback, deletion, and feedback events.
- Analytics payloads pass privacy filters.
- Copy guard blocks unsupported claims and hard-coded visible copy.
- Accessibility checks cover landing, survey, review, progress, success, results, detail, house selection, Dossier return, reduced motion, and non-map alternatives.
- Full canonical smoke path works in EN/NL and reduced motion.
- Traceability maps every PRD acceptance criterion to files, tests/manual verification, status, residual risks, and next steps.

**Tests to run**:

- `cd backend && ruff check .`
- `cd backend && pytest -x -q -m "not live"`
- `cd frontend && npm run build`
- `cd frontend && npm run test`
- `cd frontend && npm run test:a11y`
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-flow.spec.ts tests/e2e/match-first-neighborhood-detail.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts`
- `cd frontend && npm run test:perf:e2e` or documented targeted map performance check where available.

**Traceability rows to update**:

- PRD Acceptance 1-18.
- Spec SC-001 through SC-016 plus imported review gates for copy/model honesty, privacy/deletion, map performance, and context preservation.
- Generated checklist `CHK-P0-001` through `CHK-P0-018`.
- All Constitution gates.
- Handoff final status, commands, failures, residual risks, and next smallest safe step.

**Rollback risk**: Low-medium. Most work is tests/docs/telemetry/fallback polish, but analytics changes can affect event consumers. Rollback by disabling new analytics events while preserving UI fallbacks and tests.

## Testing Strategy

Use targeted tests within phases and broad gates before phase closure.

Backend gates:

```bash
cd backend && ruff check .
cd backend && pytest -q tests/test_match_sessions.py tests/test_match_preference_vector_builder.py
cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py
cd backend && pytest -q tests/test_match_neighborhood_layers.py tests/test_match_dossier_bridge.py
cd backend && pytest -x -q -m "not live"
```

Frontend gates:

```bash
cd frontend && npm run build
cd frontend && npm run test -- src/test/match-first-routing.test.tsx
cd frontend && npm run test -- src/test/match-first-survey.test.tsx
cd frontend && npm run test -- src/test/match-first-progress.test.tsx
cd frontend && npm run test -- src/test/match-first-results-map.test.tsx
cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx
cd frontend && npm run test -- src/test/match-first-dossier-bridge.test.tsx
cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/match-i18n.test.ts src/test/match-first-copy-guard.test.ts
cd frontend && npm run test:e2e -- tests/e2e/match-first-flow.spec.ts tests/e2e/match-first-neighborhood-detail.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts
```

Manual verification:

- Full canonical path on mobile and desktop.
- Dutch and English.
- Reduced motion enabled.
- Map failure/list-only mode.
- Missing 3D.
- No reliable address.
- Dossier round trip and second-house selection.

## Migration And Deployment Steps

1. Resolve active SpecKit source-of-truth before further implementation.
2. Keep database changes idempotent in `backend/app/db.py`; never destructively migrate match or Dossier tables.
3. Add/extend backend match endpoints before enabling frontend routes that depend on them.
4. Add any map dependency and lockfile changes only in Phase 5 with documented justification.
5. Route external basemap/provider settings through backend config; do not hardcode external URLs in frontend services.
6. Preserve existing hash routes as the MVP deployment contract.
7. Deploy backend compatibility endpoints before frontend map/detail/Dossier bridge routes where possible.
8. Monitor match job failures, fallback rate, no-strong-match rate, source freshness, map-layer failures, building/amenity failures, Dossier bridge failures, and back-to-map return success.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Competing feature-source drift creates conflicting plans. | Phase 0 resolves the active source and folds stricter review gates into one traceability file. |
| Generated plan artifacts drift from `plan.md`. | Keep `data-model.md` and `contracts/match-first-api.md` synchronized before task generation, especially job states, API operation metadata, cache/idempotency rules, and Dossier return context. |
| `App.tsx` is a high-risk integration point. | Keep it to orchestration/routing; place UI/API/state details in focused modules. |
| Current frontend lacks a live 2D map engine. | Add the smallest viable map dependency only in Phase 5 after confirming existing surfaces cannot satisfy the PRD. |
| Leaflet uses WGS84 while RD New is canonical. | Backend stores RD New and emits explicitly named WGS84 display geometry for the frontend. |
| In-process background jobs can be interrupted. | Persist job/result state, mark stale running jobs retryable/expired, and defer a real queue until runtime evidence requires it. |
| Seed/mock data can look too authoritative. | Surface data version, source freshness, confidence, limitations, and `not_validated_no_labels`. |
| 3D performance can regress mobile UX. | Load selected-neighborhood-only, clip bounds server-side, page/LOD inside selected neighborhood, and keep 2D/list fallback. |
| Dossier bridge can destabilize paid/export behavior. | Add only context/back action and bridge entry; run entitlement/export/risk-card regressions. |
| I18n drift can introduce hard-coded copy. | Enforce EN/NL parity and no-default-string copy guards in every UI phase. |
| Analytics can leak sensitive preferences. | Use stable keys, buckets, and sanitization; prohibit translated labels, exact anchors, free text, protected traits, and precise personal data. |

## Complexity Tracking

| Complexity | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Possible `leaflet` + `@types/leaflet` dependency in Phase 5 | The repo has no production pan/zoom/polygon map library, and the PRD requires a live Netherlands map with synchronized list/marker/polygon selection. | Current static/projected map surfaces cannot meet pan/zoom/list sync/accessibility requirements; custom map engine is higher risk. |
| Persisted match jobs and result sets | Progress, refresh recovery, checkmark/results gating, and Dossier return require real backend state. | Browser-only or synchronous `/quiz` style calls cannot prove progress state or restore after navigation. |
| Selected-neighborhood geometry/building/amenity APIs | The PRD requires scoped 3D and preference-aware detail layers. | Reusing address-level Dossier 3D endpoints directly cannot provide selected-neighborhood map/list/detail contracts or enforce national 3D prohibition. |

Rejected MVP complexity: always-on backend persistence for every map pan/zoom/list-scroll change. Route/query context plus `sessionStorage` is the default; backend map-state persistence is added only if Phase 5/7 evidence shows it is required for supported refresh or Dossier-return restoration.

## Post-Design Constitution Re-Check

The design remains compliant after incorporating the stricter generated checklist:

- Search remains secondary.
- Survey remains one-question-at-a-time.
- Backend run/result states are gated by final confirmation and persisted state.
- Weighted deterministic scoring is the MVP model mode.
- 3D is selected-neighborhood-only.
- Dossier is preserved with route context/back action only.
- EN/NL translation keys are required for every visible surface.
- Accessibility, failure states, analytics, traceability, and latest handoff updates are phase closure requirements.
