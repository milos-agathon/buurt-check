# buurt-check.nl — Website Audit Follow-up Implementation Plan

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

**Date:** 2026-04-04
**Readiness revision:** 2026-04-07
**Implementation readiness:** 10/10
**Scope:** Post-audit follow-up for the marketing landing page at `https://buurt-check.nl/`
**Governing document:** `docs/plans/prd-website.md` (v2 Final, 2026-03-30)

## Assessment result

After repo and runtime verification on 2026-04-07, this plan is implementation-ready at **10/10** for its stated purpose: it is a delta plan, not a greenfield redesign plan. `C1` is **not** a readiness blocker in this revision because the founder confirmed in this working session that the identity already present in the repo is the approved source of truth for the current audit scope. `H3` is also no longer a readiness blocker because the exact fix is now explicit: the repo already contains the correct backend CORS implementation and the correct required production env contract, so the remaining work is a concrete deployment/configuration step plus post-deploy probe verification, documented below. The prior readiness gaps found during this audit have been closed in this revision:

- landing follow-up execution now has an explicit workspace/bootstrap preflight
- durable evidence storage now has one required checked-in destination instead of an optional PR-artifact fallback
- Task 8 now reflects the current 2026-04-07 production probe reality: live GET success alone is insufficient because browser CORS remains disallowed

## Readiness standard

This file is implementation-ready when every audit finding has one explicit state:

- `implement now`: exact files, commands, measurements, and acceptance criteria are defined.
- `closed no-op`: the finding was reviewed against the governing PRD/current code and no implementation is allowed or needed.
- `input gate`: engineering has an exact intake contract, but must not invent external business/legal/product values.
- `ticket-ready`: this file contains the exact follow-up ticket brief; implementation starts only after that ticket or PRD addendum is approved.

This is scored 10/10 for implementation readiness because every remaining issue now has an exact executable path. `C1` is resolved for readiness purposes because the current privacy-page identity text is now treated as the approved source of truth unless explicitly superseded later. `H3` is resolved for readiness purposes because the required production fix is now explicit and bounded: set the deployed backend `BUURT_CORS_ORIGINS` correctly, redeploy, and re-run the documented probes before inline-search UI work.

## Source-of-truth requirement

This file is under `docs/`, and the repo ignores new untracked docs via `.gitignore`. This plan has been intentionally force-added in the current workspace; before merge, keep it tracked and verify:

```bash
git add -f docs/plans/2026-04-04-website-premium-audit.md
git ls-files -- docs/plans/2026-04-04-website-premium-audit.md
```

The second command must print:

```text
docs/plans/2026-04-04-website-premium-audit.md
```

Any new follow-up document created from this plan under `docs/plans/` has the same rule: force-add it or record an external tracker ID in this file. A PR description, chat note, or unstaged ignored file is not a durable source of truth.

2026-04-07 verification, rerun during readiness audit:

- `git ls-files -- docs/plans/2026-04-04-website-premium-audit.md` prints this path.
- `git check-ignore --no-index -v docs/plans/2026-04-07-landing-inline-search-technical-design.md` matches `.gitignore:45:docs/`, so future docs under `docs/` still need `git add -f` unless an external tracker ID is recorded here.

## Status call

The March 30 website PRD is already implemented in the current repo state. This file is therefore **not** a greenfield landing-page plan. It is a **delta plan** for the follow-up work suggested by the April 4 audit.

That distinction matters:

- the landing structure, hierarchy, language toggle, FAQ behavior, analytics hooks, and legal-page bundling already exist
- only a small subset of the audit can be implemented under the current PRD without reopening scope
- several audit items are real concerns, but they are blocked by the PRD's copy lock, asset lock, or by the fact that they belong to the web app rather than the landing page

## Repo state checked before writing this plan

- `docs/plans/prd-website.md`
- `docs/plans/2026-03-30-website-implementation-status.md`
- `landing/index.html`
- `landing/privacy.html`
- `landing/terms.html`
- `frontend/tests/e2e/landing-page.spec.ts`
- `frontend/playwright.landing.config.ts`
- `scripts/measure-landing-lcp.mjs`
- `backend/README.md`
- `backend/app/api/address.py`
- `frontend/src/App.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/types/api.ts`
- `frontend/src/services/theme.ts`
- `backend/app/main.py`
- `backend/app/config.py`
- `backend/.env.example`
- `package.json`
- `.gitignore`

## Verified starting point

1. The landing PRD is marked complete in `docs/plans/2026-03-30-website-implementation-status.md`.
2. The mobile nav still defaults to a wrapped layout below `720px`. `--landing-nav-height: 132px` is present in `landing/index.html`, but the follow-up must treat that as a scroll-margin hint, not the acceptance metric; the issue is the rendered sticky-nav footprint and how much first-viewport hero space it consumes.
3. CTA labels are split across the same destination:
   - nav + hero: `Open de webapp`
   - pricing + final CTA: `Start in de webapp`
4. The footer exposes email plus `privacy.html` and `terms.html`. `landing/privacy.html` already contains the approved operator/publishing-name/address identity text for the current audit scope, per founder confirmation on 2026-04-07. Any follow-up consistency work must reuse that existing identity text unless it is explicitly superseded later.
5. The landing smoke suite already covers section order, CTA routing, language persistence, FAQ keyboard behavior, analytics events, legal-page availability, and axe.
6. This file is already tracked in the current index; future ignored docs from this plan still need force-add or an external tracker reference.

## Assumption verification log

| ID | Assumption | Verification | Result |
| --- | --- | --- | --- |
| A1 | PRD v2 is complete and copy/assets are locked | `docs/plans/prd-website.md` and `docs/plans/2026-03-30-website-implementation-status.md` | Verified: PRD says no changes to colors, font family, written copy, or images; status marks EP0-EP5 complete. |
| A2 | Mobile nav still wraps below `720px` | `landing/index.html` CSS | Verified: base `.nav__links` uses `flex-wrap: wrap`; no-wrap exists only inside `@media (min-width: 720px)`. |
| A3 | Rendered mobile nav problem is real, not just token drift | 2026-04-07 read-only Playwright probe at `390x844` against local `landing/index.html` | Verified current geometry: `nav_height_px=203`, `nav_bottom_px=203`, `visible_hero_real_estate_px=641`, `hero_cta_viewport_clearance_px=303`, `nav_height_token_value=132px`, `.nav__links` `flex-wrap=wrap`, `overflow-x=visible`. |
| A4 | Approved no-wrap scroller can meet the shrink target only with spacing tuning | 2026-04-07 read-only Playwright style override probe | Verified: applying the Task 2 CSS patch shape produced `nav_height_px=133`, `nav_bottom_px=133`, `visible_hero_real_estate_px=711`, `hero_cta_viewport_clearance_px=373`, `.nav__links` `flex-wrap=nowrap`, `overflow-x=auto`, `44px` language buttons, and `48px` app CTA. |
| A5 | CTA labels are intentionally split | PRD verified hero label `Open de webapp`; lower-page/final CTA label `Start in de webapp`; status document repeats the split | Verified. |
| A6 | `C1` is not an external intake blocker because the approved identity already exists in the repo | `landing/index.html`, `landing/privacy.html`, `landing/terms.html` plus founder confirmation in this working session on 2026-04-07 | Verified: `landing/privacy.html` already names `Milos Popovic`, `Milos GIS`, and postal address `Duinzicht 23 / 2235 BV Valkenburg / Netherlands`, and the founder confirmed that this identity is already the approved source of truth for the current audit scope. Any footer/terms consistency work can therefore reuse the existing identity text without a new intake gate. |
| A7 | Current "How it works" already has layout-only Step 3 emphasis | `.step--1`, `.step--2`, `.step--3` CSS and `.steps` Playwright grid assertion | Verified: Step 3 has stronger border/shadow and highlighted number; desktop is 3 columns, mobile is 1 column. |
| A8 | Inline search must use first-party backend proxy and app hash route | Backend `/api/address/suggest` and `/api/address/lookup`; app `buildHashRoute` uses `#/address/{encodeURIComponent(vboId)}?lookup=...`; backend README and `.env.example` document `BUURT_CORS_ORIGINS` with `https://buurt-check.nl` | Repo contract verified. Repeated 2026-04-07 probes were inconsistent on latency but consistent on the blocking issue: some suggest and diagnostic `OPTIONS` attempts timed out at `6500ms` and `15000ms`; later GET probes returned valid JSON for suggest and lookup using real suggestion ID `adr-c96efc5a0d655c17b76eaf809c9a92b1`, but the GET responses still omitted `Access-Control-Allow-Origin`. Diagnostic browser-style `OPTIONS` probes returned `400 Bad Request` with body `Disallowed CORS origin`. Task 8 is blocked until production CORS allow-origin behavior is fixed or the deployment contract is amended. |
| A14 | `H3` has an exact deployment fix path rather than an unknown architecture problem | `backend/app/main.py`, `backend/.env.example`, `backend/README.md`, plus 2026-04-07 production probes | Verified: the repo already applies `CORSMiddleware` using `settings.cors_origins`, and the documented required production env var already includes `https://buurt-check.nl`. The missing piece is deployed backend configuration parity. H3 can therefore be closed as a readiness blocker by documenting the exact deployment fix and the exact post-deploy probe contract. |
| A9 | `landing:perf:live` is evidence-only, not an enforcing gate | `scripts/measure-landing-lcp.mjs` logs `deltaMs` but does not exit non-zero on threshold breach | Verified; manual release evidence remains required. |
| A10 | Future repo-backed docs from this plan are ignored unless force-added | `git check-ignore --no-index -v docs/plans/2026-04-07-landing-inline-search-technical-design.md` | Verified: `.gitignore:45:docs/` applies to new untracked follow-up docs. |
| A11 | `dist-landing/` must be considered for landing changes | `git ls-files -- dist-landing/index.html landing/index.html` and root `package.json` | Verified: `dist-landing/index.html` and `landing/index.html` are tracked, and `npm run landing:build` exists. Landing runtime changes must keep generated output in sync unless a checked-in deployment decision says otherwise. |
| A12 | Landing follow-up commands are runnable only after frontend dependency preflight in this workspace | 2026-04-07 rerun: `npm run landing:test:e2e` initially failed because `frontend/node_modules/@playwright/test` was missing; after `npm --prefix frontend install`, the command passed | Verified: this plan now needs an explicit workspace bootstrap step before Task 1/2 execution. |
| A13 | The current landing verification path is healthy after bootstrap | 2026-04-07 rerun: `npm run landing:test:e2e` passed `18/18`; `npm run landing:perf:live` reported `delta +0ms` on both measured viewports; local mobile geometry probe reproduced `nav_height_px=203`, `nav_bottom_px=203`, `visible_hero_real_estate_px=641`, `hero_cta_viewport_clearance_px=303` | Verified. |

## Execution preflight

Run this once at the start of any implementation branch that will execute the landing verification commands:

```bash
npm --prefix frontend install
```

If Playwright later fails because browser binaries are missing, run:

```bash
npm --prefix frontend exec -- playwright install
```

If Task 1 or Task 2 is executed in a fresh workspace, do not treat a missing `@playwright/test` package or missing Playwright browser as a product issue. Bootstrap the workspace first, then rerun the landing verification commands.

## Execution rules

- Before Task 1, Task 2, or Task 13 runtime verification on a fresh workspace, complete the `Execution preflight` above.
- Treat this as a follow-up plan against the shipped landing, not as a restart of EP0-EP5 from the original website PRD.
- Do not change colors, font family, written copy, or image/SVG assets unless a task below explicitly says that a scope exception or PRD expansion is required first.
- Do not implement H1, H2, H3, H4, H6, or X1 directly from this file. Those items are ticket-ready and require a governing PRD amendment, follow-up ticket, or activation evidence first.
- Any landing-page code change in this follow-up branch must re-run:
  - `npm run landing:test:e2e`
  - `npm run landing:perf:live`
- Any branch that changes files under `landing/` must also run `npm run landing:build` before final diff review. Because `dist-landing/` is tracked in this repo today, keep `dist-landing/` in sync with `landing/` unless a separate checked-in deployment decision says the generated bundle is no longer committed.
- Treat `npm run landing:perf:live` as an evidence command, not an enforcing budget gate. Until `scripts/measure-landing-lcp.mjs` exits non-zero on regressions, "no material regression" means median LCP delta is `<= +50ms` on both measured viewports, or a larger delta is explicitly accepted with rationale in the merge PR or release evidence.
- Durable implementation evidence for this follow-up must be recorded in `docs/plans/2026-03-30-website-implementation-status.md`. PR artifacts or chat notes may duplicate that evidence, but they are not the required source of truth.
- For Tasks 7-12, "ticket" means either a checked-in follow-up document under `docs/plans/` or an external tracker ID recorded in this file. A chat note or PR description is not sufficient source of truth.
- For Task 8, apply the documented production deployment fix first, then re-test API availability and CORS before implementation starts. The repo contract is verified and the 2026-04-07 live API path was reachable, but browser CORS was still blocked for `Origin: https://buurt-check.nl`; do not start inline-search UI work until the production response includes allowed-origin behavior for suggest and lookup. A `200 OK` JSON response without `Access-Control-Allow-Origin` does not satisfy this gate.
- Before relying on this file as a checked-in decision log, confirm `git ls-files docs/plans/2026-04-04-website-premium-audit.md` returns this path. In the current repo, untracked `docs/` files are ignored; if this file or a new follow-up ticket under `docs/plans/` must be source of truth, force-add it intentionally or mirror the decision into an already tracked PRD/status document.

## Scope gates

### Implement now

- `L1` mobile nav height
- `C1` identity-consistency propagation, if desired

### Closed no-op

- `L2` CTA label inconsistency: split labels are intentional under the governing PRD.
- `H5` generic "How it works" presentation: the current layout already satisfies the PRD's layout-only step-emphasis rules.

### Ticket-ready, not current-branch implementation

- `H1` product visuals
- `H3` inline search
- `H4` pricing value anchoring
- `H6` urgency / pain-amplification messaging
- `H2` post-launch social-proof activation rule
- `X1` landing-to-app dark/light transition

## Backlog readiness lanes

### Ready now

- `L1` Task 1: capture rendered mobile-nav evidence.
- `L1` Task 2: reduce the rendered mobile-nav footprint after Task 1 has recorded the before-state baseline.
- `C1` Task 6: if desired, propagate the already-approved identity consistently across the landing bundle.
- Task 13: run and archive release evidence for any task that ships.

### Closed no-op

- `L2` Tasks 3-4: closed because the CTA-copy ruling is `keep split labels intentionally`.
- `H5` Task 10: closed because the current layout-only implementation already matches the PRD.

### Ticket-ready, not current-branch implementation

- `H1` Task 7: PRD amendment for product visuals.
- `H3` Task 8: inline-search technical design and scope expansion.
- `H4`/`H6` Task 9: copy-expansion experiment brief.
- `H2` Task 11: post-launch social-proof activation rule.
- `X1` Task 12: separate web-app transition ticket.

## Decision log

- `Tracking decision`: this file is already force-added in the current workspace. Keep it tracked; `git ls-files -- docs/plans/2026-04-04-website-premium-audit.md` must continue to print the path before merge.
- `CTA label ruling`: keep split labels intentionally. Nav + hero remain `Open de webapp`; pricing + final CTA remain `Start in de webapp`. Task 4 is closed no-op.
- `C1 ruling`: not a blocker. The founder confirmed on 2026-04-07 that the identity already present in `landing/privacy.html` is the approved source of truth for the current audit scope. If the landing bundle is updated for consistency, reuse that exact identity text unless it is explicitly superseded later.
- `L1 mobile nav pattern`: approved for Task 2. Below `720px`, keep the sticky nav visible, keep brand and language controls in the first row, and convert the anchor links plus app CTA into one horizontally scrollable no-wrap row. Do not introduce a hamburger/disclosure pattern in this branch.
- `L1 spacing ruling`: no-wrap alone is insufficient. Mobile-only shell/link spacing tuning is approved if `button[data-language-choice]` remains at least `44px` high and `.nav__cta` remains at least `44px` high.
- `H5 layout-only ruling`: closed no-op. Current `.steps` / `.step--3` implementation already applies layout-only payoff emphasis without copy changes.
- `H3 production endpoint ruling`: repo API and route contracts are verified, and production `app.buurt-check.nl` returned suggest/lookup data on 2026-04-07, but CORS was not approved for `https://buurt-check.nl` because GET responses omitted `Access-Control-Allow-Origin`. Diagnostic `OPTIONS` probes also returned `400 Bad Request`. Task 8 must include a fresh production CORS check and may not hardcode a fallback deployment origin without approval.
- `H3 deployment-fix ruling`: this is a deploy/config issue, not a repo architecture gap. The backend code already applies `CORSMiddleware` from `settings.cors_origins`, and `backend/.env.example` plus `backend/README.md` already specify `BUURT_CORS_ORIGINS=["https://app.buurt-check.nl","https://buurt-check.nl"]`. The required fix is to make the deployed backend match that contract, redeploy, and re-run the probes in Task 8.

## Task details

### Task 1. Capture rendered evidence for the mobile-nav issue before changing it

**What needs to be done**

Establish measured before-state evidence for the current mobile nav so the fix is based on rendered behavior, not on the `--landing-nav-height` CSS variable.

**How**

- Use the existing landing Playwright setup at the current mobile viewport (`390x844` from `frontend/playwright.landing.config.ts`).
- Record the geometry with a reproducible Playwright `page.evaluate` snippet against these selectors:
  - `.nav`
  - `.hero__title`
  - `.hero__cta`
  - `.nav__links a`
- Emit these exact JSON fields so Task 2 can reuse the same measurement shape:
  - `viewport_height_px`
  - `nav_height_px`: the rendered nav height at load
  - `nav_bottom_px`: the bottom edge of the sticky nav at load
  - `visible_hero_real_estate_px`: viewport height minus `nav_bottom_px`
  - `hero_h1_top_px`
  - `hero_h1_bottom_px`
  - `hero_cta_top_px`
  - `hero_cta_bottom_px`
  - `hero_cta_viewport_clearance_px`: viewport height minus hero CTA bottom
  - `nav_link_rects`: text plus top/bottom/left/right for each visible nav link
  - `nav_height_token_value`: the current `--landing-nav-height` token value, recorded for debugging only
  - a full-page or above-the-fold screenshot at initial load
- Record the JSON evidence in `docs/plans/2026-03-30-website-implementation-status.md` under a dedicated `Landing follow-up evidence` subsection. PR artifacts may duplicate that evidence, but they are optional and are not the durable record.
- If a durable screenshot is added, store it under `docs/assets/landing-nav-evidence/` with a filename containing the measurement date and `before`, and force-add it because `docs/` is ignored for new files.
- If the geometry probe is added as Playwright coverage, put the helper below the existing rectangle/grid helpers in `frontend/tests/e2e/landing-page.spec.ts`, and run the focused check first with:

```bash
npm run landing:test:e2e -- --project=mobile --grep "mobile sticky-nav"
```

Then run the full release checks listed in Task 13 before merge.
- Non-binding readiness reference from 2026-04-07 on the `390x844` mobile viewport: `nav_height_px=203`, `nav_bottom_px=203`, `visible_hero_real_estate_px=641`, `hero_cta_viewport_clearance_px=303`, `.nav__links` `flex-wrap=wrap`, `.nav__links` `overflow-x=visible`, and `nav_height_token_value=132px`. Re-measure in Task 1 before implementing Task 2 if the landing has changed.
- Use this reusable helper shape if adding the measurement to `frontend/tests/e2e/landing-page.spec.ts`:

```ts
async function readLandingGeometry(page: Page) {
  return page.evaluate(() => {
    const rectFor = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
    };

    const nav = rectFor('.nav');
    const h1 = rectFor('.hero__title');
    const cta = rectFor('.hero__cta');

    return {
      viewport_height_px: window.innerHeight,
      nav_height_px: nav?.height ?? null,
      nav_bottom_px: nav?.bottom ?? null,
      visible_hero_real_estate_px: nav ? window.innerHeight - nav.bottom : null,
      hero_h1_top_px: h1?.top ?? null,
      hero_h1_bottom_px: h1?.bottom ?? null,
      hero_cta_top_px: cta?.top ?? null,
      hero_cta_bottom_px: cta?.bottom ?? null,
      hero_cta_viewport_clearance_px: cta ? window.innerHeight - cta.bottom : null,
      nav_link_rects: Array.from(document.querySelectorAll('.nav__links a')).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      }),
      nav_height_token_value: getComputedStyle(document.documentElement)
        .getPropertyValue('--landing-nav-height')
        .trim(),
    };
  });
}
```

**Definition of success**

- The team has explicit before-state evidence for the mobile view, not just an inference from CSS.
- The before-state evidence includes concrete rendered geometry for `nav_height_px`, `visible_hero_real_estate_px`, and hero CTA viewport clearance on `390x844`.
- The decision on how far the nav must shrink is tied to the measured `visible_hero_real_estate_px` baseline, not to a generic benchmark claim or CSS-token value.

### Task 2. Reduce the persistent mobile-nav footprint without violating the current PRD

**What needs to be done**

Shrink the rendered mobile nav below `720px` so first-viewport hero real estate improves at page load.

**How**

- For the runtime fix, update only landing-page structure/composition in `landing/index.html`; do not touch backend code, the React app, pricing, analytics event names, legal pages, or copy in this task.
- For verification and release sync, update only the directly affected landing smoke coverage in `frontend/tests/e2e/landing-page.spec.ts` and the generated `dist-landing/index.html` output produced by `npm run landing:build`.
- Use the Task 1 rendered measurements as the before-state baseline. Do not use `--landing-nav-height` or any nominal CSS height token as pass/fail evidence.
- Implement the approved mobile pattern from the Decision log:
  - below `720px`, keep `.nav__top` as the brand/language row
  - make `.nav__links` a single no-wrap horizontal scroller
  - keep `How it works`, `Pricing`, `FAQ`, and the app CTA in that scroller
  - do not hide nav items behind a hamburger, details element, popover, modal, or disclosure in this branch
- Keep all currently required nav capabilities:
  - brand link
  - language toggle
  - anchor navigation
  - app CTA
- Use mobile spacing changes only as needed after the no-wrap scroller. Do not reduce language buttons or link touch targets below `44px`.
- Preserve keyboard reachability and minimum touch-target size.
- If the DOM structure changes, update the existing Playwright nav assertions instead of weakening them.
- The expected CSS patch shape is:

```css
.nav__shell {
  display: grid;
  gap: 8px;
  padding: 10px 0 12px;
}

.nav__links {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 0;
  scrollbar-width: none;
}

.nav__links::-webkit-scrollbar {
  display: none;
}
```

- Keep the existing desktop/tablet `@media (min-width: 720px)` overrides unless implementation proves they are redundant.
- Keep the app CTA inside `.nav__links`; do not move it into `.nav__top`, because Task 1/2 measurements and keyboard-order expectations are scoped to the current two-row nav structure.
- After the fix is measured, update the base `--landing-nav-height` value to the rounded-up post-fix mobile rendered height plus a small safety allowance only if needed for anchor scroll-margin accuracy. Do not use that token as the pass/fail metric.
- Add or extend Playwright coverage so the mobile project asserts:
  - `nav_bottom_px <= before_nav_bottom_px - 64`
  - `hero_cta_viewport_clearance_px >= before_hero_cta_viewport_clearance_px`
  - `.nav__links` is `flex-wrap: nowrap`
  - `.nav__links` has `overflow-x: auto` or `scroll`
  - both language buttons and `.nav__cta` are at least `44px` high
- If using the 2026-04-07 readiness baseline instead of a fresh Task 1 artifact, add the constants in the test with a comment that they must be updated whenever Task 1 is remeasured. Use this exact assertion shape:

```ts
test('reduces the mobile sticky-nav footprint without shrinking touch targets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile nav geometry is only asserted on the mobile project');
  await page.goto('/');

  const before = {
    nav_bottom_px: 203,
    hero_cta_viewport_clearance_px: 303,
  };
  const after = await readLandingGeometry(page);

  if (after.nav_bottom_px === null || after.hero_cta_viewport_clearance_px === null) {
    throw new Error('Landing geometry probe did not find the nav or hero CTA');
  }

  expect(after.nav_bottom_px).toBeLessThanOrEqual(before.nav_bottom_px - 64);
  expect(after.hero_cta_viewport_clearance_px).toBeGreaterThanOrEqual(
    before.hero_cta_viewport_clearance_px,
  );

  const navLinksStyle = await page.locator('.nav__links').evaluate((node) => {
    const style = getComputedStyle(node);
    return { flexWrap: style.flexWrap, overflowX: style.overflowX };
  });
  expect(navLinksStyle.flexWrap).toBe('nowrap');
  expect(['auto', 'scroll']).toContain(navLinksStyle.overflowX);

  const languageButtonHeights = await page.locator('button[data-language-choice]').evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
  );
  expect(languageButtonHeights.every((height) => height >= 44)).toBe(true);
  expect(await getElementHeight(page, '.nav__cta')).toBeGreaterThanOrEqual(44);
});
```

**Definition of success**

- On the mobile Playwright viewport (`390x844`), the Task 1 JSON measurement shape reports at least `64px` more `visible_hero_real_estate_px` than the before-state baseline. Using the 2026-04-07 readiness reference, that means `nav_bottom_px <= 139`; if Task 1 remeasures a different baseline, use the remeasured baseline instead.
- The hero CTA bottom position and viewport clearance are no worse than the Task 1 baseline. CTA visibility by itself does not satisfy this task, because the CTA was already visible before the fix.
- The branch includes either a Playwright assertion or archived JSON output proving the before/after geometry with the fields listed in Task 1.
- Sticky behavior still works and introduces no layout shift regression.
- `npm run landing:test:e2e` passes.
- `npm run landing:perf:live` shows no material regression against the current deployed page under the Execution rules threshold.
- `npm run landing:build` has been run and `dist-landing/` is in sync, or a checked-in deployment decision explains why `dist-landing/` is intentionally not updated.

### Task 3. Close the CTA-label scope ambiguity before touching copy

**State: closed no-op.**

**What needs to be done**

Resolve whether label unification is allowed as a consistency fix or forbidden as a copy change under PRD §2.1. This has now been resolved: label unification is forbidden under the current PRD.

**How**

- Review the current label split in `landing/index.html`:
  - nav + hero: `Open de webapp`
  - pricing + final CTA: `Start in de webapp`
- Product ruling: `keep split labels intentionally`.
- No code change is allowed from this task.
- Any future unification requires an explicit amendment to `docs/plans/prd-website.md` before touching `landing/index.html`.

**Definition of success**

- Engineering is no longer blocked by interpretation.
- `docs/plans/2026-04-04-website-premium-audit.md` has one explicit checked-in CTA-label ruling instead of an implicit assumption.
- Task 4 remains closed no-op unless the governing PRD is amended later.

### Task 4. Preserve CTA labels

**State: closed no-op.**

**What needs to be done**

Do not remove the label split. Task 3 ruled that the split is intentional.

**How**

- Do not edit `landing/index.html`.
- Do not update Playwright assertions for CTA text.
- Preserve all hrefs, `data-cta-placement` hooks, button variants, analytics event names, and visible labels.

**Definition of success**

- No code change.
- CTA routing remains unchanged.
- `landing_cta_click` analytics still distinguishes placements by `data-cta-placement`.

### Task 5. Record the founder ruling that the existing repo identity is already approved

**State: closed no-op.**

**What needs to be done**

Record the ruling that `C1` is not a blocker because the identity already present in the repo is approved for the current audit scope.

**How**

- Treat the current `landing/privacy.html` identity text as the source of truth for this follow-up unless it is explicitly superseded later:
  - `Milos Popovic`
  - `Milos GIS`
  - `Duinzicht 23`
  - `2235 BV Valkenburg`
  - `Netherlands`
- Record that founder confirmation in this file's `Decision log`, which this revision now does.
- Do not open a new intake gate for KvK, BTW, or phone data as part of this audit plan. If those identifiers are ever required later, that is a separate legal/product decision, not a hidden readiness dependency for this plan.

**Definition of success**

- `C1` is explicitly documented as **not** being a readiness blocker.
- Engineers are instructed to reuse the existing repo identity text rather than waiting for a new intake package.

### Task 6. If desired, add the existing approved identity consistently across the landing bundle

**State: implement now.**

**What needs to be done**

Publish the existing approved identity information in the landing footer and the bundled legal pages so the site discloses the same business identity everywhere.

**How**

- Update:
  - `landing/index.html`
  - `landing/privacy.html`
  - `landing/terms.html`
- Keep the current footer link structure intact.
- Reuse only the identity text already approved in `landing/privacy.html` for this scope:
  - `Milos Popovic`
  - `Milos GIS`
  - `Duinzicht 23`
  - `2235 BV Valkenburg`
  - `Netherlands`
- Do not invent trust claims, counters, or extra marketing language while implementing the disclosure.
- Do not introduce new KvK, BTW, or phone fields in this task unless they already exist in the approved source text or a later explicit decision supersedes this ruling.
- Extend Playwright assertions so the landing bundle checks the new disclosure once it is real.
- In `landing/index.html`, add one compact footer identity block inside `.footer__wrap`, preserving `.footer__links` and existing contact/legal links.
- In `landing/privacy.html`, update the existing `Who we are` section if needed; do not add a second contradictory identity section.
- In `landing/terms.html`, add a matching legal-page identity section or compact footer area without marketing claims.
- Add Playwright assertions for:
  - `Milos Popovic` appears where intended on landing and legal pages
  - `Milos GIS` appears where intended on landing and legal pages
  - the postal address appears where intended on landing and legal pages
  - approved email link still works
- Run `npm run landing:test:e2e`, `npm run landing:perf:live`, and `npm run landing:build`.

**Definition of success**

- The landing footer and both legal pages expose the existing approved identity fields consistently.
- Existing contact email and legal links still work.
- Mobile and desktop footer layouts remain intact.
- Landing smoke coverage passes after the change.

### Task 7. Prepare a PRD amendment for product-visual demonstration before any visual-work implementation

**State: ticket-ready, not current-branch implementation.**

**What needs to be done**

Turn `H1` into an actionable scope-expansion brief instead of leaving it as a general CRO complaint.

**How**

- Split `H1` into five explicit asset deliverables grouped into three workstreams:
  - hero product visual
  - Tier 1 differentiator visual support for the three primary differentiator cards
  - OG image replacement
- Write the amendment as either:
  - a new `docs/plans/2026-04-07-website-product-visuals-prd-addendum.md`, or
  - a clearly labeled addendum section in `docs/plans/prd-website.md`
- For each deliverable, define:
  - the exact asset to be produced
  - source of truth file path
  - owner
  - whether the asset is a screenshot, mockup, rendered composite, or another approved format
- Amend the governing PRD to unlock image/SVG changes before implementation work starts.
- Use this exact deliverable table in the addendum:

| Deliverable | Proposed source-of-truth file | Asset type | Owner | Integration target |
| --- | --- | --- | --- | --- |
| Hero product visual | `landing/assets/product-hero-dossier-preview.webp` plus optional source under `docs/assets/website-product-visuals/` | Rendered composite or product screenshot with sensitive data removed | Founder/Designer approves; frontend implementer integrates | Hero visual area in `landing/index.html` |
| Tier 1 3D visual support | `landing/assets/product-visual-3d-buurtmodel.webp` | Product screenshot/rendered composite | Founder/Designer approves; frontend implementer integrates | Primary differentiator card for `3D Buurtmodel` |
| Tier 1 sunlight visual support | `landing/assets/product-visual-zonlichtanalyse.webp` | Product screenshot/rendered composite | Founder/Designer approves; frontend implementer integrates | Primary differentiator card for `Zonlichtanalyse` |
| Tier 1 checklist visual support | `landing/assets/product-visual-bezichtigingschecklist.webp` | Product screenshot/rendered composite | Founder/Designer approves; frontend implementer integrates | Primary differentiator card for `Bezichtigingschecklist` |
| OG image replacement | `landing/og-image.png` and, if source changes, `landing/og-image.svg` | Open Graph image | Founder/Designer approves; frontend implementer integrates | Metadata image references |

- The addendum must define privacy/anonymization requirements, image dimensions, file format, compression target, and alt-text strategy.
- `landing/assets/` does not exist in the current repo. If the addendum keeps the proposed `landing/assets/...` paths, the implementation ticket must explicitly create that directory and include the new assets in `npm run landing:build` output.
- The addendum must either approve or replace these default asset constraints before implementation starts:
  - hero product visual: same visible aspect ratio as the current hero image (`1024x500` source ratio), WebP for runtime, target `<= 220KB`, no visible personal data or exact private address
  - differentiator support visuals: same aspect ratio within the three-card set, WebP for runtime, target `<= 160KB` each, no visible personal data or exact private address
  - OG replacement: preserve the existing metadata reference path `landing/og-image.png` unless the PRD addendum explicitly approves a metadata-path migration; if source SVG is replaced, keep `landing/og-image.svg` as the editable source
  - alt text: one NL/EN-neutral product description per inserted image, not a marketing claim, and no duplicated adjacent text
- If the addendum is a new docs file, force-add it because `docs/` is ignored.

**Definition of success**

- A PRD addendum exists that explicitly permits asset changes.
- The team knows exactly which files will change and what new assets must be produced.
- No one is still treating this as an in-scope layout tweak.

### Task 8. Prepare an inline-search implementation ticket against the real web-app routing contract

**State: ticket-ready, not current-branch implementation.**

**What needs to be done**

Translate `H3` into a technical design that matches the current app architecture rather than the invalid `#/search?lookup=` assumption from the original audit.

**Chosen integration boundary**

The landing page must call the existing buurt-check backend address proxy. It must not call PDOK Locatieserver directly from the static landing page.

**How**

- Use the app's existing first-party API proxy contract:
  - `GET https://app.buurt-check.nl/api/address/suggest?q={query}&limit=7`
  - `GET https://app.buurt-check.nl/api/address/lookup?id={suggestion.id}`
- Apply this deployment fix before any inline-search UI implementation work:
  - confirm the deployed backend service for `app.buurt-check.nl` is running the current CORS code path from `backend/app/main.py`
  - set the production backend env var exactly to:

```bash
BUURT_CORS_ORIGINS=["https://app.buurt-check.nl","https://buurt-check.nl"]
```

  - redeploy the backend service
  - rerun the exact probes below from this document
  - record the successful post-deploy probe results in `docs/plans/2026-03-30-website-implementation-status.md` or the checked-in inline-search technical-design ticket
- Confirm production API availability and CORS before approval:
  - repo config must still include `https://buurt-check.nl` in `BUURT_CORS_ORIGINS`, matching `backend/README.md` and `backend/.env.example`
  - a fresh browser-equivalent request from origin `https://buurt-check.nl` to `https://app.buurt-check.nl/api/address/suggest?q=Damrak&limit=1` must return a response within the ticket's timeout budget with `Access-Control-Allow-Origin: https://buurt-check.nl`; `Access-Control-Allow-Origin: *` is acceptable only if the approved landing implementation still uses `credentials: 'omit'` and no buyer/session cookies
  - repeat the CORS/header check for `/api/address/lookup` with a real suggestion ID from the suggest response; do not use fake IDs as proof of the success path
  - if the production proxy still times out or lacks the CORS header, close Task 8 as blocked or amend the API deployment contract before UI work
- Use these exact read-only probes for the production check, replacing `<suggestion.id>` only with an ID returned by the suggest probe:

```bash
curl.exe --max-time 6.5 -i -H "Origin: https://buurt-check.nl" "https://app.buurt-check.nl/api/address/suggest?q=Damrak&limit=1"
curl.exe --max-time 8 -i -H "Origin: https://buurt-check.nl" "https://app.buurt-check.nl/api/address/lookup?id=<suggestion.id>"
curl.exe --max-time 6.5 -i -X OPTIONS -H "Origin: https://buurt-check.nl" -H "Access-Control-Request-Method: GET" "https://app.buurt-check.nl/api/address/suggest?q=Damrak&limit=1"
curl.exe --max-time 8 -i -X OPTIONS -H "Origin: https://buurt-check.nl" -H "Access-Control-Request-Method: GET" "https://app.buurt-check.nl/api/address/lookup?id=<suggestion.id>"
```

The suggest GET probe must finish within `6500ms`, and the lookup GET probe must finish within `8000ms`, matching the future landing timeout budgets. A `curl` timeout, missing allowed-origin behavior on the GET response, invalid JSON body, or lookup proof using a fake ID blocks the ticket. The `OPTIONS` probes are diagnostic for the approved no-custom-header GET implementation; if the future ticket adds any non-simple request headers or methods, matching successful `OPTIONS` behavior becomes a blocking requirement too.
- Latest readiness-audit result on 2026-04-07: repeated production probes were inconsistent on latency but consistent on the root issue. During this audit, some suggest and diagnostic `OPTIONS` attempts timed out at `6500ms` and `15000ms` from this environment; later GET probes returned valid JSON for both suggest and lookup, and lookup used real suggestion ID `adr-c96efc5a0d655c17b76eaf809c9a92b1`. The GET responses included `Access-Control-Allow-Credentials: true` but still omitted `Access-Control-Allow-Origin`, which means browser CORS is still blocked for `https://buurt-check.nl`. Diagnostic browser-style `OPTIONS` probes returned `400 Bad Request` with body `Disallowed CORS origin` for both suggest and lookup. The required fix is the deployment/configuration step above. After redeploy, rerun the probes and proceed only once `Access-Control-Allow-Origin` is present for the landing origin.
- Do not treat `Access-Control-Allow-Credentials: true` by itself as success. Without `Access-Control-Allow-Origin`, the landing page still cannot use these endpoints from the browser.
- Do not call the Render fallback host (`https://buurt-check.onrender.com`) directly from the static landing page unless a PRD amendment explicitly changes the chosen integration boundary.
- If repo-backed, write the ticket to `docs/plans/2026-04-07-landing-inline-search-technical-design.md` and force-add it.
- Implementation files after approval: `landing/index.html`, `frontend/tests/e2e/landing-page.spec.ts`, and `dist-landing/` after build.
- Use `credentials: 'omit'` for landing-origin fetches because suggest/lookup do not require buyer cookies.
- Account for the backend contract before UI work:
  - `/api/address/suggest` requires at least two query characters
  - `/api/address/suggest` is rate-limited, so the landing search must debounce input by `300ms`
  - stale suggest and lookup requests must be cancelled with `AbortController`
  - repeated identical normalized queries must be deduplicated while in flight
  - HTTP `429`, `4xx`, `5xx`, CORS failure, invalid JSON, and network timeout must resolve to the documented unavailable/retry states, not uncaught errors
  - suggest requests must time out at `6500ms`
  - lookup requests must time out at `8000ms`
- On selection, read `ResolvedAddress.adresseerbaar_object_id` as `vboId` and keep the selected suggestion `id` as `lookupId`.
- Navigate to `https://app.buurt-check.nl/#/address/{encodeURIComponent(vboId)}?lookup={encodeURIComponent(lookupId)}`.
- Hand off into the app after address selection; do not build dossier loading, payment, or result rendering on the landing page.
- Document failure states:
  - fewer than two query characters: no request
  - suggest request fails: show unavailable state and keep CTA fallback to `https://app.buurt-check.nl/#/search`
  - suggest request returns HTTP `429`: show a temporary unavailable/rate-limit state and keep CTA fallback
  - lookup returns no `adresseerbaar_object_id`: show unavailable state and keep CTA fallback
  - lookup/network timeout: show retry affordance and keep CTA fallback
- Document latency expectations before implementation:
  - suggestions should appear within one debounce interval plus backend response time
  - lookup handoff should either navigate or show retry/unavailable state within an explicit timeout chosen in the ticket
  - slow responses keep the typed query visible
  - only the inline-search submit/selection affordance is disabled during its own lookup request
  - the existing CTA fallback to `https://app.buurt-check.nl/#/search` remains available at all times
- Document analytics impact and smoke-test coverage for:
  - suggest success
  - suggest unavailable/fallback
  - lookup success and deep-link navigation
  - lookup missing `adresseerbaar_object_id`
  - cancellation of stale requests
- Use these event names:
  - `landing_search_suggest_success`
  - `landing_search_suggest_unavailable`
  - `landing_search_lookup_success`
  - `landing_search_lookup_unavailable`
  - `landing_search_deeplink_click`
- Complexity estimate: medium, about 1.5-2.5 implementation days after PRD approval.

**Definition of success**

- The deployed backend service has been updated to use `BUURT_CORS_ORIGINS=["https://app.buurt-check.nl","https://buurt-check.nl"]`, redeployed, and verified by the probes above.
- There is a written technical design or follow-up ticket with the exact backend-proxy API sequence, debounce/cancellation/rate-limit behavior, and deep-link contract above.
- Complexity is estimated before UI work starts.
- The false assumption that `#/search?lookup=` exists is fully removed from future planning.

### Task 9. Create a copy-expansion experiment brief for pricing anchoring and urgency messaging

**State: ticket-ready, not current-branch implementation.**

**What needs to be done**

Convert `H4` and `H6` from vague CRO ideas into a bounded experiment brief.

**How**

- Write a separate PRD addendum covering:
  - exact candidate copy variants
  - exact placement rules
  - measurement plan
  - rollback criteria
- Use `docs/plans/2026-04-07-website-copy-experiment-brief.md` unless an external tracker ID is recorded in this file. If repo-backed, force-add it.
- Keep this work out of the current landing branch because both findings require new copy and the existing PRD forbids it.
- Use these exact candidate variants in the brief:

| Variant | Placement | NL copy | EN copy |
| --- | --- | --- | --- |
| Control | Existing page | No copy change | No copy change |
| A - pricing value | Under pricing support text | `Eenmalig per adres. Gebruik het dossier voordat je een bod overweegt.` | `One time per address. Use the dossier before you consider an offer.` |
| B - urgency/action | Final CTA support line | `Check geluid, zonlicht, klimaat en buurtcontext voordat je beslist.` | `Check noise, sunlight, climate, and neighborhood context before you decide.` |
| C - conservative | Pricing card note or final CTA, not both | `Binnen seconden een dossier voor je bezichtiging.` | `A viewing dossier in seconds.` |

- Placement rules:
  - test one variant at a time
  - do not place urgency copy above the H1
  - do not add fear-based claims, guarantees, fake scarcity, countdowns, or fabricated outcomes
  - do not change CTA hrefs, analytics event names, price, or product entitlement copy
- Measurement plan:
  - primary metric: `landing_cta_click` rate by placement
  - secondary metrics: pricing section reach, final CTA reach, FAQ interaction rate, bounce rate
  - minimum evaluation window: 14 days or 1,000 landing sessions, whichever comes later
  - segment by language (`nl`/`en`) and viewport class (`mobile`/`desktop`)
- Instrumentation prerequisite:
  - current landing section-view instrumentation covers `#pricing` and `#faq`, but `#final-cta` does not currently have `data-track-section-view`.
  - if final CTA reach remains a secondary metric, the experiment implementation must add `data-track-section-view` to `#final-cta` and extend `frontend/tests/e2e/landing-page.spec.ts` to expect `landing_section_view` for `final-cta`.
  - if the approved experiment brief does not instrument final CTA reach, it must remove that metric or replace it with an already-measurable analytics-platform metric before implementation starts.
  - bounce rate must come from the analytics platform or approved reporting layer; do not add ad hoc client-side bounce tracking in `landing/index.html` unless the experiment brief explicitly defines the event, threshold, and privacy treatment.
- Rollback criteria:
  - roll back if CTA click-through decreases by `>= 10%` relative to control after the minimum window
  - roll back immediately if support/contact feedback says the copy is misleading
  - roll back immediately if the change introduces serious/critical axe violations or median LCP delta above `+50ms`

**Definition of success**

- The team has an approved copy experiment brief with exact proposed text and measurement rules.
- No new copy is added to `landing/index.html` before that brief is approved.

### Task 10. Resolve whether "How it works" has any layout-only follow-up inside the current copy lock

**State: closed no-op.**

**What needs to be done**

Decide whether `H5` can be improved with composition only, or whether it is effectively blocked by content constraints. This is resolved: no layout-only implementation task is justified.

**How**

- Review the current `steps` block in `landing/index.html` against the PRD's existing step-emphasis rules.
- Limit the review to changes that do not introduce new text.
- Outcome recorded in the `H5 layout-only ruling` entry in the Decision log: closed no-op.
- Current `landing/index.html` already implements the PRD's layout-only requirements:
  - mobile `.steps` is a single-column stack
  - desktop `.steps` becomes three columns
  - `.step--1` has lower opacity
  - `.step--2` has medium opacity
  - `.step--3` has stronger border/shadow and highlighted number
  - Playwright already asserts `.steps` column count by viewport
- Do not create `docs/plans/2026-04-07-website-how-it-works-layout-follow-up.md` unless the PRD copy/asset scope is expanded later.

**Definition of success**

- `H5` ends in one explicit state: `closed no-op; content/asset changes require scope expansion`.
- It no longer sits in the backlog as an ambiguous generic complaint.

### Task 11. Define the post-launch activation rule for social proof instead of forcing a fake pre-launch solution

**State: ticket-ready, not current-branch implementation.**

**What needs to be done**

Keep `H2` out of the implementation branch now, but define when it becomes actionable later.

**How**

- Create a backlog note or PRD addendum specifying acceptable real proof sources, for example:
  - verified user quote
  - real addresses-analyzed counter
  - press/community mention
  - app-store rating
- Use `docs/plans/2026-04-07-landing-social-proof-activation.md` unless an external tracker ID is recorded in this file. If repo-backed, force-add it.
- Require a verifiable source for any future trust element.
- Explicitly prohibit placeholder testimonials, invented counters, or padded claims.
- Activation rule: do not add social proof before at least one verifiable source exists.
- Evidence requirements:
  - store source URL, screenshot, export, or approval record
  - record date captured and owner
  - define refresh/removal rule if the proof becomes stale
- Implementation files after activation:
  - `landing/index.html`
  - `frontend/tests/e2e/landing-page.spec.ts`
  - `dist-landing/` after build

**Definition of success**

- The team has a clear activation rule for future social-proof work.
- No fabricated proof ships pre-launch.

### Task 12. Move the dark-to-light arrival issue into a separate web-app ticket

**State: ticket-ready, not current-branch landing implementation.**

**What needs to be done**

Remove `X1` from the landing follow-up stream and scope it correctly as a web-app concern.

**How**

- Open a separate ticket referencing the landing-to-app transition and `frontend/src/services/theme.ts`.
- Use `docs/plans/2026-04-07-app-theme-arrival-ticket.md` unless an external tracker ID is recorded in this file. If repo-backed, force-add it.
- Evaluate app-side options there, not in the landing PRD branch.
- Keep this follow-up plan focused on marketing-site changes only.
- Evaluate exactly these options:
  - Option A: leave app theme behavior unchanged and accept the product boundary.
  - Option B: add a landing CTA query/hash hint such as `?theme=dark` only after the app has an explicit, tested contract for honoring it.
  - Option C: adjust app first-paint theme initialization to reduce flash without changing user preference semantics.
- Constraints:
  - do not override a user's stored theme preference without explicit product approval
  - respect `prefers-reduced-motion` and existing `theme-transitioning` behavior
  - avoid query params that conflict with checkout return params (`report`, `session_id`, `buyer_resume`) or address lookup params (`lookup`)
- Acceptance:
  - app-side tests cover stored preference, system preference, optional landing hint if implemented, and reduced-motion behavior
  - no regression to `data-theme` application in `frontend/src/services/theme.ts`
  - landing CTA hrefs remain stable unless a separate PRD/app routing contract approves a new param

**Definition of success**

- `X1` has its own scoped web-app task.
- It is no longer treated as an actionable landing-page defect under the current PRD.

### Task 13. Close every landed change with regression and release evidence

**What needs to be done**

Apply the same verification standard used by the original website PRD work to every follow-up change that actually ships.

**How**

- For each implemented task above:
  - update `frontend/tests/e2e/landing-page.spec.ts` where behavior genuinely changed
  - run `npm run landing:test:e2e`
  - run `npm run landing:perf:live`
  - run `npm run landing:build` for any `landing/` change
  - include the `dist-landing/` diff when tracked generated landing files changed, unless a checked-in deployment decision says not to
  - archive the result in `docs/plans/2026-03-30-website-implementation-status.md`; the merge PR may duplicate that evidence, but does not replace the checked-in record
- For branches that only create or update follow-up docs and do not change runtime code, run:
  - `git diff --check -- docs/plans/2026-04-04-website-premium-audit.md`
  - `git diff --cached --check -- docs/plans/2026-04-04-website-premium-audit.md` when the doc is staged
- Do not delete or weaken coverage to make the branch pass.
- If `npm run landing:perf:live` reports a median LCP delta above `+50ms` on either viewport, do not merge until the regression is fixed or the larger delta is explicitly accepted with rationale in the release evidence.

**Definition of success**

- Every merged landing change ships with passing landing smoke coverage.
- No new serious or critical axe violations are introduced.
- Performance evidence exists for the actual candidate versus the live snapshot.
- `dist-landing/` is synchronized with `landing/` for release branches while generated landing output remains tracked.

## Safe execution order

### Current landing follow-up branch

1. Confirm this file remains tracked with `git ls-files -- docs/plans/2026-04-04-website-premium-audit.md`.
2. Task 1
3. Task 2
4. Task 13 for the Task 2 branch

### Identity-consistency branch

1. Task 6
2. Task 13 for any identity-consistency branch that ships

### Separate follow-up ticket creation

1. Task 7
2. Task 8
3. Task 9
4. Task 11
5. Task 12

### Closed no-op items

1. Task 3
2. Task 4
3. Task 5
4. Task 10

## Final directive

Do not reopen the entire website PRD because of this audit.

The current repo already contains the March 30 redesign. The correct next step is to execute only the narrow follow-up work that is actually justified, and to force explicit scope decisions before touching anything blocked by copy lock or new product/asset work.
