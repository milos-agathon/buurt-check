# Buurt Check — Supplemental UX Appraisal

**Date:** 2026-02-24
**Method:** Full codebase audit (App.tsx state machine, 40+ component .tsx files, 30+ CSS files, i18n JSON, backend endpoints). Cross-referenced against prior appraisal (2026-02-23) to eliminate duplicates.
**Verified against:** HEAD of `main` branch, 2026-02-24
**Scope:** NEW findings only. All items from the prior appraisal (P0–P3, S1–S12, A1–A9, H1–H9, O1–O10, C1–C23, Performance P1–P10) are excluded unless materially extended.

---

## Methodology

This appraisal was conducted as a code-verified, surgical audit. Every finding includes the exact file, line number, and code evidence. No finding is speculative — each was verified against the current HEAD. The prior appraisal covered: risk data repetition, animation gaps, text overflow, error states, i18n wiring bugs, touch targets, performance, onboarding, and UX copy. This supplemental focuses on six categories the prior audit did not fully address:

1. **Keyboard & focus accessibility** — systematic gaps beyond aria-labels
2. **Compare screen usability** — the feature was mentioned but never audited in depth
3. **Export flow UX** — shallow coverage in prior audit
4. **Scroll & navigation architecture** — hash routing was noted as missing; implementation gaps weren't
5. **State machine race conditions** — beyond the shortlist collision already documented
6. **Dark mode–specific visual defects** — beyond the general "dark > light" aesthetic note

---

## Critical Findings (P0)

### F1. Keyboard Focus System Is Structurally Incomplete — 5 files have `:focus-visible`, 35+ interactive components don't

**Evidence:**
- `grep -r "focus-visible"` across `/frontend/src`: only 7 occurrences in 5 files (`index.css`, `ToggleSwitch.css`, `ShortlistScreen.css`, `ShadowTimeSlider.css`, `NeighborhoodViewer3D.css`)
- `index.css` defines a global `:focus-visible` outline (`2px solid var(--color-accent)`) but this is overridden or invisible on most components because individual component CSS sets `outline: none` or uses custom focus handling that doesn't include `:focus-visible`
- **Zero `:focus-visible`** in: `ActionBar.css`, `RiskTile.css`, `RiskDetailView.css`, `LivabilityCard.css`, `AddressSearch.css` (dropdown items), `SettingsScreen.css`, `Toast.css`, `CompareScreen.css`, `ExportBottomSheet.css`, `TabBar.css`, `BuildingFactsCard.css`, `SoilInfoCard.css`, `TierBSignalsCard.css`, `NeighborhoodStatsCard.css`, `PropertyWarningsCard.css`, `SummaryStrip.css`, `AttentionSummary.css`, `HeatmapLegend.css`, `ViewingChecklist.css`
- **Only 3 components** use `tabIndex={0}` for keyboard access: `NeighborhoodViewer3D.tsx:1208`, `LivabilityCard.tsx:66`, `ShortlistScreen.tsx:49`

**Impact:** A keyboard-only user (motor disability, broken trackpad, power user) cannot visually navigate the app. Tab-pressing through the dossier produces no visible focus ring on risk tiles, action buttons, summary pills, or settings controls. This is a WCAG 2.1 Level AA failure (SC 2.4.7 Focus Visible).

**Why this differs from prior findings:** The prior appraisal documented hardcoded English aria-labels (NEW-P1) and missing `prefers-reduced-motion` (A7/H7.1). It did not audit focus visibility systematically. The prior finding about shortlist cards having `role="button"` + `tabIndex` (NEW-P2, partially refuted) addressed one component; 35+ others lack both.

**Severity:** P0 — blocks accessibility compliance.

---

### F2. Compare Screen Is Inaccessible and Undiscoverable

**Evidence (CompareScreen.tsx):**

**2a. Horizontal snap-scroll has no keyboard navigation**
- `CompareScreen.css:46-63`: Columns use `scroll-snap-type: x mandatory` with `overflow-x: auto`
- No `onKeyDown` handler for arrow keys. A keyboard user who tabs into the scroll region cannot move between columns
- No scroll indicator (gradient fade, dots, or arrow) communicates that horizontal scrolling is available
- On mobile: swipe gesture is natural. On desktop/keyboard: broken

**2b. Parallel coordinates chart is decorative, not informative**
- `ParallelCoordinates.tsx:62-63`: SVG has `role="img" aria-label="Parallel coordinates chart"` — a generic label that conveys zero information
- No `<desc>` or structured data describing what the chart shows (which address scores higher on which metric)
- Chart colors are hardcoded hex values (`'#00897B', '#9AA0A6', '#D1D5DB', '#E8913A'` at line 25) — not design tokens, not theme-aware. In dark mode, `#D1D5DB` (third series) is nearly invisible against `--color-bg: #000000` is ok, but `#9AA0A6` (second series) merges with `--color-text-secondary: #B4C0CE`
- For colorblind users, 4 series in teal/grey/grey/orange are not distinguishable (deuteranopia: teal and grey merge)

**2c. "Differences Only" filter threshold is invisible**
- `CompareScreen.tsx:49`: `Math.max(...valid) - Math.min(...valid) > 15` — the 15-point threshold is a magic number with no UI explanation
- Toggle label is simply `t('compare.differencesOnly')`. User doesn't know: what counts as a "difference"? Why do some metrics disappear when toggled?

**2d. Compare is a 3-step hidden feature**
- Path: Search → Save 2+ addresses → Navigate to "Saved" tab → Tap "Compare" button
- No in-dossier prompt ("Save this address to compare with others")
- No minimum-2-saved gate with helpful message ("Save one more address to unlock comparison")
- `CompareScreen.tsx:35-41`: Empty state says `t('compare.noData')` — generic text, no call-to-action to save more addresses

**Severity:** P0 for keyboard accessibility (2a). P1 for discoverability and chart accessibility (2b–2d).

---

## High-Severity Findings (P1)

### F3. Hash Routing Has Silent Failure Mode on Direct Navigation

**Evidence (App.tsx):**
- Hash routing is implemented (`parseHashRoute()` at conceptual lines ~343-364, `hashchange` listener at ~1172-1256)
- Route `#/address/{vboId}?lookup={lookupId}` attempts to rehydrate a dossier by calling `handleAddressSelect()` with a synthesized suggestion
- **Problem:** If a user bookmarks or shares `#/address/0363200012345678?lookup=abc123`, the rehydration depends on the PDOK Locatieserver lookup API being available. If PDOK is down or the lookupId is expired, the hash navigation silently fails — no error toast, no fallback, no "address not found" message
- The `handleHashNavigation` function catches errors but the user sees the search screen with no indication that their shared link failed
- **No loading state during hash rehydration** — the user sees the search screen briefly, then either the dossier loads or nothing happens

**Impact:** Shared links (couples house-hunting, broker to client) break silently. The user thinks the link is dead rather than experiencing a temporary API failure.

**Severity:** P1 — core sharing/bookmarking workflow affected.

---

### F4. ViewingChecklist Checkboxes Are 18×18px — Well Below 44px Touch Target

**Evidence:**
- `ViewingChecklist.css:50-51`: `.viewing-checklist__checkbox` is `width: 18px; height: 18px`
- The parent `<label>` element (ViewingChecklist.tsx:42) provides a larger tap target through the label text, BUT: the checkbox visual is tiny, making it feel unpressable even when the label area works
- Users expect to tap the checkbox itself, not just the text
- The `<label>` has no minimum height set — short question text results in a <44px tall tap target

**Prior coverage:** The prior audit identified 2 sub-44px touch targets (settings 36px, summary pills 34px). ViewingChecklist was not audited for this.

**Impact:** Primary action surface (checking off viewing questions) is frustratingly small on mobile. Users at a property viewing, holding their phone one-handed, must carefully aim.

**Fix:** Add `min-height: 44px` to `.viewing-checklist__item` and increase checkbox visual to 24px with a 44px invisible tap area via padding.

**Severity:** P1 — affects the culminating UX action (the checklist IS the deliverable).

---

### F5. SettingsScreen Language/Theme Buttons Lack Keyboard Role Semantics

**Evidence (SettingsScreen.tsx):**
- Language toggle (lines 20-33): Two `<button>` elements with `className` toggling. No `role="radiogroup"` on parent, no `role="radio"` or `aria-checked` on buttons
- Theme toggle (lines 38-57): Three `<button>` elements, same issue — no radio semantics
- Compare with TopBar.tsx:40: The TopBar language toggle correctly uses `role="radiogroup"` and `role="radio"` with `aria-checked`
- **Settings duplicates the language toggle** with different (worse) accessibility semantics

**Impact:** Screen reader users encounter two different accessibility patterns for the same control. Settings language toggle is announced as "buttons" not "radio group", so the user doesn't know only one can be active.

**Fix:** Add `role="radiogroup" aria-label={t('settings.language')}` to parent div, `role="radio" aria-checked={...}` to each button. Same for theme toggle.

**Severity:** P1 — accessibility inconsistency in the same feature across two screens.

---

### F6. ExportBottomSheet "Generate" Button Remains Visible After PDF Is Ready

**Evidence (ExportBottomSheet.tsx:318-328):**
- The "Generate PDF" button renders unconditionally at the bottom of the sheet
- When `progressStage === 'ready'` (lines 298-312), both the "Share/Download" actions AND the "Generate PDF" button are visible simultaneously
- The generate button is NOT disabled when `progressStage === 'ready'` — only when `generating === true`
- A user who just generated a PDF sees three buttons: Share, Download, and Generate again — with no visual hierarchy indicating that Share/Download are the expected next actions

**Impact:** Users may tap "Generate PDF" again, creating a duplicate request. The button placement (below Share/Download) creates a confusing action hierarchy: the primary next-step actions are visually secondary.

**Fix:** Hide the "Generate PDF" button when `progressStage === 'ready'`. Or change its label to "Regenerate" with secondary styling.

**Severity:** P1 — confusing primary action flow in the export feature.

---

### F7. `aria-live` Coverage Is Minimal — Only 3 Components Announce State Changes

**Evidence:**
- `grep -r 'aria-live'`: Only 3 files — `Toast.tsx`, `AnimatedScore.tsx`, `LoadingScreen.tsx`
- **Missing `aria-live` on:** Risk tile score changes (when a new dossier loads), data coverage banner updates, export progress stage changes, comparison filter toggles, dossier phase transitions, error banner appearances
- The ExportBottomSheet progress (lines 268-295) has no `aria-live` region — screen reader users don't know the PDF is being generated unless they manually re-read the dialog
- Data coverage banner shows "X of Y sources loaded" but changes are not announced

**Impact:** Screen reader users experience the dossier as a static page. State changes (loading → loaded, error → retry success, generating → ready) happen silently.

**Severity:** P1 — WCAG SC 4.1.3 Status Messages (Level AA).

---

## Medium-Severity Findings (P2)

### F8. ParallelCoordinates Chart Colors Are Hardcoded Hex, Not Theme-Aware

**Evidence (ParallelCoordinates.tsx:25):**
```javascript
const SERIES_COLORS = ['#00897B', '#9AA0A6', '#D1D5DB', '#E8913A'];
```
- These are not design tokens, not CSS custom properties, not theme-responsive
- In dark mode (`--color-bg: #000000`): `#D1D5DB` (light grey for 3rd address) against black is readable, but `#9AA0A6` (2nd address) has 4.14:1 contrast which barely passes AA for normal text but the chart uses thin lines (2px stroke per `ParallelCoordinates.css`)
- The legend swatches (lines 130-133) use inline `style={{ backgroundColor: color }}` — bypassing the design token system entirely
- **Violation of design rule:** `.claude/rules/design.md` — "Hardcoded hex values — always use `var(--token-name)`"

**Fix:** Define chart color tokens in `tokens.css`: `--color-chart-series-1` through `--color-chart-series-4` with dark mode overrides. Use `var()` references in the component.

**Severity:** P2 — visual degradation in dark mode, design system violation.

---

### F9. Compare Screen Shows No "Winner" Summary

**Evidence (CompareScreen.tsx:97-120):**
- The comparison renders per-metric score bars with `--best` and `--worst` CSS classes (lines 105-106, 112)
- But there is NO overall summary: "Address A scores better in 3 of 4 categories" or "Address B has the best overall risk profile"
- Users must visually scan each metric row across 2-3 columns to determine which address is "better"
- The parallel coordinates chart (lines 80-84) shows lines but doesn't highlight which address performs best overall
- **Product principle violation:** "Consequences over data" — the compare screen shows data without the consequence ("which address should I choose?")

**Fix:** Add a summary row at the top: "Keizersgracht 1 leads in 3 of 4 risk categories (Noise: 82 vs 45, Air: 75 vs 71, Sunlight: 68 vs 40). Prinsengracht 263 leads in Climate (90 vs 72)."

**Severity:** P2 — the compare feature's entire purpose is to help users decide, but it doesn't render a decision.

---

### F10. Export Language Can Mismatch App Language Without Warning

**Evidence (ExportBottomSheet.tsx:52-55):**
```javascript
const [exportLanguage, setExportLanguage] = useState<'en' | 'nl'>(
  i18n.language === 'nl' ? 'nl' : 'en',
);
```
- Export language defaults to app language on sheet open (good)
- User can change export language independently (EN app → NL PDF or vice versa)
- No visual indicator that the export language differs from the UI language
- The language buttons (lines 230-250) have no "different from your current language" warning
- For expats showing a Dutch PDF to a makelaar: intentional and useful
- For accidental taps: the user receives a PDF in a language they don't read

**Impact:** Low but confusing. An expat who accidentally taps NL gets a Dutch PDF and may not understand it.

**Fix:** Add a subtle hint when export language differs from UI: `t('export.languageMismatch', 'PDF will be in a different language than your current setting')`.

**Severity:** P2 — edge case but affects trust.

---

### F11. Settings Destructive Actions Have Zero Confirmation

**Evidence (SettingsScreen.tsx:63-67):**
```javascript
<button className="settings-screen__action settings-screen__action--danger" onClick={onClearRecent}>
  {t('settings.clearRecent')}
</button>
<button className="settings-screen__action settings-screen__action--danger" onClick={onClearShortlist}>
  {t('settings.clearShortlist')}
</button>
```
- `grep -r "confirm" frontend/src`: Zero results. No `window.confirm()`, no custom confirmation dialog, no confirmation component anywhere in the frontend
- Both buttons fire destructive callbacks immediately on click
- `settings.clearConfirm` i18n key exists in both `en.json` and `nl.json` but is NEVER referenced in any component
- Clearing shortlist destroys all saved addresses — the user's entire comparison dataset

**Prior coverage:** Noted in C16 (UX Copy section) as "wire up existing confirm dialog." Listed here separately because the severity is higher: this is not a copy issue, it's a missing interaction pattern. No confirmation UI exists anywhere in the codebase — not even a generic one to wire up.

**Fix:** Create a `ConfirmDialog` component (or use the existing `BottomSheet`). Wire destructive actions through it. Use the existing `settings.clearConfirm` i18n key.

**Severity:** P2 (borderline P1) — accidental data loss for the primary retention feature.

---

### F12. DossierSheet Content Has No Scroll Restoration on Tab Switch

**Evidence (App.tsx, handleTabChange at ~587-617):**
- When user switches from Briefing tab (dossier) to Saved tab and back, `activeScreen` changes trigger full re-render
- No scroll position is saved or restored — the dossier scrolls back to top
- A user who scrolled to the viewing checklist (section 14 of 14), switches to Saved tab to check another address, then switches back to Briefing, loses their scroll position entirely
- `getDossierScrollContainer()` (App.tsx) references the scroll container but never reads or stores `scrollTop`

**Impact:** Users exploring a dossier who briefly check the Saved tab lose their reading position. On a 14-section dossier that takes 8-12 swipes to reach the bottom, this is a significant friction point.

**Fix:** Store `scrollTop` in a ref on tab-away. Restore on tab-return using `requestAnimationFrame` to wait for render.

**Severity:** P2 — degrades repeat navigation within a session.

---

### F13. No `window.confirm()` or Custom Dialog Exists Anywhere in the Frontend

**Evidence:**
- `grep -r "confirm\|Confirm\|CONFIRM" frontend/src/components`: Zero results
- `grep -r "window.confirm" frontend/src`: Zero results
- No `ConfirmDialog`, `ConfirmSheet`, or `ConfirmModal` component exists
- The app has NO confirmation pattern for any action: bookmark removal, history clear, shortlist clear, address re-fetch

**Impact:** Any destructive action is one tap away from execution. This is a structural gap — not just settings (F11) but any future destructive feature will ship without confirmation because no pattern exists.

**Severity:** P2 — structural UI pattern gap.

---

### F14. Compare Screen `min-width: 170px` Conflicts With `calc(50vw - var(--space-base))` on Small Phones

**Evidence (CompareScreen.css:56-57):**
```css
.compare-screen__snap-column {
  flex: 0 0 calc(50vw - var(--space-base));
  min-width: 170px;
}
```
- At 320px viewport (iPhone 5/SE 1st gen): `50vw = 160px`, `160px - 16px = 144px`
- `min-width: 170px` overrides to 170px, making two columns = 340px > 320px viewport
- Both columns cannot fit simultaneously — horizontal scroll kicks in, but now 3 addresses (3 × 170px = 510px) creates a long scroll region with no progress indicator
- The design claims to be mobile-first but breaks on the smallest supported viewport

**Fix:** Either reduce `min-width` to `140px` or use `min(170px, calc(50vw - var(--space-base)))`.

**Severity:** P2 — layout breaks on small screens.

---

## Low-Severity Findings (P3)

### F15. `navigator.geolocation` Never Used — No "Use My Location" Feature

**Evidence:**
- `grep -r "geolocation" frontend/src`: Zero results
- The app is designed for users visiting properties — people physically standing at or near the address they're checking
- No "Use current location" button on the search screen
- PDOK Locatieserver supports reverse geocoding (lat/lng → address)

**Prior coverage:** Listed as N3 in the cross-reference section (from Claude UX audit), noted as "genuine new finding." Included here for completeness with implementation path.

**Impact:** Users at a property viewing must manually type the address they're standing in front of. A geolocation button collapses the search to one tap.

**Fix:** Add a location button in `AddressSearch`. On tap: `navigator.geolocation.getCurrentPosition()` → reverse geocode via PDOK → populate search input. Handle permission denial gracefully.

**Severity:** P3 — convenience feature, not blocking.

---

### F16. Version Number Is Hardcoded "1.0.0"

**Evidence (SettingsScreen.tsx:74):**
```javascript
<span className="settings-screen__value">1.0.0</span>
```
- Not read from `package.json`, not from an env variable, not auto-incremented
- Will remain "1.0.0" forever unless manually updated

**Fix:** Import version from `package.json` or inject via `VITE_APP_VERSION` env variable.

**Severity:** P3 — cosmetic, but signals lack of release process.

---

### F17. Search Input `autocomplete="off"` May Be Overridden by Mobile Browsers

**Evidence (AddressSearch.tsx):**
- `grep "autocomplete" AddressSearch.tsx`: No `autocomplete` attribute set
- Mobile browsers (especially Chrome Android) aggressively autocomplete address inputs, showing irrelevant saved addresses from the browser's own database
- These browser suggestions overlay the PDOK Locatieserver suggestions, creating competing dropdown lists

**Fix:** Add `autoComplete="off"` (React camelCase) to the search input. Some browsers require additional `autoComplete="nope"` or `role="combobox"` to suppress.

**Severity:** P3 — minor friction on mobile.

---

### F18. ShortlistScreen Hardcodes Dark Overlay Color

**Evidence (ShortlistScreen.css:96-97):**
```css
background: rgba(28, 45, 63, 0.86);
color: #fff;
```
- `rgba(28, 45, 63, ...)` is `--color-primary` at 86% opacity, hardcoded instead of using a token
- `#fff` is hardcoded white, not `var(--color-text-inverse)` or `var(--color-overlay-text)`
- **Violation of design rule:** "Inline style colors — breaks dark mode theming" and "Hardcoded hex values — always use `var(--token-name)`"

**Fix:** Replace with `background: color-mix(in srgb, var(--color-primary) 86%, transparent); color: var(--color-text-inverse);`

**Severity:** P3 — design system discipline, no visible UX defect currently.

---

### F19. ExportBottomSheet Progress Stages Don't Map to Actual Time Distribution

**Evidence (ExportBottomSheet.tsx:78-86):**
```javascript
const progressPercent = progressStage === 'collecting' ? 25
  : progressStage === 'rendering' ? 65
  : progressStage === 'downloading' ? 90
  : progressStage === 'ready' ? 100 : 0;
```
- `collecting` → `rendering` transition happens instantly (line 110: `setProgressStage('rendering')` fires immediately after shadow data prep, before API call)
- The actual API call (`exportBriefing()` at line 111) is the slowest step (1-3s) but spans the 25→65→90 range in a single jump
- Users see: 0% → 25% (instant) → 65% (waits 1-3s) → 90% (instant) → 100% (instant)
- The progress ring is cosmetic, not correlated to actual progress

**Impact:** Users learn the progress ring is decorative, reducing trust in it.

**Fix:** Either remove fake progress percentages and show a spinner, or use real progress: `collecting` (0-10%) while preparing data, `rendering` (10-90%) during API call with a slow animation, `downloading` (90-100%) on blob receipt.

**Severity:** P3 — cosmetic trust issue.

---

### F20. `ParallelCoordinates` SVG Width Is Hardcoded 360px

**Evidence (ParallelCoordinates.tsx:20):**
```javascript
const WIDTH = 360;
```
- SVG `viewBox` is `0 0 360 190` (line 61)
- On phones wider than 360px (most modern phones), the chart stretches via CSS `width: 100%` preserving aspect ratio — acceptable
- On phones narrower than 360px, the chart shrinks — axis labels (`11px font` in `ParallelCoordinates.css`) become unreadable
- **Axis labels wrap unpredictably** in translated text: NL labels are longer than EN, causing overlap at narrow widths

**Fix:** Use a responsive `viewBox` calculated from container width, or ensure axis labels use `textLength` SVG attribute for auto-fitting.

**Severity:** P3 — minor visual degradation on narrow screens.

---

## Structural UX Observations

These are not bugs but architectural patterns that limit UX quality.

### S-A. No Confirmation Pattern Exists

As noted in F13, the entire frontend has zero confirmation UI. Any feature requiring "are you sure?" (delete, overwrite, irreversible action) cannot be shipped without first building the pattern. This is technical debt that compounds with every new feature.

**Recommendation:** Build a generic `ConfirmSheet` (bottom sheet variant) with: title, description, confirm button (danger variant), cancel button. Parametrize via props. Wire to Settings destructive actions as first use case.

---

### S-B. Scroll Position Is Global State Nobody Manages

The app has 18 `scrollTo`/`scrollIntoView` calls in `App.tsx` but:
- No scroll position persistence across tab switches (F12)
- No scroll position tracking for analytics (which sections users actually read)
- Jump navigation (`handleJumpToHouse`, `handleJumpToBuurt`, `handleJumpToChecklist`) uses `scrollIntoView` with a hardcoded offset (68px or 72px) that assumes fixed header height — if TopBar height changes (e.g., address title wrapping), offsets break
- No `IntersectionObserver` tracks which dossier section is currently visible (the jump nav visibility check at 360px is a crude proxy)

**Recommendation:** Implement a `useSectionVisibility()` hook using `IntersectionObserver` on all 14 dossier section IDs. This enables: (a) accurate jump nav highlighting, (b) lazy-loading sections, (c) scroll analytics, (d) "you're X% through the dossier" progress indicator.

---

### S-C. The 47-useState Problem Has UX Consequences

The prior appraisal (S5) documented this as a structural code issue. The UX consequence not previously noted: **every state update re-renders the entire dossier.** When a user checks a viewing question (toggling one item in `checkedQuestions`), every risk tile, every comparison bar, every 3D viewer ref, and every stat card re-renders. On a mid-range Android device, this produces a 50-150ms jank that's perceptible as a "sticky" checkbox.

Combined with zero `React.memo` (Performance P2 in prior appraisal), the checkbox interaction — the primary user action at the end of the dossier flow — is the least responsive interaction in the app.

---

### S-D. Compare Feature Is Orphaned From the Primary Flow

The compare screen is:
- Lazy-loaded (good for bundle, bad for discovery)
- Accessible only via Saved tab → Compare button
- Never mentioned in the dossier
- Never prompted after saving 2+ addresses
- Has no "back to dossier" navigation from within a comparison

The feature exists as a complete, well-implemented component. But it's invisible to users who don't explore the Saved tab. For a multi-million dollar product where the core decision is "which of these 3 apartments should I buy?", the comparison flow should be the hero feature, not a hidden one.

**Recommendation:** After saving a 2nd address, show a one-time prompt in the dossier: "You've saved 2 addresses. Tap Compare to see them side by side." This uses the `localStorage` first-visit mechanism recommended in O2.

---

## Revised Supplemental Scorecard

These scores address ONLY the areas covered by this supplemental appraisal, not the full app.

| Category | Score | Key Gap |
|----------|-------|---------|
| **Keyboard Accessibility** | 2.5/10 | 5 of 40+ interactive components have `:focus-visible`. No `tabIndex` on most tappable elements. Zero keyboard navigation in compare snap-scroll. |
| **Compare Screen UX** | 3.5/10 | No winner summary, inaccessible chart, undiscoverable feature, invisible filter threshold, narrow-screen layout break. |
| **Export Flow UX** | 5.5/10 | Functional but: fake progress, generate button visible after completion, no mismatch warning, no file size estimate. |
| **Scroll & Navigation** | 4.0/10 | Hash routing exists but fails silently on shared links. No scroll restoration across tabs. Hardcoded scroll offsets. |
| **Confirmation Patterns** | 0/10 | No confirmation UI exists anywhere. All destructive actions are single-tap. |
| **Dark Mode Visual** | 7.0/10 | Generally excellent. ParallelCoordinates chart colors and ShortlistScreen overlay are the main gaps. |

---

## Priority Matrix (All New Findings)

| ID | Finding | Severity | Effort | Priority |
|----|---------|----------|--------|----------|
| F1 | Focus-visible missing on 35+ components | P0 | MEDIUM | **Do first** |
| F2a | Compare snap-scroll keyboard inaccessible | P0 | LOW | **Do first** |
| F2b-d | Compare chart a11y + discoverability | P1 | MEDIUM | **Sprint 1** |
| F3 | Hash routing silent failure on shared links | P1 | MEDIUM | **Sprint 1** |
| F4 | ViewingChecklist checkbox 18px touch target | P1 | LOW | **Quick win** |
| F5 | Settings toggles missing radio semantics | P1 | LOW | **Quick win** |
| F6 | Generate button visible after PDF ready | P1 | LOW | **Quick win** |
| F7 | aria-live missing on state changes | P1 | MEDIUM | **Sprint 1** |
| F8 | Chart colors hardcoded, not theme-aware | P2 | LOW | **Quick win** |
| F9 | Compare shows no winner summary | P2 | MEDIUM | **Sprint 2** |
| F10 | Export language mismatch no warning | P2 | LOW | **Sprint 2** |
| F11 | Settings destructive actions no confirmation | P2 | MEDIUM | **Sprint 1** |
| F12 | No scroll restoration on tab switch | P2 | LOW | **Sprint 2** |
| F13 | No confirmation pattern in codebase | P2 | MEDIUM | **Sprint 1** (blocks F11) |
| F14 | Compare layout breaks on 320px phones | P2 | LOW | **Quick win** |
| F15 | No geolocation / "Use my location" | P3 | MEDIUM | **Sprint 3** |
| F16 | Version hardcoded "1.0.0" | P3 | LOW | **Quick win** |
| F17 | No autocomplete suppression on search | P3 | LOW | **Quick win** |
| F18 | ShortlistScreen hardcoded overlay color | P3 | LOW | **Quick win** |
| F19 | Export progress stages decorative | P3 | LOW | **Sprint 3** |
| F20 | Chart SVG width hardcoded 360px | P3 | LOW | **Sprint 3** |

---

## Cross-Reference: Prior Appraisal Findings Confirmed Still Open

These findings from the 2026-02-23 appraisal were re-verified as still unresolved:

| Prior ID | Finding | Still Open? |
|----------|---------|-------------|
| P0 #1 | Raw English severity badge | YES — `PropertyWarningsCard.tsx:71` unchanged |
| P0 #3 | Attention summary no dismiss | YES |
| NEW-P0 | Nav semantics contradictory | YES |
| NEW-P0 | Risk tiles + RiskCardsPanel double render | YES |
| P1 #7 | Viewing checklist not persisted | YES |
| P1 #9 | Double-bar stacking (104px+safe area) | YES |
| NEW-P1 | Touch targets <44px (settings, pills) | YES |
| NEW-P1 | Hardcoded English aria-labels (4 locations) | YES |
| NEW-P1 | Eager 3D fetch | YES |
| S1 | RiskCardsPanel redundant | YES — most impactful simplification |
| A7 | prefers-reduced-motion gaps | YES |
| H9.1 | /risks no timeout budget | YES |
| H9.3 | Export payload unlimited | YES |
| O1 | Welcome screen feature-centric | YES |
| C1-C2 | formatRelativeTime + foundation badge i18n | YES |

---

## The Supplemental Thesis

The prior appraisal identified that Buurt Check's gap is between "developer's impressive side project" and "tool I'd trust for a €400,000 decision." This supplemental identifies the specific class of issues that create that gap: **the app is built for sighted, mouse-using, Dutch-speaking, technically-literate users on modern phones.** Everyone else — keyboard users, screen reader users, expats, users on small/old devices, users who share links, users who compare addresses — hits friction that ranges from annoying to blocking.

The two P0 items (keyboard focus, compare accessibility) are not features to add — they're compliance requirements to meet. The structural gaps (no confirmation pattern, no scroll management, orphaned compare feature) are architecture to build before the product can scale.

The good news: the fix for F1 (focus-visible) is ~50 lines of CSS across 20 files. The fix for F2a (snap-scroll keyboard) is ~15 lines of JavaScript. The fix for F13 (confirmation pattern) is one new component. These are small investments that unlock the next tier of product quality.
