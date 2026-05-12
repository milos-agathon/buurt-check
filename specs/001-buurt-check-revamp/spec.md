# Feature Specification: Buurt Check Revamp

**Feature Branch**: `001-buurt-check-revamp`
**Created**: 2026-05-11
**Status**: Draft
**Input**: User description: "Create an umbrella feature specification for the Buurt Check Revamp from docs/prd.md, covering PRD FR1-FR14, P0/P1 scope, configurable MVP geography, buy and rent journeys, licensed listing adapters or mocks, Dutch and English copy, data model requirements, AI guardrails, acceptance criteria, and traceability."

## Clarifications

### Session 2026-05-11

- Q: What geography must the coded MVP cover? → A: Configurable MVP geography seeded for Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, and surrounding commuter-style example neighborhoods; full Netherlands production coverage is not required for the first coded MVP.
- Q: How should listing integrations be implemented for MVP? → A: Use `ListingProvider` adapters, provide `MockListingProvider`, add configuration placeholders for future licensed providers, and never scrape listing sites.
- Q: What data integration contract blocks implementation? → A: Use official-data adapter interfaces plus seed/mock importers; every metric must include source name, source type, timestamp, geography level, freshness status, confidence, and limitations.
- Q: What AI report behavior is required when generation is unavailable or data is missing? → A: Use structured report inputs/outputs with schema validation, deterministic fallback copy, and a hard rule that AI must not invent missing data.
- Q: What persistence, notification, admin, analytics, and stack decisions apply? → A: Use Dutch/English i18n with no hard-coded user-facing copy, implement save/share/export and alerts with auth-aware or local/session fallbacks, use mock notification dispatch if no provider exists, monitor freshness/failures/missing metrics/anomalies/provider status, instrument required product events, and use the existing repository stack.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Current Renter Finds Realistic Places to Move (Priority: P1, PRD Priority: P0)

A current renter who wants to move can complete the preference quiz for rent, buy, or both, receive ranked neighborhoods that fit budget and lifestyle constraints, compare at least three options, save promising neighborhoods, and create alerts for available homes.

**Why this priority**: Current renters are the largest active moving segment in the PRD and need both rental and buying pathways, affordability realism, and alternatives outside their known search area.

**Independent Test**: Can be tested by completing the quiz as a renter with a budget and commute anchor, then verifying that ranked neighborhoods, tradeoffs, map results, listing availability, save/share/export, and alerts are available without relying on a paid journey.

**Acceptance Scenarios**:

1. **Given** a renter chooses "rent" or "both" and enters budget, household, anchor, commute, and lifestyle priorities, **When** they submit the quiz, **Then** the system generates a preference vector that includes rental intent and ranks eligible neighborhoods.
2. **Given** a renter views recommendations, **When** they save neighborhoods and configure a rent alert under a maximum monthly budget, **Then** the alert stores neighborhood, budget, property type, and rent intent.

---

### User Story 2 - Starter Gets Guidance on Where to Begin (Priority: P2, PRD Priority: P0)

A starter or first-time independent household can use guided questions and plain-language explanations to understand which neighborhoods are realistic, what tradeoffs matter, and which alternatives they may not have considered.

**Why this priority**: Starters have high guidance needs and often lack neighborhood knowledge, especially when moving out for the first time or entering the Dutch housing market.

**Independent Test**: Can be tested by selecting a starter household profile and confirming that recommendations include budget realism, education-oriented explanations, source labels, and next-step actions.

**Acceptance Scenarios**:

1. **Given** a starter indicates flexible geography and limited local knowledge, **When** the report is generated, **Then** it explains why each recommended neighborhood fits and flags affordability or supply constraints in non-technical language.
2. **Given** a starter marks a recommendation "not for me", **When** rankings refresh, **Then** the system changes subsequent recommendations based on the feedback event while preserving source-backed explanations.

---

### User Story 3 - Single or Couple Discovers Flexible Alternatives (Priority: P3, PRD Priority: P0/P1)

A single person or couple without children can prioritize commute, social life, affordability, public transport, amenities, and housing stock, then discover obvious and surprising neighborhoods that match those preferences.

**Why this priority**: Smaller households are structurally large and need a search flow that values flexibility, apartment supply, amenities, mobility, and lifestyle rather than family-only assumptions.

**Independent Test**: Can be tested by completing the quiz as a single/couple profile and verifying that the score drivers and persona overlay reflect non-family priorities.

**Acceptance Scenarios**:

1. **Given** a user prioritizes apartment stock, public transport, cafes, sports, and affordability, **When** rankings are produced, **Then** family-specific signals do not dominate the explanation unless the user selected them as important.
2. **Given** the user starts from a known neighborhood, **When** they request similar neighborhoods, **Then** the system returns comparable alternatives with similarity reasons and tradeoffs.

---

### User Story 4 - Family Evaluates Daily-Life Fit (Priority: P4, PRD Priority: P1)

A family or future family can prioritize schools, childcare, green space, calmness, mobility, and family-oriented housing stock, then compare neighborhoods with clear tradeoffs and source-backed confidence.

**Why this priority**: Families have high emotional and practical stakes and need explanations that translate data into daily-life consequences without promising certainty.

**Independent Test**: Can be tested by selecting a family household profile and verifying that the report highlights schools, green access, commute, family housing supply, environmental watchouts, and confidence levels.

**Acceptance Scenarios**:

1. **Given** a family marks schools and green space as must-haves, **When** recommendations are ranked, **Then** neighborhoods missing either hard requirement are excluded or clearly marked as stretch/reconsider rather than top matches.
2. **Given** a family compares three neighborhoods, **When** comparison opens, **Then** school, childcare, green access, commute, budget realism, housing supply, and confidence are visible side by side.

---

### User Story 5 - City-to-Village Mover Tests a Lifestyle Change (Priority: P5, PRD Priority: P1)

A city-to-village or city-escape mover can express a desire for calm, green, village or town feel, affordability, and acceptable commute, then discover smaller municipalities or neighborhoods that preserve practical access.

**Why this priority**: This segment knows the desired lifestyle emotionally but needs evidence that the move is practical and not too isolated.

**Independent Test**: Can be tested by selecting a city anchor and village/town preference, then verifying that top matches, surprising alternatives, stretch areas, and avoid-or-reconsider areas explain isolation, commute, supply, and amenities.

**Acceptance Scenarios**:

1. **Given** a user wants less city life but requires a maximum commute, **When** the ranking runs, **Then** results outside the commute limit are not top matches and may appear only as stretch areas with a clear reason.
2. **Given** a recommended village has low listing supply, **When** the report is generated, **Then** the report explains the supply risk and suggests an alert.

---

### User Story 6 - Newcomer or Expat Understands Dutch Neighborhood Tradeoffs (Priority: P6, PRD Priority: P1)

A newcomer, expat, international student, or international couple can complete onboarding in Dutch or English, receive explanations that define Dutch housing and neighborhood terms, and evaluate neighborhoods without relying on local reputation alone.

**Why this priority**: Newcomers are a large starter source and need multilingual, trust-building explanations that make official data understandable.

**Independent Test**: Can be tested by setting language to English and newcomer status, then verifying that user-facing copy, report content, explanations, and source labels are available in English and that no unsupported local-reputation claims appear.

**Acceptance Scenarios**:

1. **Given** a newcomer chooses English, **When** they complete the quiz and open the report, **Then** the quiz, report, comparison, map, save/share/export, alerts, and error states are presented in English.
2. **Given** a newcomer asks why an area fits, **When** the explanation is shown, **Then** major claims cite source and freshness metadata or are blocked.

---

### User Story 7 - Serious Buyer Checks Before Bidding (Priority: P7, PRD Priority: P1/P2)

A serious buyer can evaluate a neighborhood before bidding, compare it with nearby or similar alternatives, connect recommendations to available buy listings, save/export the report, and share it with a partner or family.

**Why this priority**: Serious buyers create action and conversion potential, but the MVP must preserve trust by separating neighborhood scoring from future paid, partner, mortgage, or bidding products.

**Independent Test**: Can be tested by choosing buy intent, saving a report, exporting or sharing it, opening listing connections, and verifying that the output avoids valuation, mortgage, legal, tax, and bid advice.

**Acceptance Scenarios**:

1. **Given** a buyer views a top neighborhood, **When** available listings are shown, **Then** listings are sourced from a licensed provider adapter or mock and are clearly separated from the neighborhood fit score.
2. **Given** a buyer exports or shares a report, **When** the recipient opens it, **Then** the report includes the user profile summary, top matches, tradeoffs, source/freshness metadata, and limitations.

### Edge Cases

- If the user chooses both buy and rent, recommendations and alerts must preserve both journeys rather than collapsing to one default.
- If an MVP region lacks real data, seeded/mock data may be used only when marked as mock and assigned appropriate confidence.
- If licensed listing data is unavailable, the listing module must show a compliant placeholder, user-pasted listing option, or outbound partner-ready surface without scraping.
- If a hard filter excludes all neighborhoods, the system must explain which constraints caused the empty result and offer safe relaxations.
- If source data is stale, incomplete, or conflicting, the recommendation must reduce confidence, surface missing data, and avoid overclaiming.
- If a user requests a claim involving protected or sensitive demographic traits, the system must block or reframe the response.
- If AI report generation fails, users must still see structured rankings, comparisons, map results, saved neighborhoods, and source metadata.
- If a user changes language after generating a report, user-facing copy and report narrative must be available in the selected language without changing the underlying scores.
- If no authenticated account model exists, saved neighborhoods, saved reports, share links, alerts, and export state must use local/session persistence plus a future-ready account linkage model rather than blocking the MVP flow.
- If no real notification provider exists, alerts must be stored and evaluated with a mock notification dispatcher that records intended deliveries and exposes the provider integration point.
- If PDF export is browser-generated or server-rendered, the chosen export path must preserve report content, source metadata, limitations, and language, and must be covered by automated tests.
- If analytics delivery is unavailable, required product events must still be captured through a local/mock instrumentation sink so event names and payload contracts remain testable.

## PRD Traceability *(mandatory)*

| PRD FR ID | PRD Requirement | User Story Coverage | Data Model Coverage | UI/API Component | Tests | Phase |
|-----------|-----------------|---------------------|---------------------|------------------|-------|-------|
| FR1 | Preference quiz | US1, US2, US3, US4, US5, US6, US7 | UserPreferenceProfile, PreferenceVector, RegionConfig | Landing CTA, quiz flow, preference submission contract | Quiz completion, validation, hard filters, language coverage | MVP P0 |
| FR2 | Household/persona detection | US1, US2, US3, US4, US5, US6, US7 | PersonaOverlay, UserPreferenceProfile | Persona detection result, report profile summary | Overlay assignment, multi-overlay cases, feedback consistency | MVP P0 |
| FR3 | Neighborhood scoring engine | US1, US2, US3, US4, US5, US7 | Neighborhood, NormalizedFeatureVector, ConfidenceAssessment, DataFreshnessRecord | Ranking result, scoring explanation contract | Deterministic ranking, hard-filter exclusion, confidence downgrade | MVP P0 |
| FR4 | Explainable match output | US1, US2, US4, US5, US6, US7 | MetricSourceMetadata, ConfidenceAssessment, Report | Recommendation cards, details, comparison explanations | Why/tradeoff/confidence presence, missing data states | MVP P0 |
| FR5 | AI-generated report | US1, US2, US4, US5, US6, US7 | Report, MetricSourceMetadata, PreferenceVector, NeighborhoodRank | Report generation, report viewer, export payload | Grounding, citation, unsupported claim blocking, bilingual report | MVP P0 |
| FR6 | Neighborhood comparison | US1, US3, US4, US7 | Neighborhood, NormalizedFeatureVector, MetricSourceMetadata | Side-by-side comparison for 3+ neighborhoods | Minimum 3 comparison, metric parity, source display | MVP P0 |
| FR7 | Similar-neighborhood discovery | US2, US3, US5, US7 | NeighborhoodSimilarity, NormalizedFeatureVector | Similar-neighborhood search, known-neighborhood entry | Similarity reasons, alternatives outside original search, confidence | MVP P0 |
| FR8 | Map view | US1, US2, US4, US5, US7 | Neighborhood, RegionConfig, NeighborhoodRank | Map with scored recommendations and filters | Score pins/areas, region bounds, unavailable geography | MVP P0 |
| FR9 | Listing connection | US1, US5, US7 | Listing, ListingProviderMetadata, Neighborhood | Listing module, provider adapter contract, mock listing mode | Licensed/mock source enforcement, buy/rent separation, no scraping | MVP P1 |
| FR10 | Alerts | US1, US5, US7 | Alert, SavedNeighborhood, UserPreferenceProfile | Alert creation and management | Neighborhood/budget/property/buy-rent alert criteria | MVP P1 |
| FR11 | Save/share report | US1, US2, US6, US7 | SavedNeighborhood, Report, ShareToken | Save, share, export report | Persistence, export content, share access, limitations included | MVP P1 |
| FR12 | Multilingual support | US2, US6, US7 | LocalePreference, Report | Language selector, bilingual quiz/report UI | Dutch/English parity, fallback copy, generated report language | MVP P1 |
| FR13 | Feedback loop | US1, US2, US3, US7 | FeedbackEvent, PreferenceVector, NeighborhoodRank | Love/maybe/not-for-me controls, reranking | Feedback capture, ranking update, explanation consistency | MVP P1 |
| FR14 | Admin data dashboard | All stories indirectly | DataFreshnessRecord, SourceHealth, ScoringAnomaly, GuardrailEvent | Internal data quality dashboard | Freshness, missing data, failures, anomalies, guardrail blocks | MVP P1 |
| Success Metrics | Product instrumentation | US1, US2, US3, US4, US5, US6, US7 | AnalyticsEvent | Instrumentation sink and event contract | Required event emission, mock sink fallback, payload validation | MVP P1 |

## Requirements *(mandatory)*

### Required User Flows

- **Landing page**: Users must understand the promise, choose "Find my best neighborhoods" or "Compare a neighborhood I already like", and select Dutch or English.
- **3-6 minute preference quiz**: Users must answer buy/rent intent, budget, household, anchor location, commute or radius, must-haves, nice-to-haves, property type, language, and lifestyle priorities.
- **Preference vector generation**: Quiz answers must become a normalized preference vector with hard filters, weighted preferences, journey intent, location anchors, and language preference.
- **Persona overlay detection**: The system must assign one or more overlays, including family, newcomer, city-escape, single/couple, buyer, and renter, based on explicit answers and derived signals.
- **Top neighborhood ranking**: The system must rank eligible neighborhoods and expose scores, score drivers, tradeoffs, confidence, and freshness.
- **Surprising alternatives**: The system must identify recommendations outside the user's obvious geography or assumptions when they still satisfy hard constraints.
- **Stretch areas**: The system must identify areas with strong lifestyle fit but budget, commute, supply, or confidence constraints.
- **Avoid-or-reconsider areas**: The system must explain areas that fail key constraints or carry major tradeoffs without using stigmatizing language.
- **AI-generated report**: The system must create a personal report from retrieved data and scoring output, not from model memory.
- **Side-by-side comparison**: Users must compare at least three neighborhoods across the same major dimensions.
- **Similar-neighborhood discovery**: Users must start from a known neighborhood and find comparable alternatives elsewhere.
- **Map view**: Users must view recommendations geographically with match scores and selected filters.
- **Save/share/export report**: Users must save neighborhoods, share a report, and export report content with source/freshness metadata and limitations.
- **Listing connection**: Users must see buy/rent listing availability through licensed provider adapters or clearly marked mocks/placeholders.
- **Alerts**: Users must create alerts by neighborhood, budget, property type, and buy/rent intent.
- **Feedback loop**: Users must mark recommendations as love, maybe, or not for me and see rankings adapt.
- **Admin data dashboard**: Internal users must monitor freshness, missing data, source failures, scoring anomalies, guardrail blocks, and alert failures.
- **Product instrumentation**: The system must record quiz start, quiz completion, report viewed, neighborhood saved, listing click, alert created, and feedback submitted events through a real or mock instrumentation sink.

### Functional Requirements

- **FR-001**: System MUST let users complete a preference quiz in 3-6 minutes and capture hard filters plus weighted lifestyle preferences. *(PRD: FR1)*
- **FR-002**: System MUST support buy, rent, and both journeys in the quiz, preference vector, report, listings, alerts, and saved outputs. *(PRD: FR1, FR9, FR10)*
- **FR-003**: System MUST generate a structured preference vector containing household, journey intent, budget, anchors, commute/radius, must-haves, nice-to-haves, avoid signals, property preference, language, and lifestyle weights. *(PRD: FR1, FR3)*
- **FR-004**: System MUST assign one or more persona overlays from explicit and derived signals, including family, newcomer, city-escape, single/couple, buyer, and renter. *(PRD: FR2)*
- **FR-005**: System MUST rank neighborhoods through structured scoring based on normalized neighborhood features, hard-filter eligibility, lifestyle fit, availability, budget realism, commute feasibility, tradeoffs, and confidence. *(PRD: FR3)*
- **FR-006**: System MUST provide top neighborhoods, surprising alternatives, stretch areas, and avoid-or-reconsider areas for each completed profile. *(PRD: FR3, FR4, FR7)*
- **FR-007**: Every recommendation MUST include why it fits, major tradeoffs, data confidence, source coverage, and data freshness. *(PRD: FR4)*
- **FR-008**: System MUST generate AI report narratives only from retrieved data, scoring outputs, selected user preferences, and approved report templates. *(PRD: FR5)*
- **FR-009**: System MUST block or omit unsupported AI claims, especially claims about safety certainty, happiness certainty, protected traits, social groups, legal advice, mortgage advice, tax advice, valuation, or bidding instructions. *(PRD: FR5)*
- **FR-010**: Users MUST be able to compare at least three neighborhoods side by side using consistent dimensions, scores, tradeoffs, sources, freshness, and confidence. *(PRD: FR6)*
- **FR-011**: Users MUST be able to start from a known neighborhood and discover similar neighborhoods with similarity reasons and tradeoffs. *(PRD: FR7)*
- **FR-012**: Users MUST be able to view ranked recommendations on a map with match scores and region-aware availability states. *(PRD: FR8)*
- **FR-013**: MVP geography MUST be configurable by region and may use seeded/mock data for selected Dutch municipalities or neighborhoods until real datasets are integrated, provided mock status and confidence are visible. *(PRD: FR3, FR8, FR14)*
- **FR-014**: Listing data MUST be abstracted behind a `ListingProvider` adapter contract with a `MockListingProvider` for MVP, configuration placeholders for future licensed providers, and marked mocks/placeholders; scraping is not allowed. *(PRD: FR9)*
- **FR-015**: Users MUST be able to see available buy and rent homes, price/rent range, availability density, and listing source status for recommended neighborhoods when provider or mock data exists. *(PRD: FR9)*
- **FR-016**: Users MUST be able to create and store alerts by neighborhood, budget, property type, buy/rent intent, and notification preference; if no real notification provider exists, a mock dispatcher MUST record intended notifications and document the provider integration point. *(PRD: FR10)*
- **FR-017**: Users MUST be able to save neighborhoods, save a report, export report content, and share a report with a partner or family member; if authentication is unavailable, MVP MUST use local/session persistence plus future-ready account linkage rather than requiring accounts. *(PRD: FR11)*
- **FR-018**: MVP user-facing copy MUST support Dutch and English across landing page, quiz, recommendations, report, comparison, map, save/share/export, alerts, feedback, unavailable states, and major error states through an i18n layer with no hard-coded user-facing copy outside translation resources. *(PRD: FR12)*
- **FR-019**: Users MUST be able to provide recommendation feedback as love, maybe, or not for me, and the system MUST use that feedback to update ranking or future recommendations. *(PRD: FR13)*
- **FR-020**: Internal users MUST be able to inspect data freshness, missing metrics, source failures, scoring anomalies, provider status, guardrail blocks, listing adapter health, and alert failures. *(PRD: FR14)*
- **FR-021**: P2 monetization, partner recommendations, mortgage, makelaar, and premium report features MUST remain future-ready extension points and MUST NOT influence MVP neighborhood scoring unless explicitly represented as neutral availability metadata. *(PRD: FR9, FR11, FR14)*
- **FR-022**: The system MUST instrument product events for quiz start, quiz completion, report viewed, neighborhood saved, listing click, alert created, and feedback submitted with testable event names and minimal contextual payloads. *(PRD: Success Metrics)*
- **FR-023**: The first coded MVP MUST use the repository's existing application stack and conventions unless planning discovers an explicit technical blocker; if the repository were empty, the greenfield stack in project instructions would apply. *(Implementation constraint)*

### Acceptance Criteria by PRD Functional Requirement

#### FR1 - Preference Quiz

- **Measurable criteria**: At least 90% of required quiz fields can be completed in one pass; a typical user can finish in under 6 minutes; hard filters and weighted preferences are both present in the generated profile.
- **Testability notes**: Test complete, partial, invalid, and language-switched quiz submissions for buy, rent, and both.
- **Edge cases**: Missing budget, multiple commute anchors, no commute anchor, conflicting must-haves, flexible geography, and all constraints too restrictive.
- **Non-goals**: The quiz does not provide mortgage qualification, rental eligibility, legal advice, or final affordability advice.

#### FR2 - Household/Persona Detection

- **Measurable criteria**: Persona overlays are assigned for 100% of completed quizzes; multiple overlays can coexist; explicit user answers override weaker derived signals.
- **Testability notes**: Test family, newcomer, city-escape, single/couple, buyer, renter, and combined overlays.
- **Edge cases**: Household changes mid-flow, both buy/rent selected, user skips newcomer question, user does not fit a predefined overlay.
- **Non-goals**: Persona overlays are not marketing segments for ad targeting and must not infer protected traits.

#### FR3 - Neighborhood Scoring Engine

- **Measurable criteria**: Each ranked neighborhood has a 0-100 fit score, hard-filter eligibility status, score drivers, and confidence; top, surprising, stretch, and reconsider groups are generated when enough eligible data exists; first coded MVP geography is configurable and seeded for Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, and surrounding commuter-style example neighborhoods.
- **Testability notes**: Test deterministic repeatability, weight sensitivity, hard-filter exclusion, configurable region coverage, mock data disclosure, and empty result handling.
- **Edge cases**: No eligible neighborhoods, stale data, sparse data, tied scores, mock-only region, neighborhood outside supported geography, and request for full Netherlands production coverage during MVP.
- **Non-goals**: The LLM does not calculate scores; protected or sensitive demographic traits are not score inputs.

#### FR4 - Explainable Match Output

- **Measurable criteria**: Every recommendation includes "why it fits", "tradeoffs", "data confidence", and source/freshness coverage for major claims.
- **Testability notes**: Verify explanation completeness for each ranking group and each persona overlay.
- **Edge cases**: Missing source for one metric, low confidence but high score, conflicting signals, unavailable listing data.
- **Non-goals**: Explanations must not promise a neighborhood is safe, perfect, happy, or guaranteed to fit.

#### FR5 - AI-Generated Report

- **Measurable criteria**: Report includes profile summary, top matches, fit reasons, tradeoffs/watchouts, similar neighborhoods, available listing context when present, suggested alerts, next steps, source/freshness metadata, and limitations; structured report inputs and outputs pass schema validation before display or export.
- **Testability notes**: Run grounding tests to confirm report claims are traceable to retrieved data or scoring output, schema validation tests for inputs/outputs, deterministic fallback copy tests when AI generation is unavailable, repeated-run consistency tests for stable structured inputs, preference-sensitivity tests for changed user preferences, and bilingual tests for Dutch and English.
- **Edge cases**: AI service unavailable, unsupported claim attempted, stale source, conflicting metrics, user asks follow-up beyond evidence.
- **Non-goals**: The report does not invent metrics, produce formal advice, or use model memory as a source.

#### FR6 - Neighborhood Comparison

- **Measurable criteria**: Users can compare at least three neighborhoods side by side with the same core dimensions and visible score/confidence/source data.
- **Testability notes**: Test comparison from ranking, saved neighborhoods, similar-neighborhood results, and direct neighborhood entry.
- **Edge cases**: User selects fewer than three neighborhoods, one neighborhood lacks a metric, comparison includes mock and real data together.
- **Non-goals**: Comparison is not a full municipal dashboard and should remain curated to decision-relevant indicators.

#### FR7 - Similar-Neighborhood Discovery

- **Measurable criteria**: Starting from a known neighborhood returns comparable alternatives with similarity reasons, differences, confidence, and source coverage.
- **Testability notes**: Test exact neighborhood matches, ambiguous names, unsupported regions, and filters such as cheaper, greener, calmer, or better commute.
- **Edge cases**: Known neighborhood not found, source neighborhood has sparse data, all similar areas fail budget or commute.
- **Non-goals**: Similarity must not be based on protected or sensitive demographic matching.

#### FR8 - Map View

- **Measurable criteria**: Ranked neighborhoods are visible on a map with match score, category, confidence, and supported-region boundaries or unavailable states.
- **Testability notes**: Test top results, stretch/reconsider categories, map filtering, unsupported geography, and mobile usability.
- **Edge cases**: No coordinates, overlapping neighborhoods, unsupported region, mock-only data, and map data failure.
- **Non-goals**: The map is not required to provide property-level valuation or full listing marketplace behavior.

#### FR9 - Listing Connection

- **Measurable criteria**: Listing surfaces distinguish buy and rent, show source/provider status, never scrape, and can operate with licensed adapter data or marked mocks/placeholders.
- **Testability notes**: Test buy-only, rent-only, both, provider unavailable, mock mode, expired listing, and outbound placeholder behavior.
- **Edge cases**: Provider returns duplicate listings, no listings in a strong-fit area, outdated listing availability, provider license limits.
- **Non-goals**: MVP does not become a full marketplace, makelaar workflow, valuation engine, or bid automation tool.

#### FR10 - Alerts

- **Measurable criteria**: Users can create and store an alert containing neighborhood, budget, property type, buy/rent intent, and notification preference; alert failures and dispatcher/provider status are visible to internal monitoring.
- **Testability notes**: Test alert creation from report, listing module, saved neighborhood, and map; verify both buy and rent criteria, duplicate handling, mock dispatcher recording, and future provider integration point documentation.
- **Edge cases**: User changes budget, no listing provider, duplicate alert, unsupported neighborhood, invalid contact destination.
- **Non-goals**: Alerts do not guarantee listing availability or priority access.

#### FR11 - Save/Share Report

- **Measurable criteria**: Users can save at least three neighborhoods, save a report, export a report, and share a report with source/freshness metadata and limitations intact; account-backed flows are used when auth exists, otherwise local/session persistence and future-ready account linkage are used.
- **Testability notes**: Test save, unsave, export, share access, language, updated data freshness, report regeneration boundaries, no-auth local/session behavior, and the selected PDF export path.
- **Edge cases**: Shared report opened after data changes, report contains mock data, recipient language differs, export generation fails.
- **Non-goals**: MVP save/share does not require full account-based collaboration or paid premium report enforcement.

#### FR12 - Multilingual Support

- **Measurable criteria**: Dutch and English are available for all MVP user-facing copy and report output through translation resources; unsupported keys, missing translations, or hard-coded user-facing strings outside translation files are treated as defects.
- **Testability notes**: Test both languages across landing, quiz, report, comparison, map, listings, alerts, feedback, save/share/export, and error states.
- **Edge cases**: Language changed mid-quiz, shared report language, report regenerated in another language, source names without translation.
- **Non-goals**: MVP does not require languages beyond Dutch and English.

#### FR13 - Feedback Loop

- **Measurable criteria**: Love, maybe, and not-for-me feedback events are captured and affect current or future rankings in an explainable way.
- **Testability notes**: Test feedback on top, surprising, stretch, and reconsider recommendations and verify updated explanations remain consistent with scoring.
- **Edge cases**: Conflicting feedback, accidental feedback undo, feedback on stale report, feedback leaves no eligible neighborhoods.
- **Non-goals**: Feedback is not used to infer sensitive traits or sell partner leads without explicit future consent.

#### FR14 - Admin Data Dashboard

- **Measurable criteria**: Internal users can monitor freshness, source failures, missing metrics, scoring anomalies, provider status, guardrail blocks, alert failures, and mock-vs-real data coverage by region.
- **Testability notes**: Test dashboard states for healthy, degraded, failed, stale, mock-only, and anomaly conditions.
- **Edge cases**: Source outage, partial region coverage, repeated guardrail blocks, alert delivery failure, unexpected score distribution.
- **Non-goals**: Admin dashboard does not need customer support tooling, billing operations, or partner lead management in MVP.

#### Cross-Cutting - Product Instrumentation and Implementation Baseline

- **Measurable criteria**: Required product events are emitted for quiz start, quiz completion, report viewed, neighborhood saved, listing click, alert created, and feedback submitted with stable event names and payloads sufficient for activation, conversion, and trust metrics.
- **Testability notes**: Test instrumentation through real or mock sinks and verify no required event is skipped in the primary MVP flows.
- **Edge cases**: Analytics provider unavailable, local/mock sink active, user changes language mid-flow, saved/share flow uses local/session persistence, and listing click opens a placeholder or mock provider record.
- **Non-goals**: MVP instrumentation does not require a full business intelligence warehouse, ad targeting, or partner attribution model.

### Key Entities *(include if feature involves data)*

- **RegionConfig**: Defines supported MVP geographies, municipality/neighborhood coverage, whether data is real or seeded/mock, supported languages, launch readiness, and the initial coded seed set for Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, and surrounding commuter-style example neighborhoods.
- **Neighborhood**: Represents a searchable neighborhood, village, town area, or municipality unit with stable identifier, display names in Dutch and English where available, geometry or map reference, parent municipality, supported-region status, and source coverage.
- **NormalizedFeatureVector**: Represents comparable 0-100 feature values for each neighborhood across dimensions such as calmness, green access, family fit, mobility, amenities, affordability, safety context, environmental quality, social/lifestyle fit, housing stock, availability, budget realism, and commute feasibility.
- **MetricSourceMetadata**: Represents source name, source type, metric name, timestamp, measurement date when distinct, retrieval date when distinct, license/status, geography level, limitations, confidence, and whether the metric is official, commercial, derived, mock, or missing.
- **DataFreshnessRecord**: Represents freshness status for each metric and neighborhood, including current, aging, stale, unavailable, mock, and conflict states.
- **ConfidenceAssessment**: Represents confidence for a recommendation, metric, or report section based on source completeness, recency, consistency, geographic precision, and mock/real status.
- **OfficialDataAdapter**: Represents a source-specific adapter contract for importing or refreshing official data into normalized metric records with source metadata, freshness, geography level, and confidence.
- **SeedMockImporter**: Represents an importer that loads seeded/mock MVP neighborhood, metric, listing, and alert test data while marking all mock records and confidence levels explicitly.
- **UserPreferenceProfile**: Represents raw quiz answers, including buy/rent intent, budget, household, anchors, commute/radius, must-haves, nice-to-haves, property type, language, and lifestyle priorities.
- **PreferenceVector**: Represents normalized weights, hard filters, avoid signals, journey intent, and persona inputs derived from the quiz.
- **PersonaOverlay**: Represents detected overlays such as family, newcomer, city-escape, single/couple, buyer, renter, and starter, including reasons and confidence.
- **NeighborhoodRank**: Represents ranked recommendation output, including category, fit score, eligibility, score drivers, tradeoffs, confidence, freshness, and source coverage.
- **NeighborhoodSimilarity**: Represents a similar-neighborhood result with similarity score, shared drivers, meaningful differences, and constraints.
- **ListingProviderMetadata**: Represents a listing adapter identity, provider mode, configuration status, license/compliance status, health, last successful refresh, and limitations.
- **Listing**: Represents a buy or rent home from a `ListingProvider` adapter, `MockListingProvider`, user-provided input, outbound placeholder, or licensed source, including neighborhood, intent, property type, price/rent, availability status, days on market when available, provider metadata, and freshness.
- **Alert**: Represents a user-defined watch rule containing neighborhood, budget, property type, buy/rent intent, contact destination or notification preference, status, and last evaluation.
- **SavedNeighborhood**: Represents a saved recommendation or user-selected neighborhood tied to a preference profile/report context.
- **Report**: Represents a generated Woonkompas/Buurt Match report with profile summary, recommendations, tradeoffs, comparison data, similar neighborhoods, listing context, suggested alerts, source/freshness metadata, language, limitations, schema validation status, deterministic fallback status, and generation timestamp.
- **ShareToken**: Represents a shareable report reference with access scope, expiration or revocation status where supported, language preference, and whether it is backed by account state or local/session state.
- **FeedbackEvent**: Represents love, maybe, not-for-me, undo, and optional reason events tied to recommendation, report, neighborhood, and preference context.
- **GuardrailEvent**: Represents blocked or revised AI claims, missing citations, unsupported requests, or sensitive-topic interventions.
- **SourceHealth**: Represents operational source status for internal monitoring, including freshness, failures, coverage, anomalies, and listing adapter health.
- **NotificationDispatchRecord**: Represents a real or mock alert notification attempt, destination type, provider status, result, timestamp, and integration limitations.
- **AnalyticsEvent**: Represents required product instrumentation events with stable event name, timestamp, locale, journey intent, report/neighborhood/listing context where applicable, and privacy-safe metadata.

### Data, AI, and Trust Constraints *(mandatory when feature uses data or AI)*

- **Data categories**: Official public data, licensed commercial listing data, derived internal scoring data, seeded/mock MVP data, user-provided preferences, user feedback, and missing/unavailable data states.
- **Metric metadata**: Every metric consumed by ranking, comparison, report generation, map detail, listings, alerts, or admin monitoring must include source name, source type, timestamp, geography level, and confidence.
- **Source and freshness**: Major claims in recommendations, reports, comparison, and map details must have available source type/category, source name or source family, measurement/retrieval timestamp when known, geography level, freshness status, confidence, and limitations.
- **Official data integration**: Official datasets must enter the product through adapter interfaces or seed/mock importers that normalize metric metadata and mark mock/unavailable values explicitly.
- **AI boundary**: AI may summarize the user profile, explain score drivers, translate official data into plain language, compare tradeoffs, suggest alerts, and generate bilingual report prose. AI must not create scores, invent data, fill missing metrics, decide hard-filter eligibility, or override structured ranking.
- **Report grounding**: Report input and output must be structured and schema-validated. Report output must be generated from retrieved data, scoring outputs, selected user preferences, listing adapter outputs or mocks, and approved limitation text. If AI generation is unavailable or invalid, deterministic fallback copy must render the same structured sections without unsupported claims.
- **Unsupported claims**: Claims without data support must be blocked, omitted, or reframed as uncertainty. This includes claims about safety certainty, happiness, crime certainty, protected traits, ethnicity, religion, income class as identity, legal outcomes, mortgage qualification, valuations, tax advice, or bid strategy.
- **Fairness guardrails**: Protected and sensitive traits must not be used for scoring, similarity, ranking, or persona detection. Public-interest neighborhood indicators may be used only when framed as environmental, accessibility, housing, or livability context and sourced.
- **Listing data mode**: Listing data must come from `ListingProvider` adapters, `MockListingProvider`, user-provided listing inputs, compliant outbound links, or clearly marked mocks/placeholders. Future licensed providers must be represented as configuration placeholders until real access exists. Scraping is excluded.
- **Admin visibility**: Internal monitoring must show data freshness, source failures, missing metrics, scoring anomalies, provider status, mock coverage, listing adapter health, guardrail blocks, and alert failures.
- **Localization boundary**: Dutch and English user-facing copy must be supplied through the translation/i18n layer. Hard-coded user-facing copy outside translation resources is a defect.
- **Save/share/export boundary**: Save report, shareable report URL, and PDF export must be supported when auth exists; without auth, local/session save and share/export behavior must preserve a future-ready account model. PDF export may be browser-generated or server-rendered, but the chosen path must be tested.
- **Alert dispatch boundary**: Alerts must be creatable and stored. If no real email or notification provider exists, a mock dispatcher must record intended sends and document where a real provider plugs in.
- **Instrumentation boundary**: Required success-metric events must be emitted through a real or mock sink with stable event names for quiz start, quiz completion, report viewed, neighborhood saved, listing click, alert created, and feedback submitted.
- **Stack constraint**: Implementation planning and delivery must use the existing repository framework, architecture, and quality gates unless an explicit blocker is identified. The greenfield stack from project instructions applies only if the repository is empty.
- **Future-ready extension points**: P2 monetization, premium reports, makelaar handoff, mortgage partners, relocation partners, insurance partners, and partner lead flows must remain separable from score calculation and clearly disclosed if introduced later.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 80% of test users can complete the preference quiz in under 6 minutes without assistance.
- **SC-002**: 100% of completed quiz results produce a preference vector or a clear recoverable explanation of missing/invalid inputs.
- **SC-003**: 100% of generated recommendations include fit reason, tradeoff, confidence, and freshness/source coverage status.
- **SC-004**: Users can compare at least three neighborhoods side by side in every supported MVP region with available or clearly marked unavailable metrics.
- **SC-005**: At least 70% of usability test participants can identify why the top recommendation ranked above a lower recommendation.
- **SC-006**: At least 50% of usability test participants save three or more neighborhoods or create at least one alert during a guided test.
- **SC-007**: 100% of AI report claims about neighborhood fit are traceable to retrieved data, scoring output, listing adapter output, user preferences, or approved limitation text.
- **SC-008**: Dutch and English MVP user-facing flows have complete copy coverage with no missing-key fallbacks in acceptance testing.
- **SC-009**: Listing surfaces pass compliance review by demonstrating licensed provider, user-provided, outbound placeholder, or marked mock data modes and no scraping dependency.
- **SC-010**: Internal users can identify stale data, missing metrics, failed sources, scoring anomalies, guardrail blocks, and alert failures for each supported MVP region.
- **SC-011**: 100% of ranking, comparison, report, listing, alert, and admin metrics include source name, source type, timestamp, geography level, freshness status, confidence, and limitations in contract tests.
- **SC-012**: Required product events are emitted for quiz start, quiz completion, report viewed, neighborhood saved, listing click, alert created, and feedback submitted in the MVP happy path and local/mock fallback mode.

## Assumptions

- The umbrella feature covers the full PRD FR1-FR14 but delivery may be phased into MVP P0 and MVP P1 increments.
- MVP supports configurable Dutch regions rather than mandatory full Netherlands production coverage.
- The first coded MVP seed set includes Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, and surrounding commuter-style example neighborhoods.
- Selected MVP municipalities and neighborhoods may use seeded/mock data until real datasets are integrated, but mock status, source type, timestamp, geography level, and confidence must be explicit.
- Buy and rent are both first-class journeys for quiz, preference vectors, listings, alerts, saved neighborhoods, reports, and feedback.
- The product remains neighborhood-first and does not become a full listing marketplace.
- Listing integration starts with provider adapters, `MockListingProvider`, and placeholders for future licensed providers; scraping is excluded.
- Official data integration starts with adapter interfaces and seed/mock importers before full production ingestion is required.
- AI report generation uses structured inputs/outputs, schema validation, and deterministic fallback copy when AI is unavailable or invalid.
- P2 monetization and partner integrations are extension points unless required to support P1 save/share/export, listings, or alerts.
- Dutch and English are required for MVP user-facing copy through the translation/i18n layer; additional languages are outside MVP.
- Reports can be generated without creating a paid product in MVP.
- User accounts are not assumed by this specification; saved, shared, exported, and alert behavior may use the existing product's appropriate identity, anonymous state model, or local/session persistence during planning.
- Alerts can launch with a mock notification dispatcher if no real email or notification provider is available.
- Admin monitoring includes data freshness, source failures, missing metrics, scoring anomalies, provider status, listing adapter health, guardrail blocks, and alert failures.
- Product instrumentation is required for quiz start, quiz completion, report viewed, neighborhood saved, listing click, alert created, and feedback submitted, even if implemented through a mock sink first.
- Implementation planning uses the existing repository stack and quality gates unless a concrete blocker is identified.
- No current planning artifact exists for this revamp, so `docs/prd.md` is the source of truth for product requirements.
