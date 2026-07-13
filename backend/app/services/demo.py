from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.schemas.calendar import CalendarEventSchema, CalendarSourceSchema

DEMO_SOURCES = [
    CalendarSourceSchema(id="family", name="Familie", color="#62D68B", category="family"),
    CalendarSourceSchema(id="max", name="Max", color="#5FA8FF", category="personal"),
    CalendarSourceSchema(id="jessica", name="Jessica", color="#C28CFF", category="personal"),
    CalendarSourceSchema(id="school", name="Schule", color="#FFB65C", category="school"),
]

DEMO_ITEMS = [
    (0, 10, 0, "Projektbesprechung", "max", "Arbeitszimmer"),
    (0, 17, 30, "Fußballtraining Gabriel", "family", "Sportplatz Unna"),
    (1, 18, 0, "Abendessen bei Oma und Opa", "family", None),
    (3, 15, 30, "Hannah Schulfest", "school", "Grundschule"),
    (5, 9, 0, "Zahnarzttermin", "jessica", "Innenstadt"),
    (7, 11, 0, "Team Meeting", "max", None),
    (9, 18, 30, "Yoga", "jessica", "Studio am Park"),
    (12, 8, 0, "Einkaufen", "family", None),
    (16, 9, 30, "Frühstück mit Freunden", "family", "Café Extrablatt"),
]


def demo_calendar(
    now: datetime, timezone: str
) -> tuple[list[CalendarEventSchema], list[CalendarSourceSchema]]:
    zone = ZoneInfo(timezone)
    local_now = now.astimezone(zone)
    source_map = {source.id: source for source in DEMO_SOURCES}
    events: list[CalendarEventSchema] = []
    for index, (offset, hour, minute, title, source_id, location) in enumerate(DEMO_ITEMS):
        source = source_map[source_id]
        start = datetime.combine(
            local_now.date() + timedelta(days=offset), time(hour, minute), tzinfo=zone
        )
        events.append(
            CalendarEventSchema(
                id=f"demo-{index}",
                calendar_id=source.id,
                calendar_name=source.name,
                title=title,
                start=start,
                end=start + timedelta(hours=1, minutes=15),
                all_day=False,
                location=location,
                color=source.color,
                source=source.name,
            )
        )
    all_day_specs = [(4, "Brückentag", "family"), (14, "Geburtstag", "jessica")]
    for index, (offset, title, source_id) in enumerate(all_day_specs, start=len(events)):
        source = source_map[source_id]
        start_date = local_now.date() + timedelta(days=offset)
        events.append(
            CalendarEventSchema(
                id=f"demo-{index}",
                calendar_id=source.id,
                calendar_name=source.name,
                title=title,
                start=start_date,
                end=start_date + timedelta(days=1),
                all_day=True,
                color=source.color,
                source=source.name,
            )
        )
    return sorted(events, key=lambda event: str(event.start)), DEMO_SOURCES
