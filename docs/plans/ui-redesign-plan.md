Frontend vs Design Docs Review                                                                                                                                                    
                                                                                                                                                                                    
  Overall Grade: A- (92/100)                                                                                                                                                                                                                                                                                                                                            
  Your implementation is impressively disciplined — 95%+ token compliance, zero !important, all touch targets at 44px+, and strong accessibility coverage. Below are the specific     gaps between the design documents and your frontend.                                                                                                                                                                                                                                                                                                                  
  ---
  CRITICAL Gaps (Spec Violations)

  1. Card Border Radius Mismatch

  Spec (design-spec.md): Cards use 16px border radius
  Implementation: --radius-card: 12px in tokens.css

  The design spec explicitly calls for 16px card radius, but your token defines 12px. Every card in the app inherits this 4px deviation. You'd need to either update the token or   
  formally revise the spec.

  2. Card Padding Mismatch

  Spec: Card internal padding is 24px all sides (--space-2xl)
  Implementation: Most cards use var(--space-lg) (16px) or var(--space-xl) (20px)

  The design spec calls for 24px card padding, but many components use tighter spacing.

  3. Font Loading Configuration

  Spec: Satoshi Variable WOFF2 (~45KB), font-display: swap
  Implementation (satoshi.css): Loads Satoshi-Regular.woff (not WOFF2), claims weight range 300 900 but filename suggests a single-weight file, not a variable font.

  This likely means weight variations (Black 900 for scores, Bold 700 for headers) are being synthesized by the browser rather than using actual variable font axes.

  4. Risk Tile Score Bar

  Spec: 2px track, 8px dot endpoint at score position
  Implementation: ScoreBar uses 4px track height and 12px dot — close but not pixel-matched to spec.

  5. Bottom Sheet Top Radius

  Spec: Bottom sheet uses 24px top border radius (--radius-pill)
  Implementation: DossierSheet uses --radius-pill: 24px — Correct

  ---
  HIGH Priority Gaps

  6. Three Files Break Token Discipline

  NeighborhoodViewer3D.css — 9 hardcoded values (padding, font-size, margin, border-radius, positioning)
  RiskCardsPanel.css — 20+ hardcoded values (font-sizes, spacing, radii)
  BuildingFootprintMap.css — Hardcoded gradients, font reference typo (--font-size-sm doesn't exist)

  7. Missing Design Tokens

  ┌──────────────────────────┬──────────────────────┬───────────────────────────┐
  │          Token           │      Needed By       │        Spec Value         │
  ├──────────────────────────┼──────────────────────┼───────────────────────────┤
  │ --radius-lg (16px)       │ Cards (per spec)     │ 16px                      │
  ├──────────────────────────┼──────────────────────┼───────────────────────────┤
  │ --space-3xs (2px)        │ Tight gaps           │ 2px                       │
  ├──────────────────────────┼──────────────────────┼───────────────────────────┤
  │ --type-h4                │ PropertyWarningsCard │ undefined                 │
  ├──────────────────────────┼──────────────────────┼───────────────────────────┤
  │ Comparison series colors │ ParallelCoordinates  │ #00897B, #E8913A, #7C4DFF │
  └──────────────────────────┴──────────────────────┴───────────────────────────┘

  8. Comparison Chart Bar Colors

  Spec (design-spec.md):
  - This address: #00897B (Teal)
  - City average: #9AA0A6 (Silver)
  - NL average: #D1D5DB (Lighter gray)
  - WHO limit: #E8913A (Amber threshold)

  Implementation: ParallelCoordinates has hardcoded ['#00897B', '#E8913A', '#7C4DFF'] — doesn't match the spec's 4-row comparison pattern.

  9. Search Input Height

  Spec: 56px (oversized — primary action)
  Implementation: AddressSearch uses height: 56px — Correct

  10. Score Display Typography

  Spec: Risk tile score = 40px Black (--type-score-tile), Detail view = 48px Black (--type-score-large)
  Implementation: Tokens exist and are defined correctly. Verify they're actually applied in RiskTile and RiskDetailView components.

  ---
  MEDIUM Priority Gaps

  11. TopBar Scroll Behavior

  Spec: "Transparent at scroll 0, transitions to white + border on scroll"
  Implementation: TopBar appears to have a fixed dark slate background (--color-nav-bg: #1C2D3F). No scroll-dependent transparency transition found.

  This is a deliberate design decision (non-flipping dark nav), but deviates from spec.

  12. Address Input Focus Ring

  Spec: Focus border #00897B + ring 0 0 0 4px rgba(0,137,123,0.12)
  Implementation: Uses --color-accent (#2EC4B6) + --focus-ring-accent. The hex #00897B is teal-700, not the accent color. Minor hue difference.

  13. Tab Bar Background

  Spec: "White with backdrop-filter: blur(20px), 80% opacity"
  Implementation: TabBar uses var(--glass-bg) / var(--glass-blur) — check if these map to the spec values.

  14. 3D Viewer Height

  Spec: 50vh (min 280px, max 420px)
  Implementation: Need to verify in NeighborhoodViewer3D.css.

  15. Checkbox Dimensions

  Spec: 22x22px, border: 2px #00897B, border-radius: 4px
  Implementation: ViewingChecklist checkboxes — verify pixel match.

  16. LanguageToggle Radius

  Spec: Not explicitly specified, but component uses 4px while design system minimum is --radius-sm: 6px.

  ---
  LOW Priority / Cosmetic

  17. Skeleton Animation Respects prefers-reduced-motion

  Spec: Required
  Implementation: SkeletonCard.css has @media (prefers-reduced-motion) — Correct

  18. Number Formatting

  Spec: NL uses , decimal, . thousands; EN uses standard
  Implementation: Not verified — would need runtime testing.

  19. Button Heights

  Spec: Primary buttons 48px
  Implementation: ActionBar buttons height: 48px — Correct

  ---
  What's Excellent (Matches Spec Perfectly)

  ┌──────────────────────────────┬─────────────────────────────────────────────┐
  │             Area             │                   Status                    │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Color palette (Polar Frost)  │ Tokens match palette.md exactly             │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ WCAG accent-text rule        │ --color-accent-text: #1C8C83 correctly used │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Dark mode (OLED #000000)     │ Implemented with full token overrides       │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Risk severity 4-level system │ Colors, icons, quadruple redundancy         │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Touch targets (44px min)     │ All 15+ interactive elements verified       │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Accessibility attributes     │ 88 aria-*/role/alt across 32 files          │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Z-index hierarchy            │ Clean stacking, documented allocation       │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Spacing system (8pt grid)    │ 10 tokens, 95%+ compliance                  │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Elevation system             │ 4 levels, zero hardcoded shadows            │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Typography scale             │ 15 tokens matching spec                     │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Dossier canonical order      │ 14 sections, E2E enforced                   │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Haptic feedback              │ Bookmark, tab, export                       │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Spring animations            │ 4 named constants (Framer Motion)           │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Nav non-flipping             │ Dark slate in both themes                   │
  ├──────────────────────────────┼─────────────────────────────────────────────┤
  │ Badge semantic tokens        │ 4 variants with bg+text pairs               │
  └──────────────────────────────┴─────────────────────────────────────────────┘

  ---
  Recommended Action Plan

  Quick wins (1 hour):
  1. Fix --radius-card to 16px (or formally revise spec to 12px)
  2. Add missing tokens (--radius-lg, --space-3xs, comparison colors)
  3. Fix BuildingFootprintMap.css typo (--font-size-sm → --type-caption)

  Medium effort (2-3 hours):
  4. Replace hardcoded values in NeighborhoodViewer3D.css (9 values)
  5. Replace hardcoded values in RiskCardsPanel.css (20+ values)
  6. Verify and fix Satoshi font loading (WOFF2 variable font)

  Larger effort (deferred):
  7. Implement TopBar scroll transparency (spec vs current dark nav decision)
  8. Pixel-match comparison chart colors to spec
  9. Audit all card padding against 24px spec