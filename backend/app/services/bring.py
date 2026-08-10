from __future__ import annotations

from datetime import timedelta
from functools import lru_cache
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.time import ensure_utc, utc_now
from app.database.models import BringCache, BringClientPresence, BringMutation
from app.providers.bring import BringProvider, BringProviderError
from app.schemas.bring import BringItem, BringItemsResponse, BringState, BringStatusResponse


class BringServiceError(Exception):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


class BringService:
    def __init__(self, settings: Settings, provider: BringProvider | None = None) -> None:
        self.settings = settings
        self.provider = provider or BringProvider(settings)

    @property
    def configured(self) -> bool:
        return bool(
            self.settings.bring_enabled
            and self.settings.bring_email.strip()
            and self.settings.bring_password
        )

    @property
    def configuration_state(self) -> BringState:
        if not self.settings.bring_enabled:
            return "disabled"
        if not self.configured:
            return "configuration_missing"
        return "ok"

    async def close(self) -> None:
        await self.provider.close()

    async def get_items(self, session: AsyncSession, active: bool = True) -> BringItemsResponse:
        cache = await self._cache(session)
        if not self.configured:
            cache.status = self.configuration_state
            await session.commit()
            return self._present(cache)
        await self.refresh_if_due(session, active=active, force=cache.last_success_at is None)
        return self._present(await self._cache(session, refresh=True))

    async def get_status(self, session: AsyncSession) -> BringStatusResponse:
        response = self._present(await self._cache(session))
        return BringStatusResponse(
            configured=response.configured,
            available=response.available,
            stale=response.stale,
            status=response.status,
            last_successful_sync_at=response.last_successful_sync_at,
        )

    async def refresh_if_due(
        self, session: AsyncSession, *, active: bool, force: bool = False
    ) -> bool:
        if not self.configured:
            return False
        now = utc_now()
        cache = await self._cache(session)
        if cache.retry_after_at and ensure_utc(cache.retry_after_at) > now:
            return False
        interval = (
            self.settings.bring_active_sync_seconds
            if active
            else self.settings.bring_idle_sync_seconds
        )
        if (
            not force
            and cache.last_attempt_at
            and ensure_utc(cache.last_attempt_at) > now - timedelta(seconds=interval)
        ):
            return False

        locked = (
            await session.execute(select(BringCache).where(BringCache.id == 1).with_for_update())
        ).scalar_one()
        if locked.sync_started_at and ensure_utc(locked.sync_started_at) > now - timedelta(
            seconds=self.settings.bring_request_timeout_seconds + 5
        ):
            await session.rollback()
            return False
        if (
            not force
            and locked.last_attempt_at
            and ensure_utc(locked.last_attempt_at) > now - timedelta(seconds=interval)
        ):
            await session.rollback()
            return False
        locked.sync_started_at = now
        locked.last_attempt_at = now
        await session.commit()

        try:
            items = await self.provider.load_items()
        except BringProviderError as exc:
            failed = await self._cache(session, refresh=True)
            failed.sync_started_at = None
            failed.status = exc.kind
            failed.failure_count += 1
            backoff = min(30 * (2 ** min(failed.failure_count - 1, 5)), 900)
            failed.retry_after_at = now + (exc.retry_after or timedelta(seconds=backoff))
            await session.commit()
            return False

        current = await self._cache(session, refresh=True)
        if current.items != items:
            current.items = items
            current.revision += 1
        current.last_success_at = utc_now()
        current.sync_started_at = None
        current.status = "ok"
        current.failure_count = 0
        current.retry_after_at = None
        await session.commit()
        return True

    async def add_item(
        self,
        session: AsyncSession,
        *,
        name: str,
        specification: str,
        mutation_id: str,
    ) -> BringItem:
        self._ensure_writable()
        item_id = str(uuid4())
        existing = await self._reserve_mutation(session, mutation_id, "add", item_id)
        if existing is not None:
            return BringItem.model_validate(existing)
        try:
            await self.provider.add_item(item_id, name, specification)
        except BringProviderError as exc:
            await self._release_mutation(session, mutation_id)
            raise self._write_error(exc) from exc

        cache = await self._cache(session, refresh=True)
        item = BringItem(
            id=item_id, name=name, specification=specification, position=len(cache.items)
        )
        cache.items = [*cache.items, item.model_dump()]
        self._successful_write(cache)
        await self._finish_mutation(session, mutation_id, item.model_dump())
        return item

    async def complete_item(
        self, session: AsyncSession, *, item_id: str, mutation_id: str
    ) -> BringItemsResponse:
        self._ensure_writable()
        repeated = await session.get(BringMutation, mutation_id)
        if repeated is not None:
            if repeated.operation != "complete" or repeated.item_id != item_id:
                raise BringServiceError("Ungültige wiederholte Anfrage.", 409)
            if repeated.result is not None:
                return BringItemsResponse.model_validate(repeated.result)
            raise BringServiceError("Diese Änderung wird bereits übertragen.", 409)
        cache = await self._cache(session)
        item = next((entry for entry in cache.items if entry.get("id") == item_id), None)
        if item is None:
            await self.refresh_if_due(session, active=True, force=True)
            cache = await self._cache(session, refresh=True)
            item = next((entry for entry in cache.items if entry.get("id") == item_id), None)
        if item is None:
            raise BringServiceError("Artikel nicht gefunden.", 404)

        existing = await self._reserve_mutation(session, mutation_id, "complete", item_id)
        if existing is not None:
            return BringItemsResponse.model_validate(existing)
        try:
            await self.provider.complete_item(
                item_id, str(item["name"]), str(item.get("specification", ""))
            )
        except BringProviderError as exc:
            await self._release_mutation(session, mutation_id)
            raise self._write_error(exc) from exc

        cache = await self._cache(session, refresh=True)
        remaining = [entry for entry in cache.items if entry.get("id") != item_id]
        cache.items = [{**entry, "position": index} for index, entry in enumerate(remaining)]
        self._successful_write(cache)
        response = self._present(cache)
        await self._finish_mutation(session, mutation_id, response.model_dump(mode="json"))
        return response

    async def register_client(self, session: AsyncSession, client_id: str) -> None:
        now = utc_now()
        presence = await session.get(BringClientPresence, client_id)
        if presence is None:
            session.add(BringClientPresence(id=client_id, last_seen_at=now))
        else:
            presence.last_seen_at = now
        await session.execute(
            delete(BringClientPresence).where(
                BringClientPresence.last_seen_at < now - timedelta(seconds=60)
            )
        )
        await session.commit()

    async def unregister_client(self, session: AsyncSession, client_id: str) -> None:
        await session.execute(
            delete(BringClientPresence).where(BringClientPresence.id == client_id)
        )
        await session.commit()

    async def has_active_clients(self, session: AsyncSession) -> bool:
        cutoff = utc_now() - timedelta(seconds=60)
        count = await session.scalar(
            select(func.count(BringClientPresence.id)).where(
                BringClientPresence.last_seen_at >= cutoff
            )
        )
        return bool(count)

    async def _cache(self, session: AsyncSession, refresh: bool = False) -> BringCache:
        cache = await session.get(BringCache, 1, populate_existing=refresh)
        if cache is None:
            cache = BringCache(
                id=1,
                items=[],
                revision=0,
                status=self.configuration_state,
                failure_count=0,
            )
            session.add(cache)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                cache = await session.get(BringCache, 1)
                if cache is None:
                    raise
        return cache

    def _present(self, cache: BringCache) -> BringItemsResponse:
        status = self.configuration_state if not self.configured else cache.status
        last_success = cache.last_success_at
        return BringItemsResponse(
            items=[BringItem.model_validate(item) for item in cache.items],
            configured=self.configured,
            available=status == "ok",
            stale=last_success is not None and status != "ok",
            status=status,
            last_successful_sync_at=last_success,
            revision=cache.revision,
        )

    def _ensure_writable(self) -> None:
        if not self.configured:
            raise BringServiceError("Bring ist noch nicht konfiguriert.", 503)

    @staticmethod
    def _successful_write(cache: BringCache) -> None:
        cache.revision += 1
        cache.last_success_at = utc_now()
        cache.status = "ok"
        cache.failure_count = 0
        cache.retry_after_at = None

    async def _reserve_mutation(
        self, session: AsyncSession, mutation_id: str, operation: str, item_id: str
    ) -> dict[str, Any] | None:
        await session.execute(
            delete(BringMutation).where(BringMutation.created_at < utc_now() - timedelta(days=1))
        )
        existing = await session.get(BringMutation, mutation_id)
        if existing is not None:
            if existing.operation != operation:
                raise BringServiceError("Ungültige wiederholte Anfrage.", 409)
            if existing.result is not None:
                return existing.result
            raise BringServiceError("Diese Änderung wird bereits übertragen.", 409)
        session.add(
            BringMutation(
                id=mutation_id,
                operation=operation,
                item_id=item_id,
                created_at=utc_now(),
            )
        )
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise BringServiceError("Diese Änderung wird bereits übertragen.", 409) from exc
        return None

    async def _release_mutation(self, session: AsyncSession, mutation_id: str) -> None:
        await session.execute(delete(BringMutation).where(BringMutation.id == mutation_id))
        await session.commit()

    async def _finish_mutation(
        self, session: AsyncSession, mutation_id: str, result: dict[str, Any]
    ) -> None:
        mutation = await session.get(BringMutation, mutation_id)
        if mutation is not None:
            mutation.completed_at = utc_now()
            mutation.result = result
        await session.commit()

    @staticmethod
    def _write_error(exc: BringProviderError) -> BringServiceError:
        messages = {
            "authentication_failed": "Bring-Anmeldung fehlgeschlagen.",
            "rate_limited": "Bring ist vorübergehend ausgelastet. Bitte später erneut versuchen.",
            "configuration_missing": "Die gemeinsame Bring-Liste ist nicht konfiguriert.",
        }
        return BringServiceError(
            messages.get(exc.kind, "Bring ist vorübergehend nicht erreichbar."),
            429 if exc.kind == "rate_limited" else 503,
        )


@lru_cache
def get_bring_service() -> BringService:
    return BringService(get_settings())
