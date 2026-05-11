from __future__ import annotations

from app.models.match import MatchQuizRequest, MatchQuizResponse
from app.services.match.personas import detect_persona_overlays
from app.services.match.preferences import generate_preference_vector


def process_match_quiz(request: MatchQuizRequest) -> MatchQuizResponse:
    generated = generate_preference_vector(request)
    overlays = detect_persona_overlays(request, generated.preference_vector)
    return MatchQuizResponse(
        profile=generated.profile,
        preference_vector=generated.preference_vector,
        persona_overlays=overlays,
        validation_warnings=generated.validation_warnings,
    )
