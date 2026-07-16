import asyncio
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from bring_api.exceptions import BringAuthException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.core.time import ensure_utc, utc_now
from app.database.base import Base
from app.database.models import BringCache
from app.providers.bring import BringProvider, BringProviderError
from app.services.bring import BringService, BringServiceError


class FakeProvider:
    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items = items or []
        self.load_calls = 0
        self.added: list[tuple[str, str, str]] = []
        self.completed: list[tuple[str, str, str]] = []
        self.error: BringProviderError | None = None

    async def load_items(self) -> list[dict[str, Any]]:
        self.load_calls += 1
        if self.error:
            raise self.error
        return [dict(item) for item in self.items]

    async def add_item(self, item_id: str, name: str, specification: str) -> None:
        if self.error:
            raise self.error
        self.added.append((item_id, name, specification))

    async def complete_item(self, item_id: str, name: str, specification: str) -> None:
        if self.error:
            raise self.error
        self.completed.append((item_id, name, specification))

    async def close(self) -> None:
        return None


def configured() -> Settings:
    return Settings(
        app_env="test",
        database_url="sqlite+aiosqlite://",
        bring_enabled=True,
        bring_email="mock@example.invalid",
        bring_password="mock-only",
        bring_list_uuid="00000000-0000-4000-8000-000000000001",
    )


def sample_items() -> list[dict[str, Any]]:
    return [
        {
            "id": "00000000-0000-4000-8000-000000000101",
            "name": "Haferdrink",
            "specification": "2 Packungen",
            "position": 0,
        },
        {
            "id": "00000000-0000-4000-8000-000000000102",
            "name": "Haferdrink",
            "specification": "ungesüßt",
            "position": 1,
        },
    ]


async def test_provider_normalizes_only_open_items_and_preserves_duplicates() -> None:
    provider = BringProvider(configured())
    purchase = [
        SimpleNamespace(uuid=item["id"], itemId=item["name"], specification=item["specification"])
        for item in sample_items()
    ]
    client = SimpleNamespace(
        get_list=lambda _: asyncio.sleep(
            0, result=SimpleNamespace(items=SimpleNamespace(purchase=purchase, recently=[]))
        )
    )
    normalized = await provider._load_items(client, "list")  # type: ignore[arg-type]
    assert normalized == sample_items()


async def test_provider_reauthenticates_once_after_expired_session(monkeypatch: Any) -> None:
    provider = BringProvider(configured())
    calls = 0

    async def client() -> object:
        return object()

    async def selected(_: object) -> str:
        return "list"

    async def operation(_: object, __: str) -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise BringAuthException("expired")
        return "ok"

    monkeypatch.setattr(provider, "_authenticated_client", client)
    monkeypatch.setattr(provider, "_selected_list", selected)
    assert await provider._with_reauthentication(operation) == "ok"
    assert calls == 2


async def test_provider_selects_configured_or_only_list() -> None:
    configured_provider = BringProvider(configured())
    lists = [
        SimpleNamespace(name="Andere Liste", listUuid="other"),
        SimpleNamespace(name="Gemeinsam", listUuid=configured().bring_list_uuid),
    ]
    client = SimpleNamespace(
        load_lists=lambda: asyncio.sleep(0, result=SimpleNamespace(lists=lists))
    )
    assert await configured_provider._selected_list(client) == configured().bring_list_uuid  # type: ignore[arg-type]

    one_list_settings = configured().model_copy(update={"bring_list_uuid": ""})
    one_list_provider = BringProvider(one_list_settings)
    one_client = SimpleNamespace(
        load_lists=lambda: asyncio.sleep(
            0, result=SimpleNamespace(lists=[SimpleNamespace(name="Gemeinsam", listUuid="only")])
        )
    )
    assert await one_list_provider._selected_list(one_client) == "only"  # type: ignore[arg-type]

    ambiguous_provider = BringProvider(one_list_settings)
    with pytest.raises(BringProviderError) as exc_info:
        await ambiguous_provider._selected_list(client)  # type: ignore[arg-type]
    assert exc_info.value.kind == "configuration_missing"


async def test_cache_rate_limits_active_and_idle_refreshes(session: AsyncSession) -> None:
    provider = FakeProvider(sample_items())
    service = BringService(configured(), provider)  # type: ignore[arg-type]
    first = await service.get_items(session)
    second = await service.get_items(session)
    assert first.items == second.items
    assert provider.load_calls == 1

    cache = await session.get(BringCache, 1)
    assert cache is not None
    cache.last_attempt_at = utc_now() - timedelta(seconds=100)
    await session.commit()
    await service.refresh_if_due(session, active=False)
    assert provider.load_calls == 1
    await service.refresh_if_due(session, active=True)
    assert provider.load_calls == 2


async def test_parallel_requests_share_one_external_refresh(tmp_path: Path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'bring.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    started = asyncio.Event()
    release = asyncio.Event()

    class SlowProvider(FakeProvider):
        async def load_items(self) -> list[dict[str, Any]]:
            self.load_calls += 1
            started.set()
            await release.wait()
            return sample_items()

    provider = SlowProvider()
    service = BringService(configured(), provider)  # type: ignore[arg-type]

    async def load() -> object:
        async with factory() as database:
            return await service.get_items(database)

    first = asyncio.create_task(load())
    await started.wait()
    second = asyncio.create_task(load())
    await asyncio.sleep(0.05)
    release.set()
    await asyncio.gather(first, second)
    assert provider.load_calls == 1
    await engine.dispose()


async def test_last_successful_cache_is_stale_on_timeout_and_backoff_applies(
    session: AsyncSession,
) -> None:
    provider = FakeProvider(sample_items())
    service = BringService(configured(), provider)  # type: ignore[arg-type]
    await service.get_items(session)
    cache = await session.get(BringCache, 1)
    assert cache is not None
    cache.last_attempt_at = utc_now() - timedelta(seconds=100)
    await session.commit()
    provider.error = BringProviderError("unavailable")
    await service.refresh_if_due(session, active=True)
    response = await service.get_items(session)
    assert response.stale is True
    assert [item.name for item in response.items] == ["Haferdrink", "Haferdrink"]
    calls = provider.load_calls
    await service.refresh_if_due(session, active=True)
    assert provider.load_calls == calls


async def test_rate_limit_respects_retry_after(session: AsyncSession) -> None:
    provider = FakeProvider()
    provider.error = BringProviderError("rate_limited", timedelta(seconds=300))
    service = BringService(configured(), provider)  # type: ignore[arg-type]
    response = await service.get_items(session)
    assert response.status == "rate_limited"
    cache = await session.get(BringCache, 1)
    assert cache is not None and cache.retry_after_at is not None
    assert ensure_utc(cache.retry_after_at) > utc_now() + timedelta(seconds=250)


async def test_add_complete_uuid_and_idempotency(session: AsyncSession) -> None:
    provider = FakeProvider(sample_items())
    service = BringService(configured(), provider)  # type: ignore[arg-type]
    await service.get_items(session)
    added = await service.add_item(
        session,
        name="Reis",
        specification="1 kg",
        mutation_id="mutation-add-0001",
    )
    repeated = await service.add_item(
        session,
        name="Reis",
        specification="1 kg",
        mutation_id="mutation-add-0001",
    )
    assert repeated.id == added.id
    assert len(provider.added) == 1

    response = await service.complete_item(
        session, item_id=sample_items()[1]["id"], mutation_id="mutation-complete-0001"
    )
    repeated_response = await service.complete_item(
        session, item_id=sample_items()[1]["id"], mutation_id="mutation-complete-0001"
    )
    assert response == repeated_response
    assert provider.completed == [(sample_items()[1]["id"], "Haferdrink", "ungesüßt")]
    assert [item.id for item in response.items] == [sample_items()[0]["id"], added.id]


async def test_failed_write_can_be_retried_without_affecting_other_items(
    session: AsyncSession,
) -> None:
    provider = FakeProvider(sample_items())
    service = BringService(configured(), provider)  # type: ignore[arg-type]
    await service.get_items(session)
    provider.error = BringProviderError("unavailable")
    with pytest.raises(BringServiceError):
        await service.complete_item(
            session, item_id=sample_items()[0]["id"], mutation_id="retry-mutation-0001"
        )
    assert len((await service.get_items(session)).items) == 2
    provider.error = None
    result = await service.complete_item(
        session, item_id=sample_items()[0]["id"], mutation_id="retry-mutation-0001"
    )
    assert [item.id for item in result.items] == [sample_items()[1]["id"]]


async def test_missing_configuration_is_safe_and_does_not_call_provider(
    session: AsyncSession,
) -> None:
    provider = FakeProvider(sample_items())
    service = BringService(Settings(app_env="test"), provider)  # type: ignore[arg-type]
    response = await service.get_items(session)
    assert response.model_dump() == {
        "items": [],
        "configured": False,
        "available": False,
        "stale": False,
        "status": "disabled",
        "last_successful_sync_at": None,
        "revision": 0,
    }
    assert provider.load_calls == 0
