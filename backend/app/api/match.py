from fastapi import APIRouter, HTTPException

from app.models.match import (
    MatchCompareRequest,
    MatchCompareResponse,
    MatchMapResponse,
    MatchQuizRequest,
    MatchQuizResponse,
    MatchReportCreateRequest,
    MatchReportResponse,
    MatchSimilarRequest,
    MatchSimilarResponse,
)
from app.services.match.comparison import build_neighborhood_comparison
from app.services.match.map_view import build_match_map
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter
from app.services.match.quiz import process_match_quiz
from app.services.match.reports import create_report_snapshot, get_report_snapshot
from app.services.match.similarity import find_similar_neighborhoods

router = APIRouter(prefix="/match", tags=["match"])


@router.get("/health")
async def match_health() -> dict[str, str]:
    return {"status": "foundation_only"}


@router.post("/quiz", response_model=MatchQuizResponse)
async def submit_match_quiz(payload: MatchQuizRequest) -> MatchQuizResponse:
    return process_match_quiz(payload)


async def _load_seed_context():
    return await SeedMockImporter().load_seed_data(MVP_REGION_CONFIG_ID)


@router.post("/similar", response_model=MatchSimilarResponse)
async def find_similar(payload: MatchSimilarRequest) -> MatchSimilarResponse:
    seed = await _load_seed_context()
    try:
        results = find_similar_neighborhoods(
            payload.source_neighborhood_id,
            seed.neighborhoods,
            seed.feature_vectors,
            filters=payload.filters,
            limit=payload.limit,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="match.warning.unsupported_neighborhood",
        ) from exc
    return MatchSimilarResponse(
        source_neighborhood_id=payload.source_neighborhood_id,
        results=results,
        empty_state_code=None if results else "match.similar.empty",
    )


@router.get("/map", response_model=MatchMapResponse)
async def get_match_map(
    category: str | None = None,
    min_score: int = 0,
) -> MatchMapResponse:
    seed = await _load_seed_context()
    return build_match_map(
        seed.neighborhoods,
        seed.feature_vectors,
        category=category,
        min_score=min_score,
    )


@router.post("/compare", response_model=MatchCompareResponse)
async def compare_neighborhoods(payload: MatchCompareRequest) -> MatchCompareResponse:
    seed = await _load_seed_context()
    try:
        return build_neighborhood_comparison(
            payload.neighborhood_ids,
            neighborhoods=seed.neighborhoods,
            feature_vectors=seed.feature_vectors,
            metrics=seed.metrics,
            locale=payload.locale,
            preference_vector_id=payload.preference_vector_id,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 422 if "at_least_three" in detail else 404
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.post("/reports", response_model=MatchReportResponse)
async def create_match_report(payload: MatchReportCreateRequest) -> MatchReportResponse:
    try:
        return await create_report_snapshot(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/reports/{report_id}", response_model=MatchReportResponse)
async def get_match_report(report_id: str, locale: str | None = None) -> MatchReportResponse:
    if locale is not None and locale not in {"en", "nl"}:
        raise HTTPException(status_code=422, detail="locale must be en or nl")
    report = await get_report_snapshot(report_id, locale=locale)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    return report
