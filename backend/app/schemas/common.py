from datetime import datetime

from pydantic import BaseModel


class ProviderMeta(BaseModel):
    updated_at: datetime
    stale: bool = False
    demo_mode: bool = False
