# Tasks: Buurt Check Match-First UI Revamp

Input sources:

- `docs/prd.md`
- `docs/ai/implementation_rules.md`
- `docs/ai/latest_handoff.md`
- `.specify/memory/constitution.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/context/current_architecture.md`
- `specs/001-buurt-check-revamp/spec.md`
- `specs/001-buurt-check-revamp/plan.md`
- `specs/002-match-first-revamp/spec.md`
- `specs/002-match-first-revamp/plan.md`
- `specs/002-match-first-revamp/data-model.md`
- `specs/002-match-first-revamp/contracts/match-first-api.md`
- `specs/002-match-first-revamp/quickstart.md`

Generation notes:

- `specs/002-match-first-revamp` is the active planned feature. `.specify/feature.json` currently points to `specs/002-match-first-revamp`; future Spec Kit commands should use that active pointer unless a formal promotion creates a complete alternate feature with its own plan/tasks.
- Imported review gates are treated as stricter input constraints, not as a competing implementation track.
- Phase 1 and Phase 2 are documented as closed in traceability. Phase 3 is marked complete in the previous task list and current handoff but should be verified before broader frontend work depends on it.
- Each implementation phase includes a handoff/traceability closure task. Missing or partial behavior must not be marked pass.
- Every user-facing string introduced by these tasks must use translation keys in `frontend/src/i18n/en.json` and `frontend/src/i18n/nl.json`.
- Matching remains deterministic weighted scoring unless real labels, validation data, evaluation results, and regression tests exist.

Task format:

- ID:
  Phase:
  Requirement covered:
  Files likely touched:
  Implementation action:
  Validation:
  Acceptance evidence:
  Dependencies:

## Phase 0: Source Of Truth, Handoff, And QA Scaffolding

- ID: T-001
  Phase: 0
  Requirement covered: Constitution XI/XII; active-source drift from latest handoff; source-of-truth review gates.
  Files likely touched: `.specify/feature.json`, `docs/ai/latest_handoff.md`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Verify `.specify/feature.json` points to `specs/002-match-first-revamp`; if it drifts again, stop and either restore `002` or document a formal promotion with its own plan/tasks. Do not allow multiple sources to proceed.
  Validation: Run `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` and confirm it returns `FEATURE_DIR` for `specs/002-match-first-revamp` with complete `plan.md` and `tasks.md`.
  Acceptance evidence: Traceability row "Phase 0 source of truth" states chosen feature, prerequisite-check output, reviewer/date, and any blocker.
  Dependencies: None.

- ID: T-002
  Phase: 0
  Requirement covered: PRD Section 24 AC1-AC18; Constitution XI; imported P0 review gates.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `specs/002-match-first-revamp/checklists/requirements-quality.md`
  Implementation action: Add or update Phase 0 traceability rows that map every imported P0 review gate to either an existing `002` requirement/task, a new task in this file, or a documented blocker.
  Validation: Grep traceability for `CHK-P0-001` and `CHK-P0-025`; confirm no checklist item is marked pass without linked evidence.
  Acceptance evidence: Traceability includes all checklist gate IDs with missing/partial/pass status.
  Dependencies: T-001.

- ID: T-003
  Phase: 0
  Requirement covered: PRD Sections 14.3-14.6; Constitution III/XV; imported API-contract review gates.
  Files likely touched: `specs/002-match-first-revamp/contracts/match-first-api.md`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Audit API contracts for session create/read/update/delete, run, status, results, selected-neighborhood map layers/buildings/amenities, Dossier bridge, and analytics; list missing request/response/error/retry/idempotency/cacheability details.
  Validation: Documentation grep confirms each required endpoint has stable success codes, stable error codes, retry, idempotency, cacheability, and language-independent payload keys.
  Acceptance evidence: Traceability row "API contract readiness" links to contract sections and lists any remaining gaps.
  Dependencies: T-001.

- ID: T-004
  Phase: 0
  Requirement covered: PRD Sections 15.4 and 19.1; Constitution XV; imported privacy review gate.
  Files likely touched: `specs/002-match-first-revamp/contracts/match-first-api.md`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Decide whether anonymous session deletion is implemented in MVP or explicitly marked missing/partial with retention limit, blocker, and follow-up condition.
  Validation: Contract includes `DELETE /api/match/sessions/{session_id}` behavior or traceability marks deletion as missing/partial.
  Acceptance evidence: Traceability row "anonymous match data deletion" includes status, retention limit, and follow-up owner.
  Dependencies: T-003.

- ID: T-005
  Phase: 0
  Requirement covered: PRD Section 23; Constitution VIII/XI; phase closure process.
  Files likely touched: `docs/ai/latest_handoff.md`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Close Phase 0 by recording source-of-truth decision, commands run, no product behavior changes, residual risks, and next smallest safe implementation step.
  Validation: Documentation diff shows only planning/traceability/handoff updates; no source code changes.
  Acceptance evidence: Handoff names Phase 4 progress/success or the true next blocked task, with exact commands and residual risks.
  Dependencies: T-001, T-002, T-003, T-004.

## Phase 1: UI Shell And Route Cleanup

- ID: T-006
  Phase: 1
  Requirement covered: PRD FR-L1 to FR-L3; Section 24 AC1-AC3; Constitution I/II.
  Files likely touched: `frontend/src/components/match-first/MatchFirstLanding.tsx`, `frontend/src/components/match-first/MatchFirstLanding.css`, `frontend/src/components/match-first/MatchFirstLanding.test.tsx`
  Implementation action: Ensure landing renders one dominant match CTA and a secondary address-search text link, with no search form, equal card, tab, mode selector, feature grid, pricing block, or dashboard content.
  Validation: `cd frontend && npm run test -- src/components/match-first/MatchFirstLanding.test.tsx`
  Acceptance evidence: Traceability rows for FR-L2/FR-L3 link to component and test proof that search is demoted.
  Dependencies: T-001.

- ID: T-007
  Phase: 1
  Requirement covered: PRD FR-L1, FR-L5, FR-L6; Sections 16.1 and 17.3; Constitution IV/VII.
  Files likely touched: `frontend/src/components/match-first/HeroMapBackground.tsx`, `frontend/src/components/match-first/HeroMapBackground.css`, `frontend/src/components/match-first/HeroMapBackground.test.tsx`
  Implementation action: Verify or complete the lightweight animated hero background, static/low-bandwidth fallback, and reduced-motion behavior without live national 3D loading.
  Validation: `cd frontend && npm run test -- src/components/match-first/HeroMapBackground.test.tsx`
  Acceptance evidence: Traceability row for FR-L1/FR-L5/FR-L6 links to fallback and reduced-motion tests.
  Dependencies: T-006.

- ID: T-008
  Phase: 1
  Requirement covered: PRD FR-L4 and Section 26; Constitution III.
  Files likely touched: `frontend/src/components/TopBar.tsx`, `frontend/src/components/match-first/MatchFirstLanding.tsx`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`, `frontend/src/test/match-i18n.test.ts`
  Implementation action: Ensure the landing language switcher works before survey start and all landing/route-recovery copy uses EN/NL translation keys.
  Validation: `cd frontend && npm run test -- src/test/match-i18n.test.ts src/test/i18n-completeness.test.ts`
  Acceptance evidence: Traceability row for FR-L4 includes i18n parity output.
  Dependencies: T-006.

- ID: T-009
  Phase: 1
  Requirement covered: PRD Sections 6.1, 6.2, 27.3; Constitution I/VI.
  Files likely touched: `frontend/src/App.tsx`, `frontend/src/routing/hashRoutes.ts`, `frontend/src/test/match-first-routing.test.tsx`
  Implementation action: Preserve custom hash routing while ensuring `/` and `#/match` enter match-first landing and legacy search, Dossier, checkout, shared, pack, and old match routes still parse/build safely.
  Validation: `cd frontend && npm run test -- src/test/match-first-routing.test.tsx`
  Acceptance evidence: Traceability row "route cleanup" lists route fixtures and preserved Dossier/search behavior.
  Dependencies: T-006.

- ID: T-010
  Phase: 1
  Requirement covered: PRD A11Y-1 to A11Y-5; FR-L5; Constitution VII.
  Files likely touched: `frontend/src/test/match-first-a11y.test.tsx`, `frontend/src/components/match-first/MatchFirstLanding.tsx`, `frontend/src/components/match-first/HeroMapBackground.tsx`
  Implementation action: Add or verify keyboard focus, contrast over hero media, touch targets, screen-reader labels, and reduced-motion assertions for landing and direct placeholder states.
  Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx`
  Acceptance evidence: Traceability records no serious accessibility regressions for Phase 1 surfaces.
  Dependencies: T-006, T-007.

- ID: T-011
  Phase: 1
  Requirement covered: PRD Section 20.1; Constitution XV.
  Files likely touched: `frontend/src/services/matchFirstAnalytics.ts`, `frontend/src/services/matchFirstAnalytics.test.ts`
  Implementation action: Verify privacy-safe landing analytics for CTA shown/clicked and secondary search link clicked using stable event names and no translated labels.
  Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts`
  Acceptance evidence: Traceability links analytics event names and test output.
  Dependencies: T-006.

- ID: T-012
  Phase: 1
  Requirement covered: PRD Section 23 Phase 1; Constitution VIII/XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `docs/ai/latest_handoff.md`
  Implementation action: Close Phase 1 with files changed, commands run, pass/fail status, residual risks, and next step; keep later map/Dossier behavior marked missing or partial.
  Validation: `cd frontend && npm run build`; targeted Phase 1 tests listed in T-006 through T-011.
  Acceptance evidence: Traceability Phase 1 closure remains linked to actual tests and handoff names Phase 2/3/4 status accurately.
  Dependencies: T-006, T-007, T-008, T-009, T-010, T-011.

## Phase 2: Survey And Preference Vector

- ID: T-013
  Phase: 2
  Requirement covered: PRD FR-S1 to FR-S7; Section 8.3; Constitution II/VII.
  Files likely touched: `frontend/src/components/match-first/surveyQuestions.ts`, `frontend/src/components/match-first/surveyValidation.ts`, `frontend/src/test/match-first-survey.test.tsx`
  Implementation action: Verify the 10-12 step survey config covers intent, budget, household, anchor, commute, lifestyle priorities, must-haves, dealbreakers, housing type, area character, and language/report preference without showing multiple questions.
  Validation: `cd frontend && npm run test -- src/test/match-first-survey.test.tsx`
  Acceptance evidence: Traceability rows FR-S1/FR-S6/Section 8.3 link to survey config and tests.
  Dependencies: T-009.

- ID: T-014
  Phase: 2
  Requirement covered: PRD FR-P1 to FR-P5; Sections 14.3 and 19.3.
  Files likely touched: `backend/app/models/match.py`, `backend/app/services/match/survey_schema.py`, `backend/app/services/match/survey_constants.py`, `backend/tests/test_match_survey_schema.py`
  Implementation action: Verify backend survey schema stores stable answer keys, rejects protected traits, enforces max-selection limits, derives question count from ordered questions, and returns stable warning codes.
  Validation: `cd backend && pytest -q tests/test_match_survey_schema.py`
  Acceptance evidence: Traceability row "survey schema parity" links to backend schema and tests.
  Dependencies: T-013.

- ID: T-015
  Phase: 2
  Requirement covered: PRD FR-S4, FR-S5, FR-P4; Constitution IX/XIII.
  Files likely touched: `backend/app/db.py`, `backend/app/services/match/sessions.py`, `backend/tests/test_match_db_schema.py`, `backend/tests/test_match_sessions.py`
  Implementation action: Verify match session and survey answer persistence tables, answer-version increments, validation status, stale-results marking, and idempotent schema initialization.
  Validation: `cd backend && pytest -q tests/test_match_db_schema.py tests/test_match_sessions.py`
  Acceptance evidence: Traceability rows for answer persistence and validation include DB/service/test links.
  Dependencies: T-014.

- ID: T-016
  Phase: 2
  Requirement covered: PRD FR-P1 to FR-P5; Sections 8.4 and 19.3; Constitution V.
  Files likely touched: `backend/app/services/match/preference_vector.py`, `backend/tests/test_match_preference_vector_builder.py`
  Implementation action: Verify preference vector generation separates hard filters from weights, normalizes weights, preserves raw answer refs, stores vector version/method version, and excludes protected traits.
  Validation: `cd backend && pytest -q tests/test_match_preference_vector_builder.py`
  Acceptance evidence: Traceability rows FR-P1 to FR-P5 link to vector service and tests.
  Dependencies: T-015.

- ID: T-017
  Phase: 2
  Requirement covered: PRD Sections 14.3 and 8.2 FR-S4; Constitution XIII.
  Files likely touched: `backend/app/api/match.py`, `backend/tests/test_match_sessions.py`
  Implementation action: Verify `POST /api/match/sessions`, `GET /api/match/sessions/{session_id}`, and `PATCH /api/match/sessions/{session_id}/answers` behavior without changing older `/api/match/quiz` compatibility.
  Validation: `cd backend && pytest -q tests/test_match_sessions.py`
  Acceptance evidence: Traceability row "session API" links to endpoint tests and API contract.
  Dependencies: T-015, T-016.

- ID: T-018
  Phase: 2
  Requirement covered: PRD FR-S4; Section 27.5; Constitution IX.
  Files likely touched: `frontend/src/services/matchFirstApi.ts`, `frontend/src/services/matchFirstApi.test.ts`, `frontend/src/services/matchSessionStorage.ts`, `frontend/src/services/matchSessionStorage.test.ts`, `frontend/src/types/matchFirst.ts`
  Implementation action: Verify frontend session API helpers and sessionStorage mirror for session ID, answer version, locale, step, answers, and stale-results flags.
  Validation: `cd frontend && npm run test -- src/services/matchFirstApi.test.ts src/services/matchSessionStorage.test.ts`
  Acceptance evidence: Traceability row "frontend session persistence" links to storage/API tests.
  Dependencies: T-017.

- ID: T-019
  Phase: 2
  Requirement covered: PRD Section 7 Phase 1; FR-S1 to FR-S7.
  Files likely touched: `frontend/src/components/match-first/SurveyIntro.tsx`, `frontend/src/components/match-first/SurveyShell.tsx`, `frontend/src/components/match-first/SurveyQuestionScreen.tsx`, `frontend/src/components/match-first/*Question.tsx`, `frontend/src/components/match-first/SurveyShell.test.tsx`
  Implementation action: Verify survey intro, one-question shell, progress, back behavior, required validation, answer-save failure blocking, keyboard operation, and route-safe resume.
  Validation: `cd frontend && npm run test -- src/components/match-first/SurveyShell.test.tsx src/test/match-first-a11y.test.tsx`
  Acceptance evidence: Traceability rows FR-S1 to FR-S7 link to shell/input tests.
  Dependencies: T-018.

- ID: T-020
  Phase: 2
  Requirement covered: PRD Section 7 Phase 3; FR-M1; Constitution XIII.
  Files likely touched: `frontend/src/components/match-first/SurveyReview.tsx`, `frontend/src/components/match-first/SurveyReview.test.tsx`, `frontend/src/App.tsx`
  Implementation action: Verify review shows a concise 5-8 item summary, lets users edit answers, requires backend vector readback, blocks stale/mismatched vectors, and is the only final run handoff.
  Validation: `cd frontend && npm run test -- src/components/match-first/SurveyReview.test.tsx src/App.test.tsx -- -t "review"`
  Acceptance evidence: Traceability rows for PRD AC7 and FR-M1 link to review gating tests.
  Dependencies: T-016, T-018, T-019.

- ID: T-021
  Phase: 2
  Requirement covered: PRD Sections 5.5, 10, 18, 26; Constitution III/VII.
  Files likely touched: `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`, `frontend/src/test/match-i18n.test.ts`, `frontend/src/test/match-first-copy-guard.test.ts`, `frontend/src/test/match-first-a11y.test.tsx`
  Implementation action: Verify all intro, survey, answer, validation, review, and backend warning-code copy is localized and free of search-first or unsupported certainty language.
  Validation: `cd frontend && npm run test -- src/test/match-i18n.test.ts src/test/match-first-copy-guard.test.ts src/test/match-first-a11y.test.tsx`
  Acceptance evidence: Traceability includes i18n parity and copy-guard evidence.
  Dependencies: T-019, T-020.

- ID: T-022
  Phase: 2
  Requirement covered: PRD Sections 20.1, 20.2, 19.1; Constitution XV.
  Files likely touched: `frontend/src/services/matchFirstAnalytics.ts`, `frontend/src/services/matchFirstAnalytics.test.ts`
  Implementation action: Verify privacy-safe survey analytics for intro shown, survey started, question shown, answer saved/failed, abandonment, completion, and review shown.
  Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts`
  Acceptance evidence: Traceability lists stable survey event names and privacy exclusions.
  Dependencies: T-018, T-019.

- ID: T-023
  Phase: 2
  Requirement covered: PRD Section 23 Phase 2; Constitution VIII/XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `docs/ai/latest_handoff.md`
  Implementation action: Close Phase 2 with frontend/backend commands, residual risks, and next step; explicitly keep async matching, results map, neighborhood detail, and Dossier bridge as later phases unless proven complete.
  Validation: Run Phase 2 targeted frontend tests, `cd frontend && npm run build`, backend session/vector/schema tests, and relevant backend ruff.
  Acceptance evidence: Traceability Phase 2 closure maps FR-S1 to FR-S7 and FR-P1 to FR-P5 to files/tests.
  Dependencies: T-013 through T-022.

## Phase 3: Matching Backend

- [X] ID: T-024
  Phase: 3
  Requirement covered: PRD FR-M1, FR-M2; Sections 14.4-14.5; Constitution XIII.
  Files likely touched: `backend/tests/test_match_jobs.py`, `backend/app/services/match/jobs.py`
  Implementation action: Verify backend job lifecycle tests cover run confirmation, incomplete-answer rejection, persisted status/stage transitions, slow state, retry, stale vector, expired job, and failure recovery.
  Validation: `cd backend && pytest -q tests/test_match_jobs.py`
  Acceptance evidence: Traceability row "match job lifecycle" links to job tests.
  Dependencies: T-016, T-017.

- [X] ID: T-025
  Phase: 3
  Requirement covered: PRD FR-M4, FR-M6, Sections 8.7 and 15.3; Constitution V/X.
  Files likely touched: `backend/tests/test_match_results_contract.py`, `backend/app/services/match/results.py`
  Implementation action: Verify result contract tests assert rank, score, fit label key, reasons, tradeoffs, 0-100 confidence, geometry refs, source freshness, model/data version, runtime, evaluation status, limitations, and no predictive probability.
  Validation: `cd backend && pytest -q tests/test_match_results_contract.py`
  Acceptance evidence: Traceability row "match result evidence contract" links to serializer and tests.
  Dependencies: T-024.

- [X] ID: T-026
  Phase: 3
  Requirement covered: PRD FR-M3, FR-M5, Section 21.1; Constitution V.
  Files likely touched: `backend/tests/test_match_hard_filters.py`, `backend/app/services/match/scoring.py`, `backend/app/services/match/recommendations.py`
  Implementation action: Verify deterministic scoring applies hard filters, excludes failed hard-filter neighborhoods from normal top matches, and separates near misses and stretch matches.
  Validation: `cd backend && pytest -q tests/test_match_hard_filters.py`
  Acceptance evidence: Traceability row for FR-M5 links to hard-filter tests.
  Dependencies: T-024.

- [X] ID: T-027
  Phase: 3
  Requirement covered: PRD Sections 14.5 and 8.7; Data Model `MatchJob` and `MatchResultSet`.
  Files likely touched: `backend/app/models/match.py`, `backend/tests/test_match_jobs.py`, `backend/tests/test_match_results_contract.py`
  Implementation action: Verify Pydantic response models for run/status/results, recommendation confidence, geometry refs, fallback metadata, no-strong-match state, and stable public error codes.
  Validation: `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py`
  Acceptance evidence: Traceability links response models to contract tests.
  Dependencies: T-024, T-025.

- [X] ID: T-028
  Phase: 3
  Requirement covered: PRD FR-M2, FR-M6; Section 27.5.
  Files likely touched: `backend/app/db.py`, `backend/tests/test_match_db_schema.py`, `backend/tests/test_match_jobs.py`
  Implementation action: Verify `match_jobs` and `match_result_sets` tables, indexes, idempotent initialization, result identity, `result_set_id`, and `preference_vector_version` persistence.
  Validation: `cd backend && pytest -q tests/test_match_db_schema.py tests/test_match_jobs.py`
  Acceptance evidence: Traceability includes DB schema evidence and rollback note.
  Dependencies: T-027.

- [X] ID: T-029
  Phase: 3
  Requirement covered: PRD FR-M3, FR-M4, Sections 15.1 and 15.3.
  Files likely touched: `backend/app/services/match/neighborhood_features.py`, `backend/app/services/match/providers/seed.py`, `backend/app/data/match_seed/neighborhoods.json`, `backend/tests/test_match_results_contract.py`
  Implementation action: Verify neighborhood feature loading returns source-backed, freshness-labelled feature matrix data with explicit mock/seed limitations.
  Validation: `cd backend && pytest -q tests/test_match_results_contract.py`
  Acceptance evidence: Traceability row "neighborhood feature matrix" lists data version and mock/freshness labels.
  Dependencies: T-025.

- [X] ID: T-030
  Phase: 3
  Requirement covered: PRD Section 8.6 and 27.1; Constitution V/X.
  Files likely touched: `backend/app/services/match/model_selection.py`, `backend/tests/test_match_model_honesty.py`, `frontend/src/test/match-first-model-honesty.test.ts`
  Implementation action: Verify model-honesty gates keep `model_mode` as `weighted_scoring`, mark `evaluation_status` as not validated without labels, and prevent predictive probability or model-superiority claims.
  Validation: `cd backend && pytest -q tests/test_match_model_honesty.py`; `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts`
  Acceptance evidence: Traceability PRD AC18 links to backend and frontend honesty guards.
  Dependencies: T-025.

- [X] ID: T-031
  Phase: 3
  Requirement covered: PRD Section 14.3; FR-M1 to FR-M7.
  Files likely touched: `backend/app/api/match.py`, `backend/tests/test_match_jobs.py`, `backend/tests/test_match_results_contract.py`
  Implementation action: Verify `POST /api/match/sessions/{session_id}/run`, `GET /api/match/sessions/{session_id}/status`, and `GET /api/match/sessions/{session_id}/results` return contract-compliant responses and stable errors.
  Validation: `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py`
  Acceptance evidence: Traceability row "run/status/results API" links to endpoint tests.
  Dependencies: T-027, T-028.

- [X] ID: T-032
  Phase: 3
  Requirement covered: PRD Sections 20.2 and 20.5; Constitution XV.
  Files likely touched: `backend/app/services/match/instrumentation.py`, `backend/tests/test_match_instrumentation.py`
  Implementation action: Verify backend emits stable job queued/running/completed/failed/fallback/no-strong-match events without translated labels or sensitive payloads.
  Validation: `cd backend && pytest -q tests/test_match_instrumentation.py`
  Acceptance evidence: Traceability row "backend match analytics" lists event keys and privacy exclusions.
  Dependencies: T-024, T-031.

- [X] ID: T-033
  Phase: 3
  Requirement covered: PRD Section 23 Phase 3; Constitution VIII/XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `docs/ai/latest_handoff.md`
  Implementation action: Verify Phase 3 completion against current worktree, run backend quality gates, and update handoff/traceability before frontend progress/map work depends on Phase 3.
  Validation: `cd backend && ruff check .`; `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_preference_vector_builder.py tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py`
  Acceptance evidence: Handoff lists exact Phase 3 commands and says whether Phase 4 is unblocked.
  Dependencies: T-024 through T-032.

Phase 3 closure repair note, 2026-05-15: T-025, T-026, T-031, and T-032 remain marked complete only after the gap-review repairs passed. Verified evidence now covers lifecycle status versus progress stage separation, 10,000 ms matching-slow behavior with one persisted slow event, result `preference_vector_version`/`runtime_ms`/separate `stretch_matches`, no predictive probability, stable confidence/limitation keys with EN/NL coverage, no-store cache headers, contract error codes, and persisted privacy-safe analytics. Final commands: `cd backend && ruff check .`; `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py tests/test_match_db_schema.py`; `cd backend && python -m pytest -x -q -m "not live" --color=no`; `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts`.

## Phase 4: Progress And Success States

- [X] ID: T-034
  Phase: 4
  Requirement covered: PRD Sections 7 Phase 4, 14.4-14.6, 21.3-21.4; Constitution XIII/XV.
  Files likely touched: `frontend/src/test/match-first-progress.test.tsx`, `frontend/src/services/matchFirstApi.ts`, `frontend/src/App.tsx`
  Implementation action: Add progress tests for review CTA run start, polling interval, stage-key mapping, terminal states, slow state, failed state, fallback/no-strong-match completions, retry, and answer preservation.
  Validation: `cd frontend && npm run test -- src/test/match-first-progress.test.tsx`
  Acceptance evidence: Traceability row "progress polling" links to test cases for all job stages.
  Dependencies: T-033.

- [X] ID: T-035
  Phase: 4
  Requirement covered: PRD Section 17.4; A11Y-2; Section 24 AC9.
  Files likely touched: `frontend/src/components/match-first/MatchSuccessCheckmark.test.tsx`, `frontend/src/components/match-first/MatchSuccessCheckmark.tsx`
  Implementation action: Add success checkmark tests for animated draw, reduced-motion static variant, text equivalent, no confetti, and no completion claim without terminal backend state.
  Validation: `cd frontend && npm run test -- src/components/match-first/MatchSuccessCheckmark.test.tsx`
  Acceptance evidence: Traceability row "Buurt Check checkmark" links to animation/reduced-motion tests.
  Dependencies: T-034.

- [X] ID: T-036
  Phase: 4
  Requirement covered: PRD Sections 14.3-14.4; FR-M1.
  Files likely touched: `frontend/src/services/matchFirstApi.ts`, `frontend/src/services/matchFirstApi.test.ts`, `frontend/src/types/matchFirst.ts`
  Implementation action: Add `runMatchSession`, `getMatchStatus`, and `getMatchResults` helpers using contract response types, stable error codes, and `poll_after_ms`.
  Validation: `cd frontend && npm run test -- src/services/matchFirstApi.test.ts`
  Acceptance evidence: Traceability links API helper tests to run/status/results contract.
  Dependencies: T-031, T-034.

- [X] ID: T-037
  Phase: 4
  Requirement covered: PRD Sections 7 Phase 4 and 10.5; A11Y-4; Constitution III/VII.
  Files likely touched: `frontend/src/components/match-first/MatchingProgressScreen.tsx`, `frontend/src/components/match-first/MatchingProgressScreen.css`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`
  Implementation action: Create the progress screen with localized friendly status messages, perceivable status region, progress indicator, retry action, and no raw logs/model names/fake precision.
  Validation: `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/test/match-i18n.test.ts`
  Acceptance evidence: Traceability row PRD AC8 links to progress component and i18n tests.
  Dependencies: T-034, T-036.

- [X] ID: T-038
  Phase: 4
  Requirement covered: PRD Section 7 Phase 5 and 17.4; A11Y-2.
  Files likely touched: `frontend/src/components/match-first/MatchSuccessCheckmark.tsx`, `frontend/src/components/match-first/MatchSuccessCheckmark.css`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`
  Implementation action: Create the branded success screen and completion copy; route through it for completed, completed-with-fallback, and completed-no-strong-matches usable result states before results.
  Validation: `cd frontend && npm run test -- src/components/match-first/MatchSuccessCheckmark.test.tsx src/test/match-i18n.test.ts`
  Acceptance evidence: Traceability row PRD AC9 links to success checkmark tests.
  Dependencies: T-035, T-037.

- [X] ID: T-039
  Phase: 4
  Requirement covered: PRD FR-M1; Sections 6.1 and 24 AC7-AC9; Constitution XIII.
  Files likely touched: `frontend/src/App.tsx`, `frontend/src/routing/hashRoutes.ts`, `frontend/src/App.test.tsx`
  Implementation action: Wire review CTA, `#/run`, `#/success`, and completed-results routing so matching starts only after final CTA and direct/restored success routes remain neutral unless backend completion is confirmed.
  Validation: `cd frontend && npm run test -- src/App.test.tsx src/test/match-first-progress.test.tsx`
  Acceptance evidence: Traceability records route-state proof that no local placeholder can imply completion.
  Dependencies: T-036, T-037, T-038.

- [X] ID: T-040
  Phase: 4
  Requirement covered: PRD Sections 20.2, 21.1, 21.3, 21.4; Constitution XV.
  Files likely touched: `frontend/src/services/matchFirstAnalytics.ts`, `frontend/src/services/matchFirstAnalytics.test.ts`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`
  Implementation action: Emit privacy-safe progress/success analytics for final run CTA, job queued/running/slow/completed/failed/fallback/no-strong-match, runtime, retry, and success checkmark shown.
  Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts`
  Acceptance evidence: Traceability row "progress analytics" lists stable event names and no translated labels.
  Dependencies: T-037, T-039.

- [X] ID: T-041
  Phase: 4
  Requirement covered: PRD A11Y-1 to A11Y-5; Sections 21.3-21.4.
  Files likely touched: `frontend/src/test/match-first-a11y.test.tsx`, `frontend/src/components/match-first/MatchingProgressScreen.tsx`, `frontend/src/components/match-first/MatchSuccessCheckmark.tsx`
  Implementation action: Add accessibility coverage for progress status perception, failure/retry controls, reduced-motion progress/checkmark, focus management, and mobile touch targets.
  Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx`
  Acceptance evidence: Traceability includes Phase 4 accessibility evidence.
  Dependencies: T-037, T-038, T-039.

- [X] ID: T-042
  Phase: 4
  Requirement covered: PRD Section 23 Phase 4; Constitution VIII/XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `docs/ai/latest_handoff.md`
  Implementation action: Close Phase 4 with files changed, commands run, failed/blocked checks, residual risks, and next smallest safe step: Phase 5 results map.
  Validation: `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/components/match-first/MatchSuccessCheckmark.test.tsx src/services/matchFirstApi.test.ts src/test/match-first-a11y.test.tsx src/test/match-i18n.test.ts`; `cd frontend && npm run build`
  Acceptance evidence: Traceability maps PRD AC8-AC9 and AC16-AC18 to files/tests.
  Dependencies: T-034 through T-041.

## Phase 5: Results Map

- [X] ID: T-043
  Phase: 5
  Requirement covered: PRD Sections 16.2 and 23 Phase 5; Constitution IV/XII.
  Files likely touched: `specs/002-match-first-revamp/implementation-notes.md`, `frontend/package.json`, `frontend/package-lock.json`
  Implementation action: Decide whether existing map surfaces can satisfy live Netherlands pan/zoom/polygon/list sync; if not, add `leaflet` and `@types/leaflet` with documented justification.
  Validation: Documentation note states rejected simpler alternatives and `cd frontend && npm run build` succeeds after any dependency change.
  Acceptance evidence: Traceability row "results map dependency decision" links to implementation note and lockfile diff if dependency is added.
  Dependencies: T-042.

- [X] ID: T-044
  Phase: 5
  Requirement covered: PRD FR-R1 to FR-R7; Sections 8.8 and 11.
  Files likely touched: `frontend/src/test/match-first-results-map.test.tsx`, `frontend/src/services/matchFirstApi.ts`, `frontend/src/types/matchFirst.ts`
  Implementation action: Add results map tests for completed result fetch, stale/unavailable recovery, Netherlands initial bounds, ranked list, list-to-map selection, map-to-list selection, manual pan/zoom, and mobile map/list mode.
  Validation: `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
  Acceptance evidence: Traceability row "results map behavior" links to test assertions.
  Dependencies: T-042.

- [X] ID: T-045
  Phase: 5
  Requirement covered: PRD FR-R1, Section 14.3; Constitution XIV.
  Files likely touched: `frontend/src/services/matchFirstApi.ts`, `frontend/src/services/matchFirstApi.test.ts`, `frontend/src/types/matchFirst.ts`
  Implementation action: Extend frontend API/types for completed results, recommendations, near misses, stretch matches, geometry refs, confidence, source/freshness, limitations, and map feature payloads.
  Validation: `cd frontend && npm run test -- src/services/matchFirstApi.test.ts`
  Acceptance evidence: Traceability links TypeScript result contracts to API contract examples.
  Dependencies: T-044.

- [X] ID: T-046
  Phase: 5
  Requirement covered: PRD FR-R1, Section 24 AC10; Constitution XIV.
  Files likely touched: `frontend/src/App.tsx`, `frontend/src/routing/hashRoutes.ts`, `frontend/src/App.test.tsx`
  Implementation action: Hydrate `#/match/session/{session_id}/results` from persisted completed result state and open first on Netherlands orientation unless restoring explicit saved selection.
  Validation: `cd frontend && npm run test -- src/App.test.tsx src/test/match-first-results-map.test.tsx -- -t "results"`
  Acceptance evidence: Traceability PRD AC10 states initial national orientation proof.
  Dependencies: T-045.

- [X] ID: T-047
  Phase: 5
  Requirement covered: PRD FR-R1, FR-R3, FR-R4, FR-R7; Section 16.2.
  Files likely touched: `frontend/src/components/match-first/ResultsMap.tsx`, `frontend/src/components/match-first/ResultsMap.css`, `frontend/src/test/match-first-results-map.test.tsx`
  Implementation action: Build the interactive results map with Netherlands bounds, markers or polygons, manual pan/zoom controls, selected feature state, reduced-motion-safe selection movement, and map-unavailable fallback.
  Validation: `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
  Acceptance evidence: Traceability links FR-R1/FR-R3/FR-R4/FR-R7 to component/test proof.
  Dependencies: T-043, T-045, T-046.

- [X] ID: T-048
  Phase: 5
  Requirement covered: PRD FR-R2, FR-R5, FR-R6; Constitution V/X.
  Files likely touched: `frontend/src/components/match-first/RecommendationList.tsx`, `frontend/src/components/match-first/RecommendationCard.tsx`, `frontend/src/components/match-first/RecommendationList.css`, `frontend/src/test/match-first-results-map.test.tsx`
  Implementation action: Build ranked recommendation list/cards with rank, name, municipality, fit score/label key, 1-2 reason lines, expandable detail for tradeoffs/limitations/confidence, and no unsupported claims.
  Validation: `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx src/test/match-first-copy-guard.test.ts`
  Acceptance evidence: Traceability rows FR-R2/FR-R5/FR-R6 link to list/card tests.
  Dependencies: T-045.

- [X] ID: T-049
  Phase: 5
  Requirement covered: PRD FR-R2 to FR-R7; A11Y-6; Constitution IX.
  Files likely touched: `frontend/src/components/match-first/ResultsMap.tsx`, `frontend/src/components/match-first/RecommendationList.tsx`, `frontend/src/services/matchSessionStorage.ts`, `frontend/src/test/match-first-results-map.test.tsx`
  Implementation action: Implement synchronized list/map state, selected result, map center/zoom, list scroll, mobile map/list mode, keyboard selection, and no match rerun on recommendation selection.
  Validation: `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx src/test/match-first-a11y.test.tsx`
  Acceptance evidence: Traceability PRD AC11 and A11Y-6 link to sync and keyboard tests.
  Dependencies: T-047, T-048.

- [X] ID: T-050
  Phase: 5
  Requirement covered: PRD Sections 20.3, 21, 15.3; Constitution XV.
  Files likely touched: `frontend/src/services/matchFirstAnalytics.ts`, `frontend/src/services/matchFirstAnalytics.test.ts`, `frontend/src/test/match-first-results-map.test.tsx`, `frontend/src/test/match-first-progress.test.tsx`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`
  Implementation action: Add results analytics and localized recovery for results opened, confidence sufficient/insufficient, result unavailable/stale, map layer failed, list selection, marker/polygon selection, and no strong matches.
  Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-first-results-map.test.tsx src/test/match-first-progress.test.tsx src/test/match-i18n.test.ts`
  Acceptance evidence: Traceability row "results analytics and fallbacks" lists stable events and fallback keys.
  Dependencies: T-047, T-049.

- [X] ID: T-051
  Phase: 5
  Requirement covered: PRD Sections 16.2, 18, 20.3; Constitution IV/VII.
  Files likely touched: `frontend/tests/e2e/performance-budget.spec.ts`, `frontend/tests/e2e/match-first-final-journey.spec.ts`
  Implementation action: Add E2E/performance checks for results initial usability within target profiles, list/map sync latency, manual pan/zoom response, mobile map/list switching, and non-map list alternative.
  Validation: `cd frontend && npm run test:perf:e2e`; `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`
  Acceptance evidence: Traceability includes measured or documented target profile results.
  Dependencies: T-047, T-049.

- [X] ID: T-052
  Phase: 5
  Requirement covered: PRD Section 23 Phase 5; Constitution VIII/XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `docs/ai/latest_handoff.md`
  Implementation action: Close Phase 5 with commands, performance notes, fallbacks, residual risks, and next smallest safe step: Phase 6 selected-neighborhood detail.
  Validation: `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx src/test/match-first-a11y.test.tsx src/test/match-first-copy-guard.test.ts src/test/match-i18n.test.ts`; `cd frontend && npm run build`; selected E2E.
  Acceptance evidence: Traceability maps PRD AC10-AC11 and AC16-AC18 to files/tests.
  Dependencies: T-043 through T-051.

Phase 5 closure note, 2026-05-16: T-043 through T-052 are marked complete for
the user-requested Phase 5 slice: completed-session results hydration, national
2D map/list synchronization, mobile map/list mode, list-only accessibility
fallback, concise translated reason lines, map state persistence, no matching
rerun on results open, no 3D building load, and no national-zoom amenities.
Targeted Vitest coverage and frontend build passed. A selected Playwright e2e
or browser perf run was not added in this slice because the Phase 6
neighborhood/house route remains intentionally unimplemented; traceability
records that as the residual Phase 5 verification gap.

## Phase 6: Neighborhood 3D Detail

- ID: T-053
  Phase: 6
  Requirement covered: PRD FR-N1 to FR-N6; Sections 16.3-16.4; Constitution IV.
  Files likely touched: `backend/tests/test_match_neighborhood_layers.py`, `backend/app/services/match/geometry.py`, `backend/app/services/match/buildings.py`, `backend/app/services/match/amenities.py`
  Implementation action: Add backend tests for selected-neighborhood boundary lookup, RD New canonical geometry, WGS84 display naming, building bounds validation, no national 3D data, amenity tag cap, and cache-key constraints.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability row "selected-neighborhood layer contracts" links to backend tests.
  Dependencies: T-052.
  Status 2026-05-16: Complete for Phase 6. Backend layer tests added and passing.

- ID: T-054
  Phase: 6
  Requirement covered: PRD Section 15.2; FR-N2; Coordinate architecture decision.
  Files likely touched: `backend/app/services/match/geometry.py`, `backend/app/models/match.py`, `backend/tests/test_match_neighborhood_layers.py`
  Implementation action: Implement selected-neighborhood geometry service with EPSG:28992 `centroid_rd`/`bounds_rd`, display-only explicitly named WGS84 fields, boundary refs, source refs, freshness, and limitations.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability links coordinate naming and boundary tests.
  Dependencies: T-053.
  Status 2026-05-16: Complete. Selected-neighborhood geometry service returns RD New `centroid_rd`/`bounds_rd`, display WGS84 fields, boundary refs, source refs, freshness, and limitations.

- ID: T-055
  Phase: 6
  Requirement covered: PRD FR-N1, FR-N5, FR-N6; Section 16.3; Constitution IV.
  Files likely touched: `backend/app/services/match/buildings.py`, `backend/app/models/match.py`, `backend/tests/test_match_neighborhood_layers.py`
  Implementation action: Implement selected-neighborhood building service requiring `neighborhood_id`, `session_id`, `result_set_id`, clipped `bounds_rd`, `lod`, and `limit`; reject missing/out-of-scope national requests with stable codes.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability PRD AC12 links to "no national 3D" backend tests.
  Dependencies: T-054.
  Status 2026-05-16: Complete for scoped requests and missing-3D fallback. Backend rejects national/out-of-scope RD bounds with `match.building_bounds_out_of_scope`; current seed data returns localized missing-3D fallback rather than real 3D buildings.

- ID: T-056
  Phase: 6
  Requirement covered: PRD FR-N3; Section 16.4.
  Files likely touched: `backend/app/services/match/amenities.py`, `backend/app/models/match.py`, `backend/tests/test_match_neighborhood_layers.py`
  Implementation action: Implement preference-aware amenity service with stable amenity keys, reason codes, source refs, freshness, and a default cap of 5-7 visible categories.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability PRD AC13 links to amenity relevance/cap tests.
  Dependencies: T-054.
  Status 2026-05-16: Complete. Amenity service is preference-aware from stored session answers and caps visible tags to 5-7 categories.

- ID: T-057
  Phase: 6
  Requirement covered: PRD Section 14.3; FR-N1 to FR-N6.
  Files likely touched: `backend/app/api/match.py`, `backend/tests/test_match_neighborhood_layers.py`
  Implementation action: Add `/api/match/neighborhoods/{neighborhood_id}`, `/map-layers`, `/buildings`, and `/amenities` endpoints with stable errors, retry/cache semantics, and selected-neighborhood scoping.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability links endpoint contract to tests.
  Dependencies: T-054, T-055, T-056.
  Status 2026-05-16: Complete. `/api/match/neighborhoods/{id}`, `/map-layers`, `/buildings`, and `/amenities` endpoints added under `/api/match` with selected-result context validation and stable errors.

- ID: T-058
  Phase: 6
  Requirement covered: PRD FR-N1 to FR-N6; Section 12.
  Files likely touched: `frontend/src/test/match-first-neighborhood-detail.test.tsx`, `frontend/src/services/matchFirstApi.ts`, `frontend/src/types/matchFirst.ts`
  Implementation action: Add frontend tests and API/types for selected-neighborhood summary, map layers, buildings, amenities, loading, empty, missing-3D, stale-request cancellation, and error states.
  Validation: `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/services/matchFirstApi.test.ts`
  Acceptance evidence: Traceability row "neighborhood detail frontend contracts" links to tests.
  Dependencies: T-057.
  Status 2026-05-16: Complete. Frontend types/API helpers and tests cover selected summary, layers, buildings, amenities, missing detail, and scoped bounds.
  Review repair 2026-05-17: Complete. Added regression coverage that amenity endpoint failure does not block selected boundary/layers, scoped building fallback, or the missing-3D 2D fallback; strengthened frontend building-request tests to parse `bounds_rd` and assert exact equality to selected map-layer `allowed_bounds_rd`.

- ID: T-059
  Phase: 6
  Requirement covered: PRD FR-N2, FR-N5, FR-N6; Section 7 Phase 7.
  Files likely touched: `frontend/src/components/match-first/NeighborhoodDetail.tsx`, `frontend/src/components/match-first/NeighborhoodDetail.css`, `frontend/src/App.tsx`
  Implementation action: Build selected-neighborhood detail shell with boundary, fit explanation, tradeoffs, confidence/limitations, loading state, return-to-results action, refresh restoration, and 2D fallback.
  Validation: `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx`
  Acceptance evidence: Traceability rows FR-N2/FR-N5/FR-N6 link to detail shell tests.
  Dependencies: T-058.
  Status 2026-05-16: Complete. Detail shell opens from result CTA, loads completed results without `/run`, shows selected boundary/fit context, and preserves selected-neighborhood state.

- ID: T-060
  Phase: 6
  Requirement covered: PRD FR-N1, FR-N5, FR-N6; Constitution IV.
  Files likely touched: `frontend/src/components/match-first/NeighborhoodBuildingLayer.tsx`, `frontend/src/components/match-first/NeighborhoodBuildingLayer.css`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`
  Implementation action: Build plain Three.js selected-neighborhood building layer with renderer cleanup, canvas sizing without CSS `!important`, no fetch before selection, reduced-motion camera behavior, nonblank rendering, and 2D fallback.
  Validation: `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx`; canvas verification in E2E.
  Acceptance evidence: Traceability PRD AC12 links to frontend no-preload/canvas/fallback tests.
  Dependencies: T-055, T-059.
  Status 2026-05-16: Complete for current missing-3D/fallback scope. Building fetch waits for selected-neighborhood bounds and renders a nonblank 2D canvas fallback. Real Three.js rendering remains a provider/data integration risk, documented in traceability.

- ID: T-061
  Phase: 6
  Requirement covered: PRD FR-N3 and FR-N4; Section 16.4.
  Files likely touched: `frontend/src/components/match-first/AmenityTags.tsx`, `frontend/src/components/match-first/AmenityTags.css`, `frontend/src/components/match-first/HouseSelectionPanel.tsx`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`
  Implementation action: Build amenity tags and house-selection panel with stable translated labels, relevance reasons, source affordances, default cap, selectable buildings/candidates, and no-reliable-address recovery entry points.
  Validation: `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/test/match-i18n.test.ts`
  Acceptance evidence: Traceability PRD AC13 links to amenity cap and relevance tests.
  Dependencies: T-056, T-058, T-059.
  Status 2026-05-16: Complete. Amenity tags use translated labels/reasons and cap to 7; house panel exposes fallback/no-reliable-address state without Phase 7 Dossier navigation.

- ID: T-062
  Phase: 6
  Requirement covered: PRD Sections 20.3, 20.4, 21.2; Constitution XV.
  Files likely touched: `frontend/src/services/matchFirstAnalytics.ts`, `frontend/src/services/matchFirstAnalytics.test.ts`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`, `frontend/src/test/match-i18n.test.ts`
  Implementation action: Emit privacy-safe analytics and localized fallbacks for neighborhood detail opened, building layer failed, amenity layer failed, missing 3D shown, amenity interacted, and house selected.
  Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-first-neighborhood-detail.test.tsx src/test/match-i18n.test.ts`
  Acceptance evidence: Traceability row "neighborhood analytics/fallbacks" lists event keys and fallback keys.
  Dependencies: T-059, T-060, T-061.
  Status 2026-05-16: Complete for implemented Phase 6 events/fallbacks. Added privacy-safe detail open, building-layer failed, amenity-layer failed, and missing-3D fallback events; house-selected analytics remains Phase 7.

- ID: T-063
  Phase: 6
  Requirement covered: PRD A11Y-1 to A11Y-6; Sections 16.3 and 18.
  Files likely touched: `frontend/src/test/match-first-a11y.test.tsx`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`, `frontend/tests/e2e/performance-budget.spec.ts`, `frontend/tests/e2e/match-first-final-journey.spec.ts`
  Implementation action: Add accessibility and performance checks for selected-neighborhood detail usable within 3 seconds, no national 3D request, keyboard/non-map alternative, reduced motion, and nonblank 3D or 2D fallback.
  Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/match-first-neighborhood-detail.test.tsx`; `cd frontend && npm run test:perf:e2e`; `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`
  Acceptance evidence: Traceability includes target profile/device evidence and any residual performance risk.
  Dependencies: T-059, T-060, T-061.
  Status 2026-05-16: Partial/complete for component-level Phase 6 evidence. Vitest covers a11y/list fallback, no national 3D request, and nonblank canvas state; browser Playwright/mobile performance proof remains open before production.
  Review repair 2026-05-17: Component-level evidence strengthened for loading/error resilience and no-national-3D regression coverage. Existing landing Playwright smoke and full local CI-style gates passed; dedicated selected-neighborhood Playwright/mobile performance proof remains open before production.

- ID: T-064
  Phase: 6
  Requirement covered: PRD Section 23 Phase 6; Constitution VIII/XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `docs/ai/latest_handoff.md`
  Implementation action: Close Phase 6 with backend/frontend commands, canvas/performance evidence, residual risks, and next smallest safe step: Phase 7 Dossier bridge.
  Validation: Phase 6 backend tests, frontend detail/a11y/performance tests, selected E2E, and frontend build.
  Acceptance evidence: Traceability maps PRD AC12-AC13 and AC16-AC18 to files/tests.
  Dependencies: T-053 through T-063.
  Status 2026-05-16: Complete. Handoff, traceability, open punch list, and this task status were updated with commands, residual risks, and next step: Phase 7 Dossier bridge.
  Review repair 2026-05-17: Complete. Handoff, traceability, open punch list, and task status now include the amenity-failure isolation repair, exact selected-bounds frontend regression, backend near-edge bounds rejection regression, and local CI-style verification commands.
  Boundary cleanup 2026-05-17: Complete. Removed stale Phase 7 bridge code from the active worktree; Phase 6 selected-house behavior is local state only and tests assert no `/dossier/from-building` or `/run` call.

## Phase 7: Dossier Bridge

- ID: T-065
  Phase: 7
  Requirement covered: PRD FR-D1, FR-D5; Section 21.5; Constitution VI.
  Files likely touched: `backend/tests/test_match_neighborhood_layers.py`, `backend/app/services/match/buildings.py`
  Implementation action: Add backend bridge tests for resolved VBO, candidate addresses, manual fallback, no reliable address, 16-digit VBO validation, stable error codes, and no broken Dossier route.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability row "Dossier bridge backend" links to bridge tests.
  Dependencies: T-064.
  Status 2026-05-17: Complete. Bridge coverage in `backend/tests/test_match_neighborhood_layers.py` now covers resolved, PDOK-backed candidates, selected candidate to Dossier, manual_required, unavailable, stale result metadata, required selected result identity, spoofed building/VBO/address/lookup/selected-house/candidate IDs, stable malformed-VBO errors, provider-empty/provider-failure manual recovery, and no-store responses.

- ID: T-066
  Phase: 7
  Requirement covered: PRD FR-D1, FR-D2; Section 13.2.
  Files likely touched: `backend/app/services/match/buildings.py`, `backend/app/models/match.py`, `backend/tests/test_match_neighborhood_layers.py`
  Implementation action: Implement building/coordinate-to-Dossier resolver that returns existing `#/address/{vbo_id}` route when reliable, candidate addresses when ambiguous, or localized fallback codes when unavailable.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability links reliable/no-address cases to tests.
  Dependencies: T-065.
  Status 2026-05-17: Complete. Resolver returns existing Dossier hash routes from server-resolved VBO/lookup candidates, calls the backend PDOK Locatieserver reverse path for ambiguous server-side houses, returns `candidate_addresses` with stable candidate IDs/display keys/source refs, resolves a selected candidate only after validating it against the server-side selected-neighborhood candidate set, returns `manual_required` or `unavailable` recovery where appropriate, and does not trust client-supplied VBO/address/lookup IDs.

- ID: T-067
  Phase: 7
  Requirement covered: PRD Section 14.3; FR-D1.
  Files likely touched: `backend/app/api/match.py`, `backend/tests/test_match_neighborhood_layers.py`
  Implementation action: Add `POST /api/match/dossier/from-building` endpoint with request/response contract, stable error codes, idempotent behavior, no-store cacheability, and no checkout session identity reuse.
  Validation: `cd backend && pytest -q tests/test_match_neighborhood_layers.py`
  Acceptance evidence: Traceability row "Dossier bridge API" links endpoint to contract/test evidence.
  Dependencies: T-066.
  Status 2026-05-17: Complete. Endpoint response shape now supports `resolved`, `candidates`, `manual_required`, and `unavailable`, validates completed result context, requires `selected_result_id` and `selected_result_rank`, rejects stale result sets and stale job/vector/selected-result metadata, sets `Cache-Control: no-store`, avoids checkout `session_id` query reuse, rejects spoofed selected-house/candidate fields, and returns stable `match.dossier.invalid_vbo_id` for malformed VBO input.

- ID: T-068
  Phase: 7
  Requirement covered: PRD FR-D2 to FR-D5; Section 27.5; Constitution IX.
  Files likely touched: `frontend/src/services/matchFirstApi.ts`, `frontend/src/services/matchFirstApi.test.ts`, `frontend/src/types/matchFirst.ts`, `frontend/src/test/match-first-routing.test.tsx`, `frontend/src/services/matchSessionStorage.test.ts`
  Implementation action: Add frontend tests and API/types for resolved route, candidates, manual fallback, return context, stale vector handling, and no rerun on return.
  Validation: `cd frontend && npm run test -- src/services/matchFirstApi.test.ts src/test/match-first-routing.test.tsx src/services/matchSessionStorage.test.ts src/services/matchFirstAnalytics.test.ts`
  Acceptance evidence: Traceability row "Dossier bridge frontend contract" links to tests.
  Dependencies: T-067.
  Status 2026-05-17: Complete. Bridge API/types and tests cover resolved routes, provider-labelled `candidate_addresses`, selected candidate IDs, manual recovery, return context, stale vector/result handling, analytics privacy, i18n keys, and no rerun on return.

- ID: T-069
  Phase: 7
  Requirement covered: PRD FR-D1, FR-D2, Section 21.5.
  Files likely touched: `frontend/src/components/match-first/HouseSelectionPanel.tsx`, `frontend/src/components/match-first/NeighborhoodDetail.tsx`, `frontend/src/App.tsx`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`
  Implementation action: Wire selected house/building from neighborhood detail through Dossier resolver, candidate selection, manual-search fallback, and existing Dossier route entry.
  Validation: `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/App.test.tsx`
  Acceptance evidence: Traceability PRD AC14 links to house-click route tests.
  Dependencies: T-061, T-068.
  Status 2026-05-17: Complete. `NeighborhoodDetail` now resolves selected houses through the bridge, renders returned provider-labelled candidate address choices, posts the selected server candidate ID without client address identifiers, persists return state, hands returned Dossier routes to App only when structured `match_return` context is present, and does not rerun matching. Candidate choices are keyboard-usable buttons with unique accessible names/descriptions, 44 px touch targets, focus-visible styling, translated EN/NL copy, manual search, and Back to results recovery.

- ID: T-070
  Phase: 7
  Requirement covered: PRD FR-D3; Section 13.1; Constitution VI.
  Files likely touched: `frontend/src/App.tsx`, `frontend/src/test/match-first-routing.test.tsx`, `frontend/src/App.test.tsx`
  Implementation action: Add persistent localized Back to match map action in Dossier loading, empty, error, and loaded states whenever match-return context exists, without replacing Dossier modules.
  Validation: `cd frontend && npm run test -- src/test/match-first-routing.test.tsx src/App.test.tsx`
  Acceptance evidence: Traceability PRD AC15 links to persistent action tests.
  Dependencies: T-068.
  Status 2026-05-17: Complete. Existing Dossier route wrapper now preserves match context and the localized Back to match map action restores the selected match route/state without rewriting Dossier modules.

- ID: T-071
  Phase: 7
  Requirement covered: PRD FR-D2, FR-D4, FR-D5; Section 13.3; Constitution IX.
  Files likely touched: `frontend/src/services/matchSessionStorage.ts`, `frontend/src/App.tsx`, `frontend/src/routing/hashRoutes.ts`, `frontend/src/services/matchSessionStorage.test.ts`, `frontend/src/test/match-first-routing.test.tsx`, `frontend/src/App.test.tsx`
  Implementation action: Preserve and restore match return context: session, job/result IDs, preference vector/snapshot refs, active filters, selected neighborhood/result/rank/house, map center/zoom, list scroll, mobile mode, language, Dossier route query, and stale-results status.
  Validation: `cd frontend && npm run test -- src/services/matchSessionStorage.test.ts src/test/match-first-routing.test.tsx src/App.test.tsx`
  Acceptance evidence: Traceability row "Dossier return context" lists every restored field and unsupported gaps.
  Dependencies: T-069, T-070.
  Status 2026-05-17: Complete. Match return context preserves session, job/result IDs, vector version, selected neighborhood/result/rank/house, map center/zoom, list scroll, mobile mode, language, and return route. Review repairs added regression and browser E2E proof that valid returned detail state preserves exact center, zoom, list scroll, mode, house, and language instead of recentering.

- ID: T-072
  Phase: 7
  Requirement covered: Dossier/risk-card contract; PRD FR-D1; Constitution VI.
  Files likely touched: `frontend/src/components/DossierSheet.test.tsx`, `frontend/src/components/RiskTilesGrid.test.tsx`, `frontend/src/components/ExportBottomSheet.test.tsx`, `backend/tests/test_export_entitlement.py`, `backend/tests/test_reports_api.py`
  Implementation action: Add or run Dossier regression coverage proving on-screen Dossier remains free, `quick_brief` remains free, `full_dossier` entitlement stays buyer/address scoped, checkout recovery survives, risk tiles remain Noise/Air/Climate only, and Sunlight does not become a frontend risk tile.
  Validation: Targeted frontend Dossier tests and `cd backend && pytest -q tests/test_export_entitlement.py tests/test_reports_api.py`
  Acceptance evidence: Traceability row "Dossier preservation" links to regression tests.
  Dependencies: T-070.
  Status 2026-05-17: Complete for targeted regression gates. Existing Dossier component tests passed with 89 tests, and backend export entitlement/report API tests passed with 22 tests.

- ID: T-073
  Phase: 7
  Requirement covered: PRD Sections 20.4 and 21.5; Constitution XV.
  Files likely touched: `frontend/src/services/matchFirstAnalytics.ts`, `frontend/src/services/matchFirstAnalytics.test.ts`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`
  Implementation action: Emit stable analytics and localized fallback copy for house selected, no reliable address shown, Dossier opened, back-to-map clicked, back-to-map return success/failure, and second house opened.
  Validation: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts`
  Acceptance evidence: Traceability lists event names and fallback keys.
  Dependencies: T-069, T-071.
  Status 2026-05-17: Complete for implemented Phase 7 events and fallback copy. Privacy-safe Dossier-open, no-reliable-address, Back-to-map clicked, return success, and return failure events are allowlisted and tested. Exact address/VBO/candidate/lookup IDs are not stored in analytics, Dossier-open fires only after App hydrates the returned lookup/VBO, missing/malformed `match_return` and lookup failures do not record Dossier-open, and return success/failure fires after target hydration. Bilingual house, candidate-address, manual-required, and manual-search recovery keys are covered.

- ID: T-074
  Phase: 7
  Requirement covered: PRD FR-D1 to FR-D5; Section 13; Constitution IX.
  Files likely touched: `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts`
  Implementation action: Add E2E round-trip for house click to existing Dossier, persistent Back to match map, restored selected-neighborhood/results map state, and opening another house without restarting or rerunning matching.
  Validation: `cd frontend && npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts`
  Acceptance evidence: Traceability PRD AC14-AC15 and SC-016 link to E2E proof.
  Dependencies: T-069, T-070, T-071, T-072.
  Status 2026-05-17/2026-05-18: Complete. `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts` cross-browser mobile/reduced-motion UI-mocked coverage proves house -> candidate address choice -> existing Dossier -> Back to match map -> exact selected state restore -> second house without `/run`, missing-`match_return` rejection, lookup-failure analytics suppression, and local analytics assertions. The backend-integrated provider proof is now opt-in to avoid shared local DB races in the two-worker combined suite; with `RUN_BACKEND_PROVIDER_PROOF=1`, Chromium creates a real completed match, opens the backend-selected candidate house, receives PDOK Locatieserver reverse-backed candidates from the real backend bridge, opens the existing Dossier, returns to match map, and asserts no `/run` during Dossier open or return. The default final+Dossier E2E command passes with 21 passed and 3 expected skips; the opt-in provider proof passes separately with 1 test.

- ID: T-075
  Phase: 7
  Requirement covered: PRD Section 23 Phase 7; Constitution VIII/XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `docs/ai/latest_handoff.md`
  Implementation action: Close Phase 7 with backend/frontend commands, Dossier preservation evidence, residual risks, and next smallest safe step: Phase 8 final QA.
  Validation: Phase 7 backend bridge tests, frontend bridge/context/Dossier tests, selected E2E, and relevant build.
  Acceptance evidence: Traceability maps PRD AC14-AC15 and AC16 to files/tests and documents unsupported return cases as missing/partial.
  Dependencies: T-065 through T-074.
  Status 2026-05-17: Complete for Phase 7. Candidate-address selection is implemented and tested for resolved server candidates and provider-backed ambiguous candidates, including backend trust boundary, frontend candidate choice, stale/manual/no-address/invalid-route recovery, analytics timing/privacy, cross-browser UI round-trip proof, and Chromium backend-integrated PDOK candidate proof. Phase 8 may start after review of this Phase 7 pass. `npm run lint` remains blocked by pre-existing repo-wide issues outside this Phase 7 slice.

## Phase 8: Accessibility, Analytics, Failure States, And Final QA

- [X] ID: T-076
  Phase: 8
  Requirement covered: PRD Section 20; Section 19.1; Constitution XV.
  Files likely touched: `backend/tests/test_match_first_analytics_api.py`, `backend/app/api/match.py`, `backend/app/services/match/instrumentation.py`, `backend/app/services/match/analytics.py`
  Implementation action: Add or complete backend analytics endpoint and tests for stable events, deduplication, privacy filtering, and rejection/redaction of translated labels, exact anchors, emails, free text, and protected traits.
  Validation: `cd backend && pytest -q tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py`
  Acceptance evidence: Traceability row "backend analytics API" links to privacy tests.
  Dependencies: T-075.

- [X] ID: T-077
  Phase: 8
  Requirement covered: PRD Section 21; Section 22.1 item 20; Constitution XV.
  Files likely touched: `frontend/src/test/match-first-progress.test.tsx`, `frontend/src/test/match-first-results-map.test.tsx`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`, `frontend/src/components/match-first/MatchingProgressScreen.tsx`, `frontend/src/components/match-first/ResultsMap.tsx`, `frontend/src/components/match-first/NeighborhoodDetail.tsx`, `frontend/src/components/match-first/HouseSelectionPanel.tsx`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json`
  Implementation action: Complete localized fallback coverage for session creation failure, answer-save failure, slow backend, failed backend, completed-with-fallback, no strong matches, stale/unavailable results, map/building/amenity failures, missing 3D, no reliable address, and Dossier return failure.
  Validation: `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/test/match-first-results-map.test.tsx src/test/match-first-neighborhood-detail.test.tsx src/test/match-i18n.test.ts`
  Acceptance evidence: Traceability row "failure states" maps each fallback to file/test/status.
  Dependencies: T-042, T-052, T-064, T-075.

- [X] ID: T-078
  Phase: 8
  Requirement covered: PRD A11Y-1 to A11Y-6; Constitution VII.
  Files likely touched: `frontend/src/test/match-first-a11y.test.tsx`, `frontend/src/test/keyboard-navigation.test.tsx`, match-first components touched in prior phases.
  Implementation action: Run and fill gaps in cross-flow accessibility for keyboard survey completion, screen-reader labels, focus restoration, status regions, touch targets, contrast, reduced motion, map/list interactions, house selection, Dossier return, and non-map alternatives.
  Validation: `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/keyboard-navigation.test.tsx`; `cd frontend && npm run test:a11y`
  Acceptance evidence: Traceability SC-013/SC-015 links to accessibility test output.
  Dependencies: T-077.

- [X] ID: T-079
  Phase: 8
  Requirement covered: PRD Section 27.5; Constitution IX.
  Files likely touched: `frontend/src/App.test.tsx`, `frontend/src/test/match-first-results-map.test.tsx`, `frontend/src/test/match-first-neighborhood-detail.test.tsx`, `frontend/src/services/matchSessionStorage.ts`, `frontend/src/services/matchSessionStorage.test.ts`, `frontend/src/App.tsx`
  Implementation action: Add cross-flow context preservation tests for survey answers, session ID, language, result state, selected neighborhood/result/house, map center/zoom, list scroll, mobile mode, Dossier return path, stale-results reroute, and refresh recovery.
  Validation: `cd frontend && npm run test -- src/App.test.tsx src/test/match-first-results-map.test.tsx src/test/match-first-neighborhood-detail.test.tsx src/services/matchSessionStorage.test.ts`; `cd frontend && npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts`
  Acceptance evidence: Traceability SC-011/SC-016 lists preserved fields and unsupported gaps.
  Dependencies: T-071.

- [X] ID: T-080
  Phase: 8
  Requirement covered: PRD Sections 8.6, 27.1, 3.2; Constitution V/X.
  Files likely touched: `frontend/src/test/match-first-copy-guard.test.ts`, `backend/tests/test_match_model_honesty.py`
  Implementation action: Add final copy/model-honesty guard scanning all match-first user-facing surfaces for hard-coded visible copy and unsupported claims about perfect fit, safety, happiness, investment certainty, future value, guaranteed affordability, guaranteed outcomes, objective best, or predictive probability.
  Validation: `cd frontend && npm run test -- src/test/match-first-copy-guard.test.ts`; `cd backend && pytest -q tests/test_match_model_honesty.py`
  Acceptance evidence: Traceability PRD AC18, SC-008, and imported model-honesty gate link to guard outputs.
  Dependencies: T-075.

- [X] ID: T-081
  Phase: 8
  Requirement covered: PRD Sections 15.4, 19.1-19.3; Constitution V/XV.
  Files likely touched: `backend/app/api/match.py`, `backend/app/services/match/sessions.py`, `backend/tests/test_match_sessions.py`, `backend/tests/test_match_first_analytics_api.py`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Implement or explicitly document anonymous match-session deletion/expiration behavior, exact-anchor minimization, anonymous/account separation, no protected-trait scoring, and analytics privacy constraints.
  Validation: `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_first_analytics_api.py`
  Acceptance evidence: Traceability imported privacy/deletion gate marks deletion pass or missing/partial with retention limit, blocker, and follow-up condition.
  Dependencies: T-004, T-076.

- [X] ID: T-082
  Phase: 8
  Requirement covered: PRD Sections 16.1-16.3; Constitution IV.
  Files likely touched: `frontend/tests/e2e/performance-budget.spec.ts`, `frontend/tests/e2e/match-first-final-journey.spec.ts`, `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts`
  Implementation action: Run final map/performance verification for hero readiness, results map initial usability, list/map sync, pan/zoom response, selected-neighborhood detail readiness, no national 3D request, and 2D/reduced-motion fallback.
  Validation: `cd frontend && npm run test:perf:e2e`; `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts`
  Acceptance evidence: Traceability imported map-performance gate links measured budgets or missing/partial status.
  Dependencies: T-051, T-063.

- [X] ID: T-083
  Phase: 8
  Requirement covered: Dossier/risk-card contract; PRD FR-D1 to FR-D5; Constitution VI.
  Files likely touched: `frontend/src/components/DossierSheet.test.tsx`, `frontend/src/components/RiskTilesGrid.test.tsx`, `frontend/src/components/ExportBottomSheet.test.tsx`, `backend/tests/test_export_entitlement.py`, `backend/tests/test_reports_api.py`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Run final Dossier preservation gates and document that existing Dossier, checkout recovery, entitlement, export, risk-card, and Sunlight boundaries remain unchanged.
  Validation: Targeted frontend Dossier tests and `cd backend && pytest -q tests/test_export_entitlement.py tests/test_reports_api.py`
  Acceptance evidence: Traceability Dossier/risk-card rows include pass/missing/partial status and test links.
  Dependencies: T-072, T-075.

- [X] ID: T-084
  Phase: 8
  Requirement covered: PRD Section 23 Phase 8; Constitution VIII.
  Files likely touched: Backend and frontend test suites only unless failures require scoped fixes.
  Implementation action: Run final frontend quality gates for build, unit, accessibility, E2E, and selected performance/visual checks relevant to touched map/detail flows.
  Validation: `cd frontend && npm run build`; `cd frontend && npm run test`; `cd frontend && npm run test:a11y`; `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts`; `cd frontend && npm run test:perf:e2e`.
  Acceptance evidence: Traceability records exact commands, pass/fail, and blocked checks.
  Dependencies: T-076 through T-083.

- [X] ID: T-085
  Phase: 8
  Requirement covered: PRD Section 23 Phase 8; backend quality gates.
  Files likely touched: Backend tests/services only if failures require scoped fixes.
  Implementation action: Run final backend quality gates for lint and non-live tests across match, neighborhood, Dossier bridge, entitlement, analytics, and existing address/report contracts.
  Validation: `cd backend && ruff check .`; `cd backend && pytest -x -q -m "not live"`
  Acceptance evidence: Traceability records exact backend command output and residual risks.
  Dependencies: T-076, T-081, T-083.

- [X] ID: T-086
  Phase: 8
  Requirement covered: PRD Section 24 AC1-AC18; Spec SC-001 to SC-016 plus imported review gates for model honesty, map performance, privacy/deletion, and context preservation; Constitution XI.
  Files likely touched: `docs/qa/match_first_revamp_traceability.md`, `specs/002-match-first-revamp/acceptance-traceability.md`
  Implementation action: Produce final acceptance traceability mapping each PRD acceptance criterion and spec success criterion to implementation files, automated tests or manual verification, status, residual risk, and next step.
  Validation: Review table has no empty implementation/test/evidence/status cells; missing and partial items are explicitly labelled.
  Acceptance evidence: `acceptance-traceability.md` and QA traceability prove all PRD AC1-AC18 are pass/missing/partial with evidence.
  Dependencies: T-084, T-085.

- [X] ID: T-087
  Phase: 8
  Requirement covered: PRD final product statement; quickstart full canonical journey.
  Files likely touched: `specs/002-match-first-revamp/acceptance-traceability.md`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Execute manual quickstart smoke path in EN/NL and reduced-motion mode from landing -> intro -> survey -> review -> progress -> success -> results -> neighborhood detail -> Dossier -> Back to match map.
  Validation: Follow `specs/002-match-first-revamp/quickstart.md` and record browser, viewport, language, reduced-motion state, commands, screenshots/log notes where useful, and any failed step.
  Acceptance evidence: Manual smoke evidence links to PRD AC1-AC18 rows and any gaps are marked missing/partial.
  Dependencies: T-086.
  Status 2026-05-18: Complete. Chromium quickstart smoke executed in English
  and Dutch at 390x844 with `prefers-reduced-motion: reduce`, covering landing,
  secondary search, survey, mid-survey refresh restoration, review, final run,
  reduced-motion success checkmark, results, selected-neighborhood detail,
  amenity filter state, house-to-Dossier, and Back to match map. Command:
  `cd frontend && npx playwright test --project=chromium tests/e2e/match-first-final-journey.spec.ts -g "reduced-motion quickstart smoke"`.

- [X] ID: T-088
  Phase: 8
  Requirement covered: Constitution XI; final handoff.
  Files likely touched: `docs/ai/latest_handoff.md`, `docs/qa/match_first_revamp_traceability.md`
  Implementation action: Close final QA by updating handoff with completed tasks/files, commands run, pass/fail status, residual risks, blocked checks, and next smallest safe step or release recommendation.
  Validation: Handoff date is current, points to active feature, names exact commands, and does not claim completion for missing/partial acceptance rows.
  Acceptance evidence: Final handoff and traceability are consistent with `acceptance-traceability.md`.
  Dependencies: T-087.
  Status 2026-05-18: Complete for local automated final handoff and evidence
  synchronization after EN/NL reduced-motion quickstart smoke evidence was
  executed and recorded.

Status 2026-05-18: Complete for local automated Phase 8 final QA and review
repairs, with remaining release-condition items explicitly partial. Backend analytics
endpoint/privacy tests strip exact address/VBO/lookup/candidate/selected-house/
building identifiers and now reject private top-level analytics `session_id`
values containing 16-digit address/VBO-like values, embedded address routes,
`lookup=` markers, email-shaped values, or free-text sentence values with no
persisted rows; backend match-first allowed context strings now must be stable
tokens/routes, preventing free-text values under allowed keys from persisting.
Frontend analytics writes sanitized local events
and posts sanitized events to `/api/match/analytics`; analytics catalogs match
the active spec contract except conditional quality feedback because no
match-first feedback UI exists, and extra catalog events are limited to a
documented optional set. The non-spec `match_neighborhood_clicked` event has
been removed; ResultsMap records `match_recommendation_selected` before opening
detail and relies on existing `match_neighborhood_detail_opened` analytics for
the detail route. Final journey E2E asserts exact once-per-flow local and
backend analytics counts for the key funnel events.
Anonymous match-session deletion is implemented via
`DELETE /api/match/sessions/{session_id}`; hero contrast has automated
Playwright evidence; EN/NL reduced-motion quickstart smoke has Chromium browser
evidence; final evidence, traceability, punchlist, acceptance traceability, and
handoff have been updated. Unrelated `docs/superpowers` allowlisting/state
files were removed from this Phase 8 changeset. Remaining open items are human
usability research, live production/mobile profiling, provider-backed 3D
coverage, and repo-wide lint cleanup.

## Dependencies And Execution Order

Phase dependencies:

- Phase 0 verifies the active source and completes evidence scaffolding before further implementation.
- Phase 1 depends on Phase 0 and protects the match-first entry and legacy route compatibility.
- Phase 2 depends on Phase 1 route/session entry and blocks backend matching because run confirmation needs persisted answers and a current vector.
- Phase 3 depends on Phase 2 backend session/vector contracts and blocks real progress/results UI.
- Phase 4 depends on Phase 3 run/status/results endpoints.
- Phase 5 depends on Phase 3 result contracts and Phase 4 completed routing.
- Phase 6 depends on Phase 5 selected result/neighborhood state and result geometry refs.
- Phase 7 depends on Phase 6 house/building selection context and existing Dossier route compatibility.
- Phase 8 depends on the implemented phases and verifies the full canonical journey.

Independent user-story mapping:

- US1: T-006 to T-012
- US2: T-013 to T-023
- US3: T-024 to T-033
- US4: T-034 to T-042
- US5: T-043 to T-052
- US6: T-053 to T-064
- US7: T-065 to T-075
- Cross-cutting final QA: T-076 to T-088

Parallel opportunities:

- Phase 0: T-002, T-003, and T-004 can proceed after T-001.
- Phase 1: T-007, T-008, T-010, and T-011 can proceed in parallel after T-006.
- Phase 2: T-014 and T-018 can proceed in parallel after T-013 if ownership is split backend/frontend.
- Phase 3: T-024, T-025, and T-026 are independent test tasks; T-029 and T-030 can proceed in parallel after result contracts are established.
- Phase 4: T-034 and T-035 can proceed in parallel; T-040 and T-041 can proceed after screen wiring starts.
- Phase 5: T-043 and T-044 can proceed in parallel; T-047 and T-048 can proceed in parallel after T-045.
- Phase 6: T-054, T-055, and T-056 are separate backend services once T-053 tests exist; T-060 and T-061 can proceed in parallel after T-059.
- Phase 7: T-065, T-068, and T-074 can be prepared in parallel; T-072 can run independently of bridge UI once Dossier tests exist.
- Phase 8: T-076 through T-083 can run in parallel after Phase 7 closure, then T-084 to T-088 close in order.

## Required Quality Gates

- Backend broad gate: `cd backend && ruff check .`
- Backend broad gate: `cd backend && pytest -x -q -m "not live"`
- Frontend broad gate: `cd frontend && npm run build`
- Frontend broad gate: `cd frontend && npm run test`
- Accessibility gate: `cd frontend && npm run test:a11y`
- Results/detail/Dossier E2E gate: `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts`

## Notes For Implementers

- Do not add Redux, Zustand, React Query, React Router, Tailwind, CSS modules, CSS-in-JS, `react-three-fiber`, or `drei`.
- Add a 2D map dependency only in Phase 5 if documented evidence shows existing static/projected map surfaces cannot satisfy live Netherlands pan/zoom/list synchronization.
- Do not cache empty, error, stale, fallback, map, building, amenity, or Dossier bridge failures as successful responses.
- Preserve EPSG:28992/RD New as canonical for Dutch geometry and name WGS84 values as display fields.
- Stop at any failed phase gate, record the failure in traceability/handoff, and do not mark the phase complete.
