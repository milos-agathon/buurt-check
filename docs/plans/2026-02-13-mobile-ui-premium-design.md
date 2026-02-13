# Mobile UI Premium Design Spec

**Date:** 2026-02-13
**Goal:** Elevate buurt-check's mobile UX to Apple-tier native feel
**Key moments:** First search result, risk card deep-dive, compare flow
**Quality bar:** Apple Weather / Maps / Health
**Dependencies:** Framer Motion (~33KB gzipped)

---

## Guiding Framework

This design is not about closing an aesthetic gap with Apple-native apps. It's about identifying which interaction patterns are structurally broken for buurt-check's product principles (see `docs/ui-principles.md`). A draggable bottom sheet isn't polish -- it's whether the map-first architecture works. Skeleton loading isn't perceived speed -- it's whether users trust the data. Touch targets aren't HIG compliance -- it's whether expats can reliably tap risk tiles on a crowded phone screen.

**Tier 1 (structural, do first):** Bottom sheet, skeleton loading, touch targets
**Tier 2 (perception gap, do next):** Press states, spring physics, shared element transitions
**Tier 3 (defer until user feedback):** Tab indicator animation, screen transitions

---

## 1. Gesture-Driven Bottom Sheet

### Architecture

The bottom sheet is the architectural spine of the app. It transforms buurt-check from "scrollable page with map" to "spatial intelligence tool."

The current dossier screen becomes sheet content. The map stays mounted behind the sheet at all times. The sheet IS the briefing -- there is no "Briefing" tab.

**Tab navigation changes:** Search, Saved, Compare, Settings. "Briefing" is removed as a tab.

### Three Snap Points

| Snap | Height | Content visible | Map visible |
|------|--------|----------------|-------------|
| Peek | Fixed 140px (content-driven, not %) | Address header + summary badges + drag handle | Fully visible |
| Half | ~50% viewport | Header + risk tiles grid | Upper half visible |
| Full | ~90% viewport | Full dossier scroll | Small peek at top |

**Peek is the floor.** The sheet never dismisses once a search has been performed. The address header and summary score are always visible. If the user wants to start over, they tap the search bar (visible at peek state).

**Cold launch state:** No sheet. Map + centered search bar. Sheet animates in after first search resolves.

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

**The map stays mounted behind the sheet at all times.** Protect this during implementation. The moment someone suggests unmounting the map for "performance," push back. Spatial continuity is the point.

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

**T+0ms (search submitted):** Sheet at peek. Search bar shows subtle loading indicator.

**T+300ms (Locatieserver resolves):** Sheet spring-animates to half. Skeleton appears:
- Address header: real address text (already available)
- Summary strip: 4 gray pill placeholders with shimmer
- Risk tiles: 2x2 grid of placeholder cards (correct dimensions, shimmer)
- Below fold: stats skeleton, tier-b skeleton, checklist skeleton

**T+1-2s (BAG resolves):** Building facts card fills in via two-phase reveal.

**T+2-5s (risks, stats, tier-b):** Each section replaces its skeleton independently.

**T+12-17s (3D context):** 3D viewer completes. Sunlight analysis fires.

### 3D Section Handling

The 3D section is NOT shown as a skeleton in the initial half-snap view. Per principle Section 7, 3D is opt-in. Start the bbox fetch in the background when the dossier loads, but only show the 3D module when the user scrolls below the fold or taps "View in 3D."

When the user views it: either data has arrived (show immediately) or show a purposeful loading state within the 3D viewport -- "Building your 3D neighborhood model..." with progress based on tile count. Target building renders in ~2s, context assembles around it progressively.

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

### What Gets Deleted

- `LoadingScreen.tsx` -- deleted entirely
- `BuildingAnimation.tsx` -- deleted entirely
- Each data section in `App.tsx` already has `loading`/`data`/`error` states. Skeleton becomes the `loading` render path.

### New Components

- `Skeleton.tsx` -- generic skeleton primitive (width, height, borderRadius)
- `RiskTileSkeleton.tsx` -- matches `RiskTile` dimensions
- `StatsSkeleton.tsx` -- matches `NeighborhoodStatsCard` layout

---

## 3. Touch Targets

### Minimum: 44x44px (Apple HIG)

Every interactive element in the app must meet this minimum. No exceptions.

### Violations to Fix

| Element | Current | Fix |
|---------|---------|-----|
| Back button | 36x36px | 44x44px |
| Settings gear | 36x36px | 44x44px |
| Language toggle | ~32px tall | 44px tall, wider tap area |
| Checkboxes | 20x20px visual | Keep 20px visual, 44x44px hit area |
| Info icons | ~24px | 44x44px hit area |
| Close button | ~32px | 44x44px |
| Shortlist toggle | ~32px | 44x44px hit area |

### Transparent Hit Area Pattern

Most violations share the same root cause: visual icon equals tap area. Fix via transparent padding zone:

```css
.tap-target-44 {
  padding: 10px;
  margin: -10px;
  position: relative;
}
```

Create a `TapTarget` wrapper component or utility class. Visual stays crisp and small; invisible hit area meets minimum.

### Z-Index Overlap Audit

Negative margin expansion creates overlapping hit areas when icon buttons are close together (TopBar row). **Enforce minimum 8px visual gap between icon buttons** in any toolbar row. With 10px padding expansion, hit areas just barely touch rather than overlap. Just-touching is acceptable; overlapping is not.

### Checklist Rows

Each checklist row is a single tappable surface (text + checkbox) with minimum 48px row height. Tapping anywhere on the row toggles the checkbox. Wrap in `<label>` or single `onClick` on row container. Same pattern as Apple Settings -- the whole row responds.

### Risk Tile Grid Gap

**12px hard requirement** (up from current 8px). The risk tiles are the most tapped element in the app. 8px gap at walking speed with one-handed grip causes mistaps. 12px costs 12px of vertical space -- negligible.

### New Elements (Bottom Sheet)

| Element | Required size |
|---------|-------------|
| Drag handle | 44px tall hit zone (4px visual pill) |
| Search bar (peek state) | Full width, 48px tall |
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

CSS `:active` has an iOS Safari problem: deactivates on 1px finger movement, causing flickery press states on handheld devices. Use JS touch handler instead:

```tsx
function usePressable(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const add = () => el.classList.add('pressed');
    const remove = () => el.classList.remove('pressed');
    el.addEventListener('touchstart', add, { passive: true });
    el.addEventListener('touchend', remove);
    el.addEventListener('touchcancel', remove);
    return () => {
      el.removeEventListener('touchstart', add);
      el.removeEventListener('touchend', remove);
      el.removeEventListener('touchcancel', remove);
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

Accessible via long-press on version number in Settings. Stiffness/damping sliders for each of the four named configs. Test on real iPhone SE and Pro Max. 10 minutes of finger-testing > any amount of theoretical parameter selection.

One-time ~1 hour build investment. Prevents spring parameter bike-shedding in code review.

### `prefers-reduced-motion`

All four springs collapse to `{ duration: 0 }` (instant state change). No compromise on functionality. Motion removed entirely.

---

## 6. Risk Tile Shared Element Transition

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
  <AnimatePresence>
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
| `framer-motion` | ~33KB | Bottom sheet drag/snap, spring physics, shared element transitions, press states on cards, data reveal animations. Covers all Tier 1 and Tier 2 animation needs in one library. |

No other new dependencies required.

---

## New Components / Files

| File | Purpose |
|------|---------|
| `src/config/springs.ts` | Named spring constants (SPRING_SHEET, SPRING_EXPAND, SPRING_REVEAL, SPRING_TAB) |
| `src/hooks/usePressable.ts` | Touch-based press state hook (touchstart/touchend/touchcancel) |
| `src/hooks/useAnimationPerformance.ts` | Frame-drop detection for shared element fallback |
| `src/components/BottomSheet.tsx` | Full rewrite: gesture-driven, three snap points, backdrop blur |
| `src/components/Skeleton.tsx` | Generic skeleton primitive |
| `src/components/RiskTileSkeleton.tsx` | Risk tile placeholder |
| `src/components/StatsSkeleton.tsx` | Stats card placeholder |
| `src/components/ui/TapTarget.tsx` | 44px tap area wrapper for icon buttons |
| `src/components/SpringTuner.tsx` | Dev-only spring tuning screen |

## Deleted Components / Files

| File | Reason |
|------|--------|
| `src/components/LoadingScreen.tsx` | Replaced by skeleton loading |
| `src/components/BuildingAnimation.tsx` | Replaced by skeleton loading |

---

## Quality Gates

Before shipping each tier, verify:

- [ ] All touch targets >= 44x44px (Playwright tap-area audit)
- [ ] No overlapping hit areas in toolbar rows (visual inspection)
- [ ] Skeleton dimensions match loaded content within 4px (visual regression)
- [ ] Bottom sheet drag works on iPhone SE and Pro Max
- [ ] Backdrop blur fallback triggers correctly on mid-range Android
- [ ] `prefers-reduced-motion` disables all animation
- [ ] No layout shift (CLS) during skeleton -> loaded transitions
- [ ] Shared element transition fallback triggers on >3 dropped frames
- [ ] `isTransitioning` gate prevents taps during animation
- [ ] Risk tile grid gap is 12px
- [ ] Haptic feedback fires on 4 defined moments only
- [ ] Spring tuning screen accessible via long-press version in Settings
- [ ] Total bundle increase < 40KB gzipped
- [ ] Framer Motion tree-shaken (import only used modules)
