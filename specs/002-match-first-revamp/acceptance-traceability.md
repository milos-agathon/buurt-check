# Acceptance Traceability

Updated: 2026-05-22

This table maps the PRD acceptance criteria and Spec SC-001 to SC-016 to
implementation evidence. Detailed phase evidence lives in
`docs/qa/match_first_revamp_traceability.md`; final automated/manual QA output
lives in `docs/qa/final_evidence.md`.

2026-05-21 PRD delta: the product contract now includes an optional
additional-preferences prompt with strict-schema extraction, backend
custom-preference registry validation, user review, and explicit no-LLM-scoring
boundaries. Existing PASS rows for the prior fixed-question flow do not prove
this new hybrid intake behavior. The hybrid workflow is **MISSING /
IMPLEMENTATION PENDING** until Phase 2A tasks T-089 through T-096 are completed
and evidenced.

2026-05-22 BAG semantic delta: selected-neighborhood footprints are BAG `pand`
records, not building-type records. House-candidate semantics come from linked
`verblijfsobject.gebruiksdoel`, with `woonfunctie` prioritized; non-house and
zero-verblijfsobject pands remain visible as deferred footprints.

## PRD Acceptance Criteria

| ID | Status | Evidence |
| --- | --- | --- |
| AC1 first-time user understands primary action | PARTIAL / RELEASE RESEARCH | Landing CTA and hero coverage in `MatchFirstLanding.test.tsx`, final E2E journey, and `test:a11y` prove the implemented hierarchy is present and operable. They do not prove first-time-human understanding; AC1 remains blocked on the same human/product research evidence as SC-001 before public release. |
| AC2 landing does not force search-vs-match choice | PASS | Phase 1/8 tests keep address search as secondary link; performance E2E now verifies secondary search reveal instead of immediate search input. |
| AC3 CTA starts match flow | PASS | App/landing tests and final E2E cover landing CTA -> survey intro. |
| AC4 one question at a time | PARTIAL / HYBRID DELTA MISSING | `SurveyShell` tests and final E2E cover the original one-question guided intake progression. They do not yet cover the new optional additional-preferences prompt or prove it stays one focused prompt rather than unbounded chat. |
| AC5 survey progress visible | PASS | Survey accessibility/focused tests cover progress indicator and labels. |
| AC6 user can go back/change previous answers | PASS | Phase 8 added survey-back analytics and focused keyboard/a11y coverage; final E2E covers full answer path. |
| AC7 backend match run starts only after final CTA | PARTIAL / HYBRID DELTA MISSING | Phase 3/4 backend and App tests prove final-CTA gating for the original guided answers. They do not yet prove that reviewed custom-preference status is current before matching starts. |
| AC8 friendly matching progress | PASS | `MatchingProgressScreen` tests cover running/slow/failed/fallback states and localized status regions. |
| AC9 completion confirmed with Buurt Check checkmark | PASS | `MatchSuccessCheckmark` tests and final E2E cover verified success before results. |
| AC10 results open on Netherlands map with ranked neighborhoods | PASS | `ResultsMap` tests and final E2E cover results open and list/map alternatives. |
| AC11 clicking result zooms/opens neighborhood | PASS | `ResultsMap` tests and final E2E cover neighborhood selection and detail route. |
| AC12 selected-neighborhood view scopes 2D building footprints | PARTIAL / PROGRESSIVE FOOTPRINT DELTA MISSING | Existing backend map/building layer tests reject national/out-of-scope requests and frontend detail tests cover selected-neighborhood-only 2D footprint rendering and fallback. The 2026-05-22 BAG update adds PDOK BAG OGC v2 `pand` parsing/use-purpose evidence and frontend deferred non-house footprint rendering. The PRD still requires all available selected-neighborhood footprints or current selected-neighborhood viewport footprints to load progressively with honest partial-state copy, not an unlabeled representative sample. Pending Phase 6A tasks T-097 through T-101 must complete all-available paging/performance verification before this row returns to pass. |
| AC13 amenity tags and markers relevant to preferences | PASS | Amenity cap/relevance tests from Phase 6, Phase 8 amenity filter analytics/button tests, and the 2026-05-20/2026-05-23 marker regression proving every returned amenity point renders with a type-specific marker, dedicated emoji, and matching right-side legend/filter identity. |
| AC14 clicking a house opens existing Dossier | PASS | Dossier bridge tests and final+Dossier E2E cover house -> existing `#/address` Dossier. |
| AC15 Dossier route back to map | PASS | Dossier round-trip E2E and App tests cover persistent Back to match map and restored state. |
| AC16 Dutch and English translation keys | PARTIAL / HYBRID DELTA MISSING | Existing i18n tests cover implemented match-first strings. New additional-preferences prompt, extraction/review statuses, and failure copy need EN/NL keys and tests before this returns to pass. |
| AC17 reduced-motion and map fallback states | PASS | Automated reduced-motion final/Dossier E2E, success/checkmark tests, missing-footprint/list fallback tests, and Chromium EN/NL quickstart smoke pass. Quickstart evidence: browser Chromium, viewport 390x844, languages English and Dutch, `prefers-reduced-motion: reduce`, no blockers. |
| AC18 honest model/scoring output | PARTIAL / HYBRID DELTA MISSING | Backend model-honesty tests, frontend copy guards, and result evidence contract cover current deterministic scoring. New tests must prove LLM extraction, if enabled, cannot score, rank, exclude, infer protected traits, create confidence, or modify source metadata. |

## Spec Success Criteria

| ID | Status | Evidence |
| --- | --- | --- |
| SC-001 | PARTIAL / RELEASE RESEARCH | Landing CTA hierarchy is covered by automated UI tests and final E2E, but the 90% first-time-human usability target still requires a human/product research pass before public release. |
| SC-002 | PASS | Landing keeps address search secondary; no equal search CTA/tab/card. |
| SC-003 | PARTIAL / RELEASE RESEARCH + HYBRID DELTA MISSING | Mobile final E2E completes the original survey without external guidance, but the 80% human mobile-completion metric and the new additional-preferences submit/skip behavior still require evidence. |
| SC-004 | PARTIAL / HYBRID DELTA MISSING | Survey tests enforce one question per screen for the original fixed-question path. The optional additional-preferences prompt still needs no-unbounded-chat and one-action UI evidence. |
| SC-005 | PARTIAL / HYBRID DELTA MISSING | Backend preference-vector/session tests are included in the passing non-live suite for guided answers only. Preference vectors do not yet include reviewed custom-preference statuses from the new registry contract. |
| SC-006 | PASS | Backend run and frontend review/progress tests enforce final-review-only matching. |
| SC-007 | PASS | Backend result contract/model-honesty tests are included in the passing non-live suite. |
| SC-008 | PASS | Copy/model-honesty guards passed; no predictive probability or objective-best claims. |
| SC-009 | PASS | Results map/list tests and final E2E cover opening/selecting results. |
| SC-010 | PARTIAL / PROGRESSIVE FOOTPRINT DELTA MISSING | Backend/frontend selected-neighborhood layer tests reject national building-footprint and national 3D loading. Updated SC-010 also requires that no selected-neighborhood detail state presents an unlabeled representative building sample as complete coverage; this needs Phase 6A progressive loading/completion evidence. |
| SC-011 | PASS | Dossier round-trip E2E restores match map state without rerun. |
| SC-012 | PASS | i18n parity tests and copy guards passed. |
| SC-013 | PASS | Focused a11y tests, reduced-motion E2E, touch-target CSS checks, and automated Playwright hero-contrast evidence are recorded in final evidence. |
| SC-014 | PARTIAL / HYBRID DELTA MISSING | Existing analytics event catalog, frontend backend-transport tests, backend privacy tests, spec-contract parity tests, save-failure analytics tests, and final journey backend POST assertions cover the original funnel. New events for additional-preferences prompt shown/skipped/submitted and custom-preference extraction/review outcomes, plus raw-text privacy rejection, are not implemented yet. |
| SC-015 | PARTIAL / RELEASE CONDITION + PROGRESSIVE FOOTPRINT DELTA MISSING | Local performance E2E covers landing readiness, secondary search reveal, results map usability, list/map sync, pan/zoom controls, selected-neighborhood detail readiness, no national building-footprint or 3D request, and reduced-motion mobile behavior. Updated building-footprint performance must also prove progressive selected-neighborhood footprint paging does not block interaction and labels partial loading honestly. Live production/mobile-device profiling remains deferred in `docs/qa/open_punchlist.md`. |
| SC-016 | PASS | Dossier round-trip E2E opens a second house from preserved context without `/run`. |

Rows marked partial are intentionally not promoted to pass in
`docs/qa/match_first_revamp_traceability.md`.
