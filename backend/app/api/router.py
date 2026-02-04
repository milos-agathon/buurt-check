from fastapi import APIRouter

from app.api.address import router as address_router

router = APIRouter(prefix="/api")
router.include_router(address_router)
