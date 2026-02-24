# buurt-check — Complete Visual Design Specification

> **Version:** 3.0 | **Last updated:** 2026-02-16
> **Design direction:** "Polar Frost" (Phase 1 authority)
> **Brand personality:** Confident, clear, empowering
> **Emotional target:** Calm confidence — "Someone serious did the work for me"
> **Canonical color source:** `frontend/src/styles/tokens.css` and `docs/palette.md`

This document specifies every visual element at pixel-level detail. A developer should be able to implement any screen from this spec alone, without design mockups. Every visual decision should reinforce the brand personality: confident (strong hierarchy, decisive color), clear (generous white space, editorial restraint), empowering (actionable outcomes, not raw data).

---

## Table of contents

0. [Phase 1 alignment addendum](#phase-1-alignment-addendum-2026-02-11)
1. [Main screen (search)](#1-main-screen-search)
2. [Loading screen](#2-loading-screen)
3. [Dossier screen](#3-dossier-screen)
4. [3D viewer container](#4-3d-viewer-container)
5. [Risk tile containers](#5-risk-tile-containers)
6. [Risk detail screen](#6-risk-detail-screen)
7. [Neighborhood snapshot container](#7-neighborhood-snapshot-container)
8. [Viewing checklist container](#8-viewing-checklist-container)
9. [Shortlist screen](#9-shortlist-screen)
10. [Compare screen](#10-compare-screen)
11. [PDF export flow](#11-pdf-export-flow)
12. [Settings screen](#12-settings-screen)
13. [Global button system](#13-global-button-system)
14. [Global icon system](#14-global-icon-system)
15. [Data visualization system](#15-data-visualization-system)
16. [Bottom tab bar](#16-bottom-tab-bar)
17. [Global top bar](#17-global-top-bar)
18. [Bottom sheets](#18-bottom-sheets)
19. [Toast & alert system](#19-toast--alert-system)
20. [Empty & error states](#20-empty--error-states)
21. [Success criteria for visual design](#21-success-criteria-for-visual-design)

---

## 1. Main screen (search)

The first screen every user sees. Its job: communicate the value prop in 3 seconds and make address entry frictionless.

### 1.1 Overall screen layout

```
┌─────────────────────────────────────────┐
│ ░░░░░░░░ STATUS BAR ░░░░░░░░░░░░░░░░░░ │ ← System status bar (device-controlled)
├─────────────────────────────────────────┤
│                                         │
│              44px top bar               │ ← Global top bar (see §17)
│                                         │
├─────────────────────────────────────────┤
│                                         │
│            80px top padding             │
│                                         │
│         ┌─────────────────┐             │
│         │   buurt-check   │             │ ← Wordmark: centered
│         │     logo        │             │
│         └─────────────────┘             │
│                                         │
│            16px gap                     │
│                                         │
│   "Paste an address. Know the truth."   │ ← Tagline: centered
│                                         │
│            32px gap                     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  📍  Postcode + house number    │    │ ← Address input field
│  └─────────────────────────────────┘    │
│                                         │
│            24px gap                     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ☀️  3D sunlight analysis       │    │ ← Value prop row 1
│  ├─────────────────────────────────┤    │
│  │  📊  Environmental risk cards   │    │ ← Value prop row 2
│  ├─────────────────────────────────┤    │
│  │  📋  Printable viewing brief    │    │ ← Value prop row 3
│  └─────────────────────────────────┘    │
│                                         │
│            32px gap                     │
│                                         │
│  RECENT                                 │ ← Section label (shown after first use)
│  ┌─────────────────────────────────┐    │
│  │  📍 Keizersgracht 123-II       │    │
│  │     1012 AB Amsterdam  · 2m ago │    │
│  ├─────────────────────────────────┤    │
│  │  📍 Prinsengracht 456          │    │
│  │     1016 HJ Amsterdam  · 1d ago│    │
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│ ░░░░░░░░ BOTTOM TAB BAR ░░░░░░░░░░░░░ │ ← Bottom navigation (see §16)
└─────────────────────────────────────────┘
```

### 1.2 Screen background

| Property | Value |
|----------|-------|
| Background color | `#FAFBFC` (Snow) |
| Full screen fill | Yes — edge to edge, including behind status bar |
| Safe area handling | Content respects `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` |

### 1.3 Wordmark

| Property | Value |
|----------|-------|
| Text | "buurt-check" |
| Font | Satoshi Black (900) |
| Size | 28px |
| Color | `#1C2D3F` (Charcoal) |
| Letter spacing | -0.03em |
| Alignment | Center horizontal |
| Position | 80px below top bar bottom edge |
| Hyphen rendering | Standard hyphen character, not en-dash |

Note: No logo icon/symbol for MVP — the wordmark IS the brand mark. If a compact icon is needed later (app icon, favicon), use a stylized "bc" monogram in Satoshi Black within a rounded square.

### 1.4 Tagline

| Property | Value |
|----------|-------|
| Text (EN) | "Paste an address. Know the truth." |
| Text (NL) | "Plak een adres. Ken de waarheid." |
| Font | Satoshi Regular (400) |
| Size | 15px |
| Line height | 22px |
| Color | `#637892` (Mid Gray / text-secondary) |
| Alignment | Center horizontal |
| Position | 16px below wordmark baseline |
| Max width | 280px (wraps to 2 lines if needed for NL) |

### 1.5 Address input field

The most important interactive element on this screen.

| Property | Value |
|----------|-------|
| Width | Full screen width minus 40px (20px margin each side) |
| Height | 56px |
| Background | `#FFFFFF` (White) |
| Border (default) | 2px solid `#E2E7ED` (Light Fog) |
| Border (focused) | 2px solid `#2EC4B6` (Electric Teal) |
| Border (error) | 2px solid `#EF4444` (Coral) |
| Border radius | 12px |
| Shadow (default) | None |
| Shadow (focused) | `0 0 0 4px rgba(46, 196, 182, 0.12)` — teal focus ring |
| Internal padding | Left: 48px (icon space) / Right: 16px / Top & Bottom: auto-centered |
| Position | 32px below tagline |

**Input field icon (left side):**

| Property | Value |
|----------|-------|
| Icon | Map pin (vertical pin with circle head) |
| Size | 20px × 20px |
| Stroke weight | 1.5px |
| Color (default) | `#8A9BB0` (Silver / text-tertiary) |
| Color (focused) | `#2EC4B6` (Electric Teal) |
| Position | Centered vertically, 16px from left edge of field |

**Input text:**

| Property | Value |
|----------|-------|
| Placeholder text (EN) | "Postcode + house number" |
| Placeholder text (NL) | "Postcode + huisnummer" |
| Placeholder font | Satoshi Regular (400), 15px |
| Placeholder color | `#8A9BB0` (Silver / text-tertiary) |
| Input text font | Satoshi Medium (500), 15px |
| Input text color | `#1C2D3F` (Charcoal / text-primary) |
| Cursor color | `#2EC4B6` (Electric Teal) |

**Input field loading state (after submit):**

| Property | Value |
|----------|-------|
| Map pin icon | Replaced by a circular spinner |
| Spinner size | 20px × 20px |
| Spinner color | `#2EC4B6` (Electric Teal) |
| Spinner stroke | 2px |
| Spinner animation | Rotate 360° every 800ms, linear, infinite |
| Input text | Shows confirmed address text, non-editable, `#637892` (Mid Gray) |
| Border | 2px solid `#2EC4B6` (stays teal during loading) |

**Input field error state:**

| Property | Value |
|----------|-------|
| Border | 2px solid `#EF4444` (Coral) |
| Focus ring | `0 0 0 4px rgba(239, 68, 68, 0.12)` |
| Error message text | Below field, 4px gap |
| Error font | Satoshi Regular (400), 13px |
| Error color | `#EF4444` (Coral) |
| Error icon | Small triangle-exclamation, 14px, inline before text |
| Example messages | "Address not found. Check the postcode and number." / "Adres niet gevonden. Controleer postcode en nummer." |

**Auto-formatting behavior:**
- Input accepts: "1012AB 1", "1012 AB 1", "1012ab1", "1012 ab 1"
- Display normalizes to: "1012 AB 1" (uppercase letters, space-separated)
- Postcode validation: 4 digits + 2 letters
- If user enters only postcode: show dropdown suggestion of matching house numbers (if API supports it), or prompt "Add house number" below field

### 1.6 Value proposition rows

Shown only on first launch or when there are no recent searches. Three horizontal rows explaining the app.

**Container:**

| Property | Value |
|----------|-------|
| Width | Full width minus 40px margins |
| Position | 24px below input field |
| Background | `#FFFFFF` (White) |
| Border | 1px solid `#E2E7ED` (Light Fog) |
| Border radius | 12px |
| Shadow | None |

**Individual row:**

| Property | Value |
|----------|-------|
| Height | 52px |
| Padding | Left: 16px, Right: 16px |
| Divider between rows | 1px solid `#E2E7ED`, inset 16px from left |

**Row icon:**

| Property | Value |
|----------|-------|
| Size | 24px × 24px |
| Style | Outlined, 1.5px stroke |
| Color | `#2EC4B6` (Electric Teal) |
| Position | Centered vertically, 16px from left edge |
| Icons per row | Row 1: Sun with rays / Row 2: Bar chart / Row 3: Clipboard with checkmark |

**Row text:**

| Property | Value |
|----------|-------|
| Font | Satoshi Medium (500) |
| Size | 14px |
| Line height | 20px |
| Color | `#1C2D3F` (Charcoal) |
| Position | Centered vertically, 12px right of icon |

### 1.7 Recent searches section

**Section label "RECENT":**

| Property | Value |
|----------|-------|
| Font | Satoshi Medium (500) |
| Size | 12px |
| Line height | 16px |
| Letter spacing | 0.04em |
| Text transform | Uppercase |
| Color | `#8A9BB0` (Silver / text-tertiary) |
| Position | 32px below value prop rows (or input field if value props hidden) |
| Left margin | 20px |

**Recent search list container:**

| Property | Value |
|----------|-------|
| Width | Full width minus 40px margins |
| Background | `#FFFFFF` (White) |
| Border | 1px solid `#E2E7ED` |
| Border radius | 12px |
| Shadow | None |
| Position | 8px below "RECENT" label |
| Max items | 10 (scrollable within container, or list extends and page scrolls) |

**Individual search row:**

| Property | Value |
|----------|-------|
| Height | 64px |
| Padding | Left: 16px, Right: 16px |
| Divider | 1px solid `#E2E7ED`, inset 48px from left (aligns with text, not icon) |
| Tap state | Background transitions to `#F0F3F6` (Cool Gray) for 150ms on press |

**Row layout:**

| Element | Property | Value |
|---------|----------|-------|
| Map pin icon | Size | 16px × 16px |
| Map pin icon | Color | `#8A9BB0` (Silver) |
| Map pin icon | Position | Centered vertically, 16px from left |
| Address text | Font | Satoshi Medium (500), 15px |
| Address text | Color | `#1C2D3F` (Charcoal) |
| Address text | Position | 12px right of icon, 14px from top of row |
| Postcode + city | Font | Satoshi Regular (400), 13px |
| Postcode + city | Color | `#637892` (Mid Gray) |
| Postcode + city | Position | 12px right of icon, 2px below address text baseline |
| Timestamp | Font | Satoshi Regular (400), 12px |
| Timestamp | Color | `#8A9BB0` (Silver) |
| Timestamp | Position | Right-aligned, centered vertically |
| Timestamp format | Relative | "2m ago", "1h ago", "1d ago", "3d ago", then "Jan 15" |

**Swipe-to-delete:**

| Property | Value |
|----------|-------|
| Reveal distance | 80px swipe-left |
| Delete background | `#EF4444` (Coral) |
| Delete icon | Trash can, 20px, white, centered in revealed area |
| Animation | Row slides left with spring physics, snaps at 80px threshold |

### 1.8 Success criteria for main screen

- SC-1a: Wordmark, tagline, and input field visible without scrolling on all phones ≥320px wide
- SC-1b: Input field focus state (teal border + focus ring) activates within 16ms of tap
- SC-1c: Address auto-formatting applies in real-time as user types
- SC-1d: Error state appears within 2s of submitting an invalid address
- SC-1e: Value prop rows disappear and recent searches appear after first successful address lookup
- SC-1f: Recent search tap loads dossier within same time budget as fresh search (<5s)
- SC-1g: Swipe-to-delete removes item with undo toast (see §19) within 200ms

---

## 2. Loading screen

### 2.1 Overall layout

```
┌─────────────────────────────────────────┐
│ ░░░░░░░░ STATUS BAR ░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│                                         │
│                                         │
│           64px top padding              │
│                                         │
│     Keizersgracht 123-II                │ ← Address confirmation
│     1012 AB Amsterdam                   │
│                                         │
│           48px gap                      │
│                                         │
│        ┌─────────────────┐              │
│        │                 │              │
│        │   [Building     │              │ ← Building assembly animation
│        │    animation    │              │    (180 × 160px canvas)
│        │    area]        │              │
│        │                 │              │
│        └─────────────────┘              │
│                                         │
│           32px gap                      │
│                                         │
│     ● Loading 3D neighborhood...        │ ← Progress text (changes)
│                                         │
│           12px gap                      │
│                                         │
│     ══════════════░░░░░░░░░░░░░░        │ ← Progress bar
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ ░░░░░░░░ BOTTOM TAB BAR ░░░░░░░░░░░░░ │
└─────────────────────────────────────────┘
```

### 2.2 Screen background

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` (White) — NOT Snow. Solid white to differentiate from the search screen and create a "clean slate" feeling |
| Transition from search screen | 300ms crossfade |

### 2.3 Address confirmation text

| Property | Value |
|----------|-------|
| Street + number | Satoshi Black (900), 24px, `#1C2D3F` (Charcoal) |
| Postcode + city | Satoshi Regular (400), 15px, `#637892` (Mid Gray) |
| Alignment | Center horizontal |
| Position | 64px below status bar bottom edge |
| Line spacing | 4px between street and postcode lines |

### 2.4 Building assembly animation

| Property | Value |
|----------|-------|
| Canvas size | 180px wide × 160px tall |
| Alignment | Center horizontal |
| Position | 48px below address text |
| Drawing style | Single continuous stroke, no fills |
| Stroke color | `#1C2D3F` (Charcoal) |
| Stroke weight | 2px |
| Line cap | Round |
| Animation sequence | Foundation (0–400ms) → Left wall (400–700ms) → Right wall (700–1000ms) → Roof (1000–1400ms) → Windows grid (1400–1800ms) → Door (1800–2000ms) |
| Easing per segment | `ease-out` — fast start, decelerating to end |
| Building shape | Dutch canal house silhouette: narrow, tall (3 floors), stepped gable top. Width ~80px, height ~140px within the canvas. |
| `prefers-reduced-motion` | Static outline (all segments visible immediately, no animation) |

### 2.5 Progress text

| Property | Value |
|----------|-------|
| Font | Satoshi Regular (400), 14px |
| Color | `#637892` (Mid Gray) |
| Alignment | Center horizontal |
| Position | 32px below animation canvas |
| Status dot | 6px circle, `#2EC4B6` (Electric Teal), 8px left of text, centered vertically |
| Status dot animation | Pulse opacity 0.4 → 1.0 → 0.4, 1.2s cycle, ease-in-out |
| Text transition | 200ms crossfade between messages |

**Progress message sequence:**

| Step | EN text | NL text | Timing |
|------|---------|---------|--------|
| 1 | "Finding building..." | "Gebouw zoeken..." | 0s (immediate) |
| 2 | "Loading 3D neighborhood..." | "3D-buurt laden..." | On BAG response |
| 3 | "Checking noise levels..." | "Geluidsniveaus controleren..." | On 3DBAG response |
| 4 | "Checking air quality..." | "Luchtkwaliteit controleren..." | On noise data |
| 5 | "Checking climate risks..." | "Klimaatrisico's controleren..." | On air data |
| 6 | "Calculating sunlight..." | "Zonlicht berekenen..." | On climate data |

**Failed step text:**

| Property | Value |
|----------|-------|
| Color | `#EAB308` (Warm Amber — not red, since it's a degradation not a failure) |
| Icon | Triangle warning, 14px, inline left of text |
| Text example | "⚠ Noise data temporarily unavailable" |
| Duration | Shows for 1.5s before advancing to next step |

### 2.6 Progress bar

| Property | Value |
|----------|-------|
| Width | 200px |
| Height | 3px |
| Alignment | Center horizontal |
| Position | 12px below progress text |
| Track color | `#E2E7ED` (Light Fog) |
| Fill color | `#2EC4B6` (Electric Teal) |
| Border radius | 1.5px (fully rounded) |
| Animation | Fills proportionally as each data source completes (6 steps = ~17% each) |
| Easing | `ease-out` per segment, no snapping |

### 2.7 Success criteria for loading screen

- SC-2a: Address confirmation text matches the submitted address exactly
- SC-2b: Building animation completes within 2000ms ±100ms
- SC-2c: Progress text updates reflect actual backend responses, not fake timers
- SC-2d: Failed data sources show amber warning for 1.5s then continue
- SC-2e: Transition to dossier screen begins within 500ms of all data loading (or timeout at 8s)
- SC-2f: Back navigation (hardware back button, swipe-back gesture) returns to search screen and cancels pending requests

---

## 3. Dossier screen

The primary content screen. A vertically scrolling intelligence briefing composed of distinct container sections. Organized by the **"house first, buurt second"** principle: all property-specific details appear before neighborhood context, so the user understands the house before seeing the surrounding area.

### 3.1 Overall screen layout

```
┌─────────────────────────────────────────┐
│ ░░ STATUS BAR ░░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────┤
│  Briefing          [EN|NL]    [👤]     │ ← Top bar (scrolls away)
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │   2D FOOTPRINT MAP              │    │ ← Building footprint (house-level)
│  └─────────────────────────────────┘    │
│                                         │
│  ⚠ Attention: 2 items need attention   │ ← ATTENTION SUMMARY
│                                         │
│  Keizersgracht 123-II            [🔖]  │ ← ADDRESS HEADER
│  1012 AB Amsterdam                      │
│  Built 1895 · 3 floors · Residential    │
│                                         │
│  [🔊 72] [🌿 84] [🌡️ 45] [☀️ 61]      │ ← SUMMARY STRIP (horizontal scroll)
│                                         │
│  THIS PROPERTY                          │ ← Section label
│  ┌─────────────────────────────────┐    │
│  │  Building facts                 │    │ ← BUILDING FACTS
│  └─────────────────────────────────┘    │
│                                         │
│  RISK ASSESSMENT                        │ ← Section label
│  ┌──────────┐  ┌──────────┐             │
│  │  NOISE   │  │   AIR    │             │ ← RISK TILES (2×2 grid)
│  │   72     │  │   84     │             │   (see §5 for full spec)
│  │ Moderate │  │  Good    │             │
│  └──────────┘  └──────────┘             │
│  ┌──────────┐  ┌──────────┐             │
│  │ CLIMATE  │  │ SUNLIGHT │             │
│  │   45     │  │   61     │             │
│  │ Moderate │  │ Moderate │             │
│  └──────────┘  └──────────┘             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Property warnings              │    │ ← PROPERTY WARNINGS
│  │  Soil info                      │    │ ← SOIL INFO
│  └─────────────────────────────────┘    │
│                                         │
│  NEIGHBORHOOD                           │ ← Section label (buurt transition)
│  ┌─────────────────────────────────┐    │
│  │  Livability                     │    │ ← LIVABILITY (Leefbaarometer)
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │         3D VIEWER CARD          │    │ ← 3D VIEWER CONTAINER
│  │     (see §4 for full spec)      │    │   (neighborhood spatial context)
│  │                                 │    │
│  │  ❄️ Winter 🌸 Spring ☀️ Sum 🍂 Aut │    │
│  │  06 ──────●────────────── 21    │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Sunlight analysis              │    │ ← SUNLIGHT CARD
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Neighborhood snapshot          │    │ ← NEIGHBORHOOD STATS (CBS)
│  │  (see §7 for full spec)         │    │   (see §7)
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Tier B signals                 │    │ ← TIER B (crime, energy)
│  └─────────────────────────────────┘    │
│                                         │
│  YOUR VIEWING CHECKLIST                 │ ← Section label
│  ┌─────────────────────────────────┐    │
│  │  Viewing questions              │    │ ← CHECKLIST CONTAINER
│  │  (see §8 for full spec)         │    │   (see §8)
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ [Add to Shortlist][Export Brief] │    │ ← ACTION BAR (fixed bottom)
│  └─────────────────────────────────┘    │
│                                         │
├─────────────────────────────────────────┤
│ ░░░░░░░░ BOTTOM TAB BAR ░░░░░░░░░░░░░ │
└─────────────────────────────────────────┘
```

**Ordering principle — "house first, buurt second":** The dossier is split into two phases. The first phase covers everything specific to the property itself (building facts, risk scores at this address, property warnings, soil). The second phase covers the surrounding neighborhood (livability, 3D spatial context, sunlight from surrounding geometry, CBS stats, tier B signals). This ensures the 2D footprint map (house-level, at the top) and the 3D viewer (buurt-level, after house sections) are never visible on screen simultaneously.

### 3.2 Dossier screen background

| Property | Value |
|----------|-------|
| Background | `#FAFBFC` (Snow) |
| Scroll behavior | Vertical, free scroll, momentum scrolling enabled |
| Overscroll | Elastic (iOS default) / Clamped (Android) |

### 3.3 Section labels

Used before each major dossier section (Risk Assessment, Neighborhood, Your Viewing Checklist).

| Property | Value |
|----------|-------|
| Font | Satoshi Medium (500) |
| Size | 12px |
| Line height | 16px |
| Letter spacing | 0.04em |
| Text transform | UPPERCASE |
| Color | `#637892` (Mid Gray / text-secondary) |
| Left padding | 20px from screen edge |
| Top margin | 48px from bottom of previous section container |
| Bottom margin | 12px to top of next container |

### 3.4 Address header container

Not in a card — it sits directly on the Snow background to feel like a page title.

| Property | Value |
|----------|-------|
| Width | Full width |
| Padding | 20px left/right, 16px top, 8px bottom |
| Background | Transparent (inherits Snow) |
| Top position | 8px below top bar |

**Address header elements:**

| Element | Font | Size | Weight | Color | Position |
|---------|------|------|--------|-------|----------|
| Street + number | Satoshi | 24px | Black (900) | `#1C2D3F` | Left-aligned, top of container |
| Postcode + city | Satoshi | 14px | Regular (400) | `#637892` | Left-aligned, 4px below street baseline |
| Building facts | Satoshi | 13px | Regular (400) | `#8A9BB0` | Left-aligned, 4px below postcode baseline |
| Bookmark icon | — | 24px | — | `#8A9BB0` (unsaved) / `#2EC4B6` filled (saved) | Right-aligned, vertically centered against street text |

**Building facts format:** "Built [year] · [floors] floors · [function]" — e.g., "Built 1895 · 3 floors · Residential". Separator is a middle dot (·) with spaces.

**Bookmark icon detail:**

| State | Icon style | Color | Background |
|-------|-----------|-------|------------|
| Not saved | Outlined bookmark, 1.5px stroke | `#8A9BB0` (Silver) | None |
| Saved | Filled bookmark | `#2EC4B6` (Electric Teal) | None |
| Tap area | — | — | 44 × 44px invisible touch target centered on icon |
| Tap feedback | Filled bookmark with 1.2× scale pulse (200ms, spring) then settles to 1.0× | `#2EC4B6` | — |

### 3.5 Summary strip (risk score pills)

A horizontal scrollable row of compact risk indicators.

**Strip container:**

| Property | Value |
|----------|-------|
| Width | Full width (edge to edge, pills scroll horizontally) |
| Height | 48px (pill height + vertical padding) |
| Padding | 20px left (first pill), 20px right (last pill) |
| Scroll | Horizontal, `scroll-snap-type: x mandatory`, hide scrollbar |
| Position | 12px below building facts text |
| Background | Transparent |
| Overflow | Hidden vertically, scroll horizontally |

**Individual pill:**

| Property | Value |
|----------|-------|
| Height | 36px |
| Min width | 80px |
| Padding | 8px left, 12px right |
| Background | `#F0F3F6` (Cool Gray / surface-recessed) |
| Border | None |
| Border radius | 18px (fully pill-shaped) |
| Gap between pills | 8px |
| Scroll snap | `scroll-snap-align: start` |
| Tap target | Entire pill is tappable (scrolls dossier to corresponding card) |
| Tap feedback | Background transitions to `#E6F9F7` (Soft Teal) for 200ms |

**Pill content layout:**

| Element | Property | Value |
|---------|----------|-------|
| Category icon | Size | 16px × 16px |
| Category icon | Color | Colored by severity (see risk colors) |
| Category icon | Position | Centered vertically, 8px from left edge |
| Score number | Font | Satoshi SemiBold (600), 14px |
| Score number | Color | Colored by severity |
| Score number | Position | Centered vertically, 6px right of icon |

**Pill icon assignments:**

| Category | Icon | Description |
|----------|------|-------------|
| Noise | Sound waves (3 concentric arcs radiating from a point) | 16px, 1.5px stroke |
| Air quality | Leaf (simple, slightly curved) | 16px, 1.5px stroke |
| Climate stress | Water drop with 2 heat lines rising above it | 16px, 1.5px stroke |
| Sunlight | Circle (sun body) with 8 short radiating lines | 16px, 1.5px stroke |
| Crime (Tier B) | Shield outline | 16px, 1.5px stroke |
| Energy (Tier B) | Lightning bolt | 16px, 1.5px stroke |

---

## 4. 3D viewer container

### 4.1 Viewer card (default state)

| Property | Value |
|----------|-------|
| Width | Full width minus 40px (20px margin each side) |
| Height | 40vh (40% of viewport height), min 240px, max 360px |
| Background | `#FAFBFC` (Snow — matching scene background) |
| Border | 1px solid `#E2E7ED` (Light Fog) |
| Border radius | 16px |
| Shadow | `0 2px 8px rgba(28, 45, 63, 0.06)` (Level 1) |
| Overflow | Hidden (3D canvas clips to card bounds) |
| Position | Within the neighborhood section, after livability card |
| Camera framing | Tight/isometric — buildings and ground plane only, no sky visible. Camera angle should fill the viewport with built geometry. Background color matches ground plane, not a sky gradient |

### 4.2 Viewer card loading state

Shown before Three.js initializes (0–3s).

| Property | Value |
|----------|-------|
| Background | `#F0F3F6` (Cool Gray) |
| Center element | Circular spinner, 32px diameter, 2.5px stroke, `#2EC4B6` (Teal) |
| Below spinner | "Loading 3D view..." in Satoshi Regular 13px, `#637892`, 8px below spinner |

### 4.3 Viewer control overlay — camera presets (top-left)

Three vertically stacked buttons in the top-left corner of the viewer card.

**Button cluster container:**

| Property | Value |
|----------|-------|
| Position | 12px from top-left corner of viewer card (inset) |
| Layout | Vertical stack, 4px gap between buttons |
| Z-index | Above 3D canvas |

**Individual camera preset button:**

| Property | Value |
|----------|-------|
| Size | 36px × 36px |
| Border radius | 10px |
| Background (inactive) | `rgba(255, 255, 255, 0.85)` — semi-transparent white |
| Background (active) | `#2EC4B6` (Electric Teal) |
| Border | None |
| Shadow | `0 1px 4px rgba(28, 45, 63, 0.10)` |
| Backdrop filter | `blur(8px)` (frosted glass effect behind semi-transparent bg) |

**Camera preset icons:**

| Preset | Icon | Size | Color (inactive) | Color (active) |
|--------|------|------|-------------------|----------------|
| Street level | Eye (simple: oval + circle pupil) | 18px | `#1C2D3F` | `#FFFFFF` |
| Balcony level | Building with upward arrow | 18px | `#1C2D3F` | `#FFFFFF` |
| Top-down | Downward arrow inside circle | 18px | `#1C2D3F` | `#FFFFFF` |

### 4.4 Viewer control overlay — utilities (top-right)

Two vertically stacked buttons in the top-right corner.

**Button styling:** Same as camera preset buttons (§4.3) — 36×36px, same background/shadow.

| Button | Icon | Size | Color | Behavior |
|--------|------|------|-------|----------|
| Fullscreen toggle | Two diagonal arrows (expand) / Four inward arrows (collapse) | 18px | `#1C2D3F` (inactive bg) | Opens 3D viewer in full device screen |
| Layer toggle | Three stacked diamond/square shapes | 18px | `#1C2D3F` (inactive bg) | Opens layer popover (see §4.5) |

### 4.5 Layer popover

Opens when user taps the layer toggle button. Appears anchored below the button.

| Property | Value |
|----------|-------|
| Width | 220px |
| Background | `#FFFFFF` |
| Border | 1px solid `#E2E7ED` |
| Border radius | 12px |
| Shadow | `0 8px 24px rgba(28, 45, 63, 0.10)` (Level 2) |
| Padding | 16px |
| Position | Anchored 4px below layer toggle button, right-aligned to button |
| Arrow/pointer | 8px triangle pointing up, aligned to button center, filled white with border |

**Popover content — layer toggles:**

Each layer toggle is a row:

| Property | Value |
|----------|-------|
| Row height | 40px |
| Layout | Icon (16px) + Label (flex-grow) + Toggle switch (right) |
| Label font | Satoshi Regular (400), 14px, `#1C2D3F` |
| Divider | 1px solid `#E2E7ED` between rows |

**Toggle switch component:**

| Property | Value |
|----------|-------|
| Width | 44px |
| Height | 24px |
| Track (off) | `#E2E7ED` (Light Fog) |
| Track (on) | `#2EC4B6` (Electric Teal) |
| Thumb | 20px circle, `#FFFFFF`, shadow `0 1px 2px rgba(0,0,0,0.15)` |
| Thumb position (off) | 2px from left |
| Thumb position (on) | 2px from right |
| Transition | 200ms ease-out |

**Layer options:**

| Layer | Icon (16px, 1.5px stroke) | Label (EN) | Label (NL) |
|-------|--------------------------|------------|------------|
| Noise | Sound waves | Noise overlay | Geluidskaart |
| Air quality | Leaf | Air quality | Luchtkwaliteit |
| Climate | Water drop + heat | Climate stress | Klimaatstress |

**Opacity slider (below toggles):**

| Property | Value |
|----------|-------|
| Label | "Overlay opacity" / "Overlay transparantie" in Satoshi Regular 12px, `#637892` |
| Position | 12px below last toggle row |
| Slider width | Full popover width minus 32px padding |
| Track | 2px, `#E2E7ED` |
| Filled track | 2px, `#2EC4B6` |
| Thumb | 14px circle, `#2EC4B6`, white 2px border |
| Range | 25%–75%, default 50% |
| Value label | Right-aligned, Satoshi Medium 12px, `#637892`, shows "50%" |

### 4.6 Shadow timeline control (bottom of viewer card)

Sits inside the viewer card, at the bottom, overlaying the 3D canvas.

**Timeline container:**

| Property | Value |
|----------|-------|
| Width | Full card width |
| Height | 88px |
| Background | `rgba(255, 255, 255, 0.92)` with `backdrop-filter: blur(12px)` |
| Border radius | 0 0 16px 16px (matches card bottom corners) |
| Position | Pinned to bottom of viewer card |
| Padding | 12px left/right, 8px top, 12px bottom |

**Season buttons row:**

| Property | Value |
|----------|-------|
| Layout | 4 buttons in a horizontal row, evenly distributed |
| Button width | Auto (content-dependent), min 72px |
| Button height | 32px |
| Button padding | 8px horizontal |
| Button background | Transparent |
| Button border radius | 8px |
| Button font | Satoshi Medium (500), 12px |
| Button text color (inactive) | `#637892` (Mid Gray) |
| Button text color (active) | `#2EC4B6` (Electric Teal) |
| Active indicator | 2px bottom border, `#2EC4B6`, below button text |
| Button tap area | Full 44px height (invisible extended target) |

**Season button content:**

| Season | Emoji | EN text | NL text | Date mapped to |
|--------|-------|---------|---------|----------------|
| Winter | ❄️ | Winter | Winter | December 21 |
| Spring | 🌸 | Spring | Lente | March 20 |
| Summer | ☀️ | Summer | Zomer | June 21 |
| Autumn | 🍂 | Autumn | Herfst | September 22 |

**Time slider:**

| Property | Value |
|----------|-------|
| Position | 8px below season buttons row |
| Width | Full container width minus 24px padding (12px each side) |
| Track height | 2px |
| Track color | `#E2E7ED` (Light Fog) |
| Filled track (left of thumb) | `#2EC4B6` (Electric Teal), 2px |
| Thumb | 16px diameter circle |
| Thumb fill | `#2EC4B6` (Electric Teal) |
| Thumb border | 3px solid `#FFFFFF` |
| Thumb shadow | `0 1px 4px rgba(28, 45, 63, 0.15)` |
| Touch target | 44px height invisible hit area centered on track |
| Range | 06:00 to 21:00 |
| Step | 15 minutes |

**Time labels on slider:**

| Element | Property | Value |
|---------|----------|-------|
| Start label "06:00" | Font | Satoshi Regular (400), 11px |
| Start label | Color | `#8A9BB0` (Silver) |
| Start label | Position | Left-aligned with track start, 2px below track |
| End label "21:00" | Same styling | Right-aligned with track end |
| Current time (below thumb) | Font | Satoshi SemiBold (600), 14px |
| Current time | Color | `#1C2D3F` (Charcoal) |
| Current time | Position | Centered below thumb, 4px below track |
| Hour tick marks | 4px tall vertical line, 1px wide, `#E2E7ED` | Every 3 hours (09, 12, 15, 18), above track |

### 4.7 Sunlight summary badge (top-right, inside viewport)

Floats inside the 3D viewport area, above the control buttons.

| Property | Value |
|----------|-------|
| Position | 12px from top of viewer card, 56px from right edge (below utility buttons cluster) |
| Height | 28px |
| Padding | 8px left, 10px right |
| Background | `rgba(255, 255, 255, 0.88)` |
| Backdrop filter | `blur(8px)` |
| Border radius | 14px (pill) |
| Border | None |
| Shadow | `0 1px 4px rgba(28, 45, 63, 0.10)` |
| Content | "☀️ 4.2h" — sun emoji (14px) + space + hours value |
| Text font | Satoshi SemiBold (600), 13px |
| Text color | `#1C2D3F` (Charcoal) |
| Tap behavior | Opens sunlight risk card detail view |

### 4.8 Sticky mini-bar (collapsed state)

When user scrolls past the 3D viewer card, it collapses to a persistent mini-bar.

| Property | Value |
|----------|-------|
| Height | 48px |
| Width | Full screen width |
| Position | Sticky, pinned below the global top bar (44px from screen top + status bar) |
| Background | `#FFFFFF` with `backdrop-filter: blur(12px)` |
| Border bottom | 1px solid `#E2E7ED` |
| Shadow | `0 2px 8px rgba(28, 45, 63, 0.06)` |
| Z-index | Above all dossier content, below modals |

**Mini-bar content layout:**

| Element | Property | Value |
|---------|----------|-------|
| Building silhouette | Size | 32px × 28px, simplified outline of the target building |
| Building silhouette | Color | `#1C2D3F` (Charcoal), 1.5px stroke, no fill |
| Building silhouette | Position | 16px from left, centered vertically |
| Sun time display | Text | "☀️ Dec 21 · 12:00" — current season date + time from slider |
| Sun time display | Font | Satoshi Medium (500), 13px |
| Sun time display | Color | `#637892` (Mid Gray) |
| Sun time display | Position | Centered horizontally |
| Expand icon | Icon | Chevron-down or expand arrows |
| Expand icon | Size | 20px |
| Expand icon | Color | `#2EC4B6` (Electric Teal) |
| Expand icon | Position | 16px from right, centered vertically |
| Tap behavior | Entire mini-bar | Scrolls back to viewer card and expands with spring animation (300ms) |

### 4.9 3D viewer success criteria

- SC-4a: Viewer card renders at correct dimensions on all target viewports (280px–420px height)
- SC-4b: All overlay controls (camera presets, utilities, timeline) remain tappable with ≥44px touch targets
- SC-4c: Layer popover opens within 100ms of tap, positioned correctly without viewport overflow
- SC-4d: Season button switch updates shadows and sunlight badge within 300ms
- SC-4e: Time slider drag produces shadow updates at <200ms latency per step
- SC-4f: Sticky mini-bar appears at correct scroll position and collapses/expands without visual glitch
- SC-4g: Frosted glass backgrounds render correctly on iOS (Safari) and Chrome (backdrop-filter support)
- SC-4h: Fallback for browsers without backdrop-filter: solid white at 95% opacity

---

## 5. Risk tile containers

### 5.1 Risk tiles 2×2 grid container

| Property | Value |
|----------|-------|
| Layout | CSS Grid, 2 columns |
| Grid template | `grid-template-columns: 1fr 1fr` |
| Gap | 12px (both row and column) |
| Width | Full width minus 40px (20px margin each side) |
| Position | 12px below "RISK ASSESSMENT" section label |

### 5.2 Individual risk tile

| Property | Value |
|----------|-------|
| Width | Fills grid cell (approximately (viewport - 52px) / 2) |
| Min height | 160px |
| Padding | 20px all sides |
| Background | `#FFFFFF` (White) |
| Border | 1px solid `#E2E7ED` (Light Fog) |
| Border radius | 16px |
| Shadow | `0 2px 8px rgba(28, 45, 63, 0.06)` (Level 1) |
| Cursor / tap feedback | Background transitions to `#FAFBFC` (Snow) on press, 150ms |

**Tile internal layout (top to bottom, specific measurements):**

```
┌──────────────────────────────┐
│ 20px padding top             │
│                              │
│  NOISE              ✓ Good   │ ← Row 1: Label + Severity badge
│                              │
│  16px gap                    │
│                              │
│           84                 │ ← Row 2: Score number (centered)
│                              │
│  12px gap                    │
│                              │
│  ═══════════════════●        │ ← Row 3: Score bar
│                              │
│  12px gap                    │
│                              │
│  Quiet residential st.  →    │ ← Row 4: Summary + chevron
│                              │
│ 20px padding bottom          │
└──────────────────────────────┘
```

**Row 1 — Category label + Severity badge:**

| Element | Property | Value |
|---------|----------|-------|
| Category label | Font | Satoshi Medium (500), 12px |
| Category label | Letter spacing | 0.04em |
| Category label | Text transform | UPPERCASE |
| Category label | Color | `#637892` (Mid Gray) |
| Category label | Position | Left-aligned, top of content area |
| Severity badge | Layout | Icon (16px) + 4px gap + text label |
| Severity badge | Position | Right-aligned, same baseline as category label |
| Severity icon | Size | 16px × 16px, 1.5px stroke |
| Severity icon | Per-level rendering | Good: circle with checkmark / Moderate: circle with horizontal dash / Poor: triangle with exclamation / Critical: circle with X |
| Severity text | Font | Satoshi Medium (500), 12px |
| Severity text/icon color | Per level | Good: `#22C55E` / Moderate: `#EAB308` / Poor: `#EF4444` / Critical: `#B91C1C` |

**Row 2 — Score number:**

| Property | Value |
|----------|-------|
| Font | Satoshi Black (900) |
| Size | 40px |
| Line height | 44px |
| Letter spacing | -0.03em |
| Color | Matches severity level color |
| Alignment | Center horizontal within tile |
| Position | 16px below Row 1 |

**Row 3 — Score bar:**

| Property | Value |
|----------|-------|
| Width | Full tile width minus 40px padding |
| Track | Full width, 2px height, `#E2E7ED` (Light Fog) |
| Track border radius | 1px |
| Fill | Left portion (score% of width), 2px height, severity color |
| Fill border radius | 1px |
| Endpoint dot | 8px diameter circle, severity color, centered on fill end point |
| Dot shadow | `0 1px 2px rgba(28, 45, 63, 0.10)` |
| Position | 12px below score number |

**Row 4 — Summary + chevron:**

| Element | Property | Value |
|---------|----------|-------|
| Summary text | Font | Satoshi Regular (400), 14px |
| Summary text | Color | `#1C2D3F` (Charcoal) |
| Summary text | Max lines | 1 |
| Summary text | Overflow | `text-overflow: ellipsis` |
| Summary text | Position | Left-aligned, 12px below score bar |
| Chevron icon | Icon | Right-pointing chevron (>) |
| Chevron icon | Size | 14px |
| Chevron icon | Color | `#8A9BB0` (Silver) |
| Chevron icon | Position | Right-aligned, centered vertically with summary text |
| Max text width | Tile width - 40px padding - 14px chevron - 8px gap |

### 5.3 Tile responsive behavior

| Viewport width | Tile layout | Notes |
|---|---|---|
| ≥ 375px | 2×2 grid (default) | Standard layout |
| 320–374px | Single column stack | Tiles become horizontal bars: 72px height, icon + label + score + severity inline |
| ≥ 768px (tablet) | 4 across, single row | `grid-template-columns: repeat(4, 1fr)` |

### 5.4 Horizontal bar variant (for 320px viewport)

When tiles stack single-column, each becomes a compact horizontal bar:

| Property | Value |
|----------|-------|
| Width | Full width minus 40px margins |
| Height | 72px |
| Padding | 16px all sides |
| Background | `#FFFFFF` |
| Border | 1px solid `#E2E7ED` |
| Border radius | 12px |
| Gap between bars | 8px |
| Layout | Horizontal: [Category icon 24px] [16px gap] [Label + summary vertical stack] [flex grow] [Score number + severity badge vertical stack, right-aligned] [chevron 14px] |

### 5.5 Risk tile success criteria

- SC-5a: All 4 tiles visible simultaneously without scrolling on viewports ≥ 375px wide
- SC-5b: Score bar endpoint dot position accurately reflects the 0-100 score (visually verified at scores 0, 25, 50, 75, 100)
- SC-5c: Severity colors, icons, and text labels all match for every score range
- SC-5d: Tile tap transitions to detail view within 300ms (shared element animation)
- SC-5e: Summary text truncation with ellipsis never exceeds 1 line
- SC-5f: Tiles degrade correctly to horizontal bars at 320px viewport

---

## 6. Risk detail screen

Full-screen view opened when tapping a risk tile.

### 6.1 Screen structure

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` (White) |
| Entry animation | Shared element transition — tile scales/expands to fill screen, 300ms, `cubic-bezier(0.4, 0, 0.2, 1)` |
| Exit animation | Reverse of entry (shrinks back to tile position), 250ms, `cubic-bezier(0.4, 0, 0.6, 1)` |
| Dismiss gesture | Swipe-right from left edge, or tap back button |
| Scroll | Vertical free scroll |

### 6.2 Back navigation bar

| Property | Value |
|----------|-------|
| Height | 48px |
| Background | `#FFFFFF` |
| Border bottom | 1px solid `#E2E7ED` |
| Position | Sticky at top (below status bar) |
| Left element | Back arrow icon (←), 20px, `#1C2D3F`, 16px from left edge |
| Right of arrow | Category name in Satoshi SemiBold (600), 16px, `#1C2D3F`, 12px right of arrow |
| Tap area | Arrow + label together = 44px height touch target |

### 6.3 Score display section (top of content)

| Property | Value |
|----------|-------|
| Padding | 32px top, 20px sides, 24px bottom |
| Alignment | Center |

| Element | Property | Value |
|---------|----------|-------|
| Score number | Font | Satoshi Black (900), 48px, severity color, centered |
| Severity label | Font | Satoshi SemiBold (600), 16px, severity color, centered, 4px below score |
| Score bar | Same as tile score bar but full width (minus 40px padding), 16px below severity label |

### 6.4 "What this means" container

| Property | Value |
|----------|-------|
| Section label | "WHAT THIS MEANS" — standard section label style (§3.3) |
| Container | No card — text sits directly on white background |
| Padding | 0px top (section label handles spacing), 20px sides |
| Text font | Satoshi Regular (400), 15px, line-height 26px (the generous `body-friendly` variant) |
| Text color | `#1C2D3F` (Charcoal) |
| Paragraph spacing | 16px between paragraphs |
| Bold emphasis | Satoshi SemiBold (600) — used sparingly for key numbers and thresholds |

### 6.5 "How it compares" container

A comparison bar chart in a recessed card.

**Card container:**

| Property | Value |
|----------|-------|
| Width | Full width minus 40px |
| Background | `#F0F3F6` (Cool Gray / surface-recessed) |
| Border | None |
| Border radius | 12px |
| Padding | 20px all sides |
| Position | 24px below last paragraph of "What this means" |

**Section label inside card:** "HOW IT COMPARES" in standard section label style, inside the card padding.

**Comparison bars (stacked vertically, 12px gap between each):**

| Element per bar row | Property | Value |
|---------------------|----------|-------|
| Label (left) | Font | Satoshi Regular (400), 13px |
| Label | Color | `#637892` (Mid Gray) |
| Label | Width | 120px fixed (truncate with ellipsis if longer) |
| Bar track | Height | 8px |
| Bar track | Background | `#E2E7ED` (Light Fog) |
| Bar track | Border radius | 4px |
| Bar track | Width | Remaining width after label and score |
| Bar fill | Height | 8px |
| Bar fill | Border radius | 4px |
| Bar fill | Width | Proportional to score (0-100 maps to 0-100% of track) |
| Bar fill color (this address) | `#2EC4B6` (Electric Teal) |
| Bar fill color (city average) | `#8A9BB0` (Silver) |
| Bar fill color (NL average) | `#D1D5DB` (lighter gray) |
| Bar fill color (WHO/EU limit) | `#EAB308` (Warm Amber) — the threshold line |
| Score (right) | Font | Satoshi Medium (500), 13px |
| Score | Color | `#1C2D3F` (Charcoal) |
| Score | Width | 32px fixed, right-aligned |

**Bar rows for noise card example:**

```
This address    ████████████████░░░░░░░  72
Amsterdam avg   ████████████░░░░░░░░░░░  58
NL average      ██████████░░░░░░░░░░░░░  45
WHO limit       ██████░░░░░░░░░░░░░░░░░  35
```

### 6.6 "Ask at your viewing" container

**Card container:**

| Property | Value |
|----------|-------|
| Width | Full width minus 40px |
| Background | `#E6F9F7` (Soft Teal / accent-light) |
| Border | None |
| Border radius | 12px |
| Padding | 20px all sides |
| Position | 24px below comparison chart card |

**Section header inside card:**

| Property | Value |
|----------|-------|
| Text (EN) | "Ask at your viewing" |
| Text (NL) | "Vraag bij de bezichtiging" |
| Font | Satoshi SemiBold (600), 14px |
| Color | `#2EC4B6` (Electric Teal — darker shade to contrast against light teal bg) |
| Letter spacing | 0.02em |
| Text transform | UPPERCASE |
| Icon | Speech bubble, 16px, `#2EC4B6`, 8px left of text |
| Position | Top of card content |

**Checklist questions:**

| Property | Value |
|----------|-------|
| Position | 16px below section header |
| Gap between questions | 12px |

**Individual question row:**

| Element | Property | Value |
|---------|----------|-------|
| Checkbox | Size | 22px × 22px |
| Checkbox (unchecked) | Background | `#FFFFFF` |
| Checkbox (unchecked) | Border | 2px solid `#2EC4B6` |
| Checkbox (unchecked) | Border radius | 4px |
| Checkbox (checked) | Background | `#2EC4B6` (Electric Teal) |
| Checkbox (checked) | Checkmark | White, 2px stroke, centered |
| Checkbox (checked) | Border | None |
| Checkbox transition | Duration | 150ms ease-out |
| Question text | Font | Satoshi Regular (400), 15px, line-height 22px |
| Question text | Color | `#1C2D3F` (Charcoal) |
| Question text | Position | 12px right of checkbox, top-aligned |
| Question text | Quoted speech | Wrapped in curly double quotes: "Which rooms face the A10?" |

**Bilingual toggle (below questions):**

| Property | Value |
|----------|-------|
| Position | 16px below last question |
| Layout | Globe icon (16px, `#2EC4B6`) + text link |
| Text (when viewing EN) | "Show in Dutch" / (when viewing NL) "Toon in het Engels" |
| Font | Satoshi Medium (500), 13px |
| Color | `#2EC4B6` (Electric Teal) |
| Text decoration | Underline |
| Behavior | Expands/collapses alternate language translations below each question |
| Alternate text styling | Satoshi Regular (400), 14px, `#637892` (Mid Gray), italic, 8px below English text, indented to align with question text (not checkbox) |

### 6.7 Source attribution (bottom of detail screen)

| Property | Value |
|----------|-------|
| Position | 32px below "Ask at viewing" card |
| Padding | 0 20px 32px 20px (generous bottom padding for scroll overreach) |

| Element | Property | Value |
|---------|----------|-------|
| Source line | Font | Satoshi Regular (400), 12px |
| Source line | Color | `#8A9BB0` (Silver) |
| Source line | Text | "Source: [dataset name] ([year])" |
| Update line | Font | Satoshi Regular (400), 12px |
| Update line | Color | `#8A9BB0` |
| Update line | Text | "Last updated: [month year]" |
| Disclaimer | Font | Satoshi Regular (400), 12px |
| Disclaimer | Color | `#8A9BB0` |
| Disclaimer icon | Triangle warning, 12px, `#8A9BB0`, inline |
| Disclaimer | Text | "⚠ Indicative data. Not a substitute for professional advice." / "⚠ Indicatieve gegevens. Geen vervanging voor professioneel advies." |
| Line spacing | 4px between each line |

### 6.8 Risk detail success criteria

- SC-6a: Shared element transition from tile to detail view completes without visual artifacts (no flash of unstyled content, no double-render)
- SC-6b: Score bar in detail view matches tile score bar value exactly
- SC-6c: Comparison bars render at correct proportional widths for all score values (tested at 0, 25, 50, 75, 100)
- SC-6d: Checkbox state changes persist within session (checked questions remain checked when navigating back and re-entering)
- SC-6e: Bilingual toggle expands/collapses within 200ms without layout jump
- SC-6f: Source attribution is always visible at bottom of scrollable content
- SC-6g: Back swipe-gesture works from left edge on both iOS and Android

---

## 7. Neighborhood snapshot container

### 7.1 Container card

| Property | Value |
|----------|-------|
| Width | Full width minus 40px (20px margins) |
| Background | `#FFFFFF` (White) |
| Border | 1px solid `#E2E7ED` |
| Border radius | 16px |
| Shadow | `0 2px 8px rgba(28, 45, 63, 0.06)` (Level 1) |
| Padding | 24px top, 20px sides, 20px bottom |
| Position | 12px below "NEIGHBORHOOD" section label |

### 7.2 Card header

| Element | Property | Value |
|---------|----------|-------|
| Buurt name | Font | Satoshi Bold (700), 18px |
| Buurt name | Color | `#1C2D3F` |
| Buurt name | Position | Left-aligned, top of card content |
| Buurt label | Font | Satoshi Regular (400), 13px |
| Buurt label | Color | `#637892` |
| Buurt label | Text | "Neighborhood · [Municipality name]" / "Buurt · [Gemeente naam]" |
| Buurt label | Position | 4px below buurt name |

### 7.3 Indicator rows

| Property | Value |
|----------|-------|
| Position | 20px below card header |
| Layout | Vertical list of rows |
| Divider | 1px solid `#F0F3F6` between rows (lighter than standard border — subtle) |

**Individual indicator row:**

| Property | Value |
|----------|-------|
| Height | 44px |
| Padding | 0 (inherits card side padding) |
| Layout | 3-column: [Label, flex-grow] [Value, right-aligned] [Dot indicator, right of value] |

| Element | Property | Value |
|---------|----------|-------|
| Indicator label | Font | Satoshi Regular (400), 14px |
| Indicator label | Color | `#637892` (Mid Gray) |
| Indicator label | Position | Left, centered vertically |
| Value | Font | Satoshi Medium (500), 15px |
| Value | Color | `#1C2D3F` (Charcoal) |
| Value | Position | Right of label, right-aligned within value column |
| Value | Formatting | Numbers: locale-formatted. Currency: €XX,XXX. Percentages: XX%. Distances: X.X km |

**Quartile dot indicator:**

| Property | Value |
|----------|-------|
| Position | 12px right of value, centered vertically |
| Layout | 4 dots in a horizontal row, 4px gap between dots |
| Dot size | 6px diameter circles |
| Filled dot | `#2EC4B6` (Electric Teal) |
| Empty dot | `#E2E7ED` (Light Fog) |
| Filled count | 1 dot = bottom quartile (Q1), 2 = Q2, 3 = Q3, 4 = top quartile (Q4) |

**Example row rendering:**

```
Population density     15,420 /km²    ●●●●
Average income         €38,200        ●●●○
Owner-occupied         34%            ●●○○
```

### 7.4 Source footer (inside card)

| Property | Value |
|----------|-------|
| Position | 12px below last indicator row |
| Font | Satoshi Regular (400), 11px |
| Color | `#8A9BB0` (Silver) |
| Text | "Source: CBS Wijken & Buurten 2024" |

### 7.5 Neighborhood snapshot success criteria

- SC-7a: Buurt name matches the official CBS name for the geolocated position
- SC-7b: All 8 default indicators render with correctly formatted values
- SC-7c: Quartile dots accurately reflect national distribution (verified against CBS national data)
- SC-7d: Rows align cleanly — value column right-edge aligned across all rows, dots column right-edge aligned
- SC-7e: Card fits within a single viewport height on standard phones (no internal scrolling) for 8 indicators

---

## 8. Viewing checklist container

### 8.1 Container card

| Property | Value |
|----------|-------|
| Width | Full width minus 40px (20px margins) |
| Background | `#FFFFFF` (White) |
| Border | 1px solid `#E2E7ED` |
| Border radius | 16px |
| Shadow | `0 2px 8px rgba(28, 45, 63, 0.06)` (Level 1) |
| Padding | 24px top, 20px sides, 24px bottom |
| Position | 12px below "YOUR VIEWING CHECKLIST" section label |

### 8.2 Card header

| Element | Property | Value |
|---------|----------|-------|
| Title (EN) | "Questions to bring to your viewing" |
| Title (NL) | "Vragen om mee te nemen naar de bezichtiging" |
| Font | Satoshi SemiBold (600), 17px |
| Color | `#1C2D3F` |
| Subtitle (EN) | "Based on the risks we found for this address" |
| Subtitle (NL) | "Op basis van de risico's die we voor dit adres vonden" |
| Subtitle font | Satoshi Regular (400), 14px |
| Subtitle color | `#637892` |
| Gap | 4px between title and subtitle |

### 8.3 Question groups

Each risk category with Moderate or worse score gets a question group.

**Group header:**

| Element | Property | Value |
|---------|----------|-------|
| Category icon | Size | 16px, severity color, inline |
| Category name | Font | Satoshi Medium (500), 13px |
| Category name | Color | Severity color |
| Category name | Text transform | UPPERCASE |
| Category name | Letter spacing | 0.03em |
| Layout | Icon + 6px gap + name, left-aligned |
| Position | 24px below previous group's last question, or 20px below card header for first group |

**Individual question:**

Same specification as §6.6 questions, but without the teal card background — questions sit on the white card.

| Property | Value |
|----------|-------|
| Checkbox | 22×22px, 2px border `#2EC4B6`, 4px radius, same checked state as §6.6 |
| Question text | Satoshi Regular (400), 15px, `#1C2D3F`, line-height 22px |
| Gap between questions | 12px |
| Position | 12px below group header |

### 8.4 Export prompt (bottom of card)

| Property | Value |
|----------|-------|
| Position | 24px below last question |
| Layout | Horizontal: arrow-right icon + text |
| Icon | Right arrow, 14px, `#2EC4B6` |
| Text (EN) | "Export as PDF to bring to your viewing" |
| Text (NL) | "Exporteer als PDF om mee te nemen" |
| Font | Satoshi Medium (500), 13px |
| Color | `#2EC4B6` (Electric Teal) |
| Tap behavior | Triggers PDF export flow (same as action bar "Export Briefing" button) |
| Tap area | Full row width, 44px height |

### 8.5 Viewing checklist success criteria

- SC-8a: Only risk categories with Moderate (40-69) or worse scores generate question groups
- SC-8b: "Good" risk categories (70-100) do not appear in the checklist
- SC-8c: All questions from the checklist match the questions shown in individual risk detail views
- SC-8d: Checkbox states sync between checklist card and risk detail views (checking in one updates the other)
- SC-8e: Export prompt tap opens the same flow as the action bar "Export Briefing" button

---

## 9. Shortlist screen

### 9.1 Empty state

| Property | Value |
|----------|-------|
| Background | `#FAFBFC` (Snow) |
| Center icon | Bookmark (outlined), 48px, `#8A9BB0` (Silver) |
| Icon position | Center horizontal, 40% from top |
| Title | "No saved addresses yet" / "Nog geen opgeslagen adressen" |
| Title font | Satoshi SemiBold (600), 18px, `#637892` |
| Title position | 16px below icon, center horizontal |
| Subtitle | "Search for an address and tap the bookmark to save it" |
| Subtitle font | Satoshi Regular (400), 14px, `#8A9BB0` |
| Subtitle position | 8px below title, center horizontal, max-width 260px |

### 9.2 Populated state

**List container:**

| Property | Value |
|----------|-------|
| Background | `#FAFBFC` (Snow) — no card wrapper, items are individual cards |
| Padding | 20px sides, 16px top |

**Saved address card:**

| Property | Value |
|----------|-------|
| Width | Full width minus 40px margins |
| Height | 88px |
| Background | `#FFFFFF` |
| Border | 1px solid `#E2E7ED` |
| Border radius | 12px |
| Shadow | `0 2px 8px rgba(28, 45, 63, 0.06)` |
| Padding | 16px all sides |
| Gap between cards | 12px |
| Tap feedback | Background → `#FAFBFC` for 150ms |

**Card internal layout:**

| Element | Property | Value |
|---------|----------|-------|
| Thumbnail | Size | 56px × 56px |
| Thumbnail | Border radius | 8px |
| Thumbnail | Content | Mini orthophoto map clip centered on address, or solid `#F0F3F6` with map pin icon if not cached |
| Thumbnail | Position | Left-aligned, centered vertically |
| Address text | Font | Satoshi SemiBold (600), 15px |
| Address text | Color | `#1C2D3F` |
| Address text | Position | 12px right of thumbnail, 16px from top |
| City text | Font | Satoshi Regular (400), 13px |
| City text | Color | `#637892` |
| City text | Position | 12px right of thumbnail, 4px below address baseline |
| Mini risk dots | Layout | 2×2 grid, each dot 10px diameter, 4px gap |
| Mini risk dots | Colors | Each dot colored by its category's severity |
| Mini risk dots | Position | Right-aligned, centered vertically |
| Mini risk dots | Order | Top-left: Noise, Top-right: Air, Bottom-left: Climate, Bottom-right: Sunlight |

**Swipe-to-delete:**

| Property | Value |
|----------|-------|
| Same as recent search swipe-to-delete (§1.7) | Coral background, trash icon, 80px threshold |

### 9.3 Compare button

| Property | Value |
|----------|-------|
| Width | Full width minus 40px margins |
| Height | 48px |
| Position | 24px below last saved address card |
| Style | Primary filled button (see §13 button system) |
| Text (EN) | "Compare" |
| Text (NL) | "Vergelijken" |
| Icon | Two columns (compare) icon, 18px, white, 8px left of text |
| Disabled state | When <2 addresses saved: 50% opacity, `#8A9BB0` background, non-interactive |

### 9.4 "Full" state (3 addresses saved)

When user tries to add a 4th address, show a bottom sheet (see §18 for bottom sheet spec):

| Element | Property | Value |
|---------|----------|-------|
| Sheet height | 30vh |
| Title | "Shortlist is full" / "Shortlist is vol" |
| Title font | Satoshi SemiBold (600), 18px |
| Body | "You can save up to 3 addresses. Remove one to add a new address." |
| Body font | Satoshi Regular (400), 15px, `#637892` |
| Button | "Got it" — secondary button style (see §13), full width, closes sheet |

### 9.5 Shortlist success criteria

- SC-9a: Saved addresses persist across app sessions (local storage)
- SC-9b: Mini risk dots display correct severity colors matching the dossier data
- SC-9c: Thumbnail renders within 500ms of card appearing (async load from cache)
- SC-9d: Compare button enables/disables correctly based on saved count
- SC-9e: "Full" bottom sheet appears within 200ms of attempting to save a 4th address

---

## 10. Compare screen

### 10.1 Screen layout

| Property | Value |
|----------|-------|
| Background | `#FAFBFC` (Snow) |
| Navigation | Back arrow (← Compare) in top bar — returns to shortlist |
| Layout | Horizontal scroll of synchronized columns |

### 10.2 Column structure

| Property | Value |
|----------|-------|
| Column width (2 addresses) | 50vw minus 10px (accounting for center gap) |
| Column width (3 addresses) | 50vw minus 10px — third column accessible via horizontal scroll |
| Gap between columns | 12px |
| Horizontal scroll | `scroll-snap-type: x mandatory` per column |
| Padding | 20px left for first column, 20px right for last column |

### 10.3 Column content (per address)

**Column header (sticky):**

| Property | Value |
|----------|-------|
| Height | 80px |
| Background | `#FFFFFF` with bottom border `1px solid #E2E7ED` |
| Position | Sticky at top, z-index above column content |
| Address text | Satoshi SemiBold (600), 14px, `#1C2D3F`, max 2 lines |
| City text | Satoshi Regular (400), 12px, `#637892` |
| Padding | 12px all sides |

**Score rows (vertically stacked per metric):**

| Property | Value |
|----------|-------|
| Row height | 80px |
| Padding | 12px |
| Background | `#FFFFFF` |
| Border bottom | 1px solid `#F0F3F6` |
| Category icon | 16px, severity color, top-left of row |
| Category label | Satoshi Medium (500), 11px, `#637892`, uppercase, 4px right of icon |
| Score number | Satoshi Black (900), 28px, severity color, centered in row |
| Score bar | Same as tile score bar, full row width minus 24px padding |
| Severity label | Satoshi Medium (500), 12px, severity color, centered below score bar |

**Difference highlighting:**

When scores differ by >15 points between columns for the same metric:

| Condition | Visual treatment |
|-----------|-----------------|
| Highest score (best) | Left border: 3px solid `#22C55E` (Clear Green) on the score row |
| Lowest score (worst) | Left border: 3px solid `#EAB308` (Warm Amber) on the score row |
| Middle score (if 3 addresses) | No border highlight |
| <15 point difference | No highlighting on any column for that row |

### 10.4 "Differences only" filter

| Property | Value |
|----------|-------|
| Position | Below column headers, full width, sticky |
| Style | Pill toggle button |
| Width | Auto (content-sized) |
| Height | 32px |
| Border radius | 16px |
| Background (off) | `#F0F3F6` |
| Background (on) | `#2EC4B6` |
| Text | "Differences only" / "Alleen verschillen" |
| Text font | Satoshi Medium (500), 12px |
| Text color (off) | `#637892` |
| Text color (on) | `#FFFFFF` |
| Behavior | Hides all metric rows where score spread is ≤15 points |

### 10.5 Compare success criteria

- SC-10a: Synchronized scroll keeps all columns aligned by metric row (maximum 2px vertical drift)
- SC-10b: Difference highlighting correctly identifies >15 point spreads
- SC-10c: "Differences only" filter shows/hides correct rows within 100ms
- SC-10d: Column headers remain sticky during vertical scroll
- SC-10e: Horizontal scroll snap lands cleanly on column boundaries

---

## 11. PDF export flow

Phase 1 renderer note: the export/report pipeline uses Three.js snapshots when available; interactive web rendering remains Three.js.

### 11.1 Configuration bottom sheet

See §18 for general bottom sheet spec. Specific content:

| Property | Value |
|----------|-------|
| Sheet height | 45vh |
| Padding | 24px all sides |

**Template selector:**

Two horizontal cards side by side:

| Property | Value |
|----------|-------|
| Card size | (sheet width - 48px padding - 12px gap) / 2 |
| Card height | 120px |
| Card background (unselected) | `#F0F3F6` |
| Card background (selected) | `#E6F9F7` (Soft Teal) |
| Card border (unselected) | 2px solid transparent |
| Card border (selected) | 2px solid `#2EC4B6` |
| Card border radius | 12px |
| Card content | Mini page illustration (40px), centered. Label below: "Quick Brief" / "Full Dossier" |
| Label font | Satoshi Medium (500), 13px |
| Label color | `#1C2D3F` |
| Sublabel | "1 page" / "3-4 pages" in Satoshi Regular (400), 11px, `#637892` |

**Shadow snapshots toggle:**

| Property | Value |
|----------|-------|
| Position | 20px below template selector |
| Layout | Standard toggle switch (§4.5) + label |
| Label | "Include 3D shadow analysis" / "Inclusief 3D schaduwanalyse" |
| Label font | Satoshi Regular (400), 14px, `#1C2D3F` |
| Default | ON |

**Language selector:**

| Property | Value |
|----------|-------|
| Position | 16px below shadow toggle |
| Style | Segmented control (same as top bar language toggle but larger) |
| Width | 160px |
| Height | 36px |
| Segment width | 80px each |
| Active segment bg | `#2EC4B6` |
| Active text | `#FFFFFF`, Satoshi SemiBold (600), 14px |
| Inactive segment bg | `#F0F3F6` |
| Inactive text | `#637892`, Satoshi Medium (500), 14px |
| Border radius | 10px |

**Generate button:**

| Property | Value |
|----------|-------|
| Position | 24px below language selector |
| Style | Primary button, full sheet width minus 48px padding (see §13.1) |
| Text | "Generate Briefing" / "Briefing genereren" |
| Icon | Download icon, 18px, white, 8px left of text |

### 11.2 PDF generation progress state

Bottom sheet expands to show progress. Template selector and options replaced by:

| Element | Property | Value |
|---------|----------|-------|
| Status icon | Document icon (32px) with circular progress ring around it |
| Progress ring | 40px diameter, 3px stroke, `#2EC4B6` fill, `#E2E7ED` track |
| Status text | "Rendering shadow analysis... [1/3]" / "Building your briefing..." |
| Status font | Satoshi Regular (400), 14px, `#637892` |
| Progress bar (below) | Full sheet width minus padding, 3px height, same style as loading screen (§2.6) |

### 11.3 PDF export success criteria

- SC-11a: Bottom sheet opens within 200ms of tapping "Export Briefing"
- SC-11b: Template selection updates visual state within 100ms
- SC-11c: Generate button is disabled (50% opacity) while no template is selected
- SC-11d: Progress ring fills proportionally to actual generation progress
- SC-11e: System share sheet opens within 500ms of PDF generation completing
- SC-11f: If Three.jsd fails, fallback generates within 8s and user is not shown an error

---

## 12. Settings screen

Accessed via profile icon (top-right of search screen).

### 12.1 Screen layout

| Property | Value |
|----------|-------|
| Background | `#FAFBFC` (Snow) |
| Navigation | Back arrow (← Settings) in top bar |
| Layout | Vertical list of setting groups in cards |

### 12.2 Settings groups

**Group card:**

| Property | Value |
|----------|-------|
| Width | Full width minus 40px margins |
| Background | `#FFFFFF` |
| Border | 1px solid `#E2E7ED` |
| Border radius | 12px |
| Shadow | None |
| Gap between groups | 16px |

**Setting row:**

| Property | Value |
|----------|-------|
| Height | 52px |
| Padding | 16px sides |
| Divider | 1px solid `#F0F3F6`, inset 16px from left |
| Label font | Satoshi Regular (400), 15px, `#1C2D3F` |
| Value/control | Right-aligned |

**Settings inventory:**

| Group | Setting | Control type | Default |
|-------|---------|-------------|---------|
| Preferences | Language | Segmented control (EN|NL) | System language |
| Preferences | Dark mode | Toggle switch | System setting |
| Preferences | Reduced motion | Toggle switch | System setting |
| Data | Clear recent searches | Destructive text button (red, see §13.4) | — |
| Data | Clear shortlist | Destructive text button | — |
| About | Version | Static text, right-aligned, `#8A9BB0` | "1.0.0" |
| About | Data sources | Chevron right → opens attribution screen | — |
| About | Privacy policy | Chevron right → opens in-app browser | — |
| About | Terms of use | Chevron right → opens in-app browser | — |

---

## 13. Global button system

### 13.1 Primary button

The main call-to-action. Used for: "Export Briefing", "Generate Briefing", "Compare".

| Property | Default | Pressed | Disabled |
|----------|---------|---------|----------|
| Height | 48px | 48px | 48px |
| Min width | 120px | — | — |
| Padding | 16px horizontal | — | — |
| Background | `#2EC4B6` (Electric Teal) | `#00796B` (10% darker) | `#8A9BB0` (Silver) |
| Border | None | None | None |
| Border radius | 12px | 12px | 12px |
| Shadow | None | None | None |
| Text font | Satoshi SemiBold (600), 15px | — | — |
| Text color | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| Text alignment | Center | — | — |
| Icon (optional) | 18px, white, 8px left of text | — | — |
| Opacity | 1.0 | 1.0 | 0.5 |
| Transition | Background color 150ms ease-out | — | — |
| Tap feedback | Scale 0.98× for 100ms, spring back | — | — |
| Cursor (web) | `pointer` | — | `not-allowed` |

### 13.2 Secondary button

Used for: "Add to Shortlist", "Got it" in sheets, secondary actions.

| Property | Default | Pressed | Disabled |
|----------|---------|---------|----------|
| Height | 48px | 48px | 48px |
| Min width | 120px | — | — |
| Padding | 16px horizontal | — | — |
| Background | `transparent` | `#E6F9F7` (Soft Teal) | `transparent` |
| Border | 2px solid `#2EC4B6` | 2px solid `#2EC4B6` | 2px solid `#8A9BB0` |
| Border radius | 12px | 12px | 12px |
| Text font | Satoshi SemiBold (600), 15px | — | — |
| Text color | `#2EC4B6` | `#00796B` | `#8A9BB0` |
| Icon (optional) | 18px, `#2EC4B6`, 8px left of text | — | `#8A9BB0` |
| Opacity | 1.0 | 1.0 | 0.5 |
| Tap feedback | Scale 0.98× for 100ms | — | — |

### 13.3 Tertiary button (text button)

Used for: "Show in Dutch", in-text links, minor actions.

| Property | Default | Pressed |
|----------|---------|---------|
| Height | Auto (fits text) |  — |
| Min tap area | 44px × 44px (invisible expanded target) | — |
| Background | `transparent` | — |
| Border | None | — |
| Text font | Satoshi Medium (500), 14px | — |
| Text color | `#2EC4B6` (Electric Teal) | `#00796B` |
| Text decoration | Underline (1px, `#2EC4B6`) | — |

### 13.4 Destructive button (text style)

Used for: "Clear recent searches", "Clear shortlist", delete confirmations.

| Property | Value |
|----------|-------|
| Same as tertiary button except: |  |
| Text color | `#EF4444` (Coral) |
| Text decoration | None |
| Pressed color | `#BF360C` (darker coral) |

### 13.5 Pill toggle button

Used for: "Differences only" filter, feature toggles.

| Property | Off | On |
|----------|-----|-----|
| Height | 32px | 32px |
| Padding | 12px horizontal | 12px horizontal |
| Background | `#F0F3F6` (Cool Gray) | `#2EC4B6` (Electric Teal) |
| Border radius | 16px (full pill) | 16px |
| Text font | Satoshi Medium (500), 12px | — |
| Text color | `#637892` | `#FFFFFF` |
| Transition | 200ms ease-out | — |

### 13.6 Action bar (dossier fixed bottom)

The sticky CTA bar at the bottom of the dossier screen.

| Property | Value |
|----------|-------|
| Width | Full screen width |
| Height | 64px + `env(safe-area-inset-bottom)` |
| Background | `#FFFFFF` |
| Shadow | `0 -4px 12px rgba(28, 45, 63, 0.06)` (upward shadow) |
| Border top | 1px solid `#E2E7ED` |
| Position | Fixed, bottom of screen, above tab bar |
| Z-index | Above dossier scroll content, below modals |
| Padding | 8px 20px |
| Layout | 2 buttons side by side, 12px gap |
| Left button | Secondary style: "Add to Shortlist" (or "Saved ✓" if saved) |
| Right button | Primary style: "Export Briefing" |
| Button heights | 48px each |
| Button widths | Each takes 50% of available width (minus gap) |

**"Saved" state for shortlist button:**

| Property | Value |
|----------|-------|
| Background | `#E6F9F7` (Soft Teal — lightly filled) |
| Border | 2px solid `#2EC4B6` |
| Text | "Saved ✓" / "Opgeslagen ✓" |
| Text color | `#2EC4B6` |
| Checkmark | Inline with text, 14px |
| Non-interactive | Button is still tappable (removes from shortlist on tap — show confirmation first) |

### 13.7 Button success criteria

- SC-13a: All buttons meet 44×44px minimum touch target
- SC-13b: Press state visual feedback appears within 16ms of touch
- SC-13c: Disabled buttons are visually distinct (50% opacity) and non-interactive
- SC-13d: Button text never truncates — tested with longest NL translations
- SC-13e: Action bar remains visible and tappable above the tab bar on all device sizes including those with home indicator bars

---

## 14. Global icon system

### 14.1 Icon specifications

All icons follow a unified visual language.

| Property | Value |
|----------|-------|
| Grid | 24px × 24px (default), drawn on a 1px sub-grid |
| Stroke weight | 1.5px |
| Stroke cap | Round |
| Stroke join | Round |
| Corner radius (where applicable) | 2px |
| Color (default) | `#1C2D3F` (Charcoal) |
| Color (secondary/inactive) | `#8A9BB0` (Silver) |
| Color (active/accent) | `#2EC4B6` (Electric Teal) |
| Color (on teal background) | `#FFFFFF` (White) |
| Optical alignment | Centered within 24px bounding box. Asymmetric icons (play, arrow) optically centered. |

### 14.2 Navigation icons

| Icon | Description | Sizes used | Where |
|------|-------------|------------|-------|
| Magnifying glass | Circle (14px) with diagonal line (6px) extending from bottom-right | 24px | Search tab |
| Document with lines | Rectangle (12×16px) with 3 horizontal lines inside (8px wide, 2px apart) | 24px | Briefing tab |
| Bookmark | Shield/bookmark shape: rectangle with pointed bottom (12×16px), 1.5px stroke | 24px | Shortlist tab, address header |
| Bookmark filled | Same shape, filled with current color | 24px | Saved state |
| Back arrow | Left-pointing chevron (<), 12px wide, 16px tall | 20px | Detail views, settings |
| Chevron right | Right-pointing chevron (>), 8px wide, 12px tall | 14px | List rows, summary tiles |
| Globe | Circle with 2 curved latitude lines and 1 longitude arc | 20px | Language toggle |
| Person | Circle head (6px) on rounded body (10px wide) | 24px | Profile/settings access |
| Gear | 6-tooth gear, inner circle, outer teeth at 60° intervals | 24px | Settings (if needed) |

### 14.3 Risk category icons

These are the most important icons in the app — they represent the 4 (or 6) risk categories and must be instantly distinguishable at 16px and 32px sizes.

| Icon | Description (detail) | 16px variant | 32px variant |
|------|---------------------|-------------|-------------|
| **Noise** (Sound waves) | 3 concentric arcs radiating from a point at bottom-left. Largest arc spans ~120°. 1.5px stroke. At 16px: 2 arcs only. | 2 arcs, 1px stroke | 3 arcs, 1.5px stroke |
| **Air quality** (Leaf) | Single leaf shape: tapered oval with a center vein line and 2 secondary veins branching at 30°. Slight curve to the right. | Simplified: oval + center line only | Full detail with secondary veins |
| **Climate stress** (Water + heat) | Teardrop water drop (bottom), 2 wavy heat lines rising above it (each 6px wide, 2px amplitude). | Drop + 1 heat line | Drop + 2 heat lines |
| **Sunlight** (Sun) | Circle (center, 8px diameter at 32px size) with 8 radiating lines (4px long, 2px gap from circle edge), evenly spaced at 45° intervals. | Circle + 4 lines (cardinal directions only) | Full 8 lines |
| **Crime** (Shield) | Rounded shield shape: top edge is straight, sides curve inward, bottom comes to a rounded point. Interior: checkmark. | Same simplified | Full with checkmark |
| **Energy** (Lightning bolt) | Classic zigzag bolt: 3 segments, angled right-left-right. Thick stroke (2px) for visibility. | Same | Same with 1.5px stroke |

### 14.4 Severity indicator icons

Small icons that accompany the text severity label in risk tiles and detail views.

| Severity | Icon | Description | Color token |
|----------|------|-------------|-------------|
| Good | ✓ in circle | 12px circle outline, 6px checkmark inside, both 1.5px stroke | `--color-risk-good` |
| Moderate | — in circle | 12px circle outline, 6px horizontal line inside | `--color-risk-moderate` |
| Poor | ▲ exclamation | 12px equilateral triangle outline, 4px vertical line + 2px dot inside | `--color-risk-poor` |
| Critical | ✕ in circle | 12px circle outline, 6px × inside (two crossed lines) | `--color-risk-critical` |

These are rendered at 16px with the icon centered within the bounding box.

### 14.5 Action icons

| Icon | Description | Default color | Sizes used |
|------|-------------|---------------|------------|
| Download/export | Downward arrow (8px long) landing into a tray (12px wide, 4px tall, open top) | `#FFFFFF` (on primary buttons) | 18px |
| Share | Square with upward arrow emerging from top edge (iOS-style share icon) | `#1C2D3F` | 20px |
| Plus | Vertical line + horizontal line crossing at center, each 10px | `#1C2D3F` | 20px |
| Columns (compare) | Two rectangles side by side (6px wide each, 12px tall, 4px gap) | `#FFFFFF` (on primary button) | 18px |
| Trash | Narrow can shape: lid on top, body tapered inward at bottom, 2 vertical lines inside | `#FFFFFF` (on delete bg) | 20px |
| Expand arrows | Two diagonal arrows pointing outward (top-right + bottom-left) | `#1C2D3F` | 18px |
| Collapse arrows | Four arrows pointing inward to center | `#1C2D3F` | 18px |
| Layers | 3 stacked parallelogram shapes (like a deck of cards from the side) | `#1C2D3F` | 18px |
| Eye (camera: street) | Horizontal oval (14px) with circle pupil (6px) centered | `#1C2D3F` (inactive) / `#FFFFFF` (active) | 18px |
| Building + arrow (camera: balcony) | Small building outline (10px wide, 12px tall) with upward arrow from roof | Same | 18px |
| Down-arrow circle (camera: top) | Circle (14px) with downward-pointing arrow inside | Same | 18px |
| Map pin | Inverted teardrop: circle top (8px), pointed bottom, 14px total height | `#8A9BB0` / `#2EC4B6` | 16px, 20px |
| Speech bubble | Rounded rectangle with small triangle tail at bottom-left | `#2EC4B6` | 16px |
| Triangle warning | Equilateral triangle outline with exclamation inside (line + dot) | `#EAB308` / `#8A9BB0` | 12px, 14px |

### 14.6 Icon success criteria

- SC-14a: All icons render crisply at their specified sizes on both 2× and 3× density displays
- SC-14b: Icons at 16px are still distinguishable from each other (tested with 5 users)
- SC-14c: Severity icons are distinguishable by shape alone (tested with colorblind simulation: protanopia, deuteranopia, tritanopia)
- SC-14d: All icons meet WCAG 3.0:1 non-text contrast against their backgrounds
- SC-14e: Icon stroke weight is consistently 1.5px across all icons (no visual weight mismatch)

---

## 15. Data visualization system

### 15.1 Score bar (used in tiles and detail views)

The primary data visualization throughout the app.

| Property | Value |
|----------|-------|
| Track width | 100% of parent container (minus padding) |
| Track height | 2px |
| Track color | `#E2E7ED` |
| Track border radius | 1px |
| Fill height | 2px |
| Fill color | Severity color of the score |
| Fill border radius | 1px |
| Fill width | `(score / 100) × track_width` |
| Endpoint dot diameter | 8px |
| Endpoint dot color | Same as fill (severity color) |
| Endpoint dot shadow | `0 1px 2px rgba(28, 45, 63, 0.10)` |
| Endpoint dot position | Centered on the end of the fill line |
| Animation | Fill width transitions over 600ms with ease-out on initial render |
| Dot animation | Fades in at 400ms (200ms before fill reaches it), opacity 0 → 1, 200ms |

### 15.2 Comparison bar chart (risk detail view)

Used in the "How it compares" section.

| Property | Value |
|----------|-------|
| Bar height | 8px |
| Bar border radius | 4px |
| Bar gap (between rows) | 16px |
| Label width | 120px (fixed, left-aligned) |
| Label font | Satoshi Regular (400), 13px, `#637892` |
| Score width | 32px (fixed, right-aligned) |
| Score font | Satoshi Medium (500), 13px, `#1C2D3F` |
| Track width | Container width minus label width minus score width minus 24px total gaps |
| Track height | 8px |
| Track color | `#E2E7ED` |
| Track border radius | 4px |
| Fill height | 8px |
| Fill border radius | 4px |
| Fill animation | Width transitions over 400ms, staggered 100ms per row, ease-out |

**Bar colors per row:**

| Row | Fill color |
|-----|-----------|
| This address | `#2EC4B6` (Electric Teal) |
| City average | `#637892` (Mid Gray) |
| NL average | `#8A9BB0` (Silver) |
| WHO/EU limit | `#EAB308` (Warm Amber) — dashed pattern: 4px dash, 4px gap |

The WHO/EU limit bar uses a **dashed fill** to distinguish it as a threshold rather than a measurement: CSS `background: repeating-linear-gradient(90deg, #EAB308 0 4px, transparent 4px 8px)`.

### 15.3 Quartile dots (neighborhood snapshot)

| Property | Value |
|----------|-------|
| Dot count | 4 |
| Dot diameter | 6px |
| Dot gap | 4px |
| Filled color | `#2EC4B6` (Electric Teal) |
| Empty color | `#E2E7ED` (Light Fog) |
| Total width | 4 × 6px + 3 × 4px = 36px |
| Layout | Horizontal row, left to right |
| Animation | Dots fill left-to-right with 80ms stagger on initial render, opacity 0 → 1 |

### 15.4 Summary pills (horizontal scroll)

Already specified in §3.5. Key visualization notes:

| Property | Value |
|----------|-------|
| Icon inside pill | 16px risk category icon, colored by severity |
| Score number | 14px SemiBold, colored by severity |
| Background | `#F0F3F6` (Cool Gray) — neutral regardless of severity |
| Tap feedback | Background flash to `#E6F9F7` (Soft Teal), 200ms |

### 15.5 Mini risk dots (shortlist cards)

2×2 grid of colored dots representing the 4 risk scores at a glance.

| Property | Value |
|----------|-------|
| Dot diameter | 10px |
| Dot gap | 4px |
| Grid size | 2×2 = 24px × 24px total |
| Dot colors | Each dot colored by its severity level |
| Dot border | 1px solid `rgba(255,255,255,0.5)` (subtle white border for separation on colored backgrounds) |
| Dot order | Top-left: Noise / Top-right: Air / Bottom-left: Climate / Bottom-right: Sunlight |

### 15.6 Parallel coordinates chart (compare view)

Used at the bottom of the compare screen for multi-metric comparison.

| Property | Value |
|----------|-------|
| Width | Full screen width minus 40px |
| Height | 200px |
| Background | `#FFFFFF` card with standard border and Level 1 shadow |
| Padding | 20px all sides |
| Chart area | Width minus padding, 160px height |

**Axes:**

| Property | Value |
|----------|-------|
| Count | 4 vertical axes (Noise, Air, Climate, Sunlight) |
| Spacing | Evenly distributed across chart width |
| Line | 1px solid `#E2E7ED`, full chart height |
| Label (top) | Satoshi Medium (500), 11px, `#637892`, centered above axis |
| Scale labels | "0" at bottom, "100" at top, Satoshi Regular (400), 10px, `#8A9BB0` |

**Data lines (per address):**

| Property | Value |
|----------|-------|
| Line width | 2px |
| Line cap | Round |
| Address 1 color | `#2EC4B6` (Electric Teal) |
| Address 2 color | `#EAB308` (Warm Amber) |
| Address 3 color | `#7C4DFF` (Purple — not in main palette, reserved for compare) |
| Data points | 8px circles at each axis intersection, filled with line color, white 2px border |
| Legend | Below chart, 3 rows: colored line segment (16px) + address text, Satoshi Regular 12px |

### 15.7 Progress ring (PDF generation)

| Property | Value |
|----------|-------|
| Diameter | 40px |
| Stroke width | 3px |
| Track color | `#E2E7ED` |
| Fill color | `#2EC4B6` |
| Rotation start | 12 o'clock (top) |
| Direction | Clockwise |
| Animation | `stroke-dasharray` transition, linear, matches actual progress |
| Center content | Document icon, 20px, `#1C2D3F` |

### 15.8 Visualization success criteria

- SC-15a: Score bars accurately represent score values proportionally (0% fill at score 0, 100% fill at score 100)
- SC-15b: Comparison bar chart rows align labels, bars, and scores on consistent columns across all rows
- SC-15c: Quartile dots match CBS national quartile calculations (verified with sample addresses)
- SC-15d: Parallel coordinates chart data points are positioned proportionally on each axis
- SC-15e: All visualization animations complete within their specified durations and respect `prefers-reduced-motion`
- SC-15f: WHO/EU limit bar dashed pattern is visually distinguishable from solid bars at all sizes
- SC-15g: Chart colors remain distinguishable in dark mode and under colorblind simulation

---

## 16. Bottom tab bar

### 16.1 Specification

| Property | Value |
|----------|-------|
| Height | 56px (content area) + `env(safe-area-inset-bottom)` for devices with home indicator |
| Width | Full screen width |
| Position | Fixed at screen bottom, above system home indicator |
| Background | `rgba(255, 255, 255, 0.92)` with `backdrop-filter: blur(20px)` |
| Border top | 1px solid `#E2E7ED` |
| Z-index | Above all screen content, below modals and bottom sheets |

### 16.2 Tab items

| Property | Value |
|----------|-------|
| Count | 3 |
| Layout | Evenly distributed across full width |
| Tab width | 33.33% of bar width |
| Tap area | Full tab width × 56px height |

**Per-tab content (vertically stacked, centered):**

| Element | Property | Value |
|---------|----------|-------|
| Icon | Size | 24px × 24px |
| Icon (inactive) | Color | `#8A9BB0` (Silver) |
| Icon (active) | Color | `#2EC4B6` (Electric Teal) |
| Label | Font | Satoshi Medium (500), 11px |
| Label (inactive) | Color | `#8A9BB0` |
| Label (active) | Color | `#2EC4B6` |
| Gap | Icon-to-label | 2px |
| Badge (shortlist count) | 16px circle, `#EF4444` (Coral) background, white text 10px Bold, positioned -4px top-right of icon |

### 16.3 Tab bar fallback (no backdrop-filter)

For browsers that don't support `backdrop-filter`:

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` (solid white, 100% opacity) |
| Border top | 1px solid `#E2E7ED` |

---

## 17. Global top bar

### 17.1 Specification

| Property | Value |
|----------|-------|
| Height | 44px (content area, below status bar) |
| Width | Full screen width |
| Position | Sticky at top of each screen (below system status bar) |
| Background (scroll position 0) | Transparent |
| Background (scrolled) | `rgba(255, 255, 255, 0.92)` with `backdrop-filter: blur(12px)` |
| Background transition | 200ms ease-out |
| Border bottom (scroll position 0) | None |
| Border bottom (scrolled) | 1px solid `#E2E7ED` |
| Padding | 0 16px |

### 17.2 Content layout

| Element | Property | Value |
|---------|----------|-------|
| Left: Screen title | Font | Satoshi Bold (700), 18px |
| Screen title | Color | `#1C2D3F` |
| Screen title | Vertical align | Center |
| Right: Language toggle | Type | Segmented control |
| Language toggle | Width | 80px (40px per segment) |
| Language toggle | Height | 28px |
| Language toggle | Border radius | 8px |
| Language toggle | Background | `#F0F3F6` |
| Active segment | Background | `#2EC4B6` |
| Active segment text | Color | `#FFFFFF` |
| Active segment text | Font | Satoshi SemiBold (600), 12px |
| Inactive segment text | Color | `#637892` |
| Inactive segment text | Font | Satoshi Medium (500), 12px |
| Far right (search screen only): Profile icon | 24px person icon, `#637892`, 44×44px tap target |

---

## 18. Bottom sheets

### 18.1 General bottom sheet specification

| Property | Value |
|----------|-------|
| Background | `#FFFFFF` |
| Border radius | 24px 24px 0 0 (top corners only) |
| Shadow | `0 -8px 32px rgba(28, 45, 63, 0.12)` |
| Handle | 36px wide × 4px tall, `#D1D5DB`, centered, 8px from top edge, border-radius 2px |
| Backdrop | `rgba(28, 45, 63, 0.4)` overlay behind sheet |
| Backdrop tap | Dismisses sheet |
| Entry animation | Slides up from bottom, 350ms, spring (stiffness: 400, damping: 30) |
| Exit animation | Slides down, 250ms, ease-in |
| Drag-to-dismiss | Drag handle downward past 30% of sheet height triggers dismiss |
| Padding | 24px all sides (below handle) |
| Max height | 90vh |

---

## 19. Toast & alert system

### 19.1 Toast notifications

Non-blocking messages that appear at the bottom of the screen, above the tab bar.

| Property | Value |
|----------|-------|
| Width | Full width minus 40px |
| Height | Auto (content-dependent), min 48px |
| Background | `#1C2D3F` (Charcoal) |
| Border radius | 12px |
| Padding | 12px 16px |
| Position | 8px above tab bar, centered horizontally |
| Text font | Satoshi Medium (500), 14px |
| Text color | `#FFFFFF` |
| Action button (optional) | "Undo" text, Satoshi SemiBold (600), 14px, `#57D4C8` (brighter teal for dark bg) |
| Entry animation | Slide up from bottom, 250ms, spring |
| Auto-dismiss | 4 seconds (6 seconds if has action button) |
| Dismiss gesture | Swipe down |
| Max visible toasts | 1 (new toast replaces current) |

**Toast use cases:**

| Event | Message | Action |
|-------|---------|--------|
| Added to shortlist | "Added to shortlist" / "Toegevoegd aan shortlist" | "View" → switches to Saved tab |
| Removed from shortlist | "Removed from shortlist" / "Verwijderd van shortlist" | "Undo" → re-adds |
| Recent search deleted | "Search removed" / "Zoekopdracht verwijderd" | "Undo" → re-adds |
| PDF generated | "Briefing ready" / "Briefing gereed" | "Share" → opens share sheet |
| Network error | "Connection lost. Retrying..." / "Verbinding verloren. Opnieuw proberen..." | None |

### 19.2 Alert dialogs

Blocking confirmation dialogs for destructive actions.

| Property | Value |
|----------|-------|
| Backdrop | `rgba(28, 45, 63, 0.4)` |
| Card width | 300px |
| Card background | `#FFFFFF` |
| Card border radius | 16px |
| Card shadow | Level 3 |
| Card padding | 24px |
| Title font | Satoshi SemiBold (600), 17px, `#1C2D3F` |
| Body font | Satoshi Regular (400), 15px, `#637892` |
| Button layout | Horizontal, right-aligned, 12px gap |
| Cancel button | Tertiary style (text button), `#637892` |
| Confirm button | If destructive: text button in `#EF4444`. If non-destructive: primary button. |
| Entry animation | Fade in + scale from 0.95 → 1.0, 200ms |

---

## 20. Empty & error states

### 20.1 Empty state template

Used for: Shortlist empty, no results, first-time screens.

| Property | Value |
|----------|-------|
| Centered icon | 48px, `#8A9BB0` |
| Title | Satoshi SemiBold (600), 18px, `#637892`, centered, 16px below icon |
| Subtitle | Satoshi Regular (400), 14px, `#8A9BB0`, centered, 8px below title, max-width 260px |
| Optional action button | Secondary button style, 16px below subtitle |

### 20.2 Error state template

Used for: Network errors, API timeouts, address not found.

| Property | Value |
|----------|-------|
| Centered icon | Triangle warning, 48px, `#EAB308` (Warm Amber — not red, errors are not the user's fault) |
| Title | Satoshi SemiBold (600), 18px, `#1C2D3F`, centered |
| Subtitle | Satoshi Regular (400), 14px, `#637892`, centered, max-width 280px |
| Retry button | Primary button, "Try again" / "Opnieuw proberen" |

**Error variations:**

| Error type | Title | Subtitle | Button |
|-----------|-------|----------|--------|
| Address not found | "Address not found" | "Check the postcode and house number, then try again." | "Try again" |
| Network error | "No connection" | "Check your internet connection and try again." | "Retry" |
| API timeout | "Taking too long" | "The data sources are slow right now. Try again in a moment." | "Retry" |
| Partial data failure (in-card) | N/A — shown within the specific risk tile | "Data temporarily unavailable" in tile, muted gray style | None — other cards still work |

### 20.3 Partial data failure (in risk tile)

When a specific data source fails, the corresponding risk tile shows a degraded state:

| Property | Value |
|----------|-------|
| Background | `#F0F3F6` (Cool Gray — recessed, not white) |
| Border | 1px solid `#E2E7ED` |
| Category label | Normal styling (still shows the category name) |
| Score number | Replaced by "—" dash, 40px, `#8A9BB0` |
| Severity badge | Hidden |
| Score bar | Hidden |
| Summary text | "Data temporarily unavailable" / "Data tijdelijk niet beschikbaar" |
| Summary text | Satoshi Regular (400), 14px, `#8A9BB0` |
| Tap behavior | Disabled — no detail view available |
| Opacity | 0.7 (entire tile) |

### 20.4 Empty & error success criteria

- SC-20a: Every screen has a designed empty state (no blank screens)
- SC-20b: Every API-dependent component has a designed error state
- SC-20c: Partial failures never block the full dossier — other sections remain functional and interactive
- SC-20d: Error states show user-friendly language (no technical error codes, no stack traces)
- SC-20e: Retry buttons actually retry the failed request (not reload the page)

---

## 21. Success criteria for visual design (comprehensive)

### Layout & spacing

| ID | Criteria |
|---|---|
| VS-1 | All screen margins, padding, and gaps match the 8pt grid specification (4pt half-steps permitted) |
| VS-2 | No element overlaps another element at any viewport width from 320px to 1440px |
| VS-3 | No horizontal scroll on any screen (except intentional horizontal scroll regions: summary pills, compare columns) |
| VS-4 | All cards have consistent border radius (16px), shadow (Level 1), and border (1px #E2E7ED) unless explicitly specified otherwise |

### Color

| ID | Criteria |
|---|---|
| VS-5 | All text-on-background combinations meet WCAG AA contrast (4.5:1 for normal text, 3.0:1 for large text) in both light and dark modes |
| VS-6 | Risk severity is communicated through 4 channels simultaneously (color, icon shape, text label, number) — no channel is sole communicator |
| VS-7 | The only accent color used anywhere in the app is teal (`#2EC4B6` light / `#26A69A` dark). No other hue appears except in risk severity indicators. |
| VS-8 | Dark mode colors match the mapping table exactly — no light-mode colors leak into dark mode |

### Typography

| ID | Criteria |
|---|---|
| VS-9 | Satoshi is the only font used throughout the app (no secondary fonts, no system font fallback visible) |
| VS-10 | Font weights are limited to: Regular (400), Medium (500), SemiBold (600), Bold (700), Black (900) — no Light or Thin |
| VS-11 | No text in the app is smaller than 11px (the micro label size) |
| VS-12 | All uppercase text uses letter-spacing ≥0.03em |
| VS-13 | Risk explanation text ("body-friendly" variant) uses 26px line height, not 24px — verified |

### Icons

| ID | Criteria |
|---|---|
| VS-14 | All icons use 1.5px stroke weight consistently |
| VS-15 | All risk category icons are visually distinct from each other at 16px size |
| VS-16 | All severity icons are distinguishable by shape alone (colorblind-safe) |
| VS-17 | No emoji is used in the UI except in the season buttons (❄️🌸☀️🍂) — all other icons are custom SVG |

### Buttons

| ID | Criteria |
|---|---|
| VS-18 | Primary, secondary, and tertiary button styles are visually distinct and used consistently |
| VS-19 | All interactive elements show visual feedback within 16ms of touch/click |
| VS-20 | No button text wraps to 2 lines in either EN or NL |
| VS-21 | All buttons have ≥44×44px touch targets |

### Containers

| ID | Criteria |
|---|---|
| VS-22 | All container cards use the specified elevation system (Level 0, 1, 2, or 3) — no ad-hoc shadows |
| VS-23 | The 3D viewer card is the only container that spans more than 50% of viewport height |
| VS-24 | Bottom sheets always use 24px top corner radius and include the 36×4px drag handle |
| VS-25 | The action bar is always visible and correctly positioned above the tab bar with proper safe area insets |

### Visualization

| ID | Criteria |
|---|---|
| VS-26 | Score bars render at exactly 2px height with 8px endpoint dots — not thicker, not thinner |
| VS-27 | Comparison bar charts use the correct color assignments (teal for address, gray for averages, amber dashed for thresholds) |
| VS-28 | All data visualizations animate on initial render and respect `prefers-reduced-motion` |
| VS-29 | The parallel coordinates chart in compare view uses the correct 3-color system (teal, amber, purple) |

### Cross-cutting

| ID | Criteria |
|---|---|
| VS-30 | The entire app can be navigated and all content read by VoiceOver (iOS) and TalkBack (Android) |
| VS-31 | All animations collapse to instant state changes when `prefers-reduced-motion` is enabled |
| VS-32 | Language toggle (EN/NL) is visible on every screen and switches all visible text within 300ms |
| VS-33 | No hardcoded text appears anywhere — 100% of strings come from i18n files |
| VS-34 | The visual design is tested and verified on: iPhone SE (375×667), iPhone 14 Pro (393×852), iPhone 14 Pro Max (430×932), Samsung Galaxy S21 (360×800), iPad Air (820×1180) |
