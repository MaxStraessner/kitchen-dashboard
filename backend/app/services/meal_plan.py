from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.time import ensure_utc
from app.database.models import Household, MealPlan
from app.schemas.meal_plan import MealPlanResponse
from app.services.images import ProcessedPhoto, process_image, remove_image_files

logger = logging.getLogger(__name__)


def process_meal_plan(data: bytes, settings: Settings) -> ProcessedPhoto:
    return process_image(
        data,
        settings,
        collection="meal-plans",
        allowed_formats=frozenset({"JPEG", "PNG", "WEBP"}),
        lossless=True,
    )


def cleanup_files(settings: Settings, *names: str) -> None:
    try:
        remove_image_files(settings, *names, collection="meal-plans")
    except OSError:
        # The committed plan remains valid even when an obsolete file cannot be removed.
        logger.exception("Meal plan file cleanup failed")


async def current_plan(database: AsyncSession, household_id: str) -> MealPlan | None:
    return (
        await database.scalars(select(MealPlan).where(MealPlan.household_id == household_id))
    ).first()


async def lock_household(database: AsyncSession, household_id: str) -> None:
    # Lock the always-existing parent: also serializes the first concurrent upload.
    await database.execute(
        select(Household.id).where(Household.id == household_id).with_for_update()
    )


def plan_response(plan: MealPlan) -> MealPlanResponse:
    return MealPlanResponse(
        id=plan.id,
        original_name=plan.original_name,
        width=plan.width,
        height=plan.height,
        uploaded_at=ensure_utc(plan.uploaded_at),
        image_url=f"/api/v1/meal-plan/{plan.id}/image",
        thumbnail_url=f"/api/v1/meal-plan/{plan.id}/thumbnail",
    )
