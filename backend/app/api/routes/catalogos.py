from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from supabase import Client

from app.core.dependencies import CurrentProfile, get_supabase_client
from app.core.errors import AppError
from app.repositories.catalogos import Catalogo, CatalogosRepository
from app.schemas.catalogos import CatalogoCreate, CatalogoUpdate, CatalogoResponse, FuncaoCreate, FuncaoUpdate, FuncaoResponse
from app.services.catalogos import CatalogosService

router = APIRouter(tags=["catalogos"])


def catalog_router(table: Catalogo, create_schema, update_schema, response_schema):
    """Three explicit resources share behavior, but retain their own schemas."""
    routes = APIRouter(prefix=f"/{table}")

    def get_service(actor: CurrentProfile, client: Annotated[Client, Depends(get_supabase_client)],
                    request: Request, response: Response):
        if request.query_params:
            raise AppError(422, "invalid_query", "Esta operação não aceita parâmetros de consulta.")
        response.headers["Cache-Control"] = "no-store"
        return CatalogosService(CatalogosRepository(client, table), actor)

    @routes.get("", response_model=list[response_schema], name=f"list_{table}")
    def list_items(service: Annotated[CatalogosService, Depends(get_service)]):
        return service.list()

    @routes.post("", response_model=response_schema, status_code=201, name=f"create_{table}")
    def create_item(data: create_schema, service: Annotated[CatalogosService, Depends(get_service)]):
        return service.create(data)

    @routes.patch("/{id}", response_model=response_schema, name=f"update_{table}")
    def update_item(id: UUID, data: update_schema, service: Annotated[CatalogosService, Depends(get_service)]):
        return service.update(id, data)

    return routes


router.include_router(catalog_router("funcoes", FuncaoCreate, FuncaoUpdate, FuncaoResponse))
router.include_router(catalog_router("setores", CatalogoCreate, CatalogoUpdate, CatalogoResponse))
router.include_router(catalog_router("ambientes", CatalogoCreate, CatalogoUpdate, CatalogoResponse))
