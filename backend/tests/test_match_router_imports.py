from app.api.admin_match import router as admin_match_router
from app.api.match import router as match_router
from app.api.router import router


def test_match_routers_import_and_are_registered():
    registered_paths = {route.path for route in router.routes}

    assert match_router is not None
    assert admin_match_router is not None
    assert "/api/match/health" in registered_paths
    assert "/api/admin/match/health" in registered_paths
