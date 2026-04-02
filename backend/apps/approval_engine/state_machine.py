from __future__ import annotations

import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional

from apps.approval_engine.models import (
    ApprovalFlow,
    ApprovalRequest,
    ApprovalStage,
    ApproverType,
    DecisionAction,
    EscalationPolicy,
    RequestStatus,
    StageDecision,
)
from apps.approval_engine.repository import (
    get_expired_requests,
    get_flow_by_id,
    get_request_by_id,
    save_request,
)
from core.exceptions import ApprovalError, NotFoundError

log = structlog.get_logger(__name__)


class ApprovalStateMachine:

    async def submit(self, request_id: str) -> ApprovalRequest:
        """Transition a Draft request to Pending and set the SLA timer."""
        request = await get_request_by_id(request_id)
        if request is None:
            raise NotFoundError("ApprovalRequest", request_id)

        if request.status != RequestStatus.DRAFT:
            raise ApprovalError(f"Cannot submit a request in '{request.status}' status.")

        flow = await get_flow_by_id(request.flow_id)
        if flow is None:
            raise NotFoundError("ApprovalFlow", request.flow_id)

        now = datetime.now(tz=timezone.utc)
        request.status = RequestStatus.PENDING
        request.submitted_at = now
        request.current_stage_index = 0

        if flow.stages:
            stage = flow.stages[0]
            request.sla_deadline = now + timedelta(hours=stage.sla_hours)

        await save_request(request)
        log.info("Approval request submitted", request_id=request_id)
        return request

    async def decide(
        self,
        request_id: str,
        user_id: str,
        action: DecisionAction,
        comment: Optional[str] = None,
        delegated_to: Optional[str] = None,
    ) -> ApprovalRequest:
        """Record a decision and advance the approval flow."""
        request = await get_request_by_id(request_id)
        if request is None:
            raise NotFoundError("ApprovalRequest", request_id)

        if request.status != RequestStatus.PENDING:
            raise ApprovalError(f"Request is not pending (current status: {request.status}).")

        flow = await get_flow_by_id(request.flow_id)
        if flow is None:
            raise NotFoundError("ApprovalFlow", request.flow_id)

        if request.current_stage_index >= len(flow.stages):
            raise ApprovalError("No more stages to process.")

        current_stage = flow.stages[request.current_stage_index]

        if not await self.can_approve(request, user_id, flow):
            raise ApprovalError("You are not authorised to approve this request at the current stage.")

        decision = StageDecision(
            stage_id=current_stage.id,
            approver_id=user_id,
            action=action,
            comment=comment,
            delegated_to=delegated_to,
        )
        request.stage_decisions.append(decision)

        if action == DecisionAction.REJECT:
            request.status = RequestStatus.REJECTED
            request.completed_at = datetime.now(tz=timezone.utc)
            await save_request(request)
            return request

        if action == DecisionAction.REQUEST_INFO:
            request.status = RequestStatus.INFO_REQUESTED
            await save_request(request)
            return request

        if action == DecisionAction.DELEGATE:
            # Delegation is recorded; the delegatee becomes an approver for this stage
            await save_request(request)
            return request

        # action == APPROVE — check if the stage approval mode is satisfied
        stage_decisions_for_current = [
            d for d in request.stage_decisions
            if d.stage_id == current_stage.id and d.action == DecisionAction.APPROVE
        ]

        stage_satisfied = self._is_stage_satisfied(
            current_stage, stage_decisions_for_current
        )

        if stage_satisfied:
            await self.advance_to_next_stage(request, flow)

        await save_request(request)
        return request

    def _is_stage_satisfied(self, stage: ApprovalStage, approve_decisions: list) -> bool:
        """Check if approval mode criteria are met."""
        approver_count = len(stage.approvers)
        approved_count = len(approve_decisions)

        if stage.approval_mode.value == "any_one":
            return approved_count >= 1
        elif stage.approval_mode.value == "all":
            return approved_count >= approver_count
        elif stage.approval_mode.value == "majority":
            return approved_count > approver_count / 2
        return False

    async def advance_to_next_stage(
        self,
        request: ApprovalRequest,
        flow: ApprovalFlow,
    ) -> None:
        """Move to the next stage or mark as approved if all stages are done.

        Handles:
        - skip_condition: evaluates condition dict against request metadata; skips stage if true
        - parallel stages: groups stages by parallel_with_stage_ids and advances past the group
        """
        next_index = request.current_stage_index + 1

        # Build a set of stage IDs in the current parallel group so we can skip them together
        current_stage = flow.stages[request.current_stage_index]
        parallel_group_ids: set[str] = set(current_stage.parallel_with_stage_ids)
        if parallel_group_ids:
            # All stages in this parallel group are treated as one logical step
            # Find the first stage after the entire parallel group
            group_ids = parallel_group_ids | {current_stage.id}
            while next_index < len(flow.stages) and flow.stages[next_index].id in group_ids:
                next_index += 1

        # Skip stages whose skip_condition is satisfied
        while next_index < len(flow.stages):
            next_stage = flow.stages[next_index]
            if next_stage.skip_condition and await self._evaluate_skip_condition(
                next_stage.skip_condition, request
            ):
                log.info(
                    "Skipping approval stage due to skip_condition",
                    stage=next_stage.name,
                    request_id=str(request.id),
                )
                next_index += 1
                continue
            break
        else:
            # All stages passed
            request.status = RequestStatus.APPROVED
            request.completed_at = datetime.now(tz=timezone.utc)
            await self.trigger_post_approval_actions(request)
            return

        request.current_stage_index = next_index
        now = datetime.now(tz=timezone.utc)
        request.sla_deadline = now + timedelta(hours=flow.stages[next_index].sla_hours)

    async def _evaluate_skip_condition(self, condition: dict, request: ApprovalRequest) -> bool:
        """Evaluate a skip_condition dict (RuleCondition shape) against request metadata + record data."""
        try:
            from apps.rules_engine.evaluator import RuleEvaluator
            from apps.rules_engine.models import RuleCondition, RuleOperator

            # Build evaluation context from request metadata and record fields
            context: dict = dict(request.metadata or {})
            context["record_id"] = request.record_id
            context["submitted_by"] = request.submitted_by
            context["status"] = request.status.value

            operator_value = condition.get("operator", "equals")
            try:
                operator = RuleOperator(operator_value)
            except ValueError:
                operator = RuleOperator.EQUALS

            rule_condition = RuleCondition(
                field=condition.get("field", ""),
                operator=operator,
                value=condition.get("value"),
            )
            evaluator = RuleEvaluator()
            return evaluator._check_operator(rule_condition, context, {})
        except Exception:
            return False

    async def can_approve(
        self,
        request: ApprovalRequest,
        user_id: str,
        flow: ApprovalFlow,
    ) -> bool:
        """Check whether a user can approve the current stage."""
        if request.current_stage_index >= len(flow.stages):
            return False

        current_stage = flow.stages[request.current_stage_index]
        from apps.auth.repository import get_user_by_id

        user = await get_user_by_id(user_id)
        if user is None:
            return False
        if user.is_superuser:
            return True

        for approver in current_stage.approvers:
            if approver.type == ApproverType.USER and approver.value == user_id:
                return True
            elif approver.type == ApproverType.ROLE and approver.value in (user.roles or []):
                return True
            elif approver.type == ApproverType.FIELD_REF:
                # Resolve the field value from the record associated with this request
                resolved_user_id = await self._resolve_field_ref_approver(
                    approver.value, request
                )
                if resolved_user_id and resolved_user_id == user_id:
                    return True

        # Check delegations
        for decision in request.stage_decisions:
            if decision.delegated_to == user_id and decision.stage_id == current_stage.id:
                return True

        return False

    async def _resolve_field_ref_approver(
        self,
        field_name: str,
        request: ApprovalRequest,
    ) -> Optional[str]:
        """Look up a field value on the associated record to resolve the approver's user_id."""
        try:
            from core.database import get_tenant_db
            from apps.schema_engine.repository import get_model_by_id

            model = await get_model_by_id(request.model_id)
            if model is None:
                return None

            db = get_tenant_db(model.tenant_id)
            collection_name = f"data__{model.app_id}__{model.slug}"
            col = db[collection_name]

            from bson import ObjectId
            try:
                oid = ObjectId(request.record_id)
            except Exception:
                return None

            doc = await col.find_one({"_id": oid})
            if doc is None:
                return None

            return str(doc.get(field_name, "")) or None
        except Exception:
            return None

    async def check_sla_expiry(self) -> None:
        """Called by Celery Beat to handle expired requests and send SLA warnings."""
        from apps.approval_engine.repository import get_soon_expiring_requests

        # 1. Handle fully expired requests
        expired = await get_expired_requests()
        for request in expired:
            flow = await get_flow_by_id(request.flow_id)
            if flow is None:
                continue
            if request.current_stage_index < len(flow.stages):
                stage = flow.stages[request.current_stage_index]
                if stage.escalation_policy == EscalationPolicy.AUTO_REJECT:
                    request.status = RequestStatus.EXPIRED
                    request.completed_at = datetime.now(tz=timezone.utc)
                    # Notify submitter
                    await self._notify_sla_expired(request)
                else:
                    # Auto-escalate: move to next stage
                    await self.advance_to_next_stage(request, flow)
            else:
                request.status = RequestStatus.EXPIRED
                request.completed_at = datetime.now(tz=timezone.utc)

            await save_request(request)
            log.info("SLA expiry handled", request_id=str(request.id))

        # 2. Send warning notifications for requests expiring within 2 hours
        warning_requests = await get_soon_expiring_requests(within_hours=2)
        for request in warning_requests:
            await self._notify_sla_warning(request)

    async def _notify_sla_warning(self, request: ApprovalRequest) -> None:
        """Send in-app notification to the submitter that their request is about to expire."""
        try:
            from apps.notifications.service import send_notification
            await send_notification(
                channel="in_app",
                recipient=request.submitted_by,
                template_id=None,
                notification_context={
                    "request_id": str(request.id),
                    "record_id": request.record_id,
                    "sla_deadline": request.sla_deadline.isoformat() if request.sla_deadline else "",
                    "message": f"Approval request {str(request.id)[-8:]} is expiring within 2 hours.",
                },
                tenant_id=request.tenant_id,
                subject="Approval SLA Warning",
                body=f"Approval request for record {request.record_id} is expiring soon.",
            )
        except Exception:
            pass

    async def _notify_sla_expired(self, request: ApprovalRequest) -> None:
        """Notify submitter that their approval request has expired."""
        try:
            from apps.notifications.service import send_notification
            await send_notification(
                channel="in_app",
                recipient=request.submitted_by,
                template_id=None,
                notification_context={
                    "request_id": str(request.id),
                    "record_id": request.record_id,
                    "message": f"Approval request {str(request.id)[-8:]} has expired and been rejected.",
                },
                tenant_id=request.tenant_id,
                subject="Approval Request Expired",
                body=f"Approval request for record {request.record_id} has expired.",
            )
        except Exception:
            pass

    async def trigger_post_approval_actions(self, request: ApprovalRequest) -> None:
        """Fire downstream workflows configured to trigger on approval completion."""
        log.info(
            "Approval completed, triggering post-approval actions",
            request_id=str(request.id),
            record_id=request.record_id,
        )
        try:
            from apps.workflow_engine.repository import get_approval_event_workflows
            from apps.workflow_engine.tasks import execute_workflow_task

            flow = await get_flow_by_id(request.flow_id)
            if flow is None:
                return

            workflows = await get_approval_event_workflows(flow.tenant_id, "on_approved")
            for wf in workflows:
                execute_workflow_task.delay(
                    workflow_id=str(wf.id),
                    trigger_record_id=request.record_id,
                    trigger_event="on_approved",
                    context={
                        "approval_request_id": str(request.id),
                        "flow_id": request.flow_id,
                        "record_id": request.record_id,
                        "model_id": request.model_id,
                    },
                )
                log.info("Fired post-approval workflow", workflow_id=str(wf.id), request_id=str(request.id))
        except Exception:
            log.exception("Failed to trigger post-approval workflows", request_id=str(request.id))
