from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from beanie import PydanticObjectId

from apps.approval_engine.models import ApprovalFlow, ApprovalRequest, RequestStatus


async def get_flow_by_id(flow_id: str) -> Optional[ApprovalFlow]:
    try:
        oid = PydanticObjectId(flow_id)
    except Exception:
        return None
    return await ApprovalFlow.get(oid)


async def list_flows(tenant_id: str, model_id: Optional[str] = None) -> list[ApprovalFlow]:
    filters = [ApprovalFlow.tenant_id == tenant_id]
    if model_id:
        filters.append(ApprovalFlow.model_id == model_id)
    return await ApprovalFlow.find(*filters).to_list()


async def create_flow(
    *,
    name: str,
    model_id: str,
    app_id: str,
    tenant_id: str,
    stages: list,
) -> ApprovalFlow:
    flow = ApprovalFlow(
        name=name,
        model_id=model_id,
        app_id=app_id,
        tenant_id=tenant_id,
        stages=stages,
    )
    await flow.insert()
    return flow


async def update_flow(flow: ApprovalFlow, **kwargs) -> ApprovalFlow:
    for key, value in kwargs.items():
        if hasattr(flow, key):
            setattr(flow, key, value)
    flow.updated_at = datetime.now(tz=timezone.utc)
    await flow.save()
    return flow


async def delete_flow(flow_id: str) -> bool:
    flow = await get_flow_by_id(flow_id)
    if flow is None:
        return False
    await flow.delete()
    return True


async def get_request_by_id(request_id: str) -> Optional[ApprovalRequest]:
    try:
        oid = PydanticObjectId(request_id)
    except Exception:
        return None
    return await ApprovalRequest.get(oid)


async def list_requests(
    tenant_id: str,
    status: Optional[RequestStatus] = None,
    model_id: Optional[str] = None,
    record_id: Optional[str] = None,
    submitted_by: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[ApprovalRequest], int]:
    filters = [ApprovalRequest.tenant_id == tenant_id]
    if status:
        filters.append(ApprovalRequest.status == status)
    if model_id:
        filters.append(ApprovalRequest.model_id == model_id)
    if record_id:
        filters.append(ApprovalRequest.record_id == record_id)
    if submitted_by:
        filters.append(ApprovalRequest.submitted_by == submitted_by)

    query = ApprovalRequest.find(*filters)
    total = await query.count()
    items = await query.skip(skip).limit(limit).to_list()
    return items, total


async def create_request(
    *,
    flow_id: str,
    model_id: str,
    record_id: str,
    tenant_id: str,
    submitted_by: str,
    metadata: dict,
) -> ApprovalRequest:
    req = ApprovalRequest(
        flow_id=flow_id,
        model_id=model_id,
        record_id=record_id,
        tenant_id=tenant_id,
        submitted_by=submitted_by,
        metadata=metadata,
    )
    await req.insert()
    return req


async def save_request(request: ApprovalRequest) -> ApprovalRequest:
    """Save with optimistic-locking: atomically increments ``version`` and fails
    if another writer has already bumped it since we loaded the document."""
    from bson import ObjectId
    from core.database import get_motor_client
    from core.config import get_settings
    from core.exceptions import ConflictError

    now = datetime.now(tz=timezone.utc)
    request.updated_at = now
    expected_version = request.version

    settings = get_settings()
    client = get_motor_client()
    db = client[settings.MONGODB_DB_NAME]
    col = db["approval_requests"]

    doc = request.model_dump(mode="python", exclude={"id", "revision_id"})
    doc["updated_at"] = now
    doc["version"] = expected_version + 1  # write incremented version

    result = await col.find_one_and_update(
        {"_id": ObjectId(str(request.id)), "version": expected_version},
        {"$set": doc},
        return_document=True,
    )
    if result is None:
        raise ConflictError(
            "ApprovalRequest was modified concurrently. Please reload and retry."
        )
    request.version = expected_version + 1
    return request


async def get_pending_requests_for_user(user_id: str, tenant_id: str) -> list[ApprovalRequest]:
    """Return PENDING requests where this user could be an approver."""
    return await ApprovalRequest.find(
        ApprovalRequest.tenant_id == tenant_id,
        ApprovalRequest.status == RequestStatus.PENDING,
    ).to_list()


async def get_requests_for_record(record_id: str) -> list[ApprovalRequest]:
    return await ApprovalRequest.find(ApprovalRequest.record_id == record_id).to_list()


async def get_expired_requests() -> list[ApprovalRequest]:
    now = datetime.now(tz=timezone.utc)
    return await ApprovalRequest.find(
        ApprovalRequest.status == RequestStatus.PENDING,
        ApprovalRequest.sla_deadline < now,
    ).to_list()


async def get_soon_expiring_requests(within_hours: int = 2) -> list[ApprovalRequest]:
    """Return PENDING requests whose SLA deadline is within the next `within_hours` hours."""
    from datetime import timedelta
    now = datetime.now(tz=timezone.utc)
    cutoff = now + timedelta(hours=within_hours)
    return await ApprovalRequest.find(
        ApprovalRequest.status == RequestStatus.PENDING,
        ApprovalRequest.sla_deadline >= now,
        ApprovalRequest.sla_deadline <= cutoff,
    ).to_list()
