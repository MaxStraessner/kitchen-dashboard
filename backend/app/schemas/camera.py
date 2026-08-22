from datetime import datetime
from typing import Literal

from app.schemas.auth import ApiModel


class CameraModeStatus(ApiModel):
    active: bool
    expires_at: datetime | None
    stream_url: str
    revision: int


class CameraModeEvent(CameraModeStatus):
    type: Literal["camera_mode_changed"] = "camera_mode_changed"
