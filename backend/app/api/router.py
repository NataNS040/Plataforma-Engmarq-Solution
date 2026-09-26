from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router
from app.api.routes.empresas import router as empresas_router
from app.api.routes.usuarios import router as usuarios_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(me_router)
api_router.include_router(empresas_router)
api_router.include_router(usuarios_router)
