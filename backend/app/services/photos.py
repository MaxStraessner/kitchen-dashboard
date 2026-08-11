from __future__ import annotations

import os
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.core.config import Settings

register_heif_opener()
MAX_IMAGE_PIXELS = 50_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

SUPPORTED_IMAGE_FORMATS = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "HEIF": "image/heif",
    "HEIC": "image/heic",
}
SAFE_STORAGE_NAME = re.compile(r"^[0-9a-f]{32}(?:-thumb)?\.webp$")


class PhotoUploadError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class ProcessedPhoto:
    storage_name: str
    thumbnail_storage_name: str
    original_mime_type: str
    mime_type: str
    original_file_size: int
    file_size: int
    width: int
    height: int


async def read_upload(upload: UploadFile, maximum_bytes: int) -> bytes:
    contents = bytearray()
    try:
        while chunk := await upload.read(1024 * 1024):
            if len(contents) + len(chunk) > maximum_bytes:
                raise PhotoUploadError(
                    "Das Foto ist zu groß. Erlaubt sind maximal "
                    f"{maximum_bytes // (1024 * 1024)} MB.",
                    413,
                )
            contents.extend(chunk)
    finally:
        await upload.close()
    if not contents:
        raise PhotoUploadError("Die ausgewählte Datei ist leer.")
    return bytes(contents)


def media_directory(settings: Settings) -> Path:
    directory = settings.media_root.expanduser().resolve() / "photos"
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise PhotoUploadError("Der Fotospeicher ist derzeit nicht verfügbar.", 507) from exc
    if not directory.is_dir():
        raise PhotoUploadError("Der Fotospeicher ist derzeit nicht verfügbar.", 507)
    return directory


def photo_path(settings: Settings, storage_name: str) -> Path:
    if not SAFE_STORAGE_NAME.fullmatch(storage_name):
        raise ValueError("Invalid internal photo storage name")
    directory = media_directory(settings)
    path = (directory / storage_name).resolve()
    if path.parent != directory:
        raise ValueError("Invalid internal photo path")
    return path


def _web_image(image: Image.Image) -> Image.Image:
    if "A" in image.getbands() or "transparency" in image.info:
        return image.convert("RGBA")
    return image.convert("RGB")


def process_photo(data: bytes, settings: Settings) -> ProcessedPhoto:
    try:
        with Image.open(BytesIO(data)) as opened:
            actual_format = (opened.format or "").upper()
            if actual_format not in SUPPORTED_IMAGE_FORMATS:
                raise PhotoUploadError(
                    "Dieses Bildformat wird nicht unterstützt. Erlaubt sind "
                    "JPEG, PNG, WebP, HEIC und HEIF.",
                    415,
                )
            if opened.width * opened.height > MAX_IMAGE_PIXELS:
                raise PhotoUploadError(
                    "Die Bildauflösung ist zu groß. Erlaubt sind maximal 50 Megapixel.",
                    413,
                )
            opened.seek(0)
            opened.load()
            normalized = _web_image(ImageOps.exif_transpose(opened))
    except PhotoUploadError:
        raise
    except (
        Image.DecompressionBombError,
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
    ) as exc:
        raise PhotoUploadError("Die Datei ist kein gültiges oder lesbares Bild.", 415) from exc

    normalized.thumbnail(
        (settings.photo_max_dimension, settings.photo_max_dimension), Image.Resampling.LANCZOS
    )
    thumbnail = normalized.copy()
    thumbnail.thumbnail(
        (settings.photo_thumbnail_max_dimension, settings.photo_thumbnail_max_dimension),
        Image.Resampling.LANCZOS,
    )

    token = uuid4().hex
    storage_name = f"{token}.webp"
    thumbnail_storage_name = f"{token}-thumb.webp"
    display_path = photo_path(settings, storage_name)
    thumbnail_path = photo_path(settings, thumbnail_storage_name)
    display_temp = display_path.with_name(f".{token}.tmp")
    thumbnail_temp = thumbnail_path.with_name(f".{token}-thumb.tmp")
    try:
        normalized.save(
            display_temp,
            format="WEBP",
            quality=settings.photo_webp_quality,
            method=6,
        )
        thumbnail.save(
            thumbnail_temp,
            format="WEBP",
            quality=settings.photo_webp_quality,
            method=6,
        )
        file_size = display_temp.stat().st_size
        os.replace(display_temp, display_path)
        os.replace(thumbnail_temp, thumbnail_path)
    except OSError as exc:
        display_temp.unlink(missing_ok=True)
        thumbnail_temp.unlink(missing_ok=True)
        display_path.unlink(missing_ok=True)
        thumbnail_path.unlink(missing_ok=True)
        raise PhotoUploadError("Das Foto konnte nicht gespeichert werden.", 507) from exc

    return ProcessedPhoto(
        storage_name=storage_name,
        thumbnail_storage_name=thumbnail_storage_name,
        original_mime_type=SUPPORTED_IMAGE_FORMATS[actual_format],
        mime_type="image/webp",
        original_file_size=len(data),
        file_size=file_size,
        width=normalized.width,
        height=normalized.height,
    )


def remove_photo_files(settings: Settings, *storage_names: str) -> None:
    for storage_name in storage_names:
        photo_path(settings, storage_name).unlink(missing_ok=True)
