# Mobile UI Design Principles for buurt-check

> Alignment note (2026-04-12): For any guidance affecting `https://buurt-check.nl/`, its associated legal pages, or `https://app.buurt-check.nl/#/search` and adjacent app UI states, `docs/plans/2026-04-12-website-and-app-design-10-10-spec.md` is the governing document. If this file conflicts with that spec on layout, hierarchy, spacing, visual system, bilingual asset handling, desktop adaptation, loading-state clarity, export recovery UX, or legal-page consistency, the 2026-04-12 spec controls.

> **Version:** 2.1 | **Last updated:** 2026-02-24
> **Authority note:** This document describes design philosophy and heuristics. Where it conflicts with `design-prd.md` or `design-spec.md`, those documents govern.

A curated set of design principles for a Dutch neighborhood intelligence app with 3D visualization, risk assessments, and interactive maps — targeting expats and first-time home buyers.

### Design context

**Users:** Expats and first-time homebuyers navigating high-stakes property decisions in an unfamiliar Dutch market. Time-pressured, anxious about hidden risks, often lacking local knowledge.

**Brand personality:** Confident, clear, empowering — like a knowledgeable friend who makes you feel in control of a big decision.

**Emotional target:** Calm confidence — *"Someone serious did the work for me. I can trust this and act on it."*

**References:** Apple Health (categorized risk data, progressive disclosure, severity levels), Hemnet (clean editorial property data, white space + single accent).

**Anti-references:** Funda/Zillow (too commercial), GIS portals (too complex), flashy startup apps (too casual for six-figure decisions).

---

## 1. Briefing, Not Dashboard

buurt-check is not a data tool. It's a prepared, trustworthy intelligence briefing for anxious buyers who are time-boxed. The UI should feel calm, spacious, and curated — like an analyst handed you a dossier, not like you opened a GIS console.

- **White space is the main design material.** Resist the urge to fill every pixel with data. Dense layouts signal "power user tool"; generous spacing signals "someone curated this for you."
- **Hard cap: 5–8 indicators per section.** CBS, RIVM, Kadaster, and other Dutch open data sources can easily explode a screen with dozens of metrics. The design's job is to select, not to display. If you can't justify why a metric changes a buying decision, cut it.
- **One dominant action per screen.** Each screen gets a single primary CTA (e.g., "Add to shortlist," "Unlock dossier"). Everything else is secondary or tertiary. If two buttons are fighting for attention, the screen has a hierarchy problem.
- **No dashboard sprawl.** Avoid side-by-side chart grids, multi-tab analytics panels, or anything that makes the user feel like they're operating software. The user's mental model is "I'm reading a report," not "I'm running queries."

---

## 2. House First, Buurt Second — the Dossier Narrative Flow

buurt-check delivers a curated report, not a spatial browsing experience. The dossier scroll is the primary container, organized by the **"house first, buurt second"** principle: all property-specific details appear before neighborhood context.

- **The dossier follows a two-phase narrative.** Phase one is the house: address, building facts, risk scores at this address, property warnings, soil. Phase two is the buurt: livability, 3D neighborhood viewer, sunlight analysis, CBS stats, tier B signals. This matches how buyers think — "What am I buying?" before "Where am I buying?" — and ensures the 2D footprint map (house-level) and 3D viewer (buurt-level) are never on screen simultaneously.
- **The 3D viewer is the spatial anchor of the neighborhood section, not hidden behind a button.** It's buurt-check's signature differentiator — hiding it reduces discovery and first-impression impact. But it belongs in the neighborhood section, not at the very top of the dossier. Performance concerns are addressed through progressive loading and device-tier fallback (see §7), not by gating access.
- **The 3D viewer card has a clear boundary.** It's a defined viewport (40vh, min 240px, max 360px) within the dossier scroll, not a full-page background. Camera framing is tight/isometric — buildings and ground plane only, no blue sky. The viewer should feel like a technical aerial diagram, not a landscape.
- **Risk tiles live in the house section.** Even though noise, air, and climate data come from area-level sources, they are measured at this specific address and directly affect this property's livability. They answer "what is it like HERE?" not "what is this neighborhood like?"
- **Minimize 3D viewer chrome.** A reset button is sufficient for most users. Camera preset buttons and fullscreen toggle are future additions. The 3D canvas is the most valuable real estate inside the card.

---

## 3. Consequences Over Data

Users don't want "PM2.5 = 11.2." They want "what does this mean for me, and what do I do at the viewing?" Every piece of data in buurt-check must be translated into a decision or an action.

- **Every risk card follows a strict 4-part hierarchy:**
  1. **Score + severity** — a number and a color-coded label (Good / Moderate / Poor / Critical)
  2. **What it means** — one plain-language sentence ("This area floods roughly once every 8 years during heavy rainfall")
  3. **What to ask or check at the viewing** — the actionable output ("Ask the seller about flood damage history. Check the ground floor for watermarks or damp patches.")
  4. **Source + date** — credibility anchor ("Data: Klimaateffectatlas, updated March 2025")
- **Raw metrics live behind "Details."** If a user wants the actual PM2.5 number, the dB(A) reading, or the CBS crime count, they can tap into it. But the default view is always the interpreted, decision-ready version.
- **The "what to ask at the viewing" layer is the differentiator.** No competitor turns risk data into viewing preparation. This is buurt-check's highest-value UX feature — protect it, refine it, and never let it get buried.

---

## 4. Visual Hierarchy for Risk Communication

Risk data is buurt-check's core value proposition. How you visualize severity is arguably the most important design decision in the entire app.

- **Use the Polar Frost severity scale consistently.** Green (Good, ✓ circle) → Amber (Moderate, — dash) → Coral (Poor, ▲ triangle) → Crimson (Critical, ✕ cross). Users should intuitively understand severity at a glance.
- **Never rely on color alone.** Use four channels simultaneously: color, icon shape, text label, and numeric score. This serves colorblind users (~8% of men), outdoor use where color washes out, and screen readers. For a risk assessment app, misreading severity has real-world consequences.
- **Lead with the summary strip, then break down.** The horizontal scroll of risk score pills at the top of the dossier gives an instant overview. The 2×2 tile grid below provides the scannable breakdown. Detailed analysis lives one tap deeper in fullscreen detail views.
- **Iconography per risk category.** Noise (sound waves), air quality (leaf/wind), climate (water + heat), sunlight (sun with rays) — each needs a distinct, recognizable icon at both 32px (tiles) and 20px (inline). Icons transcend language barriers for the expat audience.

---

## 5. Progressive Disclosure: Tap Reveals Depth

On mobile, you can't dump everything at once. The risk tiles pattern (2×2 grid → tap → fullscreen detail) is the right mental model. Small screens and short sessions punish complexity; structure and layered revelation reward it.

- **Default dossier view:** address header + summary strip + building facts + 2×2 risk tiles + property warnings (house phase) → livability + 3D viewer + neighborhood snapshot (buurt phase) → viewing checklist + action bar. The house-first flow gives users property context before spatial context.
- **Detailed charts, disclaimers, methodology:** fullscreen drilldown, never inline. The user chooses to go deeper; they're never forced.
- **Collapse secondary data into expandable cards.** Risk factors that aren't immediately alarming can live behind a tap. Only surface what's actionable or surprising.
- **Use the dossier scroll position as an engagement signal.** If a user never scrolls past the summary, the summary is doing its job. If they always drill into one category, consider surfacing that category higher.

---

## 6. Trust UI: Transparency as a Feature

Users are making six-figure purchase decisions partly based on this app's data. Trust isn't a nice-to-have; it's structural.

- **Every risk card shows source and recency by default** — even if it's tertiary text. "Data: CBS 2024" or "Last updated: March 2025" should be visible without tapping.
- **Show data freshness prominently.** Stale data erodes trust fast, especially for flood risk or crime statistics. If a dataset is more than 12 months old, flag it.
- **Disclaimers must be one tap away, not buried.** "Indicative only," "registered vs. total crime," methodology notes — these should be accessible from each risk card via a small info icon, not hidden in a settings page.
- **Be transparent about gaps.** If a risk category has incomplete data for a given buurt, show "Data unavailable for this area" per-card with a muted gray degraded state. Never break the dossier or show a misleadingly clean score. Partial data is better than false confidence.
- **Professional, restrained visual design.** The aesthetic should communicate competence and reliability — closer to a banking app than a social app. The Polar Frost palette (cool charcoal + warm whites + single teal accent) achieves this. Avoid playful animations or overly casual UI on the risk assessment screens.

---

## 7. The 3D Viewer: Progressive Loading, Not All-at-Once

The 3D neighborhood viewer is buurt-check's wow factor and the design PRD's "window into reality." But 3D on mobile is treacherous if not handled carefully. The strategy is progressive enhancement with automatic device-tier detection.

- **Three-tier fallback, automatically selected:**
  1. **Full interactive viewer:** LoD2.2 geometry, orthophoto textures, real-time shadows, procedural facades. For capable devices (WebGL `MAX_TEXTURE_SIZE` ≥ 4096, sustained ≥30fps).
  2. **Simplified viewer:** LoD1.3, no textures, no shadows. For mid-tier devices (sub-30fps detected in first 3 seconds).
  3. **Static snapshots:** Pre-rendered views with season toggle. For low-power devices or WebGL failures.
  Device capability is detected automatically — the user never sees a "choose your quality" dialog.
- **Progressive visual enhancement within a session.** First meaningful render (solid-color buildings, orbitabel) within 3-4 seconds. Shadows arrive at 4s. Textures at 5s. Procedural facades at 6s. The viewer is usable before it's beautiful.
- **No sky, only substance.** Camera framing should be tight/isometric — buildings and ground plane fill the viewport. Blue sky is wasted pixels on a small screen. The viewer should feel like a technical aerial diagram, not a landscape scene.
- **Keep interactions simple on mobile.** Single-finger drag to orbit, pinch to zoom, double-tap to reset view. Avoid complex multi-finger gestures. Always provide a visible "Reset view" button.
- **Defer all 3D asset loading until the viewer card enters the viewport.** The 3D viewer should never slow down the dossier's initial render. Intersection Observer triggers the loading sequence.
- **Performance guardrails:**
  - Cap scenes at ~100k triangles; use level-of-detail to show higher detail only when zoomed in.
  - Bake lighting where possible. Pre-computed lighting reduces GPU load; real-time dynamic lights on mobile terrain meshes are a performance trap.
  - `shadowMap.autoUpdate = false` — only re-render shadows on timeline interaction.

---

## 8. Touch Ergonomics & Gesture Conflict Resolution

Mobile is fingers, not cursors. buurt-check has a unique challenge: dossier scroll, 3D viewer orbit, and timeline slider all compete for gestures.

- **Minimum touch targets: 44×44px.** This applies everywhere: risk tile cards, checklist checkboxes, filter chips, the 2×2 grid, season buttons, and language toggle. No tiny icon-only actions in critical flows.
- **Resolve gesture conflicts with clear boundaries.** The dossier captures vertical scroll. The 3D viewer card captures orbit/zoom within its bounded viewport. The timeline slider captures horizontal drag. These zones are mutually exclusive — the viewer card boundary is the dividing line.
- **No hover-dependent interactions.** There is no hover state on mobile. Anything shown via tooltip on desktop must be accessible via tap on mobile.
- **Provide haptic feedback on key actions.** A subtle vibration on shortlist save, PDF export complete, and tab switches reinforces quality and responsiveness. Use sparingly — only primary actions.
- **Primary CTA button height: 48px minimum.** Maintain this discipline on "Add to Shortlist," "Unlock dossier," and "Compare."

---

## 9. Performance is Credibility

In buurt-check, slowness doesn't just feel annoying — it feels *untrustworthy*. "Is this data real? Is this app serious?" The architecture already anticipates caching and graceful degradation. The UI must reinforce this.

- **Two loading patterns for two moments:**
  1. **Initial load (address → dossier):** The branded building assembly animation with progressive text updates ("Finding building..." → "Checking noise levels..." → etc). This communicates purposeful work, not generic waiting.
  2. **In-dossier lazy loading (3D assets, comparison charts):** Skeleton screens — grey blocks matching the expected layout. These appear within the dossier while individual components fetch their data.
- **Lazy-load data layers.** Load the base dossier structure and summary scores first. Fetch detailed risk breakdowns, 3D assets, and historical trends only when the user scrolls or taps into those sections.
- **Per-card failure isolation.** If one data source (e.g., RIVM air quality API) fails, show "Data temporarily unavailable" on that specific card with a muted degraded state. Never break the entire dossier because one upstream source is down.
- **Cache aggressively.** If a user has already viewed an address, the data should be instant on revisit. PostGIS queries for the same neighborhood shouldn't hit the backend twice in a session.
- **Optimize for the Netherlands' mobile network.** Most Dutch users have solid 4G/5G, but design for the 3G edge case. Keep initial payloads under 500KB. Defer 3D assets until the viewer card enters the viewport.

---

## 10. The Shortlist is the Conversion Engine

The MVP caps the shortlist at 3 addresses with compare + PDF export. That's ideal mobile UX: small set, high intention. The shortlist is where casual browsing turns into serious decision-making.

- **"Saved (n)" as a persistent nav affordance.** The Saved tab in the bottom nav shows a counter badge. The user can always see how many addresses they've saved and reach the shortlist in one tap from any screen.
- **Compare screen: synchronized columns, 5–8 indicators max.** Only the most decision-relevant metrics. More than that creates analysis paralysis. Let users buy a full dossier for any address from the compare view.
- **PDF export is the "hand it to my partner" moment.** The exported briefing should be a clean, printable document that works as a standalone artifact — not a screenshot of the app. This is how buurt-check enters the household conversation beyond the phone screen.

---

## 11. Bilingual UX: Layout + Tone, Not Just Translation

"Bilingual by default" is a core principle. But localization for an expat audience goes deeper than swapping strings.

- **Design for text expansion.** Dutch strings are often 20–30% longer than English equivalents. Every component should be tested in both languages without truncation or layout jitter.
- **Store risk explanations as copy blocks, not concatenated strings.** This prevents the fragile "Risk: " + severity + " — " + explanation pattern that breaks differently in each language.
- **Language toggle in a stable, always-findable spot.** The EN|NL segmented control lives in the global top bar, visible on every screen. Default to device system language with an in-app override.
- **Translate concepts, not just labels.** "Wateroverlast" means nothing to an expat. "Bodemdaling" needs to become "land subsidence" with a one-line explanation. WOZ value, kadaster, buurt vs. wijk — provide contextual help via a small "?" icon with a plain-language explanation.
- **Use universal visual metaphors.** Water droplet for flood risk, speaker icon for noise, cracked ground for subsidence. These transcend language and reduce cognitive load for everyone.

---

## 12. Data Visualization on Small Screens

Condensing geospatial and statistical data onto a ~375px-wide screen requires discipline.

- **Simplify charts to their essence.** On mobile, strip away axis labels, grid lines, and titles that desktop dashboards expect. The screen context (which section the user is in) provides the framing. Let the visual do the talking.
- **Horizontal bar charts for risk comparison.** They're the most readable chart type on narrow screens. Each bar = a benchmark row (this address / city average / national average / WHO limit); length = score. Color-coded: teal for address, grays for averages, amber dashed for thresholds.
- **Sparklines for temporal trends.** If showing how a risk factor has changed over time, a tiny inline sparkline communicates the direction without consuming screen space.
- **Limit to 3–4 data colors per chart.** More than that becomes indistinguishable on mobile. The comparison bar chart uses 4 (teal, two grays, amber). The parallel coordinates in compare view uses 3 (teal, amber, purple).
- **Ensure high contrast.** Mobile users are often outdoors. Use 4.5:1 contrast ratio minimum (WCAG AA). Test the Polar Frost palette under simulated daylight conditions.

---

## 13. Onboarding & First-Run Experience

- **Skip registration.** Let users search, inspect the on-screen dossier, and download the quick checklist before asking them to create an account. Gating the core viewer behind sign-up is the fastest way to lose first-time users — especially expats still evaluating the product.
- **Minimize onboarding.** The search screen's value proposition rows (3D sunlight analysis, environmental risk cards, printable viewing brief) serve as the onboarding. No swipeable tutorial cards, no feature tours, no permission requests until contextually needed.
- **Use the first search as the tutorial.** The branded loading animation and progressive dossier reveal teach the product's structure through use.

---

## 14. Dark Mode & Theming

- **Support dark mode from day one.** The Polar Frost palette naturally lends itself to a cold-tone dark theme. Dark backgrounds make 3D terrain visualizations pop with more depth and atmosphere.
- **Adapt risk severity colors for both modes.** The PRD specifies distinct dark-mode risk colors (softer, slightly lighter variants) that maintain the same perceptual severity ordering.
- **Respect system preference.** Follow the device's light/dark mode setting by default, with an in-app override in Settings.
- **The top bar and bottom tab bar are non-flipping.** The dark slate nav (`#1C2D3F`) remains consistent in both light and dark themes, providing brand anchoring and eliminating a class of theming edge cases.

---

## Ship-Quality Checklist

Use this to QA every screen before it ships:

| Check | What to verify |
|-------|---------------|
| **2-second test** | Can a user tell what to do next immediately? |
| **One primary action** | Is there a single dominant CTA? No competing buttons? |
| **Curated** | ≤8 metrics per section; no dashboard sprawl? |
| **Risk card hierarchy** | Score → meaning → viewing questions → source/date? |
| **Tap targets** | All critical interactions ≥44×44px? |
| **Bilingual resilience** | No truncation, no layout shift, no EN-first assumptions? |
| **Failure-safe** | Any missing dataset degrades locally; dossier still works? |
| **Gesture clarity** | Dossier scroll, 3D viewer orbit, and timeline slider don't fight for the same gesture? |
| **3D fallback** | Low-power devices get automatic tier degradation? |
| **Dark mode** | Risk colors readable and severity gradient intact? Non-flipping nav consistent? |
| **Performance** | Initial load <500KB; skeleton screens visible during lazy-load? |
| **Expat clarity** | All Dutch-specific terms have contextual English explanations? |
| **Token compliance** | Zero hardcoded colors, spacing, font sizes, or border radii? |

---

## Summary: The 5 Non-Negotiables

| # | Principle | Why it matters for buurt-check |
|---|-----------|-------------------------------|
| 1 | **Briefing, not dashboard** | Buyers are anxious and time-boxed — curate, don't dump |
| 2 | **Consequences over data** | The viewing checklist is the product's highest-value UX layer |
| 3 | **Dossier scroll with 3D spatial anchor** | Linear narrative flow with an embedded "window into reality" |
| 4 | **3D loads progressively with automatic fallback** | Protects performance and accessibility without hiding the differentiator |
| 5 | **Expat-first concept translation** | Your differentiator market doesn't read Dutch — or understand Dutch housing concepts |
