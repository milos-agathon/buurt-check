import pytest
from httpx import ASGITransport, AsyncClient

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


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
