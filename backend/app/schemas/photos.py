from datetime import datetime

from app.schemas.auth import ApiModel


class PhotoResponse(ApiModel):
    id: str
    uploader_user_id: str
    uploader_display_name: str
    original_name: str
    original_mime_type: str
    mime_type: str
    original_file_size: int
    file_size: int
    width: int
    height: int
    uploaded_at: datetime
    image_url: str
    thumbnail_url: str
    can_delete: bool


class PhotoListResponse(ApiModel):
    photos: list[PhotoResponse]


class PhotoGalleryResponse(ApiModel):
    photos: list[PhotoResponse]
