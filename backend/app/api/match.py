from fastapi import APIRouter

from app.models.match import MatchQuizRequest, MatchQuizResponse
from app.services.match.quiz import process_match_quiz

router = APIRouter(prefix="/match", tags=["match"])


@router.get("/health")
async def match_health() -> dict[str, str]:
    return {"status": "foundation_only"}


@router.post("/quiz", response_model=MatchQuizResponse)
async def submit_match_quiz(payload: MatchQuizRequest) -> MatchQuizResponse:
    return process_match_quiz(payload)
