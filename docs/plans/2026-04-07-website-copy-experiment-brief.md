# Website Copy Experiment Brief

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

Date: April 7, 2026
Status: ticket-ready, not current-branch implementation
Source plan: `docs/plans/2026-04-04-website-premium-audit.md` Task 9

## Goal

Convert audit findings `H4` and `H6` into a bounded copy experiment. This brief does not authorize immediate landing copy changes.

## Experiment matrix

| Variant | Placement | NL copy | EN copy |
| --- | --- | --- | --- |
| Control | Existing page | No copy change | No copy change |
| A - pricing value | Under pricing support text | `Eenmalig per adres. Gebruik het dossier voordat je een bod overweegt.` | `One time per address. Use the dossier before you consider an offer.` |
| B - urgency/action | Final CTA support line | `Check geluid, zonlicht, klimaat en buurtcontext voordat je beslist.` | `Check noise, sunlight, climate, and neighborhood context before you decide.` |
| C - conservative | Pricing card note or final CTA, not both | `Binnen seconden een dossier voor je bezichtiging.` | `A viewing dossier in seconds.` |

## Placement rules

- test one variant at a time
- do not place urgency copy above the H1
- do not add fear-based claims, guarantees, fake scarcity, countdowns, or fabricated outcomes
- do not change CTA hrefs, analytics event names, price, or product-entitlement copy

## Measurement plan

Primary metric:

- `landing_cta_click` rate by placement

Secondary metrics:

- pricing section reach
- final CTA reach
- FAQ interaction rate
- bounce rate

Evaluation window:

- minimum `14` days or `1,000` landing sessions, whichever comes later
- segment by language (`nl`, `en`) and viewport class (`mobile`, `desktop`)

## Instrumentation prerequisite

Current landing section-view instrumentation covers `#pricing` and `#faq`, but not `#final-cta`. If final CTA reach remains a success metric, the implementation ticket must:

- add `data-track-section-view` to `#final-cta`
- extend `frontend/tests/e2e/landing-page.spec.ts` to expect `landing_section_view` for `final-cta`

If final CTA reach is removed, replace it with an already-measurable analytics-platform metric before implementation.

Bounce rate must come from the analytics platform or another approved reporting layer. Do not add ad hoc client-side bounce tracking to `landing/index.html` without explicit approval.

## Rollback criteria

- roll back if CTA click-through decreases by `>= 10%` relative to control after the minimum evaluation window
- roll back immediately if support or contact feedback indicates the copy is misleading
- roll back immediately if the change introduces serious or critical axe violations
- roll back if median LCP delta exceeds `+50ms`

## Implementation files after approval

- `landing/index.html`
- `frontend/tests/e2e/landing-page.spec.ts`
- `dist-landing/` after `npm run landing:build`

## Acceptance criteria

- the team has exact candidate copy, placements, metrics, and rollback rules
- no copy-locked runtime sections change before this brief is approved
