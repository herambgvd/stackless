from __future__ import annotations

from typing import Any

from apps.portal.models import PortalSubmission


async def create_submission(
    app_id: str,
    tenant_id: str,
    data: dict[str, Any],
    submitted_by: str | None = None,
    ip_address: str | None = None,
    model_slug: str | None = None,
    record_id: str | None = None,
) -> PortalSubmission:
    sub = PortalSubmission(
        app_id=app_id,
        tenant_id=tenant_id,
        model_slug=model_slug,
        record_id=record_id,
        data=data,
        submitted_by=submitted_by,
        ip_address=ip_address,
    )
    await sub.insert()
    return sub


async def list_submissions(
    app_id: str,
    tenant_id: str,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[PortalSubmission], int]:
    query = {"app_id": app_id, "tenant_id": tenant_id}
    total = await PortalSubmission.find(query).count()
    items = (
        await PortalSubmission.find(query)
        .sort(-PortalSubmission.created_at)
        .skip(skip)
        .limit(limit)
        .to_list()
    )
    return items, total


async def get_submission(submission_id: str, tenant_id: str) -> PortalSubmission | None:
    return await PortalSubmission.find_one(
        {"_id": submission_id, "tenant_id": tenant_id}
    )
