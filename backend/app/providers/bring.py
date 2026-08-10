from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, cast

import aiohttp
from bring_api import Bring, BringItemOperation
from bring_api.exceptions import BringAuthException, BringException

from app.core.config import Settings

# The third-party client logs raw provider bodies at DEBUG level. Keep those out of app logs.
logging.getLogger("bring_api").setLevel(logging.WARNING)


@dataclass
class BringProviderError(Exception):
    kind: str
    retry_after: timedelta | None = None


class BringProvider:
    """Small boundary around the unsupported external Bring interface."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._session: aiohttp.ClientSession | None = None
        self._client: Bring | None = None
        self._list_uuid: str | None = None
        self._lock = asyncio.Lock()

    async def close(self) -> None:
        if self._session is not None:
            await self._session.close()
        self._session = None
        self._client = None
        self._list_uuid = None

    async def list_lists(self) -> list[tuple[str, str]]:
        client = await self._authenticated_client()
        try:
            response = await client.load_lists()
            return [(entry.name, entry.listUuid) for entry in response.lists]
        except Exception as exc:
            raise self._safe_error(exc) from exc

    async def load_items(self) -> list[dict[str, Any]]:
        async with self._lock:
            return cast(list[dict[str, Any]], await self._with_reauthentication(self._load_items))

    async def add_item(self, item_id: str, name: str, specification: str) -> None:
        async def operation(client: Bring, list_uuid: str) -> None:
            await client.batch_update_list(
                list_uuid,
                {"itemId": name, "spec": specification, "uuid": item_id},
                BringItemOperation.ADD,
            )

        async with self._lock:
            await self._with_reauthentication(operation)

    async def complete_item(self, item_id: str, name: str, specification: str) -> None:
        async def operation(client: Bring, list_uuid: str) -> None:
            await client.batch_update_list(
                list_uuid,
                {"itemId": name, "spec": specification, "uuid": item_id},
                BringItemOperation.COMPLETE,
            )

        async with self._lock:
            await self._with_reauthentication(operation)

    async def _load_items(self, client: Bring, list_uuid: str) -> list[dict[str, Any]]:
        response = await client.get_list(list_uuid)
        return [
            {
                "id": item.uuid,
                "name": item.itemId,
                "specification": item.specification or "",
                "position": position,
            }
            for position, item in enumerate(response.items.purchase)
        ]

    async def _with_reauthentication(self, operation: Any) -> Any:
        try:
            client = await self._authenticated_client()
            return await asyncio.wait_for(
                operation(client, await self._selected_list(client)),
                timeout=self.settings.bring_request_timeout_seconds,
            )
        except BringAuthException:
            self._client = None
            self._list_uuid = None
            try:
                client = await self._authenticated_client()
                return await asyncio.wait_for(
                    operation(client, await self._selected_list(client)),
                    timeout=self.settings.bring_request_timeout_seconds,
                )
            except Exception as exc:
                raise self._safe_error(exc) from exc
        except Exception as exc:
            raise self._safe_error(exc) from exc

    async def _authenticated_client(self) -> Bring:
        if self._client is not None:
            return self._client
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.settings.bring_request_timeout_seconds)
            self._session = aiohttp.ClientSession(timeout=timeout)
        client = Bring(self._session, self.settings.bring_email, self.settings.bring_password)
        try:
            await asyncio.wait_for(client.login(), self.settings.bring_request_timeout_seconds)
        except Exception as exc:
            raise self._safe_error(exc) from exc
        self._client = client
        return client

    async def _selected_list(self, client: Bring) -> str:
        if self._list_uuid is not None:
            return self._list_uuid
        lists = (await client.load_lists()).lists
        configured = self.settings.bring_list_uuid.strip()
        if configured:
            if not any(entry.listUuid == configured for entry in lists):
                raise BringProviderError("configuration_missing")
            self._list_uuid = configured
        elif len(lists) == 1:
            self._list_uuid = lists[0].listUuid
        else:
            raise BringProviderError("configuration_missing")
        return self._list_uuid

    @staticmethod
    def _safe_error(exc: Exception) -> BringProviderError:
        if isinstance(exc, BringProviderError):
            return exc
        if isinstance(exc, BringAuthException):
            return BringProviderError("authentication_failed")
        cause: BaseException | None = exc
        while cause is not None:
            if isinstance(cause, aiohttp.ClientResponseError) and cause.status == 429:
                retry_value = cause.headers.get("Retry-After") if cause.headers else None
                try:
                    seconds = max(1, min(int(retry_value or "90"), 3600))
                except ValueError:
                    seconds = 90
                return BringProviderError("rate_limited", timedelta(seconds=seconds))
            cause = cause.__cause__
        if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
            return BringProviderError("unavailable")
        if isinstance(exc, BringException):
            return BringProviderError("unavailable")
        return BringProviderError("unavailable")
