from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ProviderMeta


class CalendarEventSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    calendar_id: str = Field(alias="calendarId")
    calendar_name: str = Field(alias="calendarName")
    title: str
    start: datetime | date
    end: datetime | date
    all_day: bool = Field(alias="allDay")
    location: str | None = None
    description: str | None = None
    color: str
    source: str
    last_modified: datetime | None = Field(default=None, alias="lastModified")
    cancelled: bool = False
    stale: bool = False


class CalendarSourceSchema(BaseModel):
    id: str
    name: str
    color: str
    category: str | None = None
    stale: bool = False
    last_success_at: datetime | None = None


class CalendarEventsResponse(BaseModel):
    events: list[CalendarEventSchema]
    sources: list[CalendarSourceSchema]
    hidden_event_count: int = 0
    meta: ProviderMeta


class CalendarSourcesResponse(BaseModel):
    sources: list[CalendarSourceSchema]
    meta: ProviderMeta
