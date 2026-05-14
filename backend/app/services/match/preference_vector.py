from __future__ import annotations

import json
from collections.abc import Mapping
from hashlib import sha256

from app.models.match import PreferenceVector
from app.services.match.survey_schema import (
    FAMILY_HOUSEHOLDS,
    MUST_HAVE_TO_FILTER,
    PRIORITY_TO_WEIGHT_KEY,
    PROTECTED_ANSWER_KEYS,
    SURVEY_QUESTION_ORDER,
    survey_is_complete,
    validate_survey_answers,
)

METHOD_VERSION = "preference-vector-v2"


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _stable_id(prefix: str, payload: object) -> str:
    digest = sha256(_canonical_json(payload).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


def _read_dict(value: object) -> dict[str, object]:
    return dict(value) if isinstance(value, Mapping) else {}


def _read_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _read_int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _normalize_weights(points: Mapping[str, float]) -> dict[str, float]:
    positive = {key: value for key, value in points.items() if value > 0}
    total = sum(positive.values())
    if total <= 0:
        return {}
    return {key: value / total for key, value in sorted(positive.items())}


def _raw_answer_refs(answers: Mapping[str, object]) -> dict[str, object]:
    return {
        question_id: answers[question_id]
        for question_id in SURVEY_QUESTION_ORDER
        if question_id in answers and question_id not in PROTECTED_ANSWER_KEYS
    }


def build_preference_vector_from_answers(
    *,
    session_id: str,
    locale: str,
    answers: Mapping[str, object],
    answer_version: int,
) -> PreferenceVector:
    validation = validate_survey_answers(answers)
    if not survey_is_complete(validation):
        raise ValueError("match.warning.answers_incomplete")

    intent = str(answers["intent"])
    budget = _read_dict(answers["budget"])
    commute = _read_dict(answers["commute"])
    anchor = _read_dict(answers["anchor_location"])
    household_type = str(answers["household_type"])
    language = str(answers.get("language") or locale)
    lifestyle_priorities = _read_string_list(answers.get("lifestyle_priorities"))
    must_haves = _read_string_list(answers.get("must_haves"))
    dealbreakers = _read_string_list(answers.get("dealbreakers"))
    housing_types = _read_string_list(answers.get("housing_types"))
    area_character = str(answers["area_character"])

    hard_filters = [f"intent:{intent}", "budget", "commute"]
    for must_have in must_haves:
        mapped = MUST_HAVE_TO_FILTER.get(must_have)
        if mapped and mapped not in hard_filters:
            hard_filters.append(mapped)

    points: dict[str, float] = {}
    for index, priority in enumerate(lifestyle_priorities):
        mapped = PRIORITY_TO_WEIGHT_KEY.get(priority)
        if mapped:
            points[mapped] = points.get(mapped, 0.0) + float(3 - index)
    points["affordability"] = points.get("affordability", 0.0) + 1.0
    points["mobility"] = points.get("mobility", 0.0) + 1.0
    if household_type in FAMILY_HOUSEHOLDS:
        points["family_fit"] = points.get("family_fit", 0.0) + 1.0
    for must_have in must_haves:
        mapped = MUST_HAVE_TO_FILTER.get(must_have)
        if mapped:
            points[mapped] = points.get(mapped, 0.0) + 1.0

    raw_answer_refs = _raw_answer_refs(answers)
    vector_payload = {
        "session_id": session_id,
        "answer_version": answer_version,
        "raw_answer_refs": raw_answer_refs,
        "method_version": METHOD_VERSION,
    }
    vector_version = sha256(_canonical_json(vector_payload).encode("utf-8")).hexdigest()
    profile_id = _stable_id("profile", [session_id, household_type, language])
    vector_id = _stable_id("pv", vector_payload)
    budget_min_cents = _read_int(budget.get("buy_min")) if intent in {"buy", "both"} else None
    budget_max_cents = _read_int(budget.get("buy_max")) if intent in {"buy", "both"} else None
    monthly_rent_max_cents = (
        _read_int(budget.get("rent_max")) if intent in {"rent", "both"} else None
    )

    return PreferenceVector(
        preference_vector_id=vector_id,
        session_id=session_id,
        profile_id=profile_id,
        journey_intent=intent,  # type: ignore[arg-type]
        budget_min_cents=budget_min_cents,
        budget_max_cents=budget_max_cents,
        monthly_rent_max_cents=monthly_rent_max_cents,
        anchor_locations=[
            {
                "type": anchor.get("type", "city"),
                "label": anchor.get("label"),
                "query": anchor.get("label"),
            }
        ],
        commute_limits=[
            {
                "mode": "public_transport",
                "max_minutes": commute.get("max_minutes"),
            }
        ],
        property_types=housing_types,
        hard_filters=hard_filters,
        nice_to_haves=[f"area_character:{area_character}", *lifestyle_priorities],
        avoid_signals=dealbreakers,
        lifestyle_weights=_normalize_weights(points),
        persona_inputs={
            "household_type": household_type,
            "area_character": area_character,
            "language_preference": language,
        },
        locale=language,  # type: ignore[arg-type]
        method_version=METHOD_VERSION,
        source_answer_version=answer_version,
        vector_version=vector_version,
        raw_answer_refs=raw_answer_refs,
        warnings=[],
    )
