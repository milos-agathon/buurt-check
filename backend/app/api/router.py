from fastapi import APIRouter

from app.api.address import router as address_router
from app.api.metrics import router as metrics_router

router = APIRouter(prefix="/api")
router.include_router(address_router)
router.include_router(metrics_router)
