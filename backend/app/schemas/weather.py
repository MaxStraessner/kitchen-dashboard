from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ProviderMeta


class WeatherForecastDay(BaseModel):
    date: date
    condition: str
    weather_code: int
    icon: str
    precipitation_probability: int
    high: float
    low: float


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
    forecast: list[WeatherForecastDay] = Field(default_factory=list)


class WeatherResponse(BaseModel):
    data: WeatherData
    meta: ProviderMeta
