<!--
Sync Impact Report
Version change: template/unratified -> 1.0.0
Modified principles:
- Template placeholder principles -> I. PRD Traceability
- Template placeholder principles -> II. Deterministic Scoring Before AI Explanation
- Template placeholder principles -> III. Evidence-Backed Recommendations
- Template placeholder principles -> IV. Responsible AI and Fairness
- Template placeholder principles -> V. Licensed Listing Data Only
- Template placeholder principles -> VI. Bilingual and Accessible UX
- Template placeholder principles -> VII. Test-First Critical Logic
- Template placeholder principles -> VIII. Product Tone
- Template placeholder principles -> IX. Operational Visibility
- Template placeholder principles -> X. No Thin AI Wrapper
Added sections:
- PRD Requirement Anchors
- Delivery Gates
Removed sections:
- Template placeholder Section 2
- Template placeholder Section 3
Templates requiring updates:
- updated: .specify/templates/plan-template.md
- updated: .specify/templates/spec-template.md
- updated: .specify/templates/tasks-template.md
- updated: .specify/templates/checklist-template.md
- not present: .specify/templates/commands/*.md
Runtime guidance requiring updates:
- updated: CLAUDE.md
Follow-up TODOs:
- None
-->
# Buurt Check Revamp Constitution

## Core Principles

### I. PRD Traceability
Every feature, user story, task, acceptance criterion, and success criterion MUST
map to at least one `docs/prd.md` functional requirement from FR1 through FR14.
Generated specs MUST include a PRD traceability table, plans MUST restate the
relevant PRD anchors, and tasks MUST carry the mapped PRD IDs in their
descriptions. Requirements in `docs/prd.md` override implementation assumptions,
tool defaults, and opportunistic scope changes. When the PRD is ambiguous,
implementation MUST record the assumption and request or document clarification
before irreversible design or code decisions.

Rationale: Buurt Check Revamp is a PRD-led product change. Traceability prevents
thin feature drift and makes every delivery decision auditable against the
agreed product requirements.

### II. Deterministic Scoring Before AI Explanation
Neighborhood matching, fit ranking, confidence scoring, persona overlays,
preference-vector generation, avoid/reconsider labels, and alert triggers MUST
come from structured data and deterministic logic. LLM output MAY summarize,
explain, compare, translate, rewrite, and answer questions using retrieved
evidence and scoring outputs. LLM output MUST NOT create, alter, or be treated as
the source of truth for match scores, confidence values, hard-filter eligibility,
persona assignment, listing availability, or data freshness.

Rationale: The product promise depends on repeatable ranking logic. AI improves
comprehension, but the score must be reproducible, testable, and inspectable.

### III. Evidence-Backed Recommendations
Every recommendation MUST include why it fits, key tradeoffs, data confidence,
and source/freshness metadata whenever data is used. The UI and exported reports
MUST distinguish official public data, commercial/listing data, mock data,
derived/internal metrics, and missing or unavailable data. Missing data MUST be
shown as missing; implementations MUST NOT silently omit sections, invent
metrics, or present stale/mock/commercial data as official data.

Rationale: Users are making high-stakes housing decisions. Trust depends on
showing both the evidence and the limitations behind each recommendation.

### IV. Responsible AI and Fairness
The system MUST NOT score, rank, recommend, personalize, or suppress
recommendations based on protected or sensitive traits. The system MUST NOT make
unsupported claims about crime, safety, ethnicity, income, religion, nationality,
immigration status, or social groups. User-facing copy MUST avoid certainty
language such as "safe", "perfect", "guaranteed", or equivalent Dutch phrasing
unless it appears in a clearly marked quotation from a source and is not adopted
as Buurt Check's claim. Sensitive public-interest indicators MAY be used only
when they are sourced, relevant to an FR, explained neutrally, and reviewed for
fairness risk.

Rationale: Neighborhood discovery can easily become discriminatory or
overconfident. The product must help users reason about places without making
unsupported social claims.

### V. Licensed Listing Data Only
Listing integrations MUST use adapter interfaces and mocks until a licensed
provider is configured. The product MUST NOT scrape listing portals or bypass
listing-site access controls. If no licensed listing provider is configured, the
listing module MUST show clearly labeled mock data, outbound placeholder links,
or an unavailable state. Mock or placeholder listing content MUST NOT affect
live match scores unless the score explicitly identifies it as mock input.

Rationale: Listing access is a strategic dependency and a legal/commercial risk.
Adapters keep the architecture ready without normalizing scraping.

### VI. Bilingual and Accessible UX
All user-facing strings introduced for the MVP MUST support Dutch and English
from the first implementation slice. Core flows for the quiz, report, comparison,
map, listings, save/share, feedback, and alerts MUST be keyboard accessible,
screen-reader understandable where applicable, and responsive across mobile and
desktop viewports. New visual states for source, confidence, mock data, missing
data, and guardrails MUST be perceivable without relying on color alone.

Rationale: The PRD explicitly serves Dutch users, newcomers, and mobile-first
home seekers. Accessibility and bilingual support are product requirements, not
polish.

### VII. Test-First Critical Logic
Scoring, confidence, persona detection, preference-vector generation, report
guardrails, fairness-sensitive filters, listing adapter fallbacks, data
provenance labels, and alerts MUST have tests before implementation is considered
complete. Relevant tests MUST fail before the new implementation is added when
practical for the change type. Build, lint, typecheck, and relevant backend,
frontend, and end-to-end tests MUST pass before any phase is marked complete.
Skipped tests MUST include an explicit reason and a follow-up condition.

Rationale: The riskiest parts of the product are logic and trust boundaries.
They must be verified by executable checks, not only reviewed by reading.

### VIII. Product Tone
The experience MUST feel warm, personal, and slightly playful while remaining
transparent and careful. Playful labels, Woonkompas framing, and personality
language MAY be used only when backed by visible data explanations, tradeoffs,
and confidence context. Playful copy MUST NOT obscure uncertainty, missing data,
or source limitations.

Rationale: The PRD calls for an emotionally engaging product, but housing
decisions require seriousness where evidence or uncertainty matters.

### IX. Operational Visibility
Data freshness, missing data, source failures, provider configuration status,
mock-data usage, scoring anomalies, confidence outliers, report guardrail
blocks, and alert delivery failures MUST be monitorable by admins. Admin views,
logs, metrics, or diagnostics MUST make it possible to identify whether a user
recommendation relied on stale, missing, failed, mock, or commercial data.

Rationale: Trustworthy recommendations require operational visibility into data
quality and system behavior after launch.

### X. No Thin AI Wrapper
The defensible product value MUST sit in curated data pipelines, feature
engineering, matching logic, confidence logic, explainability, UX, alerts, and
licensed listing integrations. AI-only features MUST NOT be accepted unless they
consume structured product outputs or improve a workflow anchored in FR1-FR14.
Any feature that could be replaced by a generic prompt without losing product
value MUST be redesigned before implementation.

Rationale: The PRD identifies LLM commoditization as a core risk. Buurt Check
must compete through product infrastructure and user trust, not generic chat.

## PRD Requirement Anchors

The constitution recognizes these PRD functional requirements as the canonical
delivery anchors for Buurt Check Revamp:

| PRD ID | Anchor |
|--------|--------|
| FR1 | Preference quiz |
| FR2 | Household/persona detection |
| FR3 | Neighborhood scoring engine |
| FR4 | Explainable match output |
| FR5 | AI-generated report |
| FR6 | Neighborhood comparison |
| FR7 | Similar-neighborhood discovery |
| FR8 | Map view |
| FR9 | Listing connection |
| FR10 | Alerts |
| FR11 | Save/share report |
| FR12 | Multilingual support |
| FR13 | Feedback loop |
| FR14 | Admin data dashboard |

Specs, plans, tasks, tests, reviews, and release notes MUST reference these IDs
when they introduce, change, validate, or defer related behavior.

## Delivery Gates

Before Phase 0 research is accepted, each plan MUST identify the relevant PRD
FR1-FR14 anchors, data sources, source categories, AI boundaries, listing-data
mode, accessibility/i18n impact, critical logic tests, and admin visibility
needs. Before Phase 1 design is accepted, the plan MUST show how those gates are
implemented or explicitly deferred with rationale.

Before implementation tasks are accepted, tasks MUST include exact file paths,
PRD FR mappings, required tests for critical logic, data provenance work,
bilingual/accessibility work, licensed listing fallback behavior when relevant,
and operational visibility work when relevant.

Before a phase is complete, the responsible implementer MUST run the relevant
quality gates for the touched areas: backend `ruff check` and pytest,
frontend TypeScript build and Vitest, Playwright for affected core flows, and any
feature-specific verification documented in the plan. A phase with blocked or
skipped gates MUST record the command, reason, residual risk, and follow-up.

## Governance

This constitution supersedes conflicting implementation assumptions, generated
plans, task templates, and informal guidance for the Buurt Check Revamp. The PRD
in `docs/prd.md` remains the product source of truth; this constitution governs
how PRD requirements are translated into implementation.

Amendments MUST include a Sync Impact Report, identify affected principles or
sections, update dependent Spec Kit templates, and state the semantic version
bump. MAJOR changes remove or redefine governance obligations in a
backward-incompatible way. MINOR changes add principles, sections, or materially
expanded requirements. PATCH changes clarify wording without changing compliance
obligations.

All specs, plans, task lists, code reviews, and phase-completion decisions MUST
verify constitution compliance. Violations MAY proceed only when documented in
the plan's Complexity Tracking section with a reason, rejected simpler
alternative, owner, and follow-up review condition.

**Version**: 1.0.0 | **Ratified**: 2026-05-11 | **Last Amended**: 2026-05-11
