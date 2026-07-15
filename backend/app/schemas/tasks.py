from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.auth import ApiModel


class TaskResponse(ApiModel):
    id: str
    title: str
    completed: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    sort_order: int


class TaskListResponse(ApiModel):
    tasks: list[TaskResponse]


class TaskCreate(ApiModel):
    title: str = Field(min_length=1, max_length=240)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Der Aufgabentitel darf nicht leer sein.")
        return value


class TaskUpdate(ApiModel):
    completed: bool
