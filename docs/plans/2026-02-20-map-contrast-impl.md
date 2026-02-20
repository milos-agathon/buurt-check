# Map Contrast Improvement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve WCAG AA contrast across 2D aerial footprint map and 3D neighborhood viewer in both light and dark modes.

**Architecture:** Pure parameter tuning in 2 files — no new components, no architectural changes. Theme-aware constants for neighbor buildings, basemap filter rebalance, footprint overlay dark mode variant, and shadow lighting rebalance.

**Tech Stack:** Three.js (NeighborhoodViewer3D.tsx), CSS (BuildingFootprintMap.css)

**Design doc:** `docs/plans/2026-02-20-map-contrast-improvement-design.md`

**IMPORTANT — Stale Read Warning:** The design doc's Section 2 lists incorrect "current state" values (it says `standaard` tiles + `brightness(2.2) contrast(1.8)`). The actual file uses `grijs` tiles for both modes + `brightness(0.85) contrast(1.1)` for dark mode. This plan uses the **verified** current values from bash.

---

### Task 1: Theme-Aware Neighbor Building Constants

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx:34-36,479-484`

**NOTE:** Keep `DoubleSide` on neighbor material — 3DBAG LoD 2.2 has inconsistent face winding
(see `frontend/CLAUDE.md`: "THREE.DoubleSide on all materials (3DBAG winding inconsistent)").
FrontSide would create invisible faces / holes in building geometry.

**Step 1: Replace static neighbor constants with theme-aware values**

At lines 34-36, change:
```tsx
/** Uniform neighbor building color: slate.200 per palette.md */
const NEIGHBOR_COLOR = 0xB4C0CE;
const NEIGHBOR_OPACITY = 0.6;
```
to:
```tsx
/** Theme-aware neighbor building appearance */
const NEIGHBOR_COLOR_LIGHT = 0xB4C0CE;
const NEIGHBOR_COLOR_DARK = 0x8A9BB0;
const NEIGHBOR_OPACITY_LIGHT = 0.70;
const NEIGHBOR_OPACITY_DARK = 0.65;
```

**Step 2: Update neighbor material creation to be theme-aware**

At lines 479-484 (inside the building effect where `isDarkMode` is already available at line 451), change:
```tsx
    const neighborMaterial = new MeshStandardMaterial({
      color: NEIGHBOR_COLOR,
      transparent: true,
      opacity: NEIGHBOR_OPACITY,
      side: DoubleSide,
    });
```
to:
```tsx
    const neighborMaterial = new MeshStandardMaterial({
      color: isDarkMode ? NEIGHBOR_COLOR_DARK : NEIGHBOR_COLOR_LIGHT,
      transparent: true,
      opacity: isDarkMode ? NEIGHBOR_OPACITY_DARK : NEIGHBOR_OPACITY_LIGHT,
      side: DoubleSide,
    });
```

Note: `DoubleSide` is kept — 3DBAG geometry has inconsistent face winding.

**Step 3: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Clean build with no TS errors.

**Step 4: Run existing tests**

Run: `cd frontend && npx vitest run src/components/NeighborhoodViewer3D.test.tsx`
Expected: All existing tests pass (Three.js is fully mocked; constant changes don't affect mock behavior).

**Step 5: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "style: theme-aware neighbor building contrast (opacity + color)"
```

---

### Task 2: Ground Plane Contrast + Shadow Lighting

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx:247-254,271-275,425,623`

**CRITICAL:** `sunLight.intensity` is set in **4 locations**. The init effect (line 254) value gets
overwritten by the summer-noon effect (line 623) and snapshot capture (line 425), both hardcoded
to `0.8`. All locations must be updated for the shadow improvement to take effect.

| Line | Context | Current | Fix |
|------|---------|---------|-----|
| 254 | Init effect | `0.8` | `isDarkMode ? 0.85 : 0.9` |
| 425 | Snapshot capture (sun > horizon) | `0.8` | Read `isDarkMode` from DOM |
| 623 | Summer-noon effect (sun > horizon) | `0.8` | Read `isDarkMode` from DOM |
| 618/427 | Sun below horizon | `0` | Keep (correct) |

These changes span 3 `useEffect`/`useCallback` blocks. The init effect has `isDarkMode` in scope
(line 227). The other two don't — use `document.documentElement.getAttribute('data-theme') === 'dark'`
(same pattern already used at lines 227, 451, 668).

**Step 1: Update hemisphere light intensity (init effect, line ~247)**

Change:
```tsx
    const ambient = new HemisphereLight(
      isDarkMode ? 0x6688aa : 0xb1e1ff,
      isDarkMode ? 0x443311 : 0xb97a20,
      isDarkMode ? 0.4 : 0.5,
    );
```
to:
```tsx
    const ambient = new HemisphereLight(
      isDarkMode ? 0x6688aa : 0xb1e1ff,
      isDarkMode ? 0x443311 : 0xb97a20,
      isDarkMode ? 0.30 : 0.35,
    );
```

**Step 2: Update directional light intensity (init effect, line ~254)**

Change:
```tsx
    const sunLight = new DirectionalLight(0xffffff, 0.8);
```
to:
```tsx
    const sunLight = new DirectionalLight(0xffffff, isDarkMode ? 0.85 : 0.9);
```

**Step 3: Update ground plane material (init effect, line ~271)**

Change:
```tsx
    const groundMat = new MeshStandardMaterial({
      color: isDarkMode ? 0x0D1620 : 0xF0F3F6,
      roughness: 0.95,
      side: DoubleSide,
    });
```
to:
```tsx
    const groundMat = new MeshStandardMaterial({
      color: isDarkMode ? 0x1A2838 : 0xDDE3EA,
      roughness: 0.90,
      side: DoubleSide,
    });
```

**Step 4: Update sunLight.intensity in summer-noon effect (line ~623)**

In the summer-noon `useEffect`, change:
```tsx
    ctx.sunLight.intensity = 0.8;
```
to:
```tsx
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.sunLight.intensity = isDark ? 0.85 : 0.9;
```

**Step 5: Update sunLight.intensity in snapshot capture (line ~425)**

In the `captureSnapshots` callback, change:
```tsx
        ctx.sunLight.intensity = 0.8;
```
to:
```tsx
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.sunLight.intensity = isDark ? 0.85 : 0.9;
```

Note: The `isDark` variable must be declared inside the `if (sunPos.altitude > 0)` block since
it's only needed there. The snapshot restore at line ~441 (`ctx.sunLight.intensity = savedSunIntensity`)
is correct — it restores whatever value was current before the snapshot loop.

**Step 6: Run build + tests**

Run: `cd frontend && npm run build && npx vitest run src/components/NeighborhoodViewer3D.test.tsx`
Expected: Clean build, all tests pass.

**Step 7: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "style: improve 3D shadow contrast via lighting rebalance + ground color"
```

---

### Task 3: Dark Mode Basemap Filter

**Files:**
- Modify: `frontend/src/components/NeighborhoodViewer3D.tsx:693`

**Current state (verified via bash):**
- Line 680: URL hardcoded to `grijs` for both modes
- Line 693: Filter = `'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1)'`

The current filter DARKENS an already near-black inverted tile (brightness 0.85 < 1.0), making the dark basemap nearly invisible. The fix increases brightness and contrast to make streets readable.

**Step 1: Update dark mode canvas filter**

At line 693, change:
```tsx
          c.filter = 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(1.1)';
```
to:
```tsx
          c.filter = 'invert(1) hue-rotate(180deg) brightness(1.8) contrast(1.5) saturate(1.2)';
```

**Step 2: Run build + tests**

Run: `cd frontend && npm run build && npx vitest run src/components/NeighborhoodViewer3D.test.tsx`
Expected: Clean build, all tests pass.

**Step 3: Commit**

```bash
git add frontend/src/components/NeighborhoodViewer3D.tsx
git commit -m "style: improve dark mode basemap readability via filter rebalance"
```

---

### Task 4: 2D Footprint Overlay Dark Mode Variant

**Files:**
- Modify: `frontend/src/components/BuildingFootprintMap.css:37-42`

**Step 1: Update base (light mode) values**

At lines 37-42, change:
```css
.footprint-map__shape {
  fill: rgba(46, 196, 182, 0.28);
  stroke: rgba(46, 196, 182, 0.95);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
}
```
to:
```css
.footprint-map__shape {
  fill: rgba(46, 196, 182, 0.40);
  stroke: rgba(46, 196, 182, 0.95);
  stroke-width: 1.7;
  vector-effect: non-scaling-stroke;
}
```

**Step 2: Add dark mode override**

After line 42 (after the `.footprint-map__shape` block), add:
```css

[data-theme="dark"] .footprint-map__shape {
  fill: rgba(87, 212, 200, 0.50);
  stroke: rgba(87, 212, 200, 1.0);
}
```

Note: `stroke-width` and `vector-effect` are inherited from the base rule — no need to repeat. Dark mode uses teal-300 (87, 212, 200) for the brighter accent per design system convention.

**Step 3: Run build + tests**

Run: `cd frontend && npm run build && npm run test`
Expected: Clean build, all 448+ frontend tests pass.

**Step 4: Commit**

```bash
git add frontend/src/components/BuildingFootprintMap.css
git commit -m "style: improve 2D footprint overlay contrast with dark mode variant"
```

---

### Task 5: Visual Validation

This task is visual-only — no code changes, only verification.

**Step 1: Start dev servers**

Run (in separate terminals):
```bash
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

**Step 2: Manual visual checks**

Navigate to the app and search for an address (e.g., "Herengracht 1, Amsterdam"). Verify in both light and dark modes:

1. **3D viewer:** Neighbor buildings are clearly distinguishable from ground
2. **3D viewer:** Basemap streets/labels are readable in dark mode
3. **3D viewer:** Shadows are visible and create meaningful contrast
4. **3D viewer:** No z-fighting artifacts at building overlaps
5. **3D viewer:** No shadow acne or peter-panning at building bases
6. **3D viewer:** Tile edge seams are not visible within camera orbit range
7. **2D map:** Building footprint overlay is clearly visible on aerial photo
8. **2D map:** Dark mode overlay is visible on dark aerial imagery

**Step 3: Puppeteer regression (optional)**

If available, capture screenshots at 375px width in both modes and compare with mental model of expected improvements.

**Step 4: If any section needs tweaking**

Each task's values can be independently adjusted. If dark mode basemap filter `brightness(1.8) contrast(1.5)` is still too dim/bright, adjust that single line. If footprint fill 0.50 obscures too much, try 0.45.

---

## Quick Reference — All Changed Values

| File | Line(s) | Parameter | Before | After (Light) | After (Dark) |
|------|---------|-----------|--------|---------------|--------------|
| NeighborhoodViewer3D.tsx | 35-36 | Neighbor color | `0xB4C0CE` | `0xB4C0CE` | `0x8A9BB0` |
| NeighborhoodViewer3D.tsx | 35-36 | Neighbor opacity | `0.6` | `0.70` | `0.65` |
| NeighborhoodViewer3D.tsx | 483 | Neighbor material side | `DoubleSide` | `DoubleSide` (keep) | `DoubleSide` (keep) |
| NeighborhoodViewer3D.tsx | 250 | Hemisphere ambient | `0.5` / `0.4` | `0.35` | `0.30` |
| NeighborhoodViewer3D.tsx | 254,425,623 | Directional light (all 3 locations) | `0.8` | `0.9` | `0.85` |
| NeighborhoodViewer3D.tsx | 272 | Ground color | `0xF0F3F6`/`0x0D1620` | `0xDDE3EA` | `0x1A2838` |
| NeighborhoodViewer3D.tsx | 273 | Ground roughness | `0.95` | `0.90` | `0.90` |
| NeighborhoodViewer3D.tsx | 693 | Dark basemap filter | `brightness(0.85) contrast(1.1)` | — | `brightness(1.8) contrast(1.5) saturate(1.2)` |
| BuildingFootprintMap.css | 38 | Fill opacity | `0.28` | `0.40` | `0.50` (new rule) |
| BuildingFootprintMap.css | 40 | Stroke width | `1.4` | `1.7` | `1.7` (inherited) |
| BuildingFootprintMap.css | new | Dark stroke color | — | — | `rgba(87, 212, 200, 1.0)` |
