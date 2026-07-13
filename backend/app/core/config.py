from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class CalendarSourceConfig(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,63}$")
    name: str = Field(min_length=1, max_length=80)
    url: HttpUrl
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    enabled: bool = True
    show_location: bool = Field(default=True, alias="showLocation")
    priority: int = Field(default=100, ge=0, le=1000)
    category: str | None = Field(default=None, max_length=50)

    model_config = {"populate_by_name": True, "extra": "forbid"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_timezone: str = "Europe/Berlin"
    api_prefix: str = "/api/v1"
    database_url: str = (
        "postgresql+asyncpg://kitchen_dashboard:change-me@localhost:5432/kitchen_dashboard"
    )
    weather_location_name: str = "Unna"
    weather_latitude: float = 51.537
    weather_longitude: float = 7.689
    weather_cache_ttl_seconds: int = Field(default=900, ge=600, le=1800)
    calendar_cache_ttl_seconds: int = Field(default=900, ge=300, le=3600)
    calendar_sources_json: str = "[]"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @field_validator("calendar_sources_json")
    @classmethod
    def validate_calendar_sources(cls, value: str) -> str:
        raw: Any = json.loads(value)
        if not isinstance(raw, list):
            raise ValueError("CALENDAR_SOURCES_JSON must contain a JSON array")
        for item in raw:
            CalendarSourceConfig.model_validate(item)
        return value

    @property
    def calendar_sources(self) -> list[CalendarSourceConfig]:
        raw: list[dict[str, Any]] = json.loads(self.calendar_sources_json)
        return [
            CalendarSourceConfig.model_validate(item) for item in raw if item.get("enabled", True)
        ]

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
