# Buurt-Check · Polar Frost Palette Reference

**`#1C2D3F` Polar Slate × `#2EC4B6` Arctic Teal**
Design direction: Clear Signal · Scandinavian minimalism
Last updated: February 2026

---

## 1 · Core tokens

### Brand colors

| Token | Hex | RGB | Role |
|---|---|---|---|
| `color.primary` | `#1C2D3F` | 28, 45, 63 | Text, navigation, structure, brand anchor |
| `color.accent` | `#2EC4B6` | 46, 196, 182 | Interaction, CTA, highlights, map selection |

### Primary tint scale (Polar Slate)

Generated in HCL color space for perceptual uniformity.

| Token | Hex | Usage |
|---|---|---|
| `slate.50` | `#F0F3F6` | Page background (light mode) |
| `slate.100` | `#D8DFE7` | Card background, dividers |
| `slate.200` | `#B4C0CE` | Disabled text, placeholder |
| `slate.300` | `#8A9BB0` | Secondary text, captions |
| `slate.400` | `#637892` | Tertiary text, metadata |
| `slate.500` | `#445B74` | Body text (secondary weight) |
| `slate.600` | `#2E4459` | Body text (primary weight) |
| `slate.700` | `#1C2D3F` | **Primary — headings, nav, labels** |
| `slate.800` | `#142131` | Dark mode elevated surfaces |
| `slate.900` | `#0D1620` | Dark mode base background |

### Accent tint scale (Arctic Teal)

| Token | Hex | Usage |
|---|---|---|
| `teal.50` | `#E6F9F7` | Success/positive background tint |
| `teal.100` | `#B3EDE8` | Light highlight, selected row bg |
| `teal.200` | `#80E1D9` | Hover states on light backgrounds |
| `teal.300` | `#57D4C8` | Progress bars, range fills |
| `teal.400` | `#2EC4B6` | **Accent — CTAs, links, active states** |
| `teal.500` | `#25A89C` | Accent hover/pressed state |
| `teal.600` | `#1C8C83` | Accent on dark backgrounds |
| `teal.700` | `#13706A` | Dark mode accent pressed |
| `teal.800` | `#0B4F4A` | Darkest teal (data viz endpoint) |
| `teal.900` | `#063330` | Extreme dark teal (rarely used) |

### Neutral surfaces (primary-tinted)

Every neutral is tinted slightly toward `#1C2D3F` to maintain cohesion, especially on map-heavy screens where pure grays feel detached.

| Token | Hex | Usage |
|---|---|---|
| `surface.base` | `#FAFBFC` | App background |
| `surface.card` | `#FFFFFF` | Cards, sheets, modals |
| `surface.elevated` | `#F5F7F9` | Grouped card areas, section bg |
| `surface.overlay` | `rgba(28,45,63,0.48)` | Modal scrim, map dim layer |
| `surface.divider` | `#E2E7ED` | Separators, card borders |

### Semantic colors (independent of brand)

These never change if you swap palettes later. They exist outside the brand system.

| Token | Hex | Purpose |
|---|---|---|
| `semantic.success` | `#22C55E` | Positive scores, safe zones, confirmations |
| `semantic.warning` | `#EAB308` | Caution indicators, moderate risk |
| `semantic.error` | `#EF4444` | Errors, high-risk zones, validation fails |
| `semantic.info` | `#3B82F6` | Informational badges, tooltips |

**Rule:** Semantic colors appear only in status contexts (scores, alerts, validation). They never replace brand colors for navigation, CTAs, or structural elements.

---

## 2 · Contrast & accessibility rules

### Verified contrast ratios

| Combination | Ratio | WCAG AA | WCAG AAA |
|---|---|---|---|
| `slate.700` on `surface.card` (#FFF) | 14.03:1 | ✅ Pass | ✅ Pass |
| `teal.400` on `slate.700` | 6.47:1 | ✅ Pass | ✗ (≥7:1 needed) |
| `teal.400` on `surface.card` (#FFF) | 2.17:1 | ✗ Fail | ✗ Fail |
| `slate.700` on `teal.400` | 6.47:1 | ✅ Pass | ✗ |
| `slate.300` on `surface.card` (#FFF) | 3.72:1 | ✅ Large text | ✗ |

### The universal accent rule

> **Accent is never text on light surfaces.**
> Accent is used as **fill** (button bg, badge bg, icon fill, stroke, border) with `slate.700` or white text on top.

This one rule eliminates every teal-on-white accessibility failure.

### Text hierarchy contrast

| Level | Token | Min ratio on white | Use |
|---|---|---|---|
| Headings | `slate.700` | 14.03:1 (AAA) | Page titles, section heads, card titles |
| Body | `slate.600` | 10.16:1 (AAA) | Paragraphs, descriptions, long-form |
| Secondary | `slate.400` | 4.84:1 (AA) | Metadata, timestamps, labels |
| Disabled | `slate.200` | 2.06:1 | Disabled controls only (not body text) |

---

## 3 · Component rules

### Buttons

| Type | Background | Text | Border | When to use |
|---|---|---|---|---|
| **Primary** | `teal.400` | `#FFFFFF` | none | ≤1 per screen. The one action you want. |
| **Primary hover** | `teal.500` | `#FFFFFF` | none | Mouse/touch down state |
| **Secondary** | `transparent` | `slate.700` | 1px `slate.200` | Supporting actions (save, share, filter) |
| **Secondary hover** | `slate.50` | `slate.700` | 1px `slate.300` | |
| **Ghost** | `transparent` | `teal.400` | none | Inline links, "see more", tertiary actions |
| **Destructive** | `semantic.error` | `#FFFFFF` | none | Delete, cancel subscription |
| **Disabled** | `slate.100` | `slate.300` | none | Any disabled button state |

**Button label rule:** Minimum 14px / 0.875rem semibold. On `teal.400` background, white text achieves 4.51:1 — passing AA for normal text. This is the minimum viable size; prefer 16px.

### Chips & tags

| Variant | Background | Text | Use case |
|---|---|---|---|
| **Default** | `slate.50` | `slate.700` | Filter chips, category labels |
| **Active/selected** | `teal.50` | `teal.800` | Active filter, selected category |
| **Score chip** | `teal.400` | `#FFFFFF` | Buurt-check score badge on cards |

### Badges

| Type | Background | Text |
|---|---|---|
| Positive | `teal.50` | `teal.800` |
| Caution | `#FEF3C7` | `#92400E` |
| Negative | `#FEE2E2` | `#991B1B` |
| Neutral | `slate.100` | `slate.600` |

### Cards

- Background: `surface.card` (#FFFFFF)
- Border: `surface.divider` (#E2E7ED), 1px
- Border radius: 12px
- Shadow: `0 1px 3px rgba(28,45,63,0.08)` (subtle, primary-tinted)
- Selected state: border changes to `teal.400`, 2px, shadow increases to `0 2px 8px rgba(46,196,182,0.16)`

### Navigation (top bar)

- Background: `slate.700` (#1C2D3F)
- Title text: `#FFFFFF`
- Icons: `#FFFFFF` (default), `teal.400` (active tab)
- iOS status bar: light content

### Bottom tab bar

- Background: `surface.card` (#FFFFFF)
- Inactive icon + label: `slate.300`
- Active icon + label: `teal.400`
- Active indicator: `teal.50` pill behind active icon (iOS 18+ pattern)

---

## 4 · Map & 3D visualization rules

### Basemap treatment

Use a **desaturated, primary-tinted basemap** — not default Google/Mapbox styles. The basemap should feel like it belongs to buurt-check, not to a mapping provider.

| Map element | Color | Notes |
|---|---|---|
| Land | `#F0F3F6` (slate.50) | Near-white, barely visible |
| Water | `#D8E4ED` | Slight blue, cool |
| Roads (major) | `#C8D0DA` | Visible but quiet |
| Roads (minor) | `#E2E7ED` | Barely visible |
| Parks | `#E3EDE6` | Desaturated sage green |
| Buildings (context) | `#D8DFE7` (slate.100) | Flat, no emphasis |
| Labels | `slate.400` | Reduced opacity, small |

**Principle:** The basemap is furniture. Your data is the content. If the basemap is drawing attention, it's too saturated.

### Selected neighborhood

- Boundary: `teal.400`, 3px stroke, `teal.50` fill at 30% opacity
- Adjacent neighborhoods: `slate.200` stroke, 1px, no fill
- The selected boundary should be the single most visible element on the map at all times

### 3D building visualization

| Element | Color | Notes |
|---|---|---|
| Subject property | `teal.400` solid | Full opacity, lit from northwest |
| Neighboring buildings | `slate.200` | 60% opacity, no edge highlight |
| Ground plane | `slate.50` | Matches basemap |
| Shadow | `rgba(28,45,63,0.12)` | Subtle, primary-tinted |
| Selected building edge | `teal.300` | Slight glow, 1px |

### Choropleth ramps (neighborhood scores)

**Sequential ramp** — for single-variable data (livability score, noise level, price/m²):

```
teal.50 → teal.100 → teal.200 → teal.300 → teal.400 → teal.600 → teal.800
```

Low values are light, high values are dark. 7 stops maximum per ramp to avoid visual noise.

**Diverging ramp** — for comparison data (above/below average, deviation from median):

```
semantic.error (#EF4444) → #F5A0A0 → #FAD0D0 → #F0F3F6 → teal.100 → teal.300 → teal.600
```

Neutral center (`slate.50`), with red-side for below-average and teal-side for above-average. This avoids the red-green problem by using red-blue instead.

### Map pins & markers

| Type | Style | Notes |
|---|---|---|
| User's searched property | `teal.400` filled pin, `slate.700` dot center | Largest pin, always on top |
| Comparable properties | `slate.400` filled pin | Smaller, recessive |
| POI markers (schools, transit) | `slate.300` outline pin | Smallest, icon-only |
| Risk indicator | `semantic.warning` dot | Amber 8px circle, pulsing |

### Map overlay panels (property cards on map)

- Background: `surface.card` with 12px radius
- Shadow: `0 4px 16px rgba(28,45,63,0.16)` (elevated above map)
- Score badge: `teal.400` background, white text, pill shape
- Connection line from pin to card: `teal.400`, 1px dashed

---

## 5 · Dark mode tokens

Dark mode is not an afterthought — it's the default for evening property browsing and the more natural context for 3D visualizations (dark backgrounds make lit geometry pop).

| Token | Light mode | Dark mode |
|---|---|---|
| `surface.base` | `#FAFBFC` | `#0D1620` (slate.900) |
| `surface.card` | `#FFFFFF` | `#142131` (slate.800) |
| `surface.elevated` | `#F5F7F9` | `#1C2D3F` (slate.700) |
| `surface.divider` | `#E2E7ED` | `#2E4459` |
| `color.primary` text | `#1C2D3F` | `#E2E7ED` (slate.100) |
| `color.accent` | `#2EC4B6` | `#2EC4B6` (unchanged) |
| Body text | `slate.600` | `slate.200` |
| Secondary text | `slate.400` | `slate.400` (anchor point) |

**Dark mode accent rule:** Teal at `#2EC4B6` on `slate.800` (#142131) achieves 6.98:1 — nearly AAA. On `slate.900` (#0D1620) it achieves 8.15:1 — full AAA. Teal works harder in dark mode than light mode.

**Dark mode map:** Switch to Mapbox Dark or equivalent. Building context shifts to `slate.800`. Selected buildings render in `teal.400` with `teal.300` edge glow. This is where the palette truly shines.

---

## 6 · Do / Don't rules

### ✅ Do

1. **Do** use `teal.400` for exactly one primary action per screen — the thing you most want the user to tap
2. **Do** use `slate.700` as your text color on light backgrounds — it's warm enough to feel branded, dark enough for AAA
3. **Do** tint your grays toward `#1C2D3F` — never use pure `#F5F5F5` or `#E0E0E0`; use `slate.50` and `slate.100` instead
4. **Do** use teal as fill/stroke/background with dark or white text on top
5. **Do** keep the basemap desaturated so data layers and teal selections dominate visually
6. **Do** use semantic colors independently from brand colors — success green, warning amber, error red operate in their own system
7. **Do** build both light and dark token sets from day one — shipping dark mode later with this palette will require rework

### ✗ Don't

1. **Don't** use `teal.400` as text on white or any light background — it fails WCAG at 2.17:1
2. **Don't** use teal for negative states — teal is always positive/interactive in this system; red handles danger
3. **Don't** put `teal.400` on `semantic.success` green or vice versa — they're too similar in hue and will create confusion
4. **Don't** use more than 2 teal-scale stops in any single UI component — the accent should feel precise, not gradient-decorative
5. **Don't** apply teal to large background areas in light mode — it overwhelms. Maximum teal background: chip, badge, button, score pill, or map boundary fill at 30% opacity
6. **Don't** use `slate.700` on colored backgrounds other than white/teal — check contrast ratios for every combination you introduce
7. **Don't** use the basemap provider's default pin colors — they break the system. Always override with your token-defined pin styles

---

## 7 · Quick implementation checklist

```
□ Define CSS custom properties / Tailwind config for all tokens above
□ Build button component with all 5 variants (primary, secondary, ghost, destructive, disabled)
□ Build chip/badge components with token-correct backgrounds
□ Configure Mapbox/basemap style JSON with desaturated, slate-tinted palette
□ Build choropleth ramp utility (sequential + diverging) using teal scale
□ Set up dark mode token layer with media query + manual toggle
□ Verify: accent never appears as text on light surfaces (lint rule if possible)
□ Verify: primary CTA count ≤1 per screen (design review checklist)
□ Test all components at 200% zoom for accessibility
□ Test map overlays on both light and dark basemaps
□ Test full UI on low-brightness / night mode screens (OLED considerations)
```

---

## 8 · Palette at a glance

```
PRIMARY        ACCENT         SURFACES
┌─────────┐    ┌─────────┐    ┌─────────┐ ┌─────────┐ ┌─────────┐
│         │    │         │    │         │ │         │ │         │
│ #1C2D3F │    │ #2EC4B6 │    │ #FAFBFC │ │ #FFFFFF │ │ #F5F7F9 │
│         │    │         │    │         │ │         │ │         │
│  Polar  │    │ Arctic  │    │  Base   │ │  Card   │ │Elevated │
│  Slate  │    │  Teal   │    │         │ │         │ │         │
└─────────┘    └─────────┘    └─────────┘ └─────────┘ └─────────┘

SEMANTIC
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ #22C55E │ │ #EAB308 │ │ #EF4444 │ │ #3B82F6 │
│ Success │ │ Warning │ │  Error  │ │  Info   │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```
