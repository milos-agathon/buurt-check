# Latest AI Handoff

Updated: 2026-05-18

## Current Phase

The active SpecKit feature is `specs/002-match-first-revamp`; `.specify/feature.json`
now points at that complete feature directory.
Phase 1 through Phase 8 are documented with closure evidence in
`docs/qa/match_first_revamp_traceability.md` and final QA evidence in
`docs/qa/final_evidence.md`. The 2026-05-18 Phase 8 review repair added
spec-aligned analytics event names, survey save-failure analytics, backend/
frontend analytics contract parity tests, analytics exact-ID minimization,
frontend analytics backend transport, anonymous match-session deletion,
automated hero-contrast evidence, and local map/detail performance evidence.
The follow-up Phase 8 fix hardened `/api/match/analytics` further by splitting
the endpoint onto a match-first-only event catalog, rejecting legacy report/
listing/alert events at the endpoint, rejecting private event IDs and unsafe
phase values, and dropping unknown backend context keys so arbitrary free text
cannot persist. The latest Phase 8 consistency repair corrected stale task
validation references, converted amenity chips from no-op controls into real
pressed-state filters, and executed the EN/NL reduced-motion quickstart smoke
path in Chromium at a mobile viewport.
The latest Phase 8 review-blocker repair closes the analytics privacy and
contract findings from review: top-level match-first analytics `session_id`
now rejects email-shaped, free-text, private address-route, lookup-query, and
16-digit VBO/address-like values; allowed backend context strings must be
stable tokens/routes so free text cannot persist under allowed keys such as
`reason`, `source`, or `session_id`; the non-spec
`match_neighborhood_clicked` event was removed from frontend/backend catalogs
and ResultsMap now records
`match_recommendation_selected` before opening detail; the results-map-open
metric is emitted only by hydrated `ResultsMap`; the final journey E2E asserts
exact once-per-flow counts for key funnel events; and unrelated
`docs/superpowers` evidence files were removed from this Phase 8 changeset.
Phase 7 remains a pass for the Dossier bridge scope; Phase 8 does not rewrite
Dossier modules or add account, checkout, marketplace, AI chat, or unrelated
analytics scope.

The latest Phase 8 review-blocker follow-up corrects the remaining false
acceptance claim and hardens proof for deletion and selection analytics:
AC1 is now `PARTIAL / RELEASE RESEARCH`, automated landing hierarchy evidence
is documented only as local implementation evidence, SC-001/SC-003 remain
release-blocking research items, anonymous deletion tests create and verify
job/result-set rows before deletion, and ResultsMap emits
`match_recommendation_selected` exactly once for the Show-on-map ->
View-neighborhood path while keeping `match_neighborhood_detail_opened` as the
detail-entry event.

## Current Next Step

Do not implement product behavior from this handoff alone. Before implementation,
read:

- `docs/prd.md`
- `docs/ai/implementation_rules.md`
- `.specify/memory/constitution.md`
- `docs/qa/match_first_revamp_traceability.md`
- `specs/002-match-first-revamp/spec.md`
- `specs/002-match-first-revamp/plan.md`
- `specs/002-match-first-revamp/tasks.md`

Before running SpecKit planning or prerequisite checks, confirm
`.specify/feature.json` points at `specs/002-match-first-revamp`. That is the
only active implementation source for this handoff; no alternate feature
directory is an input to Phase 4.

Before any task regeneration or new task slicing, use the audited
`specs/002-match-first-revamp/plan.md`, `data-model.md`, and
`contracts/match-first-api.md` from the 2026-05-15 plan audit update below.

The next documented step is final human/product review plus release-condition
checks for human usability metrics, live production/mobile performance, and
provider-backed 3D data coverage. Keep the Phase 6/7 boundaries intact: do not load national 3D
buildings, do not show all amenities, do not rerun matching when opening
completed results/selected-neighborhood detail or house Dossiers, and do not
rewrite existing Dossier modules beyond route/context navigation.

## Phase 8 Analytics Session-ID Privacy Follow-up 2026-05-18

Files changed in this follow-up:

- `backend/app/models/match.py`
- `backend/tests/test_match_first_analytics_api.py`
- `docs/ai/latest_handoff.md`
- `docs/qa/final_evidence.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `specs/002-match-first-revamp/acceptance-traceability.md`
- `specs/002-match-first-revamp/tasks.md`

Completed work:

- Added backend regression coverage that rejects email-shaped and free-text
  top-level analytics `session_id` payloads, in addition to 16-digit
  address/VBO-like values, embedded address routes, and `lookup=` markers.
- Constrained `MatchFirstAnalyticsRequest.session_id` to stable analytics-token
  characters before any analytics row can be persisted.
- Kept the fix inside Phase 8 analytics privacy. No next-phase product behavior
  or Dossier module rewrite was started.

Verification:

- Red-first: `cd backend && pytest -q tests/test_match_first_analytics_api.py -k private_session_id`
  failed before the production fix because `/api/match/analytics` accepted
  email-shaped/free-text top-level `session_id` values with 202.
- `cd backend && pytest -q tests/test_match_first_analytics_api.py -k private_session_id`
  passed with 1 test.
- `cd backend && ruff check app/models/match.py tests/test_match_first_analytics_api.py`
  passed.
- `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py`
  passed with 23 tests.

Residual risks:

- Human usability metrics for SC-001/SC-003 remain release-research blockers.
- Live production/mobile performance profiling, provider-backed 3D coverage,
  and repo-wide frontend lint cleanup remain partial/release-condition items.

## Phase 8 Review Blocker Follow-up 2026-05-18

Files changed in this follow-up:

- `backend/tests/test_match_sessions.py`
- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/tests/e2e/match-first-final-journey.spec.ts`
- `docs/ai/latest_handoff.md`
- `docs/qa/final_evidence.md`
- `docs/qa/match_first_revamp_traceability.md`
- `specs/002-match-first-revamp/acceptance-traceability.md`

Completed work:

- Changed AC1 from PASS to `PARTIAL / RELEASE RESEARCH` and kept SC-001/SC-003
  blocked on human/product research. Automated landing hierarchy checks are
  now described as implementation evidence, not proof of first-time user
  understanding.
- Strengthened
  `test_match_session_delete_removes_anonymous_match_data` so it completes
  answers, reads `preference_vector_version`, runs matching from
  `review_final_cta`, proves `match_jobs` and `match_result_sets` rows exist
  before deletion, then proves jobs, result sets, survey answers, preference
  vectors, and analytics rows are all zero for the deleted session.
- Fixed selection analytics so a map/list selection emits
  `match_recommendation_selected` once, and opening detail does not emit a
  second selection event when that recommendation is already selected.
  `match_neighborhood_detail_opened` remains the detail-entry event.
- Added exact local and backend POST count assertions for
  `match_recommendation_selected` in the final Show-on-map ->
  View-neighborhood E2E path.

Verification:

- `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py`
  passed with 23 tests.
- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx src/services/matchFirstAnalytics.test.ts`
  passed with 23 tests.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`
  passed with 12 tests across Chromium, Firefox, and WebKit.
- `cd frontend && npm run build` passed. The build emitted the existing
  placeholder assetlinks/AASA production-release notices.
- `git diff --check` passed with CRLF normalization warnings only.

Residual risks:

- Human usability metrics for SC-001/SC-003 remain release-research blockers.
- Live production/mobile performance profiling and provider-backed 3D coverage
  remain release-condition items.

## Phase 8 Analytics Privacy/Contract Repair 2026-05-18

Files changed in this repair:

- `backend/app/models/match.py`
- `backend/app/services/match/instrumentation.py`
- `backend/tests/test_match_first_analytics_api.py`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/test/match-first-results-map.test.tsx`
- `frontend/tests/e2e/match-first-final-journey.spec.ts`
- `docs/ai/latest_handoff.md`
- `docs/qa/final_evidence.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `specs/002-match-first-revamp/acceptance-traceability.md`
- `specs/002-match-first-revamp/tasks.md`

Completed work:

- Added red-first backend coverage proving `/api/match/analytics` drops
  allowed-key string values that are free text or contain private lookup
  markers, including `reason`, `source`, and `session_id`.
- Hardened match-first backend context sanitization so string values must be
  short stable tokens/routes and `lookup=` is rejected anywhere in the string.
  Email redaction remains in place, but arbitrary sentences no longer persist
  just because the key is allowlisted.
- Removed the non-spec `match_neighborhood_clicked` event from frontend and
  backend analytics catalogs, request typing, tests, and final E2E
  expectations.
- Changed the ResultsMap "View neighborhood" action to record
  `match_recommendation_selected` with recommendation/result metadata before
  opening the detail route. `NeighborhoodDetail` remains responsible for
  `match_neighborhood_detail_opened`.
- Tightened frontend and backend catalog parity tests: required spec events
  must be present, and extra events are allowed only through the documented
  `OPTIONAL_MATCH_FIRST_EVENTS` set.
- Updated Phase 8 evidence, traceability, punch list, acceptance traceability,
  tasks, and this handoff so SC-014 only claims pass after the privacy and
  contract repairs.

Red-first evidence:

- `cd backend && pytest -q tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py`
  failed before the fix because `/api/match/analytics` persisted free-text
  allowed-key values and because `match_neighborhood_clicked` was outside the
  active spec contract.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-first-results-map.test.tsx`
  failed before the fix because the frontend catalog still included
  `match_neighborhood_clicked` and the ResultsMap detail button emitted that
  non-spec event.

Verification:

- `cd backend && pytest -q tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py`
  passed with 15 tests.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-first-results-map.test.tsx`
  passed with 23 tests.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`
  passed with 12 tests. Vite emitted proxy ECONNRESET noise during teardown;
  Playwright reported the suite passed.

Residual risks:

- Human usability metrics for SC-001/SC-003, live production/mobile profiling,
  real selected-neighborhood 3D provider coverage, and repo-wide lint cleanup
  remain the documented release-condition items.

## Phase 8 Review Blocker Repair 2026-05-18

Files changed in this repair:

- `.gitignore`
- `backend/app/models/match.py`
- `backend/tests/test_match_first_analytics_api.py`
- `frontend/src/App.tsx`
- `frontend/tests/e2e/match-first-final-journey.spec.ts`
- `docs/ai/latest_handoff.md`
- `docs/qa/final_evidence.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `specs/002-match-first-revamp/acceptance-traceability.md`
- `specs/002-match-first-revamp/tasks.md`

Completed work:

- Added red-first backend coverage proving `/api/match/analytics` rejects
  private top-level `session_id` values: a 16-digit VBO/address-like value, an
  embedded `#/address/...` route, and a `lookup=` marker. The test also proves
  rejected rows are not persisted.
- Applied the existing private analytics identifier validation to
  `MatchFirstAnalyticsRequest.session_id` and broadened lookup detection so
  `lookup=` is rejected anywhere inside analytics identifiers.
- Removed the duplicate `match_results_map_opened` emission from the success
  button path. Results-map-open is now emitted only when `ResultsMap` renders
  or hydrates result state.
- Strengthened the final journey E2E to assert exact once-per-flow counts for
  `match_landing_cta_clicked`, `match_final_run_cta_clicked`,
  `match_results_map_opened`, `match_dossier_opened`, and
  `match_back_to_map_return_success` in both local analytics and backend
  analytics POSTs.
- Removed unrelated `docs/superpowers` allowlisting from `.gitignore` and
  removed the untracked `docs/superpowers/state` files from this Phase 8
  changeset.

Red-first evidence:

- `cd backend && pytest -q tests/test_match_first_analytics_api.py` failed
  before the fix because private top-level `session_id` payloads were accepted
  with 202.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`
  failed before the fix because `match_results_map_opened` occurred twice in
  the canonical journey.

Verification:

- `cd backend && pytest -q tests/test_match_first_analytics_api.py` passed with
  9 tests.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`
  passed with 12 tests.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts`
  passed with 14 tests.
- `cd frontend && npm run build` passed.
- `git diff --check` passed with CRLF normalization warnings only.

Residual risks:

- Human usability metrics for SC-001/SC-003, live production/mobile profiling,
  real selected-neighborhood 3D provider coverage, and repo-wide lint cleanup
  remain the documented release-condition items.

## Phase 8 Review Repair 2026-05-18

Task IDs closed in this repair:

- `T-076`: backend/frontend analytics privacy and server transport.
- `T-077`: spec-aligned analytics fallback/failure event coverage, including
  survey answer-save failure.
- `T-078`: automated hero text contrast evidence.
- `T-081`: anonymous match-session deletion and exact-ID minimization.
- `T-082`: local map/detail performance coverage; live device profiling remains
  a release condition.
- `T-084`: final focused QA commands for the repaired surfaces.
- `T-086`: traceability/evidence rows updated with no pass row lacking evidence.
- `T-087`: complete after Chromium EN/NL reduced-motion quickstart smoke
  evidence was recorded.
- `T-088`: complete for local automated final handoff and evidence
  synchronization.

Files changed in this repair:

- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `backend/app/services/match/instrumentation.py`
- `backend/app/services/match/sessions.py`
- `backend/tests/test_match_first_analytics_api.py`
- `backend/tests/test_match_sessions.py`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/components/match-first/SurveyShell.tsx`
- `frontend/src/components/match-first/SurveyShell.test.tsx`
- `frontend/src/components/match-first/AmenityTags.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.css`
- `frontend/src/App.test.tsx`
- `frontend/src/test/match-first-progress.test.tsx`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/tests/e2e/performance-budget.spec.ts`
- `frontend/tests/e2e/match-first-final-journey.spec.ts`
- `docs/qa/final_evidence.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `specs/002-match-first-revamp/acceptance-traceability.md`
- `specs/002-match-first-revamp/tasks.md`

Completed work:

- Backend analytics now drops exact address/VBO/lookup/candidate/selected-house/
  building identifiers, embedded address routes, lookup query markers, and
  16-digit address/VBO-like values, including nested context values, before
  persistence.
- `/api/match/analytics` now validates against a match-first-only event catalog
  instead of the broader legacy instrumentation catalog, rejects
  `match_listing_clicked`, `match_alert_created`, and `match_report_viewed`,
  and strips unknown context keys before persistence.
- Match-first analytics request validation rejects private route/id-like
  `event_id` values and unsafe `phase` values.
- Backend and frontend analytics catalogs now use the stable event keys from
  `specs/002-match-first-revamp/spec.md`, with parity tests that parse the
  active spec contract. `match_quality_feedback_submitted` is documented as N/A
  because no match-first feedback UI exists in this phase.
- Frontend analytics now generates client event IDs, stores only sanitized local
  events, and posts sanitized events to `/api/match/analytics` without blocking
  the primary journey if transport fails.
- Survey answer analytics now records `match_survey_answer_saved` only after
  persistence succeeds and records `match_survey_answer_save_failed` with a
  stable `error_code` when backend answer persistence fails.
- Added `DELETE /api/match/sessions/{session_id}`. The endpoint soft-deletes
  the anonymous session, makes subsequent reads return `match.session.not_found`,
  and removes related anonymous survey answers, preference vectors, jobs,
  result sets, and analytics rows.
- Added browser E2E contrast evidence for the landing hero title against the
  brightest hero overlay case.
- Updated stale frontend unit expectations so match-progress and Dossier-return
  tests distinguish analytics transport calls from match API calls and assert
  exact house/building IDs and embedded address routes are not stored in
  match-first analytics.
- Performance E2E now measures local results map initial usability, list/map
  sync, pan/zoom response, selected-neighborhood detail readiness, scoped
  building requests, no national 3D request, and reduced-motion mobile behavior.
- Amenity controls now expose real selected/cleared state with `aria-pressed`,
  visible localized status text, focus styling, and analytics emitted only from
  that visible user interaction.
- Stale Phase 8 task validation references were replaced with the actual
  passing tests/specs that provide equivalent coverage.
- The quickstart smoke path from `specs/002-match-first-revamp/quickstart.md`
  was executed in Chromium for English and Dutch at 390x844 with
  `prefers-reduced-motion: reduce`, including landing, secondary search,
  survey, mid-survey refresh restoration, review, final run, success, results,
  selected-neighborhood detail, amenity state, house-to-Dossier, and Back to
  match map.
- Updated final evidence, traceability, acceptance traceability, open punchlist,
  and tasks status. Human usability metrics, live production/mobile profiling,
  provider-backed 3D coverage, and repo-wide lint cleanup remain
  partial/release-condition items.

Verification so far:

- Follow-up analytics hardening red-first command
  `cd backend && pytest -q tests/test_match_first_analytics_api.py` failed
  before implementation because the match-first event catalog was missing,
  unknown free-text context persisted, private event IDs/phases were accepted,
  and legacy events were accepted by `/api/match/analytics`; after the fix it
  passed with 8 tests.
- Requested follow-up verification
  `cd backend && pytest -q tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py tests/test_match_sessions.py`
  passed with 21 tests.
- Requested follow-up verification `cd backend && ruff check .` passed.
- Requested follow-up verification
  `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts`
  passed with 16 tests.
- Requested follow-up verification `cd frontend && npm run build` passed.
- Requested follow-up verification `git diff --check` passed with CRLF
  normalization warnings only.
- `cd backend && pytest -q tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py` passed with 10 tests after adding backend spec-contract parity.
- `cd frontend && npm run test -- src/components/match-first/SurveyShell.test.tsx src/services/matchFirstAnalytics.test.ts` passed with 28 tests after adding save-success/save-failure analytics and frontend spec-contract parity.
- `cd backend && pytest -q tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py tests/test_match_sessions.py` passed with 18 tests.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/components/match-first/SurveyShell.test.tsx src/test/match-first-results-map.test.tsx src/test/match-first-neighborhood-detail.test.tsx src/test/match-i18n.test.ts` passed with 57 tests.
- `cd frontend && npm run test:perf:e2e` initially failed while the new map/detail budget test used an inherited Dutch locale and then measured Playwright command overhead. After making language deterministic and measuring map/list/pan/zoom DOM updates in-browser, the same command passed with 9 tests.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts` initially hit a transient 422 in the Chromium backend-provider proof; after the quickstart and provider-proof repair, the exact combined command passed with 21 passed and 3 expected skips, and the opt-in provider proof passed separately in Chromium.
- Post-edge refresh after decoupling survey save/failure analytics from the UI
  sync guard: `cd frontend && npm run test -- src/components/match-first/SurveyShell.test.tsx src/services/matchFirstAnalytics.test.ts`
  passed with 28 tests, `cd frontend && npm run build` passed, the exact
  57-test frontend command passed, the exact final+Dossier E2E command passed
  with 21 passed and 3 expected skips, and `cd frontend && npm run test:perf:e2e`
  passed with 9 tests.
- Red-first embedded-route privacy checks failed before the sanitizer patch,
  then `cd backend && pytest -q tests/test_match_first_analytics_api.py -k private_payload`
  and `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts -t "Dossier bridge"`
  passed after the fix.
- Latest embedded-route repair verification also reran
  `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`,
  which passed with 6 tests across the configured browser projects.
- Amenity accessibility red-first verification:
  `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx -t "toggles amenity filters"`
  failed before implementation because amenity buttons had no pressed state,
  then passed with 18 tests after adding the visible selected/cleared behavior.
- Quickstart reduced-motion verification:
  `cd frontend && npx playwright test --project=chromium tests/e2e/match-first-final-journey.spec.ts -g "reduced-motion quickstart smoke"`
  passed with 2 tests: English and Dutch, Chromium, 390x844,
  `prefers-reduced-motion: reduce`, no blockers.
- Latest requested Phase 8 repair verification:
  `cd frontend && npm run build` passed; `cd frontend && npm run test` passed
  after tightening full-suite timing/performance assertions;
  `cd frontend && npm run test:a11y` passed with 9 tests;
  `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts`
  passed with 21 passed and 3 expected skips; the opt-in shared-backend
  provider proof also passed with
  `$env:RUN_BACKEND_PROVIDER_PROOF='1'; npx playwright test --project=chromium tests/e2e/match-first-dossier-roundtrip.spec.ts -g "backend provider-backed candidate bridge"`;
  `cd frontend && npm run test:perf:e2e` passed with 9 tests;
  `cd backend && ruff check .` passed; `cd backend && pytest -x -q -m "not live"`
  passed with 1365 passed, 12 skipped, and 11 deselected.
- `cd frontend && npm run test:e2e -- --project=chromium tests/e2e/match-first-final-journey.spec.ts` passed; npm argument handling executed the configured Chromium, Firefox, and WebKit projects with 6 tests total.
- Final verification refresh: `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-first-a11y.test.tsx src/test/match-first-results-map.test.tsx src/test/match-first-neighborhood-detail.test.tsx src/services/matchFirstApi.test.ts src/test/match-i18n.test.ts` passed with 74 tests.
- Final verification refresh: `cd backend && ruff check .`, `cd frontend && npm run build`, `cd frontend && npm run test:a11y`, `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts`, `cd frontend && npm run test:perf:e2e`, and `git diff --check` all passed; `git diff --check` reported CRLF normalization warnings only.
- Final verification refresh: `cd frontend && npm run test` passed after stale analytics-transport test expectations were updated.
- Final verification refresh: `cd backend && pytest -x -q -m "not live"` passed with 1365 passed, 12 skipped, and 11 deselected.

Residual risks:

- Live production/mobile-device performance profiling remains a release
  condition outside this local run.
- Human usability metrics for SC-001 and SC-003 remain release-research items.
- Real selected-neighborhood 3D provider coverage remains provider/data
  integration work; current behavior correctly scopes selected-neighborhood
  requests and shows the localized 2D/list fallback when 3D data is missing.
- Repo-wide frontend lint cleanup remains deferred unless lint is made a
  release/CI gate for this branch.

## Phase 8 Final QA Closure 2026-05-17

Files changed in this pass:

- `backend/app/api/match.py`
- `.gitignore`
- `backend/app/models/match.py`
- `backend/app/services/match/instrumentation.py`
- `backend/tests/test_match_first_analytics_api.py`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/components/match-first/SurveyShell.tsx`
- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/components/match-first/AmenityTags.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.css`
- `frontend/src/test/match-first-a11y.test.tsx`
- `frontend/src/test/match-first-results-map.test.tsx`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/tests/e2e/match-first-final-journey.spec.ts`
- `frontend/tests/e2e/performance-budget.spec.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `docs/qa/final_evidence.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `specs/002-match-first-revamp/acceptance-traceability.md`
- `specs/002-match-first-revamp/tasks.md`

Completed work:

- Added `POST /api/match/analytics` with stable event validation,
  idempotent client event IDs, privacy rejection/redaction, no-store responses,
  and tests for required Phase 8 analytics events.
- Added missing frontend analytics for survey back, recommendation selection, and
  amenity filter click; expanded the frontend event catalog to cover the
  required Phase 8 funnel and edge-state events.
- Converted amenity tags into keyboard/touch buttons with localized accessible
  labels and 44 px target styling.
- Added final cross-browser Playwright journey coverage for landing, secondary
  search click, survey, review, backend matching, success, results, map/list
  selection, neighborhood detail, amenity filter, house click, existing Dossier,
  and Back to match map.
- Updated performance E2E away from the pre-revamp immediate address-search
  assumption. It now measures match-first landing readiness and secondary
  search suggest feedback.
- Updated final evidence, traceability, open punchlist, and task status. Rows
  with deferred work are labelled partial and are not marked pass.

Verification:

- `cd backend && pytest -q tests/test_match_first_analytics_api.py` passed with
  4 tests.
- `cd backend && pytest -q tests/test_match_first_analytics_api.py tests/test_match_instrumentation.py` passed with 9 tests.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts src/test/match-first-a11y.test.tsx src/test/match-first-results-map.test.tsx src/test/match-first-neighborhood-detail.test.tsx src/services/matchFirstApi.test.ts src/test/match-i18n.test.ts` passed with 74 tests on the final verification refresh.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts` passed across Chromium, Firefox, and WebKit.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-final-journey.spec.ts tests/e2e/match-first-dossier-roundtrip.spec.ts` now passes with 21 passed and 3 expected skips after the spec-aligned analytics repair and quickstart additions.
- `cd frontend && npm run test:perf:e2e` now passes with 9 tests, including the local results map and selected-neighborhood detail performance budgets.
- `cd frontend && npm run build` passed.
- `cd frontend && npm run test` passed.
- `cd frontend && npm run test:a11y` passed with 9 tests.
- `cd backend && ruff check .` passed.
- `cd backend && pytest -x -q -m "not live"` passed with 1365 passed, 12 skipped, and 11 deselected on the final verification refresh.
- `git diff --check` passed with CRLF normalization warnings only.

Residual risks:

- Anonymous match-session deletion was later closed by the 2026-05-18 repair:
  `DELETE /api/match/sessions/{session_id}` is implemented and covered by
  backend tests.
- Live production/mobile-device performance profiling remains deferred. Local
  Playwright performance E2E passes.
- Real selected-neighborhood 3D provider coverage remains a provider/data
  integration item. Current behavior correctly scopes selected-neighborhood
  requests and shows localized 2D/list fallback when 3D data is missing.
- Repo-wide frontend lint cleanup remains deferred because known pre-existing
  lint issues are outside the Phase 8 slice; build, full tests, a11y, E2E, and
  performance gates passed.

## Phase 7 Commit Readiness Verification 2026-05-17

Final local CI-equivalent verification before committing and pushing Phase 7:

- `cd backend && ruff check .` passed.
- `cd backend && pytest -x -q -m "not live and not visual and not benchmark"` passed with 1354 passed, 8 skipped, and 17 deselected.
- `cd backend && pytest -x -q -m "not live"` passed with 1356 passed, 12 skipped, and 11 deselected.
- `cd backend && pytest -x -q -m "visual"` collected 4 skipped and 1375 deselected locally.
- `cd backend && pytest -x -q -m "benchmark"` passed with 2 passed and 1377 deselected.
- `cd frontend && npm run build` passed after the final type-only copy-guard repair.
- `cd frontend && npm run test` passed.
- `npm run landing:test:e2e` passed with 23 passed and 1 skipped.
- `cd frontend && npm run test -- --run src/test/match-first-copy-guard.test.ts` passed with 7 tests after replacing the `Promise<void>` prop signatures in `HouseSelectionPanel` with local handler aliases so the existing JSX copy guard no longer misreads TypeScript generics as visible copy.

Blocked / residual:

- `cd frontend && npm run lint` still fails on repo-wide pre-existing lint
  issues outside the Phase 7 CI workflow, including React Compiler
  set-state/ref rules, Fast Refresh export rules, older test unused variables,
  and unrelated `any` usages. The active GitHub CI workflow does not run this
  frontend lint command.

## Latest Provider-Backed Phase 7 Closure 2026-05-17

This pass closed the remaining Phase 7 provider-backed candidate gap without
starting Phase 8.

Files changed in this repair:

- `backend/app/services/locatieserver.py`
- `backend/app/services/match/buildings.py`
- `backend/tests/test_locatieserver.py`
- `backend/tests/test_match_neighborhood_layers.py`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/src/test/match-i18n.test.ts`
- `specs/002-match-first-revamp/contracts/match-first-api.md`
- `specs/002-match-first-revamp/tasks.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `docs/ai/latest_handoff.md`

Completed repair work:

- Added `locatieserver.reverse_addresses()` against the PDOK Locatieserver
  Reverse API and parse it into the existing `ResolvedAddress` model.
- Added an ambiguous third server-side seed house candidate; ambiguous bridge
  requests derive the server-side footprint centroid and call PDOK reverse for
  nearby address candidates.
- Candidate IDs are stable from provider lookup IDs, candidate labels use EN/NL
  translation keys with provider label params, and provider source refs include
  `pdok_locatieserver_reverse`.
- Empty or failed provider results recover to `manual_required` instead of
  invented deterministic addresses.
- Added backend tests for provider-backed candidates, selected provider
  candidate to Dossier, provider-empty/manual recovery, provider failure, and
  Locatieserver reverse parsing.
- Added browser proof: Chromium creates a real completed backend match, opens
  the backend-selected candidate house, receives PDOK reverse-backed candidates
  from the real backend bridge, opens Dossier, returns to match map, and
  verifies no `/run` during Dossier open or return. The backend-integrated
  provider proof is opt-in to avoid local shared-DB races in the two-worker
  combined suite; the cross-browser UI round-trip proof still runs by default.

Red-first evidence:

- `cd backend && pytest -q tests/test_locatieserver.py -k reverse` failed before
  implementation because `reverse_addresses` did not exist.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "provider or candidate_addresses or selected_candidate_address"` failed before
  implementation because candidate addresses were deterministic/non-provider and
  provider-empty/failure recovery was absent.

Verification:

- `cd backend && ruff check app tests/test_match_neighborhood_layers.py tests/test_locatieserver.py` passed.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py tests/test_locatieserver.py` passed with 34 tests.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/test/match-i18n.test.ts` passed with 19 tests.
- `$env:RUN_BACKEND_PROVIDER_PROOF='1'; npx playwright test --project=chromium tests/e2e/match-first-dossier-roundtrip.spec.ts -g "backend provider-backed candidate bridge"` passed with 1 test; the default final+Dossier E2E command passed with 21 passed and 3 expected skips.

Residual risk:

- No Phase 7 provider-backed candidate blocker remains. Full frontend lint is
  still a repo-wide pre-existing blocker outside this Phase 7 slice.

## Latest Stop-Phase-8 Candidate Address Repair 2026-05-17

This pass fixed the remaining Phase 7 candidate-address selection gap without
starting Phase 8.

Files changed in this repair:

- `backend/app/models/match.py`
- `backend/app/services/match/buildings.py`
- `backend/tests/test_match_neighborhood_layers.py`
- `frontend/src/types/matchFirst.ts`
- `frontend/src/services/matchFirstApi.test.ts`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.css`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/test/match-i18n.test.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts`
- `specs/002-match-first-revamp/contracts/match-first-api.md`
- `specs/002-match-first-revamp/tasks.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `docs/ai/latest_handoff.md`

Completed repair work:

- Extended `MatchDossierBridgeResponse` to support `resolved`, `candidates`,
  `manual_required`, and `unavailable`, plus `candidate_addresses` with stable
  candidate IDs, VBO/lookup where available, translated display label keys and
  params, reliability, source refs, and fallback reason codes.
- Candidate selection is validated against server-generated selected-neighborhood
  candidate addresses. Selected-candidate Dossier routes are built from server
  candidate values, not client-supplied VBO/address/lookup IDs.
- Frontend candidate choices render inside `HouseSelectionPanel`/`NeighborhoodDetail`
  with keyboard-usable buttons, unique accessible names/descriptions, 44 px
  touch targets, focus-visible styling, EN/NL translation keys only, manual
  search, and Back to results.
- Dossier return context remains preserved for session/job/result/vector,
  neighborhood/result rank/house, map center/zoom, list scroll, mobile mode,
  and language. Candidate selection and Dossier return do not call `/run`.
- Analytics tests assert candidate IDs, VBOs, lookup IDs, and address labels are
  not stored.
- API contract, tasks, traceability, punch list, and this handoff were updated
  with the candidate-address selection contract. The later provider-backed
  closure section above supersedes the earlier reduced-scope status.

Red-first evidence:

- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "candidate_addresses or selected_candidate_address or manual_required or spoofed_candidate_address"` failed before implementation because ambiguous houses returned `unavailable`, selected candidates were ignored, manual-required was not represented, and spoofed candidate IDs returned 200.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts -- -t "candidate|manual|Phase 7 house-selection controls|translation"` failed before implementation because candidate choices were not rendered, manual-required showed no-reliable copy, and candidate touch-target CSS was missing.

Final verification in this repair:

- `cd backend && ruff check app tests/test_match_neighborhood_layers.py` passed.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py tests/test_export_entitlement.py tests/test_reports_api.py` passed with 40 tests.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py` passed with 18 tests.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/App.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-first-routing.test.tsx src/services/matchSessionStorage.test.ts src/test/match-i18n.test.ts` passed.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts` passed with 9 tests across Chromium, Firefox, and WebKit.
- `cd frontend && npm run build` passed.
- `git diff --check` passed with CRLF normalization warnings only.

Residual risk:

- Superseded by the provider-backed Phase 7 closure section above.

## Latest Stop-Phase-8 Phase 7 Repair 2026-05-17

This pass repaired Phase 7 before any Phase 8 work. It addressed the review
items for backend trust boundaries, frontend recovery behavior, analytics
privacy/timing, browser E2E proof, and documentation status.

Files changed in this repair:

- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `backend/app/services/match/buildings.py`
- `backend/tests/test_match_neighborhood_layers.py`
- `frontend/src/App.tsx`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.css`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/App.test.tsx`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `docs/qa/open_punchlist.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`
- `specs/002-match-first-revamp/contracts/match-first-api.md`
- `specs/002-match-first-revamp/tasks.md`

Completed repair work:

- Backend Dossier bridge now requires `selected_result_id` and
  `selected_result_rank`, validates the completed result context, rejects
  spoofed `building_id`, `vbo_id`, `address_id`, `lookup_id`, and
  `selected_house_id` return-context values that are not server-side candidates
  for the selected result/neighborhood, and builds the Dossier route/return
  context from the server-resolved candidate. The server-side seed candidate set
  now exposes and verifies both first and second deterministic house candidates.
- Malformed `vbo_id` values now return stable `match.dossier.invalid_vbo_id`
  instead of raw Pydantic validation details.
- `NeighborhoodDetail` now distinguishes stable API errors: `match.results.stale`
  and result-not-found cases show results-unavailable recovery, while no reliable
  address and invalid bridge routes show localized manual-search and Back to
  results actions.
- Analytics no longer allowlist/store exact `address_id`; `match_dossier_opened`
  is recorded only after `App` hydrates the returned Dossier lookup/VBO, not
  merely when `NeighborhoodDetail` accepts a route. `App.openMatchDossierRoute`
  now rejects bridge routes without structured `match_return` context containing
  a `sessionId` and `target`, and failed lookups do not record Dossier-open.
  Back-to-map return success/failure is recorded after target
  results/neighborhood hydration, with App-level timing regressions and E2E
  analytics assertions.
- Added `frontend/tests/e2e/match-first-dossier-roundtrip.spec.ts` covering
  mobile + reduced-motion house -> existing Dossier -> Back to match map ->
  restored selected state -> second house without `/run`, bridge-route rejection
  when `match_return` is missing, and lookup-failure-without-Dossier-open
  analytics across Chromium, Firefox, and WebKit. The latest candidate repair
  now routes the first house through a candidate-address choice before Dossier
  entry. A later provider-backed closure adds PDOK Locatieserver reverse
  candidate sourcing plus a Chromium backend-integrated browser proof; Firefox
  and WebKit continue to cover the UI-mocked return flow.

Red-first evidence:

- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "selected_result_identity or client_spoofed"` initially failed because missing selected-result identity and spoofed candidate IDs were accepted.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "spoofed_return_selected_house_id"` initially failed because spoofed return-context selected-house IDs were echoed into Dossier context.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "second_selected_building or invalid_vbo"` initially failed because only candidate 001 resolved and malformed VBOs leaked raw Pydantic detail.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx` initially failed because bridge `match.results.stale` rendered no-reliable-address recovery and no manual-search/back recovery actions existed.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx -- -t "rejects a resolved bridge route"` initially failed because rejected resolved bridge routes left the user on the house list with no recovery UI.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts` initially failed because `address_id` was still stored for `match_dossier_opened`.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx -t "house-selection controls|reliable house candidate"` initially failed because `NeighborhoodDetail` recorded Dossier-open on route acceptance and house recovery controls lacked the required 44 px CSS proof.

Verification:

- `cd backend && ruff check app tests/test_match_neighborhood_layers.py` passed.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py tests/test_export_entitlement.py tests/test_reports_api.py` passed with 40 tests.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/App.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-first-routing.test.tsx src/services/matchSessionStorage.test.ts src/test/match-i18n.test.ts` passed.
- `cd frontend && npm run test:e2e -- tests/e2e/match-first-dossier-roundtrip.spec.ts` passed with 9 tests across Chromium, Firefox, and WebKit.
- `cd frontend && npm run build` passed.
- `git diff --check` passed with CRLF normalization warnings only.

Residual risks:

- Provider-backed live candidate address sourcing/proof is closed by the later
  PDOK Locatieserver reverse repair in this handoff. The only remaining note is
  that the provider-backed browser proof runs once in Chromium to avoid shared
  local database races, while Firefox and WebKit keep UI-mocked route coverage.
- Full repo `npm run lint` remains a known pre-existing blocker outside this
  Phase 7 repair; the required Phase 7 verification commands passed.

## Latest Phase 7 Review Gap Repair 2026-05-17

This pass implemented only the Phase 7 gaps found in review. It did not start
Phase 8 final QA or redesign Dossier modules. The later stop-Phase-8 repair
above added browser E2E proof and tightened the trust boundary further.

Files changed in this repair:

- `backend/app/api/match.py`
- `backend/tests/test_match_neighborhood_layers.py`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `specs/002-match-first-revamp/tasks.md`

Completed repair work:

- Added backend validation that Dossier bridge return context matches the
  persisted completed result's `job_id`, `preference_vector_version`, selected
  result ID, selected neighborhood, and selected result rank. Stale context now
  returns stable `match.results.stale`.
- Fixed selected-neighborhood detail hydration so a valid returned
  map/list/house/language state is preserved exactly instead of being replaced
  by the neighborhood centroid and minimum zoom.
- Added unique bilingual accessible names for each house Dossier action while
  keeping the visible button label unchanged.

Red-first evidence:

- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "dossier_bridge_rejects_stale_return_metadata"` initially failed because stale `job_id`, vector version, and selected-result metadata still returned 200.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx --runInBand` initially failed because returned center/zoom were overwritten and the house buttons still had the same accessible name.

Verification:

- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "dossier_bridge_rejects_stale_return_metadata"` passed.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx --runInBand` passed with 9 tests; npm warned that `--runInBand` is an unknown npm config.
- `cd backend && ruff check app tests/test_match_neighborhood_layers.py` passed.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py` passed with 10 tests.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/App.test.tsx` passed; the existing App suite still logs React `act(...)` warnings and sunlight debug output.
- `cd frontend && npm run test -- src/services/matchFirstApi.test.ts src/test/match-first-routing.test.tsx src/services/matchSessionStorage.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts` passed with 35 tests.
- `cd frontend && npm run build` passed.
- `cd frontend && npx eslint src/components/match-first/HouseSelectionPanel.tsx src/components/match-first/NeighborhoodDetail.tsx src/services/matchFirstAnalytics.ts src/services/matchFirstAnalytics.test.ts src/services/matchFirstApi.ts src/services/matchFirstApi.test.ts src/test/match-first-neighborhood-detail.test.tsx src/types/matchFirst.ts` passed.
- `cd frontend && npm run test -- src/components/DossierSheet.test.tsx src/components/RiskTilesGrid.test.tsx src/components/ExportBottomSheet.test.tsx src/components/ActionBar.test.tsx src/components/BuildingFactsCard.test.tsx src/components/ViewingChecklist.test.tsx` passed with 89 tests.
- `cd backend && pytest -q tests/test_export_entitlement.py tests/test_reports_api.py` passed with 22 tests.
- `git diff --check` passed, with only CRLF normalization warnings.

Residual checks:

- `cd frontend && npm run lint` remains a known pre-existing repo-wide lint
  blocker outside this Phase 7 repair; touched TypeScript lint passed.
- Dedicated browser/mobile E2E proof for house -> existing Dossier -> Back to
  match map -> second house has since been added by the stop-Phase-8 repair
  above.
- Multi-address ambiguity remains constrained to the current
  candidate/unavailable response contract until real provider data is
  integrated.

## Latest Phase 7 Dossier Bridge Update 2026-05-17

This pass implemented only the house-to-existing-Dossier bridge and persistent
Back to match map behavior.

Files changed:

- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `backend/app/services/match/buildings.py`
- `backend/tests/test_match_neighborhood_layers.py`
- `frontend/src/App.tsx`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchFirstApi.test.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/src/types/matchFirst.ts`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `specs/002-match-first-revamp/tasks.md`

Completed work:

- Added `POST /api/match/dossier/from-building` with no-store responses,
  completed-result validation, stale-result rejection, and no checkout
  `session_id` query reuse.
- Added deterministic bridge resolution in the existing building service:
  reliable 16-digit VBO/address inputs produce `#/address/{vbo_id}` routes;
  unresolved buildings return stable `match.neighborhood.no_reliable_address`.
- Wired selected house buttons to call the bridge, persist selected
  neighborhood/result/house/map/list/language state, and open the existing
  Dossier route without rerunning matching.
- Preserved direct Dossier entry from address search and existing Dossier
  modules; only match-return route/context and the persistent localized Back to
  match map action were used.
- Added privacy-safe Phase 7 analytics for Dossier open, no reliable address,
  Back to match map click, return success, and return failure.

Verification:

- `cd backend && ruff check app tests/test_match_neighborhood_layers.py` passed.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py` passed with 10 tests after the Phase 7 review-gap repair.
- `cd frontend && npm run test -- src/services/matchFirstApi.test.ts src/test/match-first-routing.test.tsx src/services/matchSessionStorage.test.ts src/services/matchFirstAnalytics.test.ts --runInBand` passed with 33 tests; npm warned that `--runInBand` is an unknown npm config.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/App.test.tsx --runInBand` passed; the existing App suite still logs React `act(...)` warnings and sunlight debug output.
- `cd frontend && npm run build` passed.
- `cd frontend && npx eslint src/components/match-first/HouseSelectionPanel.tsx src/components/match-first/NeighborhoodDetail.tsx src/services/matchFirstAnalytics.ts src/services/matchFirstAnalytics.test.ts src/services/matchFirstApi.ts src/services/matchFirstApi.test.ts src/test/match-first-neighborhood-detail.test.tsx src/types/matchFirst.ts` passed.
- `cd frontend && npm run test -- src/components/DossierSheet.test.tsx src/components/RiskTilesGrid.test.tsx src/components/ExportBottomSheet.test.tsx src/components/ActionBar.test.tsx src/components/BuildingFactsCard.test.tsx src/components/ViewingChecklist.test.tsx --runInBand` passed with 89 tests.
- `cd backend && pytest -q tests/test_export_entitlement.py tests/test_reports_api.py` passed with 22 tests.

Blocked / residual checks:

- `cd frontend && npm run lint` is still blocked by pre-existing repo-wide
  React Compiler/Fast Refresh/no-unused-vars issues outside this Phase 7 slice;
  `frontend/src/App.tsx` also still has the known pre-existing
  `react-refresh/only-export-components` export warning.
- Dedicated Playwright/mobile round-trip proof for house -> Dossier -> Back to
  match map -> second house has since been added by the stop-Phase-8 repair
  above. Component, routing, API, build, and Dossier preservation gates passed.

## Latest Phase 6 Boundary Repair Update 2026-05-17

This pass removed stale Phase 7 Dossier bridge code that had been reintroduced
after the Phase 6 review repair. The active implementation remains Phase 6-only:
selected buildings can be selected locally and stored in match map state, but no
Dossier bridge endpoint or route opening is present yet.

Files changed:

- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchFirstApi.test.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/src/types/matchFirst.ts`
- `specs/002-match-first-revamp/tasks.md`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`

Completed work:

- Removed `POST /api/match/dossier/from-building`, bridge models, bridge
  service, and bridge tests from the active codebase.
- Removed frontend bridge types/API calls and Phase 7 Dossier analytics event
  names from the active Phase 6 implementation.
- Kept local Phase 6 house selection: reliable/candidate/manual building rows
  can be selected, `selectedHouseId` is stored with the selected-neighborhood
  map state, and localized copy states that Dossier opening is a later step.
- Strengthened detail tests so selecting a house does not call `/run` or
  `/dossier/from-building`, and unavailable building records leave the list
  fallback usable without a map or Dossier interaction.

Verification:

- `rg -n "resolveDossierFromBuilding|dossier/from-building|MatchDossier|DossierBridge|onOpenDossier|openMatchDossierRoute|pendingBuildingId|setPendingBuildingId|match_dossier_opened|match_back_to_map" frontend/src backend/app backend/tests` now reports only the existing manual Dossier fallback handler in `App.tsx` and negative assertions in `match-first-neighborhood-detail.test.tsx`.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts` passed with 27 tests.
- `cd backend && ruff check .` passed.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py` passed with 4 tests.
- `cd frontend && npm run build` passed.
- Earlier CI-style Phase 6 verification in this worktree also passed:
  `cd frontend && npm run test`; `npm run landing:test:e2e`; `cd backend &&
  pytest -x -q -m "not live and not visual and not benchmark"`; `cd backend &&
  pytest -x -q -m "visual"`; and `cd backend && pytest -x -q -m "benchmark"`.

Residual risks / next checks:

- Phase 7 house-to-existing-Dossier bridge, persistent Back to match map
  restoration, and browser/mobile round-trip proof have since been implemented
  in the 2026-05-17 Phase 7 sections above.
- Full repo frontend lint still has pre-existing failures outside the Phase 6
  touched surface and is not part of the active GitHub CI workflow.
- Browser-level Playwright/mobile-performance proof for selected-neighborhood
  detail remains open before production release.

## Latest Phase 6 Review Repair Update 2026-05-17

This pass repaired the Phase 6 review findings only. It did not implement Phase
7 Dossier bridge behavior, national 3D loading, national amenities, or live 3D
provider integration.

Files changed in this repair:

- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `backend/tests/test_match_neighborhood_layers.py`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `specs/002-match-first-revamp/tasks.md`

Completed repair work:

- Decoupled selected-neighborhood summary/map-layer loading from amenity tag
  loading with settled request handling. Amenity failures now show the localized
  amenity fallback without clearing selected boundary/layer data or blocking the
  selected-bounds building fallback request.
- Added a regression that fails if an amenity endpoint failure prevents the
  selected-neighborhood map, scoped building request, missing-3D fallback, or
  nonblank canvas fallback from remaining usable.
- Tightened frontend building-request assertions to parse `bounds_rd` and
  require the exact selected-neighborhood `allowed_bounds_rd` returned by the
  map-layer payload, instead of only checking that one national bounds string is
  absent.
- Strengthened backend building bounds coverage with a centimeter-scale
  out-of-scope RD New request in addition to the national-bounds rejection.

Red-first / repair evidence:

- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx -- -t "keeps selected map"` first failed because the map lost `data-display-bounds-wgs84` after an amenity failure. After the repair, `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx -- -t "keeps selected map|uses the exact selected"` passed with 2 tests.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py -k "building_requests"` passed after adding the extra out-of-scope edge case, confirming the existing backend guard already rejected the stricter request.

Verification:

- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/test/match-first-results-map.test.tsx src/services/matchFirstApi.test.ts src/test/match-first-a11y.test.tsx src/test/match-first-copy-guard.test.ts src/test/match-i18n.test.ts` passed with 53 tests.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts` passed with 7 tests.
- `cd frontend && npx eslint src/components/match-first/ResultsMap.tsx src/components/match-first/RecommendationCard.tsx src/components/match-first/RecommendationList.tsx src/components/match-first/NeighborhoodDetail.tsx src/components/match-first/NeighborhoodBuildingLayer.tsx src/components/match-first/AmenityTags.tsx src/components/match-first/HouseSelectionPanel.tsx src/test/match-first-neighborhood-detail.test.tsx src/test/match-first-results-map.test.tsx src/services/matchFirstApi.ts src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.ts` passed.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py` passed with 4 tests.
- `cd backend && ruff check app tests/test_match_neighborhood_layers.py` passed.
- `cd frontend && npm run test` passed. Existing noisy Dossier/3D console output and React act warnings still print from older suites; no test failed.
- `cd frontend && npm run build` passed. Build emitted
  `NeighborhoodDetail-BZmcPcs8.js` at 11.63 kB / 3.30 kB gzip and
  `ResultsMap-BDMzYqxK.js` at 161.28 kB / 46.52 kB gzip.
- `cd backend && ruff check .` passed.
- `cd backend && pytest -x -q -m "not live and not visual and not benchmark"` passed with 1337 tests, 8 skipped, and 17 deselected.
- `npm run landing:test:e2e` passed with 23 tests and 1 skipped.
- `cd backend && pytest -x -q -m "benchmark"` passed with 2 tests and 1360 deselected.
- `cd backend && pytest -x -q -m "visual"` collected the visual marker locally with 4 skipped and 1358 deselected.

Residual risks / next checks:

- Real selected-neighborhood 3D rendering remains a provider/data integration
  risk. Current seed data intentionally resolves to the localized 2D fallback.
- Browser-level Playwright/mobile performance proof for selected-neighborhood
  detail remains open before production release; this repair strengthens
  component-level fallback and bounds regression coverage.
- Phase 7 house/building-to-Dossier bridge and browser/mobile round-trip proof
  have since been implemented in the 2026-05-17 sections above.

## Latest Phase 6 Selected-Neighborhood Detail Update 2026-05-16

This pass implemented only SpecKit Phase 6. It did not implement Phase 7
house-to-Dossier navigation or Dossier bridge endpoints.

Files changed:

- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `backend/app/services/match/geometry.py`
- `backend/app/services/match/buildings.py`
- `backend/app/services/match/amenities.py`
- `backend/tests/test_match_neighborhood_layers.py`
- `frontend/src/App.tsx`
- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/components/match-first/ResultsMap.css`
- `frontend/src/components/match-first/RecommendationCard.tsx`
- `frontend/src/components/match-first/RecommendationList.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.tsx`
- `frontend/src/components/match-first/NeighborhoodDetail.css`
- `frontend/src/components/match-first/NeighborhoodBuildingLayer.tsx`
- `frontend/src/components/match-first/AmenityTags.tsx`
- `frontend/src/components/match-first/HouseSelectionPanel.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchFirstApi.test.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/types/matchFirst.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/src/test/match-first-neighborhood-detail.test.tsx`
- `frontend/src/test/match-first-results-map.test.tsx`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `docs/ai/latest_handoff.md`
- `specs/002-match-first-revamp/tasks.md`
- `.dockerignore`

Completed work:

- Added selected-neighborhood summary, map-layer, building, and amenity
  contracts under `/api/match/neighborhoods/{neighborhood_id}`.
- Added backend RD New bounds validation so national or out-of-scope building
  requests return `match.building_bounds_out_of_scope`.
- Added preference-aware amenity tags capped to the default 5-7 category range,
  with stable frontend label/reason keys.
- Added a selected-neighborhood detail route/screen that fetches completed
  results, selected boundary/layers/amenities, then buildings for selected
  bounds only. It does not call `/run`.
- Added a nonblank localized 2D/canvas fallback for missing 3D, plus list-based
  no-reliable-address fallback without Dossier navigation.
- Added privacy-safe analytics keys for detail open, layer failures, and
  missing-3D fallback.

Verification:

- `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
  returned `FEATURE_DIR` as
  `C:\Users\milos\buurt-check\specs\002-match-first-revamp`.
- Checklist status: `requirements.md` passed with 76/76 completed items.
- `cd backend && pytest -q tests/test_match_neighborhood_layers.py` passed with
  4 tests.
- `cd backend && ruff check app tests/test_match_neighborhood_layers.py` passed.
- `cd frontend && npm run test -- src/test/match-first-neighborhood-detail.test.tsx src/test/match-first-results-map.test.tsx src/services/matchFirstApi.test.ts src/test/match-first-a11y.test.tsx src/test/match-first-copy-guard.test.ts src/test/match-i18n.test.ts`
  passed with 51 tests.
- `cd frontend && npm run test -- src/services/matchFirstAnalytics.test.ts`
  passed with 7 tests.
- `cd frontend && npx eslint src/components/match-first/ResultsMap.tsx src/components/match-first/RecommendationCard.tsx src/components/match-first/RecommendationList.tsx src/components/match-first/NeighborhoodDetail.tsx src/components/match-first/NeighborhoodBuildingLayer.tsx src/components/match-first/AmenityTags.tsx src/components/match-first/HouseSelectionPanel.tsx src/test/match-first-neighborhood-detail.test.tsx src/test/match-first-results-map.test.tsx src/services/matchFirstApi.ts src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.ts`
  passed.
- `cd frontend && npm run build` passed. Build emitted
  `NeighborhoodDetail-D6byeTfP.js` at 11.40 kB / 3.24 kB gzip and
  `NeighborhoodDetail-BkE5_SO2.css` at 3.37 kB / 1.07 kB gzip.

Residual risks / next checks:

- Real selected-neighborhood 3D rendering remains a provider/data integration
  risk. Current seed data intentionally resolves to the localized 2D fallback.
- Browser-level Playwright/mobile performance proof for selected-neighborhood
  detail remains open before production release.
- Direct `npx eslint src/App.tsx` still reports the existing
  `react-refresh/only-export-components` helper-export issue plus an unrelated
  hook dependency warning; targeted lint for Phase 6 files passed.
- Phase 7 house/building-to-Dossier bridge and browser/mobile round-trip proof
  have since been implemented in the 2026-05-17 sections above.

## Latest Phase 5 Results Map Review Repair Update 2026-05-16

This pass stayed inside Phase 5. It did not implement selected-neighborhood
detail/3D, house click behavior, Dossier bridge behavior, national amenities,
or any matching rerun behavior.

Files changed:

- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/components/match-first/RecommendationList.tsx`
- `frontend/src/test/match-first-results-map.test.tsx`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`

Completed repair work:

- Fixed verified in-memory results rendering so saved map state is applied only
  when `resultSetId` and `preferenceVectorVersion` match the active
  `initialResults`. Stale state now falls back to the required Netherlands
  start, map mode, national zoom, and no preselected recommendation.
- Applied the same result identity guard to Leaflet initialization and reset
  stale fetched-route mobile mode to Map when the saved state does not match.
- Added map-to-list visual reveal by scrolling the selected recommendation row
  into view after a marker or polygon selection, while leaving list-origin
  selection behavior unchanged.
- Added direct list scroll persistence through the recommendation list
  `onScroll` handler so Dossier-return state records the user's final list
  position even when no other tracked state changes afterward.

Red-first evidence:

- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
  first failed with 3 expected failures: stale `initialResults` opened at
  `52.1,5.03` instead of `52.2,5.3`, map-origin selection did not call
  `scrollIntoView`, and list scroll persisted `0` instead of `144`. After the
  repair, the same command passed with 8 tests.

Verification:

- `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
  returned `FEATURE_DIR` as
  `C:\Users\milos\buurt-check\specs\002-match-first-revamp` with
  `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and
  `tasks.md` available.
- Checklist status: `requirements.md` passed with 76/76 completed items.
- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
  passed with 8 tests.
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/match-first-copy-guard.test.ts src/test/match-i18n.test.ts`
  passed with 28 tests.
- `cd frontend && npx eslint src/components/match-first/ResultsMap.tsx src/components/match-first/RecommendationList.tsx src/test/match-first-results-map.test.tsx`
  passed.
- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx src/test/match-first-progress.test.tsx src/App.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts src/test/match-first-copy-guard.test.ts`
  passed. Existing noisy Dossier/3D console output and React act warnings still
  print in `App.test.tsx`; no test failed.
- `cd frontend && npm run build` passed. The Phase 5 lazy results-map chunk in
  this build was `ResultsMap-aGJKtWIH.js` at 160.78 kB, 46.41 kB gzip, with
  `ResultsMap-CoY3xfYW.css` at 20.75 kB, 7.88 kB gzip.

Residual risks / next checks:

- Full `cd frontend && npm run lint` was not rerun; previous Phase 5 notes
  still apply that repo-wide lint has pre-existing non-Phase-5 failures.
- Browser-level Playwright/performance proof for the results map remains a
  residual verification gap before production release.
- Phase 6 is now implemented in the latest update above; Phase 7 remains next.

## Latest Phase 5 State-Preservation Repair Update 2026-05-16

This pass stayed inside Phase 5. It did not implement selected-neighborhood
detail/3D, house click behavior, Dossier bridge behavior, national amenities,
or any matching rerun behavior.

Files changed:

- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/test/match-first-results-map.test.tsx`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`

Completed repair work:

- Added a regression for opening `#/match/session/{session_id}/results` with a
  saved result-map state already in `sessionStorage` while the completed result
  set is fetched from `GET /api/match/sessions/{session_id}/results`.
- Fixed `ResultsMap` so fetched completed results preserve saved selected
  recommendation, selected neighborhood, mobile Map/List mode, map center,
  zoom, and list scroll when the saved `resultSetId` and
  `preferenceVectorVersion` match the loaded result set.
- Kept stale saved map state from being applied to a different result set or
  preference-vector version.

Red-first evidence:

- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx -- -t "restores saved map view"`
  first failed because the fetched route reset `data-map-center` to `52.2,5.3`
  instead of the saved selected view `52.1,5.03`; after the fix the same command
  passed.

Verification:

- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
  passed with 5 tests.
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx src/test/match-first-copy-guard.test.ts src/test/match-i18n.test.ts`
  passed with 28 tests.
- `cd frontend && npx eslint src/components/match-first/ResultsMap.tsx src/test/match-first-results-map.test.tsx`
  passed.
- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx src/test/match-first-progress.test.tsx src/App.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts src/test/match-first-copy-guard.test.ts`
  passed. Existing noisy Dossier/3D console output and React act warnings still
  print in `App.test.tsx`, but no test failed.
- `cd frontend && npm run build` passed. The Phase 5 lazy results-map chunk in
  this build was `ResultsMap-DPGLvjhc.js` at 160.18 kB, 46.20 kB gzip, with
  `ResultsMap-CoY3xfYW.css` at 20.75 kB, 7.88 kB gzip.

Residual risks / next checks:

- Full `cd frontend && npm run lint` was not rerun; previous Phase 5 notes
  still apply that repo-wide lint has pre-existing non-Phase-5 failures.
- Browser-level Playwright/performance proof for the results map remains a
  residual verification gap before production release.
- Phase 6 is now implemented in the latest update above; Phase 7 remains next.

## Latest Phase 4 Gating/A11y Audit Repair Update 2026-05-16

This pass repaired Phase 4 before any Phase 6 work. It did not implement
selected-neighborhood detail/3D, house click behavior, Dossier bridge behavior,
or additional Phase 5 map behavior.

Files changed:

- `frontend/src/components/match-first/MatchingProgressScreen.tsx`
- `frontend/src/test/match-first-progress.test.tsx`
- `frontend/src/test/match-first-a11y.test.tsx`
- `docs/qa/open_punchlist.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`

Completed repair work:

- Tightened terminal result hydration so `MatchingProgressScreen` now requires
  terminal `status.result_set_id` to be present and exactly equal to
  `results.result_set_id` before calling `onComplete`.
- Added a null/missing `result_set_id` regression where `GET /results`
  otherwise matches `session_id`, `job_id`, and `status`; the UI now shows
  Results unavailable, emits no checkmark, does not call `onComplete`, and
  records `match_results_unavailable` with reason `missing_result_set_id`.
- Strengthened Phase 4 component accessibility evidence: axe coverage now
  renders the real `MatchingProgressScreen` running, failed retry, and
  results-unavailable states, plus `MatchSuccessCheckmark` animated and
  reduced-motion states.
- Reconciled `docs/qa/open_punchlist.md` so Phase 5 is closed for the documented
  map/list slice, while Phase 6, Phase 7, anonymous deletion, production
  data/validation, Phase 5 browser e2e/perf, full frontend lint, and npm audit
  risks remain open where applicable.

Red-first / repair evidence:

- `cd frontend && npm run test -- src/test/match-first-progress.test.tsx`
  initially failed with 2 failures for the new null/missing terminal
  `result_set_id` cases; after the production fix it passed with 24 tests.
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx`
  first exposed a test expectation mismatch for the real progress heading; the
  component contract was unchanged, the test was corrected, and the suite passed
  with 19 tests.

Final commands run:

- `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/test/match-first-a11y.test.tsx src/components/match-first/MatchSuccessCheckmark.test.tsx src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts`
  passed with 55 tests.
- `cd frontend && npx eslint src/components/match-first/MatchingProgressScreen.tsx src/components/match-first/MatchSuccessCheckmark.tsx src/test/match-first-progress.test.tsx src/test/match-first-a11y.test.tsx`
  passed.
- `cd frontend && npm run build` passed. The build emitted the existing
  placeholder assetlinks/AASA production-release notices.

Residual risks / next checks:

- The new Phase 4 a11y evidence is component-level axe coverage plus existing
  keyboard/focus tests elsewhere. It does not constitute a full browser
  touch-target or end-to-end focus audit for every Phase 4 path.
- Full `cd frontend && npm run lint` was not rerun in this pass and remains a
  known broader cleanup item from pre-existing non-Phase-4 files.
- Phase 6 must still add selected-neighborhood detail without loading national
  3D buildings; Phase 7 must wire house selection to the existing Dossier and
  preserve return context.

## Latest Phase 5 Results Map Update 2026-05-16

Files changed:

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/App.tsx`
- `frontend/src/components/match-first/ResultsMap.tsx`
- `frontend/src/components/match-first/ResultsMap.css`
- `frontend/src/components/match-first/RecommendationList.tsx`
- `frontend/src/components/match-first/RecommendationCard.tsx`
- `frontend/src/services/matchSessionStorage.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/types/matchFirst.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `frontend/src/test/match-first-results-map.test.tsx`
- `frontend/src/test/match-i18n.test.ts`
- `specs/002-match-first-revamp/tasks.md`
- `specs/002-match-first-revamp/implementation-notes.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`

Completed work:

- Added `leaflet` for the lazy Phase 5 2D map route and documented why the
  existing static/3D surfaces were not enough for pan/zoom/vector/list sync.
- Replaced the verified results placeholder with `ResultsMap`, which fetches
  completed results for direct results routes and does not call `/run` for an
  existing completed session.
- Added typed frontend result contracts for recommendations, confidence,
  source metadata, geometry refs, and map payloads.
- Built a Netherlands-centered map shell with local result markers/polygons,
  manual pan/zoom controls, mobile Map/List toggle, list-to-map selection,
  marker/polygon-to-list selection, no national amenities, and no 3D building
  load.
- Built ranked recommendation cards using translated fit labels and at most two
  translated reason lines. Expandable details were intentionally left out for
  this slice because the Phase 5 request required concise reason lines only.
- Persisted selected recommendation, neighborhood, rank, map center/zoom,
  list scroll, mobile mode, result set, vector version, and locale in
  `sessionStorage` for later Dossier return wiring.
- Added results analytics allowlist entries for map open, sufficient
  confidence, recommendation selection, map feature selection, and map layer
  failure.

Red-first evidence:

- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
  initially failed because `ResultsMap` did not exist.

Verification:

- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx`
  passed.
- `cd frontend && npm run test -- src/test/match-first-results-map.test.tsx src/test/match-first-progress.test.tsx src/App.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts src/test/match-first-copy-guard.test.ts`
  passed. Existing noisy Dossier/3D console output and React act warnings still
  print in `App.test.tsx`, but no test failed.
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx` passed
  for the Phase 5 slice; the expanded current suite now passes with 19 tests
  as documented in the Phase 4 audit repair above.
- `cd frontend && npm exec -- eslint src/components/match-first/ResultsMap.tsx src/components/match-first/RecommendationCard.tsx src/components/match-first/RecommendationList.tsx src/test/match-first-results-map.test.tsx`
  passed.
- `cd frontend && npm run build` passed. The Phase 5 lazy chunk in the final
  build was `ResultsMap-Be0p09RQ.js` at 159.82 kB, 46.10 kB gzip, with
  `ResultsMap-CoY3xfYW.css` at 20.75 kB, 7.88 kB gzip.

Residual risks / next checks:

- Full `cd frontend && npm run lint` was attempted and still fails on
  pre-existing non-Phase-5 files such as `ActionBar.tsx`, `CompareScreen.tsx`,
  `ShadowTimeSlider.tsx`, test setup files, and other older hook/compiler
  issues. The new Phase 5 files passed targeted ESLint.
- No selected Playwright e2e or browser performance test was added in this
  slice. Phase 5 has targeted unit/a11y/build evidence; browser-level map
  profiling remains a residual verification gap before production release.
- `npm install` reported the existing npm audit state with 15 vulnerabilities
  after adding Leaflet dependencies; dependency remediation was not part of
  this Phase 5 scope.
- This historical Phase 5 residual is superseded by the Phase 6 update above.

## Latest CI Repair Update 2026-05-16

This pass fixed PR 29 GitHub Actions failure for the `Frontend Build + Test`
job at head SHA `71bc40ca316f87d1c4c77ee97a2665991b2af38c`.

Files changed:

- `frontend/src/test/match-first-copy-guard.test.ts`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`

Completed repair work:

- Tightened the match-first visible-copy guard so it scans same-line JSX-like
  text only. The previous regex crossed newlines from TypeScript syntax and
  falsely flagged `MatchingProgressScreen.tsx` type declarations/generic types
  as visible hard-coded copy.
- No product behavior, translations, Dossier behavior, map behavior, matching
  score logic, or Phase 5-7 scope was changed.

Commands run:

- `python "C:/Users/milos/.codex/plugins/cache/openai-curated/github/1b89ff49/skills/gh-fix-ci/scripts/inspect_pr_checks.py" --repo "." --pr "https://github.com/milos-agathon/buurt-check/pull/29" --json --max-lines 200 --context 50` identified the failing `Frontend Build + Test` job and the copy-guard assertion.
- `cd frontend && npm run test -- src/test/match-first-copy-guard.test.ts` first reproduced the failure, then passed with 7 tests.
- `cd frontend && npm run test` passed with the full Vitest suite. Existing noisy Dossier/3D console output and React act warnings still print, but no tests failed.
- `cd frontend && npm run build` passed. The build emitted the existing placeholder assetlinks/AASA production-release notices.

Residual risks / next checks:

- GitHub Actions must rerun on PR 29 after this fix is pushed.
- The GitHub Actions log also printed a post-job cleanup warning for missing
  `.gitmodules` URL for `.claude/skills/webgpu-claude-skill`; it was a warning
  after the failed test step, not the failing CI cause in this run.

## Latest Phase 4 Review Repair Update 2026-05-16

This pass fixed the Phase 4 review blockers before Phase 5. It did not
implement the Netherlands results map, selected-neighborhood detail/3D, house
click behavior, or Dossier changes.

Files changed in this Phase 4 repair:

- `frontend/src/components/match-first/MatchingProgressScreen.tsx`
- `frontend/src/test/match-first-progress.test.tsx`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/test/match-i18n.test.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `docs/qa/open_punchlist.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`

Completed repair work:

- Terminal success now calls `GET /results` and validates matching
  `session_id`, `job_id`, terminal `status`, and `result_set_id` before
  calling completion or showing the checkmark.
- Failed, stale, or mismatched result hydration now shows a distinct localized
  Results unavailable state with retry and Back to survey, instead of a generic
  100% progress state.
- Added `match_results_unavailable` to the frontend analytics event set with
  sanitized context only.
- Strengthened Phase 4 tests for `loading_neighborhood_data`,
  `applying_filters`, backend `poll_after_ms`, `completed`,
  `completed_with_fallback`, `completed_no_strong_matches`, failed/expired/
  cancelled terminal failures, stale/mismatched results, failed result fetch
  retry, and Phase 4 analytics coverage.
- Updated `docs/qa/open_punchlist.md` so Phase 4 is no longer listed as
  unimplemented, and updated traceability with 100% Phase 4 closure for the
  documented scope.

Red-first evidence:

- `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts` initially failed with 5 failures: missing `match_results_unavailable`, missing `matchFirst.results.retry`, generic terminal results-unavailable UI, and stale/mismatched result payloads incorrectly allowing completion.

Final commands run:

- `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/App.test.tsx src/components/match-first/MatchSuccessCheckmark.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts` passed.
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx` passed.
- `cd frontend && npx eslint src/components/match-first/MatchingProgressScreen.tsx src/components/match-first/MatchSuccessCheckmark.tsx src/services/matchFirstAnalytics.ts src/services/matchFirstApi.ts src/types/matchFirst.ts` passed.
- `cd frontend && npm run build` passed. The build emitted the existing placeholder assetlinks/AASA production-release notices.

Blocked / not green:

- No Phase 4 touched-file gate is blocked. Full repo lint remains a known
  broader cleanup item from pre-existing files outside this Phase 4 surface.

Residual risks / next checks:

- At the time of this Phase 4 repair, the visible results surface was still a
  Phase 5 placeholder. That limitation is superseded by the later Phase 5
  map/list closure documented above.
- The full `App.test.tsx` run still prints existing unrelated Dossier/3D console
  output and React act warnings, but the Phase 4 assertions passed.

## Latest Phase 4 Progress/Success UI Update 2026-05-16

This pass implemented only Phase 4 (`T-034` through `T-042`). It did not
implement the Netherlands results map beyond the verified transition
placeholder, selected-neighborhood detail/3D, house click behavior, or Dossier
changes.

Files changed in this Phase 4 pass:

- `frontend/src/App.tsx`
- `frontend/src/App.test.tsx`
- `frontend/src/components/match-first/MatchingProgressScreen.tsx`
- `frontend/src/components/match-first/MatchingProgressScreen.css`
- `frontend/src/components/match-first/MatchSuccessCheckmark.tsx`
- `frontend/src/components/match-first/MatchSuccessCheckmark.css`
- `frontend/src/components/match-first/MatchSuccessCheckmark.test.tsx`
- `frontend/src/services/matchFirstApi.ts`
- `frontend/src/services/matchFirstApi.test.ts`
- `frontend/src/services/matchFirstAnalytics.ts`
- `frontend/src/services/matchFirstAnalytics.test.ts`
- `frontend/src/test/match-first-progress.test.tsx`
- `frontend/src/test/match-i18n.test.ts`
- `frontend/src/types/matchFirst.ts`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `specs/002-match-first-revamp/tasks.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`

Completed Phase 4 work:

- Added typed frontend helpers for `POST /api/match/sessions/{session_id}/run`,
  `GET /status`, and `GET /results`, including `poll_after_ms` and public job
  status/result response types.
- Replaced the old local run placeholder with `MatchingProgressScreen`, which
  polls backend status, respects backend polling cadence, shows one friendly
  localized status message at a time, avoids raw job internals, preserves retry
  and back-to-survey paths, and verifies results before declaring completion.
- Added explicit UI states for slow backend (`matching_slow`), failed/expired
  backend states, and `completed_with_fallback` / no-strong-match usable
  completion states.
- Added `MatchSuccessCheckmark` with a large branded SVG checkmark, animated
  draw behavior, reduced-motion static variant, accessible label, and CTA-based
  transition to the results route.
- Kept direct/restored success and results routes neutral unless the current
  tab has verified terminal backend status plus fetched results. The results
  route remains a Phase 5 placeholder after verified completion.
- Added bilingual EN/NL progress, success, fallback, and results-placeholder
  translation keys with i18n parity coverage.
- Added privacy-safe progress/success analytics for final run CTA, queued,
  running, slow, completed, failed, fallback, no-strong-match, retry, checkmark,
  and results-open events without translated labels or raw answers.

Red-first evidence:

- The focused Phase 4 frontend command initially failed before implementation
  because the progress component, checkmark component, run/status/results
  helpers, analytics events, and i18n keys did not exist or still reflected the
  old local placeholder contract.

Final commands run:

- `.\.specify\scripts\powershell\check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` resolved `FEATURE_DIR` to `C:\Users\milos\buurt-check\specs\002-match-first-revamp`.
- Checklist review found `specs/002-match-first-revamp/checklists/requirements.md` at 76/76 complete.
- `cd frontend && npm run test -- src/test/match-first-progress.test.tsx src/App.test.tsx src/components/match-first/MatchSuccessCheckmark.test.tsx src/services/matchFirstApi.test.ts src/services/matchFirstAnalytics.test.ts src/test/match-i18n.test.ts` passed.
- `cd frontend && npm run test -- src/test/match-first-a11y.test.tsx` passed.
- `cd frontend && npx eslint src/components/match-first/MatchingProgressScreen.tsx src/components/match-first/MatchSuccessCheckmark.tsx src/services/matchFirstAnalytics.ts src/services/matchFirstApi.ts src/types/matchFirst.ts` passed.
- `cd frontend && npm run build` passed. The build emitted the existing placeholder assetlinks/AASA production-release notices.

Blocked / not green:

- `cd frontend && npm run lint` still fails on pre-existing repo-wide lint
  issues outside the Phase 4 touched surface, including `ActionBar.tsx`,
  `CompareScreen.tsx`, `LoadingScreen.tsx`, `ShadowTimeSlider.tsx`,
  `ShortlistScreen.tsx`, `SurveyShell.tsx`, `AnimatedScore.tsx`,
  `useAnimationPerformance.ts`, `useFocusTrap.ts`, test setup files, and
  `sunlightAnalysis` tests. The two touched files flagged by that lint run were
  cleaned and verified with targeted ESLint.

Residual risks / next checks:

- Phase 4 uses polling only. No SSE/WebSocket mechanism was added because the
  existing contract exposes pollable status plus `poll_after_ms`.
- Results map data is fetched only to verify terminal completion before success;
  the visible results surface is intentionally a placeholder for Phase 5.
- The full `App.test.tsx` run prints existing unrelated Dossier/3D console
  output and React act warnings, but the targeted Phase 4/App/a11y assertions
  passed.

## Latest Phase 3 Gate Cleanup Update 2026-05-16

This pass addressed the pre-Phase 4 gate review without implementing Phase 4
UI. It kept the active implementation source on
`specs/002-match-first-revamp`, removed missing alternate-feature artifact
references from the current active handoff/plan context, and reconciled Phase 3
job analytics naming to the canonical backend/spec event set:

- `match_final_run_cta_clicked`
- `match_job_queued`
- `match_job_running`
- `match_job_completed`
- `match_job_failed`
- `match_job_completed_with_fallback`
- `match_job_completed_no_strong_matches`
- `match_job_slow`

Committed files in this gate cleanup:

- `backend/app/models/match.py`
- `backend/app/services/match/instrumentation.py`
- `backend/tests/test_match_instrumentation.py`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`

The dirty active plan/tasks files were cleaned locally for the reviewed
artifact-source and analytics-name drift, but they remain outside the Phase 3
backend closure commit because they are part of the broader uncommitted SpecKit
artifact changes documented in `docs/qa/open_punchlist.md`.

Commands run:

- `.\.specify\scripts\powershell\check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` resolved `FEATURE_DIR` to `C:\Users\milos\buurt-check\specs\002-match-first-revamp`.
- Read-only analyze equivalent passed the Phase 3 gate with no critical/high blockers after the source and analytics cleanup.
- `cd backend && ruff check .` passed: `All checks passed!`
- `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py tests/test_match_db_schema.py` passed: 50 passed in 17.78 s.
- `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts` passed: 1 test passed in 1.23 s.

Commit scope rule for the next commit: stage only Phase 3 backend, model-honesty,
translation, handoff, traceability, and punch-list files. Leave unrelated
`.specify/*`, `AGENTS.md`, deleted `CLAUDE.md`,
`docs/context/current_architecture.md`, and broad planning artifacts out unless
they are intentionally committed separately as governance/planning work.

## Latest Phase 3 100% Closure Repair Update 2026-05-16

This pass fixed the remaining Phase 3 review blockers before Phase 4. It did
not implement Phase 4 UI, Phase 5 map, Phase 6 selected-neighborhood detail/3D,
or Phase 7 Dossier bridge behavior.

Files changed in this closure repair:

- `backend/app/db.py`
- `backend/app/models/match.py`
- `backend/app/services/match/jobs.py`
- `backend/app/services/match/results.py`
- `backend/tests/test_match_jobs.py`
- `backend/tests/test_match_results_contract.py`
- `backend/tests/test_match_db_schema.py`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`

Completed 100% closure work:

- Added a concurrent `/api/match/sessions/{session_id}/run` endpoint regression
  that forces both requests past the active-job read before either insert. It
  proves one `match_jobs` row, one `active_job_id`, one background schedule, and
  one result set after the scheduled job runs.
- Added `idx_match_jobs_active_vector_unique`, a partial unique index on
  non-terminal jobs for `(session_id, preference_vector_id)`, and made
  `start_match_job` recover database contention by returning the existing
  started job instead of scheduling another worker.
- Moved stale running-job recovery into the `/run` path with
  `recover_stale_jobs(..., session_id=session_id)`. A stale active job is first
  made terminal with `match.warning.retryable_stale_job`; only then can the same
  final-review retry create a new active job.
- Added `source_metadata` to result recommendations. Every ranked, stretch, and
  near-miss result now carries stable source IDs, source type/name key,
  metric keys, measurement/retrieved dates when available, freshness status,
  confidence, and translated limitation keys.
- Documented the worktree split: the Phase 3 closure repair files are distinct
  from existing unrelated governance/template/spec/doc dirty changes.

Red-first evidence:

- `cd backend && pytest -q tests/test_match_jobs.py::test_concurrent_review_run_requests_create_one_job_and_schedule_once tests/test_match_jobs.py::test_review_run_recovers_stale_active_job_and_starts_new_job` first failed with two different concurrent `job_id` values and stale retry reusing the stale job.
- `cd backend && pytest -q tests/test_match_results_contract.py::test_result_groups_include_ui_source_freshness_metadata` first failed because `ranked_results` had no `source_metadata`.

Final commands run:

- `cd backend && ruff check .` passed: `All checks passed!`
- `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py tests/test_match_db_schema.py` passed: 50 passed in 17.13 s.
- `cd backend && python -m pytest -x -q -m "not live" --color=no` passed: 1335 passed, 12 skipped, 11 deselected in 246.11 s (0:04:06).
- `cd frontend && npm run build` passed: Vite client built in 15.53 s; service worker built in 706 ms; precache 80 entries (3037.40 KiB). Build emitted the existing placeholder assetlinks/AASA production-release notices.
- `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts` passed: 1 test passed in 16.14 s.

Residual risks / next checks:

- Phase 3 still uses in-process FastAPI background tasks and SQLite/Turso
  persistence, not an external queue. The new uniqueness guard protects the
  persisted active-job contract, but production multi-worker behavior should be
  revisited if deployment topology changes.
- Feature data remains seed/mock-backed with explicit source/freshness
  limitations.
- Read-only analyze was rerun in the later 2026-05-16 gate cleanup above.
- Phase 4 must consume the repaired endpoint contract without mixing unrelated
  governance/template/spec dirty changes into the Phase 3 closure commit.

## Latest Phase 3 Final Repair Update 2026-05-15

This pass fixed Phase 3 before T-034. It reconciled the broad backend test
evidence, repaired `/run` idempotency and queue-first behavior, tightened
confidence thresholds and result-key coverage, and preserved session locale for
persisted job lifecycle analytics. Phase 4 progress/success UI and later
map/Dossier phases were outside that Phase 3 repair.

Files changed in this final repair:

- `backend/app/api/match.py`
- `backend/app/services/match/jobs.py`
- `backend/app/services/match/results.py`
- `backend/tests/test_match_jobs.py`
- `backend/tests/test_match_results_contract.py`
- `backend/tests/test_match_instrumentation.py`
- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`
- `docs/ai/latest_handoff.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/qa/open_punchlist.md`
- `docs/qa/implementation-ledger.md`
- `docs/qa/requirements-verification-matrix.md`

Completed final repair:

- `start_match_job` now returns whether the job was newly created. The API only
  schedules `run_match_job` for newly created queued jobs, so duplicate run
  requests for the same active queued/running vector reuse the same `job_id`
  without duplicate background execution.
- `/run` now inserts the queued job immediately with the known
  `match-seed-v1` data version. Feature data loads inside `run_match_job` at
  `loading_neighborhood_data`; feature-store failure after run creation leaves a
  pollable failed job instead of failing `POST /run`.
- `_confidence_level` now follows the PRD contract: `0-19=insufficient`,
  `20-49=low`, `50-79=medium`, `80-100=high`, independent of stale legacy
  labels.
- Result `reason_codes` and `tradeoffs` emitted by the Phase 3 results contract
  now use stable `match.results.reasons.*` and
  `match.results.tradeoffs.*` translation-key namespaces with EN/NL coverage.
- Job running, terminal, slow, and stale-failure analytics now read
  `match_sessions.locale`; Dutch sessions persist Dutch lifecycle rows.

Red-first evidence:

- `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_instrumentation.py` first failed with 8 failed, 26 passed, proving duplicate scheduling, feature-store pre-load failure, confidence-threshold drift, missing result-key translations, and lost Dutch analytics locale.
- After repair, the same targeted set passed: 34 passed in 14.45 s.

Final commands run:

- `cd backend && ruff check .` passed: `All checks passed!`
- `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py tests/test_match_db_schema.py` passed: 47 passed in 15.90 s.
- `cd backend && python -m pytest -x -q -m "not live" --color=no` passed: 1332 passed, 12 skipped, 11 deselected in 243.34 s (0:04:03).
- `cd frontend && npm run build` passed: Vite client built in 12.43 s; service worker built in 624 ms; precache 80 entries (3036.12 KiB). Build emitted the existing placeholder assetlinks/AASA production-release notices.
- `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts` passed: 1 test passed in 1.18 s.

Not run:

- `/speckit.analyze`

## Earlier Phase 3 Backend Implementation Update 2026-05-15

Phase 3 matching backend work was implemented and verified. Frontend Phase 4
progress/success UI, Phase 5 results map, selected-neighborhood 3D detail, and
Dossier bridge were later phases and are documented in the newer sections above.

Files changed:

- `backend/app/api/match.py`
- `backend/app/models/match.py`
- `backend/app/services/match/jobs.py`
- `backend/app/services/match/scoring.py`
- `backend/app/services/match/instrumentation.py`
- `backend/tests/test_match_jobs.py`
- `backend/tests/test_match_hard_filters.py`
- `backend/tests/test_match_results_contract.py`
- `backend/tests/test_match_instrumentation.py`
- `specs/002-match-first-revamp/contracts/match-first-api.md`
- `specs/002-match-first-revamp/tasks.md`
- `docs/qa/match_first_revamp_traceability.md`
- `docs/ai/latest_handoff.md`

Completed work:

- `POST /api/match/sessions/{session_id}/run` now requires
  `source: "review_final_cta"` and a current `preference_vector_version`.
  Non-review and stale-vector calls return stable errors and do not create jobs.
- Repeated run requests for the same current vector reuse the active job rather
  than creating duplicate match jobs.
- Job/result states now include `completed_no_strong_matches`; failed/stale
  jobs still avoid exposing `internal_error_class` in public status responses.
- Generic hard filters now map to feature-matrix signals: intent maps to
  listing availability/housing stock, budget maps to affordability, and commute
  maps to mobility.
- Results remain deterministic `weighted_scoring` with
  `not_validated_no_labels`, `fit_score`, reason codes, tradeoffs, confidence,
  geometry refs, Netherlands `map_center`, and `bbox`. Predictive probability
  remains unavailable unless future labels/evaluation exist.
- Backend instrumentation enums now include stable Phase 3 job lifecycle events
  for queued/running/completed/failed/fallback/no-strong/slow states.

Commands run:

- `cd backend && pytest -q tests/test_match_jobs.py tests/test_match_hard_filters.py tests/test_match_results_contract.py` first failed for the missing run gate/idempotency/state/filter mapping, then passed after implementation.
- `cd backend && pytest -q tests/test_match_instrumentation.py` first failed for missing stable job event names, then passed after implementation.
- `cd backend && pytest -q tests/test_match_jobs.py::test_no_strong_matches_use_separate_terminal_status` passed.
- `cd backend && pytest -q tests/test_match_sessions.py tests/test_match_preference_vector_builder.py tests/test_match_jobs.py tests/test_match_results_contract.py tests/test_match_hard_filters.py tests/test_match_model_honesty.py tests/test_match_instrumentation.py tests/test_match_db_schema.py` passed: 42 tests.
- `cd backend && ruff check .` passed.
- `cd backend && pytest -x -q -m "not live"` was interrupted by the 180-second command timeout and pytest emitted an `OSError: [Errno 22] Invalid argument` while flushing after interruption.
- `cd backend && python -m pytest -x -q -m "not live" --color=no` passed after the final code change: 1311 passed, 12 skipped, 11 deselected in 233.36 s.
- `cd frontend && npm run test -- src/test/match-first-model-honesty.test.ts` passed.

Residual risks / next checks:

- Phase 3 uses in-process FastAPI background tasks and SQLite/Turso persistence,
  not an external worker queue; this matches the MVP plan but should be revisited
  only if measured runtime or multi-process deployment behavior requires it.
- Feature data is still seed/mock-backed and exposed with mock/freshness
  limitations; production confidence depends on future real data integration.
- Phase 4 must connect frontend progress/success screens to these endpoints and
  keep direct success/results routes neutral unless backend terminal state exists.

## Latest Final Analyze Fix Update 2026-05-15

A documentation and SpecKit-artifact remediation pass was applied before product
implementation. No runtime behavior, routes, components, services, schemas,
styles, or product tests were changed.

Files changed:

- `.specify/feature.json`
- `specs/002-match-first-revamp/spec.md`
- `specs/002-match-first-revamp/plan.md`
- `specs/002-match-first-revamp/tasks.md`
- `docs/ai/latest_handoff.md`

Fixes applied:

- Restored the active SpecKit pointer to `specs/002-match-first-revamp`.
- Aligned the spec API contract with `/api/match/neighborhoods/...` and
  `/api/match/dossier/from-building`.
- Reconciled plan performance budgets with PRD FR-049A and map requirements:
  2.5 s landing hero usability, 150 ms list/map selection feedback after local
  data is loaded, and 100 ms pan/zoom input response for already-loaded
  geometry.
- Defined the slow backend threshold as 10,000 ms after accepted run request
  without terminal status, with `match_job_slow` emitted once while the same job
  continues.
- Renamed plan analytics events to the canonical names in the spec.
- Disambiguated imported alternate draft success gates as `imported-SC-*` instead of colliding
  with 002 success criteria.
- Corrected the stale unhyphenated Phase 4 handoff start IDs to `T-034` and
  `T-035` after `T-033`.

Residual risks / next checks:

- Product implementation has not started.
- Product tests were not run because this was artifact-only.
- Before Phase 4 product implementation, run `T-033` to verify Phase 3 and then
  start test-first with `T-034` and `T-035`.

## Latest SpecKit Plan Audit Update 2026-05-15

A documentation-only audit was applied to the active SpecKit technical plan
before any new task generation. No product behavior was implemented.

Files changed:

- `specs/002-match-first-revamp/plan.md`
- `specs/002-match-first-revamp/data-model.md`
- `specs/002-match-first-revamp/contracts/match-first-api.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD, latest handoff, constitution, and traceability files in
  order before editing.
- Read `docs/context/current_architecture.md`, all available
  `specs/**/spec.md`, and all available `specs/**/plan.md`.
- Confirmed `.specify/feature.json` still points at
  `retired alternate feature draft`, while the active plan target remains
  `specs/002-match-first-revamp`.
- Applied documentation patches only to allowed plan artifacts and this
  handoff; no code or tasks were changed.
- Ran documentation grep checks for the patched plan/data/API-contract terms.

Plan audit changes now required before task generation:

- `plan.md` now contains an explicit 2026-05-15 audit section with critical
  changes, MVP simplifications, and task-generation detail requirements.
- Map viewport/list-scroll server persistence is now optional for MVP; route
  context plus `sessionStorage` is the default unless Phase 5 or Phase 7 proves
  backend map-state persistence is needed.
- Target map acceptance profiles and budgets are named in the plan for mobile
  Chromium 390x844 and desktop Chromium 1366x768.
- `data-model.md` now matches the plan's job/result state model, including
  `matching_slow`, `completed_no_strong_matches`, structurally separate
  `stretch_matches`, Dossier return fields, and failure transitions.
- `contracts/match-first-api.md` now includes endpoint-level success/error
  codes, retry, idempotency, cacheability, optional map-state semantics,
  anonymous session deletion, and selected-neighborhood cache-key constraints.
- The Dossier bridge contract now uses `match_return`, `match_session`, and
  encoded `match_context` instead of reusing checkout `session_id` for match
  identity.

Residual risks:

- Superseded by the final analyze fix above: `.specify/feature.json` now points
  at `specs/002-match-first-revamp`.
- `specs/002-match-first-revamp/tasks.md` already exists and has local
  modifications. This audit did not edit tasks; any future task generation
  should be treated as a regeneration/update pass after confirming the active
  feature source of truth.
- No product tests were run because this was documentation-only. Verification
  was limited to file reads, patching, grep checks, and git diff/status review.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated
  because no implementation phase was completed.

## Latest alternate draft Clarification Coverage Fix Update 2026-05-15

Clarification coverage fixes were applied to the generated `alternate draft` draft as a
documentation-only update. No product behavior was implemented.

Files changed:

- `retired alternate feature draft/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Confirmed SpecKit paths currently resolve to
  `retired alternate feature draft/spec.md`.
- Applied edits only within the allowed scope: `specs/**/spec.md` and
  `docs/ai/latest_handoff.md`.
- Documentation patch and grep/status checks only; no product tests were run
  because this change is limited to spec and handoff text.

Spec requirements now explicitly tightened:

- MVP survey scope now distinguishes 10-12 one-question-at-a-time survey
  questions from the separate review screen, so review cannot reduce the PRD
  question-count minimum.
- Amenity default display is capped at 5-7 relevant categories and still must
  not show all amenity layers at once.
- Dossier return now explicitly preserves the ability to inspect another house
  from the same or another matched neighborhood without restarting or rerunning
  matching unless preferences changed.
- Match-origin Dossier entry now requires a localized selected-neighborhood
  origin, breadcrumb, or equivalent compact context label without redesigning
  Dossier modules.
- Account, checkout, and payment changes are now blocked unless needed to
  preserve an existing Dossier or billing contract with explicit plan scope and
  regression coverage.
- Match result sets now explicitly include structurally separate
  `near_misses` and `stretch_matches`, preventing hard-filter failures from
  appearing as ordinary recommendations.
- Minimum API contracts now require request/response bodies, stable
  success/error codes, retry, idempotency, cacheability, and
  language-independent payload keys for each listed endpoint before planning
  starts; session creation additionally defines duplicate-start idempotency and
  no-store cacheability.
- Core state transitions now include session creation in progress/success,
  review-vector readback failure, Dossier bridge failure, and Dossier return
  failure.
- Analytics now includes survey completion duration and houses-checked count
  events/properties.
- Dossier return success criteria now require 100% restoration for supported
  browser/session cases, with unsupported cases documented as missing/partial.

PRD requirements now explicitly covered:

- PRD Section 8.3: the survey count cannot be diluted by treating review as one
  of the required questions.
- PRD FR-N3 and Section 16.4: default visible amenities are both
  preference-aware and bounded to avoid map clutter.
- PRD FR-D5 and Section 13.3: users can inspect multiple houses after returning
  from Dossier without losing match context.
- PRD Sections 8.7 and 21.1: near-miss/stretch result groups are distinct from
  normal top matches.
- PRD Sections 14.3-14.6: API-contract detail remains a planning gate rather
  than a later implementation assumption.
- PRD Sections 20.1 and 20.4: analytics can measure survey completion time and
  number of houses checked per session.
- Constitution IX: supported Dossier round trips require complete context
  restoration rather than a 95% pass threshold.

Residual risks:

- `.specify/feature.json` still points at `retired alternate feature draft`, but
  this file was outside the allowed edit scope. Planning must explicitly
  resolve whether `alternate draft` supersedes `002` or restore the pointer to `002` when
  file scope permits.
- `retired alternate feature draft/plan.md` is still missing, so SpecKit
  prerequisite checks for the pointed feature still fail until the drift is
  resolved.
- `retired alternate feature draft/spec.md` is under the repository's `specs/`
  ignore rule, so git status may not show it even when the local file changes.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Latest alternate draft Clarification Fix Update 2026-05-15

Clarification fixes were applied to the generated `alternate draft` draft as a
documentation-only update. No product behavior was implemented.

Files changed:

- `retired alternate feature draft/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Applied edits only within the allowed scope: `specs/**/spec.md` and
  `docs/ai/latest_handoff.md`.
- Documentation patch and grep/status checks only; no product tests were run
  because this change is limited to spec and handoff text.

Spec requirements now explicitly tightened:

- The `alternate draft` feature-pointer drift is now a planning gate: planning from `alternate draft`
  is blocked until one source of truth is chosen and `002`/`alternate draft` are not
  allowed to proceed as competing revamp sources.
- Predictive model selection, model-superiority claims, probability fields, and
  "highest predictive power" behavior are out of MVP scope unless planning
  proves real labels, validation data, evaluation results, and regression
  tests.
- Recommendation results now use `confidence_score` from 0-100 and
  `confidence_level_key` values of `high`, `medium`, `low`, or `insufficient`,
  and predictive probability fields must be absent unless validation
  prerequisites exist.
- Dossier return context now explicitly includes `preference_snapshot_ref` and
  `active_filter_keys`, and match session identifiers must not be reused as
  Dossier buyer entitlement identity.
- API planning is blocked until session create/read/update/delete, run, status,
  results, selected-neighborhood layer/building/amenity, and house-to-Dossier
  bridge contracts define request/response bodies, stable codes, retry,
  idempotency, cacheability, and language-independent payload keys.
- Selected building and amenity payload contracts now name required fields,
  selected-neighborhood LOD/page bounds, stale-request cancellation, and
  loading/empty/fallback/error handling without caching those as successful
  data.
- Dossier bridge context now must support opening the existing Dossier when
  reliable address or parcel resolution exists.
- Anonymous session deletion is now an explicit API, state-transition, and
  analytics contract.
- Preference edits after results now explicitly mark results stale and return
  to review; matching reruns only after final confirmation.
- Analytics now includes session creation failure, review/vector readback
  failure, Dossier bridge failure, and session deletion requested/succeeded/
  failed events.

Residual risks:

- `.specify/feature.json` still points at `retired alternate feature draft`, but
  this file was outside the allowed edit scope. Planning must explicitly
  resolve whether `alternate draft` supersedes `002` or restore the pointer to `002` when
  file scope permits.
- `retired alternate feature draft/plan.md` is still missing, so SpecKit
  prerequisite checks for the pointed feature still fail until the drift is
  resolved.
- `retired alternate feature draft/spec.md` is under the repository's `specs/`
  ignore rule, so git status may not show it even when the local file changes.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Latest alternate draft Strict Coverage Spec Audit Fix Update 2026-05-15

Strict PRD/constitution coverage fixes were applied to the generated `alternate draft`
draft as a documentation-only update. No product behavior was implemented.

Files changed:

- `retired alternate feature draft/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Applied edits only within the allowed scope: `specs/**/spec.md` and
  `docs/ai/latest_handoff.md`.
- Documentation grep/diff/status checks only; no product tests were run because
  this change is limited to spec and handoff text.

Spec requirements now explicitly tightened:

- Planning for `alternate draft` is blocked until the active-feature drift is resolved by
  either promoting `alternate draft` with its own plan/tasks or restoring the pointer to
  `002`; both revamp specs must not proceed as competing sources.
- Landing hero scope now explicitly requires a full-screen or near-full-screen
  map-led hero, matching the PRD landing requirement.
- Survey answers must persist immediately when selected or updated, before
  advancing to the next question or review.
- MVP survey scope now explicitly requires 10-12 one-question-at-a-time steps,
  including review, aligned with the PRD question set.
- Results map selection now requires moving the map to the selected
  neighborhood and adds explicit manual pan/zoom support on desktop and mobile.
- Dossier preservation now explicitly protects `quick_brief`, `full_dossier`
  buyer/address entitlement before first download, and entitlement scoping to
  `buyer_key + vbo_id` rather than `report_id` alone.
- Minimum API-contract planning now requires request bodies, response bodies,
  stable success/error codes, retry behavior, idempotency where repeated calls
  are possible, cacheability, and language-independent payload keys.
- Geometry contracts now require EPSG:28992/RD New as canonical stored geometry,
  with WGS84 fields only for display and explicitly named as WGS84.
- Recommendation results now prohibit predictive probability fields from being
  present or renderable unless real labels, validation data, and evaluation
  results exist.
- Data contracts now include explicit neighborhood feature-matrix and
  selected-neighborhood map-layer payload fields.
- Dossier return context now includes `preference_snapshot_ref` and
  `active_filter_keys` in addition to the existing session/job/result/map
  context.
- Core state transitions now include session creation failure, answer
  persisting, answer-save failure, queued matching, session/job expiration,
  unavailable results, map-layer failure, building-layer failure, amenity-layer
  failure, and no-reliable-address recovery.
- Analytics now explicitly includes answer-save failure, survey abandonment,
  session resume/expiration, unavailable results, map interaction, map-layer
  failure, building-layer failure, amenity-layer failure, 3D interaction, and
  Dossier return failure.
- Lowercase normative wording in the audited spec sections was tightened to
  `MUST`, `MUST NOT`, and `MAY` where the PRD/constitution requires it.
- PRD traceability now references `SC-001` through `SC-019`, matching the
  generated success criteria.

PRD requirements now explicitly covered:

- PRD FR-L1, FR-L5, and FR-L6: landing hero is full-screen or near-full-screen,
  animated or fallback-ready, readable, and actionable on mobile and desktop.
- PRD Section 7 Phase 2 and FR-S4: answers save immediately when selected or
  updated and cannot silently advance without persistence.
- PRD Section 8.3: the MVP survey requires 10-12 one-question-at-a-time steps
  with the PRD question purposes and review.
- PRD Goal 8, Section 7 Phase 6, Section 16.2, and Acceptance 11: users can
  zoom manually and result/list/marker selection moves to the selected
  neighborhood with reduced-motion-safe behavior.
- PRD Section 13 and the Dossier/risk-card contract: return context carries
  preference/filter state, while Dossier free/paid, entitlement, checkout,
  export, and risk-card boundaries remain preserved.
- PRD Sections 14.3-14.6: match/session/run/status/results,
  selected-neighborhood layer/building/amenity, and Dossier bridge API
  contracts must include request/response/error/retry/idempotency/cache details
  before planning.
- PRD Sections 15.1-15.3: neighborhood feature-matrix fields, source/freshness
  metadata, and explicit coordinate-system naming are part of the spec
  contract.
- PRD Sections 16.2-16.4: selected-neighborhood map-layer/building/amenity
  payloads are scoped away from national 3D loading and include fallback/error
  metadata.
- PRD Sections 8.6 and 27.1 plus Constitution V/X: predictive probability is
  blocked unless labels, validation data, and evaluation results exist.
- PRD Section 21 and Constitution XV: session creation, answer persistence,
  expiration, unavailable results, map/layer failures, building/amenity
  failures, and no-reliable-address outcomes now have explicit recovery-state
  coverage.
- PRD Section 20 and Constitution XV: analytics now covers survey persistence
  failures, abandonment/resume, map interaction/failure, layer failures, 3D
  interaction, Dossier return failure, and session expiration using stable keys.

Residual risks:

- `.specify/feature.json` still points at `retired alternate feature draft`, but
  this file was outside the allowed edit scope. Planning must explicitly
  resolve whether `alternate draft` supersedes `002` or restore the pointer to `002` when
  file scope permits.
- `retired alternate feature draft/plan.md` is still missing, so SpecKit
  prerequisite checks for the pointed feature still fail until the drift is
  resolved.
- `retired alternate feature draft/spec.md` is under the repository's `specs/`
  ignore rule, so git status may not show it even when the local file changes.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Latest 002 Spec Audit Fix Update 2026-05-15

Spec audit fixes were applied to `specs/002-match-first-revamp/spec.md` as a
documentation-only update. No product behavior was implemented.

Files changed:

- `specs/002-match-first-revamp/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Applied edits only within the allowed scope: `specs/**/spec.md` and
  `docs/ai/latest_handoff.md`.
- Documentation grep/diff/status checks only; no product tests were run because
  this change is limited to spec and handoff text.

Spec requirements now explicitly tightened:

- Survey answers must persist immediately when selected or updated, not merely
  after a completed step.
- Answer-save failure is now an explicit accessible localized retry state that
  blocks advancement to the next question, review, or matching until persistence
  succeeds.
- Results map behavior now explicitly requires manual pan and zoom controls on
  desktop and mobile in addition to list-to-map fly-to behavior.
- Minimum API contracts now require request bodies, response bodies, stable
  error codes, and retry/idempotency behavior before planning.
- Match recommendation payloads now require a `score` plus stable fit label key
  rendered through translation keys, instead of stored translated labels.
- Core state transitions now include `session_create_failed`,
  `answer_persisting`, answer-save failure, explicit persisted `completed`
  result state before `success_checkmark`, unavailable/stale result handling,
  and map/building/amenity layer failure fallback transitions.
- Failure-state coverage now explicitly includes session creation failure,
  answer-save failure, stale or unavailable result sets, map-layer load failure,
  building-layer load failure, and amenity-layer load failure.
- Analytics coverage now names stable event keys for CTA, survey, answer-save
  failure, match lifecycle, unavailable results, layer failures, Dossier open,
  back-to-map return, and conditional quality feedback.
- Lowercase normative data/trust wording was tightened to `MUST` / `MAY`.

PRD requirements now explicitly covered:

- PRD Section 7 Phase 2 and FR-S4: answer selections are saved immediately when
  selected or updated, with blocking recovery when persistence fails.
- PRD FR-S5 and Section 21: answer-save failures have accessible localized
  retry behavior and cannot silently advance the flow.
- PRD Goal 8, Section 7 Phase 6, and Section 16.2: results map manual pan/zoom
  is a functional requirement, not only an inferred performance budget.
- PRD Section 14.3: minimum match/session/run/status/results,
  selected-neighborhood layer/building/amenity, and Dossier bridge API
  contracts must include request/response/error/retry details before planning.
- PRD FR-M4, FR-M6, Section 8.7, and Constitution III/V: recommendation output
  now requires stable fit label keys and translation-key rendering for labels.
- PRD Phase 5 / Acceptance 9 and Constitution XIII/XIV: persisted completed
  result state is explicit before the success checkmark and results map.
- PRD Section 21 and Constitution XV: session creation, answer persistence,
  stale/unavailable results, and map/building/amenity layer failures now have
  required recovery-state coverage.
- PRD Section 20 and Constitution XV: analytics now uses named stable event keys
  for funnel, persistence failures, match outcomes, result availability,
  map/detail failures, Dossier open, back-to-map return, and conditional quality
  feedback.
- PRD Sections 8.6, 15.3, and 27.1: data, source/freshness, and model-honesty
  assumptions now use explicit MUST/MAY normative language.

Residual risks:

- `.specify/feature.json` still points at `retired alternate feature draft`, but
  this file was outside the allowed edit scope. Planning must explicitly
  resolve whether `alternate draft` supersedes `002` or restore the pointer to `002` when
  file scope permits.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Latest alternate draft Spec Audit Fix Update 2026-05-15

Spec audit fixes were applied to the generated `alternate draft` draft as a
documentation-only update. No product behavior was implemented.

Files changed:

- `retired alternate feature draft/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Applied edits only within the allowed scope: `specs/**/spec.md` and
  `docs/ai/latest_handoff.md`.
- Documentation grep/status checks only; no product tests were run because this
  change is limited to spec and handoff text.

Spec requirements now explicitly tightened:

- `alternate draft` now records the active-feature drift: `.specify/feature.json` points at
  `retired alternate feature draft`, while the existing planned feature remains
  `specs/002-match-first-revamp`. Planning must either promote `alternate draft` as the
  successor or restore the pointer to `002`; both must not proceed as competing
  revamp sources.
- Slow backend and no-strong-match outcomes are now explicit job/result states:
  `matching_slow` and `completed_no_strong_matches`.
- Fallback and no-strong-match completions must pass through the required
  success checkmark before results when usable result state exists.
- Match job lifecycle status and progress stage keys are separated so planning
  cannot mix terminal state with progress copy.
- Dossier return context now includes `job_id`, `result_set_id`,
  `preference_vector_version`, `dossier_return_path`, and current Dossier route
  query data where relevant.
- Minimum API contracts now name required session, answer, run, status,
  results, selected-neighborhood map-layer/building/amenity, and
  house-to-Dossier bridge responses.
- Hero/results map and selected-neighborhood detail performance now have
  minimum planning budgets tied to plan-named target acceptance device
  profiles.
- Anonymous match-data minimization and deletion are now testable: provide a
  session-deletion path or mark deletion missing/partial in traceability with
  retention limit, blocker, and follow-up condition.
- Analytics now explicitly covers no-strong-matches, runtime, confidence
  sufficiency, success checkmark, no reliable address, back-to-map return
  success, failures, fallbacks, and conditional quality feedback.
- Operational visibility is constrained to logs, metrics, or analytics and does
  not add an MVP admin UI unless explicitly scoped later.
- Accessibility coverage now explicitly includes progress states, map/list
  interactions, house selection, and the Dossier return action.
- I18n coverage now explicitly includes route labels, service fallbacks, test
  defaults, analytics display labels, and API payload stability.
- Cache constraints now require all response-affecting parameters in keys and
  prohibit caching empty/error/stale/fallback responses as successful match,
  map, building, amenity, or Dossier bridge data.

PRD requirements now explicitly covered:

- PRD Sections 14.5, 21.1, and 21.3: slow backend and no-strong-match states
  are part of the required job/result state model.
- PRD Phase 5 / Acceptance 9: completed, fallback, and no-strong-match usable
  outcomes route through the Buurt Check success checkmark before results.
- PRD FR-D2, FR-D4, Section 13, and Section 27.5: Dossier return state carries
  result, vector, route, query, map/list, language, and selected-house
  identifiers needed to restore without rerunning matching.
- PRD Section 14.3: minimum match/session/run/status/results,
  selected-neighborhood layer/building/amenity, and Dossier bridge API
  contracts are explicit before planning.
- PRD Sections 16.1, 16.2, and FR-N6/16.3: hero, results map, map/list sync,
  pan/zoom, and selected-neighborhood detail performance are measurable.
- PRD Sections 15.4 and 19.1: anonymous preference-data minimization and
  session deletion are testable instead of only "where feasible."
- PRD Section 20 and Constitution XV: analytics now covers funnel, match
  outcomes, runtime, confidence sufficiency, map/detail failures, Dossier open,
  back-to-map return success, failures/fallbacks, and conditional quality
  feedback with stable keys.
- PRD Section 18 and Constitution VII: accessibility coverage now includes
  progress, failure, map/list, house-selection, and Dossier-return states.
- PRD Section 5.5 and Constitution III: all user-facing and display-label text
  surfaces remain translation-key based, while stored/API values remain stable
  language-independent keys.
- PRD Section 15.3 and repository caching rules: missing, stale, fallback, and
  error data cannot be cached as successful responses.

Residual risks:

- `.specify/feature.json` still points at `retired alternate feature draft`, but
  this file was outside the allowed edit scope. Planning must explicitly resolve
  whether `alternate draft` supersedes `002` or restore the pointer to `002` when file scope
  permits.
- `retired alternate feature draft/spec.md` is under the repository's `specs/`
  ignore rule, so git status does not show it even though the local file was
  updated.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Latest Spec Audit Fix Update 2026-05-15

Spec audit fixes were applied as a documentation-only update. No product
behavior was implemented.

Files changed:

- `specs/002-match-first-revamp/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Applied edits only within the allowed scope: `specs/**/spec.md` and
  `docs/ai/latest_handoff.md`.
- Documentation diff/status checks only; no product tests were run because this
  change is limited to spec and handoff text.

Spec requirements now explicitly tightened:

- Backend async execution must use the smallest safe approach compatible with
  the existing FastAPI/Redis/SQLite-Turso stack; any new worker or queue
  framework now requires Complexity Tracking with rejected simpler alternatives,
  operational impact, and test coverage.
- Hero/results map performance planning now has minimum budgets for landing
  hero readiness, results-map initial usability, list/map synchronization, and
  pan/zoom input response.
- Dossier preservation now explicitly protects checkout recovery,
  `quick_brief`, `full_dossier` buyer/address entitlement, frontend
  Noise/Air/Climate risk tiles, and paid-report/PDF-only Sunlight evidence.
- Anonymous match-data deletion is now testable: provide a session-deletion
  path or mark deletion missing/partial in traceability with retention limit,
  blocker, and follow-up condition.
- Dossier return context now explicitly includes `job_id`, `result_set_id`,
  `preference_vector_version`, and current Dossier route query data where
  relevant.
- Minimum API contracts now name the required neighborhood, map-layer,
  building, amenity, and house-to-Dossier bridge endpoints rather than leaving
  them generic.
- Match result sets now explicitly carry `result_set_id` and
  `preference_vector_version`.
- Slow backend is now represented in core state transitions as
  `matching_slow`, with localized slow-progress copy and analytics while the
  same backend job continues.
- Lowercase normative data/trust wording was tightened to `MUST` / `MAY` /
  `MUST NOT`.
- Phase 4 verification now includes `completed_no_strong_matches`, and SC-014
  now includes completed-no-strong-matches, back-to-map clicked, failures,
  fallbacks, and conditional quality-feedback analytics.

PRD requirements now explicitly covered:

- PRD FR-M2 and Section 14.4: async matching execution must use the smallest
  safe backend approach, with justification for any new queue/worker scope.
- PRD Sections 16.1 and 16.2: hero and results map performance requirements
  now have concrete minimum planning budgets.
- PRD Section 13 and Dossier/risk-card contract: existing Dossier, checkout
  recovery, entitlement, export, free/paid boundaries, risk-card behavior, and
  Sunlight evidence boundaries are explicitly preserved.
- PRD Sections 15.4 and 19.1: preference-data minimization and session deletion
  are now testable instead of "where feasible" only.
- PRD FR-D2, FR-D4, and Section 27.5: Dossier return state now carries the
  result and vector identifiers needed to restore without rerunning matching.
- PRD Section 14.3: minimum match/session/results/neighborhood/layer/building/
  amenity/Dossier bridge API contracts are now explicit before planning.
- PRD FR-M4 and FR-M6: result identity and stale-result detection now include
  `result_set_id` and `preference_vector_version`.
- PRD Section 21.3: slow-backend behavior is now a state transition with
  localized copy and analytics.
- PRD Section 20 and Constitution XV: analytics now explicitly covers
  completed-no-strong-matches, failures, fallbacks, back-to-map clicked,
  back-to-map return success, and conditional quality feedback.
- PRD Sections 8.6, 19.3, and 27.1: data, AI, fairness, and source/freshness
  constraints now use explicit MUST-level normative language.

Residual risks:

- `.specify/feature.json` still points at `retired alternate feature draft`, but
  this file was outside the allowed edit scope. Planning must update the
  pointer when permitted or run with
  `SPECIFY_FEATURE_DIRECTORY=specs/002-match-first-revamp`.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.
- `specs/002-match-first-revamp/tasks.md` already had local modifications and
  was left untouched.

## Latest Spec Audit Fix Update

Spec audit fixes were applied as a documentation-only update. No product
behavior was implemented.

Files changed:

- `specs/002-match-first-revamp/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Applied edits only within the allowed scope: `specs/**/spec.md` and
  `docs/ai/latest_handoff.md`.
- Documentation diff/status checks only; no product tests were run because this
  change is limited to spec and handoff text.

Spec requirements now explicitly tightened:

- `completed_with_fallback` and `completed_no_strong_matches` must pass through
  the required success checkmark before results, preserving the PRD journey.
- `completed_no_strong_matches` is part of the required backend job/result
  state contract.
- Results must be backed by persisted completed result state before opening on
  the Netherlands map.
- Planning must define minimum match/session/run/status/results,
  selected-neighborhood layer, and house-to-Dossier bridge API contracts.
- Results and Dossier return state now explicitly carry `job_id`,
  `result_set_id`, and `preference_vector_version`.
- Analytics coverage now explicitly includes completed-no-strong-matches, match
  runtime, slow backend, no strong matches, confidence sufficiency,
  missing-3D fallback, no reliable address, back-to-map click, and
  back-to-map return success. Quality feedback analytics are conditional on an
  existing feedback UI.
- Hero/results-map performance planning now requires target acceptance device
  profiles and measurable budgets for hero readiness, results usability,
  pan/zoom response, and list/map synchronization.
- Slow-backend behavior now requires a plan-defined threshold for localized
  slow-progress copy and telemetry.
- Phase 2 backend tests for session/answer persistence and preference-vector
  generation are mandatory, not conditional.
- Operational visibility is now MUST-level through logs and analytics without
  adding an MVP admin UI.
- Lowercase normative `must` wording in the spec's constitution constraint
  summary was tightened to `MUST` / `MUST NOT`.

PRD requirements now explicitly covered:

- PRD Phase 5 / Acceptance 9: completion must be visually confirmed with the
  Buurt Check checkmark before results, including fallback/no-strong-match
  completions.
- PRD Sections 14.5, 21.1, and 21.4: backend job/result states now include no
  strong matches and failure/fallback outcomes.
- PRD Section 14.3: minimum match/session/results/neighborhood/Dossier bridge
  API contracts must be defined or preserved during planning.
- PRD FR-R1 and Constitution XIV: the first completed results map must open
  centered on the Netherlands from persisted result state.
- PRD Sections 16.1 and 16.2: hero and results map performance budgets must be
  measurable before map planning proceeds.
- PRD FR-D2, FR-D4, and Section 27.5: Dossier return context includes the
  identifiers needed to decide whether matching can be restored without rerun.
- PRD Section 20 and Constitution XV: analytics event coverage includes the
  full funnel, match outcomes, map/detail failures, Dossier open, and
  back-to-map return success using stable keys.
- PRD Section 21.3: slow backend recovery now has a required threshold and
  telemetry trigger.
- PRD FR-P1 to FR-P5 and Section 23 Phase 2: backend verification for
  persisted sessions, answers, and preference vectors is mandatory.

Residual risks:

- `.specify/feature.json` still points at `retired alternate feature draft`, but
  this file was outside the allowed edit scope. Planning must update the
  pointer when permitted or run with
  `SPECIFY_FEATURE_DIRECTORY=specs/002-match-first-revamp`.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Latest Spec Audit Update

Spec audit fixes were applied as a documentation-only update. No product
behavior was implemented.

Files changed:

- `specs/002-match-first-revamp/spec.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read required PRD/handoff/constitution/traceability files before editing.
- Confirmed `specs/002-match-first-revamp/plan.md` exists and
  `retired alternate feature draft/plan.md` is missing.
- Confirmed `.specify/feature.json` points at
  `retired alternate feature draft`.
- Documentation diff/status checks only; no product tests were run because this
  change is limited to specs and handoff text.

Spec requirements now explicitly tightened:

- Constitution IX context preservation now lists result state, selected result
  ID/rank, selected house/building, return route, map center/zoom, list scroll,
  mobile map/list mode, matching status, and Dossier return path.
- Constitution V evidence contract now requires eligibility, score/label,
  reason codes, tradeoffs, 0-100 confidence, geometry references,
  source/freshness metadata, model/scoring version, data version, runtime,
  evaluation status, stable failure/fallback reason codes where applicable, and
  explicit limitations.
- Constitution XV failure coverage now includes no strong matches, slow
  backend, failed backend, completed-with-fallback scoring, missing 3D data,
  and no reliable address with accessible recovery behavior.
- Hero map behavior is a MUST-level lightweight implementation unless live
  rendering has proven performance, readability, reduced-motion, and CTA
  interaction budgets.
- Privacy coverage now includes no sale of preference data, anonymous/account
  separation, active-session retention limits, deletion where feasible,
  exact-anchor minimization, shareable output protection, and privacy copy
  before account creation or saving.
- Analytics coverage now includes match runtime, slow backend, no strong
  matches, confidence sufficiency, missing-3D fallback, no reliable address,
  Dossier open, and back-to-map return success.
- Accessibility now explicitly includes progress states, failure states,
  map/list interactions, house selection, and the Dossier return action.
- Legacy `#/match/*` routes are documented as compatibility-only and must not
  reintroduce dashboards or competing search/match modes.
- Operational visibility is limited to logs and telemetry; no admin UI surface
  is added to MVP scope.
- Phase 6 performance acceptance now depends on target acceptance device
  profiles named by the implementation plan.
- Recommendation confidence payloads must use the 0-100 confidence contract and
  `high`/`medium`/`low`/`insufficient` level keys, not legacy variants such as
  `medium_high`.

Residual risks:

- `.specify/feature.json` still needs an allowed edit to point at
  `specs/002-match-first-revamp`, or planning must pass
  `SPECIFY_FEATURE_DIRECTORY=specs/002-match-first-revamp`.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Latest Governance Update

Constitution v2.2.0 was applied as a documentation-only governance update. No
product behavior was implemented.

Files changed:

- `.specify/memory/constitution.md`
- `docs/ai/implementation_rules.md`
- `docs/ai/latest_handoff.md`

Commands/checks run:

- Read `docs/prd.md`, `docs/ai/latest_handoff.md`,
  `.specify/memory/constitution.md`, and
  `docs/qa/match_first_revamp_traceability.md` before editing.
- Documentation diff/status checks only; no product tests were run because this
  change is limited to governance text.

New governance requirements to honor before future implementation:

- Backend matching starts only after the review screen final run CTA.
- Progress, success, and results screens require real persisted
  session/job/result state.
- First completed results view opens centered on the Netherlands before
  neighborhood zoom, unless restoring an explicit saved selection.
- Results require the full evidence contract: eligibility, score or fit label,
  reason codes, tradeoffs, confidence, geometry references, model/scoring
  version, data version, runtime, evaluation status, source/freshness metadata,
  and limitations.
- Failure states and analytics are mandatory, bilingual, accessible, and
  stable-key based.
- Dossier modules must not be rewritten unless required for route/context
  preservation and covered by regression evidence.
- Context preservation now explicitly includes result state, map center/zoom,
  list scroll, mobile map/list mode, selected result ID/rank, selected
  house/building, return route, and language.

Residual risks:

- SpecKit templates and broader runtime guidance were not synchronized because
  this update was explicitly scoped to three files.
- `docs/qa/match_first_revamp_traceability.md` was read but not updated because
  no implementation phase was completed and it was outside the allowed edit
  scope.

## Required Update Pattern

At the end of each implementation phase, update this file with:

- completed tasks and files changed
- commands run and whether they passed
- residual risks or blocked checks
- next smallest safe step

Also update `docs/qa/match_first_revamp_traceability.md` with acceptance-linked
evidence.
