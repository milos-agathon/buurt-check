# 3D Viewer Contrast Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 confirmed contrast issues in the NeighborhoodViewer3D component, prioritized by adversarial review severity.

**Architecture:** Pure constant/token changes in one component file + one CSS file. No structural changes. Neighbor building material darkened + made more opaque. Target emissive intensity made theme-aware. Source attribution text upgraded to AA-passing token. Tile loading gets onerror fallback.

**Tech Stack:** Three.js MeshStandardMaterial constants, CSS custom properties, Puppeteer visual verification.

---

## Context from Adversarial Review

The review (Claude + Codex GPT-5.3) confirmed all 11 contrast ratios are mathematically correct but identified mitigating factors:
- **Emissive glow** on target building adds ~15% brightness (understated by raw hex comparison)
- **Basemap tiles** cover most ground (bare ground is worst-case fallback only)
- **PBR lighting + cast shadows** provide edge definition not captured by flat hex ratios
- **Theme toggle** unmounts viewer → re-initializes with correct theme on return

Key finding: **darkening the ground plane hurts target contrast** (teal `#2EC4B6` is mid-luminance ~0.37; darker ground approaches it from above). Ground plane stays unchanged.

## Proposed Color Changes (verified computationally)

| Element | Before | After | Contrast vs Ground | Pass? |
|---------|--------|-------|--------------------|-------|
| **Neighbor (L) blended** | `#B4C0CE` @ 0.70 → `#C0CAD6` | `#556E85` @ 0.90 → `#62798F` | 1.28:1 → **3.49:1** | FAIL → PASS |
| **Source text (L)** | `--color-text-tertiary` (#8A9BB0) | `--color-text-secondary` (#637892) | 2.84:1 → **4.53:1** | FAIL → AA |
| **Source text (D)** | `--color-text-tertiary` (#637892) | `--color-text-secondary` (#B4C0CE) | 4.13:1 → **10.14:1** | AA-large → AAA |
| **Target emissive (L)** | 0.15 | 0.40 | Perceptual boost (hex unchanged) | — |
| **Target emissive (D)** | 0.15 | 0.20 | Better target-vs-neighbor pop | — |

## Accepted Tradeoffs

- Target hex `#2EC4B6` fundamentally cannot reach 3:1 against any light gray (mid-luminance). Emissive glow + shadows + hue differentiation are the primary contrast mechanisms. This is confirmed by both reviewers as "partially visible."
- Transparent neighbors (0.90) still cast fully opaque shadows — minor visual mismatch. Three.js doesn't support opacity-proportional shadows without custom shaders. At 0.90 the mismatch is negligible.
- Ground/scene boundary stays at ~1.16:1 — cosmetic, mitigated by basemap tiles covering the visible area.

---

### Task 1: Fix source text contrast (CSS)

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.css:54`

**Step 1: Change source text token**

```css
/* Line 54 — before: */
color: var(--color-text-tertiary);

/* Line 54 — after: */
color: var(--color-text-secondary);
```

This swaps `#8A9BB0` (2.84:1) for `#637892` (4.53:1) in light mode and `#637892` (4.13:1) for `#B4C0CE` (10.14:1) in dark mode. Both pass WCAG AA for 11px text.

> **Note:** 4.53:1 at 11px (`--type-micro`) barely clears the 4.5:1 AA threshold with minimal headroom. If rendering variation causes concern, bump font to `--type-caption` (12px) for additional margin. Acceptable as-is since the text is attribution metadata, not primary content.

**Step 2: Run frontend tests**

Run: `cd frontend && npm run test -- --run`
Expected: All 448+ tests pass (no CSS token tests exist — this is a safe change).

**Step 3: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.css
git commit -m "fix: upgrade 3D viewer source text to AA-passing contrast token

Swap --color-text-tertiary (2.84:1) for --color-text-secondary (4.53:1)
on the source attribution text. Passes WCAG AA in both light and dark modes."
```

---

### Task 2: Darken neighbor buildings in light mode

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx:35,37`

**Step 1: Update neighbor constants**

```typescript
// Lines 35,37 — before:
const NEIGHBOR_COLOR_LIGHT = 0xB4C0CE;
const NEIGHBOR_OPACITY_LIGHT = 0.70;

// Lines 35,37 — after:
const NEIGHBOR_COLOR_LIGHT = 0x556E85;
const NEIGHBOR_OPACITY_LIGHT = 0.90;
```

Rationale: `#556E85` at 90% opacity blends to `#62798F` on ground `#DDE3EA`, giving 3.49:1 contrast (was 1.28:1). Stays in the blue-gray family between `--slate-200` and `--slate-500`. Dark mode values (`0x8A9BB0` at 0.65) are unchanged — they already pass at 3.04:1.

> **Note:** 3.49:1 is the alpha-over-ground simplification. Real rendered contrast differs due to PBR lighting, shadows, and basemap texture. This number is directional, not exact.

**Step 2: Add material regression test**

Add to `frontend/src/components/NeighborhoodViewer3D.test.tsx`:

```typescript
it('creates neighbor material with contrast-passing color and opacity', () => {
  // Track MeshStandardMaterial constructor calls
  const { MeshStandardMaterial } = await import('three');
  renderViewer();

  // Find the call that created the neighbor material (transparent, not emissive)
  const calls = (MeshStandardMaterial as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const neighborCall = calls.find(
    (args: any[]) => args[0]?.transparent === true && args[0]?.opacity !== undefined
  );
  expect(neighborCall).toBeDefined();
  expect(neighborCall![0].color).toBe(0x556E85);
  expect(neighborCall![0].opacity).toBe(0.90);
});
```

**Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run -t "neighbor material"`
Expected: FAIL — current values are `0xB4C0CE` and `0.70`.

**Step 4: Update the constants (Step 1 above)**

**Step 5: Run tests**

Run: `cd frontend && npm run test -- --run`
Expected: All tests pass including the new assertion.

**Step 6: Run TypeScript build check**

Run: `cd frontend && npm run build`
Expected: Build succeeds. No type changes involved.

**Step 7: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx frontend/src/components/NeighborhoodViewer3D.test.tsx
git commit -m "fix: darken neighbor buildings in light mode for 3:1 contrast

Change NEIGHBOR_COLOR_LIGHT from 0xB4C0CE to 0x556E85 and increase
opacity from 0.70 to 0.90. Blended contrast against ground improves
from 1.28:1 to 3.49:1 (WCAG 1.4.11 graphical object threshold).
Add material regression test to prevent future contrast degradation."
```

---

### Task 3: Make target emissive intensity theme-aware

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx:507`

**Step 1: Add theme-aware emissive intensity**

The target building material is created at line 504-509 inside the buildings effect. The `isDarkMode` variable is already in scope (line 454).

```typescript
// Line 504-509 — before:
const mat = new MeshStandardMaterial({
  color: isDarkMode ? TARGET_COLOR : TARGET_COLOR,
  emissive: 0x57D4C8,
  emissiveIntensity: 0.15,
  side: DoubleSide,
});

// After:
const mat = new MeshStandardMaterial({
  color: TARGET_COLOR,
  emissive: 0x57D4C8,
  emissiveIntensity: isDarkMode ? 0.20 : 0.40,
  side: DoubleSide,
});
```

Changes:
- Light mode emissive: 0.15 → 0.40 (strong self-glow against bright ambient)
- Dark mode emissive: 0.15 → 0.20 (subtle boost for target-vs-neighbor differentiation)
- Also simplifies the redundant `isDarkMode ? TARGET_COLOR : TARGET_COLOR` to just `TARGET_COLOR`

**Step 2: Add emissive regression test**

Add to `frontend/src/components/NeighborhoodViewer3D.test.tsx`:

```typescript
it('creates target material with theme-aware emissive intensity', () => {
  const { MeshStandardMaterial } = await import('three');
  renderViewer();

  // Find the call that created the target material (has emissive, not transparent)
  const calls = (MeshStandardMaterial as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const targetCall = calls.find(
    (args: any[]) => args[0]?.emissive !== undefined && !args[0]?.transparent
  );
  expect(targetCall).toBeDefined();
  expect(targetCall![0].color).toBe(0x2EC4B6);
  expect(targetCall![0].emissiveIntensity).toBe(0.40); // light mode (default in jsdom)
});
```

> The test runs in jsdom which has no `data-theme` attribute → `isDarkMode` is `false` → light mode path. This asserts the 0.40 emissive for light mode. Dark mode (0.20) can be verified by setting `document.documentElement.setAttribute('data-theme', 'dark')` before render, but is optional.

**Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run -t "emissive"`
Expected: FAIL — current value is `0.15`.

**Step 4: Apply the material change (Step 1 above)**

**Step 5: Run tests**

Run: `cd frontend && npm run test -- --run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx frontend/src/components/NeighborhoodViewer3D.test.tsx
git commit -m "fix: increase target building emissive for theme-aware contrast

Light mode emissive 0.15 -> 0.40 (stronger glow against bright scene).
Dark mode 0.15 -> 0.20 (better target-vs-neighbor differentiation).
Also simplify redundant ternary on TARGET_COLOR.
Add emissive regression test."
```

---

### Task 4: Add tile image onerror fallback

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx:727` (insert before `img.src = url;`)

**Step 1: Add onerror handler**

Currently the tile `<img>` has `onload` (line 688) but no `onerror`. If PDOK tiles fail, the ground plane is the only visible surface and all building contrast depends on material-vs-ground.

```typescript
// Line 727 — before:
img.src = url;

// After (insert onerror before img.src assignment):
img.onerror = () => {
  if (import.meta.env.DEV) {
    console.warn(`[3D] Basemap tile failed: ${url}`);
  }
};
img.src = url;
```

This is intentionally minimal — no retry logic, no alternative tile source. The bare ground plane is an acceptable fallback (now with better building contrast from Task 2). The warning helps debugging in dev mode.

**Step 2: Run frontend tests**

Run: `cd frontend && npm run test -- --run`
Expected: All tests pass. The onerror handler is a no-op in test (Image mock doesn't fire onerror).

**Step 3: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "fix: add onerror handler for basemap tile loading

Log warning in dev mode when PDOK tile fails to load. Bare ground
plane is the fallback — building contrast now sufficient (Task 2)."
```

---

### Task 5: Visual verification via Puppeteer

**Step 1: Start backend and frontend**

```bash
cd backend && uvicorn app.main:app --port 8000 &
cd frontend && npm run dev
```

**Step 2: Capture light mode 3D viewer**

Navigate Puppeteer to `http://localhost:5173`, set `data-theme="light"`, search "Damrak 1 Amsterdam", select first suggestion, scroll to `.viewer-3d`, take screenshot at 375x812.

Verify:
- Neighbor buildings are clearly darker than basemap/ground (not "invisible")
- Target building shows teal glow distinct from gray neighbors
- Source text below canvas is readable

**Step 3: Capture dark mode 3D viewer**

Set `data-theme="dark"`, reload, repeat address search, scroll to viewer, screenshot.

Verify:
- Target building teal is prominent against dark scene
- Neighbors visible as distinct volumes
- Source text readable

**Step 4: Run full quality gates**

```bash
cd backend && ruff check .
cd backend && pytest -x -q -m "not live"
cd frontend && npm run build
cd frontend && npm run test -- --run
```

Expected: All pass. No regressions.

---

## File Change Summary

| File | Lines Changed | What |
|------|---------------|------|
| `frontend/src/components/NeighborhoodViewer3D.css` | 54 | Source text token swap |
| `frontend/src/components/NeighborhoodViewer3D.tsx` | 35, 37, 504-509, 727 | Neighbor color/opacity, target emissive, tile onerror |
| `frontend/src/components/NeighborhoodViewer3D.test.tsx` | append | Material regression tests (neighbor + emissive) |

Total: 3 files, ~25 lines changed. All changes are constant/token-level — no structural or logic changes.

## Known Pre-existing Issue (Not Addressed)

`isDarkMode` is read from DOM at effect execution time, not reactive to live theme changes. In-place theme toggle while viewing the dossier leaves stale material/emissive values. This is pre-existing behavior — the settings screen unmounts the viewer, so normal user flow re-initializes correctly. Fixing reactivity would require a `MutationObserver` or lifting theme into React state, which is out of scope for this contrast fix.
