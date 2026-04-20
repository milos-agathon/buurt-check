# buurt-check — Frontend UI Assessment & Component Architecture

> **Date:** 2026-02-16
> **Based on:** 10 screenshots of live frontend (Example Street 12, 1234AB Sample City)
> **Assessed against:** design-prd.md v2.0, design-spec.md v3.0, ui-principles-v2.md

---

## Part 1: Full UI Assessment

### 1.1 What the dossier currently shows (scroll order)

Based on all 10 screenshots, the current dossier scroll order is:

```
1. Top bar (fixed): Buurt-Check wordmark + EN|NL toggle + dark mode icon
2. Address input bar (pill-style, looks editable)
3. Building Footprint map (2D polygon on grid, full-width card)
4. Address header: "Example Street 12 / 1234AB Sample City / Built 1983 · Residential"
5. Summary pills: [🔊 50] [🌿 84] [❄️ 15] [☀️ 100]
6. Building Facts section
7. Risk tiles (2×2 grid): Noise 50, Air 84, Climate 15, Sunlight 100
8. [Additional data sections]
9. 3D Neighborhood viewer (Three.js)
10. Sunlight Analysis (text + LOW RISK badge)
11. Shadow Snapshots (3 thumbnails: morning/noon/evening)
12. Neighborhood Snapshot (PEOPLE / HOUSING / ACCESSIBILITY categories)
13. Energy + Crime Signals
14. Action bar (floating): Add to Shortlist + Export Briefing
15. Bottom tab bar: Search + Saved
```

### 1.2 What's working well

**The core dossier architecture is in place.** Risk tiles with numeric scores and severity badges, summary pills with severity-colored icons, address header with building facts, 3D viewer with real geometry, shadow snapshots, and neighborhood data with quartile dots — the major sections all exist.

**The risk tile structure is sound.** Scores are prominent, severity badges include both icon and text label ("Moderate" with dash icon, "Good" with check icon), score bars are visible, and one-line summaries appear. Color coding matches the severity system: amber for moderate, green for good, red for poor/critical.

**The severity color system is consistent across tiles.** The four risk tiles in the 2×2 grid each display the correct severity color for their score range.

**The neighborhood snapshot data structure is good.** Category groupings (PEOPLE, HOUSING, ACCESSIBILITY) with key-value rows and quartile dot indicators match the spec pattern. Population density (8351 per km², ●●●●) is exactly the right format.

**The shadow snapshots section is strong.** Three thumbnails (Morning 9:00, Noon 12:00, Evening 17:00) with "Winter solstice (Dec 21) — worst case for sunlight" as context. Source attribution present. This is one of the best-executed sections.

**Dark mode implementation is cohesive.** The palette works consistently across all screens — dark backgrounds, light text, teal accents, severity colors read correctly against dark surfaces.

**The building footprint visualization is clear.** The teal polygon on a grid with center marker communicates building orientation and shape effectively.

---

### 1.3 Layout and spacing issues

#### Issue L-1: EN/NL toggle is oversized and crowds the top bar

**Observed:** The toggle appears to be ~40–44px tall, nearly filling the 44px content height of the top bar. Combined with the dark mode icon to its right, the top bar feels cramped and overstuffed.

**Spec:** PRD §3.2 specifies a 32px-height segmented control. The toggle should feel like a secondary utility, not a co-equal element to the wordmark.

**Fix:** Shrink toggle to 32px height, reduce inner text to 12px Medium, tighten horizontal padding to 8px per segment. Move the dark mode toggle to Settings — it doesn't earn permanent top-bar real estate. This recovers ~20px of breathing room in the header.

**Severity:** High — affects every screen, first thing the user sees.

#### Issue L-2: Address bar visually collides with the top bar

**Observed:** The address display uses an input-field style (rounded pill with location icon) that looks like an editable search bar. It sits immediately below the top bar with minimal spacing, creating visual collision between the fixed header and scrollable content.

**Spec:** PRD §4.3.1 specifies the address on the dossier screen as display typography (28px Black) — a content headline, not an input field. The input-field style should only appear on the Search tab. On the dossier, the address is confirmed information.

**Fix:** Two changes: (1) Replace the input-pill style with display typography: "Example Street 12" in Satoshi Black 28px, "1234AB Sample City" in 15px Regular secondary color, as a standard content header. (2) Add proper spacing — the PRD specifies the top bar has 44px content height, and the first content element should have adequate top margin (16–24px below the top bar boundary). This creates clear separation between chrome and content.

**Severity:** High — creates a confused interaction model (is this editable?) and visual cramping.

#### Issue L-3: Action bar permanently visible, consuming viewport

**Observed:** "Add to Shortlist" and "Export Briefing" float above the tab bar on every scroll position, consuming ~80px of viewport (64px bar + safe area padding). On an iPhone SE (667px viewport), that's 12% of the screen permanently occupied by buttons.

**Spec:** PRD §4.3.5 says the action bar should appear "when the user scrolls past the viewing checklist" — it's scroll-triggered, not permanent.

**Fix:** Hide the action bar until the user scrolls past the risk tiles section. Animate in with slide-up (250ms, ease-out). When user scrolls back to top, fade out. This recovers ~80px of viewport for the content sections where the user is still reading and hasn't reached the action point. The action bar appears precisely when the dossier transitions from "information" to "decision."

**Severity:** High — wastes viewport on every screen of the dossier, pushes content upward, creates a cramped feeling.

#### Issue L-4: Card containers bleed past screen margins

**Observed:** Across multiple screenshots, card edges appear to run to the screen edge or very close to it, with insufficient breathing room between card borders and the viewport edge. This is most visible on the neighborhood snapshot rows and the sunlight analysis section, where content appears to press against both sides of the screen.

**Spec:** PRD §2.3 specifies 20px screen-edge margins (`--space-xl`). All cards should have `margin-inline: 20px`, producing a visible gutter on both sides.

**Fix:** Enforce `margin: 0 20px` on all `<Card>` containers, no exceptions. The building footprint viewer may legitimately use `fullBleed` mode (edge-to-edge viewport), but every data card, risk tile, neighborhood row, and content section must have 20px side margins. This single fix will dramatically improve the visual quality — it's the difference between "mobile app" and "content in a tube."

**Severity:** Critical — this is the most visually damaging issue. Consistent margins are the foundation of the editorial "Polar Frost" aesthetic.

#### Issue L-5: Bottom tab bar shows 2 tabs instead of 3

**Observed:** Search and Saved only. No Briefing tab.

**Spec:** PRD §3.1 specifies three tabs: Search, Briefing, Saved. The Briefing tab is the persistent entry point to return to the current dossier from any other screen.

**Fix:** Add the Briefing tab (document icon) between Search and Saved. This also increases the tab bar's information density without crowding — three tabs at ~125px each on a 375px phone is comfortable.

**Severity:** Medium — functional gap rather than visual, but affects navigation flow.

#### Issue L-6: Insufficient spacing between dossier sections

**Observed:** The gap between major sections (building footprint → address header → risk tiles → sunlight → neighborhood) appears to be 16–24px. Sections feel like a continuous list rather than distinct chapters.

**Spec:** PRD §2.3 specifies 48px (`--space-4xl`) between major dossier sections.

**Fix:** Apply `margin-top: 48px` to each major section container. Major sections are: address header block, 3D viewer, risk tiles group, sunlight analysis, shadow snapshots, neighborhood snapshot, energy + crime, viewing checklist. Within a section, elements use 12–16px gaps. Between sections, 48px. This creates the "chapters of a briefing" rhythm.

**Severity:** Medium — contributes to the "dense list" feeling rather than "curated briefing."

---

### 1.4 Content and data presentation issues

#### Issue C-1: Risk tile labels include technical measurement units

**Observed:** "ROAD TRAFFIC NOISE (LDEN)" and "AIR QUALITY (PM2.5 / NO2)" on the tile face.

**Spec:** PRD §6.2 specifies short labels: "NOISE", "AIR QUALITY", "CLIMATE", "SUNLIGHT". Technical terms (Lden, PM2.5, NO2) belong in the detail view.

**Fix:** Shorten all tile labels to single-concept names. The `<RiskTile>` component should enforce a max label length (~20 characters) to prevent verbose labels from creeping back in. An expat user seeing "LDEN" gains nothing from it — it actively harms comprehension.

**Severity:** High — directly contradicts the "consequences over data" principle. The tile face is for scanning, not reading technical specs.

#### Issue C-2: One-line summaries show raw measurements instead of plain language

**Observed:** "Moderate noise (65 dB) —..." and "Good air quality (PM2.5: 8..." lead with raw data.

**Spec:** PRD §6.2 specifies plain-language interpretation as the one-liner: "Busy road nearby" or "Clean air, well below limits." Raw numbers live behind the detail tap.

**Fix:** Rewrite all tile summaries as buyer-relevant interpretations. Examples: Noise 50 → "Busy road nearby — audible with windows open." Air 84 → "Clean air, well below WHO limits." Climate 15 → "High flood and heat risk." Sunlight 100 → "Excellent sun exposure year-round."

**Severity:** High — the plain-language layer is the product's UX differentiator.

#### Issue C-3: Sunlight card uses "LOW RISK" instead of the severity system

**Observed:** Green "LOW RISK" pill on the sunlight analysis section.

**Spec:** PRD §6.2 defines four severity levels: Good (✓ circle, green), Moderate (— dash, amber), Poor (▲ triangle, coral), Critical (✕ cross, crimson). "LOW RISK" is not in the vocabulary.

**Fix:** Replace with `<SeverityBadge score={100} />` which auto-renders "Good" with the check-circle icon in green. All risk indicators must use the same four-level vocabulary for cross-card consistency.

**Severity:** High — inconsistency in the most important visual system.

#### Issue C-4: Sunlight card has no numeric score

**Observed:** The sunlight section shows descriptive text and "LOW RISK" but no 0–100 score number.

**Spec:** PRD §6.2 requires a prominent score number (40px Black on tiles, 48px Black on detail views) as the primary visual element on every risk card.

**Fix:** Add the score display. The summary pills show 100 for sunlight — that same number must appear on the sunlight card/detail view using the `<ScoreDisplay>` component.

**Severity:** High — scores are the backbone of the comparison system.

#### Issue C-5: Sunlight seasonal data is incomplete

**Observed:** Only "Winter solstice: 7 hrs" and "Equinox: 12 hrs" shown.

**Spec:** PRD §6.4 sunlight card specifies four seasonal values: "Dec: X.Xh / Mar: X.Xh / Jun: X.Xh / Sep: X.Xh."

**Fix:** Show all four seasons. This is a natural candidate for a small horizontal bar chart (the "dataviz instead of text" improvement) — four bars labeled by season, length proportional to hours, with a reference line at the WHO/Dutch recommended threshold.

**Severity:** Medium — incomplete data reduces the card's usefulness.

#### Issue C-6: Text-heavy sunlight section could use more dataviz

**Observed:** The sunlight analysis is a paragraph of descriptive text. "This building receives good direct sunlight year-round. Even in winter, the rooftop gets several hours of sun."

**Spec:** PRD §6.3 structures the detail view as: score display → "What this means" section (interpreted) → comparison chart → viewing questions → source. The comparison chart is a horizontal bar chart, not a paragraph.

**Fix:** Replace the paragraph with: (1) a seasonal hours bar chart (4 rows: Dec/Mar/Jun/Sep), (2) one sentence of interpretation ("This home gets more winter sun than 85% of addresses in the area"), (3) viewing questions with checkboxes. The chart communicates the data faster than prose and looks more professional.

**Severity:** Medium — the prose works but a chart communicates faster and looks more polished.

#### Issue C-7: "Data not available" rows should be hidden or properly degraded

**Observed:** Owner-occupied, Avg property value, and Distance to supermarket all show "Data not available" as standard-styled rows.

**Spec:** PRD §20.3 specifies degraded states with recessed background, "—" dash replacing the value, and 0.7 opacity.

**Fix:** Best option: hide unavailable rows entirely and show a small footer: "Some data unavailable for this area. [Learn more]". Second best: apply the full degraded visual treatment (recessed bg, dimmed opacity, hidden quartile dots). Worst option (current): showing "Data not available" in the same visual style as populated rows. An indicator that says "Data not available" provides negative value — it makes the app look incomplete without helping the user.

**Severity:** Medium — affects perceived data quality and trustworthiness.

#### Issue C-8: "Energy label service requires API authorization"

**Observed:** Technical error message visible to the user in the Energy + Crime section.

**Spec:** PRD §20.2: "Error states show user-friendly language (no technical error codes, no stack traces)."

**Fix:** Replace with "Energy label data temporarily unavailable" or hide the section entirely until the API is connected. The user cannot act on "requires API authorization."

**Severity:** Medium — erodes trust. A user making a buying decision sees this and questions the app's reliability.

---

### 1.5 3D viewer issues

#### Issue V-1: 3D render is too dark

**Observed:** Buildings are barely distinguishable from the dark background. Geometry forms are hard to read.

**Spec:** PRD §5.1 specifies ambient light `#B8C4D0` at intensity 0.4, directional light `#FFFAF0` at intensity 0.8. Sky background should match the app surface color.

**Fix:** Increase ambient light intensity. The viewer should have enough contrast that building forms are clearly readable at a glance — the "window into reality" shouldn't require squinting. Test by checking if a user can count the buildings in the scene within 2 seconds.

**Severity:** High — the 3D viewer is the signature differentiator and currently doesn't deliver its visual impact.

#### Issue V-2: Target building not highlighted

**Observed:** All buildings appear with the same visual treatment. The user's building isn't distinguished.

**Spec:** PRD §5.1 requires a teal outline effect (`#2EC4B6`, 2px screen-space edge) on the target building via post-processing outline pass or stencil buffer.

**Fix:** Add the teal edge highlight. This is essential — without it, the user doesn't know which building is "theirs" in a neighborhood of similar-looking geometry. The highlight also visually connects the 3D viewer to the rest of the teal accent system.

**Severity:** High — core usability gap in the hero feature.

#### Issue V-3: No season buttons or time slider

**Observed:** The 3D viewer shows a static view with only a fullscreen toggle.

**Spec:** PRD §5.2 specifies the shadow timeline control as the primary interactive element: four season buttons (❄️🌸☀️🍂) + horizontal time slider (06:00–21:00).

**Fix:** Add the season/time controls at the bottom of the viewer card. These transform the 3D viewer from a static model into an interactive sunlight analysis tool — the core feature that justifies the 3D rendering.

**Severity:** High — without these controls, the 3D viewer is a visual but not functional.

#### Issue V-4: Camera presets — removed by design decision

**Decision:** Camera preset buttons (street level, balcony level, top-down) are removed from scope. The 3D viewer launches at a default camera angle. Users can orbit manually.

**Action required:** Update PRD §5.2 to remove the top-left camera preset cluster. Update design-spec.md §4 to remove the 36×36px button stack. Update ui-principles-v2.md §7 to remove "camera presets" from the control list. The 3D viewer controls simplify to: fullscreen toggle (top-right) + season buttons + time slider (bottom).

---

### 1.6 Color and styling issues

#### Issue S-1: Export Briefing button is coral/red instead of teal

**Observed:** The primary CTA uses a coral/red fill color across all screenshots.

**Spec:** PRD §4.3.5 specifies "filled `--color-accent` background" — teal (`#2EC4B6`), white text.

**Fix:** Change to teal. Coral (`#EF4444`) is reserved for risk severity indicators and destructive action confirmations (delete dialogs). Using it for the primary CTA creates a subconscious warning signal — the opposite of what you want for your most important conversion button. This is a one-line CSS change with outsized impact.

**Severity:** High — wrong semantic signal on the app's primary conversion action.

#### Issue S-2: Score bar track appears 4px instead of specified 2px

**Observed:** The score bars in the risk tiles have a visible track that appears thicker than the specified 2px.

**Spec:** design-spec.md §5: 2px track height, 8px dot endpoint.

**Fix:** Reduce to 2px. The thinner track creates a more refined data marker that doesn't compete visually with the score number. At 4px, the bar starts to look like a progress indicator rather than a precise scale marker.

**Severity:** Low — subtle refinement, but contributes to overall polish.

#### Issue S-3: Shadow snapshot thumbnails are too dark

**Observed:** The three morning/noon/evening thumbnails appear nearly black. Building geometry is hard to distinguish.

**Fix:** Same root cause as V-1 — increase ambient light in the shadow render. Additionally, consider rendering these against a lighter ground plane. The thumbnails need to clearly show the contrast between lit and shadowed areas even at ~80×80px thumbnail size.

**Severity:** Medium — the snapshots are a strong feature that's undermined by low visibility.

---

### 1.7 Dossier order considerations

The current order places the building footprint map first, before the address header and summary pills. The PRD specifies address header + summary strip as the first content below the top bar (the BLUF — bottom line up front).

**Current:** Footprint → Address → Pills → Facts → Risk tiles → ... → 3D viewer → Sunlight → ...

**Recommended:** Address header + Pills → Risk tiles (2×2) → Building footprint / 3D viewer → Sunlight detail → Shadow snapshots → Neighborhood snapshot → Viewing checklist → Energy + Crime

The address and risk scores should be the first thing a user sees when the dossier opens — instant answers to "what address is this?" and "should I be worried?" The spatial visualizations (footprint, 3D) follow as evidence supporting those scores. This matches the "briefing, not dashboard" principle: lead with conclusions, then show the supporting data.

---

### 1.8 Issue priority summary

| Priority | Issues | Impact |
|----------|--------|--------|
| **Critical** | L-4 (margin bleed) | Visual quality foundation |
| **High** | L-1 (toggle size), L-2 (address bar style), L-3 (action bar always visible), C-1 (verbose tile labels), C-2 (raw data summaries), C-3 (LOW RISK vocabulary), C-4 (missing sunlight score), V-1 (dark 3D), V-2 (no target highlight), V-3 (no season/time controls), S-1 (coral export button) | Core UX and visual identity |
| **Medium** | L-5 (2 tabs), L-6 (section spacing), C-5 (incomplete seasons), C-6 (text vs dataviz), C-7 (data not available), C-8 (API error message), S-3 (dark thumbnails) | Polish and data quality |
| **Low** | S-2 (score bar thickness) | Refinement |

---

## Part 2: Component Architecture

### 2.0 Design principles for the component library

1. **Components enforce the spec.** Incorrect usage should be difficult or impossible. A `<Button variant="primary">` always renders teal — there is no color prop. A `<Card>` always has 20px margins — there is no `margin` prop (only a `fullBleed` boolean for edge-to-edge viewports).

2. **Composition over configuration.** Complex UI assembles from simple primitives. A `<RiskTile>` composes `<Card>` + `<SeverityBadge>` + `<ScoreDisplay>` + `<ScoreBar>`. The primitives are independently useful and testable.

3. **Every visual decision lives in tokens.** Components reference CSS custom properties from `tokens.css`, never hardcoded values. This means dark mode, future themes, and spec changes propagate automatically.

4. **Components own their states.** A `<DataRow>` handles its own "unavailable" state internally — the parent just passes `unavailable={true}` and the row renders the correct degraded treatment. No per-instance styling of edge cases.

---

### 2.1 Tier 1 — Foundation components

These must be built first. Everything else depends on them.

---

#### `<Card>`

The universal container for all content sections in the dossier.

**Purpose:** Enforces consistent border radius, margins, padding, elevation, and borders across the entire app. Every visual container wraps in this component.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `padding` | `'compact' \| 'standard'` | `'standard'` | `compact` = 20px (risk tiles, compare columns). `standard` = 24px (content cards, detail views). |
| `elevation` | `0 \| 1 \| 2 \| 3` | `1` | Maps to design system shadow levels. |
| `fullBleed` | `boolean` | `false` | When `true`, card goes edge-to-edge (0 margin). Used only for the building footprint viewer and 3D viewer. |
| `children` | `ReactNode` | — | Card content. |

**Visual spec:**

| Property | Value |
|----------|-------|
| Border radius | `var(--radius-card)` = 16px |
| Margin (inline) | 20px each side (`var(--space-xl)`) when `fullBleed` is `false`; 0 when `true` |
| Border | `1px solid var(--color-border)` for elevation 0 and 1; none for elevation 2 and 3 |
| Shadow (level 0) | None |
| Shadow (level 1) | `var(--shadow-level1)` = `0 2px 8px rgba(28, 45, 63, 0.06)` |
| Shadow (level 2) | `var(--shadow-level2)` = `0 8px 24px rgba(28, 45, 63, 0.10)` |
| Shadow (level 3) | `var(--shadow-level3)` = `0 16px 48px rgba(28, 45, 63, 0.15)` |
| Background | `var(--color-surface)` |
| Padding (`compact`) | 20px all sides |
| Padding (`standard`) | 24px all sides |

**States:**

| State | Treatment |
|-------|-----------|
| Default | As specified above |
| Pressed/tappable | Background transitions to `var(--color-surface-recessed)` for 150ms on press (only when card has `onClick`) |
| Disabled/degraded | Opacity 0.7, background `var(--color-surface-recessed)`, border color unchanged |

**Usage rules:**
- Every data section in the dossier wraps in `<Card>`.
- `fullBleed` is reserved for viewport-type content (footprint map, 3D viewer). Never use on data cards.
- Cards never nest inside cards (no card-in-card patterns).

---

#### `<SeverityBadge>`

Renders score + icon + label as a unified severity indicator.

**Purpose:** Single source of truth for the four-level severity system. Eliminates vocabulary inconsistencies ("LOW RISK" vs "Good") by owning the score → severity derivation.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `score` | `number` (0–100) | — | **Required.** Normalized risk score. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | `sm` = inline (16px icon, 13px text). `md` = tile badge (16px icon, 13px text, pill background). `lg` = detail view hero (20px icon, 16px text). |
| `showLabel` | `boolean` | `true` | Whether to show the text label ("Good", "Moderate", etc). |
| `showIcon` | `boolean` | `true` | Whether to show the severity icon shape. |

**Score → severity derivation (internal, not configurable):**

| Score range | Severity | Label (EN) | Label (NL) | Icon | Color token |
|-------------|----------|------------|------------|------|-------------|
| 70–100 | Good | "Good" | "Goed" | ✓ Circle | `--color-risk-good` (#22C55E) |
| 40–69 | Moderate | "Moderate" | "Matig" | — Dash in circle | `--color-risk-moderate` (#EAB308) |
| 20–39 | Poor | "Poor" | "Slecht" | ▲ Triangle | `--color-risk-poor` (#EF4444) |
| 0–19 | Critical | "Critical" | "Kritiek" | ✕ Cross in circle | `--color-risk-critical` (#B91C1C) |

**Visual spec (size `md` — used on risk tiles):**

| Property | Value |
|----------|-------|
| Layout | Horizontal: icon (16px) + 4px gap + label text |
| Label font | `var(--type-caption)` = Satoshi Regular 13px |
| Label color | Severity color token (matches icon) |
| Icon size | 16px × 16px |
| Icon stroke | 1.5px |
| Background (when pill) | Severity color at 12% opacity |
| Pill padding | 4px 8px |
| Pill border radius | `var(--radius-pill)` = 24px |

**Usage rules:**
- Never hardcode severity labels or colors outside this component.
- The component internally reads the current language (EN/NL) for label text.
- When `score` is `null` or `undefined`, renders "—" dash in `var(--color-text-tertiary)`.

---

#### `<ScoreDisplay>`

The prominent numeric score shown on risk tiles and detail views.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `score` | `number` (0–100) | — | **Required.** |
| `size` | `'tile' \| 'detail'` | `'tile'` | `tile` = 40px for 2×2 grid. `detail` = 48px for fullscreen detail view. |

**Visual spec:**

| Property | `tile` | `detail` |
|----------|--------|----------|
| Font | Satoshi Black (900) | Satoshi Black (900) |
| Size | 40px (`--type-score-tile`) | 48px (`--type-score-large`) |
| Line height | 44px | 53px |
| Letter spacing | -0.03em | -0.03em |
| Color | Severity color (derived from score) | Severity color |
| Alignment | Center | Center |

**States:**

| State | Treatment |
|-------|-----------|
| Loading | Skeleton placeholder: gray rounded rect, 48px × 24px (tile) or 56px × 28px (detail) |
| Unavailable | "—" dash in `var(--color-text-tertiary)`, same font size |
| Animated entry | Count-up from 0 to value over 600ms, ease-out (respects `prefers-reduced-motion`) |

---

#### `<ScoreBar>`

The 2px horizontal track with dot endpoint showing score position on a 0–100 scale.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `score` | `number` (0–100) | — | **Required.** |

**Visual spec:**

| Property | Value |
|----------|-------|
| Track height | 2px |
| Track color (unfilled) | `var(--color-border)` (#E2E7ED light / #2A2D37 dark) |
| Track color (filled) | Severity color (derived from score) |
| Track width | 100% of parent container (minus card padding) |
| Track border radius | 1px (fully rounded) |
| Dot diameter | 8px |
| Dot color | Severity color |
| Dot position | Positioned at the score percentage along the track |
| Dot border | 2px solid `var(--color-surface)` (creates a "cut-out" effect against the track) |

**Animation:** Dot slides from 0 to score position over 400ms (ease-out), after the `<ScoreDisplay>` count-up completes. Respects `prefers-reduced-motion`.

---

#### `<ActionBar>`

Floating bottom bar with primary and secondary CTAs.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `primaryLabel` | `string` | — | Primary button text (e.g., "Export Briefing"). |
| `primaryIcon` | `ReactNode` | — | Icon for primary button. |
| `primaryOnClick` | `() => void` | — | Primary action handler. |
| `secondaryLabel` | `string` | — | Secondary button text (e.g., "Add to Shortlist"). |
| `secondaryIcon` | `ReactNode` | — | Icon for secondary button. |
| `secondaryOnClick` | `() => void` | — | Secondary action handler. |
| `secondaryActive` | `boolean` | `false` | When `true`, secondary shows as "Saved ✓" filled state. |
| `visible` | `boolean` | `false` | Controls show/hide. Parent manages scroll-trigger logic. |

**Visual spec:**

| Property | Value |
|----------|-------|
| Background | `var(--color-surface)` |
| Shadow | `var(--shadow-level2)` cast upward |
| Height | 64px + `env(safe-area-inset-bottom)` |
| Padding | 8px 20px (aligns buttons with card margins) |
| Position | Fixed, bottom 0, above tab bar |
| Button gap | 12px between secondary and primary |
| Button height | 48px |
| Primary button | `var(--color-accent)` background, white text, 12px border radius |
| Secondary button | Transparent background, `var(--color-accent)` border (1.5px) + text, 12px border radius |
| Secondary (active) | `var(--color-accent)` background at 12% opacity, `var(--color-accent)` text, filled bookmark icon |

**Show/hide animation:**

| Transition | Value |
|------------|-------|
| Show | Slide up from below tab bar, 250ms, ease-out |
| Hide | Slide down, 200ms, ease-in |
| Reduced motion | Instant appear/disappear (no slide) |

**Layout — narrow phones (<360px):** Stack buttons vertically, primary on top. Each button full-width. Bar height increases to 120px + safe area.

**Usage rules:**
- Parent component sets `visible` based on scroll position (IntersectionObserver on the risk tiles section — when risk tiles scroll out of view, show the bar).
- Primary button is always teal. There is no `color` prop.
- The bar positions itself above the `<TabBar>`, accounting for safe area. No manual offset needed.

---

#### `<TopBar>`

Fixed header with wordmark, language toggle, and optional right action.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `'Buurt-Check'` | Left-side title/wordmark. |
| `showLanguageToggle` | `boolean` | `true` | Show the EN/NL segmented control. |
| `rightAction` | `ReactNode \| null` | `null` | Optional right-side icon button (settings gear on Search screen). |

**Visual spec:**

| Property | Value |
|----------|-------|
| Background | `var(--color-nav-bg)` = #1C2D3F (dark slate, non-flipping in both themes) |
| Height | 44px content + `env(safe-area-inset-top)` for status bar |
| Padding | 0 16px (inline) |
| Title font | Satoshi Bold (700), 16px, white |
| Title position | Left-aligned, vertically centered |
| z-index | `var(--z-nav)` = 100 |

**Language toggle (internal sub-component):**

| Property | Value |
|----------|-------|
| Type | Segmented control |
| Height | 32px |
| Width | Auto (fits "EN" + "NL" labels) |
| Active segment background | `var(--color-accent)` |
| Active segment text | White, Satoshi SemiBold (600), 12px |
| Inactive segment text | `rgba(255, 255, 255, 0.6)`, Satoshi Medium (500), 12px |
| Border radius | 16px (pill) |
| Position | Right-aligned (or center if no rightAction), vertically centered |
| Transition | 200ms slide + crossfade on segment switch |

**Usage rules:**
- The dark mode toggle does NOT live in the TopBar. It belongs in Settings.
- No component can overflow the TopBar's 44px content height. The 32px toggle + 6px top/bottom margin fills the space cleanly.
- The title does not scroll away. The TopBar is always fixed.

---

#### `<TabBar>`

Bottom navigation with three tabs.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `activeTab` | `'search' \| 'briefing' \| 'saved'` | — | Currently active tab. |
| `savedCount` | `number` | `0` | Badge count on the Saved tab (0 = no badge). |
| `onTabChange` | `(tab) => void` | — | Tab switch handler. |

**Visual spec:**

| Property | Value |
|----------|-------|
| Background | `var(--glass-bg)` = `rgba(255, 255, 255, 0.8)` light / `rgba(15, 17, 23, 0.85)` dark |
| Backdrop filter | `blur(20px)` |
| Top border | `1px solid var(--color-border)` |
| Height | 56px + `env(safe-area-inset-bottom)` |
| Tab count | 3 (Search, Briefing, Saved) |
| Tab width | Equal thirds (33.33%) |

**Tab item spec:**

| Property | Active | Inactive |
|----------|--------|----------|
| Icon size | 24px | 24px |
| Icon color | `var(--color-accent)` | `var(--color-text-secondary)` |
| Label font | Satoshi Medium (500), 11px | Same |
| Label color | `var(--color-accent)` | `var(--color-text-secondary)` |
| Touch target | Full tab width × 56px |
| Badge (Saved tab) | 16px circle, `var(--color-accent)` bg, white text 10px Bold, offset top-right of icon |

**Tab definitions:**

| Tab | Icon | Label |
|-----|------|-------|
| Search | Magnifying glass (24px, 1.5px stroke) | "Search" / "Zoek" |
| Briefing | Document with lines (24px, 1.5px stroke) | "Briefing" |
| Saved | Bookmark (24px, 1.5px stroke) | "Saved" / "Opgeslagen" |

---

### 2.2 Tier 2 — Composed components

Built from Tier 1 primitives. Implement after Tier 1 is stable.

---

#### `<RiskTile>`

One tile in the 2×2 risk assessment grid.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `category` | `'noise' \| 'air' \| 'climate' \| 'sunlight'` | — | **Required.** Determines icon and short label. |
| `score` | `number \| null` | — | 0–100 normalized score. `null` = data unavailable. |
| `summary` | `string` | — | Plain-language one-liner (max ~60 chars). Must not contain raw measurements. |
| `onTap` | `() => void` | — | Opens the detail view. |

**Composed from:** `<Card padding="compact">` + `<SeverityBadge>` + `<ScoreDisplay size="tile">` + `<ScoreBar>`

**Internal label mapping (not configurable):**

| Category | Label (EN) | Label (NL) | Icon |
|----------|------------|------------|------|
| `noise` | NOISE | GELUID | Sound waves (32px) |
| `air` | AIR QUALITY | LUCHTKWALITEIT | Leaf/wind (32px) |
| `climate` | CLIMATE | KLIMAAT | Water drop + heat (32px) |
| `sunlight` | SUNLIGHT | ZONLICHT | Sun with rays (32px) |

**Layout:**

```
┌────────────────────────┐
│ NOISE         ⊖ Moderate│  ← category label + SeverityBadge (sm)
│                         │
│           50            │  ← ScoreDisplay (tile)
│                         │
│  ════════●══════════    │  ← ScoreBar
│                         │
│  Busy road nearby    →  │  ← summary + chevron
└────────────────────────┘
```

| Property | Value |
|----------|-------|
| Min-height | 160px |
| Padding | 20px (compact Card) |
| Tap feedback | Card pressed state (150ms recessed bg) |
| Chevron | 16px, `var(--color-text-tertiary)`, right-aligned on summary line |

**Unavailable state (score is `null`):**

| Property | Value |
|----------|-------|
| Card background | `var(--color-surface-recessed)` |
| Score area | "—" dash, 40px, `var(--color-text-tertiary)` |
| Severity badge | Hidden |
| Score bar | Hidden |
| Summary | "Data temporarily unavailable" / "Data tijdelijk niet beschikbaar" |
| Opacity | 0.7 |
| Tap | Disabled |

---

#### `<SummaryPill>`

Horizontal scrolling risk score pill used in the summary strip.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `category` | `'noise' \| 'air' \| 'climate' \| 'sunlight'` | — | **Required.** |
| `score` | `number` | — | **Required.** |
| `onTap` | `() => void` | — | Scrolls dossier to corresponding risk tile. |

**Visual spec:**

| Property | Value |
|----------|-------|
| Min-width | 80px |
| Height | 36px |
| Border radius | 18px (full pill) |
| Background | `var(--color-surface-recessed)` |
| Padding | 0 12px |
| Layout | Icon (16px, severity color) + 6px gap + score (Satoshi SemiBold 16px, severity color) |
| Gap between pills | 8px |
| Container | Horizontal scroll, `scroll-snap-type: x mandatory`, `scroll-snap-align: start` per pill |

**Tap behavior:** Tapping a pill smooth-scrolls the dossier to the corresponding `<RiskTile>` and triggers a 300ms background pulse (`var(--color-accent-light)`) on the target tile.

---

#### `<DataRow>`

A single row in the neighborhood snapshot section.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Indicator name (e.g., "Population density"). |
| `value` | `string \| null` | — | Formatted value (e.g., "8351 per km²"). `null` = unavailable. |
| `quartile` | `1 \| 2 \| 3 \| 4 \| null` | `null` | National quartile for dot indicator. |
| `hidden` | `boolean` | `false` | When `true` and `value` is `null`, the row is hidden entirely. |

**Visual spec (populated state):**

| Property | Value |
|----------|-------|
| Height | 48px |
| Padding | 0 16px (inherits from parent card padding) |
| Label font | `var(--type-body)` = Satoshi Regular 15px |
| Label color | `var(--color-text-primary)` |
| Value font | `var(--type-data)` = Satoshi Medium 24px |
| Value color | `var(--color-text-primary)` |
| Value alignment | Right-aligned within center column |
| Divider | 1px solid `var(--color-border)`, inset 16px from left (below row) |
| Dot indicators | 4 circles, 8px diameter, 4px gap, right-aligned |
| Dot active color | `var(--color-accent)` |
| Dot inactive color | `var(--color-border)` |

**Unavailable state (value is `null`, `hidden` is `false`):**

| Property | Value |
|----------|-------|
| Background | `var(--color-surface-recessed)` |
| Value area | "—" dash, `var(--color-text-tertiary)` |
| Dot indicators | Hidden |
| Opacity | 0.7 |

**Usage rules:**
- When `value` is `null` and `hidden` is `true`, the row doesn't render at all. Recommended default: hide unavailable rows and show a footer "Some data unavailable for this area."
- The quartile dot count matches active dots: 1 dot filled = bottom quartile, 4 dots filled = top quartile.

---

#### `<Button>`

Three variants, spec-enforced colors.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'tertiary'` | `'primary'` | Visual style. |
| `label` | `string` | — | **Required.** Button text. |
| `icon` | `ReactNode \| null` | `null` | Optional leading icon (20px). |
| `disabled` | `boolean` | `false` | Disabled state. |
| `destructive` | `boolean` | `false` | When `true` on tertiary buttons, text is coral. Used only in alert dialogs for confirm-delete. |
| `fullWidth` | `boolean` | `false` | When `true`, button spans parent width. |
| `onClick` | `() => void` | — | Click handler. |

**Visual spec:**

| Property | Primary | Secondary | Tertiary |
|----------|---------|-----------|----------|
| Height | 48px | 40px | 36px |
| Background | `var(--color-accent)` | Transparent | Transparent |
| Border | None | 1.5px solid `var(--color-accent)` | None |
| Text color | White | `var(--color-accent)` | `var(--color-accent)` |
| Text font | Satoshi SemiBold 16px | Satoshi SemiBold 15px | Satoshi Medium 15px |
| Border radius | 12px | 12px | 8px |
| Padding (h) | 24px | 20px | 12px |
| Min touch target | 48 × 48px | 44 × 44px | 44 × 36px |
| Icon size | 20px, white | 20px, teal | 20px, teal |
| Icon gap | 8px | 8px | 6px |

**States:**

| State | Primary | Secondary | Tertiary |
|-------|---------|-----------|----------|
| Hover/press | Background darkens 10% | Background `var(--color-accent-light)` | Text opacity 0.7 |
| Disabled | Opacity 0.4, no pointer events | Same | Same |
| Destructive (tertiary only) | N/A | N/A | Text `var(--color-risk-poor)` |

**Usage rules:**
- Primary buttons are always teal. There is no `color` or `bgColor` prop. To make a coral destructive button, use `<Button variant="tertiary" destructive>`.
- One primary button per screen/view. If two actions compete, one must be secondary or tertiary.
- Button text must not wrap to 2 lines in either EN or NL. The component logs a warning in dev mode if text exceeds the single-line width.

---

#### `<ViewingQuestion>`

A single checkbox question in the viewing checklist.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `question` | `string` | — | The question text. |
| `checked` | `boolean` | `false` | Checkbox state. |
| `onChange` | `(checked: boolean) => void` | — | Toggle handler. |
| `category` | `'noise' \| 'air' \| 'climate' \| 'sunlight'` | — | For grouping and icon display. |

**Visual spec:**

| Property | Value |
|----------|-------|
| Layout | Checkbox (left) + 12px gap + question text (right, flex) |
| Checkbox size | 22px × 22px |
| Checkbox border | 2px solid `var(--color-border)` |
| Checkbox border radius | 4px |
| Checkbox checked fill | `var(--color-accent)` with white checkmark (2px stroke) |
| Question font | `var(--type-body-friendly)` = Satoshi Regular 15px, line-height 26px |
| Question color | `var(--color-text-primary)` |
| Row min-height | 44px (touch target) |
| Row padding | 8px 0 |

---

#### `<SeasonalBarChart>`

Dataviz component for sunlight hours across four seasons.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `{ season: string, hours: number }[]` | — | Four seasonal values. |
| `threshold` | `number \| null` | `null` | Optional reference line (e.g., WHO recommended hours). |

**Visual spec:**

| Property | Value |
|----------|-------|
| Layout | 4 horizontal bars, stacked vertically |
| Bar height | 24px |
| Bar gap | 8px |
| Bar border radius | 4px |
| Bar fill color | Severity color (derived from hours: >5h = green, 3–5h = amber, <3h = coral) |
| Bar background | `var(--color-surface-recessed)` |
| Label (left) | Season abbreviation, Satoshi Medium 13px, `var(--color-text-secondary)` |
| Value (right) | Hours, Satoshi SemiBold 14px, `var(--color-text-primary)` |
| Threshold line | Vertical dashed line, `var(--color-risk-moderate)`, 1px |
| Threshold label | Satoshi Regular 11px, `var(--color-text-tertiary)` |
| Animation | Bars grow from left, 400ms staggered (100ms per bar), ease-out |

**Example render:**

```
Dec  ████████░░░░░░░░░░░░░  2.1h
Mar  █████████████░░░░░░░░░  4.8h
Jun  ██████████████████████  8.4h
Sep  ███████████████░░░░░░░  5.2h
                       ┆
                    WHO min
```

---

#### `<ComparisonBarChart>`

Horizontal bar chart comparing the address against benchmarks.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rows` | `{ label: string, value: number, type: 'address' \| 'city' \| 'national' \| 'threshold' }[]` | — | Up to 4 comparison rows. |

**Visual spec:**

| Property | Value |
|----------|-------|
| Row height | 32px |
| Row gap | 6px |
| Bar height | 12px |
| Bar border radius | 6px |
| Address bar color | `var(--color-chart-address)` = #00897B |
| City bar color | `var(--color-chart-city)` = #9AA0A6 |
| National bar color | `var(--color-chart-national)` = #D1D5DB |
| Threshold bar color | `var(--color-chart-threshold)` = #E8913A, dashed border (no fill) |
| Label font | Satoshi Regular 13px, `var(--color-text-secondary)` |
| Value font | Satoshi SemiBold 14px, `var(--color-text-primary)` |
| Background | `var(--color-surface-recessed)` (full chart area) |
| Padding | 16px |
| Border radius | 12px |

---

### 2.3 Tier 3 — Utility components

These handle edge cases, overlays, and communication patterns.

---

#### `<BottomSheet>`

Sliding overlay panel from bottom.

| Property | Value |
|----------|-------|
| Top border radius | 24px (`var(--radius-pill)`) |
| Drag handle | 36px wide × 4px tall, `var(--color-border)`, centered, 12px from top |
| Background | `var(--color-surface)` |
| Shadow | `var(--shadow-level2)` |
| Backdrop | `rgba(28, 45, 63, 0.4)` |
| Entry animation | Slide up, 350ms, spring (stiffness 400, damping 30) |
| Dismiss | Swipe down past 40% threshold, or tap backdrop |

---

#### `<Toast>`

Non-blocking notification above tab bar.

| Property | Value |
|----------|-------|
| Background | `var(--color-primary)` (#1C2D3F) |
| Border radius | 12px |
| Text | Satoshi Medium 14px, white |
| Action button | Satoshi SemiBold 14px, brighter teal (#57D4C8) |
| Position | 8px above tab bar, 20px inline margin |
| Auto-dismiss | 4s (6s if has action button) |
| Entry | Slide up, 250ms, spring |
| Dismiss | Swipe down |
| Max visible | 1 (new replaces current) |

---

#### `<EmptyState>`

Centered placeholder for screens/sections with no content.

| Property | Value |
|----------|-------|
| Icon | 48px, `var(--color-text-tertiary)` |
| Title | Satoshi SemiBold 18px, `var(--color-text-secondary)`, centered, 16px below icon |
| Subtitle | Satoshi Regular 14px, `var(--color-text-tertiary)`, centered, 8px below title, max-width 260px |
| Action button | Optional, `<Button variant="secondary">`, 16px below subtitle |

---

#### `<ErrorState>`

Error display with retry action.

| Property | Value |
|----------|-------|
| Icon | Triangle warning, 48px, `var(--color-risk-moderate)` (amber — errors aren't the user's fault) |
| Title | Satoshi SemiBold 18px, `var(--color-text-primary)`, centered |
| Subtitle | Satoshi Regular 14px, `var(--color-text-secondary)`, centered, max-width 280px |
| Retry button | `<Button variant="primary">`, "Try again" / "Opnieuw proberen" |

**Error message rules (enforced by component):**
- No technical terms (no "API", "authorization", "timeout", "500")
- No error codes
- Max 2 sentences
- Always suggests an action or sets expectation

---

#### `<LanguageToggle>`

The EN/NL segmented control. Defined as a sub-component of `<TopBar>` but documented separately for clarity.

| Property | Value |
|----------|-------|
| Height | 32px |
| Border radius | 16px (pill) |
| Background (container) | `rgba(255, 255, 255, 0.1)` on dark nav |
| Active segment bg | `var(--color-accent)` |
| Active text | White, Satoshi SemiBold 12px |
| Inactive text | `rgba(255, 255, 255, 0.6)`, Satoshi Medium 12px |
| Segment padding | 0 12px |
| Transition | Active indicator slides, 200ms, ease-out |
| Touch target | Each segment: min 44px wide × 32px tall |

---

### 2.4 Component dependency graph

```
Tier 1 (no dependencies)
├── <Card>
├── <SeverityBadge>
├── <ScoreDisplay>
├── <ScoreBar>
├── <ActionBar>
├── <TopBar>
│   └── <LanguageToggle> (internal)
├── <TabBar>
└── <Button>

Tier 2 (depends on Tier 1)
├── <RiskTile> ──────── Card + SeverityBadge + ScoreDisplay + ScoreBar
├── <SummaryPill> ───── SeverityBadge (icon + color derivation)
├── <DataRow> ────────── (standalone, uses tokens only)
├── <ViewingQuestion> ── (standalone, uses tokens only)
├── <SeasonalBarChart> ─ (standalone, uses tokens only)
└── <ComparisonBarChart> (standalone, uses tokens only)

Tier 3 (depends on Tier 1)
├── <BottomSheet>
├── <Toast>
├── <EmptyState> ─────── Button
└── <ErrorState> ─────── Button
```

---

## Part 3: Implementation sequence

### Sprint 1: Foundation (fixes the most visible problems)

| Task | Components | Issues resolved |
|------|-----------|-----------------|
| Build `<Card>` with margin enforcement | `<Card>` | L-4 (margin bleed) |
| Build `<TopBar>` with 32px toggle | `<TopBar>`, `<LanguageToggle>` | L-1 (toggle size) |
| Build `<ActionBar>` with scroll-trigger | `<ActionBar>` | L-3 (action bar always visible) |
| Build `<Button>` with enforced teal primary | `<Button>` | S-1 (coral export button) |
| Build `<TabBar>` with 3 tabs | `<TabBar>` | L-5 (2 tabs) |
| Convert address display to headline style | — | L-2 (address bar collision) |
| Apply 48px section spacing | — | L-6 (section spacing) |

**Outcome after Sprint 1:** The app's visual framework is correct — proper margins, proper header, proper navigation, proper button colors, proper action bar behavior.

### Sprint 2: Risk system (fixes the core UX)

| Task | Components | Issues resolved |
|------|-----------|-----------------|
| Build `<SeverityBadge>` | `<SeverityBadge>` | C-3 (LOW RISK vocabulary) |
| Build `<ScoreDisplay>` + `<ScoreBar>` | `<ScoreDisplay>`, `<ScoreBar>` | C-4 (missing scores), S-2 (bar thickness) |
| Build `<RiskTile>` with short labels | `<RiskTile>` | C-1 (verbose labels), C-2 (raw data summaries) |
| Build `<SummaryPill>` | `<SummaryPill>` | — (already working, formalize) |
| Build `<ViewingQuestion>` | `<ViewingQuestion>` | — (viewing checklist with checkboxes) |

**Outcome after Sprint 2:** Risk communication is consistent, scannable, and uses the correct four-level severity system everywhere.

### Sprint 3: Data presentation and 3D

| Task | Components | Issues resolved |
|------|-----------|-----------------|
| Build `<DataRow>` with unavailable state | `<DataRow>` | C-7 (data not available) |
| Build `<SeasonalBarChart>` | `<SeasonalBarChart>` | C-5 (incomplete seasons), C-6 (text vs dataviz) |
| Build `<ComparisonBarChart>` | `<ComparisonBarChart>` | — (detail view enhancement) |
| Build `<ErrorState>` | `<ErrorState>` | C-8 (API error message) |
| Brighten 3D viewer lighting | — | V-1 (dark 3D) |
| Add target building teal highlight | — | V-2 (no target highlight) |
| Add season buttons + time slider | — | V-3 (no timeline controls) |
| Remove camera presets from docs | — | V-4 (design decision) |

**Outcome after Sprint 3:** Full data presentation layer and 3D viewer are production-quality.

---

## Appendix A: Design decisions log

| ID | Decision | Date | Rationale |
|----|----------|------|-----------|
| D-1 | Camera presets removed from 3D viewer | 2026-02-16 | Simplifies controls. Users orbit manually. Requires PRD §5.2, design-spec §4, ui-principles §7 updates. |
| D-2 | Dark mode toggle moved from TopBar to Settings | 2026-02-16 | Reduces top bar clutter. Dark mode follows system preference by default; manual override is a settings-level action, not a per-session toggle. |
| D-3 | Unavailable data rows hidden by default | 2026-02-16 | Showing "Data not available" provides negative value. Display what you have, not what you don't. Footer note acknowledges gaps. |
| D-4 | Component library enforces spec constraints | 2026-02-16 | Wrong usage should be difficult. No color props on primary buttons. No margin overrides on cards. Components own the rules. |
