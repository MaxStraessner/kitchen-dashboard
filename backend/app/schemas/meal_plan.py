from datetime import datetime

from app.schemas.auth import ApiModel


class MealPlanResponse(ApiModel):
    id: str
    original_name: str
    width: int
    height: int
    uploaded_at: datetime
    image_url: str
    thumbnail_url: str


class CurrentMealPlanResponse(ApiModel):
    plan: MealPlanResponse | None
