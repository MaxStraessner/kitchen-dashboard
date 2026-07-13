from __future__ import annotations

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.time import ensure_utc, utc_now
from app.database.models import WeatherCache
from app.providers.weather.open_meteo import OpenMeteoProvider
from app.schemas.common import ProviderMeta
from app.schemas.weather import WeatherData, WeatherResponse


class WeatherService:
    def __init__(self, settings: Settings, provider: OpenMeteoProvider | None = None) -> None:
        self.settings = settings
        self.provider = provider or OpenMeteoProvider()

    async def get_weather(self, session: AsyncSession) -> WeatherResponse:
        now = utc_now()
        cached = await session.get(WeatherCache, 1)
        if cached and ensure_utc(cached.expires_at) > now:
            return WeatherResponse(
                data=WeatherData.model_validate(cached.payload),
                meta=ProviderMeta(updated_at=cached.fetched_at, stale=False),
            )
        try:
            weather = await self.provider.fetch(
                latitude=self.settings.weather_latitude,
                longitude=self.settings.weather_longitude,
                location=self.settings.weather_location_name,
                timezone=self.settings.app_timezone,
            )
        except Exception:
            if cached:
                cached.last_error = "Weather provider temporarily unavailable"
                await session.commit()
                return WeatherResponse(
                    data=WeatherData.model_validate(cached.payload),
                    meta=ProviderMeta(updated_at=cached.fetched_at, stale=True),
                )
            fallback = WeatherData(
                location=self.settings.weather_location_name,
                temperature=0,
                condition="Daten nicht verfügbar",
                weather_code=-1,
                icon="cloud",
                is_day=True,
                wind_speed=0,
                precipitation_probability=0,
                high=0,
                low=0,
                observed_at=now,
            )
            return WeatherResponse(data=fallback, meta=ProviderMeta(updated_at=now, stale=True))

        payload = weather.model_dump(mode="json")
        if cached is None:
            cached = WeatherCache(
                id=1,
                location_name=self.settings.weather_location_name,
                payload=payload,
                fetched_at=now,
                expires_at=now + timedelta(seconds=self.settings.weather_cache_ttl_seconds),
            )
            session.add(cached)
        else:
            cached.location_name = self.settings.weather_location_name
            cached.payload = payload
            cached.fetched_at = now
            cached.expires_at = now + timedelta(seconds=self.settings.weather_cache_ttl_seconds)
            cached.last_error = None
        await session.commit()
        return WeatherResponse(data=weather, meta=ProviderMeta(updated_at=now))
