import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.schemas.errors import ErrorDetail, ErrorResponse, ValidationIssue

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Only pass messages that are safe to expose to API consumers."""

    def __init__(
        self, status_code: int, code: str, message: str, *, headers: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


def error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    details: list[ValidationIssue] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message, details=details or []))
    return JSONResponse(status_code=status_code, content=body.model_dump(), headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, headers=exc.headers)

    @app.exception_handler(HTTPException)
    async def handle_http_error(request: Request, exc: HTTPException) -> JSONResponse:
        try:
            message = HTTPStatus(exc.status_code).phrase
        except ValueError:
            message = "HTTP error"
        return error_response(exc.status_code, f"http_{exc.status_code}", message, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Do not echo request values or validation context, which may contain secrets.
        details = [
            ValidationIssue(field=".".join(map(str, item["loc"])), code=item["type"])
            for item in exc.errors()
        ]
        return error_response(422, "validation_error", "Dados inválidos.", details=details)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled API error (%s)", type(exc).__name__)
        return error_response(500, "internal_error", "Erro interno do servidor.")
