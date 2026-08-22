from __future__ import annotations

import asyncio
from datetime import timedelta
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.time import ensure_utc, utc_now
from app.database.models import CameraModeState
from app.database.session import SessionFactory
from app.schemas.camera import CameraModeStatus


class CameraModeService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def status(self, session: AsyncSession) -> CameraModeStatus:
        state = await self._state(session, lock=True)
        if (
            state.active
            and state.expires_at is not None
            and ensure_utc(state.expires_at) <= utc_now()
        ):
            self._deactivate_state(state)
            await session.commit()
        return self._present(state)

    async def activate(self, session: AsyncSession) -> CameraModeStatus:
        state = await self._state(session, lock=True)
        now = utc_now()
        state.active = True
        state.expires_at = now + timedelta(minutes=self.settings.camera_mode_timeout_minutes)
        state.revision += 1
        state.updated_at = now
        await session.commit()
        return self._present(state)

    async def deactivate(self, session: AsyncSession) -> CameraModeStatus:
        state = await self._state(session, lock=True)
        if state.active or state.expires_at is not None:
            self._deactivate_state(state)
            await session.commit()
        return self._present(state)

    async def reset(self, session: AsyncSession) -> CameraModeStatus:
        return await self.deactivate(session)

    async def reset_on_startup(self) -> None:
        async with SessionFactory() as session:
            await self.reset(session)

    async def monitor_timeout(self) -> None:
        while True:
            async with SessionFactory() as session:
                await self.status(session)
            await asyncio.sleep(1)

    async def _state(self, session: AsyncSession, *, lock: bool) -> CameraModeState:
        statement = select(CameraModeState).where(CameraModeState.id == 1)
        if lock:
            statement = statement.with_for_update()
        state = (await session.execute(statement)).scalar_one_or_none()
        if state is not None:
            return state

        state = CameraModeState(
            id=1,
            active=False,
            expires_at=None,
            revision=0,
            updated_at=utc_now(),
        )
        session.add(state)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
        return (await session.execute(statement)).scalar_one()

    @staticmethod
    def _deactivate_state(state: CameraModeState) -> None:
        state.active = False
        state.expires_at = None
        state.revision += 1
        state.updated_at = utc_now()

    def _present(self, state: CameraModeState) -> CameraModeStatus:
        return CameraModeStatus(
            active=state.active,
            expires_at=state.expires_at if state.active else None,
            stream_url=self.settings.camera_stream_url,
            revision=state.revision,
        )


@lru_cache
def get_camera_mode_service() -> CameraModeService:
    return CameraModeService(get_settings())
