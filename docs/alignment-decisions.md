# buurt-check — Design Document Alignment & Architectural Decisions

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

> **Created:** 2026-02-16
> **Purpose:** Resolve every contradiction between the four design documents and establish canonical authority.
> **Outcome:** After applying these decisions, all docs speak with one voice.

---

## Document hierarchy (authority order)

When documents conflict, the higher-authority document governs:

| Priority | Document | Role | Status |
|----------|----------|------|--------|
| 1 | `design-spec.md` | Pixel-level implementation truth | **Canonical for "how"** |
| 2 | `design-prd.md` | Product requirements, "what" and "why" | **Canonical for "what"** |
| 3 | `ui-principles.md` | Design philosophy and heuristics | **Advisory — updated to align with PRD** |
| 4 | `ui-redesign-plan.md` | Point-in-time gap audit | **Convert to action checklist, then archive** |

---

## Part 1: Architectural contradictions (resolved)

### A-1. Navigation model: map-first vs. tab-based dossier

**The conflict:**
- `ui-principles.md` §2 ("Map-First, Data-Second") advocates a persistent map with draggable bottom sheet — "the map should always be visible or one tap away."
- `design-prd.md` §3 specifies a 3-tab bottom nav (Search / Briefing / Saved) with the dossier as a vertically scrolling page containing a 3D viewer card.
- `design-spec.md` implements the tab-based dossier with no persistent map layer.

**Resolution: Tab-based dossier governs.** The bottom-sheet-over-map pattern works for exploration apps (Google Maps, Apple Maps) where the user's primary intent is spatial browsing. buurt-check is a *report delivery* app — the user enters a known address and reads a curated briefing. The dossier scroll is the correct container for this mental model. The 3D viewer card functions as the "spatial anchor" within the dossier, satisfying the principles doc's intent without requiring a persistent map layer.

**Action:**
- `ui-principles.md` §2: Rewrite to describe the 3D viewer card as the spatial anchor within a dossier scroll. Remove bottom-sheet-over-map language. Acknowledge that the dossier-first approach better serves the "briefing, not dashboard" principle from §1.

---

### A-2. 3D viewer: opt-in button vs. always-present hero card

**The conflict:**
- `ui-principles.md` §7 says "3D is opt-in, not default. Launch the neighborhood view in 2D. Offer a prominent 'View in 3D' button."
- `design-prd.md` §4.3.2 and §5 specify the 3D viewer as a permanent hero card in the dossier at 50vh, with a progressive loading sequence and three-tier device fallback.
- `design-spec.md` §4 specifies the viewer container in detail as always-present.

**Resolution: Always-present hero card with automatic capability detection governs.** The opt-in pattern was a valid concern about performance, but the PRD's three-tier fallback strategy (full interactive → simplified → static snapshots) resolves it more elegantly. The 3D viewer is buurt-check's signature differentiator — hiding it behind a button reduces discovery and first-impression impact. The progressive loading sequence (semantic colors at 3s → shadows at 4s → textures at 5s) means the viewer is functional before heavy assets arrive.

**The principles doc's concern was performance, not philosophy.** The PRD addresses this concern directly:
- Device capability detected via WebGL `MAX_TEXTURE_SIZE` and initial FPS measurement
- Sub-20fps triggers automatic simplification
- Static fallback ensures every device sees *something*

**Action:**
- `ui-principles.md` §7: Rewrite to "3D loads progressively, not all-at-once." Describe the tiered fallback as the mechanism that protects performance. Remove "offer a View in 3D button" language. Keep the guidance about simple touch gestures, tight control cluster, and performance guardrails — these remain valid.

---

### A-3. TopBar behavior: scroll-transparent vs. fixed dark slate

**The conflict:**
- `design-prd.md` §3.2 specifies "transparent at scroll position 0; transitions to white with bottom border on scroll."
- `ui-redesign-plan.md` notes the implementation uses a fixed dark slate nav (`--color-nav-bg: #171D1C`) and calls it a "deliberate design decision."
- The redesign plan's "What's Excellent" table lists "Nav non-flipping: Dark slate in both themes" as a positive.

**Resolution: Fixed dark slate nav governs.** Reasons:
1. The dark slate TopBar provides strong brand anchoring — it's the most recognizable persistent element.
2. Non-flipping between light/dark themes simplifies implementation and creates visual consistency.
3. Scroll-dependent transparency introduces edge cases (status bar text legibility, transition jank on fast scrolling).
4. The dark nav creates a clear boundary between system chrome and app content.

**Action:**
- `design-prd.md` §3.2: Update to specify fixed dark slate background (`#171D1C`) in both themes. Remove scroll-transparency behavior. Note that the language toggle pill (EN|NL) uses white/light text on this dark surface.
- `design-spec.md` §17: Verify spec matches implementation (dark slate, not scroll-transparent). If §17 still describes transparency, update it.

---

### A-4. Risk data as map overlays vs. dedicated risk tiles

**The conflict:**
- `ui-principles.md` §2 says "risk data as map overlays, not separate screens. Where possible, let users toggle risk layers directly on the map rather than switching to a separate data view."
- `design-prd.md` §4.3.3 uses a 2×2 risk tile grid with tap-to-detail fullscreen views. The 3D viewer does have layer overlay toggles (§5.2, top-right cluster), but these are supplementary to the tiles, not replacements.

**Resolution: Both patterns coexist — tiles are primary, overlays are supplementary.** The risk tiles provide the narrative structure (score → meaning → viewing questions → source) that overlays can't. Map overlays are valuable as *spatial context* for the data shown in tiles. The PRD already includes layer toggles in the 3D viewer (noise, air quality, climate overlays at 25-75% opacity). This satisfies the principles doc's intent.

**Action:**
- `ui-principles.md` §2: Rewrite to acknowledge the tiles-first approach with overlays as supplementary spatial context in the 3D viewer. Remove "not separate screens" language.

---

### A-5. Input field height: 56px vs. 52px

**The conflict:**
- `design-prd.md` §4.1: "Height: 56px (slightly oversized — this is the app's primary action)"
- `design-prd.md` §2.3 component dimensions table: "Input field Height: 52px"
- `design-spec.md` §1.5: "Height: 56px"
- `ui-redesign-plan.md` item 9: "Spec: 56px... Implementation: height: 56px — Correct"

**Resolution: 56px governs.** The 52px in the PRD's component dimensions table is a typo. The search input is the single most important interactive element in the app and deserves the oversized treatment. The spec, the PRD's screen-by-screen section, and the implementation all agree on 56px.

**Action:**
- `design-prd.md` §2.3 component dimensions table: Change "Input field Height: 52px" to "Input field Height: 56px (address search); 52px (secondary inputs)". This preserves the 52px value for any secondary input fields while making the primary search input canonical at 56px.

---

### A-6. Score display typography: tile vs. detail view

**The conflict:**
- `design-prd.md` §6.2 says tile score is `--type-score-large` at 40px. §6.3 says detail view score is also `--type-score-large` (40px).
- `design-spec.md` and `ui-redesign-plan.md` reference `--type-score-tile` (40px) and `--type-score-large` (48px) as separate tokens.
- The PRD type scale table (§2.2) defines only `--type-score-large` at 40px (2.5rem).

**Resolution: Two distinct tokens.** The tile score and detail score should be different sizes for clear hierarchy. Tiles show 40px scores (compact cards). Detail views show 48px scores (full-screen hero display).

**Action:**
- `design-prd.md` §2.2 type scale: Add `--type-score-tile` row: Black (900), 2.5rem (40px), line-height 1.1 (44px), letter-spacing -0.03em. Rename existing `--type-score-large` to clarify it's 48px for detail views: Black (900), 3rem (48px), line-height 1.1 (53px), letter-spacing -0.03em.
- `design-prd.md` §6.3: Update detail view score reference to `--type-score-large` at 48px.
- Verify both tokens exist in `tokens.css`.

---

### A-7. Comparison chart color system

**The conflict:**
- `design-spec.md` §15 specifies comparison bar chart colors: This address (#00897B teal), City average (#9AA0A6 silver), NL average (#D1D5DB lighter gray), WHO limit (#E8913A amber dashed).
- `design-prd.md` §8.2 specifies parallel coordinates chart colors: Address 1 (#0D9488 accent teal), Address 2 (amber), Address 3 (#C36D4B warm tertiary).
- `ui-redesign-plan.md` item 8 notes the implementation has hardcoded `['#00897B', '#E8913A', '#C36D4B']` — mixing both systems.

**Resolution: Two separate color systems for two separate charts.** These are different visualizations serving different purposes:
1. **Risk detail comparison bars** (single address vs. benchmarks): Use the 4-row system from the spec — teal for address, grays for averages, amber dashed for threshold.
2. **Compare view parallel coordinates** (multi-address): Use the 3-color system from the PRD — teal, amber, purple for addresses 1-3.

**Action:**
- Add semantic tokens to `tokens.css`:
  - `--color-chart-address: #00897B` (comparison bars — teal-700, darker than accent for chart readability)
  - `--color-chart-city: #9AA0A6` (city average)
  - `--color-chart-national: #D1D5DB` (national average)
  - `--color-chart-threshold: #E8913A` (WHO/EU limit, amber, dashed)
  - `--color-compare-1: #00897B` (compare view, address 1)
  - `--color-compare-2: #E8913A` (compare view, address 2)
  - `--color-compare-3: #C36D4B` (compare view, address 3)
- Remove hardcoded values from `ParallelCoordinates` component.
- Document both systems in both the PRD and spec.

---

### A-8. Dossier section ordering: "house first, buurt second" (2026-02-22)

**The conflict:**
- `design-spec.md` §3.1 and `design-prd.md` §3.3/§4.3.2 place the 3D viewer immediately after the summary strip (position 3 in the dossier).
- Implementation (`App.tsx`) uses a different v7 order with the 3D viewer at position 9 of 14.
- Both `design-spec.md` and `design-prd.md` have a 2D footprint map at the top of the dossier. Placing the 3D viewer immediately after creates two maps visible simultaneously on mobile.

**Resolution: "House first, buurt second" — a new ordering principle.** The dossier is organized in two phases:
1. **House (this property):** AttentionSummary → AddressHeader (+2D footprint map) → SummaryStrip → BuildingFacts → RiskTiles → PropertyWarnings → SoilInfo
3. **Action:** ViewingChecklist → ActionBar (fixed bottom)

**Rationale:**
- Matches buyer mental model: "What am I buying?" before "What is this neighborhood like?"
- The 2D footprint map (house-level, at the top) and 3D viewer (buurt-level, after ~7 house sections) are never on screen simultaneously — no map saturation.
- Risk tiles (noise, air, climate, sunlight) stay in the house section despite being area-derived data, because they answer "what is it like at THIS address."
- The 3D viewer transitions the user from property details into spatial neighborhood context.

**Action:**
- `design-spec.md` §3.1: Updated dossier layout diagram and added ordering principle note.
- `design-prd.md` §3.3: Updated IA tree. §4.3.2: Repositioned 3D viewer to neighborhood section.
- `ui-principles.md` §2: Rewritten to describe "house first, buurt second" principle.
- `component-audit-findings-2026-02-21.md`: Finding 2 updated with resolution.

---

### A-9. 3D viewer sizing and camera framing (2026-02-22)

**The conflict:**
- `design-spec.md` §4.1 and `design-prd.md` §4.3.2 specify 50vh, min 280px, max 420px.
- Implementation uses 20vh, min 140px, max 170px (too small to appreciate spatial relationships).

**Resolution: 40vh compromise with no-sky constraint.**
- Height: `40vh`, min `240px`, max `360px`. The full 50vh pushes adjacent content off-screen on small phones; 40vh gives room to breathe while keeping the next section peek-visible as scroll affordance.
- Camera framing: tight/isometric — buildings and ground plane only, **no blue sky visible**. The viewer should feel like a technical aerial diagram. Sky is wasted space on a 360px-tall mobile viewport. Background color matches ground plane.

**Action:**
- `design-spec.md` §4.1: Updated height values and added camera framing row.
- `design-prd.md` §4.3.2: Updated height values and added no-sky constraint.
- `ui-principles.md` §7: Added no-sky framing rule.

---

## Part 2: Token & implementation mismatches (from redesign plan)

### Critical fixes (do first)

| # | Issue | Resolution | Effort |
|---|-------|-----------|--------|
| T-1 | `--radius-card` is 12px, spec says 16px | **Change token to 16px.** 16px aligns with editorial spaciousness. Verify no component breaks at the larger radius. | 15 min |
| T-2 | Card padding uses `--space-lg` (16px) or `--space-xl` (20px), spec says 24px (`--space-2xl`) | **Audit case-by-case.** Risk tiles use 20px padding (PRD §6.2 confirms "Padding: 20px"). Standard content cards use 24px. Create a clear rule: risk tiles = 20px, all other cards = 24px. Update spec to document this intentional split. | 1 hr |
| T-3 | Satoshi font loads as single-weight WOFF, not variable WOFF2 | **Replace with Satoshi Variable WOFF2.** This is the highest-impact visual fix — faux-bold at 40px/48px score displays is visibly wrong. Source the variable font file, update `satoshi.css`, verify all 5 weights render from the single file. | 30 min |
| T-4 | ScoreBar uses 4px track / 12px dot, spec says 2px track / 8px dot | **Match spec: 2px track, 8px dot.** The thinner track is more refined and aligns with the editorial aesthetic. | 15 min |

### High-priority fixes (do this sprint)

| # | Issue | Resolution | Effort |
|---|-------|-----------|--------|
| T-5 | `RiskCardsPanel.css` has 20+ hardcoded values | **Systematic token replacement.** Map every hardcoded value to the nearest design token. If no token exists, add it. Risk cards are the core product — they must be fully token-compliant. | 2 hr |
| T-6 | `NeighborhoodViewer3D.css` has 9 hardcoded values | **Token replacement where feasible.** Some 3D viewer positioning values may be legitimately unique. Tokenize spacing/font values; document any intentional exceptions with code comments. | 1 hr |
| T-7 | `BuildingFootprintMap.css` references `--font-size-sm` (doesn't exist) | **Replace with `--type-caption` (13px).** Likely a typo from an earlier token naming scheme. | 5 min |
| T-8 | Missing tokens: `--radius-lg`, `--space-3xs`, `--type-h4`, comparison colors | **Add all four.** `--radius-lg: 16px` (same as updated `--radius-card`). `--space-3xs: 2px`. `--type-h4`: define as Satoshi SemiBold 14px/20px if needed, or remap the component to `--type-body` Medium. Comparison colors per decision A-7. | 30 min |

### Medium-priority fixes (schedule for next sprint)

| # | Issue | Resolution | Effort |
|---|-------|-----------|--------|
| T-9 | Address input focus ring uses `#0D9488` (accent), spec mentions `#00897B` (teal-700) | **Keep `#0D9488` (accent).** The spec's `#00897B` reference appears inconsistent with the broader design system where `--color-accent` is the interactive state color. The focus ring should use the accent color. Update spec to match. | 5 min (spec edit) |
| T-10 | Tab bar glass background — verify `--glass-bg`/`--glass-blur` map to spec values | **Verify and document.** Spec: white + `backdrop-filter: blur(20px)` + 80% opacity. Check that `--glass-bg` = `rgba(255,255,255,0.8)` and `--glass-blur` = `blur(20px)`. | 15 min |
| T-11 | 3D viewer height — update to 40vh, min 240px, max 360px (per A-9) | **Update `NeighborhoodViewer3D.css`.** Also enforce no-sky camera framing (tight/isometric, ground-only background). | 30 min |
| T-12 | Language toggle border radius: 4px in implementation, system minimum is 6px (`--radius-sm`) | **Change to 6px.** No component should go below the system minimum radius. | 5 min |
| T-13 | Number formatting (NL comma decimal, EN period decimal) | **Add runtime test.** Create test cases for both locales with sample values. This is invisible until a Dutch user sees "€485.000" formatted wrong. | 1 hr |

### Deferred (no launch impact)

| # | Issue | Notes |
|---|-------|-------|
| T-14 | Parallel coordinates chart in compare view | Nice-to-have per PRD §17 success criteria |
| T-15 | Haptic feedback on shortlist add and PDF export | Listed as working in redesign plan |
| T-16 | Full usability at 200% text scaling | Accessibility nice-to-have |
| T-17 | 3D viewer in landscape orientation | Nice-to-have per PRD §17 |

---

## Part 3: Document-specific edits

### Edits to `design-prd.md`

| Section | Edit |
|---------|------|
| §2.3 component dimensions | Change "Input field Height: 52px" → "Input field Height: 56px (search) / 52px (secondary)" |
| §2.2 type scale | Add `--type-score-tile` (40px Black) row. Clarify `--type-score-large` is 48px for detail views. |
| §3.2 global top bar | Replace scroll-transparency description with fixed dark slate background spec |
| §6.3 detail view | Update score token reference to `--type-score-large` at 48px |
| §8.2 compare view | Add chart color token references per decision A-7 |
| New: append note | "Where this document conflicts with design-spec.md on visual details, design-spec.md governs." |

### Edits to `design-spec.md`

| Section | Edit |
|---------|------|
| §15 comparison chart | Add semantic token names per decision A-7 |
| §17 global top bar | Verify dark slate spec, remove any scroll-transparency language |
| §1.5 input focus ring | Change `#00897B` references to `--color-accent` (`#0D9488`) |

### Edits to `ui-principles.md`

Full rewrite provided in the companion file `ui-principles-v2.md`. Summary of changes:
- §2 rewritten from "Map-First" to "Spatial Anchor Within the Dossier"
- §7 rewritten from "3D is opt-in" to "3D loads progressively"
- §2 and §4 risk overlay language reconciled with tile-first approach
- Added explicit note that PRD governs where principles and PRD diverge

### Action on `ui-redesign-plan.md`

This document is a point-in-time audit. Its contents are now captured in Part 2 of this alignment document as a prioritized action plan. The original file should be archived (e.g., `docs/archive/ui-redesign-plan-2026-02-16.md`) and not maintained going forward. Future audits produce new snapshots; they don't update this file.

---

## Part 4: Remaining open questions (need your input)

### Q-1. Card padding — strict 24px or flexible?

The spec says 24px everywhere. The risk tiles use 20px. The implementation uses 16-20px in various places. Two options:

- **Option A: Enforce 24px for all cards** — more spacious, more editorial, but risk tiles may feel too loose for the 2×2 grid at 160px min-height.
- **Option B: 20px for compact cards (risk tiles, compare columns), 24px for content cards (risk detail, neighborhood snapshot, viewing checklist)** — pragmatic split, but adds a rule to remember.

**Recommendation: Option B.** The risk tiles benefit from slightly tighter padding because they're in a grid. Content cards where users read paragraphs benefit from the breathing room. Document the rule explicitly.

### Q-2. Skeleton screens vs. building animation

The `ui-principles.md` §9 advocates skeleton screens ("grey blocks where text and charts will appear"). The `design-prd.md` §4.2 specifies a custom building assembly animation with progressive text updates. These serve different moments:

- The building animation is the *initial load* experience (address submitted → dossier ready).
- Skeleton screens are for *in-dossier lazy loading* (3D assets, comparison chart data).

**Recommendation: Both.** The building animation is the branded loading experience. Skeleton screens appear within the dossier for components still fetching data. This is already implied by the PRD but worth stating explicitly.

### Q-3. Dark mode OLED black (#000000) vs. PRD dark bg (#171D1C)

The redesign plan's "What's Excellent" table mentions "Dark mode (OLED #000000) implemented." The PRD's Appendix A token reference uses `#171D1C` for dark mode background. These are different approaches:

- **OLED black (#000000):** Saves battery on OLED screens, stronger contrast, but can feel like content is floating in a void.
- **Near-black (#171D1C):** Slightly softer, allows shadow/elevation to remain visible, feels more cohesive.

**Recommendation: Clarify in both docs.** If the implementation uses `#000000`, update the PRD to match. If it uses `#171D1C`, verify the redesign plan's note is wrong. Either is valid, but they must agree.
