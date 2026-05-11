from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from app.models.match import (
    ConfidenceScore,
    DataFreshnessStatus,
    GuardrailEvent,
    ReportClaim,
    ReportInput,
    ReportOutput,
    ReportSection,
    ReportSectionType,
)


class ReportGenerator(Protocol):
    async def generate(self, report_input: ReportInput) -> ReportOutput:
        ...


@dataclass(frozen=True)
class ValidatedReportResult:
    output: ReportOutput
    guardrail_events: list[GuardrailEvent]


class ReportGuardrailError(ValueError):
    def __init__(self, events: list[GuardrailEvent]) -> None:
        super().__init__("AI report output failed guardrail validation")
        self.events = events


SECTION_ORDER: list[ReportSectionType] = [
    "profile_summary",
    "top_neighborhood_matches",
    "why_these_neighborhoods_fit",
    "tradeoffs_and_watchouts",
    "similar_neighborhoods",
    "live_homes_available_now",
    "suggested_alerts",
    "next_steps",
]

PROTECTED_TERMS = {
    "age group",
    "disability",
    "disabled",
    "ethnic",
    "ethnicity",
    "gender",
    "immigration status",
    "nationality",
    "race",
    "religion",
    "sexual orientation",
}
SAFETY_TERMS = {"crime", "crime-free", "criminal", "safe", "safest", "safety"}
METRIC_TERMS = {
    "affordability",
    "amenities",
    "calmness",
    "confidence",
    "environmental",
    "green",
    "mobility",
    "noise",
    "score",
}
CERTAINTY_TERMS = {"guaranteed", "guarantees", "crime-free", "perfectly safe"}
NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")


def _normalized_text(text: str) -> str:
    return text.casefold()


def _event(
    event_type: str,
    *,
    action_taken: str = "blocked",
    details: dict[str, object] | None = None,
) -> GuardrailEvent:
    return GuardrailEvent(
        event_type=event_type,
        action_taken=action_taken,  # type: ignore[arg-type]
        details=details or {},
    )


def _allowed_numbers(report_input: ReportInput) -> set[str]:
    values: set[str] = set()
    for recommendation in report_input.recommendations:
        for key in ("fit_score", "rank"):
            value = recommendation.get(key)
            if isinstance(value, int | float):
                values.add(str(int(value)) if float(value).is_integer() else str(value))
        confidence = recommendation.get("confidence")
        if isinstance(confidence, dict):
            score = confidence.get("score")
            if isinstance(score, int | float):
                values.add(str(int(score)) if float(score).is_integer() else str(score))
        for driver in recommendation.get("score_drivers", []):
            if isinstance(driver, dict):
                for key in ("score", "impact"):
                    value = driver.get(key)
                    if isinstance(value, int | float):
                        values.add(str(int(value)) if float(value).is_integer() else str(value))
    for evidence in report_input.evidence_items:
        values.add(str(evidence.confidence.score))
    return values


def _recommendation_driver_features(report_input: ReportInput) -> dict[str, set[str]]:
    features_by_neighborhood: dict[str, set[str]] = {}
    for recommendation in report_input.recommendations:
        neighborhood_id = recommendation.get("neighborhood_id")
        if not isinstance(neighborhood_id, str):
            continue
        features: set[str] = set()
        for driver in recommendation.get("score_drivers", []):
            if isinstance(driver, dict) and isinstance(driver.get("feature"), str):
                features.add(str(driver["feature"]))
        features_by_neighborhood[neighborhood_id] = features
    return features_by_neighborhood


def _evidence_metric_keys(report_input: ReportInput, evidence_refs: list[str]) -> set[str]:
    evidence_by_id = {item.evidence_id: item for item in report_input.evidence_items}
    keys: set[str] = set()
    for evidence_ref in evidence_refs:
        evidence = evidence_by_id.get(evidence_ref)
        if evidence:
            keys.update(evidence.metric_keys)
    return keys


def _validate_claim(
    claim: ReportClaim,
    section: ReportSection,
    report_input: ReportInput,
    events: list[GuardrailEvent],
) -> None:
    text = _normalized_text(claim.text)
    evidence_ids = {item.evidence_id for item in report_input.evidence_items}
    unknown_evidence = [ref for ref in claim.evidence_refs if ref not in evidence_ids]
    has_metric_language = bool(NUMBER_RE.search(claim.text)) or any(
        term in text for term in METRIC_TERMS
    )

    if not claim.evidence_refs or unknown_evidence:
        events.append(
            _event(
                "missing_citation",
                details={
                    "section_type": section.section_type,
                    "claim": claim.text,
                    "unknown_evidence_refs": unknown_evidence,
                },
            )
        )
        return

    unsupported_numbers = sorted(
        set(NUMBER_RE.findall(claim.text)) - _allowed_numbers(report_input)
    )
    if unsupported_numbers:
        events.append(
            _event(
                "unsupported_claim",
                details={"claim": claim.text, "unsupported_numbers": unsupported_numbers},
            )
        )
        return

    if any(term in text for term in PROTECTED_TERMS):
        events.append(
            _event("protected_trait_claim", details={"claim": claim.text})
        )
        return

    evidence_metric_keys = _evidence_metric_keys(report_input, claim.evidence_refs)
    if any(term in text for term in SAFETY_TERMS) and "safety_context" not in evidence_metric_keys:
        events.append(
            _event("unsupported_safety_claim", details={"claim": claim.text})
        )
        return

    if any(term in text for term in CERTAINTY_TERMS):
        events.append(_event("certainty_language", details={"claim": claim.text}))
        return

    if has_metric_language and not claim.source_refs:
        events.append(
            _event("missing_citation", details={"claim": claim.text, "reason": "source_refs"})
        )
        return

    if section.neighborhood_id and claim.score_driver_refs:
        allowed_drivers = _recommendation_driver_features(report_input).get(
            section.neighborhood_id,
            set(),
        )
        unknown_drivers = sorted(set(claim.score_driver_refs) - allowed_drivers)
        if unknown_drivers:
            events.append(
                _event(
                    "score_driver_mismatch",
                    details={
                        "claim": claim.text,
                        "neighborhood_id": section.neighborhood_id,
                        "unknown_score_driver_refs": unknown_drivers,
                    },
                )
            )


def validate_report_output(output: ReportOutput, report_input: ReportInput) -> ReportOutput:
    events: list[GuardrailEvent] = []
    if output.locale != report_input.locale:
        events.append(
            _event(
                "schema_invalid",
                details={"expected_locale": report_input.locale, "actual_locale": output.locale},
            )
        )

    if output.sections:
        for section in output.sections:
            if section.claims:
                for claim in section.claims:
                    _validate_claim(claim, section, report_input, events)
            else:
                events.append(
                    _event(
                        "missing_citation",
                        details={
                            "section_type": section.section_type,
                            "reason": "section has no claims",
                        },
                    )
                )

    if events:
        raise ReportGuardrailError(events)
    return output


def _source_refs(report_input: ReportInput, evidence_refs: list[str]) -> list[str]:
    evidence_by_id = {item.evidence_id: item for item in report_input.evidence_items}
    refs: set[str] = set()
    for evidence_ref in evidence_refs:
        evidence = evidence_by_id.get(evidence_ref)
        if evidence:
            refs.update(evidence.source_refs)
    return sorted(refs)


def _claim(
    *,
    text: str,
    evidence_refs: list[str],
    report_input: ReportInput,
    score_driver_refs: list[str] | None = None,
) -> ReportClaim:
    confidence_score = min(
        [
            item.confidence.score
            for item in report_input.evidence_items
            if item.evidence_id in evidence_refs
        ]
        or [60]
    )
    freshness_values = [
        item.freshness_status
        for item in report_input.evidence_items
        if item.evidence_id in evidence_refs
    ]
    freshness = freshness_values[0] if freshness_values else DataFreshnessStatus.unavailable
    return ReportClaim(
        text=text,
        evidence_refs=evidence_refs,
        source_refs=_source_refs(report_input, evidence_refs),
        freshness_status=freshness,
        confidence=ConfidenceScore(
            score=confidence_score,
            reasons=["Generated from structured evidence."],
        ),
        score_driver_refs=score_driver_refs or [],
    )


def _top_recommendation(report_input: ReportInput) -> dict[str, object]:
    return report_input.recommendations[0] if report_input.recommendations else {}


def _recommendation_name(recommendation: dict[str, object]) -> str:
    value = (
        recommendation.get("name")
        or recommendation.get("neighborhood_id")
        or "selected neighborhood"
    )
    return str(value)


def _recommendation_score(recommendation: dict[str, object]) -> int:
    value = recommendation.get("fit_score")
    return int(value) if isinstance(value, int | float) else 0


def _evidence_refs(recommendation: dict[str, object], report_input: ReportInput) -> list[str]:
    refs = recommendation.get("evidence_refs")
    if isinstance(refs, list) and refs:
        return [str(ref) for ref in refs]
    return [report_input.evidence_items[0].evidence_id]


def _driver_refs(recommendation: dict[str, object]) -> list[str]:
    drivers = recommendation.get("score_drivers", [])
    if not isinstance(drivers, list):
        return []
    return [
        str(driver["feature"])
        for driver in drivers
        if isinstance(driver, dict) and isinstance(driver.get("feature"), str)
    ]


def _section_text(
    locale: str,
    section_type: ReportSectionType,
    recommendation: dict[str, object],
) -> tuple[str, str]:
    name = _recommendation_name(recommendation)
    score = _recommendation_score(recommendation)
    if locale == "nl":
        texts = {
            "profile_summary": (
                "Profielsamenvatting",
                "Je voorkeuren zijn vertaald naar een gestructureerd buurtprofiel.",
            ),
            "top_neighborhood_matches": (
                "Beste buurtmatches",
                f"{name} staat bovenaan met matchscore {score}.",
            ),
            "why_these_neighborhoods_fit": (
                "Waarom deze buurten passen",
                f"{name} sluit aan op de belangrijkste score-drivers uit je profiel.",
            ),
            "tradeoffs_and_watchouts": (
                "Afwegingen en aandachtspunten",
                f"Controleer bij {name} de genoemde trade-offs en bronbeperkingen.",
            ),
            "similar_neighborhoods": (
                "Vergelijkbare buurten",
                "Vergelijkbare buurten worden alleen getoond wanneer er voldoende "
                "gedeelde kenmerken zijn.",
            ),
            "live_homes_available_now": (
                "Beschikbare woningen nu",
                "Live woningaanbod is nog niet gekoppeld; deze staat toont mock- "
                "of placeholderinformatie.",
            ),
            "suggested_alerts": (
                "Voorgestelde alerts",
                f"Maak een alert voor {name} met je budget, woningtype en zoekdoel.",
            ),
            "next_steps": (
                "Volgende stappen",
                "Vergelijk minimaal drie buurten en controleer bronnen, versheid "
                "en beperkingen.",
            ),
        }
    else:
        texts = {
            "profile_summary": (
                "Profile summary",
                "Your preferences are translated into a structured neighborhood profile.",
            ),
            "top_neighborhood_matches": (
                "Top neighborhood matches",
                f"{name} leads the list with match score {score}.",
            ),
            "why_these_neighborhoods_fit": (
                "Why these neighborhoods fit",
                f"{name} fits the main score drivers from your profile.",
            ),
            "tradeoffs_and_watchouts": (
                "Tradeoffs and watchouts",
                f"Check the listed tradeoffs and source limitations for {name}.",
            ),
            "similar_neighborhoods": (
                "Similar neighborhoods",
                "Similar neighborhoods appear only when enough shared features "
                "are available.",
            ),
            "live_homes_available_now": (
                "Live homes available now",
                "Live supply is not connected yet; this state shows mock or "
                "placeholder listing context.",
            ),
            "suggested_alerts": (
                "Suggested alerts",
                f"Create an alert for {name} using your budget, property type, "
                "and journey intent.",
            ),
            "next_steps": (
                "Next steps",
                "Compare at least three neighborhoods and review sources, freshness, "
                "and limitations.",
            ),
        }
    return texts[section_type]


def build_deterministic_fallback_report(report_input: ReportInput) -> ReportOutput:
    recommendation = _top_recommendation(report_input)
    evidence_refs = _evidence_refs(recommendation, report_input)
    driver_refs = _driver_refs(recommendation)
    sections: list[ReportSection] = []
    for section_type in SECTION_ORDER:
        title, body = _section_text(report_input.locale, section_type, recommendation)
        sections.append(
            ReportSection(
                section_type=section_type,
                title=title,
                body=body,
                neighborhood_id=(
                    str(recommendation.get("neighborhood_id"))
                    if section_type
                    in {
                        "top_neighborhood_matches",
                        "why_these_neighborhoods_fit",
                        "tradeoffs_and_watchouts",
                    }
                    and recommendation.get("neighborhood_id")
                    else None
                ),
                claims=[
                    _claim(
                        text=body,
                        evidence_refs=evidence_refs,
                        report_input=report_input,
                        score_driver_refs=driver_refs
                        if section_type
                        in {"why_these_neighborhoods_fit", "top_neighborhood_matches"}
                        else [],
                    )
                ],
            )
        )

    return ReportOutput(
        locale=report_input.locale,
        validation_status="fallback_used",
        generated_by="deterministic_fallback",
        sections=sections,
        profile_narrative=sections[0].body,
        recommendation_sections=[
            section.model_dump(mode="json")
            for section in sections
            if section.section_type in {"top_neighborhood_matches", "why_these_neighborhoods_fit"}
        ],
        limitations=report_input.approved_limitations,
    )


class DeterministicReportGenerator:
    async def generate(self, report_input: ReportInput) -> ReportOutput:
        return build_deterministic_fallback_report(report_input)


async def generate_validated_report(
    report_input: ReportInput,
    *,
    generator: ReportGenerator | None = None,
) -> ValidatedReportResult:
    generator = generator or DeterministicReportGenerator()
    try:
        output = await generator.generate(report_input)
        return ValidatedReportResult(
            output=validate_report_output(output, report_input),
            guardrail_events=[],
        )
    except ReportGuardrailError as exc:
        fallback = build_deterministic_fallback_report(report_input)
        events = [
            *exc.events,
            _event(
                "schema_invalid",
                action_taken="fallback_used",
                details={"reason": "AI output failed validation"},
            ),
        ]
        return ValidatedReportResult(output=fallback, guardrail_events=events)
    except Exception as exc:
        fallback = build_deterministic_fallback_report(report_input)
        return ValidatedReportResult(
            output=fallback,
            guardrail_events=[
                _event(
                    "provider_unavailable",
                    action_taken="fallback_used",
                    details={"error": exc.__class__.__name__},
                )
            ],
        )
