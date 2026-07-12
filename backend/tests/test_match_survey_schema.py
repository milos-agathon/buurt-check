import re
from pathlib import Path

from app.models.match import MATCH_SURVEY_QUESTION_COUNT
from app.services.match.survey_constants import SURVEY_QUESTION_ORDER
from app.services.match.survey_schema import (
    REQUIRED_SURVEY_QUESTIONS,
    SURVEY_MULTI_SELECT_LIMITS,
    SURVEY_OPTION_VALUES,
    SURVEY_QUESTION_COUNT,
)


def _frontend_question_blocks(source: str) -> dict[str, str]:
    blocks: dict[str, str] = {}
    for match in re.finditer(r"\n  \{\n(?P<body>[\s\S]*?)\n  \},", source):
        body = match.group("body")
        id_match = re.search(r"id: '([^']+)'", body)
        if id_match is not None:
            blocks[id_match.group(1)] = body
    return blocks


def test_survey_question_count_is_derived_from_shared_order() -> None:
    assert MATCH_SURVEY_QUESTION_COUNT == len(SURVEY_QUESTION_ORDER)
    assert SURVEY_QUESTION_COUNT == len(SURVEY_QUESTION_ORDER)


def test_backend_survey_contract_matches_frontend_question_config() -> None:
    frontend_config = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "components"
        / "match-first"
        / "surveyQuestions.ts"
    ).read_text(encoding="utf-8")

    question_blocks = _frontend_question_blocks(frontend_config)
    frontend_ids = list(question_blocks)
    assert frontend_ids == SURVEY_QUESTION_ORDER

    required_frontend_ids = set(
        question_id
        for question_id, block in question_blocks.items()
        if "required: true" in block
    )
    assert required_frontend_ids == REQUIRED_SURVEY_QUESTIONS

    for question_id, expected_values in SURVEY_OPTION_VALUES.items():
        assert question_id in question_blocks
        frontend_values = set(re.findall(r"value: '([^']+)'", question_blocks[question_id]))
        assert frontend_values == set(expected_values)

    for question_id, expected_limit in SURVEY_MULTI_SELECT_LIMITS.items():
        assert question_id in question_blocks
        assert f"maxSelections: {expected_limit}" in question_blocks[question_id]
