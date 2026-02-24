# Buurt Check — UX Epic Backlog

> **Source:** Deduplicated from `docs/plans/2026-02-23-ux-appraisal.md` (4 auditors, 130+ findings, verified against HEAD `6cac7dd`)
> **Date:** 2026-02-24
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Buurt Check from a technically solid data aggregator (5.5/10 UX) into a product that earns trust for a EUR 400,000 decision (8+/10 UX).

**Method:** 130+ verified findings deduplicated into 10 epics, 85 stories. Every story specifies exact files, why it matters, what 10/10 looks like, and a binary definition of done.

**Deduplication key:** Where multiple audit sections reported the same finding (e.g., `formatRelativeTime` appears as C1, H3.1, P3#18, and NEW-P1), they are merged into one story with all source IDs noted.

---

## How to Read This Document

Each story follows this structure:

- **What:** Exactly what to change, with file paths and line numbers
- **Why:** The user-facing problem this solves
- **10/10:** What excellence looks like — not just "fixed" but "best-in-class"
- **DoD:** Binary checklist — every item must be true to close the story

Stories are ordered by priority within each epic. Epics are ordered by impact.

---

## Epic 1: Accessibility & WCAG 2.1 AA Compliance

> **Theme:** The app is built for sighted, mouse-using users on modern phones. Keyboard users, screen reader users, and motion-sensitive users are underserved. This epic closes WCAG 2.1 AA compliance gaps.

### 1.1 Add `prefers-reduced-motion` compliance globally

**Appraisal IDs:** A7, H7.1

**What:**
- Wrap app root in `<MotionConfig reducedMotion="user">` in `frontend/src/main.tsx` (currently 13 lines, no MotionConfig import)
- Add `@media (prefers-reduced-motion: reduce)` blocks to 7 CSS files that have animations but lack the media query:
  - `frontend/src/components/NeighborhoodViewer3D.css` — `viewer3d-pulse` keyframe
  - `frontend/src/components/RiskTile.css` — `risk-tile-pulse` keyframe
  - `frontend/src/components/LivabilityCard.css` — bar width + section height transitions
  - `frontend/src/components/LivabilityDetailView.css` — comparison bar width transition
  - `frontend/src/components/RiskDetailView.css` — comparison bar width + background transitions
  - `frontend/src/components/ui/Toast.css` — `toastSlideUp` keyframe
  - `frontend/src/components/ui/BottomSheet.css` — `bottomSheetSlideUp` + `bottomSheetBackdropIn` keyframes
- In `frontend/src/hooks/useAnimationPerformance.ts`: if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, return `shouldUseFallback: () => true` immediately

**Why:** 7 of 12 CSS animation files and all 6 Framer Motion locations ignore the OS accessibility setting. This is a WCAG 2.1 SC 2.3.3 violation. Users who need reduced motion still see slide-ups, pulses, comparison bar transitions, and layout animations.

**10/10:** Every animation in the app — CSS `@keyframes`, CSS `transition`, and Framer Motion `animate`/`whileTap`/`layoutId` — respects the OS reduced-motion preference. Content remains fully accessible; only motion is removed. Test mock at `setup.ts:26` is updated to cover both motion preferences.

**DoD:**
- [ ] `<MotionConfig reducedMotion="user">` wraps `<App />` in `main.tsx`
- [ ] All 7 CSS files have `@media (prefers-reduced-motion: reduce)` with `animation: none` or `transition: none`
- [ ] `useAnimationPerformance` returns fallback when reduced-motion is active
- [ ] Test: verify Framer Motion respects reduced-motion (mock `matchMedia`)
- [ ] Test: verify CSS animations are suppressed (check computed styles in reduced-motion)
- [ ] `npm run build` passes
- [ ] `npm run test` passes

---

### 1.2 Add `:focus-visible` styles to all interactive components

**Appraisal IDs:** F1

**What:**
- Currently only 7 `:focus-visible` rules exist across 5 of 50 CSS files (`index.css`, `NeighborhoodViewer3D.css`, `ShadowTimeSlider.css`, `ShortlistScreen.css`, `ToggleSwitch.css`)
- A global rule exists in `frontend/src/index.css:27` but is overridden or invisible on most components
- Add explicit `:focus-visible` outline styles to every interactive element across 40+ components. Use `outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: inherit` as the base pattern.
- Key files needing focus styles: `ActionBar.css`, `AddressSearch.css`, `AttentionSummary.css`, `BuildingFactsCard.css`, `CompareScreen.css`, `ExportBottomSheet.css`, `LivabilityCard.css`, `PropertyWarningsCard.css`, `RiskTile.css`, `SettingsScreen.css`, `SummaryStrip.css`, `TabBar.css`, `TopBar.css`, `ViewingChecklist.css`, `SoilInfoCard.css`, `TierBSignalsCard.css`, `DossierSheet.css`

**Why:** WCAG 2.1 SC 2.4.7 requires visible keyboard focus indicators. Only 10% of CSS files have them. Every keyboard user navigating this app has no visual indication of which element is focused.

**10/10:** Every button, link, input, checkbox, and interactive card in the app shows a visible, consistent Arctic Teal focus ring when navigated via keyboard. Focus rings never appear on mouse click (`:focus-visible` not `:focus`). Dark mode focus ring is equally visible.

**DoD:**
- [ ] Every component CSS file with interactive elements has `:focus-visible` styles
- [ ] Focus ring uses `var(--color-accent)` with `2px` width and `2px` offset
- [ ] Focus ring is visible in both light and dark themes
- [ ] Tab through entire app produces visible focus on every interactive element
- [ ] `npm run build` passes

---

### 1.3 Fix all touch targets below 44px minimum

**Appraisal IDs:** F4, G2, NEW-P1a

**What:** 5 touch target violations across 4 components:

| Component | File | Current | Target |
|-----------|------|---------|--------|
| ViewingChecklist checkbox | `ViewingChecklist.css:50-51` | 18px | 44px (via label padding) |
| ViewingChecklist label | `ViewingChecklist.css:36-47` | ~24px (3px vertical padding) | 44px min-height |
| Dossier jump nav buttons | `App.css:161,178` | 28px height | 44px min-height |
| Summary pills | `SummaryStrip.css` | 34px height | 44px min-height |
| Settings button | `TopBar.css` | 36px | 44px min-height |

**Why:** Apple HIG 44px minimum is a documented project convention. Sub-44px targets cause mis-taps on mobile, the primary platform.

**10/10:** Every tappable element in the app meets 44px minimum in both dimensions. Touch targets are tested at 375px (iPhone SE) and 360px (small Android) widths.

**DoD:**
- [ ] ViewingChecklist: increase label min-height to 44px, increase checkbox tap area via padding/pseudo-element
- [ ] Jump nav buttons: `min-height: 44px` in `App.css`
- [ ] Summary pills: `min-height: 44px` in `SummaryStrip.css`
- [ ] Settings button: `min-height: 44px; min-width: 44px` in `TopBar.css`
- [ ] Visual regression check: no layout breakage at 375px
- [ ] `npm run build` passes

---

### 1.4 Add ARIA combobox pattern to AddressSearch

**Appraisal IDs:** G4

**What:**
- `frontend/src/components/AddressSearch.tsx:155-163` — input lacks `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`
- Dropdown already has `role="listbox"` + `role="option"` + `aria-selected`
- Add: `role="combobox"` on input, `aria-expanded={suggestions.length > 0}`, `aria-controls="address-suggestions"`, `aria-activedescendant={activeId}` pointing to the currently highlighted option
- Add `id="address-suggestions"` to the dropdown container

**Why:** The ARIA combobox pattern is the standard for search-with-autocomplete. Screen readers need these attributes to announce suggestion count and active selection.

**10/10:** VoiceOver and NVDA announce: "Search address, combobox, expanded, 5 suggestions" when dropdown opens, and read the active suggestion name as user arrows through the list.

**DoD:**
- [ ] Input has `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`
- [ ] Dropdown has matching `id`
- [ ] Active suggestion tracked in state and reflected in `aria-activedescendant`
- [ ] Test: ARIA attributes render correctly
- [ ] `npm run build` passes

---

### 1.5 Add keyboard navigation to CompareScreen snap-scroll

**Appraisal IDs:** F2a

**What:**
- `frontend/src/components/CompareScreen.tsx` — `CompareScreen.css:50` has `scroll-snap-type: x mandatory`
- Zero `onKeyDown` handlers in CompareScreen
- Add `onKeyDown` handler: Left/Right arrows scroll to prev/next column, Home/End jump to first/last
- Add `tabIndex={0}`, `role="region"`, `aria-label={t('compare.columns')}` to the scroll container

**Why:** Keyboard users cannot navigate between comparison columns. The entire compare feature is keyboard-inaccessible.

**10/10:** Keyboard user can Tab into the comparison area, use Left/Right to navigate columns, and hear the current address announced by screen reader.

**DoD:**
- [ ] Left/Right arrow keys scroll to adjacent columns
- [ ] Home/End jump to first/last column
- [ ] Scroll container has `tabIndex={0}`, `role="region"`, `aria-label`
- [ ] Current column announced on navigation
- [ ] Test: keyboard navigation behavior
- [ ] `npm run build` passes

---

### 1.6 Add radio semantics to SettingsScreen toggles

**Appraisal IDs:** F5

**What:**
- `frontend/src/components/SettingsScreen.tsx:21-56` — language and theme toggles use plain `<button>` elements with `--active` class modifier
- `TopBar.tsx:40` has the correct pattern: `role="radiogroup"` + `role="radio"` + `aria-checked`
- Replicate TopBar's ARIA pattern in SettingsScreen for both language and theme button groups

**Why:** Same control, two different a11y implementations. SettingsScreen toggles are semantically incorrect — screen readers announce them as generic buttons, not mutually exclusive options.

**10/10:** Screen reader announces "Language, radio group, NL, selected, 1 of 2" when focusing the language toggle in SettingsScreen. Identical semantics to TopBar.

**DoD:**
- [ ] Language buttons wrapped in `role="radiogroup"` with `aria-label={t('settings.language')}`
- [ ] Each button has `role="radio"` and `aria-checked={isActive}`
- [ ] Theme buttons same pattern
- [ ] Test: ARIA attributes render correctly for both groups
- [ ] `npm run build` passes

---

### 1.7 Add ARIA progressbar to ExportBottomSheet

**Appraisal IDs:** G3

**What:**
- `frontend/src/components/ExportBottomSheet.tsx` — SVG circle with `strokeDasharray`/`strokeDashoffset` for progress but NO `role="progressbar"`, NO `aria-valuenow/valuemin/valuemax`
- `LoadingScreen.tsx:168` has the correct pattern to copy
- Add `role="progressbar"`, `aria-valuenow={progress}`, `aria-valuemin={0}`, `aria-valuemax={100}`, `aria-label={t('export.generating')}`

**Why:** Screen readers cannot convey PDF generation progress. Sighted users see the ring fill; blind users hear nothing.

**10/10:** Screen reader announces "Generating PDF, progress 65%" during export. Progress updates are announced via `aria-valuenow` changes.

**DoD:**
- [ ] SVG progress element has `role="progressbar"` and `aria-valuenow/min/max`
- [ ] Progress label uses i18n key
- [ ] Test: ARIA attributes render with correct values at each stage
- [ ] `npm run build` passes

---

### 1.8 Add accessible description to ParallelCoordinates chart

**Appraisal IDs:** F2b

**What:**
- `frontend/src/components/ui/ParallelCoordinates.tsx:62` — `role="img" aria-label="Parallel coordinates chart"` is generic and hardcoded English
- Add `<desc>` element inside SVG with dynamic content: `t('compare.chartDescription', { addresses: addressNames.join(', '), categories: categoryNames.join(', ') })`
- Replace hardcoded `aria-label` with `t('compare.chartLabel')`

**Why:** Screen reader users hear "Parallel coordinates chart" with no information about what addresses or categories are being compared.

**10/10:** Screen reader announces: "Comparison chart showing Keizersgracht 1 vs Prinsengracht 263 across noise, air quality, climate risk, and sunlight."

**DoD:**
- [ ] `aria-label` uses i18n key with dynamic address/category data
- [ ] SVG contains `<desc>` with human-readable chart description
- [ ] i18n keys added to both `en.json` and `nl.json`
- [ ] Test: `aria-label` renders with address names
- [ ] `npm run build` passes

---

## Epic 2: Internationalization Bugs

> **Theme:** The i18n architecture is solid (452 keys, parity-enforced), but wiring bugs leave English strings in the Dutch UI. These are not missing translations — the translations exist but are bypassed in code.

### 2.1 Fix `formatRelativeTime` to use existing i18n keys

**Appraisal IDs:** C1, H3.1, P3#18, NEW-P1b (4 independent findings, same bug)

**What:**
- `frontend/src/components/AddressSearch.tsx:12-23` — `formatRelativeTime()` returns hardcoded English: `"just now"`, `"3m ago"`, `"yesterday"`, `"3d ago"`
- i18n keys `search.recentTime.justNow`, `search.recentTime.minutesAgo`, etc. already exist in BOTH `en.json` and `nl.json`
- Replace each hardcoded return with the corresponding `t()` call using `{{count}}` interpolation

**Why:** Every Dutch user sees English timestamps in the recent search list. The translations exist — they're just not wired.

**10/10:** Recent searches show "zojuist", "3 min geleden", "gisteren" in NL mode and "just now", "3m ago", "yesterday" in EN mode. Date formatting respects app language via `toLocaleDateString(i18n.language === 'nl' ? 'nl-NL' : 'en-US')`.

**DoD:**
- [ ] All `formatRelativeTime` return values use `t()` calls
- [ ] `toLocaleDateString` at line 22 passes `i18n.language`-derived locale
- [ ] Test: render recent search in NL mode, verify Dutch time strings appear
- [ ] Test: render recent search in EN mode, verify English time strings appear
- [ ] `npm run build` passes
- [ ] `npm run test` passes

---

### 2.2 Fix PropertyWarningsCard raw backend severity string

**Appraisal IDs:** P0#1, C2, H3.3 (3 independent findings, same bug)

**What:**
- `frontend/src/components/PropertyWarningsCard.tsx:71` — `{foundation_risk.level}` renders raw backend string (`"high"`, `"medium"`, `"low"`) directly as badge text
- A `SeverityBadge` component with proper i18n exists and is used elsewhere
- Replace raw string with `<SeverityBadge severity={mapFoundationLevel(foundation_risk.level)} />` or at minimum `t('warnings.foundation_level.${foundation_risk.level}')`
- Add NL translations for foundation levels if missing

**Why:** Dutch users see untranslated English risk levels ("high", "medium", "low") on the foundation risk badge. This is the single most visible i18n bug — it appears on every property with foundation risk data.

**10/10:** Foundation risk badge uses the same `SeverityBadge` component as all other risk indicators, with canonical vocabulary (`good`/`moderate`/`poor`/`critical`) mapped from backend values, fully translated.

**DoD:**
- [ ] `foundation_risk.level` is mapped through i18n or `SeverityBadge`
- [ ] NL translations exist for all foundation risk levels
- [ ] No raw backend strings appear in the component's render output
- [ ] Test: render with `level: "high"` in NL mode, verify Dutch label appears
- [ ] `npm run build` passes

---

### 2.3 Fix AttentionSummary hardcoded English category labels

**Appraisal IDs:** H3.2

**What:**
- `frontend/src/components/AttentionSummary.tsx:37-42` — `categoryLabels` is a hardcoded English lookup object: `{ noise: 'noise risk', air: 'air quality risk', ... }`
- Used as fallback at line 48: `label: 'Critical ${categoryLabels[cat]}'`
- Replace with `t('risk.category.${cat}')` calls
- Verify i18n keys exist for all categories; add if missing

**Why:** If any i18n key resolution fails, raw English category names appear in the Dutch UI. The fallback path is English-only.

**10/10:** No hardcoded English strings in AttentionSummary. All category labels resolve through i18n with proper NL translations. Fallback chain: i18n key → backend-provided label → category code (never hardcoded English sentence).

**DoD:**
- [ ] `categoryLabels` object removed; replaced with `t()` calls
- [ ] i18n keys `risk.category.noise`, `risk.category.air`, etc. exist in both locales
- [ ] Test: render with NL locale, verify Dutch category labels
- [ ] `npm run build` passes

---

### 2.4 Move all hardcoded aria-labels to i18n

**Appraisal IDs:** C19, NEW-P1b (partial)

**What:** 5 locations with hardcoded English aria-labels:
- `TopBar.tsx:40` — `aria-label="Language"` → `aria-label={t('aria.language')}`
- `TopBar.tsx:61` — `aria-label="Settings"` → `aria-label={t('aria.settings')}`
- `TopBar.tsx:29` — `aria-label="Buurt Check home"` → `aria-label={t('aria.home')}`
- `AddressHeader.tsx:49` — `aria-label="Add/Remove from shortlist"` → `aria-label={t('aria.toggleShortlist')}`
- Add corresponding keys to both `en.json` and `nl.json`

**Why:** Dutch screen reader users hear English labels in an otherwise Dutch interface. Every aria-label must go through i18n.

**10/10:** Zero hardcoded English strings in any `aria-label`, `aria-labelledby`, or `aria-describedby` attribute across the entire codebase. Grep for `aria-label="` (with quotes and literal text) returns zero matches in `.tsx` files.

**DoD:**
- [ ] All 5 hardcoded aria-labels replaced with `t()` calls
- [ ] 5 new i18n keys added to both `en.json` and `nl.json`
- [ ] Grep `aria-label="[A-Z]` in `.tsx` files returns zero matches (no remaining hardcoded labels)
- [ ] Test: render TopBar in NL, verify Dutch aria-labels
- [ ] `npm run build` passes

---

### 2.5 Fix `toLocaleDateString` to respect app language

**Appraisal IDs:** H3.4

**What:**
- `frontend/src/components/AddressSearch.tsx:22` — `new Date(timestamp).toLocaleDateString()` uses browser locale, not app language
- Pass explicit locale: `new Date(timestamp).toLocaleDateString(i18n.language === 'nl' ? 'nl-NL' : 'en-US')`

**Why:** A Dutch browser with EN app setting shows NL date format; an English browser with NL setting shows EN format. Date formatting should follow the app language choice, not browser locale.

**10/10:** All date formatting across the app uses the app's i18n language setting, not `navigator.language`.

**DoD:**
- [ ] `toLocaleDateString` receives explicit locale matching `i18n.language`
- [ ] Grep for `toLocaleDateString()` (no args) returns zero matches
- [ ] Test: verify date format matches app language setting
- [ ] `npm run build` passes

---

### 2.6 Translate "Buurt" in English navigation

**Appraisal IDs:** C12

**What:**
- Tab bar, section headers, and phase dividers use "Buurt" untranslated in English mode
- Replace with `t('nav.neighborhood')` — "Neighborhood" in EN, "Buurt" in NL
- Audit all occurrences of untranslated "Buurt" in component JSX (not the brand name "Buurt Check")

**Why:** "Buurt" is Dutch for "neighborhood." English-speaking expats — the primary target audience — see an untranslated Dutch word in navigation.

**10/10:** In EN mode, no Dutch words appear in navigation or section headers (brand name "Buurt Check" is excepted as a proper noun).

**DoD:**
- [ ] "Buurt" in navigation/headers uses `t()` with EN translation "Neighborhood"
- [ ] Brand name "Buurt Check" remains untranslated (it's a proper noun)
- [ ] Test: render in EN mode, verify "Neighborhood" appears in relevant locations
- [ ] `npm run build` passes

---

### 2.7 Audit and translate all Dutch building facts terms in EN mode

**Appraisal IDs:** C13

**What:**
- Audit all `building_facts.*` i18n keys in `en.json`
- Some labels may use Dutch terms even in English mode: "bouwjaar" → "Year built", "oppervlakte" → "Floor area", "bestemming" → "Zoning"
- Verify every building fact label has a proper English translation

**Why:** Expats looking at building facts see Dutch property terminology they cannot understand.

**10/10:** Every building fact label in EN mode uses plain English that a non-Dutch-speaking expat can understand without a dictionary.

**DoD:**
- [ ] All `building_facts.*` keys in `en.json` have proper English translations
- [ ] No Dutch-only terms remain in EN mode building facts display
- [ ] Test: render BuildingFactsCard in EN, verify all labels are English
- [ ] `npm run build` passes

---

### 2.8 Fix NL text overflow in constrained containers

**Appraisal IDs:** H1.3, H3.5

**What:**
- `frontend/src/components/ui/Toast.css:44` — `.toast__text` has `white-space: nowrap`. NL `shortlist.maxReached` is 65 chars (35% longer than EN) — overflows at 375px
- Replace `white-space: nowrap` with `white-space: normal` or CSS line-clamp (2 lines max)
- Audit other constrained containers (SummaryStrip pills, coverage banner) for NL expansion

**Why:** Dutch text averages 20-35% longer than English. Containers with `nowrap` or fixed widths break when displaying NL translations.

**10/10:** All Toast messages, pills, and banners display correctly in both NL and EN at 375px width. NL text wraps gracefully; no horizontal overflow or clipping.

**DoD:**
- [ ] Toast allows wrapping or uses line-clamp
- [ ] NL `shortlist.maxReached` renders fully readable at 375px
- [ ] Other constrained containers audited for NL fit
- [ ] `npm run build` passes

---

## Epic 3: UX Copy & Voice Consistency

> **Theme:** Risk card explanations speak like a trusted advisor. Error messages speak like a server log. Source citations speak like a government report. Navigation speaks like a developer's TODO. Extend the risk explanation voice to every piece of text.

### 3.1 Rename "Tier-B Signals" to user-facing language

**Appraisal IDs:** C3

**What:**
- All `tier_b.*` i18n keys — section header visible to users says "Tier-B Signals"
- Rename to "Additional property checks" (EN) / "Aanvullende woningcontroles" (NL)
- Remove all "tier" language from user-facing copy (code comments can keep it)

**Why:** "Tier B" is an internal data-priority classification. Users see it and wonder "what's Tier A? Am I missing something?"

**10/10:** Zero internal taxonomy leaks into the UI. Every section header answers "what is this?" from the user's perspective, not the developer's.

**DoD:**
- [ ] `tier_b.title` key updated in both `en.json` and `nl.json`
- [ ] Grep for `[Tt]ier.?[Bb]` in i18n files returns zero user-facing matches
- [ ] `npm run build` passes

---

### 3.2 Humanize "Pand ID" label

**Appraisal IDs:** C4

**What:**
- `building_facts.pand_id` i18n key rendered in BuildingFactsCard
- Either remove entirely (users don't need cadastral IDs) or rename to "Building registry number" (EN) / "Kadaster gebouwnummer" (NL)

**Why:** "Pand" is Dutch cadastral jargon. Even Dutch users outside real estate don't know it. Expats definitely don't.

**10/10:** Technical identifiers are either hidden or explained in plain language with context about what they're for.

**DoD:**
- [ ] "Pand ID" label updated or removed from user-facing display
- [ ] If kept: tooltip/info text explains "Official government building identifier"
- [ ] `npm run build` passes

---

### 3.3 Replace "Lden" with plain-language noise label

**Appraisal IDs:** C5

**What:**
- `noise.source_label` and tooltip text show "Lden" (EU acoustic engineering term)
- Replace with "Average noise level" (EN) / "Gemiddeld geluidsniveau" (NL)
- Add tooltip: "Lden is the EU standard for measuring noise across day, evening, and night, weighted for when noise is most disruptive."

**Why:** "Lden" and "dB Lden" mean nothing to laypeople. Users see a number + unit they can't interpret.

**10/10:** Lead with the human meaning, parenthetical for the technical name. "Average noise level: 58 dB (Lden)" — consequences first, measurement second.

**DoD:**
- [ ] Primary label is plain language in both locales
- [ ] Technical term preserved as parenthetical or tooltip
- [ ] Test: noise card label is human-readable in both languages
- [ ] `npm run build` passes

---

### 3.4 Add "/100" context to all score displays

**Appraisal IDs:** C6

**What:**
- `SummaryStrip`, `RiskTilesGrid`, `RiskDetailView`, `LivabilityCard` — all show bare numbers like "73" or "45"
- Add "/100" suffix or a one-time tooltip explaining the 0-100 scale
- Update `AnimatedScore` component to optionally render the scale suffix

**Why:** Users can't calibrate meaning. Is 73 out of 100? Out of 10? A percentile?

**10/10:** Every score display communicates the scale. First encounter shows a brief tooltip: "Scores range from 0 (worst) to 100 (best)." Subsequent displays show compact "/100" suffix.

**DoD:**
- [ ] Score displays include "/100" or equivalent scale indicator
- [ ] Scale indicator uses `--color-text-tertiary` to avoid visual clutter
- [ ] i18n keys for scale label in both locales
- [ ] `npm run build` passes

---

### 3.5 Rewrite error messages in active, human voice

**Appraisal IDs:** C7

**What:**
- Audit all `errors.*` keys in `en.json` (~12 keys)
- Replace passive/generic messages with active, empathetic copy:
  - "Data could not be loaded" → "We couldn't reach the data source. Try again in a moment."
  - "Request timed out" → "This is taking longer than usual. The government data source may be slow — try again."
  - "An error occurred" → "Something went wrong on our end. Your data is safe — try refreshing."
- Apply same treatment to NL translations

**Why:** Passive voice ("Data could not be loaded") feels like talking to a machine. Active voice ("We couldn't reach...") communicates a human behind the product. This directly contradicts the "confident, clear, empowering" brand.

**10/10:** Every error message: (1) acknowledges the problem, (2) suggests a cause if known, (3) offers a next step. First person plural ("we"), never passive voice.

**DoD:**
- [ ] All `errors.*` keys rewritten in both locales
- [ ] Every error message has a suggested next action
- [ ] No passive voice in any error message
- [ ] `npm run build` passes

---

### 3.6 Add error mapping layer to prevent API codes in UI

**Appraisal IDs:** C8, H9.5

**What:**
- `frontend/src/services/api.ts` — add a catch-all error mapper that converts technical errors ("401 Unauthorized", "ECONNREFUSED", "timeout") to human-friendly messages
- Never let raw HTTP status codes, hostnames, or exception text reach the UI
- Map common failure modes: timeout → "taking longer than usual", network error → "connection problem", 4xx → "data source issue", 5xx → "temporary problem"

**Why:** Technical strings like "401 Unauthorized" break trust instantly. Users think the app is broken.

**10/10:** The API service layer guarantees: no technical error string ever reaches a component's render output. Components receive human-friendly, i18n'd error messages only.

**DoD:**
- [ ] `api.ts` has error mapping function covering timeout, network, 4xx, 5xx
- [ ] All mapped messages use i18n keys
- [ ] Grep for `status` or `statusText` in component error rendering returns zero matches
- [ ] Backend `address.py`: all `HTTPException(detail=...)` use generic messages, not `f"...{exc}"`
- [ ] Test: API error returns human-friendly message
- [ ] `npm run build` passes

---

### 3.7 Humanize scientific and technical terms

**Appraisal IDs:** C9, C10, C11

**What:**
- "Equinox" → "Analysis based on March 21 conditions — when day and night are equal length, giving a typical mid-year sunlight estimate."
- "PM2.5 concentration" → "Fine dust particles (PM2.5) — tiny particles that affect breathing"
- "NO₂" → "Nitrogen dioxide (NO₂) — mainly from traffic"
- "Sampled on" → "Measured on" or "Data from"
- Update all affected i18n keys in both locales

**Why:** Chemical formulas and scientific methodology language mean nothing to most people. Lead with the human meaning, parenthetical for the technical name.

**10/10:** Every technical term passes the test: "Would my non-technical friend understand this without asking?"

**DoD:**
- [ ] Equinox explanation expanded in sunlight disclaimer keys
- [ ] PM2.5 and NO₂ labels lead with human meaning
- [ ] "Sampled" replaced with "Measured" or "Data from" across all source attribution keys
- [ ] Both locales updated
- [ ] `npm run build` passes

---

### 3.8 Humanize source attributions

**Appraisal IDs:** C17

**What:**
- Source citations use full institutional names: "Rijksinstituut voor Volksgezondheid en Milieu"
- Replace with abbreviation + one-line English explanation:
  - "RIVM (Dutch National Health Institute)"
  - "CBS (Statistics Netherlands)"
  - "PDOK (Dutch National Geo-Registry)"
  - "BAG (Building & Address Registry)"
  - "Kadaster (Land Registry)"
- Update all `source.*` i18n keys in both locales

**Why:** Full institutional names are visual noise for expats. Abbreviation + explanation builds trust more effectively than an unreadable Dutch name.

**10/10:** Every source citation is compact, bilingual, and trust-building. Format: "Source: RIVM (Dutch National Health Institute), measured 2024-03-15"

**DoD:**
- [ ] All source attribution keys use abbreviation + parenthetical explanation
- [ ] Format consistent across all risk cards, building facts, and viewer
- [ ] Both locales updated
- [ ] `npm run build` passes

---

### 3.9 Standardize terminology: "Saved" everywhere

**Appraisal IDs:** C21, C22, C23

**What:**
- Three words for the same concept: tab says "Saved", code uses "shortlist", some copy says "bookmarked"
- Standardize on "Saved" (most intuitive, already on tab) throughout all user-facing copy
- "Viewing checklist" vs "Viewing briefing" → standardize on "Viewing checklist"
- "Export PDF" → "Download viewing checklist" or "Get your briefing" — value-first, format second

**Why:** Inconsistent terminology creates cognitive load. Users shouldn't need to figure out that "saving", "shortlisting", and "bookmarking" are the same action.

**10/10:** One term per concept everywhere: "Saved" for the collection, "Save/Unsave" for the action, "Viewing checklist" for the output. Button labels describe value, not technical action.

**DoD:**
- [ ] All user-facing copy uses "Saved" / "Save" (not "shortlist" or "bookmark")
- [ ] "Viewing checklist" used consistently (not "briefing" in some places)
- [ ] Export button label is value-first
- [ ] Code identifiers (`shortlist.ts`, `ShortlistScreen`) can keep internal names
- [ ] Both locales updated
- [ ] `npm run build` passes

---

### 3.10 Contextualize crime stats with severity interpretation

**Appraisal IDs:** P3#19

**What:**
- Crime stats present raw tabular numbers without severity interpretation
- Unlike noise (which gets a comparison chart + meaning paragraph), crime data gets no "what does this mean for me"
- Add severity mapping and plain-language meaning to crime indicators, consistent with the risk card pattern

**Why:** Product principle #1: "Consequences over data." Raw crime numbers violate this principle.

**10/10:** Crime stats follow the risk card pattern: severity badge + "what this means" paragraph + comparison to city/NL average.

**DoD:**
- [ ] Crime indicators have severity mapping (good/moderate/poor/critical)
- [ ] Plain-language meaning text added to crime display
- [ ] Comparison context (vs city average) included
- [ ] i18n keys for all new copy in both locales
- [ ] `npm run build` passes

---

### 3.11 Replace mobile-invisible `title` tooltips with tap-to-reveal

**Appraisal IDs:** C20

**What:**
- Multiple components use `title` attribute for additional context
- `title` tooltips only appear on desktop hover — invisible on mobile (the primary platform)
- Replace with tap-to-reveal inline help text or info icons that expand on tap

**Why:** Context that designers intended to show is never seen by 80%+ of users on mobile.

**10/10:** Every piece of contextual help is accessible on both mobile (tap) and desktop (hover). No invisible information.

**DoD:**
- [ ] Grep for `title=` in component JSX — replace with tap-to-reveal pattern
- [ ] Info icon or expandable text replaces `title` attributes
- [ ] Works on both mobile (tap) and desktop (hover)
- [ ] `npm run build` passes

---

## Epic 4: Animation & Motion System

> **Theme:** The app treats every state change equally — instant, with no motion. Three signature moments need precision animation: the dossier reveal, the score arrival, and the save commitment. Everything else is supporting infrastructure.

### 4.1 Add easing tokens and duration scale to design system

**Appraisal IDs:** Animation assessment recommendations

**What:**
- `frontend/src/styles/tokens.css:172-174` currently has only 3 transition tokens using generic `ease`
- Add purposeful easing tokens:
  ```css
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-subtle: cubic-bezier(0.33, 1, 0.68, 1);
  --duration-instant: 100ms;
  --duration-fast: 150ms;
  --duration-base: 200ms;
  --duration-moderate: 300ms;
  --duration-slow: 500ms;
  --duration-emphasis: 600ms;
  --stagger-section: 80ms;
  --stagger-item: 50ms;
  ```

**Why:** The default CSS `ease` is a generic symmetric curve. Purposeful `ease-out` curves create the "calm confidence" feel — fast start, gentle deceleration, like a confident gesture.

**10/10:** Every animation in the app references a design token for duration and easing. Zero hardcoded `cubic-bezier` values in component CSS.

**DoD:**
- [ ] Easing and duration tokens added to `tokens.css`
- [ ] Existing hardcoded easings in component CSS replaced with token references
- [ ] `npm run build` passes

---

### 4.2 Implement dossier section staggered reveal

**Appraisal IDs:** A1, PRD §11.2

**What:**
- CSS-only implementation. No Framer Motion needed.
- Each dossier section wrapper in `App.tsx` gets `style={{ '--section-index': N }}` (N = 0-13)
- New CSS:
  ```css
  .dossier-section {
    animation: dossierReveal var(--duration-base) var(--ease-out-quart) both;
    animation-delay: calc(var(--section-index) * var(--stagger-section));
  }
  @keyframes dossierReveal {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .dossier-section { animation: none; }
  }
  ```

**Why:** When dossier data loads, all 14 sections appear simultaneously — a wall of content with no reading direction. Staggered reveal communicates "we organized this for you." This is the single most impactful missed animation.

**10/10:** Sections fade in top-to-bottom, each 80ms after the previous, 200ms per section. Like a professional document being laid out on a table. `transform` + `opacity` only (GPU-composited, no layout thrash).

**DoD:**
- [ ] Each dossier section wrapper has `--section-index` inline style
- [ ] `dossierReveal` keyframe in appropriate CSS file
- [ ] `prefers-reduced-motion` makes all sections visible immediately
- [ ] Total animation time ~1.3s (14 × 80ms + 200ms)
- [ ] Test: sections render with correct animation-delay values
- [ ] Profile on mobile: no jank during reveal
- [ ] `npm run build` passes

---

### 4.3 Extend AnimatedScore to SummaryStrip and LivabilityCard

**Appraisal IDs:** A2

**What:**
- `AnimatedScore.tsx` already implements requestAnimationFrame count-up with 600ms easeOutCubic, respecting `prefers-reduced-motion`
- Currently applied to `RiskTile` scores only
- Apply to `SummaryStrip` pill scores and `LivabilityCard` overall score
- Consider `IntersectionObserver` gating so off-screen scores don't count on mount

**Why:** A score that counts up communicates "we calculated this." A score that appears communicates "database lookup."

**10/10:** Every score number in the app counts up from 0 on first appearance. Scores below the viewport don't animate until scrolled into view.

**DoD:**
- [ ] `SummaryStrip` pills use `<AnimatedScore>` for score values
- [ ] `LivabilityCard` overall score uses `<AnimatedScore>`
- [ ] Scores animate on scroll-into-view, not on mount
- [ ] `prefers-reduced-motion` shows final value instantly
- [ ] `npm run build` passes

---

### 4.4 Add tab switch content transition

**Appraisal IDs:** A4, PRD §11.2

**What:**
- Wrap tab content containers in Framer Motion `AnimatePresence` with `mode="wait"`
- `initial={{ opacity: 0, y: 12 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0, y: 12 }}`
- Use `SPRING_TAB` (already defined in `frontend/src/config/springs.ts` — stiffness 400, damping 30 — but unused in production)
- `key` on content wrapper = `activeScreen` or `activeTab`

**Why:** Tab content swaps instantly with no spatial context. Users lose their mental model of where they are.

**10/10:** Outgoing content fades out + shifts down 12px (150ms). Incoming content fades in + shifts up (250ms). Snappy and decisive. User can tap immediately even mid-animation.

**DoD:**
- [ ] `AnimatePresence mode="wait"` wraps tab content area
- [ ] `SPRING_TAB` used for transition (remove from unused status)
- [ ] Content transitions on tab switch
- [ ] `prefers-reduced-motion`: instant swap via `MotionConfig`
- [ ] Test: tab switch renders new content
- [ ] `npm run build` passes

---

### 4.5 Add theme switch crossfade

**Appraisal IDs:** A5, P10

**What:**
- Add temporary global CSS transition class:
  ```css
  html.theme-transitioning,
  html.theme-transitioning * {
    transition: background-color 200ms var(--ease-out-subtle),
                color 200ms var(--ease-out-subtle),
                border-color 200ms var(--ease-out-subtle) !important;
  }
  ```
- In `frontend/src/services/theme.ts`: add `theme-transitioning` class before toggling `data-theme`, remove after 250ms timeout
- `prefers-reduced-motion`: skip the class entirely

**Why:** Dark/light toggle is an instant flash — especially jarring on OLED where `#000000` ↔ `#FAFBFC` contrast is extreme. A 200ms crossfade transforms a jarring flash into a polished transition.

**10/10:** Theme switch feels like dimming/raising the lights. Surfaces, text, and borders all transition smoothly. No individual element "pops" ahead of or behind the transition.

**DoD:**
- [ ] `theme-transitioning` class added/removed around theme toggle
- [ ] 200ms crossfade visible on all surfaces
- [ ] `prefers-reduced-motion` skips the transition class
- [ ] Profile on iPhone SE: no jank during transition
- [ ] `npm run build` passes

---

### 4.6 Add shortlist bookmark icon animation + haptic

**Appraisal IDs:** A3, PRD §11.2

**What:**
- SVG `stroke-dasharray` + `stroke-dashoffset` animation on bookmark icon path
- On save: stroke draws bottom-to-top (250ms ease-out), then fills with teal (150ms)
- On remove: reverse (fill fades, stroke un-draws)
- Haptic: `navigator.vibrate?.(10)` on save (single 10ms pulse)
- `prefers-reduced-motion`: instant fill toggle (current behavior)
- Implement in `ActionBar.tsx` (the canonical bookmark location after S3 removes the duplicate)

**Why:** The primary retention action — saving an address for a Saturday viewing tour — passes without ceremony. Bookmark animations are proven engagement drivers.

**10/10:** Save feels like stamping a document — confident, single gesture. The icon draws, fills with teal, and the phone buzzes once. Unmistakable feedback.

**DoD:**
- [ ] Bookmark icon animates stroke-draw on save
- [ ] Fill crossfade follows stroke completion
- [ ] `navigator.vibrate?.(10)` fires on save
- [ ] Reverse animation on remove
- [ ] `prefers-reduced-motion`: instant toggle
- [ ] `npm run build` passes

---

### 4.7 Add error/unavailable card pulse

**Appraisal IDs:** A6, PRD §11.2

**What:**
- When a card transitions to error state, its background pulses once in `--color-surface-recessed` (400ms ease-in-out)
- CSS: `@keyframes errorPulse { 0%, 100% { background: var(--color-surface); } 50% { background: var(--color-surface-recessed); } }`
- `animation-iteration-count: 1` — single pulse, not looping
- Trigger via `data-state="error"` attribute or class toggle
- `prefers-reduced-motion`: no pulse, muted state appears immediately

**Why:** When data sources fail, the card shows a static "unavailable" badge with no visual moment acknowledging the failure. A subtle breath says "this one didn't make it, but we're still here."

**10/10:** Error states are gently acknowledged, not silent. The pulse draws the eye without alarming the user.

**DoD:**
- [ ] `errorPulse` keyframe defined
- [ ] Cards with error state trigger single pulse
- [ ] `prefers-reduced-motion`: no pulse
- [ ] `npm run build` passes

---

### 4.8 Clean up unused spring configs

**Appraisal IDs:** Animation inventory

**What:**
- `frontend/src/config/springs.ts` — `SPRING_SHEET` (stiffness 300, damping 30) is unused in production (only in SpringTuner debug component)
- After story 4.4 uses `SPRING_TAB`, verify `SPRING_SHEET` is still unused
- If unused, remove `SPRING_SHEET` and its references in SpringTuner (which is itself dead code per S10)

**Why:** Dead code obscures intent. Two unused springs suggest functionality that was planned but never built.

**10/10:** Every defined spring config is used in production. No orphaned motion constants.

**DoD:**
- [ ] Unused spring constants removed
- [ ] `npm run build` passes
- [ ] `npm run test` passes (update/remove affected test assertions)

---

## Epic 5: Frontend Performance

> **Theme:** The app is not slow — initial bundle is within budget (245 KB gzip) and progressive loading is well-designed. The issues are structural efficiency problems that compound on mobile: cascading re-renders, paint budget waste, and network waterfall gaps.

### 5.1 Lazy-load dossier components

**Appraisal IDs:** P1 (performance)

**What:**
- `frontend/src/App.tsx:3-20` — 18 dossier components are synchronously imported
- Only 4 components are lazy-loaded (`BuildingFootprintMap`, `NeighborhoodViewer3D`, `CompareScreen`, `SettingsScreen`)
- Create a lazy boundary: wrap dossier components in `React.lazy` that loads when `activeScreen` transitions to `'dossier'`
- The API response takes 2-3s anyway — chunk loads in parallel, imperceptible

**Why:** Users on the search screen download code for RiskTilesGrid, PropertyWarningsCard, SoilInfoCard, etc. before ever selecting an address. ~30-40 KB gzip wasted on first load.

**10/10:** Search screen loads only search-related code. Dossier code loads in parallel with the first API call, arriving before the data is ready to display.

**DoD:**
- [ ] Dossier components lazy-loaded via `React.lazy`
- [ ] `Suspense` fallback renders appropriately during chunk load
- [ ] Search screen initial bundle reduced by 30+ KB gzip
- [ ] No visible loading delay when opening first dossier
- [ ] `npm run build` passes
- [ ] Bundle size test updated

---

### 5.2 Add React.memo to leaf components

**Appraisal IDs:** P2 (performance)

**What:**
- Zero of 87 `.tsx` components use `React.memo()`
- 47 `useState` hooks in `App.tsx` means every state update re-renders the entire tree
- Add `React.memo` to the 14 most re-rendered leaf components: `RiskTile`, `RiskTilesGrid`, `SeverityBadge`, `BuildingFactsCard`, `SoilInfoCard`, `NeighborhoodStatsCard`, `TierBSignalsCard`, `LivabilityCard`, `PropertyWarningsCard`, `SummaryStrip`, `AttentionSummary`, `ViewingChecklist`, `AddressHeader`, `ShadowSnapshots`
- Stabilize callback references in `App.tsx` with proper `useCallback` dependency arrays

**Why:** Every interaction (checkbox toggle, detail open, scroll) re-renders the entire dossier tree. On mid-range Android, this costs 50-150ms per interaction — the difference between "snappy" and "sluggish."

**10/10:** Leaf components only re-render when their props actually change. React DevTools Profiler shows 30-50% fewer renders during dossier interaction.

**DoD:**
- [ ] 14 leaf components wrapped in `React.memo`
- [ ] Callback props stabilized with `useCallback`
- [ ] No unnecessary re-renders visible in React DevTools
- [ ] `npm run build` passes
- [ ] `npm run test` passes

---

### 5.3 Replace WOFF with WOFF2 font

**Appraisal IDs:** P3 (performance)

**What:**
- `frontend/public/fonts/Satoshi-Regular.woff` is 31 KB
- WOFF2 with Brotli compression is typically 8-12 KB — a 60-70% reduction
- Download Satoshi Variable `.woff2` from fontshare.com
- Update `frontend/src/styles/satoshi.css` src URL
- Add WOFF as fallback for legacy browsers

**Why:** Font blocks text rendering until loaded with `font-display: swap`. 20 KB savings on first page load.

**10/10:** Font file is WOFF2 variable with full weight range (300-900). Fallback chain: WOFF2 → WOFF → system font.

**DoD:**
- [ ] `.woff2` font file in `public/fonts/`
- [ ] `satoshi.css` updated with WOFF2 primary, WOFF fallback
- [ ] Font renders correctly at all weights (300-900)
- [ ] File size reduced by 60%+
- [ ] `npm run build` passes

---

### 5.4 Add CSS containment to dossier sections

**Appraisal IDs:** P4

**What:**
- Zero instances of `contain`, `content-visibility`, or `will-change` across all CSS
- Add `contain: content` to each dossier section wrapper
- Add `content-visibility: auto` to below-fold sections (NeighborhoodStats, TierB, ViewingChecklist)
- Add `will-change: transform` to fixed elements (TabBar, ActionBar)

**Why:** Layout changes in one section trigger reflow across all 14 sections. CSS containment isolates layout/paint per section — 30-40% reduction in reflow time.

**10/10:** Each dossier section is an independent layout/paint boundary. Below-fold sections skip rendering until scrolled into view.

**DoD:**
- [ ] Dossier section wrappers have `contain: content`
- [ ] Below-fold sections have `content-visibility: auto` with `contain-intrinsic-size`
- [ ] Fixed nav elements have `will-change: transform`
- [ ] No visual regressions
- [ ] `npm run build` passes

---

### 5.5 Remove backdrop-filter blur on scroll-active elements

**Appraisal IDs:** P5

**What:**
- `frontend/src/App.css:132` — DossierJumpNav uses `backdrop-filter: blur(10px)` on a sticky element. Backdrop blur is ~60x more expensive than transform/opacity and recalculates every scroll frame.
- Replace with solid `background: var(--color-surface)` or semi-transparent `background: color-mix(in srgb, var(--color-surface) 90%, transparent)`
- `HeatmapLegend.css:12` — `blur(6px)` on absolutely positioned overlay (less impactful, but fix for consistency)

**Why:** Backdrop blur on a scrolling sticky element causes GPU overdraw every frame. Removes the largest scroll-jank contributor.

**10/10:** Zero `backdrop-filter` on scroll-active or sticky elements. Solid or semi-transparent backgrounds achieve the same visual effect without the GPU cost.

**DoD:**
- [ ] DossierJumpNav uses solid/semi-transparent background instead of blur
- [ ] HeatmapLegend blur replaced or justified
- [ ] Scroll performance improved (no jank on 60fps scroll)
- [ ] `npm run build` passes

---

### 5.6 Parallelize 3DBAG fetch with Phase 1

**Appraisal IDs:** P8

**What:**
- 3DBAG neighborhood fetch (12-77s) doesn't start until Phase 3 (~9s into dossier load)
- Start `getBuilding3D()` (target only, ~2s) in Phase 1 alongside `getBuildingFacts()`
- Start `getNeighborhood3D()` in Phase 2 alongside `getRiskCards()`
- Sunlight analysis depends on 3D data — earlier fetch doesn't break correctness

**Why:** The user scrolls past 7 sections before reaching the 3D viewer. Starting the fetch earlier is free — the data arrives 6-9s sooner without blocking any other content.

**10/10:** 3D data fetch starts at the same time as building facts. By the time the user scrolls to the 3D viewer, the target building is already rendered.

**DoD:**
- [ ] Target building fetch moved to Phase 1
- [ ] Neighborhood fetch moved to Phase 2
- [ ] No regression in dossier loading behavior
- [ ] 3D viewer available 6-9s earlier
- [ ] `npm run build` passes
- [ ] `npm run test` passes

---

### 5.7 Fix O(n^2) heatmap nearest-neighbor

**Appraisal IDs:** P7

**What:**
- `frontend/src/components/NeighborhoodViewer3D.tsx` heatmap vertex coloring loops through ALL `roofPoints` for EACH vertex position
- 10,000 vertices × 500 roof points = 5 million distance calculations
- Pre-compute a spatial hash or grid-based spatial index from `roofPoints`
- Alternative: compute in a web worker

**Why:** Toggling `showHeatmap` stalls the main thread for 200-500ms on large buildings. Noticeable jank on mobile.

**10/10:** Heatmap toggle is instant (<50ms). Spatial index lookup reduces complexity from O(n×m) to O(n×log(m)).

**DoD:**
- [ ] Spatial index (hash grid or KD-tree) pre-computed from roof points
- [ ] Nearest-neighbor lookup uses index, not brute-force
- [ ] Heatmap toggle < 50ms on reference building set
- [ ] `npm run build` passes

---

### 5.8 Add `loading="lazy"` to images and replace height animations

**Appraisal IDs:** H8.1, H8.2, P9

**What:**
- Add `loading="lazy"` to aerial photo in `BuildingFootprintMap.tsx` (currently defaults to eager)
- Add `loading="lazy"` to 3 shadow snapshot images in `ShadowSnapshots.tsx` (potentially 100KB+ each as base64)
- Replace `height` animations in `LivabilityDetailView.css` and `SettingsScreen.css` with `max-height` transitions (avoids layout recalc)

**Why:** Below-fold images load eagerly, wasting bandwidth. Height animations trigger layout reflow every frame.

**10/10:** All below-fold images use native lazy loading. Expand/collapse animations use `max-height` or `transform: scaleY()` (GPU-composited).

**DoD:**
- [ ] `loading="lazy"` on aerial photo and shadow snapshots
- [ ] Height animations replaced with max-height or transform
- [ ] No visual regression in expand/collapse behavior
- [ ] `npm run build` passes

---

### 5.9 Memoize summaryPills computation

**Appraisal IDs:** H8.3

**What:**
- `frontend/src/App.tsx:1259-1275` — `summaryPills` array is recomputed on every render via an IIFE in JSX
- Wrap in `useMemo` with `[riskCards]` dependency
- Prevents new array reference from defeating `React.memo` on `SummaryStrip`

**Why:** Every state change in App.tsx (47 useState hooks) recomputes and recreates the pills array, even when risk cards haven't changed.

**10/10:** `summaryPills` only recomputes when `riskCards` data changes. `SummaryStrip` receives a stable reference.

**DoD:**
- [ ] `summaryPills` wrapped in `useMemo`
- [ ] Dependency array is minimal and correct
- [ ] `npm run build` passes

---

## Epic 6: Onboarding & Discovery

> **Theme:** The app's onboarding problem isn't missing features — it's missing narrative. The product has a clear story: "Paste an address → see risks → get a viewing checklist → make a confident decision." That story is never told. The user must discover it through exploration.

### 6.1 Rewrite welcome value props as benefits with example address

**Appraisal IDs:** O1, P1#8

**What:**
- `frontend/src/components/AddressSearch.tsx:210-234` — 3 value proposition rows when no recent searches
- Current: feature-centric ("3D-zonlichtanalyse", "Milieurisicobeoordeling", "Afdrukbare bezichtigingschecklist")
- Rewrite as benefit-centric:
  - "Is this neighborhood safe?" / "Is deze buurt veilig?"
  - "Will your apartment get enough light?" / "Krijgt je appartement genoeg licht?"
  - "What should you ask at the viewing?" / "Wat moet je vragen bij de bezichtiging?"
- Add an example address link: "Try it: Keizersgracht 1, Amsterdam" — collapses discovery gap to one tap
- Add trust signal: "Free. No registration. 10+ government data sources."

**Why:** Features answer "what." Benefits answer "why." The user's question is "Will I regret this purchase?" — not "Does this app have a 3D sunlight analysis?"

**10/10:** A first-time user understands in 3 seconds: (1) what the app does (checks if an address is safe), (2) why to trust it (government data), (3) how to try it (one-tap example address). The value props feel like a promise, not a feature list.

**DoD:**
- [ ] 3 value props rewritten as user questions in both locales
- [ ] Example address link triggers `handleAddressSelect` with a real PDOK address
- [ ] Trust signal line added below value props
- [ ] Orphaned `search.valueProp1/2/3` i18n keys cleaned up
- [ ] `npm run build` passes

---

### 6.2 Add educational microcopy to loading screen steps

**Appraisal IDs:** O3

**What:**
- `frontend/src/components/LoadingScreen.tsx` — 6 loading steps narrate the technical fetch sequence
- Augment each step with a trust-building educational sub-line:
  - "Checking noise levels" → add: "Using RIVM government sensors for traffic, rail, and aircraft noise"
  - "Loading 3D model" → add: "Building a 3D model of your street from official survey data"
  - Each sub-line appears 1s after the main step text (progressive disclosure during wait)

**Why:** The 7-15 second loading wait is the only moment where the user is captive and receptive. Currently it narrates the fetch sequence but doesn't educate or build trust.

**10/10:** The loading screen transforms wait time into trust-building time. Users emerge from loading knowing what data sources were checked and why they should trust the results.

**DoD:**
- [ ] Each loading step has an educational sub-line
- [ ] Sub-lines added to both `en.json` and `nl.json`
- [ ] Sub-lines appear after a brief delay (not all at once)
- [ ] `prefers-reduced-motion`: sub-lines appear instantly
- [ ] `npm run build` passes

---

### 6.3 Add example address to search placeholder and below

**Appraisal IDs:** O9

**What:**
- `search.placeholder` = "Plak of typ een adres..." / "Paste or type an address..."
- Change to include format hint: "Bijv. Keizersgracht 1, Amsterdam" / "e.g. Keizersgracht 1, Amsterdam"
- Add `inputmode="search"` to the input element (G7) for better mobile keyboard
- Add `maxLength={200}` to prevent oversized queries (H4.1)

**Why:** Users need to know what format works. "Paste or type" is a mechanic, not guidance. Expats might try a UK address format.

**10/10:** The placeholder shows a concrete example address in the expected format. The keyboard shows a search-optimized layout. Input length is bounded.

**DoD:**
- [ ] Placeholder includes example address format
- [ ] `inputmode="search"` added to input
- [ ] `maxLength={200}` added to input
- [ ] Both locales updated
- [ ] `npm run build` passes

---

### 6.4 Add search loading indicator

**Appraisal IDs:** G6

**What:**
- No loading/spinner state during 300ms debounce + API latency (1-3s)
- Users see empty dropdown while fetch is in-flight
- Add a spinner or "Searching..." text that appears after debounce fires and before results arrive

**Why:** System status visibility (Nielsen heuristic #1). Users don't know if the app is working during the 1-3s search delay.

**10/10:** A subtle spinner or "Searching..." indicator appears immediately after the debounce timer fires. It disappears when results arrive or when no results are found.

**DoD:**
- [ ] Loading indicator appears during address search fetch
- [ ] Disappears on results or no-results
- [ ] Uses i18n key for "Searching..." text
- [ ] `npm run build` passes

---

### 6.5 Add first-visit detection

**Appraisal IDs:** O2

**What:**
- Zero `localStorage` flags for `onboarding-seen`, `first-visit`, etc.
- Add `localStorage.getItem('buurtcheck_visited')` check
- Set flag after first dossier load completes
- Use flag to conditionally show: example address in search, extended value props, first-use tooltips (story 6.7)

**Why:** The app cannot distinguish first-time visitors from returning users. Cannot show one-time onboarding or suppress it for returning users. The only proxy (`recentSearches.length === 0`) conflates "new user" with "cleared history."

**10/10:** The app knows whether it's a first visit and tailors the experience accordingly. First visit: full value props + example address. Return visit: recent searches + saved addresses prompt.

**DoD:**
- [ ] `localStorage` flag set on first dossier completion
- [ ] Flag checked on app load
- [ ] Conditional rendering uses the flag (not `recentSearches.length`)
- [ ] Test: first-visit logic with mocked localStorage
- [ ] `npm run build` passes

---

### 6.6 Add CTA buttons to empty states

**Appraisal IDs:** O6, C14

**What:**
- Shortlist empty state (`ShortlistScreen.tsx:26-37`): has text but no CTA button
- Compare empty state (`CompareScreen.tsx:35-41`): informational text, no action
- Add CTA button to shortlist: "Search for an address" → navigates to search tab
- Add CTA button to compare: "Save 2+ addresses first" → navigates to search tab
- Search no-results: add example address suggestion

**Why:** Dead-end screens with no forward momentum. Users are told what to do but given no button to do it.

**10/10:** Every empty state has a primary CTA that moves the user forward. No dead ends.

**DoD:**
- [ ] Shortlist empty state has CTA button navigating to search
- [ ] Compare empty state has CTA button navigating to search
- [ ] Search no-results suggests example address or format hint
- [ ] CTA buttons use i18n keys in both locales
- [ ] `npm run build` passes

---

### 6.7 Add first-use contextual tooltips

**Appraisal IDs:** O5

**What:**
- Three tooltips, shown once each, tracked in localStorage:
  1. First dossier loaded → "Save this address to compare it with others later" (points to bookmark)
  2. First time on Saved tab with 2+ addresses → "Tap Compare to see addresses side by side"
  3. First PDF export → "Take this to your viewing appointment"
- Simple tooltip component: positioned callout with dismiss, auto-dismiss after 8s

**Why:** Five key features (bookmark, export, compare, language toggle, 3D controls) have no onboarding. Users must discover them through exploration.

**10/10:** One tooltip per session, never intrusive, always contextually relevant. After seeing all 3, no more tooltips appear. Progressive feature discovery without a full walkthrough.

**DoD:**
- [ ] Tooltip component created (positioned callout with dismiss)
- [ ] 3 tooltip triggers with localStorage tracking
- [ ] Each tooltip shows once, then never again
- [ ] Tooltips use i18n keys in both locales
- [ ] `prefers-reduced-motion`: tooltips appear without animation
- [ ] `npm run build` passes

---

### 6.8 Add "About" and "Data Sources" to Settings

**Appraisal IDs:** O7

**What:**
- `frontend/src/components/SettingsScreen.tsx` (79 lines) — currently: language, theme, clear searches, clear shortlist, version
- Add "About" section: 1-2 sentences about what the app does
- Add "Data Sources" section: list of 10+ government APIs with abbreviation + explanation (reuse story 3.8 copy)
- Add "How Scores Work" link/section: brief 0-100 scale explanation
- Add "Send Feedback" link (email or GitHub issues)
- Fix version hardcoded "1.0.0" (F16) — read from `import.meta.env.VITE_APP_VERSION` or `package.json`

**Why:** Settings is exclusively destructive actions + preferences. No reason for a curious user to visit, nothing to learn. Missing trust-building content.

**10/10:** Settings becomes a trust-building screen: users learn what data sources power the app, how scores work, and how to give feedback. Version reads from build config.

**DoD:**
- [ ] About section with app description
- [ ] Data sources list with explanations
- [ ] Scoring methodology summary
- [ ] Feedback link
- [ ] Version reads from build config (not hardcoded)
- [ ] All new copy in both locales
- [ ] `npm run build` passes

---

## Epic 7: Frontend Resilience & Hardening

> **Theme:** The app has strong architectural foundations (circuit-breaker caching, graceful degradation). The production hardening layer is incomplete: text overflow, silent error states, concurrent operation bugs, and memory leaks.

### 7.1 Add text overflow protection to dynamic text containers

**Appraisal IDs:** H1.1, H1.2, H1.4

**What:**
- `AddressHeader.css:15-19` — `.address-header__street` has no `overflow-wrap` or `text-overflow`. Fix: add `overflow-wrap: break-word`
- `RiskTile.css:34-39` — `.risk-tile__label` has no truncation. NL "Wegverkeersgeluid" (17 chars) can overflow tile width. Fix: add `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
- `NeighborhoodStatsCard.css:105,113` — indicator labels/values are `nowrap` without `overflow: hidden`. Fix: add `overflow: hidden; text-overflow: ellipsis`

**Why:** Long Dutch addresses (47+ chars) and NL translations (30-40% longer than EN) can overflow their containers, causing layout shifts or unreadable clipping.

**10/10:** Every dynamic text container handles its worst-case content length gracefully — wrapping, truncating with ellipsis, or expanding to fit.

**DoD:**
- [ ] AddressHeader street name wraps or truncates
- [ ] RiskTile label truncates with ellipsis
- [ ] NeighborhoodStats indicator values truncate with ellipsis
- [ ] Tested with long Dutch strings at 375px width
- [ ] `npm run build` passes

---

### 7.2 Add error states with retry to silent-failure components

**Appraisal IDs:** H2.1, H2.2, H2.3

**What:**
- **3D viewer** (`App.tsx:1122-1129`): catch block sets loading=false but no error state. Add `neighborhood3DError` state, render `t('viewer3d.loadError')` with retry button.
- **ViewingChecklist** (`App.tsx:987-989`): catch is `// Optional source.` — section silently disappears. Add fallback message with retry.
- **RiskComparisons** (`App.tsx:973-975`): failure leaves empty array, comparison bars missing. Add `riskComparisonsError` state, show "comparison data unavailable" in RiskDetailView.

**Why:** Silent failures degrade the core value proposition without the user knowing. The 3D viewer shows empty ground with no buildings and no explanation. The viewing checklist — the product's actionable output — silently vanishes.

**10/10:** Every data-dependent section shows one of three states: loading skeleton, loaded content, or error with retry. No silent failures anywhere.

**DoD:**
- [ ] 3D viewer shows error message + retry button on fetch failure
- [ ] ViewingChecklist shows fallback + retry on fetch failure
- [ ] RiskDetailView shows "comparison data unavailable" notice on comparisons failure
- [ ] i18n keys for all error messages in both locales
- [ ] Test: error state renders correctly for each component
- [ ] `npm run build` passes

---

### 7.3 Fix concurrent operation safety

**Appraisal IDs:** H5.1, H5.2, H5.3

**What:**
- **Address lookup collision** (`App.tsx:1144-1169`): rapid shortlist taps fire multiple lookup chains. Add `AbortController` to `handleAddressSelect`, abort previous on each new invocation.
- **ActionBar double-tap** (`ActionBar.tsx:19-42`): no `disabled` state during bookmark/export operation. Add `disabled={isBookmarkPending}` and debounce.
- **Tab switch override** (`App.tsx:843-907`): background lookup completes and calls `setActiveScreen('dossier')` even if user switched away. Check `activeScreenRef.current` before setting screen.

**Why:** Rapid taps cause duplicate API calls, multiple toast notifications, and unexpected navigation overrides. These are the most common mobile interaction bugs.

**10/10:** Every async operation is cancellable, every button is debounced or disabled during operation, and no background operation overrides user-initiated navigation.

**DoD:**
- [ ] `handleAddressSelect` uses AbortController, aborts previous on re-entry
- [ ] ActionBar buttons disabled during async operations
- [ ] `setActiveScreen('dossier')` guarded by current screen check
- [ ] Test: rapid taps don't cause duplicate operations
- [ ] `npm run build` passes

---

### 7.4 Fix Toast timer cleanup and memory leaks

**Appraisal IDs:** H6.1, H6.2, H6.3

**What:**
- **Toast** (`Toast.tsx:18-21`): `setTimeout` return not stored or cleared. Track timer IDs in a `Map<string, NodeJS.Timeout>` ref. Clear all in `useEffect` cleanup. Clear individual timers on manual dismiss.
- **Basemap images** (`NeighborhoodViewer3D.tsx:993-1041`): `new Image()` objects not cancellable on effect re-run. Track pending loads in ref, set `img.src = ''; img.onload = null` in cleanup.
- **Risk tile pulse** (`App.tsx:681-689`): `window.setTimeout` not stored. Store return value, clear on unmount.

**Why:** Timers firing on unmounted components produce React warnings. Image loads completing after re-render add meshes to stale scenes.

**10/10:** Every `setTimeout` and `setInterval` is tracked and cleared on unmount. Every `Image` load is cancellable. Zero "setState on unmounted component" warnings in console.

**DoD:**
- [ ] Toast timers stored in ref Map, cleared on unmount and dismiss
- [ ] Basemap image loads cancelled on effect cleanup
- [ ] Risk tile pulse timer stored and cleared
- [ ] Zero console warnings from unmounted state updates
- [ ] `npm run build` passes

---

### 7.5 Build ConfirmSheet component + wire to destructive actions

**Appraisal IDs:** F13, C16

**What:**
- The entire frontend has zero confirmation UI — no `window.confirm`, no ConfirmDialog component
- `settings.clearConfirm` i18n key exists in both language files but is NEVER used
- Build a `ConfirmSheet` component (bottom sheet with message + Cancel/Confirm buttons)
- Wire to Settings "Clear recent searches" and "Clear saved addresses" actions
- Reusable for future destructive actions (bookmark removal, etc.)

**Why:** Tapping "Clear" immediately executes with no undo. Accidental data loss (saved addresses, search history) is one tap away. This is a structural gap that compounds with every new destructive feature.

**10/10:** Every destructive action shows a confirmation bottom sheet with clear description of what will be lost. Cancel is the default/prominent action. Existing `settings.clearConfirm` i18n key is finally used.

**DoD:**
- [ ] `ConfirmSheet` component created (bottom sheet pattern)
- [ ] "Clear searches" shows confirmation before executing
- [ ] "Clear saved" shows confirmation before executing
- [ ] Confirmation uses existing `settings.clearConfirm` i18n key
- [ ] Test: destructive actions require confirmation
- [ ] `npm run build` passes

---

### 7.6 Add scroll position restoration on tab switch

**Appraisal IDs:** F12

**What:**
- `App.tsx:587-617` — `handleTabChange` only does `scrollTo({ top: 0 })`. No save/restore.
- Save scroll position per tab in a ref Map before switching
- Restore on tab return

**Why:** User loses position in 14-section dossier when switching tabs. Returning to the dossier starts at the top — losing context in the middle of reading.

**10/10:** Tab switching preserves scroll position. User returns to exactly where they left off.

**DoD:**
- [ ] Scroll position saved per tab before switch
- [ ] Scroll position restored on tab return
- [ ] New address resets saved position for dossier tab
- [ ] `npm run build` passes

---

### 7.7 Fix LoadingScreen dark mode background

**Appraisal IDs:** G1

**What:**
- `frontend/src/components/LoadingScreen.css:12` — hardcoded `background: #ffffff`. No `[data-theme="dark"]` override.
- Progress track also hardcoded `#e2e7ed` (line 129)
- Replace with `var(--color-bg)` and `var(--color-border)` respectively

**Why:** LoadingScreen renders a white flash in dark mode before the dossier loads. On OLED screens this is a jarring, bright rectangle.

**10/10:** LoadingScreen uses design tokens for all colors. Dark mode shows dark background immediately. Zero hardcoded hex values.

**DoD:**
- [ ] `background: #ffffff` replaced with `var(--color-bg)`
- [ ] Progress track color uses design token
- [ ] Dark mode LoadingScreen verified visually
- [ ] `npm run build` passes

---

### 7.8 Fix ExportBottomSheet button state after PDF ready

**Appraisal IDs:** F6, NEW-P2b

**What:**
- `ExportBottomSheet.tsx:318-328`: "Generate PDF" button remains visible + enabled after PDF is ready
- Hide or disable the generate button when `progressStage === 'ready'`
- In `ActionBar.tsx`: add loading/disabled state during PDF generation

**Why:** After PDF is generated, the "Generate" button sits alongside Share/Download — confusing the user about what to do next. And the ActionBar export button has no visual feedback during the 1-3s generation.

**10/10:** Export flow has clear stages: button → generating (disabled with spinner) → ready (generate button hidden, share/download prominent).

**DoD:**
- [ ] Generate button hidden or disabled when PDF is ready
- [ ] ActionBar export button shows loading state during generation
- [ ] Clear visual progression through export stages
- [ ] `npm run build` passes

---

### 7.9 Persist viewing checklist state

**Appraisal IDs:** P1#7 (PRD SC-4.3.4c)

**What:**
- `App.tsx:601` — `useState<Set<string>>(new Set())` — pure in-memory, resets on any navigation
- PRD SC-4.3.4c requires: "Checkbox state persists within the session and across app backgrounding"
- Store checked questions in `sessionStorage` keyed by address/vboId
- Restore on dossier reopen for the same address

**Why:** Users check viewing questions as they plan their appointment. Switching tabs or backgrounding the app loses all checked state. This is a documented PRD violation.

**10/10:** Checked questions persist across tab switches, app backgrounding, and dossier re-opens for the same address. New address starts with clean slate.

**DoD:**
- [ ] Checked questions stored in `sessionStorage` keyed by vboId
- [ ] State restored on dossier reopen for same address
- [ ] State cleared when loading a new address
- [ ] Test: checked state persists across tab switch
- [ ] `npm run build` passes

---

### 7.10 Fix RiskTileSkeleton layout mismatch

**Appraisal IDs:** G5

**What:**
- Skeleton: 2-column, `gap: --space-md`, 160px min-height, vertical card layout
- Loaded: 1-column, `gap: --space-sm`, 64px min-height, horizontal card layout
- Layout shift is perceptible on transition from skeleton to loaded state
- Align skeleton layout with the loaded RiskTilesGrid layout

**Why:** Layout shift during loading-to-loaded transition is a visual jank moment that undermines the "calm confidence" brand.

**10/10:** Skeleton and loaded state have identical grid layout. Transition is a content swap within the same spatial structure.

**DoD:**
- [ ] RiskTileSkeleton matches RiskTilesGrid grid layout (columns, gap, sizing)
- [ ] No perceptible layout shift on transition
- [ ] `npm run build` passes

---

### 7.11 Fix TopBar scroll listener target

**Appraisal IDs:** G8

**What:**
- `TopBar.tsx:18-24` — `window.addEventListener('scroll')` but dossier content may scroll inside DossierSheet container
- `setScrolled(window.scrollY > 10)` may never trigger if scroll happens in a nested container
- Verify correct scroll target and fix if needed

**Why:** TopBar scroll-dependent styling (elevation on scroll) may not activate if the scroll container isn't `window`.

**10/10:** TopBar correctly detects scroll state regardless of which container is scrolling.

**DoD:**
- [ ] Scroll listener targets the correct scroll container
- [ ] TopBar elevation appears/disappears on scroll
- [ ] `npm run build` passes

---

## Epic 8: Backend Resilience & Security

> **Theme:** Backend has excellent Redis circuit-breaker and graceful degradation. Missing: timeout budgets, input validation, payload limits, rate limiting.

### 8.1 Add timeout budget to /risks endpoint

**Appraisal IDs:** H9.1

**What:**
- `backend/app/services/risk_cards.py:736` — `asyncio.gather()` with NO timeout wrapper
- Climate card can make up to 11 sequential calls at 15s each = theoretical 165s worst case
- Add per-card `asyncio.wait_for` wrappers at 15s each
- Or wrap entire gather in `asyncio.wait_for(..., timeout=18.0)` to stay within 20s backend budget

**Why:** On cold start or after cache expiry, `/risks` can block for 30-60s — past the 25s frontend abort. The user sees a loading spinner that eventually times out client-side with no data.

**10/10:** `/risks` always responds within 20s. If individual cards time out, they return with `level: "unavailable"` status. Partial data is returned rather than nothing.

**DoD:**
- [ ] `asyncio.gather` wrapped with timeout budget
- [ ] Timed-out cards return unavailable status (not exception)
- [ ] Total endpoint response time stays within 20s backend budget
- [ ] Test: verify timeout behavior with slow mock
- [ ] `ruff check` passes
- [ ] `pytest -x -q -m "not live"` passes

---

### 8.2 Add exception guard to /livability endpoint

**Appraisal IDs:** H9.2

**What:**
- `backend/app/api/address.py:607` — `await leefbaarometer.get_livability(rd_x, rd_y)` has no `try/except`
- Non-numeric `kscore` values cause `ValueError` that propagates as unmasked 500
- Add `try/except Exception` consistent with other endpoints

**Why:** Every other endpoint has an explicit exception guard. This one doesn't, making it the only endpoint that can return raw 500 errors.

**10/10:** Every endpoint returns graceful error responses, never raw 500 Internal Server Error.

**DoD:**
- [ ] `/livability` wrapped in `try/except Exception` with `HTTPException(502)` fallback
- [ ] Error detail is generic (not exception text)
- [ ] Test: non-numeric kscore returns 502, not 500
- [ ] `ruff check` passes
- [ ] `pytest` passes

---

### 8.3 Add payload size limits to export endpoint

**Appraisal IDs:** H9.3

**What:**
- `backend/app/api/address.py:698` — `shadow_image_b64: str | None` has no `max_length`
- `address: str` also has no `max_length`
- Add: `Field(max_length=2_000_000)` to `shadow_image_b64` (limits to ~1.5MB decoded)
- Add: `Field(max_length=500)` to `address`

**Why:** A malicious client can POST 10MB+ base64 strings exhausting server memory. Defense-in-depth even if frontend is trusted.

**10/10:** Every string field in every request model has a `max_length` appropriate to its content.

**DoD:**
- [ ] `shadow_image_b64` has `max_length=2_000_000`
- [ ] `address` has `max_length=500`
- [ ] Test: oversized payload returns 422
- [ ] `ruff check` passes
- [ ] `pytest` passes

---

### 8.4 Add coordinate range validation

**Appraisal IDs:** H9.4

**What:**
- All `rd_x`, `rd_y`, `lat`, `lng` query parameters across 8+ endpoints are bare `float = Query(...)` with no bounds
- Add: `Query(..., ge=0, le=300000)` for `rd_x`, `Query(..., ge=300000, le=625000)` for `rd_y`
- Add: `Query(..., ge=50.5, le=53.8)` for `lat`, `Query(..., ge=3.2, le=7.3)` for `lng`

**Why:** Out-of-range coordinates produce meaningless external API calls and waste cache space. All valid Dutch coordinates fall within known bounds.

**10/10:** Invalid coordinates are rejected at the API boundary with a descriptive 422 error. No wasted external API calls.

**DoD:**
- [ ] All coordinate parameters have range validation
- [ ] Ranges cover all of Netherlands with margin
- [ ] Test: out-of-range coordinates return 422
- [ ] `ruff check` passes
- [ ] `pytest` passes

---

### 8.5 Sanitize 502 error details

**Appraisal IDs:** H9.5

**What:**
- `address.py:90,113,199,240` — `raise HTTPException(status_code=502, detail=f"...{exc}")` interpolates raw exception text (hostnames, ports, URLs)
- Log full exception server-side
- Return generic detail: `detail="External data source temporarily unavailable"`

**Why:** Exception internals should never be exposed in API responses, even if the frontend currently doesn't surface them. Defense-in-depth.

**10/10:** All 502 responses use generic, user-safe detail messages. Full exception text logged server-side only.

**DoD:**
- [ ] All `HTTPException` detail strings are generic
- [ ] Full exceptions logged via `logger.exception()`
- [ ] Grep for `f"...{exc}"` in HTTPException returns zero matches
- [ ] `ruff check` passes
- [ ] `pytest` passes

---

### 8.6 Add rate limiting

**Appraisal IDs:** H9.6

**What:**
- Zero rate limiting exists
- Add `slowapi` with per-IP limits:
  - `/address/suggest`: 30/min (proxies to PDOK)
  - `/address/{vbo_id}/risks`: 10/min
  - `/address/{vbo_id}/export`: 5/min
  - All other endpoints: 20/min

**Why:** The `/risks` endpoint launches up to 13 outbound HTTP calls per request. Under hammering, PDOK and RIVM rate limits could be exhausted for all users.

**10/10:** Sensible rate limits protect upstream APIs and server resources. Rate limit headers (`X-RateLimit-*`) inform clients. 429 responses include `Retry-After`.

**DoD:**
- [ ] `slowapi` added to `pyproject.toml`
- [ ] Per-endpoint rate limits configured
- [ ] 429 responses include `Retry-After` header
- [ ] Test: exceeding limit returns 429
- [ ] `ruff check` passes
- [ ] `pytest` passes

---

### 8.7 Add HTTP Cache-Control headers

**Appraisal IDs:** P6

**What:**
- Backend sets zero `Cache-Control`, `ETag`, or `Last-Modified` headers
- Add `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` to data endpoints
- Building facts (immutable): `max-age=86400`
- Risk cards (slow-changing): `max-age=3600, stale-while-revalidate=86400`
- Search suggestions: `no-cache` (real-time)

**Why:** Every page revisit re-fetches all resources. A user checking the same address twice pays the full 9s loading penalty.

**10/10:** Browser caches data responses with appropriate TTLs. Repeat visits load cached data instantly, with background revalidation for freshness.

**DoD:**
- [ ] Data endpoints return `Cache-Control` headers
- [ ] TTLs match data freshness characteristics
- [ ] Search endpoint uses `no-cache`
- [ ] `ruff check` passes
- [ ] `pytest` passes

---

## Epic 9: Visual Hierarchy & Simplification

> **Theme:** The dossier is 12+ sections of unstructured scroll where every section has identical visual weight. The fix isn't removing content — it's creating hierarchy through visual differentiation. Three landmarks should draw the eye: risk tiles, 3D viewer, viewing checklist.

### 9.1 Remove RiskCardsPanel

**Appraisal IDs:** S1, NEW-P0b

**What:**
- Delete `frontend/src/components/RiskCardsPanel.tsx` (183 lines) and `RiskCardsPanel.css`
- Remove import and render from `App.tsx:10` and wherever `<RiskCardsPanel>` is rendered
- Remove associated test file
- The flow becomes: `AttentionSummary` → `SummaryStrip` → `RiskTilesGrid` → `RiskDetailView` (on tap)
- Three stops instead of five for the same risk data

**Why:** Risk severity data is shown 3-5 times (flags + pills + tiles + cards + detail). RiskCardsPanel duplicates what RiskDetailView already shows better. The tile-to-detail progressive disclosure is the correct pattern — RiskCardsPanel undermines it.

**10/10:** Risk data follows progressive disclosure: at-a-glance (tiles) → deep dive (detail on tap). No inline repetition. One scroll-screen of vertical space recovered.

**DoD:**
- [ ] `RiskCardsPanel.tsx`, `RiskCardsPanel.css`, `RiskCardsPanel.test.tsx` deleted
- [ ] All imports and render references removed from `App.tsx`
- [ ] `RiskDetailView` remains the sole expanded view for risk data
- [ ] Dossier section order test updated
- [ ] `npm run build` passes
- [ ] `npm run test` passes

---

### 9.2 Remove duplicate bookmark from AddressHeader

**Appraisal IDs:** S3

**What:**
- `AddressHeader.tsx:46` — bookmark icon performs same shortlist toggle as ActionBar
- Both visible simultaneously (header scrolls, ActionBar fixed)
- Remove the bookmark icon from AddressHeader
- ActionBar is the canonical, always-visible location for primary actions

**Why:** Two save buttons for the same action creates ambiguity about which is "the" save action.

**10/10:** One save action, one location (ActionBar), clearly labeled. No competing affordances.

**DoD:**
- [ ] Bookmark icon removed from AddressHeader
- [ ] ActionBar remains the sole save location
- [ ] `npm run build` passes
- [ ] `npm run test` passes

---

### 9.3 Remove DossierSheet grab handle

**Appraisal IDs:** S4, NEW-P2a

**What:**
- `DossierSheet.tsx:18-20` — visible pill handle with `cursor: grab` and hover feedback
- Zero gesture handlers attached. `onSnapChange` prop accepted but never called.
- Remove the handle pill, the `cursor: grab` CSS, and the unused `onSnapChange` prop

**Why:** The handle visually promises drag-to-dismiss behavior that doesn't exist. A false affordance is worse than no affordance.

**10/10:** No UI elements promise interactions that don't exist. The dossier scrolls via native window scroll.

**DoD:**
- [ ] Handle pill HTML removed from DossierSheet
- [ ] `cursor: grab` CSS removed
- [ ] `onSnapChange` prop removed from interface
- [ ] `npm run build` passes

---

### 9.4 Add dismiss/collapse to AttentionSummary

**Appraisal IDs:** S12, P0#3

**What:**
- `AttentionSummary.tsx` — flags persist with no close button, no collapse mechanism
- Add collapse toggle: expanded by default, shows count badge in collapsed state ("3 items need attention")
- Store collapse state in component (resets per address — not localStorage)

**Why:** Attention flags are valuable for first impression but become visual noise during detailed dossier review. Once seen, they've done their job.

**10/10:** AttentionSummary collapses to a compact count badge. Tapping expands to full flag list. Expanded on first view, user can dismiss to focus on details.

**DoD:**
- [ ] Collapse/expand toggle added
- [ ] Collapsed state shows count badge
- [ ] Default: expanded on first view per address
- [ ] i18n key for count badge text
- [ ] `npm run build` passes

---

### 9.5 Differentiate card visual weight

**Appraisal IDs:** S6

**What:**
- 14 dossier CSS files apply `border: 1px solid var(--color-border)` + `box-shadow` uniformly
- Remove borders and shadows from non-interactive cards (BuildingFacts, SoilInfo, NeighborhoodStats)
- Keep card elevation on interactive elements only (RiskTiles, shortlist cards)
- Use spacing and typography for visual separation instead of containers
- Use 3-phase structure (House → Buurt → Action) for visual rhythm with varied spacing

**Why:** When every section looks the same — same border, shadow, radius, padding — nothing stands out. The user has no visual signal for what's important.

**10/10:** Visual hierarchy makes three landmarks obvious at scroll speed: risk tiles (problems?), 3D viewer (context?), viewing checklist (action?). Supporting sections (building facts, soil, stats) recede visually.

**DoD:**
- [ ] Non-interactive cards: borders/shadows removed, spacing separates them
- [ ] Interactive cards: retain elevation treatment
- [ ] Phase dividers have distinct visual treatment
- [ ] Visual rhythm tested at 375px
- [ ] `npm run build` passes

---

### 9.6 Add text labels to SummaryStrip pills

**Appraisal IDs:** S7

**What:**
- `SummaryStrip.tsx:43-48` — pills show only SVG icon + numeric score, no category text
- Add short labels: "Noise 72", "Air 85", "Climate 45", "Sun 68"
- Use `t('risk.category.${category}')` for i18n
- If S1 removes RiskCardsPanel, the strip becomes more important as the sole at-a-glance summary

**Why:** Users must decode icon meanings (sound waves, leaf, water drop, sun) — exactly the "GIS portal" anti-reference. Labels make pills self-explanatory.

**10/10:** Each pill is instantly readable: icon + label + score. No icon decoding required.

**DoD:**
- [ ] Each pill shows category label text alongside icon and score
- [ ] Labels use i18n keys in both locales
- [ ] Pills fit at 375px width with labels (may need horizontal scroll or 2-row layout)
- [ ] `npm run build` passes

---

### 9.7 Delete dead components

**Appraisal IDs:** S10

**What:**
- `SpringTuner.tsx` + `SpringTuner.css` + `SpringTuner.test.tsx` — never imported outside own test (~80 lines)
- `SkeletonCard.tsx` / `SkeletonLine` / `SkeletonGrid` — never imported outside own test (~60 lines)
- `DossierSkeleton.tsx` / `StatsSkeleton.tsx` — never imported in App.tsx (~90 lines)
- Total: ~230 lines of components + CSS + tests testing dead code

**Why:** Dead code obscures the codebase and costs maintenance. Tests that pass on dead code give false confidence.

**10/10:** Every component in the codebase is imported and rendered somewhere in production. Zero orphaned components.

**DoD:**
- [ ] All dead components, their CSS files, and their test files deleted
- [ ] No import references remain
- [ ] `npm run build` passes
- [ ] `npm run test` passes (test count decreases, that's expected)

---

### 9.8 Replace hardcoded font specs with design tokens

**Appraisal IDs:** S11

**What:**
- `RiskTile.css:51-54` — hardcoded `28px/900` → use `--type-score-tile`
- `LivabilityCard.css:63` — hardcoded `700 24px/1` → use `--type-data`
- `RiskTile.css:36-38` — hardcoded `13px/600` → use `--type-caption` or `--type-label`
- `TierBSignalsCard.css:76` — hardcoded `11px` → use `--type-micro`

**Why:** 4 hardcoded font specs bypass the type system. Doesn't change visual result now but prevents future type scale adjustments from being applied uniformly.

**10/10:** Zero hardcoded font-size or font-weight values in component CSS. Every text style references a design token.

**DoD:**
- [ ] All 4 hardcoded font specs replaced with token references
- [ ] Visual output unchanged
- [ ] Grep for `font-size:.*px` in component CSS returns only token-based values
- [ ] `npm run build` passes

---

### 9.9 Resolve Home/Briefing tab semantic overlap

**Appraisal IDs:** NEW-P0a

**What:**
- Both Home and Briefing tabs route to `activeScreen='dossier'` when a dossier is loaded
- `handleAddressSelect()` forces `setActiveTab('briefing')` on every new address
- Two tabs for the same screen weakens IA clarity
- Options: (a) merge into single tab that changes label, (b) make Home always show search, or (c) clarify distinct purposes

**Why:** Users see two tabs that lead to the same content. Not a functional bug, but a design smell that confuses navigation.

**10/10:** Each tab has a clear, distinct purpose. No two tabs show the same screen.

**DoD:**
- [ ] Home and Briefing tabs have distinct routing behavior
- [ ] No two tabs render the same content
- [ ] Tab labels clearly communicate their destination
- [ ] `npm run build` passes

---

### 9.10 Add search-to-dossier screen boundary

**Appraisal IDs:** P0#2

**What:**
- Search bar and "RECENT" label persist visually when dossier loads
- `activeScreen === 'search' || activeScreen === 'dossier'` renders both in same block
- Add clear visual transition between search context and dossier context
- When dossier loads: collapse search bar into the sticky scroll nav, hide recent searches

**Why:** No clear screen boundary between "searching for an address" and "reviewing a dossier." Users see search UI mixed with dossier content.

**10/10:** Entering a dossier feels like opening a new document. Search context collapses cleanly. Dossier has its own visual identity.

**DoD:**
- [ ] Search bar collapses or transforms when dossier loads
- [ ] Recent searches hidden during dossier view
- [ ] Clear visual transition between states
- [ ] Back-to-search is easy to find
- [ ] `npm run build` passes

---

## Epic 10: Compare & Export Polish

> **Theme:** The compare feature is the hero decision-making tool — but it's a 3-step hidden path accessible only via Saved tab → Compare button. It needs discoverability, keyboard access, and visual completeness.

### 10.1 Add legend and directionality to comparison bars

**Appraisal IDs:** P2#11

**What:**
- `RiskDetailView` and `LivabilityDetailView` comparison bars use same `var(--color-accent)` with only opacity distinguishing reference bars
- No persistent legend. No "higher = better" or "higher = worse" indicator.
- Add color-differentiated bars (address, city, NL, WHO) with inline or persistent legend
- Add directionality label per metric

**Why:** The comparison bars are the feature's crown jewel — address vs city vs NL vs WHO. Without a legend or direction indicator, users can't interpret what they're seeing.

**10/10:** Every comparison bar has a clear legend, distinct colors per reference, and "lower is better" / "higher is better" context.

**DoD:**
- [ ] Comparison bars use distinct, theme-aware colors per reference level
- [ ] Legend identifies each bar color
- [ ] Directionality label indicates if higher/lower is better
- [ ] i18n keys for legend labels
- [ ] `npm run build` passes

---

### 10.2 Add compare discoverability prompt in dossier

**Appraisal IDs:** F2d, S-D

**What:**
- Compare is accessible only via: search → save 2+ addresses → Saved tab → Compare button
- Never mentioned in the dossier. Never prompted after saving 2+ addresses.
- After saving a 2nd address, show a contextual prompt: "You've saved 2 addresses — tap Compare to see them side by side"
- Or add a "Compare with saved" button in the dossier ActionBar when 2+ addresses are saved

**Why:** The hero decision-making feature is invisible to users who don't explore the Saved tab. It's a 3-step hidden path.

**10/10:** Users who save 2+ addresses are prompted to compare within one interaction. The compare feature is discoverable from the dossier, not just from the Saved tab.

**DoD:**
- [ ] Prompt appears after saving 2nd address (toast or inline prompt)
- [ ] Prompt navigates to compare on tap
- [ ] Prompt shown once (tracked in localStorage per session)
- [ ] i18n keys in both locales
- [ ] `npm run build` passes

---

### 10.3 Fix CompareScreen layout for 320px phones

**Appraisal IDs:** F14

**What:**
- `CompareScreen.css:57` — `min-width: 170px` with `flex: 0 0 calc(50vw - var(--space-base))`
- At 320px: `50vw - 16px = 144px`, min overrides to 170px. Two columns = 340px > viewport.
- Reduce `min-width` to `140px` or use percentage-based sizing

**Why:** Compare screen overflows on small Android phones (320px width), making columns unreadable.

**10/10:** Compare layout works at 320px minimum width. Columns fit within viewport with horizontal scroll-snap.

**DoD:**
- [ ] `min-width` reduced to fit 2 columns at 320px
- [ ] Tested at 320px and 375px widths
- [ ] `npm run build` passes

---

### 10.4 Replace ParallelCoordinates hardcoded colors with tokens

**Appraisal IDs:** F8

**What:**
- `frontend/src/components/ui/ParallelCoordinates.tsx:25` — `SERIES_COLORS = ['#00897B', '#9AA0A6', '#D1D5DB', '#E8913A']`
- Inline `style={{ backgroundColor: color }}` at lines 130-133
- Replace with CSS custom properties or computed theme-aware colors
- `#9AA0A6` merges with `--color-text-secondary` in dark mode

**Why:** Hardcoded hex colors violate the design rule "always use `var(--token-name)`" and break in dark mode where `#9AA0A6` becomes invisible against the dark surface.

**10/10:** Chart colors are theme-aware design tokens. All series are distinguishable in both light and dark mode.

**DoD:**
- [ ] `SERIES_COLORS` replaced with CSS custom property references
- [ ] Colors distinguishable in both themes
- [ ] Inline `style={{ backgroundColor }}` replaced with class-based styling
- [ ] `npm run build` passes

---

### 10.5 Fix ParallelCoordinates SVG responsive width

**Appraisal IDs:** F20

**What:**
- `ParallelCoordinates.tsx:20` — `WIDTH = 360` hardcoded. `viewBox="0 0 360 190"`
- NL axis labels longer than EN, causing overlap at narrow widths
- Use responsive width based on container or `viewBox` + `preserveAspectRatio`

**Why:** Hardcoded 360px width doesn't adapt to different screen sizes. NL labels overflow at narrow widths.

**10/10:** SVG scales responsively to container width. Labels don't overlap at any supported width.

**DoD:**
- [ ] SVG width is responsive (percentage or viewBox-based)
- [ ] Labels don't overlap at 320px container width
- [ ] NL labels fit without clipping
- [ ] `npm run build` passes

---

### 10.6 Explain Compare "Differences Only" filter threshold

**Appraisal IDs:** F2c

**What:**
- `CompareScreen.tsx:49` — `Math.max(...valid) - Math.min(...valid) > 15` — magic number with no UI explanation
- Add explanatory text: "Showing categories where addresses differ by more than 15 points"
- Consider making the threshold configurable or removing the filter for transparency

**Why:** Users don't know why some categories disappear when "Differences Only" is active. The magic `> 15` threshold is unexplained.

**10/10:** Filter behavior is transparent. Users understand what "Differences Only" means and why certain categories are hidden.

**DoD:**
- [ ] Filter explanation visible in UI when active
- [ ] i18n keys for explanation text
- [ ] `npm run build` passes

---

### 10.7 Add winner/overall summary to CompareScreen

**Appraisal IDs:** F9

**What:**
- No aggregate comparison anywhere in CompareScreen
- Add summary line: "Address A leads in 3 of 4 categories" or similar
- Or highlight the address with the highest overall score

**Why:** Product principle: "Consequences over data." Raw parallel coordinates violate this. Users want to know "which address is better overall?"

**10/10:** The compare screen clearly communicates which address is stronger overall, while showing per-category nuance. Not a simple "winner" — a guided comparison.

**DoD:**
- [ ] Summary/verdict section at top or bottom of compare view
- [ ] Overall scoring or category-win count displayed
- [ ] i18n keys in both locales
- [ ] `npm run build` passes

---

### 10.8 Fix ShortlistScreen hardcoded overlay color

**Appraisal IDs:** F18

**What:**
- `ShortlistScreen.css:96` — `rgba(28, 45, 63, 0.86)` hardcoded instead of `var(--color-primary)`
- Line 78: `#fff` instead of `var(--color-text-inverse)`
- Replace with design token references

**Why:** Design system violation. Hardcoded colors break dark mode theming.

**10/10:** Zero hardcoded hex/rgba values in ShortlistScreen CSS. All colors reference design tokens.

**DoD:**
- [ ] All hardcoded colors replaced with `var(--token)` references
- [ ] Dark mode ShortlistScreen renders correctly
- [ ] `npm run build` passes

---

### 10.9 Add export language mismatch warning

**Appraisal IDs:** F10

**What:**
- `ExportBottomSheet.tsx:53-55` — export language can be changed independently of app language
- No mismatch indicator when export language differs from UI language
- Add subtle warning: "PDF will be generated in English" when languages differ

**Why:** User might accidentally export in the wrong language, discovering the mismatch only when reading the PDF.

**10/10:** Export language is clearly communicated. Mismatch is flagged before generation, not after.

**DoD:**
- [ ] Warning shown when export language differs from UI language
- [ ] Warning uses i18n key
- [ ] `npm run build` passes

---

### 10.10 Make export progress data-driven

**Appraisal IDs:** F19

**What:**
- `ExportBottomSheet.tsx:78-86` — fixed progress jumps (0→25→65→90→100) not correlated to real progress
- The `collecting→rendering` transition is instant; actual API call spans the middle range
- Tie progress percentages to actual completion stages or use indeterminate progress during the API call

**Why:** Fixed progress percentages create a false sense of precision. The ring jumps unnaturally, undermining trust in the progress indicator.

**10/10:** Progress reflects actual completion. Or: use indeterminate animation during the API call (honest about uncertainty) with determinate for known stages.

**DoD:**
- [ ] Progress correlates to actual stages or uses indeterminate animation
- [ ] No fixed percentage jumps that don't match reality
- [ ] `npm run build` passes

---

## Appendix: PRD Compliance Gaps (Cross-Reference)

These PRD requirements are NOT met. Stories above address most of them. Remaining gaps are either deferred features or design conflicts.

| PRD Requirement | Status | Addressed By |
|----------------|--------|--------------|
| Checklist persists across backgrounding (SC-4.3.4c) | NOT IMPLEMENTED | Story 7.9 |
| ActionBar appears on scroll to checklist (SC-4.3.5a) | CONFLICTS with spec SC-13e | Design decision needed |
| Summary pills section pulse (SC-4.3.1c) | PARTIAL (scroll works, pulse missing) | Story 4.2 (part of stagger) |
| Dossier section staggered reveal 80ms (animation table) | NOT IMPLEMENTED | Story 4.2 |
| 3D deferred until viewport entry | NOT IMPLEMENTED (eager Phase 3) | Story 5.6 (partial — earlier, not deferred) |
| Progressive 3D 3-tier fallback (§4.3.2) | NOT IMPLEMENTED | Deferred |
| Expat concept translation (? icons) (ui-principles §11) | NOT IMPLEMENTED | Deferred |
| Camera presets (street/balcony/top-down) (design-spec §4.3) | NOT IMPLEMENTED | Deferred |
| Risk detail as only expanded view | VIOLATED (tile + card + detail) | Story 9.1 |
| 3D building distance-stagger fade-in 50ms | NOT IMPLEMENTED | Deferred (high effort) |

---

## Appendix: Aesthetic Observations (Non-Blocking)

These are qualitative observations from the Codex review. They inform design direction but are not bugs.

- **Typography weight distribution is narrow.** 64% of `font-weight` declarations are 600. Consider: 900 for headings, 300 for metadata, 500 for body.
- **Light mode feels flat.** White cards on nearly-white background with thin borders. Needs more surface depth: shadows, subtle gradients, or varied background tones.
- **Color usage is conservative.** Arctic Teal appears on buttons and target building but the dossier body is almost entirely monochrome. Consider using color more boldly for visual landmarks.
- **Dark mode is better than light mode.** OLED black with teal accents creates genuine atmosphere. Light theme needs more personality.

---

## Appendix: Deduplication Map

Findings that appeared in multiple audit sections, merged into single stories:

| Story | Source IDs |
|-------|-----------|
| 2.1 (formatRelativeTime) | C1, H3.1, P3#18, NEW-P1b |
| 2.2 (raw severity badge) | P0#1, C2, H3.3 |
| 1.1 (reduced-motion) | A7, H7.1 |
| 7.5 (ConfirmSheet) | F13, C16 |
| 4.5 (theme crossfade) | A5, P10 |
| 9.1 (remove RiskCardsPanel) | S1, NEW-P0b |
| 9.3 (remove grab handle) | S4, NEW-P2a |
| 9.4 (dismiss AttentionSummary) | S12, P0#3 |
| 3.6 (error mapping) | C8, H9.5 |
| 6.1 (welcome rewrite) | O1, P1#8 |
| 6.6 (empty state CTAs) | O6, C14 |
| 5.8 (lazy images + height anim) | H8.1, H8.2, P9 |
| 7.3 (concurrent ops) | H5.1, H5.2, H5.3 |
| 7.4 (timer cleanup) | H6.1, H6.2, H6.3 |
| 7.8 (export button states) | F6, NEW-P2b |

---

## Appendix: Additional Stories (Gap Closure)

> Stories below were identified during completeness audit. They close coverage gaps for findings that were planned but not included in the main epic sections above.

### 6.9 Add visible dossier orientation

**Appraisal IDs:** O4

**What:**
- After loading, user is dropped into 14 sections with no sense of progress or hierarchy
- The 3-phase structure (House → Buurt → Action) exists in code (`DossierPhaseDivider` components) but is styled as thin text separators
- Enhance phase dividers to be visual landmarks: larger text, icons, progress indication ("2 of 3 sections complete")
- Add "here's what you'll see" summary at dossier top
- DossierScrollNav shows current phase on scroll — make it more prominent

**Why:** The three-phase structure is genuinely good IA — architecturally present but perceptually absent. Users scroll through 14 sections with no sense of progress or completion.

**10/10:** Phase transitions are visible landmarks during scroll. User always knows "where am I" in the dossier. Phase dividers feel like turning to a new chapter.

**DoD:**
- [ ] Phase dividers are visual landmarks (not thin text separators)
- [ ] Progress indication shows current phase
- [ ] Scroll nav prominently displays current section
- [ ] i18n keys for phase names in both locales
- [ ] `npm run build` passes

---

### 6.10 Add post-dossier "what's next" prompt

**Appraisal IDs:** O8

**What:**
- After scrolling 14 dossier sections, user reaches ViewingChecklist and ActionBar
- No guidance on the compare workflow or export workflow
- Add a contextual prompt after the viewing checklist: "Save this address and search for another to compare" or "Export as PDF to take to your viewing"
- Bridge the gap between insight (understanding scores) and action (saving, exporting, comparing)

**Why:** The "aha moment" happens mid-scroll. The action moment requires independently discovering ActionBar and Saved tab. No bridge between insight and action.

**10/10:** After completing the dossier scroll, users see a clear "what to do next" section that promotes the three key actions: save, export, compare.

**DoD:**
- [ ] Post-checklist "next steps" section added
- [ ] Suggests save, export, and compare actions
- [ ] i18n keys in both locales
- [ ] `npm run build` passes

---

### 6.11 Add returning user re-engagement

**Appraisal IDs:** O10

**What:**
- No "Welcome back" or personalized greeting for returning users
- No "Your saved addresses" prompt (must navigate to Saved tab manually)
- No "New data available" indicator for previously searched addresses
- Value props vanish permanently after first search
- Use first-visit flag (story 6.5) to show different home screen for returning users: recent searches + saved addresses count + "Continue where you left off"

**Why:** A returning user who hasn't visited in 2 weeks gets no re-orientation. The app treats them identically to a first-time visitor (minus the value props, which are gone).

**10/10:** Returning users see: their recent searches, saved address count, and a "Continue comparing" prompt if they have 2+ saved addresses.

**DoD:**
- [ ] Returning user home screen differs from first-visit
- [ ] Shows saved address count and recent searches
- [ ] Prompt to continue comparison workflow if applicable
- [ ] `npm run build` passes

---

### 9.11 Remove construction year from PropertyWarningsCard

**Appraisal IDs:** S2

**What:**
- Construction year appears in 3 places simultaneously: `AddressHeader.tsx:26` ("Built 1923"), `BuildingFactsCard.tsx:32` (facts list), `PropertyWarningsCard.tsx:75` (foundation risk)
- Keep in AddressHeader (contextual) and BuildingFactsCard (canonical facts)
- Remove from PropertyWarningsCard — foundation risk should reference age implication ("pre-1970 construction") without repeating the exact year

**Why:** Redundant repetition of the same data point wastes vertical space and dilutes impact.

**10/10:** Each data point appears in exactly one canonical location. References use implications, not repetition.

**DoD:**
- [ ] Construction year removed from PropertyWarningsCard
- [ ] Foundation risk text references age range instead of exact year
- [ ] `npm run build` passes

---

### 9.12 Replace viewing questions duplication with callout

**Appraisal IDs:** S9, P2#14

**What:**
- Same questions appear in `RiskDetailView` (per-category modal) and `ViewingChecklist` (persistent bottom section)
- Both share `checkedQuestions` state (syncs correctly)
- In `RiskDetailView`, replace inline checkboxes with a brief callout: "These questions are saved to your Viewing Checklist"
- ViewingChecklist remains the canonical action-oriented location

**Why:** Users who find questions in the detail view wonder why they repeat in the checklist. Duplication is by design but confusing.

**10/10:** Detail view shows questions as read-only context with a link to the checklist. Checklist is the single interactive location for checking off questions.

**DoD:**
- [ ] RiskDetailView shows callout instead of duplicate checkboxes
- [ ] Callout links/scrolls to ViewingChecklist
- [ ] ViewingChecklist remains fully interactive
- [ ] `npm run build` passes

---

### 9.13 Extract useAsyncData hook from App.tsx

**Appraisal IDs:** S5, S-C

**What:**
- `App.tsx` (1,986 lines) has 47 `useState` hooks, 31 `useCallback`, 3 `useMemo`
- The data-fetch pattern is repeated 5 times identically: `[data, setData]` + `[loading, setLoading]` + `[error, setError]`
- × 5 sources (risk, warnings, livability, stats, tierB) = 15 of 47 states
- Extract a `useAsyncData<T>` hook encapsulating data/loading/error triad + retry logic
- Extract `handleAddressSelect` (170 lines) into a `useDossierLoader` hook

**Why:** This doesn't directly affect UX but makes every other UX change cheaper. The 170-line `handleAddressSelect` callback is a sequential async state machine that's difficult to reason about. Every checkbox toggle re-renders the entire tree because of cascading state updates.

**10/10:** App.tsx is reduced to ~1,000 lines. Data fetching logic is in reusable hooks. State changes in one section don't cascade through unrelated sections.

**DoD:**
- [ ] `useAsyncData<T>` hook created with data/loading/error/retry
- [ ] 5 data-fetch patterns replaced with hook calls (15 states → 5 hooks)
- [ ] `handleAddressSelect` extracted to `useDossierLoader`
- [ ] No behavioral changes
- [ ] `npm run build` passes
- [ ] `npm run test` passes

---

### 7.12 Fix hash routing silent failure on shared links

**Appraisal IDs:** F3

**What:**
- `applyRoute()` at `App.tsx:1175` — when a shared link `#/address/{vboId}` is opened and PDOK lookup fails, there is no targeted error toast
- `parseHashRoute()` at line 343 always returns a valid route object
- Add specific error handling for "address not found from shared link" — show a toast: "We couldn't find the address from this link. Try searching instead."

**Why:** Users sharing dossier links expect them to work. When they don't (PDOK failure, address removed), the failure is silent — no explanation, no guidance.

**10/10:** Shared link failures show a clear, friendly error message with a suggestion to search manually.

**DoD:**
- [ ] PDOK lookup failure in route hydration shows targeted error toast
- [ ] Error message uses i18n key
- [ ] User is left on search screen (not broken state)
- [ ] `npm run build` passes

---

### 7.13 Add retry mechanism to BuildingFactsCard

**Appraisal IDs:** H2.5

**What:**
- `BuildingFactsCard.tsx:14-19` — component receives `loading` and `building` props but no `error` prop
- If `getBuildingFacts()` fails, dossier sheet is hidden entirely
- Add `error` prop. If error, show `t('building.loadError')` with retry button
- Retry should re-invoke `getBuildingFacts` without resetting entire dossier

**Why:** Building facts is the anchor section of the dossier. If it fails, the entire dossier hides — nuclear response to a recoverable failure.

**10/10:** Building facts failure shows an error card with retry button. The rest of the dossier still renders (other data sources may have succeeded).

**DoD:**
- [ ] `error` and `onRetry` props added to BuildingFactsCard
- [ ] Error state renders retry button instead of hiding dossier
- [ ] Rest of dossier unaffected by building facts failure
- [ ] `npm run build` passes

---

### 6.12 Add 3D keyboard controls visual hint

**Appraisal IDs:** N5

**What:**
- `NeighborhoodViewer3D.tsx:900+` — keyboard handlers for arrow keys / +/- exist but have no visual affordance
- Pinch/rotate/pan gestures are undiscoverable on mobile
- Add a small overlay hint: "Drag to rotate, pinch to zoom" that fades after 3s on first interaction
- Show keyboard controls hint on desktop: "Arrow keys to rotate, +/- to zoom"

**Why:** 3D controls are standard for gamers but undiscoverable for the target audience (nervous expats, first-time buyers).

**10/10:** First-time 3D interaction shows a brief, contextual gesture guide that fades after the user interacts. Never shown again.

**DoD:**
- [ ] Gesture hint overlay appears on first 3D section view
- [ ] Desktop hint mentions keyboard controls
- [ ] Hint fades after 3s or first interaction
- [ ] Tracked in localStorage (shown once)
- [ ] `npm run build` passes

---

### 7.14 Add loading skeleton for individual dossier sections

**Appraisal IDs:** P1#5

**What:**
- `LoadingScreen` with animated SVG renders during initial fetch. `RiskTileSkeleton` exists for risk cards.
- But `DossierSkeleton` and `SkeletonCard` are dead code (never imported in App.tsx)
- Individual dossier sections beyond risk tiles lack skeleton loading states
- Add lightweight skeletons (shimmer rectangles matching section layout) for BuildingFacts, PropertyWarnings, Livability, NeighborhoodStats during their respective fetch phases

**Why:** When progressive loading transitions from house → buurt phase, new sections pop in with no visual preparation. Skeletons set spatial expectations.

**10/10:** Every data-dependent section shows a skeleton that matches its loaded layout during loading. Zero layout shift when data arrives.

**DoD:**
- [ ] Skeleton states for major dossier sections (not just risk tiles)
- [ ] Skeletons match loaded layout dimensions
- [ ] Skeletons use existing `Skeleton` shimmer component
- [ ] No layout shift on loading → loaded transition
- [ ] `npm run build` passes

---

### 10.11 Add tap-to-expand for shadow snapshots

**Appraisal IDs:** P2#12

**What:**
- `ShadowSnapshots.tsx` — responsive thumbnails with labels but no `onClick` handler
- At mobile widths (~100px per thumbnail), 3D content is hard to distinguish
- Add tap-to-expand: open a lightbox/modal with full-size snapshot + time label
- Reuse BottomSheet component for the lightbox

**Why:** Shadow analysis snapshots are the visual evidence for sunlight risk. At thumbnail size, they're decorative rather than informative.

**10/10:** Tapping a snapshot opens a full-screen lightbox with the 3D shadow view at readable size. Swipe between morning/noon/evening.

**DoD:**
- [ ] Tap handler opens expanded view
- [ ] Expanded view shows full-size snapshot with label
- [ ] Dismiss via tap-outside or close button
- [ ] `npm run build` passes

---

### 9.14 Reduce fixed bar viewport consumption

**Appraisal IDs:** P1#9

**What:**
- ActionBar: `position: fixed`, 48px, z-index 41. TabBar: `position: fixed`, 56px, z-index 50.
- Total: 104px + safe-area inset (~138px on notched iPhones) = 16-21% of 667px SE screen
- PRD SC-4.3.5a says ActionBar should appear on scroll-to-checklist; spec SC-13e says always-visible — CONFLICT
- Options: (a) make ActionBar scroll-triggered (PRD), (b) combine ActionBar into TabBar area, (c) accept current design

**Why:** 138px of permanently consumed viewport on a small phone is aggressive. Reduces the visible dossier content to ~79% of screen height.

**10/10:** Fixed bars consume ≤ 100px total (excluding safe area). ActionBar appears contextually when it's most useful, not permanently.

**DoD:**
- [ ] Design decision documented: scroll-triggered vs always-visible
- [ ] If scroll-triggered: ActionBar appears on checklist section visibility
- [ ] If always-visible: combined with TabBar to reduce total height
- [ ] Viewport consumption ≤ 100px on iPhone SE
- [ ] `npm run build` passes

---

## Appendix: Deduplication Map (Extended)

| Story | Source IDs |
|-------|-----------|
| 2.1 (formatRelativeTime) | C1, H3.1, P3#18, NEW-P1b |
| 2.2 (raw severity badge) | P0#1, C2, H3.3 |
| 1.1 (reduced-motion) | A7, H7.1 |
| 7.5 (ConfirmSheet) | F13, C16, S-A |
| 4.5 (theme crossfade) | A5, P10 |
| 9.1 (remove RiskCardsPanel) | S1, NEW-P0b |
| 9.3 (remove grab handle) | S4, NEW-P2a |
| 9.4 (dismiss AttentionSummary) | S12, P0#3 |
| 3.6 (error mapping) | C8, H9.5 |
| 6.1 (welcome rewrite) | O1, P1#8 |
| 6.6 (empty state CTAs) | O6, C14 |
| 5.8 (lazy images + height anim) | H8.1, H8.2, P9 |
| 7.3 (concurrent ops) | H5.1, H5.2, H5.3 |
| 7.4 (timer cleanup) | H6.1, H6.2, H6.3 |
| 7.8 (export button states) | F6, NEW-P2b |
| 7.6 (scroll restoration) | F12, S-B |
| 9.12 (viewing Q duplication) | S9, P2#14 |
| 9.13 (useAsyncData) | S5, S-C |
| 5.2 (React.memo) | P2 perf, S-C (partial) |

## Appendix: Intentionally Excluded Findings

These findings were REFUTED, STALE, or intentionally DEFERRED — they are NOT missing:

| Finding | Reason for Exclusion |
|---------|---------------------|
| NEW-P0 Shortlist reopen no-op | REFUTED — fully implemented at App.tsx:1144-1170 |
| P2#13 Time slider unwired | REFUTED — imported App.tsx:8, rendered line 1826 |
| P2#15 No scroll-to-section | STALE — `scrollIntoView` implemented |
| P3#16 Language toggle no aria-label | REFUTED — has `aria-label="Language"` |
| P3#17 Theme toggle cryptic | REFUTED — no sun/moon toggle exists |
| NEW-P2 Summary pills don't scroll | PARTIALLY REFUTED — pills DO scroll + highlight |
| NEW-P2 Shortlist cards non-semantic | PARTIALLY REFUTED — have role="button" + keyboard |
| Hash routing missing | REFUTED — added in commit `a8fcd19` |
| Progressive loading missing | REFUTED — implemented with 'house'/'buurt' phases |
| F17 Search input missing autocomplete | REFUTED — `autoComplete="off"` present at line 162 |
| A8 Language switch crossfade | DEFERRED — rarely used, race condition risk |
| A9 3D building stagger fade-in | DEFERRED — merged geometry complicates per-building animation |
| Camera presets | DEFERRED — removed from scope as over-designed |
| 3D 3-tier fallback | DEFERRED — progressive LoD not prioritized |
| Expat concept translation | DEFERRED — ? icons for Dutch terms |
| P1#6 Search keyboard focus dark theme | NEEDS VISUAL VERIFICATION — CSS uses correct token |
| Claude UX audit factual errors (20+) | N/A — audit was unreliable, findings assessed individually |

---

**Total: 10 epics, 100 stories, 0 findings discarded, 17 findings intentionally excluded (refuted/stale/deferred).**
