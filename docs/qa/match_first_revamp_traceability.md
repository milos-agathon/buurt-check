# Match-First Revamp Traceability

Date: 2026-05-12

Scope: Phase 1 UI shell and route cleanup for the match-first revamp.

## Phase 1 Acceptance Mapping

| PRD / constitution item | Implementation surface | Acceptance criteria | Verification |
| --- | --- | --- | --- |
| FR-L2, FR-L3; Constitution I | `frontend/src/App.tsx`, `frontend/src/components/match-first/MatchFirstLanding.tsx`, `frontend/src/components/TabBar.tsx` | Root and `#/match` show one dominant match CTA. Address search is secondary on the landing screen, and the main app tab is labeled Match rather than Search. | `frontend/src/App.test.tsx` initial render tests, `frontend/src/components/TabBar.test.tsx` |
| FR-L4; Constitution III, VII | `frontend/src/components/TopBar.tsx`, `frontend/src/components/match-first/MatchFirstLanding.tsx`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json` | Landing has one language switcher, with native button semantics, keyboard operation, and bilingual labels from translation keys. | `MatchFirstLanding.test.tsx`, `keyboard-navigation.test.tsx`, `match-first-copy-guard.test.ts` |
| FR-L5, FR-L6; Constitution IV, VII | `frontend/src/components/match-first/HeroMapBackground.tsx` | Hero respects reduced motion and switches to a static fallback state if the image fails. | `HeroMapBackground.test.tsx` |
| Phase 1 canonical flow; Constitution I | `frontend/src/routing/hashRoutes.ts`, `frontend/src/App.tsx`, `frontend/src/components/match-first/SurveyIntro.tsx` | Landing CTA goes to survey intro before the first survey question. `#/match/intro` is a stable route. | `match-first-routing.test.tsx`, `SurveyIntro.test.tsx` |
| FR-S1, FR-S2, FR-S3, FR-S4, FR-S5; Constitution II, IX | `frontend/src/components/match-first/SurveyShell.tsx`, `frontend/src/components/match-first/SurveyReview.tsx` | Survey shows one question, progress, required-answer validation, session-scoped persisted answer state, review, back behavior, and completion callback. | `SurveyShell.test.tsx`, `SurveyReview.test.tsx` |
| Phase 7 preparation; Constitution VI, IX | `frontend/src/routing/hashRoutes.ts`, `frontend/src/App.tsx` | Dossier routes can carry explicit match-return context without reusing checkout `session_id`; structured cold-start `match_context` survives query/hash parsing; Dossier shows Back to match map whenever that context exists, including loading, empty, and address-unavailable states. | `match-first-routing.test.tsx`, `App.test.tsx` |
| Constitution V, X | `frontend/src/test/match-first-copy-guard.test.ts` | Match-first copy blocks unsupported model certainty, safety, happiness, investment, future-value, guarantee, and predictive-probability claims before result phases add more copy. | `match-first-copy-guard.test.ts` |
| Constitution VII | `frontend/src/App.tsx` | Hash-route transitions move focus to the main content container so keyboard and screen-reader users are not left on stale controls. | `App.test.tsx`, `keyboard-navigation.test.tsx` |

## Punch-List Fixes 2026-05-13

- Match-return Dossier URLs without `lookup`, such as `#/address/{vbo_id}?match_return=...`, now keep the user in the Dossier route and render a localized address-unavailable shell instead of redirecting to Search.
- The Back to match map action is rendered by the Dossier route wrapper whenever match-return context exists, so it remains available through loading, empty, error, and successful address states.
- Match run `completed` / `running` state is no longer trusted from `localStorage`. Until backend run/status/results endpoints are wired, direct success and results routes render neutral localized shells rather than implying that matching has completed.
- Survey answers are scoped by match session ID, preventing a new session from inheriting stale answers from an earlier one.
- `App.tsx` reuses the shared route parser for structured `match_context`, preserving selected neighborhood, selected house, map center, zoom, and list scroll on cold-start Dossier URLs.
- Direct match neighborhood URLs do not trust persisted Dossier return context from `localStorage`; that context is only reused for the active Dossier back action.
- Failure and unavailable copy now has explicit bilingual keys, enforced by `frontend/src/test/match-i18n.test.ts`, for no strong matches, slow backend, failed backend, completed-with-fallback, no reliable address, no-result states, missing 3D, neutral results placeholders, and Dossier address-unavailable recovery.

## Current Phase 1 Limits

- The survey is intentionally one dummy question for Phase 1 shell completion. Final 10-12 question content and preference-vector generation remain Phase 2 work.
- The final survey action now routes through the session run step with direct-route recovery guards. Backend async matching completion and real result payload hydration remain later phases; completed-looking routes intentionally stay as explicit placeholders until real backend state is available.
- Neighborhood-only 3D building loading is not changed in this phase; no national 3D loading path was introduced.
