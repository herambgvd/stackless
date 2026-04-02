from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import structlog

from apps.workflow_engine.models import (
    RunStatus,
    StepResult,
    StepType,
    Workflow,
    WorkflowRun,
    WorkflowStep,
)
from apps.workflow_engine.repository import (
    create_run,
    get_run_by_id,
    get_workflow_by_id,
    save_run,
    update_run_step_result,
)
from core.exceptions import WorkflowExecutionError

log = structlog.get_logger(__name__)


class _HumanTaskPause(Exception):
    """Raised by handle_human_task to cleanly pause workflow execution."""

    def __init__(self, task_id: str) -> None:
        self.task_id = task_id
        super().__init__(f"Workflow paused: human task {task_id} created")


class WorkflowExecutor:

    def __init__(self, _visited_workflow_ids: set[str] | None = None) -> None:
        # Track which workflow IDs are already in the call stack to prevent
        # infinite recursion through sub_workflow steps.
        self._visited_workflow_ids: set[str] = _visited_workflow_ids or set()

    async def execute_workflow(
        self,
        workflow_id: str,
        trigger_record_id: Optional[str],
        trigger_event: Optional[str],
        context: dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> WorkflowRun:
        if workflow_id in self._visited_workflow_ids:
            raise WorkflowExecutionError(
                f"Circular sub-workflow detected: workflow '{workflow_id}' is already "
                f"in the current call stack ({self._visited_workflow_ids})."
            )
        self._visited_workflow_ids.add(workflow_id)

        workflow = await get_workflow_by_id(workflow_id)
        if workflow is None:
            raise WorkflowExecutionError(f"Workflow '{workflow_id}' not found.")

        if not workflow.is_active:
            raise WorkflowExecutionError("Workflow is not active.")

        # Idempotency check
        if idempotency_key:
            from apps.workflow_engine.repository import WorkflowRun as WFRun
            existing = await WFRun.find_one(WFRun.idempotency_key == idempotency_key)
            if existing:
                return existing

        run = await create_run(
            workflow_id=workflow_id,
            tenant_id=workflow.tenant_id,
            trigger_record_id=trigger_record_id,
            trigger_event=trigger_event,
            variables=dict(context),
            idempotency_key=idempotency_key,
        )

        log.info("Starting workflow execution", workflow_id=workflow_id, run_id=str(run.id))

        # Inject workflow's app_id into context so step handlers can scope DB collections
        context = {**context, "__app_id__": workflow.app_id or ""}

        try:
            steps_by_id = {s.id: s for s in workflow.steps}
            sorted_steps = sorted(workflow.steps, key=lambda s: s.order)

            if not sorted_steps:
                run.status = RunStatus.COMPLETED
                run.completed_at = datetime.now(tz=timezone.utc)
                await save_run(run)
                return run

            current_step = sorted_steps[0]
            while current_step is not None:
                run.current_step_id = current_step.id
                await save_run(run)

                step_result = await self._execute_step_with_retry(current_step, run, context)
                await update_run_step_result(run, step_result)

                if step_result.status == RunStatus.FAILED:
                    run.status = RunStatus.FAILED
                    run.error = step_result.error
                    break

                # Human task pause — save state and return early; Celery will resume
                if step_result.output_data.get("status") == "waiting_for_human":
                    run.status = RunStatus.PENDING
                    await save_run(run)
                    return run

                # Determine next step
                next_step_id = self._resolve_next_step(current_step, step_result)
                current_step = steps_by_id.get(next_step_id) if next_step_id else None

            else:
                run.status = RunStatus.COMPLETED

            if run.status != RunStatus.FAILED:
                run.status = RunStatus.COMPLETED

        except Exception as exc:
            log.error("Workflow execution failed", exc_info=exc, run_id=str(run.id))
            run.status = RunStatus.FAILED
            run.error = str(exc)

        run.completed_at = datetime.now(tz=timezone.utc)
        await save_run(run)
        return run

    async def _execute_step_with_retry(
        self,
        step: WorkflowStep,
        run: WorkflowRun,
        context: dict[str, Any],
    ) -> StepResult:
        result = StepResult(
            step_id=step.id,
            status=RunStatus.RUNNING,
            started_at=datetime.now(tz=timezone.utc),
        )

        retry_config = step.retry_config
        attempt = 0
        delay = retry_config.initial_delay_seconds

        while attempt < retry_config.max_attempts:
            attempt += 1
            result.attempt_count = attempt
            try:
                output = await asyncio.wait_for(
                    self.execute_step(step, run, context),
                    timeout=step.timeout_seconds if hasattr(step, 'timeout_seconds') and step.timeout_seconds else 60,
                )
                result.output_data = output
                result.status = RunStatus.COMPLETED
                result.completed_at = datetime.now(tz=timezone.utc)
                return result
            except Exception as exc:
                # Human task pause is not a failure — return immediately without retry
                if isinstance(exc, _HumanTaskPause):
                    result.status = RunStatus.PENDING
                    result.output_data = {
                        "human_task_id": exc.task_id,
                        "status": "waiting_for_human",
                    }
                    result.completed_at = datetime.now(tz=timezone.utc)
                    return result

                log.warning(
                    "Step failed, retrying",
                    step_id=step.id,
                    attempt=attempt,
                    error=str(exc),
                )
                if attempt >= retry_config.max_attempts:
                    result.status = RunStatus.FAILED
                    result.error = str(exc)
                    result.completed_at = datetime.now(tz=timezone.utc)
                    return result
                await asyncio.sleep(delay)
                delay = int(delay * retry_config.backoff_multiplier)

        result.status = RunStatus.FAILED
        result.completed_at = datetime.now(tz=timezone.utc)
        return result

    async def execute_step(
        self,
        step: WorkflowStep,
        run: WorkflowRun,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        handlers = {
            StepType.CREATE_RECORD: self.handle_create_record,
            StepType.UPDATE_RECORD: self.handle_update_record,
            StepType.SEND_NOTIFICATION: self.handle_send_notification,
            StepType.TRIGGER_APPROVAL: self.handle_trigger_approval,
            StepType.WAIT_DELAY: self.handle_wait_delay,
            StepType.CONDITIONAL_BRANCH: self.handle_conditional_branch,
            StepType.LOOP: self.handle_loop,
            StepType.HTTP_REQUEST: self.handle_http_request,
            StepType.SUB_WORKFLOW: self.handle_sub_workflow,
            StepType.SET_VARIABLE: self.handle_set_variable,
            StepType.HUMAN_TASK: self.handle_human_task,
            StepType.SLACK_MESSAGE: self.handle_slack_message,
            StepType.WHATSAPP_SEND: self.handle_whatsapp_send,
            StepType.STRIPE_CREATE_PAYMENT: self.handle_stripe_create_payment,
            StepType.GOOGLE_SHEETS_APPEND: self.handle_google_sheets_append,
            StepType.SEND_EMAIL: self.handle_send_email,
        }
        handler = handlers.get(step.type)
        if handler is None:
            raise WorkflowExecutionError(f"No handler for step type '{step.type}'.")
        return await handler(step, run, context)

    def _resolve_next_step(self, step: WorkflowStep, result: StepResult) -> Optional[str]:
        if step.type == StepType.CONDITIONAL_BRANCH:
            return result.output_data.get("next_step_id")
        return step.next_step_id

    # ── Step Handlers ──────────────────────────────────────────────────────────

    async def handle_create_record(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.schema_engine.repository import create_dynamic_record

        cfg = step.config
        model_slug = cfg.get("model_slug")
        app_id = cfg.get("app_id") or context.get("__app_id__", "")
        data = self._interpolate(cfg.get("data", {}), context, run.variables)
        record = await create_dynamic_record(model_slug, run.tenant_id, app_id, data)
        run.variables[f"step_{step.id}_record"] = record
        return {"record": record}

    async def handle_update_record(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.schema_engine.repository import update_dynamic_record

        cfg = step.config
        model_slug = cfg.get("model_slug")
        app_id = cfg.get("app_id") or context.get("__app_id__", "")
        record_id = self._resolve_value(cfg.get("record_id"), context, run.variables)
        data = self._interpolate(cfg.get("data", {}), context, run.variables)
        record = await update_dynamic_record(model_slug, run.tenant_id, app_id, str(record_id), data)
        return {"record": record}

    async def handle_send_notification(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        cfg = step.config
        # Dispatch to notification service
        from apps.notifications.service import send_notification

        await send_notification(
            channel=cfg.get("channel", "in_app"),
            recipient=self._resolve_value(cfg.get("recipient"), context, run.variables),
            template_id=cfg.get("template_id"),
            notification_context={**context, **run.variables},
            tenant_id=run.tenant_id,
        )
        return {"sent": True}

    async def handle_trigger_approval(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        cfg = step.config
        from apps.approval_engine.service import submit_for_approval
        from apps.approval_engine.schemas import ApprovalRequestCreate

        payload = ApprovalRequestCreate(
            flow_id=cfg.get("flow_id", ""),
            model_id=cfg.get("model_id", ""),
            record_id=str(self._resolve_value(cfg.get("record_id"), context, run.variables) or ""),
            metadata={"workflow_run_id": str(run.id)},
        )
        request = await submit_for_approval(payload, run.tenant_id, "system")
        return {"approval_request_id": str(request.id)}

    MAX_WAIT_SECONDS = 86_400  # 24 hours cap

    async def handle_wait_delay(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        cfg = step.config
        delay_seconds = max(0, min(int(cfg.get("delay_seconds", 60)), self.MAX_WAIT_SECONDS))
        # Schedule a Celery task to resume execution after the delay instead of blocking
        from apps.workflow_engine.tasks import execute_delayed_step
        execute_delayed_step.apply_async(
            args=[str(run.id), step.id],
            countdown=delay_seconds,
        )
        return {"waited_seconds": delay_seconds, "scheduled": True}

    async def handle_conditional_branch(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.rules_engine.evaluator import RuleEvaluator
        from apps.rules_engine.models import RuleCondition, RuleOperator

        merged = {**context, **run.variables}
        evaluator = RuleEvaluator()

        for branch in step.branch_conditions:
            condition_dict = branch.condition
            try:
                # Build a proper RuleCondition so all operators are evaluated correctly
                operator_value = condition_dict.get("operator", "equals")
                try:
                    operator = RuleOperator(operator_value)
                except ValueError:
                    operator = RuleOperator.EQUALS
                rule_condition = RuleCondition(
                    field=condition_dict.get("field", ""),
                    operator=operator,
                    value=condition_dict.get("value"),
                )
                matched = evaluator._check_operator(rule_condition, merged, {})
            except Exception:
                # Fallback: simple equality
                matched = merged.get(condition_dict.get("field")) == condition_dict.get("value")

            if matched:
                return {"next_step_id": branch.next_step_id, "matched_branch": branch.label}

        # Default branch
        return {"next_step_id": step.next_step_id, "matched_branch": "default"}

    MAX_LOOP_ITERATIONS = 500
    MAX_LOOP_NESTING_DEPTH = 3

    async def handle_loop(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        # Track nesting depth to prevent 500² explosion
        current_depth = context.get("__loop_depth__", 0)
        if current_depth >= self.MAX_LOOP_NESTING_DEPTH:
            raise RuntimeError(
                f"Loop nesting depth exceeded (max {self.MAX_LOOP_NESTING_DEPTH}). "
                "Refactor workflow to avoid deeply nested loops."
            )

        cfg = step.config
        items_key = cfg.get("items_variable", "items")
        items = run.variables.get(items_key, [])
        sub_step_id = cfg.get("step_id")
        results = []

        if len(items) > self.MAX_LOOP_ITERATIONS:
            log.warning(
                "Loop items truncated to MAX_LOOP_ITERATIONS",
                step_id=step.id,
                total=len(items),
                limit=self.MAX_LOOP_ITERATIONS,
            )
            items = items[: self.MAX_LOOP_ITERATIONS]

        # Build a map of all steps in the workflow for sub-step lookup
        workflow = await get_workflow_by_id(run.workflow_id)
        steps_by_id = {s.id: s for s in workflow.steps} if workflow else {}

        for index, item in enumerate(items):
            loop_context = {**context, "loop_item": item, "loop_index": index, "__loop_depth__": current_depth + 1}
            if sub_step_id and sub_step_id in steps_by_id:
                sub_step = steps_by_id[sub_step_id]
                try:
                    output = await self.execute_step(sub_step, run, loop_context)
                    results.append({"item": item, "output": output, "status": "completed"})
                except Exception as exc:
                    results.append({"item": item, "error": str(exc), "status": "failed"})
            else:
                results.append({"item": item, "status": "skipped"})

        return {"loop_results": results, "count": len(results)}

    async def handle_http_request(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        cfg = step.config
        url = str(self._resolve_value(cfg.get("url"), context, run.variables) or "")
        method = cfg.get("method", "POST").upper()
        headers = cfg.get("headers", {})
        body = self._interpolate(cfg.get("body", {}), context, run.variables)

        # SSRF guard: only allow public HTTP(S) URLs
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise WorkflowExecutionError(f"Invalid or disallowed URL: {url!r}")
        # Block access to private/loopback address ranges
        import ipaddress
        try:
            addr = ipaddress.ip_address(parsed.hostname)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                raise WorkflowExecutionError(f"URL resolves to a private/loopback address: {url!r}")
        except ValueError:
            pass  # hostname is a domain name, not a raw IP — allow through

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(method, url, json=body, headers=headers)
            response.raise_for_status()
            try:
                data = response.json()
            except Exception:
                data = {"text": response.text}
        return {"status_code": response.status_code, "response": data}

    async def handle_sub_workflow(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        cfg = step.config
        sub_workflow_id = cfg.get("workflow_id")
        if not sub_workflow_id:
            raise WorkflowExecutionError("sub_workflow step missing 'workflow_id'.")
        # Pass visited set to child executor so circular calls are caught at any depth
        child_executor = WorkflowExecutor(_visited_workflow_ids=set(self._visited_workflow_ids))
        sub_run = await child_executor.execute_workflow(
            workflow_id=sub_workflow_id,
            trigger_record_id=run.trigger_record_id,
            trigger_event="sub_workflow",
            context={**context, **run.variables},
        )
        return {"sub_run_id": str(sub_run.id), "sub_run_status": sub_run.status}

    async def handle_set_variable(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        cfg = step.config
        key = cfg.get("key")
        value = self._resolve_value(cfg.get("value"), context, run.variables)
        if key:
            run.variables[key] = value
        return {"key": key, "value": value}

    async def handle_human_task(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        """Create a HumanTask document and pause the workflow until a user completes it."""
        from datetime import timedelta
        from apps.human_tasks.models import HumanTask, TaskFormField

        cfg = step.config
        fields = [
            TaskFormField(
                name=f["name"],
                label=f.get("label", f["name"]),
                type=f.get("type", "text"),
                required=f.get("required", False),
                options=f.get("options", []),
                placeholder=f.get("placeholder", ""),
                default_value=f.get("default_value"),
            )
            for f in cfg.get("form_fields", [])
        ]

        due_hours = cfg.get("due_in_hours")
        due_at = None
        if due_hours:
            due_at = datetime.now(tz=timezone.utc) + timedelta(hours=float(due_hours))

        task = HumanTask(
            workflow_run_id=str(run.id),
            workflow_id=run.workflow_id,
            step_id=step.id,
            tenant_id=run.tenant_id,
            assignee_id=self._resolve_value(cfg.get("assignee_id"), context, run.variables),
            title=cfg.get("title", f"Task: {step.name}"),
            description=cfg.get("description"),
            form_fields=fields,
            due_at=due_at,
        )
        await task.insert()

        # Raise pause exception — caught by _execute_step_with_retry
        raise _HumanTaskPause(task_id=str(task.id))

    async def _get_integration(self, integration_id: str, tenant_id: str):
        from apps.integrations.models import Integration
        from datetime import datetime, timezone
        try:
            from beanie import PydanticObjectId
            oid = PydanticObjectId(integration_id)
        except Exception:
            raise WorkflowExecutionError(f"Invalid integration ID: {integration_id}")
        integration = await Integration.get(oid)
        if not integration or integration.tenant_id != tenant_id:
            raise WorkflowExecutionError(f"Integration '{integration_id}' not found.")
        if not integration.is_active:
            raise WorkflowExecutionError(f"Integration '{integration_id}' is disabled.")
        integration.last_used_at = datetime.now(tz=timezone.utc)
        await integration.save()
        return integration

    async def handle_slack_message(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.integrations.connectors import send_slack_message
        cfg = step.config
        integration = await self._get_integration(cfg.get("integration_id", ""), run.tenant_id)
        merged = {**context, **run.variables}
        result = await send_slack_message(integration.credentials, cfg, merged)
        return result

    async def handle_whatsapp_send(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.integrations.connectors import send_whatsapp_message
        cfg = step.config
        integration = await self._get_integration(cfg.get("integration_id", ""), run.tenant_id)
        merged = {**context, **run.variables}
        result = await send_whatsapp_message(integration.credentials, cfg, merged)
        return result

    async def handle_stripe_create_payment(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.integrations.connectors import stripe_create_payment
        cfg = step.config
        integration = await self._get_integration(cfg.get("integration_id", ""), run.tenant_id)
        merged = {**context, **run.variables}
        result = await stripe_create_payment(integration.credentials, cfg, merged)
        return result

    async def handle_google_sheets_append(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.integrations.connectors import google_sheets_append
        cfg = step.config
        integration = await self._get_integration(cfg.get("integration_id", ""), run.tenant_id)
        merged = {**context, **run.variables}
        result = await google_sheets_append(integration.credentials, cfg, merged)
        return result

    async def handle_send_email(self, step: WorkflowStep, run: WorkflowRun, context: dict) -> dict:
        from apps.integrations.connectors import send_email_smtp
        cfg = step.config
        integration = await self._get_integration(cfg.get("integration_id", ""), run.tenant_id)
        merged = {**context, **run.variables}
        result = await send_email_smtp(integration.credentials, cfg, merged)
        return result

    def _resolve_value(self, value: Any, context: dict, variables: dict) -> Any:
        if not isinstance(value, str):
            return value
        # Exact match: entire value is a single {{key}} — return the raw value (preserves type)
        if value.startswith("{{") and value.endswith("}}") and value.count("{{") == 1:
            key = value[2:-2].strip()
            return variables.get(key, context.get(key, value))
        # Partial match: replace all {{key}} occurrences within the string
        def _replace(m: re.Match) -> str:
            key = m.group(1).strip()
            resolved = variables.get(key, context.get(key))
            return str(resolved) if resolved is not None else m.group(0)
        return re.sub(r"\{\{([^}]+)\}\}", _replace, value)

    def _interpolate(self, data: Any, context: dict, variables: dict) -> Any:
        if isinstance(data, dict):
            return {k: self._interpolate(v, context, variables) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._interpolate(item, context, variables) for item in data]
        elif isinstance(data, str):
            return self._resolve_value(data, context, variables)
        return data
