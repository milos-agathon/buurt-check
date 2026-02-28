import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import require_entitlement
from app.main import app
from app.rate_limit import limiter


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Reset rate limiter storage between tests to prevent cross-test 429s."""
    limiter.reset()
    yield
    limiter.reset()


async def _entitlement_bypass():
    """No-op override that skips entitlement checks in normal test client."""
    return None


@pytest_asyncio.fixture
async def client():
    app.dependency_overrides[require_entitlement] = _entitlement_bypass
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.pop(require_entitlement, None)
