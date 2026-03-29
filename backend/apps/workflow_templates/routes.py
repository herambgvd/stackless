from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status

from apps.workflow_templates.definitions import WORKFLOW_TEMPLATES, TEMPLATE_BY_ID
from core.dependencies import get_current_active_user, get_tenant_id, require_permission
from core.exceptions import NotFoundError

router = APIRouter()


@router.get("/workflow-templates", tags=["workflow-templates"])
async def list_workflow_templates(
    category: str | None = None,
    _=Depends(get_current_active_user),
):
    templates = WORKFLOW_TEMPLATES
    if category:
        templates = [t for t in templates if t.get("category") == category]
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "category": t["category"],
            "tags": t["tags"],
            "icon": t["icon"],
            "color": t["color"],
            "step_count": len(t["workflow"].get("steps", [])),
            "trigger_type": t["workflow"]["trigger"]["type"],
        }
        for t in templates
    ]


@router.get("/workflow-templates/{template_id}", tags=["workflow-templates"])
async def get_workflow_template(
    template_id: str,
    _=Depends(get_current_active_user),
):
    tpl = TEMPLATE_BY_ID.get(template_id)
    if not tpl:
        raise NotFoundError("WorkflowTemplate", template_id)
    return tpl


@router.post(
    "/workflow-templates/{template_id}/install",
    status_code=status.HTTP_201_CREATED,
    tags=["workflow-templates"],
)
async def install_workflow_template(
    template_id: str,
    app_id: str | None = None,
    model_id: str | None = None,
    tenant_id: str = Depends(get_tenant_id),
    current_user=Depends(require_permission("workflows", "create")),
):
    """
    Instantiate a workflow template into a real Workflow document.
    Returns the created Workflow (including its ID so the user can open it).
    """
    tpl = TEMPLATE_BY_ID.get(template_id)
    if not tpl:
        raise NotFoundError("WorkflowTemplate", template_id)

    from apps.workflow_engine.models import (
        Workflow, WorkflowStep, WorkflowTrigger,
        TriggerType, TriggerEvent, BranchCondition, RetryConfig,
    )

    wf_spec = tpl["workflow"]
    trigger_spec = wf_spec["trigger"]

    # Build trigger
    trigger = WorkflowTrigger(
        type=TriggerType(trigger_spec["type"]),
        event=TriggerEvent(trigger_spec["event"]) if trigger_spec.get("event") else None,
        field_name=trigger_spec.get("field_name"),
        cron_expression=trigger_spec.get("cron_expression"),
    )

    # Build steps
    steps = []
    for s in wf_spec.get("steps", []):
        branch_conditions = [
            BranchCondition(
                condition=bc["condition"],
                next_step_id=bc["next_step_id"],
                label=bc.get("label", ""),
            )
            for bc in s.get("branch_conditions", [])
        ]
        steps.append(WorkflowStep(
            id=s.get("id", str(uuid.uuid4())),
            name=s["name"],
            type=s["type"],
            config=s.get("config", {}),
            next_step_id=s.get("next_step_id"),
            branch_conditions=branch_conditions,
            order=s.get("order", 0),
        ))

    workflow = Workflow(
        name=wf_spec["name"],
        tenant_id=tenant_id,
        app_id=app_id,
        model_id=model_id,
        trigger=trigger,
        steps=steps,
        is_active=False,  # Start inactive — user must review and enable
    )
    await workflow.insert()

    return {
        "id": str(workflow.id),
        "name": workflow.name,
        "tenant_id": workflow.tenant_id,
        "app_id": workflow.app_id,
        "is_active": workflow.is_active,
        "step_count": len(workflow.steps),
        "template_id": template_id,
        "message": "Workflow installed successfully. Review configuration and enable it when ready.",
    }
