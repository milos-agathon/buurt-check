# Design Rules — "Polar Frost"

Canonical source: `frontend/src/styles/tokens.css`. Secondary: `docs/palette.md`.
When in doubt, tokens.css wins over any doc.

## Color Authority

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--color-primary` | `#1C2D3F` (Polar Slate) | `#E2E7ED` | Primary text |
| `--color-accent` | `#2EC4B6` (Arctic Teal) | `#2EC4B6` | Buttons, fills, target building |
| `--color-accent-text` | `#1C8C83` (4.52:1 AA) | `#57D4C8` | Text/icons on light bg |
| `--color-bg` | `#FAFBFC` | `#000000` (OLED) | Page background |
| `--color-surface` | `#FFFFFF` | `#121212` | Card surfaces |
| `--color-border` | `#E2E7ED` | `#2E4459` | Borders, dividers |
| `--color-text-secondary` | `#637892` | `#B4C0CE` | Labels, metadata |
| `--color-nav-bg` | `#1C2D3F` | `#1C2D3F` | Non-flipping dark nav |

## WCAG Rules

- `--color-accent` (#2EC4B6) has 2.17:1 on white — **NEVER as text on light surfaces**
- Use `--color-accent-text` (#1C8C83, 4.52:1) for text/icons on light backgrounds
- Risk badge colors are background-only — pair with `--color-badge-*-text` tokens
- `--color-text-tertiary` (#8A9BB0, 2.75:1) — decorative only, never essential info

## Risk Severity

| Severity | Score | Token | Light | Dark |
|----------|-------|-------|-------|------|
| Good | 70-100 | `--color-risk-good` | `#22C55E` | `#4ADE80` |
| Moderate | 40-69 | `--color-risk-moderate` | `#EAB308` | `#FACC15` |
| Poor | 20-39 | `--color-risk-poor` | `#EF4444` | `#F87171` |
| Critical | 0-19 | `--color-risk-critical` | `#B91C1C` | `#EF4444` |

Four channels for severity: color + text label + icon shape + numeric score. Never rely on color alone.

## Typography

- Font: Satoshi Variable (woff2), single font family, weight 300-900
- Type scale: 14 tokens from `--type-display` (28px Black) to `--type-micro` (11px)
- Score display: `--type-score-tile` (40px), `--type-score-large` (48px)
- `--type-body-friendly`: generous 26px line-height for risk explanations
- `font` shorthand resets `font-weight`/`font-style` — put overrides AFTER shorthand

## Spacing & Layout

- 8pt grid: `--space-xs` (4px) through `--space-5xl` (64px)
- Max content width: `--max-width: 600px`
- Tab bar: 56px + safe area. Top bar: 44px. Action bar: 64px
- Touch targets: 44px minimum (Apple HIG)
- Card radius: 16px. Button radius: 12px. Pill radius: 24px

## Dark Mode

- 3-way toggle: light / dark / system. `[data-theme="dark"]` on `<html>`
- OLED: `--color-bg: #000000` (true black)
- Nav bar stays dark in both themes (`--color-nav-bg: #1C2D3F`)
- Risk colors brighten in dark mode (separate dark token values)
- Basemap: CSS filter invert on Leaflet tile pane (no native PDOK dark tiles)

## 3D Viewer Colors

- Target building: Arctic Teal `0x2EC4B6` with `--teal-300` emissive glow
- Neighbor buildings: `--slate-200` (`0xB4C0CE`) at 60% opacity
- Shadow: PCFSoftShadowMap 2048x2048, summer noon default

## Z-Index Hierarchy

DossierSheet (40) < backdrop (49) < TabBar (50)

## Anti-Patterns

- Hardcoded hex values — always use `var(--token-name)`
- Undefined tokens — CSS fails silently; define before referencing
- CSS `!important` on canvas dimensions — breaks Three.js
- `color: white` in themed contexts — use `var(--color-text-inverse)` or `var(--color-overlay-text)`
- Inline style colors — breaks dark mode theming

## Reference Docs

- `docs/design-prd.md` — Design philosophy, component specs, animations
- `docs/design-spec.md` — Pixel-level visual spec for every screen
- `docs/palette.md` — Token-to-hex mapping with WCAG analysis
- `docs/ui-principles.md` — Mobile UX principles (briefing not dashboard)
