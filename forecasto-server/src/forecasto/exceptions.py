"""Custom exceptions for Forecasto API."""

from __future__ import annotations


from typing import Any

class ForecastoException(Exception):
    """Base exception for Forecasto."""

    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)

class UnauthorizedException(ForecastoException):
    """401 Unauthorized."""

    def __init__(self, message: str = "Authentication required", details: dict | None = None):
        super().__init__(message, "UNAUTHORIZED", 401, details)

class ForbiddenException(ForecastoException):
    """403 Forbidden."""

    def __init__(self, message: str = "Permission denied", details: dict | None = None):
        super().__init__(message, "FORBIDDEN", 403, details)

class NotFoundException(ForecastoException):
    """404 Not Found."""

    def __init__(self, message: str = "Resource not found", details: dict | None = None):
        super().__init__(message, "NOT_FOUND", 404, details)

class ConflictException(ForecastoException):
    """409 Conflict."""

    def __init__(self, message: str = "Conflict detected", details: dict | None = None):
        super().__init__(message, "CONFLICT", 409, details)

class SessionRequiredException(ForecastoException):
    """400 Session Required."""

    def __init__(
        self, message: str = "Active session required for this operation", details: dict | None = None
    ):
        super().__init__(message, "SESSION_REQUIRED", 400, details)

class SessionNotActiveException(ForecastoException):
    """400 Session Not Active."""

    def __init__(self, message: str = "Session is not active", details: dict | None = None):
        super().__init__(message, "SESSION_NOT_ACTIVE", 400, details)

class AreaPermissionDeniedException(ForecastoException):
    """403 Area Permission Denied."""

    def __init__(self, area: str, required: str = "write", details: dict | None = None):
        message = f"No {required} permission for area '{area}'"
        super().__init__(message, "AREA_PERMISSION_DENIED", 403, details)

class InvalidTransferException(ForecastoException):
    """400 Invalid Transfer."""

    def __init__(self, message: str = "Invalid transfer operation", details: dict | None = None):
        super().__init__(message, "INVALID_TRANSFER", 400, details)

class ValidationException(ForecastoException):
    """400 Validation Error."""

    def __init__(self, message: str = "Validation error", details: dict | None = None):
        super().__init__(message, "VALIDATION_ERROR", 400, details)
