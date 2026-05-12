from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import settings
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
    "social group",
    "sexual orientation",
    "etniciteit",
    "geslacht",
    "handicap",
    "nationaliteit",
    "ras",
    "religie",
    "seksuele orientatie",
}
SAFETY_TERMS = {
    "crime",
    "crime-free",
    "criminal",
    "safe",
    "safest",
    "safety",
    "criminaliteit",
    "misdaad",
    "veilig",
    "veiligheid",
    "veiligste",
}
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
CERTAINTY_TERMS = {
    "always",
    "certain",
    "crime-free",
    "guarantee",
    "guaranteed",
    "guarantees",
    "perfect",
    "perfectly safe",
    "will be",
    "altijd",
    "gegarandeerd",
    "garandeert",
    "perfect",
    "zeker",
}
FORBIDDEN_ADVICE_TERMS = {
    "bid",
    "bidding",
    "legal advice",
    "mortgage",
    "offer over asking",
    "tax advice",
    "valuation",
    "bied",
    "bieden",
    "belastingadvies",
    "hypotheek",
    "juridisch advies",
    "overbieden",
    "taxatie",
    "waardering",
}
HAPPINESS_TERMS = {"happiness", "happy", "geluk", "gelukkig"}
NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")
FRESHNESS_ORDER = {
    DataFreshnessStatus.unavailable: 0,
    DataFreshnessStatus.conflict: 1,
    DataFreshnessStatus.stale: 2,
    DataFreshnessStatus.aging: 3,
    DataFreshnessStatus.mock: 4,
    DataFreshnessStatus.current: 5,
}


def _normalized_text(text: str) -> str:
    return text.casefold()


def _contains_any_term(normalized_text: str, terms: set[str]) -> bool:
    return any(
        re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", normalized_text)
        for term in terms
    )


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


def _freshness_for_evidence(
    report_input: ReportInput,
    evidence_refs: list[str],
) -> DataFreshnessStatus:
    evidence_by_id = {item.evidence_id: item for item in report_input.evidence_items}
    freshness_values = [
        evidence.freshness_status
        for evidence_ref in evidence_refs
        if (evidence := evidence_by_id.get(evidence_ref)) is not None
    ]
    if not freshness_values:
        return DataFreshnessStatus.unavailable
    return min(freshness_values, key=lambda status: FRESHNESS_ORDER[status])


def _confidence_for_evidence(report_input: ReportInput, evidence_refs: list[str]) -> int:
    evidence_by_id = {item.evidence_id: item for item in report_input.evidence_items}
    confidence_values = [
        evidence.confidence.score
        for evidence_ref in evidence_refs
        if (evidence := evidence_by_id.get(evidence_ref)) is not None
    ]
    return min(confidence_values or [60])


def _append_text_guardrail_events(
    text: str,
    report_input: ReportInput,
    events: list[GuardrailEvent],
    *,
    field_path: str,
    evidence_metric_keys: set[str] | None = None,
) -> None:
    normalized = _normalized_text(text)
    unsupported_numbers = sorted(set(NUMBER_RE.findall(text)) - _allowed_numbers(report_input))
    if unsupported_numbers:
        events.append(
            _event(
                "unsupported_claim",
                details={
                    "field_path": field_path,
                    "text": text,
                    "unsupported_numbers": unsupported_numbers,
                },
            )
        )
    if _contains_any_term(normalized, PROTECTED_TERMS):
        events.append(
            _event("protected_trait_claim", details={"field_path": field_path, "text": text})
        )
    if _contains_any_term(normalized, SAFETY_TERMS) and (
        not evidence_metric_keys or "safety_context" not in evidence_metric_keys
    ):
        events.append(
            _event(
                "unsupported_safety_claim",
                details={"field_path": field_path, "text": text},
            )
        )
    if _contains_any_term(normalized, CERTAINTY_TERMS | HAPPINESS_TERMS):
        events.append(
            _event("certainty_language", details={"field_path": field_path, "text": text})
        )
    if _contains_any_term(normalized, FORBIDDEN_ADVICE_TERMS):
        events.append(
            _event("forbidden_advice_claim", details={"field_path": field_path, "text": text})
        )


def _validate_claim(
    claim: ReportClaim,
    section: ReportSection,
    report_input: ReportInput,
    events: list[GuardrailEvent],
) -> None:
    text = _normalized_text(claim.text)
    evidence_ids = {item.evidence_id for item in report_input.evidence_items}
    unknown_evidence = [ref for ref in claim.evidence_refs if ref not in evidence_ids]
    has_metric_language = bool(NUMBER_RE.search(claim.text)) or _contains_any_term(
        text,
        METRIC_TERMS,
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

    evidence_metric_keys = _evidence_metric_keys(report_input, claim.evidence_refs)
    _append_text_guardrail_events(
        claim.text,
        report_input,
        events,
        field_path=f"section.{section.section_type}.claim.text",
        evidence_metric_keys=evidence_metric_keys,
    )

    if has_metric_language and not claim.source_refs:
        events.append(
            _event("missing_citation", details={"claim": claim.text, "reason": "source_refs"})
        )
        return

    expected_source_refs = set(_source_refs(report_input, claim.evidence_refs))
    actual_source_refs = set(claim.source_refs)
    if expected_source_refs != actual_source_refs:
        events.append(
            _event(
                "source_ref_mismatch",
                details={
                    "claim": claim.text,
                    "expected_source_refs": sorted(expected_source_refs),
                    "actual_source_refs": sorted(actual_source_refs),
                },
            )
        )

    expected_freshness = _freshness_for_evidence(report_input, claim.evidence_refs)
    if claim.freshness_status != expected_freshness:
        events.append(
            _event(
                "freshness_mismatch",
                details={
                    "claim": claim.text,
                    "expected_freshness_status": expected_freshness.value,
                    "actual_freshness_status": claim.freshness_status.value,
                },
            )
        )

    expected_confidence = _confidence_for_evidence(report_input, claim.evidence_refs)
    if claim.confidence.score != expected_confidence:
        events.append(
            _event(
                "confidence_mismatch",
                details={
                    "claim": claim.text,
                    "expected_confidence": expected_confidence,
                    "actual_confidence": claim.confidence.score,
                },
            )
        )

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


def _validate_section_text(
    section: ReportSection,
    report_input: ReportInput,
    events: list[GuardrailEvent],
) -> None:
    for field_name in ("title", "body"):
        _append_text_guardrail_events(
            str(getattr(section, field_name)),
            report_input,
            events,
            field_path=f"section.{section.section_type}.{field_name}",
        )


def _validate_recommendation_section_text(
    recommendation_section: dict[str, object],
    index: int,
    report_input: ReportInput,
    events: list[GuardrailEvent],
) -> None:
    for field_name in ("title", "body"):
        value = recommendation_section.get(field_name)
        if isinstance(value, str):
            _append_text_guardrail_events(
                value,
                report_input,
                events,
                field_path=f"recommendation_sections.{index}.{field_name}",
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
            _validate_section_text(section, report_input, events)
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
    _append_text_guardrail_events(
        output.profile_narrative,
        report_input,
        events,
        field_path="profile_narrative",
    )
    for index, recommendation_section in enumerate(output.recommendation_sections):
        _validate_recommendation_section_text(
            recommendation_section,
            index,
            report_input,
            events,
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
    confidence_score = _confidence_for_evidence(report_input, evidence_refs)
    freshness = _freshness_for_evidence(report_input, evidence_refs)
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


def _nullable_string_schema() -> dict[str, object]:
    return {"anyOf": [{"type": "string"}, {"type": "null"}]}


def _confidence_schema() -> dict[str, object]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "score": {"type": "integer", "minimum": 0, "maximum": 100},
            "label": {"enum": ["high", "medium", "low"]},
            "reasons": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["score", "label", "reasons"],
    }


def _report_output_schema() -> dict[str, object]:
    claim_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "text": {"type": "string"},
            "evidence_refs": {"type": "array", "items": {"type": "string"}},
            "source_refs": {"type": "array", "items": {"type": "string"}},
            "freshness_status": {"enum": [status.value for status in DataFreshnessStatus]},
            "confidence": _confidence_schema(),
            "score_driver_refs": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "text",
            "evidence_refs",
            "source_refs",
            "freshness_status",
            "confidence",
            "score_driver_refs",
        ],
    }
    section_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "section_type": {"enum": SECTION_ORDER},
            "title": {"type": "string"},
            "body": {"type": "string"},
            "neighborhood_id": _nullable_string_schema(),
            "claims": {"type": "array", "items": claim_schema},
        },
        "required": ["section_type", "title", "body", "neighborhood_id", "claims"],
    }
    recommendation_section_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "section_type": {"enum": SECTION_ORDER},
            "title": {"type": "string"},
            "body": {"type": "string"},
            "neighborhood_id": _nullable_string_schema(),
        },
        "required": ["section_type", "title", "body", "neighborhood_id"],
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "locale": {"enum": ["en", "nl"]},
            "validation_status": {"enum": ["passed"]},
            "generated_by": {"enum": ["ai"]},
            "sections": {"type": "array", "items": section_schema},
            "profile_narrative": {"type": "string"},
            "recommendation_sections": {
                "type": "array",
                "items": recommendation_section_schema,
            },
            "limitations": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "locale",
            "validation_status",
            "generated_by",
            "sections",
            "profile_narrative",
            "recommendation_sections",
            "limitations",
        ],
    }


def _extract_output_text(payload: dict[str, object]) -> str:
    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text

    fragments: list[str] = []
    output = payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for content_item in content:
                if not isinstance(content_item, dict):
                    continue
                text = content_item.get("text")
                if isinstance(text, str):
                    fragments.append(text)
    text = "".join(fragments).strip()
    if not text:
        raise ValueError("OpenAI response did not include output text")
    return text


class OpenAIResponsesReportGenerator:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def generate(self, report_input: ReportInput) -> ReportOutput:
        if not self.api_key:
            raise RuntimeError("OpenAI API key is not configured")

        prompt = (
            "Generate a concise bilingual-safe Buurt Check neighborhood report as JSON. "
            "Use only the provided report_input evidence, source_refs, score_driver_refs, "
            "approved limitations, and deterministic scores. Do not add safety, protected-trait, "
            "price, or live-listing claims unless directly supported. Every claim must include "
            "evidence_refs and source_refs from report_input. JSON only."
        )
        request_body = {
            "model": self.model,
            "store": False,
            "input": [
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": json.dumps(report_input.model_dump(mode="json")),
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "buurt_match_report",
                    "strict": True,
                    "schema": _report_output_schema(),
                }
            },
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/responses",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
        return ReportOutput.model_validate_json(_extract_output_text(response.json()))


def build_configured_report_generator() -> ReportGenerator:
    if (
        settings.match_ai_report_provider_mode == "openai"
        and settings.match_ai_report_openai_api_key
    ):
        return OpenAIResponsesReportGenerator(
            api_key=settings.match_ai_report_openai_api_key,
            base_url=settings.match_ai_report_openai_base_url,
            model=settings.match_ai_report_openai_model,
            timeout_seconds=settings.match_ai_report_timeout_seconds,
        )
    return DeterministicReportGenerator()


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
