# Map Contrast Improvement Design

**Date:** 2026-02-20
**Scope:** WCAG AA contrast improvements across 2D aerial footprint map and 3D neighborhood viewer, both light and dark modes.
**Approach:** Parameter tuning only — no architectural changes, new rendering techniques, or shader work.

## Problem Statement

Both the 2D building footprint aerial overlay and 3D neighborhood viewer suffer from poor contrast in both light and dark modes:
1. Neighbor buildings blend into the ground/basemap
2. Dark mode basemap tiles are blown out by aggressive CSS filter
3. 2D footprint overlay is nearly invisible on dark aerial imagery
4. Shadows are too subtle to interpret sunlight patterns

## Section 1: 3D Neighbor Buildings vs Ground

### Current State
- `NEIGHBOR_COLOR = 0xB4C0CE`, `NEIGHBOR_OPACITY = 0.6` (both themes)
- Ground plane color matches scene background (`0xF0F3F6` light, `0x0D1620` dark)
- Ground roughness: 0.95
- Neighbor material: `DoubleSide`

### Changes

| Parameter | Current | Light Mode | Dark Mode |
|-----------|---------|------------|-----------|
| Neighbor color | `0xB4C0CE` | `0xB4C0CE` (keep) | `0x8A9BB0` |
| Neighbor opacity | 0.60 | 0.70 | 0.65 |
| Ground plane color | `0xF0F3F6` / `0x0D1620` | `0xDDE3EA` | `0x1A2838` |
| Ground roughness | 0.95 | 0.90 | 0.90 |
| Neighbor material side | `DoubleSide` | `FrontSide` | `FrontSide` |

### Rationale
- Neighbor opacity increases are conservative (not 0.75+) to avoid z-fighting between overlapping transparent surfaces at 150-250 buildings
- `FrontSide` instead of `DoubleSide` for neighbors: solid volumes don't need back-faces rendered; reduces z-sorting artifacts at higher opacity
- Ground color shifts are bold enough to be perceptible (~15-point RGB shift) while staying within Polar Frost palette
- Dark mode neighbor color `0x8A9BB0` (RGB 138,155,176) is lighter than ground `0x1A2838` (RGB 21,31,43) — lighter buildings on darker ground is the correct natural lighting read
- Ground roughness 0.90 (from 0.95) has minimal effect but lets ground catch hemisphere light slightly better

### Risk: Basemap Tile Edge Seams
The 3x3 tile grid (already the default) pushes seams beyond typical camera view frustum. If seams are still visible, match ground color to inverted tile edge average or apply alpha-fade at tile edges.

## Section 2: 3D Basemap Readability

### Current State
- Light mode: `grijs` tile style (nearly white, subordinate by design)
- Dark mode: `standaard` tiles with canvas filter `invert(1) hue-rotate(180deg) brightness(2.2) contrast(1.8)`

### Changes

| Parameter | Current | Revised |
|-----------|---------|---------|
| Light basemap style | `grijs` | `grijs` (keep) |
| Dark basemap filter | `brightness(2.2) contrast(1.8)` | `brightness(1.8) contrast(1.5) saturate(1.2)` |

### Rationale
- `grijs` was a deliberate design decision to keep basemap subordinate to 3D massing; `standaard` would add colored roads, building labels, and water fill that fight the 3D buildings
- Current dark filter brightness(2.2) + contrast(1.8) blows out roads and creates halo artifacts around labels
- Revised brightness(1.8) + contrast(1.5) is a moderate reduction (~18%/~17%) that addresses blowout without making thin road lines unreadable on mobile at z16
- Added saturate(1.2) recovers color distinction lost by reducing brightness
- Full filter chain: `invert(1) hue-rotate(180deg) brightness(1.8) contrast(1.5) saturate(1.2)`

### Risks
- Filter-based dark mode is inherently brittle — `invert(1) hue-rotate(180deg)` is an approximation that produces inconsistent results for saturated cartographic colors (water, parks)
- These are starting-point values that require visual validation across tile content variety (residential, waterfront, park-adjacent, commercial)
- If tuning fails, a follow-up may need a different approach (natively dark tile source or different PDOK style)
- If `grijs` lacks orientation context, `pastel` is the next candidate (gentle color without `standaard`'s visual noise)

## Section 3: 2D Footprint Overlay

### Current State
Single set of values for both themes:
- Fill: `rgba(46, 196, 182, 0.28)`
- Stroke: `rgba(46, 196, 182, 0.95)`, width 1.4
- `vector-effect: non-scaling-stroke`

### Changes

| Parameter | Current | Light Mode | Dark Mode (new) |
|-----------|---------|------------|-----------------|
| Fill opacity | 0.28 | 0.40 | 0.50 |
| Stroke opacity | 0.95 | 0.95 (keep) | 1.0 |
| Stroke color (RGB) | `46, 196, 182` | `46, 196, 182` (keep) | `87, 212, 200` (teal-300) |
| Stroke width | 1.4 | 1.7 | 1.7 |

### Implementation
Add `[data-theme="dark"] .footprint-map__shape` override in `BuildingFootprintMap.css`.

### Rationale
- At 0.28, the overlay is nearly invisible on dark aerial imagery — defeats its primary purpose of building identification
- Fill 0.50 in dark mode is appropriate: the overlay's job is identification ("this is your building"), not detail inspection (roof condition). Users see through the stroke boundary
- Stroke width 1.7 (not 2.0) because `vector-effect: non-scaling-stroke` means constant CSS pixels; 2.0 is visually heavy on 375px screens
- Dark mode stroke uses teal-300 (`87, 212, 200`) for consistency with the design system's dark-mode accent brightening pattern
- No SVG drop-shadow — expensive to render on mobile. If separation is still weak, a secondary offset `<path>` with 1px dark stroke is a cheap fallback

### Visual Validation
Dark mode fill at 0.50 should be checked — fall back to 0.45 if it obscures too much of the aerial photo.

## Section 4: 3D Shadow Tuning

### Current State
- Hemisphere ambient: 0.5 (light) / 0.4 (dark)
- Directional light: 0.8 (both)
- Shadow-to-lit ratios: 0.38 (light), 0.33 (dark) — shadows are 33-38% as bright as lit areas
- `shadow.bias = -0.001`, `normalBias = 0.02`

### Changes

| Parameter | Current | Light Mode | Dark Mode |
|-----------|---------|------------|-----------|
| Hemisphere ambient | 0.5 / 0.4 | 0.35 | 0.30 |
| Directional light | 0.8 | 0.9 | 0.85 |
| Ground roughness | 0.95 | 0.90 | 0.90 |
| Shadow bias | -0.001 | -0.001 (keep) | -0.001 (keep) |

### New Shadow-to-Lit Ratios
- Light: `0.35 / (0.35 + 0.9) = 0.28` (was 0.38 — **26% improvement**)
- Dark: `0.30 / (0.30 + 0.85) = 0.26` (was 0.33 — **21% improvement**)

### Rationale
- Dark mode ambient at 0.30 (not 0.25) to prevent non-emissive neighbors from disappearing in shadow — only the target building has emissive properties
- Reducing ambient and increasing direct light creates a wider gap between shadowed and lit areas
- Ground roughness 0.90 is a secondary lever with minimal impact; lighting intensity changes do the real work

### Visual Validation
- Shadow bias values were tuned for current light balance; higher shadow contrast makes shadow acne and peter-panning more noticeable. Re-validate visually after implementation
- Verify shadowed sides of buildings remain visible, especially neighbors in dark mode

## Implementation Notes

### Files to Modify
1. `frontend/src/components/NeighborhoodViewer3D.tsx` — sections 1, 2, 4 (building colors/opacity, basemap filter, lighting)
2. `frontend/src/components/BuildingFootprintMap.css` — section 3 (footprint overlay)

### Visual Validation Plan
After implementation, capture Puppeteer screenshots at 375px width for:
- Light mode: residential area, waterfront area
- Dark mode: same locations
- Compare before/after for all four improvements
- Check tile edge seams at camera orbit extremes

### Rollback
All changes are CSS/constant tweaks. If any individual section causes visual regression, its values can be independently reverted to current values.
