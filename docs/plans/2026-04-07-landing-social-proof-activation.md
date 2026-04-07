# Landing Social Proof Activation

Date: April 7, 2026
Status: ticket-ready, not current-branch implementation
Source plan: `docs/plans/2026-04-04-website-premium-audit.md` Task 11

## Activation rule

Do not add social proof to the landing page until at least one verifiable source exists.

## Acceptable source types

- verified user quote
- real addresses-analyzed counter
- press or community mention
- app-store rating

## Prohibited placeholders

- invented testimonials
- fabricated counters
- padded trust claims without a verifiable source

## Evidence requirements

For any future social-proof element, store:

- source URL, screenshot, export, or approval record
- date captured
- owner
- refresh or removal rule if the proof becomes stale

## Implementation files after activation

- `landing/index.html`
- `frontend/tests/e2e/landing-page.spec.ts`
- `dist-landing/` after `npm run landing:build`

## Acceptance criteria

- the team has an explicit activation rule for future social-proof work
- no fabricated proof ships pre-launch
