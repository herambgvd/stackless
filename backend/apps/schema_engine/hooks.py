from __future__ import annotations

from typing import Any, Optional

import structlog

log = structlog.get_logger(__name__)


async def _apply_rules(
    data: dict[str, Any],
    model,
    tenant_id: str,
    trigger: str,
    record_id: str = "",
    app_id: str = "",
    previous_data: dict | None = None,
) -> dict[str, Any]:
    """Run rules engine against record data. Raises ValidationError on failures. Returns data with computed values applied."""
    from apps.rules_engine.evaluator import RuleEvaluator
    from apps.rules_engine.models import RuleTrigger
    from core.exceptions import ValidationError

    trigger_map = {
        "on_create": RuleTrigger.ON_CREATE,
        "on_update": RuleTrigger.ON_UPDATE,
        "on_delete": RuleTrigger.ON_DELETE,
        "on_save":   RuleTrigger.ON_SAVE,
    }
    rule_trigger = trigger_map.get(trigger, RuleTrigger.ON_SAVE)

    try:
        evaluator = RuleEvaluator()
        result = await evaluator.evaluate(
            record_data=data,
            trigger=rule_trigger,
            model_id=str(model.id),
            tenant_id=tenant_id,
            previous_data=previous_data or {},
        )
    except Exception as exc:
        # Never block record save due to rules engine failure — but log it
        log.error("Rules engine failed", error=str(exc), model_slug=model.slug, exc_info=True)
        return data

    if result.errors:
        raise ValidationError("; ".join(result.errors))

    if result.computed_values:
        data = {**data, **result.computed_values}

    # Dispatch any rule-triggered workflow/approval/notification actions (non-blocking)
    if result.triggered_actions:
        await _dispatch_rule_actions(
            result.triggered_actions,
            record_id=record_id,
            model_id=str(model.id),
            app_id=app_id,
            tenant_id=tenant_id,
        )

    return data


async def _dispatch_rule_actions(
    triggered_actions: list[str],
    record_id: str,
    model_id: str,
    app_id: str,
    tenant_id: str,
) -> None:
    """Dispatch triggered actions from rules engine (trigger_workflow, trigger_approval, send_notification). Non-blocking."""
    for action_ref in triggered_actions:
        try:
            if ":" not in action_ref:
                continue
            action_type, action_id = action_ref.split(":", 1)

            if action_type == "trigger_workflow":
                from apps.workflow_engine.tasks import execute_workflow_task
                execute_workflow_task.delay(
                    workflow_id=action_id,
                    trigger_record_id=record_id,
                    trigger_event="rule_triggered",
                    context={"model_id": model_id, "app_id": app_id, "record_id": record_id},
                )

            elif action_type == "trigger_approval":
                from apps.approval_engine.service import submit_for_approval
                from apps.approval_engine.schemas import ApprovalRequestCreate
                payload = ApprovalRequestCreate(
                    flow_id=action_id,
                    model_id=model_id,
                    record_id=record_id,
                    metadata={"triggered_by": "rules_engine"},
                )
                await submit_for_approval(payload, tenant_id, "system")

            elif action_type == "send_notification":
                from apps.notifications.service import send_notification
                # action_id is encoded as "template_id:recipient"
                parts = action_id.split(":", 1)
                template_id = parts[0] or None
                recipient = parts[1] if len(parts) > 1 else ""
                if not recipient:
                    recipient = tenant_id  # fallback to tenant namespace
                await send_notification(
                    channel="in_app",
                    recipient=recipient,
                    template_id=template_id,
                    notification_context={"record_id": record_id, "model_id": model_id},
                    tenant_id=tenant_id,
                )
        except Exception as exc:
            log.error("Rule action dispatch failed", error=str(exc), exc_info=True)


async def _dispatch_record_workflows(
    model_id: str,
    app_id: str,
    tenant_id: str,
    record_id: str,
    event: str,
) -> None:
    """Fire Celery tasks for any active workflows matching this model + event. Non-blocking."""
    from apps.workflow_engine.repository import get_active_workflows_for_model_and_event
    from apps.workflow_engine.tasks import execute_workflow_task
    from apps.workflow_engine.models import TriggerType

    try:
        workflows = await get_active_workflows_for_model_and_event(model_id, tenant_id, event)
        for wf in workflows:
            if wf.trigger.type != TriggerType.RECORD_EVENT:
                continue
            wf_event = wf.trigger.event
            # Fire if workflow listens to this specific event, or has no event filter
            if wf_event is not None and wf_event.value != event:
                continue
            execute_workflow_task.delay(
                workflow_id=str(wf.id),
                trigger_record_id=record_id,
                trigger_event=event,
                context={"model_id": model_id, "app_id": app_id, "record_id": record_id},
            )
    except Exception as exc:
        log.error("Workflow dispatch failed", error=str(exc), exc_info=True)


async def _write_audit_log(
    tenant_id: str,
    app_id: str,
    model_slug: str,
    record_id: str,
    action: str,
    user_id: Optional[str],
    changes: dict,
    snapshot: Optional[dict] = None,
) -> None:
    """Write an audit log entry. Non-blocking — never raises."""
    try:
        from apps.audit.models import AuditLog
        await AuditLog(
            tenant_id=tenant_id,
            app_id=app_id,
            model_slug=model_slug,
            record_id=record_id,
            action=action,
            user_id=user_id,
            changes=changes,
            snapshot=snapshot,
        ).insert()
    except Exception as exc:
        log.error("Audit log write failed", error=str(exc), action=action)


async def _run_server_scripts(
    hook: str,
    model_slug: str,
    app_id: str,
    tenant_id: str,
    doc: dict[str, Any],
) -> dict[str, Any]:
    """
    Execute all enabled ServerScript hooks of the given type for this model.
    The script runs in a sandboxed exec() context and may modify `doc` in-place
    by assigning to `frappe.doc` (or directly to the `doc` variable).

    Returns the (possibly modified) doc dict. Never raises — failures are logged silently.
    """
    try:
        from apps.scripts.models import ServerScript
        scripts = await ServerScript.find(
            ServerScript.tenant_id == tenant_id,
            ServerScript.app_id == app_id,
            ServerScript.model_slug == model_slug,
            ServerScript.script_type == hook,
            ServerScript.enabled == True,  # noqa: E712
        ).to_list()
    except Exception:
        return doc

    for script in scripts:
        try:
            import io as _io
            stdout_buf = _io.StringIO()

            def _print(*args, **kwargs):
                stdout_buf.write(kwargs.get("sep", " ").join(str(a) for a in args) + kwargs.get("end", "\n"))

            exec_globals: dict = {
                "__builtins__": {
                    "print": _print,
                    "len": len, "str": str, "int": int, "float": float, "bool": bool,
                    "list": list, "dict": dict, "tuple": tuple, "set": set,
                    "range": range, "enumerate": enumerate, "zip": zip,
                    "sorted": sorted, "min": min, "max": max, "sum": sum,
                    "abs": abs, "round": round, "isinstance": isinstance,
                    # Removed getattr/setattr — they enable class-hierarchy sandbox escapes
                    "True": True, "False": False, "None": None,
                    "Exception": Exception, "ValueError": ValueError,
                },
                "doc": doc,
                "model_slug": model_slug,
                "app_id": app_id,
                "tenant_id": tenant_id,
            }
            exec_locals: dict = {}
            import threading as _threading
            _result: dict = {}
            def _run_script():
                try:
                    exec(compile(script.script, f"<hook:{hook}>", "exec"), exec_globals, exec_locals)
                except Exception as _e:
                    _result["error"] = _e
            _t = _threading.Thread(target=_run_script, daemon=True)
            _t.start()
            _t.join(timeout=5.0)  # Hard 5-second cap per script
            if _t.is_alive():
                raise TimeoutError("Script execution exceeded 5-second limit")
            # Script may mutate exec_globals["doc"] or exec_locals["doc"]
            if "doc" in exec_locals:
                doc = exec_locals["doc"]
            elif "doc" in exec_globals and exec_globals["doc"] is not doc:
                doc = exec_globals["doc"]
        except Exception as exc:
            log.error("Server script execution failed", script=script.name, error=str(exc))

    return doc
