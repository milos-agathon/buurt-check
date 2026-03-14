from types import SimpleNamespace

import pytest

from app.config import settings
from app.db import get_db, init_db

pytestmark = pytest.mark.turso


class FakeCursor:
    def __init__(self, description=(), rows=(), rowcount=0):
        self.description = tuple(description)
        self._rows = list(rows)
        self.rowcount = rowcount
        self.closed = False

    def fetchall(self):
        return list(self._rows)

    def close(self):
        self.closed = True


class FakeLibsqlConnection:
    def __init__(self):
        self.closed = False
        self.committed = False
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if sql.startswith("SELECT"):
            return FakeCursor(
                description=(("report_id",), ("payment_status",)),
                rows=[("report-1", "paid")],
                rowcount=0,
            )
        return FakeCursor(rowcount=1)

    def commit(self):
        self.committed = True

    def close(self):
        self.closed = True


@pytest.fixture
def turso_settings(monkeypatch):
    monkeypatch.setattr(settings, "turso_database_url", "libsql://example.turso.io")
    monkeypatch.setattr(settings, "turso_auth_token", "token")


@pytest.mark.asyncio
async def test_get_db_uses_turso_adapter_and_ignores_db_path(
    monkeypatch, turso_settings
):
    fake_connection = FakeLibsqlConnection()
    captured = {}

    def fake_connect(url, auth_token, _check_same_thread):
        captured["url"] = url
        captured["auth_token"] = auth_token
        captured["check_same_thread"] = _check_same_thread
        return fake_connection

    monkeypatch.setattr(
        "app.db.libsql",
        SimpleNamespace(connect=fake_connect, Error=Exception),
    )

    async with get_db("ignored-local.db") as db:
        cursor = await db.execute(
            "SELECT report_id, payment_status FROM reports WHERE report_id = ?",
            ("report-1",),
        )
        row = await cursor.fetchone()
        assert row is not None
        assert row[0] == "report-1"
        assert row["payment_status"] == "paid"
        assert dict(row) == {
            "report_id": "report-1",
            "payment_status": "paid",
        }

        update_cursor = await db.execute(
            "UPDATE reports SET payment_status = 'paid' WHERE report_id = ?",
            ("report-1",),
        )
        assert update_cursor.rowcount == 1
        await db.commit()

    assert captured == {
        "url": "libsql://example.turso.io",
        "auth_token": "token",
        "check_same_thread": False,
    }
    assert fake_connection.calls[0][1] == ("report-1",)
    assert fake_connection.committed is True
    assert fake_connection.closed is True


@pytest.mark.asyncio
async def test_init_db_executes_schema_on_turso(monkeypatch, turso_settings):
    fake_connection = FakeLibsqlConnection()

    def fake_connect(url, auth_token, _check_same_thread):
        return fake_connection

    monkeypatch.setattr(
        "app.db.libsql",
        SimpleNamespace(connect=fake_connect, Error=Exception),
    )

    await init_db("ignored-local.db")

    assert len(fake_connection.calls) == 4
    assert fake_connection.calls[0][0].startswith("CREATE TABLE IF NOT EXISTS reports")
    assert fake_connection.calls[-1][0].startswith(
        "CREATE INDEX IF NOT EXISTS idx_reports_provider_payment"
    )
    assert fake_connection.committed is True
    assert fake_connection.closed is True
