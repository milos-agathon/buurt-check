# Mobile UI Design Principles for buurt-check

A curated set of design principles for a Dutch neighborhood intelligence app with 3D visualization, risk assessments, and interactive maps — targeting expats and first-time home buyers.

---

## 1. Briefing, Not Dashboard

buurt-check is not a data tool. It's a prepared, trustworthy intelligence briefing for anxious buyers who are time-boxed. The UI should feel calm, spacious, and curated — like an analyst handed you a dossier, not like you opened a GIS console.

- **White space is the main design material.** Resist the urge to fill every pixel with data. Dense layouts signal "power user tool"; generous spacing signals "someone curated this for you."
- **Hard cap: 5–8 indicators per section.** CBS, RIVM, Kadaster, and other Dutch open data sources can easily explode a screen with dozens of metrics. The design's job is to select, not to display. If you can't justify why a metric changes a buying decision, cut it.
- **One dominant action per screen.** Each screen gets a single primary CTA (e.g., "Add to shortlist," "Export PDF," "View in 3D"). Everything else is secondary or tertiary. If two buttons are fighting for attention, the screen has a hierarchy problem.
- **No dashboard sprawl.** Avoid side-by-side chart grids, multi-tab analytics panels, or anything that makes the user feel like they're operating software. The user's mental model is "I'm reading a report," not "I'm running queries."

---

## 2. Map-First, Data-Second

The map is the spine of buurt-check. Everything else orbits around it.

- **The map should always be visible or one tap away.** Never bury it behind tabs. A persistent map with a draggable bottom sheet (à la Google Maps / Apple Maps) is the proven pattern for map-heavy mobile apps.
- **Bottom sheet pattern.** The overlay panel slides up from the bottom to reveal neighborhood details. The map stays live behind it. Users drag the sheet down to see more map, or up to see more data. This resolves the fundamental tension between spatial exploration and data consumption without tab-switching.
- **Minimize map chrome.** Zoom controls, layer toggles, and compass should be minimal and tucked to edges. The map canvas is the most valuable screen real estate on every screen it appears on.
- **Risk data as map overlays, not separate screens.** Where possible, let users toggle risk layers (flood zones, noise contours, subsidence areas) directly on the map rather than switching to a separate data view. The spatial context is the whole point.

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

- **Use a consistent, semantic color scale.** Map the Polar Frost palette to a clear gradient: polar teal for low risk → warm amber/coral for high risk. Users should intuitively understand severity at a glance without reading labels.
- **Never rely on color alone.** Use consistent severity labels (Good / Moderate / Poor / Critical) paired with icon shape and a numeric score. This serves both colorblind users (~8% of men) and situations where the screen is in direct sunlight and color distinctions wash out. For a risk assessment app, misreading severity has real-world consequences.
- **Lead with the aggregate, then break down.** A single verdict score (e.g., "B+" or "7.2/10") at the top of the dossier gives users an instant read. Component scores (flooding: low, noise: moderate, etc.) come below in the 2×2 risk tile grid. Detailed breakdowns live one tap deeper.
- **Iconography per risk category.** Flood, noise, subsidence, air quality, crime — each needs a distinct, recognizable icon. Text labels alone are slow to scan on mobile, and icons transcend language barriers for your expat audience.

---

## 5. Progressive Disclosure: Tap Reveals Depth

On mobile, you can't dump everything at once. The risk tiles pattern (2×2 grid → tap → full-screen detail) is the right mental model. Small screens and short sessions punish complexity; structure and layered revelation reward it.

- **Default dossier view:** summary strip + 3D hero module + 2×2 risk tiles + neighborhood snapshot. That's it. No scrolling past three screens of content.
- **Detailed charts, disclaimers, methodology:** bottom sheet or full-screen drilldown, never inline. The user chooses to go deeper; they're never forced.
- **Collapse secondary data into expandable cards.** Risk factors that aren't immediately alarming can live behind a tap. Only surface what's actionable or surprising.
- **Use the dossier scroll position as an engagement signal.** If a user never scrolls past the summary, the summary is doing its job. If they always drill into one category, consider surfacing that category higher.

---

## 6. Trust UI: Transparency as a Feature

Users are making six-figure purchase decisions partly based on this app's data. Trust isn't a nice-to-have; it's structural.

- **Every risk card shows source and recency by default** — even if it's tertiary text. "Data: CBS 2024" or "Last updated: March 2025" should be visible without tapping.
- **Show data freshness prominently.** Stale data erodes trust fast, especially for flood risk or crime statistics. If a dataset is more than 12 months old, flag it.
- **Disclaimers must be one tap away, not buried.** "Indicative only," "registered vs. total crime," methodology notes — these should be accessible from each risk card via a small info icon, not hidden in a settings page.
- **Be transparent about gaps.** If a risk category has incomplete data for a given buurt, show "Data unavailable for this area" per-card. Never break the dossier or show a misleadingly clean score. Partial data is better than false confidence.
- **Professional, restrained visual design.** The aesthetic should communicate competence and reliability — closer to a banking app than a social app. Avoid playful animations or overly casual UI on the risk assessment screens.

---

## 7. The 3D Viewer: Emotional Proof, Not Default Mode

The Three.js / forge3d terrain view is buurt-check's wow factor and the design PRD's "window into reality." But 3D on mobile is treacherous if not handled carefully. Treat it as a hero moment, not a background layer.

- **3D is opt-in, not default.** Launch the neighborhood view in 2D (map + data cards). Offer a prominent "View in 3D" button that transitions the user into the immersive terrain model. This keeps the baseline experience fast and accessible.
- **Treat 3D as one hero module with a clear boundary.** It's a defined viewport within the dossier, not a full-page background. Give it a single, tight control cluster (fullscreen toggle, time-of-day slider presets, building highlight). Don't scatter controls around the page.
- **Provide a graceful fallback.** If the device can't handle WebGL/3D, or the connection is slow, degrade to a 2D elevation heatmap or contour overlay. Never show a blank viewport or a spinner lasting more than ~3 seconds.
- **Keep 3D interactions simple on mobile.** Single-finger drag to orbit, pinch to zoom, double-tap to reset view. Avoid complex multi-finger gestures. Always provide a visible "Reset view" button.
- **Performance guardrails:**
  - Cap scenes at ~100k triangles; use level-of-detail (LOD) to show higher detail only when zoomed in.
  - Bake lighting where possible. Pre-computed lighting reduces GPU load dramatically; real-time dynamic lights on mobile terrain meshes are a performance trap.
  - Defer all 3D asset loading until explicitly requested. The 3D view should never slow down the dossier load.

---

## 8. Touch Ergonomics & Gesture Conflict Resolution

Mobile is fingers, not cursors. buurt-check has a unique challenge: map pan, bottom sheet swipe, and 3D orbit all compete for the same gestures.

- **Minimum touch targets: 44×44pt (Apple HIG) / 48×48dp (Material Design).** This applies everywhere: map markers, risk tile cards, filter chips, the 2×2 grid, checklist items, and language toggle. No tiny icon-only actions in critical flows.
- **Resolve gesture conflicts explicitly.** Define clear gesture zones: the bottom sheet captures vertical swipes, the map captures horizontal pan and pinch-zoom, and the 3D viewer (when active) captures orbit/zoom within its bounded viewport. Consider a "lock map" mode when the data sheet is in focus.
- **No hover-dependent interactions.** There is no hover state on mobile. Anything shown via tooltip on desktop must be accessible via tap on mobile.
- **Provide haptic feedback on key actions.** A subtle vibration when the user saves a neighborhood, triggers a risk assessment, or enters 3D view reinforces the sense of quality and responsiveness.
- **Primary CTA button height: 48px minimum.** Keep this discipline on "Add to shortlist," "Export PDF," and "View in 3D."

---

## 9. Performance is Credibility

In buurt-check, slowness doesn't just feel annoying — it feels *untrustworthy*. "Is this data real? Is this app serious?" The architecture already anticipates caching and graceful degradation. The UI must reinforce this.

- **Skeleton screens, not spinners.** When loading the dossier, show the layout structure (grey blocks where text and charts will appear) rather than a generic loading spinner. Frame it as "Your briefing is being prepared." Perceived load time drops ~40%.
- **Lazy-load data layers.** Load the base map and summary score first. Fetch detailed risk breakdowns, 3D assets, and historical trends only when the user scrolls or taps into those sections.
- **Per-card failure isolation.** If one data source (e.g., RIVM air quality API) fails, show "Data unavailable" on that specific card. Never break the entire dossier because one upstream source is down.
- **Cache aggressively.** If a user has already viewed a buurt, the data should be instant on revisit. PostGIS queries for the same neighborhood shouldn't hit the backend twice in a session.
- **Optimize for the Netherlands' mobile network.** Most Dutch users have solid 4G/5G, but design for the 3G edge case. Keep initial payloads under 500KB. Defer 3D assets until explicitly requested.

---

## 10. The Shortlist is the Conversion Engine

The MVP caps the shortlist at 3 neighborhoods with compare + PDF export. That's ideal mobile UX: small set, high intention. The shortlist is where casual browsing turns into serious decision-making.

- **"Saved (n)" as a persistent nav affordance.** The user should always know how many neighborhoods they've saved and be able to reach the shortlist in one tap from any screen. Bottom tab bar or persistent badge — don't hide it behind a menu.
- **Compare screen: one screen, table-like, 5–8 indicators max.** Only the most decision-relevant metrics. More than that creates analysis paralysis. Let users tap into a full dossier for either neighborhood from the compare view.
- **PDF export is the "hand it to my partner" moment.** The exported briefing should be a clean, printable document that works as a standalone artifact — not a screenshot of the app. This is how buurt-check enters the household conversation beyond the phone screen.

---

## 11. Bilingual UX: Layout + Tone, Not Just Translation

"Bilingual by default" is a core principle. But localization for an expat audience goes deeper than swapping strings.

- **Design for text expansion.** Dutch strings are often 20–30% longer than English equivalents. Every component should be tested in both languages without truncation or layout jitter.
- **Store risk explanations as copy blocks, not concatenated strings.** This prevents the fragile "Risk: " + severity + " — " + explanation pattern that breaks differently in each language.
- **Language toggle in a stable, always-findable spot.** Top bar or settings — never buried. Default to device system language with an in-app override.
- **Translate concepts, not just labels.** "Wateroverlast" means nothing to an expat. "Bodemdaling" needs to become "land subsidence" with a one-line explanation. WOZ value, kadaster, buurt vs. wijk — provide contextual help via a small "?" icon with a plain-language explanation.
- **Use universal visual metaphors.** Water droplet for flood risk, speaker icon for noise, cracked ground for subsidence. These transcend language and reduce cognitive load for everyone.

---

## 12. Data Visualization on Small Screens

Condensing geospatial and statistical data onto a ~375px-wide screen requires discipline.

- **Simplify charts to their essence.** On mobile, strip away axis labels, grid lines, and titles that desktop dashboards expect. The screen context (which section the user is in) provides the framing. Let the visual do the talking.
- **Horizontal bar charts for risk comparison.** They're the most readable chart type on narrow screens. Each bar = a risk category; length = severity. Simple, scannable, no legend needed.
- **Sparklines for temporal trends.** If showing how a risk factor has changed over time (flood incidents per year, crime trend), a tiny inline sparkline communicates the direction without consuming screen space.
- **Limit to 3–4 data colors.** More than that becomes indistinguishable on mobile, especially on multi-line charts or multi-category maps.
- **Ensure high contrast.** Mobile users are often outdoors. Use 4.5:1 contrast ratio minimum (WCAG AA). Test the Polar Frost palette under simulated daylight conditions. What looks great on your monitor may wash out in direct sun.

---

## 13. Onboarding & First-Run Experience

- **Skip registration.** Let users search and view at least one full neighborhood dossier before asking them to create an account. Gating content behind sign-up is the fastest way to lose first-time users — especially expats who are still evaluating the product.
- **Minimize onboarding to 2–3 swipeable cards.** Core value prop only: "Check any Dutch neighborhood → See risk scores → Explore in 3D." Then drop them into the search screen. No feature tours, no permission requests until contextually needed.
- **Use the first search as the tutorial.** Guide the user through their first dossier with subtle, dismissible hints ("Tap to expand," "Swipe up for details," "Try 3D view"). The product teaches itself through use.

---

## 14. Dark Mode & Theming

- **Support dark mode from day one.** The Polar Frost palette naturally lends itself to a cold-tone dark theme. Dark backgrounds make 3D terrain visualizations pop with more depth and atmosphere.
- **Adapt risk severity colors for both modes.** Red-on-white and red-on-dark-grey have different perceptual weights. Test the full severity gradient (teal → amber → coral) in both light and dark contexts.
- **Respect system preference.** Follow the device's light/dark mode setting by default, with an in-app override.

---

## Ship-Quality Checklist

Use this to QA every screen before it ships:

| Check | What to verify |
|-------|---------------|
| **2-second test** | Can a user tell what to do next immediately? |
| **One primary action** | Is there a single dominant CTA? No competing buttons? |
| **Curated** | ≤8 metrics per section; no dashboard sprawl? |
| **Risk card hierarchy** | Score → meaning → viewing questions → source/date? |
| **Tap targets** | All critical interactions ≥44×44pt? |
| **Bilingual resilience** | No truncation, no layout shift, no EN-first assumptions? |
| **Failure-safe** | Any missing dataset degrades locally; dossier still works? |
| **Gesture clarity** | Map, bottom sheet, and 3D don't fight for the same swipe? |
| **3D fallback** | Non-WebGL devices get a usable 2D alternative? |
| **Dark mode** | Risk colors readable and severity gradient intact? |
| **Performance** | Initial load <500KB; skeleton screens visible during fetch? |
| **Expat clarity** | All Dutch-specific terms have contextual English explanations? |

---

## Summary: The 5 Non-Negotiables

| # | Principle | Why it matters for buurt-check |
|---|-----------|-------------------------------|
| 1 | **Briefing, not dashboard** | Buyers are anxious and time-boxed — curate, don't dump |
| 2 | **Consequences over data** | The viewing checklist is the product's highest-value UX layer |
| 3 | **Map + bottom sheet** | Preserves spatial context while showing the dossier |
| 4 | **3D is opt-in** | Protects performance, accessibility, and the wow-factor moment |
| 5 | **Expat-first concept translation** | Your differentiator market doesn't read Dutch — or understand Dutch housing concepts |
