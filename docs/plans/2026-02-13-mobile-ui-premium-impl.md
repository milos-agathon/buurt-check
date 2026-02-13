# Mobile UI Premium — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate buurt-check's mobile UX to Apple-tier native feel via gesture-driven bottom sheet, skeleton loading, touch target compliance, press states, spring physics, and shared element transitions.

**Architecture:** Three-tier rollout. Tier 1 (structural): bottom sheet rewrite, skeleton loading to replace full-screen blocker, 44px touch targets. Tier 2 (perception): press states via usePressable hook + Framer Motion whileTap, spring physics on 4 key transitions, shared element risk tile expansion. Tier 3: deferred. Each tier ends with a commit + quality gate.

**Tech Stack:** React 18, TypeScript, Framer Motion (~33KB gzip), plain CSS tokens, Vitest + Testing Library.

**Design spec:** `docs/plans/2026-02-13-mobile-ui-premium-design.md`
**UI principles:** `docs/ui-principles.md`
**Test baselines:** Frontend 347 Vitest, Backend 288 pytest. Must maintain or increase.

---

## Pre-Flight: Install Framer Motion

### Task 1: Add framer-motion dependency

**Files:**
- Modify: `frontend/package.json` (add dependency)
- Modify: `frontend/vite.config.ts` (vendor chunk)
- Modify: `frontend/src/test/setup.ts` (mock for tests)

**Step 1: Install framer-motion**

Run:
```bash
cd frontend && npm install framer-motion
```

**Step 2: Add to vendor chunk in vite.config.ts**

In `frontend/vite.config.ts`, find the `manualChunks` object and add `framer-motion` to the react vendor chunk:

```typescript
// Before:
'vendor-react': ['react', 'react-dom', 'react-i18next', 'i18next'],

// After:
'vendor-react': ['react', 'react-dom', 'react-i18next', 'i18next', 'framer-motion'],
```

**Step 3: Add framer-motion mock to test setup**

In `frontend/src/test/setup.ts`, add after the existing `matchMedia` mock:

```typescript
import { createElement } from 'react';

// Mock framer-motion for tests — renders motion.div as plain div, etc.
vi.mock('framer-motion', () => {
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) => {
      const Component = ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
        // Strip framer-motion-specific props, pass rest to DOM element
        const {
          layoutId: _a, initial: _b, animate: _c, exit: _d, transition: _e,
          whileTap: _f, whileHover: _g, drag: _h, dragConstraints: _i,
          onDragEnd: _j, variants: _k, layout: _l, style,
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

Run:
```bash
cd frontend && npx vitest run
```

Expected: All 347 tests pass. The mock ensures framer-motion imports don't break existing tests.

**Step 5: Verify build succeeds**

Run:
```bash
cd frontend && npm run build
```

Expected: Build succeeds. Check that `vendor-react` chunk includes framer-motion.

**Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/test/setup.ts
git commit -m "chore: add framer-motion dependency with test mock and vendor chunk"
```

---

## Tier 1A: Spring Config Constants

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

Run: `cd frontend && npx vitest run src/config/springs.test.ts`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `frontend/src/config/springs.ts`:

```typescript
/**
 * Named spring animation configs for Framer Motion.
 * Each config has a distinct physical feel tuned for its interaction.
 *
 * Tune empirically via the spring tuner (long-press version in Settings).
 * Update ONE constant here — every animation updates.
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

Run: `cd frontend && npx vitest run src/config/springs.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add frontend/src/config/springs.ts frontend/src/config/springs.test.ts
git commit -m "feat: add named spring animation constants"
```

---

## Tier 1B: Skeleton Loading

### Task 3: Add skeleton design tokens

**Files:**
- Modify: `frontend/src/styles/tokens.css` — add skeleton tokens after line ~165 (transition section)

**Step 1: Add tokens**

In `frontend/src/styles/tokens.css`, find the transition tokens section (around line 162-165) and add after it:

```css
  /* ── Skeleton Loading ── */
  --color-skeleton: var(--color-surface-alt);
  --color-skeleton-shimmer: rgba(255, 255, 255, 0.6);
  --skeleton-duration: 1.5s;
```

In the `[data-theme="dark"]` section, add:

```css
  --color-skeleton: #1A2535;
  --color-skeleton-shimmer: rgba(255, 255, 255, 0.06);
```

**Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add frontend/src/styles/tokens.css
git commit -m "feat: add skeleton loading design tokens"
```

### Task 4: Create Skeleton primitive component

**Files:**
- Create: `frontend/src/components/ui/Skeleton.tsx`
- Create: `frontend/src/components/ui/Skeleton.css`
- Create: `frontend/src/components/ui/Skeleton.test.tsx`

**Step 1: Write the test**

Create `frontend/src/components/ui/Skeleton.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Skeleton from './Skeleton';

describe('Skeleton', () => {
  it('renders with default dimensions', () => {
    render(<Skeleton data-testid="skel" />);
    const el = screen.getByTestId('skel');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('skeleton');
  });

  it('applies custom width and height', () => {
    render(<Skeleton width="200px" height="40px" data-testid="skel" />);
    const el = screen.getByTestId('skel');
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('40px');
  });

  it('applies custom border radius', () => {
    render(<Skeleton borderRadius="50%" data-testid="skel" />);
    const el = screen.getByTestId('skel');
    expect(el.style.borderRadius).toBe('50%');
  });

  it('respects prefers-reduced-motion via CSS class', () => {
    render(<Skeleton data-testid="skel" />);
    const el = screen.getByTestId('skel');
    expect(el.className).toContain('skeleton');
    // Animation is CSS-only, so we just verify the class exists
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ui/Skeleton.test.tsx`
Expected: FAIL — module not found.

**Step 3: Write implementation**

Create `frontend/src/components/ui/Skeleton.css`:

```css
.skeleton {
  background: var(--color-skeleton);
  background-image: linear-gradient(
    90deg,
    var(--color-skeleton) 25%,
    var(--color-skeleton-shimmer) 50%,
    var(--color-skeleton) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer var(--skeleton-duration) ease-in-out infinite;
  border-radius: var(--radius-card);
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background-image: none;
  }
}
```

Create `frontend/src/components/ui/Skeleton.tsx`:

```typescript
import './Skeleton.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
  'data-testid'?: string;
}

export default function Skeleton({
  width = '100%',
  height = '20px',
  borderRadius,
  className = '',
  'data-testid': testId,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius }}
      data-testid={testId}
      aria-hidden="true"
    />
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ui/Skeleton.test.tsx`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add frontend/src/components/ui/Skeleton.tsx frontend/src/components/ui/Skeleton.css frontend/src/components/ui/Skeleton.test.tsx
git commit -m "feat: add Skeleton primitive component with shimmer animation"
```

### Task 5: Create RiskTileSkeleton component

**Files:**
- Create: `frontend/src/components/RiskTileSkeleton.tsx`
- Create: `frontend/src/components/RiskTileSkeleton.css`
- Create: `frontend/src/components/RiskTileSkeleton.test.tsx`

**Step 1: Write the test**

Create `frontend/src/components/RiskTileSkeleton.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskTileSkeleton from './RiskTileSkeleton';

describe('RiskTileSkeleton', () => {
  it('renders skeleton placeholders', () => {
    render(<RiskTileSkeleton data-testid="risk-skel" />);
    expect(screen.getByTestId('risk-skel')).toBeInTheDocument();
  });

  it('matches RiskTile min-height (160px)', () => {
    render(<RiskTileSkeleton data-testid="risk-skel" />);
    const el = screen.getByTestId('risk-skel');
    expect(el.className).toContain('risk-tile-skeleton');
    // min-height enforced via CSS class
  });

  it('is hidden from screen readers', () => {
    render(<RiskTileSkeleton data-testid="risk-skel" />);
    const el = screen.getByTestId('risk-skel');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/RiskTileSkeleton.test.tsx`
Expected: FAIL.

**Step 3: Write implementation**

Create `frontend/src/components/RiskTileSkeleton.css`:

```css
.risk-tile-skeleton {
  min-height: 160px;
  padding: var(--space-base);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.risk-tile-skeleton__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

Create `frontend/src/components/RiskTileSkeleton.tsx`:

```typescript
import Skeleton from './ui/Skeleton';
import './RiskTileSkeleton.css';

interface RiskTileSkeletonProps {
  'data-testid'?: string;
}

export default function RiskTileSkeleton({ 'data-testid': testId }: RiskTileSkeletonProps) {
  return (
    <div className="risk-tile-skeleton" aria-hidden="true" data-testid={testId}>
      <div className="risk-tile-skeleton__header">
        <Skeleton width="60%" height="16px" />
        <Skeleton width="48px" height="20px" borderRadius="10px" />
      </div>
      <Skeleton width="64px" height="40px" borderRadius="4px" />
      <Skeleton width="100%" height="6px" borderRadius="3px" />
      <Skeleton width="80%" height="14px" />
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/RiskTileSkeleton.test.tsx`
Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add frontend/src/components/RiskTileSkeleton.tsx frontend/src/components/RiskTileSkeleton.css frontend/src/components/RiskTileSkeleton.test.tsx
git commit -m "feat: add RiskTileSkeleton matching RiskTile dimensions"
```

### Task 6: Create DossierSkeleton composite

**Files:**
- Create: `frontend/src/components/DossierSkeleton.tsx`
- Create: `frontend/src/components/DossierSkeleton.css`
- Create: `frontend/src/components/DossierSkeleton.test.tsx`

**Step 1: Write the test**

Create `frontend/src/components/DossierSkeleton.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DossierSkeleton from './DossierSkeleton';

describe('DossierSkeleton', () => {
  it('renders address skeleton when address provided', () => {
    render(<DossierSkeleton address="Damrak 1, Amsterdam" />);
    expect(screen.getByText('Damrak 1, Amsterdam')).toBeInTheDocument();
  });

  it('renders 4 risk tile skeletons', () => {
    render(<DossierSkeleton address="Test" />);
    const skeletons = screen.getAllByTestId(/risk-tile-skeleton/);
    expect(skeletons).toHaveLength(4);
  });

  it('renders stats and tier-b skeleton sections', () => {
    render(<DossierSkeleton address="Test" />);
    expect(screen.getByTestId('stats-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('tierb-skeleton')).toBeInTheDocument();
  });

  it('does not render 3D section skeleton', () => {
    render(<DossierSkeleton address="Test" />);
    expect(screen.queryByTestId('3d-skeleton')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/DossierSkeleton.test.tsx`
Expected: FAIL.

**Step 3: Write implementation**

Create `frontend/src/components/DossierSkeleton.css`:

```css
.dossier-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-base);
}

.dossier-skeleton__address {
  font: var(--type-h2);
  color: var(--color-text);
}

.dossier-skeleton__summary {
  display: flex;
  gap: var(--space-sm);
}

.dossier-skeleton__risk-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
}

@media (max-width: 374px) {
  .dossier-skeleton__risk-grid {
    grid-template-columns: 1fr;
  }
}

.dossier-skeleton__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-base);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}
```

Create `frontend/src/components/DossierSkeleton.tsx`:

```typescript
import Skeleton from './ui/Skeleton';
import RiskTileSkeleton from './RiskTileSkeleton';
import './DossierSkeleton.css';

interface DossierSkeletonProps {
  address: string;
}

export default function DossierSkeleton({ address }: DossierSkeletonProps) {
  return (
    <div className="dossier-skeleton">
      {/* Address header — real text, we already have it */}
      <h2 className="dossier-skeleton__address">{address}</h2>

      {/* Summary strip skeleton — 4 pill placeholders */}
      <div className="dossier-skeleton__summary">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} width="72px" height="28px" borderRadius="14px" />
        ))}
      </div>

      {/* Risk tiles skeleton — 2x2 grid */}
      <div className="dossier-skeleton__risk-grid">
        {[1, 2, 3, 4].map(i => (
          <RiskTileSkeleton key={i} data-testid={`risk-tile-skeleton-${i}`} />
        ))}
      </div>

      {/* Stats section skeleton */}
      <div className="dossier-skeleton__section" data-testid="stats-skeleton">
        <Skeleton width="50%" height="18px" />
        <Skeleton width="100%" height="12px" />
        <Skeleton width="100%" height="12px" />
        <Skeleton width="80%" height="12px" />
        <Skeleton width="100%" height="32px" borderRadius="4px" />
      </div>

      {/* Tier B section skeleton */}
      <div className="dossier-skeleton__section" data-testid="tierb-skeleton">
        <Skeleton width="40%" height="18px" />
        <Skeleton width="100%" height="12px" />
        <Skeleton width="60%" height="12px" />
      </div>

      {/* NO 3D section skeleton — 3D is opt-in per principle Section 7 */}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/DossierSkeleton.test.tsx`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add frontend/src/components/DossierSkeleton.tsx frontend/src/components/DossierSkeleton.css frontend/src/components/DossierSkeleton.test.tsx
git commit -m "feat: add DossierSkeleton composite with risk grid and section placeholders"
```

### Task 7: Wire skeleton into App.tsx, remove LoadingScreen

This is the highest-risk task. It replaces the full-screen loading blocker with progressive skeleton reveal.

**Files:**
- Modify: `frontend/src/App.tsx` — remove LoadingScreen import/state/render, add DossierSkeleton
- Modify: `frontend/src/App.test.tsx` — update loading assertions
- Delete: `frontend/src/components/LoadingScreen.tsx`
- Delete: `frontend/src/components/LoadingScreen.css`
- Delete: `frontend/src/components/LoadingScreen.test.tsx`
- Delete: `frontend/src/components/BuildingAnimation.tsx`
- Delete: `frontend/src/components/BuildingAnimation.css`
- Delete: `frontend/src/components/BuildingAnimation.test.tsx`

**Step 1: Modify App.tsx**

In `frontend/src/App.tsx`:

**1a. Remove LoadingScreen import (line 15):**
```typescript
// DELETE this line:
import LoadingScreen from './components/LoadingScreen';

// ADD this line in its place:
import DossierSkeleton from './components/DossierSkeleton';
```

**1b. Remove loading screen state variables (lines 166-169, 172):**
```typescript
// DELETE these 4 lines:
const [showLoadingScreen, setShowLoadingScreen] = useState(false);
const [loadingAddress, setLoadingAddress] = useState<string | null>(null);
const [loadingProgressText, setLoadingProgressText] = useState<string | undefined>(undefined);
const [loadingTone, setLoadingTone] = useState<'normal' | 'warning'>('normal');

// DELETE this line:
const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**1c. Remove loading timeout cleanup useEffect (lines 189-193):**
```typescript
// DELETE this block:
useEffect(() => {
  return () => {
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
  };
}, []);
```

**1d. Remove loading helper callbacks (lines 200-221):**
```typescript
// DELETE these three callbacks entirely:
// setLoadingStage (lines 200-203)
// showLoadingWarning (lines 205-210)
// finishLoadingFlow (lines 212-221)
```

**1e. Simplify handleAddressSelect (lines 306-339):**

Replace the loading screen orchestration with immediate skeleton reveal:

```typescript
// In handleAddressSelect, REPLACE lines 307-339 with:
setLoading(true);
setError(null);
setBuildingResponse(null);
setNeighborhood3D(null);
setNeighborhood3DLoading(false);
setSurroundingLoading(false);
setRiskCards(null);
setRiskComparisons(null);
setRiskLoading(false);
setRiskError(false);
setNeighborhoodStats(null);
setNeighborhoodStatsLoading(false);
setNeighborhoodStatsError(false);
setTierBData(null);
setTierBLoading(false);
setTierBError(false);
setSunlight(null);
setSunlightUnavailable(false);
setShadowSnapshots(null);
setViewingQuestions(null);
setActiveDetailCategory(null);
setCheckedQuestions(new Set());
const requestId = ++neighborhood3DRequestId.current;
```

Also remove all `setLoadingStage(...)` and `showLoadingWarning(...)` calls in the async blocks below (lines ~352, 364, etc.). These are now no-ops since the callbacks are deleted.

**1f. Replace render section (lines 670-831):**

Replace the `showLoadingScreen ? <LoadingScreen .../> : <...>` conditional with:

```typescript
{/* Remove the showLoadingScreen ternary entirely. Always show the dossier content: */}
<AddressSearch onSelect={handleAddressSelect} />

{error && <p className="app__error">{error}</p>}

{/* Show skeleton when loading is true but no data yet */}
{loading && !buildingResponse && address && (
  <DossierSkeleton address={address?.display_name ?? ''} />
)}

{/* Show real content when data arrives (existing code, unchanged) */}
{address && buildingResponse && (
  <AddressHeader ... />
)}
{/* ... rest of the dossier sections as-is ... */}
```

The key change: instead of `showLoadingScreen ? <LoadingScreen/> : <Content/>`, it's now `{loading && !buildingResponse && <DossierSkeleton/>}` followed by the real content sections which render when their data arrives.

**1g. Set screen to dossier immediately in handleAddressSelect:**

The line `setActiveScreen('dossier')` (currently line 345) should move BEFORE the `lookupAddress` call, right after the state resets. This way the skeleton appears immediately.

```typescript
// Move this line to AFTER the state resets, BEFORE the try block:
setActiveScreen('dossier');
setActiveTab('search');

try {
  const resolved = await lookupAddress(suggestion.id);
  ...
```

**Step 2: Update App.test.tsx**

In `frontend/src/App.test.tsx`, find any test that asserts on `LoadingScreen` or `showLoadingScreen` and update:

- Replace assertions on loading screen text with assertions on skeleton presence
- Add test: "shows DossierSkeleton during address loading"
- Add test: "skeleton disappears when building data arrives"

```typescript
it('shows skeleton during loading', async () => {
  // Mock API to delay response
  // Trigger address select
  // Assert DossierSkeleton is in the DOM
  // Assert RiskTileSkeleton elements exist
});
```

**Step 3: Delete LoadingScreen and BuildingAnimation files**

```bash
git rm frontend/src/components/LoadingScreen.tsx
git rm frontend/src/components/LoadingScreen.css
git rm frontend/src/components/LoadingScreen.test.tsx
git rm frontend/src/components/BuildingAnimation.tsx
git rm frontend/src/components/BuildingAnimation.css
git rm frontend/src/components/BuildingAnimation.test.tsx
```

**Step 4: Run all tests**

Run: `cd frontend && npx vitest run`
Expected: Tests pass. Count should be >= 347 (we added ~11 new tests in Tasks 2-6, removed ~6 from LoadingScreen/BuildingAnimation, net positive).

**Step 5: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no unused variable errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace LoadingScreen with progressive DossierSkeleton reveal

Removes the full-screen loading blocker (LoadingScreen + BuildingAnimation).
Shows DossierSkeleton immediately when address is selected. Each dossier
section replaces its skeleton independently as data arrives. 3D section
has no skeleton (opt-in per principle Section 7)."
```

---

## Tier 1C: Touch Target Compliance

### Task 8: Create usePressable hook

**Files:**
- Create: `frontend/src/hooks/usePressable.ts`
- Create: `frontend/src/hooks/usePressable.test.ts`

**Step 1: Write the test**

Create `frontend/src/hooks/usePressable.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { usePressable } from './usePressable';

describe('usePressable', () => {
  it('adds pressed class on touchstart', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    renderHook(() => {
      const ref = useRef(div);
      usePressable(ref);
      return ref;
    });

    div.dispatchEvent(new Event('touchstart'));
    expect(div.classList.contains('pressed')).toBe(true);

    document.body.removeChild(div);
  });

  it('removes pressed class on touchend', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    renderHook(() => {
      const ref = useRef(div);
      usePressable(ref);
      return ref;
    });

    div.dispatchEvent(new Event('touchstart'));
    div.dispatchEvent(new Event('touchend'));
    expect(div.classList.contains('pressed')).toBe(false);

    document.body.removeChild(div);
  });

  it('removes pressed class on touchcancel', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    renderHook(() => {
      const ref = useRef(div);
      usePressable(ref);
      return ref;
    });

    div.dispatchEvent(new Event('touchstart'));
    div.dispatchEvent(new Event('touchcancel'));
    expect(div.classList.contains('pressed')).toBe(false);

    document.body.removeChild(div);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/usePressable.test.ts`
Expected: FAIL.

**Step 3: Write implementation**

Create `frontend/src/hooks/usePressable.ts`:

```typescript
import { useEffect, type RefObject } from 'react';

/**
 * Adds touch-based press states to an element.
 * Uses touchstart/touchend/touchcancel instead of CSS :active
 * because iOS Safari deactivates :active on 1px finger movement.
 */
export function usePressable(ref: RefObject<HTMLElement | null>) {
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

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/usePressable.test.ts`
Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add frontend/src/hooks/usePressable.ts frontend/src/hooks/usePressable.test.ts
git commit -m "feat: add usePressable hook for iOS-safe touch press states"
```

### Task 9: Create haptic utility

**Files:**
- Create: `frontend/src/utils/haptic.ts`
- Create: `frontend/src/utils/haptic.test.ts`

**Step 1: Write the test**

Create `frontend/src/utils/haptic.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { haptic } from './haptic';

describe('haptic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls navigator.vibrate when available', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, configurable: true });

    haptic();
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it('accepts custom duration', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, configurable: true });

    haptic(20);
    expect(vibrateMock).toHaveBeenCalledWith(20);
  });

  it('does not throw when navigator.vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });
    expect(() => haptic()).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/haptic.test.ts`
Expected: FAIL.

**Step 3: Write implementation**

Create `frontend/src/utils/haptic.ts`:

```typescript
/**
 * Trigger a micro haptic pulse. Fails silently on unsupported devices.
 * Use only for semantic moments: shortlist add, risk tile open,
 * checklist toggle, export tap. NOT for navigation or scroll.
 */
export function haptic(ms = 10): void {
  navigator?.vibrate?.(ms);
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/haptic.test.ts`
Expected: PASS (3 tests).

**Step 5: Commit**

```bash
git add frontend/src/utils/haptic.ts frontend/src/utils/haptic.test.ts
git commit -m "feat: add haptic feedback utility with silent fallback"
```

### Task 10: Add pressable CSS and fix touch targets

**Files:**
- Modify: `frontend/src/styles/tokens.css` — add pressed surface color token
- Create: `frontend/src/styles/pressable.css` — pressable and tap-target utility classes
- Modify: `frontend/src/components/TopBar.tsx` — fix settings button to 44px
- Modify: `frontend/src/components/TopBar.css` — update touch target sizes
- Modify: `frontend/src/components/RiskDetailView.tsx` — fix back button to 44px
- Modify: `frontend/src/components/RiskDetailView.css` — update
- Modify: `frontend/src/components/ViewingChecklist.tsx` — full-row tap surface
- Modify: `frontend/src/components/ViewingChecklist.css` — 48px row height
- Modify: `frontend/src/components/RiskTilesGrid.css` — verify 12px gap (already var(--space-md) = 12px, confirm)

**Step 1: Add pressed surface token**

In `frontend/src/styles/tokens.css`, in the surfaces section, add:

```css
  --color-surface-pressed: rgba(0, 0, 0, 0.04);
```

In `[data-theme="dark"]` section:
```css
  --color-surface-pressed: rgba(255, 255, 255, 0.06);
```

**Step 2: Create pressable.css**

Create `frontend/src/styles/pressable.css`:

```css
/* Press state — applied by usePressable hook via .pressed class */
.pressable {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 100ms cubic-bezier(0.2, 0, 0.2, 1);
  will-change: transform;
  cursor: pointer;
}

.pressable.pressed {
  transform: scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .pressable.pressed {
    transform: none;
    background-color: var(--color-surface-pressed);
  }
}

/* Tap target expansion for icon buttons */
.tap-target-44 {
  position: relative;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

Import this in `frontend/src/index.css` after the tokens import:
```css
@import './styles/pressable.css';
```

**Step 3: Fix TopBar settings button**

In `frontend/src/components/TopBar.tsx`, add `tap-target-44` class to the settings button. In `TopBar.css`, ensure the button is at least 44x44px.

**Step 4: Fix RiskDetailView back button**

In `frontend/src/components/RiskDetailView.tsx` and its CSS, increase the back button to 44x44px using the `tap-target-44` class.

**Step 5: Fix ViewingChecklist rows**

In `frontend/src/components/ViewingChecklist.tsx`, ensure each `<label>` row has `min-height: 48px` and the entire row is tappable (not just the checkbox).

In `ViewingChecklist.css`:
```css
.viewing-checklist__item {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
  cursor: pointer;
}
```

**Step 6: Verify grid gap**

Confirm `frontend/src/components/RiskTilesGrid.css` uses `gap: var(--space-md)` which is 12px. No change needed.

**Step 7: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

**Step 8: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: fix touch targets to 44px minimum, add pressable CSS utilities

- TopBar settings button: 36px -> 44px
- RiskDetailView back button: 36px -> 44px
- ViewingChecklist rows: full-row 48px tap surface
- Add .pressable and .tap-target-44 utility classes
- Add --color-surface-pressed token for reduced-motion fallback"
```

---

## Tier 1 Quality Gate

### Task 11: Tier 1 verification

**Step 1: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: >= 347 tests pass.

**Step 2: Run build**

```bash
cd frontend && npm run build
```

Expected: Clean build, no TypeScript errors.

**Step 3: Run backend tests (ensure no regressions)**

```bash
cd backend && python -m pytest -x -m "not live" -q
```

Expected: >= 288 tests pass.

**Step 4: Run ruff**

```bash
cd backend && ruff check app/ tests/
```

Expected: No errors.

**Step 5: Manual verification checklist**

- [ ] Start dev server (`cd frontend && npm run dev`)
- [ ] Search for an address
- [ ] Verify: skeleton appears immediately, no full-screen blocker
- [ ] Verify: risk tile skeletons match loaded tile dimensions
- [ ] Verify: data sections fill in progressively
- [ ] Verify: 3D section has no skeleton (loads on scroll)
- [ ] Verify: settings button is at least 44px tap area
- [ ] Verify: back button in risk detail is at least 44px
- [ ] Verify: checklist rows respond to full-row tap

---

## Tier 2A: Press States on Interactive Elements

### Task 12: Apply usePressable to Tier A elements

**Files:**
- Modify: `frontend/src/components/TabBar.tsx` — add pressable to tab buttons
- Modify: `frontend/src/components/ActionBar.tsx` — add pressable to action buttons
- Modify: `frontend/src/components/ViewingChecklist.tsx` — add pressable to checklist rows
- Modify: `frontend/src/components/AddressSearch.tsx` — add pressable to recent search items
- Modify: corresponding test files to verify press behavior

**Step 1: Apply usePressable pattern**

For each component above, the pattern is:
1. Import `usePressable` and `useRef`
2. Create a ref for the pressable element
3. Call `usePressable(ref)`
4. Add `className="pressable"` and `ref={ref}` to the element

For components with multiple pressable children (e.g., TabBar with 3 tabs), use a ref callback pattern or apply the `pressable` CSS class and rely on CSS `:active` as fallback (since these are simple press-and-release elements, the iOS finger-drift issue is less severe on large tab buttons).

Simpler approach for multi-element components: just add `className="pressable"` to the buttons. The CSS `:active` works well enough for 56px tab buttons where finger drift is rare due to the large target.

**Step 2: Add haptic calls to key moments**

In `frontend/src/App.tsx`:
- Import `haptic` from `../utils/haptic`
- Add `haptic()` call inside `handleBookmark` (shortlist add)
- Add `haptic()` call inside `setActiveDetailCategory` handler (risk tile open)
- Add `haptic()` call inside `handleToggleQuestion` (checklist toggle)
- Add `haptic()` call inside export button handler

**Step 3: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

**Step 4: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add press states to tab bar, action bar, checklist rows

Apply .pressable class for scale(0.97) feedback on touch.
Add haptic micro-pulse on shortlist add, risk tile open,
checklist toggle, and export tap."
```

### Task 13: Apply Framer Motion whileTap to Tier B elements (risk tiles)

**Files:**
- Modify: `frontend/src/components/RiskTile.tsx` — wrap in motion.button with whileTap
- Modify: `frontend/src/components/RiskTile.test.tsx` — verify tap behavior with mock

**Step 1: Modify RiskTile.tsx**

Replace the `<button>` with `<motion.button>`:

```typescript
import { motion } from 'framer-motion';
// ... existing imports

export default function RiskTile({ category, labelKey, score, severity, summary, onTap }: RiskTileProps) {
  const { t } = useTranslation();

  return (
    <motion.button
      className="risk-tile"
      onClick={onTap}
      data-testid={`risk-tile-${category}`}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* ... existing content unchanged ... */}
    </motion.button>
  );
}
```

**Step 2: Verify tests pass**

Run: `cd frontend && npx vitest run src/components/RiskTile.test.tsx`
Expected: PASS — the framer-motion mock in setup.ts renders motion.button as a plain button.

**Step 3: Run full tests + build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: All pass.

**Step 4: Commit**

```bash
git add frontend/src/components/RiskTile.tsx frontend/src/components/RiskTile.test.tsx
git commit -m "feat: add spring press state to risk tiles via Framer Motion whileTap"
```

---

## Tier 2B: Shared Element Transition (Risk Tile -> Detail)

### Task 14: Add layoutId to RiskTile and RiskDetailView

This is the highest-risk task in the entire plan. Take it step by step.

**Files:**
- Modify: `frontend/src/components/RiskTile.tsx` — add layoutId prop
- Modify: `frontend/src/components/RiskTilesGrid.tsx` — pass layoutId
- Modify: `frontend/src/components/RiskDetailView.tsx` — add layoutId, wrap in motion.div
- Modify: `frontend/src/App.tsx` — wrap risk section in LayoutGroup + AnimatePresence
- Create: `frontend/src/hooks/useAnimationPerformance.ts`
- Create: `frontend/src/hooks/useAnimationPerformance.test.ts`

**Step 1: Create useAnimationPerformance hook**

Create `frontend/src/hooks/useAnimationPerformance.ts`:

```typescript
import { useRef, useCallback } from 'react';

/**
 * Monitors frame drops during animations.
 * If >3 frames exceed 32ms, flags the session as "reduced animation."
 */
export function useAnimationPerformance() {
  const isReducedRef = useRef(false);
  const frameTimesRef = useRef<number[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const startMonitoring = useCallback(() => {
    if (isReducedRef.current) return; // Already flagged
    frameTimesRef.current = [];
    let lastTime = performance.now();

    const measure = () => {
      const now = performance.now();
      frameTimesRef.current.push(now - lastTime);
      lastTime = now;
      rafIdRef.current = requestAnimationFrame(measure);
    };
    rafIdRef.current = requestAnimationFrame(measure);
  }, []);

  const stopMonitoring = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const droppedFrames = frameTimesRef.current.filter(t => t > 32).length;
    if (droppedFrames > 3) {
      isReducedRef.current = true;
    }
    frameTimesRef.current = [];
  }, []);

  return {
    isReduced: isReducedRef,
    startMonitoring,
    stopMonitoring,
  };
}
```

Create `frontend/src/hooks/useAnimationPerformance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimationPerformance } from './useAnimationPerformance';

describe('useAnimationPerformance', () => {
  it('starts with isReduced false', () => {
    const { result } = renderHook(() => useAnimationPerformance());
    expect(result.current.isReduced.current).toBe(false);
  });

  it('exports start and stop monitoring functions', () => {
    const { result } = renderHook(() => useAnimationPerformance());
    expect(typeof result.current.startMonitoring).toBe('function');
    expect(typeof result.current.stopMonitoring).toBe('function');
  });

  it('does not throw on start/stop cycle', () => {
    const { result } = renderHook(() => useAnimationPerformance());
    act(() => {
      result.current.startMonitoring();
      result.current.stopMonitoring();
    });
    expect(result.current.isReduced.current).toBe(false);
  });
});
```

**Step 2: Add layoutId to RiskTile**

In `frontend/src/components/RiskTile.tsx`, the `motion.button` from Task 13 now also gets a `layoutId`:

```typescript
<motion.button
  className="risk-tile"
  onClick={onTap}
  data-testid={`risk-tile-${category}`}
  layoutId={`risk-tile-${category}`}
  whileTap={{ scale: 0.97 }}
  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
>
```

**Step 3: Wrap RiskDetailView header in matching layoutId**

In `frontend/src/components/RiskDetailView.tsx`, wrap the header section in a `motion.div` with the same `layoutId`:

```typescript
import { motion } from 'framer-motion';
import { SPRING_EXPAND } from '../config/springs';

// In the render, wrap the header card:
<motion.div
  layoutId={`risk-tile-${category}`}
  transition={SPRING_EXPAND}
  className="risk-detail__header-card"
>
  {/* score, severity badge, title */}
</motion.div>
```

**Step 4: Wrap risk section in App.tsx with LayoutGroup + AnimatePresence**

In `frontend/src/App.tsx`, import and wrap:

```typescript
import { LayoutGroup, AnimatePresence } from 'framer-motion';

// In the render, around the risk tiles + detail view:
<LayoutGroup>
  {/* Risk tiles grid */}
  {(riskLoading || riskCards || riskError) && !activeDetailCategory && (
    <>
      <h3 className="app__section-label">{t('dossier.riskAssessment')}</h3>
      <RiskTilesGrid ... />
    </>
  )}

  {/* Risk detail — replaces grid content */}
  <AnimatePresence>
    {activeDetailCategory && (() => {
      const detail = getDetailProps(activeDetailCategory);
      if (!detail) return null;
      return (
        <RiskDetailView
          key={activeDetailCategory}
          ...
        />
      );
    })()}
  </AnimatePresence>
</LayoutGroup>
```

**Step 5: Add isTransitioning guard**

In `frontend/src/App.tsx`, add a ref to prevent taps during transition:

```typescript
const isTransitioning = useRef(false);

// In the risk tile tap handler:
const handleRiskTileTap = useCallback((category: string) => {
  if (isTransitioning.current) return;
  haptic();
  setActiveDetailCategory(category);
}, []);
```

**Step 6: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass.

**Step 7: Run build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add shared element transition for risk tile -> detail view

Uses Framer Motion layoutId to morph risk tile into detail header.
Includes AnimatePresence for enter/exit animations, LayoutGroup for
coordination, isTransitioning guard to prevent mid-animation taps,
and useAnimationPerformance hook for frame-drop fallback detection."
```

---

## Tier 2 Quality Gate

### Task 15: Tier 2 verification

**Step 1: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: >= 347 tests (should be ~360+ with new tests from Tasks 2-14).

**Step 2: Run build**

```bash
cd frontend && npm run build
```

Expected: Clean build. Check vendor-react chunk includes framer-motion.

**Step 3: Run backend tests**

```bash
cd backend && python -m pytest -x -m "not live" -q
```

Expected: >= 288 tests pass (no backend changes in this plan).

**Step 4: Bundle size check**

```bash
cd frontend && npm run build 2>&1 | grep -i "gzip"
```

Expected: Total gzipped JS < 330KB (was ~291KB + ~33KB framer-motion).

**Step 5: Manual verification checklist**

- [ ] Risk tile: scales to 0.97 on press (touch device or DevTools mobile)
- [ ] Risk tile -> detail: shared element morph animation plays
- [ ] Detail -> grid: reverse morph plays, other tiles fade in
- [ ] Tab bar buttons: scale on press
- [ ] Checklist rows: full row responds to tap, haptic on toggle
- [ ] Shortlist add: haptic pulse
- [ ] Export button: haptic pulse
- [ ] `prefers-reduced-motion`: all animations disabled, background color fallback
- [ ] No layout shift during skeleton -> loaded transitions

---

## Summary

| Task | Component | Type | Tests added |
|------|-----------|------|-------------|
| 1 | framer-motion install | Infra | 0 (verification only) |
| 2 | Spring constants | Config | 4 |
| 3 | Skeleton tokens | CSS | 0 |
| 4 | Skeleton primitive | Component | 4 |
| 5 | RiskTileSkeleton | Component | 3 |
| 6 | DossierSkeleton | Component | 4 |
| 7 | App.tsx skeleton wiring | Integration | ~2 new, ~6 deleted |
| 8 | usePressable hook | Hook | 3 |
| 9 | haptic utility | Utility | 3 |
| 10 | Touch target fixes | CSS/Components | 0 |
| 11 | Tier 1 quality gate | Verification | 0 |
| 12 | Press states (Tier A) | Components | 0 |
| 13 | Risk tile whileTap | Component | 0 |
| 14 | Shared element transition | Architecture | 3 |
| 15 | Tier 2 quality gate | Verification | 0 |

**Net new tests:** ~20+ (well above maintaining 347 baseline)
**Bundle increase:** ~33KB gzipped (framer-motion)
**Files deleted:** 6 (LoadingScreen, BuildingAnimation + their CSS + tests)
**Files created:** ~12 (springs, skeleton, hooks, utilities)
**Files modified:** ~10 (App.tsx, RiskTile, RiskDetailView, TopBar, ViewingChecklist, tokens.css, etc.)
