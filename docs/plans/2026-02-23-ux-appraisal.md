# Buurt Check — Critical UX Appraisal

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
Both Home and Briefing tabs route to `activeScreen='dossier'` when a dossier is loaded (`App.tsx:862-877`). `startDossierLoad()` at line 1064 forces `setActiveTab='home'` on every new address, overriding prior user selection. This creates a mismatch: the top bar title logic (line 1992) shows "buurt-check" when `activeTab='home'` but would show `t('nav.briefing')` if it were `'briefing'`. The Briefing tab is disabled when no dossier exists (TabBar.tsx:27), suggesting the intent was Home=search, Briefing=dossier — but the force-reset breaks this. Users are "in a dossier" while the Home tab is highlighted. Not a functional bug, but a design smell that weakens IA clarity.

### NEW-P0: Risk tiles and RiskCardsPanel show same data twice — **CONFIRMED**
`App.tsx` renders both `<RiskTilesGrid>` and `<RiskCardsPanel>` simultaneously, unconditionally, in the same scroll. Both receive the same `riskCards` prop. The tiles show score + severity in a compact 2x2 grid; directly below, RiskCardsPanel repeats each category as a full article with badge + meaning paragraph + metric + viewing question + source. Tapping a tile opens `RiskDetailView` as an additional overlay — it does NOT replace either section. The user sees: tile (score 50, "Matig") → card ("Wegverkeersgeluid — HOOG RISICO" with paragraph) → detail overlay (comparison bars). Three presentations of the same data. The PRD's "briefing not dashboard" principle is violated here.

### NEW-P0: Shortlist reopen is a no-op — **CONFIRMED**
Save-to-localStorage works correctly (`shortlist.ts` uses `localStorage` with key `buurt-check-shortlist`). However, `onSelectAddress` in `ShortlistScreen` is wired as `() => {}` (App.tsx line 1271) — a hard-coded no-op. Tapping a saved address card does nothing. The save-and-return loop, the core retention mechanic, is broken. Memory notes this as "85-90% fixed in prior session, 5 residual gaps."

### 4. Data coverage banner language — **PARTIALLY VALID** (downgraded from P0 to P2)
The original finding claimed "developer-facing language." This is **incorrect** — the banner IS fully i18n'd with proper NL translations: "9/10 databronnen geladen", "1 bron mislukt: Zonlichtanalyse. Gebruik Opnieuw proberen in de betreffende sectie." The translations are consumer-grade Dutch, not developer jargon. However, the **information density** criticism is valid — showing source counts, freshness ranges, stale counts, and failure lists all at once is a lot for a consumer product. The retry instruction ("Gebruik Opnieuw proberen") requires finding the right section. Moved to P2.

---

## High-Severity Issues (P1)

### 5. No loading skeleton for initial dossier render — **NEEDS VISUAL VERIFICATION**
A `SkeletonCard` CSS exists with shimmer animation, and "dossier skeleton primitives" were added Feb 16. The dedicated `LoadingScreen` with animated building SVG shows during initial fetch. Whether individual cards use skeletons during the staggered data arrival needs visual verification at runtime.

### 6. Search suggestions keyboard focus in dark theme — **NEEDS VISUAL VERIFICATION**
CSS uses `var(--color-surface-hover)` for `.address-search__item--active` which should resolve correctly in dark theme. Cannot confirm visual contrast without runtime testing.

### 7. Viewing checklist items are not persisted — **CONFIRMED**
State lives in `App.tsx:601` as `useState<Set<string>>(new Set())`. Pure in-memory, no localStorage. Reset explicitly in `startDossierLoad()` (line 1048) when loading a new address. Tests contain no persistence assertions. **PRD violation:** `design-prd.md` SC-4.3.4c requires "Checkbox state persists within the session and across app backgrounding." `design-spec.md` SC-6d adds "checked questions remain checked when navigating back and re-entering." Neither is implemented.

### 8. Home screen empty state is underwhelming — **CONFIRMED with nuance**
The home screen has 3 value propositions with custom SVG icons (sun/shield/clipboard) in accent color, styled with `--color-text-secondary`. These are NOT "bare bullet points in a void" — they have visual treatment. However: (a) No illustration or emotional hook, (b) No example address to try, (c) Features not benefits ("3D-zonlichtanalyse" vs "Will my apartment get enough light?"), (d) Only shows when no recent searches exist. The loading screen (animated building SVG, staggered segments) has more personality. **Codex review nailed this: reframe from technical capabilities to human anxieties.**

### 9. Fixed action bar + fixed tab bar = double-bar stacking — **CONFIRMED**
ActionBar: `position: fixed`, 64px, z-index 45, positioned via `bottom: calc(var(--tab-bar-height, 56px) + env(safe-area-inset-bottom))`. TabBar: `position: fixed`, 56px, z-index 50, `bottom: 0`. Total: 120px + safe-area inset (~154px on notched iPhones). On a 667px SE screen, that's 18-23% of viewport permanently consumed. **PRD conflict:** `design-prd.md` SC-4.3.5a says ActionBar should appear on scroll-to-checklist; `design-spec.md` SC-13e says always-visible. Current implementation follows the spec, not the PRD.

### NEW-P1: Touch targets below 44px minimum in 3 components — **CONFIRMED**
Settings button (`TopBar.css`): 36px (8px shortfall). Summary pills (`SummaryStrip.css`): 34px (10px shortfall). Shortlist remove button (`ShortlistScreen.css`): 32px (12px shortfall). Language toggle buttons appear 32px but with `padding: 6px 8px` the effective target reaches exactly 44px — Codex miscalculated that one. Apple HIG 44px minimum is documented as a project convention but violated in these 3 components.

### NEW-P1: Hardcoded English across aria-labels and timestamps — **CONFIRMED**
Six locations with hardcoded English strings that break bilingual a11y:
- `AddressSearch.tsx:12-21`: `formatRelativeTime` returns `"just now"`, `"3m ago"` etc. (i18n keys `search.recentTime.*` exist but aren't used)
- `TopBar.tsx:39`: `aria-label="Language"` (key `nav.languageToggle` exists but isn't used)
- `TopBar.tsx:60`: `aria-label="Settings"` (hardcoded)
- `RiskDetailView.tsx:83`: `aria-label="Back"` (no i18n key exists)
- `LivabilityDetailView.tsx:53`: `aria-label="Back"` (no i18n key exists)
- `AddressHeader.tsx:49`: `aria-label="Add/Remove from shortlist"` (hardcoded)
Search input (`AddressSearch.tsx:161`) has i18n'd placeholder but no `aria-label`. Screen reader users hear English labels regardless of language setting.

### NEW-P1: 3D fetch fires eagerly, not lazily — **CONFIRMED**
`App.tsx:1322-1402`: 3DBAG neighborhood fetch fires during Phase 3 of dossier load (~15s after address selection), with no IntersectionObserver or viewport gating. The 3D viewer section sits 8th in dossier order — users must scroll past 7 property-level sections to reach it. 3DBAG cold latency is 62-77s. The eager fetch is likely intentional (sunlight analysis depends on 3D data), but on mobile it consumes bandwidth before the section is visible. Could defer until neighborhood phase divider enters viewport.

---

## Medium Issues (P2)

### 10. Inconsistent card visual language — **CONFIRMED**
Five distinct card formats verified in code. Additionally (from Codex review): crime stats (raw tabular numbers) get no severity interpretation while noise (65 dB) gets a full comparison chart. The severity system (score + badge + color + icon) is well-defined in tokens but inconsistently deployed across card types.

### 11. Comparison bars lack legend AND color differentiation — **CONFIRMED**
No persistent legend component found. Additionally: ALL comparison bars use the same `var(--color-accent)` color. The only visual distinction between "this address", "city avg", "NL avg", and "WHO limit" is the text label and optional `opacity: 0.7` on dashed/reference bars. Both `RiskDetailView.css:128` and `LivabilityDetailView.css:271` use identical accent-colored fills. Users must read labels to distinguish bars — no at-a-glance parsing possible.

### 12. Shadow snapshots lack tap-to-expand — **PARTIALLY VALID** (corrected)
Original finding said "approximately 90x90px" and "unlabeled." **Corrections:** Snapshots are responsive (not fixed 90px) — `100%` width flex columns with `aspect-ratio: 4/3`. They DO have labels (`<span className="shadow-snapshots__label">` with translated time strings via `LABEL_KEYS`). However: no tap-to-expand, no lightbox modal, no `onClick` handler. At mobile widths (~100px per thumbnail), the 3D content is still difficult to distinguish.

### 13. Time slider is unwired dead code — **STALE / REFRAME**
`ShadowTimeSlider` was identified in memory as "orphaned (never wired into app)." This is not a UX issue about missing visual connection — it's dead code that was never mounted. The component has full implementation + tests but is not rendered in the app.

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

### NEW-P2: Summary pills don't scroll to sections — **CONFIRMED**
`SummaryStrip.tsx:41` fires `onPillTap` which is wired to `handleRiskTileTap` (App.tsx:1043) — the same handler used by risk tiles. This opens a `RiskDetailView` overlay, not a scroll-to-section. **PRD violation:** `design-prd.md` SC-4.3.1c specifies "Pill tap-to-scroll navigation lands the target card at the top of the viewport within 300ms" with a `--color-accent-light` background pulse (300ms). Neither scroll nor pulse is implemented. The pills function as detail-overlay openers, not jump links.

### NEW-P2: Shortlist cards are non-semantic clickable divs — **CONFIRMED**
`ShortlistScreen.tsx:78`: Card selection uses `<div onClick>` without `role="button"`, `tabIndex`, or keyboard handlers. Cards are not keyboard-navigable. Ironically, the nested remove button IS a proper `<button>` with `aria-label`. The primary interaction (selecting an address) is inaccessible while the secondary action (removing) is properly semantic.

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
| Summary pills as jump links + highlight pulse | SC-4.3.1c | Pills open detail overlay; no scroll, no pulse | GAP |
| Camera presets (street/balcony/top-down) | design-spec.md §4.3 | Not implemented (removed from scope as "over-designed") | DEFERRED |
| Expat concept translation (? icons for Dutch terms) | ui-principles.md §11 | Not implemented | GAP |
| Entrance animations: 80ms stagger per section | design-prd.md animation table | Zero Framer Motion on dossier cards; SPRING_REVEAL only on 3 loading wrappers | GAP |
| Shortlist tap reopens dossier | design-prd.md | `onSelectAddress` is a no-op `() => {}` | BROKEN |

---

## Structural UX Gaps

### No URL routing / deep linking — **CONFIRMED**
`activeScreen` state is in-memory only. No URL params, no hash routing, no shareable links. Dossiers are ephemeral. For house-hunting where couples compare addresses, this is a significant workflow gap.

### No network retry UX pattern — **CONFIRMED**
Per-section retry buttons exist but no global "retry all failed" affordance. If multiple sources fail, the user must find and tap each retry button individually.

### No progressive loading sequence — **NEEDS VERIFICATION**
The dedicated `LoadingScreen` handles initial fetch. Whether card sections use individual loading states or all appear at once needs runtime verification.

---

## Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Visual Design** | 7.5/10 | Strong tokens, but conservative color use; dark > light; comparison bars monochrome |
| **Information Architecture** | 5.0/10 | Nav semantics contradictory; risk data shown 3x; card patterns inconsistent; summary pills don't scroll |
| **Interaction Design** | 4.0/10 | No entrance animations, no checklist persistence, misleading grab handle, shortlist reopen broken |
| **Accessibility** | 5.5/10 | 6 hardcoded English aria-labels; 3 touch targets below 44px; shortlist cards non-semantic |
| **Error Handling** | 6.5/10 | Data coverage properly i18n'd. Graceful degradation works. Per-section retry adequate |
| **Mobile Optimization** | 6.0/10 | 154px double fixed bars; 3 sub-44px targets; eager 3D fetch; 12+ swipes of unstructured scroll |
| **First-Time UX** | 3.5/10 | SVG icons exist, but no emotional hook, features not benefits, no example address |
| **Repeat-Use UX** | 3.5/10 | Checklist doesn't persist (PRD violation); shortlist reopen broken; no sharing; no dismiss on attention card |
| **Aesthetic Distinctiveness** | 5.0/10 | Competent but not memorable; Polar Frost palette underutilized; typography flat |
| **PRD Compliance** | 4.0/10 | 8 of 11 verified PRD promises have gaps; 1 broken, 1 deferred, 1 has doc conflict |

**Overall: 5.1/10** — Technically solid data pipeline with a well-crafted design system, but the UX layer that should transform data into understanding and confidence is underdeveloped. The risk detail view proves you know how to do it right — the challenge is bringing that level of intentionality to every screen and transition.

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
| N | Shortlist reopen is no-op | CONFIRMED | `onSelectAddress` wired as `() => {}` at App.tsx:1271 |
| 4 | Data coverage developer-facing | PARTIALLY VALID → P2 | Banner IS properly i18n'd; density is the real issue |
| 5 | No loading skeleton | NEEDS VERIFICATION | SkeletonCard CSS exists, LoadingScreen exists |
| 6 | Keyboard focus dark theme | NEEDS VERIFICATION | CSS uses correct token |
| 7 | No checklist persistence | CONFIRMED | PRD SC-4.3.4c requires persistence; not implemented |
| 8 | Weak home screen | CONFIRMED | Has SVG icons, but no emotional hook |
| 9 | Double-bar stacking | CONFIRMED | 120px + safe area. PRD/spec conflict on scroll-triggered vs always-visible |
| N | Touch targets below 44px | CONFIRMED | Settings 36px, summary pills 34px, shortlist remove 32px. Lang toggle OK (44px) |
| N | Hardcoded English aria-labels | CONFIRMED | 6 locations: timestamps, "Language", "Settings", "Back" x2, bookmark labels |
| N | Eager 3D fetch | CONFIRMED | No IntersectionObserver gating; fires at Phase 3 before section visible |
| 10 | Inconsistent cards | CONFIRMED | — |
| 11 | No comparison legend | CONFIRMED | All bars same accent color, only opacity differentiates |
| 12 | Shadow snapshots tiny | PARTIALLY VALID | Responsive (not 90px), DO have labels, but no tap-to-expand |
| 13 | Time slider disconnected | STALE | ShadowTimeSlider is dead code (never mounted) |
| 14 | Viewing questions buried | CONFIRMED | Duplicated across modal + persistent checklist |
| 15 | No scroll-to-section | STALE | `scrollIntoView` IS implemented (but NOT for summary pills — see below) |
| N | Summary pills don't scroll | CONFIRMED | Pills open detail overlay; PRD SC-4.3.1c requires scroll + pulse |
| N | No entrance animations | CONFIRMED | PRD requires 80ms stagger; SPRING_REVEAL only on 3 loading wrappers |
| N | DossierSheet grab handle | CONFIRMED | cursor:grab + handle pill visible, but zero gesture handlers |
| N | Shortlist cards non-semantic | CONFIRMED | `<div onClick>` without role/tabIndex |
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
| Summary pills scroll to section + pulse | SC-4.3.1c | NO |
| Dossier section staggered reveal (80ms) | animation table | NO |
| 3D deferred until viewport entry | design-prd.md | NO (eager Phase 3) |
| Progressive 3D 3-tier fallback | design-prd.md §4.3.2 | NO |
| Expat concept translation (? icons) | ui-principles.md §11 | NO |
| Camera presets (street/balcony/top-down) | design-spec.md §4.3 | NO (deferred) |
| Shortlist tap reopens dossier | design-prd.md | BROKEN |
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
| No URL routing / deep linking | Structural UX Gaps | EXACT |
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
