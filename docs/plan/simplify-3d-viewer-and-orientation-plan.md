# Plan: Simplify 3D Viewer & Add Building Orientation

## Context

The `NeighborhoodViewer3D` component grew into an interactive shadow playground (~925 lines) with time sliders, season buttons, camera presets, GSAP transitions, fullscreen mode, FPS monitoring, and a WMS overlay system. Product review concluded that ~75% of this code serves spectacle rather than decision-making.

The real product value is:

1. Sunlight risk score from raycasting.
2. Winter shadow snapshots as visual evidence.
3. 3D neighborhood context.

## Goal

Strip the viewer to a static context card. Preserve sunlight scoring and winter snapshots. Add estimated building orientation. Remove interactive controls.

Expected reduction: ~900 lines + `gsap` dependency.

## Critical Corrections From Review

1. Test gate `>=330`. Losing 25 tests (8 `ShadowControls` + 9 `OverlayControls` + 8 viewer). Must add `>=25` replacement tests.
2. Promote sunlight section. Move `SunlightRiskCard` + `ShadowSnapshots` from after Mapillary/BuildingFacts to right after the 3D viewer.
3. Reset needs `frameCamera()`. Extract camera framing into a callable function. Reset button calls it, not just flipping a ref.
4. 180 degree ambiguity. Longest edge has two directions. Report as `NE-SW axis`, not `faces SW`. No `main facade` or `garden side` claims.
5. Cache version bump: `neighborhood3d:v12` -> `neighborhood3d:v13` in `backend/app/api/address.py`.
6. Shadow map `2048`. Without adaptive fallback, use `2048` (not `4096`) for low-end device safety.
7. Defer i18n key removal. Only add new keys in this PR. Remove unused keys in a separate cleanup commit.

---

## Phase 1: Backend - Orientation + Cache Bump

### Step 1.1: Add `orientation_deg` to `BuildingBlock` model

File: `backend/app/models/neighborhood3d.py`

- Add:

```python
orientation_deg: float | None = None  # Longest edge azimuth, 0=N, clockwise
```

### Step 1.2: Add `_compute_building_orientation()` helper

File: `backend/app/services/three_d_bag.py` (after `_extract_lod22_surfaces`)

- Find longest footprint edge, compute azimuth (`0=North`, clockwise).
- RD New: `+X=East`, `+Y=North`.
- Formula: `azimuth = (90 - degrees(atan2(dy, dx))) % 360`.
- Return `None` for `<3` vertices or longest edge `<0.1m`.
- Normalize to `0-180` range (`azimuth % 180`) for axis ambiguity.

### Step 1.3: Call helper in `_parse_building()`

File: `backend/app/services/three_d_bag.py` (in `BuildingBlock` constructor)

- Add:

```python
orientation_deg=_compute_building_orientation(footprint)
```

### Step 1.4: Bump cache version

File: `backend/app/api/address.py`

- Update cache key:

```python
cache_key = f"neighborhood3d:v13:{pand_id}:{rd_x:.0f}:{rd_y:.0f}"
```

### Step 1.5: Add backend tests (~6)

File: `backend/tests/test_three_d_bag.py`

- East-west rectangle (longest edge horizontal) -> ~90 degrees.
- North-south rectangle (longest edge vertical) -> ~0 degrees.
- Diagonal rectangle -> expected angle.
- Square (all edges equal) -> deterministic first-longest behavior.
- Degenerate (`<3` vertices) -> `None`.
- Tiny edges (`<0.1m`) -> `None`.

### Step 1.6: Update frontend TypeScript type

File: `frontend/src/types/api.ts`

- Add:

```ts
orientation_deg?: number;
```

### Commit

`feat(backend): add building orientation estimation from footprint geometry`

### Verify

```bash
cd backend && ruff check .
cd backend && pytest -x -q -m "not live"
```

---

## Phase 2: Simplify `NeighborhoodViewer3D` (combined with deletions)

### Step 2.1: Delete component files

- `frontend/src/components/ShadowControls.tsx`
- `frontend/src/components/ShadowControls.css`
- `frontend/src/components/ShadowControls.test.tsx`
- `frontend/src/components/OverlayControls.tsx`
- `frontend/src/components/OverlayControls.css`
- `frontend/src/components/OverlayControls.test.tsx`

### Step 2.2: Remove `gsap`

```bash
cd frontend && npm uninstall gsap
```

### Step 2.3: Simplify `NeighborhoodViewer3D.tsx`

File: `frontend/src/components/NeighborhoodViewer3D.tsx`

- Remove imports: `gsap`, `ShadowControls`, `OverlayControls`, `OverlayTileType`, `getWmsTile`.
- Remove constants/helpers: `CAMERA_PRESETS`, `getDateFromPreset()`.
- Set `SHADOW_MAP_SIZE = 2048`.
- Remove state: fullscreen/time/date/overlay/perf related state and refs.
- Remove fullscreen logic (`toggleFullscreen` + sync effect).
- Simplify animation loop: keep only `requestAnimationFrame`, `controls.update()`, `renderer.render()`.
- Extract `frameCamera()` from camera framing block and reuse for reset.
- Fix sun to summer noon (`new Date(year, 5, 21, 12, 0, 0)`), deps only `[center.lat, center.lng]`.
- Remove GSAP camera preset handler.
- Remove overlay system and cleanup.
- Simplify JSX: remove fullscreen/camera cluster/time badge/perf banner/`ShadowControls`/`OverlayControls`.
- Add reset button:

```tsx
<button
  className="viewer-3d__reset-btn"
  onClick={() => frameCamera()}
  aria-label={t('viewer3d.resetView')}
  type="button"
>
  {/* reset icon */}
</button>
```

### Step 2.4: Clean CSS

File: `frontend/src/components/NeighborhoodViewer3D.css`

- Remove fullscreen/camera/time/perf styles.
- Add `.viewer-3d__reset-btn` (absolute top-right, 36px, surface background, border, rounded).

### Step 2.5: Remove orphaned frontend code

File: `frontend/src/services/api.ts`

- Remove `getWmsTile()` and `OverlayTileType`.
- Keep note: backend `/wms-tile` endpoint remains for potential future 2D map use.

File: `frontend/src/services/api.test.ts`

- Cleanup `getWmsTile`/`OverlayTileType` imports/usages if present.
- Confirm zero remaining references via grep.

### Commit

`refactor(frontend): simplify 3D viewer to static context card`

### Verify

```bash
cd frontend && npm run build
```

---

## Phase 3: Promote Sunlight Section + Add Orientation Display

### Step 3.1: Move `SunlightRiskCard` + `ShadowSnapshots`

File: `frontend/src/App.tsx`

- Move sunlight section to directly after `NeighborhoodViewer3D`.
- Keep risk tiles and other sections after the promoted sunlight section.

### Step 3.2: Add orientation to `SunlightRiskCard`

File: `frontend/src/components/SunlightRiskCard.tsx`

- Add prop: `orientationDeg?: number`.
- Add pure helper `getAxisLabel(deg: number): string` for axis pair labels (e.g. `NE-SW`) from `0-180` range.
- Display when available:
  - `Estimated building axis: NE-SW (45 deg)`
  - Note: `Based on footprint; verify at viewing.`
- No facade/facing/garden-side claims.

### Step 3.3: Pass orientation from `App.tsx`

File: `frontend/src/App.tsx`

```ts
const targetOrientation = neighborhood3D?.buildings.find(
  (b) => b.pand_id === neighborhood3D.target_pand_id
)?.orientation_deg;
```

- Pass as `orientationDeg={targetOrientation}` to `SunlightRiskCard`.

### Step 3.4: Add i18n keys (additions only)

Files:

- `frontend/src/i18n/en.json`
- `frontend/src/i18n/nl.json`

Add:

- `sunlight.orientation`
- `sunlight.orientationNote`
- `sunlight.axis.ns`
- `sunlight.axis.nesw`
- `sunlight.axis.ew`
- `sunlight.axis.senw`
- `viewer3d.resetView`

### Commit

`feat(frontend): promote sunlight section, add orientation display`

### Verify

```bash
cd frontend && npm run build
```

---

## Phase 4: Update Tests (maintain gate with buffer)

Target: `>=332` frontend tests.

### Step 4.1: Update `NeighborhoodViewer3D.test.tsx` (-8, +5)

File: `frontend/src/components/NeighborhoodViewer3D.test.tsx`

Remove tests for removed UI/features:

- fullscreen toggle/class behavior
- camera presets
- time badge
- performance banner
- shadow controls
- overlay controls

Keep tests for:

- title
- canvas
- source
- LoD 2.2 rendering path
- LoD 0 fallback
- snapshot capture path

Add tests:

- reset button renders (accessible label)
- reset button keyboard activation
- fullscreen button absent
- shadow controls absent
- overlay controls absent

Also remove obsolete mocks: `gsap`, `getWmsTile`.

### Step 4.2: Add `SunlightRiskCard` orientation tests (+10+)

File: `frontend/src/components/SunlightRiskCard.test.tsx`

- orientation absent when `orientationDeg` undefined
- orientation shown when provided
- axis mapping cases (0, 45, 90, 135)
- all 4 axis-pair labels correct
- estimate note present
- NL translation coverage
- accessibility checks for orientation text
- loading state shows no orientation
- edge case `180 -> 0` equivalent mapping

### Step 4.3: Add integration tests in `App.test.tsx` (+3+)

File: `frontend/src/App.test.tsx`

- Update `SunlightRiskCard` mock to expose `orientationDeg`, e.g. data attribute.
- Assert orientation flows from neighborhood data into sunlight card.
- Assert sunlight card + snapshots render before risk tiles.
- Assert orientation absent when no target building.

### Step 4.4: Backend orientation tests (+6)

Covered in Phase 1.

### Step 4.5: Update E2E mocks

File: `frontend/tests/e2e/helpers/mockApi.ts`

- Add `orientation_deg: 135.0` in mock `BuildingBlock` where applicable.

### Step 4.6: Keyboard navigation test updates

File: `frontend/src/test/keyboard-navigation.test.tsx`

- Remove references to removed controls.
- Add reset button tabbable check.

### Commit

`test(frontend): update tests for simplified viewer + orientation (>=332)`

### Verify

```bash
cd frontend && npx vitest run
```

---

## Phase 5: Documentation

### Step 5.1: Update `frontend/CLAUDE.md`

- Remove GSAP from stack.
- Remove old Three.js rules for camera presets/FPS/fullscreen/overlays.
- Set shadow map guidance to 2048.
- Add static-viewer rule and reset behavior.
- Update frontend test baseline to actual `>=332` target/baseline.

### Step 5.2: Update root `CLAUDE.md`

- Note simplified 3D viewer, removed GSAP, added orientation axis.
- Note neighborhood3d cache version `v13`.

### Step 5.3: Update visual snapshots

```bash
cd frontend && npm run test:visual:update
```

- Review dossier layout changes (sunlight section promoted, simplified viewer).

### Commit

`docs: update CLAUDE.md + visual regression snapshots for simplified viewer`

---

## Verification Checklist

### Backend

```bash
cd backend && ruff check .
cd backend && pytest -x -q -m "not live"
```

### Frontend

```bash
cd frontend && npm run build
cd frontend && npx vitest run
```

### Manual checks

1. Address search -> dossier loads.
2. 3D viewer uses summer-noon lighting; orbit works; reset re-frames.
3. Sunlight card appears immediately after 3D viewer.
4. Sunlight card shows axis estimate text (e.g. `NE-SW (45 deg)`) with estimate note.
5. Shadow snapshots (3 winter images) appear after sunlight card.
6. Risk tiles appear after sunlight section.
7. PDF export still includes shadow snapshot.
8. Dark mode works.
9. No console errors.

---

## Files Changed (Summary)

- `backend/app/models/neighborhood3d.py` - add `orientation_deg` field
- `backend/app/services/three_d_bag.py` - add orientation helper + model wiring
- `backend/app/api/address.py` - cache key `v12` -> `v13`
- `backend/tests/test_three_d_bag.py` - add orientation tests
- `frontend/src/types/api.ts` - add `orientation_deg` to `BuildingBlock`
- `frontend/src/components/ShadowControls.*` - delete
- `frontend/src/components/OverlayControls.*` - delete
- `frontend/src/components/NeighborhoodViewer3D.tsx` - simplify, add `frameCamera()`, set shadow map 2048
- `frontend/src/components/NeighborhoodViewer3D.css` - remove obsolete styles, add reset button style
- `frontend/src/components/NeighborhoodViewer3D.test.tsx` - update for simplified viewer
- `frontend/src/components/SunlightRiskCard.tsx` - add orientation axis display
- `frontend/src/components/SunlightRiskCard.test.tsx` - add orientation tests
- `frontend/src/App.tsx` - promote sunlight section, pass orientation prop
- `frontend/src/App.test.tsx` - add orientation integration and layout-order tests
- `frontend/src/i18n/en.json` - add orientation/reset keys
- `frontend/src/i18n/nl.json` - add orientation/reset keys
- `frontend/src/services/api.ts` - remove `getWmsTile`/`OverlayTileType`
- `frontend/src/services/api.test.ts` - cleanup any orphaned imports/usages
- `frontend/src/test/keyboard-navigation.test.tsx` - update for removed controls + reset tab test
- `frontend/tests/e2e/helpers/mockApi.ts` - add orientation to mocks
- `frontend/package.json` - remove `gsap`
- `frontend/CLAUDE.md` - update frontend conventions
- `CLAUDE.md` - update project status
