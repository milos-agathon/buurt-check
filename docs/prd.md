# PRD: Buurt Check Revamp — AI Neighborhood Discovery for Home Seekers

**Product:** Buurt Check  
**Working title:** Buurt Match / Woonkompas  
**Date:** 9 May 2026  
**Status:** Draft PRD v1  
**Primary market:** Netherlands  
**Primary users:** People who want to buy or rent a home but do not yet know *where* to search.

---

## 1. Executive summary

Buurt Check should evolve from a neighborhood information product into a **personalized neighborhood discovery and decision platform** for home seekers.

The core insight is that most housing platforms start with a location, budget, and property type. But many users do not actually know which neighborhood, village, town, or municipality fits their life. They may know they want “green, safe, close to schools, affordable, not too far from Amsterdam,” but they cannot translate that into a ranked list of concrete neighborhoods.

Buurt Check will solve this by letting users complete a short preference quiz, then generating a data-backed report that recommends neighborhoods matching their lifestyle, budget, household situation, and practical constraints. The report should feel emotionally engaging, almost like a “woonkompas” or “home destiny report,” while remaining transparent, explainable, and grounded in official datasets.

The strongest positioning is:

> **Find the neighborhood before you find the house.**

The product should not compete head-on with Funda as a listing portal. It should sit **before and beside Funda**: helping users discover where to search, why those places fit, and when matching listings become available.

---

## 2. Market signals and priority segments

The latest WoON 2024 data shows a large addressable market: **3.6 million households have a moving wish or do not rule out moving, and almost 1.8 million are actively looking for a home**. The largest active groups are people moving from rental homes, starters, and people moving from owner-occupied homes. In 2024, active woningvragers included **668,700 doorstromers from rental homes**, **539,900 starters**, **492,300 doorstromers from owner-occupied homes**, and **87,700 semi-starters**.[^woon24]

CBS data from April 2026 also shows that the starter market is not only young Dutch people leaving home. In 2024, there were **518,000 starters on the housing market**, down from 560,000 in 2023. CBS reports that the largest group of starters were people coming to the Netherlands for work or study: **280,222 immigrant starters** in 2024, compared with **189,201 starters leaving a parental home**.[^cbs-starters]

A structural signal is the rise of smaller households. CBS reported that one-person households made up **40% of all households at the beginning of 2024**, with projected growth to 44% by 2070.[^cbs-households]

### Priority segment decision

| Priority | Segment | Why it matters | Product implication |
|---|---|---|---|
| P0 | **Current renters who want to move** | Largest active segment in WoON 2024: 668,700 active searchers moving from rental homes. | Need rent + buy pathways, affordability filters, neighborhood alternatives, alerts. |
| P0 | **Starters and first-time independent households** | 539,900 active starters in WoON 2024; CBS shows 518,000 starters in 2024. | Need guidance, education, and “where can I realistically live?” reports. |
| P0/P1 | **Single people and couples without children** | One-person households are structurally large and growing. | Need apartment-friendly, commute, amenities, affordability, and social-life signals. |
| P1 | **Families with children or planning children** | High emotional need and clear preference patterns: schools, safety context, green space, calmness, childcare, family amenities. | Need family-oriented scoring and explainable tradeoffs. |
| P1 | **Urban-to-village / city escape movers** | Likely to know what they want emotionally but not geographically. | Need “similar lifestyle elsewhere” discovery, commute radius, and village/town comparisons. |
| P1 | **Expats / internationals / newcomers** | CBS shows immigrants are a large starter source. This is a high-need segment, though not necessarily the broadest buyer segment. | Serve them through multilingual onboarding and newcomer-specific explanations, but do not position the whole product as “for expats only.” |
| P2 | **Owner-occupier doorstromers** | 492,300 active searchers; often higher budget and purchase-oriented. | Useful for paid reports, premium alerts, and makelaar/mortgage partner leads. |

---

## 3. Problem statement

Home seekers in the Netherlands often begin their search with incomplete location knowledge. They can search listings on Funda, speak with makelaars, or ask friends, but these approaches usually assume the user already knows the target city, neighborhood, or village.

This creates four problems:

1. **Location uncertainty:** Users do not know which neighborhoods match their lifestyle and constraints.
2. **Poor comparability:** Neighborhood data is scattered across CBS, Leefbaarometer, Atlas Leefomgeving, municipal sources, listing portals, and makelaars.
3. **Listing-first bias:** Existing platforms show homes first and neighborhood context second.
4. **Emotional overload:** Buying or renting is high-stakes, but users receive fragmented information rather than a clear, personal recommendation.

---

## 4. Product vision

Buurt Check becomes the **AI-powered neighborhood advisor** for people looking to buy or rent in the Netherlands.

The product should answer:

> “Based on who I am, what I value, what I can afford, and where I need to be, where should I actually look?”

The user experience should combine:

- **Guided onboarding:** A short, friendly quiz.
- **Data-backed matching:** Official datasets, normalized neighborhood indicators, and live housing availability.
- **AI explanation:** Clear reasoning, tradeoffs, and recommendations in plain language.
- **Action layer:** Relevant homes, bidding opportunities, saved neighborhoods, and alerts.

---

## 5. Goals and non-goals

### Goals

1. Help users discover neighborhoods they would not have found through normal listing search.
2. Convert vague lifestyle preferences into ranked, explainable neighborhood recommendations.
3. Provide trustworthy, source-backed reports based on official and curated data.
4. Connect neighborhood discovery to live housing action: listings, bidding opportunities, rental availability, and alerts.
5. Create a differentiated consumer experience that does not feel like a spreadsheet, government dashboard, or generic AI chat.

### Non-goals for MVP

- Do not become a full listing marketplace.
- Do not provide formal valuation, mortgage, legal, or tax advice.
- Do not replace a makelaar.
- Do not rank neighborhoods using protected or sensitive demographic traits.
- Do not promise that a neighborhood is “safe,” “perfect,” or “guaranteed” for a household.
- Do not rely on raw LLM output for scoring without structured data.

---

## 6. Competitive landscape

### Funda

Funda remains the dominant listing-first journey. It lets users search by location, map, filters, and custom drawn areas. Its neighborhood pages also include housing market data, residents, amenities, makelaars, and current buy/rent supply.[^funda-draw][^funda-neighborhood]

**Gap for Buurt Check:** Funda helps after the user knows where to search. Buurt Check should help users decide *where* to search in the first place.

### Walter Living

Walter positions itself as a data-driven digital aankoopmakelaar. It offers valuation, Walter Maps, neighborhood insights, AI Superagent, bid advice, and buying guidance. Walter says its AI Superagent is built for house hunting and is backed by market data and neighborhood insights.[^walter]

**Gap for Buurt Check:** Walter is purchase and bidding oriented. Buurt Check should be broader and earlier in the journey: life-fit, neighborhood discovery, rental + buying, and “where should I live?” rather than “what should I bid?”

### Huispedia

Huispedia focuses heavily on property value, home data, comparable homes, and reports. It says its woningwaarde tool uses public sources such as Kadaster and CBS, home characteristics, and machine learning.[^huispedia]

**Gap for Buurt Check:** Huispedia is home/address/value first. Buurt Check should be preference-first and neighborhood-discovery-first.

### Atlas Leefomgeving and Check je plek

Atlas Leefomgeving offers public environmental information, including “Check je plek,” which gives insight into the quality of the living environment around an address, and “Vind je plek,” which lets users weight indicators such as green environment, climate resilience, clean air, safety context, noise, public transport, and amenities.[^atlas-check][^atlas-vind]

**Gap for Buurt Check:** Atlas is official and trustworthy, but not a consumer housing journey with listings, AI explanation, saved searches, or personalized home-search workflows.

### Leefbaarometer

Leefbaarometer provides government-backed livability data for neighborhoods, including physical environment, housing stock, amenities, social cohesion, and nuisance/insecurity dimensions. Its data has been updated with 2024 data.[^leefbaarometer-home][^leefbaarometer-open]

**Gap for Buurt Check:** Leefbaarometer is policy/research-oriented. Buurt Check can translate similar official data into a consumer-facing decision product.

### Buurtvergelijker and similar tools

Buurt comparison tools present neighborhood comparisons across population, amenities, safety, and housing, often using sources such as CBS, Politie, and Rijksoverheid.

**Gap for Buurt Check:** These tools compare places, but they do not yet feel like a full AI-guided home-search advisor connected to personal preferences, listing action, and alerts.

---

## 7. Differentiation strategy

Buurt Check should not differentiate by becoming more niche. It should differentiate by **packaging the same broad market need in a more guided, emotional, and action-oriented way**.

### Core differentiators

| Differentiator | Description |
|---|---|
| **Neighborhood-first journey** | Start with “where should I live?” instead of “show me homes in this city.” |
| **Preference-to-place engine** | Convert lifestyle preferences into a structured neighborhood fit score. |
| **Explainable AI report** | AI writes the narrative, but the score comes from curated data and transparent logic. |
| **Similar-context discovery** | “You like this neighborhood, but here are five other places with similar calmness, greenery, schools, and affordability.” |
| **Woonkompas / natal-chart storytelling** | Make the report feel personal and delightful without losing trust. |
| **Official-data trust layer** | Every major claim should show source, timestamp, and confidence. |
| **Action bridge to listings** | After neighborhood discovery, users see homes, bidding opportunities, and alerts. |
| **Multilingual onboarding** | Especially valuable for expats and newcomers, but useful for the broader market. |
| **Tradeoff transparency** | Do not only say “best match.” Explain what the user gains and sacrifices. |
| **Non-niche persona system** | Serve families, expats, singles, couples, and city-escape movers through presets, not separate products. |

---

## 8. User personas

### Persona 1: The relocating family

**Profile:** Couple with one or more children, or planning children.  
**Needs:** Schools, childcare, parks, safety indicators, low traffic, family-friendly housing stock, commute.  
**Pain:** They search houses but cannot compare whether different areas would actually fit family life.  
**Success moment:** “We found three neighborhoods outside our original search area that are safer, greener, and still within commute range.”

### Persona 2: The international newcomer

**Profile:** Expat, international student transitioning to work, skilled migrant, or international couple.  
**Needs:** English explanations, public transport, amenities, registration practicality, proximity to work, international schools or community, rental availability.  
**Pain:** They do not understand Dutch neighborhood names, local reputation, or tradeoffs.  
**Success moment:** “I understand why these areas fit me and what Dutch terms/data mean.”

### Persona 3: The urban-to-village mover

**Profile:** Person or couple leaving Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven, etc.  
**Needs:** Calmness, green space, affordability, commute, village/town amenities, future resale confidence.  
**Pain:** They want “less city” but fear choosing somewhere too isolated.  
**Success moment:** “I can compare villages and smaller towns through lifestyle fit, not just price.”

### Persona 4: The single or couple without children

**Profile:** Single professional, couple, remote worker, or young household.  
**Needs:** Affordability, commute, cafés/restaurants, sport, public transport, safety context, social life, apartment stock.  
**Pain:** They are flexible geographically but do not know where flexibility gives them the best outcome.  
**Success moment:** “I found realistic alternatives that match my lifestyle and budget.”

### Persona 5: The serious buyer

**Profile:** Buyer ready to bid or close to ready.  
**Needs:** Neighborhood confidence, supply alerts, bid timing, nearby alternatives.  
**Pain:** They fall in love with homes without understanding the area.  
**Success moment:** “Before bidding, I know the neighborhood context and comparable alternatives.”

---

## 9. Core user journey

### Step 1: Entry

User lands on Buurt Check with a clear promise:

> “Tell us how you want to live. We’ll show you where to look.”

Primary CTA:

> “Find my best neighborhoods”

Secondary CTA:

> “Compare a neighborhood I already like”

---

### Step 2: Mini quiz

The quiz should take **3–6 minutes**.

Required inputs:

- Buy, rent, or both.
- Budget range.
- Household type.
- Current city or preferred anchor location.
- Max commute time or travel radius.
- Work/school anchor addresses, optional.
- Must-haves vs nice-to-haves.
- Property type preference.
- Language preference.
- Lifestyle priorities.

Preference categories:

| Category | Example preferences |
|---|---|
| Calmness | Quiet streets, low crowding, low nuisance indicators |
| Green space | Parks, nature, tree cover, outdoor access |
| Family fit | Schools, childcare, playgrounds, family households |
| Mobility | Train, bus/tram/metro, cycling, car access |
| Amenities | Supermarkets, healthcare, gyms, cafés, culture |
| Affordability | Asking prices, rent levels, price per m², availability |
| Safety context | Crime/nuisance indicators, Leefbaarometer dimensions |
| Environmental quality | Noise, air, heat stress, flood/climate indicators |
| Social/lifestyle fit | Urban, village, mixed, international-friendly, quiet |
| Housing stock | Apartments, family homes, new build, energy labels |

---

### Step 3: Preference vector

The app converts quiz answers into a structured user preference vector.

Example:

```text
User profile:
- Household: family with young child
- Journey: buy
- Budget: €475k–€625k
- Anchor: Amsterdam Zuid
- Commute max: 45 minutes public transport / 35 minutes car
- Must-haves: schools, green, low noise, family housing stock
- Nice-to-haves: village feel, supermarket within 1 km, train nearby
- Avoid: dense nightlife, high traffic, very low supply
```

---

### Step 4: Neighborhood matching

The system compares the user vector against neighborhood vectors.

The matching engine should produce:

- Top 10 neighborhoods.
- 3–5 surprising alternatives.
- 3 stretch areas that are excellent fits but may exceed budget or commute.
- 3 avoid-or-reconsider areas with clear reasons.
- Confidence score per recommendation.
- Data freshness indicator.

---

### Step 5: AI-generated report

The user receives a personalized report.

Working report names:

- Your Woonkompas
- Your Buurt Match Report
- Your Home Happiness Map
- Your Neighborhood Natal Chart
- Where You Should Live Report

Recommended structure:

1. Your profile summary
2. Top neighborhood matches
3. Why these neighborhoods fit
4. Tradeoffs and watchouts
5. Similar neighborhoods you may not know
6. Live homes available now
7. Suggested alerts
8. Next steps

Tone:

- Warm.
- Personal.
- Slightly playful.
- Never overconfident.
- Always evidence-backed.

Example language:

> “Your strongest pattern is: calm, green, family-ready, but not disconnected. You score highest in neighborhoods that combine lower crowding, nearby schools, and reasonable access to Amsterdam. Your best matches are not the cheapest areas, but they give you the strongest balance between daily peace and practical mobility.”

---

### Step 6: Listings and alerts

Once the user accepts or saves neighborhoods, Buurt Check shows:

- Current homes for sale or rent.
- Price range.
- Days on market.
- Availability density.
- Matching homes by neighborhood score.
- Alerts for future listings.
- Optional “notify me when this neighborhood has a home under €X.”

Critical dependency: Funda/NVM, Pararius, rental platforms, makelaar feeds, or other licensed listing sources. The PRD should assume **licensed data access**, not scraping.

---

## 10. Functional requirements

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR1 | Preference quiz | P0 | User can complete quiz in under 6 minutes; system captures hard filters and weighted preferences. |
| FR2 | Household/persona detection | P0 | System assigns one or more persona overlays: family, newcomer, city-escape, single/couple, buyer, renter. |
| FR3 | Neighborhood scoring engine | P0 | System ranks neighborhoods using structured data, not LLM-only reasoning. |
| FR4 | Explainable match output | P0 | Every recommendation includes “why it fits,” “tradeoffs,” and “data confidence.” |
| FR5 | AI-generated report | P0 | Report is generated from retrieved data and scoring outputs; no unsupported neighborhood claims. |
| FR6 | Neighborhood comparison | P0 | User can compare at least 3 neighborhoods side by side. |
| FR7 | Similar-neighborhood discovery | P0 | User can start from a known neighborhood and find comparable alternatives elsewhere. |
| FR8 | Map view | P0 | Recommendations can be viewed on a map with match scores. |
| FR9 | Listing connection | P1 | User can see available buy/rent homes in recommended neighborhoods through licensed data. |
| FR10 | Alerts | P1 | User can create alerts by neighborhood, budget, property type, and buy/rent intent. |
| FR11 | Save/share report | P1 | User can save report, export PDF, or share with partner/family. |
| FR12 | Multilingual support | P1 | MVP supports Dutch and English. |
| FR13 | Feedback loop | P1 | User can mark recommendations as “love,” “maybe,” or “not for me,” and system updates ranking. |
| FR14 | Admin data dashboard | P1 | Internal team can monitor data freshness, missing data, source failures, and scoring anomalies. |

---

## 11. Data requirements

The product needs a curated data layer. The AI should not be asked to “figure it out” from memory.

### Recommended data categories

| Category | Example source direction |
|---|---|
| Population and households | CBS neighborhood and household data |
| Moving demand | WoON / CBS moving wishes and housing market datasets |
| Housing stock | CBS, BAG, Kadaster, WOZ, energy labels |
| Livability | Leefbaarometer |
| Safety context | Police/open crime indicators, Leefbaarometer nuisance/insecurity dimensions |
| Schools and childcare | DUO/BRIN, childcare registers, municipal data |
| Amenities | CBS distance-to-amenities, OpenStreetMap, commercial POI providers |
| Mobility | GTFS/OV data, travel-time APIs, road/cycling data |
| Environment | Atlas Leefomgeving, RIVM, noise, air, heat, flood, green-space data |
| Listings | Funda/NVM or licensed listing feeds; rental portals where legally available |
| Price and availability | Asking price, rent, price per m², days on market, supply density |

### Data principles

- Show source and timestamp.
- Separate official data from commercial/listing data.
- Use confidence levels where data is old, sparse, or incomplete.
- Avoid sensitive demographic scoring.
- Never let the LLM invent a metric.
- Normalize all neighborhood scores so users can compare across municipalities.

---

## 12. Matching model

The product should use a hybrid model:

1. **Deterministic scoring layer**  
   Calculates neighborhood fit using normalized features and user weights.

2. **Retrieval layer**  
   Pulls relevant neighborhood facts, datasets, and listing information.

3. **LLM explanation layer**  
   Converts the score, evidence, and tradeoffs into a human-readable report.

The LLM should explain the score. It should not be the score.

### Simplified score concept

```text
Neighborhood Fit Score =
  Hard filter eligibility
  × Weighted lifestyle score
  × Housing availability score
  × Budget realism score
  × Commute feasibility score
  - Tradeoff penalties
```

### Example scoring dimensions

| Dimension | Example signals |
|---|---|
| Family fit | Schools nearby, childcare, parks, family housing stock |
| Calmness | Density, traffic/noise indicators, nuisance indicators |
| Green access | Park/nature proximity, green surface share |
| Affordability | Price/rent relative to budget |
| Commute | Travel time to anchors |
| Amenities | Supermarkets, healthcare, sports, culture |
| Housing availability | Current listings and historical supply |
| Environmental quality | Noise, air, heat, flood/climate indicators |
| Confidence | Data completeness and freshness |

---

## 13. AI requirements

### AI capabilities

The AI should be able to:

- Summarize the user’s lifestyle profile.
- Explain why neighborhoods fit.
- Explain tradeoffs.
- Translate official data into plain language.
- Answer follow-up questions.
- Compare neighborhoods conversationally.
- Generate alert suggestions.
- Rewrite reports for Dutch or English users.

### AI guardrails

The AI must not:

- Claim certainty about safety or happiness.
- Make unsupported statements about crime, ethnicity, income, religion, or social groups.
- Recommend based on protected characteristics.
- Invent data.
- Present official-looking numbers without a source.
- Give legal, mortgage, or bidding advice unless clearly scoped and sourced.

### AI evaluation

Test the AI on:

- Hallucination rate.
- Source citation accuracy.
- Consistency across repeated runs.
- Whether explanations match actual score drivers.
- Whether recommendations change appropriately when preferences change.
- Bias and fairness issues.

---

## 14. MVP scope

### MVP geography

Recommended MVP launch:

- Randstad + surrounding commuter towns, or
- Amsterdam, Utrecht, Rotterdam, The Hague, Eindhoven and nearby municipalities.

Reason: these areas have high search pressure, many people considering relocation, and strong need for cross-neighborhood comparison.

### MVP features

P0 MVP:

1. Dutch/English landing page.
2. 3–6 minute preference quiz.
3. Neighborhood ranking.
4. Personalized AI report.
5. Side-by-side comparison.
6. Map view.
7. Save neighborhoods.
8. Basic listing links or listing module, depending on data access.
9. Email alerts for selected neighborhoods.
10. Source and confidence labels.

Not in MVP:

- Full makelaar workflow.
- Mortgage pre-approval.
- Bid automation.
- Formal valuation.
- Deep renovation estimates.
- Full Netherlands coverage if data quality cannot be maintained.

---

## 15. UX and design principles

### Principle 1: Guided, not filtered

Users should not feel like they are filling out a real estate database. The quiz should feel more like:

> “What kind of life are you trying to build?”

### Principle 2: Emotional but evidence-backed

The “natal chart” idea is strong, but it must be grounded in data. Use playful labels, but always show why.

Example cards:

- **Your living style:** Calm Green Connector
- **Best fit:** Family-friendly towns with strong green access and realistic commute
- **Hidden risk:** Lower listing supply, so alerts matter
- **Your watchout:** Some areas fit lifestyle but stretch budget

### Principle 3: Show tradeoffs

Avoid saying “this is the best neighborhood.” Say:

> “This is your strongest match if schools and calmness matter more than nightlife.”

### Principle 4: Serendipity matters

The magic is not showing obvious neighborhoods. It is showing:

> “You searched Haarlem, but you may also like Driebergen, Castricum, Leidsche Rijn, Oegstgeest, or Bussum — here is why.”

### Principle 5: Trust is part of the interface

Every recommendation should have:

- Source badges.
- Data freshness.
- Confidence level.
- Explanation of missing data.

---

## 16. Success metrics

### Activation

- Quiz start rate.
- Quiz completion rate.
- Percentage of users who view full report.
- Time to first saved neighborhood.

### Recommendation quality

- Percentage of users saving at least 3 neighborhoods.
- User-rated fit score.
- “I discovered a neighborhood I did not know” rate.
- Report helpfulness score.
- Follow-up question rate.

### Conversion

- Listing click-through rate.
- Alert creation rate.
- Return visits after alert.
- Saved search activation.
- Partner lead conversion, if applicable.

### Trust and retention

- Percentage of recommendations with full source coverage.
- Citation/source click rate.
- Complaint rate about inaccurate data.
- Repeat report generation.

### Business

- Free-to-paid conversion, if using paid reports.
- Subscription conversion, if using alerts/premium.
- Makelaar/mortgage/insurance partner lead revenue.
- Cost per report.
- Data/API cost per active user.

---

## 17. Monetization options

### Phase 1: Free report + lead capture

- Free basic Woonkompas.
- Email required to save/export.
- Alerts require account.

### Phase 2: Premium report

Paid upgrade could include:

- More neighborhoods.
- Full PDF.
- Deeper commute analysis.
- Listing watchlist.
- Partner comparison mode.
- “Areas like this but cheaper/calmer/greener” analysis.

### Phase 3: Marketplace / partner revenue

Potential partners:

- Makelaars.
- Mortgage advisors.
- Rental agents.
- Moving services.
- Energy/home insurance providers.
- Expat relocation services.

Important: keep partner recommendations clearly separated from neighborhood scoring to preserve trust.

---

## 18. LLM commoditization risk

### Can flagship LLMs already do this without Buurt Check data?

Partially, yes.

Modern LLM products can search the web, produce timely answers with links, and use approximate or precise location when enabled. OpenAI’s ChatGPT Search, for example, can search the web and return sourced, timely answers, and it can optionally use location to improve local results.[^openai-search]

So a motivated user could ask ChatGPT:

> “I’m a family with two kids, budget €600k, working in Amsterdam, want green, quiet, good schools, max 45-minute commute. Which neighborhoods should I consider?”

The answer may be useful.

### Why Buurt Check still has an edge

A general LLM without your structured product layer will struggle to provide:

- Complete national neighborhood coverage.
- Consistent scoring across all neighborhoods.
- Fresh official data.
- Licensed live listing availability.
- Repeatable ranking logic.
- Clear source provenance per metric.
- Alerts when matching homes appear.
- Side-by-side map-based comparison.
- User preference memory and iteration.
- Trustworthy confidence levels.
- A polished, consumer-grade journey.

The defensible edge is not “AI can talk about neighborhoods.” The edge is:

> **Curated data + scoring model + delightful UX + source transparency + live listing action.**

### Product requirement from this risk

Buurt Check must not be a thin ChatGPT wrapper. The app should use AI as the explanation and interaction layer, while the proprietary value sits in:

1. Data pipeline.
2. Neighborhood feature engineering.
3. Matching model.
4. Listing integration.
5. Alerts.
6. UX and storytelling.
7. Trust and source design.

---

## 19. Key risks

| Risk | Severity | Mitigation |
|---|---|---|
| Funda/listing data access is unavailable or expensive | High | Start with neighborhood discovery + outbound listing links; pursue licensed partnerships; support user-pasted listings. |
| AI hallucination damages trust | High | Use deterministic scoring, retrieval, citations, and strict report templates. |
| Product feels like a government dashboard | Medium | Use warm storytelling, visual cards, and Woonkompas framing. |
| Product feels too playful for a serious decision | Medium | Balance delight with evidence, source badges, and confidence scores. |
| Competitors add similar AI features | High | Differentiate through neighborhood-first UX, official-data depth, and alerts. |
| Scoring creates fairness or discrimination concerns | High | Avoid protected traits, use transparent public-interest indicators, review sensitive variables. |
| Data is too stale or inconsistent | Medium | Display freshness, confidence, and “data unavailable” states. |
| Users only want listings, not reports | Medium | Bridge report quickly into listings and alerts. |

---

## 20. Roadmap

### Phase 0 — Validation

- Interview 20–30 home seekers across families, singles/couples, expats, and city-escape movers.
- Test landing page copy.
- Prototype quiz and report with manual scoring.
- Validate whether users save recommended neighborhoods.

### Phase 1 — MVP

- Build data pipeline for selected regions.
- Build quiz.
- Build scoring engine.
- Generate AI reports from structured outputs.
- Launch map + comparison.
- Add email alerts.
- Add basic listing integration or links.

### Phase 2 — Productization

- Expand geographic coverage.
- Add multilingual reports.
- Add saved profiles.
- Add partner/co-buyer sharing.
- Add listing watchlists.
- Add “similar neighborhoods” engine.
- Add confidence and source UI.

### Phase 3 — Commercial scale

- Premium reports.
- Partner integrations.
- Makelaar handoff.
- Mortgage/affordability integrations.
- Rental-specific workflows.
- API/data partnerships.

---

## 21. Open product decisions

1. Should the first paid product be a **premium report**, **alert subscription**, or **partner lead model**?
2. Should MVP focus on **buying**, **renting**, or both from day one?
3. Which geography gives the strongest first validation: Amsterdam region, Randstad, or full Netherlands with lighter data depth?
4. Should the brand stay “Buurt Check,” or should the new flow be branded separately as “Buurt Match” or “Woonkompas”?
5. How much of the report should feel playful versus serious?
6. What listing data partnership is realistic for the first release?

---

## 22. One-line product definition

**Buurt Check helps people who do not know where to live discover their best-fit neighborhoods using official data, AI explanation, and live housing availability.**

---

## References and source notes

[^woon24]: Ministerie van Volkshuisvesting en Ruimtelijke Ordening, *Tussen wensen en wonen: Resultaten van het WoonOnderzoek Nederland 2024*. https://www.volkshuisvestingnederland.nl/binaries/volkshuisvestingnederland/documenten/publicaties/2025/04/10/kernpublicatie-van-het-woon-24/Tussen%2BWensen%2Ben%2BWonen-KernpublicatieWoOn24.pdf

[^cbs-starters]: CBS, *Minder starters op woningmarkt; 25- tot 35-jarigen wonen vaker thuis*, published 24 April 2026. https://www.cbs.nl/nl-nl/nieuws/2026/17/minder-starters-op-woningmarkt-25-tot-35-jarigen-wonen-vaker-thuis

[^cbs-households]: CBS, *Huishoudensprognose 2024–2070: bijna 10 miljoen huishoudens verwacht in 2070*. https://www.cbs.nl/nl-nl/longread/statistische-trends/2024/huishoudensprognose-2024-2070-bijna-10-miljoen-huishoudens-verwacht-in-2070

[^funda-draw]: Funda, *Makkelijker zoeken in specifieke buurten / Teken je zoekgebied*. https://www.funda.nl/meer-weten/producten-en-diensten/wegwijzers/teken-je-zoekgebied/

[^funda-neighborhood]: Funda, example neighborhood information page: *Electrobuurt, Hilversum*. https://www.funda.nl/informatie/hilversum/electrobuurt

[^walter]: Walter Living, product pages for online buying agent, Walter Maps, AI Superagent, and data-driven buying guidance. https://walterliving.com/nl/en/

[^huispedia]: Huispedia Help, *Hoe berekenen jullie mijn Huispedia woningwaarde?* https://huispedia.nl/help/artikel/377/hoe-worden-de-geschatte-woningwaardes-berekend

[^atlas-check]: Atlas Leefomgeving, *Check je plek*. https://www.atlasleefomgeving.nl/check-je-plek

[^atlas-vind]: Atlas Leefomgeving, *Vind je plek*. https://www.atlasleefomgeving.nl/vind-je-plek

[^leefbaarometer-home]: Leefbaarometer, homepage and 2024 data update. https://www.leefbaarometer.nl/

[^leefbaarometer-open]: Leefbaarometer, open data downloads for scores and dimension scores. https://www.leefbaarometer.nl/page/Opendata

[^openai-search]: OpenAI Help Center, *ChatGPT Search*. https://help.openai.com/en/articles/9237897-chatgpt-search
