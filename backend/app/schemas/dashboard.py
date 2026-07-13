from pydantic import BaseModel

from app.schemas.calendar import CalendarEventsResponse
from app.schemas.common import ProviderMeta
from app.schemas.weather import WeatherResponse


class DashboardResponse(BaseModel):
    weather: WeatherResponse
    calendar: CalendarEventsResponse
    meta: ProviderMeta
