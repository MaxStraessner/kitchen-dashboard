from datetime import UTC, date, datetime

from app.core.config import CalendarSourceConfig
from app.providers.calendar.ics import parse_ics

SOURCE = CalendarSourceConfig(
    id="family",
    name="Familie",
    url="https://example.invalid/private.ics",
    color="#62D68B",
    showLocation=True,
    priority=10,
)


def parse(body: str) -> list[object]:
    return parse_ics(
        body.encode(),
        SOURCE,
        datetime(2026, 3, 1, tzinfo=UTC),
        datetime(2026, 11, 30, tzinfo=UTC),
        "Europe/Berlin",
    )


def test_all_day_event_remains_local_date() -> None:
    events = parse("""BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:all-day\r
DTSTART;VALUE=DATE:20260714\r
DTEND;VALUE=DATE:20260716\r
SUMMARY:Brückentag\r
END:VEVENT\r
END:VCALENDAR\r
""")
    event = events[0]
    assert event.all_day is True
    assert event.start == date(2026, 7, 14)
    assert event.end == date(2026, 7, 16)


def test_multiday_timed_event_keeps_real_duration_and_berlin_dst() -> None:
    events = parse("""BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:multiday\r
DTSTART;TZID=Europe/Berlin:20260328T220000\r
DTEND;TZID=Europe/Berlin:20260330T080000\r
SUMMARY:Wochenende\r
END:VEVENT\r
END:VCALENDAR\r
""")
    event = events[0]
    assert event.start == datetime(2026, 3, 28, 21, tzinfo=UTC)
    assert event.end == datetime(2026, 3, 30, 6, tzinfo=UTC)


def test_winter_time_is_normalized_to_utc() -> None:
    events = parse("""BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:winter\r
DTSTART;TZID=Europe/Berlin:20261102T090000\r
DTEND;TZID=Europe/Berlin:20261102T100000\r
SUMMARY:Wintertermin\r
END:VEVENT\r
END:VCALENDAR\r
""")
    assert events[0].start == datetime(2026, 11, 2, 8, tzinfo=UTC)


def test_recurring_event_and_exdate_are_expanded() -> None:
    events = parse("""BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:yoga\r
DTSTART;TZID=Europe/Berlin:20260701T180000\r
DTEND;TZID=Europe/Berlin:20260701T190000\r
RRULE:FREQ=WEEKLY;COUNT=4\r
EXDATE;TZID=Europe/Berlin:20260715T180000\r
SUMMARY:Yoga\r
END:VEVENT\r
END:VCALENDAR\r
""")
    assert len(events) == 3


def test_moved_recurrence_replaces_original_occurrence() -> None:
    events = parse("""BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:team\r
DTSTART;TZID=Europe/Berlin:20260701T100000\r
DTEND;TZID=Europe/Berlin:20260701T110000\r
RRULE:FREQ=WEEKLY;COUNT=3\r
SUMMARY:Team Meeting\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:team\r
RECURRENCE-ID;TZID=Europe/Berlin:20260708T100000\r
DTSTART;TZID=Europe/Berlin:20260708T140000\r
DTEND;TZID=Europe/Berlin:20260708T150000\r
SUMMARY:Team Meeting verschoben\r
END:VEVENT\r
END:VCALENDAR\r
""")
    assert len(events) == 3
    assert any(event.title.endswith("verschoben") and event.start.hour == 12 for event in events)


def test_cancelled_event_is_omitted() -> None:
    events = parse("""BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:cancelled\r
DTSTART:20260701T100000Z\r
DTEND:20260701T110000Z\r
STATUS:CANCELLED\r
SUMMARY:Fällt aus\r
END:VEVENT\r
END:VCALENDAR\r
""")
    assert events == []
