from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

BringState = Literal[
    "ok",
    "disabled",
    "configuration_missing",
    "authentication_failed",
    "rate_limited",
    "unavailable",
]


class BringItem(BaseModel):
    id: str
    name: str
    specification: str = ""
    position: int = Field(ge=0)


class BringItemsResponse(BaseModel):
    items: list[BringItem]
    configured: bool
    available: bool
    stale: bool
    status: BringState
    last_successful_sync_at: datetime | None = None
    revision: int = 0


class BringStatusResponse(BaseModel):
    configured: bool
    available: bool
    stale: bool
    status: BringState
    last_successful_sync_at: datetime | None = None


class BringItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    specification: str = Field(default="", max_length=160)
    client_mutation_id: str = Field(min_length=8, max_length=64)

    @field_validator("name")
    @classmethod
    def non_empty_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Artikelname ist erforderlich.")
        return value

    @field_validator("specification")
    @classmethod
    def trim_specification(cls, value: str) -> str:
        return value.strip()


class BringCompleteRequest(BaseModel):
    client_mutation_id: str = Field(min_length=8, max_length=64)


def validate_item_uuid(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ValueError("Ungültige Artikel-ID.") from exc
