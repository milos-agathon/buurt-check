from __future__ import annotations

from collections.abc import Mapping

from app.models.match import SurveyAnswerValidation
from app.services.match.survey_constants import (
    MATCH_SURVEY_QUESTION_COUNT,
    SURVEY_QUESTION_ORDER,
)

SURVEY_QUESTION_COUNT = MATCH_SURVEY_QUESTION_COUNT

REQUIRED_SURVEY_QUESTIONS = frozenset(
    question_id for question_id in SURVEY_QUESTION_ORDER if question_id != "dealbreakers"
)

SURVEY_OPTION_VALUES: dict[str, frozenset[str]] = {
    "intent": frozenset({"buy", "rent", "both"}),
    "household_type": frozenset(
        {
            "single",
            "couple",
            "family_young_child",
            "family_older_child",
            "starter",
            "downsizing",
        }
    ),
    "lifestyle_priorities": frozenset(
        {
            "green_access",
            "calmness",
            "public_transport",
            "schools_childcare",
            "amenities",
            "affordability",
            "environmental_quality",
        }
    ),
    "must_haves": frozenset(
        {
            "parks_nearby",
            "good_transit",
            "schools_nearby",
            "daily_shops",
            "low_traffic",
            "bike_friendly",
            "garden_or_balcony",
        }
    ),
    "dealbreakers": frozenset(
        {
            "high_noise",
            "busy_nightlife",
            "car_dependency",
            "poor_air_quality",
            "flood_risk",
            "low_listing_supply",
        }
    ),
    "housing_types": frozenset(
        {
            "apartment",
            "row_house",
            "family_house",
            "new_build",
            "older_character",
            "garden",
        }
    ),
    "area_character": frozenset(
        {
            "lively_urban",
            "quiet_city",
            "suburban",
            "village",
            "rural_edge",
        }
    ),
    "language": frozenset({"en", "nl"}),
}

SURVEY_MULTI_SELECT_LIMITS = {
    "lifestyle_priorities": 3,
}

PROTECTED_ANSWER_KEYS = frozenset(
    {"nationality", "ethnicity", "religion", "race", "immigration_status"}
)

PAYLOAD_REJECTION_CODES = frozenset(
    {
        "match.warning.invalid_question",
        "match.warning.invalid_answer_value",
        "match.warning.protected_answer_not_allowed",
        "match.warning.too_many_answers",
    }
)

MUST_HAVE_TO_FILTER = {
    "parks_nearby": "green_space",
    "good_transit": "mobility",
    "schools_nearby": "family_fit",
    "daily_shops": "amenities",
    "low_traffic": "environmental_quality",
    "bike_friendly": "mobility",
    "garden_or_balcony": "housing_stock",
}

PRIORITY_TO_WEIGHT_KEY = {
    "green_access": "green_access",
    "calmness": "calmness",
    "public_transport": "mobility",
    "schools_childcare": "family_fit",
    "amenities": "amenities",
    "affordability": "affordability",
    "environmental_quality": "environmental_quality",
}

FAMILY_HOUSEHOLDS = frozenset({"family_young_child", "family_older_child"})


def _invalid(required: bool, code: str) -> SurveyAnswerValidation:
    return SurveyAnswerValidation(valid=False, required=required, error_code=code)


def _valid(required: bool) -> SurveyAnswerValidation:
    return SurveyAnswerValidation(valid=True, required=required, error_code=None)


def _is_missing(value: object) -> bool:
    if value is None:
        return True
    if value == "":
        return True
    if isinstance(value, (list, tuple, set)) and len(value) == 0:
        return True
    return isinstance(value, Mapping) and len(value) == 0


def _valid_int(value: object, *, min_value: int, max_value: int | None = None) -> bool:
    if isinstance(value, bool) or not isinstance(value, int):
        return False
    if value < min_value:
        return False
    return max_value is None or value <= max_value


def _validate_single(question_id: str, value: object, required: bool) -> SurveyAnswerValidation:
    if _is_missing(value):
        return _invalid(required, "match.warning.required_answer") if required else _valid(required)
    if not isinstance(value, str) or value not in SURVEY_OPTION_VALUES[question_id]:
        return _invalid(required, "match.warning.invalid_answer_value")
    return _valid(required)


def _validate_multi(
    question_id: str,
    value: object,
    required: bool,
    *,
    max_count: int | None = None,
) -> SurveyAnswerValidation:
    if _is_missing(value):
        return _invalid(required, "match.warning.required_answer") if required else _valid(required)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return _invalid(required, "match.warning.invalid_answer_value")
    if max_count is not None and len(value) > max_count:
        return _invalid(required, "match.warning.too_many_answers")
    if any(item not in SURVEY_OPTION_VALUES[question_id] for item in value):
        return _invalid(required, "match.warning.invalid_answer_value")
    return _valid(required)


def _validate_budget(
    value: object,
    required: bool,
    *,
    intent: str | None = None,
) -> SurveyAnswerValidation:
    if _is_missing(value):
        return _invalid(required, "match.warning.required_answer")
    if not isinstance(value, Mapping):
        return _invalid(required, "match.warning.invalid_answer_value")
    buy_min = value.get("buy_min")
    buy_max = value.get("buy_max")
    rent_max = value.get("rent_max")
    has_buy_range = _valid_int(buy_min, min_value=0) and _valid_int(buy_max, min_value=1)
    has_rent_cap = _valid_int(rent_max, min_value=1)
    if not has_buy_range and not has_rent_cap:
        return _invalid(required, "match.warning.required_answer")
    if has_buy_range and int(buy_min) > int(buy_max):
        return _invalid(required, "match.warning.invalid_answer_value")
    if intent == "buy" and not has_buy_range:
        return _invalid(required, "match.warning.required_answer")
    if intent == "rent" and not has_rent_cap:
        return _invalid(required, "match.warning.required_answer")
    if intent == "both" and (not has_buy_range or not has_rent_cap):
        return _invalid(required, "match.warning.required_answer")
    return _valid(required)


def _validate_anchor(value: object, required: bool) -> SurveyAnswerValidation:
    if _is_missing(value):
        return _invalid(required, "match.warning.required_answer")
    if not isinstance(value, Mapping):
        return _invalid(required, "match.warning.invalid_answer_value")
    label = value.get("label")
    anchor_type = value.get("type", "city")
    if not isinstance(label, str) or not label.strip():
        return _invalid(required, "match.warning.required_answer")
    if anchor_type not in {"city", "station", "work", "school", "address"}:
        return _invalid(required, "match.warning.invalid_answer_value")
    return _valid(required)


def _validate_commute(value: object, required: bool) -> SurveyAnswerValidation:
    if _is_missing(value):
        return _invalid(required, "match.warning.required_answer")
    if not isinstance(value, Mapping):
        return _invalid(required, "match.warning.invalid_answer_value")
    max_minutes = value.get("max_minutes")
    if not _valid_int(max_minutes, min_value=5, max_value=120):
        return _invalid(required, "match.warning.invalid_answer_value")
    return _valid(required)


def normalize_survey_answers(answers: Mapping[str, object]) -> dict[str, object]:
    normalized = dict(answers)
    intent = normalized.get("intent")
    budget = normalized.get("budget")
    if intent not in SURVEY_OPTION_VALUES["intent"] or not isinstance(budget, Mapping):
        return normalized

    next_budget: dict[str, object] = {}
    if intent != "rent":
        if "buy_min" in budget:
            next_budget["buy_min"] = budget["buy_min"]
        if "buy_max" in budget:
            next_budget["buy_max"] = budget["buy_max"]
    if intent in {"rent", "both"} and "rent_max" in budget:
        next_budget["rent_max"] = budget["rent_max"]

    if next_budget:
        normalized["budget"] = next_budget
    else:
        normalized.pop("budget", None)
    return normalized


def validate_answer_value(question_id: str, value: object) -> SurveyAnswerValidation:
    if question_id not in SURVEY_QUESTION_ORDER:
        return _invalid(False, "match.warning.invalid_question")
    required = question_id in REQUIRED_SURVEY_QUESTIONS
    if question_id in {"intent", "household_type", "area_character", "language"}:
        return _validate_single(question_id, value, required)
    if question_id == "budget":
        return _validate_budget(value, required)
    if question_id == "anchor_location":
        return _validate_anchor(value, required)
    if question_id == "commute":
        return _validate_commute(value, required)
    if question_id == "lifestyle_priorities":
        return _validate_multi(
            question_id,
            value,
            required,
            max_count=SURVEY_MULTI_SELECT_LIMITS[question_id],
        )
    if question_id in {"must_haves", "dealbreakers", "housing_types"}:
        return _validate_multi(question_id, value, required)
    return _invalid(required, "match.warning.invalid_question")


def validate_survey_answers(answers: Mapping[str, object]) -> dict[str, SurveyAnswerValidation]:
    validation: dict[str, SurveyAnswerValidation] = {}
    for question_id in SURVEY_QUESTION_ORDER:
        validation[question_id] = validate_answer_value(question_id, answers.get(question_id))
    intent_value = answers.get("intent")
    intent = (
        intent_value
        if isinstance(intent_value, str) and intent_value in SURVEY_OPTION_VALUES["intent"]
        else None
    )
    validation["budget"] = _validate_budget(
        answers.get("budget"),
        "budget" in REQUIRED_SURVEY_QUESTIONS,
        intent=intent,
    )
    for question_id in answers:
        if question_id in PROTECTED_ANSWER_KEYS:
            validation[question_id] = _invalid(
                False, "match.warning.protected_answer_not_allowed"
            )
        elif question_id not in SURVEY_QUESTION_ORDER:
            validation[question_id] = _invalid(False, "match.warning.invalid_question")
    return validation


def survey_is_complete(validation: Mapping[str, SurveyAnswerValidation]) -> bool:
    return all(validation[question_id].valid for question_id in REQUIRED_SURVEY_QUESTIONS)


def validation_has_invalid_payload(validation: Mapping[str, SurveyAnswerValidation]) -> bool:
    return any(
        item.error_code in PAYLOAD_REJECTION_CODES
        for item in validation.values()
    )


def first_invalid_payload_error(
    validation: Mapping[str, SurveyAnswerValidation],
) -> str | None:
    for item in validation.values():
        if item.error_code in PAYLOAD_REJECTION_CODES:
            return item.error_code
    return None
