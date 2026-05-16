from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.db import DatabaseError, get_db
from app.models.match import (
    MatchJobStatusResponse,
    MatchResultsResponse,
    MatchRunRequest,
    MatchRunResponse,
)
from app.services.match.instrumentation import record_match_event
from app.services.match.model_selection import SCORING_VERSION, ModelSelectionService
from app.services.match.neighborhood_features import DATA_VERSION, NeighborhoodFeatureStore
from app.services.match.recommendations import build_recommendation_set
from app.services.match.results import (
    json_dumps,
    json_loads,
    result_set_id,
    serialize_match_results,
)
from app.services.match.scoring import score_neighborhoods
from app.services.match.sessions import get_match_session
from app.services.match.survey_schema import SURVEY_QUESTION_ORDER

STAGE_SEQUENCE = (
    "created",
    "queued",
    "reading_preferences",
    "building_profile",
    "loading_neighborhood_data",
    "applying_filters",
    "running_models",
    "scoring_tradeoffs",
    "preparing_map",
    "completed",
    "completed_with_fallback",
    "completed_no_strong_matches",
    "failed",
    "expired",
)

STAGE_PROGRESS = {
    "created": 0,
    "queued": 5,
    "reading_preferences": 14,
    "building_profile": 25,
    "loading_neighborhood_data": 38,
    "applying_filters": 52,
    "running_models": 65,
    "scoring_tradeoffs": 78,
    "preparing_map": 90,
    "completed": 100,
    "completed_with_fallback": 100,
    "completed_no_strong_matches": 100,
    "failed": 100,
    "expired": 100,
}

MODEL_MODE = "weighted_scoring"
EVALUATION_STATUS = "not_validated_no_labels"
MATCH_JOB_STALE_SECONDS = 900

TERMINAL_JOB_STATUSES = {
    "completed",
    "completed_with_fallback",
    "completed_no_strong_matches",
    "failed",
    "expired",
}


class AnswersIncompleteError(ValueError):
    def __init__(self, invalid_questions: list[str]) -> None:
        super().__init__("match.warning.answers_incomplete")
        self.invalid_questions = invalid_questions


class RunNotConfirmedError(ValueError):
    def __init__(self) -> None:
        super().__init__("match.warning.review_confirmation_required")


class PreferenceVectorStaleError(ValueError):
    def __init__(self) -> None:
        super().__init__("match.warning.preference_vector_stale")


class MatchSessionNotFoundError(KeyError):
    pass


class MatchJobNotFoundError(KeyError):
    pass


class MatchResultsNotReadyError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("match.results.not_ready")


class MatchResultsNotFoundError(KeyError):
    pass


@dataclass(frozen=True)
class MatchJobStartResult:
    response: MatchRunResponse
    created: bool


def _utc_now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return _utc_now()
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _runtime_ms(started_at: str | None, finished_at: datetime | None = None) -> int:
    if not started_at:
        return 0
    start = _parse_dt(started_at)
    finish = finished_at or _utc_now()
    return max(0, int((finish - start).total_seconds() * 1000))


def _job_id() -> str:
    return f"match_job_{uuid4().hex[:12]}"


def _message_key(stage: str) -> str:
    return f"matchFirst.progress.{stage}"


def _public_status_for_stage(stage: str, *, current_status: str | None = None) -> str:
    if stage in {
        "completed",
        "completed_with_fallback",
        "completed_no_strong_matches",
        "failed",
        "expired",
        "queued",
        "created",
    }:
        return stage
    if current_status == "matching_slow":
        return "matching_slow"
    return "running"


def _terminal_event_name(stage: str) -> str | None:
    return {
        "completed": "match_job_completed",
        "completed_with_fallback": "match_job_completed_with_fallback",
        "completed_no_strong_matches": "match_job_completed_no_strong_matches",
        "failed": "match_job_failed",
    }.get(stage)


async def _record_job_event(
    event_name: str,
    *,
    session_id: str | None,
    locale: str = "en",
    context: dict[str, object] | None = None,
) -> None:
    await record_match_event(
        event_name,  # type: ignore[arg-type]
        session_id=session_id,
        locale=locale,
        context=context,
    )


async def _update_job_stage(
    job_id: str,
    *,
    stage: str,
    data_version: str,
    result_set_id_value: str | None = None,
    fallback_used: bool = False,
    fallback_reason_code: str | None = None,
    error_code: str | None = None,
    internal_error_class: str | None = None,
) -> None:
    now = _utc_now()
    completed_at = (
        now
        if stage in TERMINAL_JOB_STATUSES
        else None
    )
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT j.session_id,
                   j.started_at,
                   j.status,
                   COALESCE(s.locale, 'en') AS locale
            FROM match_jobs j
            LEFT JOIN match_sessions s ON s.session_id = j.session_id
            WHERE j.job_id = ?
            """,
            (job_id,),
        )
        row = await cursor.fetchone()
        public_status = _public_status_for_stage(
            stage,
            current_status=row["status"] if row is not None else None,
        )
        runtime_ms = (
            _runtime_ms(row["started_at"], completed_at)
            if completed_at and row is not None
            else None
        )
        await db.execute(
            """
            UPDATE match_jobs
            SET status = ?,
                stage = ?,
                progress = ?,
                message_key = ?,
                data_version = ?,
                fallback_used = ?,
                fallback_reason_code = ?,
                result_set_id = COALESCE(?, result_set_id),
                error_code = ?,
                internal_error_class = ?,
                completed_at = COALESCE(?, completed_at),
                runtime_ms = COALESCE(?, runtime_ms),
                updated_at = ?
            WHERE job_id = ?
            """,
            (
                public_status,
                stage,
                STAGE_PROGRESS[stage],
                _message_key(stage),
                data_version,
                1 if fallback_used else 0,
                fallback_reason_code,
                result_set_id_value,
                error_code,
                internal_error_class,
                _iso(completed_at),
                runtime_ms,
                _iso(now),
                job_id,
            ),
        )
        await db.commit()
    if row is None:
        return
    event_name = _terminal_event_name(stage)
    if event_name is not None:
        await _record_job_event(
            event_name,
            session_id=row["session_id"],
            locale=row["locale"] or "en",
            context={
                "job_id": job_id,
                "status": public_status,
                "stage": stage,
                "fallback_used": fallback_used,
                "fallback_reason_code": fallback_reason_code,
                "error_code": error_code,
            },
        )
    elif stage not in {"created", "queued", "expired"}:
        await _record_job_event(
            "match_job_running",
            session_id=row["session_id"],
            locale=row["locale"] or "en",
            context={
                "job_id": job_id,
                "status": public_status,
                "stage": stage,
                "progress": STAGE_PROGRESS[stage],
            },
        )


def _run_response_from_row(row) -> MatchRunResponse:
    return MatchRunResponse(
        session_id=row["session_id"],
        job_id=row["job_id"],
        status=row["status"],
        stage=row["stage"],
        progress=row["progress"],
        message_key=row["message_key"],
        preference_vector_id=row["preference_vector_id"],
    )


def _validate_run_request(
    payload: MatchRunRequest | None,
    *,
    current_vector_version: str | None,
) -> None:
    if payload is None or payload.source != "review_final_cta":
        raise RunNotConfirmedError()
    if not payload.preference_vector_version:
        raise PreferenceVectorStaleError()
    if payload.preference_vector_version != current_vector_version:
        raise PreferenceVectorStaleError()


async def start_match_job(
    session_id: str,
    payload: MatchRunRequest | None = None,
) -> MatchJobStartResult:
    session = await get_match_session(session_id)
    if not session.is_complete or session.preference_vector is None:
        invalid = [
            question_id
            for question_id in SURVEY_QUESTION_ORDER
            if not session.validation.get(question_id)
            or not session.validation[question_id].valid
        ]
        raise AnswersIncompleteError(invalid)
    _validate_run_request(payload, current_vector_version=session.preference_vector_version)
    await recover_stale_jobs(max_age_seconds=MATCH_JOB_STALE_SECONDS, session_id=session_id)
    await _record_job_event(
        "match_final_run_cta_clicked",
        session_id=session_id,
        locale=session.locale,
        context={"preference_vector_version": session.preference_vector_version or ""},
    )

    active_job = await _read_active_job_row(session_id)
    if (
        active_job is not None
        and active_job["preference_vector_id"] == session.preference_vector.preference_vector_id
        and active_job["status"] not in {"failed", "expired"}
    ):
        return MatchJobStartResult(response=_run_response_from_row(active_job), created=False)

    now = _utc_now()
    job_id = _job_id()
    try:
        async with get_db() as db:
            await db.execute(
                """
                INSERT INTO match_jobs (
                    job_id,
                    session_id,
                    preference_vector_id,
                    status,
                    stage,
                    progress,
                    message_key,
                    model_mode,
                    model_version,
                    data_version,
                    evaluation_status,
                    fallback_used,
                    started_at,
                    runtime_ms,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    session_id,
                    session.preference_vector.preference_vector_id,
                    "queued",
                    "queued",
                    STAGE_PROGRESS["queued"],
                    _message_key("queued"),
                    MODEL_MODE,
                    SCORING_VERSION,
                    DATA_VERSION,
                    EVALUATION_STATUS,
                    0,
                    _iso(now),
                    0,
                    _iso(now),
                ),
            )
            await db.execute(
                """
                UPDATE match_sessions
                SET active_job_id = ?,
                    phase = 'matching',
                    updated_at = ?
                WHERE session_id = ?
                """,
                (job_id, _iso(now), session_id),
            )
            await db.commit()
    except DatabaseError:
        existing_job = await _read_started_job_for_vector(
            session_id,
            session.preference_vector.preference_vector_id,
        )
        if existing_job is not None and existing_job["status"] not in {"failed", "expired"}:
            return MatchJobStartResult(
                response=_run_response_from_row(existing_job),
                created=False,
            )
        raise

    await _record_job_event(
        "match_job_queued",
        session_id=session_id,
        locale=session.locale,
        context={
            "job_id": job_id,
            "preference_vector_id": session.preference_vector.preference_vector_id,
            "stage": "queued",
        },
    )

    return MatchJobStartResult(
        response=MatchRunResponse(
            session_id=session_id,
            job_id=job_id,
            status="queued",
            stage="queued",
            progress=STAGE_PROGRESS["queued"],
            message_key=_message_key("queued"),
            preference_vector_id=session.preference_vector.preference_vector_id,
        ),
        created=True,
    )


async def run_match_job(job_id: str) -> None:
    row = await _read_job_row(job_id)
    if row is None:
        raise KeyError(job_id)
    if row["status"] in {
        "completed",
        "completed_with_fallback",
        "completed_no_strong_matches",
        "failed",
        "expired",
    }:
        return

    data_version = row["data_version"]
    try:
        for stage in ("reading_preferences", "building_profile"):
            await _update_job_stage(job_id, stage=stage, data_version=data_version)

        session = await get_match_session(row["session_id"])
        if session.preference_vector is None:
            raise AnswersIncompleteError(["preference_vector"])

        await _update_job_stage(
            job_id,
            stage="loading_neighborhood_data",
            data_version=data_version,
        )
        matrix = await NeighborhoodFeatureStore().load_matrix()
        data_version = matrix.data_version
        for stage in (
            "applying_filters",
            "running_models",
            "scoring_tradeoffs",
            "preparing_map",
        ):
            await _update_job_stage(job_id, stage=stage, data_version=data_version)

        scored = score_neighborhoods(
            session.preference_vector,
            matrix.neighborhoods,
            matrix.feature_vectors,
        )
        candidate_count = len(matrix.feature_vectors)
        scored_candidate_count = len(scored)
        recommendation_set = build_recommendation_set(scored)
        fallback_used = False
        fallback_reason_code = None
        model_selector = ModelSelectionService()
        model_decision = model_selector.select_mode()
        if model_decision.model_mode == "predictive_candidate":
            try:
                model_selector.try_predictive_ranking(recommendation_set)
            except Exception:
                fallback_used = True
                fallback_reason_code = "match.warning.advanced_model_unavailable"

        if fallback_used:
            terminal_status = "completed_with_fallback"
        elif not recommendation_set.top:
            terminal_status = "completed_no_strong_matches"
        else:
            terminal_status = "completed"
        result_id = result_set_id()
        generated_at = _utc_now()
        response = serialize_match_results(
            session_id=row["session_id"],
            job_id=job_id,
            result_set_id_value=result_id,
            preference_vector_id=row["preference_vector_id"],
            preference_vector_version=session.preference_vector_version or "",
            status=terminal_status,
            recommendations=recommendation_set,
            neighborhoods=matrix.neighborhoods,
            data_version=matrix.data_version,
            runtime_ms=_runtime_ms(row["started_at"], generated_at),
            candidate_count=candidate_count,
            scored_candidate_count=scored_candidate_count,
            fallback_used=fallback_used,
            fallback_reason_code=fallback_reason_code,
            generated_at=generated_at,
            source_metadata_by_id={
                source.source_id: source
                for source in matrix.source_context.sources
            },
        )
        await _store_result_set(response, preference_vector_id=row["preference_vector_id"])
        await _update_job_stage(
            job_id,
            stage=terminal_status,
            data_version=matrix.data_version,
            result_set_id_value=result_id,
            fallback_used=fallback_used,
            fallback_reason_code=fallback_reason_code,
        )
        await _mark_session_completed(row["session_id"])
    except Exception as exc:
        if isinstance(exc, AnswersIncompleteError):
            error_code = "match.warning.answers_incomplete"
        else:
            error_code = "match.warning.match_failed"
        await _update_job_stage(
            job_id,
            stage="failed",
            data_version=data_version,
            error_code=error_code,
            internal_error_class=type(exc).__name__,
        )


async def _mark_session_completed(session_id: str) -> None:
    now = _utc_now()
    async with get_db() as db:
        await db.execute(
            "UPDATE match_sessions SET phase = 'success', updated_at = ? WHERE session_id = ?",
            (_iso(now), session_id),
        )
        await db.commit()


async def _store_result_set(
    response: MatchResultsResponse,
    *,
    preference_vector_id: str,
) -> None:
    source_coverage = sorted(
        {
            source
            for item in [
                *response.ranked_results,
                *response.stretch_matches,
                *response.near_misses,
            ]
            for source in item.source_refs
        }
    )
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO match_result_sets (
                result_set_id,
                session_id,
                job_id,
                preference_vector_id,
                preference_vector_version,
                status,
                generated_at,
                runtime_ms,
                model_mode,
                model_version,
                data_version,
                evaluation_status,
                predictive_probability_available,
                fallback_used,
                fallback_reason_code,
                recommendations_json,
                near_misses_json,
                stretch_matches_json,
                evidence_json,
                source_coverage_json,
                geometry_refs_json,
                map_json,
                map_center_json,
                bbox_json,
                normal_recommendation_count,
                candidate_count,
                scored_candidate_count,
                empty_state_code
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            """,
            (
                response.result_set_id,
                response.session_id,
                response.job_id,
                preference_vector_id,
                response.preference_vector_version,
                response.status,
                _iso(response.generated_at),
                response.runtime_ms,
                response.model_mode,
                response.model_version,
                response.data_version,
                response.evaluation_status,
                0,
                1 if response.fallback_used else 0,
                response.fallback_reason_code,
                response.model_dump_json(include={"ranked_results"}),
                response.model_dump_json(include={"near_misses"}),
                response.model_dump_json(include={"stretch_matches"}),
                json_dumps({}),
                json_dumps(source_coverage),
                response.model_dump_json(
                    include={"ranked_results", "stretch_matches", "near_misses"}
                ),
                response.map.model_dump_json(),
                json_dumps(response.map_center),
                json_dumps(response.bbox),
                response.normal_recommendation_count,
                response.candidate_count,
                response.scored_candidate_count,
                response.empty_state_code,
            ),
        )
        await db.commit()


async def _read_job_row(job_id: str):
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM match_jobs WHERE job_id = ?", (job_id,))
        return await cursor.fetchone()


async def _read_active_job_row(session_id: str):
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT j.*
            FROM match_jobs j
            JOIN match_sessions s ON s.active_job_id = j.job_id
            WHERE s.session_id = ?
            """,
            (session_id,),
        )
        return await cursor.fetchone()


async def _read_started_job_for_vector(session_id: str, preference_vector_id: str):
    for _attempt in range(5):
        async with get_db() as db:
            cursor = await db.execute(
                """
                SELECT *
                FROM match_jobs
                WHERE session_id = ?
                  AND preference_vector_id = ?
                  AND status NOT IN ('failed', 'expired')
                ORDER BY
                    CASE
                        WHEN status IN ('created', 'queued', 'running', 'matching_slow') THEN 0
                        ELSE 1
                    END,
                    updated_at DESC
                LIMIT 1
                """,
                (session_id, preference_vector_id),
            )
            row = await cursor.fetchone()
        if row is not None:
            return row
        await asyncio.sleep(0.01)
    return None


async def _session_exists(session_id: str) -> bool:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT 1 FROM match_sessions WHERE session_id = ?",
            (session_id,),
        )
        return await cursor.fetchone() is not None


async def get_match_job_status(session_id: str) -> MatchJobStatusResponse:
    if not await _session_exists(session_id):
        raise MatchSessionNotFoundError(session_id)
    await mark_slow_jobs(session_id=session_id)
    row = await _read_active_job_row(session_id)
    if row is None:
        raise MatchJobNotFoundError(session_id)
    return MatchJobStatusResponse(
        session_id=row["session_id"],
        job_id=row["job_id"],
        status=row["status"],
        stage=row["stage"],
        progress=row["progress"],
        message_key=row["message_key"],
        model_mode=row["model_mode"],
        model_version=row["model_version"],
        scoring_version=row["model_version"],
        evaluation_status=row["evaluation_status"],
        fallback_used=bool(row["fallback_used"]),
        fallback_reason_code=row["fallback_reason_code"],
        result_set_id=row["result_set_id"],
        error_code=row["error_code"],
        runtime_ms=row["runtime_ms"],
        updated_at=_parse_dt(row["updated_at"]),
    )


async def get_match_results(session_id: str) -> MatchResultsResponse:
    if not await _session_exists(session_id):
        raise MatchSessionNotFoundError(session_id)
    job = await _read_active_job_row(session_id)
    if job is None:
        raise MatchResultsNotFoundError(session_id)
    if (
        job["status"]
        not in {"completed", "completed_with_fallback", "completed_no_strong_matches"}
        or not job["result_set_id"]
    ):
        raise MatchResultsNotReadyError()

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM match_result_sets WHERE result_set_id = ?",
            (job["result_set_id"],),
        )
        row = await cursor.fetchone()
    if row is None:
        raise MatchResultsNotFoundError(session_id)

    ranked = json_loads(row["recommendations_json"], {"ranked_results": []})
    near = json_loads(row["near_misses_json"], {"near_misses": []})
    stretch = json_loads(row["stretch_matches_json"], {"stretch_matches": []})
    map_payload = json.loads(row["map_json"])
    return MatchResultsResponse(
        session_id=row["session_id"],
        job_id=row["job_id"],
        result_set_id=row["result_set_id"],
        preference_vector_version=row["preference_vector_version"] or row["preference_vector_id"],
        status=row["status"],
        generated_at=_parse_dt(row["generated_at"]),
        runtime_ms=row["runtime_ms"],
        model_mode=row["model_mode"],
        model_version=row["model_version"],
        scoring_version=row["model_version"],
        data_version=row["data_version"],
        evaluation_status=row["evaluation_status"],
        predictive_probability_available=False,
        fallback_used=bool(row["fallback_used"]),
        fallback_reason_code=row["fallback_reason_code"],
        ranked_results=ranked.get("ranked_results", []) if isinstance(ranked, dict) else [],
        recommendations=ranked.get("ranked_results", []) if isinstance(ranked, dict) else [],
        stretch_matches=(
            stretch.get("stretch_matches", []) if isinstance(stretch, dict) else []
        ),
        near_misses=near.get("near_misses", []) if isinstance(near, dict) else [],
        normal_recommendation_count=row["normal_recommendation_count"],
        candidate_count=row["candidate_count"],
        scored_candidate_count=row["scored_candidate_count"],
        empty_state_code=row["empty_state_code"],
        map_center=json_loads(row["map_center_json"], {}),
        bbox=json_loads(row["bbox_json"], []),
        map=map_payload,
    )


async def recover_stale_jobs(
    *,
    max_age_seconds: int = MATCH_JOB_STALE_SECONDS,
    session_id: str | None = None,
) -> int:
    cutoff = _utc_now() - timedelta(seconds=max_age_seconds)
    cutoff_iso = _iso(cutoff)
    now_iso = _iso(_utc_now())
    session_filter = "AND j.session_id = ?" if session_id is not None else ""
    params: tuple[str, ...] = (
        (cutoff_iso, session_id) if session_id is not None else (cutoff_iso,)
    )
    async with get_db() as db:
        cursor = await db.execute(
            f"""
            SELECT j.job_id,
                   j.session_id,
                   j.started_at,
                   COALESCE(s.locale, 'en') AS locale
            FROM match_jobs j
            LEFT JOIN match_sessions s ON s.session_id = j.session_id
            WHERE j.status NOT IN (
                'completed',
                'completed_with_fallback',
                'completed_no_strong_matches',
                'failed',
                'expired'
            )
              AND j.updated_at < ?
              {session_filter}
            """,
            params,
        )
        rows = await cursor.fetchall()
        for row in rows:
            runtime_ms = _runtime_ms(row["started_at"])
            await db.execute(
                """
                UPDATE match_jobs
                SET status = 'failed',
                    stage = 'failed',
                    progress = 100,
                    message_key = 'matchFirst.progress.failed',
                    error_code = 'match.warning.retryable_stale_job',
                    internal_error_class = NULL,
                    completed_at = ?,
                    runtime_ms = ?,
                    updated_at = ?
                WHERE job_id = ?
                """,
                (now_iso, runtime_ms, now_iso, row["job_id"]),
            )
        await db.commit()
    for row in rows:
        await _record_job_event(
            "match_job_failed",
            session_id=row["session_id"],
            locale=row["locale"] or "en",
            context={
                "job_id": row["job_id"],
                "stage": "failed",
                "error_code": "match.warning.retryable_stale_job",
            },
        )
    return len(rows)


async def mark_slow_jobs(*, max_age_seconds: int = 10, session_id: str | None = None) -> int:
    cutoff = _utc_now() - timedelta(seconds=max_age_seconds)
    cutoff_iso = _iso(cutoff)
    now_iso = _iso(_utc_now())
    session_filter = "AND j.session_id = ?" if session_id is not None else ""
    params: tuple[str, ...] = (
        (cutoff_iso, session_id) if session_id is not None else (cutoff_iso,)
    )
    async with get_db() as db:
        cursor = await db.execute(
            f"""
            SELECT j.job_id,
                   j.session_id,
                   j.stage,
                   j.progress,
                   COALESCE(s.locale, 'en') AS locale
            FROM match_jobs j
            LEFT JOIN match_sessions s ON s.session_id = j.session_id
            WHERE j.status NOT IN (
                'completed',
                'completed_with_fallback',
                'completed_no_strong_matches',
                'failed',
                'expired',
                'matching_slow'
            )
              AND COALESCE(j.started_at, j.updated_at) < ?
              {session_filter}
            """,
            params,
        )
        rows = await cursor.fetchall()
        for row in rows:
            await db.execute(
                """
                UPDATE match_jobs
                SET status = 'matching_slow',
                    message_key = 'matchFirst.progress.matching_slow',
                    updated_at = ?
                WHERE job_id = ?
                """,
                (now_iso, row["job_id"]),
            )
        await db.commit()
    for row in rows:
        await _record_job_event(
            "match_job_slow",
            session_id=row["session_id"],
            locale=row["locale"] or "en",
            context={
                "job_id": row["job_id"],
                "stage": row["stage"],
                "progress": row["progress"],
            },
        )
    return len(rows)


async def expire_jobs(*, max_age_seconds: int = 86400) -> int:
    cutoff = _utc_now() - timedelta(seconds=max_age_seconds)
    cutoff_iso = _iso(cutoff)
    now = _utc_now()
    now_iso = _iso(now)
    async with get_db() as db:
        cursor = await db.execute(
            """
            SELECT job_id, session_id, started_at
            FROM match_jobs
            WHERE status NOT IN (
                'completed',
                'completed_with_fallback',
                'completed_no_strong_matches',
                'failed',
                'expired'
            )
              AND COALESCE(started_at, updated_at) < ?
            """,
            (cutoff_iso,),
        )
        rows = await cursor.fetchall()
        for row in rows:
            await db.execute(
                """
                UPDATE match_jobs
                SET status = 'expired',
                    stage = 'expired',
                    progress = 100,
                    message_key = 'matchFirst.progress.expired',
                    error_code = 'match.job.expired',
                    internal_error_class = NULL,
                    completed_at = ?,
                    runtime_ms = ?,
                    updated_at = ?
                WHERE job_id = ?
                """,
                (
                    now_iso,
                    _runtime_ms(row["started_at"], now),
                    now_iso,
                    row["job_id"],
                ),
            )
        await db.commit()
    return len(rows)
