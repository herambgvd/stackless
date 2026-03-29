from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

from apps.rules_engine.models import (
    LogicGroup,
    Rule,
    RuleCondition,
    RuleOperator,
    RuleTrigger,
)
from apps.rules_engine.repository import get_rulesets_for_model


@dataclass
class EvaluationResult:
    passed_rules: list[dict] = field(default_factory=list)
    failed_rules: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    computed_values: dict[str, Any] = field(default_factory=dict)
    triggered_actions: list[str] = field(default_factory=list)


class RuleEvaluator:
    """Evaluates a set of rules against a record payload."""

    def __init__(self) -> None:
        self._visited: set[str] = set()

    async def evaluate(
        self,
        record_data: dict[str, Any],
        trigger: RuleTrigger,
        model_id: str,
        tenant_id: str,
        previous_data: Optional[dict[str, Any]] = None,
    ) -> EvaluationResult:
        result = EvaluationResult()
        rulesets = await get_rulesets_for_model(model_id, tenant_id)

        # Collect all active rules matching the trigger, sorted by priority
        active_rules: list[Rule] = []
        for rs in rulesets:
            for rule in rs.rules:
                if rule.is_active and (
                    rule.trigger == trigger or rule.trigger == RuleTrigger.ON_SAVE
                ):
                    active_rules.append(rule)

        active_rules.sort(key=lambda r: r.priority)

        working_data = dict(record_data)

        for rule in active_rules:
            if rule.id in self._visited:
                result.errors.append(f"Circular rule dependency detected for rule '{rule.name}'.")
                continue
            self._visited.add(rule.id)

            try:
                passed = self._evaluate_condition(
                    rule.condition, working_data, previous_data or {}
                )
            except Exception as exc:
                result.errors.append(f"Rule '{rule.name}' condition error: {exc}")
                continue

            rule_result = {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "passed": passed,
                "computed_values": {},
                "triggered_actions": [],
            }

            if passed:
                # Execute action
                action_result = self._execute_action(
                    rule.action, working_data, result
                )
                rule_result["computed_values"] = action_result.get("computed_values", {})
                rule_result["triggered_actions"] = action_result.get("triggered_actions", [])
                result.computed_values.update(rule_result["computed_values"])
                result.triggered_actions.extend(rule_result["triggered_actions"])

                # Apply computed values to working data for downstream rules
                working_data.update(result.computed_values)
                result.passed_rules.append(rule_result)
            else:
                if rule.action.type.value == "validate":
                    error_msg = rule.action.config.get("message", f"Validation failed for rule '{rule.name}'.")
                    result.errors.append(error_msg)
                    rule_result["error"] = error_msg
                result.failed_rules.append(rule_result)

        return result

    def _evaluate_condition(
        self,
        condition: RuleCondition,
        data: dict[str, Any],
        previous_data: dict[str, Any],
    ) -> bool:
        """Recursively evaluate a condition (supports AND/OR nesting)."""
        if condition.nested_conditions:
            results = [
                self._evaluate_condition(c, data, previous_data)
                for c in condition.nested_conditions
            ]
            if condition.logic_group == LogicGroup.AND:
                nested_result = all(results)
            else:
                nested_result = any(results)

            # Also evaluate the top-level condition itself
            self_result = self._check_operator(condition, data, previous_data)
            if condition.logic_group == LogicGroup.AND:
                return self_result and nested_result
            else:
                return self_result or nested_result

        return self._check_operator(condition, data, previous_data)

    def _check_operator(
        self,
        condition: RuleCondition,
        data: dict[str, Any],
        previous_data: dict[str, Any],
    ) -> bool:
        field_value = data.get(condition.field)
        expected = condition.value
        op = condition.operator

        if op == RuleOperator.EQUALS:
            return field_value == expected

        elif op == RuleOperator.NOT_EQUALS:
            return field_value != expected

        elif op == RuleOperator.GREATER_THAN:
            return self._safe_compare(field_value, expected) > 0

        elif op == RuleOperator.LESS_THAN:
            return self._safe_compare(field_value, expected) < 0

        elif op == RuleOperator.GTE:
            return self._safe_compare(field_value, expected) >= 0

        elif op == RuleOperator.LTE:
            return self._safe_compare(field_value, expected) <= 0

        elif op == RuleOperator.CONTAINS:
            if field_value is None:
                return False
            return str(expected) in str(field_value)

        elif op == RuleOperator.NOT_CONTAINS:
            if field_value is None:
                return True
            return str(expected) not in str(field_value)

        elif op == RuleOperator.STARTS_WITH:
            return str(field_value or "").startswith(str(expected or ""))

        elif op == RuleOperator.ENDS_WITH:
            return str(field_value or "").endswith(str(expected or ""))

        elif op == RuleOperator.IS_EMPTY:
            return field_value is None or field_value == "" or field_value == []

        elif op == RuleOperator.IS_NOT_EMPTY:
            return field_value is not None and field_value != "" and field_value != []

        elif op == RuleOperator.IN_LIST:
            return field_value in (expected or [])

        elif op == RuleOperator.NOT_IN_LIST:
            return field_value not in (expected or [])

        elif op == RuleOperator.REGEX_MATCH:
            try:
                return bool(re.match(str(expected), str(field_value or "")))
            except re.error:
                return False

        elif op == RuleOperator.CHANGED_TO:
            prev_value = previous_data.get(condition.field)
            return prev_value != expected and field_value == expected

        elif op == RuleOperator.CHANGED_FROM:
            prev_value = previous_data.get(condition.field)
            return prev_value == expected and field_value != expected

        elif op == RuleOperator.BETWEEN:
            if not isinstance(expected, (list, tuple)) or len(expected) != 2:
                return False
            try:
                return float(expected[0]) <= float(field_value) <= float(expected[1])
            except (TypeError, ValueError):
                return False

        return False

    def _safe_compare(self, a: Any, b: Any) -> int:
        try:
            fa, fb = float(a), float(b)
            if fa < fb:
                return -1
            elif fa > fb:
                return 1
            return 0
        except (TypeError, ValueError):
            sa, sb = str(a or ""), str(b or "")
            if sa < sb:
                return -1
            elif sa > sb:
                return 1
            return 0

    def _execute_action(
        self,
        action,
        working_data: dict[str, Any],
        result: EvaluationResult,
    ) -> dict:
        action_type = action.type.value
        config = action.config

        if action_type == "set_field":
            field_name = config.get("field")
            value = config.get("value")
            if field_name:
                return {"computed_values": {field_name: value}, "triggered_actions": []}

        elif action_type == "compute":
            field_name = config.get("field")
            expression = config.get("expression", "")
            try:
                from apps.formula_engine.engine import evaluate_formula
                computed = evaluate_formula(expression, working_data)
                if field_name and computed is not None:
                    return {"computed_values": {field_name: computed}, "triggered_actions": []}
            except Exception:
                pass

        elif action_type == "trigger_approval":
            flow_id = config.get("flow_id", config.get("id", "unknown"))
            action_ref = f"trigger_approval:{flow_id}"
            return {"computed_values": {}, "triggered_actions": [action_ref]}

        elif action_type == "trigger_workflow":
            workflow_id = config.get("workflow_id", config.get("id", "unknown"))
            action_ref = f"trigger_workflow:{workflow_id}"
            return {"computed_values": {}, "triggered_actions": [action_ref]}

        elif action_type == "send_notification":
            template_id = config.get("template_id", "")
            recipient = config.get("recipient", "")
            # Encode as send_notification:template_id:recipient — dispatcher will resolve
            action_ref = f"send_notification:{template_id}:{recipient}"
            return {"computed_values": {}, "triggered_actions": [action_ref]}

        return {"computed_values": {}, "triggered_actions": []}
