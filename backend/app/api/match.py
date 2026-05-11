from fastapi import APIRouter, HTTPException

from app.models.match import (
    MatchQuizRequest,
    MatchQuizResponse,
    MatchReportCreateRequest,
    MatchReportResponse,
)
from app.services.match.quiz import process_match_quiz
from app.services.match.reports import create_report_snapshot, get_report_snapshot

router = APIRouter(prefix="/match", tags=["match"])


@router.get("/health")
async def match_health() -> dict[str, str]:
    return {"status": "foundation_only"}


@router.post("/quiz", response_model=MatchQuizResponse)
async def submit_match_quiz(payload: MatchQuizRequest) -> MatchQuizResponse:
    return process_match_quiz(payload)


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
