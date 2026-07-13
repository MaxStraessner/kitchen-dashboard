import json
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.providers.calendar.ics import IcsFetchResult
from app.schemas.calendar import CalendarEventSchema
from app.services.calendar import CalendarService


class MixedProvider:
    async def fetch(self, source: object, *_: object) -> IcsFetchResult:
        source_id = source.id  # type: ignore[attr-defined]
        if source_id == "broken":
            raise RuntimeError("https://secret.example/private.ics?token=secret")
        start = datetime.fromisoformat("2026-07-15T10:00:00+02:00")
        return IcsFetchResult(
            source=source,  # type: ignore[arg-type]
            events=[
                CalendarEventSchema(
                    id="safe-event",
                    calendarId=source.id,
                    calendarName=source.name,  # type: ignore[attr-defined]
                    title="Termin",
                    start=start,
                    end=start.replace(hour=11),
                    allDay=False,
                    color=source.color,
                    source=source.name,  # type: ignore[attr-defined]
                )
            ],
        )


def configured_settings() -> Settings:
    sources = [
        {
            "id": "working",
            "name": "Familie",
            "url": "https://example.invalid/a.ics",
            "color": "#62D68B",
            "enabled": True,
            "showLocation": True,
            "priority": 10,
        },
        {
            "id": "broken",
            "name": "Privat",
            "url": "https://example.invalid/b.ics",
            "color": "#5FA8FF",
            "enabled": True,
            "showLocation": False,
            "priority": 20,
        },
    ]
    return Settings(database_url="sqlite+aiosqlite://", calendar_sources_json=json.dumps(sources))


async def test_no_sources_returns_explicit_demo_mode(session: AsyncSession) -> None:
    response = await CalendarService(Settings(database_url="sqlite+aiosqlite://")).get_events(
        session
    )
    assert response.meta.demo_mode is True
    assert len(response.events) >= 10
    assert {source.name for source in response.sources} >= {"Familie", "Max", "Jessica"}


async def test_one_broken_source_does_not_block_working_source_or_leak_url(
    session: AsyncSession,
) -> None:
    response = await CalendarService(configured_settings(), MixedProvider()).get_events(session)  # type: ignore[arg-type]
    assert [event.title for event in response.events] == ["Termin"]
    assert response.meta.stale is True
    serialized = response.model_dump_json()
    assert ".ics" not in serialized
    assert "secret" not in serialized
    assert {source.id for source in response.sources} == {"working", "broken"}
