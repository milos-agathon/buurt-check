# Match-First Revamp Traceability

Date: 2026-05-12

Scope: Phase 1 UI shell and route cleanup for the match-first revamp.

## Phase 1 Acceptance Mapping

| PRD / constitution item | Implementation surface | Acceptance criteria | Verification |
| --- | --- | --- | --- |
| FR-L2, FR-L3; Constitution I | `frontend/src/App.tsx`, `frontend/src/components/match-first/MatchFirstLanding.tsx` | Root and `#/match` show one dominant match CTA. Address search is only the small landing text link, not a global first-screen tab or equal mode. | `frontend/src/App.test.tsx` initial render tests |
| FR-L4; Constitution III, VII | `frontend/src/components/TopBar.tsx`, `frontend/src/components/match-first/MatchFirstLanding.tsx`, `frontend/src/i18n/en.json`, `frontend/src/i18n/nl.json` | Landing has one language switcher, with native button semantics, keyboard operation, and bilingual labels from translation keys. | `MatchFirstLanding.test.tsx`, `keyboard-navigation.test.tsx`, `match-first-copy-guard.test.ts` |
| FR-L5, FR-L6; Constitution IV, VII | `frontend/src/components/match-first/HeroMapBackground.tsx` | Hero respects reduced motion and switches to a static fallback state if the image fails. | `HeroMapBackground.test.tsx` |
| Phase 1 canonical flow; Constitution I | `frontend/src/routing/hashRoutes.ts`, `frontend/src/App.tsx`, `frontend/src/components/match-first/SurveyIntro.tsx` | Landing CTA goes to survey intro before the first survey question. `#/match/intro` is a stable route. | `match-first-routing.test.tsx`, `SurveyIntro.test.tsx` |
| FR-S1, FR-S2, FR-S3, FR-S4, FR-S5; Constitution II, IX | `frontend/src/components/match-first/SurveyShell.tsx` | Survey shows one question, progress, required-answer validation, persisted answer state, review, back behavior, and completion callback. | `SurveyShell.test.tsx` |
| Phase 7 preparation; Constitution VI, IX | `frontend/src/routing/hashRoutes.ts`, `frontend/src/App.tsx` | Dossier routes can carry explicit match-return context without reusing checkout `session_id`; Dossier shows Back to match map when that context exists. | `match-first-routing.test.tsx`, `App.test.tsx` |
| Constitution V, X | `frontend/src/test/match-first-copy-guard.test.ts` | Match-first copy blocks unsupported model certainty phrases before result phases add more copy. | `match-first-copy-guard.test.ts` |

## Current Phase 1 Limits

- The survey is intentionally one dummy question for Phase 1 shell completion. Final 10-12 question content and preference-vector generation remain Phase 2 work.
- The final survey action currently routes to the existing match map surface. Backend async matching progress and checkmark success remain later phases.
- Neighborhood-only 3D building loading is not changed in this phase; no national 3D loading path was introduced.
