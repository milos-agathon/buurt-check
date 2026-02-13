# Mobile UI Premium Design Spec

**Date:** 2026-02-13 (Revision 2: 2026-02-13)
**Goal:** Elevate buurt-check's mobile UX to Apple-tier native feel
**Key moments:** First search result, risk card deep-dive, compare flow
**Quality bar:** Apple Weather / Maps / Health
**Dependencies:** Framer Motion (~33KB gzipped)

**Revision 2 changes:** Addresses 12 findings from code-level review. Added: App state migration architecture (Finding 1), resolved peek-state contradictions (2), defined cold-launch map behavior (3), scoped bottom sheet naming (4), removed tile-count progress (5), detailed LoadingScreen removal migration (6), replaced negative-margin with pseudo-element pattern (7), corrected all baseline values (8), replaced touch-only with pointer-event strategy (9), added RiskDetailView tree refactor plan (10), added spring tuner dev gating (11), added complete test migration matrix and feature flag rollout plan (12).

---

## Guiding Framework

This design is not about closing an aesthetic gap with Apple-native apps. It's about identifying which interaction patterns are structurally broken for buurt-check's product principles (see `docs/ui-principles.md`). A draggable bottom sheet isn't polish -- it's whether the map-first architecture works. Skeleton loading isn't perceived speed -- it's whether users trust the data. Touch targets aren't HIG compliance -- it's whether expats can reliably tap risk tiles on a crowded phone screen.

**Tier 1 (structural, do first):** Bottom sheet, skeleton loading, touch targets
**Tier 2 (perception gap, do next):** Press states, spring physics, shared element transitions
**Tier 3 (defer until user feedback):** Tab indicator animation, screen transitions

---

## 0. App State Machine Migration

### Current State (`App.tsx:60-304`)

```
Screen = 'search' | 'dossier' | 'shortlist' | 'compare' | 'settings'
TabId = 'search' | 'briefing' | 'saved'

Screen routing:
  - 'search'/'briefing' tab -> 'search' or 'dossier' screen (based on address data)
  - 'saved' tab -> 'shortlist' screen
  - Compare/Settings are sub-screens navigated via callbacks
```

The current architecture gates the entire dossier behind `showLoadingScreen` (line 672). The loading screen is a full-page blocker between search and dossier. Tab change logic (`handleTabChange`, line 296) maps 'briefing' tab to dossier screen.

### Target State

```
Screen = 'search' | 'dossier' | 'shortlist' | 'compare' | 'settings'
TabId = 'search' | 'saved'          // 'briefing' REMOVED

Sheet state (new):
  sheetSnap: 'hidden' | 'peek' | 'half' | 'full'
  sheetContent: 'dossier' | null

Routing rules:
  - 'search' tab: map + search bar. If address resolved, sheet visible at peek/half/full.
  - 'saved' tab: ShortlistScreen replaces sheet. Map hidden (sheet unmounted).
  - 'compare': CompareScreen replaces sheet. Map hidden.
  - 'settings': SettingsScreen replaces sheet. Map hidden.
```

**Critical rule:** The bottom sheet with map is ONLY for search+dossier. Saved, Compare, and Settings are full-screen views that replace the sheet entirely. This avoids the complexity of rendering a sheet over non-map content.

### Migration Steps

1. **Remove `'briefing'` from `TabId` type.** Update `TabBar.tsx:4` (`TABS` array), remove the briefing entry. Update `handleTabChange` (line 296-304) to remove `'briefing'` branch.

2. **Remove `showLoadingScreen` gate.** Delete 5 loading screen state variables (lines 166-169): `showLoadingScreen`, `loadingAddress`, `loadingProgressText`, `loadingTone`, `loadingTimeoutRef`. Delete 3 callbacks (lines 200-221): `setLoadingStage`, `showLoadingWarning`, `finishLoadingFlow`. Delete the 8s timeout (lines 335-339). Replace the `showLoadingScreen ? <LoadingScreen/> : <Content/>` ternary (lines 672-831) with direct rendering where each section manages its own loading state.

3. **Move `setActiveScreen('dossier')` before try block.** Currently at line 345, after `lookupAddress` resolves. Move to immediately after search submission (before `await lookupAddress`). The dossier screen with skeletons should appear instantly, not after the first API call returns.

4. **Add `sheetSnap` state.** `const [sheetSnap, setSheetSnap] = useState<'hidden' | 'peek' | 'half' | 'full'>('hidden')`. Set to `'half'` when address resolves. Set to `'hidden'` on new search. Default to `'hidden'` on cold launch.

5. **Conditional layout.** `App.tsx` render becomes:
   ```
   if (activeScreen === 'shortlist' || 'compare' || 'settings') -> full-screen view, no sheet, no map
   if (activeScreen === 'search' || 'dossier') -> map layer + DossierSheet overlay
   ```

### State Variable Cleanup

| Variable | Action | Reason |
|----------|--------|--------|
| `showLoadingScreen` | DELETE | Replaced by skeleton loading |
| `loadingAddress` | DELETE | Address available immediately from Locatieserver |
| `loadingProgressText` | DELETE | Each section shows own skeleton |
| `loadingTone` | DELETE | Warning states move to per-section error handling |
| `loadingTimeoutRef` | DELETE | 8s global timeout removed |
| `setLoadingStage` | DELETE | Callback no longer needed |
| `showLoadingWarning` | DELETE | Per-section error handling replaces global warning |
| `finishLoadingFlow` | DELETE | Loading flow no longer has centralized finish |

### `handleAddressSelect` Rewrite Outline

```
1. Reset all data states (lines 313-332) — keep as-is
2. setActiveScreen('dossier')  // MOVE before await
3. setSheetSnap('peek')        // Sheet appears with skeletons
4. const resolved = await lookupAddress(suggestion.id)
5. setAddress(resolved)
6. setSheetSnap('half')        // Spring-animate to half
7. Fire all parallel IIFEs (risks, stats, tier-b, 3D) — keep as-is
8. Each IIFE sets its own loading/data/error state — keep as-is
```

---

## 1. Gesture-Driven Bottom Sheet

### Architecture

The bottom sheet is the architectural spine of the app. It transforms buurt-check from "scrollable page with map" to "spatial intelligence tool."

The current dossier screen becomes sheet content. The map stays mounted behind the sheet at all times. The sheet IS the briefing -- there is no "Briefing" tab.

**Tab navigation changes:** `TabId = 'search' | 'saved'`. Two tabs only. Compare and Settings are navigated to from within those tabs (compare from saved, settings from gear icon).

### Scope: Map-First Shell Applies Only to Search + Dossier

The bottom sheet + persistent map pattern applies ONLY when `activeScreen` is `'search'` or `'dossier'`. When the user navigates to Saved, Compare, or Settings, the sheet and map are unmounted and replaced with a full-screen view. Rationale: these screens have no spatial context that benefits from a map backdrop.

### Bottom Sheet Component Naming

**New file:** `src/components/DossierSheet.tsx` — the gesture-driven dossier sheet.
**Existing file:** `src/components/ui/BottomSheet.tsx` — the simple modal sheet (used by ExportBottomSheet).

These are distinct components with different APIs. `DossierSheet` uses Framer Motion drag, three snap points, and spring physics. `ui/BottomSheet` remains a simple open/close modal. `ExportBottomSheet.tsx` (line 165: `<BottomSheet isOpen={isOpen}>`) continues using `ui/BottomSheet` unchanged.

### Three Snap Points

| Snap | Height | Content visible | Map visible |
|------|--------|----------------|-------------|
| Peek | Fixed 140px | Drag handle (4px pill) + address header (street + postcode) + summary badges (4 score pills) | Fully visible |
| Half | ~50% viewport | Everything in peek + risk tiles grid (2x2) + section labels | Upper half visible |
| Full | ~90% viewport | Full dossier scroll (all sections) | Small peek at top |

**Peek content is exactly:** drag handle + AddressHeader (truncated to single line) + SummaryStrip. No search bar in peek state. The search bar is in the TopBar area above the map, always accessible. This resolves the contradiction between lines 35 and 39 of the original spec.

**Peek is the floor.** The sheet never dismisses once a search has been performed. Swipe-down from peek is a no-op. If the user wants to start over, they tap the search bar in the TopBar.

### Cold Launch State

**No sheet. Map centered on Netherlands (lat 52.1326, lng 5.2913, zoom 7).** Search bar in TopBar is focused. Map uses the same `BuildingFootprintMap` component but with different props:

```tsx
// Cold launch: no coordinates, show Netherlands overview
<BuildingFootprintMap lat={52.1326} lng={5.2913} zoom={7} />

// After address selected: zoom to building
<BuildingFootprintMap lat={address.latitude} lng={address.longitude} zoom={18} footprint={...} />
```

**Required change to `BuildingFootprintMap.tsx`:** Add optional `zoom` prop (default 18). Currently hardcoded at line 20: `zoom={18}`. Change to `zoom={zoom ?? 18}`.

Sheet animates in (from below viewport, spring to peek) after Locatieserver resolves.

### Drag Behavior

- Drag handle: 44px hit area, 36px wide x 4px tall visual pill
- Velocity-tracked drag: fast swipe up -> snap to full, fast swipe down -> snap to peek
- Spring animation between snap points: `SPRING_SHEET` config
- `will-change: transform` on sheet container

### Scroll-to-Drag Handoff (Dedicated Implementation Spike)

This is the hardest engineering problem in the component. When the sheet is at full snap and the user is scrolling dossier content, hitting `scrollTop === 0` and continuing to drag downward must seamlessly transfer from content scroll to sheet drag.

Implementation pattern: track `scrollTop` on the content container via `onScroll` (not `onTouchMove` -- misses momentum scroll events). When `scrollTop === 0` and drag direction is downward, hand control from scroll container to Framer Motion drag. This deserves a focused implementation spike, not a line item.

### Backdrop

- `backdrop-filter: blur(8px)` (not 12px -- performance on mid-range Android)
- `will-change: transform` on sheet container for compositor optimization
- Fallback: `rgba` with 0.85 alpha if blur causes jank (< 30fps during drag)
- Test on mid-range Android devices, not just iPhones

### Map Continuity

**The map stays mounted behind the sheet for search+dossier screens.** Protect this during implementation. The moment someone suggests unmounting the map for "performance," push back. Spatial continuity is the point.

### Accessibility: Focus Trap + Background Inert

When the sheet is at full snap, the map behind it must be `inert`:
- Set `aria-hidden="true"` and `inert` attribute on the map container when `sheetSnap === 'full'`
- Remove when sheet returns to peek/half
- Sheet content is the active focus scope at full snap
- Tab key cycles within sheet content only (focus trap via `<FocusTrap>` or manual)
- Escape key at full snap snaps to half (not peek -- too jarring)

---

## 2. Skeleton Loading / Progressive Reveal

### Data Waterfall

| Section | Source | Latency | Depends on |
|---------|--------|---------|------------|
| Address header | Locatieserver lookup | ~200-400ms | Nothing |
| Building facts | BAG WFS | ~1-2s | Locatieserver (VBO ID) |
| Risk tiles (4) | RIVM + Klimaateffectatlas WMS | ~2-5s | Locatieserver (coords) |
| Neighborhood stats | CBS OGC | ~2-3s | Locatieserver (coords + buurt code) |
| Tier B (energy + crime) | EP-Online + CBS OData | ~2-5s | Locatieserver (postcode + huisnummer) |
| 3D viewer (target) | 3DBAG single-item | ~2s | BAG (pand_id) |
| 3D viewer (context) | 3DBAG bbox | ~12-17s | Locatieserver (coords) |
| Sunlight analysis | Client-side SunCalc | ~500ms | 3D viewer (geometry) |
| Viewing checklist | Backend aggregation | ~1s | Risk data (scores) |

### Progressive Reveal Timeline

**T+0ms (search submitted):** Sheet springs from hidden to peek. Skeleton content appears in sheet: address placeholder shimmer, 4 gray summary pill placeholders.

**T+300ms (Locatieserver resolves):** Sheet spring-animates peek to half. Real address text replaces skeleton. Below fold (invisible but pre-rendered): risk tile skeletons, stats skeleton, tier-b skeleton.

**T+1-2s (BAG resolves):** Building facts card fills in via two-phase reveal.

**T+2-5s (risks, stats, tier-b):** Each section replaces its skeleton independently.

**T+12-17s (3D context):** 3D viewer completes. Sunlight analysis fires.

### 3D Section Handling

The 3D section is NOT shown as a skeleton in the initial half-snap view. Per principle Section 7, 3D is opt-in. Start the bbox fetch in the background when the dossier loads, but only show the 3D module when the user scrolls below the fold or taps "View in 3D."

When the user views it: either data has arrived (show immediately) or show a purposeful loading state within the 3D viewport -- "Building your 3D neighborhood model..." with an indeterminate progress bar. **No tile-count progress** -- the `Neighborhood3DResponse` model (backend `models/neighborhood3d.py:21-26`) has no progress metadata in its response, and adding streaming progress would require SSE or WebSocket which is out of scope. The two-phase progressive loading (target in ~2s, context in ~12-17s) already provides natural visual progress.

### Two-Phase Reveal Animation

Applied identically to every section for consistent visual rhythm:

1. **Phase 1 (200ms):** Shimmer stops. Skeleton background crossfades to final card background.
2. **Phase 2 (300ms):** Content fades in from opacity 0 to 1 with 4px `translateY` upward drift. Uses `SPRING_REVEAL` config.

Total duration: 500ms per section.

**No artificial stagger.** If all four risk tiles resolve at the same time (likely -- same API batch), animate them in simultaneously. Artificial stagger on simultaneously-available data feels dishonest. If they genuinely resolve at different times, natural stagger handles itself.

### Skeleton Visual Treatment

- Rounded rectangles matching final content dimensions exactly
- `background: linear-gradient(90deg, var(--color-skeleton) 25%, var(--color-skeleton-shimmer) 50%, var(--color-skeleton) 75%)` with `background-size: 200%`
- Shimmer: 1.5s ease-in-out infinite animation
- Dark mode: shimmer on `#1E1E1E` base with `#2A2A2A` highlight
- `prefers-reduced-motion`: static gray, no shimmer

### Dimension Matching

Shared height constants imported by both skeleton and loaded components:

```
RISK_TILE_HEIGHT = 180px (fixed, truncate long explanations with "More")
STATS_CARD_HEIGHT = 220px
TIER_B_CARD_HEIGHT = 200px
```

Loaded components use `min-height: [CONSTANT]` so they never shrink below skeleton size. Fixed-height risk tiles in the 2x2 grid -- variable heights create layout shift no skeleton can anticipate.

Visual regression test: Playwright script screenshots skeleton state and loaded state, flags any section where bounding box changes by more than 4px.

### LoadingScreen Removal Migration

**What gets deleted:**
- `LoadingScreen.tsx` (60 lines) -- deleted entirely
- `LoadingScreen.css` -- deleted entirely
- `LoadingScreen.test.tsx` (44 lines, 7 tests) -- deleted entirely
- `BuildingAnimation.tsx` -- deleted entirely
- `BuildingAnimation.css` -- deleted entirely
- `BuildingAnimation.test.tsx` -- deleted entirely (count TBD, verify before removing)

**What gets removed from `App.tsx` (see Section 0 for details):**
- Import of `LoadingScreen` (line 15)
- 5 state variables: `showLoadingScreen`, `loadingAddress`, `loadingProgressText`, `loadingTone`, `loadingTimeoutRef` (lines 166-172)
- 3 callbacks: `setLoadingStage`, `showLoadingWarning`, `finishLoadingFlow` (lines 200-221)
- 8s loading timeout setup (lines 335-339)
- Loading timeout cleanup effect (lines 189-193)
- All `setLoadingStage()` calls throughout `handleAddressSelect` (lines 311, 352, 390, 408, 453, 463)
- All `showLoadingWarning()` calls in catch blocks (lines 364, 384, 402, 422, 445)
- All `finishLoadingFlow()` calls (lines 337, 475, 502, 506, 511)
- The `showLoadingScreen ? <LoadingScreen/> : <Content/>` ternary (lines 672-677)

**What replaces it:**
- Each data section already has `loading`/`data`/`error` states (risk: `riskLoading`/`riskCards`/`riskError`; stats: `neighborhoodStatsLoading`/etc; tierB: `tierBLoading`/etc). These become the skeleton triggers.
- Per-section warning messages move to inline error indicators instead of global loading screen warnings.

### New Components

- `ui/Skeleton.tsx` -- generic skeleton primitive (width, height, borderRadius)
- `ui/Skeleton.css` -- shimmer animation, dark mode variant
- `RiskTileSkeleton.tsx` -- matches `RiskTile` dimensions
- `StatsSkeleton.tsx` -- matches `NeighborhoodStatsCard` layout
- `DossierSkeleton.tsx` -- composite: address skeleton + summary skeleton + risk skeletons

---

## 3. Touch Targets

### Minimum: 44x44px (Apple HIG)

Every interactive element in the app must meet this minimum. No exceptions.

### Violations to Fix (Verified Against Current CSS)

| Element | File:Line | Current (verified) | Fix |
|---------|-----------|-------------------|-----|
| Settings gear | `TopBar.css:76-77` | `width: 36px; height: 36px` | `width: 44px; height: 44px` |
| Back button (detail) | `RiskDetailView.css:28-29` | `width: 36px; height: 36px` | `width: 44px; height: 44px` |
| Language toggle btns | `TopBar.css:55` | `padding: 4px 12px` (~24px tall) | `padding: 10px 12px` (44px tall) |
| Bookmark toggle | `AddressHeader.css:34-35` | `width: 40px; height: 40px` | `width: 44px; height: 44px` |
| Shortlist remove | `ShortlistScreen.css:99-100` | `width: 32px; height: 32px` | `width: 44px; height: 44px` |
| Checkboxes | `RiskDetailView.css:176-177` | `width: 20px; height: 20px` (visual only) | Keep 20px visual, 44x44px hit area via row |

### Hit Area Expansion Pattern

**Do NOT use negative margins.** The `padding: 10px; margin: -10px` pattern creates overlapping hit areas when elements are within 20px of each other. The TopBar has `gap: 8px` (line 43), meaning lang-toggle buttons and settings gear would overlap.

**Use `::after` pseudo-element instead:**

```css
.tap-target-44 {
  position: relative;
}
.tap-target-44::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}
```

This expands the tappable area without affecting layout flow. No overlaps, no z-index issues. For elements that are already 36px+, simply increase `width`/`height` directly (settings gear, back button).

For icon buttons smaller than 44px that can't grow visually, wrap in a `44x44` container:

```css
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  /* visual icon stays 20-24px via svg width/height */
}
```

### Checklist Rows

Each checklist row is a single tappable surface (text + checkbox) with minimum 48px row height. Tapping anywhere on the row toggles the checkbox. Currently implemented via `<label>` (RiskDetailView.tsx:105) -- this is already correct. Ensure `min-height: 48px` and `padding` provide the 48px target.

### Risk Tile Grid Gap

**Already 12px.** `RiskTilesGrid.css:4` uses `gap: var(--space-md)`, and `tokens.css:129` defines `--space-md: 12px`. No change needed. The original spec incorrectly stated "up from current 8px."

### New Elements (Bottom Sheet)

| Element | Required size |
|---------|-------------|
| Drag handle | 44px tall hit zone (4px visual pill) |
| Summary badges (peek state) | 44px tall minimum |

### Haptic Feedback

`navigator?.vibrate?.(10)` (10ms micro-pulse, silent fallback) on four moments:

1. Adding to shortlist (confirmation)
2. Risk tile tap (opening detail)
3. Checklist item toggle (marking item addressed)
4. Export button tap (action initiated)

**NOT on:** sheet snap transitions (navigation, not decisions -- spring landing provides sufficient feedback), general button taps, scroll events, or any high-frequency interaction.

---

## 4. Press States

### The Problem

On mobile, tapping a risk card, button, or card gives zero visual feedback. `:hover` doesn't fire reliably on touch. The disconnect between input and response is the biggest "web app" tell.

### Two Tiers

#### Tier A: `usePressable()` Hook (Simple Elements)

CSS `:active` has an iOS Safari problem: deactivates on 1px finger movement, causing flickery press states on handheld devices. Use pointer events (not touch events) for input-agnostic behavior across mouse, touch, and stylus:

```tsx
function usePressable(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const add = () => el.classList.add('pressed');
    const remove = () => el.classList.remove('pressed');
    el.addEventListener('pointerdown', add);
    el.addEventListener('pointerup', remove);
    el.addEventListener('pointercancel', remove);
    el.addEventListener('pointerleave', remove);
    // Keyboard parity: Enter/Space press
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') add();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') remove();
    };
    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('keyup', handleKeyUp);
    return () => {
      el.removeEventListener('pointerdown', add);
      el.removeEventListener('pointerup', remove);
      el.removeEventListener('pointercancel', remove);
      el.removeEventListener('pointerleave', remove);
      el.removeEventListener('keydown', handleKeyDown);
      el.removeEventListener('keyup', handleKeyUp);
    };
  }, [ref]);
}
```

CSS:
```css
.pressable {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 100ms cubic-bezier(0.2, 0, 0.2, 1);
  will-change: transform;
}
.pressable.pressed {
  transform: scale(0.97);
}
```

**Why pointer events, not touch events:** Touch events (`touchstart`/`touchend`/`touchcancel`) don't fire for mouse or keyboard input. This breaks desktop testing, automated tests (`fireEvent.click` uses pointer events), and keyboard accessibility. Pointer events are supported in all target browsers and fire for touch, mouse, and pen input. The iOS Safari `:active` drift problem does NOT affect pointer events -- `pointerdown` stays active regardless of finger movement until `pointerup` or `pointercancel`.

**Keyboard parity:** The `keydown`/`keyup` handlers ensure that pressing Enter or Space on a focused pressable element triggers the same visual feedback. This maintains the existing keyboard navigation test suite (`keyboard-navigation.test.tsx`).

Apply to: tab bar buttons, action bar buttons, shortlist toggle, export button, checklist rows, recent search items, navigation icon buttons.

#### Tier B: Framer Motion `whileTap` (Elements with Follow-Up Transitions)

```tsx
<motion.div
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
  onTap={() => openDetail(category)}
>
```

Apply to: risk tiles (4), building facts card, neighborhood stats card, tier-b card -- any tappable card that opens a detail view.

### Visual Discipline

Scale factor is always `0.97`. Never 0.95 (too dramatic), never 0.99 (imperceptible). One value, everywhere, no exceptions.

### `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  .pressable.pressed {
    transform: none;
    background-color: var(--color-surface-pressed);
  }
}
```

Framer Motion: `useReducedMotion()` hook, replace spring with `{ duration: 0 }`.

### What Does NOT Get Press States

- Map tiles (own gesture handling)
- 3D viewer canvas (own gesture handling)
- Text links (underline/color change)
- Bottom sheet body (only drag handle)
- Skeleton placeholders (not interactive)
- Disabled elements

---

## 5. Spring Physics

### Named Constants (Centralized)

Define in a single `src/config/springs.ts` file. Import by reference everywhere. Update once, every animation updates.

```ts
export const SPRING_SHEET   = { type: "spring", stiffness: 300, damping: 30 } as const;
export const SPRING_EXPAND  = { type: "spring", stiffness: 350, damping: 28 } as const;
export const SPRING_REVEAL  = { type: "spring", stiffness: 200, damping: 22 } as const;
export const SPRING_TAB     = { type: "spring", stiffness: 400, damping: 30 } as const;
```

### Where Springs Are Applied

| Spring | Interaction | Feel | Settling |
|--------|-----------|------|----------|
| `SPRING_SHEET` | Bottom sheet snap transitions | Heavy, grounded -- like a drawer | ~400ms |
| `SPRING_EXPAND` | Risk tile -> detail expansion | Quick, elastic -- slight overshoot (<5%) | ~350ms |
| `SPRING_REVEAL` | Skeleton -> loaded content | Gentle arrival -- no overshoot | ~500ms |
| `SPRING_TAB` | Tab bar indicator (Tier 3, deferred) | Snappy, magnetic | ~250ms |

### Where Springs Are NOT Applied

Everything else uses CSS transitions. Springs are reserved for these four interactions because they're the moments the user is most attentive. Adding springs to tooltips, toasts, or other low-attention moments dilutes the effect.

### Spring Tuning Screen (Dev-Only)

Accessible via long-press on version number in `SettingsScreen.tsx:74` (`<span className="settings-screen__value">1.0.0</span>`).

**Dev gating:** The spring tuner component is only imported in development builds:

```tsx
// SettingsScreen.tsx
const SpringTuner = import.meta.env.DEV
  ? lazy(() => import('./SpringTuner'))
  : null;
```

This ensures zero bundle impact in production. The long-press handler is also dev-only:

```tsx
const handleVersionLongPress = import.meta.env.DEV
  ? () => setShowSpringTuner(true)
  : undefined;
```

Stiffness/damping sliders for each of the four named configs. Test on real iPhone SE and Pro Max. 10 minutes of finger-testing > any amount of theoretical parameter selection.

### `prefers-reduced-motion`

All four springs collapse to `{ duration: 0 }` (instant state change). No compromise on functionality. Motion removed entirely.

---

## 6. Risk Tile Shared Element Transition

### Required Tree Refactor

**Current topology (`App.tsx:885-905`):** `RiskDetailView` is rendered as a root-level `position: fixed; inset: 0; z-index: 100` overlay (see `RiskDetailView.css:1-9`). It's a sibling of the main content, not a child of the risk tiles grid. Framer Motion `layoutId` requires both the source and target elements to share a common `LayoutGroup` ancestor.

**Refactor plan:**

1. **Wrap the dossier content area in `<LayoutGroup>`** (Framer Motion). This becomes the shared animation context.

2. **Move `RiskDetailView` inside the `LayoutGroup`**, replacing the root-level overlay. Change from `position: fixed` to a conditional render within the dossier scroll area.

3. **When detail is open:** The risk tiles grid area expands to show the detail view inline. Other sections (stats, tier-b, checklist) are conditionally hidden (unmount, not `display: none` — saves memory and avoids stale state).

4. **The detail view header shares `layoutId={`risk-tile-${category}`}` with the corresponding `RiskTile`.** When `activeDetailCategory` changes from null to a category, Framer Motion animates from tile position to detail header position.

5. **Sheet snaps to full** when detail opens (if not already there).

**Why inline, not overlay:** The `position: fixed` overlay breaks `layoutId` because fixed positioning removes the element from the layout flow. Framer Motion can't compute the spatial relationship between a grid-positioned tile and a fixed-positioned overlay. Moving the detail view inline (within the same scroll context as the tiles) enables the layout animation.

**RiskDetailView.css changes:**
```css
/* DELETE: position: fixed; inset: 0; z-index: 100; */
/* ADD: */
.risk-detail {
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  min-height: 100vh;  /* or fill available space in sheet */
}
```

### Strategy: Framer Motion `layoutId`

The tile and the detail header share a `layoutId`. When one unmounts and the other mounts, Framer Motion automatically animates between their positions. This eliminates manual `getBoundingClientRect` bookkeeping.

### Forward Transition (Tile -> Detail)

```
Frame 0 (touch-down):
  - Tapped tile scales to 0.97 (press state via whileTap)
  - Other three tiles begin fading out (opacity -> 0, 200ms)

Frame ~100ms (touch release):
  - Sheet begins spring-animating half -> full (SPRING_SHEET)
  - layoutId drives tile bounding box -> detail header position (SPRING_EXPAND)
  - Content crossfade: tile content fades out, detail content fades in
    (AnimatePresence mode="sync", absolute positioned children)
  - 50ms delay on detail fade-in for directional crossfade feel

Frame 100-450ms (springs in flight):
  - Tile morphs into detail header (position, width, height)
  - Sheet animates upward simultaneously
  - Sections below grid (stats, tier-b) unmount without animation

Frame ~450ms (springs settle):
  - Tile has become detail header card
  - Sheet at full snap
  - Detail body (comparison chart, viewing questions) fades in
    with SPRING_REVEAL, 200ms delay after header lands
```

### Reverse Transition (Detail -> Grid)

```
Frame 0 (back tap or swipe-down):
  - Detail body fades out (opacity 0, 150ms)

Frame 150ms:
  - Sheet begins springing full -> half (SPRING_SHEET)
  - Header springs back to tile grid position (SPRING_EXPAND)
  - Content crossfade reverses

Frame 150-500ms:
  - Card compresses back to tile size
  - Other three tiles fade back in (opacity 1, 200ms)

Frame ~500ms:
  - Grid restored, all four tiles visible, sheet at half
```

### Content Crossfade (No Flash of Empty Content)

Use `AnimatePresence` mode="sync" (NOT "wait") with absolute-positioned children inside the `layoutId` container:

```tsx
<motion.div layoutId={`risk-${category}`} style={{ position: 'relative' }}>
  <AnimatePresence mode="sync">
    {isExpanded ? (
      <motion.div
        key="detail"
        style={{ position: 'absolute', inset: 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.05 } }}
        exit={{ opacity: 0 }}
      >
        <RiskDetailHeader />
      </motion.div>
    ) : (
      <motion.div
        key="tile"
        style={{ position: 'absolute', inset: 0 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        <RiskTileSummary />
      </motion.div>
    )}
  </AnimatePresence>
</motion.div>
```

Container dimensions driven by `layoutId` spring, not children. Absolute positioning prevents empty-box gap.

### Tap During Transition: Ignored

`isTransitioning` ref set `true` on `onAnimationStart`, `false` on `onAnimationComplete`. Taps during the ~350ms window are no-ops. Same pattern as iOS navigation push/pop. Prevents race conditions in AnimatePresence state management.

### Performance Gate and Fallback

**Detection:** `useAnimationPerformance()` hook. Start `requestAnimationFrame` loop on `onAnimationStart`, collect frame deltas, stop on `onAnimationComplete`. Count frames exceeding 32ms (two frames at 60fps).

**Threshold:** If >3 frames exceed 32ms during a single transition, flag device as "reduced animation" for the session. Store in a ref (not state -- no re-render from perf monitor).

**Fallback:** Simple crossfade (old content fades out 150ms, new content fades in 200ms) using `SPRING_REVEAL` for opacity. Same spring character, no spatial interpolation. Feels like the same app with less spatial motion, not a different app.

### Scope Boundary

Shared element applied ONLY to risk tiles -> detail. Not applied to:
- 3D viewer module (WebGL canvas can't morph)
- Stats or tier-b cards (diminishing returns)
- Shortlist -> dossier (different layout contexts)
- Compare -> individual dossier (same reason)

One interaction, applied well.

---

## Deferred (Tier 3)

The following are explicitly deferred until after real user feedback:

- **Animated tab indicator with spring:** Nice but cosmetic. No principle depends on it.
- **Screen transition animations (cross-fade/slide between tabs):** Pleasant but not structural. Revisit after users report what actually feels broken.

---

## New Dependencies

| Package | Size (gzip) | Justification |
|---------|-------------|---------------|
| `framer-motion` | ~33KB (claimed, verify after install) | Bottom sheet drag/snap, spring physics, shared element transitions, press states on cards, data reveal animations. Covers all Tier 1 and Tier 2 animation needs in one library. |

No other new dependencies required.

**Verification required:** After `npm install framer-motion`, run `npm run build` and compare total bundle size and vendor chunk sizes against current baselines. Document actual gzip delta. If delta exceeds 40KB gzipped, investigate tree-shaking configuration.

---

## New Components / Files

| File | Purpose |
|------|---------|
| `src/config/springs.ts` | Named spring constants (SPRING_SHEET, SPRING_EXPAND, SPRING_REVEAL, SPRING_TAB) |
| `src/hooks/usePressable.ts` | Pointer-event-based press state hook with keyboard parity |
| `src/hooks/useAnimationPerformance.ts` | Frame-drop detection for shared element fallback |
| `src/utils/haptic.ts` | `triggerHaptic()` utility with silent fallback |
| `src/components/DossierSheet.tsx` | NEW: gesture-driven dossier sheet (3 snap points, drag, backdrop) |
| `src/components/DossierSheet.css` | Sheet styles, backdrop blur, snap positions |
| `src/components/ui/Skeleton.tsx` | Generic skeleton primitive |
| `src/components/ui/Skeleton.css` | Shimmer animation, dark mode, reduced-motion |
| `src/components/RiskTileSkeleton.tsx` | Risk tile placeholder |
| `src/components/StatsSkeleton.tsx` | Stats card placeholder |
| `src/components/DossierSkeleton.tsx` | Composite skeleton for half-snap view |
| `src/components/SpringTuner.tsx` | Dev-only spring tuning screen (lazy, `import.meta.env.DEV` gated) |
| `src/styles/pressable.css` | `.pressable` and `.pressed` utility classes |

## Deleted Components / Files

| File | Tests lost | Reason |
|------|-----------|--------|
| `src/components/LoadingScreen.tsx` | 7 (LoadingScreen.test.tsx) | Replaced by skeleton loading |
| `src/components/LoadingScreen.css` | 0 | CSS for deleted component |
| `src/components/LoadingScreen.test.tsx` | 7 | Tests for deleted component |
| `src/components/BuildingAnimation.tsx` | TBD (verify count) | Replaced by skeleton loading |
| `src/components/BuildingAnimation.css` | 0 | CSS for deleted component |
| `src/components/BuildingAnimation.test.tsx` | TBD (verify count) | Tests for deleted component |

## NOT Deleted / NOT Changed

| File | Reason |
|------|--------|
| `src/components/ui/BottomSheet.tsx` | Kept as-is. Used by `ExportBottomSheet`. Different component from `DossierSheet`. |
| `src/components/ui/BottomSheet.css` | Kept as-is. Styles for export sheet. |
| `src/components/ExportBottomSheet.tsx` | Kept as-is. Uses `ui/BottomSheet`, not `DossierSheet`. |

---

## Test Migration Matrix

### Tests to Delete

| Test file | Tests | Reason |
|-----------|-------|--------|
| `LoadingScreen.test.tsx` | 7 | Component deleted |
| `BuildingAnimation.test.tsx` | TBD | Component deleted |

### Tests to Modify

| Test file | Current assertion | Required change |
|-----------|------------------|----------------|
| `TabBar.test.tsx:27-31` | `expect(tabs).toHaveLength(3)` | Change to `toHaveLength(2)` (briefing tab removed) |
| `TabBar.test.tsx:33-37` | Tests `activeTab: 'briefing'` | Remove this test case |
| `keyboard-navigation.test.tsx:25-30` | Tests TabBar keyboard nav with 3 tabs | Update for 2-tab navigation |
| `App.test.tsx` (if exists) | Tests loading screen rendering | Remove LoadingScreen assertions, add skeleton assertions |

### Tests to Add (net positive required)

| New test file | Tests (minimum) | Coverage |
|---------------|----------------|----------|
| `DossierSheet.test.tsx` | 6+ | Snap points, drag behavior, peek content, accessibility (inert) |
| `Skeleton.test.tsx` | 4+ | Renders shimmer, correct dimensions, dark mode, reduced-motion |
| `RiskTileSkeleton.test.tsx` | 3+ | Matches dimensions, renders shimmer, snapshot |
| `DossierSkeleton.test.tsx` | 3+ | Composite rendering, all sub-skeletons present |
| `usePressable.test.tsx` | 5+ | Pointer events, keyboard parity, cleanup, disabled elements |
| `useAnimationPerformance.test.tsx` | 3+ | Frame counting, threshold detection, fallback trigger |
| `springs.test.ts` | 2+ | Constants exist, types correct |
| `haptic.test.ts` | 2+ | Calls vibrate, silent fallback |

### Test Budget

| | Count |
|--|-------|
| Current baseline | 347 |
| Tests deleted | -7 (LoadingScreen) - TBD (BuildingAnimation) |
| Tests modified | ~4 (TabBar, keyboard-nav) |
| Tests added | 28+ (new components + hooks) |
| **Net minimum** | **368+** (must exceed 347) |

### Visual Regression Snapshot Updates

| Snapshot | Change |
|----------|--------|
| `search-light-win32.png` | May change (map visible, no search page layout) |
| `search-dark-win32.png` | Same |
| `dossier-light-win32.png` | Will change (skeleton visible, sheet layout) |
| `dossier-dark-win32.png` | Same |
| `saved-light-win32.png` | May change (2-tab bar instead of 3) |

All 10 snapshots must be regenerated after Tier 1 completes.

### i18n Key Changes

| Action | Keys |
|--------|------|
| Remove | `nav.briefing` (tab label), all `loading.*` keys used by LoadingScreen |
| Add | Skeleton aria-labels, sheet drag handle label, any new component labels |
| Verify | `en.json` and `nl.json` stay in sync |

---

## Feature Flag Rollout Plan

### Tier 1 Deployment

Tier 1 changes are structural (removes LoadingScreen, changes tab navigation, adds skeletons). These cannot be feature-flagged at the component level because they replace core architecture.

**Rollout strategy:** Feature branch `feat/mobile-ui-tier1`. Merge to main only after:
1. All existing tests pass (modified for new architecture)
2. New test count exceeds baseline (347)
3. `npm run build` clean (TypeScript strict)
4. `ruff check` clean (backend unchanged, but verify)
5. Visual regression snapshots regenerated and reviewed
6. Manual testing on iOS Safari + Chrome Android

**Rollback:** Git revert of merge commit. Single commit per tier enables clean revert.

### Tier 2 Deployment

Tier 2 changes (press states, springs, shared element) are additive and can be feature-flagged:

```ts
// config/features.ts
export const ENABLE_PRESS_STATES = true;
export const ENABLE_SHARED_ELEMENT = true;
```

If shared element transitions cause performance issues on real devices, disable `ENABLE_SHARED_ELEMENT` to fall back to instant show/hide without affecting the rest of the app.

---

## Quality Gates

### Per-Tier Gates

**Tier 1 (must pass before merge):**
- [ ] All touch targets >= 44x44px (verified via CSS audit, not Playwright — Playwright can't measure invisible hit areas)
- [ ] No overlapping hit areas in toolbar rows (manual visual inspection + computed style check)
- [ ] Skeleton dimensions match loaded content within 4px (visual regression test)
- [ ] `prefers-reduced-motion` disables shimmer animation
- [ ] No layout shift (CLS) during skeleton -> loaded transitions
- [ ] Risk tile grid gap is 12px (already true, regression guard)
- [ ] Haptic feedback fires on 4 defined moments only
- [ ] TabBar renders 2 tabs (not 3)
- [ ] LoadingScreen fully removed (no import, no render, no test)
- [ ] Test count >= 347 (net positive after deletions + additions)
- [ ] `npm run build` clean
- [ ] All 10 visual regression snapshots regenerated and reviewed
- [ ] `en.json` and `nl.json` key counts match (no orphaned keys)

**Tier 2 (must pass before merge):**
- [ ] Press states work with pointer events (mouse, touch, pen)
- [ ] Press states work with keyboard (Enter, Space)
- [ ] `prefers-reduced-motion` replaces scale with background color
- [ ] Shared element transition fallback triggers on >3 dropped frames
- [ ] `isTransitioning` gate prevents taps during animation
- [ ] Spring tuning screen accessible ONLY in dev builds (`import.meta.env.DEV`)
- [ ] Spring tuning screen NOT in production bundle (verify via build output)
- [ ] Total bundle increase < 40KB gzipped (measured, not asserted)
- [ ] Framer Motion tree-shaken (verify unused exports not in bundle)
- [ ] Test count >= Tier 1 final count

### Measurable Performance Verification

After `npm install framer-motion` and before any feature code:

1. Run `npm run build`, record chunk sizes (bytes, gzipped)
2. Compare against current: `vendor-react` ~43KB, `vendor-map` ~52KB, `vendor-three` ~137KB, `index` ~59KB (gzip)
3. Framer Motion should appear in `index` chunk (or its own vendor chunk if configured)
4. Record total gzipped JS size. Must be < current + 40KB.

After Tier 2 complete:
1. Repeat build size measurement
2. Run existing Lighthouse CI configs (`.lighthouserc.json` desktop perf >= 0.8, `.lighthouserc.mobile.json` mobile perf >= 0.7)
3. If perf scores drop below thresholds, investigate and fix before merge
