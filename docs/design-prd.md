# buurt-check — Design System & UI/UX Product Requirements Document

> **Version:** 1.0 | **Last updated:** 2026-02-09
> **Design direction:** "Polar Frost" — trusted, calm, data-first clarity
> **Companion to:** buurt-check Product Requirements Document v2.0 (2026-02-06)

---

## Phase 1 alignment addendum (2026-02-11)

This design PRD is aligned to `docs/spec-baseline.md`.

- Architecture migration is deferred (`D1-1`).
- Visual authority is Polar Frost (`D2-2`).
- forge3 is report-renderer scope only; web rendering remains Three.js (`D3-2R`).
- PDF remains dual-template (`quick_brief`, `full_dossier`) (`D5-1`).
- Feature delivery labels and requirement ownership are defined in `docs/spec-baseline.md` sections 3 and 4.

Where legacy values in this document conflict with the addendum, follow `docs/spec-baseline.md` and `frontend/src/styles/tokens.css`.

---

## Table of contents

0. [Phase 1 alignment addendum](#phase-1-alignment-addendum-2026-02-11)
1. [Design philosophy](#1-design-philosophy)
2. [Design system foundation](#2-design-system-foundation)
3. [Navigation & information architecture](#3-navigation--information-architecture)
4. [Screen-by-screen specification](#4-screen-by-screen-specification)
5. [3D viewer design](#5-3d-viewer-design)
6. [Risk card system](#6-risk-card-system)
7. [Neighborhood snapshot](#7-neighborhood-snapshot)
8. [Shortlist & compare](#8-shortlist--compare)
9. [PDF viewing briefing](#9-pdf-viewing-briefing)
10. [Bilingual system](#10-bilingual-system)
11. [Animation & micro-interactions](#11-animation--micro-interactions)
12. [Accessibility specification](#12-accessibility-specification)
13. [Dark mode](#13-dark-mode)
14. [Responsive behavior](#14-responsive-behavior)
15. [Performance requirements](#15-performance-requirements)
16. [Implementation requirements](#16-implementation-requirements)
17. [Success criteria](#17-success-criteria)
18. [Design risks & mitigations](#18-design-risks--mitigations)

---

## 1. Design philosophy

### Core principle

buurt-check must feel like a beautifully designed intelligence briefing prepared by a trusted advisor. It communicates: *"We've done serious research — here's exactly what you need to know, and exactly what to do with it."*

### Design pillars

**Pillar 1 — Editorial restraint.** White space is the primary design material. A near-monochromatic palette with a single teal accent means that when color appears — in risk indicators, the 3D viewer highlight, CTAs — it carries maximum informational weight. Every element earns its place.

**Pillar 2 — Data as narrative.** The dossier reads like a story, not a dashboard. Section transitions guide the user from context (building facts, 3D view) through analysis (risk cards, neighborhood stats) to action (viewing checklist, PDF export). Conversational copy in plain English/Dutch removes jargon without sacrificing precision. Risk data is always followed by "so what?" — what it means for the buyer and what to ask at the viewing.

**Pillar 3 — The 3D window into reality.** The UI outside the 3D viewer is curated, editorial, restrained. The 3D viewer itself renders the actual neighborhood with photorealistic orthophoto roofs, procedural period-appropriate facades, and real sunlight simulation. This contrast is intentional: the clean interface frames the realistic 3D view, making it more impactful; the realistic 3D view validates the app's data authority. Neither element would work as well alone.

**Pillar 4 — Actionability over information.** Every data point connects to a decision. Risk scores aren't abstract numbers — they're paired with plain-language consequences and specific questions to ask at the viewing. The entire dossier funnels toward the "Viewing Checklist" and the PDF export.

### Design lineage

This direction synthesizes three proven design traditions:

- **Scandinavian data elegance** (Hemnet, Shadowmap): Monochromatic restraint, editorial typography, trust through quality
- **Dutch institutional clarity** (ING Lion system, NS Nessie, Rabobank): Systematic precision, warm neutrals, confidence without coldness
- **Consumer accessibility** (Tikkie's clarity, Apple Health's categorization): Plain language, intuitive interaction patterns, emotional resonance through simplicity

---

## 2. Design system foundation

### 2.1 Color palette — Light mode

The palette is built on cool charcoal and warm whites, with electric teal as the sole accent. Risk communication uses a four-step severity scale that works for colorblind users when combined with text labels and icons.

#### Primary colors

| Token | Name | Hex | RGB | Usage | WCAG on white |
|-------|------|-----|-----|-------|---------------|
| `--color-primary` | Charcoal | `#1A1A2E` | 26, 26, 46 | Headers, primary text, nav backgrounds | 15.5:1 ✅ AAA |
| `--color-accent` | Electric Teal | `#00897B` | 0, 137, 123 | CTAs, active states, target building highlight, interactive elements | 4.6:1 ✅ AA |
| `--color-accent-light` | Soft Teal | `#E0F2F1` | 224, 242, 241 | Teal-tinted backgrounds, selected states | N/A (bg only) |

Note on teal selection: The PRD's original Electric Teal `#00B4A6` fails WCAG AA on white (3.3:1). The specified `#00897B` achieves 4.6:1 while maintaining the same teal character. All interactive elements using teal as a text or icon color on white backgrounds must use this adjusted value. For decorative/non-text uses (borders, fills behind dark text), the original `#00B4A6` is permitted.

#### Risk severity colors

| Token | Name | Hex | Text label | Icon | Usage |
|-------|------|-----|------------|------|-------|
| `--color-risk-good` | Clear Green | `#2E7D68` | Good | ✓ circle | Safe indicators, positive scores (70-100) |
| `--color-risk-moderate` | Warm Amber | `#E8913A` | Moderate | — dash | Moderate risk, attention needed (40-69) |
| `--color-risk-poor` | Coral | `#D84315` | Poor | ▲ triangle | High risk, significant concern (20-39) |
| `--color-risk-critical` | Crimson | `#B71C1C` | Critical | ✕ cross | Extreme risk, deal-breaker potential (0-19) |

All risk colors achieve ≥4.5:1 contrast on white and on `--color-surface`. The severity scale uses four channels simultaneously — color, text label, icon shape, and numeric score — ensuring no single channel is essential for comprehension.

#### Surface and background colors

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--color-bg` | Snow | `#F8F9FA` | Page background |
| `--color-surface` | White | `#FFFFFF` | Cards, elevated surfaces |
| `--color-surface-recessed` | Cool Gray | `#F0F1F3` | Recessed areas, inactive states, code blocks |
| `--color-border` | Light Fog | `#E8EAED` | Card borders (1px), dividers, 3D viewer edge lines |
| `--color-shadow` | Shadow Ink | `rgba(26, 26, 46, 0.06)` | Card elevation shadow |

#### Text colors

| Token | Name | Hex | Usage | WCAG on white |
|-------|------|-----|-------|---------------|
| `--color-text-primary` | Charcoal | `#1A1A2E` | Body text, headings | 15.5:1 ✅ AAA |
| `--color-text-secondary` | Mid Gray | `#5F6368` | Labels, metadata, secondary info | 7.0:1 ✅ AAA |
| `--color-text-tertiary` | Silver | `#9AA0A6` | Timestamps, source attributions, disabled text | 3.0:1 ⚠️ (decorative only) |

Implementation note: `--color-text-tertiary` falls below WCAG AA for body text. It is permitted only for non-essential decorative text (source attributions, timestamps) that is also conveyed through other channels. If any tertiary text carries essential information, use `--color-text-secondary` instead.

### 2.2 Typography

#### Font selection: Satoshi

**Primary and only font: Satoshi** (variable weight, 300–900). A modernist geometric sans-serif with slightly wider characters than Inter, optimizing for readability on small screens. Its geometric forms echo the precision of geospatial data while maintaining warmth through subtle stroke modulation.

**Rationale for single font:** Using one font family creates editorial unity and simplifies the design system. Hierarchy is achieved through weight, size, and color — not font switching. This avoids the Direction 1 "serif headings + sans body" pattern that can feel corporate rather than editorial.

**Fallback stack:** `'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

**Loading strategy:** Satoshi Variable (WOFF2, ~45 KB) loaded via `@font-face` with `font-display: swap`. The variable format covers all weights in a single file, avoiding multiple HTTP requests.

#### Type scale

All sizes in `rem` units relative to 16px base. Line heights optimized for the specific size — not a single ratio.

| Token | Element | Weight | Size | Line height | Letter spacing | Case |
|-------|---------|--------|------|-------------|----------------|------|
| `--type-display` | Dossier title (address) | Black (900) | 1.75rem (28px) | 1.2 (34px) | -0.03em | Sentence |
| `--type-h1` | Section headers | Bold (700) | 1.25rem (20px) | 1.3 (26px) | -0.01em | Sentence |
| `--type-h2` | Card titles | SemiBold (600) | 1rem (16px) | 1.375 (22px) | 0em | Sentence |
| `--type-body` | Body text, explanations | Regular (400) | 0.9375rem (15px) | 1.6 (24px) | 0.01em | Sentence |
| `--type-body-friendly` | Risk explanations, "so what" text | Regular (400) | 0.9375rem (15px) | 1.733 (26px) | 0.01em | Sentence |
| `--type-data` | Score numbers, data values | Medium (500) | 1.5rem (24px) | 1.167 (28px) | -0.02em | N/A |
| `--type-score-large` | Hero score display | Black (900) | 2.5rem (40px) | 1.1 (44px) | -0.03em | N/A |
| `--type-label` | Section labels, category tags | Medium (500) | 0.75rem (12px) | 1.333 (16px) | 0.04em | UPPERCASE |
| `--type-caption` | Source attributions, timestamps | Regular (400) | 0.8125rem (13px) | 1.385 (18px) | 0em | Sentence |
| `--type-micro` | Score denominators, unit labels | Medium (500) | 0.6875rem (11px) | 1.273 (14px) | 0.02em | Sentence |

**The `--type-body-friendly` variant** is critical. Risk card explanations use a 1.733 line-height ratio (26px at 15px font) — intentionally generous to reduce the sense of information density in the sections where users are processing unfamiliar data. This comes directly from Direction 3's insight that anxious users need more breathing room in text.

### 2.3 Spacing system

Built on an **8pt base grid** with 4pt half-steps for fine adjustments.

#### Spacing scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Icon-to-label gap, micro adjustments |
| `--space-sm` | 8px | Tight element spacing, pill padding |
| `--space-md` | 12px | Default element gap within cards |
| `--space-lg` | 16px | Card-to-card gap, button padding |
| `--space-xl` | 20px | Screen edge margin, card internal padding |
| `--space-2xl` | 24px | Generous card internal padding |
| `--space-3xl` | 32px | Minor section separation |
| `--space-4xl` | 48px | Major section separation (between dossier sections) |
| `--space-5xl` | 64px | Page-level separation |

#### Component dimensions

| Component | Property | Value |
|-----------|----------|-------|
| Card | Border radius | 16px |
| Card | Shadow | `0 2px 8px rgba(26, 26, 46, 0.06)` |
| Card | Border | `1px solid #E8EAED` |
| Card | Internal padding | 24px (all sides) |
| Button (primary) | Border radius | 12px |
| Button (primary) | Height | 48px |
| Button (primary) | Horizontal padding | 24px |
| Button (pill) | Border radius | 24px (full pill) |
| Input field | Border radius | 12px |
| Input field | Height | 52px |
| Bottom sheet | Border radius (top) | 24px |
| Bottom tab bar | Height | 56px (+ safe area) |
| Touch target (minimum) | Size | 44 × 44px |
| Risk tile (2×2 grid) | Min height | 160px |
| Score indicator dot | Diameter | 8px (with 4px gap) |

### 2.4 Iconography

**Style: Outlined, geometric, 24×24px default, 1.5px stroke weight.** Icons are drawn in `--color-primary` (Charcoal) at full opacity for primary actions, at 50% opacity for secondary elements. Active/selected icons use `--color-accent` (Electric Teal).

#### Required icon set

| Category | Icon description | Size | Usage |
|----------|-----------------|------|-------|
| Navigation | Magnifying glass | 24px | Search tab |
| Navigation | Document with lines | 24px | Briefing/dossier tab |
| Navigation | Bookmark | 24px | Shortlist tab |
| Navigation | Globe | 20px | Language toggle |
| Risk: Noise | Concentric arcs (sound waves) | 32px (tiles), 20px (inline) | Noise risk card |
| Risk: Air | Leaf/wind | 32px / 20px | Air quality risk card |
| Risk: Climate | Water drop + heat lines | 32px / 20px | Climate stress risk card |
| Risk: Sunlight | Sun with radiating lines | 32px / 20px | Sunlight risk card |
| Risk: Crime | Shield | 32px / 20px | Crime risk card (Tier B) |
| Risk: Energy | Lightning bolt | 32px / 20px | Energy label card (Tier B) |
| Severity: Good | Checkmark in circle | 16px | Inline severity indicator |
| Severity: Moderate | Horizontal dash in circle | 16px | Inline severity indicator |
| Severity: Poor | Triangle (exclamation) | 16px | Inline severity indicator |
| Severity: Critical | X in circle | 16px | Inline severity indicator |
| Action | Arrow-down into tray | 20px | Export/download |
| Action | Share (iOS-style) | 20px | Share briefing |
| Action | Plus | 20px | Add to shortlist |
| Action | Columns (side by side) | 20px | Compare view |
| Action | Chevron right | 16px | Detail navigation |
| 3D viewer | Expand arrows | 20px | Fullscreen toggle |
| 3D viewer | Camera | 20px | Camera preset selector |
| 3D viewer | Sun | 20px | Shadow timeline toggle |

**Icon library recommendation:** Lucide Icons (open source, MIT) as the base set, customized where needed. Lucide's stroke weight (2px default) should be adjusted to 1.5px for consistency with the design system. Risk category icons (noise, air, climate, sunlight) should be custom-designed for distinctiveness.

### 2.5 Elevation system

Elevation communicates hierarchy without heavy borders. Three levels:

| Level | Shadow | Border | Usage |
|-------|--------|--------|-------|
| Level 0 (flat) | None | `1px solid #E8EAED` | Inline elements, dividers |
| Level 1 (card) | `0 2px 8px rgba(26, 26, 46, 0.06)` | `1px solid #E8EAED` | Standard cards, risk tiles |
| Level 2 (elevated) | `0 8px 24px rgba(26, 26, 46, 0.10)` | None | Bottom sheets, modals, expanded cards |
| Level 3 (overlay) | `0 16px 48px rgba(26, 26, 46, 0.15)` | None | Full-screen overlays, image lightboxes |

---

## 3. Navigation & information architecture

### 3.1 Tab bar

**Three bottom tabs + contextual top actions:**

| Tab | Icon | Label | Screen |
|-----|------|-------|--------|
| Search | Magnifying glass | Search | Address input + recent searches |
| Briefing | Document | Briefing | Current dossier (or empty state if none) |
| Shortlist | Bookmark (with counter badge) | Saved | Shortlist + compare |

**Why 3 tabs, not 4:** Reducing from 4 tabs to 3 allows larger touch targets (> 80px width per tab vs ~60px), a cleaner visual bar, and eliminates the "Settings" tab that users rarely access. Settings/account are accessed via a profile icon in the top-right of the Search screen. The language toggle is a persistent pill in the global top bar.

**Tab bar styling:**
- Background: White (`#FFFFFF`) with `backdrop-filter: blur(20px)` and 80% opacity
- Top border: `1px solid #E8EAED`
- Active tab: Icon in `--color-accent` (Electric Teal) with label in `--color-accent`
- Inactive tab: Icon in `--color-text-secondary` (Mid Gray) with label in `--color-text-secondary`
- Label font: `--type-micro` (11px Medium)
- Tab height: 56px + device safe area inset

### 3.2 Global top bar

A minimal top bar appears on all screens:

- **Left:** Screen title (e.g., "Search", "Briefing", "Saved") in `--type-h1`
- **Right:** Language toggle pill (EN | NL) — segmented control, 32px height, `--color-accent` background on active segment, white text
- **Height:** 44px (content area, excluding status bar)
- **Background:** Transparent on scroll position 0; transitions to white with bottom border on scroll

### 3.3 Information architecture

```
├── Search (Tab 1)
│   ├── Address input (primary action)
│   ├── Recent searches (list, max 10)
│   └── Settings (via profile icon top-right)
│       ├── Language preference
│       ├── Dark mode toggle
│       ├── About / Legal
│       └── Data attributions
│
├── Briefing (Tab 2)
│   ├── Empty state (no address searched yet)
│   └── Dossier view
│       ├── Address header + summary strip
│       ├── 3D neighborhood viewer (hero card)
│       │   ├── Interactive mode (Three.js)
│       │   ├── Shadow timeline (slider + season presets)
│       │   └── Camera presets (street / balcony / top-down)
│       ├── Risk tiles (2×2 grid)
│       │   ├── Noise → Detail view
│       │   ├── Air quality → Detail view
│       │   ├── Climate stress → Detail view
│       │   └── Sunlight → Detail view
│       ├── Neighborhood snapshot (CBS stats)
│       ├── Viewing checklist (aggregated questions)
│       ├── [Tier B] Crime card
│       ├── [Tier B] Energy label card
│       └── Action bar: Add to Shortlist | Export PDF
│
└── Saved (Tab 3)
    ├── Shortlist (1-3 saved addresses)
    │   ├── Swipe to remove
    │   └── Tap to re-open dossier
    └── Compare view (2-3 addresses side-by-side)
        ├── Synchronized scroll columns
        ├── Parallel coordinates chart
        ├── Difference highlights
        └── Export compare PDF
```

---

## 4. Screen-by-screen specification

### 4.1 Search screen

The entry point. Must communicate the app's value proposition in under 3 seconds while making address input frictionless.

**Layout:**
- Top 40%: Minimal branding area. buurt-check wordmark (Satoshi Black, 20px, Charcoal) centered. Below: single-line tagline in `--type-body`, `--color-text-secondary`: "Paste an address. Know the truth." / "Plak een adres. Ken de waarheid."
- Center: Address input field (full width minus 20px margins)
- Below input: Recent searches (if any) in a vertical list

**Address input field:**
- Height: 56px (slightly oversized — this is the app's primary action)
- Border: `2px solid #E8EAED`, transitions to `2px solid #00897B` on focus
- Border radius: 12px
- Background: White
- Left icon: Map pin (20px, Mid Gray, transitions to Teal on focus)
- Placeholder text: "Postcode + house number" / "Postcode + huisnummer" in `--type-body`, `--color-text-tertiary`
- Auto-format: As user types, separate postcode (4 digits + 2 letters) from house number. Accept formats: "1012AB 1", "1012 AB 1", "1012AB1"
- On submit: Map pin icon transitions to a loading spinner (teal, 20px)
- Keyboard: `inputmode="text"` (not `numeric` — postcodes have letters)

**Recent searches:**
- List items: 48px height, left-aligned map pin icon (16px, Silver), address text in `--type-body`, timestamp in `--type-caption` `--color-text-tertiary` right-aligned
- Max 10 items, swipe-to-delete
- Section label: "RECENT" in `--type-label`, `--color-text-tertiary`

**Empty state (first launch):**
- No recent searches. Below the input field, show a brief value statement in 3 icon-text rows:
  1. 🏠 "3D sunlight and shadow analysis" (sun icon, Charcoal)
  2. 📊 "Environmental risk assessment" (chart icon, Charcoal)
  3. 📋 "Printable viewing checklist" (checklist icon, Charcoal)
- Each row: 20px icon left-aligned, text in `--type-body`, 12px gap between rows
- These disappear once the user has recent searches

**Success criteria:**
- SC-4.1a: Address resolution succeeds for ≥99% of valid Dutch postcode + huisnummer combinations
- SC-4.1b: Input field accepts all common Dutch address formats without error (tested against 500 sample addresses)
- SC-4.1c: Time from submit to dossier render begins: <1 second
- SC-4.1d: Recent searches persist across app sessions (local storage)
- SC-4.1e: Users can navigate from cold launch to address input in <2 seconds (no onboarding gates)

### 4.2 Loading state

The transition from address submission to dossier display. Must communicate progress without stalling the user.

**Design:**
- Full-screen white background
- Top: Confirmed address in `--type-display`, Charcoal, centered
- Center: A **building assembly animation** — clean, architectural-style building outline (using the actual building footprint from BAG if available, or a generic Dutch row house silhouette). The building draws itself with a progressive line-draw animation: foundation → walls → roof → windows, using `--color-primary` stroke at 2px weight. Duration: 2 seconds.
- Below building: Progress indicator — not a spinner, but a **text sequence** that updates as each data source responds:
  - "Finding building..." → "Loading 3D neighborhood..." → "Checking noise levels..." → "Checking air quality..." → "Checking climate risks..." → "Calculating sunlight..."
  - Each line appears in `--type-caption`, `--color-text-secondary`, replacing the previous line with a 200ms crossfade
- If any data source fails: that line shows "⚠ [Source] temporarily unavailable" in `--color-risk-moderate`, then continues to next. The dossier will render with that card showing a graceful degradation state.

**Timing:**
- The building animation runs for 2 seconds regardless of actual load time (establishes quality perception)
- If data arrives before animation completes, animation finishes first, then transitions to dossier
- If data takes longer than 2 seconds, progress text continues updating until complete
- Maximum wait: 8 seconds before timeout with partial dossier render

**Success criteria:**
- SC-4.2a: Loading state appears within 200ms of address submission
- SC-4.2b: Building animation runs smoothly at 60fps on iPhone 12 / Samsung Galaxy S21 equivalent
- SC-4.2c: Progress text updates reflect actual data source completion status (no fake progress)
- SC-4.2d: Partial dossier renders if any individual data source fails — never a full error screen
- SC-4.2e: Total time from address submission to usable dossier: <5 seconds (p95)

### 4.3 Dossier view

The core screen. A vertically scrolling intelligence briefing.

#### 4.3.1 Address header + summary strip

The top of the dossier provides BLUF (bottom line up front) — all critical information visible without scrolling.

**Address header:**
- Address in `--type-display` (28px Black): "Keizersgracht 123-II"
- Below: Postcode + city in `--type-body`, `--color-text-secondary`: "1012 AB Amsterdam"
- Below: Building facts inline — "Built 1895 · 3 floors · Residential" in `--type-caption`, `--color-text-secondary`
- Right side: Bookmark icon (outline if not saved, filled teal if saved). 44×44px touch target.

**Summary strip:**
A horizontal scrollable row of **risk score pills** immediately below the address header, providing a scannable overview before the user scrolls to detailed cards.

Each pill:
- Width: auto (content-dependent), min 80px
- Height: 36px
- Border radius: 18px (pill shape)
- Background: `--color-surface-recessed` (#F0F1F3)
- Left: 16px risk category icon (colored by severity)
- Right: Score number in `--type-h2` (16px SemiBold), colored by severity
- Gap between pills: 8px
- Horizontal scroll with scroll snap (`scroll-snap-type: x mandatory`)

Example pills: `[🔊 72] [🌿 84] [🌡️ 45] [☀️ 61]`

The pills serve as **jump links** — tapping a pill scrolls the dossier to the corresponding risk card and briefly highlights it with a `--color-accent-light` background pulse (300ms).

**Success criteria:**
- SC-4.3.1a: Address header, building facts, and all summary pills visible without scrolling on a 375px-wide viewport
- SC-4.3.1b: Summary pills correctly reflect the scores shown in the detailed risk cards (single source of truth)
- SC-4.3.1c: Pill tap-to-scroll navigation lands the target card at the top of the viewport within 300ms
- SC-4.3.1d: Building facts (year, floors, function) sourced from BAG data match official records

#### 4.3.2 3D viewer hero card

See [§5 — 3D Viewer Design](#5-3d-viewer-design) for complete specification. In the dossier layout:

- Positioned immediately below the summary strip
- Card with 16px border radius, Level 1 elevation
- Height: 50vh on initial load (50% of viewport height), min 280px, max 420px
- Full-width within 20px screen margins
- On scroll past: collapses to a **sticky mini-bar** (48px height) pinned below the global top bar. Mini-bar shows: simplified building silhouette (left), current sun time display (center), expand icon (right). Tap to re-expand with spring animation (300ms).

#### 4.3.3 Risk tiles (2×2 grid)

See [§6 — Risk Card System](#6-risk-card-system) for complete specification. In the dossier layout:

- Section label: "RISK ASSESSMENT" in `--type-label`, `--color-text-secondary`, 48px top margin from previous section
- 2×2 grid: 2 columns, each tile is a square-ish card (min-height 160px)
- Grid gap: 12px
- Tile order (default):
  1. Noise (top-left)
  2. Air quality (top-right)
  3. Climate stress (bottom-left)
  4. Sunlight (bottom-right)
- Tiles are tappable — each opens a full-screen detail view (see §6.3)

#### 4.3.4 Viewing checklist

The most actionable section — aggregates all "questions to ask" from all risk cards into a single, unified checklist.

**Design:**
- Section label: "YOUR VIEWING CHECKLIST" in `--type-label`
- Header: "Questions to bring to your viewing" in `--type-h1`
- Subheader: "Based on the risks we found for this address" in `--type-body`, `--color-text-secondary`
- Questions grouped by source card, each group preceded by the risk category icon + name in `--type-h2`
- Each question:
  - Checkbox square (20×20px, 2px border in `--color-border`, 4px border radius)
  - Question text in `--type-body-friendly` (15px, 26px line height)
  - Checkboxes are interactive — user can check items off. State persists per session.
- Footer: "Tip: Export as PDF to bring to your viewing" in `--type-caption`, `--color-text-secondary`, with a small teal arrow-right icon linking to the export flow

**Example checklist:**

```
🔊 NOISE
□ "Can I hear traffic from the bedroom at night?"
□ "Has noise changed since the tram line was built?"
□ "Which rooms face the street?"

🌿 AIR QUALITY
□ "Is there a busy road within 100 meters?"
□ "Are there plans for traffic changes in this area?"

☀️ SUNLIGHT
□ "Does the living room get afternoon sun?"
□ "Is the balcony in shadow after 3 PM in winter?"
```

**Bilingual handling:** Questions appear in the app's current language. A collapsible "Show in Dutch" / "Show in English" section below each group provides the alternate language translation — so an expat can show the Dutch text to the seller/agent at the viewing.

**Success criteria:**
- SC-4.3.4a: Every risk card with a severity of Moderate or worse generates at least 2 viewing questions
- SC-4.3.4b: Questions are specific to the address — not generic (e.g., references the actual road name, the actual direction, the actual score)
- SC-4.3.4c: Checkbox state persists within the session and across app backgrounding
- SC-4.3.4d: Bilingual toggle shows correct translations for all questions
- SC-4.3.4e: Checklist content matches exactly what appears in the PDF export

#### 4.3.5 Action bar

Fixed at the bottom of the dossier screen (above the tab bar), appearing when the user scrolls past the viewing checklist.

**Design:**
- Background: White, Level 2 elevation shadow (casts upward)
- Height: 64px + safe area
- Two buttons, side by side with 12px gap:
  - **Left (secondary):** "Add to Shortlist" — outlined style, `--color-accent` border + text, white background, bookmark icon left. If already saved: "Saved ✓" in `--color-accent` filled style.
  - **Right (primary):** "Export Briefing" — filled `--color-accent` background, white text, download icon left. This is the most prominent CTA on the screen.
- On phones narrower than 360px: stack vertically (primary on top)

**Success criteria:**
- SC-4.3.5a: Action bar becomes visible when user scrolls to viewing checklist section
- SC-4.3.5b: "Add to Shortlist" updates to "Saved ✓" state within 200ms of tap, with haptic feedback
- SC-4.3.5c: "Export Briefing" triggers the PDF generation flow (see §9) within 200ms of tap
- SC-4.3.5d: Shortlisted addresses appear in the Saved tab within 500ms

---

## 5. 3D viewer design

The 3D viewer is buurt-check's signature differentiator. It renders the actual neighborhood around the target address using 3DBAG geometry with photorealistic orthophoto roofs and procedural period-appropriate facades, while the rest of the UI maintains the clean, editorial aesthetic.

### 5.1 Rendering approach

**The viewer card is a "window into reality."** The contrast between the clean UI and the realistic 3D content is intentional and must be maintained. The 3D viewer should look like a carefully composed aerial photograph of a 3D architectural model — not like a stylized illustration.

**Renderer: Three.js (WebGL) for interactive client-side viewing (F2a).** forge3d (Rust/wgpu) handles server-side static snapshots for PDF export (F2b) and sunlight analysis (F2c). Both renderers consume the same 3DBAG LoD2.2 geometry and SunCalc sun positions — only the render backend differs. See PRD v2.0 §9 for the full rendering pipeline specification.

**Visual specification for the Three.js viewer:**

| Element | Treatment | Source |
|---------|-----------|--------|
| Target building roofs | Orthophoto UV-mapped (8cm PDOK, 4096×4096 crop) | PRD §9.3 |
| Target building walls | Procedural facade shader (period-appropriate) | PRD §9.4 |
| Surrounding building roofs | Vertex-colored from orthophoto sampling | PRD §9.5 |
| Surrounding building walls | Solid period-appropriate colors | PRD §9.5 |
| Ground plane | Orthophoto (25cm PDOK, 2048×2048) with shadow receiving | PRD §9.6 |
| Target building highlight | Teal outline effect: `--color-accent` (`#00897B`) at 2px screen-space edge, rendered via post-processing outline pass or stencil buffer | Design system |
| Sky | Solid `#F8F9FA` (matches app background) — no skybox | Design system |
| Ambient lighting | `THREE.AmbientLight` at `#B8C4D0`, intensity 0.4 | Custom |
| Sun lighting | `THREE.DirectionalLight` at `#FFFAF0`, intensity 0.8, positioned via SunCalc | PRD §9.9 |
| Shadows | `PCFSoftShadowMap`, 2048×2048, `rgba(26, 26, 46, 0.25)` on ground | PRD §9.9 |

### 5.2 Viewer UI overlay

Controls overlaid on the 3D viewport, designed to be minimal and non-obstructive.

**Top-left cluster:**
- Camera preset buttons in a vertical stack, each 36×36px with 4px gap:
  - Street level (eye icon)
  - Balcony level (building-with-arrow icon)
  - Top-down (down-arrow circle icon)
- Active preset: teal background, white icon
- Inactive preset: white background with 60% opacity, charcoal icon

**Top-right cluster:**
- Fullscreen toggle (expand icon), 36×36px
- Layer toggle (layers icon), 36×36px — opens a small popover for overlay toggles:
  - Noise overlay (on/off)
  - Air quality overlay (on/off)
  - Climate overlay (on/off)
  - Overlay opacity slider (25%–75%, default 50%)

**Bottom: Shadow timeline control**

This is the primary interactive element in the 3D viewer. Design merges Direction 2's time control with Direction 3's season buttons.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│              [3D VIEWPORT]                      │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ❄️ Winter   🌸 Spring   ☀️ Summer   🍂 Autumn  │
│                                                 │
│  06:00 ─────────●──────────────────── 21:00     │
│                9:00 AM                          │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Season buttons:**
- 4 buttons in a horizontal row, each showing emoji + season name
- Active season: `--color-accent` text + 2px bottom border
- Default: Winter (worst-case — per PRD F2b)
- Button font: `--type-caption` (13px)
- Each button maps to a specific date:
  - Winter: December 21
  - Spring: March 20
  - Summer: June 21
  - Autumn: September 22

**Time slider:**
- Horizontal slider from 06:00 to 21:00
- Track: 2px line in `--color-border` (#E8EAED)
- Filled track (left of thumb): 2px line in `--color-accent`
- Thumb: 16px circle in `--color-accent` with 4px white border (Level 2 shadow)
- Current time label below thumb: `--type-h2` (16px SemiBold)
- Hour markers every 3 hours: small 4px tick marks above the track, labels in `--type-micro`
- Step interval: 15 minutes
- Touch target: 44px height (invisible expanded hit area)
- On drag: sun position updates in real-time, shadows re-render. `shadowMap.autoUpdate = false`; trigger `needsUpdate = true` only on thumb position change.

**Sunlight summary badge:**
- Floats in the top-right of the viewport (below the control cluster)
- Shows: "☀️ 4.2h" (sunlight hours for current season) in a pill with white background, 80% opacity, `--type-h2` font
- Updates when season changes
- Tappable: opens the detailed sunlight risk card (F2c analysis)

### 5.3 Progressive loading sequence

Matches PRD §9.7, translated to visual states:

| Time | Action | Visual state in viewer |
|------|--------|----------------------|
| 0s | Viewer card appears with loading placeholder | Light gray card with centered teal spinner |
| 0–1s | Three.js scene initializes, ambient light on | Empty scene, Snow-colored background |
| 1–3s | CityJSON geometry + ground orthophoto fetched in parallel | — |
| 3s | First render: semantic solid colors | **Buildings visible** — orange-red roofs, light gray walls. Ground orthophoto visible. User can orbit. **Season buttons and time slider become active.** |
| 3–4s | Shadow map enabled, SunCalc positions computed | **Shadows visible** on ground plane. Interactive timeline functional. |
| 4–5s | Orthophoto roof textures applied (vertex colors for surrounding, UV-mapped for target) | **Real roof colors** from aerial imagery |
| 5–6s | Procedural facade shader applied to target building, brick atlas loaded | **Target building looks polished** — period-appropriate brick patterns, window grids |

**Fallback for low-power devices:**
If frame rate drops below 20fps during the first 3 seconds of interaction:
1. Disable shadow map (remove DirectionalLight shadow)
2. Reduce geometry to LoD1.3
3. Replace orthophoto textures with solid vertex colors
4. Show a banner: "Simplified view. Export PDF for full 3D analysis." in `--type-caption`

**Success criteria:**
- SC-5a: First meaningful render (buildings visible, orbitabel) within 4 seconds on 4G connection
- SC-5b: Shadow timeline slider responds within 200ms per step (no visible frame drop during drag)
- SC-5c: Season button switch updates shadows within 300ms
- SC-5d: Target building visually distinct from surrounding buildings (teal outline clearly visible at all zoom levels)
- SC-5e: Camera presets transition smoothly (300ms GSAP/tween, no jump cuts)
- SC-5f: 3D viewer achieves ≥30fps on iPhone 12 / Galaxy S21 equivalent at default view
- SC-5g: Fullscreen mode uses the entire device screen (no tab bar, no top bar) with a close button (X, top-right)
- SC-5h: Layer overlays (noise, air, climate) render as semi-transparent color maps on the ground plane within 1 second of toggle
- SC-5i: The 3D viewer remains functional with shadows when a single data source (e.g., PDOK orthophoto) fails — falls back to solid colors

---

## 6. Risk card system

### 6.1 Design philosophy for risk communication

Risk data must pass through three filters before reaching the user:

1. **Is it relevant?** Not every data point matters for every address. If noise is below 50 dB Lden, that's "Good" — the card shows a reassuring green state, not a detailed analysis.
2. **What does it mean?** Raw numbers (65 dB, 12 µg/m³) are meaningless to most buyers. Every score must be accompanied by a plain-language comparison ("about the level of a busy café") and a consequence ("you may hear traffic with windows open").
3. **What should I do?** Every card with a Moderate or worse score generates specific, address-aware viewing questions. This is the bridge from information to action.

### 6.2 Risk tile design (2×2 grid view)

Each tile in the dossier's 2×2 grid is a compact summary card designed for quick scanning. All four tiles are visible simultaneously without scrolling (on viewports ≥ 375px wide).

```
┌──────────────────────────────────────┐
│                                      │
│  NOISE                  ✓ Good       │
│                                      │
│           84                         │
│                                      │
│  ───────────────────●                │
│                                      │
│  Quiet residential street    →       │
│                                      │
└──────────────────────────────────────┘
```

**Tile anatomy (top to bottom):**

1. **Category label** — `--type-label` (12px uppercase, 0.04em tracking), `--color-text-secondary`. Left-aligned.
2. **Severity badge** — Right-aligned on same line as category label. Contains: severity icon (16px) + text label ("Good" / "Moderate" / "Poor" / "Critical") in `--type-caption`. Color matches severity level.
3. **Score number** — `--type-score-large` (40px Black). Centered. Color matches severity level.
4. **Score bar** — A 2px horizontal line spanning the card width (minus padding). Track in `--color-border`. Filled portion in severity color. Endpoint: 8px circle in severity color at the score position. This visualization is more refined than a filled progress bar — it's a precise data marker on a scale.
5. **One-line summary** — `--type-body` (15px Regular), `--color-text-primary`. Left-aligned. Max 1 line, truncated with ellipsis if needed. Right: chevron icon (16px, `--color-text-tertiary`) indicating "tap for detail."

**Tile dimensions:**
- Min-height: 160px
- Padding: 20px
- Border radius: 16px
- Background: White
- Shadow: Level 1
- Border: `1px solid #E8EAED`

**Score thresholds (normalized 0–100 scale):**
All raw data sources are normalized to a 0–100 score where 100 = best possible, 0 = worst. This normalization is essential for consistent visual communication and cross-category comparison.

| Score range | Severity | Color token | Icon | Meaning |
|-------------|----------|-------------|------|---------|
| 70–100 | Good | `--color-risk-good` | ✓ Circle | No significant concern |
| 40–69 | Moderate | `--color-risk-moderate` | — Dash | Worth noting; check at viewing |
| 20–39 | Poor | `--color-risk-poor` | ▲ Triangle | Significant concern; investigate carefully |
| 0–19 | Critical | `--color-risk-critical` | ✕ Cross | Potential deal-breaker; professional assessment recommended |

### 6.3 Risk card detail view

Tapping a risk tile opens a **full-screen detail view** with a shared element transition (tile expands to fill screen, 300ms, cubic-bezier(0.4, 0, 0.2, 1)). Other tiles fade out simultaneously (200ms).

**Detail view layout (scrollable):**

```
┌─────────────────────────────────────────────┐
│ ←  NOISE ENVIRONMENT                        │
│                                             │
│                 72                           │
│              Moderate                        │
│  ─────────────────────●                     │
│                                             │
│  WHAT THIS MEANS                            │
│                                             │
│  Your street has a measured road traffic     │
│  noise level of 65 dB Lden — roughly the    │
│  volume of a busy restaurant. This is        │
│  above the WHO recommended limit of 53 dB   │
│  for road traffic.                           │
│                                             │
│  The nearest significant noise source is     │
│  the A10 ring road, approximately 200m       │
│  south. Tram line 2 runs along your street   │
│  (based on public transit data).             │
│                                             │
│  Compared to other addresses in Amsterdam,   │
│  this is quieter than 62% of locations.      │
│                                             │
│  HOW IT COMPARES                            │
│  ┌───────────────────────────────────┐      │
│  │ This address    ████████████░░ 72 │      │
│  │ Amsterdam avg   ████████░░░░░ 58  │      │
│  │ NL average      ██████░░░░░░░ 45  │      │
│  │ WHO limit       ████░░░░░░░░░ 35  │      │
│  └───────────────────────────────────┘      │
│                                             │
│  ASK AT YOUR VIEWING                        │
│  ┌───────────────────────────────────┐      │
│  │ □ "Which bedrooms face the A10?"  │      │
│  │ □ "Is there double or triple      │      │
│  │    glazing on the south side?"    │      │
│  │ □ "Has noise changed since the    │      │
│  │    tram line was extended?"       │      │
│  │                                   │      │
│  │ 🇳🇱 Show in Dutch  ▼              │      │
│  └───────────────────────────────────┘      │
│                                             │
│  Source: Atlas Leefomgeving / RIVM (2024)   │
│  Updated: January 2025                      │
│  ⚠ Indicative data. Not professional advice.│
└─────────────────────────────────────────────┘
```

**Detail view components:**

1. **Back navigation** — "←" icon + card category label in `--type-h1`. Tap or swipe-right to dismiss.
2. **Score display** — Same as tile but larger: score number in `--type-score-large` (40px), severity label in `--type-h2`, score bar full-width.
3. **"What this means" section** — Section label in `--type-label`. Body text in `--type-body-friendly` (15px Regular, **26px line height**). This is the generous line-height variant for reading comfort.
   - First paragraph: translate the raw measurement to a relatable comparison
   - Second paragraph: address-specific context (nearest noise source, distance, transit lines)
   - Third paragraph: relative comparison (percentile among city/national averages)
4. **"How it compares" chart** — Horizontal bar chart comparing the address against city average, national average, and relevant regulatory/WHO limits. Bars use `--color-accent` for the address, `--color-text-secondary` for comparisons. Each bar labeled with score. Chart background: `--color-surface-recessed`.
5. **"Ask at your viewing" section** — Section label in `--type-label`. Questions in `--type-body-friendly` with interactive checkbox squares (20×20px, `--color-border` border, `--color-accent` fill when checked). Dutch translation collapsible below.
6. **Source attribution** — `--type-caption`, `--color-text-tertiary`. Source name, data year, last update date. Followed by standing disclaimer: "Indicative data. Not a substitute for professional advice." in `--type-caption`.

### 6.4 Card-specific specifications

#### Noise card (F3 — Road traffic Lden)

| Property | Specification |
|----------|--------------|
| Raw data | Lden value in dB from RIVM/Atlas Leefomgeving WMS or ZIP |
| Score normalization | 100 - ((Lden - 40) × 2), clamped 0–100. Score 100 = ≤40 dB, Score 0 = ≥90 dB |
| Relatable comparisons | <45 dB: "quieter than a library" / 45-55: "background hum, like a quiet office" / 55-65: "noticeable, like a busy café" / 65-75: "loud, like standing near a busy road" / >75: "very loud, like constant heavy traffic" |
| Official thresholds | WHO: 53 dB Lden for road traffic / EU: 55 dB Lden action threshold |
| Questions generated | Window glazing type, bedroom orientation, noise barriers planned, noise trend |

#### Air quality card (F3 — PM2.5 / NO2)

| Property | Specification |
|----------|--------------|
| Raw data | PM2.5 (µg/m³) and NO2 (µg/m³) from RIVM GCN WMS/WCS |
| Score normalization | Use the worse of PM2.5 and NO2 scores. PM2.5: 100 - ((PM2.5 - 5) × 5), clamped. NO2: 100 - ((NO2 - 10) × 3), clamped. |
| Relatable comparisons | Link to WHO AQG 2021 limits: PM2.5 5 µg/m³, NO2 10 µg/m³ annual mean |
| Official thresholds | WHO AQG 2021 / EU Directive 2008/50/EC / Dutch NSL targets |
| Questions generated | Proximity to highways/busy roads, ventilation system type, planned traffic changes |

#### Climate stress card (F3 — water nuisance + heat stress)

| Property | Specification |
|----------|--------------|
| Raw data | Klimaateffectatlas WMS/WFS layers for wateroverlast (pluvial flooding) and hittestress (urban heat island) |
| Score normalization | Composite of flood vulnerability (60% weight) and heat stress (40% weight). Score 100 = no risk, Score 0 = extreme risk. |
| Relatable comparisons | "This area has a [low/medium/high] chance of water nuisance during extreme rainfall (>70mm/hour)" / "During heatwaves, this neighborhood can be up to [X]°C warmer than surrounding countryside" |
| Official thresholds | Klimaateffectatlas severity classes / National Delta Programme standards |
| Questions generated | Basement/souterrain flooding history, VvE climate adaptation plans, ground-floor water damage history, green space or water features nearby |

#### Sunlight card (F3 — computed from F2c)

| Property | Specification |
|----------|--------------|
| Raw data | Direct sunlight hours per day from forge3d GPU-accelerated raycast analysis (8 sample dates × 15-min intervals) |
| Score normalization | Based on December sunlight hours: ≥4h = 100, 0h = 0, linear interpolation. December is worst-case and most decision-relevant. |
| Seasonal breakdown | Show hours for each season: "Dec: 2.1h / Mar: 4.8h / Jun: 8.4h / Sep: 5.2h" |
| Relatable comparisons | "In winter, this home gets about [X] hours of direct sunlight — roughly [comparison: 'enough for a short lunch on the balcony' / 'barely enough to notice' / 'significant daylight']" |
| Questions generated | Window orientation, balcony sun exposure at specific times, neighboring building plans (could block more light), light well or atrium access |

**Success criteria (all risk cards):**
- SC-6a: Every risk card displays all required elements: score, severity badge, one-line summary, detailed explanation, comparison chart, viewing questions, source attribution, and disclaimer
- SC-6b: Score normalization produces consistent 0–100 values that correctly map to severity levels for all valid input ranges
- SC-6c: Relatable comparisons are address-specific (reference actual nearby features like road names, distances, transit lines) for ≥80% of generated dossiers
- SC-6d: Comparison chart includes the address score, city/municipality average, national average, and relevant WHO/EU threshold
- SC-6e: Each card with Moderate or worse severity generates ≥2 address-specific viewing questions
- SC-6f: Source attribution includes dataset name, data year, and last update date
- SC-6g: Risk tile in 2×2 grid and detail view score are always identical (single source of truth)
- SC-6h: Graceful degradation: if data source is unavailable, tile shows "Data temporarily unavailable" with a muted gray style — no error screen, no broken layout

---

## 7. Neighborhood snapshot

### 7.1 Design

A compact presentation of CBS buurt/wijk statistics, positioned below the risk tiles in the dossier scroll. Deliberately limited to 5–8 indicators to avoid dashboard spam.

**Section label:** "NEIGHBORHOOD" in `--type-label`
**Section header:** "[Buurt name]" in `--type-h1` — using the official CBS buurt name

**Layout: Key-value list** — not a chart, not a grid. Each indicator is a horizontal row:

```
┌─────────────────────────────────────────────┐
│  NEIGHBORHOOD                               │
│  Jordaan                                    │
│                                             │
│  Population density     15,420 /km²    ●●●● │
│  Average income         €38,200        ●●●  │
│  Owner-occupied         34%            ●●   │
│  Average home value     €485,000       ●●●● │
│  Under 25              28%             ●●●  │
│  Over 65               12%             ●●   │
│  Distance to GP         0.4 km         ●●●● │
│  Green space            18%            ●●   │
│                                             │
│  Source: CBS Wijken & Buurten 2024          │
└─────────────────────────────────────────────┘
```

**Row anatomy:**
- Left: Indicator name in `--type-body`, `--color-text-primary`
- Center: Value in `--type-data` (24px Medium), `--color-text-primary`, right-aligned within the center column
- Right: Relative indicator — 1–4 dots (8px diameter, 4px gap) showing where this value falls relative to the national distribution (quartile). Dots filled in `--color-accent` for active, `--color-border` for inactive. This gives instant context without complex charts.

**Dot interpretation:**
- ●○○○ = Bottom quartile nationally
- ●●○○ = Below median
- ●●●○ = Above median
- ●●●● = Top quartile nationally

**Indicator selection (default 8, configurable):**

| Indicator | CBS field | EN label | NL label |
|-----------|-----------|----------|----------|
| Population density | `bevolkingsdichtheid_inwoners_per_km2` | Population density | Bevolkingsdichtheid |
| Average income | `gemiddeld_inkomen_per_inwoner` | Average income | Gemiddeld inkomen |
| Owner-occupied % | `koopwoningen_percentage` | Owner-occupied | Koopwoningen |
| Average home value (WOZ) | `gemiddelde_woz_waarde_woningen` | Average home value | Gem. WOZ-waarde |
| Under 25 % | computed from age bands | Under 25 | Onder 25 |
| Over 65 % | computed from age bands | Over 65 | Boven 65 |
| Distance to GP | `afstand_tot_huisartsenpraktijk_km` | Distance to GP | Afstand tot huisarts |
| Green space % | computed or proxy | Green space | Groenoppervlak |

**Success criteria:**
- SC-7a: Neighborhood snapshot displays 5–8 indicators for ≥95% of valid Dutch addresses
- SC-7b: All values sourced from the most recent CBS annual release (2024 or newer)
- SC-7c: Dot indicators correctly reflect national quartile positioning (validated against CBS national distributions)
- SC-7d: Both EN and NL labels display correctly and fit within the row layout without truncation
- SC-7e: If CBS data is unavailable for a buurt (e.g., new construction areas), show "Statistics not yet available for this neighborhood" in a muted info card

---

## 8. Shortlist & compare

### 8.1 Shortlist (Saved tab — default view)

**Empty state:**
- Centered bookmark icon (48px, `--color-text-tertiary`)
- "No saved addresses yet" in `--type-h1`, `--color-text-secondary`
- "Search for an address and tap the bookmark to save it" in `--type-body`, `--color-text-tertiary`

**Populated state:**
- Each saved address is a horizontal card (full-width, 88px height):
  - Left: Thumbnail — either a small 3D render capture (60×60px, 8px border radius) or a map pin on orthophoto
  - Center: Address in `--type-h2`, city in `--type-caption` `--color-text-secondary`
  - Right: 4 mini risk dots (8px each, colored by severity), stacked 2×2
  - Swipe-left to reveal red "Remove" action
  - Tap to re-open the dossier for that address
- Maximum 3 saved addresses. If user tries to add a 4th, a bottom sheet prompts: "You can save up to 3 addresses. Remove one to add a new one."

**Compare button:**
- Below the saved addresses list: "Compare" button, full-width, `--color-accent` fill, white text, columns icon
- Enabled when 2+ addresses are saved
- Disabled state: 50% opacity, gray fill

### 8.2 Compare view

Activated by tapping "Compare" from the Shortlist. Shows 2–3 addresses side-by-side with synchronized scrolling.

**Layout: Multi-column synchronized scroll**

On phones (< 768px): Two columns visible, third accessible by horizontal scroll. Each column width: 50% viewport width. Horizontal `scroll-snap-type: x mandatory` ensures clean column alignment.

On tablets / desktop (≥ 768px): All 2–3 columns visible simultaneously. Each column width: 33% (for 3) or 50% (for 2) of content area.

**Column structure (each column = one address):**

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Keizers- │ │ Prins-   │ │ Heren-   │
│ gracht   │ │ engracht │ │ gracht   │
│ 123-II   │ │ 456      │ │ 789-H    │
│          │ │          │ │          │
│ [3D      │ │ [3D      │ │ [3D      │
│  thumb]  │ │  thumb]  │ │  thumb]  │
│          │ │          │ │          │
│ 🔊 72    │ │ 🔊 84    │ │ 🔊 45    │
│ ████░░   │ │ ██████░  │ │ ███░░░   │
│          │ │          │ │          │
│ 🌿 84    │ │ 🌿 78    │ │ 🌿 91    │
│ ██████░  │ │ █████░░  │ │ ███████  │
│          │ │          │ │          │
│ 🌡️ 45   │ │ 🌡️ 62   │ │ 🌡️ 55   │
│ ███░░░   │ │ █████░   │ │ ████░░   │
│          │ │          │ │          │
│ ☀️ 61    │ │ ☀️ 73    │ │ ☀️ 38    │
│ █████░   │ │ ██████░  │ │ ███░░░   │
└──────────┘ └──────────┘ └──────────┘
```

**Synchronized scrolling:** Scrolling any column scrolls all columns. Section headers (address, risk scores, neighborhood stats) are sticky within each column. Implemented via a shared scroll controller that syncs `scrollTop` across all columns on `requestAnimationFrame`.

**Difference highlighting:** When scores differ by >15 points between properties, the higher score gets a subtle green left-border (2px, `--color-risk-good`) and the lower score gets a subtle amber left-border (2px, `--color-risk-moderate`). This immediately draws the eye to meaningful differences.

**Summary section (bottom of compare view):**

A **parallel coordinates chart** spans the full width below the columns. Vertical axes for each metric (Noise, Air, Climate, Sunlight, plus optionally CBS indicators). A colored line per address connects the scores across all axes. Line colors: Address 1 = `--color-accent` (teal), Address 2 = `--color-risk-moderate` (amber), Address 3 = `#7C4DFF` (a distinguishable purple, not in the main palette).

Below the chart: A "Differences only" toggle (pill button) that filters the column view to show only metrics where properties differ by >15 points.

**Success criteria:**
- SC-8a: User can save up to 3 addresses, each persisting across app sessions
- SC-8b: Compare view renders with synchronized scroll for 2–3 addresses without jank (60fps scrolling)
- SC-8c: Difference highlighting correctly identifies score spreads >15 points
- SC-8d: Parallel coordinates chart renders with correctly positioned data points for all properties and all metrics
- SC-8e: "Differences only" toggle correctly filters to divergent metrics within 200ms
- SC-8f: Compare view loads within 1 second if all addresses are already cached
- SC-8g: On phones < 375px wide, graceful degradation: compare 2 addresses only (third hidden with "Upgrade to tablet view" message)

---

## 9. PDF Viewing Briefing

### 9.1 Export flow

1. **Trigger:** User taps "Export Briefing" (primary CTA in dossier action bar, or option in compare view)
2. **Configuration bottom sheet** (Level 2 elevation, 24px top border radius):
   - Slides up from bottom, 45% viewport height
   - **Template selector:** Two tappable cards side by side:
     - "Quick Brief" — 1 page summary with scores and top questions. Thumbnail preview showing the layout.
     - "Full Dossier" — 3–4 pages with all data, charts, shadow snapshots, and complete viewing checklist. Thumbnail preview.
   - **Shadow snapshots:** Toggle (default: ON) — "Include 3D shadow analysis (winter + summer)"
   - **Language:** Segmented control (EN | NL). Defaults to app language.
   - **Generate button:** Full-width, `--color-accent`, "Generate Briefing"
3. **Generation state:**
   - Bottom sheet expands to show progress
   - If shadow snapshots are included and not cached: forge3d renders 3 PNGs (morning/noon/evening, December 21). Progress shows: "Rendering shadow analysis... [1/3]" with a thin teal progress bar
   - If cached: "Building your briefing..." with determinate progress bar
   - Maximum generation time: 12 seconds (if forge3d renders needed)
4. **Preview:**
   - Full-screen PDF preview with pinch-to-zoom
   - Bottom bar: "Share" button (system share sheet: Save to Files, AirDrop, email, WhatsApp, print) + "Regenerate" button (outline style)
5. **forge3d fallback:** If forge3d render fails or times out: use Three.js client-side capture via `renderer.domElement.toDataURL('image/png')` at the current viewport resolution. Quality is lower but the export is never blocked.

### 9.2 PDF design specification

The PDF follows the app's design system but is optimized for A4 print (210 × 297mm).

**Typography:** Satoshi (embedded as WOFF2 subset in the PDF generation pipeline, or substituted with a similar geometric sans-serif available in the PDF generation library)

**Color:** Same palette as the app. Risk severity colors print well on both color and grayscale printers (tested).

**Quick Brief (1 page):**

```
┌─────────────────────────────────────────┐
│                                         │
│  buurt-check                            │
│  VIEWING BRIEFING                       │
│                                         │
│  Keizersgracht 123-II                   │
│  1012 AB Amsterdam                      │
│  Built 1895 · 3 floors · Residential    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ [Shadow snapshot — Dec, 12:00]  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  RISK SUMMARY                           │
│  Noise       72  Moderate               │
│  Air quality 84  Good                   │
│  Climate     45  Moderate               │
│  Sunlight    61  Moderate               │
│                                         │
│  TOP QUESTIONS FOR YOUR VIEWING         │
│  □ "Which bedrooms face the A10?"       │
│  □ "Is there double glazing?"           │
│  □ "Has there been water damage?"       │
│  □ "Does the balcony get sun after 3?"  │
│  □ ________________________________     │
│  □ ________________________________     │
│                                         │
│  Generated by buurt-check · 2026-02-09  │
│  Sources: RIVM, CBS, Klimaateffectatlas │
│  Indicative data — not professional     │
│  advice.                                │
│                                         │
└─────────────────────────────────────────┘
```

Note: Two empty checkbox lines at the bottom allow the user to add their own questions by hand.

**Full Dossier (3–4 pages):**
- Page 1: Cover — address, building facts, 3D shadow snapshot (noon, winter solstice), risk summary strip
- Page 2: Risk analysis — all 4 risk cards with scores, explanations, comparison charts
- Page 3: Shadow analysis — 3 shadow snapshots (morning/noon/evening, winter solstice) side by side, plus seasonal sunlight summary. Neighborhood snapshot (CBS stats).
- Page 4: Viewing checklist — all questions organized by category, with checkboxes. Bilingual (EN+NL both printed). Notes section with blank lines.
- Footer on all pages: "buurt-check · [date] · Indicative data, not professional advice" + required data attributions (CC BY 4.0 for Klimaateffectatlas and PDOK)

**Success criteria:**
- SC-9a: PDF generation completes within 12 seconds (including forge3d render or cache hit)
- SC-9b: Quick Brief fits on exactly 1 A4 page with ≥15mm margins
- SC-9c: Full Dossier fits on 3–4 A4 pages with consistent formatting
- SC-9d: Shadow snapshots in PDF match the address, date, and time specified (not generic or cached from wrong address)
- SC-9e: All text in PDF is selectable/searchable (not rasterized)
- SC-9f: PDF renders correctly in Preview (macOS), Adobe Reader, Chrome PDF viewer, and iOS Files
- SC-9g: All required data source attributions appear in PDF footer
- SC-9h: forge3d-to-Three.js fallback produces a usable (if lower quality) PDF within 8 seconds
- SC-9i: Viewing checklist questions in PDF exactly match the questions shown in the app dossier
- SC-9j: Bilingual PDF shows both EN and NL for all questions when "Full Dossier" is selected

---

## 10. Bilingual system

### 10.1 Language detection and switching

**Default language:** Determined by device system language. If system language is Dutch (`nl`, `nl-NL`, `nl-BE`), app defaults to Dutch. All other languages default to English.

**Manual override:** Language toggle (EN | NL segmented control) visible in:
- Global top bar (persistent on all screens)
- PDF export configuration sheet
- Settings screen

**Switching behavior:** All visible text transitions instantly (no page reload). A 200ms crossfade animation applies to text elements. Layout adjusts for length differences (Dutch text averages 10–15% longer than English).

### 10.2 Content strategy

| Content type | Approach |
|---|---|
| UI labels (buttons, tabs, headers) | Parallel i18n string files (`en.json`, `nl.json`) |
| Risk card explanations | Written at B1 reading level in both languages. Address-specific elements (road names, distances) are dynamically inserted. |
| Viewing questions | Written in both languages. In-app: shown in current language with collapsible alternate. In PDF: both languages side by side. |
| CBS indicator labels | Dutch official term + English translation: "Bevolkingsdichtheid (Population density)" on first use, then short form. |
| 3D viewer controls | Language-agnostic (icons + numbers). Season labels: emoji + word in current language. |
| Error messages | Both languages. |
| Source attributions | In source language (Dutch dataset names remain Dutch) with English context. |

### 10.3 Implementation requirements

- All user-facing strings externalized to i18n files — zero hardcoded text
- All containers use flexible heights with `min-height` constraints to accommodate Dutch text expansion
- Button text tested in both languages at maximum expected length; buttons use horizontal padding, not fixed width
- Right-to-left support: NOT required for MVP (neither Dutch nor English is RTL)
- Number formatting: Dutch locale uses comma as decimal separator, period as thousands separator (1.234,56). English locale uses period as decimal separator, comma as thousands separator (1,234.56). Both must be supported.
- Date formatting: Dutch = "9 februari 2026", English = "February 9, 2026"
- Currency: Always € (Euro), formatted per locale

**Success criteria:**
- SC-10a: 100% of user-facing strings available in both EN and NL
- SC-10b: Language switch completes within 300ms with no visible layout jump or content flash
- SC-10c: No text truncation at maximum Dutch text length on any viewport ≥ 320px wide
- SC-10d: Number and date formatting matches active locale
- SC-10e: Viewing questions are available in both languages for all risk card types

---

## 11. Animation & micro-interactions

### 11.1 Animation principles

1. **Purpose-first:** Every animation communicates state change, provides feedback, or guides attention. No animation exists purely for decoration.
2. **Physics-based:** Use spring easing (not linear or simple ease-in-out) for natural motion. Exception: fade transitions use linear or ease-out.
3. **Restrained but not sterile:** Direction 2's precision with selected moments of delight (score counting, shortlist add). Never playful in a way that undermines trust.
4. **Respect `prefers-reduced-motion`:** All animations collapse to instant state changes. Crossfades become instant opacity switches. Score counters show final values immediately.

### 11.2 Animation catalog

| Interaction | Animation | Duration | Easing | Reduced motion |
|---|---|---|---|---|
| Page transition (tab switch) | Crossfade + 12px vertical shift | 250ms | `ease-out` | Instant crossfade |
| Dossier section reveal | Staggered fade-in, 80ms delay between sections | 200ms per section | `ease-out` | All sections visible immediately |
| Score number count-up | Ticker from 0 to final value | 600ms | Custom ease-out (fast start, slow end) | Final value shown immediately |
| Risk tile tap → detail view | Shared element transition: tile scales to fill screen | 300ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Instant full-screen switch |
| Detail view dismiss (back) | Reverse of open: shrinks back to tile position | 250ms | `cubic-bezier(0.4, 0, 0.6, 1)` | Instant switch |
| Shortlist add (bookmark) | Icon stroke draws from bottom to top, then fills with teal | 250ms draw + 150ms fill | `ease-out` | Instant fill |
| Shortlist add (haptic) | Single tap haptic (`UIImpactFeedbackGenerator.medium` on iOS) | Instant | N/A | Still fires |
| 3D viewer: building appearance | Buildings fade in by distance from center (nearest first) | 600ms total, 50ms stagger | `ease-out` per building | All buildings visible immediately |
| 3D viewer: camera preset switch | Smooth camera tween to new position | 400ms | `cubic-bezier(0.4, 0, 0.2, 1)` | Instant jump |
| Shadow timeline scrub | Real-time shadow update | <200ms latency | N/A (immediate) | Same |
| Season button switch | Crossfade active indicator (teal bottom border) | 200ms | `ease-out` | Instant switch |
| 3D mini-bar collapse (on scroll) | Height transition from expanded to 48px | 300ms | `ease-in-out` | Instant collapse |
| 3D mini-bar expand (on tap) | Height transition from 48px to expanded | 300ms | Spring (stiffness: 300, damping: 25) | Instant expand |
| Loading: building assembly | Line-draw animation: foundation → walls → roof → windows | 2000ms | Custom per-segment | Static building silhouette |
| PDF generation progress | Thin teal progress bar fills left-to-right | Matches actual progress | Linear | Same (functional, not decorative) |
| Bottom sheet appearance | Slides up from bottom with spring overshoot | 350ms | Spring (stiffness: 400, damping: 30) | Slides up without overshoot, 200ms |
| Language toggle switch | Crossfade on all visible text | 200ms | `linear` | Instant text swap |
| Error/unavailable state | Card background pulses once in `--color-surface-recessed` | 400ms | `ease-in-out` | No pulse, muted state appears immediately |

### 11.3 Implementation notes

- **Animation implementation:** CSS transitions and lightweight component-level helpers for UI animations. GSAP remains available for Three.js camera tweens when needed.
- **Performance budget:** No animation should cause a frame drop below 50fps on target devices. Complex animations (3D building fade-in, score counter) use `will-change: transform, opacity` for GPU acceleration.
- **Haptic feedback:** iOS: `UIImpactFeedbackGenerator` (.medium for shortlist, .light for toggles). Android: `HapticFeedbackConstants.CONFIRM` for shortlist. Use sparingly — only on primary actions (shortlist add, PDF export complete).

**Success criteria:**
- SC-11a: All animations render at ≥50fps on iPhone 12 / Galaxy S21 equivalent
- SC-11b: `prefers-reduced-motion` disables all non-essential animations (verified via automated accessibility audit)
- SC-11c: No animation blocks user interaction (all interactive elements respond to tap within 100ms regardless of animation state)
- SC-11d: Haptic feedback fires on shortlist add and PDF export complete on supported devices

---

## 12. Accessibility specification

### 12.1 Target compliance

**WCAG 2.1 Level AA** — all screens, all states, both languages.

### 12.2 Requirements

#### Color & contrast

| Requirement | Standard | Implementation |
|---|---|---|
| Text contrast (primary) | ≥4.5:1 on background | Charcoal (#1A1A2E) on White = 15.5:1 ✅ |
| Text contrast (secondary) | ≥4.5:1 on background | Mid Gray (#5F6368) on White = 7.0:1 ✅ |
| Text contrast (tertiary) | ≥3.0:1 on background (decorative only) | Silver (#9AA0A6) on White = 3.0:1 ⚠️ — restricted use |
| Large text contrast (≥18px bold / ≥24px) | ≥3.0:1 | All large text exceeds this ✅ |
| Non-text contrast (icons, borders) | ≥3.0:1 | All icons at full opacity ✅ |
| Risk severity communication | Not color-alone | Quadruple redundancy: color + icon shape + text label + numeric score |
| Focus indicators | Visible, ≥3:1 contrast | 2px solid `--color-accent` outline with 2px offset |
| Dark mode equivalents | Same ratios | See §13 |

#### Touch & interaction

| Requirement | Standard | Implementation |
|---|---|---|
| Touch targets | ≥44×44px | All interactive elements ✅ |
| Touch target spacing | ≥8px between targets | Minimum gap enforced in layout ✅ |
| Gesture alternatives | Single-tap alternatives for all gestures | 3D viewer: orbit = drag (accessible), timeline = button taps at hour marks. Swipe-to-delete = long-press context menu. |
| Timeout | No content timeout | Dossier persists indefinitely ✅ |

#### Screen reader support

| Requirement | Implementation |
|---|---|
| Semantic landmarks | `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>` for all screens |
| Heading hierarchy | H1: screen title, H2: section headers, H3: card titles. No skipped levels. |
| Image alt text | 3D viewer: "3D neighborhood view showing surrounding buildings with shadow analysis. [Building count] buildings within 250 meters." Shadow snapshots: "Shadow analysis of [address] at [time] on [date], showing [light/shadow description]." |
| Risk score announcement | "Noise: 72 out of 100. Moderate. Busy road nearby." |
| Interactive elements | All buttons, toggles, sliders have visible labels + `aria-label`. Slider announces current value on change. |
| Live regions | Score updates, loading progress, and error states use `aria-live="polite"` |
| 3D viewer fallback | Text summary: "This home receives approximately [X] hours of direct sunlight on a winter day and [Y] hours on a summer day. Surrounding buildings are [height description] relative to this property." |

#### Dynamic type / font scaling

| Requirement | Implementation |
|---|---|
| Scale support | Up to 200% without content loss |
| Layout at 200% | Single-column, no horizontal scroll. Risk tiles stack 1-column instead of 2×2. Score numbers scale proportionally. |
| Minimum font size | 11px at 100% scale (micro labels). At 200% = 22px. |

**Success criteria:**
- SC-12a: Automated accessibility audit (axe-core or similar) reports zero critical or serious violations across all screens
- SC-12b: VoiceOver (iOS) and TalkBack (Android) can navigate all screens, read all content, and activate all interactive elements
- SC-12c: All risk information is comprehensible without color perception (verified by testing with Sim Daltonism or equivalent)
- SC-12d: All interactive elements have visible focus indicators when navigated via keyboard or switch control
- SC-12e: App is fully usable at 200% text scaling on a 375px viewport

---

## 13. Dark mode

### 13.1 Activation

- Follows system setting by default
- Manual toggle available in Settings
- Persists user preference across sessions

### 13.2 Dark mode color mapping

| Light token | Light value | Dark value | Notes |
|---|---|---|---|
| `--color-bg` | `#F8F9FA` | `#0F1117` | Near-black with blue undertone |
| `--color-surface` | `#FFFFFF` | `#1A1D27` | Dark blue-gray |
| `--color-surface-recessed` | `#F0F1F3` | `#141720` | Darker than surface |
| `--color-border` | `#E8EAED` | `#2A2D37` | Subtle borders, 1px |
| `--color-shadow` | `rgba(26,26,46,0.06)` | `rgba(0,0,0,0.3)` | Stronger shadows needed in dark mode |
| `--color-primary` | `#1A1A2E` | `#EAEDF0` | Inverted for text |
| `--color-accent` | `#00897B` | `#26A69A` | Brighter teal for contrast |
| `--color-accent-light` | `#E0F2F1` | `#1A2E2C` | Dark teal tint |
| `--color-text-primary` | `#1A1A2E` | `#EAEDF0` | Light on dark |
| `--color-text-secondary` | `#5F6368` | `#9AA0A6` | Lighter gray |
| `--color-text-tertiary` | `#9AA0A6` | `#5F6368` | Swapped with secondary (lighter on dark bg) |
| `--color-risk-good` | `#2E7D68` | `#4CAF8B` | Brighter for dark bg |
| `--color-risk-moderate` | `#E8913A` | `#FFB74D` | Brighter |
| `--color-risk-poor` | `#D84315` | `#FF7043` | Brighter |
| `--color-risk-critical` | `#B71C1C` | `#EF5350` | Brighter |

### 13.3 Dark mode for 3D viewer

The 3D viewer's sky/background color shifts to `#0F1117` (matching app background). Ambient light intensity increases from 0.4 to 0.5 to compensate. Building colors remain realistic (no dark mode tinting on orthophoto textures or procedural facades). The teal building outline becomes `#26A69A` (brighter dark mode teal) for visibility against darker surroundings.

### 13.4 Dark mode elevation

In dark mode, elevation is communicated through **progressively lighter surfaces** rather than shadows (shadows are invisible on dark backgrounds).

| Level | Dark mode surface | Border |
|-------|------------------|--------|
| 0 | `#0F1117` | `1px solid #2A2D37` |
| 1 | `#1A1D27` | `1px solid #2A2D37` |
| 2 | `#232735` | None (elevated enough to distinguish) |
| 3 | `#2C3142` | None |

**Success criteria:**
- SC-13a: Dark mode activation/deactivation transitions smoothly (200ms crossfade on all surfaces)
- SC-13b: All WCAG AA contrast ratios maintained in dark mode (verified per-token)
- SC-13c: 3D viewer renders correctly in dark mode without color distortion on building textures
- SC-13d: Risk severity colors remain distinguishable in dark mode (verified with contrast checker)
- SC-13e: PDF export uses light mode colors regardless of app dark mode state (print optimization)

---

## 14. Responsive behavior

### 14.1 Breakpoints

| Breakpoint | Width | Layout changes |
|---|---|---|
| Small phone | 320–374px | Risk tiles stack 1-column. Compare limited to 2 addresses. Font scale: 95%. |
| Standard phone | 375–427px | Default layout. Risk tiles 2×2. All features available. |
| Large phone | 428–767px | Wider margins (24px). 3D viewer taller (55vh). |
| Tablet portrait | 768–1023px | 2-column layout for dossier (3D viewer spans full width, risk tiles + stats side by side). Compare shows all 3 columns without scroll. |
| Tablet landscape / Desktop | 1024px+ | 3-column layout. Navigation moves to left sidebar. 3D viewer and dossier content side by side. |

### 14.2 Orientation

- Portrait: Default, fully optimized
- Landscape: 3D viewer expands to 70vh (takes advantage of horizontal space for neighborhood view). Dossier content scrolls in a narrower column alongside.

**Success criteria:**
- SC-14a: All screens render without horizontal overflow on viewports from 320px to 1440px wide
- SC-14b: Touch targets remain ≥44×44px at all breakpoints
- SC-14c: 3D viewer is usable (orbit, timeline, presets) at all breakpoints
- SC-14d: Risk tile 2×2 grid degrades gracefully to 1-column at 320px without content loss

---

## 15. Performance requirements

| Metric | Target | Measurement | Owner |
|---|---|---|---|
| First contentful paint (search screen) | <1.5s | Lighthouse mobile, 4G throttle | Frontend |
| Time to interactive (search screen) | <2.5s | Lighthouse mobile, 4G throttle | Frontend |
| Address resolution | <1s | p95 server-side latency | Backend |
| Dossier generation (all cards) | <5s | p95 end-to-end from submit to render-complete | Full stack |
| 3D viewer first meaningful render | <4s on 4G | Time to buildings-visible + interactive | Frontend |
| 3D viewer full render | <6s on 4G | Time to orthophoto + facades loaded | Frontend |
| 3D viewer FPS | ≥30fps | Measured on iPhone 12 / Galaxy S21 | Frontend |
| Shadow timeline latency | <200ms per step | Time from slider input to shadow render | Frontend |
| Total scene transfer | <2.5 MB | CityJSON + orthophoto + atlas + JS bundle | Frontend + CDN |
| JavaScript bundle (gzipped) | <250 KB | Tree-shaken Three.js + app code | Frontend |
| forge3d snapshot render | <8s for 3 PNGs | Server-side render time | Backend (GPU) |
| forge3d sunlight analysis | <15s | 8 sample dates × full day raycasting | Backend (GPU) |
| PDF generation | <12s | Including forge3d render or cache hit | Full stack |
| Animation FPS | ≥50fps | All UI animations on target devices | Frontend |
| Memory usage (3D viewer) | <200 MB | Total GPU + CPU memory | Frontend |
| Lighthouse performance score | ≥80 | Mobile, 4G throttle | Frontend |
| Lighthouse accessibility score | 100 | All screens | Frontend |

**Success criteria:**
- SC-15a: All performance targets met on iPhone 12 (A14, 4GB RAM) and Samsung Galaxy S21 (Snapdragon 888, 8GB RAM) on a 13 Mbps 4G connection
- SC-15b: No memory leaks after 10 consecutive address lookups (3D viewer properly disposes geometry/textures)
- SC-15c: App recovers gracefully from GPU context loss (re-initializes Three.js without full page reload)

---

## 16. Implementation requirements

### 16.1 Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | React 18+ TypeScript | Strict TypeScript, no `any` types in production |
| State management | App-level `useState` | Current MVP architecture; no Redux/Zustand migration now |
| 3D rendering | Three.js (r160+) | Tree-shaken imports only |
| 3D geometry parsing | `cityjson-threejs-loader` | Apache-2.0, TU Delft |
| Sun position | SunCalc | Public domain algorithm |
| Animations (UI) | CSS transitions + component-level animation helpers | Framer Motion migration deferred |
| Animations (3D) | GSAP | For Three.js camera tweens |
| Internationalization | react-i18next | EN/NL string files |
| PDF generation | Server-side Python `fpdf2` (+ forge3 export snapshots) | Quick brief + full dossier templates |
| Styling | Plain CSS with design tokens | Tokens in `frontend/src/styles/tokens.css` |
| Icons | Lucide React (customized stroke weight) | MIT license |
| Haptics | `navigator.vibrate()` (Android) + native bridge (iOS) | Progressive enhancement |

### 16.2 Design token implementation

All design system values are defined as CSS custom properties in `frontend/src/styles/tokens.css`, with Polar Frost values as the current authority.

Theme values are applied on `:root` and `[data-theme="dark"]`:

```css
:root {
  --color-bg: #F8F9FA;
  --color-surface: #FFFFFF;
  --color-accent: #00897B;
  /* ... all tokens from §2 */
}

[data-theme="dark"] {
  --color-bg: #0F1117;
  --color-surface: #1A1D27;
  --color-accent: #26A69A;
  /* ... all dark mode overrides from §13 */
}
```

In the current stack, components consume these tokens directly via plain CSS classes and custom properties.

### 16.3 Component library requirements

The following reusable components must be built as the foundation of the UI:

| Component | Props | Notes |
|---|---|---|
| `<RiskTile>` | `category, score, severity, summary, onClick` | 2×2 grid tile |
| `<RiskDetail>` | `category, score, severity, explanation, comparisons[], questions[], source` | Full-screen detail |
| `<ScoreBar>` | `score, maxScore, color` | 2px track + dot indicator |
| `<SeverityBadge>` | `severity` | Icon + text label, colored |
| `<SummaryPill>` | `icon, score, severity, onClick` | Horizontal scroll pill |
| `<ViewingQuestion>` | `text, checked, onToggle, altLanguageText` | Checkbox + question |
| `<ComparisonBar>` | `label, value, maxValue, color` | Horizontal bar for charts |
| `<NeighborhoodRow>` | `label, value, quartile` | Key-value + dot indicator |
| `<LanguageToggle>` | `currentLang, onSwitch` | EN|NL segmented control |
| `<ActionBar>` | `onSave, onExport, isSaved` | Fixed bottom CTA bar |
| `<BottomSheet>` | `height, children, onDismiss` | Draggable bottom sheet |
| `<Card>` | `elevation, children` | Elevation-aware container |
| `<Viewer3D>` | `address, geometry, orthoTile, sunPosition, onReady` | Three.js viewer wrapper |
| `<ShadowTimeline>` | `season, time, onSeasonChange, onTimeChange` | Season buttons + time slider |
| `<ParallelCoordinates>` | `axes[], properties[]` | SVG chart for compare view |

### 16.4 Testing requirements

| Test type | Coverage target | Tools |
|---|---|---|
| Unit tests (components) | ≥80% line coverage | Jest + React Testing Library |
| Visual regression | All components, both themes | Chromatic or Percy |
| Accessibility audit | All screens | axe-core (automated) + manual VoiceOver/TalkBack |
| Performance audit | Critical paths | Lighthouse CI |
| Cross-browser | Chrome, Safari, Firefox (latest 2 versions) | BrowserStack |
| Device testing | iPhone 12, iPhone 14, Galaxy S21, Galaxy S23, iPad Air | Physical devices or BrowserStack |
| i18n validation | All strings present in EN + NL | Automated check in CI |
| Dark mode validation | All screens in both themes | Visual regression tests |
| 3D viewer | Geometry loading, shadow rendering, camera presets | Manual + automated FPS measurement |
| PDF output | Both templates, both languages | Manual visual inspection + automated content check |

---

## 17. Success criteria summary

All success criteria from individual sections, consolidated and numbered for tracking.

### Critical (must pass for launch)

| ID | Criteria | Section |
|---|---|---|
| SC-4.1a | Address resolves for ≥99% of valid Dutch postcode + huisnummer | §4.1 |
| SC-4.2d | Partial dossier renders on individual source failure | §4.2 |
| SC-4.2e | Total dossier generation <5 seconds (p95) | §4.2 |
| SC-5a | 3D first meaningful render <4 seconds on 4G | §5 |
| SC-5b | Shadow timeline responds within 200ms per step | §5 |
| SC-6a | All risk cards show all required elements | §6 |
| SC-6b | Score normalization produces consistent 0–100 values | §6 |
| SC-6h | Graceful degradation for unavailable data sources | §6 |
| SC-9a | PDF generation completes within 12 seconds | §9 |
| SC-9b | Quick Brief fits on 1 A4 page | §9 |
| SC-10a | 100% of strings available in EN and NL | §10 |
| SC-12a | Zero critical accessibility violations | §12 |
| SC-12b | Full VoiceOver and TalkBack navigation | §12 |
| SC-15a | Performance targets met on target devices | §15 |

### Important (should pass for launch, acceptable to defer 1 sprint)

| ID | Criteria | Section |
|---|---|---|
| SC-4.3.4b | Viewing questions are address-specific (≥80% of dossiers) | §4.3.4 |
| SC-5f | 3D viewer ≥30fps on target devices | §5 |
| SC-6c | Relatable comparisons reference actual nearby features (≥80%) | §6 |
| SC-7c | Dot indicators reflect correct national quartiles | §7 |
| SC-8b | Compare synchronized scroll at 60fps | §8 |
| SC-9j | Bilingual PDF for Full Dossier template | §9 |
| SC-11a | All animations ≥50fps on target devices | §11 |
| SC-13b | All dark mode contrast ratios at WCAG AA | §13 |

### Nice to have (defer if needed without impacting launch)

| ID | Criteria | Section |
|---|---|---|
| SC-5g | 3D fullscreen mode | §5 |
| SC-8d | Parallel coordinates chart in compare view | §8 |
| SC-11d | Haptic feedback on shortlist add and PDF export | §11 |
| SC-12e | Full usability at 200% text scaling | §12 |
| SC-14c | 3D viewer functional in landscape orientation | §14 |

---

## 18. Design risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Satoshi font not available/loading fails | Low | Medium — typography falls back to system fonts, losing editorial quality | Specify robust fallback stack. Font is variable (single file, ~45 KB). Subset to Latin Extended only. Preload via `<link rel="preload">`. |
| Teal accent color insufficient for all interactive states | Medium | Low — some elements may be hard to distinguish as interactive | Combine teal color with other affordances: underlines for links, shadows for buttons, borders for inputs. Never rely on color alone. |
| 2×2 risk grid too dense on small phones (320px) | Medium | Medium — tiles become too small to read | At 320px, degrade to single-column stacked tiles. Each tile becomes a horizontal bar (full width, 72px height) showing icon + category + score + severity badge. |
| 3D viewer performance varies wildly across devices | High | High — poor 3D experience undermines core differentiator | Three-tier fallback: (1) Full interactive viewer, (2) Simplified viewer (LoD1.3, no textures, no shadows), (3) Static forge3d snapshots with season toggle. Device capability detected via WebGL `MAX_TEXTURE_SIZE` and initial FPS measurement. |
| Dark mode introduces unforeseen contrast issues | Medium | Medium — accessibility violations in dark theme | Automated visual regression tests for both themes. Contrast checker integrated into component Storybook. All dark mode tokens tested against WCAG AA at design system level. |
| PDF design diverges from app design over time | Medium | Low — inconsistent brand experience | PDF template uses the same design tokens (exported to CSS/HTML for WeasyPrint). Shared `tokens.json` file consumed by both React app and PDF template. |
| Animation overhead impacts performance on mid-range devices | Medium | Medium — janky animations worse than no animations | Performance budget: no animation causes frame drop below 50fps. Monitor via `PerformanceObserver` long task API. Disable non-essential animations on devices with `navigator.hardwareConcurrency < 4`. |
| Dutch text expansion breaks layouts | Medium | Medium — truncated text, overflow, broken cards | All text containers tested at maximum Dutch string length. Use `text-overflow: ellipsis` as safety net. QA checklist includes full NL-language pass on every screen. |
| Expat users confused by unfamiliar Dutch reference points (e.g., CBS buurt names, Lden measurement) | High | Medium — data feels foreign and unhelpful | Every Dutch-specific term explained on first use. Comparison charts use international references (WHO limits, not just Dutch standards). "Learn more" expandable on technical terms. |
| Monochromatic palette feels too cold/clinical for anxious buyers | Medium | Medium — users don't form emotional connection with the app | Mitigated by: (1) conversational copy in risk explanations and viewing questions, (2) warm whites (#F8F9FA not pure white), (3) teal accent adds warmth to monochrome, (4) generous spacing and line heights create breathing room. Monitor via user testing — if NPS <40 on "friendliness" dimension, introduce subtle warm accent (e.g., amber for positive scores). |

---

## Appendix A: Design token reference (complete)

For implementation convenience, all tokens consolidated in a single exportable format:

```json
{
  "color": {
    "bg": { "light": "#F8F9FA", "dark": "#0F1117" },
    "surface": { "light": "#FFFFFF", "dark": "#1A1D27" },
    "surfaceRecessed": { "light": "#F0F1F3", "dark": "#141720" },
    "border": { "light": "#E8EAED", "dark": "#2A2D37" },
    "primary": { "light": "#1A1A2E", "dark": "#EAEDF0" },
    "accent": { "light": "#00897B", "dark": "#26A69A" },
    "accentLight": { "light": "#E0F2F1", "dark": "#1A2E2C" },
    "textPrimary": { "light": "#1A1A2E", "dark": "#EAEDF0" },
    "textSecondary": { "light": "#5F6368", "dark": "#9AA0A6" },
    "textTertiary": { "light": "#9AA0A6", "dark": "#5F6368" },
    "riskGood": { "light": "#2E7D68", "dark": "#4CAF8B" },
    "riskModerate": { "light": "#E8913A", "dark": "#FFB74D" },
    "riskPoor": { "light": "#D84315", "dark": "#FF7043" },
    "riskCritical": { "light": "#B71C1C", "dark": "#EF5350" }
  },
  "shadow": {
    "level1": "0 2px 8px rgba(26, 26, 46, 0.06)",
    "level2": "0 8px 24px rgba(26, 26, 46, 0.10)",
    "level3": "0 16px 48px rgba(26, 26, 46, 0.15)"
  },
  "radius": {
    "card": "16px",
    "button": "12px",
    "pill": "24px",
    "bottomSheet": "24px",
    "input": "12px"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "12px",
    "lg": "16px",
    "xl": "20px",
    "2xl": "24px",
    "3xl": "32px",
    "4xl": "48px",
    "5xl": "64px"
  }
}
```

---

## Appendix B: Screen inventory

Total screens to design and implement for MVP:

| # | Screen | States |
|---|---|---|
| 1 | Search (home) | Empty (first launch), with recent searches |
| 2 | Loading | Building animation + progress text |
| 3 | Dossier | Full data, partial data (source unavailable), all risk severity combinations |
| 4 | Risk detail: Noise | Good, Moderate, Poor, Critical |
| 5 | Risk detail: Air quality | Good, Moderate, Poor, Critical |
| 6 | Risk detail: Climate | Good, Moderate, Poor, Critical |
| 7 | Risk detail: Sunlight | Good, Moderate, Poor, Critical |
| 8 | 3D viewer fullscreen | Default, with overlay, each camera preset |
| 9 | Shortlist (empty) | No saved addresses |
| 10 | Shortlist (populated) | 1–3 saved addresses |
| 11 | Compare view | 2 addresses, 3 addresses |
| 12 | PDF export config | Bottom sheet |
| 13 | PDF preview | Quick Brief, Full Dossier |
| 14 | Settings | Main settings, about/legal |
| 15 | Error states | Network error, address not found, API timeout |

**Total unique screens: 15**
**Total state variations: ~50** (including severity combinations, data availability states, language variants)
**Theme variants: ×2** (light + dark)
**Estimated total design deliverables: ~100 screen designs**
