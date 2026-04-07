# App Theme Arrival Ticket

Date: April 7, 2026
Status: ticket-ready, app-scope only
Source plan: `docs/plans/2026-04-04-website-premium-audit.md` Task 12

## Scope

This ticket moves audit finding `X1` out of the landing follow-up stream and into app scope. The concern is the arrival transition from the dark landing page to the app theme on first paint.

## Relevant code

- `frontend/src/services/theme.ts`

## Options to evaluate

1. Leave app theme behavior unchanged and accept the product boundary.
2. Add a landing CTA query or hash hint such as `?theme=dark` only after the app has an explicit, tested contract for honoring it.
3. Adjust app first-paint theme initialization to reduce flash without changing user-preference semantics.

## Constraints

- do not override a stored user preference without explicit product approval
- respect `prefers-reduced-motion` and existing `theme-transitioning` behavior
- avoid new query parameters that conflict with checkout return parameters (`report`, `session_id`, `buyer_resume`) or address lookup parameters (`lookup`)
- landing CTA hrefs remain stable unless a separate routing contract approves a new parameter

## Acceptance criteria

- app-side tests cover stored preference, system preference, reduced-motion behavior, and any approved landing hint
- no regression to `data-theme` initialization in `frontend/src/services/theme.ts`
- the issue is no longer treated as an in-scope landing-page defect under the current landing PRD
