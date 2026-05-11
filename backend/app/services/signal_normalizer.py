from __future__ import annotations

from app.models.prebid import (
    ConfidenceLabel,
    Signal,
    SourceCoverageItem,
    SourceRecord,
    SourceReference,
)


def _enum_value(value: object) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _source_ref(record: SourceRecord) -> SourceReference:
    return SourceReference(
        source_id=record.source_id,
        authority=record.authority,
        name=record.title,
        url=record.source_url,
        retrieved_at=record.evidence_payload.get("retrieved_at") or record.source_date or "",
        source_date=record.source_date,
        status_label=record.status_label,
        record_id=record.record_id,
    )


def _coverage_source_ref(
    item: SourceCoverageItem,
    *,
    source_run_created_at: str,
) -> SourceReference:
    return SourceReference(
        source_id=item.source_id,
        authority=item.authority,
        name=item.label,
        retrieved_at=item.checked_at or source_run_created_at,
        source_date=None,
        status_label=_enum_value(item.status),
        record_id=None,
        url=None,
    )


def _is_ambiguous_status(status: str | None) -> bool:
    return (status or "").casefold() in {"unknown", "ambiguous", "manual_review", "in_behandeling"}


def _record_signal(record: SourceRecord, signal_type: str, *, materiality: int) -> Signal:
    title = record.title or f"{record.source_id} record found"
    return Signal(
        signal_id=f"signal-{record.record_id}",
        signal_type=signal_type,  # type: ignore[arg-type]
        title=title,
        finding=f"A {signal_type.replace('_', ' ')} record was found in {record.authority}.",
        status=record.status_label,
        proximity_m=record.distance_m,
        buyer_impact_tags=[signal_type],
        confidence=ConfidenceLabel.medium,
        limitation="This checked source record needs interpretation before relying on it.",
        recommended_action="Ask for the current status, expected timeline, and source page.",
        materiality=materiality,
        source_refs=[_source_ref(record)],
        requires_review=_is_ambiguous_status(record.status_label),
        review_reason=(
            "Ambiguous source status" if _is_ambiguous_status(record.status_label) else None
        ),
    )


def _official_publication_signal(record: SourceRecord) -> Signal:
    return _record_signal(record, "public_notice", materiality=75)


def _parcel_signal(record: SourceRecord) -> Signal:
    return _record_signal(record, "parcel", materiality=48)


def _wkpb_signal(record: SourceRecord) -> Signal:
    signal = _record_signal(record, "wkpb_restriction", materiality=88)
    signal.requires_review = True
    signal.review_reason = "WKPB interpretation requires human review"
    return signal


def _rce_signal(record: SourceRecord) -> Signal:
    signal = _record_signal(record, "monument_or_protected_view", materiality=72)
    signal.requires_review = True
    signal.review_reason = "Heritage context requires human review"
    return signal


def _energy_label_signal(record: SourceRecord) -> Signal:
    return _record_signal(record, "energy_label", materiality=50)


def _parking_signal(record: SourceRecord) -> Signal:
    return _record_signal(record, "parking", materiality=45)


def _source_incomplete_signal(
    item: SourceCoverageItem,
    *,
    source_run_created_at: str,
) -> Signal:
    high_impact = {"wkpb", "rce_culture"}
    return Signal(
        signal_id=f"signal-incomplete-{item.source_id}",
        signal_type="source_incomplete",
        title=f"{item.label} could not be checked",
        finding=f"{item.label} could not be checked for this address.",
        status=_enum_value(item.status),
        buyer_impact_tags=["source_incomplete"],
        confidence=ConfidenceLabel.needs_review,
        limitation=item.limitation,
        recommended_action="Verify this source separately before relying on a clean result.",
        materiality=92 if item.source_id in high_impact else 85,
        source_refs=[_coverage_source_ref(item, source_run_created_at=source_run_created_at)],
        requires_review=False,
    )


def normalize_signals(
    *,
    records: list[SourceRecord],
    coverage: list[SourceCoverageItem],
    source_run_created_at: str,
) -> list[Signal]:
    signals: list[Signal] = []
    record_source_ids = {record.source_id for record in records}

    for record in records:
        if record.source_id == "official_publications":
            signals.append(_official_publication_signal(record))
        elif record.source_id == "pdok_parcel":
            signals.append(_parcel_signal(record))
        elif record.source_id == "wkpb":
            signals.append(_wkpb_signal(record))
        elif record.source_id == "rce_culture":
            signals.append(_rce_signal(record))
        elif record.source_id == "ep_online":
            signals.append(_energy_label_signal(record))
        elif record.source_id == "rdw_parking":
            signals.append(_parking_signal(record))
        else:
            raise ValueError(f"No prebid signal normalizer for source_id={record.source_id}")

    for item in coverage:
        if (
            _enum_value(item.priority) == "p0"
            and _enum_value(item.status) in {"failed", "unavailable"}
            and item.source_id not in record_source_ids
        ):
            signals.append(
                _source_incomplete_signal(item, source_run_created_at=source_run_created_at)
            )

    return signals
