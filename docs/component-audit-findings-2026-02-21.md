# Frontend Component Audit Findings (2026-02-21, Updated 2026-02-22)

## Scope
Audit of implemented React components in `frontend/src` against the reconciled component contracts in `docs/design-spec.md` (canonical visual implementation source per `docs/design-prd.md:6`), supplemented by a senior design assessment identifying UX gaps not covered by spec-vs-implementation drift.

## Summary
- Findings count: 15 (6 spec drift + 3 UX gaps + 6 behavioral/architectural gaps added 2026-02-22)
- Status: Major structural/component drift remains despite cross-doc reconciliation. Adversarial review (Claude + Codex) identified 6 additional behavioral and architectural gaps not covered by the original visual-contract audit.
- Note: Navigation architecture mismatch (top/tab bar direction) is no longer flagged after reconciliation.

## Priority Table

| # | Finding | Impact | Effort | Category |
|---|---------|--------|--------|----------|
| 10 | **Shortlist card reopen is a no-op** | **Critical** | Low | Behavioral bug |
| 4 | Action bar fixed bottom + 48px buttons | High | Low | Spec drift |
| 7 | Summary pill jump-link navigation | High | Low | UX gap |
| 3 | 3D viewer height 40vh + no-sky framing | High | Low | Spec drift |
| 2 | Dossier reorder: house first, buurt second | High | Low | Spec drift |
| 11 | **URL routing for shareable dossiers** | High | Medium | Architectural gap |
| 6 | Compare screen horizontal snap columns | Medium-High | Medium | Spec drift |
| 12 | **Network failure retry UX** | Medium-High | Medium | Behavioral gap |
| 9 | Dossier scroll navigation (sticky header) | Medium | Medium | UX gap |
| 13 | **Accessibility beyond color (landmarks, focus, 3D alt)** | Medium | Medium | Behavioral gap |
| 14 | **Dossier-level data freshness summary** | Medium | Low | Behavioral gap |
| 8 | House/buurt phase visual divider | Medium | Low | UX gap |
| 1 | Loading screen with building animation | Medium | Medium | Spec drift |
| 15 | **Progressive loading sequence** | Medium | Low | Behavioral gap |
| 5 | Shortlist card thumbnails | Low-Medium | Medium | Spec drift |

## Findings

### 1. Dedicated loading-screen component flow is still missing.
- Spec requires a standalone loading screen with building assembly + staged progress (`docs/design-spec.md:322`, `docs/design-spec.md:381`).
- Implementation uses in-dossier skeleton rendering and no standalone loading screen route/component (`frontend/src/App.tsx:1020`).
- **Why spec wins:** A dedicated loading screen is a moment of anticipation — the user just pasted an address and needs psychological confirmation that something meaningful is happening. The building assembly animation (Dutch canal house drawn stroke-by-stroke) is the kind of micro-delight that separates "tool" from "experience." The skeleton approach is functional but emotionally flat. For a product whose core promise is "know the truth before buying," this 2-second pitch builds trust by saying "we're assembling your briefing" rather than "please wait."

### 2. Dossier section sequence differs from the canonical dossier layout.
- Spec layout orders address header + summary strip before the 3D viewer and risk section (`docs/design-spec.md:454`, `docs/design-spec.md:467`, `docs/design-spec.md:477`, `docs/design-spec.md:484`).
- Implementation uses a different v7 order and places 3D after multiple additional sections (`frontend/src/App.tsx:999`, `frontend/src/App.tsx:1164`).
- **Resolution (2026-02-22):** Neither spec nor implementation order is correct. New principle: **"house first, buurt second"** — present all property-specific details before transitioning to neighborhood context. The 3D viewer should move forward from its current position but NOT immediately after the summary strip (spec's position), because that would place two maps (2D footprint + 3D viewer) on screen simultaneously. The 3D viewer is the bridge into the neighborhood section, positioned after all house-level cards. New canonical order:
  - **House (this property):** AttentionSummary, AddressHeader (+2D map), SummaryStrip, BuildingFacts, RiskTiles, PropertyWarnings, SoilInfo
  - **Buurt (neighborhood):** Livability, 3D Viewer, Sunlight, NeighborhoodStats, TierB
  - **Action:** ViewingChecklist, ActionBar

### 3. 3D viewer sizing contract is not met.
- Spec viewer height: `50vh`, min `280px`, max `420px` (`docs/design-spec.md:635`).
- Implementation canvas height: `20vh`, min `140px`, max `170px` (`frontend/src/components/NeighborhoodViewer3D.css:21`).
- **Why spec wins:** 170px max-height turns the 3D viewer into a postage stamp. On a 5.8" phone (375x812), that's roughly 21% of the viewport — not enough to appreciate spatial relationships between buildings. Shadows, neighborhood fabric, and density are invisible at that scale. It defeats the purpose of having 3D at all. Recommended compromise: `40vh`, min `240px`, max `360px` — the full 50vh pushes the summary strip off-screen on small phones, but 40vh gives the viewer room to breathe while keeping the next section peek-visible as a scroll affordance.
- **Constraint (2026-02-22):** The viewer must show only buildings and ground plane — no blue sky. Camera framing should be tight/isometric, filling the viewport with built geometry rather than empty atmosphere. The ground plane and building volumes are the content; sky is wasted space on a small screen.

### 4. Action bar behavior does not match fixed-bottom contract.
- Spec defines a fixed bottom dossier action bar with 48px button heights (`docs/design-spec.md:1797`, `docs/design-spec.md:1808`, `docs/design-spec.md:1814`).
- Implementation action bar is non-sticky (`position: relative`) with 38px buttons (`frontend/src/components/ActionBar.css:2`, `frontend/src/components/ActionBar.css:15`).
- **Why spec wins:** The action bar contains the two most important CTAs: "Add to Shortlist" and "Export Briefing." With `position: relative`, users must scroll past all 14 dossier sections to find them — a conversion killer. A fixed bottom bar keeps primary actions visible at all times; every major property app (Zillow, Funda, Idealista) does this. The 38px buttons also fail Apple's 44px minimum touch target. The upward shadow (`0 -4px 12px`) anchors it visually. Z-index layering (action bar above content, below tab bar) must be respected.

### 5. Shortlist populated cards miss required thumbnail pattern.
- Spec populated cards include thumbnail content (`docs/design-spec.md:1437`).
- Implementation cards have text + risk dots + remove button only (no thumbnail) (`frontend/src/components/ShortlistScreen.tsx:44`, `frontend/src/components/ShortlistScreen.tsx:66`).
- **Why spec wins:** Current shortlist cards are text-only — visually monotonous and hard to scan. A 56px thumbnail (even a simple map snapshot) gives each card a unique visual anchor. Image+text lists are scanned 2-3x faster than text-only. This matters because users are comparing 2-3 addresses and need to quickly identify which card is which. Note: swipe-to-delete from spec is skipped — the X button works fine for a max-3-item list, and the gesture engineering cost isn't justified.

### 6. Compare screen does not implement horizontal snap-column structure.
- Spec requires horizontally scrollable columns with snap (`docs/design-spec.md:1502`, `docs/design-spec.md:1509`).
- Implementation renders a sticky grid header and grid rows, without horizontal snap-column behavior (`frontend/src/components/CompareScreen.tsx:80`, `frontend/src/components/CompareScreen.css:46`).
- **Why spec wins:** With 3 addresses, each grid column gets ~33% of a 375px phone — roughly 110px per address. That's not enough for risk scores, severity badges, and metric labels without extreme truncation. The snap-column approach gives each address ~170px (50vw minus gap) and lets users swipe between columns. This is the same pattern used by Apple's product comparison, Google Flights, and Funda's compare view. The current grid works for 2 properties but breaks down at 3; snap handles both cleanly.

### 7. Summary strip pills do not function as jump-link navigation. *(UX gap)*
- `SummaryStrip` has an `onPillTap` prop wired to `handleRiskTileTap` in `App.tsx`, but pills do not scroll the dossier to the corresponding risk card or provide a highlight pulse.
- **Why this matters:** On a 14-section dossier with the new "house first, buurt second" ordering, risk tiles are 5-7 sections deep. The summary strip is shaped like navigation — colored severity dots with scores — but doesn't navigate. Tapping "72 Noise" should scroll to the noise tile with a brief `--color-accent-light` highlight pulse (300ms). Without this, users face a "scroll and hope" experience. Every good long-form app (Apple Health, Notion, banking apps) has in-content jump navigation. This is the single highest-ROI missing feature: low effort (scroll-to-element + CSS highlight animation), high perception of polish.

### 8. No visual divider between house and buurt phases. *(UX gap)*
- The new "house first, buurt second" ordering creates a clear conceptual division, but every section flows into the next with identical spacing (48px) and `--type-label` caps. The user cannot perceive when they've crossed from "this property" to "this neighborhood."
- **Why this matters:** The house/buurt principle only works if the user can feel the transition. Without a signal, the carefully planned ordering loses its narrative power. Needed: a visual phase divider — a larger gap (64px instead of 48px), a distinct section label treatment (e.g., different weight or accent underline), or a subtle background tint shift. This is how Hemnet, Apple Health, and banking apps signal chapter transitions in long scrolling content.

### 9. No dossier scroll navigation affordance for long content. *(UX gap)*
- With 14 sections (~6-8 full viewport heights on a phone), there is no way for a user deep in the neighborhood section to quickly return to the summary or jump between phases. The fixed action bar (finding 4) helps with CTAs but not with content navigation.
- **Why this matters:** Property apps like Funda and Idealista solve this with either a sticky mini-header showing the address + back-to-top, or a floating scroll-to-top button after 2+ screens. Given the dossier's narrative structure, a collapsing sticky address header — always showing which property the user is reading about, tappable to return to top — would be most effective. Becomes more important as content depth grows.

## Findings Added by Adversarial Review (2026-02-22)

Identified by parallel Claude + Codex review. These are behavioral and architectural gaps not covered by the original visual-contract audit.

### 10. Shortlist card reopen is a no-op. *(Behavioral bug)*
- `ShortlistScreen` fires `onSelectAddress(vboId)` when a saved card is tapped (`frontend/src/components/ShortlistScreen.tsx:44`), but `App.tsx` wires it to an empty function: `onSelectAddress={() => {}}` (`frontend/src/App.tsx:1281`).
- **Why this is Critical:** A user saves an address, navigates to the Saved tab, taps a card — and nothing happens. This breaks the core save-and-return loop. Every property app (Funda, Zillow, Idealista) lets users tap a saved property to reopen its dossier. The shortlist feature appears broken from the user's perspective, eroding trust in the entire save/compare flow. This is a functional bug, not a design gap — it should have been caught before any visual polish work.
- **Fix:** Wire `onSelectAddress` to trigger address lookup + dossier load for the given `vboId`, reusing the existing `handleSelectAddress` flow.

### 11. No URL routing for shareable dossiers. *(Architectural gap)*
- App navigation is entirely local state: `type Screen = 'search' | 'dossier' | ...` with `useState<Screen>` (`frontend/src/App.tsx:77`, `frontend/src/App.tsx:315`). No hash or path-based routing exists.
- **Why this matters:** Users cannot share a specific dossier via URL, use browser back/forward navigation, bookmark a property, or return to a dossier after page refresh. For a product where users compare properties over days/weeks — often with partners, mortgage advisors, or aankoopmakelaar — the inability to share a link is a fundamental gap. Even a minimal `#/dossier/{vbo_id}` hash route would transform usability. Without it, every dossier is ephemeral.
- **Fix:** Add hash-based routing (e.g., `#/address/{vbo_id}`) that seeds the dossier on page load. Update `setActiveScreen` calls to also update `window.location.hash`. Handle `popstate` events for back/forward.

### 12. No network failure retry UX. *(Behavioral gap)*
- The app calls 10+ Dutch government APIs with 15-20s timeouts. When APIs fail (BRO returns 404, 3DBAG takes 60-77s cold, Klimaateffectatlas has regional gaps), there is no per-card retry mechanism, no "some data couldn't be loaded" banner, and no clear distinction between "loading" and "failed" in the UI.
- **Why this matters:** Current behavior shows a mix of loading spinners and missing sections with no recovery path. Users must re-enter the entire address to retry. Given that Dutch government APIs are unreliable (documented BRO 404s, 3DBAG cold latency, regional coverage gaps), graceful failure UX is not optional. A "tap to retry" affordance per card, plus a dossier-level "X of Y data sources loaded" indicator, would prevent users from thinking the app is broken when a single upstream API is slow.
- **Fix:** Add per-section retry buttons on error state. Add a dossier-level data coverage indicator showing how many sources loaded successfully.

### 13. Accessibility beyond color contrast. *(Behavioral gap)*
- The original audit covers WCAG color contrast but does not assess screen reader flow, keyboard navigation, or assistive technology interaction.
- **Why this matters:** The 14-section dossier has no ARIA landmarks or skip navigation. Detail views and bottom sheets don't manage focus on open/close. The 3D viewer is a black box for assistive technology — no keyboard controls, no text alternative describing the spatial context. For an app targeting expats (international audience, diverse ability profiles), and especially given that risk assessment data has real-world consequences, accessibility is structural, not optional.
- **Fix:** Add `role="region"` + `aria-label` landmarks per dossier phase. Trap and restore focus on modal/sheet open/close. Add a static text summary alternative for the 3D viewer content.

### 14. No dossier-level data freshness summary. *(Behavioral gap)*
- Each risk card shows its own source date, but there is no top-level summary of data coverage and recency across the entire dossier.
- **Why this matters:** Users are making six-figure purchase decisions. Trust requires knowing "8 of 10 data sources loaded, most recent: Jan 2026, oldest: Mar 2024" at a glance — not auditing each card individually. A dossier-level freshness indicator near the summary strip or address header would communicate completeness and honesty. This aligns with the existing UI principle "Trust UI: Transparency as a Feature" (`docs/ui-principles.md:69`).
- **Fix:** Add a compact data coverage strip (e.g., "8/10 sources loaded · Most recent: Jan 2026") below the address header. Color-code or flag stale sources (>12 months).

### 15. Progressive loading sequence is uncontrolled. *(Behavioral gap)*
- All 10+ API calls fire simultaneously on address selection. Dossier sections pop in unpredictably as responses arrive, creating a jarring visual experience.
- **Why this matters:** A sequenced reveal — house facts first, then risks, then neighborhood — would feel faster even at the same total load time, because it matches the narrative "house first, buurt second" flow. Currently, a user might see neighborhood stats before building facts, breaking the intended reading order. The skeleton approach handles individual sections but doesn't control the stagger pattern.
- **Fix:** Group API calls into narrative phases: Phase 1 (building facts, property warnings) → Phase 2 (risks, soil) → Phase 3 (livability, 3D, neighborhood). Delay rendering later phases until earlier phases resolve or timeout. This pairs naturally with the loading screen (finding #1) for a coherent perceived-performance strategy.

## Reprioritization Notes (2026-02-22)

Changes from original priority table based on adversarial review:

- **#10 (shortlist reopen) added as Critical** — broken feature, not visual polish. Should be fixed before any other finding.
- **#1 (loading screen) downgraded from High to Medium** — current skeleton flow with `pendingDisplayName` already provides T+0 feedback. The canal house animation is delight, not structure.
- **#5 (shortlist thumbnails) downgraded from Medium to Low-Medium** — with max 3 items, text scanning is adequate. Lower priority than fixing the shortlist reopen flow.
- **#6 (compare snap columns) upgraded from Medium to Medium-High** — compare is late-funnel decision UX; 110px columns at 3 properties are unusable.
- **#8 (phase divider) downgraded from Medium-High to Medium** — narrative polish, not structural. Lower effort than behavioral fixes.
- **#11-15 inserted** based on behavioral/architectural gaps not covered by visual audit.

## Not Flagged After Reconciliation
- Top bar / tab bar architectural direction conflict (transparent/glass vs dark-slate non-flipping) is no longer counted as a finding after docs were reconciled in `docs/design-spec.md` and `docs/design-prd.md`.

## Removed During Design Assessment (2026-02-21)
- **3D viewer control surface** (camera presets, layer popover, opacity slider): Spec is over-designed for consumer users. Current reset button is correct; only street/bird's-eye toggle and fullscreen warranted as future additions.
- **Settings inventory** (reduced-motion, data-sources rows): OS-level reduced-motion already respected. Data sources link is low visual impact.
- **Search-screen hero composition** (centered wordmark/tagline): Current task-first layout (search at top, value props below) better serves a utility app. Spec hero would push the search field too far down.
