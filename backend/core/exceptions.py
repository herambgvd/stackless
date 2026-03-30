from __future__ import annotations

from fastapi import status


class StacklessException(Exception):
    """Base exception for all Stackless errors."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "INTERNAL_ERROR"

    def __init__(self, detail: str | None = None, code: str | None = None) -> None:
        self.detail = detail or "An unexpected error occurred."
        if code:
            self.code = code
        super().__init__(self.detail)


class NotFoundError(StacklessException):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"

    def __init__(self, resource: str = "Resource", resource_id: str | None = None) -> None:
        detail = f"{resource} not found."
        if resource_id:
            detail = f"{resource} with id '{resource_id}' not found."
        super().__init__(detail=detail)


class ValidationError(StacklessException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "VALIDATION_ERROR"

    def __init__(self, detail: str = "Validation failed.") -> None:
        super().__init__(detail=detail)


class UnauthorizedError(StacklessException):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "UNAUTHORIZED"

    def __init__(self, detail: str = "Authentication required.") -> None:
        super().__init__(detail=detail)


class ForbiddenError(StacklessException):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"

    def __init__(self, detail: str = "You do not have permission to perform this action.") -> None:
        super().__init__(detail=detail)


class ConflictError(StacklessException):
    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"

    def __init__(self, detail: str = "Resource already exists.") -> None:
        super().__init__(detail=detail)


class BadRequestError(StacklessException):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, detail: str = "Bad request.") -> None:
        super().__init__(detail=detail)


class RuleEvaluationError(StacklessException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "RULE_EVALUATION_ERROR"


class WorkflowExecutionError(StacklessException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = "WORKFLOW_EXECUTION_ERROR"


class ApprovalError(StacklessException):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "APPROVAL_ERROR"
