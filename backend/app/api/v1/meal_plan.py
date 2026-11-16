from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext, active_member, valid_csrf
from app.core.config import Settings, get_settings
from app.core.time import utc_now
from app.database.models import MealPlan
from app.database.session import get_session
from app.schemas.meal_plan import CurrentMealPlanResponse
from app.services.authentication_service import add_audit
from app.services.images import PhotoUploadError, photo_path, read_upload
from app.services.meal_plan import (
    cleanup_files,
    current_plan,
    lock_household,
    plan_response,
    process_meal_plan,
)

router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])
logger = logging.getLogger(__name__)


async def meal_plan_writer(
    auth: AuthContext = Depends(active_member),
    _: AuthContext = Depends(valid_csrf),
) -> AuthContext:
    return auth


@router.get("", response_model=CurrentMealPlanResponse)
async def get_plan(
    response: Response,
    auth: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
) -> CurrentMealPlanResponse:
    response.headers["Cache-Control"] = "no-store"
    plan = await current_plan(database, auth.household.id)
    return CurrentMealPlanResponse(plan=plan_response(plan) if plan else None)


@router.put("", response_model=CurrentMealPlanResponse)
async def replace_plan(
    response: Response,
    file: UploadFile = File(...),
    auth: AuthContext = Depends(meal_plan_writer),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CurrentMealPlanResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        data = await read_upload(file, settings.photo_max_upload_bytes)
        processed = await run_in_threadpool(process_meal_plan, data, settings)
    except PhotoUploadError as exc:
        raise HTTPException(exc.status_code, exc.message.replace("Foto", "Bild")) from exc
    except Exception as exc:
        logger.exception("Meal plan decoding failed")
        raise HTTPException(500, "Der Essensplan konnte nicht verarbeitet werden.") from exc

    obsolete: tuple[str, ...] = ()
    try:
        await lock_household(database, auth.household.id)
        old = await current_plan(database, auth.household.id)
        if old:
            obsolete = (old.storage_name, old.thumbnail_storage_name)
            await database.delete(old)
            await database.flush()
        original_name = (
            (file.filename or "Essensplan").replace("\\", "/").rsplit("/", 1)[-1].strip()
        )
        plan = MealPlan(
            id=str(uuid4()),
            household_id=auth.household.id,
            uploader_user_id=auth.user.id,
            storage_name=processed.storage_name,
            thumbnail_storage_name=processed.thumbnail_storage_name,
            original_name=(original_name or "Essensplan")[:255],
            original_mime_type=processed.original_mime_type,
            original_file_size=processed.original_file_size,
            file_size=processed.file_size,
            width=processed.width,
            height=processed.height,
            uploaded_at=utc_now(),
        )
        database.add(plan)
        add_audit(database, "meal_plan_replaced", auth.household.id, auth.user.id)
        payload = CurrentMealPlanResponse(plan=plan_response(plan))
        await database.commit()
    except Exception as exc:
        await database.rollback()
        cleanup_files(settings, processed.storage_name, processed.thumbnail_storage_name)
        logger.exception("Meal plan storage failed")
        raise HTTPException(500, "Der Essensplan konnte nicht gespeichert werden.") from exc
    cleanup_files(settings, *obsolete)
    return payload


@router.delete("", status_code=204)
async def delete_plan(
    auth: AuthContext = Depends(meal_plan_writer),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    obsolete: tuple[str, ...] = ()
    try:
        await lock_household(database, auth.household.id)
        plan = await current_plan(database, auth.household.id)
        if plan:
            obsolete = (plan.storage_name, plan.thumbnail_storage_name)
            await database.delete(plan)
            add_audit(database, "meal_plan_deleted", auth.household.id, auth.user.id)
        await database.commit()
    except Exception as exc:
        await database.rollback()
        raise HTTPException(500, "Der Essensplan konnte nicht gelöscht werden.") from exc
    cleanup_files(settings, *obsolete)
    return Response(status_code=204)


async def serve_image(
    plan_id: str, thumbnail: bool, auth: AuthContext, database: AsyncSession, settings: Settings
) -> FileResponse:
    plan = await database.scalar(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.household_id == auth.household.id)
    )
    if plan is None:
        raise HTTPException(404, "Essensplan nicht gefunden.")
    path = photo_path(
        settings, plan.thumbnail_storage_name if thumbnail else plan.storage_name, "meal-plans"
    )
    if not path.is_file():
        raise HTTPException(404, "Bilddatei nicht gefunden.")
    return FileResponse(
        path,
        media_type="image/webp",
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{plan_id}/image", response_class=FileResponse)
async def image(
    plan_id: str,
    auth: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    return await serve_image(plan_id, False, auth, database, settings)


@router.get("/{plan_id}/thumbnail", response_class=FileResponse)
async def thumbnail(
    plan_id: str,
    auth: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    return await serve_image(plan_id, True, auth, database, settings)
