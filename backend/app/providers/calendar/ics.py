from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import recurring_ical_events
from icalendar import Calendar

from app.core.config import CalendarSourceConfig
from app.schemas.calendar import CalendarEventSchema


def _decoded(component: Any, key: str) -> Any:
    value = component.get(key)
    return value.dt if hasattr(value, "dt") else value


def _aware(value: datetime, timezone: str) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo(timezone))
    return value.astimezone(UTC)


def _text(component: Any, key: str, default: str = "") -> str:
    value = component.get(key)
    return str(value).strip() if value is not None else default


def normalize_component(
    component: Any, source: CalendarSourceConfig, timezone: str
) -> CalendarEventSchema:
    start_raw = _decoded(component, "DTSTART")
    if not isinstance(start_raw, (date, datetime)):
        raise ValueError("Calendar event is missing a valid DTSTART")
    end_raw = _decoded(component, "DTEND")
    duration = _decoded(component, "DURATION")
    all_day = isinstance(start_raw, date) and not isinstance(start_raw, datetime)

    if all_day:
        start: date | datetime = start_raw
        if isinstance(end_raw, datetime):
            end: date | datetime = end_raw.date()
        elif isinstance(end_raw, date):
            end = end_raw
        elif isinstance(duration, timedelta):
            end = start_raw + duration
        else:
            end = start_raw + timedelta(days=1)
    else:
        assert isinstance(start_raw, datetime)
        start = _aware(start_raw, timezone)
        if isinstance(end_raw, datetime):
            end = _aware(end_raw, timezone)
        elif isinstance(duration, timedelta):
            end = start + duration
        else:
            end = start + timedelta(hours=1)

    uid = _text(component, "UID", "event")
    recurrence_id = _decoded(component, "RECURRENCE-ID")
    identity = f"{source.id}:{uid}:{recurrence_id or start}"
    event_id = sha256(identity.encode("utf-8")).hexdigest()[:24]
    last_modified_raw = _decoded(component, "LAST-MODIFIED")
    last_modified = (
        _aware(last_modified_raw, timezone) if isinstance(last_modified_raw, datetime) else None
    )
    cancelled = _text(component, "STATUS").upper() == "CANCELLED"
    location = _text(component, "LOCATION") or None
    if not source.show_location:
        location = None

    return CalendarEventSchema(
        id=event_id,
        calendar_id=source.id,
        calendar_name=source.name,
        title=_text(component, "SUMMARY", "Ohne Titel"),
        start=start,
        end=end,
        all_day=all_day,
        location=location,
        description=_text(component, "DESCRIPTION") or None,
        color=source.color,
        source=source.name,
        last_modified=last_modified,
        cancelled=cancelled,
        stale=False,
    )


def parse_ics(
    body: bytes,
    source: CalendarSourceConfig,
    window_start: datetime,
    window_end: datetime,
    timezone: str,
) -> list[CalendarEventSchema]:
    calendar = Calendar.from_ical(body)
    components = recurring_ical_events.of(calendar).between(window_start, window_end)
    normalized: dict[str, CalendarEventSchema] = {}
    for component in components:
        try:
            event = normalize_component(component, source, timezone)
        except (TypeError, ValueError, KeyError):
            continue
        if not event.cancelled:
            normalized[event.id] = event
    return sorted(normalized.values(), key=lambda item: (str(item.start), item.title.lower()))


@dataclass(slots=True)
class IcsFetchResult:
    source: CalendarSourceConfig
    events: list[CalendarEventSchema]


class IcsProvider:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def fetch(
        self,
        source: CalendarSourceConfig,
        window_start: datetime,
        window_end: datetime,
        timezone: str,
    ) -> IcsFetchResult:
        headers = {"User-Agent": "KitchenDashboard/0.1 (+private ICS reader)"}
        if self._client is not None:
            response = await self._client.get(str(source.url), headers=headers)
        else:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                response = await client.get(str(source.url), headers=headers)
        response.raise_for_status()
        if len(response.content) > 8_000_000:
            raise ValueError("Calendar response exceeds the safe size limit")
        return IcsFetchResult(
            source=source,
            events=parse_ics(response.content, source, window_start, window_end, timezone),
        )
