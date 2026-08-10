from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.auth.dependencies import AuthContext, active_member, valid_csrf
from app.database.session import SessionFactory, get_session
from app.schemas.bring import (
    BringCompleteRequest,
    BringItem,
    BringItemCreate,
    BringItemsResponse,
    BringStatusResponse,
)
from app.services.bring import BringService, BringServiceError, get_bring_service

router = APIRouter(prefix="/bring", tags=["bring"])


def service_dependency() -> BringService:
    return get_bring_service()


def safe_error(exc: BringServiceError) -> HTTPException:
    return HTTPException(exc.status_code, str(exc))


def require_active_csrf(auth: AuthContext) -> None:
    if auth.user.must_change_password:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Passwortänderung erforderlich.")


@router.get("/items", response_model=BringItemsResponse)
async def items(
    _: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
    service: BringService = Depends(service_dependency),
) -> BringItemsResponse:
    return await service.get_items(database, active=True)


@router.post("/items", response_model=BringItem, status_code=status.HTTP_201_CREATED)
async def add_item(
    payload: BringItemCreate,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    service: BringService = Depends(service_dependency),
) -> BringItem:
    require_active_csrf(auth)
    try:
        return await service.add_item(
            database,
            name=payload.name,
            specification=payload.specification,
            mutation_id=payload.client_mutation_id,
        )
    except BringServiceError as exc:
        raise safe_error(exc) from exc


@router.post("/items/{item_id}/complete", response_model=BringItemsResponse)
async def complete_item(
    item_id: str,
    payload: BringCompleteRequest,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    service: BringService = Depends(service_dependency),
) -> BringItemsResponse:
    require_active_csrf(auth)
    try:
        normalized_id = str(UUID(item_id))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ungültige Artikel-ID.") from exc
    try:
        return await service.complete_item(
            database, item_id=normalized_id, mutation_id=payload.client_mutation_id
        )
    except BringServiceError as exc:
        raise safe_error(exc) from exc


@router.get("/status", response_model=BringStatusResponse)
async def bring_status(
    _: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
    service: BringService = Depends(service_dependency),
) -> BringStatusResponse:
    return await service.get_status(database)


@router.get("/events")
async def events(
    request: Request,
    _: AuthContext = Depends(active_member),
    service: BringService = Depends(service_dependency),
) -> StreamingResponse:
    client_id = str(uuid4())

    async def stream() -> AsyncIterator[str]:
        revision = -1
        heartbeat = 0
        try:
            while not await request.is_disconnected():
                async with SessionFactory() as database:
                    await service.register_client(database, client_id)
                    response = await service.get_items(database, active=True)
                if response.revision != revision:
                    revision = response.revision
                    yield f"event: items\ndata: {response.model_dump_json()}\n\n"
                heartbeat += 1
                if heartbeat >= 15:
                    heartbeat = 0
                    yield ": keep-alive\n\n"
                await asyncio.sleep(1)
        finally:
            async with SessionFactory() as database:
                await service.unregister_client(database, client_id)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
