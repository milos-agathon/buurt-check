# Implementation Plan: Buurt Check Match-First UI Revamp

**Branch**: `002-match-first-revamp` | **Date**: 2026-05-12 | **Spec**: `specs/002-match-first-revamp/spec.md`
**Input**: Feature specification from `specs/002-match-first-revamp/spec.md`, `docs/prd.md`, `docs/context/current_architecture.md`, and `.specify/memory/constitution.md`

**Note**: This plan is planning-only. It does not implement code. Tasks with exact implementation steps are generated separately by `/speckit-tasks`.

## Summary

Build the PRD's match-first journey in the existing Buurt Check SPA without replacing the Dossier: landing hero -> survey intro -> one-question survey -> review -> pollable backend matching -> success checkmark -> Netherlands results map -> selected-neighborhood 3D detail -> house click into existing `#/address/{vbo_id}` Dossier -> persistent back to match map.

The smallest safe approach is to preserve the custom hash router and app-level state model in `frontend/src/App.tsx`, isolate new match-first UI in focused React components and services, add persisted FastAPI session/job/result contracts under the existing `/api/match` area, reuse the current deterministic match scoring and preference-vector code, add one lightweight 2D map dependency for real pan/zoom/polygon behavior, and keep live 3D limited to selected-neighborhood detail using existing plain Three.js patterns.

## Technical Context

**Language/Version**: Backend targets Python 3.12 in CI while `backend/pyproject.toml` allows `>=3.11`; frontend uses React 19.2, TypeScript 5.9, Vite 7.2, and strict build checks.
**Primary Dependencies**: Backend FastAPI, Pydantic v2, pydantic-settings, httpx async, Redis cache, aiosqlite/libsql persistence, existing match services; frontend React, Framer Motion, Three.js, i18next/react-i18next, Testing Library, Vitest, Playwright. Add `leaflet` plus `@types/leaflet` for the 2D results/detail map because the repo has no production map library and the current projected marker component cannot pan, zoom, render polygons, or support map/list synchronization. Do not add React Router, Redux/Zustand/React Query, react-three-fiber, or drei.
**Storage**: Existing SQLite/Turso-compatible DB bootstrap in `backend/app/db.py`; add idempotent match session, survey answer, match job, and match result tables while reusing existing match preference vector, analytics, feedback, report, saved-neighborhood, and seed feature tables.
**Testing**: Backend `ruff check .` and pytest with `not live and not visual and not benchmark`; frontend `npm run build`, Vitest/Testing Library, accessibility tests, and Playwright for the end-to-end match map and Dossier round trip.
**Target Platform**: FastAPI web service plus Vite React SPA, deployed as current web/mobile wrapper artifacts. Hash routes remain the MVP route contract; clean URL rewrites are optional only if implemented with matching custom parser changes.
**Project Type**: Full-stack web app with a React SPA frontend and FastAPI backend.
**Performance Goals**: Landing remains interactive without live national 3D work; match progress polls at 1-2 second cadence; selected-neighborhood detail reaches a usable boundary plus 2D fallback or first 3D building content within 3 seconds on target acceptance profiles; no national 3D building request is made.
**Constraints**: Search stays secondary on first screen; survey shows exactly one question at a time; all new UI text uses EN/NL translation keys; matching output is deterministic weighted fit scoring unless real labels are introduced in a future feature; selected-neighborhood 3D only; existing Dossier risk/export/entitlement contracts remain intact; canonical geometry and building bounds use EPSG:28992 (RD New), with any WGS84 values named explicitly as derived display coordinates for Leaflet.
**Scale/Scope**: Eight implementation phases covering route cleanup, survey, backend matching, progress/success, results map, selected-neighborhood 3D, Dossier bridge, and final accessibility/analytics/failure-state QA.

## Constitution Check

*GATE: Passed before Phase 0 research. Re-checked after Phase 1 design below.*

| Gate | Requirement | Status / Evidence |
|------|-------------|-------------------|
| Required inputs read | Confirm `docs/prd.md` and `docs/context/current_architecture.md` were read before planning. | PASS. Both were read before this plan, along with `specs/002-match-first-revamp/spec.md` and `.specify/memory/constitution.md`. |
| Product flow | Identify the canonical journey step(s) affected and confirm search does not compete with match on the first screen. | PASS. Plan starts with landing hero and demotes search to `#/search` as a secondary text link; Dossier appears only after house selection. |
| Minimal UI | Confirm onboarding keeps one decision per screen and survey screens show exactly one question with progress/back behavior. | PASS. Phase 2 defines a question config and shell that renders one question, one progress indicator, validation, persistence, and back/edit behavior. |
| Bilingual by design | List every new or changed user-facing string surface and confirm Dutch/English translation keys, including validation and fallback messages. | PASS. New surfaces are landing, secondary search link, survey intro/questions/review/validation, progress stages, success checkmark, results map, neighborhood detail, 2D/missing-3D/no-address states, Dossier back action, analytics-visible route labels, and retry/failure states. All use `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json` keys under `matchFirst.*` or stable existing `match.*` warning keys. |
| Map performance | Confirm no national 3D building loading; 3D houses load/render only after neighborhood selection and only within selected-neighborhood bounds; viewport loading is used only for paging/LOD inside that neighborhood; 2D fallback, reduced-motion fallback, and non-map list alternative exist. | PASS. Phase 5 uses 2D Leaflet for national results. Phase 6 requests 3D only from selected-neighborhood endpoints and constrains bounding boxes to that neighborhood. |
| Model honesty | Identify scoring/probability/confidence claims and confirm validated predictive claims are absent unless labels and validation data exist. | PASS. Repo has deterministic seed-backed scoring and no validation labels. MVP exposes `model_mode: weighted_scoring`, `evaluation_status: not_validated_no_labels`, and fit scores, not predictive probabilities. |
| Dossier preservation | Identify any Dossier touchpoints and confirm the smallest safe change, persistent back-to-map action, and regression coverage. | PASS. Phase 7 adds route context and a persistent localized back-to-match-map action around the existing Dossier screen without rewriting Dossier modules, risk cards, entitlement, or export contracts. |
| Accessibility | Confirm keyboard access, screen-reader labels, touch targets, contrast, reduced motion, focus management, and non-map alternatives. | PASS. Each UI phase includes focus management, semantic controls, live regions, reduced-motion behavior, and list alternatives for map interactions. |
| Phase testing | List unit, integration, E2E, accessibility, or map verification required for each affected phase and acceptance criterion. | PASS. Each implementation phase below includes test and validation gates. |
| Context preservation | Confirm survey answers, session ID, selected neighborhood, map state, language, and Dossier return path survive navigation. | PASS. Plan stores session state on the backend plus sessionStorage/localStorage mirrors for in-progress UI state and route recovery. |
| Unsupported claims | Confirm copy and explanations avoid perfect fit, safety, happiness, investment certainty, future value, and other unsupported claims. | PASS. Recommendation copy uses data-backed fit, reason codes, tradeoffs, source freshness, and limitations only. |
| Conflict handling | Document conflicts with the current codebase and propose the smallest safe change. | PASS. Conflicts and mitigations are listed in Complexity Tracking and Risks. |

## Project Structure

### Documentation (this feature)

```text
specs/002-match-first-revamp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── match-first-api.md
└── tasks.md                  # created later by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/
│   │   ├── match.py          # extend existing match router with session/job/result endpoints
│   │   └── address.py        # keep existing Dossier endpoints; only add bridge support if needed
│   ├── db.py                 # idempotent session/job/result tables
│   ├── models/
│   │   └── match.py          # extend existing Pydantic match contracts
│   └── services/
│       └── match/
│           ├── preferences.py
│           ├── scoring.py
│           ├── recommendations.py
│           ├── sessions.py
│           ├── jobs.py
│           ├── results.py
│           ├── geometry.py
│           ├── buildings.py
│           ├── amenities.py
│           └── dossier_bridge.py
└── tests/
    ├── test_match_sessions.py
    ├── test_match_jobs.py
    ├── test_match_results_contract.py
    ├── test_match_neighborhood_layers.py
    └── test_match_dossier_bridge.py

frontend/
├── package.json              # add leaflet runtime dependency and @types/leaflet dev dependency
├── src/
│   ├── App.tsx               # custom hash route additions and orchestration only
│   ├── components/
│   │   └── match-first/
│   │       ├── MatchFirstLanding.tsx
│   │       ├── HeroMapBackground.tsx
│   │       ├── SurveyIntro.tsx
│   │       ├── SurveyShell.tsx
│   │       ├── SurveyQuestionScreen.tsx
│   │       ├── SurveyReview.tsx
│   │       ├── MatchingProgressScreen.tsx
│   │       ├── MatchSuccessCheckmark.tsx
│   │       ├── ResultsMap.tsx
│   │       ├── RecommendationList.tsx
│   │       ├── NeighborhoodDetail.tsx
│   │       ├── NeighborhoodBuildingLayer.tsx
│   │       ├── AmenityTags.tsx
│   │       ├── HouseSelectionPanel.tsx
│   │       └── DossierBackToMatchMap.tsx
│   ├── services/
│   │   ├── matchFirstApi.ts
│   │   ├── matchSessionStorage.ts
│   │   └── matchAnalytics.ts
│   ├── types/
│   │   └── matchFirst.ts
│   ├── i18n/
│   │   ├── en.json
│   │   └── nl.json
│   └── test/
│       ├── match-first-routing.test.tsx
│       ├── match-first-survey.test.tsx
│       ├── match-first-progress.test.tsx
│       ├── match-first-results-map.test.tsx
│       ├── match-first-neighborhood-detail.test.tsx
│       └── match-first-dossier-bridge.test.tsx
└── tests/
    └── e2e/
        ├── match-first-flow.spec.ts
        └── match-first-dossier-roundtrip.spec.ts
```

**Structure Decision**: Use the existing full-stack layout. Keep the custom hash router in `App.tsx`, but isolate new UI, API, state persistence, and map logic in focused frontend modules. Extend the existing backend match domain instead of creating a separate app or service. Add the minimum map dependency required for real 2D map behavior; keep selected-neighborhood 3D on plain Three.js.

## Route Changes

Preserve every existing hash route listed in the spec: `#/search`, `#/address/{vbo_id}`, `#/briefing`, saved/compare/settings, existing `#/match/*`, shared routes, and prebid pack routes.

Add match-first hash routes through the existing parser/buildHashRoute functions in `frontend/src/App.tsx`:

```text
#/match                                      Match-first landing
#/match/session/{session_id}/intro           Survey intro
#/match/session/{session_id}/question/{step} One-question survey
#/match/session/{session_id}/review          Review and final run CTA
#/match/session/{session_id}/run             Polling progress
#/match/session/{session_id}/success         Checkmark completion
#/match/session/{session_id}/results         Netherlands results map
#/match/session/{session_id}/neighborhood/{neighborhood_id}
                                             Selected-neighborhood detail
#/address/{vbo_id}?session_id={session_id}&match_return={encoded_context}
                                             Existing Dossier with return context
```

The root path `/` should resolve to the match-first landing except for existing checkout recovery URLs with `report` and `session_id`. `#/search` remains technically available and is linked from the landing screen as a small secondary text link, not an equal CTA, card, tab, or mode choice. Clean URLs are not required for MVP; if added, update Vercel rewrites and the custom route parser together.

## Component Architecture

The UI is split by journey step, with `App.tsx` responsible only for route parsing, top-level state wiring, and Dossier integration:

- `MatchFirstLanding`: first screen with `HeroMapBackground`, language switcher, one primary CTA, and secondary address-search link.
- `HeroMapBackground`: lightweight pre-rendered/static/canvas atmosphere with `prefers-reduced-motion` fallback; no live national 3D.
- `SurveyIntro`: one short purpose screen and one start CTA.
- `SurveyShell`: owns step progress, back behavior, validation summary, focus management, and persistence calls.
- `SurveyQuestionScreen`: renders one configured question at a time using stable question and answer keys.
- `SurveyReview`: concise answer summary and final run CTA; no backend run starts before this CTA.
- `MatchingProgressScreen`: polls the real job status endpoint and maps backend `stage` keys to localized progress copy.
- `MatchSuccessCheckmark`: branded checkmark with reduced-motion static state and explicit open-map CTA.
- `ResultsMap`: Leaflet-based 2D Netherlands results map with markers/polygons, selected result state, reduced-motion fly behavior, and synchronized list.
- `RecommendationList`: keyboard/screen-reader accessible non-map alternative and source/confidence summary surface.
- `NeighborhoodDetail`: selected-neighborhood boundary, concise fit explanation, preference-aware amenity tags, selected-neighborhood-only 3D/2D layer state, and house selection.
- `NeighborhoodBuildingLayer`: plain Three.js rendering for buildings returned by selected-neighborhood API only; never national data.
- `DossierBackToMatchMap`: persistent localized return action mounted in the Dossier shell when route context indicates match origin.

## Survey State Management

Use app-level `useState` plus a dedicated `useMatchSessionState` hook. Do not introduce Redux, Zustand, React Query, or React Router.

State ownership:

- Backend persists the canonical `MatchSession`, raw `SurveyAnswerSet`, preference vector version, match job state, selected neighborhood, map state, and Dossier return context.
- Frontend keeps a local session mirror in `sessionStorage` for in-progress resilience before or between backend writes.
- Survey answers are stored as stable question IDs and answer IDs, never translated labels.
- Question definitions live in a frontend config module with translation keys, input type, validation rule, and vector mapping hint.
- Every answer update marks downstream derived state stale. A changed preference after results routes the user back to review and requires explicit re-run.
- Language changes update display strings only and preserve answer IDs, vector version, and session state.

## I18n Implementation

All new user-facing text goes through `t()` with keys in both `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`. New key namespace:

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
matchFirst.analyticsLabels.*       # only display labels, never event identifiers
```

Backend responses return stable keys such as `matchFirst.progress.reading_preferences`, `match.warning.map_failed`, and limitation/reason codes. Frontend renders the keys through i18n. Tests must assert key parity between EN and NL and scan changed match-first components for hard-coded visible copy.

## API Endpoints

Contracts are documented in `specs/002-match-first-revamp/contracts/match-first-api.md`. Add endpoints under the current `/api` prefix:

```text
POST   /api/match/sessions
GET    /api/match/sessions/{session_id}
PATCH  /api/match/sessions/{session_id}/answers
POST   /api/match/sessions/{session_id}/run
GET    /api/match/sessions/{session_id}/status
GET    /api/match/sessions/{session_id}/results
PATCH  /api/match/sessions/{session_id}/map-state
GET    /api/match/neighborhoods/{neighborhood_id}
GET    /api/match/neighborhoods/{neighborhood_id}/map-layers
GET    /api/match/neighborhoods/{neighborhood_id}/buildings
GET    /api/match/neighborhoods/{neighborhood_id}/amenities
POST   /api/match/dossier/from-building
POST   /api/match/analytics
```

Existing endpoints such as `/api/match/quiz`, `/api/match/recommendations`, `/api/match/map`, `/api/match/reports`, `/api/match/listings`, `/api/match/alerts`, and `/api/match/saved-neighborhoods` remain valid for current deep links and can be reused internally during the migration.

## Preference Vector Builder

MVP vector generation adapts the existing `backend/app/services/match/preferences.py` logic:

- Build from persisted `SurveyAnswerSet`, not from translated labels.
- Keep hard filters separate from weighted preferences.
- Normalize lifestyle weights to 0-1 and cap visible influence explanations to the most relevant drivers.
- Preserve raw answer references and a `preference_vector_version` hash so stale results are detectable.
- Exclude protected/sensitive demographic traits from score inputs.
- Store `method_version`, `locale`, `source_answer_version`, and warnings.
- Reuse existing feature keys where possible: `calmness`, `green_space` -> `green_access`, `family_fit`, `mobility`, `amenities`, `affordability`, `environmental_quality`, `housing_stock`.

## Python Matching Service Integration

Use deterministic matching for MVP:

- `sessions.py`: create/read/update match sessions and answer sets.
- `jobs.py`: create persisted jobs, advance real status stages, run match orchestration in a FastAPI background task or in-process async task, and mark stale running jobs as retryable failures on service restart.
- `results.py`: serialize recommendation result sets and map payloads.
- `recommendations.py` and `scoring.py`: reuse and extend existing deterministic 0-100 scoring, hard filters, reason codes, tradeoffs, confidence, source freshness, and fallback behavior.
- `providers/seed.py` and future official provider: source neighborhood features. Seed/mock results remain labeled as mock/mixed with limitations.
- `geometry.py`, `buildings.py`, and `amenities.py`: serve selected-neighborhood map layers without national 3D loading.

No predictive model selection ships in this revamp because the repository has no labels or validation dataset. The result schema therefore omits predictive probability fields and includes:

```json
{
  "model_mode": "weighted_scoring",
  "scoring_version": "match-score-v1",
  "evaluation_status": "not_validated_no_labels",
  "predictive_probability_available": false
}
```

## Job Status Model

`MatchJob.status` values:

```text
created
queued
running
completed
completed_with_fallback
failed
cancelled
expired
```

`MatchJob.stage` values used by the progress UI:

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
failed
```

Although the stage `running_models` is retained for stable progress copy, MVP implementation maps it to deterministic weighted scoring and must not imply predictive modeling. Poll every 1-2 seconds from the frontend. Do not add SSE/WebSocket unless future runtime evidence shows polling is insufficient.

## Matching Output Schema

`MatchResultsResponse` contains:

- `session_id`, `job_id`, `result_set_id`, `status`, `generated_at`
- `model_mode`, `scoring_version`, `data_version`, `evaluation_status`
- `predictive_probability_available: false`
- `fallback_used`, `fallback_reason_code`
- `recommendations[]` with rank, neighborhood ID/name/municipality, fit score, category, eligibility, confidence 0-100 plus level key, reason codes, tradeoffs, component scores, failed hard filters, source refs, limitations, freshness, geometry refs, and amenity refs
- `geometry` with Netherlands bounds, selected neighborhood boundary refs, RD New centroid/bounds, explicitly named WGS84 display centroid/bounds for Leaflet, and map layer refs
- `empty_state_code` and `near_misses[]` where hard filters are too restrictive

Confidence describes data quality, source coverage, freshness, geometry reliability, fallback mode, and missing feature impact. It is not predictive probability.

## Results Map Implementation

Use Leaflet imperatively from React components:

- Render Netherlands initial bounds and recommendation features from backend GeoJSON. Canonical source geometry remains EPSG:28992; the API may include explicitly named WGS84 display coordinates for Leaflet.
- Use markers first; use polygons when backend geometry refs can return lightweight neighborhood boundaries.
- Keep selected list item and selected map feature in a single state value.
- Use `map.flyTo` only when `prefers-reduced-motion` is false; otherwise use immediate `setView`.
- Provide a persistent ranked list that can select neighborhoods without touching the map.
- Keep map controls restrained and mobile-first; use map/list segmented toggle on small screens.
- Avoid external tile URLs hardcoded in frontend. If basemap tiles are used, route tile config through backend settings or same-origin proxy.

## Neighborhood 3D Layer Strategy

Live 3D starts only after selecting a neighborhood:

- `GET /api/match/neighborhoods/{id}/map-layers` returns selected boundary, 2D fallback geometry, and allowed RD New bounds.
- `GET /api/match/neighborhoods/{id}/buildings?bounds_rd=...&limit=...&lod=...` validates that requested RD New bounds intersect and are clipped to the selected neighborhood before returning any building features.
- The frontend never requests buildings from national results state.
- The Three.js layer follows current Dossier patterns: explicit loading/error state, renderer sizing without CSS `!important`, device guards, cleanup of controls/renderers/workers, reduced-motion camera behavior, and 2D fallback.
- Missing 3D data shows localized `matchFirst.neighborhood.missing3d` copy while preserving house selection through reliable 2D address candidates when available.

## Dossier Bridge Strategy

Preserve the existing Dossier modules and canonical `#/address/{vbo_id}` route.

House selection flow:

1. User selects a building or address candidate in `NeighborhoodDetail`.
2. Frontend calls `POST /api/match/dossier/from-building` with `session_id`, `neighborhood_id`, `building_id` or coordinate, and selected context.
3. Backend returns a reliable `vbo_id` and route target, or a localized fallback code with nearby address candidates/manual search option.
4. Frontend navigates to `#/address/{vbo_id}?session_id={session_id}&match_return={encoded_context}`.
5. Dossier mounts normally. Only a persistent `DossierBackToMatchMap` action is added when match return context exists.
6. Back action restores session, selected neighborhood or results state, map center/zoom, list scroll/selection, mobile mode, language, and selected house context without rerunning matching unless the preference vector version changed.

Regression tests must verify Noise/Air/Climate risk tiles, free on-screen viewer, `quick_brief`, paid `full_dossier`, entitlement checks, and checkout recovery are not changed by the bridge.

## Analytics Events

Extend existing match analytics with stable event names and privacy-safe payloads:

```text
match_first_landing_shown
match_first_cta_clicked
match_first_search_link_clicked
match_first_survey_intro_shown
match_first_survey_started
match_first_question_shown
match_first_answer_saved
match_first_question_abandoned
match_first_survey_completed
match_first_review_shown
match_first_run_clicked
match_first_job_queued
match_first_job_stage_changed
match_first_job_completed
match_first_job_failed
match_first_job_completed_with_fallback
match_first_success_shown
match_first_results_opened
match_first_recommendation_selected
match_first_map_feature_selected
match_first_mobile_mode_changed
match_first_neighborhood_detail_opened
match_first_amenity_tag_interacted
match_first_buildings_loaded
match_first_buildings_fallback_shown
match_first_house_selected
match_first_dossier_opened
match_first_back_to_map_clicked
match_first_retry_clicked
match_first_quality_feedback_submitted
```

Payloads may include session ID, locale, phase, stable question key, step index, neighborhood ID, recommendation ID, stable status/stage keys, and fallback codes. Payloads must not include translated labels, exact address anchors, free-text answers, names, emails, protected traits, or precise household/budget details beyond stable bucket keys.

## Accessibility Implementation

- Route changes set focus to the screen heading or first invalid field.
- Survey controls use semantic radio/checkbox/button patterns with visible focus, `aria-describedby`, and localized validation in a live region.
- Progress stages use `role="status"` and avoid fake numeric precision.
- Success checkmark includes text equivalent and reduced-motion static state.
- Results map has a keyboard-accessible ranked list alternative, selected state announcements, and non-map controls for opening neighborhood detail.
- Leaflet markers must be reachable or mirrored by list buttons; map-only actions are not required to complete the flow.
- Touch targets meet mobile sizing in survey, map/list controls, amenity tags, house cards, and Dossier back action.
- Hero/map text contrast is verified over fallback and animated backgrounds.
- All motion checks `prefers-reduced-motion`; map fly-to, hero drift, progress animation, and checkmark drawing become static or near-static.

## Implementation Phases

### Phase 1: UI Shell And Route Cleanup

Build the match-first landing, custom hash route additions, root-to-match behavior, language switcher, lightweight hero fallback, and demoted search link. Keep existing match routes and Dossier routes valid.

Acceptance and gates:

- Landing has one dominant match CTA and search as a secondary text link.
- No search-first card/tab/mode competes on first screen.
- Root checkout recovery still routes to Dossier recovery.
- Tests: route parser/buildHashRoute unit tests, landing hierarchy tests, i18n key parity checks, reduced-motion hero test.
- Commands: `cd frontend && npm run build`; targeted Vitest for landing/routing.

### Phase 2: Survey And Preference Vector

Build survey intro, one-question-at-a-time survey, progress, back/edit behavior, answer persistence, review screen, frontend vector preview, and backend answer/session persistence.

Acceptance and gates:

- Exactly one question renders per survey route.
- Required unanswered questions block advancement with localized accessible validation.
- Refresh restores completed answers.
- Language switch preserves stable answer IDs.
- No backend match job starts before review CTA.
- Tests: frontend survey state/validation/persistence/i18n tests; backend session/answer validation tests; vector builder tests for hard filters, weights, raw answer refs, and protected-trait exclusion.

### Phase 3: Matching Backend

Add persisted job lifecycle, run endpoint, polling status, deterministic scoring orchestration, result persistence, result schema, and fallback/error handling.

Acceptance and gates:

- `POST /run` creates a pollable job only for a complete current vector.
- Status transitions are backed by persisted job state.
- Results include ranked neighborhoods, reason codes, tradeoffs, confidence, geometry refs, model/data metadata, and no predictive probabilities.
- Failed advanced path can return `completed_with_fallback` with deterministic scoring.
- Tests: backend pytest for session creation, answer patching, run confirmation, status transitions, stale job handling, scoring, hard filters, no predictive probability, source/freshness metadata.
- Commands: `cd backend && ruff check .`; targeted pytest, then non-live pytest subset.

### Phase 4: Progress And Success States

Build polling progress screen, localized stage messages, slow/failure/fallback states, retry behavior, and checkmark success state.

Acceptance and gates:

- Progress copy maps only from backend stage keys.
- Slow/failure/fallback states preserve answers and allow retry where valid.
- Success checkmark appears after completed job and transitions to results only after completion.
- Reduced-motion state is usable and non-flashy.
- Tests: Vitest for polling state machine, fallback/failure rendering, reduced-motion success, and no fake precision.

### Phase 5: Results Map

Add Leaflet results map, Netherlands initial view, ranked list, marker/polygon rendering, map/list synchronization, mobile map/list toggle, and non-map selection path.

Acceptance and gates:

- Results map opens centered on the Netherlands.
- Selecting list item highlights/focuses map feature and does not rerun matching.
- Selecting map feature highlights list item.
- Mobile mode preserves selection and route state.
- Keyboard users can select every recommendation from the list.
- Tests: Vitest for map/list state, Playwright for route/results round trip, reduced-motion map movement check.

### Phase 6: Neighborhood 3D Detail

Build selected-neighborhood detail route, boundary layer, preference-aware amenity tags, selected-neighborhood-only 3D building loading, 2D/missing-3D fallback, and house selection panel.

Acceptance and gates:

- No building endpoint is called before a neighborhood is selected.
- Every building request includes selected `neighborhood_id` and RD New bounds clipped to that neighborhood.
- National 3D data is never requested or rendered.
- Amenity tags are preference-aware and limited to a concise default set.
- Missing 3D still gives 2D context and house/address selection fallback.
- Tests: backend bounds validation tests; frontend tests proving no pre-selection building fetch; Playwright/canvas checks for nonblank selected 3D or 2D fallback; performance check for 3-second usable state.

### Phase 7: Dossier Bridge

Add house/building-to-address resolver, Dossier route context, persistent Dossier back action, and map state restoration. Do not redesign Dossier modules.

Acceptance and gates:

- Reliable house selection opens existing `#/address/{vbo_id}` Dossier.
- No-address cases show localized candidates/manual-search/return options.
- Dossier shows persistent localized back-to-match-map action when opened from match context.
- Back action restores session, selected neighborhood/results map state, mobile mode, language, list state, and selected house context without rerunning match.
- Existing Dossier risk/export/entitlement behavior passes regression tests.
- Tests: backend bridge tests, frontend Dossier context tests, Playwright Dossier round trip, existing Dossier smoke tests.

### Phase 8: Accessibility, Analytics, Failure States, And Final QA

Complete privacy-safe analytics, localized empty/slow/failed/fallback states, keyboard/screen-reader/focus checks, reduced-motion sweep, map fallback verification, and final quality gates.

Acceptance and gates:

- Analytics event names are stable keys and payloads omit translated labels, exact addresses, free text, and protected traits.
- All new fallback states are localized in EN/NL.
- Core flow passes keyboard navigation and accessibility tests.
- Full quality gates run or any blocked gate is documented with command, blocker, residual risk, and follow-up condition.
- Commands: `cd backend && ruff check .`; `cd backend && pytest -x -q -m "not live"`; `cd frontend && npm run build`; `cd frontend && npm run test`; selected `cd frontend && npm run test:e2e`.

## Migration And Deployment Steps

1. Add backend DB tables idempotently in `backend/app/db.py`; no destructive migration.
2. Add new Pydantic models and services while preserving existing `/api/match/*` contracts.
3. Add `leaflet` and `@types/leaflet`; update lockfile during implementation.
4. Keep hash routes as MVP deployment path, so Vercel rewrites are not required unless clean URLs are explicitly added.
5. Add environment/config entries only for external basemap or geometry providers. Do not hardcode external service URLs in frontend services.
6. Deploy backend before frontend route activation if feature flags are used; otherwise merge by phase with compatibility endpoints in place.
7. Monitor match job failures, fallback rate, source health, map-layer errors, Dossier round-trip events, and selected-neighborhood 3D load timing.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| `App.tsx` is already large and high-risk. | Keep `App.tsx` changes to route parsing and orchestration; put UI/state/API details in focused modules. |
| Current `MatchMap` is not a real map. | Add Leaflet because it is the smallest viable dependency for pan/zoom/markers/polygons; keep 3D separate in Three.js. |
| In-process background jobs are less durable than a worker queue. | Persist all job states, mark stale running jobs retryable, and defer Celery/RQ/ARQ until runtime data proves it necessary. |
| Seed/mock match data can overstate product confidence. | Label mock/mixed data, expose data-quality confidence and limitations, and keep `evaluation_status: not_validated_no_labels`. |
| 3D map can become too heavy. | Load buildings only after selected neighborhood, clip bounds server-side, page/LOD inside selected neighborhood only, and provide 2D fallback. |
| Dossier bridge could destabilize existing report/export flows. | Add only route context and persistent return action; cover Dossier risk/export/entitlement with regression tests. |
| Bilingual drift. | Require EN/NL key parity tests and no hard-coded visible text in new components. |
| Analytics can leak sensitive context. | Use stable event keys and bucketed metadata; reject exact anchors, free text, protected traits, and translated labels. |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Add `leaflet` runtime dependency and `@types/leaflet` dev dependency. | The existing app has no production map library, and current `MatchMap` only projects static markers into percentages. The PRD requires pan/zoom, Netherlands view, marker/polygon selection, fly-to, synchronization, and mobile map/list behavior. | Reusing the current projected marker component cannot meet map acceptance criteria. Building a custom map engine would be higher risk and less accessible for MVP. |
| Add persisted match job/session tables. | The PRD requires pollable real backend state, refresh recovery, and no fake progress. Existing match tables cover vectors/reports/analytics but not resumable sessions and jobs. | Keeping only synchronous `/match/quiz` and `/match/recommendations` cannot support progress, retry, Dossier return context, or refresh recovery. |

## Post-Design Constitution Re-Check

All gates remain PASS after Phase 0 research and Phase 1 design artifact generation. The plan does not start with Dossier redesign, does not make Search visually equal to Match, keeps bilingual translation-key requirements, uses deterministic weighted scoring without predictive probability claims, forbids national 3D loading, includes persistent Back to match map, and includes tests in every phase.
