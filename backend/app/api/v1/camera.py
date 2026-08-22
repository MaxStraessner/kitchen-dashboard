from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from typing import Protocol

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.auth.dependencies import AuthContext, active_member, valid_csrf
from app.database.session import SessionFactory, get_session
from app.schemas.camera import CameraModeEvent, CameraModeStatus
from app.services.camera_mode import CameraModeService, get_camera_mode_service

router = APIRouter(prefix="/camera", tags=["camera"])


class DisconnectRequest(Protocol):
    async def is_disconnected(self) -> bool: ...


def service_dependency() -> CameraModeService:
    return get_camera_mode_service()


def require_active_csrf(auth: AuthContext) -> None:
    if auth.user.must_change_password:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Passwortänderung erforderlich.")


@router.get("/status", response_model=CameraModeStatus)
async def camera_status(
    _: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
    service: CameraModeService = Depends(service_dependency),
) -> CameraModeStatus:
    return await service.status(database)


@router.post("/activate", response_model=CameraModeStatus)
async def activate_camera(
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    service: CameraModeService = Depends(service_dependency),
) -> CameraModeStatus:
    require_active_csrf(auth)
    return await service.activate(database)


@router.post("/deactivate", response_model=CameraModeStatus)
async def deactivate_camera(
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    service: CameraModeService = Depends(service_dependency),
) -> CameraModeStatus:
    require_active_csrf(auth)
    return await service.deactivate(database)


async def camera_event_stream(
    request: DisconnectRequest,
    service: CameraModeService,
    *,
    session_factory: Callable[[], AsyncSession] = SessionFactory,
    poll_interval: float = 1,
) -> AsyncIterator[str]:
    revision = -1
    heartbeat = 0
    while not await request.is_disconnected():
        async with session_factory() as database:
            response = await service.status(database)
        if response.revision != revision:
            revision = response.revision
            event = CameraModeEvent(**response.model_dump())
            yield f"event: camera_mode_changed\ndata: {event.model_dump_json(by_alias=True)}\n\n"
        heartbeat += 1
        if heartbeat >= 15:
            heartbeat = 0
            yield ": keep-alive\n\n"
        await asyncio.sleep(poll_interval)


@router.get("/events")
async def camera_events(
    request: Request,
    _: AuthContext = Depends(active_member),
    service: CameraModeService = Depends(service_dependency),
) -> StreamingResponse:
    return StreamingResponse(
        camera_event_stream(request, service),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
