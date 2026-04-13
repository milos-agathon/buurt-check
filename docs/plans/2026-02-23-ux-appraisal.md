# Buurt Check — Critical UX Appraisal

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

**Date:** 2026-02-23
**Method:** Live app inspection (Puppeteer screenshots at 375x812, both themes) + component code review + UI/UX Pro Max guideline audit + three Codex adversarial reviews
**Verified against:** HEAD of `main` branch, 2026-02-23

Each finding is marked: **CONFIRMED**, **PARTIALLY VALID**, **REFUTED**, or **STALE** based on code verification.

---

## What's Working Well

**Strong foundations that many apps get wrong:**
- Proper design token system (195 CSS custom properties) with consistent light/dark mode
- 44px touch targets enforced on action buttons
- `aria-live="polite"` on loading status, `role="listbox"` on search — solid a11y primitives
- Skip link for keyboard users
- Debounced search with AbortController (no stale request bugs)
- Graceful degradation — failed data sources show "unavailable" badges, not crashes
- Three-phase dossier structure (House / Buurt / Action) with clear visual dividers
- OLED-true dark mode (#000000 bg) — battery-conscious
- **Risk detail view is the crown jewel** — Score + plain-language meaning + comparison context + actionable viewing questions. If every section hit this quality bar, the app would be a 9/10
- **Bilingual execution is structural, not bolted on** — NL/EN toggle works, labels flip, viewing questions localize, i18n keys properly translated across 380+ keys per language
- **Dark nav bar that doesn't flip** between themes — a sophisticated touch most apps get wrong

---

## Critical Issues (P0 — Fix These First)

### 1. Raw English severity badge on Dutch UI — **CONFIRMED**
In `PropertyWarningsCard.tsx:73`, `{foundation_risk.level}` renders the raw backend string directly into the badge — no `t()` call, no mapping to canonical vocabulary. Values are lowercase (`"high"`, `"medium"`, `"low"`) not uppercase as originally reported. A `SeverityBadge` component with proper i18n (`t('severity.${severity}')`) exists and is used elsewhere but was missed here. The `severityClass()` function (lines 14-19) correctly maps levels to CSS classes but the text label is still raw English.

### 2. Dossier context bleeds into search screen — **PARTIALLY VALID**
The finding overstates the problem. There IS a dedicated `LoadingScreen` with animated SVG during fetch, and there IS a sticky scroll nav (`dossier-scroll-nav`) that appears below the search bar showing address + current phase + back-to-top button. However: the search bar remains `position: sticky` at top (z-index 39) and search + dossier render together in the same conditional block (`activeScreen === 'search' || activeScreen === 'dossier'`). The search bar and "RECENT" label don't collapse when a dossier loads. The dossier does NOT just "appear below" — there's a loading transition — but the search context visually persists. **The core issue is valid: no clear screen boundary between search and dossier.**

### 3. Attention summary has no dismiss/collapse affordance — **CONFIRMED**
Component at `AttentionSummary.tsx` renders flags with no close button, no toggle state, no collapse mechanism. Note: the flag labels DO use proper i18n — `t('warnings.attention.flag.${f.category}', f.label)` with NL translations ("Geluidrisico", "Funderingsrisico", etc.). The English strings in the code are fallbacks only.

### NEW-P0: Primary nav semantics are contradictory — **CONFIRMED**
Both Home and Briefing tabs route to `activeScreen='dossier'` when a dossier is loaded (App.tsx:589-611, identical logic). `handleAddressSelect()` at line 883 forces `setActiveTab('briefing')` on every new address (not `'home'` as originally reported). The Briefing tab is disabled when no dossier exists (TabBar.tsx:27), suggesting the intent was Home=search, Briefing=dossier — and the force-to-briefing is correct for that model. But the Home tab also routes to dossier when one exists, creating two paths to the same screen. Not a functional bug, but a design smell that weakens IA clarity.

### NEW-P0: Risk tiles and RiskCardsPanel show same data twice — **CONFIRMED**
`App.tsx` renders both `<RiskTilesGrid>` and `<RiskCardsPanel>` simultaneously, unconditionally, in the same scroll. Both receive the same `riskCards` prop. The tiles show score + severity in a compact 2x2 grid; directly below, RiskCardsPanel repeats each category as a full article with badge + meaning paragraph + metric + viewing question + source. Tapping a tile opens `RiskDetailView` as an additional overlay — it does NOT replace either section. The user sees: tile (score 50, "Matig") → card ("Wegverkeersgeluid — HOOG RISICO" with paragraph) → detail overlay (comparison bars). Three presentations of the same data. The PRD's "briefing not dashboard" principle is violated here.

### ~~NEW-P0: Shortlist reopen is a no-op~~ — **REFUTED** (2026-02-24 verification)
~~Save-to-localStorage works correctly but `onSelectAddress` is wired as `() => {}`.~~ **Incorrect.** `handleSelectShortlistAddress` (App.tsx:1144-1170) is fully implemented: prefers stored `lookupId` for fast reopens, falls back to `suggestAddresses()` for legacy items, shows user-friendly error toast on failure. Wired correctly to `ShortlistScreen` at App.tsx:1921 via `onSelectAddress={handleSelectShortlistAddress}`. The save-and-return loop works. This finding was stale — the fix landed in a prior session.

### 4. Data coverage banner language — **PARTIALLY VALID** (downgraded from P0 to P2)
The original finding claimed "developer-facing language." This is **incorrect** — the banner IS fully i18n'd with proper NL translations: "9/10 databronnen geladen", "1 bron mislukt: Zonlichtanalyse. Gebruik Opnieuw proberen in de betreffende sectie." The translations are consumer-grade Dutch, not developer jargon. However, the **information density** criticism is valid — showing source counts, freshness ranges, stale counts, and failure lists all at once is a lot for a consumer product. The retry instruction ("Gebruik Opnieuw proberen") requires finding the right section. Moved to P2.

---

## High-Severity Issues (P1)

### 5. No loading skeleton for initial dossier render — **PARTIALLY CONFIRMED** (2026-02-24 verification)
`LoadingScreen` with animated building SVG renders during initial fetch. `RiskTileSkeleton` IS used in App.tsx (line 1688) for risk card loading. However, `DossierSkeleton` and `SkeletonCard` are dead code — never imported in App.tsx or any other component. Individual dossier sections beyond risk tiles lack skeleton loading states.

### 6. Search suggestions keyboard focus in dark theme — **NEEDS VISUAL VERIFICATION**
CSS uses `var(--color-surface-hover)` for `.address-search__item--active` which should resolve correctly in dark theme. Cannot confirm visual contrast without runtime testing.

### 7. Viewing checklist items are not persisted — **CONFIRMED**
State lives in `App.tsx:601` as `useState<Set<string>>(new Set())`. Pure in-memory, no localStorage. Reset explicitly in `startDossierLoad()` (line 1048) when loading a new address. Tests contain no persistence assertions. **PRD violation:** `design-prd.md` SC-4.3.4c requires "Checkbox state persists within the session and across app backgrounding." `design-spec.md` SC-6d adds "checked questions remain checked when navigating back and re-entering." Neither is implemented.

### 8. Home screen empty state is underwhelming — **CONFIRMED with nuance**
The home screen has 3 value propositions with custom SVG icons (sun/shield/clipboard) in accent color, styled with `--color-text-secondary`. These are NOT "bare bullet points in a void" — they have visual treatment. However: (a) No illustration or emotional hook, (b) No example address to try, (c) Features not benefits ("3D-zonlichtanalyse" vs "Will my apartment get enough light?"), (d) Only shows when no recent searches exist. The loading screen (animated building SVG, staggered segments) has more personality. **Codex review nailed this: reframe from technical capabilities to human anxieties.**

### 9. Fixed action bar + fixed tab bar = double-bar stacking — **CONFIRMED**
ActionBar: `position: fixed`, **48px** (not 64px as originally reported), z-index **41** (not 45), positioned via `bottom: calc(var(--tab-bar-height, 56px) + env(safe-area-inset-bottom))`. TabBar: `position: fixed`, 56px, z-index 50, `bottom: 0`. Total: **104px** + safe-area inset (~138px on notched iPhones). On a 667px SE screen, that's 16-21% of viewport permanently consumed. **PRD conflict:** `design-prd.md` SC-4.3.5a says ActionBar should appear on scroll-to-checklist; `design-spec.md` SC-13e says always-visible. Current implementation follows the spec, not the PRD.

### NEW-P1: Touch targets below 44px minimum in 3 components — **CONFIRMED**
Settings button (`TopBar.css`): 36px (8px shortfall, shrinks to 34px at 360px breakpoint). Summary pills (`SummaryStrip.css`): 34px (10px shortfall). ~~Shortlist remove button (`ShortlistScreen.css`): 32px (12px shortfall).~~ **Correction:** Shortlist remove button is `44px × 44px` (ShortlistScreen.css:141-142) — passes the minimum. Language toggle buttons appear 32px but with `padding: 6px 8px` the effective target reaches exactly 44px — Codex miscalculated that one. Apple HIG 44px minimum is documented as a project convention but violated in **2 components** (not 3).

### NEW-P1: Hardcoded English across aria-labels and timestamps — **CONFIRMED**
**Four** locations with hardcoded English strings that break bilingual a11y (not six as originally reported):
- `AddressSearch.tsx:12-21`: `formatRelativeTime` returns `"just now"`, `"3m ago"` etc. (i18n keys `search.recentTime.*` exist but aren't used)
- `TopBar.tsx:40`: `aria-label="Language"` (hardcoded on radiogroup)
- `TopBar.tsx:61`: `aria-label="Settings"` (hardcoded)
- `AddressHeader.tsx:49`: `aria-label="Add/Remove from shortlist"` (hardcoded)
- ~~`RiskDetailView.tsx:83`: `aria-label="Back"`~~ **Correction:** Uses `aria-label={t('common.back')}` — properly i18n'd
- ~~`LivabilityDetailView.tsx:53`: `aria-label="Back"`~~ **Correction:** Uses `aria-label={t('common.back')}` — properly i18n'd
Additionally, `TopBar.tsx:29` has hardcoded `aria-label="Buurt Check home"` on the logo link. Screen reader users hear English labels on TopBar and shortlist controls regardless of language setting.

### NEW-P1: 3D fetch fires eagerly, not lazily — **CONFIRMED**
`App.tsx:1322-1402`: 3DBAG neighborhood fetch fires during Phase 3 of dossier load (~15s after address selection), with no IntersectionObserver or viewport gating. The 3D viewer section sits 8th in dossier order — users must scroll past 7 property-level sections to reach it. 3DBAG cold latency is 62-77s. The eager fetch is likely intentional (sunlight analysis depends on 3D data), but on mobile it consumes bandwidth before the section is visible. Could defer until neighborhood phase divider enters viewport.

---

## Medium Issues (P2)

### 10. Inconsistent card visual language — **CONFIRMED**
Five distinct card formats verified in code. Additionally (from Codex review): crime stats (raw tabular numbers) get no severity interpretation while noise (65 dB) gets a full comparison chart. The severity system (score + badge + color + icon) is well-defined in tokens but inconsistently deployed across card types.

### 11. Comparison bars lack legend AND color differentiation — **PARTIALLY CONFIRMED** (2026-02-24 correction)
**Correction:** The `CompareScreen` parallel coordinates chart (`ParallelCoordinates.tsx:125-138`) DOES have a legend with color swatches and address labels. The finding remains CONFIRMED for `RiskDetailView` and `LivabilityDetailView` comparison bars, which use the same `var(--color-accent)` color with only `opacity: 0.7` differentiating reference bars. Neither has a persistent legend or directionality indicators ("higher = better"). **Two separate systems:** CompareScreen (has legend, needs directionality) vs detail view bars (lacks both legend and differentiation).

### 12. Shadow snapshots lack tap-to-expand — **PARTIALLY VALID** (corrected)
Original finding said "approximately 90x90px" and "unlabeled." **Corrections:** Snapshots are responsive (not fixed 90px) — `100%` width flex columns with `aspect-ratio: 4/3`. They DO have labels (`<span className="shadow-snapshots__label">` with translated time strings via `LABEL_KEYS`). However: no tap-to-expand, no lightbox modal, no `onClick` handler. At mobile widths (~100px per thumbnail), the 3D content is still difficult to distinguish.

### ~~13. Time slider is unwired dead code~~ — **REFUTED** (2026-02-24 verification)
~~`ShadowTimeSlider` was identified as orphaned dead code.~~ **Incorrect.** `ShadowTimeSlider` IS imported in `App.tsx` (line 8) and rendered at line 1826 with full props (`lat`, `lng`, `onChange`). The memory note about it being "orphaned" is stale — it was wired in a subsequent session. The component is active production code.

### 14. Viewing questions are duplicated across two locations — **CONFIRMED**
Same questions appear in: (a) `RiskDetailView` modal (teal background section, per-category), and (b) `ViewingChecklist` bottom section (persistent cards, all moderate+ categories). Both use the same `checkedQuestions` Set from `App.tsx`, so checked state syncs correctly. But users either miss the in-card questions (inside a modal they must open) or find the checklist and wonder why the same questions appear twice. The duplication is by design (two UX paths) but undocumented and confusing.

### 15. Risk tile scroll-to-section — **STALE** (already implemented)
`App.tsx:924-931` has `scrollToDossierTarget()` using `scrollIntoView({ behavior: 'smooth', block: 'start' })` with window.scrollTo fallback. Tests verify this behavior. Finding appears to be from before implementation.

### (moved) Data coverage banner is information-dense — **PARTIALLY VALID** (was P0 #4)
Banner is properly i18n'd (not developer-facing as claimed). But showing source counts, freshness ranges, stale counts, and failure names simultaneously is dense for a consumer product. The retry instruction could be more prominent.

### NEW: No entrance animations on dossier cards — **CONFIRMED**
Zero dossier card components import Framer Motion for entrance. `SPRING_REVEAL` IS used, but only on 3 loading-transition wrappers (AttentionSummary, DossierSkeleton, RiskTileSkeleton at App.tsx:1005-1062) — not on actual dossier card content. `RiskDetailView` has shared layout animation (tile → detail). `RiskTile` and `TabBar` use `whileTap={{ scale: 0.97 }}` press feedback. `SPRING_TAB` is defined but unused. **PRD violation:** `design-prd.md` animation table specifies "Dossier section reveal: staggered fade-in, 80ms delay between sections, 200ms per section." Not implemented.

### NEW: Export briefing button has no loading state — **CONFIRMED** (promoted from P3)
`ActionBar.tsx` shows no `disabled`, no loading spinner, no visual feedback during PDF generation. The button remains clickable, risking double-taps. For an async operation that takes 1-3 seconds, this needs a loading state. Promoted from P3 because PDF generation is a primary user action.

### NEW-P2: DossierSheet grab handle is misleading — **CONFIRMED**
`DossierSheet.tsx:18-20` renders a visible `.dossier-sheet__handle` with `.dossier-sheet__handle-pill` child. CSS sets `cursor: grab` (line 20) with hover feedback (opacity 0.8, width expansion to 48px). But: `onSnapChange` is declared as a prop (line 7), destructured (line 11), and **never called** in the component body. Zero gesture handlers: no `onMouseDown`, `onTouchStart`, `onPointerDown`. The handle looks draggable but does nothing.

### ~~NEW-P2: Summary pills don't scroll to sections~~ — **PARTIALLY REFUTED** (2026-02-24 verification)
~~`SummaryStrip.tsx:41` fires `onPillTap` which opens a `RiskDetailView` overlay.~~ **Correction:** Summary pills are wired to `handleSummaryPillTap` (App.tsx:691-694), which calls `scrollToDossierTarget(`section-risk-${category}`)` + `highlightRiskTile(category)` — a scroll + visual pulse, NOT a detail overlay open. This **matches PRD SC-4.3.1c** for scroll behavior. However, the `--color-accent-light` background pulse on the target section is not implemented (only the tile highlight). Downgraded: pills correctly scroll and highlight, missing only the section background pulse.

### NEW-P2: Shortlist cards are non-semantic clickable divs — **PARTIALLY REFUTED** (2026-02-24 verification)
~~`ShortlistScreen.tsx:78` uses `<div onClick>` without `role="button"`, `tabIndex`, or keyboard handlers.~~ **Correction:** ShortlistScreen.tsx:44-56 uses `<div onClick>` WITH `role="button"`, `tabIndex={0}`, AND `onKeyDown` handler (Enter/Space support). Cards ARE keyboard-navigable. The remaining issue is non-idiomatic: a `<button>` element would be semantically cleaner than a `<div role="button">`, but the current implementation passes WCAG. Downgraded to P3 polish.

---

## Low Issues (P3 — Polish)

### 16. Language toggle aria-label — **REFUTED** (remove)
~~The pill toggle has no `aria-label`.~~ **Incorrect.** `TopBar.tsx:39` has `role="radiogroup" aria-label="Language"` on the language toggle container. Individual buttons use `role="radio"` with `aria-checked`. This is properly accessible.

### 17. Theme toggle icon is cryptic — **REFUTED** (reframe)
~~Sun/moon icon with no aria-label.~~ **Incorrect.** There is no sun/moon theme toggle in the TopBar. The TopBar contains: logo, language toggle (NL/EN), and settings button (gear icon with `aria-label="Settings"`). Theme switching appears to be inside the settings screen, not a standalone icon.

### 18. Recent search timestamps are in English — **CONFIRMED**
`formatRelativeTime` in `AddressSearch.tsx:12-21` returns hardcoded English: `"just now"`, `"3m ago"`, `"yesterday"`, `"3d ago"`. No `t()` call. These display as English strings even when the UI is in Dutch.

### 19. Crime stats raw numbers lack context — **CONFIRMED** (not directly verified but consistent with card audit)
Unlike risk cards which have comparison bars and severity badges, crime stats present raw numbers without interpretation framework.

---

## Aesthetic Critique (from Codex review)

### Typography weight distribution is narrow
Design tokens define 7 weights (300-900) but components only use 5: 400, 500, 600, 700, 900. Weight 300 (light) and 800 are never used. 64% of explicit `font-weight` declarations are 600. Score numbers (900 Black, 40-48px) are the one place with typographic personality. Body content clusters at 400-600, creating a flat reading experience. Consider: 900 for headings, 300 for metadata, 500 for body.

### Spacing is NOT uniform (refutes Codex claim)
Codex claimed "same 16px padding, same 16px gap everywhere." This is **incorrect**. 11 spacing tokens are all used, with 30+ unique padding combinations. 85% use tokens correctly; 15% hardcode pixels for micro-alignments (2px badges, 6px grid gaps, 8px action bar). The spacing system is well-disciplined but pragmatic.

### Color usage is conservative
Arctic Teal appears on buttons, score slider accent, and target building — but the dossier body is almost entirely monochrome (dark slate text on white/dark surfaces). Severity colors only appear on small badges. Consider using color more boldly for visual landmarks: phase dividers, section backgrounds, card accent strips.

### Dark mode is better than light mode
OLED black with teal accents and dark surface cards creates genuine atmosphere. Light mode feels flat — white cards on nearly-white background with thin borders. The light theme needs more surface depth: shadows, subtle gradients, or varied background tones.

---

## PRD-vs-Reality Gap Table

All claims verified against actual design docs (`design-prd.md`, `design-spec.md`, `ui-principles.md`, `sunlight-prd.md`).

| PRD Promise | Source | Reality | Status |
|---|---|---|---|
| "Briefing, not dashboard" | design-prd.md | ~12 screens of unstructured scroll; risk data shown 3x (tile + card + detail) | GAP |
| "Consequences over data" | design-prd.md | Delivered in risk cards; absent for crime, building facts, neighborhood stats | PARTIAL |
| ActionBar appears on scroll to checklist | SC-4.3.5a | Always-visible fixed bottom (spec SC-13e contradicts PRD) | CONFLICT |
| Progressive 3D loading + 3-tier fallback | design-prd.md §4.3.2 | Binary: loading or loaded. No LoD fallback tiers | GAP |
| 3D deferred until viewport entry | design-prd.md | Fires eagerly at Phase 3, 8 sections before visible | GAP |
| Viewing checklist persists across backgrounding | SC-4.3.4c | Resets on any navigation; pure useState | GAP |
| Summary pills as jump links + highlight pulse | SC-4.3.1c | Pills scroll + highlight tile (corrected). Missing: section background pulse | PARTIAL |
| Camera presets (street/balcony/top-down) | design-spec.md §4.3 | Not implemented (removed from scope as "over-designed") | DEFERRED |
| Expat concept translation (? icons for Dutch terms) | ui-principles.md §11 | Not implemented | GAP |
| Entrance animations: 80ms stagger per section | design-prd.md animation table | Zero Framer Motion on dossier cards; SPRING_REVEAL only on 3 loading wrappers | GAP |
| Shortlist tap reopens dossier | design-prd.md | `handleSelectShortlistAddress` fully implemented (lookupId + fallback) | **WORKING** |

---

## Structural UX Gaps

### ~~No URL routing / deep linking~~ — **REFUTED** (2026-02-24 verification)
~~`activeScreen` state is in-memory only. No URL params, no hash routing, no shareable links.~~ **Incorrect.** Hash routing was added in commit `a8fcd19` ("add progressive loading and route hydration flow"). `App.tsx:343-364` implements `parseHashRoute()` with routes: `#/search`, `#/saved`, `#/compare`, `#/settings`, `#/address/{vboId}?lookup=...`. Hash change listener at line 1244 syncs URL with app state. Dossier URLs include vboId and optional lookupId, making addresses shareable via URL. GPT deep research report correctly identified this.

### No network retry UX pattern — **CONFIRMED**
Per-section retry buttons exist but no global "retry all failed" affordance. If multiple sources fail, the user must find and tap each retry button individually.

### ~~No progressive loading sequence~~ — **REFUTED** (2026-02-24 verification)
~~Whether card sections use individual loading states or all appear at once needs runtime verification.~~ **Implemented.** `App.tsx:434` defines `progressivePhase` state with `'house'` and `'buurt'` phases. Buurt-phase sections (Livability, TierB, Sunlight, 3D) are conditionally hidden until house phase data loads. Combined with hash routing (`a8fcd19`), the app now has URL-driven progressive loading with route hydration.

---

## Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Visual Design** | 7.5/10 | Strong tokens, but conservative color use; dark > light; comparison bars monochrome |
| **Information Architecture** | 6.0/10 | Nav semantics unclear; risk data shown 3-4x conditionally; card patterns inconsistent. Summary pills DO scroll (corrected). Hash routing added (corrected) |
| **Interaction Design** | 4.5/10 | No entrance animations, no checklist persistence, misleading grab handle. ~~Shortlist reopen broken~~ (corrected: working). Score count-up exists on tiles |
| **Accessibility** | 6.0/10 | 4 hardcoded English aria-labels (not 6); 2 touch targets below 44px (not 3); shortlist cards have role=button (corrected) |
| **Error Handling** | 6.5/10 | Data coverage properly i18n'd. Graceful degradation works. Per-section retry adequate |
| **Mobile Optimization** | 6.0/10 | 104-138px double fixed bars (corrected from 154px); 2 sub-44px targets; eager 3D fetch; 12+ swipes of unstructured scroll |
| **First-Time UX** | 3.5/10 | SVG icons exist, but no emotional hook, features not benefits, no example address |
| **Repeat-Use UX** | 5.0/10 | Checklist doesn't persist (PRD violation); ~~shortlist reopen broken~~ (corrected: working); hash routing enables sharing (corrected); no dismiss on attention card |
| **Aesthetic Distinctiveness** | 5.0/10 | Competent but not memorable; Polar Frost palette underutilized; typography flat |
| **PRD Compliance** | 5.0/10 | 6 of 11 verified PRD promises have gaps (corrected from 7 — hash routing resolves deep linking); 0 broken (shortlist fixed), 1 deferred, 1 has doc conflict, 1 partial (pills scroll but no pulse) |

**Overall: 5.8/10** (revised from 5.5 after 2026-02-24 GPT deep research cross-reference — hash routing added, progressive loading phases working, CompareScreen has legend, search accessible names in place) — Technically solid data pipeline with a well-crafted design system, but the UX layer that should transform data into understanding and confidence is underdeveloped. The risk detail view proves you know how to do it right — the challenge is bringing that level of intentionality to every screen and transition.

The gap between "developer's impressive side project" and "tool I'd trust for a 400,000 EUR decision" is mostly interaction design, emotional design, and PRD follow-through — not data or engineering.

---

## Verification Summary

| # | Finding | Status | Key Correction |
|---|---------|--------|----------------|
| 1 | Raw English badge | CONFIRMED | Values are lowercase ("high"), not "HIGH" |
| 2 | Dossier no boundaries | PARTIALLY VALID | LoadingScreen + sticky scroll nav exist, but search doesn't collapse |
| 3 | No dismiss on attention card | CONFIRMED | — |
| N | Nav semantics contradictory | CONFIRMED | Home/Briefing both → dossier; startDossierLoad forces activeTab='home' |
| N | Risk data shown 3x (tile + card + detail) | CONFIRMED | RiskTilesGrid + RiskCardsPanel render simultaneously with same prop |
| N | ~~Shortlist reopen is no-op~~ | **REFUTED** | Fully implemented at App.tsx:1144-1170, wired at 1921 |
| 4 | Data coverage developer-facing | PARTIALLY VALID → P2 | Banner IS properly i18n'd; density is the real issue |
| 5 | No loading skeleton | NEEDS VERIFICATION | SkeletonCard CSS exists, LoadingScreen exists |
| 6 | Keyboard focus dark theme | NEEDS VERIFICATION | CSS uses correct token |
| 7 | No checklist persistence | CONFIRMED | PRD SC-4.3.4c requires persistence; not implemented |
| 8 | Weak home screen | CONFIRMED | Has SVG icons, but no emotional hook |
| 9 | Double-bar stacking | CONFIRMED (corrected) | **104px** + safe area (ActionBar is 48px, not 64px). PRD/spec conflict on scroll-triggered vs always-visible |
| N | Touch targets below 44px | PARTIALLY CONFIRMED | Settings 36px, summary pills 34px. ~~Shortlist remove 32px~~ → actually 44px (passes). Lang toggle OK (44px) |
| N | Hardcoded English aria-labels | PARTIALLY CONFIRMED | 4 locations (not 6): timestamps, "Language", "Settings", bookmark. ~~"Back" x2~~ → properly i18n'd via `t('common.back')` |
| N | Eager 3D fetch | CONFIRMED | No IntersectionObserver gating; fires at Phase 3 before section visible |
| 10 | Inconsistent cards | CONFIRMED | — |
| 11 | No comparison legend | PARTIALLY CONFIRMED | CompareScreen HAS legend (ParallelCoordinates.tsx:125-138). RiskDetailView/LivabilityDetailView bars still lack legend |
| 12 | Shadow snapshots tiny | PARTIALLY VALID | Responsive (not 90px), DO have labels, but no tap-to-expand |
| 13 | ~~Time slider disconnected~~ | **REFUTED** | ShadowTimeSlider is imported + rendered in App.tsx (lines 8, 1826) |
| 14 | Viewing questions buried | CONFIRMED | Duplicated across modal + persistent checklist |
| 15 | No scroll-to-section | STALE | `scrollIntoView` IS implemented (but NOT for summary pills — see below) |
| N | ~~Summary pills don't scroll~~ | **PARTIALLY REFUTED** | Pills DO scroll + highlight tile. Missing only section background pulse |
| N | No entrance animations | CONFIRMED | PRD requires 80ms stagger; SPRING_REVEAL only on 3 loading wrappers |
| N | DossierSheet grab handle | CONFIRMED | cursor:grab + handle pill visible, but zero gesture handlers |
| N | ~~Shortlist cards non-semantic~~ | **PARTIALLY REFUTED** | Has `role="button"` + `tabIndex={0}` + `onKeyDown`. Non-idiomatic but accessible |
| 16 | Language toggle no label | REFUTED | Has `aria-label="Language"` + `role="radiogroup"` |
| 17 | Theme toggle cryptic | REFUTED | No sun/moon toggle in TopBar; settings button has aria-label |
| 18 | Export no loading state | CONFIRMED | — |
| 19 | Timestamps in English | CONFIRMED | Hardcoded English in `formatRelativeTime` |
| 20 | Crime stats no context | CONFIRMED | — |

### PRD Compliance Audit

| PRD Requirement | Source | Implemented? |
|---|---|---|
| Checklist persists across backgrounding | SC-4.3.4c | NO |
| ActionBar appears on scroll to checklist | SC-4.3.5a | NO (conflicts with spec SC-13e) |
| Summary pills scroll to section + pulse | SC-4.3.1c | PARTIAL (scroll + tile highlight yes, section pulse no) |
| Dossier section staggered reveal (80ms) | animation table | NO |
| 3D deferred until viewport entry | design-prd.md | NO (eager Phase 3) |
| Progressive 3D 3-tier fallback | design-prd.md §4.3.2 | NO |
| Expat concept translation (? icons) | ui-principles.md §11 | NO |
| Camera presets (street/balcony/top-down) | design-spec.md §4.3 | NO (deferred) |
| Shortlist tap reopens dossier | design-prd.md | **WORKING** |
| Risk detail as only expanded view | design-prd.md | NO (tiles + cards + detail all visible) |
| 3D building fade-in by distance (50ms stagger) | animation table | NO |

---

## Cross-Reference: Claude UX Audit (2026-02-24)

**Source:** `docs/plans/claude-ux-audit.md` — 20-section "Senior UX Designer" audit
**Method:** Every code-verifiable claim assessed against HEAD of `main`, 2026-02-24

### Credibility Assessment

The Claude UX audit contains **20+ factual errors** about the codebase, including getting the tech stack wrong, claiming features exist that don't (premium/paywall, financial intelligence, document translation), and claiming features don't exist that do (recent searches, comparison mode, data attribution, ARIA landmarks, skeleton loading). The audit appears to have been generated without reading the actual codebase — it relies on repo metadata (GitHub language stats, README surface-level reading) and generic PropTech UX heuristics.

**Reliability: LOW for specific technical claims. MODERATE for general UX strategy observations.**

### Factual Errors (claims refuted by code)

| # | Audit Claim | Section | Reality | Evidence |
|---|-------------|---------|---------|----------|
| 1 | "FastAPI + PostGIS backend" | Header | No PostGIS, no database. Stateless aggregator with Redis cache | `pyproject.toml`: no PostGIS dependency. `backend/CLAUDE.md`: "No database" |
| 2 | "Rust/wgpu forge3d renderer" | Header | Plain Three.js v0.182.0 only. No Rust anywhere | `package.json`: `three` dependency. Zero `.rs` files in repo |
| 3 | "85.5% HTML = substantial static HTML build" | §2.1 | React SPA. GitHub stat reflects generated HTML in build artifacts | Entire app is React + TypeScript components |
| 4 | Premium/paywall system exists | §7, §17 | Zero payment code — no Stripe, no pricing, no paywall components | Grep for `premium\|paywall\|stripe\|payment`: 0 matches in `src/` or `app/` |
| 5 | "Financial intelligence" feature | §1.1, §7.1 | Not implemented. Only VvE advisory flag exists | No WOZ, valuation, or mortgage API calls |
| 6 | "Expat document translation" feature | §7.1, §15.1 | Not implemented. Only UI i18n (en/nl) exists | No translation service in backend |
| 7 | "33-second cold load" as single wait | §10.1 | 3-phase progressive loading. Phase 1 completes ~1-2s; 3DBAG background is 62-77s | `App.tsx:829-1128`: `settleWithTimeout` with phase budgets |
| 8 | "No recent searches or saved locations" | §3.1 | Recent searches exist with localStorage + timestamps | `AddressSearch.tsx:187-208`: recent list with `formatRelativeTime` |
| 9 | "No comparison mode" | §1.1 | `CompareScreen.tsx` — parallel coordinates + side-by-side risk scores | `App.tsx:35`: `lazy(() => import('./components/CompareScreen'))` |
| 10 | "No visible data source attribution" | §14.1 | Sources cited on every risk card footer, building facts, 3D viewer, soil info | `RiskDetailView.tsx:149-158`, `BuildingFactsCard.tsx:62`, `SoilInfoCard.tsx:49` |
| 11 | "Color-coded risk scores fail for colorblind" | §9.1 | Four-channel design: color + icon shape + text label + numeric score | `SeverityBadge.tsx:10-46`: distinct SVG path per severity |
| 12 | "3D has zero screen reader support" | §9.1 | Canvas has `role="application"`, `aria-label`, `aria-describedby`, keyboard nav | `NeighborhoodViewer3D.tsx:1204-1210`: tabIndex, role, handlers |
| 13 | "Missing ARIA landmarks and roles" | §9.1 | 111 ARIA instances: regions, roles, `aria-live`, `aria-busy`, `role="meter"`, `role="listbox"` | `App.tsx`: 3 `role="region"` sections; components across board |
| 14 | "No skip-to-content link" | §9.2 | Exists with `.sr-only--focusable` class | `App.tsx:1596`: `<a href="#main-content" className="sr-only sr-only--focusable">` |
| 15 | "No skeleton loading states" | §10.2 | DossierSkeleton, RiskTileSkeleton, StatsSkeleton, animated LoadingScreen | `LoadingScreen.tsx`: animated SVG + progress bar + ARIA |
| 16 | "Language toggle buried / no detection" | §2.2, §15.2 | NL/EN toggle visible in TopBar header; browser locale detection via i18next | `TopBar.tsx:40-58`: radiogroup with NL/EN buttons. `i18n/index.ts:3,8`: LanguageDetector |
| 17 | "No search disambiguation" | §3.1 | PDOK `weergavenaam` includes city (e.g., "Keizersgracht 1, Amsterdam") | `locatieserver.py:49`: `display_name=doc.get("weergavenaam")` |
| 18 | "Binary risk: high/low only" | §6.1 | Four-level: good (70-100), moderate (40-69), poor (20-39), critical (0-19) with 0-100 scores | `scoring.py`, `SeverityBadge.tsx` |
| 19 | "No data freshness indicators" | §6.2 | `source_date` displayed in risk card footers; data coverage banner shows freshness ranges | `RiskDetailView.tsx:151`: `t('risk.sourceDate', { source, date: sourceDate })` |
| 20 | "No error handling for API failures" | §12.1 | Graceful degradation: failed sources show "unavailable" badges, per-section retry | `DataCoverageBanner`, individual card error states |

### Valid Concerns Already in Existing Appraisal

| Audit Claim | Existing Finding | Match |
|-------------|-----------------|-------|
| ~~No URL routing / deep linking~~ | ~~Structural UX Gaps~~ | ~~EXACT~~ → **REFUTED** (hash routing added in `a8fcd19`) |
| Touch targets undersized | NEW-P1 (3 components) | EXACT |
| No entrance animations | NEW P2 | EXACT |
| Grab handle misleading | NEW-P2 DossierSheet | EXACT |
| Shortlist reopen broken | NEW-P0 | EXACT |
| Data shown in multiple places | NEW-P0 risk tiles + cards + detail | EXACT |
| Fixed bar viewport consumption | P1 #9 (120-154px) | EXACT |
| Weak home screen / no emotional hook | P1 #8 | EXACT |
| No scoring methodology docs | (implicit in product gaps) | PARTIAL |

### Genuinely New Findings (not in existing appraisal)

| # | Finding | Severity | Evidence |
|---|---------|----------|----------|
| N1 | No scoring methodology transparency — users cannot see how 0-100 scores are calculated | P2 | No "how calculated" modal/link. Backend `scoring.py` logic not exposed to UI |
| N2 | No service worker / offline caching — PWA manifest exists but no runtime SW | P3 | `main.tsx`: no `serviceWorker.register()`. No workbox config |
| N3 | No geolocation button — users at property viewings can't use current location | P3 | Zero `navigator.geolocation` calls in frontend |
| N4 | No neighborhood-level search — only address entry, no "explore a buurt" mode | P3 | `AddressSearch` only uses PDOK Locatieserver address suggest |
| N5 | 3D keyboard controls undiscoverable — arrow keys / +/- work but no visual hint | P3 | `NeighborhoodViewer3D.tsx:900+`: keyboard handlers exist, no tooltip/guide |

### Strategic Observations (valid but not code-verifiable bugs)

The audit makes several strategic product observations that are reasonable but not verifiable against code:

- **"Cool palette may feel clinical"** — Subjective. Polar Frost is deliberately professional for a data product. Worth user-testing.
- **"No guided onboarding for 3D"** — Valid. 3D controls are non-obvious for non-gamers. Camera presets already deferred per PRD.
- **"No help center / FAQ / methodology docs"** — Valid gap for a consumer product making property claims.
- **"No event tracking / analytics"** — Valid. No Mixpanel/Amplitude/PostHog.
- **"No third-party trust signals"** — Valid. No testimonials, press, or partnership logos.
- **"Tone should be friendly, slightly informal"** — Already largely addressed. Risk detail view translates data into consequences. Some areas (crime stats, building facts) still present raw data.

### Audit Methodology Concerns

1. **Tech stack fabricated.** The audit invents "PostGIS" and "Rust/wgpu forge3d renderer" — components that have never existed in this project. This suggests the audit was generated from surface-level repo metadata rather than code inspection.
2. **Features assumed.** Premium/paywall (Section 7), financial intelligence, and document translation are treated as existing features. They are aspirational suggestions projected as critique of current state.
3. **Heuristic scores ungrounded.** The Nielsen heuristic scores (Appendix A) rate features as 1-2 that actually exist and work (e.g., "Recognition over recall: 2" despite recent searches + shortlist; "Help users recover: 2" despite graceful degradation + retry). Scores appear assigned from generic PropTech assumptions, not observation.
4. **"33-second cold load" misattributed.** The 3DBAG cold latency is real (62-77s) but happens in the background during Phase 3. Users see progressive content within 1-2 seconds. The audit presents this as a blocking first-paint issue, which it is not.
5. **Conversion funnel fabricated.** The "predicted funnel" in Section 17 assigns specific percentages (60%, 35%, 25%...) without any usage data. These are speculative.

### Revised Summary Incorporating Cross-Reference

The Claude UX audit's overall score of 4.2/10 is **not grounded in code reality**. It penalizes heavily for problems that don't exist (no paywall UX, no attribution, no loading states, no a11y) while missing the actual bugs documented in the main appraisal (shortlist no-op, hardcoded English aria-labels, summary pills not scrolling, checklist not persisting).

**Where the audit adds value:** general product strategy (methodology transparency, offline caching, geolocation, analytics, trust signals) and the reframe of "technology drives experience rather than user needs" — a fair high-level observation, even if the specific evidence cited is often wrong.

**Where the audit misleads:** every specific technical claim should be independently verified. At least 20 of the audit's factual assertions are incorrect.

---

## Simplification Assessment (2026-02-24)

**Method:** Deep component audit (App.tsx state inventory, render tree, CSS visual treatment analysis, information density counts) against the design context: brand personality is *confident, clear, empowering*; emotional target is *calm confidence*. Every complexity source below is evaluated against one question: **does this help or hinder a nervous buyer feeling "someone serious did the work for me"?**

### The Core Problem

The dossier is a **12+ section vertical scroll with no rhythm**. Every section has card-level visual treatment (border + shadow + background). Every section demands equal attention. The result: nothing stands out, nothing can be skimmed, and the user drowns in undifferentiated data. This directly contradicts Design Pillar 1 (editorial restraint) and the "briefing, not dashboard" principle.

The app currently presents data like a thorough research assistant who dumps every finding on the table. It should present like a confident advisor who says: "Here's what matters. Here's what to do."

---

### S1. Risk severity is shown 5 times for the same 4 categories — **CRITICAL**

The same noise/air/climate/sunlight risk data appears in:

| # | Component | What it shows | Location |
|---|-----------|--------------|----------|
| 1 | `AttentionSummary` | Flag badges ("Critical noise risk") | Top of dossier |
| 2 | `SummaryStrip` | Icon + score pills (4 pills) | Below address header |
| 3 | `RiskTilesGrid` | 2x2 grid: score number + SeverityBadge | House section |
| 4 | `RiskCardsPanel` | Full article cards: badge + meaning + metric + question + source | Directly below tiles |
| 5 | `RiskDetailView` | Overlay: score bar + comparison chart + viewing questions | On tile tap |

**Correction (2026-02-24):** Not all 5 render simultaneously. `AttentionSummary` and `SummaryStrip` are conditionally rendered (only when `progressivePhase !== 'house'` and pills exist). `RiskDetailView` only renders when a tile is tapped. In the typical scroll, a user encounters **3-4 presentations** of the same data (conditional summary + tiles + cards, plus detail on tap). The simplification recommendation still stands — `RiskCardsPanel` is redundant with `RiskDetailView`.

**Simplification:** Remove `RiskCardsPanel` entirely (183 lines). It duplicates what `RiskDetailView` already shows better. The flow becomes: `AttentionSummary` (flags for anything moderate+) → `SummaryStrip` (at-a-glance scores) → `RiskTilesGrid` (tappable 2x2, the decision point) → `RiskDetailView` (full analysis on tap). Three stops instead of five. The tile-to-detail progressive disclosure is the correct pattern — `RiskCardsPanel` undermines it by dumping the detail inline.

**Impact:** Removes ~200 lines of code + CSS. Eliminates the most direct violation of "briefing, not dashboard." Saves one full scroll-screen of vertical space.

---

### S2. Construction year appears in 3 places simultaneously — **MODERATE**

- `AddressHeader.tsx:26` — inline as "Built 1923"
- `BuildingFactsCard.tsx:32` — in the facts definition list
- `PropertyWarningsCard.tsx:75` — in foundation risk description

**Simplification:** Keep it in `AddressHeader` (contextual, prominent) and `BuildingFactsCard` (canonical facts). Remove from `PropertyWarningsCard` — the foundation risk description should reference the age implication ("pre-1970 construction") without repeating the exact year already visible above.

---

### S3. Bookmark action exposed in 2 competing locations — **MODERATE**

Both `AddressHeader.tsx:46` (heart/bookmark icon) and `ActionBar.tsx:19` ("Add to Shortlist" button) perform the same shortlist toggle. Both are visible simultaneously — the header icon is inline in the scroll, the ActionBar button is fixed at the bottom.

**Simplification:** Remove the bookmark icon from `AddressHeader`. The fixed `ActionBar` is the canonical location for primary actions (it's always visible, clearly labeled, proper button size). The inline icon is a secondary affordance that creates ambiguity about which is "the" save action. One save button, one location.

---

### S4. DossierSheet grab handle is a false affordance — **MODERATE**

`DossierSheet.tsx:18-20` renders a visible pill handle with `cursor: grab` and hover feedback (opacity + width expansion). Zero gesture handlers are attached. `onSnapChange` prop is accepted but never called.

**Simplification:** Remove the handle pill entirely. The dossier sheet scrolls via native window scroll, not drag gestures. The handle visually promises drag-to-dismiss behavior that doesn't exist. Either implement drag (complex, not needed for a report-reading flow) or remove the affordance. Removing is simpler and honest.

---

### S5. 47 useState hooks in App.tsx — **STRUCTURAL**

App.tsx (1,986 lines) contains 47 `useState`, 31 `useCallback`, 3 `useMemo`, 4 `useRef`. The data-fetch pattern is repeated 5 times identically:

```
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
```

× 5 sources (risk, warnings, livability, stats, tierB) = 15 of the 47 states.

This doesn't directly affect UX but creates maintainability complexity that makes UX changes expensive. The 170-line `handleAddressSelect` callback is a sequential async state machine that's difficult to reason about.

**Simplification (code-level):** Extract a `useAsyncData<T>` hook that encapsulates the data/loading/error triad + retry logic. Reduces 15 states to 5 hook calls. Extract `handleAddressSelect` into a `useDossierLoader` hook. Neither changes UX but unblocks future simplification work.

---

### S6. Every card has identical visual weight — **CRITICAL (aesthetic)**

14 dossier component CSS files apply `border: 1px solid var(--color-border)` on cards. 12 files apply `box-shadow`. Several cards layer `--color-surface` → `--color-surface-alt` → `--color-surface-recessed` (3 background levels in one card, e.g. `NeighborhoodStatsCard`).

When every section looks the same — same border, same shadow, same radius, same padding — the user has no visual signal for what's important. The dossier becomes a uniform column of rectangles.

**Simplification:**
- **Remove borders and shadows from non-interactive cards.** Only interactive elements (RiskTiles that tap to open, shortlist cards) need card elevation. Informational sections (BuildingFacts, SoilInfo, NeighborhoodStats) should use spacing and typography for separation, not containers.
- **Use the 3-phase dossier structure for visual rhythm.** The House → Buurt → Action phases should have distinct visual treatment: phase dividers, varied spacing, perhaps alternating background tones. Currently the phase dividers exist in code but all cards look identical regardless of phase.
- **Flatten nested backgrounds.** NeighborhoodStatsCard's 3 background levels (surface → surface-alt → surface-recessed) add visual noise. Use typography weight and spacing instead of nested colored containers.

---

### S7. SummaryStrip pills are icon-only — no category labels — **MODERATE**

`SummaryStrip.tsx:43-48` renders 4 pills showing only an SVG icon + numeric score. No text label identifies the category (noise, air, climate, sunlight). Users must decode the icon meaning — sound waves, leaf, water drop, sun — which is exactly the "GIS portal" anti-reference.

**Simplification:** Add short text labels to each pill ("Noise 72", "Air 85") or remove the strip entirely. If `RiskCardsPanel` is removed per S1, the strip becomes more important as the only at-a-glance risk summary before the tiles. Labels make it self-explanatory.

---

### S8. 11 tappable controls visible simultaneously in dossier — **MODERATE**

When a loaded dossier is visible, the user sees: 4 summary pills + 4 risk tiles + 1 bookmark icon + 2 action bar buttons = 11 tappable controls, plus 3 tab bar buttons = 14 total. The "one dominant action per screen" principle (ui-principles.md §1) is violated.

**Simplification:** After removing the duplicate bookmark (S3), it drops to 10+3. After removing `RiskCardsPanel` (S1), there are no inline retry buttons competing for attention in the risk section. The remaining actions have clear hierarchy: summary pills (navigation), risk tiles (exploration), action bar (commitment). This is acceptable if the visual weight is properly differentiated — pills should look like navigation, tiles like content, action bar like the primary CTA zone.

---

### S9. Viewing questions duplicated in 2 locations — **LOW**

Same questions appear in `RiskDetailView` (per-category modal) and `ViewingChecklist` (persistent bottom section). Both share `checkedQuestions` state, so checkbox sync works. But users who find questions in the detail view wonder why they repeat in the checklist.

**Simplification:** Keep the `ViewingChecklist` as the canonical location (it's the "action" phase of the dossier — the culmination). In `RiskDetailView`, show a brief callout: "These questions are saved to your Viewing Checklist" instead of rendering checkboxes inline. This makes the detail view lighter and drives users toward the checklist as the action-oriented destination.

---

### S10. Dead components consuming maintenance overhead — **LOW**

| Component | Status | Lines |
|-----------|--------|-------|
| `SpringTuner` | Never imported outside own test | ~80 |
| `SkeletonCard` / `SkeletonLine` / `SkeletonGrid` | Never imported outside own test | ~60 |
| `DossierSkeleton` / `StatsSkeleton` | Never imported in App.tsx | ~90 |

**Simplification:** Delete all three. They have tests that pass but test dead code. ~230 lines of components + CSS + tests that serve no user.

---

### S11. 17 distinct font-size/weight combinations, 4 bypass tokens — **LOW (aesthetic)**

The type system defines 12 named tokens, but 4 hardcoded specs bypass them:
- `RiskTile.css:51-54` — hardcoded `28px/900` instead of `--type-score-tile`
- `LivabilityCard.css:63` — hardcoded `700 24px/1` instead of `--type-data`
- `RiskTile.css:36-38` — hardcoded `13px/600` instead of `--type-caption` or `--type-label`
- `TierBSignalsCard.css:76` — hardcoded `11px` instead of `--type-micro`

**Simplification:** Replace hardcoded values with tokens. Doesn't change the visual result but enforces the type scale discipline and makes future simplification (reducing the number of type steps) possible.

---

### S12. AttentionSummary has no dismiss — **CONFIRMED (from P0 #3)**

The attention flags are valuable for first impression but persist as visual noise as the user scrolls through the dossier. Once you've seen "3 risks need attention," the banner has done its job.

**Simplification:** Add a collapse/dismiss toggle. Show the count badge ("3 items need attention") in collapsed state. Default to expanded on first view, collapsed on return visits to the same address. Store collapse state in the dossier session (not localStorage — it should reset for new addresses).

---

### Simplification Priority Matrix

| ID | Finding | Impact | Effort | Priority |
|----|---------|--------|--------|----------|
| S1 | Remove RiskCardsPanel (5→3 risk presentations) | HIGH | LOW | **Do first** |
| S6 | Remove uniform card borders/shadows; use spacing | HIGH | MEDIUM | **Do second** |
| S3 | Remove duplicate bookmark from AddressHeader | MEDIUM | LOW | **Quick win** |
| S4 | Remove DossierSheet grab handle | MEDIUM | LOW | **Quick win** |
| S10 | Delete dead components | LOW | LOW | **Quick win** |
| S7 | Add text labels to SummaryStrip pills | MEDIUM | LOW | **Quick win** |
| S2 | Remove construction year from PropertyWarningsCard | LOW | LOW | **Quick win** |
| S12 | Add collapse to AttentionSummary | MEDIUM | MEDIUM | **Sprint 2** |
| S9 | Replace ViewingChecklist duplication with callout | LOW | LOW | **Sprint 2** |
| S11 | Replace hardcoded font specs with tokens | LOW | LOW | **Sprint 2** |
| S5 | Extract useAsyncData hook from App.tsx | HIGH (structural) | HIGH | **Sprint 3** |

### The Simplification Thesis

The dossier currently presents like a research report where every paragraph has equal formatting. The fix isn't removing content — it's creating **hierarchy through visual differentiation**.

The target state: a user scrolls the dossier and their eye is drawn to **three landmarks**: the risk tiles (are there problems?), the 3D viewer (what does it look like?), and the viewing checklist (what do I do?). Everything else — building facts, soil info, neighborhood stats — is supporting context that should recede visually.

Remove `RiskCardsPanel`. Remove uniform card chrome. Let the content breathe. The app already has the right data and the right structure (house → buurt → action). The simplification is about making that structure *visible* instead of buried under identical rectangles.

---

## Animation & Motion Assessment (2026-02-24)

**Method:** Full animation audit — Framer Motion usage in `.tsx`, CSS `@keyframes` and `transition` in `.css`, spring configs in `config/springs.ts`, `prefers-reduced-motion` coverage, cross-referenced against PRD §11 animation catalog (18 specified animations).

**Design context:** Brand personality is *confident, clear, empowering*. Emotional target: *calm confidence*. Animation style should be restrained but not sterile — "Direction 2's precision with selected moments of delight" (PRD §11.1). Every animation must communicate state change, provide feedback, or guide attention. No decoration.

**Performance context:** Mobile-first (iPhone SE 667px viewport). Three.js 3D viewer already on page. `useAnimationPerformance` hook exists (drops to fallback after 3+ dropped frames at >32ms budget). PRD budget: ≥50fps on iPhone 12 / Galaxy S21.

---

### Current Animation Inventory

**What exists today:**

| Category | Component | Animation | Technique |
|----------|-----------|-----------|-----------|
| Loading | `LoadingScreen` | SVG line-draw, dot pulse, text fade-in | CSS `@keyframes` (3 animations) |
| Loading | `SkeletonCard`, `ui/Skeleton` | Shimmer gradient sweep | CSS `@keyframes shimmer` |
| Loading | `NeighborhoodViewer3D` | Pulse animation on loading state | CSS `@keyframes viewer3d-pulse` |
| Overlay | `ui/BottomSheet` | Slide-up + backdrop fade | CSS `@keyframes` (2 animations) |
| Overlay | `ui/Toast` | Slide-up from bottom | CSS `@keyframes toastSlideUp` |
| Data viz | `ui/ScoreBar` | Bar width grows from 0 | CSS `transition: width 600ms ease-out` |
| Data viz | `LivabilityCard` | Bar width + section height | CSS transitions (0.3-0.4s) |
| Data viz | `LivabilityDetailView` | Comparison bar width | CSS `transition: width 600ms ease-out` |
| Data viz | `RiskDetailView` | Comparison bar width | CSS `transition: width 600ms ease-out` |
| Interaction | `RiskTile` | Tap scale (0.97) + shared layout ID | Framer `whileTap` + `layoutId` |
| Interaction | `RiskDetailView` | Shared element transition from tile | Framer `layoutId` + `SPRING_EXPAND` |
| Interaction | `TabBar` | Tap scale (0.97) per tab button | Framer `whileTap` |
| Interaction | `ShortlistScreen` | Remove button tap scale (0.97) | Framer `whileTap` |
| Interaction | `RiskTile` | Scroll-target highlight pulse | CSS `@keyframes risk-tile-pulse` (300ms) |
| Transition | `App.tsx` | AttentionSummary + DossierSkeleton wrappers | Framer `motion.div` + `SPRING_REVEAL` |
| Transition | `App.tsx` | RiskTileSkeleton `AnimatePresence` | Framer `AnimatePresence mode="wait"` |
| Hover | Various (8 components) | Background/border color transitions | CSS `transition: var(--transition-fast)` |
| Pressable | `pressable.css` | Scale down/up on press/release | CSS `transition: transform 80ms/150ms` |
| Toggle | `ui/ToggleSwitch` | Knob slide + bg color | CSS transitions (200ms) |
| Export | `ExportBottomSheet` | Stroke dashoffset progress ring | CSS `transition: stroke-dashoffset 220ms` |

**Spring configs defined (4) — usage:**

| Spring | Stiffness | Damping | Used by | Status |
|--------|-----------|---------|---------|--------|
| `SPRING_SHEET` | 300 | 30 | Nothing in production | UNUSED |
| `SPRING_EXPAND` | 350 | 28 | `RiskDetailView` (shared element) | Active |
| `SPRING_REVEAL` | 200 | 22 | `App.tsx` (2 loading wrappers) | Active |
| `SPRING_TAB` | 400 | 30 | Nothing in production | UNUSED |

**`prefers-reduced-motion` coverage:** Only 5 of 12 CSS animation files include `@media (prefers-reduced-motion: reduce)`. Missing from: `NeighborhoodViewer3D.css`, `RiskTile.css`, `LivabilityCard.css`, `LivabilityDetailView.css`, `RiskDetailView.css`, `Toast.css`, `BottomSheet.css`.

---

### PRD §11.2 Animation Catalog — Implementation Status

| # | PRD Animation | Duration | Status | Gap |
|---|---------------|----------|--------|-----|
| 1 | **Tab switch crossfade + 12px shift** | 250ms | NOT IMPLEMENTED | No page transition animation. Tab content swaps instantly. |
| 2 | **Dossier section staggered reveal** (80ms stagger, 200ms each) | ~1400ms total | NOT IMPLEMENTED | Zero entrance animations on dossier cards. Only 2 loading-wrapper `SPRING_REVEAL` divs exist. The 14 dossier sections pop in without any fade or stagger. |
| 3 | **Score number count-up** (ticker from 0 to final) | 600ms | **IMPLEMENTED** (2026-02-24 correction) | `AnimatedScore.tsx` component uses `requestAnimationFrame` with 600ms easeOutCubic. Applied to `RiskTile`. Respects `prefers-reduced-motion`. Not yet applied to `SummaryStrip` or `LivabilityCard`. |
| 4 | **Risk tile → detail shared element** | 300ms | IMPLEMENTED | `layoutId` on `RiskTile` + `RiskDetailView` with `SPRING_EXPAND`. Working correctly. |
| 5 | **Detail view dismiss (reverse shrink)** | 250ms | PARTIAL | Framer handles reverse via `layoutId`. Exit animation relies on `AnimatePresence` which is present. Reverse may not match spec's `cubic-bezier(0.4, 0, 0.6, 1)` — uses spring instead. |
| 6 | **Shortlist add icon animation** (stroke draw → fill) | 250ms + 150ms | NOT IMPLEMENTED | Bookmark icon switches between `fill="none"` and `fill="currentColor"` instantly. No SVG path animation. |
| 7 | **Shortlist add haptic feedback** | Instant | NOT IMPLEMENTED | No `navigator.vibrate()` or Haptic API calls anywhere in codebase. |
| 8 | **3D building distance-stagger fade-in** (50ms per building, 600ms total) | 600ms | NOT IMPLEMENTED | Buildings appear all at once when geometry loads. No opacity animation, no distance sorting, no stagger. |
| 9 | **3D camera preset switch tween** | 400ms | NOT IMPLEMENTED (feature deferred) | Camera presets not implemented. |
| 10 | **Shadow timeline scrub** | <200ms | **IMPLEMENTED** (2026-02-24 correction) | `ShadowTimeSlider` imported in App.tsx line 8 and rendered at line 1826 with full props. |
| 11 | **Season button crossfade** | 200ms | NOT IMPLEMENTED (feature deferred) | Season selector not implemented. |
| 12 | **3D mini-bar collapse/expand** | 300ms | NOT IMPLEMENTED (feature deferred) | 3D section doesn't collapse to mini-bar on scroll. |
| 13 | **Loading building assembly** | 2000ms | IMPLEMENTED | `LoadingScreen` has SVG line-draw animation with `loading-screen-draw` keyframes + phased dots + text fade. |
| 14 | **PDF progress bar** | Matches progress | IMPLEMENTED | `ExportBottomSheet` has stroke-dashoffset progress ring animation. |
| 15 | **Bottom sheet slide-up** | 350ms spring | IMPLEMENTED | `ui/BottomSheet` has `bottomSheetSlideUp` (350ms) + backdrop fade (200ms). Uses `cubic-bezier(0.32, 0.72, 0, 1)` — close to spring feel. |
| 16 | **Language toggle crossfade** | 200ms | NOT IMPLEMENTED | Language switch is instant. No crossfade on text elements. |
| 17 | **Error/unavailable card pulse** | 400ms | NOT IMPLEMENTED | Failed data sources show static "unavailable" badge. No background pulse animation. |
| 18 | **Dark mode crossfade** (SC-13a: 200ms) | 200ms | NOT IMPLEMENTED | Theme switch is instant — `data-theme` attribute toggles with no transition on surfaces. |

**Score: 6 of 18 implemented (corrected from 4), 0 partial (corrected from 1), 5 deferred (feature not built), 7 not implemented (corrected from 8).** Corrections: Score count-up exists via `AnimatedScore.tsx`; ShadowTimeSlider is wired and active.

---

### Animation Gap Analysis — Prioritized Opportunities

Each opportunity is assessed against the brand's "calm confidence" personality and mobile performance budget.

#### A1. Dossier Section Staggered Reveal — **CRITICAL (PRD violation)**

**The problem:** When dossier data loads, all 14 sections appear simultaneously. The user sees a wall of content with no visual hierarchy or reading direction. This is the single largest missed opportunity for "calm confidence" — a staggered reveal communicates *control* and *intentionality*.

**What it should feel like:** Sections fade in top-to-bottom, each 80ms after the previous, taking 200ms per section to reach full opacity. Like a professional document being laid out on a table, one page at a time.

**Implementation approach:**
- CSS-only with `@keyframes` and `animation-delay` computed per section index. No Framer Motion needed.
- Each dossier section wrapper gets `animation: dossierReveal 200ms ease-out both` with `animation-delay: calc(var(--section-index) * 80ms)`.
- `@keyframes dossierReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`
- Use `transform` + `opacity` only (GPU-composited, no layout thrash).
- Set `--section-index` via inline style on each section wrapper in `App.tsx`.
- `prefers-reduced-motion`: All sections visible immediately (remove animation).

**Impact:** HIGH — transforms the "wall of data" into a guided reading experience. Directly addresses PRD §11.2 row 2 and the appraisal's "12+ sections of unstructured scroll" critique.

**Effort:** LOW — Pure CSS, no component refactoring. ~30 lines of CSS + 14 inline style attributes.

**Risk:** Minimal. `opacity` + `translateY` are GPU-composited. 14 sections × 200ms = ~1.3s total, well within mobile performance budget. No interaction blocking.

---

#### A2. Score Count-Up on Risk Tiles and Summary Pills — **PARTIALLY IMPLEMENTED** (2026-02-24 correction)

~~**The problem:** Score numbers (0-100) appear as static text.~~ **Correction:** `AnimatedScore.tsx` already implements a `requestAnimationFrame` count-up with 600ms easeOutCubic, respecting `prefers-reduced-motion`. Currently applied to `RiskTile` scores.

**Remaining gap:** Not yet applied to `SummaryStrip` pill scores or `LivabilityCard` score. These still render static values.

**Remaining work:**
- Apply `<AnimatedScore>` component to `SummaryStrip` pill scores
- Apply `<AnimatedScore>` component to `LivabilityCard` overall score
- Consider `IntersectionObserver` gating for off-screen scores (currently counts on mount regardless)

**Effort:** LOW — Component exists, just needs integration in 2 additional locations.

---

#### A3. Shortlist Bookmark Icon Animation — **MEDIUM-HIGH**

**The problem:** Tapping "Add to Shortlist" toggles the bookmark icon between outline and filled state instantly. There's no moment of acknowledgment — the user's commitment to save an address passes without ceremony. For the primary retention mechanic, this is too quiet.

**What it should feel like:** The bookmark icon stroke draws from bottom to top (250ms), then fills with teal (150ms). A single confident gesture, like stamping a document.

**Implementation approach:**
- SVG `stroke-dasharray` + `stroke-dashoffset` animation on the bookmark `<path>`.
- Calculate path length via `getTotalLength()` on mount. Set `stroke-dasharray` to total length.
- On save: animate `stroke-dashoffset` from total → 0 (250ms ease-out), then crossfade to `fill: currentColor` (150ms).
- On remove: reverse — fill fades, stroke un-draws.
- Haptic: `navigator.vibrate?.(10)` on save (single 10ms pulse, widely supported). Not the full iOS `UIImpactFeedbackGenerator` (requires native bridge) but better than nothing.
- `prefers-reduced-motion`: instant fill toggle (current behavior).

**Impact:** MEDIUM-HIGH — elevates the primary retention action from invisible to memorable. Bookmark animations are proven engagement drivers (Instagram heart, Twitter like).

**Effort:** MEDIUM — SVG path animation is well-understood. ~50 lines in `ActionBar.tsx`. Must work in both `ActionBar` and `AddressHeader` bookmark locations (or remove duplicate per S3).

**Risk:** LOW. SVG animations are GPU-friendly. Path length calculation happens once on mount.

---

#### A4. Tab Switch Content Transition — **MEDIUM**

**The problem:** Switching between Home / Briefing / Saved tabs swaps content instantly. The screen content just *appears*, with no spatial context. Users lose their mental model of where they are.

**What it should feel like:** Outgoing content fades out + shifts down 12px (150ms). Incoming content fades in + shifts up from 12px below (250ms). A subtle vertical handoff, like turning a page.

**Implementation approach:**
- Wrap tab content containers in Framer Motion `AnimatePresence` with `mode="wait"`.
- `initial={{ opacity: 0, y: 12 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0, y: 12 }}`.
- Use `SPRING_TAB` (currently unused, stiffness 400 / damping 30 — snappy and decisive).
- Exit duration ~150ms (75% of entrance, per best practice: exits are faster).
- `key` on content wrapper = `activeScreen` or `activeTab`.
- `prefers-reduced-motion`: instant swap (Framer Motion respects `reducedMotion="user"` prop).

**Impact:** MEDIUM — smooths the most frequent navigation action. Three tabs × many switches per session = high cumulative impact.

**Effort:** LOW — Framer Motion `AnimatePresence` is already imported. ~15 lines of wrapper JSX. `SPRING_TAB` already defined but unused.

**Risk:** LOW. `opacity` + `translateY` only. `mode="wait"` ensures no content overlap. Must not delay interaction — user should be able to tap immediately even mid-animation.

---

#### A5. Theme Switch Crossfade — **MEDIUM**

**The problem:** Toggling dark/light mode is an instant flash — every color changes simultaneously in a single frame. On OLED screens, this is a jarring white→black or black→white flash. For a product that deliberately supports both themes (and has an OLED-true dark mode), the transition should feel intentional.

**What it should feel like:** A 200ms crossfade across all surfaces. Background colors, text colors, and card surfaces transition smoothly. Like dimming the lights.

**Implementation approach:**
- Add a global CSS transition when theme switch is *in progress*:
  ```css
  html.theme-transitioning,
  html.theme-transitioning * {
    transition: background-color 200ms ease-out,
                color 200ms ease-out,
                border-color 200ms ease-out !important;
  }
  ```
- In `theme.ts`: add `theme-transitioning` class before toggling `data-theme`, remove after 250ms timeout.
- The `!important` is necessary here (and justified) — it's a temporary global override that's removed after animation completes. Without it, component-level transitions would fight the global crossfade.
- `prefers-reduced-motion`: skip the class entirely — instant toggle (current behavior).

**Impact:** MEDIUM — transforms a jarring flash into a polished transition. Especially valuable on OLED where the contrast between `#000000` and `#FAFBFC` is extreme.

**Effort:** LOW — ~10 lines of CSS + ~5 lines in theme toggle function. No component changes.

**Risk:** LOW, but needs testing. The `*` selector applies transitions to *every* element — on a complex page this could cause jank. Mitigation: the 200ms duration is short enough that even if some elements lag, the overall effect reads as smooth. Profile on iPhone SE before shipping.

---

#### A6. Error/Unavailable State Pulse — **LOW-MEDIUM**

**The problem:** When a data source fails, its card shows a static "unavailable" badge. There's no visual moment communicating that something just *happened* — the user discovers the failure only by noticing the badge text. For a product where data coverage is a trust signal, failures should be gently acknowledged.

**What it should feel like:** The card's background pulses once in `--color-surface-recessed` (400ms ease-in-out). A brief, subtle breath — "this one didn't make it, but we're still here."

**Implementation approach:**
- CSS `@keyframes errorPulse { 0%, 100% { background: var(--color-surface); } 50% { background: var(--color-surface-recessed); } }`.
- Apply `animation: errorPulse 400ms ease-in-out` to card wrapper when error state transitions from null to error.
- Requires a `data-state="error"` attribute or CSS class toggle. Animation plays once (`animation-iteration-count: 1`).
- `prefers-reduced-motion`: no pulse (muted state appears immediately, per PRD).

**Impact:** LOW-MEDIUM — improves error state communication but affects a minority of sessions (only when sources fail).

**Effort:** LOW — ~15 lines of CSS. Needs a mechanism to trigger only on state transition (not on re-render). Could use a `useEffect` that toggles a class for 400ms.

**Risk:** Minimal. Single pulse, no loop.

---

#### A7. `prefers-reduced-motion` Compliance Gap — **P1 ACCESSIBILITY**

**The problem:** 7 of 12 CSS animation files lack `@media (prefers-reduced-motion: reduce)` blocks. Users who need reduced motion still see: BottomSheet slide-ups, Toast slide-ins, risk tile highlight pulses, comparison bar width transitions, livability section height animations, and the 3D viewer pulse. This is a WCAG 2.1 Level AA violation (SC 2.3.3).

**Files missing reduced-motion handling:**
1. `NeighborhoodViewer3D.css` — `viewer3d-pulse` keyframe
2. `RiskTile.css` — `risk-tile-pulse` keyframe
3. `LivabilityCard.css` — bar width + section height transitions
4. `LivabilityDetailView.css` — comparison bar width transition
5. `RiskDetailView.css` — comparison bar width transition + background transitions
6. `ui/Toast.css` — `toastSlideUp` keyframe
7. `ui/BottomSheet.css` — `bottomSheetSlideUp` + `bottomSheetBackdropIn` keyframes

**Additionally:** Framer Motion components (`RiskTile`, `RiskDetailView`, `TabBar`, `ShortlistScreen`) use `whileTap` and `layoutId` without checking reduced-motion preference. Framer Motion supports `<MotionConfig reducedMotion="user">` at the provider level — this should wrap the entire app.

**Implementation approach:**
- Add `@media (prefers-reduced-motion: reduce)` blocks to all 7 CSS files, setting `animation: none` or `transition: none` as appropriate.
- Wrap app root in `<MotionConfig reducedMotion="user">` (Framer Motion respects this globally for `animate`, `whileTap`, `whileHover`, and layout animations).
- In `useAnimationPerformance`: if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, return `shouldUseFallback: () => true` immediately.

**Impact:** HIGH (accessibility) — blocks WCAG AA compliance for motion-sensitive users.

**Effort:** LOW — ~30 lines of CSS across 7 files + 1 wrapper component.

---

#### A8. Language Switch Text Crossfade — **LOW (defer)**

**The problem:** Toggling NL↔EN swaps all text content instantly. Since Dutch text averages 10-15% longer than English, layout shifts are visible — elements jump size as text changes length.

**What it should feel like:** A 200ms linear crossfade on text elements. Text fades out, content swaps, fades back in.

**Recommendation:** Defer. The language toggle is used rarely (once per session, if at all). The juice isn't worth the squeeze — coordinating opacity timing with i18next language change introduces race condition risk for minimal payoff.

---

#### A9. 3D Building Distance-Stagger Fade-In — **DEFERRED**

**The problem:** When 3D buildings load, they all appear in a single frame. The PRD specifies buildings fading in by distance from center (nearest first), 50ms stagger, 600ms total.

**Recommendation:** Defer until after S1 simplification (removing `RiskCardsPanel`) and 3D viewer performance baseline is established. The merged geometry optimization (single draw call for neighbors) complicates per-building opacity animation — would need to split meshes during animation, then re-merge. High effort, medium visual payoff.

---

### Recommended Easing Tokens

The codebase currently defines `--transition-fast: 150ms ease` and `--transition-base: 200ms ease`. The default CSS `ease` keyword (`cubic-bezier(0.25, 0.1, 0.25, 1.0)`) is a symmetric curve that feels generic. Recommend adding purposeful easing tokens to `tokens.css`:

```css
/* Easing — natural deceleration curves */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);      /* Default for entrances */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);        /* Hero moments */
--ease-out-subtle: cubic-bezier(0.33, 1, 0.68, 1);     /* Supporting transitions */

/* Duration scale */
--duration-instant: 100ms;    /* Feedback: button press, toggle */
--duration-fast: 150ms;       /* State changes: hover, menu open */
--duration-base: 200ms;       /* Standard transitions */
--duration-moderate: 300ms;   /* Layout changes: accordion, modal */
--duration-slow: 500ms;       /* Entrance animations */
--duration-emphasis: 600ms;   /* Signature moments: score count-up, comparison bars */

/* Stagger delays */
--stagger-section: 80ms;     /* Dossier section reveal */
--stagger-item: 50ms;        /* List items, 3D buildings */
```

These `ease-out-quart` / `ease-out-expo` curves decelerate more naturally than `ease`, creating the "calm confidence" feel without spring overshoot or bounce.

---

### Animation Priority Matrix

| ID | Animation | Impact | Effort | Priority | PRD Req'd |
|----|-----------|--------|--------|----------|-----------|
| A7 | `prefers-reduced-motion` compliance | HIGH (a11y) | LOW | **Do first** | SC-11b |
| A1 | Dossier section staggered reveal | HIGH | LOW | **Do first** | §11.2 |
| A2 | Score count-up — extend to pills + livability (tiles done) | LOW | LOW | **Quick win** | §11.2 |
| A4 | Tab switch content transition | MEDIUM | LOW | **Quick win** | §11.2 |
| A5 | Theme switch crossfade | MEDIUM | LOW | **Quick win** | SC-13a |
| A3 | Shortlist bookmark animation + haptic | MEDIUM-HIGH | MEDIUM | **Sprint 2** | §11.2 |
| A6 | Error/unavailable card pulse | LOW-MEDIUM | LOW | **Sprint 2** | §11.2 |
| A8 | Language switch crossfade | LOW | MEDIUM | **Defer** | §11.2 |
| A9 | 3D building stagger fade-in | MEDIUM | HIGH | **Defer** | §11.2 |

---

### The Animation Thesis

The app's animation state mirrors its visual hierarchy problem: **everything is treated equally.** Just as every card has the same border and shadow, every state change has the same treatment — instant, with no motion. The result: no rhythm, no guidance, no personality.

The fix is NOT to animate everything. It's to identify **three signature moments** and execute them with precision:

1. **The Dossier Reveal** (A1) — establishes reading direction and communicates "we organized this for you." The first impression after loading. It should feel like a curtain drawing open.

2. **The Score Arrival** (A2) — gives the core data product its heartbeat. A score that *counts up* communicates calculation and precision. A score that just *appears* communicates database lookup.

3. **The Save Commitment** (A3) — the primary retention action. When a user saves an address for their Saturday viewing tour, that moment should feel consequential.

Everything else (tab switches, theme toggles, error pulses) is supporting infrastructure — they make the app feel *correct* rather than *special*. Implement them, but don't over-invest.

The `prefers-reduced-motion` gap (A7) is non-negotiable — ship it before any new animations. Adding motion without respecting the opt-out is worse than having no motion at all.

---

## Performance Optimization Assessment (2026-02-24)

**Method:** Static analysis of bundle output, component architecture, network waterfall, CSS paint patterns, and Three.js render pipeline. Verified against HEAD of `main`, commit `6cac7dd`.

### Current Performance Profile

| Metric | Value | Status |
|--------|-------|--------|
| **Total initial bundle (gzip)** | 245 KB (103 main + 131 Three.js + 57 React vendors + 11 CSS) | Within 250 KB budget |
| **Lazy chunks (gzip)** | 14 KB (NeighborhoodViewer3D 11KB + Compare 1.6KB + Map 1.3KB + Settings 0.6KB) | Good separation |
| **Time to interactive dossier** | ~9s (risk cards + building facts visible) | Acceptable |
| **Time to full 3D context** | 12-25s accelerated, 30-77s conservative | 3DBAG API latency dominates |
| **CSS total** | 72 KB raw / 11 KB gzip | Reasonable |
| **Font** | 31 KB (WOFF, single file) | Improvable |
| **useState hooks in App.tsx** | 47 | Excessive — cascading re-renders |
| **React.memo usage** | 0 components | None across 87 .tsx files |
| **Fixed/sticky elements** | 13 simultaneous compositing layers | Moderate overhead |
| **CSS containment (`contain`, `content-visibility`)** | 0 instances | Missing optimization |
| **Service worker** | None | No offline capability |
| **HTTP Cache-Control headers** | None set | Browser re-fetches on revisit |

---

### P1. Dossier Components Eagerly Imported — **HIGH IMPACT, MEDIUM EFFORT**

**Problem:** 18 dossier components are synchronously imported in `App.tsx` lines 3-20, landing in the 356 KB main bundle. Users on the search screen download code for `RiskTilesGrid`, `PropertyWarningsCard`, `SoilInfoCard`, etc. before ever selecting an address.

**Only 4 components are lazy-loaded:** `BuildingFootprintMap`, `NeighborhoodViewer3D`, `CompareScreen`, `SettingsScreen`.

**Fix:** Create a lazy-loaded dossier chunk that loads when `activeScreen` transitions to `'dossier'`. The API response takes 2-3s anyway — chunk loads in parallel, imperceptible to user.

**Estimated savings:** 30-40 KB gzip from initial payload. Search screen loads in ~0.9s instead of ~1.2s.

---

### P2. Zero React.memo Across Entire Codebase — **HIGH IMPACT, MEDIUM EFFORT**

**Problem:** None of the 87 `.tsx` components use `React.memo()`. With 47 `useState` hooks in `App.tsx`, every state update triggers re-renders of the entire component tree — including expensive children like `RiskTilesGrid` (4 tiles), `NeighborhoodStatsCard` (multi-row), and `LivabilityCard` (5 dimension bars).

**Compounding factor:** Many `useCallback` hooks reference frequently-changing state, defeating memoization. Inline arrow functions in JSX (`onTap={() => onTileTap?.('noise')}`) recreate on every render.

**Fix:** Add `React.memo` to the 20 most-rendered leaf components: `RiskTile`, `RiskTilesGrid`, `SeverityBadge`, `BuildingFactsCard`, `SoilInfoCard`, `NeighborhoodStatsCard`, `TierBSignalsCard`, `LivabilityCard`, `PropertyWarningsCard`, `SummaryStrip`, `AttentionSummary`, `ViewingChecklist`, `AddressHeader`, `ShadowSnapshots`. Stabilize callback references with proper dependency arrays.

**Estimated impact:** 30-50% fewer re-renders during dossier interaction (checklist toggling, detail view opening, scroll state changes).

---

### P3. Font: WOFF Instead of WOFF2 — **MEDIUM IMPACT, LOW EFFORT**

**Problem:** `frontend/public/fonts/Satoshi-Regular.woff` is 31 KB. WOFF2 with Brotli compression is typically 8-12 KB for a variable font — a 60-70% reduction. The `satoshi.css` TODO comment acknowledges this.

**Additional issue:** The WOFF file claims `font-weight: 300 900` but may be a static Regular (400) weight, causing browser-synthesized bold/black rendering degradation.

**Fix:** Replace with Satoshi Variable `.woff2` from fontshare.com. Update `satoshi.css` src URL. Add WOFF as fallback for legacy browsers.

**Estimated savings:** ~20 KB on first page load (font blocks text rendering until loaded with `font-display: swap`).

---

### P4. No CSS Layout Containment — **MEDIUM IMPACT, LOW EFFORT**

**Problem:** Zero instances of `contain`, `content-visibility`, or `will-change` across all CSS files. The dossier renders 14 sections simultaneously — layout changes in one section (e.g., checklist toggle, detail view open) trigger reflow calculations across all 14.

**Fix:**
- Add `contain: content` to each dossier section wrapper (isolates layout/paint)
- Add `content-visibility: auto` to sections below the fold (NeighborhoodStats, TierB, ViewingChecklist) — browser skips rendering until scrolled into view
- Add `will-change: transform` sparingly to fixed elements (TabBar, ActionBar) for compositor promotion

**Estimated impact:** 30-40% reduction in layout reflow time during dossier interactions. Largest gain on mobile devices with slower CPUs.

---

### P5. Backdrop Filters on Scroll-Active Elements — **MEDIUM IMPACT, LOW EFFORT**

**Problem:** `DossierJumpNav` (`App.css:132`) uses `backdrop-filter: blur(10px)` on a sticky element. Backdrop blur is ~60x more expensive than transform/opacity — and this element repositions on every scroll frame.

`HeatmapLegend.css:12` has `backdrop-filter: blur(6px)` on the 3D viewer overlay (less impactful since it's absolutely positioned).

**Additional paint costs:**
- TabBar shadow: `0 -4px 12px rgba(0,0,0,0.5)` on permanent fixed element — repaints on scroll
- DossierSheet: `0 -4px 24px` shadow with theme-dependent opacity — recalculates on theme switch
- Toast: `elevation-3` = 48px blur radius (most expensive shadow, but short-lived)

**Fix:** Replace `backdrop-filter: blur()` on DossierJumpNav with solid `background: var(--color-surface)` or semi-transparent `background: color-mix(in srgb, var(--color-surface) 90%, transparent)`. Reduce TabBar shadow blur from 12px to 8px.

---

### P6. No Service Worker or HTTP Cache Headers — **MEDIUM IMPACT, HIGH EFFORT**

**Problem:** PWA manifest exists but no service worker is registered. Backend sets zero `Cache-Control`, `ETag`, or `Last-Modified` headers (`main.py` only has `GZipMiddleware`). Every page revisit re-fetches all resources from scratch.

**Impact:** A user checking the same address twice pays the full 9s loading penalty. Couples comparing addresses on different devices cannot benefit from shared caching.

**Fix (phased):**
1. **(Quick)** Add `Cache-Control: public, max-age=86400` to all backend API responses (immutable data like building facts, risk cards)
2. **(Medium)** Add stale-while-revalidate pattern: `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`
3. **(Large)** Implement service worker with Workbox for offline dossier caching — cached dossier loads in <1s on revisit

---

### P7. Three.js Heatmap Algorithm is O(n²) — **MEDIUM IMPACT, LOW EFFORT**

**Problem:** `NeighborhoodViewer3D.tsx` heatmap vertex coloring (lines 442-474) loops through ALL `roofPoints` for EACH vertex position to find the nearest sunlight sample. For a large building with 10,000 vertices and 500 roof points, that's 5 million distance calculations — stalling the main thread for 200-500ms when toggling `showHeatmap`.

**Fix:** Pre-compute a spatial hash or KD-tree from `roofPoints`. Nearest-neighbor lookup drops from O(n×m) to O(n×log(m)). Alternative: compute heatmap in a web worker to avoid main-thread stalls.

---

### P8. Neighborhood3D Fetch Delayed Until Phase 3 — **MEDIUM IMPACT, LOW EFFORT**

**Problem:** The 3DBAG neighborhood fetch (12-77s, the slowest single operation) doesn't start until Phase 3 (~9s into dossier load). It waits for Phase 1 (building facts) and Phase 2 (risk cards) to complete sequentially. The user scrolls past 7 sections before reaching the 3D viewer.

**Counterargument:** Sunlight analysis depends on 3D data, making early fetch intentional for correctness. But the user sees nothing for this section during the wait.

**Fix:** Start `getBuilding3D()` (target only, ~2s) in Phase 1 alongside `getBuildingFacts()`. Start `getNeighborhood3D()` in Phase 2 alongside `getRiskCards()`. The 3D data arrives earlier without blocking the critical path.

**Estimated savings:** 6-9s off 3D viewer availability time.

---

### P9. Height Animations With overflow:hidden Cause Layout Thrashing — **LOW IMPACT, LOW EFFORT**

**Problem:** `LivabilityDetailView.css` and `SettingsScreen.css` animate `height` with `overflow: hidden` — each frame triggers layout reflow to recalculate dimensions. Found in 28 instances across 11 CSS files.

**Fix:** Replace `height` animations with `max-height` transitions (avoids layout recalc) or use `transform: scaleY()` for GPU-accelerated expansion.

---

### P10. Theme Switch Triggers Full-Page Repaint — **LOW IMPACT, LOW EFFORT**

**Problem:** Dark mode toggle changes 70+ CSS custom properties at `:root` level via `setAttribute('data-theme', 'dark')`. This invalidates styles for every element on the page — a full repaint. No transition smoothing exists, causing a perceptible flash.

**Fix:** Add a 200ms transition to `html { transition: background-color 200ms, color 200ms; }` for perceived smoothness. The actual repaint cost is unavoidable with CSS custom property theming but the transition masks the jarring switch.

---

### Performance Optimization Priority Matrix

| ID | Finding | Impact | Effort | Priority |
|----|---------|--------|--------|----------|
| P1 | Lazy-load 18 dossier components | HIGH | MEDIUM | **Do first** |
| P2 | Add React.memo to leaf components | HIGH | MEDIUM | **Do first** |
| P3 | Replace WOFF with WOFF2 font | MEDIUM | LOW | **Quick win** |
| P4 | Add CSS containment to dossier sections | MEDIUM | LOW | **Quick win** |
| P5 | Remove backdrop-filter blur on scroll elements | MEDIUM | LOW | **Quick win** |
| P6 | Add HTTP Cache-Control headers | MEDIUM | LOW (phase 1) | **Quick win** |
| P7 | Fix O(n²) heatmap nearest-neighbor | MEDIUM | LOW | **Sprint 2** |
| P8 | Parallelize 3DBAG fetch with Phase 1 | MEDIUM | LOW | **Sprint 2** |
| P9 | Replace height animations with max-height | LOW | LOW | **Sprint 2** |
| P10 | Smooth theme switch transition | LOW | LOW | **Sprint 2** |
| P6b | Service worker for offline caching | HIGH | HIGH | **Sprint 3** |

### The Performance Thesis

The app is **not slow** — initial bundle is within budget (245 KB gzip), the three-phase progressive loading is well-designed, and Redis caching prevents redundant API calls. The issues are **structural efficiency** problems that compound on mobile devices:

1. **React re-render cascade:** 47 useState hooks with zero memoization means every interaction (checkbox toggle, scroll, detail open) rerenders the entire dossier tree. On a mid-range Android phone, this costs 50-150ms per interaction — the difference between "snappy" and "sluggish."

2. **Paint budget waste:** Backdrop blur on scrolling elements, heavy shadows on permanent nav, and zero CSS containment mean the browser does 3-5x more paint work than necessary during normal scrolling.

3. **Network waterfall:** The 3DBAG fetch (longest operation) waits 9s before starting. Moving it earlier is free — the user won't notice because 7 sections load before the 3D viewer.

The fixes are mostly additive (memo wrapping, containment properties, cache headers) rather than architectural. The hardest win — service worker for offline — would transform the repeat-use experience from "wait 9s again" to "instant."

---

## Onboarding & First-Time UX Assessment (2026-02-24)

**Method:** Full component code audit of every user touchpoint from first visit through first dossier completion. Evaluated against onboarding best practices: time-to-value, progressive disclosure, contextual help, empty states, feature discovery.

### The Core Problem

A first-time user — a nervous expat about to spend €400,000 on a Dutch apartment — opens the app and sees: a search bar, three terse feature labels, and nothing else. No explanation of what the app does, why they should trust it, what data sources it uses, or what they'll get. The app assumes the user already knows what "buurt-check" means and why they need one.

The gap between "landing" and "aha moment" (seeing a risk score for an address they care about) is bridged entirely by the user's own initiative. There is zero hand-holding, zero progressive revelation, zero emotional engagement before the first search.

**Current First-Time UX score: 3.5/10** — and this is the most impactful score to improve, because every user experiences it exactly once, and a bad first impression has a 100% drop-off rate.

---

### O1. Welcome screen is feature-centric, not benefit-centric — **CONFIRMED (extends P1 #8)**

**What exists:**
`AddressSearch.tsx:210-234` renders 3 value proposition rows when `recentSearches.length === 0` and the search box is empty:
- Sun icon + "3D-zonlichtanalyse" / "3D sunlight analysis"
- Pin icon + "Milieurisicobeoordeling" / "Environmental risk assessment"
- Clipboard icon + "Afdrukbare bezichtigingschecklist" / "Printable viewing checklist"

**Problems:**
1. **Features, not benefits.** "Environmental risk assessment" answers *what* but not *why*. The user's question is: "Will this apartment make me sick? Is the neighborhood safe? Will I regret this purchase?" — those anxieties are never addressed.
2. **No hero moment.** No illustration of what a completed dossier looks like. The user has no mental model of what they're about to receive. A single screenshot or animated preview of a risk card would do more than three text labels.
3. **No example address.** The user must already have an address in mind. A "Try it: Prinsengracht 263, Amsterdam" link would collapse the discovery gap to one tap.
4. **No trust signals.** No mention of data sources (government APIs), no "free, no registration" reassurance, no "used by X people" social proof.
5. **No emotional hook.** The loading screen (animated building SVG, step-by-step progress) has more personality than the welcome screen. The welcome is the first impression and it's the flattest screen in the app.
6. **Orphaned i18n keys.** `search.valueProp1`, `search.valueProp2`, `search.valueProp3` exist in both language files with better copy ("Environmental risk assessment for any Dutch address") but are unused — the component uses `search.valueProp.sunlight/risk/checklist` with shorter, less descriptive text.

**CSS treatment is minimal:** `AddressSearch.css:153-177` gives value rows a `40px` height with `--color-text-secondary` text and `--color-accent` stroke icons. No background, no card treatment, no visual weight. They feel like afterthought metadata, not a product pitch.

---

### O2. No first-visit detection or conditional onboarding — **CONFIRMED**

**What exists:** Nothing. Zero `localStorage` flags for `onboarding-seen`, `first-visit`, `tutorial-completed`, or any similar state.

**Impact:** The app cannot distinguish a first-time visitor from a returning user. This means:
- Cannot show a one-time welcome overlay or walkthrough
- Cannot progressively reveal features ("You've loaded 3 dossiers — did you know you can compare them?")
- Cannot track onboarding completion for analytics
- Cannot suppress repeat onboarding for returning users
- The value props vanish permanently once a single search is performed (recent searches populate, condition at line 210 becomes false)

The only "first visit" signal is `recentSearches.length === 0`, which conflates "new user" with "user who cleared history in settings."

---

### O3. Loading screen is a missed education opportunity — **CONFIRMED**

**What exists:** `LoadingScreen.tsx` shows address, animated building SVG, 6-step progress ("Gebouw zoeken...", "3D-model laden...", "Geluidsniveaus controleren...", etc.), and a progress bar. Well-crafted animation, proper `aria-live` and `role="progressbar"`.

**What's missing:** The 7-15 seconds of loading is the only moment where the user is captive and receptive to learning. Currently it just narrates the technical fetch sequence. This could instead:
- Explain what each data source means: "Checking noise levels — we measure traffic, rail, and air noise using government sensors"
- Set expectations: "Your dossier includes 10 data sources from Dutch government databases"
- Prime the user for the dossier structure: "First you'll see risk flags, then your 3D neighborhood, then a viewing checklist"
- Build trust: "All data is from official sources: BAG, RIVM, CBS, Kadaster"

The loading screen is the highest-attention moment in the entire UX flow. Currently it's informative but not educational or trust-building.

---

### O4. Dossier has no orientation — user dropped into 14 sections with no map — **CONFIRMED**

**What exists:** After loading completes, the user sees the dossier starting with `AttentionSummary` (if flags exist) or `AddressHeader`. The 3-phase structure (House → Buurt → Action) exists in code but is invisible to the user:
- Phase dividers exist (`DossierPhaseDivider` components in App.tsx) but are styled as thin text separators, not section landmarks
- No "here's what you're about to see" summary
- No "you are here" indicator during scroll
- The `DossierScrollNav` (sticky nav below search bar) shows the current phase but only after the user has already started scrolling

**Impact:** The user scrolls through 14 sections with no sense of progress, hierarchy, or completion. The three-phase structure — which is genuinely good IA — is architecturally present but perceptually absent.

**Comparison:** The risk detail view (`RiskDetailView`) IS well-structured: score → meaning → comparison → questions → source. That card-level structure needs a dossier-level equivalent.

---

### O5. Feature discovery relies entirely on icon metaphor recognition — **CONFIRMED**

Five key features have no onboarding, tooltips, or contextual hints:

| Feature | Discovery path | Problem |
|---------|---------------|---------|
| **Bookmark/shortlist** | Heart icon in ActionBar | Icon is the only hint. "Save to shortlist" button text helps, but no "save addresses to compare later" context |
| **Export briefing** | "Export Briefing" button in ActionBar | Button text is clear, but no hint about what the PDF contains or when to use it (e.g., "Take this to your viewing") |
| **Compare mode** | Tab bar "Saved" → Compare button | 3-step hidden path. User must: save 2+ addresses → navigate to Saved tab → tap Compare. No feature awareness unless they explore |
| **Language toggle** | NL/EN buttons in TopBar | Visible but unlabeled. `aria-label="Language"` is hardcoded English (see P1 hardcoded aria-labels). Expats might not realize they can switch |
| **3D viewer controls** | Orbit controls in 3D viewport | Pinch/rotate/pan gestures are completely undiscoverable. No "drag to rotate" hint. Keyboard controls (arrow keys, +/-) exist but have no visual affordance |

**No tooltips exist anywhere in the codebase.** No Tippy.js, no Popper.js, no custom tooltip component. Zero `data-tooltip`, `title` attribute (beyond aria-labels), or popover patterns.

---

### O6. Empty states are functional but not motivating — **CONFIRMED**

**Shortlist empty state** (`ShortlistScreen.tsx:26-37`):
- Bookmark outline icon (48x48)
- Title: "No saved addresses yet"
- Subtitle: "Bookmark addresses from your search to compare them side by side."
- Properly i18n'd (both EN and NL translations exist)
- **Missing:** No CTA button ("Search for an address" or "Try Prinsengracht 263"). The subtitle tells users *how* (via bookmark icon) but provides no action to take. User must manually navigate back to search.

**Compare empty state** (`CompareScreen.tsx:35-41`):
- Text: "Select 2-3 saved addresses to compare"
- **Missing:** Same problem — informational text without actionable CTA. No visual example of what a comparison looks like.

**Search no-results state:**
- Handled by `search.noResults` i18n key
- **Missing:** No suggestion to try a different format, no example address, no "we only support Dutch addresses" clarification for expats who might try a foreign format.

**Missing empty states entirely:**
- **Dossier error state** — If *all* data sources fail, there's no "we couldn't load anything" state. Each card shows individual "unavailable" badges, but no dossier-level error summary.
- **Offline state** — No service worker, no offline detection, no "you appear to be offline" message.

---

### O7. Settings screen is a dead-end with no educational value — **CONFIRMED**

**What exists** (`SettingsScreen.tsx`):
1. Language toggle (EN/NL)
2. Theme toggle (System/Light/Dark)
3. "Clear recent searches" (destructive)
4. "Clear shortlist" (destructive)
5. Version number ("1.0.0")

**What's missing:**
- No "About" section explaining what the app does
- No "Data sources" section listing the 10+ government APIs (builds trust)
- No "How it works" or FAQ link
- No "Send feedback" or "Report a problem" link
- No "Scoring methodology" explanation (finding N1 from cross-reference section)
- No privacy/data policy (the app queries government APIs with user-provided addresses)
- No "What's new" changelog
- Settings is exclusively destructive actions + preferences. There's no reason for a curious user to visit it, and nothing to learn from it.

---

### O8. No post-dossier guidance — "now what?" moment — **CONFIRMED**

**What exists:** After scrolling through 14 dossier sections, the user reaches the `ViewingChecklist` and `ActionBar` (fixed at bottom). The ActionBar has "Save to Shortlist" and "Export Briefing."

**What's missing:** No guidance on:
- "Save this address and search for another to compare" (the compare workflow)
- "Export this as a PDF to take to your viewing appointment" (the export workflow)
- "Share this with your partner/makelaar" (not implemented, but the intent gap exists)
- "Here's what to do next" — the viewing checklist IS this, but it's buried at the bottom of a long scroll. No prompt to scroll down to it.

The "aha moment" — understanding the risk scores — happens mid-scroll. But the *action* moment — saving, exporting, comparing — requires the user to independently discover the ActionBar and Saved tab. There's a gap between insight and action that onboarding should bridge.

---

### O9. The search placeholder doesn't teach — **CONFIRMED**

**What exists:** `search.placeholder` = "Plak of typ een adres..." (NL) / "Paste or type an address..." (EN)

**Problems:**
1. **"Paste or type" is a UI mechanic, not guidance.** Users need to know *what format* works: full address? Postcode? Street name? City? The answer (PDOK Locatieserver autocomplete supports partial match) isn't communicated.
2. **No example address.** "Try: Keizersgracht 1, Amsterdam" would show the expected format and demonstrate the app with zero commitment.
3. **For expats:** No hint that this is NL-only. An expat might try their current UK address first.

---

### O10. Returning user experience has no re-engagement — **CONFIRMED**

**What exists:** Recent searches with relative timestamps ("just now", "3m ago", "yesterday") appear when the search box is empty.

**What's missing:**
- No "Welcome back" or personalized greeting
- No "Your saved addresses" prompt (must navigate to Saved tab manually)
- No "New data available" indicator for previously searched addresses (data refreshes daily/weekly but user has no way to know)
- No "You searched 5 addresses this week — ready to compare?" prompt
- The value props (O1) never reappear once a single search has been performed. A returning user who hasn't visited in 2 weeks gets no re-orientation.

---

### Onboarding Priority Matrix

| ID | Finding | Impact | Effort | Priority |
|----|---------|--------|--------|----------|
| O1 | Rewrite value props as benefits with example address | HIGH | LOW | **Do first** |
| O3 | Add educational microcopy to loading screen steps | HIGH | LOW | **Do first** |
| O9 | Add example address to search placeholder/below | HIGH | LOW | **Do first** |
| O4 | Add visible dossier orientation (phase headers, progress) | HIGH | MEDIUM | **Sprint 1** |
| O5 | Add first-use tooltips on bookmark, export, compare | MEDIUM | MEDIUM | **Sprint 1** |
| O6 | Add CTA buttons to empty states | MEDIUM | LOW | **Quick win** |
| O2 | Add `localStorage` first-visit flag + conditional rendering | MEDIUM | LOW | **Quick win** |
| O8 | Add post-dossier "what's next" prompt | MEDIUM | LOW | **Sprint 2** |
| O7 | Add "About" / "Data sources" / "How it works" to Settings | LOW | MEDIUM | **Sprint 2** |
| O10 | Add returning-user re-engagement prompts | LOW | MEDIUM | **Sprint 3** |

---

### The Onboarding Thesis

The app's onboarding problem isn't about missing features — it's about **missing narrative**. The product has a clear story: "Paste an address → see risks → get a viewing checklist → make a confident decision." But that story is never *told*. The user must discover it through exploration.

Three changes would dramatically improve first-time UX:

1. **Reframe the welcome as a promise.** Replace "3D sunlight analysis / Environmental risk assessment / Printable viewing checklist" with: "Is this neighborhood safe? / Will your apartment get enough light? / What should you ask at the viewing?" Same features, framed as answers to the user's actual questions. Add an example address link so the answer is one tap away.

2. **Use the loading screen as a trust-builder.** Instead of "Checking noise levels...", show "Checking noise levels — using RIVM government sensors to measure traffic, rail, and aircraft noise near your address." The user learns what's happening AND builds trust in the data sources simultaneously.

3. **Add one tooltip per session.** Not a full walkthrough — just one contextual hint at the right moment. First dossier loaded → "Save this address to compare it with others later." First time on Saved tab with 2+ addresses → "Tap Compare to see addresses side by side." First PDF export → "Take this to your viewing appointment." Three tooltips total, shown once each, tracked in localStorage.

These three changes require no new components, no architectural changes, and no new dependencies. They transform the first 60 seconds from "figure it out yourself" to "we've got you."

---

### Revised First-Time UX Score Projection

| Metric | Current | After O1+O3+O9 (low effort) | After full onboarding sprint |
|--------|---------|------------------------------|------------------------------|
| Time to "aha moment" | ~30s (requires typing address + waiting) | ~15s (example address = 1 tap) | ~10s (guided) |
| Trust establishment | None before first search | During loading screen | Welcome + loading + data sources |
| Feature discovery | Self-service only | 1 tooltip per session | Full progressive disclosure |
| Return visit re-engagement | Recent searches list | Recent searches + prompt | Personalized + data freshness |
| **Projected score** | **3.5/10** | **5.5/10** | **7.0/10** |

---

## UX Hardening Assessment (2026-02-24)

**Method:** Systematic code audit of all frontend components + backend endpoints for production resilience gaps. Covers text overflow, error state handling, i18n edge cases, input validation, concurrent operation safety, memory leaks, motion sensitivity, and backend timeout/abuse resilience.

**Scope:** Findings below are NEW — items already documented in earlier sections (e.g., raw English severity badge P0 #1, hardcoded English aria-labels NEW-P1) are cross-referenced but not repeated.

---

### H1. Text Overflow & Wrapping

#### H1.1 AddressHeader street name has no overflow protection — P2 **CONFIRMED**

`AddressHeader.css:15-19`: `.address-header__street` (`<h2>` rendering `mainLine || address.display_name`) has no `overflow-wrap`, `text-overflow`, or `word-break`. The parent flex container has `min-width: 0` (good), but the heading itself is unbounded. Long Dutch addresses (e.g., "Koningin Wilhelminalaan 123-H supplement" — 47 chars) will wrap uncontrolled across multiple lines, pushing the address info section downward.

**Fix:** Add `overflow-wrap: break-word; word-break: break-word;` to `.address-header__street`. If single-line is intended: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`.

#### H1.2 RiskTile label missing ellipsis — P2 **CONFIRMED**

`RiskTile.css:34-39`: `.risk-tile__label` renders `t(labelKey)` with no overflow guard. In NL, "Wegverkeersgeluid" (17 chars) vs EN "Noise" (5 chars) — 3.4x ratio. In the 2x2 tile grid at 375px, long NL labels can overflow their tile width. The parent `.risk-tile__header` has `min-width: 0` and `flex: 1`, but the label span itself lacks truncation.

**Fix:** Add `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` to `.risk-tile__label`.

#### H1.3 Toast `white-space: nowrap` breaks on long NL strings — P2 **CONFIRMED**

`Toast.css:44`: `.toast__text` has `white-space: nowrap`. The NL translation of `shortlist.maxReached` is "Maximaal 3 adressen. Verwijder er een om een ander toe te voegen." (65 chars). On a 375px iPhone this overflows the toast container, making the message unreadable or causing horizontal scroll.

**Fix:** Replace `white-space: nowrap` with `white-space: normal` or use CSS line-clamp for a 2-line max. Alternatively, shorten the NL copy.

#### H1.4 NeighborhoodStats indicator values unbounded — P3 **CONFIRMED**

`NeighborhoodStatsCard.css:105,113`: `.neighborhood-card__indicator-label` and `.neighborhood-card__indicator-value` are `white-space: nowrap` but lack `overflow: hidden` / `text-overflow: ellipsis`. API-returned values (municipality names, distance strings) are unbounded. Currently safe due to typical data, but a long municipality name like "Súdwest-Fryslân" (16 chars) in a narrow column could clip.

**Fix:** Add `overflow: hidden; text-overflow: ellipsis;` to both classes.

---

### H2. Error State Gaps (Frontend)

*Cross-references: graceful degradation noted as working well in "What's Working Well"; per-section retry noted in P2 "No network retry UX pattern."*

#### H2.1 3D neighborhood fetch error is silently hidden — P2 **CONFIRMED**

`App.tsx:1122-1129`: When `getNeighborhood3D()` throws, the catch block sets `setSurroundingLoading(false)` and `setSunlightUnavailable(true)` — no `neighborhood3DError` state, no user-visible message, no retry affordance. The 3D section silently shows an empty viewer with ground plane but no buildings. The user has no way to know that a network failure occurred or to retry.

**Fix:** Add `neighborhood3DError` state variable. Render `t('viewer3d.loadError')` with a retry button in the 3D section when error is set. Clear error on retry.

#### H2.2 ViewingQuestions fetch failure — section silently disappears — P2 **CONFIRMED**

`App.tsx:987-989`: The viewing checklist catch block is `// Optional source.` — if the fetch fails, `viewingQuestions` stays `null`, and the ViewingChecklist section never renders. No skeleton, no loading indicator, no error message. Users who rely on the checklist for viewing prep will not know it exists if the initial fetch fails.

**Fix:** Add a loading skeleton for the ViewingChecklist section during fetch. On failure, show a fallback message: `t('viewing.loadError')` with retry.

#### H2.3 RiskComparisons fetch failure hides comparison bars — P2 **CONFIRMED**

`App.tsx:973-975`: When comparison data fails to load, `riskComparisons` stays as an empty array. The `RiskDetailView` renders without the comparison section — no "failed to load comparisons" message. This is the feature's crown jewel (address vs city vs NL vs WHO), so silent failure degrades the core value proposition.

**Fix:** Track `riskComparisonsError` state. Show a "comparison data unavailable" notice inside `RiskDetailView` when error is set.

#### H2.4 Basemap tile failure shows only `console.warn` — P3 **CONFIRMED**

`NeighborhoodViewer3D.tsx:1038`: When a WMTS tile fails to load, the handler logs `console.warn` but provides no visual feedback. The 3D viewer shows a grey ground plane with no map texture. Low severity because the 3D buildings still render correctly — the basemap is supplementary context.

#### H2.5 BuildingFactsCard has no retry mechanism — P2 **CONFIRMED**

`BuildingFactsCard.tsx:14-19`: The component receives `loading` and `building` props but no `error` prop. If `getBuildingFacts()` fails in `App.tsx:1136`, the dossier sheet is hidden entirely (`setSheetSnap('hidden')`). If building data comes back as `null` (API returns empty), the card renders `t('building.noBuilding')` with no retry affordance.

---

### H3. i18n Hardening

*Cross-references: raw English badge (P0 #1), hardcoded English aria-labels (NEW-P1), timestamps in English (P3 #18) already documented.*

#### H3.1 `formatRelativeTime()` ignores i18n keys that already exist — P1 **CONFIRMED**

`AddressSearch.tsx:12-23`: The function returns hardcoded English strings (`"just now"`, `"3m ago"`, `"yesterday"`, etc.). The i18n files already define `search.recentTime.justNow`, `search.recentTime.minutesAgo`, etc. in BOTH locales. The function simply never calls `t()`. Dutch users see English timestamps in the recent searches list.

**Fix:** Replace hardcoded strings with `t('search.recentTime.justNow')`, `t('search.recentTime.minutesAgo', { count: mins })`, etc.

*Note: Already documented as P3 #18 and NEW-P1. Promoting to P1 here because the i18n keys already exist — this is a wiring bug, not a missing feature.*

#### H3.2 AttentionSummary `categoryLabels` map is hardcoded English — P1 **CONFIRMED**

`AttentionSummary.tsx:37-42`: The `categoryLabels` lookup object contains English-only values (`'noise risk'`, `'air quality risk'`, `'climate risk'`, `'sunlight risk'`). These serve as fallback text in the flag labels: `label: 'Critical ${categoryLabels[cat]}'` (line 48). While the primary path uses i18n keys (`t('warnings.attention.flag.${f.category}', f.label)`), if any key fails to resolve, raw English appears in the Dutch UI.

**Fix:** Replace `categoryLabels` with `t('risk.category.${cat}')` calls. Add i18n keys for category names if missing.

#### H3.3 PropertyWarningsCard renders raw backend level string — P1 **CONFIRMED**

`PropertyWarningsCard.tsx:71`: `{foundation_risk.level}` renders the raw backend value (`"high"`, `"medium"`, `"low"`) directly into the badge span. No `t()` call. A `SeverityBadge` component with proper i18n exists and is used elsewhere.

*Note: Already documented as P0 #1. Included here for i18n completeness.*

#### H3.4 `toLocaleDateString()` ignores app language setting — P2 **CONFIRMED**

`AddressSearch.tsx:22`: `new Date(timestamp).toLocaleDateString()` uses browser locale, not app language. A Dutch browser with EN app setting shows "10-2-2026" (NL format) instead of "2/10/2026" (EN format). An English browser with NL app setting shows the inverse mismatch.

**Fix:** Pass the current i18n language: `new Date(timestamp).toLocaleDateString(i18n.language === 'nl' ? 'nl-NL' : 'en-US')`.

#### H3.5 NL translations 30-40% longer in several Toast/banner contexts — P2 **CONFIRMED**

Measured expansion ratios:
- `shortlist.maxReached`: EN 48 chars → NL 65 chars (+35%)
- `warnings.attention.missing_categories`: EN 95 chars → NL 113 chars (+19%)
- `dossier.coverage.stale`: EN 38 chars → NL 46 chars (+21%)
- `export.fullDossierMeta`: EN "5+ pages" → NL "5+ pagina's" (+37%)

These render in constrained contexts (Toast with `white-space: nowrap`, SummaryStrip pills, coverage banner). The Toast overflow is the most visible issue (H1.3).

**Fix:** Audit all constrained containers for NL text fit. Allow wrapping where needed. Shorten NL copy where possible without losing meaning.

---

### H4. Input Validation (Frontend)

#### H4.1 Address search input has no `maxLength` — P2 **CONFIRMED**

`AddressSearch.tsx:155-163`: The `<input>` has no `maxLength` attribute. A paste of 10,000+ characters fires `fetchSuggestions()` (after 300ms debounce) with the full string as query parameter. The backend PDOK proxy will likely reject it, but the fetch is still made with a massive query string.

**Fix:** Add `maxLength={200}` to the input element.

---

### H5. Concurrent Operation Safety

#### H5.1 Shortlist reopen can collide with in-flight address lookup — P1 **CONFIRMED**

`App.tsx:1144-1169`: `handleSelectShortlistAddress` calls `handleAddressSelect` which increments `neighborhood3DRequestId.current` to prevent stale results. However, if the user rapidly taps multiple shortlist items, multiple `lookupAddress`/`getBuildingFacts` chains fire simultaneously. There is no AbortController on these lookups — only the 3D request ID guard prevents stale 3D data. The building facts, risk cards, and other fetches from earlier taps continue running in the background.

**Fix:** Add an AbortController to `handleAddressSelect`. Abort the previous controller on each new invocation.

#### H5.2 ActionBar buttons lack double-tap protection — P2 **CONFIRMED**

`ActionBar.tsx:19-42`: Neither the bookmark nor export button has `disabled` state during operation or debounce. Rapid taps on bookmark fire `addToShortlist`/`removeFromShortlist` multiple times — while localStorage operations are synchronous (so data is safe), multiple toast notifications fire. The export button opens `ExportBottomSheet` which has its own `generating` state — the sheet is protected, but multiple rapid taps can produce a flash of sheet open/close.

**Fix:** Add `disabled={isBookmarkPending}` and debounce or disable-during-animation.

#### H5.3 Tab switch during active load overrides navigation — P2 **CONFIRMED**

`App.tsx:843-907`: If a user selects an address then immediately switches to the Saved tab, `handleAddressSelect` continues running in the background. When the lookup completes, it calls `setActiveScreen('dossier')`, overriding the user's tab selection. The dossier appears unexpectedly.

**Fix:** Check `activeScreenRef.current` before setting `setActiveScreen('dossier')` — only navigate if user hasn't manually switched away.

---

### H6. Memory Leaks

#### H6.1 Toast timers not cleaned up on unmount — P1 **CONFIRMED**

`Toast.tsx:18-21`: `setTimeout` return value is never stored and never cleared. If the `ToastProvider` unmounts while toasts are pending, the timers fire on stale closures and call `setToasts` on an unmounted component — producing React warnings.

**Fix:** Track timer IDs in a `Map<string, NodeJS.Timeout>` ref. Clear all timers in a `useEffect` cleanup. Also clear individual timers when toasts are manually dismissed.

#### H6.2 Basemap tile `Image` objects not cancellable on effect re-run — P2 **CONFIRMED**

`NeighborhoodViewer3D.tsx:993-1041`: The basemap tile effect creates `new Image()` objects for each tile. If the effect re-runs before images finish loading (e.g., when `center` changes), the cleanup function (lines 1044-1054) removes already-added meshes but cannot cancel in-flight image loads. Previous images' `onload` callbacks still fire and add meshes to a potentially stale scene.

**Fix:** Track pending image loads in a ref. In cleanup, set `img.src = ''` and `img.onload = null` for all pending images.

#### H6.3 Risk tile pulse timer not tracked — P3 **CONFIRMED**

`App.tsx:681-689`: `window.setTimeout(() => tile.classList.remove('risk-tile--pulse'), 320)` is not stored or cleared. If the component unmounts within 320ms, the timer fires on a detached DOM element. Low risk due to short duration.

---

### H7. Motion Sensitivity

#### H7.1 Framer Motion animations ignore `prefers-reduced-motion` — P2 **CONFIRMED**

Framer Motion's JS-driven animations bypass CSS `@media (prefers-reduced-motion)`. Affected locations:
- `App.tsx:1614-1626`: AttentionSummary reveal (`opacity: 0, y: -8` → `opacity: 1, y: 0`)
- `App.tsx:1683-1689`: RiskTileSkeleton reveal (same pattern)
- `RiskDetailView.tsx:65-75`: Layout animation with `SPRING_EXPAND`
- `RiskTile.tsx:25`: `whileTap={{ scale: 0.97 }}`
- `ShortlistScreen.tsx:94`: `whileTap={{ scale: 0.97 }}`
- `TabBar.tsx:39`: `whileTap={{ scale: 0.97 }}`

CSS-only animations (LoadingScreen, SkeletonCard, ScoreBar, Skeleton) correctly use `@media (prefers-reduced-motion: reduce)`. The test mock at `setup.ts:26` hardcodes `useReducedMotion: () => false`, confirming this is not implemented.

**Fix:** Wrap the app root with `<MotionConfig reducedMotion="user">` in `main.tsx` or `App.tsx`. This is a one-line fix that tells Framer Motion to honor the OS accessibility setting.

---

### H8. Performance Edge Cases

#### H8.1 Aerial image uses `loading="eager"` — P2 **CONFIRMED**

`BuildingFootprintMap.tsx:159`: The aerial photo `<img>` has `loading="eager"`, forcing immediate decode and render even though this image sits inside the DossierSheet (potentially below fold). The aerial photo is supplementary context, not above-the-fold content.

**Fix:** Change to `loading="lazy"`. The image will load when it enters the viewport.

#### H8.2 Shadow snapshots render 3 large base64 images eagerly — P3 **CONFIRMED**

`ShadowSnapshots.tsx:43-47`: Three `<img>` elements with canvas data URLs (potentially 100KB+ each as base64) are all rendered eagerly. No `loading="lazy"` attribute. These sit deep in the dossier scroll — most users won't scroll to them on first view.

**Fix:** Add `loading="lazy"` to snapshot images.

#### H8.3 `summaryPills` recomputed on every render — P3 **CONFIRMED**

`App.tsx:1259-1275`: The `summaryPills` array is computed inside an IIFE in the JSX, recreated on every render triggered by any of the dozens of state variables in `App.tsx`. While the computation is cheap (array construction), the downstream `SummaryStrip` receives a new array reference each time, defeating `React.memo` if applied.

**Fix:** Wrap in `useMemo` with `[riskCards]` dependency.

---

### H9. Backend Resilience (User-Facing Impact)

#### H9.1 `/risks` endpoint has no backend timeout budget — HIGH **CONFIRMED**

`risk_cards.py:734`: The `asyncio.gather` for noise, air, and climate cards has no `asyncio.wait_for` budget wrapper. Each card builder makes multiple sequential httpx calls at 15s per-call timeout:

| Builder | Max sequential calls | Theoretical worst case |
|---------|---------------------|----------------------|
| `_build_noise_card` | 2 (GetCapabilities + GetFeatureInfo) | 30s |
| `_build_air_card` | 3 (GetCapabilities + 2× GetFeatureInfo) | 45s |
| `_build_climate_card` | 11 (layer index + 10× WMS/WFS) | 165s |

The gather runs in parallel, so worst case is `max(30, 45, 165)` = 165s. In practice, layer caches mitigate this after first request, but on cold start or after 24h cache expiry, the `/risks` call can block for 30-60s — well past the 25s frontend abort. The user sees a loading spinner that eventually times out client-side.

**Fix:** Wrap the gather in `asyncio.wait_for(..., timeout=18.0)` to stay within the 20s backend budget. Or add per-card `asyncio.wait_for` wrappers at 15s each (since they run in parallel, total stays under 20s unless all three are slow).

#### H9.2 `/livability` endpoint missing top-level exception guard — MEDIUM **CONFIRMED**

`address.py:607`: `await leefbaarometer.get_livability(rd_x, rd_y)` has no surrounding `try/except`. If `_parse_dimensions` at `leefbaarometer.py:114` encounters a non-numeric `kscore` value (e.g., `"geen data"` from the API), `int(raw)` raises `ValueError` that propagates as an unmasked 500 Internal Server Error. Every other endpoint has an explicit `try/except Exception as exc: raise HTTPException(502, ...)` guard.

**Fix:** Wrap the livability endpoint in `try/except Exception` consistent with other endpoints.

#### H9.3 `shadow_image_b64` in export has no size limit — HIGH **CONFIRMED**

`address.py:698`: `ExportRequest.shadow_image_b64: str | None` has no `max_length` or size validation. A malicious client can POST a 10MB+ base64 string that gets decoded (~7.5MB binary) and embedded in the PDF, potentially exhausting server memory.

`address.py:695`: `address: str` also has no `max_length`.

**Fix:** Add `Field(max_length=2_000_000)` to `shadow_image_b64` (limits to ~1.5MB decoded image). Add `Field(max_length=500)` to `address`.

#### H9.4 Coordinate parameters have no range validation — MEDIUM **CONFIRMED**

All `rd_x`, `rd_y`, `lat`, `lng` query parameters across 8+ endpoints are bare `float = Query(...)` with no bounds. Valid ranges: RD New X=0–300000, Y=300000–625000; WGS84 lat=50.5–53.8, lng=3.2–7.3. Out-of-range coordinates produce meaningless external API calls and waste cache space.

**Fix:** Add `Query(..., ge=0, le=300000)` for `rd_x`, `Query(..., ge=300000, le=625000)` for `rd_y`, etc.

#### H9.5 502 error details leak exception internals — LOW **CONFIRMED**

`address.py:90,113,199,240`: `raise HTTPException(status_code=502, detail=f"...{exc}")` interpolates raw exception text that can include hostnames, ports, timeout values, and URL paths. If the frontend ever surfaces `error.detail` directly, technical strings reach the UI.

Currently the frontend shows generic error messages for most cases, but this is defense-in-depth: the backend should not expose internal details regardless.

**Fix:** Log the full exception server-side. Return a generic user-friendly detail string: `detail="External data source temporarily unavailable"`.

#### H9.6 No rate limiting on any endpoint — MEDIUM **CONFIRMED**

Zero rate limiting exists (no `slowapi` or equivalent). The `/risks` endpoint launches up to 13 outbound HTTP calls per request. The `/address/suggest` endpoint proxies to PDOK. Under hammering, PDOK rate limits could be exhausted for all users. The `/export` endpoint accepts arbitrary payloads with no throttle.

**Fix for MVP:** Add `slowapi` with sensible per-IP limits: 30/min for suggest, 10/min for risks, 5/min for export. Low effort, high protection.

#### H9.7 Redis failure graceful degradation — **EXCELLENT** (no action needed)

`cache/redis.py`: Circuit-breaker pattern with 30s cooldown, 0.5s socket timeout, broad `except Exception` catch. When Redis is down, app continues with full external API calls. Response times increase but no errors surface. Well-implemented.

---

### Hardening Priority Matrix

| ID | Finding | Severity | Effort | Priority |
|----|---------|----------|--------|----------|
| H9.1 | `/risks` no timeout budget | HIGH | LOW | **Do first** |
| H9.3 | Export payload size unlimited | HIGH | LOW | **Do first** |
| H3.1 | `formatRelativeTime` ignores existing i18n keys | P1 | LOW | **Do first** |
| H5.1 | Shortlist reopen collides with in-flight lookup | P1 | MEDIUM | **Sprint 1** |
| H6.1 | Toast timers not cleaned on unmount | P1 | LOW | **Do first** |
| H7.1 | Framer Motion ignores `prefers-reduced-motion` | P2 | LOW | **Do first** (one-liner) |
| H1.2 | RiskTile label missing ellipsis | P2 | LOW | **Quick win** |
| H1.3 | Toast `nowrap` breaks NL strings | P2 | LOW | **Quick win** |
| H2.1 | 3D error silently hidden | P2 | MEDIUM | **Sprint 1** |
| H2.2 | ViewingQuestions silently disappears | P2 | MEDIUM | **Sprint 1** |
| H2.3 | Comparison bars silent failure | P2 | LOW | **Sprint 1** |
| H3.2 | AttentionSummary hardcoded English category labels | P1 | LOW | **Do first** |
| H3.4 | `toLocaleDateString` ignores app language | P2 | LOW | **Quick win** |
| H4.1 | Search input no `maxLength` | P2 | LOW | **Quick win** |
| H5.2 | ActionBar double-tap unprotected | P2 | LOW | **Quick win** |
| H5.3 | Tab switch override during load | P2 | MEDIUM | **Sprint 1** |
| H8.1 | Aerial image `loading="eager"` | P2 | LOW | **Quick win** |
| H9.2 | `/livability` missing exception guard | MEDIUM | LOW | **Do first** |
| H9.4 | Coordinates no range validation | MEDIUM | LOW | **Sprint 1** |
| H9.5 | 502 details leak internals | LOW | LOW | **Sprint 2** |
| H9.6 | No rate limiting | MEDIUM | MEDIUM | **Sprint 2** |
| H1.1 | AddressHeader overflow | P2 | LOW | **Quick win** |
| H2.5 | BuildingFacts no retry | P2 | MEDIUM | **Sprint 2** |
| H6.2 | Basemap image leak on re-run | P2 | MEDIUM | **Sprint 2** |
| H8.2 | Shadow snapshots eager load | P3 | LOW | **Quick win** |
| H8.3 | `summaryPills` not memoized | P3 | LOW | **Quick win** |
| H1.4 | NeighborhoodStats value overflow | P3 | LOW | **Sprint 2** |
| H6.3 | Pulse timer not tracked | P3 | LOW | **Sprint 2** |
| H2.4 | Basemap tile `console.warn` only | P3 | LOW | **Sprint 2** |

---

### Hardening Score

| Category | Score | Notes |
|----------|-------|-------|
| **Text Overflow Protection** | 4/10 | Most dynamic text containers lack overflow guards; NL expansion not accounted for |
| **Error State Resilience** | 5/10 | Graceful degradation works for risk cards; silent failures elsewhere (3D, comparisons, checklist) |
| **i18n Production Readiness** | 5/10 | 380+ translated keys but wiring bugs leave English in NL UI; NL expansion breaks constrained layouts |
| **Input Validation** | 6/10 | BAG IDs well-validated; search input + export payload + coordinates unbounded |
| **Concurrent Operation Safety** | 4/10 | No AbortController on address lookup chain; no double-tap protection; tab override bug |
| **Memory Leak Resilience** | 5/10 | Toast timers + image cancellation gaps; most effects have proper cleanup |
| **Motion Sensitivity** | 4/10 | CSS animations respect `prefers-reduced-motion`; Framer Motion (6 locations) does not |
| **Backend Timeout Resilience** | 4/10 | `/risks` can exceed 20s backend budget on cold start; `/livability` unguarded |
| **Abuse Protection** | 2/10 | Zero rate limiting; unlimited payload sizes on export endpoint |

**Overall Hardening: 4.3/10** — The app has strong architectural foundations (circuit-breaker caching, graceful degradation pattern, design token system) but the production hardening layer is incomplete. The highest-impact fixes are also the lowest-effort: timeout budget on `/risks`, `MotionConfig reducedMotion`, `maxLength` on inputs, and wiring the existing i18n keys in `formatRelativeTime`. A focused 2-day sprint on the "Do first" + "Quick win" items would raise this score to ~6.5/10.

---

## 7. UX Copy Clarity Assessment

> **Auditor:** Claude (impeccable:clarify skill)
> **Date:** 2026-02-24
> **Scope:** All user-facing text — i18n strings (en.json/nl.json, 452 keys each), component inline copy, aria-labels, error messages, loading states, empty states, tooltips, and navigation labels.
> **Methodology:** Full en.json + nl.json read, component-level code inspection via Explore agent, cross-referenced against UX writing principles (specific > vague, active > passive, human > technical, helpful > blaming).

### Current state summary

The i18n architecture is solid — 452 keys per language, parity-enforced in tests, warning codes from backend mapped through `t()`. **Risk card explanations are genuinely excellent:** `noise.meaning_moderate` ("Traffic or rail noise is noticeable, especially with windows open") is the gold standard — specific, consequence-framed, zero jargon.

But that quality is inconsistent. Error messages, loading states, source attributions, and navigation labels revert to developer language. The app speaks two voices: a thoughtful advisor (risk explanations) and a GIS engineer (everything else).

---

### Findings

#### CRITICAL — Broken i18n / raw backend strings

**C1: `formatRelativeTime()` completely bypasses i18n**
- **Location:** `AddressSearch.tsx:15-22`
- **Problem:** Hardcoded English strings (`"just now"`, `"1 minute ago"`, `"2 hours ago"`) that will never translate to Dutch
- **Impact:** Every Dutch user sees English time strings in the recent search list
- **Fix:** Move all relative time strings to i18n keys (`time.just_now`, `time.minutes_ago`, `time.hours_ago`, `time.days_ago`) with `{{count}}` interpolation
- **Cross-ref:** H3.1

**C2: `foundation_risk.level` renders raw backend string as badge text**
- **Location:** `PropertyWarningsCard.tsx:71`
- **Problem:** Backend returns English strings like `"elevated"` or `"low"` — rendered directly as badge text without i18n mapping
- **Impact:** Dutch users see untranslated English risk levels
- **Fix:** Map through `t('warnings.foundation_level.${level}')` with NL translations
- **Cross-ref:** H3.3, P0 #1

#### HIGH — Internal naming / jargon exposed to users

**C3: "Tier-B signals" — internal taxonomy leaked into UI**
- **Location:** `tier_b.*` keys in en.json, section header visible to users
- **Problem:** "Tier B" is an internal data-priority classification meaningless to users. Users see "Tier-B Signals" as a section title.
- **Impact:** Users wonder "what's Tier B? Is Tier A better? Am I missing something?"
- **Fix:** Rename to "Additional property checks" (EN) / "Aanvullende woningcontroles" (NL). Remove all "tier" language from user-facing copy.

**C4: "Pand ID" shown to users**
- **Location:** `building_facts.pand_id` key, rendered in BuildingFacts card
- **Problem:** "Pand" is Dutch cadastral jargon. Even Dutch users outside real estate don't know it. Expats definitely don't.
- **Impact:** Meaningless label taking up space
- **Fix:** Either remove entirely (users don't need it) or rename to "Building registry number" (EN) / "Kadaster gebouwnummer" (NL) with a tooltip explaining it's the official government ID

**C5: "Lden" noise metric shown without explanation**
- **Location:** `noise.source_label` and tooltip text
- **Problem:** "Lden" (day-evening-night weighted noise level) is an EU acoustic engineering term. Even "dB Lden" means nothing to laypeople.
- **Impact:** Users see a number + unit they can't interpret
- **Fix:** Replace with "Average noise level" (EN) / "Gemiddeld geluidsniveau" (NL). Add tooltip: "Lden is the EU standard for measuring noise across day, evening, and night, weighted for when noise is most disruptive."

**C6: Score numbers without scale context**
- **Location:** `SummaryStrip`, `RiskTilesGrid`, `RiskDetailView` — all score displays
- **Problem:** Scores show "73" or "45" with no indication this is out of 100
- **Impact:** Users can't calibrate meaning. Is 73 out of 100? Out of 10? A percentile?
- **Fix:** Add "/100" suffix to all score displays, or add a one-time tooltip on first score encounter explaining the 0-100 scale

#### HIGH — Error messages need human voice

**C7: Passive voice in all error messages**
- **Location:** `errors.*` keys in en.json (~12 keys)
- **Problem:** "Data could not be loaded" / "An error occurred" / "Request timed out" — passive, impersonal, unhelpful
- **Impact:** Feels like talking to a machine, not a helpful advisor. Contradicts "confident, clear, empowering" brand.
- **Fix examples:**
  - "Data could not be loaded" → "We couldn't reach the data source. Try again in a moment."
  - "Request timed out" → "This is taking longer than usual. The government data source may be slow — try again."
  - "An error occurred" → "Something went wrong on our end. Your data is safe — try refreshing."

**C8: API error codes leak into user messages**
- **Location:** Various error handlers across components
- **Problem:** Technical strings like "401 Unauthorized", "ECONNREFUSED", "timeout" occasionally surface
- **Impact:** Breaks trust instantly. Users think the app is broken.
- **Fix:** Catch all technical error strings at the API service layer. Map to human-friendly messages. Never let raw HTTP status codes reach the UI.
- **Cross-ref:** H9.5

#### MEDIUM — Jargon and assumed knowledge

**C9: "Equinox" without definition**
- **Location:** `sunlight.equinox_note`, shadow analysis disclaimers
- **Problem:** "Analysis based on equinox conditions" — assumes astronomical vocabulary
- **Impact:** Many users don't know when equinoxes are or why they matter for sunlight analysis
- **Fix:** "Analysis based on March 21 conditions — when day and night are equal length, giving a typical mid-year sunlight estimate."

**C10: "PM2.5" / "NO₂" without context**
- **Location:** `air_quality.*` keys
- **Problem:** Chemical formulas used as labels. "PM2.5 concentration" means nothing to most people.
- **Impact:** Users can't connect the measurement to their health
- **Fix:** "Fine dust particles (PM2.5)" and "Nitrogen dioxide (NO₂) — mainly from traffic". Lead with the human meaning, parenthetical for the technical name.

**C11: "Sampled" geospatial jargon**
- **Location:** `source_sampled`, data freshness indicators
- **Problem:** "Sampled on 2024-03-15" — "sampled" is scientific methodology language
- **Impact:** Users wonder if this is a sample (subset) rather than actual data for their address
- **Fix:** "Measured on" or "Data from" — plain language that means the same thing

**C12: "Buurt" as English navigation label**
- **Location:** Tab bar, section headers in EN mode
- **Problem:** "Buurt" is Dutch for "neighborhood". Using it untranslated in the English UI assumes bilingual users.
- **Impact:** English-speaking expats (the primary target audience!) see an untranslated Dutch word in navigation
- **Fix:** "Neighborhood" in EN mode. Keep "Buurt" in NL mode.

**C13: Dutch property terms untranslated in EN**
- **Location:** `building_facts.*` keys — "bouwjaar", "oppervlakte", "bestemming"
- **Problem:** Some building fact labels use Dutch terms even in English mode
- **Impact:** Expats can't understand what they're reading
- **Fix:** Audit all `building_facts.*` keys. Ensure every label has a proper English translation. "Bouwjaar" → "Year built", "Oppervlakte" → "Floor area", "Bestemming" → "Zoning"

#### MEDIUM — Missing context / unclear actions

**C14: Empty states lack guidance**
- **Location:** Shortlist empty state, first-load state
- **Problem:** "No saved addresses" with no explanation of what saving does or why
- **Impact:** Dead-end screen with no forward momentum
- **Fix:** "No saved addresses yet. Search for an address and tap the bookmark icon to save it here for comparison."

**C15: Loading states are generic**
- **Location:** `loading.*` keys
- **Problem:** "Loading..." or "Fetching data..." with no indication of what's happening or how long it takes
- **Impact:** Users don't know if the app is working or stuck, especially during the 12-17s 3DBAG fetch
- **Fix:** Already partially addressed by progressive loading (recent commits), but remaining states should specify what's loading: "Checking government noise data..." / "Building 3D model of your street..."

**C16: Confirmation dialogs missing for destructive actions**
- **Location:** `SettingsScreen.tsx:63-67` — clear cache / clear history
- **Problem:** `settings.clearConfirm` i18n key EXISTS but is never used. Tapping "Clear" immediately executes.
- **Impact:** Accidental data loss (saved addresses, search history) with no undo
- **Fix:** Wire up the existing `settings.clearConfirm` key into a confirmation dialog before executing clear actions

**C17: Source attributions use bureaucratic names**
- **Location:** `source.*` keys, disclaimer text
- **Problem:** "Source: Rijksinstituut voor Volksgezondheid en Milieu" — full institutional names that mean nothing to expats
- **Impact:** Source citations become visual noise instead of trust-builders
- **Fix:** "Source: RIVM (Dutch National Health Institute)" — abbreviation + one-line English explanation. Same for CBS, PDOK, BAG, etc.

#### LOW — Inconsistencies and polish

**C18: Vocabulary inconsistency — severity labels**
- **Location:** Various components
- **Problem:** Legacy `low/medium/high` severity labels still appear in some code paths alongside canonical `good/moderate/poor/critical`
- **Impact:** Same score might show different labels depending on which component renders it
- **Fix:** Grep for `low|medium|high` in severity contexts. Replace all with canonical vocabulary. (Partially addressed in Feb 16 unification, but verify completeness.)

**C19: Hardcoded English aria-labels**
- **Location:** `AddressHeader.tsx:49`, `TopBar.tsx:40,61`, `TabBar.tsx` (6 instances total)
- **Problem:** `aria-label="Language"`, `aria-label="Settings"`, `aria-label="Close"` — hardcoded English, never translated
- **Impact:** Dutch screen reader users hear English labels in an otherwise Dutch interface
- **Fix:** Move all aria-labels to i18n: `t('aria.language')`, `t('aria.settings')`, `t('aria.close')`
- **Cross-ref:** H3.1

**C20: Mobile-invisible `title=` tooltips**
- **Location:** Multiple components using `title` attribute for additional context
- **Problem:** `title` tooltips only appear on desktop hover. On mobile (the primary platform), they're completely invisible.
- **Impact:** Context that designers intended to show is never seen by 80%+ of users
- **Fix:** Replace `title` attributes with tap-to-reveal inline help text or info icons that expand on tap

**C21: "Shortlist" vs "Saved" inconsistent terminology**
- **Location:** Tab bar says "Saved", code uses "shortlist", some copy uses "bookmarked"
- **Problem:** Three different words for the same concept
- **Impact:** Users may not connect that "saving" an address puts it in their "shortlist" on the "Saved" tab
- **Fix:** Pick ONE term and use it everywhere. Recommendation: "Saved" (most intuitive, already on the tab)

**C22: "Viewing checklist" vs "Viewing briefing" naming**
- **Location:** `viewing.*` keys, ActionBar button label, PDF export
- **Problem:** Sometimes called "checklist" (implies checkboxes), sometimes "briefing" (implies narrative)
- **Impact:** Minor confusion about what format to expect
- **Fix:** Standardize on "Viewing checklist" — it's more actionable and matches the actual content (questions to ask)

**C23: Button label "Export PDF" is action-only**
- **Location:** ActionBar PDF button
- **Problem:** "Export PDF" describes the technical action, not the value
- **Impact:** Users don't know what's IN the PDF or why they'd want it
- **Fix:** "Download viewing checklist" or "Get your briefing as PDF" — value-first, format second

---

### Priority matrix

| ID | Severity | Effort | Recommendation |
|----|----------|--------|----------------|
| C1 | CRITICAL | LOW | **Hotfix** — i18n broken for all NL users |
| C2 | CRITICAL | LOW | **Hotfix** — raw backend strings in UI |
| C3 | HIGH | LOW | **Sprint 1** — rename i18n keys + update NL |
| C7 | HIGH | LOW | **Sprint 1** — rewrite ~12 error message keys |
| C8 | HIGH | MEDIUM | **Sprint 1** — add error mapping layer in api.ts |
| C5 | HIGH | LOW | **Sprint 1** — reword noise labels |
| C6 | HIGH | LOW | **Sprint 1** — add "/100" to score displays |
| C4 | MEDIUM | LOW | **Sprint 1** — rename or remove Pand ID |
| C12 | MEDIUM | LOW | **Sprint 1** — translate "Buurt" in EN mode |
| C13 | MEDIUM | MEDIUM | **Sprint 2** — audit all building fact translations |
| C9 | MEDIUM | LOW | **Sprint 2** — expand equinox explanation |
| C10 | MEDIUM | LOW | **Sprint 2** — humanize chemical names |
| C11 | MEDIUM | LOW | **Sprint 2** — replace "sampled" with "measured" |
| C14 | MEDIUM | LOW | **Sprint 2** — improve empty state copy |
| C15 | MEDIUM | LOW | **Sprint 2** — specific loading state messages |
| C16 | MEDIUM | LOW | **Sprint 2** — wire up existing confirm dialog |
| C17 | MEDIUM | MEDIUM | **Sprint 2** — abbreviation + explanation for all sources |
| C18 | LOW | LOW | **Sprint 3** — grep + replace severity vocabulary |
| C19 | LOW | LOW | **Sprint 3** — move aria-labels to i18n |
| C20 | LOW | MEDIUM | **Sprint 3** — replace title tooltips with tap-reveals |
| C21 | LOW | LOW | **Sprint 3** — standardize "Saved" terminology |
| C22 | LOW | LOW | **Sprint 3** — standardize "Viewing checklist" |
| C23 | LOW | LOW | **Sprint 3** — value-first button labels |

---

### The Clarity Thesis

This app has a **split personality**. Risk card explanations speak like a trusted advisor: *"Traffic or rail noise is noticeable, especially with windows open."* But error messages speak like a server log: *"Data could not be loaded."* Source citations speak like a government report: *"Rijksinstituut voor Volksgezondheid en Milieu."* And navigation speaks like a developer's TODO: *"Tier-B signals."*

The fix isn't about rewriting 452 keys. It's about extending the voice that already works — the risk explanation voice — to every piece of text in the app. Three principles:

1. **Consequences, not measurements.** "Fine dust particles that affect breathing" not "PM2.5 concentration". "Average noise level" not "Lden dB". The measurement can be parenthetical.

2. **"We" not "the system."** "We couldn't reach the government data source" not "Data could not be loaded." Active voice, first person plural, acknowledging that someone built this for them.

3. **Plain Dutch/English, always.** "Buurt" doesn't appear untranslated in English mode. "Pand ID" becomes "Building registry number". "Sampled" becomes "Measured". Every word must pass the test: "Would my non-technical friend understand this without asking?"

The two critical fixes (C1, C2) are genuine bugs — Dutch users see English time strings, and raw backend enum values appear as badge text. These should ship before any other copy work.

---

### Revised UX Copy Score Projection

| Metric | Current | After C1+C2+C3 (hotfix) | After full clarity sprint |
|--------|---------|--------------------------|---------------------------|
| i18n completeness | ~92% (hardcoded strings, raw backend) | ~98% | 100% |
| Jargon-free copy | ~60% (risk cards great, rest mixed) | ~70% | ~95% |
| Error message quality | ~20% (passive, generic, sometimes raw) | ~20% | ~85% |
| Vocabulary consistency | ~75% (severity labels, save/shortlist) | ~80% | ~95% |
| **Projected clarity score** | **4.0/10** | **5.5/10** | **8.0/10** |

---

## Cross-Reference: GPT Deep Research Report (2026-02-24)

**Source:** `docs/plans/gpt-deep-research-report.md` — ChatGPT o3 Deep Research UX assessment
**Method:** Every code-verifiable claim assessed against HEAD of `main`, commit `6cac7dd` (2026-02-24). Three parallel verification agents ran against the codebase.

### Credibility Assessment

The GPT deep research report is **methodologically strong** — it cross-referenced the prior appraisal, used Nielsen's heuristics systematically, and correctly identified several items the existing appraisal got wrong or missed. Its primary weakness is verbosity and some generic recommendations not grounded in the actual codebase (e.g., detailed analytics event schemas, A/B testing plans).

**Reliability: HIGH for accessibility gaps and component-level assessments. MODERATE for strategic recommendations (reasonable but generic). LOW for specific file/line claims (occasionally references wrong file structure).**

### Corrections to Existing Appraisal (findings the GPT report got right that we got wrong)

| # | Existing Claim | GPT Report Claim | Verification | Action |
|---|----------------|-----------------|--------------|--------|
| 1 | "No URL routing / deep linking — CONFIRMED" | "Hash routing, progressive loading phases" | **GPT CORRECT.** `parseHashRoute()` at App.tsx:343 with routes for search, saved, compare, settings, address/{vboId}. Added in commit `a8fcd19`. | **CORRECTED above** — marked REFUTED |
| 2 | "No progressive loading sequence — NEEDS VERIFICATION" | "Progressive loading phases" in inventory | **GPT CORRECT.** `progressivePhase` state at App.tsx:434 with 'house'/'buurt' phases. | **CORRECTED above** — marked REFUTED |
| 3 | "No comparison legend" (P2 #11) | "Legend exists but needs directionality" | **GPT PARTIALLY CORRECT.** CompareScreen's `ParallelCoordinates.tsx:125-138` has legend with color swatches. RiskDetailView/LivabilityDetailView comparison bars still lack legend. | **CORRECTED above** — split assessment |

### New Findings from GPT Report (confirmed against code, not in existing appraisal)

| # | Finding | Severity | Evidence | Appraisal Section |
|---|---------|----------|----------|-------------------|
| G1 | LoadingScreen hardcoded `background: #ffffff` breaks dark mode | P2 | `LoadingScreen.css:12` — no `[data-theme="dark"]` override. Progress track also hardcoded `#e2e7ed` (line 129). Text colors use tokens correctly. | NEW — dark mode |
| G2 | Dossier jump nav buttons at 28px height | P1 | `App.css:161,178` — `height: 28px`. 16px below 44px Apple HIG minimum. Horizontal target OK (~80px wide with padding) but vertical target fails. | Extends NEW-P1 touch targets (was 2 components, now **4**: settings 36px, summary pills 34px, jump nav 28px ×2) |
| G3 | ExportBottomSheet progress ring lacks ARIA semantics | P2 | SVG circle with `strokeDasharray`/`strokeDashoffset` but NO `role="progressbar"`, NO `aria-valuenow/valuemin/valuemax`. `LoadingScreen.tsx:168` has correct pattern to copy. | NEW — a11y |
| G4 | AddressSearch missing ARIA combobox attributes | P2 | Input lacks `aria-activedescendant`, `aria-controls`, `aria-expanded`. Dropdown has `role="listbox"` + `role="option"` but input doesn't reference it. | NEW — a11y |
| G5 | RiskTileSkeleton layout mismatch with loaded grid | P2 | Skeleton: 2-col, `gap: --space-md`, 160px min-height, vertical cards. Loaded: 1-col, `gap: --space-sm`, 64px min-height, horizontal cards. Perceptible layout shift on transition. | NEW — layout shift |
| G6 | No "searching" indicator during address search | P2 | No loading/spinner state during 300ms debounce + API latency (1-3s). Users see empty dropdown while fetch is in-flight. | NEW — system status |
| G7 | Missing `inputmode="search"` on search input | P3 | `AddressSearch.tsx:155-163` — no `inputmode` attribute. Would improve mobile keyboard UX. | NEW — mobile |
| G8 | TopBar scroll listener targets `window`, not DossierSheet | P3 | `TopBar.tsx:18-24` — `window.addEventListener('scroll')` but dossier content may scroll inside DossierSheet container, not window. `setScrolled(window.scrollY > 10)` may never trigger in some scroll configurations. | NEW — potential bug |

### Findings from GPT Report Already Covered by Existing Appraisal

The GPT report extensively covers the following, all already documented:
- Touch target violations (P1) — covered, with GPT adding jump nav buttons (G2 above)
- Hardcoded English aria-labels (P1) — covered identically
- IA ambiguity Home vs Briefing (P0) — covered identically
- Comparison bar semantics (P2) — covered, with GPT correction on CompareScreen legend
- DossierSheet grab handle (P2) — covered identically
- Checklist persistence gap (P1 #7) — covered identically
- Destructive actions without confirmation (C16) — covered; GPT confirmed `settings.clearConfirm` key exists but is unwired
- Focus trap implementation — GPT correctly confirmed it EXISTS (custom `useFocusTrap` hook)
- Toast aria-live — GPT correctly confirmed it EXISTS (`aria-live="polite"` + `role="alert"`)
- RiskTile aria-labels — GPT correctly confirmed they include label + score + max context
- AnimatedScore reduced-motion — GPT correctly confirmed `prefers-reduced-motion` is respected
- Map accessible name — GPT correctly confirmed `role="img"` + `aria-label` on BuildingFootprintMap

### GPT Report Strategic Recommendations (valid but not bugs)

| Recommendation | Assessment |
|---------------|------------|
| Add `aria-activedescendant` + `aria-controls` to search (combobox pattern) | Valid. Standard ARIA combobox requires these. Added as G4 above. |
| Normalize touch targets to 48dp Material + 44pt Apple across ALL tappables | Valid. Matches project conventions. |
| Add "what's included" explanation to search | Valid. Matches O1 finding. |
| Add privacy disclosure to settings | Valid. Matches O7 finding. |
| Add swipe-to-delete on shortlist items | Low priority. Button-based remove works. Could cause accidental deletions. |
| Tokenize LoadingScreen background for dark mode | Valid. Added as G1 above. |
| Detailed analytics event schema | Reasonable but premature for current stage. No analytics infrastructure exists. |
| Add `aria-activedescendant` to dossier jump nav | Valid for keyboard accessibility. |
| User research plan (8-10 participants) | Reasonable but outside code-verification scope. |

### Updated Touch Target Violations (incorporating GPT findings)

| Component | Target Size | Shortfall | Source |
|-----------|------------|-----------|--------|
| Dossier jump nav buttons | 28px height | 16px | `App.css:161,178` — **NEW from GPT report** |
| Summary pills | 34px height | 10px | `SummaryStrip.css` — existing finding |
| Settings button | 36px | 8px | `TopBar.css` — existing finding |
| ~~Shortlist remove~~ | ~~32px~~ → 44px | ~~12px~~ → passes | Existing correction — passes minimum |
| ~~Language toggle~~ | ~~32px~~ → 44px effective | ~~12px~~ → passes | Existing correction — padding reaches 44px |

**Updated count: 4 touch target violations** (not 2 as previously stated — jump nav buttons were missed).

### Updated Summary Scorecard (incorporating GPT cross-reference)

| Category | Previous | Revised | Change Reason |
|----------|----------|---------|---------------|
| Information Architecture | 5.5 | **6.0** | Hash routing + progressive loading phases added |
| Accessibility | 6.0 | **5.5** | 4 touch target violations (not 2); missing ARIA combobox on search; ExportBottomSheet missing progressbar semantics |
| Repeat-Use UX | 4.5 | **5.0** | Hash routing enables address sharing |
| PRD Compliance | 4.5 | **5.0** | Deep linking resolved; progressive loading resolved |
| **Overall** | **5.5** | **5.8** | Net improvement from hash routing; net penalty from newly discovered a11y gaps |

### GPT Report Methodology Notes

1. **Cross-reference with prior appraisal was disciplined.** The GPT report explicitly validated/invalidated prior findings rather than starting from scratch. This prevented duplicate assessments.
2. **Nielsen heuristic scoring was grounded.** Unlike the earlier Claude UX audit (which fabricated tech stack details), the GPT report's heuristic assessments reference actual components and code patterns.
3. **Per-component dimension tables are thorough but verbose.** Each component assessed against 12 dimensions (heuristics, a11y, perf, security, i18n, visual, interaction, data-entry, onboarding, error states, analytics, fixes). Many cells are "N/A" — a prioritized finding list would be more actionable.
4. **Some claims need runtime verification.** TopBar scroll listener behavior (G8), LoadingScreen dark mode appearance (G1), and skeleton layout shift visibility (G5) should be confirmed with Puppeteer screenshots.
5. **Recommendations are actionable.** Fix effort/impact ratings align with existing appraisal methodology. No fabricated features or imagined tech stack components.

---

## Cross-Reference: Cowork Supplemental UX Appraisal (2026-02-24)

**Source:** `docs/plans/cowork-ux-appraisal.md` — Codebase audit by secondary reviewer
**Method:** Every finding verified against HEAD of `main`, commit `6cac7dd` (2026-02-24). Full grep/file read verification.
**Reliability: HIGH — 19 of 20 findings code-verified accurate, 1 partially accurate (F3), 1 inaccurate (F17).**

### Credibility Assessment

This supplemental is the most code-accurate external review received. Unlike the earlier Claude UX audit (20+ factual errors), every file reference, line number, and code snippet was verified correct. The reviewer clearly read the actual codebase. The only factual errors are: (a) F17 claims `autoComplete` attribute is missing — it IS present at `AddressSearch.tsx:162` as `autoComplete="off"`, and (b) F3 references a `handleHashNavigation` function that doesn't exist — the actual function is `applyRoute()` at `App.tsx:1175`.

### New Findings (not previously in this appraisal)

| # | Cowork ID | Finding | Severity | Evidence | Notes |
|---|-----------|---------|----------|----------|-------|
| 1 | **F1** | Keyboard focus system structurally incomplete — only 7 `:focus-visible` occurrences in 5 files across 40+ interactive components | **P0** | Grep verified: `index.css`, `ToggleSwitch.css`, `ShortlistScreen.css`, `ShadowTimeSlider.css`, `NeighborhoodViewer3D.css`. Only 3 `tabIndex={0}` across entire codebase. WCAG 2.1 SC 2.4.7 failure. | **CONFIRMED — major gap not identified in prior appraisal.** Global `:focus-visible` outline in `index.css` exists but is overridden or invisible on most components. |
| 2 | **F2a** | Compare screen snap-scroll has no keyboard navigation | **P0** | `CompareScreen.css:50` has `scroll-snap-type: x mandatory`. Zero `onKeyDown` handlers in `CompareScreen.tsx`. Keyboard user cannot move between columns. | **CONFIRMED — new finding.** |
| 3 | **F2b** | ParallelCoordinates chart a11y — generic aria-label, no `<desc>`, hardcoded non-theme colors | **P1** | `role="img" aria-label="Parallel coordinates chart"` at line 62. Hardcoded SERIES_COLORS at line 25. `#9AA0A6` merges with `--color-text-secondary` in dark mode. | **CONFIRMED.** Extends existing #10 (inconsistent cards) and #11 (comparison bars). |
| 4 | **F2c** | Compare "Differences Only" filter uses magic number `> 15` with no UI explanation | **P2** | `CompareScreen.tsx:49`: `Math.max(...valid) - Math.min(...valid) > 15` | **CONFIRMED — new finding.** |
| 5 | **F2d** | Compare feature is a 3-step hidden path (search → save 2+ → Saved tab → Compare button) with no in-dossier prompt | **P1** | `CompareScreen.tsx:35-41` empty state is generic `t('compare.noData')` | **CONFIRMED — new structural observation.** |
| 6 | **F3** | Hash routing has silent failure mode on shared links — PDOK lookup failure produces no targeted error toast | **P1** | `applyRoute()` at App.tsx:1175 (NOT `handleHashNavigation` as claimed). `parseHashRoute()` at 343 always returns valid route. PDOK failures fall through to generic error handling, no "address not found from shared link" UX. | **PARTIALLY CONFIRMED.** Function name wrong, but the silent failure observation is valid. |
| 7 | **F4** | ViewingChecklist checkboxes are 18×18px — below 44px touch target | **P1** | `ViewingChecklist.css:50-51`: `width: 18px; height: 18px`. Parent `<label>` has only `3px` vertical padding — total tap target well below 44px. | **CONFIRMED.** Extends touch target violations to **5 components**: settings 36px, pills 34px, jump nav 28px (from GPT), ViewingChecklist 18px checkbox, ViewingChecklist label ~24px. |
| 8 | **F5** | SettingsScreen language/theme toggles lack `role="radiogroup"` / `role="radio"` / `aria-checked` — inconsistent with TopBar which has them | **P1** | SettingsScreen.tsx:20-33 plain `<button>` elements. TopBar.tsx:40 has correct `role="radiogroup"` + `role="radio"` + `aria-checked`. | **CONFIRMED — new finding.** Same control, two different a11y implementations. |
| 9 | **F6** | ExportBottomSheet "Generate PDF" button remains visible + enabled after PDF is ready | **P1** | Lines 318-328: button not conditioned on `progressStage`. Visible alongside Share/Download when `progressStage === 'ready'`. | **CONFIRMED — new finding.** Extends existing "export button no loading state" (NEW-P2). |
| 10 | **F8** | ParallelCoordinates chart colors hardcoded hex, not design tokens | **P2** | `SERIES_COLORS = ['#00897B', '#9AA0A6', '#D1D5DB', '#E8913A']` at line 25. Inline `style={{ backgroundColor: color }}` at lines 130-133. Violates design rule: "always use `var(--token-name)`". | **CONFIRMED — new finding.** |
| 11 | **F9** | Compare screen shows no winner/overall summary | **P2** | No aggregate comparison, recommendation, or "Address A leads in 3 of 4 categories" anywhere. Product principle violation: "Consequences over data." | **CONFIRMED — new finding.** |
| 12 | **F10** | Export language can mismatch app language without warning | **P2** | `ExportBottomSheet.tsx:53-55` initializes from UI language but allows independent change. No mismatch indicator. | **CONFIRMED — new finding.** Low severity but valid. |
| 13 | **F12** | No scroll position restoration on tab switch — dossier scrolls to top | **P2** | `handleTabChange` at App.tsx:587-617 only does `scrollTo({ top: 0 })`. No save/restore. User loses position in 14-section dossier. | **CONFIRMED — new finding.** |
| 14 | **F13** | No confirmation pattern exists anywhere in frontend — zero `window.confirm`, no ConfirmDialog component | **P2** | Grep confirmed zero matches. `settings.clearConfirm` i18n key exists in both language files but is NEVER used in any .tsx file. | **CONFIRMED — new structural observation.** Elevates existing C16 from a wiring bug to a structural UI gap. |
| 15 | **F14** | Compare column `min-width: 170px` breaks on 320px phones | **P2** | `CompareScreen.css:57`: `min-width: 170px` with `flex: 0 0 calc(50vw - var(--space-base))`. At 320px: `50vw - 16px = 144px`, min overrides to 170px. Two columns = 340px > viewport. | **CONFIRMED — new finding.** |
| 16 | **F16** | Version number hardcoded "1.0.0" | **P3** | `SettingsScreen.tsx:74`: `<span>1.0.0</span>`. Not from package.json or env. | **CONFIRMED — new finding.** |
| 17 | **F18** | ShortlistScreen hardcoded overlay color `rgba(28, 45, 63, 0.86)` | **P3** | `ShortlistScreen.css:96` + line 78: `rgba(28, 45, 63, ...)`. Hardcoded instead of `var(--color-primary)`. `#fff` instead of `var(--color-text-inverse)`. | **CONFIRMED — new finding.** Design system violation. |
| 18 | **F19** | Export progress percentages are decorative — fixed jumps (0→25→65→90→100) not correlated to real progress | **P3** | `ExportBottomSheet.tsx:78-86`: Stage-based fixed values. `collecting→rendering` transition is instant; actual API call (1-3s) spans middle range. | **CONFIRMED — new finding.** |
| 19 | **F20** | ParallelCoordinates SVG width hardcoded 360px | **P3** | `WIDTH = 360` at line 20. `viewBox="0 0 360 190"`. NL axis labels longer than EN, causing overlap at narrow widths. | **CONFIRMED — new finding.** |

### Findings Already Covered (extends or duplicates existing)

| Cowork ID | Finding | Existing Coverage | Assessment |
|-----------|---------|-------------------|------------|
| **F7** | `aria-live` only in 3 files (Toast, AnimatedScore, LoadingScreen) | Partially covered in A7 (motion sensitivity) and GPT G3 (export progress ARIA). Not as a systematic `aria-live` gap count. | **EXTENDS** — adds the systematic "3 of 40+ components" framing. Incorporated as scope context for A7 + G3. |
| **F11** | Settings destructive actions have zero confirmation | Covered in C16 (UX Copy), H5.2 (Concurrent Safety). | **DUPLICATE** — cowork adds severity upgrade and structural framing (see F13 which captures the structural gap). |
| **F15** | No `navigator.geolocation` | Covered in N3 (Claude audit cross-ref). | **DUPLICATE.** |
| **F17** | Search input missing `autocomplete` suppression | **INACCURATE.** `AddressSearch.tsx:162` has `autoComplete="off"`. | **REFUTED.** The attribute IS present. |
| **S-C** | 47-useState performance impact on checkbox responsiveness | Extends S5 (structural) and P2 (React.memo). | **EXTENDS** — adds the specific UX consequence (50-150ms jank on checkbox toggle). |
| Cross-ref: RiskCardsPanel redundant | "Still open — most impactful simplification" | S1 in Simplification Assessment. | **CONSISTENT** — aligns with existing S1 finding. RiskCardsPanel IS actively used (App.tsx:1701) but IS redundant with RiskDetailView by design analysis. |

### New Structural Observations

**S-A: No Confirmation Pattern Exists** — The entire frontend has zero confirmation UI. `settings.clearConfirm` i18n key exists but is never referenced. Any future destructive feature (bookmark removal, history clear, address re-fetch) will ship without confirmation because no reusable pattern exists. This compounds with every feature addition.

**S-B: Scroll Position Is Global State Nobody Manages** — 18 `scrollTo`/`scrollIntoView` calls in App.tsx but no position persistence across tab switches. Jump navigation uses hardcoded offsets (68-72px) that break if TopBar height changes. No `IntersectionObserver` tracks which dossier section is currently visible.

**S-D: Compare Feature Is Orphaned From the Primary Flow** — Accessible only via Saved tab → Compare button. Never mentioned in the dossier. Never prompted after saving 2+ addresses. Has no "back to dossier" navigation from within comparison. The hero decision-making feature is invisible.

### Updated Scores (incorporating supplemental findings)

| Category | Previous | Revised | Change Reason |
|----------|----------|---------|---------------|
| **Accessibility** | 5.5 | **4.5** | Systematic `:focus-visible` gap (F1) is a WCAG 2.1 AA failure. Compare keyboard inaccessible (F2a). Settings toggle a11y mismatch (F5). 5 touch target violations (adding ViewingChecklist). `aria-live` coverage minimal (F7). Total: the a11y picture is worse than previously assessed. |
| **Interaction Design** | 4.5 | **4.0** | No scroll restoration (F12). Export generate button state confusion (F6). No confirmation pattern (F13). Compare undiscoverable (S-D). |
| **Mobile Optimization** | 6.0 | **5.5** | ViewingChecklist 18px checkbox (F4). Compare layout breaks at 320px (F14). |
| **Overall** | **5.8** | **5.5** | Supplemental reveals deeper a11y and interaction design gaps than previously documented. The focus-visible gap alone (F1) is a compliance blocker. |

### Updated Touch Target Violations (comprehensive)

| Component | Target Size | Shortfall | Source |
|-----------|------------|-----------|--------|
| ViewingChecklist checkbox | 18px | 26px | F4 — `ViewingChecklist.css:50-51` |
| Dossier jump nav buttons | 28px | 16px | G2 — `App.css:161,178` |
| Summary pills | 34px | 10px | NEW-P1 — `SummaryStrip.css` |
| Settings button | 36px | 8px | NEW-P1 — `TopBar.css` |
| ViewingChecklist label area | ~24px | ~20px | F4 — parent `<label>` with 3px vertical padding |

**Total: 5 distinct touch target violations across 4 components.**

### Updated Priority Matrix (supplemental findings only)

| ID | Finding | Severity | Effort | Priority |
|----|---------|----------|--------|----------|
| F1 | Focus-visible missing on 35+ components | **P0** | MEDIUM | **Do first** |
| F2a | Compare snap-scroll keyboard inaccessible | **P0** | LOW | **Do first** |
| F5 | Settings toggles missing radio semantics | P1 | LOW | **Quick win** |
| F4 | ViewingChecklist 18px checkbox touch target | P1 | LOW | **Quick win** |
| F6 | Generate button visible after PDF ready | P1 | LOW | **Quick win** |
| F3 | Hash routing silent failure on shared links | P1 | MEDIUM | **Sprint 1** |
| F2b-d | Compare chart a11y + discoverability | P1 | MEDIUM | **Sprint 1** |
| F13 | Build confirmation pattern (blocks F11 fix) | P2 | MEDIUM | **Sprint 1** |
| F8 | Chart colors hardcoded, not theme-aware | P2 | LOW | **Quick win** |
| F14 | Compare layout breaks on 320px phones | P2 | LOW | **Quick win** |
| F12 | No scroll restoration on tab switch | P2 | LOW | **Sprint 2** |
| F9 | Compare shows no winner summary | P2 | MEDIUM | **Sprint 2** |
| F10 | Export language mismatch no warning | P2 | LOW | **Sprint 2** |
| F16 | Version hardcoded "1.0.0" | P3 | LOW | **Quick win** |
| F18 | ShortlistScreen hardcoded overlay color | P3 | LOW | **Quick win** |
| F19 | Export progress stages decorative | P3 | LOW | **Sprint 3** |
| F20 | Chart SVG width hardcoded 360px | P3 | LOW | **Sprint 3** |

### Supplemental Methodology Notes

1. **Highest-accuracy external review.** 19/20 findings verified correct with exact file/line matches. The only factual error (F17 claiming `autoComplete` is missing when it's present) is minor.
2. **Focus-visible gap (F1) is the most impactful new finding.** The prior appraisal audited aria-labels, touch targets, and reduced-motion — but never systematically checked `:focus-visible` coverage. This is a compliance-blocking gap that affects every keyboard user.
3. **Compare screen received its first deep audit.** Prior appraisal mentioned compare only in passing (legend correction, lazy-loading). The supplemental reveals keyboard accessibility (P0), chart accessibility, discoverability, layout, and winner summary gaps.
4. **Confirmation pattern gap (F13) is architectural, not a bug.** It's the kind of structural observation that prevents multiple future bugs. Building a `ConfirmSheet` component unblocks Settings destructive actions (C16), future bookmark removal confirmation, and any new destructive feature.
5. **The supplemental correctly identifies the cowork appraisal's thesis:** the app is built for sighted, mouse-using, Dutch-speaking, technically-literate users on modern phones. The focus-visible and compare keyboard gaps are the most direct evidence.
