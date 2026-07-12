from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.db import get_db
from app.models.match import (
    MatchSessionCreateRequest,
    MatchSessionCreateResponse,
    MatchSessionResponse,
    PreferenceVector,
    SurveyAnswerPatchRequest,
    SurveyAnswerPatchResponse,
    SurveyAnswerValidation,
)
from app.services.match.preference_vector import build_preference_vector_from_answers
from app.services.match.survey_schema import (
    SURVEY_QUESTION_ORDER,
    first_invalid_payload_error,
    normalize_survey_answers,
    survey_is_complete,
    validate_survey_answers,
)


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def _iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _json_dumps(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _json_loads_object(value: str | None) -> dict[str, object]:
    if not value:
        return {}
    parsed = json.loads(value)
    return parsed if isinstance(parsed, dict) else {}


def _validation_to_json(
    validation: dict[str, SurveyAnswerValidation],
) -> dict[str, dict[str, object]]:
    return {key: item.model_dump() for key, item in validation.items()}


def _validation_from_json(value: str | None) -> dict[str, SurveyAnswerValidation]:
    parsed = _json_loads_object(value)
    validation: dict[str, SurveyAnswerValidation] = {}
    for key, item in parsed.items():
        if isinstance(item, dict):
            validation[key] = SurveyAnswerValidation.model_validate(item)
    return validation


def _completed_step_count(validation: dict[str, SurveyAnswerValidation]) -> int:
    return sum(1 for question_id in SURVEY_QUESTION_ORDER if validation[question_id].valid)


def _phase_for_step(step: int | None, is_complete: bool) -> str:
    if is_complete:
        return "review"
    return "survey_question" if step else "survey_intro"


def _session_id() -> str:
    return f"match_{uuid4().hex[:12]}"


async def _store_preference_vector(db, vector: PreferenceVector) -> None:
    await db.execute(
        """
        INSERT INTO match_preference_vectors (
            preference_vector_id,
            session_id,
            profile_id,
            journey_intent,
            budget_min_cents,
            budget_max_cents,
            monthly_rent_max_cents,
            anchor_locations_json,
            commute_limits_json,
            property_types_json,
            hard_filters_json,
            nice_to_haves_json,
            avoid_signals_json,
            lifestyle_weights_json,
            persona_inputs_json,
            locale,
            method_version,
            source_answer_version,
            vector_version,
            raw_answer_refs_json,
            warnings_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(preference_vector_id) DO UPDATE SET
            session_id = excluded.session_id,
            profile_id = excluded.profile_id,
            journey_intent = excluded.journey_intent,
            budget_min_cents = excluded.budget_min_cents,
            budget_max_cents = excluded.budget_max_cents,
            monthly_rent_max_cents = excluded.monthly_rent_max_cents,
            anchor_locations_json = excluded.anchor_locations_json,
            commute_limits_json = excluded.commute_limits_json,
            property_types_json = excluded.property_types_json,
            hard_filters_json = excluded.hard_filters_json,
            nice_to_haves_json = excluded.nice_to_haves_json,
            avoid_signals_json = excluded.avoid_signals_json,
            lifestyle_weights_json = excluded.lifestyle_weights_json,
            persona_inputs_json = excluded.persona_inputs_json,
            locale = excluded.locale,
            method_version = excluded.method_version,
            source_answer_version = excluded.source_answer_version,
            vector_version = excluded.vector_version,
            raw_answer_refs_json = excluded.raw_answer_refs_json,
            warnings_json = excluded.warnings_json,
            created_at = excluded.created_at
        """,
        (
            vector.preference_vector_id,
            vector.session_id,
            vector.profile_id,
            vector.journey_intent,
            vector.budget_min_cents,
            vector.budget_max_cents,
            vector.monthly_rent_max_cents,
            _json_dumps(vector.anchor_locations),
            _json_dumps(vector.commute_limits),
            _json_dumps(vector.property_types),
            _json_dumps(vector.hard_filters),
            _json_dumps(vector.nice_to_haves),
            _json_dumps(vector.avoid_signals),
            _json_dumps(vector.lifestyle_weights),
            _json_dumps(vector.persona_inputs),
            vector.locale,
            vector.method_version,
            vector.source_answer_version,
            vector.vector_version,
            _json_dumps(vector.raw_answer_refs),
            _json_dumps(vector.warnings),
            _iso(vector.created_at),
        ),
    )


async def create_match_session(
    payload: MatchSessionCreateRequest,
) -> MatchSessionCreateResponse:
    now = _utc_now()
    expires_at = now + timedelta(days=7)
    session_id = _session_id()
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO match_sessions (
                session_id,
                locale,
                phase,
                current_step,
                answer_version,
                created_at,
                updated_at,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                payload.locale,
                "survey_intro",
                None,
                0,
                _iso(now),
                _iso(now),
                _iso(expires_at),
            ),
        )
        await db.commit()
    return MatchSessionCreateResponse(
        session_id=session_id,
        locale=payload.locale,
        phase="survey_intro",
        current_step=None,
        answer_version=0,
        expires_at=expires_at,
    )


async def _read_session_row(session_id: str):
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT
                s.session_id,
                s.locale,
                s.phase,
                s.current_step,
                s.answer_version,
                s.preference_vector_id,
                s.preference_vector_version,
                s.active_job_id,
                s.selected_neighborhood_id,
                s.map_state_json,
                s.dossier_return_context_json,
                s.expires_at,
                a.answers_json,
                a.validation_json,
                a.is_complete
            FROM match_sessions s
            LEFT JOIN match_survey_answers a ON a.session_id = s.session_id
            WHERE s.session_id = ? AND s.deleted_at IS NULL
            """,
            (session_id,),
        )
        return await cursor.fetchone()


async def get_match_session(session_id: str) -> MatchSessionResponse:
    row = await _read_session_row(session_id)
    if row is None:
        raise KeyError(session_id)

    answers = _json_loads_object(row["answers_json"])
    validation = _validation_from_json(row["validation_json"])
    is_complete = bool(row["is_complete"])
    preference_vector = None
    if is_complete:
        preference_vector = build_preference_vector_from_answers(
            session_id=session_id,
            locale=row["locale"],
            answers=answers,
            answer_version=int(row["answer_version"]),
        )

    preference_vector_id = (
        preference_vector.preference_vector_id
        if preference_vector
        else row["preference_vector_id"]
    )
    preference_vector_version = (
        preference_vector.vector_version
        if preference_vector
        else row["preference_vector_version"]
    )

    return MatchSessionResponse(
        session_id=row["session_id"],
        locale=row["locale"],
        phase=row["phase"],
        current_step=row["current_step"],
        answer_version=row["answer_version"],
        answers=answers,
        validation=validation,
        is_complete=is_complete,
        preference_vector_id=preference_vector_id,
        preference_vector_version=preference_vector_version,
        preference_vector=preference_vector,
        active_job_id=row["active_job_id"],
        selected_neighborhood_id=row["selected_neighborhood_id"],
        map_state=_json_loads_object(row["map_state_json"]) or None,
        dossier_return_context=_json_loads_object(row["dossier_return_context_json"]) or None,
        expires_at=datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00"))
        if row["expires_at"]
        else None,
    )


async def patch_match_session_answers(
    session_id: str,
    payload: SurveyAnswerPatchRequest,
) -> SurveyAnswerPatchResponse:
    row = await _read_session_row(session_id)
    if row is None:
        raise KeyError(session_id)

    current_answers = _json_loads_object(row["answers_json"])
    next_answers = normalize_survey_answers({**current_answers, **payload.answers})
    validation = validate_survey_answers(next_answers)
    invalid_payload_error = first_invalid_payload_error(validation)
    if invalid_payload_error:
        raise ValueError(invalid_payload_error)

    is_complete = survey_is_complete(validation)
    answer_version = int(row["answer_version"]) + 1
    now = _utc_now()
    phase = _phase_for_step(payload.current_step, is_complete)
    preference_vector: PreferenceVector | None = None
    preference_vector_id: str | None = None
    preference_vector_version: str | None = None
    if is_complete:
        preference_vector = build_preference_vector_from_answers(
            session_id=session_id,
            locale=payload.locale,
            answers=next_answers,
            answer_version=answer_version,
        )
        preference_vector_id = preference_vector.preference_vector_id
        preference_vector_version = preference_vector.vector_version

    async with get_db() as db:
        await db.execute(
            """
            UPDATE match_sessions
            SET locale = ?,
                phase = ?,
                current_step = ?,
                answer_version = ?,
                preference_vector_id = ?,
                preference_vector_version = ?,
                updated_at = ?
            WHERE session_id = ?
            """,
            (
                payload.locale,
                phase,
                payload.current_step,
                answer_version,
                preference_vector_id,
                preference_vector_version,
                _iso(now),
                session_id,
            ),
        )
        await db.execute(
            """
            INSERT INTO match_survey_answers (
                session_id,
                answer_version,
                answers_json,
                validation_json,
                completed_step_count,
                is_complete,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                answer_version = excluded.answer_version,
                answers_json = excluded.answers_json,
                validation_json = excluded.validation_json,
                completed_step_count = excluded.completed_step_count,
                is_complete = excluded.is_complete,
                updated_at = excluded.updated_at
            """,
            (
                session_id,
                answer_version,
                _json_dumps(next_answers),
                _json_dumps(_validation_to_json(validation)),
                _completed_step_count(validation),
                1 if is_complete else 0,
                _iso(now),
            ),
        )
        if preference_vector is not None:
            await _store_preference_vector(db, preference_vector)
        await db.commit()

    return SurveyAnswerPatchResponse(
        session_id=session_id,
        answer_version=answer_version,
        is_complete=is_complete,
        validation=validation,
        stale_results=True,
    )
