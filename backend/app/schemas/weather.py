from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ProviderMeta


class WeatherData(BaseModel):
    location: str
    temperature: float
    condition: str
    weather_code: int
    icon: str
    is_day: bool
    wind_speed: float
    precipitation_probability: int
    high: float
    low: float
    observed_at: datetime


class WeatherResponse(BaseModel):
    data: WeatherData
    meta: ProviderMeta
