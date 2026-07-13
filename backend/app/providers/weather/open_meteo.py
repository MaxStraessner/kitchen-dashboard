from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.schemas.weather import WeatherData

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

WEATHER_CODES: dict[int, tuple[str, str, str]] = {
    0: ("Klar", "sun", "moon"),
    1: ("Überwiegend klar", "sun", "moon"),
    2: ("Teilweise bewölkt", "cloud-sun", "cloud-moon"),
    3: ("Bedeckt", "cloud", "cloud"),
    45: ("Nebel", "cloud-fog", "cloud-fog"),
    48: ("Reifnebel", "cloud-fog", "cloud-fog"),
    51: ("Leichter Nieselregen", "cloud-drizzle", "cloud-drizzle"),
    53: ("Nieselregen", "cloud-drizzle", "cloud-drizzle"),
    55: ("Starker Nieselregen", "cloud-rain", "cloud-rain"),
    56: ("Gefrierender Nieselregen", "cloud-rain-wind", "cloud-rain-wind"),
    57: ("Starker gefrierender Nieselregen", "cloud-rain-wind", "cloud-rain-wind"),
    61: ("Leichter Regen", "cloud-rain", "cloud-rain"),
    63: ("Regen", "cloud-rain", "cloud-rain"),
    65: ("Starker Regen", "cloud-rain-wind", "cloud-rain-wind"),
    66: ("Gefrierender Regen", "cloud-hail", "cloud-hail"),
    67: ("Starker gefrierender Regen", "cloud-hail", "cloud-hail"),
    71: ("Leichter Schneefall", "cloud-snow", "cloud-snow"),
    73: ("Schneefall", "cloud-snow", "cloud-snow"),
    75: ("Starker Schneefall", "snowflake", "snowflake"),
    77: ("Schneegriesel", "snowflake", "snowflake"),
    80: ("Leichte Regenschauer", "cloud-sun-rain", "cloud-rain"),
    81: ("Regenschauer", "cloud-rain", "cloud-rain"),
    82: ("Starke Regenschauer", "cloud-rain-wind", "cloud-rain-wind"),
    85: ("Leichte Schneeschauer", "cloud-snow", "cloud-snow"),
    86: ("Starke Schneeschauer", "snowflake", "snowflake"),
    95: ("Gewitter", "cloud-lightning", "cloud-lightning"),
    96: ("Gewitter mit Hagel", "cloud-lightning", "cloud-lightning"),
    99: ("Starkes Gewitter mit Hagel", "cloud-lightning", "cloud-lightning"),
}


def map_weather_payload(payload: dict[str, Any], location: str, timezone: str) -> WeatherData:
    current = payload["current"]
    daily = payload["daily"]
    code = int(current["weather_code"])
    is_day = bool(current.get("is_day", 1))
    condition, day_icon, night_icon = WEATHER_CODES.get(code, ("Unbekannt", "cloud", "cloud"))
    observed_at = datetime.fromisoformat(str(current["time"]))
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=ZoneInfo(timezone))
    return WeatherData(
        location=location,
        temperature=round(float(current["temperature_2m"]), 1),
        condition=condition,
        weather_code=code,
        icon=day_icon if is_day else night_icon,
        is_day=is_day,
        wind_speed=round(float(current["wind_speed_10m"]), 1),
        precipitation_probability=int(daily["precipitation_probability_max"][0]),
        high=round(float(daily["temperature_2m_max"][0]), 1),
        low=round(float(daily["temperature_2m_min"][0]), 1),
        observed_at=observed_at,
    )


class OpenMeteoProvider:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def fetch(
        self, *, latitude: float, longitude: float, location: str, timezone: str
    ) -> WeatherData:
        params: dict[str, str | float | int] = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,weather_code,is_day,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": timezone,
            "forecast_days": 1,
        }
        if self._client is not None:
            response = await self._client.get(OPEN_METEO_URL, params=params)
        else:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        return map_weather_payload(response.json(), location, timezone)
