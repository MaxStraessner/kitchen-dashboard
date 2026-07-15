from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.database.models import WeatherCache
from app.providers.weather.open_meteo import map_weather_payload
from app.schemas.weather import WeatherData
from app.services.weather import WeatherService


def weather_data(temperature: float = 18.4) -> WeatherData:
    return WeatherData(
        location="Unna",
        temperature=temperature,
        condition="Teilweise bewölkt",
        weather_code=2,
        icon="cloud-sun",
        is_day=True,
        wind_speed=11.2,
        precipitation_probability=25,
        high=22.1,
        low=12.3,
        observed_at=datetime(2026, 7, 13, 12, tzinfo=UTC),
    )


class FakeWeatherProvider:
    def __init__(self, result: WeatherData | Exception) -> None:
        self.result = result
        self.calls = 0

    async def fetch(self, **_: object) -> WeatherData:
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def test_weather_code_mapping_uses_german_label_and_night_icon() -> None:
    payload = {
        "current": {
            "time": "2026-07-13T23:00",
            "temperature_2m": 17.2,
            "weather_code": 2,
            "is_day": 0,
            "wind_speed_10m": 7.4,
        },
        "daily": {
            "time": ["2026-07-13", "2026-07-14"],
            "weather_code": [2, 61],
            "temperature_2m_max": [23.1, 19.4],
            "temperature_2m_min": [14.8, 12.2],
            "precipitation_probability_max": [35, 70],
        },
    }
    mapped = map_weather_payload(payload, "Unna", "Europe/Berlin")
    assert mapped.condition == "Teilweise bewölkt"
    assert mapped.icon == "cloud-moon"
    assert mapped.observed_at.utcoffset() is not None
    assert len(mapped.forecast) == 2
    assert mapped.forecast[1].date.isoformat() == "2026-07-14"
    assert mapped.forecast[1].condition == "Leichter Regen"


async def test_weather_cache_avoids_repeated_provider_call(session: AsyncSession) -> None:
    provider = FakeWeatherProvider(weather_data())
    service = WeatherService(Settings(database_url="sqlite+aiosqlite://"), provider)  # type: ignore[arg-type]
    first = await service.get_weather(session)
    second = await service.get_weather(session)
    assert first.data.temperature == second.data.temperature == 18.4
    assert provider.calls == 1


async def test_weather_failure_returns_last_success_as_stale(session: AsyncSession) -> None:
    settings = Settings(database_url="sqlite+aiosqlite://")
    success = WeatherService(settings, FakeWeatherProvider(weather_data(19.2)))  # type: ignore[arg-type]
    await success.get_weather(session)
    cached = await session.get(WeatherCache, 1)
    assert cached is not None
    cached.expires_at = datetime(2020, 1, 1, tzinfo=UTC)
    await session.commit()
    failing = WeatherService(settings, FakeWeatherProvider(RuntimeError("private detail")))  # type: ignore[arg-type]
    response = await failing.get_weather(session)
    assert response.data.temperature == 19.2
    assert response.meta.stale is True
    assert "private detail" not in (cached.last_error or "")


async def test_weather_failure_without_cache_returns_safe_placeholder(
    session: AsyncSession,
) -> None:
    service = WeatherService(
        Settings(database_url="sqlite+aiosqlite://"), FakeWeatherProvider(RuntimeError())
    )  # type: ignore[arg-type]
    response = await service.get_weather(session)
    assert response.meta.stale is True
    assert response.data.location == "Unna"
