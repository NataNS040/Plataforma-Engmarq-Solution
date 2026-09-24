from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.routes.health import router as health_router
from app.core.config import Settings
from app.core.errors import register_exception_handlers
from app.schemas.errors import ErrorResponse


def create_app(settings: Settings | None = None) -> FastAPI:
    application = FastAPI(
        title="Plataforma EngMarq API",
        version="0.1.0",
        debug=False,
        responses={
            401: {"model": ErrorResponse},
            403: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
        },
    )
    application.state.settings = settings if settings is not None else Settings()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=application.state.settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    register_exception_handlers(application)
    application.include_router(health_router)
    application.include_router(api_router)
    return application


app = create_app()
