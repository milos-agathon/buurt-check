# Polar Frost Palette Reference

> Canonical source: `frontend/src/styles/tokens.css`
> Last synced: 2026-02-12

## Section 1: Primary Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#1C2D3F` | Polar Slate -- primary text, wordmark |
| `--color-accent` | `#2EC4B6` | Arctic Teal -- primary action, buttons, links |
| `--color-accent-light` | `#E6F9F7` | Teal tint -- selected states, backgrounds |
| `--color-accent-hover` | `#25A89C` | Teal darker -- hover states |
| `--color-accent-text` | `#1C8C83` | Teal 600 -- WCAG-safe accent text on light bg |

## Section 2: WCAG Rules

- `--color-accent` (`#2EC4B6`) has **2.17:1** contrast on white -- **FAIL AA**.
- `--color-accent-text` (`#1C8C83`) has **4.52:1** contrast on white -- **PASS AA**.
- **Rule:** Accent (`#2EC4B6`) is never used as text on light surfaces. Use `--color-accent-text` for text/icons on light backgrounds. `--color-accent` is valid on dark backgrounds (nav bar, dark mode surfaces).

## Section 3: Risk Severity

| Token | Hex | Threshold | WCAG on white |
|-------|-----|-----------|---------------|
| `--color-risk-good` | `#22C55E` | Score 70-100 | 2.10:1 (badge bg only) |
| `--color-risk-moderate` | `#EAB308` | Score 40-69 | 1.80:1 (badge bg only) |
| `--color-risk-poor` | `#EF4444` | Score 20-39 | 3.06:1 (badge bg only) |
| `--color-risk-critical` | `#B91C1C` | Score 0-19 | 5.44:1 (AA pass) |
| `--color-risk-unavailable` | `#8A9BB0` | No data | 2.75:1 (badge bg only) |

Risk colors are used as badge backgrounds with dedicated badge text tokens for contrast.

## Section 4: 3D Viewer Colors

| Element | Color | Opacity | Token |
|---------|-------|---------|-------|
| Target building | `#2EC4B6` (Arctic Teal) | 100% | `--color-accent` |
| Target emissive glow | `#57D4C8` (teal.300) | 15% intensity | `--teal-300` |
| Neighbor buildings | `#B4C0CE` (slate.200) | 60% | `--slate-200` |

## Section 5: Surfaces

| Token | Hex (light) | Hex (dark) | Usage |
|-------|-------------|------------|-------|
| `--color-bg` | `#FAFBFC` | `#000000` (OLED) | Page background |
| `--color-surface` | `#FFFFFF` | `#121212` | Card surfaces |
| `--color-surface-alt` | `#F5F7F9` | `#1C2D3F` | Recessed cards |
| `--color-surface-recessed` | `#F0F3F6` | `#0D1620` | Deeply recessed |
| `--color-border` | `#E2E7ED` | `#2E4459` | Borders, dividers |

## Section 6: Dark Mode

| Token | Value | Notes |
|-------|-------|-------|
| `--color-bg` | `#000000` | True black for OLED battery savings |
| `--color-surface` | `#121212` | Card elevation differentiation |
| `--color-text` | `#E2E7ED` | ~87% white equivalent |
| `--color-text-secondary` | `#B4C0CE` | Muted text |
| `--color-accent-text` | `#57D4C8` | Brighter teal for dark bg readability |
| `--color-nav-bg` | `#1C2D3F` | Non-flipping -- stays dark in both themes |

## Section 7: Badge Semantics

| Variant | Background | Text |
|---------|-----------|------|
| Positive | `#E6F9F7` / `rgba(46,196,182,0.15)` | `#0B4F4A` / `#57D4C8` |
| Caution | `#FEF3C7` / `rgba(234,179,8,0.15)` | `#92400E` / `#FACC15` |
| Negative | `#FEE2E2` / `rgba(239,68,68,0.15)` | `#991B1B` / `#F87171` |
| Neutral | `#D8DFE7` / `#1C2D3F` | `#2E4459` / `#B4C0CE` |

Format: light / dark values.

## Section 8: Choropleth Ramps

14 tokens defined, no consumers yet. Forward-looking for neighborhood score visualization.

**Sequential (teal, 7 stops):** `--ramp-seq-1` (`#E6F9F7`) through `--ramp-seq-7` (`#0B4F4A`)

**Diverging (red-neutral-teal, 7 stops):** `--ramp-div-1` (`#EF4444`) through `--ramp-div-7` (`#1C8C83`)
