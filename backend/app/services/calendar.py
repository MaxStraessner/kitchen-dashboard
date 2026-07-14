from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import CalendarSourceConfig, Settings
from app.core.time import ensure_utc, utc_now
from app.database.models import CalendarEvent, CalendarSourceStatus
from app.providers.calendar.ics import IcsFetchResult, IcsProvider
from app.schemas.calendar import (
    CalendarEventSchema,
    CalendarEventsResponse,
    CalendarSourceSchema,
    CalendarSourcesResponse,
)
from app.schemas.common import ProviderMeta
from app.services.demo import demo_calendar

_calendar_refresh_lock = asyncio.Lock()
_calendar_advisory_lock_id = 6_261_341_325


def _event_to_model(event: CalendarEventSchema, refreshed_at: datetime) -> CalendarEvent:
    start_at = event.start if isinstance(event.start, datetime) else None
    end_at = event.end if isinstance(event.end, datetime) else None
    start_date = (
        event.start
        if isinstance(event.start, date) and not isinstance(event.start, datetime)
        else None
    )
    end_date = (
        event.end if isinstance(event.end, date) and not isinstance(event.end, datetime) else None
    )
    return CalendarEvent(
        external_id=event.id,
        source_id=event.calendar_id,
        calendar_name=event.calendar_name,
        title=event.title,
        start_at=start_at,
        end_at=end_at,
        start_date=start_date,
        end_date=end_date,
        all_day=event.all_day,
        location=event.location,
        description=event.description,
        color=event.color,
        source_label=event.source,
        last_modified=event.last_modified,
        cancelled=event.cancelled,
        stale=event.stale,
        refreshed_at=refreshed_at,
    )


def _model_to_event(model: CalendarEvent) -> CalendarEventSchema:
    if model.all_day:
        assert model.start_date is not None and model.end_date is not None
        start: datetime | date = model.start_date
        end: datetime | date = model.end_date
    else:
        assert model.start_at is not None and model.end_at is not None
        start = ensure_utc(model.start_at)
        end = ensure_utc(model.end_at)
    return CalendarEventSchema(
        id=model.external_id,
        calendar_id=model.source_id,
        calendar_name=model.calendar_name,
        title=model.title,
        start=start,
        end=end,
        all_day=model.all_day,
        location=model.location,
        description=model.description,
        color=model.color,
        source=model.source_label,
        last_modified=model.last_modified,
        cancelled=model.cancelled,
        stale=model.stale,
    )


class CalendarService:
    def __init__(self, settings: Settings, provider: IcsProvider | None = None) -> None:
        self.settings = settings
        self.provider = provider or IcsProvider()

    async def get_events(self, session: AsyncSession) -> CalendarEventsResponse:
        now = utc_now()
        sources = self.settings.calendar_sources
        if not sources:
            events, demo_sources = demo_calendar(now, self.settings.app_timezone)
            return CalendarEventsResponse(
                events=events,
                sources=demo_sources,
                meta=ProviderMeta(updated_at=now, demo_mode=True),
            )

        fresh_after = now - timedelta(seconds=self.settings.calendar_cache_ttl_seconds)

        def source_is_fresh(
            source: CalendarSourceConfig, statuses: dict[str, CalendarSourceStatus]
        ) -> bool:
            status = statuses.get(source.id)
            return (
                status is not None
                and status.last_attempt_at is not None
                and ensure_utc(status.last_attempt_at) > fresh_after
            )

        statuses = await self._status_map(session)
        if statuses and all(source_is_fresh(source, statuses) for source in sources):
            return await self._cached_response(session, statuses, now)

        async with _calendar_refresh_lock:
            if session.get_bind().dialect.name == "postgresql":
                await session.execute(
                    text("SELECT pg_advisory_xact_lock(:lock_id)"),
                    {"lock_id": _calendar_advisory_lock_id},
                )

            statuses = await self._status_map(session)
            due_sources = [source for source in sources if not source_is_fresh(source, statuses)]
            if due_sources:
                window_start = now - timedelta(hours=3)
                window_end = now + timedelta(weeks=5, days=1)
                results = await asyncio.gather(
                    *[
                        self.provider.fetch(
                            source, window_start, window_end, self.settings.app_timezone
                        )
                        for source in due_sources
                    ],
                    return_exceptions=True,
                )
                for source, result in zip(due_sources, results, strict=True):
                    await self._store_result(session, source, result, now)
            await session.commit()

        return await self._cached_response(session, await self._status_map(session), now)

    async def get_sources(self, session: AsyncSession) -> CalendarSourcesResponse:
        response = await self.get_events(session)
        return CalendarSourcesResponse(sources=response.sources, meta=response.meta)

    async def _store_result(
        self,
        session: AsyncSession,
        source: CalendarSourceConfig,
        result: IcsFetchResult | BaseException,
        now: datetime,
    ) -> None:
        status = await session.get(CalendarSourceStatus, source.id)
        if status is None:
            status = CalendarSourceStatus(
                source_id=source.id,
                name=source.name,
                color=source.color,
                category=source.category,
                priority=source.priority,
            )
            session.add(status)
        status.name = source.name
        status.color = source.color
        status.category = source.category
        status.priority = source.priority
        status.last_attempt_at = now
        if isinstance(result, BaseException):
            status.stale = True
            status.last_error = "Calendar source temporarily unavailable"
            await session.execute(
                update(CalendarEvent).where(CalendarEvent.source_id == source.id).values(stale=True)
            )
            return
        status.stale = False
        status.last_success_at = now
        status.last_error = None
        await session.execute(delete(CalendarEvent).where(CalendarEvent.source_id == source.id))
        session.add_all([_event_to_model(event, now) for event in result.events])

    async def _status_map(self, session: AsyncSession) -> dict[str, CalendarSourceStatus]:
        rows = (await session.scalars(select(CalendarSourceStatus))).all()
        return {row.source_id: row for row in rows}

    async def _cached_response(
        self,
        session: AsyncSession,
        statuses: dict[str, CalendarSourceStatus],
        now: datetime,
    ) -> CalendarEventsResponse:
        window_start = now - timedelta(hours=3)
        window_end = now + timedelta(weeks=5, days=1)
        date_start = window_start.date()
        date_end = window_end.date()
        statement = (
            select(CalendarEvent)
            .where(
                CalendarEvent.cancelled.is_(False),
                (
                    (CalendarEvent.all_day.is_(False) & (CalendarEvent.end_at >= window_start))
                    | (CalendarEvent.all_day.is_(True) & (CalendarEvent.end_date >= date_start))
                ),
                (
                    (CalendarEvent.all_day.is_(False) & (CalendarEvent.start_at <= window_end))
                    | (CalendarEvent.all_day.is_(True) & (CalendarEvent.start_date <= date_end))
                ),
            )
            .order_by(CalendarEvent.start_date, CalendarEvent.start_at, CalendarEvent.title)
        )
        models = (await session.scalars(statement)).all()
        configured = {source.id for source in self.settings.calendar_sources}
        source_schemas = [
            CalendarSourceSchema(
                id=status.source_id,
                name=status.name,
                color=status.color,
                category=status.category,
                stale=status.stale,
                last_success_at=status.last_success_at,
            )
            for status in sorted(statuses.values(), key=lambda item: item.priority)
            if status.source_id in configured
        ]
        events = [_model_to_event(model) for model in models]
        priorities = {source.id: source.priority for source in self.settings.calendar_sources}
        berlin = ZoneInfo(self.settings.app_timezone)

        def sort_key(event: CalendarEventSchema) -> tuple[date, bool, datetime, int, str]:
            if event.all_day:
                assert isinstance(event.start, date) and not isinstance(event.start, datetime)
                local_date = event.start
                local_start = datetime.combine(local_date, datetime.min.time(), tzinfo=berlin)
            else:
                assert isinstance(event.start, datetime)
                local_start = event.start.astimezone(berlin)
                local_date = local_start.date()
            return (
                local_date,
                not event.all_day,
                local_start,
                priorities.get(event.calendar_id, 1000),
                event.title.casefold(),
            )

        events.sort(key=sort_key)
        updated_candidates = [
            status.last_success_at
            for source_id, status in statuses.items()
            if source_id in configured and status.last_success_at
        ]
        updated_at = max((ensure_utc(item) for item in updated_candidates), default=now)
        return CalendarEventsResponse(
            events=events,
            sources=source_schemas,
            meta=ProviderMeta(
                updated_at=updated_at,
                stale=any(source.stale for source in source_schemas),
            ),
        )
