from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ComponentHealth(BaseModel):
    status: Literal["healthy", "degraded", "unavailable"]


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    checked_at: datetime
    components: dict[str, ComponentHealth]
