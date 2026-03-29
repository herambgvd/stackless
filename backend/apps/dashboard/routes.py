from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any, Optional

from apps.schema_engine.models import AppDefinition
from apps.workflow_engine.models import Workflow, RunStatus, WorkflowRun
from apps.approval_engine.models import ApprovalRequest, RequestStatus
from apps.auth.models import User
from core.dependencies import get_current_active_user

router = APIRouter()


class DashboardStats(BaseModel):
    total_apps: int
    active_workflows: int
    pending_approvals: int
    total_users: int
    recent_runs: int


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user=Depends(get_current_active_user),
):
    """Aggregate dashboard statistics for the current tenant."""
    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None

    if not tenant_id:
        return DashboardStats(
            total_apps=0,
            active_workflows=0,
            pending_approvals=0,
            total_users=0,
            recent_runs=0,
        )

    total_apps = await AppDefinition.find({"tenant_id": tenant_id}).count()

    active_workflows = await Workflow.find(
        {"tenant_id": tenant_id, "is_active": True}
    ).count()

    pending_approvals = await ApprovalRequest.find(
        {
            "tenant_id": tenant_id,
            "status": RequestStatus.PENDING,
        }
    ).count()

    total_users = await User.find({"tenant_id": tenant_id}).count()

    from datetime import datetime, timedelta, timezone
    seven_days_ago = datetime.now(tz=timezone.utc) - timedelta(days=7)
    recent_runs = await WorkflowRun.find(
        {"tenant_id": tenant_id, "created_at": {"$gte": seven_days_ago}}
    ).count()

    return DashboardStats(
        total_apps=total_apps,
        active_workflows=active_workflows,
        pending_approvals=pending_approvals,
        total_users=total_users,
        recent_runs=recent_runs,
    )


@router.get("/workspace")
async def get_workspace(
    current_user=Depends(get_current_active_user),
):
    """
    Personal workspace data for the home page:
    - Recent apps
    - Pending tasks (mine)
    - Pending approvals (mine)
    - Recent workflow runs (last 5, this tenant)
    - Pinned / favourite records (mine)
    """
    from apps.human_tasks.models import HumanTask, HumanTaskStatus
    from apps.schema_engine.favourites_routes import RecordFavourite

    tenant_id = str(current_user.tenant_id) if current_user.tenant_id else None
    user_id = str(current_user.id)

    if not tenant_id:
        return {
            "user": {"id": user_id, "name": current_user.full_name, "email": current_user.email},
            "recent_apps": [],
            "my_tasks": {"count": 0, "items": []},
            "my_approvals": {"count": 0, "items": []},
            "recent_runs": [],
            "favourites": [],
        }

    # Recent apps (last 6 updated)
    apps = await AppDefinition.find(
        {"tenant_id": tenant_id}
    ).sort(-AppDefinition.updated_at).limit(6).to_list()
    recent_apps = [
        {"id": str(a.id), "name": a.name, "slug": a.slug,
         "icon": a.icon, "color": a.color, "description": a.description}
        for a in apps
    ]

    # My pending tasks
    my_tasks_q = HumanTask.find(
        HumanTask.tenant_id == tenant_id, HumanTask.assignee_id == user_id, HumanTask.status == HumanTaskStatus.PENDING
    )
    my_tasks_count = await my_tasks_q.count()
    my_tasks_list = await my_tasks_q.sort(-HumanTask.created_at).limit(5).to_list()
    my_tasks = {
        "count": my_tasks_count,
        "items": [
            {
                "id": str(t.id),
                "title": t.title,
                "description": t.description or "",
                "due_at": t.due_at.isoformat() if t.due_at else None,
                "workflow_run_id": t.workflow_run_id,
            }
            for t in my_tasks_list
        ],
    }

    # My pending approval requests
    my_approvals_q = ApprovalRequest.find(
        {"tenant_id": tenant_id, "status": RequestStatus.PENDING}
    )
    my_approvals_count = await my_approvals_q.count()
    my_approvals_list = await my_approvals_q.sort(-ApprovalRequest.created_at).limit(5).to_list()
    my_approvals = {
        "count": my_approvals_count,
        "items": [
            {
                "id": str(r.id),
                "flow_id": r.flow_id,
                "record_id": r.record_id,
                "model_id": r.model_id,
                "created_at": r.created_at.isoformat(),
            }
            for r in my_approvals_list
        ],
    }

    # Recent workflow runs (tenant-wide, last 8)
    since = datetime.now(tz=timezone.utc) - timedelta(days=7)
    runs = await WorkflowRun.find(
        {"tenant_id": tenant_id, "created_at": {"$gte": since}}
    ).sort(-WorkflowRun.created_at).limit(8).to_list()
    recent_runs = [
        {
            "id": str(r.id),
            "workflow_id": r.workflow_id,
            "status": r.status,
            "trigger_event": r.trigger_event,
            "created_at": r.created_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "error": r.error,
        }
        for r in runs
    ]

    # Pinned records (favourites)
    favs = await RecordFavourite.find(
        {"tenant_id": tenant_id, "user_id": user_id}
    ).sort(-RecordFavourite.created_at).limit(10).to_list()
    favourites = [
        {
            "app_id": f.app_id,
            "model_slug": f.model_slug,
            "record_id": f.record_id,
        }
        for f in favs
    ]

    return {
        "user": {"id": user_id, "name": current_user.full_name, "email": current_user.email},
        "recent_apps": recent_apps,
        "my_tasks": my_tasks,
        "my_approvals": my_approvals,
        "recent_runs": recent_runs,
        "favourites": favourites,
    }
