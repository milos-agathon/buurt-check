# Premium Features Design — buurt-check

**Date:** 2026-02-13
**Goal:** Transform buurt-check from a free MVP into a premium product that Dutch Reddit users would pay for
**Quality bar:** Every feature must address a real, documented pain point from Dutch homebuyer forums
**Phasing:** Feature-led (Approach A) — ship value free first, monetize after demand validation

---

## Strategy Summary

**Phase 1 (immediate):** Property Warnings — 5 new warning signals derived from existing or cheaply-available data. Ship fully free. Goal: Reddit buzz, organic sharing, product-market fit validation.

**Phase 2 (after 2-4 weeks of usage data):** Monetization Infrastructure — Supabase Auth + Postgres for user state, Stripe for payments. Freemium model based on real usage patterns observed in Phase 1.

**Phase 3 (behind premium paywall):** Financial Intelligence — closing cost calculator, energy renovation estimates, street-level sale price history from Kadaster.

**Key principle:** Ship free, earn trust, then monetize. No paywall before Reddit buzz. No infrastructure before product-market fit signal.

---

## Phase 1: Property Warnings

Five new warning signals that address the top homebuyer regrets identified in Dutch Reddit/forum research. Each warning follows the 4-part card hierarchy from `docs/ui-principles.md` Section 3:

1. Score/severity label
2. What it means (plain language)
3. What to ask/check at viewing
4. Source + date

### 1A. Foundation Risk Indicator

**Problem it solves:** 425,000 Dutch properties have or will develop foundation problems. Repair costs: EUR 60,000-100,000+. Only 1 in 10 homeowners know their foundation condition. Pre-1970 buildings on clay/peat soil are highest risk. This is the #1 "I wish I had known" regret on Dutch housing forums.

**Data sources:**
- Construction year: `BuildingResponse.building.construction_year` (BAG, already available)
- Soil type: PDOK BRO (Basisregistratie Ondergrond) WFS — new API call at address coordinates. Returns soil classification: klei (clay), veen (peat), zand (sand), grind (gravel), leem (loam)
- Subsidence rate: Klimaateffectatlas WFS (same endpoint as existing climate risk cards) — may already be fetched in parallel

**Classification logic:**

| Construction year | Soil type | Subsidence rate | Risk level |
|---|---|---|---|
| < 1970 | klei or veen | > 2 mm/year | High |
| < 1970 | klei or veen | <= 2 mm/year | Medium |
| < 1970 | zand, grind, or leem | any | Low |
| 1970-1990 | klei or veen | > 2 mm/year | Medium |
| 1970-1990 | any other | any | Low |
| > 1990 | any | any | Low |
| any | unavailable | any | "Soil data unavailable — foundation risk cannot be assessed" |

**4-part card:**

1. **Severity badge:** "Foundation Risk: HIGH" / "MEDIUM" / "LOW" — uses existing severity color tokens (--color-badge-negative for high, --color-badge-caution for medium, --color-badge-positive for low)

2. **What it means (example for HIGH):**
   > "Built in 1952 on clay soil with 3.2 mm/year subsidence. Approximately 425,000 Dutch homes have foundation problems — pre-1970 buildings on soft soil are most affected. Repair costs typically range from EUR 60,000 to EUR 100,000+."

   For MEDIUM:
   > "Built in 1975 on clay soil. This building was constructed during a transition period in foundation practices. While modern concrete piles are likely, the soft soil in this area warrants verification."

   For LOW:
   > "Built in 2005 on sandy soil. Modern foundation practices and stable soil conditions indicate low foundation risk."

3. **Viewing questions:**
   - "Has a foundation inspection (funderingsonderzoek) been performed? Request the report."
   - "Look for visible signs: cracks near windows and doors, tilting walls, doors that stick or won't close, uneven floors."
   - "If this is an apartment: has the VvE discussed or budgeted for foundation repair?"
   - "Ask neighbors: have any buildings on this street had foundation work done?"

4. **Source + date:**
   > "Soil type: PDOK Basisregistratie Ondergrond (BRO). Subsidence rate: Klimaateffectatlas. Construction year: BAG Kadaster. Risk classification based on TNO/Deltares research on Dutch foundation risk factors."

**Disclaimer (mandatory, displayed below card):**
> "This is an indicative risk assessment based on building age, soil type, and regional subsidence data. It is NOT a foundation inspection. Only a professional funderingsonderzoek can determine actual foundation condition. Buildings with low indicated risk can still have foundation problems, and buildings with high indicated risk may have been reinforced."

**False-positive risks:**
- A pre-1970 building on clay could have had its foundation replaced (not detectable from BAG data)
- Subsidence rate is regional, not building-specific — a building on deep piles may be unaffected by surrounding subsidence
- Mitigation: the disclaimer explicitly states this is indicative, and viewing questions direct the user to request the actual foundation report

**Backend endpoint:** `GET /api/address/{vbo_id}/foundation-risk?rd_x=...&rd_y=...`

**New service:** `backend/app/services/foundation_risk.py`
- `get_foundation_risk(construction_year, rd_x, rd_y)` -> `FoundationRisk` model
- Calls PDOK BRO WFS for soil type
- Calls Klimaateffectatlas WFS for subsidence rate (may reuse existing climate fetch)
- Applies classification logic
- Cache key: `foundation:{rd_x:.0f}:{rd_y:.0f}` (soil doesn't change), TTL 30 days

**New model:** `backend/app/models/property_warnings.py`
```python
class FoundationRisk(BaseModel):
    level: Literal["high", "medium", "low", "unavailable"]
    construction_year: int | None
    soil_type: str | None  # klei, veen, zand, grind, leem
    subsidence_rate_mm_per_year: float | None
    messages: list[str]  # warning codes for i18n
```

---

### 1B. Erfpacht Detection

**Problem it solves:** Erfpacht (ground lease) means recurring canon payments of EUR 100-600+/month ON TOP of the mortgage. Common in Amsterdam (80% of land), The Hague, Rotterdam, Utrecht. Expats frequently discover this cost late in the buying process. Temporary erfpacht leases face massive canon increases on renewal.

**Data sources:**
- Primary: BAG/Kadaster BRK data via PDOK. The eigendomsstatus field or land registry may indicate erfpacht. **Requires API research** — the exact field availability in PDOK WFS needs verification before implementation.
- Fallback: Municipality-based detection. Address municipality is available from the Locatieserver response (`gemeente` field). Known erfpacht municipalities maintained as `ERFPACHT_MUNICIPALITIES` config constant in `backend/app/config.py` (not hardcoded in service logic):
  ```python
  # Last verified: 2026-02-13. Recheck annually — municipalities occasionally
  # convert erfpacht portfolios to eigendom or adopt new erfpacht policies.
  ERFPACHT_MUNICIPALITIES: list[str] = [
      "Amsterdam", "Den Haag", "Rotterdam", "Utrecht",
      "Leiden", "Zaanstad", "Amstelveen", "Haarlem",
  ]
  ```

**Classification logic:**

| Signal | Result |
|---|---|
| BAG/BRK confirms erfpacht | "Erfpacht confirmed" — factual statement |
| Municipality in `ERFPACHT_MUNICIPALITIES`, no BAG data | "Erfpacht likely — verify with seller or Kadaster" |
| Municipality NOT in `ERFPACHT_MUNICIPALITIES`, no BAG data | No erfpacht warning shown |

**4-part card:**

1. **Label:** "Erfpacht (Ground Lease)" — informational amber badge. NO numeric score — we don't have canon amount data.

2. **What it means:**
   > "This property is [confirmed / likely] on erfpacht. Erfpacht means you own the building but lease the land from the municipality. This results in a recurring canon payment (typically EUR 100-600/month in Amsterdam) on top of your mortgage. The canon amount is reviewed periodically and can increase significantly at renewal."

   For municipality-based detection:
   > "[Municipality] issues erfpacht for many properties. While not all properties in this municipality are on erfpacht, it is common. Verify the property's eigendomsstatus with the seller or via Kadaster."

3. **Viewing questions:**
   - "Is this eigendom (freehold) or erfpacht (leasehold)?"
   - "If erfpacht: is it eeuwigdurend (perpetual) or tijdelijk (temporary)?"
   - "What is the current annual canon? When is the next canon review?"
   - "If temporary: when does the lease expire? What are the terms for renewal?"
   - "Has the canon recently been converted to eeuwigdurend? At what rate?"

4. **Source + date:**
   > "Municipality: PDOK Locatieserver. Erfpacht prevalence based on municipal land policy records."
   If BAG/BRK confirmed: "Eigendomsstatus: Kadaster BRK."

**Disclaimer:**
> "Erfpacht status should be confirmed via the Kadaster register or the seller's notary deed (leveringsakte). Municipality-based detection is indicative — not all properties in erfpacht municipalities are on erfpacht, and some properties in other municipalities may also be on erfpacht."

**False-positive risks:**
- Municipality-based flag will flag properties that are actually freehold (eigen grond) in Amsterdam — some Amsterdam properties have been converted to eigendom
- Mitigation: clear "verify with seller" language, no claim of certainty

**Backend:** Integrated into `property_warnings.py` service. No separate endpoint — aggregated with other warnings.

---

### 1C. VvE Flags (Apartment Detection)

**Problem it solves:** Expats buying apartments are frequently surprised by VvE (Vereniging van Eigenaars) costs, obligations, and shared liability. A single VvE decision (e.g., foundation repair, elevator replacement) can add EUR 1,000/month to costs. Half of Dutch VvEs save too little for maintenance.

**Data source:** BAG building data — the pand (building) linked to the verblijfsobject. If the pand contains multiple verblijfsobjecten (`num_verblijfsobjecten > 1` or the verblijfsobject type is `appartementsrecht`), this is an apartment with mandatory VvE membership.

**Detection logic:**
- If building type indicates apartment / multi-unit → show VvE card
- If single-unit house → no VvE card
- The BAG data already available from the building facts endpoint should contain this information

**4-part card (shown ONLY for apartments):**

1. **Label:** "VvE (Owners' Association)" — informational blue badge. NO numeric score — we don't have VvE financial data.

2. **What it means:**
   > "This is an apartment (appartementsrecht) with mandatory VvE membership. All owners share responsibility for the building's maintenance, insurance, and communal areas. VvE decisions are legally binding — including large expenditures like foundation repair, elevator replacement, or facade renovation. Monthly VvE contributions typically range from EUR 100-400."

3. **Viewing questions:**
   - "Request the VvE jaarrekening (annual financial report) — is the reserve fund healthy?"
   - "Request the MJOP (meerjarenonderhoudsplan / multi-year maintenance plan) — what large costs are planned in the next 5-10 years?"
   - "Request the notulen (minutes) of the last 3 VvE meetings — any disputes, pending assessments, or deferred maintenance?"
   - "What is the monthly VvE bijdrage (contribution)? Is it sufficient to cover the MJOP?"
   - "How many units are in the VvE? (Fewer units = higher per-unit cost for shared repairs)"
   - "Is the building insured through the VvE? What does the policy cover?"

4. **Source + date:**
   > "Building type: BAG Kadaster."

**No disclaimer needed** — the detection is factual (the property either is or isn't part of a multi-unit building). The content is educational, not predictive.

**False-positive risk:** Minimal. Multi-unit detection from BAG is reliable.

---

### 1D. Asbestos Age Flag

**Problem it solves:** Any Dutch building constructed before July 1993 may contain asbestos-containing materials. Discovery during renovation triggers mandatory professional removal at significant cost (EUR 1,000-15,000+). Buyers cannot hold sellers accountable post-purchase for visible asbestos they should have noticed.

**Data source:** `BuildingResponse.building.construction_year` (BAG, already available)

**Logic:** Construction year < 1994 → show warning. Construction year >= 1994 or unknown → no warning.

**4-part card:**

1. **Label:** "Asbestos Awareness" — amber informational badge. NO numeric score.

2. **What it means:**
   > "Built in [year], before the 1993 asbestos ban. Asbestos-containing materials (roof tiles, floor tiles, insulation, pipe lagging, window putty) may be present. Undisturbed asbestos is not an immediate health risk, but professional removal is legally required if materials are disturbed during renovation. Removal costs range from EUR 1,000 (small area) to EUR 15,000+ (full building remediation)."

3. **Viewing questions:**
   - "Has an asbestos inventory (asbestinventarisatie) been conducted? Request the report."
   - "Are there corrugated cement roof panels, vinyl floor tiles from the 1960s-1980s, or visible pipe insulation?"
   - "If renovation is planned: has the seller disclosed potential asbestos-containing materials?"
   - "Is there an asbestos-free certificate (asbestvrij verklaring) for any previous renovation work?"

4. **Source + date:**
   > "Construction year: BAG Kadaster. Dutch asbestos ban: Asbestverwijderingsbesluit 2005 (products banned from 1 July 1993). Risk assessment based on Rijksoverheid asbestos guidelines."

**Disclaimer:**
> "The presence of asbestos can only be confirmed by professional inspection (Type A or Type B asbestinventarisatie). This flag is based solely on construction year. Buildings constructed before 1994 may have already been remediated, and some materials used after 1993 may still contain trace amounts."

**False-positive risk:**
- Many pre-1994 buildings have already been professionally remediated — the flag will still appear
- Mitigation: viewing questions ask specifically about existing reports and certificates

---

### 1E. Attention Summary (Confidence Synthesis)

**Problem it solves:** Decision paralysis. First-time buyers are overwhelmed by the number of factors (noise, flooding, air quality, sunlight, foundation, erfpacht, VvE, asbestos, energy label, neighborhood stats). They need a single, scannable synthesis that tells them where to focus attention.

**Design choice: Descriptive, not prescriptive.** Uses "items need attention" language that describes the situation, not "Proceed/Caution/Investigate" language that implies professional advice. This is the analyst presenting findings, not the advisor recommending action.

**Inputs:**
- All 4 risk scores (noise, air quality, climate, sunlight) — from `/risks` endpoint
- Foundation risk level — from new foundation risk service
- Erfpacht detection — from municipality/BAG data
- VvE status — from building type
- Asbestos flag — from construction year
- Data completeness — how many of the 4 risk categories returned real data

**Synthesis logic:**

```
flags = []

# Risk scores
for each risk category (noise, air, climate, sunlight):
    if score < 30:  # critical
        flags.append({category: "critical", label: "critical [category] risk"})
    elif score < 50:  # poor
        flags.append({category: "elevated", label: "elevated [category] risk"})
    # moderate (50-69) and good (70-100) are NOT flagged

# Property warnings
if foundation_risk == "high":
    flags.append({category: "foundation", label: "high foundation risk"})
elif foundation_risk == "medium":
    flags.append({category: "foundation", label: "foundation risk needs verification"})

if erfpacht_detected:
    flags.append({category: "erfpacht", label: "erfpacht (ground lease) detected"})

# VvE — flagged for apartments (VvE liability is as consequential as foundation risk)
if is_apartment:
    flags.append({category: "vve", label: "VvE (owners' association) — review financials"})

# Asbestos — flagged only for pre-1980 buildings (extensive structural asbestos use)
# Post-1980 pre-1994 buildings had declining asbestos use; still get the card but not the flag
if construction_year and construction_year < 1980:
    flags.append({category: "asbestos", label: "pre-1980 building — asbestos risk in structural materials"})

# Data completeness
risk_categories_available = count of non-"unavailable" risk categories (out of 4)
```

**Display:**

Three states:

| Flag count | Display |
|---|---|
| 0 flags | **"No flags raised"** (green badge) + "All assessed risk categories are within normal ranges." |
| 1 flag | **"1 item needs attention"** (amber badge) + "[specific flag label]" |
| 2+ flags | **"[N] items need attention"** (red badge) + bullet list of specific flag labels |

**Data completeness suffix (always shown):**
- If all 4 risk categories have data: "Based on 4 of 4 environmental risk categories + property analysis."
- If some missing: "Based on [N] of 4 environmental risk categories + property analysis. [Missing categories] could not be assessed."

**Example renders:**

**Green state:**
> **No flags raised**
> All assessed risk categories are within normal ranges. Foundation risk: low.
> *Based on 4 of 4 environmental risk categories + property analysis.*

**Amber state:**
> **1 item needs attention**
> - Elevated noise risk (score: 38/100)
>
> Foundation risk: low. No erfpacht detected.
> *Based on 4 of 4 environmental risk categories + property analysis.*

**Red state:**
> **4 items need attention**
> - Critical flood risk (score: 22/100)
> - High foundation risk (pre-1955 building on clay soil)
> - Erfpacht (ground lease) detected
> - Pre-1980 building — asbestos risk in structural materials
>
> *Based on 3 of 4 environmental risk categories + property analysis. Air quality data unavailable for this location.*

**Placement:** Top of dossier, above the risk tiles grid. The summary pills (individual risk scores) move BELOW the attention summary.

**Rendering strategy: Delayed appearance, no skeleton.** The AttentionSummary depends on risk scores (T+2-5s) AND property warnings (T+2-3s). A premature "No flags raised" badge that flips to "2 items need attention" seconds later would undermine the trust this component is designed to build. Therefore:

- **Do NOT render the AttentionSummary component at all** until both risk data and property warnings have resolved (loaded or errored).
- While waiting, the dossier flows directly from AddressHeader into SummaryStrip → RiskTilesGrid. No gap, no skeleton, no placeholder.
- When all input data resolves, the AttentionSummary animates in with `SPRING_REVEAL` and pushes content below it down. This is a layout shift, but a *meaningful* one — the user sees the summary "arrive" as a coherent verdict.
- If risk data errors out, the summary still renders using whatever data is available, with the data completeness suffix explaining the gap.

**Frontend component:** `AttentionSummary.tsx` — receives all risk scores, foundation risk, erfpacht status, and data completeness as props. Parent renders `{risksResolved && warningsResolved && <AttentionSummary ... />}`.

**Disclaimer (shown via info icon tap):**
> "This summary synthesizes multiple data sources into a single overview. It is not professional property advice. Individual risk assessments are indicative and based on publicly available data. Always commission professional inspections (bouwkundige keuring, funderingsonderzoek) before making a purchase decision."

---

## Phase 2: Monetization Infrastructure (Deferred — after usage validation)

### Freemium Model

Designed during brainstorming, to be implemented after 2-4 weeks of free usage data.

**Free preview (unlimited, before first unlock):**
- Full address search with map
- Preview dossier: 2x2 risk tile grid with scores + severity labels + one-line summary per tile
- AttentionSummary badge (e.g., "2 items need attention") — **always visible**, even in preview
- Neighborhood stats card (summary level)
- No risk detail views, no viewing questions, no individual warning cards, no PDF

**Free tier (3 full unlocks per month, rolling):**
- Full dossier unlock: all detail views, viewing questions, individual property warning cards, neighborhood stats, Tier B data
- First unlock is completely ungated (user experiences full product before any gate)
- Second unlock triggers soft sign-up prompt: "Create a free account to save this briefing and unlock 2 more this month"

**Premium (EUR 9.99/mo or EUR 79.99/yr — pricing TBD from usage data):**
- Unlimited full dossier unlocks
- PDF export (both templates)
- Compare (side-by-side)
- Future: financial intelligence features (Phase 3)

**Conversion triggers:**
- AttentionSummary shows flag count in preview ("2 items need attention") but individual warning cards are gated — user sees *that* flags exist but can't read *what* they are
- Compare is the natural trigger (user has saved 3 free dossiers, wants to compare)
- Viewing checklist behind blurred preview (the "viewing is next Tuesday" FOMO)

### Technical Stack

- **Auth:** Supabase Auth (social login, magic link — zero password friction)
- **User state:** Supabase Postgres (saved dossiers, unlock counts, shortlist, comparison history)
- **Payments:** Stripe (subscription billing, webhook for status sync)
- **Migration:** localStorage data migrates to Supabase on account creation

### Soft Gate UX

```
User taps risk tile to expand (2nd+ time):
  → If not authenticated → Supabase social login / magic link (one tap)
  → If authenticated + unlocks_this_month < 3 → unlock, increment counter
  → If authenticated + unlocks_this_month >= 3 → show Stripe checkout for premium
```

First full dossier is completely ungated (per ui-principles.md Section 13: "Let users search and view at least one full neighborhood dossier before asking them to create an account").

---

## Phase 3: Financial Intelligence (Behind Premium Paywall)

### 3A. Closing Cost Estimator

**Inputs (user-entered):** Property asking price, buyer age, first-time buyer status

**Output:** Estimated total closing costs breakdown:

| Item | Estimate Range | Notes |
|---|---|---|
| Transfer tax (overdrachtsbelasting) | 0% or 2% of price | 0% if first-time buyer under 35 AND price <= EUR 510,000 (2026 limit) |
| Notary: deed of transfer | EUR 800-1,200 | Scales slightly with price |
| Notary: mortgage deed | EUR 700-1,100 | Scales slightly with mortgage amount |
| Valuation report (taxatierapport) | EUR 500-800 | Required for mortgage |
| Building inspection (bouwkundige keuring) | EUR 350-500 | Recommended, not required |
| Mortgage advisor (hypotheekadviseur) | EUR 1,500-3,000 | Some banks offer free advice |
| Sworn interpreter (if needed) | EUR 250-1,000 | Required if buyer doesn't speak Dutch sufficiently |
| **Estimated total additional costs** | **EUR [sum]** | |

**Implementation:** Pure frontend calculation — lookup table of fee ranges. No backend needed. Input: one text field for price + two toggles (first-time buyer, needs interpreter).

**Disclaimer:**
> "These are estimated ranges based on typical Dutch market rates. Actual costs vary by provider. Consult a mortgage advisor for precise figures."

### 3B. Energy Renovation Cost Estimate

**Inputs:** Current energy label (from Tier B EP-Online), construction year, building type (house/apartment), floor area (from BAG if available)

**Output:** "Estimated cost to reach Label A: EUR 15,000-30,000" with breakdown:
- Insulation (walls, floor, roof): EUR X-Y
- Windows (double/triple glazing): EUR X-Y
- Heat pump (hybrid or full): EUR X-Y
- Solar panels (optional): EUR X-Y
- Available subsidies (ISDE): estimated EUR X back

**Implementation:** Backend lookup table mapping (current_label, building_type, era) → cost ranges. Based on Milieu Centraal / RVO published renovation cost data.

### 3C. Street-Level Sale Price History (Future — requires Kadaster data)

**Data source:** Kadaster BRK — historical sale prices. EUR 3.50 per lookup.

**Output:** "Recent sales near this address" — 5 most recent sales in the same 4-digit postcode. Shows: address, asking price (if available from Funda scraping — legally complex), sale price, date, overbid percentage.

**Architecture:** Requires Supabase Postgres to cache Kadaster lookups (shared across users for same postcode). Revenue must exceed Kadaster data costs.

**Deferred:** Design the API contract now, build when premium subscriber count justifies Kadaster costs.

---

## Architecture: Phase 1 Implementation

### New Backend Services

| File | Purpose | External API |
|---|---|---|
| `backend/app/services/foundation_risk.py` | Soil type lookup + subsidence + classification | PDOK BRO WFS |
| `backend/app/services/property_warnings.py` | Aggregates foundation + erfpacht + VvE + asbestos | Calls foundation_risk.py, uses BAG data |

### New Backend Models

| File | Models |
|---|---|
| `backend/app/models/property_warnings.py` | `FoundationRisk`, `ErfpachtWarning`, `VvEInfo`, `AsbestosWarning`, `PropertyWarnings`, `AttentionSummary` |

### New Backend Endpoint

`GET /api/address/{vbo_id}/property-warnings?rd_x=...&rd_y=...&lat=...&lng=...&construction_year=...&municipality=...`

Returns:
```json
{
  "attention_summary": {
    "flag_count": 2,
    "flags": [
      {"category": "noise", "severity": "elevated", "label": "Elevated noise risk"},
      {"category": "foundation", "severity": "high", "label": "High foundation risk"}
    ],
    "risk_categories_assessed": 4,
    "risk_categories_total": 4
  },
  "foundation_risk": {
    "level": "high",
    "construction_year": 1952,
    "soil_type": "klei",
    "subsidence_rate_mm_per_year": 3.2,
    "messages": []
  },
  "erfpacht": {
    "detected": true,
    "confidence": "municipality_based",
    "municipality": "Amsterdam",
    "messages": []
  },
  "vve": {
    "is_apartment": true,
    "messages": []
  },
  "asbestos": {
    "flagged": true,
    "construction_year": 1952,
    "messages": []
  }
}
```

Cache key: `property_warnings:{vbo_id}:{rd_x:.0f}:{rd_y:.0f}`. TTL: 7 days.

### New Frontend Components

| File | Purpose | Location in dossier |
|---|---|---|
| `frontend/src/components/AttentionSummary.tsx` | Synthesis badge at top of dossier | Above risk tiles, replaces position of current SummaryStrip |
| `frontend/src/components/AttentionSummary.css` | Styles for attention summary | |
| `frontend/src/components/PropertyWarningsCard.tsx` | Container for all property warning cards | Below risk tiles, above neighborhood stats |
| `frontend/src/components/PropertyWarningsCard.css` | Styles for property warnings section | |

### Data Flow

```
handleAddressSelect():
  1. setActiveScreen('dossier')
  2. setSheetSnap('peek')
  3. resolved = await lookupAddress(suggestion.id)
  4. setAddress(resolved)
  5. setSheetSnap('half')
  6. Fire parallel IIFEs:
     ├── Existing: risks, stats, tier-b, building3d, neighborhood3d
     └── NEW: void (async () => {
           const warnings = await getPropertyWarnings(
             vboId, rdX, rdY, lat, lng,
             constructionYear, municipality
           );
           setPropertyWarnings(warnings);
         })()
```

### Dossier Layout (Top to Bottom)

```
DossierSheet:
  ├── AttentionSummary (NEW — synthesis badge)
  ├── AddressHeader + bookmark
  ├── SummaryStrip (individual risk score pills)
  ├── BuildingFactsCard (with erfpacht badge + asbestos flag inline)
  ├── RiskTilesGrid (2x2: noise, air, climate, sunlight)
  ├── PropertyWarningsCard (NEW — foundation + VvE cards)
  ├── 3D Viewer (NeighborhoodViewer3D)
  ├── NeighborhoodStatsCard
  ├── TierBSignalsCard
  ├── ViewingChecklist
  └── ActionBar (PDF export, share)
```

### i18n Keys (New — ~50 keys per language)

```
warnings.attention.no_flags
warnings.attention.items_attention (with count interpolation)
warnings.attention.based_on (with count interpolation)
warnings.attention.unavailable_categories
warnings.foundation.title
warnings.foundation.high_description
warnings.foundation.medium_description
warnings.foundation.low_description
warnings.foundation.unavailable_description
warnings.foundation.question_1 through question_4
warnings.foundation.source
warnings.foundation.disclaimer
warnings.erfpacht.title
warnings.erfpacht.confirmed_description
warnings.erfpacht.likely_description
warnings.erfpacht.question_1 through question_5
warnings.erfpacht.source
warnings.erfpacht.disclaimer
warnings.vve.title
warnings.vve.description
warnings.vve.question_1 through question_6
warnings.vve.source
warnings.asbestos.title
warnings.asbestos.description
warnings.asbestos.question_1 through question_4
warnings.asbestos.source
warnings.asbestos.disclaimer
```

### Test Plan

| Test file | Tests (minimum) | What it covers |
|---|---|---|
| `backend/tests/test_foundation_risk.py` | 10 | Soil classification thresholds, construction year logic, subsidence integration, unavailable data handling |
| `backend/tests/test_property_warnings.py` | 12 | Aggregation of all warnings, attention summary flag counting, data completeness, erfpacht municipality detection, VvE apartment detection, asbestos year threshold |
| `frontend/src/components/AttentionSummary.test.tsx` | 8 | Green/amber/red states, flag count display, data completeness message, disclaimer, i18n EN/NL |
| `frontend/src/components/PropertyWarningsCard.test.tsx` | 10 | Foundation card rendering per severity, erfpacht card with both confidence levels, VvE card for apartments, asbestos card for pre-1994, no cards for no-warnings case |
| `frontend/src/services/api.test.ts` (additions) | 3 | New `getPropertyWarnings()` function tests |
| **Total new tests** | **~43** | |

### Quality Gates (Phase 1)

- [ ] All existing backend tests pass (baseline: 321+)
- [ ] All existing frontend tests pass (baseline: 338+)
- [ ] New test count: +43 minimum
- [ ] `ruff check` clean
- [ ] `npm run build` clean
- [ ] en.json and nl.json key counts match
- [ ] Every warning card follows 4-part hierarchy
- [ ] Every warning has a disclaimer
- [ ] Data completeness is shown in attention summary
- [ ] Foundation risk correctly classifies all 7 rows of the logic table
- [ ] Erfpacht correctly flags all `ERFPACHT_MUNICIPALITIES` (Amsterdam, Den Haag, Rotterdam, Utrecht, Leiden, Zaanstad, Amstelveen, Haarlem)
- [ ] VvE card only appears for multi-unit buildings
- [ ] Asbestos card only appears for construction year < 1994
- [ ] PDOK BRO WFS endpoint researched and validated before implementation

---

## Dependencies and Risks

### API Research Required Before Implementation

1. **PDOK BRO WFS:** Endpoint URL, layer name for soil type, response schema, coordinate system. Must be researched before building `foundation_risk.py`.

2. **Erfpacht from BAG/BRK:** Whether eigendomsstatus or erfpacht fields are exposed via PDOK WFS. If not, fall back to municipality-based detection only.

3. **Klimaateffectatlas subsidence:** Whether the existing climate risk endpoint returns subsidence data, or if a separate layer/query is needed.

### No New Frontend Dependencies

All Phase 1 features use existing React + CSS tokens + i18n infrastructure. No new npm packages. Framer Motion (already installed for mobile UI premium) can be used for reveal animations.

### No Backend Dependencies Added

PDOK BRO WFS uses the same httpx + PDOK pattern as existing BAG/CBS/Klimaateffectatlas integrations. No new Python packages required.
