from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo


def utc_now() -> datetime:
    return datetime.now(UTC)


def local_now(timezone: str) -> datetime:
    return utc_now().astimezone(ZoneInfo(timezone))


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def local_date(value: date | datetime, timezone: str) -> date:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=ZoneInfo(timezone))
        return value.astimezone(ZoneInfo(timezone)).date()
    return value
