import json

import pytest

from app.db import get_db, init_db


@pytest.mark.asyncio
async def test_prebid_tables_are_created(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)

    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN "
            "('source_runs', 'source_run_coverage', 'source_records', 'signals', "
            "'action_items', 'briefings', 'prebid_packs', 'prebid_share_links', "
            "'review_tasks', 'user_contacts', 'payment_events', 'audit_log')"
        )
        rows = await cursor.fetchall()

    assert {row["name"] for row in rows} == {
        "source_runs",
        "source_run_coverage",
        "source_records",
        "signals",
        "action_items",
        "briefings",
        "prebid_packs",
        "prebid_share_links",
        "review_tasks",
        "user_contacts",
        "payment_events",
        "audit_log",
    }


@pytest.mark.asyncio
async def test_store_source_run_preserves_coverage_json(tmp_path):
    from app.models.prebid import SourceCoverageItem, SourcePriority, SourceStatus
    from app.services.briefing_store import (
        create_source_run,
        get_source_run,
        store_coverage_items,
    )

    db_path = str(tmp_path / "test.db")
    await init_db(db_path)

    source_run_id = await create_source_run(
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        result_state="data_incomplete",
        report_id="report-1",
        buyer_key="buyer-1",
        postcode="1015AA",
        rd_x=121000,
        rd_y=487000,
        lat=52.3676,
        lng=4.8846,
        municipality="Amsterdam",
        db_path=db_path,
    )
    await store_coverage_items(
        source_run_id,
        [
            SourceCoverageItem(
                source_id="official_publications",
                authority="KOOP / officielebekendmakingen.nl",
                label="Official public notices",
                priority=SourcePriority.p0,
                status=SourceStatus.failed,
                basis="address text",
                method_version="koop-sru-1.2-address-keyword-v1",
                duration_ms=123,
                limitation="Source failed.",
                error_code="timeout",
            )
        ],
        db_path=db_path,
    )
    row = await get_source_run(source_run_id, db_path=db_path)

    assert row is not None
    assert row["result_state"] == "data_incomplete"
    assert row["postcode"] == "1015AA"
    row_json = json.loads(json.dumps(dict(row)))
    assert row_json["vbo_id"] == "0363010000696734"
    assert row_json["deleted_at"] is None

    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT * FROM source_run_coverage WHERE source_run_id = ?",
            (source_run_id,),
        )
        coverage = await cursor.fetchone()
    assert coverage["authority"] == "KOOP / officielebekendmakingen.nl"
    assert coverage["method_version"] == "koop-sru-1.2-address-keyword-v1"
    assert coverage["duration_ms"] == 123


@pytest.mark.asyncio
async def test_repository_rejects_empty_evidence_arrays(tmp_path):
    from app.models.prebid import ActionItem, ConfidenceLabel, SourceReference
    from app.services.briefing_store import (
        create_source_run,
        store_action_items,
        store_signals,
    )

    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    source_run_id = await create_source_run(
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        result_state="signals_found",
        buyer_key="buyer-1",
        db_path=db_path,
    )
    ref = SourceReference(
        source_id="official_publications",
        authority="KOOP",
        name="Official public notices",
        retrieved_at="2026-05-05T10:00:00Z",
    )
    action = ActionItem(
        action_id="a1",
        signal_id="s1",
        rank=1,
        rank_score=80,
        finding="A permit record was found.",
        why_it_matters="It may affect timing.",
        ask_this_en="Can you confirm the permit status?",
        ask_this_nl="Kunt u de vergunningsstatus bevestigen?",
        request_this_en="Request the source page.",
        request_this_nl="Vraag de bronpagina op.",
        who_to_ask=["municipality"],
        confidence=ConfidenceLabel.medium,
        limitation="Limited source.",
        source_refs=[ref],
    )
    action_without_refs = action.model_copy(update={"source_refs": []})
    with pytest.raises(ValueError):
        await store_action_items(source_run_id, [action_without_refs], db_path=db_path)

    with pytest.raises(ValueError):
        await store_signals(
            source_run_id,
            [
                {
                    "signal_id": "s1",
                    "signal_type": "permit",
                    "source_refs": [],
                }
            ],
            db_path=db_path,
        )


@pytest.mark.asyncio
async def test_store_pack_snapshot_round_trips_paid_pack_json(tmp_path):
    from app.models.prebid import (
        ActionItem,
        ConfidenceLabel,
        PrebidBriefingResponse,
        ResultState,
        SourceCoverageItem,
        SourcePriority,
        SourceReference,
        SourceStatus,
    )
    from app.services.briefing_store import (
        create_briefing,
        create_source_run,
        get_pack_snapshot,
        store_action_items,
        store_coverage_items,
        store_pack_snapshot,
    )
    from app.services.pack_generator import generate_pack_from_briefing

    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    source_run_id = await create_source_run(
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        result_state="signals_found",
        report_id="report-1",
        buyer_key="buyer-1",
        db_path=db_path,
    )
    briefing_id = await create_briefing(
        source_run_id,
        "report-1",
        "buyer-1",
        "0363010000696734",
        db_path=db_path,
    )
    ref = SourceReference(
        source_id="official_publications",
        authority="KOOP",
        name="Official public notices",
        retrieved_at="2026-05-05T10:00:00Z",
    )
    action = ActionItem(
        action_id="a1",
        signal_id="s1",
        rank=1,
        rank_score=80,
        finding="A public notice record was found.",
        why_it_matters="This may affect timing.",
        ask_this_en="Can you confirm the public notice status?",
        ask_this_nl="Kunt u de status van de bekendmaking bevestigen?",
        request_this_en="Request the public notice source page.",
        request_this_nl="Vraag de bekendmakingspagina op.",
        who_to_ask=["municipality"],
        confidence=ConfidenceLabel.medium,
        limitation="Limited source.",
        source_refs=[ref],
    )
    coverage = SourceCoverageItem(
        source_id="official_publications",
        authority="KOOP",
        label="Official public notices",
        priority=SourcePriority.p0,
        status=SourceStatus.checked,
        basis="address",
        limitation="Limited source.",
    )
    await store_action_items(source_run_id, [action], db_path=db_path)
    await store_coverage_items(source_run_id, [coverage], db_path=db_path)
    pack = generate_pack_from_briefing(
        PrebidBriefingResponse(
            briefing_id=briefing_id,
            report_id="report-1",
            vbo_id="0363010000696734",
            confirmed_address="Keizersgracht 100, Amsterdam",
            checked_at="2026-05-05T10:00:00Z",
            result_state=ResultState.signals_found,
            top_actions=[action],
            coverage=[coverage],
            disclaimer="Not advice.",
        )
    )

    pack_id = await store_pack_snapshot(
        pack,
        source_run_id=source_run_id,
        buyer_key="buyer-1",
        db_path=db_path,
    )
    stored = await get_pack_snapshot(
        report_id="report-1",
        buyer_key="buyer-1",
        vbo_id="0363010000696734",
        db_path=db_path,
    )

    assert pack_id == pack.pack_id
    assert stored is not None
    assert stored.pack_id == pack.pack_id
    assert stored.questions_en["municipality"] == [
        "Can you confirm the public notice status?"
    ]
    assert stored.source_appendix[0].source_id == "official_publications"
