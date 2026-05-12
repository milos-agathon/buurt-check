# Tasks: Buurt Check Match-First UI Revamp

**Input**: Design documents from `specs/002-match-first-revamp/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/match-first-api.md`, `docs/prd.md`, `docs/context/current_architecture.md`, `.specify/memory/constitution.md`

**Tests**: Tests are required for every phase. Use backend pytest/ruff, frontend Vitest/build, Playwright, accessibility checks, and map-performance verification according to the touched acceptance criteria.

**Organization**: Tasks are grouped by the eight implementation phases in `plan.md`. Phases 1-7 map to User Stories 1-7 from `spec.md`; Phase 8 covers cross-cutting accessibility, analytics, failure states, and final QA.

## Format

`- [ ] [TaskID] [P?] [Story?] [PRD: requirement/section] [Journey: step] Description with exact file path. Validation: command or acceptance check.`

## Phase 1: UI Shell And Route Cleanup - US1 Start Match-First Journey

**Goal**: The root experience becomes match-first with one dominant neighborhood CTA, a lightweight map hero, language switcher, preserved legacy routes, and address search demoted to a secondary text link.

**Independent Test**: Open `/` and `#/match` in Dutch and English, verify only the match CTA is dominant, search remains available through a text link, reduced-motion/static hero is usable, and existing hash routes still parse.

- [ ] T001 [P] [US1] [PRD: FR-L1, FR-L2, Section 24 AC1-AC3] [Journey: landing hero] Add route and landing hierarchy tests in `frontend/src/test/match-first-routing.test.tsx` and `frontend/src/components/match-first/MatchFirstLanding.test.tsx`. Validation: `cd frontend && npm run test -- src/test/match-first-routing.test.tsx src/components/match-first/MatchFirstLanding.test.tsx` fails before implementation and asserts root/`#/match`, dominant CTA, and demoted search link.
- [ ] T002 [P] [US1] [PRD: FR-L4, Section 26] [Journey: landing hero] Add initial `matchFirst.landing.*`, `matchFirst.common.*`, and route-label keys to `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`. Validation: `cd frontend && npm run test -- src/test/i18n-completeness.test.ts src/test/match-i18n.test.ts` reports EN/NL parity for new keys.
- [ ] T003 [P] [US1] [PRD: FR-L1, FR-L5, FR-L6] [Journey: landing hero] Create `frontend/src/components/match-first/HeroMapBackground.tsx` and `frontend/src/components/match-first/HeroMapBackground.css` with lightweight static/canvas map atmosphere and reduced-motion/static fallback. Validation: component test in `frontend/src/components/match-first/HeroMapBackground.test.tsx` verifies no live 3D or national building request is triggered.
- [ ] T004 [US1] [PRD: FR-L1, FR-L2, FR-L3, FR-L4] [Journey: landing hero] Create `frontend/src/components/match-first/MatchFirstLanding.tsx` and `frontend/src/components/match-first/MatchFirstLanding.css` with one primary CTA, secondary `#/search` text link, and existing language switcher behavior. Validation: T001 tests confirm search is not an equal card, button, tab, or mode.
- [ ] T005 [US1] [PRD: Section 6.1, Section 6.2, Section 24 AC1-AC3] [Journey: landing hero] Extend `frontend/src/App.tsx` route types, `parseRoute`, `parseHashRoute`, `parseLocationRoute`, and `buildHashRoute` for the match-first landing while preserving all legacy hash routes. Validation: T001 includes fixtures for `#/search`, `#/address/{vbo_id}`, `#/briefing`, existing `#/match/*`, shared, and pack routes.
- [ ] T006 [US1] [PRD: Section 6.1, Section 27.3] [Journey: landing hero] Update root route handling in `frontend/src/App.tsx` so `/` resolves to the match-first landing unless checkout/Dossier recovery query parameters require the existing recovery path. Validation: T001 verifies checkout recovery route parsing still builds `#/briefing` or `#/address/{vbo_id}` as before.
- [ ] T007 [US1] [PRD: FR-L2, FR-L4, Section 20.1] [Journey: landing hero] Add match-first landing analytics helpers in `frontend/src/services/matchAnalytics.ts` or `frontend/src/services/matchFirstAnalytics.ts` for `match_first_landing_shown`, `match_first_cta_clicked`, and `match_first_search_link_clicked`. Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts` verifies stable event names and no translated labels.
- [ ] T008 [US1] [PRD: A11Y-1 to A11Y-5, FR-L5] [Journey: landing hero] Add focus, contrast, keyboard, touch-target, and reduced-motion coverage for the landing in `frontend/src/test/match-first-a11y.test.tsx`. Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx`.
- [ ] T009 [US1] [PRD: Section 23 Phase 1] [Journey: landing hero] Wire `MatchFirstLanding` and `HeroMapBackground` into the `matchLanding` screen in `frontend/src/App.tsx` and remove first-screen search dominance without deleting `AddressSearch`. Validation: `cd frontend && npm run build` and T001/T008 pass.
- [ ] T010 [US1] [PRD: FR-L6, Section 21] [Journey: landing hero] Add hero animation load-failure fallback behavior in `frontend/src/components/match-first/HeroMapBackground.tsx`. Validation: `HeroMapBackground.test.tsx` simulates failed media/canvas setup and verifies headline/CTA/search link remain usable.

## Phase 2: Survey And Preference Vector - US2 Complete One-Question Survey

**Goal**: Users move from intro through a 10-12 step one-question survey with progress, back/edit behavior, persistence, validation, bilingual copy, and a review screen that does not start matching until final confirmation.

**Independent Test**: Start a session, answer questions one at a time, refresh mid-survey, change an answer, switch language, and verify stable raw answer IDs and a valid preference vector preview.

- [ ] T011 [P] [US2] [PRD: FR-S1 to FR-S7, Section 24 AC4-AC6] [Journey: survey intro/one-question survey] Add survey UI tests in `frontend/src/test/match-first-survey.test.tsx` for one visible question, progress bar, back button, validation, refresh persistence, and language switching. Validation: `cd frontend && npm run test -- src/test/match-first-survey.test.tsx` fails until survey behavior exists.
- [ ] T012 [P] [US2] [PRD: FR-P1 to FR-P5] [Journey: survey/review] Add backend session and answer tests in `backend/tests/test_match_sessions.py` covering `POST /api/match/sessions`, `GET /api/match/sessions/{session_id}`, and `PATCH /api/match/sessions/{session_id}/answers`. Validation: `cd backend && pytest -q tests/test_match_sessions.py` fails before endpoints exist.
- [ ] T013 [P] [US2] [PRD: FR-P1 to FR-P5, Section 19.3] [Journey: review] Add preference vector tests in `backend/tests/test_match_preference_vector_builder.py` for raw answer refs, hard filters, normalized weights, locale keys, and protected-trait exclusion. Validation: `cd backend && pytest -q tests/test_match_preference_vector_builder.py` fails before builder changes exist.
- [ ] T014 [US2] [PRD: FR-P1 to FR-P5] [Journey: survey/review] Extend Pydantic contracts in `backend/app/models/match.py` for `MatchSession`, `SurveyAnswerSet`, answer validation, preference vector metadata, and stable error codes. Validation: T012/T013 import models without Pydantic mutable-default or schema errors.
- [ ] T015 [US2] [PRD: FR-S4, FR-P4, Section 27.5] [Journey: survey] Add idempotent `match_sessions` and `match_survey_answers` DB tables plus indexes in `backend/app/db.py`. Validation: `cd backend && pytest -q tests/test_match_db_schema.py tests/test_match_sessions.py` confirms schema creation is repeatable.
- [ ] T016 [US2] [PRD: FR-S4, FR-S5, FR-P4] [Journey: survey] Implement match session CRUD and answer validation in `backend/app/services/match/sessions.py`. Validation: T012 verifies create/read/patch behavior, answer version increments, required validation, and stale-results marking.
- [ ] T017 [US2] [PRD: FR-P1 to FR-P5, Section 19.3, Section 27.1] [Journey: review] Implement stable preference vector derivation in `backend/app/services/match/preference_vector.py` or extend `backend/app/services/match/preferences.py` to build from `SurveyAnswerSet`. Validation: T013 verifies hard filters, weights, raw answer refs, method version, and no translated labels.
- [ ] T018 [US2] [PRD: Section 14.3, FR-M1] [Journey: survey/review] Add session create/read/patch endpoints to `backend/app/api/match.py` without changing existing `/api/match/quiz` behavior. Validation: `cd backend && pytest -q tests/test_match_api_quiz.py tests/test_match_sessions.py`.
- [ ] T019 [P] [US2] [PRD: FR-S6, FR-P5, Section 26] [Journey: survey] Add survey question config in `frontend/src/components/match-first/surveyQuestions.ts` using stable question/answer IDs and translation keys only. Validation: `cd frontend && npm run test -- src/test/match-first-survey.test.tsx src/test/match-i18n.test.ts`.
- [ ] T020 [P] [US2] [PRD: FR-S6, FR-P5] [Journey: survey/review] Add TypeScript contracts in `frontend/src/types/matchFirst.ts` for session, answers, questions, validation, vector preview, and route context. Validation: `cd frontend && npm run build` catches strict TypeScript compatibility.
- [ ] T021 [US2] [PRD: Section 14.3, FR-S4, FR-M1] [Journey: survey/review] Create `frontend/src/services/matchFirstApi.ts` for create session, get session, patch answers, and vector/review fetch helpers. Validation: `cd frontend && npm run test -- src/services/matchFirstApi.test.ts`.
- [ ] T022 [US2] [PRD: FR-S4, Section 27.5, Constitution IX] [Journey: survey] Create `frontend/src/services/matchSessionStorage.ts` to mirror in-progress session ID, answer version, locale, step, and stale-result flags in `sessionStorage`. Validation: `cd frontend && npm run test -- src/services/matchSessionStorage.test.ts`.
- [ ] T023 [US2] [PRD: Section 7 Phase 1, FR-S7] [Journey: survey intro] Create `frontend/src/components/match-first/SurveyIntro.tsx` and CSS with one short purpose screen and one start CTA. Validation: T011 verifies no dashboard, chart, feature grid, pricing, or unrelated card appears.
- [ ] T024 [US2] [PRD: FR-S1 to FR-S7] [Journey: one-question survey] Create `frontend/src/components/match-first/SurveyShell.tsx`, `SurveyQuestionScreen.tsx`, and CSS to render exactly one question, one progress indicator, localized validation, and back behavior. Validation: T011 asserts only one question heading is present per step.
- [ ] T025 [US2] [PRD: FR-S6] [Journey: one-question survey] Add input components in `frontend/src/components/match-first/SingleSelectQuestion.tsx`, `MultiSelectQuestion.tsx`, `BudgetRangeQuestion.tsx`, `CommuteSliderQuestion.tsx`, and `AnchorLocationQuestion.tsx`. Validation: T011 verifies required, optional, single, multi, range, slider, and city/anchor inputs with keyboard operation.
- [ ] T026 [US2] [PRD: FR-M1, Section 7 Phase 3] [Journey: review] Create `frontend/src/components/match-first/SurveyReview.tsx` and CSS showing concise stable-key answer summary and a single final run CTA. Validation: T011 verifies no run API call occurs before this CTA.
- [ ] T027 [US2] [PRD: FR-S1 to FR-S7, Section 6.1] [Journey: survey intro/one-question survey/review] Add match-first session routes and state wiring in `frontend/src/App.tsx` for `#/match/session/{session_id}/intro`, `/question/{step}`, and `/review`. Validation: T001 and T011 verify route restoration and legacy route compatibility.
- [ ] T028 [US2] [PRD: Section 20.1, Section 20.2, Section 19.1] [Journey: survey] Emit privacy-safe survey analytics from `frontend/src/services/matchFirstAnalytics.ts` for intro shown, started, question shown, answer saved, abandonment, completion, and review shown. Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts` rejects translated labels, exact anchors, and free text.
- [ ] T029 [US2] [PRD: A11Y-1 to A11Y-5, FR-S5] [Journey: one-question survey] Add focus management, live validation region, semantic radio/checkbox controls, and touch-target CSS in `SurveyShell.tsx`, input components, and `SurveyShell.css`. Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/keyboard-navigation.test.tsx`.
- [ ] T030 [US2] [PRD: Section 26, FR-S6] [Journey: survey intro/one-question survey/review] Add all survey intro, question, answer, validation, and review keys to `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`. Validation: `cd frontend && npm run test -- src/test/i18n-completeness.test.ts src/test/i18n-accessibility.test.tsx`.

## Phase 3: Matching Backend - US3 Confirm And Run Matching

**Goal**: The backend creates a current preference vector only after the review CTA, starts a persisted pollable job, runs deterministic weighted scoring, stores results, and returns ranked neighborhoods with reason codes, tradeoffs, confidence, geometry refs, source/freshness metadata, and no predictive-probability claims.

**Independent Test**: Complete a session, call `/run`, poll `/status`, fetch `/results`, and verify results are deterministic scored recommendations with model honesty metadata.

- [ ] T031 [P] [US3] [PRD: FR-M1 to FR-M5, Section 14.5] [Journey: review/backend matching] Add backend job lifecycle tests in `backend/tests/test_match_jobs.py` for run confirmation, incomplete answers 409, persisted stage transitions, stale-job recovery, and retryable failure. Validation: `cd backend && pytest -q tests/test_match_jobs.py` fails before job service exists.
- [ ] T032 [P] [US3] [PRD: FR-M3 to FR-M7, Section 15.3, Section 27.1] [Journey: backend matching/results] Add result contract tests in `backend/tests/test_match_results_contract.py` for rank, fit score, reason codes, tradeoffs, confidence, geometry refs, source freshness, `model_mode: weighted_scoring`, and disabled predictive probability. Validation: `cd backend && pytest -q tests/test_match_results_contract.py`.
- [ ] T033 [P] [US3] [PRD: FR-P2, FR-M5, Section 21.1] [Journey: backend matching/results] Add hard-filter and near-miss tests in `backend/tests/test_match_scoring.py` or `backend/tests/test_match_hard_filters.py`. Validation: hard-filter failures never appear as normal top matches.
- [ ] T034 [US3] [PRD: Section 14.5, Data Model MatchJob/MatchResultSet] [Journey: backend matching] Extend `backend/app/models/match.py` with `MatchJob`, `MatchJobStatusResponse`, `MatchRunResponse`, `MatchResultsResponse`, recommendation confidence, geometry ref, fallback, and metadata schemas. Validation: T031/T032 import schemas and validate example payloads from `contracts/match-first-api.md`.
- [ ] T035 [US3] [PRD: FR-M2, Section 14.5, Section 27.5] [Journey: backend matching] Add idempotent `match_jobs` and `match_result_sets` tables plus indexes in `backend/app/db.py`. Validation: `cd backend && pytest -q tests/test_match_db_schema.py tests/test_match_jobs.py`.
- [ ] T036 [US3] [PRD: FR-M1, FR-M2, Section 14.4] [Journey: backend matching/progress] Implement persisted job orchestration in `backend/app/services/match/jobs.py` using FastAPI background or in-process async execution with real stage updates. Validation: T031 verifies status is not frontend-faked and survives readback.
- [ ] T037 [US3] [PRD: FR-M3, FR-M4, Section 15.1] [Journey: backend matching] Extend `backend/app/services/match/recommendations.py` and `backend/app/services/match/scoring.py` to consume the match-first preference vector and return ranked scored candidates. Validation: T032/T033 verify deterministic score, eligibility, components, and reasons.
- [ ] T038 [US3] [PRD: FR-M4, Section 15.3, Section 27.1] [Journey: backend matching/results] Implement result serialization in `backend/app/services/match/results.py` with data version, source refs, limitations, geometry refs, confidence downgrade reasons, and `predictive_probability_available: false`. Validation: T032 confirms no predictive probability or objective-best fields leak into response.
- [ ] T039 [US3] [PRD: FR-M6, Section 14.6, Section 21.4] [Journey: backend matching/progress] Add fallback and failure handling in `backend/app/services/match/jobs.py` so deterministic scoring can return `completed_with_fallback` and public errors use stable codes only. Validation: T031 verifies internal error class is not returned and answers remain retryable.
- [ ] T040 [US3] [PRD: Section 14.3] [Journey: review/backend matching/results] Add `POST /api/match/sessions/{session_id}/run`, `GET /api/match/sessions/{session_id}/status`, and `GET /api/match/sessions/{session_id}/results` in `backend/app/api/match.py`. Validation: `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py`.
- [ ] T041 [US3] [PRD: Section 20.2, Section 20.5] [Journey: backend matching] Extend `backend/app/services/match/instrumentation.py` event allowlist for match-first job queued, running, completed, failed, and fallback events. Validation: `cd backend && pytest -q tests/test_match_instrumentation.py`.
- [ ] T042 [US3] [PRD: Constitution V, Section 27.1, Section 24 AC18] [Journey: backend matching/results] Add model-honesty regression tests in `backend/tests/test_match_model_honesty.py` and user-facing metadata checks in `frontend/src/test/match-first-model-honesty.test.ts`. Validation: backend and frontend tests fail if predictive probability, perfect fit, or objective best claims are introduced.
- [ ] T043 [US3] [PRD: Section 23 Phase 3] [Journey: backend matching/results] Run backend quality gates for Phase 3. Validation: `cd backend && ruff check .` and `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_preference_vector_builder.py tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_model_honesty.py`.

## Phase 4: Progress And Success States - US4 Follow Friendly Progress To Results

**Goal**: Users see localized progress backed by backend job state, slow/failure/fallback retry states, and a branded checkmark only after completion.

**Independent Test**: Start a job, mock each status stage, verify progress copy maps from backend keys, failure/fallback preserves answers, reduced-motion is usable, and success routes to results only after completion.

- [ ] T044 [P] [US4] [PRD: Section 14.4, Section 14.5, Section 17.3] [Journey: matching progress] Add progress polling tests in `frontend/src/test/match-first-progress.test.tsx` for stage mapping, polling interval, terminal state, failure, fallback, and retry. Validation: `cd frontend && npm run test -- src/test/match-first-progress.test.tsx`.
- [ ] T045 [P] [US4] [PRD: Section 17.4, A11Y-2] [Journey: success checkmark] Add success checkmark tests in `frontend/src/components/match-first/MatchSuccessCheckmark.test.tsx` for animated and reduced-motion static paths. Validation: component test verifies text equivalent and no confetti/gamified animation.
- [ ] T046 [US4] [PRD: Section 14.4, Section 14.5] [Journey: matching progress] Add `runMatchSession`, `getMatchStatus`, and `getMatchResults` polling helpers to `frontend/src/services/matchFirstApi.ts`. Validation: `cd frontend && npm run test -- src/services/matchFirstApi.test.ts`.
- [ ] T047 [US4] [PRD: Section 7 Phase 4, Section 14.4] [Journey: matching progress] Create `frontend/src/components/match-first/MatchingProgressScreen.tsx` and CSS with localized stage messages from backend `message_key`, status role, retry action, and no technical logs. Validation: T044 verifies no raw model names, stack traces, or fake precision render.
- [ ] T048 [US4] [PRD: Section 7 Phase 5, Section 17.4] [Journey: success checkmark] Create `frontend/src/components/match-first/MatchSuccessCheckmark.tsx` and CSS with Buurt Check checkmark animation and reduced-motion static state. Validation: T045 passes and screen-reader copy is present.
- [ ] T049 [US4] [PRD: Section 6.1, FR-M1, Section 24 AC7-AC9] [Journey: review/progress/success/results] Wire review CTA, `#/run`, `#/success`, and completed-results transition in `frontend/src/App.tsx` so jobs start only after final CTA and success appears only after completed status. Validation: T011/T044 verify no premature run and correct terminal routing.
- [ ] T050 [US4] [PRD: Section 14.6, Section 21.3, Section 21.4] [Journey: matching progress] Add localized slow, failed, fallback, and retry UI in `MatchingProgressScreen.tsx`. Validation: T044 verifies answers/session are preserved and retry calls `/run` only when the vector is current.
- [ ] T051 [US4] [PRD: Section 26, Section 21] [Journey: matching progress/success] Add progress, success, slow, failed, fallback, and retry keys to `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`. Validation: `cd frontend && npm run test -- src/test/i18n-completeness.test.ts src/test/match-first-progress.test.tsx`.
- [ ] T052 [US4] [PRD: A11Y-2, A11Y-4, Section 17.3] [Journey: matching progress/success] Add focus management and live-region announcements for progress and success in `MatchingProgressScreen.tsx`, `MatchSuccessCheckmark.tsx`, and `frontend/src/test/match-first-a11y.test.tsx`. Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx`.
- [ ] T053 [US4] [PRD: Section 20.2, Section 20.5] [Journey: matching progress/success] Emit progress, fallback, failure, retry, and success analytics in `frontend/src/services/matchFirstAnalytics.ts`. Validation: analytics tests verify stable status/stage keys and no translated labels.

## Phase 5: Results Map - US5 Explore Ranked Neighborhood Results

**Goal**: Completed results open on a Netherlands-centered 2D map with ranked list, markers/polygons, list/map synchronization, mobile map/list mode, and non-map keyboard alternative.

**Independent Test**: Fetch completed results, open map, select recommendations from list and map, switch mobile modes, refresh, and verify no match rerun occurs.

- [ ] T054 [P] [US5] [PRD: FR-R1 to FR-R7, Section 16.2] [Journey: Netherlands results map] Add results map tests in `frontend/src/test/match-first-results-map.test.tsx` for Netherlands initial bounds, list selection, map feature selection, mobile map/list toggle, route state, and no match rerun. Validation: `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`.
- [ ] T055 [P] [US5] [PRD: Section 7 Phase 6, Section 24 AC10-AC11] [Journey: Netherlands results map] Add Playwright flow test in `frontend/tests/e2e/match-first-flow.spec.ts` covering progress completion to results map and selecting a neighborhood. Validation: `cd frontend && npm run test:e2e -- tests/e2e/match-first-flow.spec.ts`.
- [ ] T056 [US5] [PRD: Section 16.2, Complexity Tracking] [Journey: Netherlands results map] Add `leaflet` to `frontend/package.json` dependencies and `@types/leaflet` to devDependencies, then update `frontend/package-lock.json`. Validation: `cd frontend && npm install` followed by `cd frontend && npm run build` resolves Leaflet types.
- [ ] T057 [US5] [PRD: FR-R1 to FR-R5, Section 16.2] [Journey: Netherlands results map] Create `frontend/src/components/match-first/ResultsMap.tsx` and CSS with imperative Leaflet setup, Netherlands bounds, markers/polygons, selected feature state, and reduced-motion `setView` fallback. Validation: T054 verifies selection sync and reduced-motion behavior.
- [ ] T058 [P] [US5] [PRD: FR-R2, FR-R6, A11Y-6] [Journey: Netherlands results map] Create `frontend/src/components/match-first/RecommendationList.tsx` and `RecommendationCard.tsx` with keyboard-accessible ranked recommendations, confidence/source summary, and open-neighborhood action. Validation: T054 verifies every recommendation is selectable without map interaction.
- [ ] T059 [US5] [PRD: FR-R4, FR-R5, Section 27.5] [Journey: Netherlands results map] Add map-state save/restore calls to `frontend/src/services/matchFirstApi.ts`, `frontend/src/services/matchSessionStorage.ts`, and `frontend/src/App.tsx`. Validation: T054 verifies selected result, center, zoom, list scroll, and mobile mode survive refresh where feasible.
- [ ] T060 [US5] [PRD: Section 6.1, Section 7 Phase 6] [Journey: Netherlands results map] Add results route rendering for `#/match/session/{session_id}/results` in `frontend/src/App.tsx` and prevent result selection from rerunning matching. Validation: T054/T055 verify no `/run` request happens when selecting list or map features.
- [ ] T061 [US5] [PRD: Section 11, Section 16.2, A11Y-6] [Journey: Netherlands results map] Add mobile map/list segmented toggle and non-map fallback states in `ResultsMap.tsx`, `RecommendationList.tsx`, and CSS. Validation: T054 verifies mobile mode persists and list remains complete if map initialization fails.
- [ ] T062 [US5] [PRD: Section 26, FR-R1 to FR-R7] [Journey: Netherlands results map] Add result map, ranked list, fit score, confidence, source, tradeoff, selection, mobile toggle, and map failure keys to `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`. Validation: `cd frontend && npm run test -- src/test/i18n-completeness.test.ts src/test/match-first-results-map.test.tsx`.
- [ ] T063 [US5] [PRD: A11Y-1, A11Y-4, A11Y-6] [Journey: Netherlands results map] Add accessible announcements and keyboard paths for map/list synchronization in `frontend/src/test/match-first-a11y.test.tsx`. Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx`.
- [ ] T064 [US5] [PRD: Section 20.3] [Journey: Netherlands results map] Emit results opened, recommendation selected, map feature selected, and mobile mode analytics from `ResultsMap.tsx`, `RecommendationList.tsx`, and `frontend/src/services/matchFirstAnalytics.ts`. Validation: analytics tests verify payloads contain stable recommendation/neighborhood IDs only.

## Phase 6: Neighborhood 3D Detail - US6 Inspect Selected Neighborhood And Houses

**Goal**: Selecting a neighborhood opens detail with only that neighborhood highlighted, selected-neighborhood-only 3D houses, preference-aware amenity tags, 2D/missing-3D fallback, and selectable house/address context.

**Independent Test**: Select a neighborhood, verify no building request happens before selection, every building request is scoped to selected-neighborhood bounds, missing 3D falls back to 2D, amenities are preference-aware, and a house can be selected.

- [ ] T065 [P] [US6] [PRD: FR-N1 to FR-N6, Section 16.3] [Journey: neighborhood 3D detail] Add backend neighborhood layer tests in `backend/tests/test_match_neighborhood_layers.py` for summary, map layers, RD New bounds validation/clipping, missing 3D, and no national building path. Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`.
- [ ] T066 [P] [US6] [PRD: FR-N1 to FR-N6, Section 16.3, Section 16.4] [Journey: neighborhood 3D detail] Add frontend detail tests in `frontend/src/test/match-first-neighborhood-detail.test.tsx` for no pre-selection building fetch, selected-neighborhood building fetch, 2D fallback, amenity tag limit, and house selection. Validation: `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx`.
- [ ] T067 [P] [US6] [PRD: Section 16.3, Section 23 Phase 6] [Journey: neighborhood 3D detail] Add Playwright/canvas verification in `frontend/tests/e2e/match-first-neighborhood-detail.spec.ts` checking selected boundary plus nonblank 3D canvas or 2D fallback within the usable-state budget. Validation: `cd frontend && npm run test:e2e -- tests/e2e/match-first-neighborhood-detail.spec.ts`.
- [ ] T068 [US6] [PRD: Section 15.2, FR-N1, FR-N2] [Journey: neighborhood 3D detail] Implement selected neighborhood geometry service in `backend/app/services/match/geometry.py` using EPSG:28992 as canonical and explicitly named WGS84 display coordinates. Validation: T065 verifies coordinate naming and selected-neighborhood boundary refs.
- [ ] T069 [US6] [PRD: Section 16.3, Constitution IV] [Journey: neighborhood 3D detail] Implement selected-neighborhood building service in `backend/app/services/match/buildings.py` that requires `neighborhood_id`, validates/clips `bounds_rd`, applies `limit`/`lod`, and never returns national data. Validation: T065 rejects missing neighborhood ID or out-of-bounds national requests.
- [ ] T070 [US6] [PRD: Section 16.4, FR-N4] [Journey: neighborhood 3D detail] Implement preference-aware amenity service in `backend/app/services/match/amenities.py` with concise default tags derived from stable preference keys. Validation: T065 verifies tag keys, reason codes, and no translated labels in payload.
- [ ] T071 [US6] [PRD: Section 14.3, Section 16.3] [Journey: neighborhood 3D detail] Add `/api/match/neighborhoods/{neighborhood_id}`, `/map-layers`, `/buildings`, and `/amenities` endpoints to `backend/app/api/match.py`. Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`.
- [ ] T072 [US6] [PRD: FR-N1 to FR-N6] [Journey: neighborhood 3D detail] Add neighborhood/detail API functions and types to `frontend/src/services/matchFirstApi.ts` and `frontend/src/types/matchFirst.ts`. Validation: `cd frontend && npm run test -- src/services/matchFirstApi.test.ts src/test/match-first-neighborhood-detail.test.tsx`.
- [ ] T073 [US6] [PRD: FR-N1, FR-N5, Section 7 Phase 7] [Journey: neighborhood 3D detail] Create `frontend/src/components/match-first/NeighborhoodDetail.tsx` and CSS with selected boundary, fit explanation, return-to-results action, and route-state restoration. Validation: T066 verifies detail opens only after selected recommendation and can return to results.
- [ ] T074 [US6] [PRD: FR-N2, Section 16.3, Constitution IV] [Journey: neighborhood 3D detail] Create `frontend/src/components/match-first/NeighborhoodBuildingLayer.tsx` with plain Three.js selected-neighborhood rendering, renderer cleanup, device guards, and no CSS `!important` sizing. Validation: T066/T067 verify no building request before selection and nonblank canvas or fallback after selection.
- [ ] T075 [P] [US6] [PRD: FR-N4, Section 16.4] [Journey: neighborhood 3D detail] Create `frontend/src/components/match-first/AmenityTags.tsx` and CSS with preference-aware concise tags and source/freshness affordance. Validation: T066 verifies default tags reflect selected priorities and remain limited.
- [ ] T076 [P] [US6] [PRD: FR-N5, Section 21.5] [Journey: neighborhood 3D detail] Create `frontend/src/components/match-first/HouseSelectionPanel.tsx` with selectable building/address candidates and no-address fallback options. Validation: T066 verifies candidate/manual-search/return paths render from stable fallback codes.
- [ ] T077 [US6] [PRD: Section 6.1, FR-N1 to FR-N6] [Journey: neighborhood 3D detail] Add `#/match/session/{session_id}/neighborhood/{neighborhood_id}` route parsing, rendering, and state persistence in `frontend/src/App.tsx`. Validation: T054/T066 verify results-to-detail route and refresh restoration.
- [ ] T078 [US6] [PRD: Section 21.2, A11Y-2, A11Y-6] [Journey: neighborhood 3D detail] Add missing-3D, 2D fallback, reduced-motion camera behavior, and keyboard alternative coverage in `NeighborhoodDetail.tsx`, `NeighborhoodBuildingLayer.tsx`, and `frontend/src/test/match-first-a11y.test.tsx`. Validation: T066 and a11y tests pass with mocked unavailable 3D.
- [ ] T079 [US6] [PRD: Section 20.3, Section 20.4] [Journey: neighborhood 3D detail] Emit neighborhood detail opened, amenity tag interacted, buildings loaded, buildings fallback shown, and house selected analytics. Validation: analytics tests verify event payloads contain stable neighborhood/amenity/building IDs and no addresses.

## Phase 7: Dossier Bridge - US7 Open Existing Dossier And Return To Match Map

**Goal**: House selection resolves to the existing `#/address/{vbo_id}` Dossier where possible, no-address cases are recoverable, the Dossier is preserved, and a persistent localized Back to match map action restores prior map context without rerunning matching.

**Independent Test**: Select a house, open Dossier, use Back to match map, verify session/neighborhood/map/list/language state restores, then open another house without restarting survey or rerunning matching.

- [ ] T080 [P] [US7] [PRD: FR-D1 to FR-D5, Section 13] [Journey: house click/existing Dossier] Add backend bridge tests in `backend/tests/test_match_dossier_bridge.py` for resolved VBO, candidate addresses, manual fallback, 16-digit VBO validation, and stable fallback codes. Validation: `cd backend && pytest -q tests/test_match_dossier_bridge.py`.
- [ ] T081 [P] [US7] [PRD: FR-D2 to FR-D5, Section 27.5] [Journey: existing Dossier/back to match map] Add frontend Dossier bridge tests in `frontend/src/test/match-first-dossier-bridge.test.tsx` for route context, persistent back action, state restoration, stale vector handling, and no rerun. Validation: `cd frontend && npm run test -- src/test/match-first-dossier-bridge.test.tsx`.
- [ ] T082 [P] [US7] [PRD: Section 24 AC14-AC15, Section 27.5] [Journey: existing Dossier/back to match map] Add E2E round-trip test in `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts` covering house click to Dossier, Back to match map, preserved selected neighborhood, and second house open. Validation: `cd frontend && npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts`.
- [ ] T083 [US7] [PRD: FR-D1, Section 21.5] [Journey: house click/existing Dossier] Implement `backend/app/services/match/dossier_bridge.py` to resolve building ID or RD coordinate to VBO route target, candidate addresses, or manual fallback. Validation: T080 verifies VBO regex, fallback, and no broken Dossier route.
- [ ] T084 [US7] [PRD: Section 14.3, FR-D1] [Journey: house click/existing Dossier] Add `POST /api/match/dossier/from-building` endpoint to `backend/app/api/match.py`. Validation: `cd backend && pytest -q tests/test_match_dossier_bridge.py tests/test_address_api.py`.
- [ ] T085 [US7] [PRD: FR-D1, FR-D2] [Journey: house click/existing Dossier] Add `resolveDossierFromBuilding` to `frontend/src/services/matchFirstApi.ts` and `HouseSelectionContext`/`DossierReturnContext` types to `frontend/src/types/matchFirst.ts`. Validation: frontend API tests verify resolved, candidates, manual, and unavailable responses.
- [ ] T086 [US7] [PRD: FR-D2 to FR-D5, Constitution VI] [Journey: existing Dossier/back to match map] Create `frontend/src/components/match-first/DossierBackToMatchMap.tsx` and CSS for persistent localized return action shown only when match return context exists. Validation: T081 verifies action appears in Dossier and does not replace Dossier modules.
- [ ] T087 [US7] [PRD: FR-D2 to FR-D5, Section 27.5] [Journey: existing Dossier/back to match map] Extend `frontend/src/App.tsx` route parsing/building for `session_id` and encoded `match_return` on `#/address/{vbo_id}` while preserving checkout `session_id`, `buyer_resume`, `lookup`, and `report` behavior. Validation: T001/T081 verify match return and checkout recovery contexts do not conflict.
- [ ] T088 [US7] [PRD: FR-D4, Constitution IX] [Journey: back to match map] Add return-context save/restore in `frontend/src/services/matchSessionStorage.ts`, `frontend/src/services/matchFirstApi.ts`, and `frontend/src/App.tsx` for session, selected neighborhood, selected house, map center/zoom, list scroll, mobile mode, locale, and vector version. Validation: T081/T082 verify no matching rerun when vector is current and review route when stale.
- [ ] T089 [US7] [PRD: Section 21.5, FR-D1] [Journey: house click/existing Dossier] Wire no-address candidate/manual-search fallback from `HouseSelectionPanel.tsx` through `resolveDossierFromBuilding`. Validation: T066/T081 verify candidates/manual search/return options are localized and recoverable.
- [ ] T090 [US7] [PRD: Constitution VI, Risk card contract, Monetization notes] [Journey: existing Dossier] Add Dossier regression coverage in `frontend/src/components/DossierSheet.test.tsx`, `frontend/src/components/RiskTilesGrid.test.tsx`, and backend `backend/tests/test_export_entitlement.py` to prove Noise/Air/Climate risk tiles, free viewer, `quick_brief`, paid `full_dossier`, entitlement, and checkout recovery remain unchanged. Validation: targeted frontend tests and `cd backend && pytest -q tests/test_export_entitlement.py` pass.
- [ ] T091 [US7] [PRD: Section 26, Section 13] [Journey: existing Dossier/back to match map] Add Dossier bridge, back-to-map, no-address, candidate, stale-results, and return-state keys to `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`. Validation: `cd frontend && npm run test -- src/test/i18n-completeness.test.ts src/test/match-first-dossier-bridge.test.tsx`.
- [ ] T092 [US7] [PRD: Section 20.4] [Journey: existing Dossier/back to match map] Emit house selected, Dossier opened, back-to-map clicked, and second-house Dossier analytics in `frontend/src/services/matchFirstAnalytics.ts`. Validation: analytics tests verify no exact address anchors or translated labels in payloads.

## Phase 8: Accessibility, Analytics, Failure States, And Final QA

**Goal**: Complete cross-flow privacy-safe analytics, localized fallback/empty states, accessibility verification, reduced-motion sweep, map-performance guardrails, context preservation checks, quality gates, and final PRD traceability.

**Independent Test**: Run the quickstart validation commands and manually smoke the full canonical flow from landing to Dossier and back, with Dutch/English, reduced motion, map fallback, and failure states.

- [ ] T093 [P] [PRD: Section 20, Section 19.1] [Journey: all steps] Add backend analytics endpoint tests in `backend/tests/test_match_first_analytics_api.py` for `POST /api/match/analytics`, stable event names, privacy filtering, and rejection/redaction of translated labels, exact anchors, emails, free text, and protected traits. Validation: `cd backend && pytest -q tests/test_match_first_analytics_api.py`.
- [ ] T094 [PRD: Section 20, Section 19.1] [Journey: all steps] Implement `POST /api/match/analytics` in `backend/app/api/match.py` and persistence/sanitization in `backend/app/services/match/instrumentation.py` or `backend/app/services/match/analytics.py` using existing `match_analytics_events` table. Validation: T093 and `cd backend && pytest -q tests/test_match_instrumentation.py` pass.
- [ ] T095 [P] [PRD: Section 21, Section 22.1 item 20] [Journey: all fallback states] Add full fallback-state tests in `frontend/src/test/match-first-fallbacks.test.tsx` for no strong matches, slow backend, failed backend, completed-with-fallback, missing 3D, no reliable address, map init failure, and low-bandwidth hero. Validation: `cd frontend && npm run test -- src/test/match-first-fallbacks.test.tsx`.
- [ ] T096 [PRD: Section 21, Section 26] [Journey: all fallback states] Add or complete localized fallback UI and keys in `MatchingProgressScreen.tsx`, `ResultsMap.tsx`, `NeighborhoodDetail.tsx`, `HouseSelectionPanel.tsx`, `frontend/src/i18n/en.json`, and `frontend/src/i18n/nl.json`. Validation: T095 plus `cd frontend && npm run test -- src/test/i18n-completeness.test.ts`.
- [ ] T097 [P] [PRD: A11Y-1 to A11Y-6, Constitution VII] [Journey: all steps] Add cross-flow accessibility tests in `frontend/src/test/match-first-a11y.test.tsx` for keyboard survey completion, screen-reader labels, focus restoration, touch targets, contrast over hero/map, reduced motion, and non-map alternatives. Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/keyboard-navigation.test.tsx`.
- [ ] T098 [P] [PRD: Section 16.3, Constitution IV, Section 24 AC12] [Journey: results map/neighborhood 3D detail] Add map-performance guard tests in `frontend/src/test/match-first-map-performance.test.tsx` and backend `backend/tests/test_match_neighborhood_layers.py` proving no national 3D request, selected-neighborhood-only bounds, and viewport paging/LOD only inside selected bounds. Validation: targeted frontend/backend tests pass.
- [ ] T099 [P] [PRD: Constitution IX, Section 27.5] [Journey: all navigation states] Add context preservation tests in `frontend/src/test/match-first-context-preservation.test.tsx` for survey answers, session ID, selected neighborhood, map state, language, selected house, Dossier return path, and stale-results reroute. Validation: `cd frontend && npm run test -- src/test/match-first-context-preservation.test.tsx`.
- [ ] T100 [P] [PRD: Constitution V, Constitution X, Section 27.1] [Journey: results/progress/detail] Add copy and model-honesty scan tests in `frontend/src/test/match-first-copy-guardrails.test.ts` covering no hard-coded visible copy in match-first components and no claims of perfect fit, safety, happiness, investment certainty, future value, objective best, or predictive probability. Validation: `cd frontend && npm run test -- src/test/match-first-copy-guardrails.test.ts`.
- [ ] T101 [PRD: Section 22.2, Constitution VI] [Journey: existing Dossier/all steps] Run Dossier preservation regression tests and document any conflict in `specs/002-match-first-revamp/implementation-notes.md` if a requirement cannot be met with a scoped change. Validation: `cd frontend && npm run test -- src/components/DossierSheet.test.tsx src/components/RiskTilesGrid.test.tsx src/components/ExportBottomSheet.test.tsx` and `cd backend && pytest -q tests/test_export_entitlement.py tests/test_reports_api.py`.
- [ ] T102 [PRD: Section 23 Phase 8, Section 24] [Journey: all steps] Run frontend quality gates for build, unit tests, accessibility, and selected E2E. Validation: `cd frontend && npm run build`, `cd frontend && npm run test`, `cd frontend && npm run test:e2e -- tests/e2e/match-first-flow.spec.ts tests/e2e/match-first-neighborhood-detail.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts`.
- [ ] T103 [PRD: Section 23 Phase 8, Section 24] [Journey: backend matching/neighborhood/Dossier bridge] Run backend quality gates for lint and non-live tests. Validation: `cd backend && ruff check .` and `cd backend && pytest -x -q -m "not live"`.
- [ ] T104 [PRD: Section 24 AC1-AC18, Constitution Implementation Gates] [Journey: full canonical journey] Create `specs/002-match-first-revamp/acceptance-traceability.md` mapping each PRD acceptance criterion 1-18 and spec success criterion SC-001 to SC-016 to implemented tests, commands, and residual risks. Validation: every acceptance criterion has at least one automated test or documented manual verification reference.
- [ ] T105 [PRD: Section 24, quickstart.md] [Journey: full canonical journey] Execute the manual smoke path from `specs/002-match-first-revamp/quickstart.md` and record results in `specs/002-match-first-revamp/acceptance-traceability.md`. Validation: smoke covers landing -> intro -> survey -> review -> progress -> success -> results -> neighborhood detail -> Dossier -> Back to match map in EN/NL and reduced motion.

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 blocks visible match-first entry and route cleanup.
- Phase 2 depends on Phase 1 routes and blocks backend matching because matching requires persisted answers and a current preference vector.
- Phase 3 depends on Phase 2 session/vector contracts and blocks Phase 4 real progress and Phase 5 completed results.
- Phase 4 depends on Phase 3 status/results endpoints.
- Phase 5 depends on Phase 3 result contracts and Phase 4 success routing.
- Phase 6 depends on Phase 5 selected neighborhood state and backend result geometry refs.
- Phase 7 depends on Phase 6 house/building selection context and existing Dossier route compatibility.
- Phase 8 depends on desired implementation phases being complete and verifies the full canonical journey.

### User Story Dependencies

- US1 can start immediately.
- US2 depends on US1 route shell and session entry.
- US3 depends on US2 backend answer and vector persistence.
- US4 depends on US3 job status and result endpoints.
- US5 depends on US3 result schema and US4 completed routing.
- US6 depends on US5 selected recommendation/neighborhood state.
- US7 depends on US6 house selection context.

### Parallel Opportunities

- T001-T003 can run in parallel.
- T011-T013 can run in parallel before Phase 2 implementation.
- Backend Phase 3 tests T031-T033 can run in parallel, then implementation tasks should proceed models -> DB -> services -> endpoints.
- Phase 5 Leaflet setup T056 should complete before map component work, but list component T058 can proceed in parallel with map component T057.
- Phase 6 backend geometry/building/amenity services T068-T070 can be implemented in parallel if write ownership is split by file.
- Phase 7 backend bridge tests T080, frontend bridge tests T081, and E2E scaffold T082 can be prepared in parallel.
- Phase 8 verification tasks T093, T095, T097, T098, T099, and T100 can run in parallel once feature behavior exists.

## Implementation Strategy

### MVP First

1. Complete Phase 1 so the app starts match-first and legacy routes still work.
2. Complete Phase 2 so a user can finish the survey and produce a stable preference vector.
3. Complete Phase 3 so the backend returns honest deterministic recommendations.
4. Complete Phase 4 so the user sees real progress and success.
5. Stop and validate: run Phase 1-4 commands before map/Dossier expansion.

### Incremental Delivery

1. Deliver Phase 5 as the first exploratory result surface with a non-map list fallback.
2. Deliver Phase 6 with selected-neighborhood-only 3D and 2D fallback.
3. Deliver Phase 7 without redesigning Dossier internals.
4. Finish Phase 8 with analytics, accessibility, fallback, performance, and traceability proof.

### Required Quality Gates Before Commit

- Backend: `cd backend && ruff check .`
- Backend: `cd backend && pytest -x -q -m "not live"`
- Frontend: `cd frontend && npm run build`
- Frontend: `cd frontend && npm run test`
- E2E for this feature: `cd frontend && npm run test:e2e -- tests/e2e/match-first-flow.spec.ts tests/e2e/match-first-neighborhood-detail.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts`

## Notes

- Every user-facing string introduced by these tasks must use `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`.
- Matching output must remain framed as deterministic weighted fit scoring unless future labels and validation data are added.
- National 3D building loading is prohibited. Building requests must be selected-neighborhood scoped and validated server-side.
- The existing Dossier, risk tiles, entitlement, export, and checkout recovery behavior must be preserved.
- Stop at phase checkpoints if any validation command fails; document blockers, residual risk, and follow-up condition in `specs/002-match-first-revamp/implementation-notes.md`.
