from fastapi import APIRouter

from app.api.address import router as address_router
from app.api.billing import public_router as pricing_router
from app.api.billing import router as billing_router
from app.api.metrics import router as metrics_router
from app.api.reports import router as reports_router

router = APIRouter(prefix="/api")
router.include_router(address_router)
router.include_router(billing_router)
router.include_router(pricing_router)
router.include_router(metrics_router)
router.include_router(reports_router)
