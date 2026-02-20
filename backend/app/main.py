import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.router import router
from app.config import settings

_access = logging.getLogger("buurt.access")

app = FastAPI(
    title="buurt-check API",
    version="0.1.0",
    description="Pre-viewing intelligence for property buyers in the Netherlands",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(router)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    _access.info(
        "%s %s %s %.0fms",
        duration_ms,
        request.method,
        request.url.path,
        response.status_code,
    )
    return response


@app.get("/health")
async def health():
    return {"status": "ok"}
