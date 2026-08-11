from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext, active_member, valid_csrf
from app.core.config import Settings, get_settings
from app.core.time import utc_now
from app.database.models import Photo, User
from app.database.session import get_session
from app.schemas.photos import PhotoGalleryResponse, PhotoListResponse, PhotoResponse
from app.services.authentication_service import add_audit
from app.services.photos import (
    PhotoUploadError,
    photo_path,
    process_photo,
    read_upload,
    remove_photo_files,
)

router = APIRouter(prefix="/photos", tags=["photos"])


def safe_original_name(value: str | None) -> str:
    normalized = (value or "Foto").replace("\\", "/")
    name = normalized.rsplit("/", 1)[-1].strip()
    return (name or "Foto")[:255]


def photo_response(photo: Photo, uploader_name: str, can_delete: bool) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        uploader_user_id=photo.uploader_user_id,
        uploader_display_name=uploader_name,
        original_name=photo.original_name,
        original_mime_type=photo.original_mime_type,
        mime_type=photo.mime_type,
        original_file_size=photo.original_file_size,
        file_size=photo.file_size,
        width=photo.width,
        height=photo.height,
        uploaded_at=photo.uploaded_at,
        image_url=f"/api/v1/photos/{photo.id}/image",
        thumbnail_url=f"/api/v1/photos/{photo.id}/thumbnail",
        can_delete=can_delete,
    )


async def household_photo(
    database: AsyncSession, household_id: str, photo_id: str
) -> tuple[Photo, str]:
    row = (
        await database.execute(
            select(Photo, User.display_name)
            .join(User, User.id == Photo.uploader_user_id)
            .where(Photo.id == photo_id, Photo.household_id == household_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto nicht gefunden.")
    return row[0], row[1]


@router.get("", response_model=PhotoListResponse)
async def list_photos(
    auth: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
) -> PhotoListResponse:
    query = (
        select(Photo, User.display_name)
        .join(User, User.id == Photo.uploader_user_id)
        .where(Photo.household_id == auth.household.id)
    )
    if auth.membership.role != "admin":
        query = query.where(Photo.uploader_user_id == auth.user.id)
    rows = (await database.execute(query.order_by(Photo.uploaded_at.desc(), Photo.id))).all()
    return PhotoListResponse(
        photos=[
            photo_response(
                photo,
                uploader_name,
                photo.uploader_user_id == auth.user.id or auth.membership.role == "admin",
            )
            for photo, uploader_name in rows
        ]
    )


@router.get("/gallery", response_model=PhotoGalleryResponse)
async def gallery_photos(
    auth: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
) -> PhotoGalleryResponse:
    rows = (
        await database.execute(
            select(Photo, User.display_name)
            .join(User, User.id == Photo.uploader_user_id)
            .where(Photo.household_id == auth.household.id)
            .order_by(Photo.uploaded_at.asc(), Photo.id.asc())
        )
    ).all()
    return PhotoGalleryResponse(
        photos=[
            photo_response(
                photo,
                uploader_name,
                photo.uploader_user_id == auth.user.id or auth.membership.role == "admin",
            )
            for photo, uploader_name in rows
        ]
    )


@router.post("", response_model=PhotoResponse, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> PhotoResponse:
    try:
        contents = await read_upload(file, settings.photo_max_upload_bytes)
        processed = await run_in_threadpool(process_photo, contents, settings)
    except PhotoUploadError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc

    photo = Photo(
        id=str(uuid4()),
        household_id=auth.household.id,
        uploader_user_id=auth.user.id,
        storage_name=processed.storage_name,
        thumbnail_storage_name=processed.thumbnail_storage_name,
        original_name=safe_original_name(file.filename),
        original_mime_type=processed.original_mime_type,
        mime_type=processed.mime_type,
        original_file_size=processed.original_file_size,
        file_size=processed.file_size,
        width=processed.width,
        height=processed.height,
        uploaded_at=utc_now(),
    )
    try:
        database.add(photo)
        add_audit(database, "photo_uploaded", auth.household.id, auth.user.id)
        await database.commit()
    except Exception as exc:
        await database.rollback()
        remove_photo_files(settings, processed.storage_name, processed.thumbnail_storage_name)
        raise HTTPException(500, "Das Foto konnte nicht gespeichert werden.") from exc
    return photo_response(photo, auth.user.display_name, True)


async def image_response(
    photo_id: str,
    thumbnail: bool,
    auth: AuthContext,
    database: AsyncSession,
    settings: Settings,
) -> FileResponse:
    photo, _ = await household_photo(database, auth.household.id, photo_id)
    storage_name = photo.thumbnail_storage_name if thumbnail else photo.storage_name
    path = photo_path(settings, storage_name)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bilddatei nicht gefunden.")
    return FileResponse(
        path,
        media_type=photo.mime_type,
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.get("/{photo_id}/image", response_class=FileResponse)
async def photo_image(
    photo_id: str,
    auth: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    return await image_response(photo_id, False, auth, database, settings)


@router.get("/{photo_id}/thumbnail", response_class=FileResponse)
async def photo_thumbnail(
    photo_id: str,
    auth: AuthContext = Depends(active_member),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    return await image_response(photo_id, True, auth, database, settings)


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    photo_id: str,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    photo, _ = await household_photo(database, auth.household.id, photo_id)
    if photo.uploader_user_id != auth.user.id and auth.membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Du darfst dieses Foto nicht löschen.")

    tombstones: list[tuple[Path, Path]] = []
    try:
        for storage_name in (photo.storage_name, photo.thumbnail_storage_name):
            path = photo_path(settings, storage_name)
            if path.is_file():
                tombstone = path.with_name(f".{path.name}.{uuid4().hex}.deleting")
                os.replace(path, tombstone)
                tombstones.append((path, tombstone))
    except OSError as exc:
        for path, tombstone in reversed(tombstones):
            if tombstone.exists():
                os.replace(tombstone, path)
        raise HTTPException(507, "Das Foto konnte nicht aus dem Speicher entfernt werden.") from exc

    try:
        await database.delete(photo)
        add_audit(database, "photo_deleted", auth.household.id, auth.user.id)
        await database.commit()
    except Exception as exc:
        await database.rollback()
        for path, tombstone in reversed(tombstones):
            if tombstone.exists():
                os.replace(tombstone, path)
        raise HTTPException(500, "Das Foto konnte nicht gelöscht werden.") from exc

    try:
        for _, tombstone in tombstones:
            tombstone.unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(
            500, "Das Foto wurde entfernt, die Speicherbereinigung ist fehlgeschlagen."
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
