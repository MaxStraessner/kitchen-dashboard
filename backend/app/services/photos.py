from app.core.config import Settings
from app.services.images import (
    MAX_IMAGE_PIXELS as MAX_IMAGE_PIXELS,
)
from app.services.images import (
    SUPPORTED_IMAGE_FORMATS as SUPPORTED_IMAGE_FORMATS,
)
from app.services.images import (
    PhotoUploadError as PhotoUploadError,
)
from app.services.images import (
    ProcessedPhoto as ProcessedPhoto,
)
from app.services.images import (
    media_directory as media_directory,
)
from app.services.images import (
    photo_path as photo_path,
)
from app.services.images import (
    process_image,
    remove_image_files,
)
from app.services.images import (
    read_upload as read_upload,
)


def process_photo(data: bytes, settings: Settings) -> ProcessedPhoto:
    return process_image(data, settings)


def remove_photo_files(settings: Settings, *storage_names: str) -> None:
    remove_image_files(settings, *storage_names)
