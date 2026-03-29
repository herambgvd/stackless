from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse

from apps.schema_engine.models import ModelDefinition
from apps.schema_engine.repository import (
    create_dynamic_record,
    delete_dynamic_record,
    get_dynamic_record,
    list_dynamic_records,
    update_dynamic_record,
)
from apps.schema_engine.schemas import DynamicRecordCreate, DynamicRecordUpdate, PaginatedRecordsResponse
from apps.schema_engine.service import validate_record_against_schema
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import NotFoundError, ValidationError


class DynamicRouterGenerator:
    """Generates a FastAPI router for a given ModelDefinition at runtime."""

    def __init__(self, model: ModelDefinition) -> None:
        self.model = model

    def generate(self) -> APIRouter:
        model = self.model
        router = APIRouter()
        model_slug = model.slug
        model_name = model.name
        app_id = model.app_id

        @router.get(
            "",
            summary=f"List {model.plural_name}",
            response_model=PaginatedRecordsResponse,
        )
        async def list_records(
            page: int = Query(1, ge=1),
            page_size: int = Query(50, ge=1, le=500),
            sort_field: str = Query("created_at"),
            sort_dir: int = Query(-1, ge=-1, le=1),
            tenant_id: str = Depends(get_tenant_id),
            _=Depends(get_current_active_user),
        ) -> PaginatedRecordsResponse:
            skip = (page - 1) * page_size
            items, total = await list_dynamic_records(
                model_slug=model_slug,
                tenant_id=tenant_id,
                app_id=app_id,
                sort_field=sort_field,
                sort_dir=sort_dir,
                skip=skip,
                limit=page_size,
            )
            return PaginatedRecordsResponse(
                items=items,
                total=total,
                page=page,
                page_size=page_size,
                has_more=(skip + len(items)) < total,
            )

        @router.post(
            "",
            summary=f"Create {model_name}",
            status_code=status.HTTP_201_CREATED,
        )
        async def create_record(
            payload: DynamicRecordCreate,
            tenant_id: str = Depends(get_tenant_id),
            _=Depends(get_current_active_user),
        ) -> dict[str, Any]:
            errors = await validate_record_against_schema(payload.data, model)
            if errors:
                raise ValidationError("; ".join(errors))
            return await create_dynamic_record(model_slug, tenant_id, app_id, payload.data)

        @router.get(
            "/{record_id}",
            summary=f"Get {model_name}",
        )
        async def get_record(
            record_id: str,
            tenant_id: str = Depends(get_tenant_id),
            _=Depends(get_current_active_user),
        ) -> dict[str, Any]:
            record = await get_dynamic_record(model_slug, tenant_id, app_id, record_id)
            if record is None:
                raise NotFoundError(model_name, record_id)
            return record

        @router.put(
            "/{record_id}",
            summary=f"Update {model_name}",
        )
        async def update_record(
            record_id: str,
            payload: DynamicRecordUpdate,
            tenant_id: str = Depends(get_tenant_id),
            _=Depends(get_current_active_user),
        ) -> dict[str, Any]:
            errors = await validate_record_against_schema(payload.data, model)
            if errors:
                raise ValidationError("; ".join(errors))
            record = await update_dynamic_record(model_slug, tenant_id, app_id, record_id, payload.data)
            if record is None:
                raise NotFoundError(model_name, record_id)
            return record

        @router.patch(
            "/{record_id}",
            summary=f"Patch {model_name}",
        )
        async def patch_record(
            record_id: str,
            payload: DynamicRecordUpdate,
            tenant_id: str = Depends(get_tenant_id),
            _=Depends(get_current_active_user),
        ) -> dict[str, Any]:
            record = await update_dynamic_record(model_slug, tenant_id, app_id, record_id, payload.data)
            if record is None:
                raise NotFoundError(model_name, record_id)
            return record

        @router.delete(
            "/{record_id}",
            summary=f"Delete {model_name}",
            status_code=status.HTTP_204_NO_CONTENT,
        )
        async def delete_record(
            record_id: str,
            tenant_id: str = Depends(get_tenant_id),
            _=Depends(get_current_active_user),
        ) -> None:
            deleted = await delete_dynamic_record(model_slug, tenant_id, app_id, record_id)
            if not deleted:
                raise NotFoundError(model_name, record_id)

        return router
