# PRD: Buurt Check Match-First UI Revamp

**Product:** Buurt Check
**Document:** Product Requirements Document
**Version:** v2.2 - Match-first UI revamp with BAG semantic footprint metadata
**Date:** 22 May 2026
**Owner:** Milos GIS / Buurt Check
**Primary market:** Netherlands
**Primary languages:** Dutch and English
**Core decision:** The app starts with neighborhood matching. Address search becomes a downstream action after users discover a matching neighborhood and select a house.

---

## 1. Executive summary

Buurt Check currently contains two competing entry points: a search interface and a match interface. This creates cognitive friction because users are asked to choose a mode before they understand the value of the product.

The redesigned Buurt Check should become a **match-first, map-first, guided neighborhood discovery experience**.

The new flow begins with a simple, emotionally clear landing screen. The user sees a beautiful animated 2D or 3D neighborhood map as the background, one short promise, and one primary CTA:

> **Find my dream neighborhood**
> **Vind mijn droombuurt**

When the user clicks the CTA, the app opens a smooth guided intake. The core intake remains one-question-at-a-time so the experience stays calm and reliable: one question, one set of choices, one progress indicator, one back button. The intake also supports an optional conversational preference step where users can describe needs that fixed questions did not cover, such as proximity to the beach, a preferred type of amenity, or another personal context.

The conversational step is not a free-form scorer. If an LLM is used, it may only extract user-stated needs into a strict structured schema, ask bounded follow-up questions for missing required fields, and label unsupported or sensitive preferences. The backend then validates those extracted preferences against a typed preference registry, turns supported items into hard filters, weights, map-context overlays, or saved unsupported signals, and only then triggers matching after the user confirms the review screen.

After the final review, the user triggers a matching phase. The backend turns the confirmed answers and supported custom preferences into a structured preference vector, compares it with neighborhood data, runs deterministic scoring unless validated labels exist, computes fit scores, and returns ranked neighborhood recommendations.

While the backend works, the frontend shows a friendly animated progress screen. Once matching is complete, the app confirms success with a large animated Buurt Check checkmark, then opens the results map.

The results map starts centered on the Netherlands. Recommended neighborhoods are shown as map markers and as a clean ranked list. Users can zoom manually or click a recommendation to fly into a neighborhood. At neighborhood level, the map shows the selected neighborhood, relevant amenities, and all available 2D BAG `pand` footprints inside that selected neighborhood or inside the current selected-neighborhood viewport as it progressively loads. It must not silently show only a representative sample. A `pand` becomes a house candidate only through linked `verblijfsobject` use-purpose metadata, especially `gebruiksdoel` containing `woonfunctie`. Clicking a selectable house candidate starts the existing address-level search flow and opens the current Dossier interface.

The final product should feel like this:

> “Tell us how you want to live, in quick choices or your own words. We’ll show you where to look. Then you can check the exact house.”

---

## 2. Product positioning

### 2.1 One-line product definition

**Buurt Check helps people discover where they should live before they inspect the house.**

Dutch:

**Buurt Check helpt mensen ontdekken waar ze het beste kunnen wonen voordat ze een woning controleren.**

### 2.2 Core promise

The product should not start with a blank address field. It should start with the user’s life.

The redesigned product answers:

- Where should I search?
- Which neighborhoods match the way I want to live?
- Which tradeoffs should I understand before I fall in love with a house?
- What does this specific house look like in its real neighborhood context?

### 2.3 Strategic product decision

The old split between **Search** and **Match** should disappear from the first screen.

The app should have one primary journey:

1. Match me with neighborhoods.
2. Show me those neighborhoods on a beautiful interactive map.
3. Let me inspect houses inside those neighborhoods.
4. Open the existing Dossier flow for the selected house.
5. Let me return to the map at any time.

Address search can remain available, but it should no longer compete with matching as the main user journey. It may exist as:

- a secondary link in the footer,
- a small “Already have an address?” option after onboarding,
- or a route for returning users.

It should not be visually equal to the match CTA on the landing screen.

---

## 3. Goals and non-goals

### 3.1 Goals

1. Replace the confusing search/match split with one clear match-first journey.
2. Make the first screen emotionally compelling, visually distinctive, and extremely simple.
3. Capture core user preferences through a smooth one-question-at-a-time guided intake.
4. Capture user-stated preferences that fixed questions do not cover through an optional structured conversational intake.
5. Convert confirmed guided and conversational inputs into a structured preference vector.
6. Trigger backend model fitting or scoring after the user confirms the review screen.
7. Show clear animated progress while the backend computes recommendations.
8. Present recommended neighborhoods on an interactive map of the Netherlands.
9. Allow users to zoom into neighborhoods manually or through list interaction.
10. Show all available selected-neighborhood 2D BAG `pand` footprints and important amenities, loaded progressively when needed, while visually prioritizing footprints whose linked verblijfsobject usage includes `woonfunctie`.
11. Let users click a house and continue into the existing Dossier interface.
12. Keep an obvious route back from Dossier to the recommendation map.
13. Support bilingual UI text in Dutch and English from day one.
14. Keep the UI minimal, calm, and focused at every stage.

### 3.2 Non-goals

1. Do not build a full listing marketplace in this revamp.
2. Do not replace the existing Dossier interface unless required for routing and navigation consistency.
3. Do not show all app features on the landing page.
4. Do not expose the model, data tables, or algorithmic complexity to the user during onboarding.
5. Do not show multiple questions on the same screen.
6. Do not make the user choose between “Search” and “Match” on the first screen.
7. Do not present the model output as objective truth. It is a recommendation based on stated preferences and available data.
8. Do not make unsupported claims about safety, happiness, future value, or perfect fit.
9. Do not let an LLM directly score, rank, exclude, or invent neighborhood recommendations.
10. Do not infer protected traits, religious identity, ethnicity, nationality, income class identity, or other sensitive demographic attributes from free text.
11. Do not store or analyze free-text preference content in analytics; store stable extracted keys, classifications, and privacy-safe status codes only.

---

## 4. Target users

### 4.1 Primary user

A home seeker in the Netherlands who wants to buy or rent but does not know exactly where to search.

They may know their budget, preferred lifestyle, commute constraints, and important needs, but they cannot translate those preferences into concrete neighborhoods.

### 4.2 Secondary users

- People relocating within the Netherlands.
- International newcomers who do not understand Dutch neighborhood context.
- Families comparing areas before buying.
- Singles or couples with flexible geography.
- Urban residents considering smaller towns or villages.
- Users who already found a house but want to inspect the neighborhood after discovering it in the map flow.

---

## 5. UX principles

### 5.1 One decision per screen

Every screen should ask for only one mental action.

Bad:

> Search bar, match button, report upsell, map, examples, explanation, newsletter, pricing, and feature cards on the same screen.

Good:

> One promise. One button. One next step.

### 5.2 The map is the atmosphere first, the tool second

The hero map is not a dashboard. It is a visual mood-setter. It should make users feel that Buurt Check understands place, neighborhood, streets, houses, and daily life.

The interactive map becomes a tool only after the model has produced results.

### 5.3 Smooth, not flashy

Animations should be calm, useful, and non-intrusive. They should help users understand that they are moving through a guided flow, not watching a marketing effect.

Recommended animation style:

- soft fade,
- gentle slide,
- map drift,
- light zoom,
- progress motion,
- animated checkmark at completion.

Avoid:

- aggressive parallax,
- spinning 3D effects,
- excessive popups,
- gamified confetti,
- motion that makes text difficult to read.

### 5.4 Minimal text, but not empty meaning

The interface should contain very little copy. The copy must be clear, warm, and useful.

The tone should be direct and human:

> “Tell us how you want to live. We’ll show you where to look.”

Not generic SaaS language:

> “Leverage AI-powered geospatial intelligence to optimize your housing discovery journey.”

### 5.5 Bilingual from the beginning

The product must support Dutch and English UI strings through a proper translation system. Hard-coded text is not acceptable.

### 5.6 Trust without visual clutter

Trust indicators should exist, but they should not pollute the survey. Source labels, confidence, and evidence belong in recommendation detail states and the Dossier, not on every onboarding screen.

### 5.7 The user can always go back

At every stage after the CTA, users must be able to go back without losing progress.

This is especially important for the survey. Preferences are personal, and users will change their mind.

---

## 6. Information architecture

### 6.1 New primary route structure

Recommended route structure:

```text
/                         Landing / hero / match-first entry
/match                    Survey shell
/match/:sessionId         Active guided-intake session
/match/:sessionId/run     Matching progress screen
/match/:sessionId/results Results map
/match/:sessionId/neighborhood/:id Neighborhood map detail
/dossier/:addressId       Existing address-level Dossier
```

Alternative if the current app already has an app shell:

```text
/app                      Redirects to match-first landing or dashboard
/app/match                Primary match journey
/app/results/:sessionId   Results map
/app/dossier/:addressId   Existing Dossier
```

### 6.2 Search route treatment

The current search route should remain technically available but visually demoted.

Acceptable options:

```text
/search                   Existing address search, secondary route
```

Landing-page treatment:

- Primary CTA: “Find my dream neighborhood” / “Vind mijn droombuurt”
- Small secondary text link: “Already have an address?” / “Heb je al een adres?”

The secondary link should not look like a competing button.

---

## 7. End-to-end user flow

### Phase 0 — Landing hero

The user arrives on the app.

The screen shows:

- full-screen or near-full-screen animated map background,
- short headline,
- short subheadline,
- one primary CTA,
- optional small secondary address link,
- language switcher.

The screen does not show:

- search form,
- match form,
- feature grid,
- report cards,
- long explanation,
- data source list,
- pricing block.

### Phase 1 — Survey intro

After the CTA click, the hero transitions into the survey intro.

The screen explains, briefly, why questions are needed.

English:

> **First, we need to understand how you want to live.**
> A few quick choices help us match you with neighborhoods that fit your life, not just your budget.

Dutch:

> **Eerst willen we begrijpen hoe je wilt wonen.**
> Met een paar snelle keuzes vinden we buurten die passen bij je leven, niet alleen bij je budget.

CTA:

- EN: **Start the match**
- NL: **Start de match**

### Phase 2 — Guided intake

The guided intake begins.

Rules:

- Only one question visible at a time.
- Choices are large, touch-friendly, and easy to scan.
- Progress bar is always visible.
- Back button is always visible after question 1.
- The answer is saved immediately when selected, but the user can modify it.
- The next question opens with a smooth transition.
- The screen must not contain sidebars, tips, charts, or unrelated content.
- An optional “anything else that matters?” step may let users answer in their own words, but it is still one focused prompt, not a general chat surface.
- If the user enters free text, the system must extract only user-stated preferences into stable keys and show the extracted interpretation on the review screen.

### Phase 3 — Review and run model

After the final guided or conversational preference step, show a simple review screen.

This is the only screen where a short summary may appear.
It must include any extracted custom preferences, clearly labeled by how the
system will use them:

- **Used in score**: supported by a known feature or distance metric.
- **Shown as map context**: useful for exploration but not used to rank.
- **Saved for future support**: understood but not scoreable with current data.
- **Not used**: disallowed, sensitive, unsupported, or too ambiguous.

English:

> **Ready to find your best neighborhoods?**
> We’ll compare your preferences with neighborhood data and build your personal match map.

Dutch:

> **Klaar om je beste buurten te vinden?**
> We vergelijken je voorkeuren met buurtdata en maken je persoonlijke matchkaart.

CTA:

- EN: **Show my matches**
- NL: **Toon mijn matches**

### Phase 4 — Matching progress

The backend job starts.

The user sees an animated, friendly progress screen.

The screen should include:

- animated map or soft geometric map lines,
- progress indicator,
- short rotating status messages,
- no technical logs,
- no raw model names,
- no fake precision.

Example messages:

| State | English | Dutch |
|---|---|---|
| Reading preferences | Reading your living preferences | Je woonwensen lezen |
| Building profile | Building your neighborhood profile | Je buurtprofiel maken |
| Comparing neighborhoods | Comparing neighborhoods across the Netherlands | Buurten in Nederland vergelijken |
| Checking tradeoffs | Checking budget, commute, and daily-life tradeoffs | Budget, reistijd en dagelijkse afwegingen controleren |
| Preparing results | Preparing your match map | Je matchkaart voorbereiden |

### Phase 5 — Successful completion

When matching is complete, show a large animated checkmark that clearly corresponds to the Buurt Check brand.

English:

> **Your neighborhood matches are ready.**

Dutch:

> **Je buurtmatches zijn klaar.**

Then automatically transition to results after a short delay, or let the user click:

- EN: **Open my map**
- NL: **Open mijn kaart**

### Phase 6 — Results map

The results view opens centered on the Netherlands.

The screen shows:

- map of the Netherlands,
- ranked list of recommended neighborhoods,
- markers or highlighted areas on the map,
- match score or fit label,
- short reason for each neighborhood,
- ability to zoom manually,
- ability to click a list item and fly to the neighborhood,
- ability to click a marker and highlight the same list item.

The results map is the first moment where the interface becomes exploratory.

### Phase 7 — Neighborhood detail map

When a user selects a neighborhood, the map zooms into it.

The neighborhood detail state shows:

- only the selected neighborhood highlighted,
- 2D house/building footprints inside the selected neighborhood,
- all returned no-paid amenity point markers inside the selected neighborhood, using a distinct
  restrained marker shape and a dedicated emoji per amenity type,
- a right-side relevant-amenities legend that uses the same marker shape and
  dedicated emoji identity and doubles as the amenity filter controls,
- short neighborhood fit explanation,
- button to inspect individual houses,
- button to return to the Netherlands results view.

The map must not show building footprints across the whole country. That would be visually noisy and technically heavy. Building footprints should render as 2D shapes on the 2D basemap and load only for the selected neighborhood or the current selected-neighborhood viewport when zoomed in enough.

For BAG data, the rendered footprint object is a `pand`. It is not a "building type" by itself. Semantic use comes from linked `verblijfsobject` records through `gebruiksdoel`. The detail map should prioritize clickable house candidates where `gebruiksdoel` contains `woonfunctie`, including mixed-use pands such as `winkelfunctie,woonfunctie`. Pands with `aantal_verblijfsobjecten = 0`, only non-residential purposes, or only `overige gebruiksfunctie` remain valid footprints and should stay visible, but should be deferred or greyed out instead of treated as immediately clickable houses unless a reliable address path exists.

The intended UX is not a representative sample. If source data exists, the selected-neighborhood detail should eventually show every available footprint inside the selected neighborhood boundary, either from a complete selected-neighborhood response or through progressive viewport/page loading as the user pans and zooms. If only part of the neighborhood is loaded, the UI must say so honestly, such as "Loading more buildings" or "Showing buildings in the visible area." If footprint data is unavailable, use the missing-footprint fallback instead of fake or seed-only buildings.

### Phase 8 — House selection and Dossier

The user clicks a house.

The app opens the existing Dossier interface for that address or parcel.

The Dossier should preserve the match context:

- selected neighborhood,
- session ID,
- back-to-map route,
- current filters or preferences.

The Dossier must include a persistent navigation option:

- EN: **Back to match map**
- NL: **Terug naar matchkaart**

This is critical. Users must be able to inspect a house, return to the neighborhood map, and choose another house or neighborhood without restarting.

---

## 8. Detailed functional requirements

### 8.1 Landing hero

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-L1 | Display a full-screen or near-full-screen animated map hero. | P0 | Hero loads on first visit and remains readable on desktop and mobile. |
| FR-L2 | Provide one dominant CTA for neighborhood matching. | P0 | CTA is visually dominant and starts the match flow. |
| FR-L3 | Demote address search to a small secondary link. | P0 | Search is not presented as an equal card or equal CTA. |
| FR-L4 | Support Dutch/English language switcher. | P0 | Language can be changed before starting the survey. |
| FR-L5 | Provide reduced-motion fallback. | P0 | Users with reduced-motion preferences see a static map or very subtle background. |
| FR-L6 | Provide low-bandwidth fallback. | P1 | If animation fails, static hero still renders with CTA. |

### 8.2 Survey shell

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-S1 | Show only one guided intake prompt at a time. | P0 | No screen contains multiple survey questions or multiple conversational prompts. |
| FR-S2 | Show progress bar throughout survey. | P0 | User sees current step and remaining progress. |
| FR-S3 | Provide back button after first question. | P0 | User can return to any previous question and change answer. |
| FR-S4 | Save answers after every step. | P0 | Refreshing page does not lose completed answers within active session. |
| FR-S5 | Validate required answers before advancing. | P0 | User cannot proceed without required selection. |
| FR-S6 | Support single-select, multi-select, range, and optional address/anchor input questions. | P0 | Components work consistently in Dutch and English. |
| FR-S7 | Keep survey visually minimal. | P0 | No unrelated cards, explanations, maps, or metrics appear during questions. |
| FR-S8 | Provide an optional free-text preference prompt. | P1 | User can state additional needs not covered by fixed questions without opening an unbounded chat assistant. |
| FR-S9 | Extract custom preferences into stable typed keys. | P0 if free text is enabled | Free-text content is converted to structured keys, statuses, weights where applicable, localized labels, and reason codes before matching. |
| FR-S10 | Require user review of extracted custom preferences before matching. | P0 if free text is enabled | Matching cannot start until the review screen shows how each extracted preference will be used and the user confirms. |

### 8.3 Survey content

The MVP guided intake should contain 10–12 core questions plus, if enabled, one optional custom-preference prompt. It must be short enough to complete, but detailed enough to produce meaningful matches.

Recommended question set:

| Step | Question purpose | Input type | Required |
|---:|---|---|---|
| 1 | Buy, rent, or both | Single select | Yes |
| 2 | Budget | Range or preset chips | Yes |
| 3 | Household type | Single select | Yes |
| 4 | Preferred anchor location | City/address input | Yes |
| 5 | Commute or travel tolerance | Slider / presets | Yes |
| 6 | Lifestyle priority | Multi-select top 3 | Yes |
| 7 | Must-haves | Multi-select | Yes |
| 8 | Dealbreakers | Multi-select | Optional but recommended |
| 9 | Housing type | Multi-select | Yes |
| 10 | Area character | Single select | Yes |
| 11 | Language/report preference | Single select | Yes if not already chosen |
| 12 | Additional preferences | Optional free text / structured extraction | Optional |
| 13 | Review | Summary + run CTA | Yes |

The additional-preferences step should use plain prompts such as:

English:

> **Anything else that matters?**
> Tell us about preferences the questions did not cover, like being close to the coast, a specific amenity, or a type of daily-life environment.

Dutch:

> **Is er nog iets anders belangrijk?**
> Vertel ons over wensen die niet in de vragen stonden, zoals dichtbij de kust wonen, een specifieke voorziening, of een bepaald dagelijks leefgevoel.

The step may be skipped. If used, it must not ask users to disclose protected
traits or sensitive identity. If the user voluntarily mentions a sensitive
context, the system must handle it as described in Section 8.4.1 and Section
19.3.

### 8.4 Preference vector creation

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-P1 | Convert survey answers into a structured preference vector. | P0 | Backend stores weights, hard filters, soft preferences, and exclusions. |
| FR-P2 | Separate hard constraints from preferences. | P0 | Budget, travel radius, buy/rent intent, and required anchors can be treated as filters. |
| FR-P3 | Normalize preference weights. | P0 | User priorities become comparable model inputs. |
| FR-P4 | Preserve raw answers. | P0 | Raw survey answers remain available for explanation and debugging. |
| FR-P5 | Support bilingual labels independent of stored values. | P0 | Backend stores stable keys, not translated strings. |
| FR-P6 | Classify custom preferences through a typed preference registry. | P0 if free text is enabled | Every custom preference is classified as scoreable, map-context-only, saved-unsupported, disallowed, or needs-clarification. |
| FR-P7 | Keep LLM extraction separate from matching truth. | P0 if LLM extraction is enabled | LLM output may propose structured preference keys but cannot create scores, eligibility, confidence, reason-code truth, or source metadata. |

### 8.4.1 Custom preference registry

The preference registry is the controlled vocabulary that determines whether an
extracted user preference can affect matching.

Registry fields:

| Field | Meaning |
|---|---|
| `normalized_key` | Stable language-independent key, such as `coast_or_beach_proximity`. |
| `category` | Preference family, such as `geography`, `amenity`, `mobility`, `environment`, or `housing`. |
| `use_status` | One of `scoreable`, `map_context_only`, `saved_unsupported`, `disallowed`, or `needs_clarification`. |
| `feature_key` | Backend feature or distance metric used when `scoreable`. |
| `default_weight` | Bounded score influence when user has not specified importance. |
| `source_requirement` | Required source type and freshness rules. |
| `privacy_class` | `standard`, `sensitive_context`, or `protected_trait_risk`. |
| `explanation_key` | Translation key explaining how this preference is used. |

Examples:

| User phrase | Normalized key | Status | Allowed use |
|---|---|---|---|
| “close to the beach” | `coast_or_beach_proximity` | `scoreable` when coastline/beach-distance data exists | Add a bounded geography score component and show source limitations. |
| “near a church/mosque/synagogue/temple” | `place_of_worship_proximity` | `map_context_only` unless a neutral amenity-distance feature is explicitly supported | Show nearby places of worship as user-requested amenity context; do not infer religion or rank by religious identity. |
| “where people like me live” | none | `disallowed` | Do not infer or score demographic identity. Ask for concrete non-sensitive needs instead. |
| “very safe area” | none or `safety_claim_requested` | `needs_clarification` or `disallowed` for unsupported certainty | Ask for observable proxies or show limitations; do not promise safety. |

If a preference is `map_context_only`, it may affect default overlays or detail
panels but must not affect rank unless it later becomes a validated scoreable
registry entry.

Example preference vector:

```json
{
  "session_id": "match_123",
  "language": "en",
  "intent": "buy",
  "budget_min": 450000,
  "budget_max": 625000,
  "household_type": "family_young_child",
  "anchor_locations": [
    {"type": "work", "label": "Amsterdam Zuid", "lat": 52.338, "lon": 4.872}
  ],
  "max_commute_minutes": 45,
  "hard_filters": {
    "intent": "buy",
    "budget_required": true,
    "commute_required": true
  },
  "weights": {
    "green_access": 0.20,
    "calmness": 0.18,
    "schools_childcare": 0.18,
    "public_transport": 0.14,
    "affordability": 0.14,
    "amenities": 0.10,
    "environmental_quality": 0.06
  },
  "avoid": ["high_noise", "busy_nightlife", "low_listing_supply"],
  "housing_preferences": ["row_house", "family_house", "garden"],
  "custom_preferences": [
    {
      "raw_user_phrase_ref": "extra_preferences:0",
      "normalized_key": "coast_or_beach_proximity",
      "use_status": "scoreable",
      "weight": 0.12,
      "feature_key": "coast_distance",
      "privacy_class": "standard"
    },
    {
      "raw_user_phrase_ref": "extra_preferences:1",
      "normalized_key": "place_of_worship_proximity",
      "use_status": "map_context_only",
      "weight": 0,
      "feature_key": null,
      "privacy_class": "sensitive_context"
    }
  ]
}
```

### 8.5 Matching backend

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-M1 | Trigger matching only after the final review CTA. | P0 | Model run does not start before user confirms reviewed guided and extracted preferences. |
| FR-M2 | Start an asynchronous backend job. | P0 | User receives a job/session ID and progress state. |
| FR-M3 | Compare user preference vector to neighborhood feature matrix. | P0 | Every candidate neighborhood receives eligibility, score, and reason codes. |
| FR-M4 | Return ranked neighborhood recommendations. | P0 | Results include top matches, fit scores, reasons, tradeoffs, confidence, and geometry IDs; predictive probabilities appear only if validated labels and evaluation evidence exist. |
| FR-M5 | Exclude neighborhoods that fail hard constraints unless shown as stretch/near-miss. | P0 | Hard filter failures are not presented as normal top matches. |
| FR-M6 | Store model run metadata. | P0 | Result includes model version, data version, runtime, and evaluation status. |
| FR-M7 | Handle model failure gracefully. | P0 | User sees fallback message and deterministic score results if predictive model fails. |

### 8.6 Model selection requirement

The requested backend should fit multiple models and choose the one with the highest predictive power. This is only statistically valid if the system has a target variable or validation data.

Therefore the PRD requires two operating modes.

LLMs are not a third scoring mode. They may support intake and explanation only
under strict boundaries:

- extract structured preferences from user-provided text,
- ask bounded follow-up questions for missing or ambiguous fields,
- classify unsupported or sensitive preferences through stable registry keys,
- explain already-computed structured recommendations.

LLMs must not:

- create or modify match scores,
- create or modify eligibility,
- create or modify confidence,
- create or modify hard-filter outcomes,
- invent source metadata,
- infer protected traits or identity,
- claim a neighborhood is objectively best.

#### Mode A — MVP without enough historical labels

Use a deterministic or semi-deterministic weighted scoring engine.

Allowed methods:

- weighted normalized utility score,
- constraint filtering,
- similarity matching,
- confidence scoring based on data completeness,
- transparent reason-code generation.

In this mode, do not claim “highest predictive power.” Instead, say:

> “We are comparing your preferences with neighborhood data.”

#### Mode B — Predictive mode with labels

Use model selection only when there is sufficient training or validation data.

Acceptable labels:

- user saved neighborhood,
- user liked/disliked recommendation,
- user clicked a neighborhood,
- user clicked a house after selecting a neighborhood,
- user returned to a neighborhood,
- manually curated expert labels,
- historical conversion data if available.

Candidate models:

- weighted utility baseline,
- logistic regression with calibrated probabilities,
- random forest,
- gradient boosting,
- k-nearest-neighbor similarity model,
- learning-to-rank model when enough data exists.

Evaluation metrics:

- NDCG@10 for ranked recommendations,
- MAP@10 for saved/liked neighborhoods,
- ROC-AUC if binary labels exist,
- calibration error if probabilities are shown,
- stability checks across repeated runs.

Required rule:

> The app may only claim that the model with the highest predictive power was selected when predictive performance was measured against real validation labels or a documented evaluation dataset.

This is not optional. Without labels, the app can still produce useful recommendations, but they should be presented as data-backed fit scores, not validated predictive probabilities.

### 8.7 Matching output schema

Recommended output:

```json
{
  "session_id": "match_123",
  "status": "completed",
  "model_mode": "weighted_scoring",
  "model_version": "match-engine-0.1.0",
  "data_version": "neighborhood-features-2026-05-01",
  "results": [
    {
      "neighborhood_id": "BU03630102",
      "name": "Examplebuurt",
      "municipality": "Exampledam",
      "rank": 1,
      "fit_score": 0.89,
      "fit_label": "Very strong match",
      "probability": null,
      "confidence": "medium_high",
      "reason_codes": [
        "green_access_high",
        "commute_feasible",
        "family_amenities_strong",
        "budget_realistic"
      ],
      "tradeoffs": [
        "lower_current_supply",
        "prices_near_upper_budget"
      ],
      "geometry_ref": "neighborhood_geom_BU03630102",
      "map_center": {"lat": 52.1, "lon": 5.1},
      "bbox": [4.9, 52.0, 5.2, 52.2]
    }
  ],
  "near_misses": [],
  "stretch_matches": []
}
```

### 8.8 Results map

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-R1 | Show results on a map centered on the Netherlands. | P0 | Initial results view shows national context and all recommended neighborhoods. |
| FR-R2 | Show ranked neighborhood list beside or below map. | P0 | List and map stay synchronized. |
| FR-R3 | Allow list click to zoom to neighborhood. | P0 | Clicking a list item flies to selected neighborhood and highlights it. |
| FR-R4 | Allow map marker click to highlight list item. | P0 | Marker selection updates list state. |
| FR-R5 | Show concise fit reason per neighborhood. | P0 | Each item has max 1–2 short reason lines. |
| FR-R6 | Show detailed explanation only on expansion or detail view. | P1 | Default list remains visually clean. |
| FR-R7 | Support mobile map/list switching. | P0 | Mobile users can toggle Map and List without losing state. |

### 8.9 Neighborhood 2D building detail

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-N1 | Load all available selected-neighborhood 2D BAG `pand` footprints, progressively if needed. | P0 | Footprints are not rendered nationally, are not silently sampled as representative, match the 2D basemap, and preserve non-house pands as visible deferred footprints rather than deleting them. |
| FR-N2 | Highlight neighborhood boundary. | P0 | User clearly sees selected area. |
| FR-N3 | Show important amenities as minimal tags. | P0 | No more than 5–7 amenity categories visible by default. |
| FR-N4 | Allow selectable house-candidate click to open Dossier. | P0 | Clicking a selectable `pand` whose linked verblijfsobject usage contains `woonfunctie`, or another building with a reliable address path, routes to the existing Dossier. Non-residential-only and zero-verblijfsobject footprints are not arbitrary Dossier targets. |
| FR-N5 | Provide fallback for missing building footprints. | P0 | If footprints are unavailable, show the basemap/amenities and a localized message. |
| FR-N6 | Keep map performant. | P0 | Detail map loads within target performance budget, progressively pages dense footprints, and labels partial loading states. |

### 8.10 Dossier integration

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| FR-D1 | Reuse existing Dossier interface. | P0 | Existing address-level modules continue to work. |
| FR-D2 | Preserve match session context. | P0 | Dossier knows which match session and neighborhood led to the address. |
| FR-D3 | Add persistent back-to-map action. | P0 | User can return to selected neighborhood map from Dossier. |
| FR-D4 | Avoid forcing survey restart. | P0 | Returning to map preserves all results. |
| FR-D5 | Allow checking another house. | P0 | User can inspect multiple houses from the same or different matched neighborhoods. |

---

## 9. Survey UI specification

### 9.1 Screen layout

Each survey question screen contains:

1. small top progress bar,
2. back button where applicable,
3. question title,
4. optional one-line helper text,
5. large answer choices,
6. next button only where answer type requires explicit confirmation.

Do not include:

- charts,
- long copy,
- extra recommendation snippets,
- data source explanations,
- ads,
- feature cards,
- unrelated navigation.

### 9.2 Progress bar

Progress format options:

- “Question 3 of 11” / “Vraag 3 van 11”
- thin horizontal bar with percentage width,
- optional small label: “8 questions left” / “Nog 8 vragen”.

Recommended display:

```text
Vraag 3 van 11
[██████----------------]
```

On mobile, keep it compact.

### 9.3 Back behavior

Back button behavior:

- returns to previous question,
- keeps current answer state,
- allows user to change answer,
- recomputes downstream vector when the survey is submitted,
- does not trigger backend model run until final CTA.

### 9.4 Answer controls

Use large, readable controls:

- cards for single select,
- chips for multi-select,
- sliders for travel time and budget where useful,
- address autocomplete for anchors,
- simple text only when necessary.

Avoid long forms.

### 9.5 Visual tone

The survey should feel like a calm conversation, not a government intake form.

Use soft surfaces, large spacing, and clear typography.

### 9.6 Optional conversational preference step

If enabled, the additional-preferences step should feel like a single calm
question, not an AI chat product. It should contain:

1. one prompt,
2. one text area or speech-to-text equivalent if speech is later supported,
3. optional example chips for non-sensitive examples,
4. a clear skip action,
5. a localized privacy note,
6. a reviewable extracted-preferences summary on the review screen.

Do not include:

- a persistent chat transcript,
- AI personality messages,
- generated neighborhood suggestions before backend matching,
- demographic or identity prompts,
- model claims such as “I know the perfect neighborhood for you.”

If extraction confidence is low, the system should ask one bounded follow-up or
mark the item `needs_clarification`. It should not silently convert ambiguous
text into a scoring signal.

---

## 10. Recommended bilingual survey copy

### 10.1 Landing

| Element | English | Dutch |
|---|---|---|
| Headline | Find your dream neighborhood. | Vind je droombuurt. |
| Subheadline | Tell us how you want to live. We’ll show you where to look. | Vertel ons hoe je wilt wonen. Wij laten zien waar je moet zoeken. |
| Primary CTA | Find my dream neighborhood | Vind mijn droombuurt |
| Secondary link | Already have an address? | Heb je al een adres? |

### 10.2 Survey intro

| Element | English | Dutch |
|---|---|---|
| Title | First, we need to understand how you want to live. | Eerst willen we begrijpen hoe je wilt wonen. |
| Body | A few quick choices help us match you with neighborhoods that fit your life, not just your budget. | Met een paar snelle keuzes vinden we buurten die passen bij je leven, niet alleen bij je budget. |
| CTA | Start the match | Start de match |

### 10.3 Questions

| Step | English question | Dutch question |
|---:|---|---|
| 1 | Are you looking to buy, rent, or both? | Wil je kopen, huren of allebei? |
| 2 | What is your realistic budget? | Wat is je realistische budget? |
| 3 | Who are you moving with? | Met wie verhuis je? |
| 4 | Where do you need to stay connected to? | Waar wil je goed mee verbonden blijven? |
| 5 | What is your maximum comfortable travel time? | Wat is je maximale comfortabele reistijd? |
| 6 | What matters most in daily life? | Wat telt het meest in je dagelijks leven? |
| 7 | What are your must-haves? | Wat zijn je must-haves? |
| 8 | What would you rather avoid? | Wat wil je liever vermijden? |
| 9 | What kind of home are you hoping for? | Wat voor woning zoek je? |
| 10 | What kind of area feels right? | Wat voor omgeving voelt goed? |
| 11 | How should we explain your results? | Hoe moeten we je resultaten uitleggen? |
| 12 | Ready to find your best neighborhoods? | Klaar om je beste buurten te vinden? |

### 10.4 Example answer labels

#### Intent

| Key | English | Dutch |
|---|---|---|
| buy | Buy | Kopen |
| rent | Rent | Huren |
| both | Both | Allebei |
| exploring | I’m still exploring | Ik ben nog aan het oriënteren |

#### Household

| Key | English | Dutch |
|---|---|---|
| solo | Just me | Alleen ik |
| couple | Couple | Stel |
| family_young | Family with young children | Gezin met jonge kinderen |
| family_older | Family with older children | Gezin met oudere kinderen |
| shared | Shared household | Gedeeld huishouden |
| other | Something else | Iets anders |

#### Daily-life priorities

| Key | English | Dutch |
|---|---|---|
| green | Green space | Groen |
| calm | Calm streets | Rustige straten |
| schools | Schools and childcare | Scholen en kinderopvang |
| transit | Public transport | Openbaar vervoer |
| affordability | Affordability | Betaalbaarheid |
| amenities | Daily amenities | Dagelijkse voorzieningen |
| social | Cafés, culture, social life | Cafés, cultuur en sociaal leven |
| climate | Climate and environment | Klimaat en leefomgeving |

#### Area character

| Key | English | Dutch |
|---|---|---|
| city | City energy | Stadse energie |
| calm_city | Calm but urban | Rustig maar stedelijk |
| green_suburb | Green suburb | Groene buitenwijk |
| village | Village feel | Dorps gevoel |
| mixed | A bit of everything | Van alles wat |

### 10.5 Matching progress copy

| State | English | Dutch |
|---|---|---|
| Starting | Starting your neighborhood match | Je buurtmatch starten |
| Preferences | Reading your living preferences | Je woonwensen lezen |
| Profile | Building your neighborhood profile | Je buurtprofiel maken |
| Data | Comparing neighborhoods with real data | Buurten vergelijken met echte data |
| Tradeoffs | Checking budget, commute, and daily-life tradeoffs | Budget, reistijd en dagelijkse afwegingen controleren |
| Map | Preparing your match map | Je matchkaart voorbereiden |
| Done | Your neighborhood matches are ready | Je buurtmatches zijn klaar |

### 10.6 Results copy

| Element | English | Dutch |
|---|---|---|
| Results title | Your best neighborhood matches | Je beste buurtmatches |
| Results subtitle | These places best match the way you want to live. | Deze plekken passen het beste bij hoe je wilt wonen. |
| List label | Recommended neighborhoods | Aanbevolen buurten |
| Map CTA | Explore on map | Bekijk op kaart |
| Detail CTA | View neighborhood | Bekijk buurt |
| House CTA | Check this house | Check deze woning |
| Back CTA | Back to match map | Terug naar matchkaart |
| Tradeoff label | Watchout | Let op |
| Fit label | Strong match | Sterke match |

---

## 11. Results map UX specification

### 11.1 Desktop layout

Recommended desktop layout:

```text
 ---------------------------------------------------------
| Top bar: Buurt Check | Language | Saved | Back/Reset     |
 ---------------------------------------------------------
|                          |                              |
| Ranked list              | Map of Netherlands           |
|                          |                              |
| 1. Neighborhood A        | markers / polygons           |
|    Strong match          |                              |
|    Green + commute       |                              |
|                          |                              |
| 2. Neighborhood B        |                              |
|                          |                              |
 ---------------------------------------------------------
```

Map should dominate visually, but the list must be easy to use.

### 11.2 Mobile layout

Recommended mobile layout:

- default to list-first after results,
- provide sticky segmented control: Map / List,
- map opens full-screen,
- selected neighborhood bottom sheet appears over map,
- bottom sheet contains fit reason and CTA.

### 11.3 Neighborhood cards

Each card should include only:

- rank,
- neighborhood name,
- municipality,
- fit label or score,
- 1–2 reasons,
- one CTA.

Example:

English:

> **1. Oegstgeest — Strong match**
> Green, calm, and well connected to your anchor location.
> **View neighborhood**

Dutch:

> **1. Oegstgeest — Sterke match**
> Groen, rustig en goed verbonden met je ankerlocatie.
> **Bekijk buurt**

### 11.4 Map marker design

Markers should be visually restrained.

Recommended:

- numbered markers matching list rank,
- color or intensity by fit score,
- hover/click tooltip with neighborhood name,
- selected marker uses brand checkmark or highlighted outline.

Avoid:

- too many labels at national zoom,
- large popups by default,
- dense icon clutter,
- showing amenities before neighborhood zoom.

---

## 12. Neighborhood 2D building detail UX specification

### 12.1 Entry animation

When a neighborhood is selected:

1. map flies to neighborhood,
2. boundary appears,
3. 2D building footprints load progressively,
4. amenity tags fade in,
5. detail panel opens with concise explanation.

### 12.2 Visual hierarchy

Default visible layers:

1. selected neighborhood boundary,
2. 2D houses/building footprints inside boundary,
3. important amenities,
4. roads/water/green context,
5. selected/hovered house.

Hidden by default:

- every possible amenity,
- all metrics,
- all data-source badges,
- all nearby neighborhoods,
- all Dossier modules.

### 12.3 Building footprint loading

The selected-neighborhood detail should feel like a real inspectable
neighborhood surface, not a curated preview.

Rules:

- Results map: no building footprints.
- Neighborhood detail: show all available building footprints inside the
  selected neighborhood boundary, or inside the current selected-neighborhood
  viewport while more pages load.
- Progressive loading is allowed and preferred for dense areas: request scoped
  bounds, page/cursor through provider results, clip to the selected boundary,
  cache chunks by selected neighborhood and data version, and append newly
  loaded footprints without losing selected house context.
- If the backend has returned only part of the selected neighborhood, the UI
  must show an honest partial state such as "Loading more buildings" or
  "Showing buildings in the visible area."
- Do not label a small bounded result set as the selected neighborhood's houses
  unless it is complete for that neighborhood or clearly scoped to the visible
  viewport.
- Do not fabricate or retain deterministic seed rectangles as if they were real
  footprint data.

### 12.4 Amenity tags

Show only the most relevant amenities based on the user’s stated preferences.

Examples:

- schools,
- childcare,
- supermarket,
- train station,
- park,
- healthcare,
- EV charging,
- library/culture.

If the user prioritized families, show schools and childcare first.
If the user prioritized mobility, show stations and transit first.
If the user prioritized green space, show parks/nature first.

### 12.5 House selection

Clickable houses should have clear hover/active states.

When clicked:

- identify address/building if available,
- show a compact confirmation card,
- CTA opens Dossier.

Example:

English:

> **Check this house?**
> We’ll open the full Buurt Check Dossier for this address.

Dutch:

> **Deze woning checken?**
> We openen het volledige Buurt Check Dossier voor dit adres.

CTA:

- EN: **Open Dossier**
- NL: **Open Dossier**

---

## 13. Existing Dossier integration

### 13.1 Required Dossier changes

The existing Dossier should not be redesigned in this PRD, but it must support the new journey.

Required additions:

1. Persistent **Back to match map** button.
2. Breadcrumb showing selected neighborhood.
3. Session-aware routing.
4. Optional “Next matched house” / “Explore another neighborhood” actions.

### 13.2 Dossier entry context

When the user enters Dossier from the map, pass:

```json
{
  "session_id": "match_123",
  "source": "match_map",
  "neighborhood_id": "BU03630102",
  "address_id": "ADDR_456",
  "return_url": "/match/match_123/neighborhood/BU03630102"
}
```

### 13.3 Return behavior

When the user clicks **Back to match map**:

- return to the same neighborhood detail view,
- preserve zoom level where possible,
- preserve selected neighborhood,
- preserve recommendation list state,
- do not restart survey,
- do not rerun matching unless user changed preferences.

---

## 14. Backend architecture

### 14.1 Recommended architecture

```text
Frontend
  ↓
Survey/session API
  ↓
Preference vector builder
  ↓
Async match job queue
  ↓
Python matching service
  ↓
Neighborhood feature store
  ↓
Model/scoring engine
  ↓
Results API
  ↓
Map + Dossier UI
```

### 14.2 Required services

| Service | Responsibility |
|---|---|
| Session service | Create and persist match sessions. |
| Survey service | Store answers and validation state. |
| Preference service | Convert answers to hard filters, weights, and feature preferences. |
| Matching service | Run model/scoring logic in Python. |
| Feature store | Provide neighborhood-level feature matrix. |
| Geometry service | Provide neighborhood polygons, centroids, and scoped 2D building footprint refs. |
| Building footprint service | Fetch, page, clip, simplify, and cache selected-neighborhood 2D building footprints without national loads. |
| Results service | Store and serve recommendation output. |
| Dossier bridge | Convert selected house/address into existing Dossier route. |

### 14.3 Suggested API endpoints

```text
POST   /api/match/sessions
GET    /api/match/sessions/:sessionId
PATCH  /api/match/sessions/:sessionId/answers
POST   /api/match/sessions/:sessionId/run
GET    /api/match/sessions/:sessionId/status
GET    /api/match/sessions/:sessionId/results
GET    /api/neighborhoods/:neighborhoodId
GET    /api/neighborhoods/:neighborhoodId/map-layers
GET    /api/neighborhoods/:neighborhoodId/buildings
GET    /api/neighborhoods/:neighborhoodId/amenities
POST   /api/dossier/from-building
GET    /api/dossier/:addressId
```

The selected-neighborhood building endpoint must support scoped bounds and
progressive completion metadata, such as cursor/next-page or explicit
`partial`/`complete` status. Backend validation must reject requests outside
the selected neighborhood. Cache keys must include the selected neighborhood,
requested bounds or tile/chunk, data version, simplification level, and any
cursor or paging state that changes the response.

### 14.4 Progress updates

Use one of:

- Server-Sent Events,
- WebSocket,
- polling every 1–2 seconds.

Recommended for simplicity:

- polling for MVP,
- SSE or WebSocket if matching takes longer or progress states become richer.

Status response example:

```json
{
  "session_id": "match_123",
  "status": "running",
  "progress": 0.58,
  "stage": "comparing_neighborhoods",
  "message_key": "progress.comparing_neighborhoods"
}
```

### 14.5 Job states

Required job states:

```text
created
queued
reading_preferences
building_profile
loading_neighborhood_data
applying_filters
running_models
scoring_tradeoffs
preparing_map
completed
failed
completed_with_fallback
```

### 14.6 Error handling

If the predictive model fails but deterministic scoring succeeds:

- show results,
- mark run as `completed_with_fallback`,
- do not expose technical model failure to user,
- log for developers.

User-facing copy:

English:

> We found your matches using the stable scoring model. Some advanced ranking features were skipped this time.

Dutch:

> We hebben je matches gevonden met het stabiele scoremodel. Enkele geavanceerde rangschikkingsfuncties zijn deze keer overgeslagen.

If all matching fails:

English:

> We couldn’t create your match map yet. Your answers are saved, so you can try again without starting over.

Dutch:

> We konden je matchkaart nog niet maken. Je antwoorden zijn opgeslagen, dus je hoeft niet opnieuw te beginnen.

---

## 15. Data requirements

### 15.1 Neighborhood feature matrix

The matching engine needs a neighborhood-level feature matrix.

Minimum fields:

- neighborhood ID,
- neighborhood name,
- municipality,
- geometry reference,
- centroid,
- buy/rent availability proxy,
- affordability signals,
- green-space access,
- calmness/noise indicators,
- public transport access,
- amenity proximity,
- schools/childcare access,
- environmental quality indicators,
- housing stock composition,
- data completeness score,
- data freshness timestamp.

### 15.2 Geometry data

Required geometry layers:

- national boundary or basemap,
- neighborhood polygons,
- building footprints,
- amenity point layers,
- selected house/address geometry.

### 15.3 Data freshness

Every recommendation should contain data version metadata.

The UI does not need to expose all metadata upfront, but detail panels and Dossier should be able to show:

- source,
- date loaded,
- confidence,
- missing data warnings.

### 15.4 Data minimization

Store only what is needed.

Personal preference data should be stored by anonymous session unless the user creates an account or explicitly saves results.

---

## 16. Map and building-footprint requirements

### 16.1 Hero background map

The hero background can use one of three approaches:

1. pre-rendered looping map video,
2. lightweight animated 2D map canvas,
3. lightweight 3D map scene.

Recommended MVP choice:

> Use a pre-rendered or highly optimized animated hero background first, then upgrade to live 3D if performance remains excellent.

Reason:

The landing page must be fast, stable, and readable. A heavy live 3D scene on the first screen may hurt conversion.

### 16.2 Results map

The results map must be interactive and live.

Requirements:

- fast pan/zoom,
- clickable markers,
- neighborhood polygons,
- list synchronization,
- mobile support,
- accessible keyboard alternatives where possible.

### 16.3 Selected-neighborhood building footprint map

The selected-neighborhood building footprint detail should load only after a neighborhood is selected. Because the basemap is 2D, selected buildings render as flat 2D footprints rather than 3D extrusions.

Selected-neighborhood footprints use BAG semantics:

- The footprint object is a BAG `pand`; semantic use is not a pand "type" and must come from linked `verblijfsobject.gebruiksdoel` metadata.
- Primary selected-neighborhood 2D footprint loading should use PDOK BAG OGC v2 `pand` where available, because it exposes 2D geometry plus `status`, `gebruiksdoel`, and `aantal_verblijfsobjecten` in the scoped response.
- 3DBAG may remain a fallback or richer-detail source when height/LoD detail is needed, but the current selected-building 3DBAG `collections/pand/items` path does not expose parsed BAG use purpose. Filtering or prioritizing by use purpose therefore requires PDOK BAG OGC v2 or a join from 3DBAG pand IDs back to BAG.
- Preferred first-pass statuses are `Pand in gebruik`, `Pand in gebruik (niet ingemeten)`, and `Verbouwing pand`.
- Prioritize pands whose `gebruiksdoel` contains `woonfunctie`; mixed-use pands such as `winkelfunctie,woonfunctie` remain house candidates.
- Defer or grey out pands with `aantal_verblijfsobjecten = 0`, only non-residential purposes, or only `overige gebruiksfunctie`. Do not permanently filter them out, because the selected-neighborhood contract is all available footprints where source data exists.

BAG `gebruiksdoel` values:

| Use purpose |
| --- |
| `woonfunctie` |
| `bijeenkomstfunctie` |
| `celfunctie` |
| `gezondheidszorgfunctie` |
| `industriefunctie` |
| `kantoorfunctie` |
| `logiesfunctie` |
| `onderwijsfunctie` |
| `sportfunctie` |
| `winkelfunctie` |
| `overige gebruiksfunctie` |

CBS StatLine `86098NED`, period `2026KW01` provisional, gives this BAG-based national stock distribution by verblijfsobject count:

| Category | Count | Share of all VBOs |
| --- | ---: | ---: |
| Woning / contains `woonfunctie` | 8,358,386 | 87.17% |
| Niet-woning total | 1,229,960 | 12.83% |
| Overige gebruiksfunctie | 439,709 | 4.59% |
| Industriefunctie | 242,853 | 2.53% |
| Logiesfunctie | 153,615 | 1.60% |
| Winkelfunctie | 125,955 | 1.31% |
| Kantoorfunctie | 94,085 | 0.98% |
| Bijeenkomstfunctie | 64,914 | 0.68% |
| Meerdere niet-woonfuncties | 62,753 | 0.65% |
| Gezondheidszorgfunctie | 23,217 | 0.24% |
| Onderwijsfunctie | 13,052 | 0.14% |
| Sportfunctie | 9,753 | 0.10% |
| Celfunctie | 54 | ~0.00% |

Reference sources: [Kadaster BAG gebruiksdoel](https://catalogus.kadaster.nl/bag/nl/page/?anylang=on&clang=nl&uri=Gebruiksdoel), [CBS StatLine 86098NED](https://opendata.cbs.nl/CBS/nl/dataset/86098NED/table), [PDOK BAG OGC v2](https://api.pdok.nl/kadaster/bag/ogc/v2?f=html&lang=nl), and [3DBAG schema](https://docs.3dbag.nl/en/schema/layers/).

Performance rules:

- do not load national building footprint or 3D building data,
- load by selected neighborhood ID plus scoped bounds, tile/chunk, or cursor,
- progressively page dense responses until all available footprints in the
  selected neighborhood or current visible viewport have loaded,
- label partial loading states; never silently present a small bounded sample as
  the complete neighborhood,
- cache successful chunks by selected neighborhood, bounds/tile, data version,
  simplification level, and cursor/page where applicable,
- simplify footprint geometry where possible at the current zoom while
  preserving click/selection accuracy,
- lazy-load amenities,
- show skeleton/loading state,
- provide missing-footprint and non-map fallbacks.

### 16.4 Amenity layer

The amenity layer must be preference-aware.

The selected-neighborhood amenity layer uses a no-paid marker-source stack. It
must never invent POIs and must never fetch national amenity dumps during a map
open. Backend responses remain scoped to the selected neighborhood or selected
neighborhood bounds. If a source is not configured or has no selected-bounds
record, the right-side Relevant amenities panel shows localized unavailable
metadata rather than fake pins.

Final no-paid marker sources:

| Marker category | Primary no-paid source | Use in MVP |
| --- | --- | --- |
| Parks / green space | PDOK BGT/BRT green geometry | Live scoped lookup and stored records |
| Schools | DUO Open Onderwijsdata matched to BAG | Live scoped lookup and stored records |
| Childcare | Landelijk Register Kinderopvang matched to BAG | Live scoped lookup and stored records |
| Public transport stops/stations | OV-haltes Nederland actueel WFS; NDOV / REISinformatiegroep GTFS as preferred import source | Live scoped lookup and stored records |
| Parking | RDW / Nationaal Parkeerregister open parking data | Live scoped lookup and stored records |
| EV charging | NDW DOT-NL public charging points GeoJSON | Live scoped lookup and stored records |
| Swimming water | Zwemwater.nl official bathing-water locations | Live bounded lookup with selected-bounds filtering; stored records optional |
| Daily shops | Overture Places open POI data | Live scoped bbox lookup and stored records |
| Cafes / restaurants | Overture Places open POI data | Live scoped bbox lookup and stored records |
| Healthcare | Overture Places open POI data | Live scoped bbox lookup and stored records |
| Libraries / culture | Overture Places open POI data | Live scoped bbox lookup and stored records |

Direct OpenStreetMap POI enrichment beyond explicitly approved
government-hosted layers may be evaluated later only if the project accepts
ODbL obligations. CBS data may support scoring or context, but it is not a
marker-pin source.

Sports-field markers are intentionally not part of the active marker stack
because the available broad sports filters included unreliable non-field
locations such as sports shops and gyms.

Example: if a user selected `schools`, `green`, `calm`, and daily amenities,
default visible amenities may include schools, childcare, parks/green space,
public transport, daily shops, EV charging, cafes/restaurants, and healthcare.
The UI should show no more than 5-7 relevant amenity categories by default.

---

## 17. Visual design direction

### 17.1 Brand feel

Buurt Check should feel:

- calm,
- sharp,
- trustworthy,
- warm,
- spatial,
- modern,
- slightly magical but not gimmicky.

The experience should feel like a personal guide through the Dutch housing landscape, not like another filter-heavy real estate dashboard.

### 17.2 Typography

Use large, readable headings and generous spacing.

Recommended hierarchy:

- Hero headline: very large, short, emotionally clear.
- Survey question: large, readable, centered or left-aligned depending on layout.
- Helper text: one sentence maximum.
- Buttons: large, obvious, plain language.

### 17.3 Motion

Motion should communicate progress and spatial movement.

Use motion for:

- hero map drift,
- survey transition,
- progress updates,
- map fly-to selected neighborhood,
- checkmark success state,
- neighborhood detail reveal.

Do not use motion for decoration alone.

### 17.4 Checkmark animation

The success checkmark should match Buurt Check’s identity.

Requirements:

- large and central,
- smooth draw animation,
- short completion moment,
- accessible reduced-motion variant,
- no excessive confetti.

### 17.5 Color

Use existing Buurt Check brand colors if already defined. If not, define:

- one primary brand color,
- one calm background surface,
- one success/check color,
- neutral map colors,
- restrained fit-score accents.

Avoid creating a rainbow score system.

---

## 18. Accessibility requirements

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---:|---|
| A11Y-1 | Keyboard navigation for survey. | P0 | User can complete survey without mouse. |
| A11Y-2 | Reduced motion support. | P0 | Animations respect `prefers-reduced-motion`. |
| A11Y-3 | Text contrast. | P0 | Text remains readable over hero background. |
| A11Y-4 | Screen-reader labels. | P0 | Choices, buttons, progress, and map alternatives have accessible labels. |
| A11Y-5 | Mobile touch targets. | P0 | Survey controls are large enough for touch. |
| A11Y-6 | Map alternative list. | P0 | Users can access recommendations without interacting with the map. |

---

## 19. Privacy and compliance requirements

### 19.1 Preference data

The app may collect sensitive life-context preferences, such as household type, budget, commute anchors, and housing needs. Treat this data carefully.

Requirements:

- do not sell user preference data,
- do not store exact anchors longer than necessary unless user saves a profile,
- allow session deletion where feasible,
- avoid collecting names/emails before needed,
- separate anonymous matching sessions from user accounts,
- provide clear privacy copy before account creation or saving results.

### 19.2 Address anchors

Work/school anchors may reveal personal routines.

Requirements:

- allow city-level anchors as an alternative to exact addresses,
- clearly mark exact address fields as optional,
- store geocoded anchors only if needed,
- avoid showing exact anchors in shareable outputs unless user chooses.

### 19.3 Scoring fairness

The model must not recommend or exclude neighborhoods based on protected characteristics.

The matching engine should use housing, environment, accessibility, amenities, and livability signals, not sensitive demographic profiling.

Conversational intake adds extra fairness requirements:

- Do not infer religion, ethnicity, nationality, race, immigration status,
  income class identity, disability, sexual orientation, or similar protected
  traits from free text.
- If a user explicitly asks for proximity to a place of worship, treat it only
  as a user-requested amenity or map-context preference. Do not infer the
  user's religion and do not rank neighborhoods by religious demographics.
- If a user asks for a preference that would require demographic profiling,
  mark it `disallowed` and ask for concrete non-sensitive needs such as travel
  time, amenity access, quietness, green space, housing type, or budget.
- Do not persist free-text preference content in analytics. Store only stable
  extraction status keys and privacy-safe normalized preference keys.

---

## 20. Analytics and success metrics

### 20.1 Activation metrics

- Landing CTA click rate.
- Survey start rate.
- Survey completion rate.
- Additional-preference prompt skip rate.
- Additional-preference extraction review acceptance/edit rate.
- Average time to complete survey.
- Drop-off by question.

### 20.2 Matching metrics

- Match job success rate.
- Match job average runtime.
- Fallback rate.
- Number of results shown per user.
- Percentage of results with sufficient confidence.

### 20.3 Results engagement metrics

- Map open rate.
- Neighborhood list click rate.
- Marker click rate.
- Neighborhood detail open rate.
- Selected-neighborhood map interaction rate.
- Building footprint partial-load and complete-load rate.
- Amenity tag interaction rate.

### 20.4 Dossier conversion metrics

- House click rate from neighborhood map.
- Dossier open rate.
- Back-to-map rate.
- Number of houses checked per session.
- Return visits to match map.

### 20.5 Quality metrics

- User-rated match usefulness.
- “I discovered a neighborhood I did not know” response rate.
- Save/share rate.
- Complaint rate about inaccurate recommendation.
- Reported confusion rate.

---

## 21. Empty, edge, and failure states

### 21.1 No strong matches

English:

> We found a few possible matches, but none are perfect. Your strongest constraints are narrowing the search a lot.

Dutch:

> We hebben een paar mogelijke matches gevonden, maar geen perfecte. Je belangrijkste wensen maken de zoekruimte erg klein.

UI should offer:

- loosen budget,
- increase commute radius,
- reduce must-haves,
- show near-matches.

### 21.2 Missing building footprint data

English:

> Building footprints are not available here yet, so we’re showing the basemap and amenities only.

Dutch:

> Gebouwcontouren zijn hier nog niet beschikbaar, daarom tonen we alleen de basiskaart en voorzieningen.

### 21.2A Partial building footprint loading

English:

> We’re still loading building footprints for this area.

Dutch:

> We laden nog gebouwcontouren voor dit gebied.

### 21.3 Slow backend

English:

> This is taking longer than usual, but your match is still running.

Dutch:

> Dit duurt iets langer dan normaal, maar je match wordt nog steeds gemaakt.

### 21.4 Failed backend

English:

> We couldn’t create your match map yet. Your answers are saved, so you can try again without starting over.

Dutch:

> We konden je matchkaart nog niet maken. Je antwoorden zijn opgeslagen, dus je hoeft niet opnieuw te beginnen.

### 21.5 No address for selected house

English:

> We found the building, but not a reliable address yet.

Dutch:

> We hebben het gebouw gevonden, maar nog geen betrouwbaar adres.

Options:

- choose nearby address,
- search manually,
- return to map.

---

## 22. MVP scope

### 22.1 MVP must include

1. Match-first landing page.
2. Animated hero background with fallback.
3. Dutch/English UI translation system.
4. One-question-at-a-time survey.
5. Optional additional-preferences prompt with structured extraction and skip path.
6. Review screen showing how extracted custom preferences will be used.
7. Progress bar and back button.
8. Survey answer persistence.
9. Preference vector builder with typed custom-preference registry support.
10. Python matching service triggered after final CTA.
11. Async progress screen.
12. Success checkmark animation.
13. Results map centered on the Netherlands.
14. Ranked list of recommended neighborhoods.
15. List-to-map and map-to-list synchronization.
16. Neighborhood detail view.
17. All available 2D house/building footprints for selected neighborhood where data exists, with progressive loading for dense areas.
18. Amenity tags based on user preferences.
19. House click to existing Dossier.
20. Persistent back-to-map action in Dossier.
21. Basic analytics for funnel and drop-off.
22. Failure states.

### 22.2 MVP should not include

1. Account system unless already available.
2. Paid checkout redesign.
3. Full listing marketplace.
4. Unbounded AI chat assistant or LLM-based scorer.
5. Partner lead handoff.
6. Full report PDF.
7. Complex user dashboards.
8. All possible map layers.
9. Nationwide building-footprint or 3D preloading.
10. Model claims that cannot be statistically validated.

---

## 23. Implementation phases

### Phase 1 — UI shell and route cleanup

Build:

- new landing hero,
- route structure,
- language switcher,
- demoted search link,
- survey shell,
- progress bar,
- back behavior.

Exit criteria:

- user can start and complete survey with dummy questions,
- search no longer competes with match on first screen,
- bilingual copy works.

### Phase 2 — Survey and preference vector

Build:

- final question set,
- optional additional-preferences prompt,
- structured preference extractor contract,
- typed custom-preference registry,
- answer validation,
- answer persistence,
- preference vector builder,
- session storage.

Exit criteria:

- completed guided intake produces stable JSON preference vector,
- extracted custom preferences are reviewed, classified, and either mapped into supported features, shown as map context, saved as unsupported, rejected, or marked for clarification,
- vector can be sent to backend matching service.

### Phase 3 — Matching backend

Build:

- Python matching service,
- deterministic scoring baseline,
- supported custom-preference scoring and map-context handling,
- optional predictive model selection if labels exist,
- async job status,
- results schema,
- error/fallback handling.

Exit criteria:

- backend returns ranked neighborhoods with reason codes and confidence.

### Phase 4 — Progress and success states

Build:

- animated progress screen,
- progress messages,
- checkmark completion animation,
- failed and fallback states.

Exit criteria:

- user sees clear progress from final CTA to results.

### Phase 5 — Results map

Build:

- Netherlands map,
- recommended neighborhood markers/polygons,
- ranked list,
- map/list sync,
- mobile map/list toggle.

Exit criteria:

- user can move from results list to selected neighborhood.

### Phase 6 — Neighborhood 2D building detail

Build:

- selected neighborhood detail view,
- all-available 2D house/building footprint loading by selected neighborhood
  or selected-neighborhood viewport,
- progressive building paging/chunk caching with honest partial states,
- amenity tags,
- house selection state,
- missing-footprint fallback.

Exit criteria:

- user can inspect selected neighborhood, understand whether buildings are
  complete or still loading, and click a house.

### Phase 7 — Dossier bridge

Build:

- house-to-address resolver,
- route into existing Dossier,
- persistent back-to-map button,
- context preservation.

Exit criteria:

- user can move from map to Dossier and back without restarting.

---

## 24. Acceptance criteria

The revamp is successful only if all of the following are true:

1. A first-time user immediately understands the primary action.
2. The landing screen does not force a choice between search and match.
3. The CTA starts the match flow.
4. The survey shows only one question at a time.
5. The progress bar is always visible during survey.
6. The user can go back and change previous answers.
7. The backend match run starts only after the final CTA.
8. The user sees a friendly progress state while matching runs.
9. Completion is visually confirmed with a Buurt Check checkmark.
10. Results open on a Netherlands map with ranked neighborhoods.
11. Clicking a result zooms to that neighborhood.
12. The selected neighborhood view shows all available 2D house/building footprints for that neighborhood or current selected-neighborhood viewport, loaded progressively, and never as an unlabeled representative sample.
13. Amenity tags are relevant to the user’s preferences.
14. Clicking a house opens the existing Dossier.
15. The Dossier includes a clear route back to the map.
16. Dutch and English UI text are supported through translation keys.
17. Reduced-motion and map fallback states exist.
18. Model output is accurate about whether it is deterministic scoring or validated predictive probability.

---

## 25. Recommended component inventory

### 25.1 Frontend components

```text
HeroMapBackground
LanguageSwitcher
PrimaryCTA
SecondaryAddressLink
SurveyIntro
SurveyShell
SurveyProgressBar
SurveyBackButton
SingleSelectQuestion
MultiSelectQuestion
BudgetRangeQuestion
CommuteSliderQuestion
AnchorLocationQuestion
AdditionalPreferencesQuestion
CustomPreferenceReviewList
SurveyReview
MatchingProgressScreen
AnimatedCheckmark
ResultsMap
RecommendationList
RecommendationCard
NeighborhoodMarker
NeighborhoodDetailMap
AmenityTags
BuildingFootprintLayer
HouseSelectionCard
DossierBackButton
```

### 25.2 Backend modules

```text
match_session.py
survey_answers.py
preference_vector.py
custom_preference_registry.py
preference_extraction.py
neighborhood_features.py
match_engine.py
model_selection.py
reason_codes.py
match_job.py
results_serializer.py
geometry_service.py
building_service.py
amenity_service.py
dossier_bridge.py
```

---

## 26. Translation key examples

Recommended translation key structure:

```json
{
  "landing.headline": {
    "en": "Find your dream neighborhood.",
    "nl": "Vind je droombuurt."
  },
  "landing.subheadline": {
    "en": "Tell us how you want to live. We’ll show you where to look.",
    "nl": "Vertel ons hoe je wilt wonen. Wij laten zien waar je moet zoeken."
  },
  "landing.cta": {
    "en": "Find my dream neighborhood",
    "nl": "Vind mijn droombuurt"
  },
  "survey.back": {
    "en": "Back",
    "nl": "Terug"
  },
  "progress.comparing_neighborhoods": {
    "en": "Comparing neighborhoods across the Netherlands",
    "nl": "Buurten in Nederland vergelijken"
  },
  "intake.additional_preferences.title": {
    "en": "Anything else that matters?",
    "nl": "Is er nog iets anders belangrijk?"
  },
  "results.title": {
    "en": "Your best neighborhood matches",
    "nl": "Je beste buurtmatches"
  },
  "dossier.back_to_map": {
    "en": "Back to match map",
    "nl": "Terug naar matchkaart"
  }
}
```

---

## 27. Development notes for accuracy

### 27.1 Do not overpromise model intelligence

The backend can fit multiple models only when there is enough training or validation signal. If the app has no labels yet, begin with a transparent scoring baseline. This is better than pretending to have predictive power.

The same rule applies to conversational intake. An LLM may help understand how a
user describes their needs, but the scoring truth must come from typed,
validated backend features and source-backed registry entries.

### 27.2 Start with a beautiful but lightweight hero

The animated hero should be impressive, but performance matters more. A pre-rendered loop or optimized canvas can create the right feeling without risking a heavy first load.

### 27.3 The search functionality is not removed

Search remains valuable. It is simply moved to the right moment in the journey: after users understand which neighborhood or house they want to inspect.

### 27.4 The map must not become cluttered

The old app’s informational richness should be preserved in the Dossier, not forced into the discovery map. The match map is for discovery, orientation, and selection.

### 27.5 Preserve user context

The whole flow fails if users lose their recommendation context when opening a Dossier. Route state and session persistence are therefore core requirements, not polish.

---

## 28. Open decisions

1. Should the primary brand phrase be “Find my dream neighborhood” or “Find my best neighborhood”?
   - “Dream neighborhood” is more emotional.
   - “Best neighborhood” is more sober and trustworthy.

2. Should the Dutch CTA be “Vind mijn droombuurt” or “Vind mijn beste buurt”?
   - “Droombuurt” is memorable.
   - “Beste buurt” is safer and less playful.

3. Should the hero map be a real interactive scene or a pre-rendered loop for MVP?

4. How many core guided-intake questions is the ideal balance: 8, 10, or 12?

5. Does the first release support the full Netherlands or a prioritized set of regions with stronger data quality?

6. Which existing Dossier modules must be preserved unchanged, and which need light UI adjustments for the new journey?

7. What exact selected-neighborhood footprint source/cache strategy will power progressive 2D building loading: live provider paging only, prewarmed backend cache, vector tiles, or a later dedicated GIS/tile service?

8. Will match results be free, paid, or partially gated after preview?

9. Which custom preference registry entries are scoreable in the first
   implementation, and which are map-context-only? Initial candidates include
   coast/beach proximity, water proximity, transit station proximity, places of
   worship as neutral amenity context, and specialized daily-life amenities.

---

## 29. Final product statement

The redesigned Buurt Check should feel like a calm, intelligent guide through the Dutch housing landscape.

It should not ask users to start with an address. It should start with the life they want to build.

The new flow is simple:

> **Choose how you want to live, or describe it in your own words. Get matched with neighborhoods. Explore them on a beautiful map. Click a house. Open the full Dossier. Go back anytime.**

Dutch:

> **Kies hoe je wilt wonen, of vertel het in je eigen woorden. Ontdek passende buurten. Verken ze op een mooie kaart. Klik op een woning. Open het volledige Dossier. Ga altijd terug naar de kaart.**

That is the core of the revamp.
