"""
Safe formula expression engine built on asteval.

Supported formula syntax:
  - Arithmetic:  amount * qty, price + tax, total / count
  - Strings:     CONCAT(first_name, " ", last_name)
  - Dates:       DAYS_BETWEEN(due_date, TODAY()), YEAR(created_at)
  - Logic:       IF(status == "paid", 0, amount)
  - Math:        ROUND(x, 2), ABS(x), MIN(a, b), MAX(a, b), SQRT(x)
  - Text:        UPPER(name), LOWER(name), LEN(name), TRIM(name)
  - Aggregation: SUM(a, b, ...) or SUM(list_field), COUNT, AVG, AVERAGE, COALESCE
  - Lookup:      field references resolved from record data dict
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timezone
from typing import Any


# ─── Built-in formula functions ───────────────────────────────────────────────

def _today() -> str:
    return date.today().isoformat()


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _days_between(d1: Any, d2: Any) -> int:
    """Return number of days between two date strings."""
    def _parse(d: Any) -> date:
        if isinstance(d, (date, datetime)):
            return d if isinstance(d, date) else d.date()
        if isinstance(d, str):
            for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
                try:
                    return datetime.strptime(d[:19], fmt).date()
                except ValueError:
                    continue
        raise ValueError(f"Cannot parse date: {d!r}")

    return abs((_parse(d1) - _parse(d2)).days)


def _concat(*args) -> str:
    return "".join(str(a) for a in args)


def _if(condition: Any, true_val: Any, false_val: Any) -> Any:
    return true_val if condition else false_val


def _year(d: Any) -> int:
    if isinstance(d, str) and len(d) >= 4:
        try:
            return int(d[:4])
        except ValueError:
            pass
    if isinstance(d, (date, datetime)):
        return d.year
    return 0


def _month(d: Any) -> int:
    if isinstance(d, str) and len(d) >= 7:
        try:
            return int(d[5:7])
        except ValueError:
            pass
    if isinstance(d, (date, datetime)):
        return d.month
    return 0


def _text(value: Any, fmt: str = "") -> str:
    """Format a value as text, optionally with a format string."""
    if fmt and isinstance(value, (int, float)):
        try:
            return format(value, fmt)
        except (ValueError, TypeError):
            pass
    return str(value) if value is not None else ""


def _not_empty(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


# ─── Aggregation helpers ──────────────────────────────────────────────────────

def _to_numbers(*args) -> list[float]:
    """Flatten args (including lists) and return numeric values only."""
    nums: list[float] = []
    for a in args:
        if isinstance(a, (list, tuple)):
            for v in a:
                try:
                    nums.append(float(v))
                except (TypeError, ValueError):
                    pass
        elif a is not None:
            try:
                nums.append(float(a))
            except (TypeError, ValueError):
                pass
    return nums


def _agg_sum(*args) -> float:
    return sum(_to_numbers(*args))


def _agg_count(*args) -> int:
    """Count non-null values. Counts list elements if given a list."""
    count = 0
    for a in args:
        if isinstance(a, (list, tuple)):
            count += sum(1 for v in a if v is not None)
        elif a is not None:
            count += 1
    return count


def _agg_avg(*args) -> float:
    nums = _to_numbers(*args)
    return sum(nums) / len(nums) if nums else 0.0


def _agg_min(*args) -> Any:
    nums = _to_numbers(*args)
    return min(nums) if nums else None


def _agg_max(*args) -> Any:
    nums = _to_numbers(*args)
    return max(nums) if nums else None


def _coalesce(*args) -> Any:
    """Return the first non-null, non-empty value."""
    for a in args:
        if a is not None and a != "":
            return a
    return None


# ─── Engine ───────────────────────────────────────────────────────────────────

_FORMULA_SYMBOLS: dict[str, Any] = {
    # Math
    "ROUND": round,
    "ABS": abs,
    "MIN": min,
    "MAX": max,
    "SQRT": math.sqrt,
    "FLOOR": math.floor,
    "CEIL": math.ceil,
    "POW": math.pow,
    "LOG": math.log,
    "PI": math.pi,
    # String
    "CONCAT": _concat,
    "UPPER": str.upper,
    "LOWER": str.lower,
    "LEN": len,
    "TRIM": str.strip,
    "LEFT": lambda s, n: str(s)[:int(n)],
    "RIGHT": lambda s, n: str(s)[-int(n):] if n else "",
    "CONTAINS": lambda s, sub: sub in str(s),
    "REPLACE": lambda s, old, new: str(s).replace(old, new),
    "TEXT": _text,
    # Logic
    "IF": _if,
    "NOT": lambda x: not x,
    "AND": lambda *args: all(args),
    "OR": lambda *args: any(args),
    "IS_EMPTY": lambda x: not _not_empty(x),
    "NOT_EMPTY": _not_empty,
    # Date/Time
    "TODAY": _today,
    "NOW": _now,
    "DAYS_BETWEEN": _days_between,
    "YEAR": _year,
    "MONTH": _month,
    # Aggregation (multi-arg or single list-field)
    "SUM": _agg_sum,
    "COUNT": _agg_count,
    "AVG": _agg_avg,
    "AVERAGE": _agg_avg,
    "COALESCE": _coalesce,
    # Type conversion
    "NUMBER": float,
    "INT": int,
    "STR": str,
    "BOOL": bool,
    # Constants
    "TRUE": True,
    "FALSE": False,
    "NULL": None,
}


def evaluate_formula(expression: str, record_data: dict[str, Any]) -> Any:
    """
    Safely evaluate a formula expression against the record's field values.

    Returns the computed value, or None if evaluation fails.
    Never raises — failed formulas return None silently.
    """
    if not expression or not expression.strip():
        return None

    try:
        from asteval import Interpreter

        interp = Interpreter(
            symtable={**_FORMULA_SYMBOLS, **_flatten_record(record_data)},
            use_numpy=False,
            minimal=False,
            builtins_readonly=True,
            max_string_length=100_000,
        )
        result = interp(expression)
        if interp.error:
            # Non-fatal: log the first error and return None
            return None
        return result

    except ImportError:
        # asteval not installed — fall back to basic safe eval
        return _fallback_eval(expression, record_data)
    except Exception:
        return None


def _flatten_record(data: dict[str, Any]) -> dict[str, Any]:
    """Make record fields available as top-level symbols. Coerce types for safety."""
    flat = {}
    for key, value in data.items():
        if isinstance(key, str) and re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", key):
            flat[key] = value
    return flat


def _fallback_eval(expression: str, data: dict[str, Any]) -> Any:
    """Basic numeric eval fallback when asteval is not installed."""
    safe_env = {k: v for k, v in data.items() if isinstance(v, (int, float))}
    try:
        return eval(expression, {"__builtins__": {}}, safe_env)  # noqa: S307
    except Exception:
        return None
