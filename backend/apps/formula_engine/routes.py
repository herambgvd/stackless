from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from apps.formula_engine.engine import evaluate_formula
from apps.formula_engine.validator import validate_formula, list_available_functions
from core.dependencies import get_current_active_user

router = APIRouter()


class FormulaTestRequest(BaseModel):
    expression: str
    sample_data: dict = {}


@router.post("/formula/test", tags=["formula"])
async def test_formula(
    payload: FormulaTestRequest,
    _=Depends(get_current_active_user),
):
    """Test a formula expression with sample data. Returns result or error."""
    is_valid, error = validate_formula(payload.expression)
    if not is_valid:
        return {"success": False, "error": error, "result": None}
    result = evaluate_formula(payload.expression, payload.sample_data)
    return {"success": True, "result": result, "error": None}


@router.get("/formula/functions", tags=["formula"])
async def get_formula_functions(
    _=Depends(get_current_active_user),
):
    """Return documentation for all built-in formula functions."""
    return list_available_functions()
