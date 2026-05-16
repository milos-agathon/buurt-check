# Latest AI Handoff

Updated: 2026-05-16

## Current Phase

The active SpecKit feature is `specs/002-match-first-revamp`; `.specify/feature.json`
now points at that complete feature directory.
Phase 1, Phase 2, Phase 3 backend matching, Phase 4 progress/success UI, and
Phase 5 Netherlands results map/list are documented as closed in
`docs/qa/match_first_revamp_traceability.md`. Phase 5 now hydrates completed
session results through `GET /api/match/sessions/{session_id}/results`, renders
a Netherlands-oriented 2D results map plus ranked recommendation list, keeps
list and map selection synchronized, preserves map/list state for later Dossier
return, and keeps the list usable without map interaction. Phase 6
selected-neighborhood detail/3D and Phase 7 Dossier bridge work remain
unimplemented.

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

The next documented implementation phase is Phase 6:
selected-neighborhood detail. Keep the Phase 5 boundary intact: do not load
national 3D buildings, do not add national-zoom amenities, and do not implement
house click or Dossier bridge behavior until their later phases.

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
- Phase 6 must add selected-neighborhood detail/placeholder behavior without
  loading national 3D buildings.

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
map/Dossier phases were not implemented.

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
Dossier bridge remain later phases.

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
