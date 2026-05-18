# Acceptance Traceability

Updated: 2026-05-18

This table maps the PRD Section 24 acceptance criteria and Spec SC-001 to
SC-016 to implementation evidence. Detailed phase evidence lives in
`docs/qa/match_first_revamp_traceability.md`; final automated/manual QA output
lives in `docs/qa/final_evidence.md`.

## PRD Acceptance Criteria

| ID | Status | Evidence |
| --- | --- | --- |
| AC1 first-time user understands primary action | PARTIAL / RELEASE RESEARCH | Landing CTA and hero coverage in `MatchFirstLanding.test.tsx`, final E2E journey, and `test:a11y` prove the implemented hierarchy is present and operable. They do not prove first-time-human understanding; AC1 remains blocked on the same human/product research evidence as SC-001 before public release. |
| AC2 landing does not force search-vs-match choice | PASS | Phase 1/8 tests keep address search as secondary link; performance E2E now verifies secondary search reveal instead of immediate search input. |
| AC3 CTA starts match flow | PASS | App/landing tests and final E2E cover landing CTA -> survey intro. |
| AC4 one question at a time | PASS | `SurveyShell` tests and final E2E cover one-question survey progression. |
| AC5 survey progress visible | PASS | Survey accessibility/focused tests cover progress indicator and labels. |
| AC6 user can go back/change previous answers | PASS | Phase 8 added survey-back analytics and focused keyboard/a11y coverage; final E2E covers full answer path. |
| AC7 backend match run starts only after final CTA | PASS | Phase 3/4 backend and App tests; final E2E reaches progress only after review CTA. |
| AC8 friendly matching progress | PASS | `MatchingProgressScreen` tests cover running/slow/failed/fallback states and localized status regions. |
| AC9 completion confirmed with Buurt Check checkmark | PASS | `MatchSuccessCheckmark` tests and final E2E cover verified success before results. |
| AC10 results open on Netherlands map with ranked neighborhoods | PASS | `ResultsMap` tests and final E2E cover results open and list/map alternatives. |
| AC11 clicking result zooms/opens neighborhood | PASS | `ResultsMap` tests and final E2E cover neighborhood selection and detail route. |
| AC12 selected-neighborhood view scopes 3D houses | PASS | Backend map/building layer tests reject national/out-of-scope requests; frontend detail tests cover selected-neighborhood-only request/fallback. |
| AC13 amenity tags relevant to preferences | PASS | Amenity cap/relevance tests from Phase 6 plus Phase 8 amenity filter analytics/button tests. |
| AC14 clicking a house opens existing Dossier | PASS | Dossier bridge tests and final+Dossier E2E cover house -> existing `#/address` Dossier. |
| AC15 Dossier route back to map | PASS | Dossier round-trip E2E and App tests cover persistent Back to match map and restored state. |
| AC16 Dutch and English translation keys | PASS | `match-i18n.test.ts`, copy guards, full frontend test suite, and updated EN/NL amenity filter keys. |
| AC17 reduced-motion and map fallback states | PASS | Automated reduced-motion final/Dossier E2E, success/checkmark tests, missing-3D 2D/list fallback tests, and Chromium EN/NL quickstart smoke pass. Quickstart evidence: browser Chromium, viewport 390x844, languages English and Dutch, `prefers-reduced-motion: reduce`, no blockers. |
| AC18 honest model/scoring output | PASS | Backend model-honesty tests, frontend copy guards, and result evidence contract; no predictive probability or objective-best claims are introduced. |

## Spec Success Criteria

| ID | Status | Evidence |
| --- | --- | --- |
| SC-001 | PARTIAL / RELEASE RESEARCH | Landing CTA hierarchy is covered by automated UI tests and final E2E, but the 90% first-time-human usability target still requires a human/product research pass before public release. |
| SC-002 | PASS | Landing keeps address search secondary; no equal search CTA/tab/card. |
| SC-003 | PARTIAL / RELEASE RESEARCH | Mobile final E2E completes the survey without external guidance, but the 80% human mobile-completion metric still requires a human/product research pass before public release. |
| SC-004 | PASS | Survey tests enforce one question per screen. |
| SC-005 | PASS | Backend preference-vector/session tests are included in the passing non-live suite. |
| SC-006 | PASS | Backend run and frontend review/progress tests enforce final-review-only matching. |
| SC-007 | PASS | Backend result contract/model-honesty tests are included in the passing non-live suite. |
| SC-008 | PASS | Copy/model-honesty guards passed; no predictive probability or objective-best claims. |
| SC-009 | PASS | Results map/list tests and final E2E cover opening/selecting results. |
| SC-010 | PASS | Backend/frontend selected-neighborhood layer tests reject national 3D loading. |
| SC-011 | PASS | Dossier round-trip E2E restores match map state without rerun. |
| SC-012 | PASS | i18n parity tests and copy guards passed. |
| SC-013 | PASS | Focused a11y tests, reduced-motion E2E, touch-target CSS checks, and automated Playwright hero-contrast evidence are recorded in final evidence. |
| SC-014 | PASS | Analytics event catalog, frontend backend-transport tests, backend privacy tests, spec-contract parity tests, save-failure analytics tests, and final journey backend POST assertions cover required stable events without exact IDs. The Phase 8 review-blocker repair adds exact once-per-flow local and backend count assertions for `match_landing_cta_clicked`, `match_final_run_cta_clicked`, `match_results_map_opened`, `match_recommendation_selected`, `match_dossier_opened`, and `match_back_to_map_return_success`; backend privacy tests reject private top-level analytics `session_id` payloads containing 16-digit address/VBO-like values, embedded address routes, `lookup=` markers, email-shaped values, or free-text sentence values and assert no rejected rows persist; allowed backend context string values must be stable tokens/routes so allowed keys cannot persist sentence text or lookup-bearing private values. Catalog parity tests require all spec events and allow only documented optional extras; the non-spec `match_neighborhood_clicked` event was removed and the ResultsMap detail entry keeps `match_neighborhood_detail_opened` while selection analytics are not re-emitted when the recommendation is already selected. `match_quality_feedback_submitted` is N/A because no match-first feedback UI exists in this phase. |
| SC-015 | PARTIAL / RELEASE CONDITION | Local performance E2E now covers landing readiness, secondary search reveal, results map usability, list/map sync, pan/zoom controls, selected-neighborhood detail readiness, no national 3D request, and reduced-motion mobile behavior. Live production/mobile-device profiling remains deferred in `docs/qa/open_punchlist.md`. |
| SC-016 | PASS | Dossier round-trip E2E opens a second house from preserved context without `/run`. |

Rows marked partial are intentionally not promoted to pass in
`docs/qa/match_first_revamp_traceability.md`.
