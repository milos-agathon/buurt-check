import pytest

from app.db import get_db, init_db
from app.services.briefing_store import (
    create_briefing,
    create_share_link,
    create_source_run,
    get_briefing_bundle,
    get_share_link_bundle,
    store_contact_hash,
)
from app.services.privacy_requests import expire_prebid_records


@pytest.mark.asyncio
async def test_expire_prebid_records_deletes_old_briefing(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    source_run_id = await create_source_run(
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        result_state="data_incomplete",
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
    deleted = await expire_prebid_records(db_path=db_path, retention_days=-1)
    assert deleted >= 1
    assert await get_briefing_bundle(briefing_id, buyer_key="buyer-1", db_path=db_path) is None


@pytest.mark.asyncio
async def test_expire_prebid_records_deletes_contact_hashes(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    source_run_id = await create_source_run(
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        result_state="data_incomplete",
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
    contact_id = await store_contact_hash(
        briefing_id,
        "buyer-1",
        "hmac:contact",
        db_path=db_path,
    )

    deleted = await expire_prebid_records(db_path=db_path, retention_days=-1)

    assert deleted >= 1
    async with get_db(db_path) as db:
        cursor = await db.execute(
            "SELECT deleted_at FROM user_contacts WHERE contact_id = ?",
            (contact_id,),
        )
        row = await cursor.fetchone()
    assert row["deleted_at"] is not None


@pytest.mark.asyncio
async def test_expired_share_link_is_not_returned(tmp_path):
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)
    source_run_id = await create_source_run(
        vbo_id="0363010000696734",
        confirmed_address="Keizersgracht 100, Amsterdam",
        result_state="data_incomplete",
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
    await create_share_link(
        briefing_id,
        "buyer-1",
        "briefing",
        "token-hash",
        expires_at="2026-05-06T10:00:00Z",
        db_path=db_path,
    )

    assert await get_share_link_bundle("token-hash", "briefing", db_path=db_path) is None
