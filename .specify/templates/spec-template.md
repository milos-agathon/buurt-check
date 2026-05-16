# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`
**Created**: [DATE]
**Status**: Draft
**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## PRD Traceability *(mandatory)*

<!--
  ACTION REQUIRED: Map every user story, acceptance criterion, functional
  requirement, and success criterion to one or more docs/prd.md requirement IDs
  or sections. Requirements from docs/prd.md override assumptions made in this
  spec.
-->

| Spec Item | PRD Requirement(s) | Journey Step(s) | Traceability Notes |
|-----------|--------------------|-----------------|--------------------|
| User Story 1 | [FR-L#/FR-S#/section] | [landing/survey/results/etc.] | [Why this story belongs to the PRD requirement] |
| Acceptance Scenario 1.1 | [FR#/section] | [journey step] | [Specific acceptance criterion mapping] |
| Functional Requirement FR-001 | [FR#/section] | [journey step] | [Specific capability mapping] |

## Match-First Constitution Constraints *(mandatory)*

<!--
  ACTION REQUIRED: Fill this section for every match-first revamp spec. Mark
  N/A only when the feature demonstrably does not touch that surface.
-->

- **Canonical journey step(s)**: [Which of landing hero -> survey intro -> one-question survey -> review -> backend matching progress -> animated checkmark success -> Netherlands results map -> neighborhood 3D detail -> house click -> existing Dossier -> back to match map are affected]
- **Search treatment**: [How address search stays secondary and does not compete on the first screen]
- **One-decision UI**: [How the spec avoids dashboards, charts, feature grids, long explanations, ads, and unrelated content during onboarding]
- **Bilingual copy**: [Translation key namespaces and Dutch/English parity requirements for all user-facing text]
- **Map performance/fallbacks**: [Confirm 3D houses load/render only after neighborhood selection and only within selected-neighborhood bounds; viewport loading is only paging/LOD inside that neighborhood; include 2D fallback, reduced-motion fallback, non-map list alternative]
- **Model honesty**: [Whether outputs are deterministic/semi-deterministic scores or validated predictive outputs, with evidence for any predictive claims]
- **Dossier preservation**: [Dossier touchpoints, smallest safe change, persistent back-to-map action, regression expectations]
- **Accessibility**: [Keyboard, screen-reader, touch target, contrast, focus, reduced-motion, and non-map alternative requirements]
- **Context preservation**: [Survey answers, session ID, selected neighborhood, map state, language, and Dossier return path]
- **Traceability**: [How every PRD acceptance criterion touched by this spec will map to files, tests/manual verification, and missing/partial/pass status]
- **Small safe changes**: [Current phase boundary, avoided scope expansions, and justification for any framework/dependency/routing/Dossier/map-engine change]
- **Unsupported claims**: [Copy and explanation boundaries; reason codes and data limitations required]
- **Known codebase conflicts**: [Conflict, smallest safe change, owner/follow-up or N/A]

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"] *(PRD: [FR#])*
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

### Data, AI, and Trust Constraints *(mandatory when feature uses data or AI)*

- **Data categories**: [Official public / commercial-listing / mock / derived-internal / missing]
- **Source and freshness**: [How source, timestamp, freshness, and confidence are shown]
- **AI boundary**: [What the LLM may summarize/explain/translate and what structured logic owns]
- **Fairness guardrails**: [Protected/sensitive traits excluded from scoring and recommendation]
- **Listing data mode**: [Licensed provider / adapter mock / outbound placeholder / N/A]
- **Admin visibility**: [Freshness, missing data, source failures, scoring anomalies, guardrail blocks, alert failures]
- **Reason codes and limitations**: [How explanations stay grounded in data-backed fit scores without unsupported promises]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]
