# Buurt-Check.nl Landing Redesign Status

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

Date: March 30, 2026
Scope: current workspace state for the landing-page redesign tracked by `docs/plans/prd-website.md`

This file is intentionally separate from the PRD so the PRD can stay normative.

Important:

* this status reflects the current workspace, not necessarily committed `HEAD`
* check `git status` before treating any item here as landed in the repository history
* local loopback performance numbers in this file remain regression hints only
* the live-snapshot comparison below is the release-grade performance evidence for the static landing page in this workspace

## 1. Epic status

| Epic | Status | Completion evidence |
| ---- | ------ | ------------------- |
| EP0 | **Complete** | Repo baseline is documented in the PRD, `launch-with-60-day-evaluation-deferral` is recorded, `scripts/serve-landing.mjs` exists, and root scripts `landing:serve`, `landing:test:e2e`, `landing:perf:local`, `landing:perf:live`, and `landing:check` are live |
| EP1 | **Complete** | `landing/index.html` exposes `hero`, `differentiators`, `how-it-works`, `pricing`, `trust`, `features`, `faq`, and `final-cta` in the DOM order required by the PRD, splits Tier 1 vs Tier 2 features, adds the dedicated final CTA, and now ships the legal pages from `landing/` itself so `/privacy.html` and `/terms.html` resolve without depending on `frontend/public` |
| EP2 | **Complete** | Hero, differentiators, pricing, trust, supporting features, and final CTA match the required hierarchy and responsive composition in code; landing smoke coverage now checks key mobile/desktop layout transitions and hierarchy ratios without claiming full visual acceptance automation |
| EP3 | **Complete** | Sticky nav, a focusable skip link to `#main-content`, persistent NL/EN controller, active `lang` reflection, fallback-safe language swaps, language-aware pricing format, smooth-scroll anchor navigation with reduced-motion fallback, 44px language-toggle targets, radio-style keyboard support, and the single-open keyboard-accessible FAQ accordion are implemented in vanilla JS |
| EP4 | **Complete** | Landing instrumentation covers nav clicks, all CTA placements, pricing/FAQ section views, FAQ toggles, and manual language switches; the static bundle now bootstraps Google Analytics 4 when `BUURTCHECK_GA_MEASUREMENT_ID` is configured, while preserving the 60-day fallback path until a live measurement ID is deployed |
| EP5 | **Complete** | Dedicated Playwright smoke coverage now passes locally on mobile and desktop, keyboard/accessibility smoke checks include the skip link and axe, CI includes a landing smoke job, and the live-snapshot-versus-candidate LCP comparison required by §13.1 is now archived below |

## 2. Local verification commands

* `npm run landing:test:e2e` — runs the landing Playwright suite on mobile and desktop projects
* `npm run landing:perf:local` — reproduces the local `HEAD` versus working-tree LCP proxy comparison
* `npm run landing:perf:live` — fetches the current deployed landing page into a temporary local baseline and compares it against the current workspace under equivalent local conditions
* `npm run landing:check` — runs the landing smoke suite and the local LCP proxy comparison back-to-back

## 3. Performance evidence

### 3.1 Local performance proxy evidence

Command:

* `npm run landing:perf:local`

Method:

* baseline page from `HEAD:landing/index.html` on `http://127.0.0.1:4175/`
* refactored page from the working tree on `http://127.0.0.1:4174/`
* 3 headless Chromium runs per scenario
* `1500ms` settle window after `load`

Latest local run:

| Scenario | Baseline median LCP | Refactor median LCP | Delta | Interpretation |
| -------- | ------------------- | ------------------- | ----- | -------------- |
| Mobile 390×844 | `68ms` | `68ms` | `+0ms` | No material local regression |
| Desktop 1440×900 | `72ms` | `72ms` | `+0ms` | No material local regression |

Notes:

* this is a reproducible local proxy, not release-grade proof
* the exact millisecond values can vary slightly run to run; rerun `npm run landing:perf:local` for the current snapshot
* it compares `HEAD` versus the working tree on loopback servers
* it exists to catch local regressions quickly; it is not the release gate by itself

### 3.2 Live-snapshot versus candidate evidence

Command:

* `npm run landing:perf:live`

Method:

* baseline page fetched from the current deployed landing at `https://buurt-check.nl/`, then materialized into a temporary local baseline workspace
* baseline and candidate both served locally on loopback (`http://127.0.0.1:4175/` and `http://127.0.0.1:4174/`) to keep network conditions equivalent
* because the landing remains static HTML/CSS/JS in `landing/`, the locally served working tree is the release-candidate artifact for this scope
* 3 headless Chromium runs per scenario
* `1500ms` settle window after `load`

Latest live-snapshot run:

| Scenario | Live snapshot median LCP | Candidate median LCP | Delta | Interpretation |
| -------- | ------------------------ | -------------------- | ----- | -------------- |
| Mobile 390×844 | `68ms` | `68ms` | `+0ms` | No material regression versus current live page |
| Desktop 1440×900 | `80ms` | `96ms` | `+16ms` | No material regression versus current live page |

Notes:

* this satisfies the PRD requirement to compare the current live landing content against the candidate under equivalent served conditions
* the current workspace shows `+0ms` mobile delta and `+16ms` desktop delta, both within the `<= +50ms` no-material-regression guardrail used by the follow-up plan
* rerun `npm run landing:perf:live` if the landing changes again before deployment so the archived comparison matches the actual release candidate

### 3.3 Landing follow-up evidence

Date: April 7, 2026
Source plan: `docs/plans/2026-04-04-website-premium-audit.md`

Implemented items:

* `L1` Task 1 and Task 2: measured mobile sticky-nav baseline, applied the approved no-wrap scroller pattern below `720px`, and remeasured the rendered geometry after the fix
* `C1` Task 6: added the approved operator identity to the landing footer and terms page while reusing the privacy-page identity text already approved in scope
* Tasks 7, 8, 9, 11, and 12: created checked-in follow-up ticket docs under `docs/plans/`

Evidence artifacts:

* `docs/assets/landing-nav-evidence/2026-04-07-before-mobile-nav.json`
* `docs/assets/landing-nav-evidence/2026-04-07-before-mobile-nav.png`
* `docs/assets/landing-nav-evidence/2026-04-07-after-mobile-nav.json`
* `docs/assets/landing-nav-evidence/2026-04-07-after-mobile-nav.png`

Task 1 before-state geometry at `390x844`:

```json
{
  "viewport_height_px": 844,
  "nav_height_px": 203,
  "nav_bottom_px": 203,
  "visible_hero_real_estate_px": 641,
  "hero_h1_top_px": 239,
  "hero_h1_bottom_px": 312,
  "hero_cta_top_px": 493,
  "hero_cta_bottom_px": 541,
  "hero_cta_viewport_clearance_px": 303,
  "nav_height_token_value": "132px"
}
```

Task 2 after-state geometry at `390x844`:

```json
{
  "viewport_height_px": 844,
  "nav_height_px": 131,
  "nav_bottom_px": 131,
  "visible_hero_real_estate_px": 713,
  "hero_h1_top_px": 167,
  "hero_h1_bottom_px": 240,
  "hero_cta_top_px": 421,
  "hero_cta_bottom_px": 469,
  "hero_cta_viewport_clearance_px": 375,
  "nav_height_token_value": "136px"
}
```

Measured deltas:

* mobile sticky-nav bottom edge reduced by `72px` (`203 -> 131`)
* first-viewport hero real estate increased by `72px` (`641 -> 713`)
* hero CTA viewport clearance improved by `72px` (`303 -> 375`)

Verification run for the landed follow-up:

* `npm run landing:test:e2e` -> `21 passed, 1 skipped` (`desktop` skip is intentional for the mobile-only nav geometry assertion)
* `npm run landing:perf:live` -> mobile `+0ms`, desktop `+16ms`
* `npm run landing:build` -> regenerated tracked `dist-landing/`

### 3.4 Landing refresh implementation evidence

Date: April 7, 2026
Source plan: `docs/plans/2026-04-07-landing-refresh-implementation-spec.md`

Implemented items:

* replaced the text-only header brand with the approved Buurt Check reverse lockup and copied that runtime asset into `landing/logos/`
* moved the primary app CTA into the fixed first header row on mobile while keeping `How it works`, `Pricing`, and `FAQ` in the secondary no-wrap row
* compressed the mobile hero so the dossier preview is visible on first load at the `390x844` reference viewport
* exported curated dossier crops from `buurt-check-full-dossier-0537010000024119.pdf` into landing-owned WebP assets and inserted a new `#showcase` section immediately before `#pricing`
* updated Playwright coverage for the real logo, first-load mobile geometry, showcase ordering, showcase assets, and synchronized `dist-landing/`

Landing-owned runtime assets:

* `landing/logos/buurt-check-lockup-horizontal-reverse.svg`
* `landing/images/showcase-executive-summary.webp`
* `landing/images/showcase-risk-details.webp`
* `landing/images/showcase-sunlight.webp`
* `landing/images/showcase-viewing-checklist.webp`
* `landing/images/showcase-neighborhood.webp`

Reference mobile geometry after the refresh at `390x844`:

```json
{
  "viewport_width_px": 390,
  "viewport_height_px": 844,
  "nav_height_px": 125,
  "nav_bottom_px": 125,
  "nav_cta_left_px": 236,
  "nav_cta_right_px": 370,
  "nav_cta_top_px": 11,
  "nav_cta_bottom_px": 55,
  "logo_bottom_px": 42,
  "hero_preview_top_px": 511,
  "hero_preview_bottom_px": 693,
  "hero_preview_visible_height_px": 182
}
```

Acceptance readout:

* the primary nav CTA is fully inside the initial `390px` viewport width (`236 -> 370`)
* the header logo is visible on first load
* `.hero__preview` is visible on first load with `182px` visible height, exceeding the recommended `96px` threshold
* the new `#showcase` section now appears immediately before `#pricing`

Verification run for the landing refresh:

* `npm run landing:test:e2e` -> `23 passed, 1 skipped`
* `npm run landing:perf:live` -> mobile `68ms -> 68ms` (`+0ms`), desktop `76ms -> 84ms` (`+8ms`)
* `npm run landing:build` -> regenerated tracked `dist-landing/` with runtime showcase assets only
* `cd frontend && npm run build` -> passed
* `cd frontend && npm run test` -> `102` files passed, `986` tests passed
* `cd backend && ruff check .` -> passed
* `cd backend && pytest -x -q -m "not live and not visual and not benchmark"` -> `1080 passed, 4 skipped, 17 deselected`
* `cd backend && pytest -x -q -m "visual"` -> `4 skipped`
* `cd backend && pytest -x -q -m "benchmark"` -> `2 passed`

## 4. Release checklist

* Hero CTA label remains **“Open de webapp”** and still routes to `https://app.buurt-check.nl/#/search`
* Sticky-nav CTA, pricing CTA, and final CTA all route to `https://app.buurt-check.nl/#/search`
* Lower-page CTA label remains **“Start in de webapp”** in pricing and is reused in the dedicated final CTA block
* Footer contains `Contact`, `/privacy.html`, and `/terms.html`; the legal pages plus supporting `legal.css` and required logo assets now exist inside `landing/` itself, so a landing-only deploy resolves them correctly
* The landing footer now publishes the approved operator identity: `Milos Popovic`, `Milos GIS`, `Duinzicht 23`, `2235 BV Valkenburg`, `Netherlands`
* `landing/terms.html` now exposes the same approved operator identity already used by `landing/privacy.html`
* Landing section order matches the PRD and all required stable IDs are present
* The landing section order now includes `#showcase` immediately before `#pricing`
* The sticky header now uses the real Buurt Check lockup instead of the text-only brand
* On mobile, the primary app CTA now lives in the first non-scrollable header row while the secondary anchors remain in the second row
* The hero preview is partially visible on first load at the `390x844` reference viewport
* The landing bundle now includes curated dossier showcase assets exported from the real premium dossier PDF
* A skip link appears before the sticky nav, targets `#main-content`, and moves focus into main content on keyboard activation
* NL/EN switching persists through `localStorage.buurtcheck_lang`, updates active markup language, does not reload the page, and swaps the price display between `€3,99` and `€3.99`
* FAQ item count remains exactly `4`; all items are collapsed by default; only one item opens at a time; Enter, Space, Up, Down, Home, and End keyboard behavior is verified
* The mobile sticky nav now keeps logo, language controls, and the app CTA in the first row and moves only `How it works`, `Pricing`, and `FAQ` into the secondary no-wrap row below `720px`
* Anchor navigation now uses smooth scrolling by default and falls back to `auto` when `prefers-reduced-motion: reduce` is active
* Landing analytics wrapper is live; the static bundle can bootstrap Google Analytics 4 with consent-mode defaults, advertising storage denied, and IP anonymization enabled when `BUURTCHECK_GA_MEASUREMENT_ID` is set in deployment config
* The landing-bundled privacy policy now discloses marketing-site GA4 analytics alongside the existing payment and public-data processors
* `npm run landing:test:e2e` passes locally across mobile and desktop projects (`23 passed, 1 skipped` on the current workspace)
* `npm run landing:perf:live` shows no material LCP regression versus the current deployed landing page (`+0ms` mobile, `+8ms` desktop), so EP5 remains closed for the current landing scope

## 5. Post-launch monitoring

* If `BUURTCHECK_GA_MEASUREMENT_ID` is configured before release, verify staging receives `landing_cta_click`, `landing_nav_click`, `landing_section_view`, `landing_faq_toggle`, and `landing_language_toggle` in Google Analytics 4 with the payload contract from the PRD
* If no live measurement ID is configured before release, treat the first 30 days post-launch as baseline collection and evaluate success at day 60 per §3.2 of the PRD
* Review hero CTA click-through, pricing reach, FAQ interaction rate, bounce rate, and language-toggle usage against the PRD success criteria
