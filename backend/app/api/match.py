from fastapi import APIRouter, HTTPException, Response

from app.models.match import (
    AlertCreateRequest,
    AlertCreateResponse,
    AlertListResponse,
    AlertRule,
    AlertUpdateRequest,
    DeleteResponse,
    ListingCriteria,
    ListingProviderResult,
    MatchCompareRequest,
    MatchCompareResponse,
    MatchFeedbackRequest,
    MatchFeedbackResponse,
    MatchMapResponse,
    MatchQuizRequest,
    MatchQuizResponse,
    MatchRecommendationsRequest,
    MatchRecommendationsResponse,
    MatchReportCreateRequest,
    MatchReportResponse,
    MatchSimilarRequest,
    MatchSimilarResponse,
    ReportExportRequest,
    ReportExportResponse,
    ReportSaveRequest,
    ReportSaveResponse,
    ReportShareRequest,
    ReportShareResponse,
    SavedNeighborhood,
    SavedNeighborhoodCreateRequest,
    SavedNeighborhoodListResponse,
)
from app.services.match.alerts import create_alert, delete_alert, list_alerts, update_alert
from app.services.match.comparison import build_neighborhood_comparison
from app.services.match.feedback import record_feedback
from app.services.match.listings import fetch_listing_matches
from app.services.match.map_view import build_match_map
from app.services.match.providers.seed import MVP_REGION_CONFIG_ID, SeedMockImporter
from app.services.match.quiz import process_match_quiz
from app.services.match.recommendations import build_match_recommendations
from app.services.match.reports import (
    create_report_export,
    create_report_pdf,
    create_report_share_link,
    create_report_snapshot,
    delete_saved_neighborhood,
    get_report_snapshot,
    get_shared_report_snapshot,
    list_saved_neighborhoods,
    save_neighborhood,
    save_report,
)
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


@router.post("/recommendations", response_model=MatchRecommendationsResponse)
async def create_match_recommendations(
    payload: MatchRecommendationsRequest,
) -> MatchRecommendationsResponse:
    seed = await _load_seed_context()
    return build_match_recommendations(
        payload.preference_vector,
        neighborhoods=seed.neighborhoods,
        feature_vectors=seed.feature_vectors,
        limit=payload.limit,
        locale=payload.locale,
    )


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


@router.get("/shared/{share_token}", response_model=MatchReportResponse)
async def get_shared_match_report(share_token: str) -> MatchReportResponse:
    report = await get_shared_report_snapshot(share_token)
    if report is None:
        raise HTTPException(status_code=404, detail="shared report not found")
    return report


@router.get("/listings", response_model=ListingProviderResult)
async def get_match_listings(
    neighborhood_id: str,
    journey_intent: str,
    budget_max_cents: int | None = None,
    rent_max_cents: int | None = None,
    property_type: str | None = None,
) -> ListingProviderResult:
    try:
        criteria = ListingCriteria(
            neighborhood_id=neighborhood_id,
            journey_intent=journey_intent,  # type: ignore[arg-type]
            budget_max_cents=budget_max_cents,
            rent_max_cents=rent_max_cents,
            property_type=property_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await fetch_listing_matches(criteria)


@router.get("/alerts", response_model=AlertListResponse)
async def get_match_alerts(session_id: str | None = None) -> AlertListResponse:
    return AlertListResponse(alerts=list_alerts(session_id=session_id))


@router.post("/alerts", response_model=AlertCreateResponse)
async def create_match_alert(payload: AlertCreateRequest) -> AlertCreateResponse:
    try:
        return await create_alert(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/feedback", response_model=MatchFeedbackResponse)
async def submit_match_feedback(payload: MatchFeedbackRequest) -> MatchFeedbackResponse:
    try:
        return await record_feedback(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/alerts/{alert_id}", response_model=AlertRule)
async def update_match_alert(alert_id: str, payload: AlertUpdateRequest) -> AlertRule:
    try:
        return await update_alert(
            alert_id,
            status=payload.status,
            budget_max_cents=payload.budget_max_cents,
            rent_max_cents=payload.rent_max_cents,
            property_types=payload.property_types,
            notification_type=payload.notification_type,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="match.alert.not_found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/alerts/{alert_id}", response_model=AlertRule)
async def delete_match_alert(alert_id: str) -> AlertRule:
    try:
        return await delete_alert(alert_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="match.alert.not_found") from exc


@router.post("/reports/{report_id}/save", response_model=ReportSaveResponse)
async def save_match_report(report_id: str, payload: ReportSaveRequest) -> ReportSaveResponse:
    saved = await save_report(report_id, session_id=payload.session_id)
    if not saved:
        raise HTTPException(status_code=404, detail="report not found")
    return ReportSaveResponse(report_id=report_id, saved=True, status="saved")


@router.post("/reports/{report_id}/share", response_model=ReportShareResponse)
async def share_match_report(report_id: str, payload: ReportShareRequest) -> ReportShareResponse:
    if not payload.consent_to_share:
        raise HTTPException(status_code=422, detail="match.share.consent_required")
    try:
        share_url, expires_at = await create_report_share_link(
            report_id,
            scope=payload.scope,
            locale=payload.locale,
            expires_in_days=payload.expires_in_days,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="report not found") from exc
    return ReportShareResponse(share_url=share_url, expires_at=expires_at)


@router.post("/reports/{report_id}/export", response_model=None)
async def export_match_report(
    report_id: str,
    payload: ReportExportRequest,
) -> ReportExportResponse | Response:
    try:
        if payload.export_type == "pdf":
            export_id, pdf_bytes = await create_report_pdf(report_id, locale=payload.locale)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={
                    "X-Match-Export-Id": export_id,
                    "Content-Disposition": f'attachment; filename="{report_id}.pdf"',
                },
            )
        return await create_report_export(
            report_id,
            export_type=payload.export_type,
            locale=payload.locale,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="report not found") from exc


@router.post("/saved-neighborhoods", response_model=SavedNeighborhood)
async def create_saved_neighborhood(
    payload: SavedNeighborhoodCreateRequest,
) -> SavedNeighborhood:
    return await save_neighborhood(payload)


@router.get("/saved-neighborhoods", response_model=SavedNeighborhoodListResponse)
async def get_saved_neighborhoods(
    session_id: str | None = None,
) -> SavedNeighborhoodListResponse:
    return SavedNeighborhoodListResponse(
        saved_neighborhoods=list_saved_neighborhoods(session_id=session_id)
    )


@router.delete("/saved-neighborhoods/{saved_neighborhood_id}", response_model=DeleteResponse)
async def remove_saved_neighborhood(saved_neighborhood_id: str) -> DeleteResponse:
    deleted = await delete_saved_neighborhood(saved_neighborhood_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="saved neighborhood not found")
    return DeleteResponse(deleted=True)
