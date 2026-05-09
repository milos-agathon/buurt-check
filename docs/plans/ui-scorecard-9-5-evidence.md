# UI Scorecard 9.5 Evidence Ledger

This ledger is the scorecard evidence source for `docs/plans/2026-05-08-ui-scorecard-9-5-implementation-plan.md`.

Allowed incomplete placeholder: `BLOCKING_UNFILLED`.
Allowed not-applicable format: `NOT_APPLICABLE; <specific reason>`.
Allowed pass format: `PASS; command=<command or manual protocol>; date=YYYY-MM-DD; commit=<sha or working-tree>; reviewer=<name>; artifact=<path or route>; notes=<specific residual risk or none>`.

## Source-Quality Metric Schema

Source-quality metric rows must include `unknown_date_count`, `generic_confidence_count`, `generic_limitation_count`, `total_source_rows`, `raw_ratio`, `displayed_percentage`, `threshold`, and `status`. The source-quality cap fails when more than `15%` of primary prebid action plus primary risk-card rows have unknown dates, more than `10%` have generic confidence labels, more than `10%` have generic limitations, or any visible primary prebid/risk row misses required source, date or unknown-date label, confidence or coverage status, recipient where applicable, or limitation.

## Score Cap Names

`broken-primary-route`
`ledger-invalid`
`route-tests-missing`
`visual-metadata-invalid`
`accessibility-failing`
`source-quality-failing`
`backend-contract-missing`
`sunlight-free-surface`
`landing-parity-drift`
`screenshots-unapproved`
`baseline-unverified`
`manual-missing`

## Automated verification run - 2026-05-08

| Gate | Status |
|---|---|
| Frontend build | PASS; command=`cd frontend; npm run build`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`frontend/dist/`; notes=Vite/PWA build completed. |
| Frontend unit and component tests | PASS; command=`cd frontend; npm run test`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`frontend/src/`; notes=103 test files, 946 tests passed. |
| Mechanical scorecard contracts | PASS; command=`cd frontend; npm run test -- src/test/evidence-ledger-contract.test.ts src/test/score-cap-contract.test.ts src/test/source-quality-contract.test.ts src/test/design-tokens.test.ts src/test/i18n-overflow-guards.test.ts`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`frontend/src/test/`; notes=5 test files, 25 tests passed. |
| Search and prebid E2E gates | PASS; command=`cd frontend; npx playwright test tests/e2e/search-ui-geometry.spec.ts tests/e2e/search-led-ui-quality.spec.ts tests/e2e/search-led-performance.spec.ts --project=chromium`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`frontend/tests/e2e/`; notes=18 Chromium tests passed. |
| Dossier, whole-app, export E2E gates | PASS; command=`cd frontend; npx playwright test tests/e2e/dossier-section-order.spec.ts tests/e2e/whole-app-ui-quality.spec.ts tests/e2e/whole-app-performance.spec.ts tests/e2e/stripe-return-download.spec.ts --project=chromium`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`frontend/tests/e2e/`; notes=12 Chromium tests passed. |
| Landing app-mirror E2E gates | PASS; command=`cd frontend; npx playwright test tests/e2e/landing-page.spec.ts --project=chromium`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`frontend/public/landing.html`; notes=11 Chromium tests passed, 1 intentionally skipped mobile-hero check. |
| Visual regression gates | PASS; command=`cd frontend; npm run test:visual -- --project=chromium`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`frontend/tests/e2e/visual-regression.spec.ts-snapshots/`; notes=30 tests passed across configured browser projects. |
| Static landing build | PASS; command=`npm run landing:build`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`dist-landing/`; notes=Landing build completed. |
| Static landing E2E gates | PASS; command=`npm run landing:test:e2e -- --project=chromium`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`landing/`; notes=23 tests passed, 1 intentionally skipped desktop mobile-hero check. |
| Backend product-contract tests | PASS; command=`cd backend; pytest -x -q -m "not live"`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`backend/tests/`; notes=1152 passed, 20 skipped, 11 deselected. |
| Backend lint | PASS; command=`cd backend; ruff check .`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`backend/`; notes=All checks passed. |
| Landing asset hash parity | PASS; command=`Get-FileHash landing/images/showcase-risk-details.webp, frontend/public/images/showcase-risk-details.webp, landing/images/showcase-sunlight.webp, frontend/public/images/showcase-sunlight.webp, landing/images/showcase-neighborhood.webp, frontend/public/images/showcase-neighborhood.webp, landing/og-image.svg, frontend/public/og-image.svg, landing/og-image-en.svg, frontend/public/og-image-en.svg -Algorithm SHA256`; date=2026-05-08; commit=working-tree; reviewer=Codex; artifact=`landing/`, `frontend/public/`; notes=All canonical/mirror pairs matched by SHA-256. |

Manual real-device, VoiceOver, TalkBack, native Dutch, source-trust, product-contract, and final design review rows remain `BLOCKING_UNFILLED`; the final score must remain blocked by `manual-missing` until named human review evidence is recorded.

## Baseline traceability

| Scorecard item | Current score | Baseline reviewer | Review date | Source artifact | Route family | Baseline blocker summary |
|---|---:|---|---|---|---|---|
| Design system foundation | 8.4 | Codex readiness review | 2026-05-08 | `docs/plans/2026-05-06-search-ui-9-5-design-plan.md`; current app CSS/token audit | `[minimalist]`, `[accessibility]` | Z-index, focus, shadow, radius, dark-mode, forced-colors, and reduced-motion contracts are not yet centralized or mechanically enforced across app and static surfaces. |
| Search mobile | 8.6 | Codex readiness review | 2026-05-08 | `docs/plans/2026-05-06-search-ui-9-5-design-plan.md`; `frontend/tests/e2e/search-ui-geometry.spec.ts` baseline intent | `[search]` | Mobile search has promising structure but still needs hard `320x700`, `390x844`, `430x932`, Dutch overflow, suggestion clearance, and forced-colors gates before a `9.5` claim. |
| Search desktop/tablet | 8.0 | Codex readiness review | 2026-05-08 | `docs/plans/2026-05-06-search-ui-9-5-design-plan.md`; desktop/tablet search composition review | `[search]` | Desktop and tablet search risk stretched mobile rhythm, side-preview dead space, and weak source-bound side content without viewport-specific proof. |
| Typography | 8.2 | Codex readiness review | 2026-05-08 | Current `frontend/src/styles/tokens.css`, app component CSS, EN/NL resources | `[search]`, `[risk-card]`, `[prebid]`, `[compare]` | Type roles exist but metadata size, display tracking, tabular numbers, Dutch wrapping, label tracking, and line-height are not enforced consistently enough for source-heavy UI. |
| Color/surfaces | 8.2 | Codex readiness review | 2026-05-08 | Current Polar Frost CSS, static legal/landing pages, `docs/palette.md` | `[minimalist]`, `[legal]`, `[consent]`, `[landing]` | Surfaces need one restrained model across app and static pages; heavy shadows, large pills, decorative gradients, broken/missing assets, and card-in-card clutter need mechanical rejection. |
| Risk cards | 7.8 | Codex readiness review | 2026-05-08 | Current `RiskTile`, `RiskTilesGrid`, risk-card contract in AGENTS instructions | `[risk-card]` | Tiles do not yet mechanically prove visible score, severity, consequence, question, source, date or unknown-date label, confidence, limitation, and sunlight exclusion under mobile constraints. |
| Risk detail | 8.0 | Codex readiness review | 2026-05-08 | Current `RiskDetailView`, free viewer product contract | `[risk-detail]` | Detail must be free on-screen, focus-safe, readable at `320px`, and complete with comparison, directionality, questions, source/date/confidence/limitation, and unknown/unavailable states. |
| Prebid briefing/source coverage | 8.1 | Codex readiness review | 2026-05-08 | `docs/plans/2026-05-05-buurt-check-v5-prebid-evidence-implementation-plan.md`; current prebid components | `[prebid]` | Source coverage, top actions, recipients, method/version, review-pending states, limitation specificity, and source-quality percentage caps require deterministic tests and evidence rows. |
| Dossier narrative | 7.3 | Codex readiness review | 2026-05-08 | Current `App`, `DossierSheet`, dossier E2E baseline | `[dossier]` | Loaded dossier still needs a house-first, neighborhood-second, action-third reading flow, no large blank regions, clear loading/unavailable states, and no tooltip/action-bar occlusion. |
| 3D viewer | 7.6 | Codex readiness review | 2026-05-08 | Current `NeighborhoodViewer3D`, whole-app performance specs | `[viewer-3d]` | Viewer requires deterministic fixture ownership, nonblank pixel proof, target/context instrumentation, context-loss handling, mobile-class performance, and graceful fallback states. |
| Saved/compare | 7.4 | Codex readiness review | 2026-05-08 | Current `ShortlistScreen`, `CompareScreen`, saved/compare tests | `[saved]`, `[compare]` | Saved and compare surfaces still need decision-support framing, source-aware summaries, non-color difference cues, keyboard access, and tablet/desktop workbench proof. |
| Export/payment/share | 7.8 | Codex readiness review | 2026-05-08 | Current `ExportBottomSheet`, Stripe return E2E, backend export/payment tests | `[export]` | Export/payment/share requires paid Questions Pack copy, buyer-bound entitlement proof, checkout recovery, accessible progress/error/share states, and backend contract evidence. |
| Settings/legal/recovery | 8.1 | Codex readiness review | 2026-05-08 | Current `SettingsScreen`, app/static not-found, legal/consent pages | `[settings]`, `[legal]`, `[consent]`, `[recovery]` | Trust surfaces need document-quality layout, clear recovery paths, legal parity, consent fit, and static/app 404 proof. |
| Accessibility/interactions | 8.2 | Codex readiness review | 2026-05-08 | Current component accessibility tests and route-family E2E coverage | `[accessibility]` | Axe, keyboard, focus, zoom, forced-colors, reduced-motion, screen-reader, layering, and canvas fallback checks are not complete enough for final scoring. |
| Minimalist-ui fit | 7.9 | Codex readiness review | 2026-05-08 | Current app/static visual audit against minimalist-ui adaptation | `[minimalist]` | UI still risks generic SaaS panel stacking, large pills, heavy shadows, decorative excess, and inconsistent flat document surfaces. |
| Landing | 7.2 | Codex readiness review | 2026-05-08 | Current `landing/` and `frontend/public/` landing assets and E2E tests | `[landing]` | Landing needs source/mirror asset parity, light Polar Frost product framing, image loading proof, CTA/legal link proof, v5 Questions Pack copy, and responsive review. |

## Scorecard item: Design system foundation

| Field | Value |
|---|---|
| Current score | 8.4 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[minimalist],[accessibility]; artifact=docs/plans/2026-05-06-search-ui-9-5-design-plan.md plus current app CSS/token audit; blocker=Z-index focus shadow radius dark-mode forced-colors and reduced-motion contracts are not yet centralized or mechanically enforced across app and static surfaces. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; source-trust checks belong to risk and prebid evidence surfaces |
| Source-quality metrics | NOT_APPLICABLE; source-quality metrics belong to risk and prebid evidence rows |
| Product-contract evidence | NOT_APPLICABLE; product contract is covered by risk export and final gates |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Search mobile

| Field | Value |
|---|---|
| Current score | 8.6 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[search]; artifact=docs/plans/2026-05-06-search-ui-9-5-design-plan.md plus frontend/tests/e2e/search-ui-geometry.spec.ts baseline intent; blocker=Mobile search needs hard 320x700 390x844 430x932 Dutch overflow suggestion clearance and forced-colors gates before 9.5. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; search only previews source-bound value and does not render source evidence rows |
| Source-quality metrics | NOT_APPLICABLE; search route has no primary source-quality denominator |
| Product-contract evidence | NOT_APPLICABLE; product contract is covered by downstream risk prebid and export gates |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Search desktop/tablet

| Field | Value |
|---|---|
| Current score | 8.0 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[search]; artifact=docs/plans/2026-05-06-search-ui-9-5-design-plan.md plus desktop/tablet search composition review; blocker=Desktop and tablet search risk stretched mobile rhythm side-preview dead space and weak source-bound side content without viewport proof. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; search side preview is not a primary source evidence denominator |
| Source-quality metrics | NOT_APPLICABLE; search route has no primary source-quality denominator |
| Product-contract evidence | NOT_APPLICABLE; product contract is covered by downstream risk prebid and export gates |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Typography

| Field | Value |
|---|---|
| Current score | 8.2 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[search],[risk-card],[prebid],[compare]; artifact=frontend/src/styles/tokens.css app component CSS and EN/NL resources; blocker=Type roles exist but metadata size display tracking tabular numbers Dutch wrapping label tracking and line-height need stronger enforcement. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; typography supports source rendering but is not itself a source row |
| Source-quality metrics | NOT_APPLICABLE; source-quality metrics belong to risk and prebid evidence rows |
| Product-contract evidence | NOT_APPLICABLE; product contract is covered by risk export and final gates |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Color/surfaces

| Field | Value |
|---|---|
| Current score | 8.2 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[minimalist],[legal],[consent],[landing]; artifact=current Polar Frost CSS static legal landing pages and docs/palette.md; blocker=Surfaces need one restrained model across app and static pages without heavy shadows large pills decorative gradients broken assets or card-in-card clutter. |
| Target score | 9.5 |
| Owner role | Design reviewer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; surface system is not a source evidence denominator |
| Source-quality metrics | NOT_APPLICABLE; source-quality metrics belong to risk and prebid evidence rows |
| Product-contract evidence | NOT_APPLICABLE; product contract is covered by risk export and final gates |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Risk cards

| Field | Value |
|---|---|
| Current score | 7.8 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[risk-card]; artifact=current RiskTile RiskTilesGrid and AGENTS risk-card contract; blocker=Tiles need visible score severity consequence question source date or unknown-date label confidence limitation and sunlight exclusion under mobile constraints. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | BLOCKING_UNFILLED |
| Source-quality metrics | BLOCKING_UNFILLED |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | NOT_APPLICABLE; backend sunlight paid-only contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Risk detail

| Field | Value |
|---|---|
| Current score | 8.0 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[risk-detail]; artifact=current RiskDetailView and free viewer product contract; blocker=Detail must be free on-screen focus-safe readable at 320px and complete with comparison directionality questions source date confidence limitation and unknown states. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | BLOCKING_UNFILLED |
| Source-quality metrics | BLOCKING_UNFILLED |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Prebid briefing/source coverage

| Field | Value |
|---|---|
| Current score | 8.1 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[prebid]; artifact=docs/plans/2026-05-05-buurt-check-v5-prebid-evidence-implementation-plan.md plus current prebid components; blocker=Source coverage top actions recipients method version review-pending limitation specificity and source-quality percentage caps require deterministic tests and evidence. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | BLOCKING_UNFILLED |
| Source-quality metrics | BLOCKING_UNFILLED |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | BLOCKING_UNFILLED |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Dossier narrative

| Field | Value |
|---|---|
| Current score | 7.3 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[dossier]; artifact=current App DossierSheet and dossier E2E baseline; blocker=Loaded dossier needs house-first neighborhood-second action-third flow no large blank regions unavailable states and no tooltip or action-bar occlusion. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; dossier source rendering is covered by risk and prebid rows |
| Source-quality metrics | NOT_APPLICABLE; source-quality metrics belong to risk and prebid evidence rows |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: 3D viewer

| Field | Value |
|---|---|
| Current score | 7.6 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[viewer-3d]; artifact=current NeighborhoodViewer3D and whole-app performance specs; blocker=Viewer requires deterministic fixture ownership nonblank pixel proof instrumentation context-loss handling mobile-class performance and graceful fallback states. |
| Target score | 9.5 |
| Owner role | Performance reviewer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; viewer does not render primary source-quality rows |
| Source-quality metrics | NOT_APPLICABLE; viewer does not render primary source-quality rows |
| Product-contract evidence | NOT_APPLICABLE; viewer remains free and is covered by final product-contract review |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Saved/compare

| Field | Value |
|---|---|
| Current score | 7.4 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[saved],[compare]; artifact=current ShortlistScreen CompareScreen and saved compare tests; blocker=Saved and compare need decision-support framing source-aware summaries non-color difference cues keyboard access and tablet desktop workbench proof. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | BLOCKING_UNFILLED |
| Source-quality metrics | NOT_APPLICABLE; saved and compare reuse scored risk summaries and do not add to primary source-quality denominator |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Export/payment/share

| Field | Value |
|---|---|
| Current score | 7.8 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[export]; artifact=current ExportBottomSheet Stripe return E2E and backend export payment tests; blocker=Export payment share requires paid Questions Pack copy buyer-bound entitlement proof checkout recovery accessible progress error share states and backend contract evidence. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | BLOCKING_UNFILLED |
| Source-quality metrics | BLOCKING_UNFILLED |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | BLOCKING_UNFILLED |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Settings/legal/recovery

| Field | Value |
|---|---|
| Current score | 8.1 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[settings],[legal],[consent],[recovery]; artifact=current SettingsScreen app and static not-found legal and consent pages; blocker=Trust surfaces need document-quality layout clear recovery paths legal parity consent fit and static app 404 proof. |
| Target score | 9.5 |
| Owner role | Implementing engineer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; trust pages do not render primary source-quality rows |
| Source-quality metrics | NOT_APPLICABLE; trust pages do not render primary source-quality rows |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Accessibility/interactions

| Field | Value |
|---|---|
| Current score | 8.2 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[accessibility]; artifact=current component accessibility tests and route-family E2E coverage; blocker=Axe keyboard focus zoom forced-colors reduced-motion screen-reader layering and canvas fallback checks are not complete enough for final scoring. |
| Target score | 9.5 |
| Owner role | Accessibility reviewer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; accessibility checks are not source-quality rows |
| Source-quality metrics | NOT_APPLICABLE; source-quality metrics belong to risk and prebid evidence rows |
| Product-contract evidence | NOT_APPLICABLE; product contract is covered by route-family and final gates |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Minimalist-ui fit

| Field | Value |
|---|---|
| Current score | 7.9 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[minimalist]; artifact=current app and static visual audit against minimalist-ui adaptation; blocker=UI still risks generic SaaS panel stacking large pills heavy shadows decorative excess and inconsistent flat document surfaces. |
| Target score | 9.5 |
| Owner role | Design reviewer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | NOT_APPLICABLE; minimalist fit does not render source-quality rows |
| Source-quality metrics | NOT_APPLICABLE; source-quality metrics belong to risk and prebid evidence rows |
| Product-contract evidence | NOT_APPLICABLE; product contract is covered by route-family and final gates |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |

## Scorecard item: Landing

| Field | Value |
|---|---|
| Current score | 7.2 |
| Current score source | reviewer=Codex readiness review; date=2026-05-08; route_family=[landing]; artifact=current landing/ and frontend/public/ landing assets and E2E tests; blocker=Landing needs source mirror asset parity light Polar Frost product framing image loading proof CTA legal link proof v5 Questions Pack copy and responsive review. |
| Target score | 9.5 |
| Owner role | Design reviewer |
| Owner name | BLOCKING_UNFILLED |
| Automated evidence | BLOCKING_UNFILLED |
| Mechanical evidence | BLOCKING_UNFILLED |
| Screenshot evidence | BLOCKING_UNFILLED |
| Manual design review | BLOCKING_UNFILLED |
| Accessibility evidence | BLOCKING_UNFILLED |
| Source-trust evidence | BLOCKING_UNFILLED |
| Source-quality metrics | NOT_APPLICABLE; landing summarizes product sources but does not render primary source-quality rows |
| Product-contract evidence | BLOCKING_UNFILLED |
| Backend product-contract evidence | NOT_APPLICABLE; backend contract is covered by final export gate |
| Score cap check | BLOCKING_UNFILLED |
| Final score | BLOCKING_UNFILLED |
