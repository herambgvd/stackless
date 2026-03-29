from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from apps.human_tasks.models import HumanTask, HumanTaskStatus
from core.dependencies import get_current_active_user, get_tenant_id
from core.exceptions import ForbiddenError, NotFoundError, ValidationError

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TaskFormFieldOut(BaseModel):
    name: str
    label: str
    type: str
    required: bool
    options: list[str]
    placeholder: str
    default_value: Any


class HumanTaskResponse(BaseModel):
    id: str
    workflow_run_id: str
    workflow_id: str
    step_id: str
    tenant_id: str
    assignee_id: Optional[str]
    title: str
    description: Optional[str]
    form_fields: list[TaskFormFieldOut]
    submitted_data: dict[str, Any]
    status: str
    due_at: Optional[datetime]
    completed_at: Optional[datetime]
    completed_by: Optional[str]
    created_at: datetime
    updated_at: datetime


class HumanTaskSubmit(BaseModel):
    data: dict[str, Any] = {}


class HumanTaskReassign(BaseModel):
    assignee_id: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_response(t: HumanTask) -> HumanTaskResponse:
    return HumanTaskResponse(
        id=str(t.id),
        workflow_run_id=t.workflow_run_id,
        workflow_id=t.workflow_id,
        step_id=t.step_id,
        tenant_id=t.tenant_id,
        assignee_id=t.assignee_id,
        title=t.title,
        description=t.description,
        form_fields=[
            TaskFormFieldOut(
                name=f.name,
                label=f.label,
                type=f.type,
                required=f.required,
                options=f.options,
                placeholder=f.placeholder,
                default_value=f.default_value,
            )
            for f in t.form_fields
        ],
        submitted_data=t.submitted_data,
        status=t.status,
        due_at=t.due_at,
        completed_at=t.completed_at,
        completed_by=t.completed_by,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


async def _get_task_or_404(task_id: str, tenant_id: str) -> HumanTask:
    try:
        oid = PydanticObjectId(task_id)
    except Exception:
        raise NotFoundError("HumanTask", task_id)
    task = await HumanTask.get(oid)
    if not task or task.tenant_id != tenant_id:
        raise NotFoundError("HumanTask", task_id)
    return task


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/human-tasks", response_model=list[HumanTaskResponse])
async def list_my_tasks(
    status_filter: Optional[str] = None,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """List tasks assigned to the current user (or unassigned tasks)."""
    user_id = str(current_user.id)
    filters = [HumanTask.tenant_id == tenant_id]
    if status_filter:
        try:
            filters.append(HumanTask.status == HumanTaskStatus(status_filter))
        except ValueError:
            pass

    all_tasks = await HumanTask.find(*filters).sort(-HumanTask.created_at).to_list()
    return [
        _to_response(t)
        for t in all_tasks
        if t.assignee_id is None or t.assignee_id == user_id
    ]


@router.get("/human-tasks/{task_id}", response_model=HumanTaskResponse)
async def get_task(
    task_id: str,
    tenant_id: str = Depends(get_tenant_id),
    _=Depends(get_current_active_user),
):
    task = await _get_task_or_404(task_id, tenant_id)
    return _to_response(task)


@router.post("/human-tasks/{task_id}/complete", response_model=HumanTaskResponse)
async def complete_task(
    task_id: str,
    payload: HumanTaskSubmit,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Submit form data and resume the paused workflow."""
    task = await _get_task_or_404(task_id, tenant_id)

    if task.status != HumanTaskStatus.PENDING:
        raise ValidationError(f"Task is already {task.status.value}.")

    if task.assignee_id and task.assignee_id != str(current_user.id):
        raise ForbiddenError("This task is assigned to another user.")

    # Validate required fields
    for field in task.form_fields:
        if field.required and not payload.data.get(field.name):
            raise ValidationError(f"Field '{field.label}' is required.")

    task.submitted_data = payload.data
    task.status = HumanTaskStatus.COMPLETED
    task.completed_at = datetime.now(tz=timezone.utc)
    task.completed_by = str(current_user.id)
    task.updated_at = datetime.now(tz=timezone.utc)
    await task.save()

    # Resume workflow via Celery (fire-and-forget)
    try:
        from celery_worker import celery_app
        celery_app.send_task(
            "apps.human_tasks.tasks.resume_workflow_after_human_task",
            args=[task.workflow_run_id, task.step_id, task.submitted_data],
        )
    except Exception:
        pass

    return _to_response(task)


@router.post("/human-tasks/{task_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_task(
    task_id: str,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    task = await _get_task_or_404(task_id, tenant_id)
    if task.status != HumanTaskStatus.PENDING:
        raise ValidationError(f"Task is already {task.status.value}.")
    is_admin = current_user.is_superuser or "admin" in (current_user.roles or [])
    if task.assignee_id and task.assignee_id != str(current_user.id) and not is_admin:
        raise ForbiddenError("Only the assignee or an admin can cancel this task.")
    task.status = HumanTaskStatus.CANCELLED
    task.updated_at = datetime.now(tz=timezone.utc)
    await task.save()


@router.patch("/human-tasks/{task_id}/reassign", response_model=HumanTaskResponse)
async def reassign_task(
    task_id: str,
    payload: HumanTaskReassign,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(get_current_active_user),
):
    """Reassign a pending task to a different user. Superusers or the current assignee may reassign."""
    task = await _get_task_or_404(task_id, tenant_id)

    if task.status != HumanTaskStatus.PENDING:
        raise ValidationError(f"Cannot reassign a task that is already {task.status.value}.")

    if not current_user.is_superuser and task.assignee_id != str(current_user.id):
        raise ForbiddenError("Only the current assignee or a superuser may reassign this task.")

    task.assignee_id = payload.assignee_id
    task.updated_at = datetime.now(tz=timezone.utc)
    await task.save()
    return _to_response(task)
