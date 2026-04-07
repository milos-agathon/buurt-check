# Website Product Visuals PRD Addendum

Date: April 7, 2026
Status: ticket-ready, not current-branch implementation
Governing PRD: `docs/plans/prd-website.md`
Source plan: `docs/plans/2026-04-04-website-premium-audit.md` Task 7

## Purpose

This addendum turns audit finding `H1` into a bounded scope-expansion brief. It does not authorize runtime implementation by itself. No landing asset work should start until this addendum is explicitly approved.

## Scope expansion

The current landing PRD locks copy, colors, font family, and image/SVG assets. Product-visual work therefore requires an explicit PRD amendment. The scope is limited to five asset deliverables in three workstreams:

1. Hero product visual
2. Three Tier 1 differentiator support visuals
3. OG image replacement

## Deliverables

| Workstream | Deliverable | Runtime path | Editable source path | Owner |
| --- | --- | --- | --- | --- |
| Hero | Product demonstration image replacing the current hero visual | `landing/images/landing-hero-product.webp` | `landing/images/landing-hero-product-source.*` | Design |
| Differentiator | Risk-card support visual | `landing/images/landing-differentiator-risk.webp` | `landing/images/landing-differentiator-risk-source.*` | Design |
| Differentiator | 3D context support visual | `landing/images/landing-differentiator-3d.webp` | `landing/images/landing-differentiator-3d-source.*` | Design |
| Differentiator | Viewing-checklist support visual | `landing/images/landing-differentiator-checklist.webp` | `landing/images/landing-differentiator-checklist-source.*` | Design |
| OG | Social preview replacement | `landing/og-image.png` | `landing/og-image.svg` or approved editable source | Design |

## Asset requirements

All new visuals must satisfy these rules:

- preserve the current hero image aspect ratio of `1024x500`
- use WebP for runtime landing images
- target `<= 220KB` for the hero image
- target `<= 160KB` for each differentiator image
- keep `landing/og-image.png` as the runtime metadata path unless a later addendum explicitly changes metadata paths
- show the actual product or a product-faithful mockup, not abstract illustration
- include no visible personal data, no identifiable private address, and no fabricated claim overlays
- use one neutral descriptive alt text per image; do not duplicate adjacent marketing copy

## Implementation files after approval

- `landing/index.html`
- `landing/images/*`
- `landing/og-image.png`
- `landing/og-image.svg` if used as editable source
- `frontend/tests/e2e/landing-page.spec.ts`
- `dist-landing/` after `npm run landing:build`

## Acceptance criteria

- the PRD addendum is approved before any asset replacement work starts
- each deliverable has a concrete runtime path and editable source path
- compression and privacy constraints are defined up front
- the team no longer treats `H1` as a vague styling tweak
