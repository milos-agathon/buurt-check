# Mobile UI Premium — Implementation Plan (Revision 4.2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate buurt-check's mobile UX to Apple-tier native feel via gesture-driven bottom sheet, skeleton loading, touch target compliance, press states, spring physics, and shared element transitions.

**Architecture:** Three-tier rollout. Tier 1 (structural): gesture-driven DossierSheet with handle-only drag + velocity thresholds, skeleton loading to replace full-screen blocker, 44px touch targets. Tier 2 (perception): press states via Framer Motion `whileTap` (components) + `usePressable` hook (non-motion elements), spring physics on 4 key transitions, shared element risk tile → detail expansion. Tier 3: deferred. Each tier ends with a commit + quality gate. **3-tab navigation preserved** (Search, Briefing, Saved) per CLAUDE.md architectural contract.

**Tech Stack:** React 19, TypeScript, Framer Motion (~33KB gzip), plain CSS tokens, Vitest + Testing Library.

**Design spec:** `docs/plans/2026-02-13-mobile-ui-premium-design.md`
**UI principles:** `docs/ui-principles.md`

**Test baselines (verified 2026-02-13, all green):**
- Frontend: 338 pass (0 fail)
- Backend: 328 pass non-live (0 fail), 9 deselected as live
- Ruff: all checks passed
- Build: passes

**Revision 4 changes:** Addresses 12 findings from Revision 3 assessment:
1. Baselines updated to actual current state: 338 frontend, 328 backend - all green (R3-Finding 1,2)
2. Task 0 reduced to verify-only (no code changes — i18n keys and metrics already fixed) (R3-Finding 1,2)
3. 3-tab navigation preserved per CLAUDE.md (Search/Briefing/Saved) — no tab removal (R3-Finding 3)
4. T+0 timing fixed: `setActiveScreen('dossier')` + `setSheetSnap('peek')` moved BEFORE `lookupAddress()` (R3-Finding 4)
5. Drag restricted to handle only — `touch-action: none` + `drag="y"` only on handle, content div scrolls normally (R3-Finding 5)
6. Z-index: DossierSheet at 40 (below TabBar at 50) so tabs remain accessible (R3-Finding 6)
7. Press-state strategy applied in Task 11: `usePressable` for bookmark, `whileTap` for shortlist remove and motion components (R3-Finding 7)
8. Language toggle: explicit `min-height: 44px` added (R3-Finding 8)
9. RiskDetailView CSS: clarified — keep `position: fixed; inset: 0` as final animated state (R3-Finding 9)
10. Tab pill: explicit refactor from `::before` pseudo-element to `<motion.div>` DOM element (R3-Finding 10)
11. File inventory corrected: 13 new files (R3-Finding 11)
12. Backend baseline: 328 throughout (R3-Finding 12)

**Revision 4.1 changes:** Addresses 3 findings from R4 assessment:
1. `pendingDisplayName` state moved from Task 5 into Task 4 (step 2b), fixing execution ordering (R4-Finding 1)
2. ShortlistScreen remove button uses `motion.button` + `whileTap` instead of `usePressable` — avoids hooks-in-loop violation (R4-Finding 2)
3. Sheet content gets `padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px) + var(--space-md))` to prevent occlusion under TabBar (R4-Finding 3)

**Revision 4.2 changes:** Addresses 6 consistency findings from R4.1 assessment:
1. Backend baseline updated from 321 -> 328 in header, tasks, and quality gates
2. Task 5 `SkeletonLine` import gap fixed in App.tsx instructions
3. Task 5 intermediate test expectation clarified (known temporary red due LoadingScreen tests until Task 6)
4. Summary row for R3-Finding 7 aligned to final Task 11 strategy (`whileTap` on shortlist remove)
5. Summary/backend reference for R3-Finding 12 updated to 328
6. File inventory updated: `ShortlistScreen.tsx` note now reflects `whileTap`, not `usePressable`

---

## Pre-Flight Phase 0: Verify Green Baseline

### Task 0: Verify all tests pass (no code changes)

All i18n keys and metrics wiring already exist in the codebase. This task only verifies the baseline before feature work begins. **Do NOT modify any files.**

**Step 1: Run frontend tests**

```powershell
cd frontend; npx vitest run 2>&1 | Select-Object -Last 10
```

Expected: 338 pass (0 fail).

**Step 2: Run backend tests**

```powershell
cd backend; python -m pytest -m "not live" -q 2>&1 | Select-Object -Last 10
```

Expected: 328 pass (0 fail), 9 deselected.

**Step 3: Run build + lint**

```powershell
cd frontend; npm run build
cd ..\backend; ruff check app/ tests/
```

Expected: Both pass. Record exact counts as baseline for quality gates.

**If any test fails**, investigate and fix before proceeding. Do NOT proceed with feature work on a red baseline.

---

## Pre-Flight Phase 1: Install Framer Motion

### Task 1: Add framer-motion dependency

**Files:**
- Modify: `frontend/package.json` (add dependency)
- Modify: `frontend/vite.config.ts` (vendor chunk)
- Modify: `frontend/src/test/setup.ts` (mock for tests)

**Step 1: Install framer-motion**

```powershell
cd frontend; npm install framer-motion
```

**Step 2: Add to vendor chunk in vite.config.ts**

In `frontend/vite.config.ts`, find the `manualChunks` object and add `framer-motion` to the react vendor chunk:

```typescript
// Before (line ~37):
'vendor-react': ['react', 'react-dom', 'react-i18next', 'i18next'],

// After:
'vendor-react': ['react', 'react-dom', 'react-i18next', 'i18next', 'framer-motion'],
```

**Step 3: Add framer-motion mock to test setup**

In `frontend/src/test/setup.ts`, add after the existing `matchMedia` mock:

```typescript
import { createElement } from 'react';

// Mock framer-motion — renders motion.div as plain div, etc.
vi.mock('framer-motion', () => {
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => {
      const Component = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
        const {
          layoutId: _a, initial: _b, animate: _c, exit: _d, transition: _e,
          whileTap: _f, whileHover: _g, drag: _h, dragConstraints: _i,
          onDragEnd: _j, variants: _k, layout: _l, onAnimationStart: _m,
          onAnimationComplete: _n, style,
          ...domProps
        } = props;
        return createElement(prop, { ...domProps, style }, children);
      };
      return Component;
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'animate-presence' }, children),
    LayoutGroup: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
    useMotionValue: (initial: number) => ({ get: () => initial, set: () => {} }),
    useDragControls: () => ({ start: () => {} }),
    useAnimation: () => ({ start: () => Promise.resolve(), stop: () => {} }),
  };
});
```

**Step 4: Verify tests still pass**

```powershell
cd frontend; npx vitest run 2>&1 | Select-Object -Last 10
```

Expected: Same green count as Task 0 baseline (338 pass).

**Step 5: Verify build and record bundle sizes**

```powershell
cd frontend; npm run build
```

Expected: Build succeeds. `vendor-react` chunk grows ~33KB gzip.

**Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/test/setup.ts
git commit -m "chore: add framer-motion dependency with test mock and vendor chunk"
```

---

## Tier 1A: Gesture-Driven Bottom Sheet

### Task 2: Create spring configuration file

**Files:**
- Create: `frontend/src/config/springs.ts`
- Create: `frontend/src/config/springs.test.ts`

**Step 1: Write the test**

Create `frontend/src/config/springs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SPRING_SHEET, SPRING_EXPAND, SPRING_REVEAL, SPRING_TAB } from './springs';

describe('Spring configurations', () => {
  it('exports four named spring configs', () => {
    expect(SPRING_SHEET).toBeDefined();
    expect(SPRING_EXPAND).toBeDefined();
    expect(SPRING_REVEAL).toBeDefined();
    expect(SPRING_TAB).toBeDefined();
  });

  it('all springs have type, stiffness, and damping', () => {
    for (const spring of [SPRING_SHEET, SPRING_EXPAND, SPRING_REVEAL, SPRING_TAB]) {
      expect(spring.type).toBe('spring');
      expect(spring.stiffness).toBeGreaterThan(0);
      expect(spring.damping).toBeGreaterThan(0);
    }
  });

  it('SPRING_SHEET is heaviest (highest damping)', () => {
    expect(SPRING_SHEET.damping).toBeGreaterThanOrEqual(SPRING_EXPAND.damping);
  });

  it('SPRING_TAB is snappiest (highest stiffness)', () => {
    expect(SPRING_TAB.stiffness).toBeGreaterThanOrEqual(SPRING_SHEET.stiffness);
    expect(SPRING_TAB.stiffness).toBeGreaterThanOrEqual(SPRING_EXPAND.stiffness);
  });
});
```

**Step 2: Run test to verify it fails**

```powershell
cd frontend; npx vitest run src/config/springs.test.ts
```
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `frontend/src/config/springs.ts`:

```typescript
/**
 * Named spring animation configs for Framer Motion.
 * All Framer Motion transitions in this app MUST use these constants.
 */

export const SPRING_SHEET = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

export const SPRING_EXPAND = {
  type: 'spring' as const,
  stiffness: 350,
  damping: 28,
};

export const SPRING_REVEAL = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 22,
};

export const SPRING_TAB = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};
```

**Step 4: Run test to verify it passes**

```powershell
cd frontend; npx vitest run src/config/springs.test.ts
```
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add frontend/src/config/springs.ts frontend/src/config/springs.test.ts
git commit -m "feat: add named spring animation constants"
```

---

### Task 3: Create DossierSheet component with gesture drag

This is the highest-risk structural task. The sheet is the architectural spine. It replaces the current fixed-position dossier layout with a gesture-driven bottom sheet that can snap to 4 positions.

**Files:**
- Create: `frontend/src/components/DossierSheet.tsx`
- Create: `frontend/src/components/DossierSheet.css`
- Create: `frontend/src/components/DossierSheet.test.tsx`

**Step 1: Write the test**

Create `frontend/src/components/DossierSheet.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DossierSheet from './DossierSheet';

describe('DossierSheet', () => {
  const defaultProps = {
    snap: 'half' as const,
    onSnapChange: vi.fn(),
    children: <div data-testid="sheet-content">Content</div>,
  };

  it('renders children', () => {
    render(<DossierSheet {...defaultProps} />);
    expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
  });

  it('renders drag handle with 44px hit area', () => {
    render(<DossierSheet {...defaultProps} />);
    const handle = screen.getByTestId('sheet-handle');
    expect(handle).toBeInTheDocument();
    // 44px min-height enforced via CSS .dossier-sheet__handle
  });

  it('renders as hidden when snap is hidden', () => {
    render(<DossierSheet {...defaultProps} snap="hidden" />);
    const sheet = screen.getByTestId('dossier-sheet');
    expect(sheet).toBeInTheDocument();
  });

  it('renders at peek when snap is peek', () => {
    render(<DossierSheet {...defaultProps} snap="peek" />);
    expect(screen.getByTestId('dossier-sheet')).toBeInTheDocument();
    // Content overflow hidden at peek (CSS class)
  });

  it('renders backdrop at full snap', () => {
    render(<DossierSheet {...defaultProps} snap="full" />);
    expect(screen.getByTestId('sheet-backdrop')).toBeInTheDocument();
  });

  it('does not render backdrop at half snap', () => {
    render(<DossierSheet {...defaultProps} snap="half" />);
    expect(screen.queryByTestId('sheet-backdrop')).not.toBeInTheDocument();
  });

  it('calls onSnapChange("half") on Escape key at full snap', () => {
    const onSnapChange = vi.fn();
    render(<DossierSheet {...defaultProps} snap="full" onSnapChange={onSnapChange} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSnapChange).toHaveBeenCalledWith('half');
  });

  it('does not call onSnapChange on Escape at half snap', () => {
    const onSnapChange = vi.fn();
    render(<DossierSheet {...defaultProps} snap="half" onSnapChange={onSnapChange} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSnapChange).not.toHaveBeenCalled();
  });

  it('handle has role=separator with aria-label', () => {
    render(<DossierSheet {...defaultProps} />);
    const handle = screen.getByTestId('sheet-handle');
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('aria-label');
  });
});
```

**Step 2: Run test to verify it fails**

```powershell
cd frontend; npx vitest run src/components/DossierSheet.test.tsx
```
Expected: FAIL — module not found.

**Step 3: Write CSS**

Create `frontend/src/components/DossierSheet.css`:

```css
.dossier-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-bg);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: var(--elevation-3);
  z-index: 40; /* Below TabBar (z-index: 50) so tabs remain accessible */
  will-change: transform;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.dossier-sheet__handle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  cursor: grab;
  flex-shrink: 0;
  touch-action: none; /* Only the handle gets touch-action: none — content scrolls normally */
}

.dossier-sheet__handle:active {
  cursor: grabbing;
}

.dossier-sheet__pill {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
}

.dossier-sheet__content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  /* Bottom padding prevents content from hiding under TabBar (z-index: 50, height: 56px + safe area) */
  padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px) + var(--space-md));
}

.dossier-sheet__content--peek {
  overflow: hidden;
}

.dossier-sheet__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  z-index: 49;
}

@media (prefers-reduced-motion: reduce) {
  .dossier-sheet {
    transition: none;
  }
}
```

**Step 4: Write implementation with gesture drag**

Create `frontend/src/components/DossierSheet.tsx`:

```typescript
import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING_SHEET } from '../config/springs';
import './DossierSheet.css';

export type SheetSnap = 'hidden' | 'peek' | 'half' | 'full';

interface DossierSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: React.ReactNode;
}

const SNAP_HEIGHTS: Record<SheetSnap, string> = {
  hidden: '0px',
  peek: '140px',
  half: '50vh',
  full: '90vh',
};

// Velocity threshold for fast-swipe detection (px/s)
const VELOCITY_THRESHOLD = 500;
// Distance threshold for slow-drag snap change (px)
const DRAG_THRESHOLD = 100;

export default function DossierSheet({ snap, onSnapChange, children }: DossierSheetProps) {
  // Escape key at full -> half
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && snap === 'full') {
        onSnapChange('half');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [snap, onSnapChange]);

  // Gesture handler: velocity-first, then distance fallback
  const handleDragEnd = useCallback(
    (_: unknown, info: { velocity: { y: number }; offset: { y: number } }) => {
      const vy = info.velocity.y;
      const dy = info.offset.y;

      // Fast swipe up -> expand one level (or go full)
      if (vy < -VELOCITY_THRESHOLD) {
        onSnapChange(snap === 'peek' ? 'half' : 'full');
        return;
      }
      // Fast swipe down -> collapse one level (or go peek)
      if (vy > VELOCITY_THRESHOLD) {
        onSnapChange(snap === 'full' ? 'half' : 'peek');
        return;
      }

      // Slow drag: snap based on drag distance
      if (dy < -DRAG_THRESHOLD) {
        onSnapChange(snap === 'peek' ? 'half' : 'full');
      } else if (dy > DRAG_THRESHOLD) {
        onSnapChange(snap === 'full' ? 'half' : 'peek');
      }
      // If drag < threshold, spring back to current snap (no-op)
    },
    [snap, onSnapChange],
  );

  if (snap === 'hidden') {
    return <div data-testid="dossier-sheet" style={{ display: 'none' }} />;
  }

  return (
    <>
      <AnimatePresence>
        {snap === 'full' && (
          <motion.div
            className="dossier-sheet__backdrop"
            data-testid="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onSnapChange('half')}
          />
        )}
      </AnimatePresence>
      <motion.div
        data-testid="dossier-sheet"
        className="dossier-sheet"
        animate={{ height: SNAP_HEIGHTS[snap] }}
        transition={SPRING_SHEET}
      >
        {/* Drag is on the HANDLE only — content div scrolls normally */}
        <motion.div
          className="dossier-sheet__handle"
          data-testid="sheet-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize"
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
          <div className="dossier-sheet__pill" />
        </motion.div>
        <div className={`dossier-sheet__content${snap === 'peek' ? ' dossier-sheet__content--peek' : ''}`}>
          {children}
        </div>
      </motion.div>
    </>
  );
}
```

Key gesture details:
- **Drag on handle only:** `drag="y"` is on `.dossier-sheet__handle`, NOT the whole sheet. Content div has `overflow-y: auto` and scrolls normally. This prevents the drag/scroll conflict (R3-Finding 5).
- **Velocity detection:** `|vy| > 500 px/s` triggers fast-swipe snap change
- **Distance detection:** `|dy| > 100 px` triggers slow-drag snap change
- **Spring-back:** If drag < 100px and velocity < 500, sheet springs back (Framer Motion handles this via `dragConstraints`)
- **Backdrop click:** At full snap, clicking backdrop collapses to half
- **Z-index: 40** — below TabBar (z-index: 50) so tabs remain accessible at all snap positions (R3-Finding 6)

**Step 5: Run test to verify it passes**

```powershell
cd frontend; npx vitest run src/components/DossierSheet.test.tsx
```
Expected: PASS (9 tests).

**Step 6: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/src/components/DossierSheet.tsx frontend/src/components/DossierSheet.css frontend/src/components/DossierSheet.test.tsx
git commit -m "feat: add DossierSheet with gesture drag, velocity thresholds, 4 snap points"
```

---

### Task 4: Wire DossierSheet into App.tsx (3-tab navigation preserved)

**IMPORTANT: Keep all 3 tabs** (Search, Briefing, Saved). CLAUDE.md specifies 3-tab navigation as established architecture. Do NOT modify TabBar's tab count, TabId type, or tab array. (TabBar.tsx IS modified later in Tasks 11 and 15 for whileTap and pill refactor — those changes don't affect tab count.)

**Files:**
- Modify: `frontend/src/App.tsx` — add sheetSnap state, wrap dossier in DossierSheet
- Modify: `frontend/src/components/BuildingFootprintMap.tsx` — add optional `zoom` prop

**Step 1: Add zoom prop to BuildingFootprintMap**

In `frontend/src/components/BuildingFootprintMap.tsx`:
- Add `zoom?: number` to the props interface (after line 10)
- Change `zoom={18}` (line 21) to `zoom={zoom ?? 18}`

**Step 2: Update App.tsx**

In `frontend/src/App.tsx`, make these changes:

**2a. Add import for DossierSheet** (after line 19):
```typescript
import DossierSheet from './components/DossierSheet';
import type { SheetSnap } from './components/DossierSheet';
```

**2b. Add sheetSnap and pendingDisplayName state** (after line 165, near other state declarations):
```typescript
const [sheetSnap, setSheetSnap] = useState<SheetSnap>('hidden');
const [pendingDisplayName, setPendingDisplayName] = useState<string | null>(null);
```

Note: `pendingDisplayName` is declared here (not Task 5) so that `handleAddressSelect` can use it immediately. Task 5 wires it into the skeleton render.

**2c. Update handleAddressSelect** (line 306+):
Move `setActiveScreen('dossier')` and add `setSheetSnap('peek')` **BEFORE** the `lookupAddress()` call. This is the T+0 timing fix (R3-Finding 4):

```typescript
// T+0: immediately show dossier screen with sheet at peek
setActiveScreen('dossier');
setSheetSnap('peek');
setPendingDisplayName(suggestion.display_name);

// Then resolve full address (async, ~200ms)
const resolved = await lookupAddress(suggestion.id);
```

**2d. Wrap dossier content in DossierSheet** (in the render, around line 670-731):
Replace the `showLoadingScreen` ternary with the DossierSheet wrapping the dossier content. The `BuildingFootprintMap` moves above the sheet (visible behind it), and dossier cards go inside the sheet.

The structure becomes:
```tsx
{(activeScreen === 'search' || activeScreen === 'dossier') && (
  <>
    <AddressSearch onSelect={handleAddressSelect} />
    {error && <p className="app__error">{error}</p>}

    {/* Map visible behind the sheet */}
    {address?.latitude && address?.longitude && (
      <Suspense fallback={<div className="viewer-3d-status"><p>{t('viewer3d.loading')}</p></div>}>
        <BuildingFootprintMap
          lat={address.latitude}
          lng={address.longitude}
          footprint={buildingResponse?.building?.footprint_geojson}
          zoom={15}
        />
      </Suspense>
    )}

    {/* DossierSheet slides up over the map */}
    <DossierSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
      {address && buildingResponse && (
        <AddressHeader ... />
      )}
      {summaryPills.length > 0 && <SummaryStrip ... />}
      {/* ... rest of dossier cards ... */}
    </DossierSheet>
  </>
)}
```

**Step 3: Run tests**

```powershell
cd frontend; npx vitest run
```

Expected: >= 338 pass (new DossierSheet tests add to total). No tab count changes, so no regressions from TabBar.

**Step 4: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds (TypeScript catches any dangling references).

**Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/BuildingFootprintMap.tsx
git commit -m "feat: wire DossierSheet into App with T+0 reveal (3-tab navigation preserved)"
```

---

## Tier 1B: Skeleton Loading

### Task 5: Replace LoadingScreen with skeleton loading

The current flow blocks the entire screen with `LoadingScreen` (line 672-677 of App.tsx). Replace with inline skeleton cards that appear immediately when an address is selected.

**Key timing insight (R3-Finding 4):** `suggestion.display_name` is available at T+0 (passed to `handleAddressSelect`). The resolved `address` object is only available after `lookupAddress()` resolves (~200ms). The skeleton must use `suggestion.display_name`, NOT `address.display_name`. Task 4 already moves `setActiveScreen('dossier')` + `setSheetSnap('peek')` BEFORE `lookupAddress()`, so the skeleton is visible immediately.

**Files:**
- Create: `frontend/src/components/SkeletonCard.tsx`
- Create: `frontend/src/components/SkeletonCard.css`
- Create: `frontend/src/components/SkeletonCard.test.tsx`
- Modify: `frontend/src/styles/tokens.css` — add skeleton tokens
- Modify: `frontend/src/App.tsx` — remove LoadingScreen, add skeleton states

**Step 1: Add skeleton tokens to tokens.css**

In `frontend/src/styles/tokens.css`, add inside the `:root` block (before the `/* Dark Mode */` section at line 177):

```css
  /* ── Skeleton ── */
  --color-skeleton: var(--color-surface-alt);
  --color-skeleton-shimmer: rgba(255, 255, 255, 0.6);
  --skeleton-duration: 1.5s;
```

Add dark-mode overrides inside the `[data-theme="dark"]` block:
```css
  --color-skeleton: rgba(255, 255, 255, 0.08);
  --color-skeleton-shimmer: rgba(255, 255, 255, 0.04);
```

**Step 2: Write skeleton test**

Create `frontend/src/components/SkeletonCard.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonCard, SkeletonLine, SkeletonGrid } from './SkeletonCard';

describe('SkeletonCard', () => {
  it('renders with shimmer animation class', () => {
    render(<SkeletonCard data-testid="skel" />);
    expect(screen.getByTestId('skel')).toHaveClass('skeleton-card');
  });

  it('renders children inside', () => {
    render(<SkeletonCard><span data-testid="child">hi</span></SkeletonCard>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

describe('SkeletonLine', () => {
  it('renders with width prop', () => {
    render(<SkeletonLine width="60%" data-testid="line" />);
    const el = screen.getByTestId('line');
    expect(el).toHaveStyle({ width: '60%' });
  });

  it('defaults to 100% width', () => {
    render(<SkeletonLine data-testid="line" />);
    const el = screen.getByTestId('line');
    expect(el).toHaveStyle({ width: '100%' });
  });
});

describe('SkeletonGrid', () => {
  it('renders 4 skeleton tiles', () => {
    render(<SkeletonGrid />);
    const tiles = screen.getAllByTestId('skeleton-tile');
    expect(tiles).toHaveLength(4);
  });
});
```

**Step 3: Write skeleton implementation**

Create `frontend/src/components/SkeletonCard.css`:

```css
.skeleton-card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--elevation-1);
  padding: var(--space-base);
  margin-bottom: var(--space-md);
}

.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
  background: var(--color-skeleton);
  position: relative;
  overflow: hidden;
}

.skeleton-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--color-skeleton-shimmer), transparent);
  animation: shimmer var(--skeleton-duration) infinite;
}

.skeleton-line--lg {
  height: 20px;
}

.skeleton-line + .skeleton-line {
  margin-top: var(--space-sm);
}

.skeleton-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.skeleton-tile {
  aspect-ratio: 1;
  border-radius: var(--radius-card);
  background: var(--color-skeleton);
  position: relative;
  overflow: hidden;
}

.skeleton-tile::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--color-skeleton-shimmer), transparent);
  animation: shimmer var(--skeleton-duration) infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line::after,
  .skeleton-tile::after {
    animation: none;
  }
}
```

Create `frontend/src/components/SkeletonCard.tsx`:

```typescript
import './SkeletonCard.css';

interface SkeletonCardProps {
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function SkeletonCard({ children, ...props }: SkeletonCardProps) {
  return (
    <div className="skeleton-card" {...props}>
      {children || (
        <>
          <SkeletonLine width="40%" className="skeleton-line--lg" />
          <SkeletonLine width="70%" />
          <SkeletonLine width="55%" />
        </>
      )}
    </div>
  );
}

interface SkeletonLineProps {
  width?: string;
  className?: string;
  'data-testid'?: string;
}

export function SkeletonLine({ width = '100%', className = '', ...props }: SkeletonLineProps) {
  return <div className={`skeleton-line ${className}`} style={{ width }} {...props} />;
}

export function SkeletonGrid() {
  return (
    <div className="skeleton-grid">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-tile" data-testid="skeleton-tile" />
      ))}
    </div>
  );
}
```

**Step 4: Update App.tsx — remove LoadingScreen, add skeleton flow**

In `frontend/src/App.tsx`:

**4a. `pendingDisplayName` state already declared in Task 4.** No new state needed here.

**4b. Remove LoadingScreen-related state** (lines 166-169, 172):
Delete these lines:
```typescript
// DELETE these:
const [showLoadingScreen, setShowLoadingScreen] = useState(false);
const [loadingAddress, setLoadingAddress] = useState<string | null>(null);
const [loadingProgressText, setLoadingProgressText] = useState<string | undefined>(undefined);
const [loadingTone, setLoadingTone] = useState<'normal' | 'warning'>('normal');
const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**4c. Remove LoadingScreen helper callbacks** (lines 200-221):
Delete `setLoadingStage`, `showLoadingWarning`, `finishLoadingFlow` callbacks entirely.

**4d. Remove the loadingTimeoutRef cleanup effect** (lines 189-193).

**4e. Remove the LoadingScreen import** (line 15):
Delete `import LoadingScreen from './components/LoadingScreen';`

**4f. Add SkeletonCard import:**
```typescript
import { SkeletonCard, SkeletonGrid, SkeletonLine } from './components/SkeletonCard';
```

**4g. Update handleAddressSelect** (line 306+):
`setPendingDisplayName(suggestion.display_name)` is already set in Task 4 step 2c. In this step, only clean up LoadingScreen leftovers:
Remove all `setShowLoadingScreen`, `setLoadingAddress`, `setLoadingStage`, `showLoadingWarning`, `finishLoadingFlow` calls.
Remove the `loadingTimeoutRef` setTimeout/clearTimeout blocks.
Keep the `setLoading(true)`, `setActiveScreen('dossier')`, `setSheetSnap('peek')`, `setPendingDisplayName(...)` flow (already added in Task 4).

**4h. In the render, replace the `showLoadingScreen` ternary** (lines 672-677):
Instead of `{showLoadingScreen ? <LoadingScreen ... /> : <content>}`, render the dossier content always, using skeleton cards when data is loading:

Inside the DossierSheet (from Task 4), show skeleton or real content conditionally:
```tsx
<DossierSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
  {/* Address header: show pending name as skeleton, or real header */}
  {loading && !buildingResponse && pendingDisplayName && (
    <SkeletonCard>
      <SkeletonLine width="70%" className="skeleton-line--lg" />
      <SkeletonLine width="40%" />
    </SkeletonCard>
  )}

  {address && buildingResponse && (
    <AddressHeader ... />
  )}

  {/* Risk tiles: skeleton grid while loading */}
  {loading && !riskCards && (
    <SkeletonGrid />
  )}

  {/* Real risk tiles when loaded */}
  {summaryPills.length > 0 && <SummaryStrip ... />}
  {/* ... rest of dossier cards ... */}
</DossierSheet>
```

**Step 5: Run tests**

```powershell
cd frontend; npx vitest run
```

Expected: temporary red is acceptable in this step because `LoadingScreen.test.tsx` still exists and will fail after App flow changes. Proceed to Task 6 to delete obsolete LoadingScreen files, then return to full green.

**Step 6: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds (catches dangling imports to LoadingScreen).

**Step 7: Commit**

```bash
git add frontend/src/components/SkeletonCard.tsx frontend/src/components/SkeletonCard.css frontend/src/components/SkeletonCard.test.tsx frontend/src/styles/tokens.css frontend/src/App.tsx
git commit -m "feat: add skeleton loading cards, wire into dossier flow"
```

---

### Task 6: Delete LoadingScreen and BuildingAnimation

**Only 4 files exist** (validated via `Glob`):
1. `frontend/src/components/LoadingScreen.tsx` — 60 lines
2. `frontend/src/components/LoadingScreen.css` — exists
3. `frontend/src/components/LoadingScreen.test.tsx` — 7 tests
4. `frontend/src/components/BuildingAnimation.tsx` — 87 lines

**Note:** `BuildingAnimation.css` and `BuildingAnimation.test.tsx` do NOT exist — do not attempt to delete them.

**Files:**
- Delete: `frontend/src/components/LoadingScreen.tsx`
- Delete: `frontend/src/components/LoadingScreen.css`
- Delete: `frontend/src/components/LoadingScreen.test.tsx`
- Delete: `frontend/src/components/BuildingAnimation.tsx`
- Modify: `frontend/src/App.test.tsx` — remove LoadingScreen assertions

**Step 1: Delete files**

```powershell
cd frontend; Remove-Item src/components/LoadingScreen.tsx, src/components/LoadingScreen.css, src/components/LoadingScreen.test.tsx, src/components/BuildingAnimation.tsx
```

**Step 2: Update App.test.tsx**

Find and remove assertions that reference `loading-screen` testid (e.g., `expect(screen.getByTestId('loading-screen'))`). Replace with assertions for the new skeleton behavior if applicable.

**Step 3: Run tests and verify net count**

```powershell
cd frontend; npx vitest run 2>&1 | Select-Object -Last 10
```

Expected: Test count drops by 7 (LoadingScreen tests removed) but gains from SkeletonCard tests (6) + DossierSheet tests (9). Net should be >= 338 + 15 - 7 = 346.

**Step 4: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds (no dangling references).

**Step 5: Commit**

```bash
git add -A frontend/src/components/LoadingScreen.tsx frontend/src/components/LoadingScreen.css frontend/src/components/LoadingScreen.test.tsx frontend/src/components/BuildingAnimation.tsx frontend/src/App.test.tsx
git commit -m "refactor: remove LoadingScreen and BuildingAnimation (replaced by skeleton loading)"
```

---

## Tier 1C: Touch Target Compliance

### Task 7: Fix all 44px touch target violations

Comprehensive audit of all interactive elements. Apple HIG requires 44x44px minimum touch targets.

**Files to modify:**
- `frontend/src/components/RiskDetailView.css:28-29` — back button 36→44px
- `frontend/src/components/TopBar.css:55` — lang toggle padding 4px 12px → 10px 12px (reaches 44px height)
- `frontend/src/components/TopBar.css:76-77` — settings button 36→44px
- `frontend/src/components/AddressHeader.css:34-35` — bookmark button 40→44px
- `frontend/src/components/ShortlistScreen.css:99-100` — remove button 32→44px
- `frontend/src/components/ViewingChecklist.css:41` — checklist items need min-height: 48px

**Step 1: Fix RiskDetailView back button**

In `frontend/src/components/RiskDetailView.css`, change lines 28-29:
```css
/* Before: */
  width: 36px;
  height: 36px;

/* After: */
  width: 44px;
  height: 44px;
```

**Step 2: Fix TopBar lang toggle**

In `frontend/src/components/TopBar.css`, change line 55:
```css
/* Before: */
  padding: 4px 12px;

/* After: */
  padding: 10px 12px;
  min-height: 44px; /* Explicit 44px guarantee regardless of font size (R3-Finding 8) */
```

**Step 3: Fix TopBar settings button**

In `frontend/src/components/TopBar.css`, change lines 76-77:
```css
/* Before: */
  width: 36px;
  height: 36px;

/* After: */
  width: 44px;
  height: 44px;
```

**Step 4: Fix AddressHeader bookmark**

In `frontend/src/components/AddressHeader.css`, change lines 34-35:
```css
/* Before: */
  width: 40px;
  height: 40px;

/* After: */
  width: 44px;
  height: 44px;
```

**Step 5: Fix ShortlistScreen remove button**

In `frontend/src/components/ShortlistScreen.css`, change lines 99-100:
```css
/* Before: */
  width: 32px;
  height: 32px;

/* After: */
  width: 44px;
  height: 44px;
```

**Step 6: Fix ViewingChecklist item height**

In `frontend/src/components/ViewingChecklist.css`, add `min-height: 48px` to the checklist item rule (line 41):
```css
/* Before: */
  padding: var(--space-xs) 0;

/* After: */
  padding: var(--space-xs) 0;
  min-height: 48px;
  display: flex;
  align-items: center;
```

**Step 7: Run tests**

```powershell
cd frontend; npx vitest run
```
Expected: All pass. CSS changes don't break logic tests.

**Step 8: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds.

**Step 9: Commit**

```bash
git add frontend/src/components/RiskDetailView.css frontend/src/components/TopBar.css frontend/src/components/AddressHeader.css frontend/src/components/ShortlistScreen.css frontend/src/components/ViewingChecklist.css
git commit -m "fix: enforce 44px minimum touch targets on all interactive elements"
```

---

## Tier 1 Quality Gate

### Task 8: Tier 1 quality gate

**Step 1: Run full frontend test suite**

```powershell
cd frontend; npx vitest run 2>&1 | Select-Object -Last 10
```
Expected: >= 346 pass (0 fail). Net should exceed original 338 baseline.

**Step 2: Run full backend test suite**

```powershell
cd backend; python -m pytest -m "not live" -q 2>&1 | Select-Object -Last 10
```
Expected: 328 pass (0 fail), 9 deselected.

**Step 3: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds.

**Step 4: Run ruff**

```powershell
cd backend; ruff check app/ tests/
```
Expected: No errors.

**Step 5: Check bundle size**

```powershell
cd frontend; npm run build 2>&1 | Select-String "gzip"
```
Expected: Total gzip < 330KB (was ~291KB + ~33KB framer-motion).

**Step 6: Commit quality gate checkpoint**

```bash
git add -A
git commit -m "chore: Tier 1 quality gate — all tests pass, bundle within budget"
```

---

## Tier 2A: Press States

### Task 9: Create usePressable hook (pointer events only)

This hook uses pointer events exclusively. **No `:active` CSS fallback** — pointer events work consistently across mobile browsers including iOS Safari (where `:active` has finger-drift issues). The hook adds/removes a `.pressed` CSS class programmatically.

**Files:**
- Create: `frontend/src/hooks/usePressable.ts`
- Create: `frontend/src/hooks/usePressable.test.ts`

**Step 1: Write the test**

Create `frontend/src/hooks/usePressable.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePressable } from './usePressable';

describe('usePressable', () => {
  it('returns pressable props object', () => {
    const { result } = renderHook(() => usePressable());
    expect(result.current.pressableProps).toBeDefined();
    expect(result.current.isPressed).toBe(false);
  });

  it('sets isPressed true on pointerdown', () => {
    const { result } = renderHook(() => usePressable());
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    expect(result.current.isPressed).toBe(true);
  });

  it('sets isPressed false on pointerup', () => {
    const { result } = renderHook(() => usePressable());
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerUp({} as React.PointerEvent);
    });
    expect(result.current.isPressed).toBe(false);
  });

  it('sets isPressed false on pointerleave (finger drift)', () => {
    const { result } = renderHook(() => usePressable());
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerLeave({} as React.PointerEvent);
    });
    expect(result.current.isPressed).toBe(false);
  });

  it('calls onPress callback on pointerup after pointerdown', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => usePressable({ onPress }));
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerUp({} as React.PointerEvent);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress if pointerleave before pointerup', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => usePressable({ onPress }));
    act(() => {
      result.current.pressableProps.onPointerDown({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerLeave({} as React.PointerEvent);
    });
    act(() => {
      result.current.pressableProps.onPointerUp({} as React.PointerEvent);
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('handles keyboard Enter/Space for a11y', () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => usePressable({ onPress }));
    act(() => {
      result.current.pressableProps.onKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.pressableProps.onKeyDown({ key: ' ', preventDefault: vi.fn() } as unknown as React.KeyboardEvent);
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run test to verify it fails**

```powershell
cd frontend; npx vitest run src/hooks/usePressable.test.ts
```
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `frontend/src/hooks/usePressable.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';

interface UsePressableOptions {
  onPress?: () => void;
  disabled?: boolean;
}

export function usePressable({ onPress, disabled }: UsePressableOptions = {}) {
  const [isPressed, setIsPressed] = useState(false);
  const wasPressed = useRef(false);

  const handlePointerDown = useCallback((_e: React.PointerEvent) => {
    if (disabled) return;
    setIsPressed(true);
    wasPressed.current = true;
  }, [disabled]);

  const handlePointerUp = useCallback((_e: React.PointerEvent) => {
    if (wasPressed.current && !disabled) {
      onPress?.();
    }
    setIsPressed(false);
    wasPressed.current = false;
  }, [onPress, disabled]);

  const handlePointerLeave = useCallback((_e: React.PointerEvent) => {
    setIsPressed(false);
    wasPressed.current = false;
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPress?.();
    }
  }, [onPress, disabled]);

  return {
    isPressed,
    pressableProps: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerLeave,
      onKeyDown: handleKeyDown,
    },
  };
}
```

**Step 4: Run test to verify it passes**

```powershell
cd frontend; npx vitest run src/hooks/usePressable.test.ts
```
Expected: PASS (7 tests).

**Step 5: Commit**

```bash
git add frontend/src/hooks/usePressable.ts frontend/src/hooks/usePressable.test.ts
git commit -m "feat: add usePressable hook with pointer events and keyboard parity"
```

---

### Task 10: Create pressable.css and add pressed surface token

**Files:**
- Create: `frontend/src/styles/pressable.css`
- Modify: `frontend/src/styles/tokens.css` — add `--color-surface-pressed`
- Modify: `frontend/src/index.css` — import pressable.css

**Step 1: Add pressed surface token**

In `frontend/src/styles/tokens.css`, add inside `:root` (after the skeleton tokens):
```css
  /* ── Press State ── */
  --color-surface-pressed: rgba(28, 45, 63, 0.06);
```

Add dark-mode override:
```css
  --color-surface-pressed: rgba(255, 255, 255, 0.06);
```

**Step 2: Create pressable.css**

Create `frontend/src/styles/pressable.css`:

```css
/* Global pressed state styles for usePressable hook.
 * Applied via the `pressed` CSS class (set by pointer events, not :active).
 * No :active fallback — pointer events work on all target platforms.
 */

.pressable {
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: manipulation;
  cursor: pointer;
}

.pressable.pressed {
  transform: scale(0.97);
  background-color: var(--color-surface-pressed);
  transition: transform 80ms ease-out;
}

.pressable:not(.pressed) {
  transition: transform 150ms ease-out;
}
```

**Step 3: Import in index.css**

In `frontend/src/index.css`, add after the existing imports:
```css
@import './styles/pressable.css';
```

**Step 4: Run tests and build**

```powershell
cd frontend; npx vitest run
cd frontend; npm run build
```
Expected: All pass, build succeeds.

**Step 5: Commit**

```bash
git add frontend/src/styles/pressable.css frontend/src/styles/tokens.css frontend/src/index.css
git commit -m "feat: add pressable CSS with pointer-event-driven press state"
```

---

### Task 11: Apply press states to interactive elements

**Two press-state strategies (R3-Finding 7):**
1. **Framer Motion `whileTap`** — for components wrapped in `motion.*` (RiskTile, TabBar, shortlist remove). Native Framer scale animation. Preferred for buttons rendered inside `.map()` loops (avoids hooks-in-loop violation).
2. **`usePressable` hook** — for non-motion elements rendered once per component (bookmark button in AddressHeader). Adds `.pressed` CSS class via pointer events.

**Files:**
- Modify: `frontend/src/components/RiskTile.tsx` — add `motion.button` with `whileTap`
- Modify: `frontend/src/components/RiskTile.css` — remove manual `:active` if present
- Modify: `frontend/src/components/TabBar.tsx` — add `whileTap` to tab buttons
- Modify: `frontend/src/components/AddressHeader.tsx` — apply `usePressable` to bookmark button
- Modify: `frontend/src/components/ShortlistScreen.tsx` — use `motion.button` + `whileTap` on remove button (NOT `usePressable` — button is inside `.map()` loop)

**Step 1: Update RiskTile to use Framer Motion whileTap**

In `frontend/src/components/RiskTile.tsx`:
- Add import: `import { motion } from 'framer-motion';`
- Replace `<button className="risk-tile" onClick={onTap}>` (line 21) with:
```tsx
<motion.button
  className="risk-tile"
  onClick={onTap}
  whileTap={{ scale: 0.97 }}
  data-testid={`risk-tile-${category}`}
>
```
- Replace closing `</button>` (line 40) with `</motion.button>`

**Step 2: Update TabBar buttons**

In `frontend/src/components/TabBar.tsx`:
- Add import: `import { motion } from 'framer-motion';`
- Wrap each tab button with `motion.button` and add `whileTap={{ scale: 0.95 }}`.

**Step 3: Apply usePressable to bookmark button**

In `frontend/src/components/AddressHeader.tsx`:
- Add import: `import { usePressable } from '../hooks/usePressable';`
- In the component body: `const { isPressed, pressableProps } = usePressable();`
- Add `{...pressableProps}` and `className={`...bookmark-btn${isPressed ? ' pressed' : ''}`}` to the bookmark button
- Add `className="pressable"` base class to the bookmark button

**Step 4: Apply whileTap to shortlist remove button (NOT usePressable)**

In `frontend/src/components/ShortlistScreen.tsx`:
- The remove button is rendered inside `items.map(...)` (line ~42). Using `usePressable` here would violate React Hooks rules (hooks cannot be called inside loops).
- Instead, use `motion.button` with `whileTap` (same as RiskTile):
- Add import: `import { motion } from 'framer-motion';`
- Replace the remove `<button>` (line ~65) with `<motion.button whileTap={{ scale: 0.95 }}>`

**Step 5: Run tests**

```powershell
cd frontend; npx vitest run
```
Expected: All pass (framer-motion mock handles `motion.button` transparently, usePressable is a regular hook).

**Step 6: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/src/components/RiskTile.tsx frontend/src/components/RiskTile.css frontend/src/components/TabBar.tsx frontend/src/components/AddressHeader.tsx frontend/src/components/ShortlistScreen.tsx
git commit -m "feat: add press states — whileTap for motion elements, usePressable for non-motion"
```

---

## Tier 2B: Shared Element Transitions

### Task 12: Add layoutId to RiskTile → RiskDetailView transition

The risk tile tap → detail view expansion uses Framer Motion's `layoutId` for a shared element transition. The tile morphs into the full-screen detail view.

**Files:**
- Modify: `frontend/src/components/RiskTile.tsx` — add `layoutId`
- Modify: `frontend/src/components/RiskDetailView.tsx` — add `layoutId`, `motion.div`, transition callbacks
- Modify: `frontend/src/components/RiskDetailView.css:1-9` — keep `position: fixed; inset: 0;` as final animated state (Framer interpolates to it)
- Modify: `frontend/src/App.tsx` — add `isTransitioning` state, wire callbacks, wrap with `LayoutGroup`

**Step 1: Add layoutId to RiskTile**

In `frontend/src/components/RiskTile.tsx`:
- The `motion.button` (from Task 11) already exists
- Add `layoutId={`risk-tile-${category}`}` prop to it

**Step 2: Update RiskDetailView to accept animation callbacks**

In `frontend/src/components/RiskDetailView.tsx`:
- Add to props interface (line 14-27):
```typescript
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
```
- Add import: `import { motion } from 'framer-motion';`
- Import: `import { SPRING_EXPAND } from '../config/springs';`
- Wrap the outer `<div className="risk-detail">` with `motion.div`:
```tsx
<motion.div
  className="risk-detail"
  layoutId={`risk-tile-${category}`}
  transition={SPRING_EXPAND}
  onAnimationStart={onAnimationStart}
  onAnimationComplete={onAnimationComplete}
  data-testid={`risk-detail-${category}`}
>
```

**Step 3: Verify RiskDetailView.css (no changes needed)**

In `frontend/src/components/RiskDetailView.css`, **keep** the existing `position: fixed; inset: 0;` rules exactly as they are (R3-Finding 9). These define the final resting position of the detail view. Framer Motion's `layoutId` will animate from the tile's position to this full-screen position — it interpolates TO the CSS-defined final state, not FROM it. Do NOT remove `position: fixed; inset: 0;`.

**Step 4: Wire isTransitioning in App.tsx**

In `frontend/src/App.tsx`:

**4a. Add isTransitioning state** (near other state declarations):
```typescript
const [isTransitioning, setIsTransitioning] = useState(false);
```

**4b. Add LayoutGroup import:**
```typescript
import { LayoutGroup } from 'framer-motion';
```

**4c. Wrap the risk tiles + detail view section in `<LayoutGroup>`:**
```tsx
<LayoutGroup>
  {/* RiskTilesGrid with layoutId on each tile */}
  {riskCards && (
    <RiskTilesGrid ... />
  )}

  {/* RiskDetailView with matching layoutId */}
  {activeDetailCategory && (() => {
    const detail = getDetailProps(activeDetailCategory);
    if (!detail) return null;
    return (
      <RiskDetailView
        ...
        onAnimationStart={() => setIsTransitioning(true)}
        onAnimationComplete={() => setIsTransitioning(false)}
      />
    );
  })()}
</LayoutGroup>
```

**4d. Guard taps during transition:**
In `handleAddressSelect` and `setActiveDetailCategory`, skip if `isTransitioning`:
```typescript
// Guard in the onTap handler for risk tiles
const handleRiskTileTap = useCallback((category: string) => {
  if (isTransitioning) return;
  setActiveDetailCategory(category);
}, [isTransitioning]);
```

**Step 5: Run tests**

```powershell
cd frontend; npx vitest run
```
Expected: All pass. The framer-motion mock renders `motion.div` as plain `div` with `data-testid`, so existing assertions still work.

**Step 6: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds.

**Step 7: Commit**

```bash
git add frontend/src/components/RiskTile.tsx frontend/src/components/RiskDetailView.tsx frontend/src/components/RiskDetailView.css frontend/src/App.tsx
git commit -m "feat: shared element transition for risk tile → detail view with layoutId"
```

---

## Tier 2C: Haptic Feedback

### Task 13: Create haptic utility

**Files:**
- Create: `frontend/src/utils/haptic.ts`
- Create: `frontend/src/utils/haptic.test.ts`

**Step 1: Write the test**

Create `frontend/src/utils/haptic.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hapticTap, hapticSuccess, hapticWarning } from './haptic';

describe('haptic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls navigator.vibrate for tap', () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    hapticTap();
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
  });

  it('calls navigator.vibrate for success', () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    hapticSuccess();
    expect(navigator.vibrate).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('calls navigator.vibrate for warning', () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), writable: true, configurable: true });
    hapticWarning();
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 50, 30]);
  });

  it('does not throw when vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true, configurable: true });
    expect(() => hapticTap()).not.toThrow();
    expect(() => hapticSuccess()).not.toThrow();
    expect(() => hapticWarning()).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```powershell
cd frontend; npx vitest run src/utils/haptic.test.ts
```
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `frontend/src/utils/haptic.ts`:

```typescript
function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export function hapticTap(): void {
  vibrate(10);
}

export function hapticSuccess(): void {
  vibrate([10, 50, 10]);
}

export function hapticWarning(): void {
  vibrate([30, 50, 30]);
}
```

**Step 4: Run test to verify it passes**

```powershell
cd frontend; npx vitest run src/utils/haptic.test.ts
```
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add frontend/src/utils/haptic.ts frontend/src/utils/haptic.test.ts
git commit -m "feat: add haptic feedback utility with vibrate API"
```

---

### Task 14: Wire haptic into key interactions

**Files:**
- Modify: `frontend/src/App.tsx` — add haptic calls to bookmark, export, tab change

Note the import path from `App.tsx` (which lives at `src/App.tsx`): `./utils/haptic` (NOT `../utils/haptic`).

**Step 1: Add haptic import to App.tsx**

```typescript
import { hapticTap, hapticSuccess } from './utils/haptic';
```

**Step 2: Add haptic calls**

- In `handleBookmark`: add `hapticTap()` at the start
- In `handleTabChange`: add `hapticTap()` at the start
- In the export success handler: add `hapticSuccess()`

**Step 3: Run tests and build**

```powershell
cd frontend; npx vitest run
cd frontend; npm run build
```
Expected: All pass, build succeeds.

**Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire haptic feedback into bookmark, tab, and export interactions"
```

---

## Tier 2D: Spring Physics on Remaining Transitions

### Task 15: Apply spring physics to sheet, tab, and skeleton transitions

Ensure all Framer Motion transitions use the named spring constants from `config/springs.ts`. No hardcoded stiffness/damping values anywhere.

**Files:**
- Verify: `frontend/src/components/DossierSheet.tsx` — uses `SPRING_SHEET` (done in Task 3)
- Verify: `frontend/src/components/RiskDetailView.tsx` — uses `SPRING_EXPAND` (done in Task 12)
- Modify: `frontend/src/components/TabBar.tsx` — add spring transition to tab pill indicator

**Step 1: Refactor TabBar pill from `::before` pseudo-element to `<motion.div>` DOM element**

The tab pill indicator is currently a CSS `::before` pseudo-element on `.tab-bar__tab--active` (see `TabBar.css:41-48`). Framer Motion's `layoutId` requires a real DOM element — it cannot animate pseudo-elements (R3-Finding 10).

In `frontend/src/components/TabBar.tsx`:
- Import: `import { SPRING_TAB } from '../config/springs';`
- Import: `import { motion } from 'framer-motion';` (may already be imported from Task 11)
- Inside each tab button, add a conditional pill element for the active tab:
```tsx
<button className={`tab-bar__tab${isActive ? ' tab-bar__tab--active' : ''}`} ...>
  {isActive && (
    <motion.div className="tab-bar__pill" layoutId="tab-pill" transition={SPRING_TAB} />
  )}
  <span className="tab-bar__icon">{tab.icon}</span>
  <span className="tab-bar__label">{t(tab.labelKey)}</span>
</button>
```

In `frontend/src/components/TabBar.css`:
- **Remove** the `::before` pseudo-element from `.tab-bar__tab--active` (lines 41-48)
- **Add** a new `.tab-bar__pill` rule with the same visual styles:
```css
.tab-bar__pill {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 48px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-accent);
}
```

**Step 2: Run tests and build**

```powershell
cd frontend; npx vitest run
cd frontend; npm run build
```
Expected: All pass, build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/components/TabBar.tsx frontend/src/components/TabBar.css
git commit -m "feat: refactor tab pill from ::before to motion.div with SPRING_TAB transition"
```

---

## Tier 2 Quality Gate

### Task 16: Tier 2 quality gate

**Step 1: Run full frontend test suite**

```powershell
cd frontend; npx vitest run 2>&1 | Select-Object -Last 10
```
Expected: >= 355 pass (0 fail). Gains from: springs (4), DossierSheet (9), skeleton (6), pressable (7), haptic (4). Losses: LoadingScreen (7).

**Step 2: Run full backend test suite**

```powershell
cd backend; python -m pytest -m "not live" -q 2>&1 | Select-Object -Last 10
```
Expected: 328 pass (0 fail), 9 deselected.

**Step 3: Run build**

```powershell
cd frontend; npm run build
```
Expected: Build succeeds.

**Step 4: Run ruff**

```powershell
cd backend; ruff check app/ tests/
```
Expected: No errors.

**Step 5: Check bundle size**

```powershell
cd frontend; npm run build 2>&1 | Select-String "gzip"
```
Expected: Total gzip < 330KB.

**Step 6: Verify spring constant usage (no hardcoded values)**

```powershell
cd frontend; npx vitest run src/config/springs.test.ts
```
Expected: PASS — confirms all spring constants are valid.

Visually verify: no `stiffness:` or `damping:` literals appear outside `config/springs.ts`:
```powershell
Select-String -Path "frontend/src/**/*.tsx","frontend/src/**/*.ts" -Pattern "stiffness:|damping:" -Exclude "*springs*","*node_modules*","*.test.*" | Select-Object -First 10
```
Expected: No matches.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: Tier 2 quality gate — all tests pass, springs verified, bundle within budget"
```

---

## Summary of Changes by Finding

**R2 Findings (original 12 from first assessment):**

| # | Finding | Resolution |
|---|---------|-----------|
| 1 | Bottom sheet not planned | Task 3: DossierSheet with handle-only drag, velocity thresholds, 4 snap points |
| 2 | Non-existent file deletions | Task 6: only 4 files, validated via Glob |
| 3 | Skeleton timing contradiction | Task 5: `suggestion.display_name` at T+0, `pendingDisplayName` state |
| 4 | isTransitioning not wired | Task 12: animation callbacks + tap guard |
| 5 | Stale test baselines | Task 0: verify-only (all already green) |
| 6 | Invalid token --shadow-sm | All CSS uses `--elevation-1/2/3`. Zero `--shadow-sm` |
| 7 | Wrong import path | Task 14: `./utils/haptic` (correct for `src/App.tsx`) |
| 8 | Press state contradiction | Task 9-10: pointer events only, no `:active` |
| 9 | Spring constants unused | Task 12/15: all transitions use `config/springs.ts` |
| 10 | Incomplete touch targets | Task 7: 6 violations + explicit min-height on lang toggle |
| 11 | React 18 stated | React 19 throughout |
| 12 | grep not PowerShell | All commands PowerShell-native |

**R3 Findings (12 from Revision 3 assessment — addressed in R4):**

| # | Finding | Resolution |
|---|---------|-----------|
| 1 | Baselines outdated (said 7 fail, actual 0) | Task 0: verify-only, no code changes |
| 2 | Task 0 duplicates already-fixed code | Task 0: all code edits removed |
| 3 | 3→2 tab change violates CLAUDE.md | Task 4: keep all 3 tabs, no TabBar changes |
| 4 | T+0: setActiveScreen after lookupAddress | Task 4: moved BEFORE lookupAddress() |
| 5 | Drag/scroll conflict: touch-action:none on sheet | Task 3: drag="y" on handle only |
| 6 | Z-index collision: sheet 50 = TabBar 50 | Task 3: sheet z-index: 40 |
| 7 | usePressable never applied | Task 11: bookmark uses usePressable, shortlist remove uses whileTap |
| 8 | Lang toggle min-height not guaranteed | Task 7: explicit `min-height: 44px` |
| 9 | CSS instruction contradictory | Task 12: clarified — keep fixed as final state |
| 10 | Tab pill is ::before, not DOM | Task 15: refactor to `<motion.div>` |
| 11 | File count 9 vs 13 listed | File inventory: corrected to 13 |
| 12 | Backend baseline 293 vs actual 321 | All quality gates: 328 |

**R4 Findings (3 from Revision 4 assessment - addressed in R4.1):**

| # | Finding | Resolution |
|---|---------|-----------|
| 1 | `pendingDisplayName` declared after first use | Moved state declaration into Task 4, before handler updates |
| 2 | Shortlist remove plan risked hooks-in-loop | Task 11 switched shortlist remove to `motion.button` + `whileTap` |
| 3 | Sheet content could hide under TabBar | Task 3 added bottom padding with tab height + safe area + spacing |

---

## File Inventory

**New files (13):**
- `frontend/src/config/springs.ts`
- `frontend/src/config/springs.test.ts`
- `frontend/src/components/DossierSheet.tsx`
- `frontend/src/components/DossierSheet.css`
- `frontend/src/components/DossierSheet.test.tsx`
- `frontend/src/components/SkeletonCard.tsx`
- `frontend/src/components/SkeletonCard.css`
- `frontend/src/components/SkeletonCard.test.tsx`
- `frontend/src/hooks/usePressable.ts`
- `frontend/src/hooks/usePressable.test.ts`
- `frontend/src/utils/haptic.ts`
- `frontend/src/utils/haptic.test.ts`
- `frontend/src/styles/pressable.css`

**Deleted files (4):**
- `frontend/src/components/LoadingScreen.tsx`
- `frontend/src/components/LoadingScreen.css`
- `frontend/src/components/LoadingScreen.test.tsx`
- `frontend/src/components/BuildingAnimation.tsx`

**Modified files (19):**
- `frontend/package.json` (framer-motion dependency)
- `frontend/vite.config.ts` (vendor chunk)
- `frontend/src/test/setup.ts` (framer-motion mock)
- `frontend/src/styles/tokens.css` (skeleton + pressed tokens)
- `frontend/src/index.css` (pressable import)
- `frontend/src/App.tsx` (DossierSheet, skeleton, transitions, haptic)
- `frontend/src/App.test.tsx` (remove LoadingScreen assertions)
- `frontend/src/components/TabBar.tsx` (spring pill refactor from ::before to motion.div, whileTap)
- `frontend/src/components/TabBar.css` (pill refactor from ::before to .tab-bar__pill)
- `frontend/src/components/BuildingFootprintMap.tsx` (zoom prop)
- `frontend/src/components/RiskTile.tsx` (motion.button, layoutId)
- `frontend/src/components/RiskDetailView.tsx` (motion.div, layoutId, callbacks)
- `frontend/src/components/RiskDetailView.css` (back button 44px)
- `frontend/src/components/TopBar.css` (lang toggle min-height 44px + settings 44px)
- `frontend/src/components/AddressHeader.tsx` (usePressable on bookmark)
- `frontend/src/components/AddressHeader.css` (bookmark 44px)
- `frontend/src/components/ShortlistScreen.tsx` (whileTap on remove button)
- `frontend/src/components/ShortlistScreen.css` (remove button 44px)
- `frontend/src/components/ViewingChecklist.css` (item height 48px)

**NOT modified (already correct):**
- `frontend/src/i18n/en.json` — all keys already exist
- `frontend/src/i18n/nl.json` — all keys already exist
- `backend/app/config.py` — metrics fields already present
- `backend/app/api/router.py` — metrics router already wired
