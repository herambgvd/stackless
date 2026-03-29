"""Validate formula expressions at schema-save time."""
from __future__ import annotations

from typing import Any

from apps.formula_engine.engine import evaluate_formula, _FORMULA_SYMBOLS


def validate_formula(expression: str) -> tuple[bool, str | None]:
    """
    Validate a formula expression with dummy data.
    Returns (is_valid, error_message).
    """
    if not expression or not expression.strip():
        return False, "Expression cannot be empty"

    try:
        from asteval import Interpreter
        interp = Interpreter(
            symtable=dict(_FORMULA_SYMBOLS),
            use_numpy=False,
            minimal=False,
            builtins_readonly=True,
        )
        interp(expression)
        if interp.error:
            msgs = [str(e.get_error()[1]) for e in interp.error]
            return False, "; ".join(msgs)
        return True, None
    except ImportError:
        return True, None  # Skip validation if asteval not installed
    except Exception as e:
        return False, str(e)


def list_available_functions() -> list[dict]:
    """Return documentation for all built-in formula functions."""
    return [
        {"name": "CONCAT", "signature": "CONCAT(a, b, ...)", "description": "Join strings together", "category": "text"},
        {"name": "UPPER", "signature": "UPPER(text)", "description": "Convert to uppercase", "category": "text"},
        {"name": "LOWER", "signature": "LOWER(text)", "description": "Convert to lowercase", "category": "text"},
        {"name": "LEN", "signature": "LEN(text)", "description": "Length of string", "category": "text"},
        {"name": "TRIM", "signature": "TRIM(text)", "description": "Remove whitespace", "category": "text"},
        {"name": "LEFT", "signature": "LEFT(text, n)", "description": "First N characters", "category": "text"},
        {"name": "RIGHT", "signature": "RIGHT(text, n)", "description": "Last N characters", "category": "text"},
        {"name": "CONTAINS", "signature": "CONTAINS(text, substring)", "description": "True if text contains substring", "category": "text"},
        {"name": "REPLACE", "signature": "REPLACE(text, old, new)", "description": "Replace substring", "category": "text"},
        {"name": "TEXT", "signature": "TEXT(value, format?)", "description": "Format value as text", "category": "text"},
        {"name": "IF", "signature": "IF(condition, true_val, false_val)", "description": "Conditional value", "category": "logic"},
        {"name": "AND", "signature": "AND(a, b, ...)", "description": "True if all conditions true", "category": "logic"},
        {"name": "OR", "signature": "OR(a, b, ...)", "description": "True if any condition true", "category": "logic"},
        {"name": "NOT", "signature": "NOT(condition)", "description": "Negate a boolean", "category": "logic"},
        {"name": "IS_EMPTY", "signature": "IS_EMPTY(value)", "description": "True if value is null or empty", "category": "logic"},
        {"name": "NOT_EMPTY", "signature": "NOT_EMPTY(value)", "description": "True if value is not empty", "category": "logic"},
        {"name": "ROUND", "signature": "ROUND(number, decimals)", "description": "Round to N decimal places", "category": "math"},
        {"name": "ABS", "signature": "ABS(number)", "description": "Absolute value", "category": "math"},
        {"name": "MIN", "signature": "MIN(a, b)", "description": "Minimum of two values", "category": "math"},
        {"name": "MAX", "signature": "MAX(a, b)", "description": "Maximum of two values", "category": "math"},
        {"name": "SQRT", "signature": "SQRT(number)", "description": "Square root", "category": "math"},
        {"name": "FLOOR", "signature": "FLOOR(number)", "description": "Round down", "category": "math"},
        {"name": "CEIL", "signature": "CEIL(number)", "description": "Round up", "category": "math"},
        {"name": "POW", "signature": "POW(base, exp)", "description": "Power", "category": "math"},
        {"name": "TODAY", "signature": "TODAY()", "description": "Today's date as string", "category": "date"},
        {"name": "NOW", "signature": "NOW()", "description": "Current datetime as string", "category": "date"},
        {"name": "DAYS_BETWEEN", "signature": "DAYS_BETWEEN(date1, date2)", "description": "Days between two dates", "category": "date"},
        {"name": "YEAR", "signature": "YEAR(date)", "description": "Extract year from date", "category": "date"},
        {"name": "MONTH", "signature": "MONTH(date)", "description": "Extract month from date (1-12)", "category": "date"},
        {"name": "NUMBER", "signature": "NUMBER(value)", "description": "Convert to number", "category": "conversion"},
        {"name": "INT", "signature": "INT(value)", "description": "Convert to integer", "category": "conversion"},
        {"name": "STR", "signature": "STR(value)", "description": "Convert to string", "category": "conversion"},
    ]
