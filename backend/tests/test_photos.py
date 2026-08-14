from io import BytesIO
from pathlib import Path

import pytest
from httpx import AsyncClient
from PIL import Image
from pillow_heif import from_pillow
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from test_authentication import SETUP, csrf, setup

from app.core.config import Settings, get_settings
from app.database.models import Photo, User
from app.main import app


def jpeg_photo(size: tuple[int, int] = (1200, 600), orientation: int | None = None) -> bytes:
    output = BytesIO()
    image = Image.new("RGB", size, (49, 111, 173))
    exif = Image.Exif()
    if orientation is not None:
        exif[274] = orientation
    image.save(output, format="JPEG", quality=95, exif=exif)
    return output.getvalue()


def photo_settings(media_root: Path, maximum_bytes: int = 2 * 1024 * 1024) -> Settings:
    return Settings(
        app_env="test",
        media_root=media_root,
        photo_max_upload_bytes=maximum_bytes,
        photo_max_dimension=640,
        photo_thumbnail_max_dimension=160,
        photo_webp_quality=88,
    )


def heif_photo() -> bytes:
    output = BytesIO()
    from_pillow(Image.new("RGB", (320, 180), (173, 91, 49))).save(output, quality=90)
    return output.getvalue()


async def upload(
    client: AsyncClient,
    token: str,
    data: bytes,
    name: str = "iphone.JPG",
    content_type: str | None = "application/octet-stream",
):
    return await client.post(
        "/api/v1/photos",
        headers={"X-CSRF-Token": token},
        files={"file": (name, data, content_type)},
    )


async def test_photo_upload_processes_metadata_lists_serves_and_deletes(
    client: AsyncClient, session: AsyncSession, tmp_path: Path
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)
    token = await csrf(client)
    original = jpeg_photo(orientation=6)

    response = await upload(client, token, original, "../Urlaub.JPG")
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["originalName"] == "Urlaub.JPG"
    assert payload["originalMimeType"] == "image/jpeg"
    assert payload["mimeType"] == "image/webp"
    assert payload["originalFileSize"] == len(original)
    assert payload["fileSize"] > 0
    assert (payload["width"], payload["height"]) == (320, 640)
    assert "storage" not in response.text.lower()

    files = sorted((tmp_path / "photos").glob("*.webp"))
    assert len(files) == 2
    for path in files:
        with Image.open(path) as image:
            assert image.format == "WEBP"
            assert not image.getexif()

    listed = await client.get("/api/v1/photos")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["photos"]] == [payload["id"]]
    gallery = await client.get("/api/v1/photos/gallery")
    assert gallery.status_code == 200
    assert gallery.json()["photos"][0]["uploaderDisplayName"] == "Max"

    image = await client.get(payload["imageUrl"])
    thumbnail = await client.get(payload["thumbnailUrl"])
    assert image.status_code == thumbnail.status_code == 200
    assert image.headers["content-type"] == "image/webp"
    assert image.headers["cache-control"] == "private, max-age=31536000, immutable"
    with Image.open(BytesIO(thumbnail.content)) as preview:
        assert max(preview.size) == 160

    deleted = await client.delete(
        f"/api/v1/photos/{payload['id']}", headers={"X-CSRF-Token": token}
    )
    assert deleted.status_code == 204
    assert await session.get(Photo, payload["id"]) is None
    assert list((tmp_path / "photos").iterdir()) == []
    assert (await client.get(payload["imageUrl"])).status_code == 404


async def test_photo_upload_requires_auth_and_rejects_invalid_or_large_files(
    client: AsyncClient, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    settings = photo_settings(tmp_path, maximum_bytes=1024)
    app.dependency_overrides[get_settings] = lambda: settings
    unauthenticated = await client.post(
        "/api/v1/photos", files={"file": ("photo.jpg", jpeg_photo((20, 20)), "image/jpeg")}
    )
    assert unauthenticated.status_code == 401

    await setup(client)
    token = await csrf(client)
    invalid = await upload(client, token, b"this is not an image", "fake.jpg")
    assert invalid.status_code == 400
    assert (
        invalid.json()["detail"]
        == "Die ausgewählte Datei konnte nicht als gültiges Bild gelesen werden."
    )
    assert "photo_upload_failed" in caplog.text
    assert "exception_class=UnidentifiedImageError" in caplog.text

    damaged = await upload(client, token, jpeg_photo()[:10], "damaged.jpeg", "image/jpeg")
    assert damaged.status_code == 400
    assert (
        damaged.json()["detail"]
        == "Die ausgewählte Datei konnte nicht als gültiges Bild gelesen werden."
    )

    too_large = await upload(client, token, b"x" * 1025, "large.jpg")
    assert too_large.status_code == 413
    assert "zu groß" in too_large.json()["detail"]
    assert not (tmp_path / "photos").exists()


@pytest.mark.parametrize(
    ("name", "content_type"),
    [
        ("IMG_7457.jpg", "image/jpeg"),
        ("IMG_7457.jpeg", "image/jpeg"),
        ("IMG_7457.JPG", "image/jpeg"),
        ("IMG_7457.JPEG", "image/jpeg"),
        ("IMG_7457.jpeg", ""),
        ("IMG_7457.jpeg", "text/plain"),
    ],
    ids=["jpg", "jpeg", "JPG", "JPEG", "empty-mime", "incorrect-mime"],
)
async def test_valid_jpeg_is_accepted_from_its_decoded_contents(
    client: AsyncClient, tmp_path: Path, name: str, content_type: str
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)
    data = jpeg_photo((1536, 2048))

    assert data[:3] == b"\xff\xd8\xff"
    response = await upload(client, await csrf(client), data, name, content_type)

    assert response.status_code == 201, response.text
    assert response.json()["originalMimeType"] == "image/jpeg"


async def test_photo_upload_accepts_valid_origin_and_csrf_token(
    client: AsyncClient, tmp_path: Path
) -> None:
    settings = Settings(
        app_env="test",
        media_root=tmp_path,
        photo_max_upload_bytes=2 * 1024 * 1024,
        photo_max_dimension=640,
        photo_thumbnail_max_dimension=160,
        photo_webp_quality=88,
        auth_allowed_origins="http://dashboard.test/",
    )
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)

    response = await client.post(
        "/api/v1/photos",
        headers={
            "X-CSRF-Token": await csrf(client),
            "Origin": "http://dashboard.test/",
        },
        files={"file": ("IMG_7457.jpeg", jpeg_photo((1536, 2048)), "image/jpeg")},
    )

    assert response.status_code == 201, response.text
    assert response.json()["originalMimeType"] == "image/jpeg"


async def test_photo_upload_rejects_unsupported_decoded_image_format(
    client: AsyncClient, tmp_path: Path
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)
    output = BytesIO()
    Image.new("RGB", (80, 50), (22, 143, 91)).save(output, format="GIF")

    response = await upload(
        client, await csrf(client), output.getvalue(), "iphone-photo", "application/octet-stream"
    )

    assert response.status_code == 415
    assert "Bildformat" in response.json()["detail"]


@pytest.mark.parametrize(
    ("name", "content_type", "data", "original_mime"),
    [
        ("family.jpg", "image/jpeg", jpeg_photo(), "image/jpeg"),
        ("family.png", "image/png", None, "image/png"),
        ("family.webp", "image/webp", None, "image/webp"),
    ],
    ids=["jpeg", "png", "webp"],
)
async def test_supported_photo_formats_are_converted_to_browser_compatible_webp(
    client: AsyncClient,
    tmp_path: Path,
    name: str,
    content_type: str,
    data: bytes | None,
    original_mime: str,
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)
    if data is None:
        if name.endswith(".png"):
            output = BytesIO()
            Image.new("RGBA", (80, 50), (22, 143, 91, 220)).save(output, format="PNG")
            data = output.getvalue()
        elif name.endswith(".webp"):
            output = BytesIO()
            Image.new("RGB", (80, 50), (22, 91, 143)).save(output, format="WEBP")
            data = output.getvalue()
        else:
            data = heif_photo()

    response = await upload(client, await csrf(client), data, name, content_type)
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["originalMimeType"] == original_mime
    assert payload["mimeType"] == "image/webp"
    served = await client.get(payload["imageUrl"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"
    with Image.open(BytesIO(served.content)) as converted:
        assert converted.format == "WEBP"


async def test_photo_upload_uses_decoded_contents_instead_of_client_metadata(
    client: AsyncClient, tmp_path: Path
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)
    token = await csrf(client)
    response = await upload(
        client, token, jpeg_photo(), "IMG_0042.unknown", "text/plain; charset=binary"
    )
    assert response.status_code == 201, response.text
    assert response.json()["originalMimeType"] == "image/jpeg"


@pytest.mark.parametrize(
    ("name", "content_type"),
    [("IMG_0042.HEIC", "image/heic"), ("IMG_0042.HEIF", "image/heif")],
)
async def test_heic_upload_is_converted_to_browser_compatible_webp(
    client: AsyncClient, tmp_path: Path, name: str, content_type: str
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)
    response = await upload(client, await csrf(client), heif_photo(), name, content_type)
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["originalMimeType"] in {"image/heic", "image/heif"}
    assert payload["mimeType"] == "image/webp"
    image = await client.get(payload["imageUrl"])
    assert image.status_code == 200
    with Image.open(BytesIO(image.content)) as converted:
        assert converted.format == "WEBP"
        assert converted.size == (320, 180)


async def test_heic_upload_accepts_generic_iphone_metadata(
    client: AsyncClient, tmp_path: Path
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)

    response = await upload(
        client,
        await csrf(client),
        heif_photo(),
        "IMG_0042.unknown",
        "application/octet-stream",
    )

    assert response.status_code == 201, response.text
    assert response.json()["originalMimeType"] in {"image/heic", "image/heif"}


async def test_members_see_and_delete_only_own_photos_while_admins_can_manage_all(
    client: AsyncClient, session: AsyncSession, tmp_path: Path
) -> None:
    settings = photo_settings(tmp_path)
    app.dependency_overrides[get_settings] = lambda: settings
    await setup(client)
    admin_csrf = await csrf(client)
    admin_photo = (await upload(client, admin_csrf, jpeg_photo((300, 200)), "admin.jpg")).json()

    temporary_password = "Jessicas vorläufiges Passwort"
    member_response = await client.post(
        "/api/v1/admin/users",
        headers={"X-CSRF-Token": admin_csrf},
        json={
            "displayName": "Jessica",
            "username": "Jessica",
            "role": "member",
            "isActive": True,
            "password": temporary_password,
            "passwordConfirmation": temporary_password,
        },
    )
    assert member_response.status_code == 201
    member = await session.get(User, member_response.json()["id"])
    assert member is not None
    member.must_change_password = False
    await session.commit()

    await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": admin_csrf})
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "Jessica", "password": temporary_password, "rememberMe": False},
    )
    assert login.status_code == 200
    member_csrf = await csrf(client)

    assert (await client.get("/api/v1/photos")).json() == {"photos": []}
    shared = await client.get("/api/v1/photos/gallery")
    assert [photo["id"] for photo in shared.json()["photos"]] == [admin_photo["id"]]
    forbidden = await client.delete(
        f"/api/v1/photos/{admin_photo['id']}", headers={"X-CSRF-Token": member_csrf}
    )
    assert forbidden.status_code == 403

    member_photo = (await upload(client, member_csrf, jpeg_photo((240, 240)), "jessica.png")).json()
    own = (await client.get("/api/v1/photos")).json()["photos"]
    assert [photo["id"] for photo in own] == [member_photo["id"]]
    member_gallery = (await client.get("/api/v1/photos/gallery")).json()["photos"]
    assert [photo["id"] for photo in member_gallery] == [admin_photo["id"], member_photo["id"]]
    assert member_gallery[0]["canDelete"] is False
    assert member_gallery[1]["canDelete"] is True
    assert (
        await client.delete(
            f"/api/v1/photos/{member_photo['id']}", headers={"X-CSRF-Token": member_csrf}
        )
    ).status_code == 204

    await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": member_csrf})
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={
                "username": SETUP["username"],
                "password": SETUP["password"],
                "rememberMe": False,
            },
        )
    ).status_code == 200
    admin_csrf = await csrf(client)
    admin_list = (await client.get("/api/v1/photos")).json()["photos"]
    assert [photo["id"] for photo in admin_list] == [admin_photo["id"]]
    assert (
        await client.delete(
            f"/api/v1/photos/{admin_photo['id']}", headers={"X-CSRF-Token": admin_csrf}
        )
    ).status_code == 204
    assert (await session.scalars(select(Photo))).all() == []
