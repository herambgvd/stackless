from __future__ import annotations

from fastapi import APIRouter

from apps.schema_engine.routes_apps import router as apps_router
from apps.schema_engine.routes_models import router as models_router
from apps.schema_engine.routes_records import router as records_router
from apps.schema_engine.routes_views import router as views_router
from apps.schema_engine.routes_misc import router as misc_router

router = APIRouter()
router.include_router(apps_router)
router.include_router(models_router)
router.include_router(records_router)
router.include_router(views_router)
router.include_router(misc_router)
