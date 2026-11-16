import struct
import zlib
from io import BytesIO
from pathlib import Path

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from test_authentication import csrf, setup

from app.core.config import Settings, get_settings
from app.database.models import Household, HouseholdMembership, MealPlan, User
from app.main import app


def image_bytes(format: str = "PNG", orientation: int | None = None) -> bytes:
    output = BytesIO()
    image = Image.new("RGBA" if format in {"PNG", "WEBP"} else "RGB", (320, 180), (40, 100, 170))
    exif = Image.Exif()
    if orientation:
        exif[274] = orientation
    image.save(output, format=format, exif=exif)
    return output.getvalue()


@pytest.fixture
def media_settings(tmp_path: Path) -> Settings:
    settings = Settings(
        app_env="test",
        media_root=tmp_path,
        photo_max_dimension=640,
        photo_thumbnail_max_dimension=160,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    return settings


async def put(client: AsyncClient, token: str, data: bytes | None = None):
    return await client.put(
        "/api/v1/meal-plan",
        headers={"X-CSRF-Token": token},
        files={"file": ("../plan.png", image_bytes() if data is None else data, "image/png")},
    )


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP"])
async def test_upload_formats_persist_and_are_separate_from_photos(
    client: AsyncClient,
    session: AsyncSession,
    media_settings: Settings,
    format: str,
) -> None:
    await setup(client)
    response = await put(client, await csrf(client), image_bytes(format))
    assert response.status_code == 200, response.text
    plan = response.json()["plan"]
    assert plan["originalName"] == "plan.png"
    assert "storage" not in response.text
    assert (await client.get("/api/v1/meal-plan")).json()["plan"] == plan
    assert (await client.get("/api/v1/meal-plan")).headers["cache-control"] == "no-store"
    await session.close()  # new transaction still finds durable metadata
    assert await session.scalar(select(func.count(MealPlan.id))) == 1
    assert (await client.get("/api/v1/photos/gallery")).json()["photos"] == []
    for key in ["imageUrl", "thumbnailUrl"]:
        image = await client.get(plan[key])
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/webp"
        assert image.headers["cache-control"].startswith("private")
        with Image.open(BytesIO(image.content)) as decoded:
            assert not decoded.getexif()
            assert max(decoded.size) <= (160 if key == "thumbnailUrl" else 640)
    assert len(list((media_settings.media_root / "meal-plans").glob("*.webp"))) == 2


async def test_replace_delete_and_invalid_replace_preserve_current(
    client: AsyncClient,
    session: AsyncSession,
    media_settings: Settings,
) -> None:
    await setup(client)
    token = await csrf(client)
    first = (await put(client, token)).json()["plan"]
    assert (await put(client, token, b"not a real png")).status_code == 400
    assert (await client.get("/api/v1/meal-plan")).json()["plan"]["id"] == first["id"]
    replacement = await put(client, token, image_bytes("JPEG", orientation=6))
    assert replacement.status_code == 200, replacement.text
    second = replacement.json()["plan"]
    assert second["id"] != first["id"]
    assert (second["width"], second["height"]) == (180, 320)
    assert await session.scalar(select(func.count(MealPlan.id))) == 1
    assert len(list((media_settings.media_root / "meal-plans").glob("*.webp"))) == 2
    assert (await client.get(first["imageUrl"])).status_code == 404
    assert (
        await client.delete("/api/v1/meal-plan", headers={"X-CSRF-Token": token})
    ).status_code == 204
    assert (await client.get("/api/v1/meal-plan")).json() == {"plan": None}
    assert (await client.get(second["imageUrl"])).status_code == 404
    assert not list((media_settings.media_root / "meal-plans").iterdir())
    assert (
        await client.delete("/api/v1/meal-plan", headers={"X-CSRF-Token": token})
    ).status_code == 204


async def test_auth_csrf_origin_password_change_and_household_isolation(
    client: AsyncClient,
    session: AsyncSession,
    media_settings: Settings,
) -> None:
    assert (await client.get("/api/v1/meal-plan")).status_code == 401
    assert (await put(client, "bad")).status_code == 401
    await setup(client)
    token = await csrf(client)
    assert (await put(client, "bad")).status_code == 403
    assert (await client.delete("/api/v1/meal-plan")).status_code == 403
    assert (
        await client.put(
            "/api/v1/meal-plan",
            headers={"X-CSRF-Token": token, "Origin": "https://foreign.invalid"},
            files={"file": ("a.png", image_bytes(), "image/png")},
        )
    ).status_code == 403
    plan = (await put(client, token)).json()["plan"]
    user = (await session.scalars(select(User))).one()
    user.must_change_password = True
    await session.commit()
    assert (await client.get(plan["imageUrl"])).status_code == 403
    assert (await put(client, token)).status_code == 403
    assert (
        await client.delete("/api/v1/meal-plan", headers={"X-CSRF-Token": token})
    ).status_code == 403
    user.must_change_password = False
    from app.core.time import utc_now

    other = Household(id="other", name="Other", created_at=utc_now(), updated_at=utc_now())
    session.add(other)
    await session.flush()
    membership = (await session.scalars(select(HouseholdMembership))).one()
    membership.household_id = other.id
    await session.commit()
    assert (await client.get("/api/v1/meal-plan")).json() == {"plan": None}
    assert (await client.get(plan["imageUrl"])).status_code == 404
    assert (await client.get(plan["thumbnailUrl"])).status_code == 404


async def test_member_can_replace_and_delete_another_members_plan(
    client: AsyncClient,
    session: AsyncSession,
    media_settings: Settings,
) -> None:
    await setup(client)
    token = await csrf(client)
    await put(client, token)
    response = await client.post(
        "/api/v1/admin/users",
        headers={"X-CSRF-Token": token},
        json={
            "displayName": "Jessica",
            "username": "jessica",
            "role": "member",
            "isActive": True,
            "password": "eine weitere lange Passphrase",
            "passwordConfirmation": "eine weitere lange Passphrase",
        },
    )
    assert response.status_code == 201, response.text
    member = await session.get(User, response.json()["id"])
    member.must_change_password = False
    await session.commit()
    await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": token})
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={
                "username": "jessica",
                "password": "eine weitere lange Passphrase",
                "rememberMe": False,
            },
        )
    ).status_code == 200
    member_token = await csrf(client)
    assert (await put(client, member_token)).status_code == 200
    assert (
        await client.delete("/api/v1/meal-plan", headers={"X-CSRF-Token": member_token})
    ).status_code == 204


async def test_limits_corrupt_unsupported_and_decoded_dimensions(
    client: AsyncClient,
    media_settings: Settings,
) -> None:
    await setup(client)
    token = await csrf(client)
    for data, expected in [
        (b"", 400),
        (image_bytes()[:20], 400),
        (image_bytes("GIF"), 415),
        (b"<svg></svg>", 400),
    ]:
        assert (await put(client, token, data)).status_code == expected
    # Modify a valid PNG header: the pixel guard must run before allocating/decoding its data.
    data = bytearray(image_bytes())
    data[16:24] = struct.pack(">II", 7100, 7100)
    data[29:33] = struct.pack(">I", zlib.crc32(data[12:29]))
    assert (await put(client, token, bytes(data))).status_code == 413
    media_settings.photo_max_upload_bytes = 1024
    assert (await put(client, token, b"x" * 1025)).status_code == 413


async def test_database_failure_rolls_back_new_files(
    client: AsyncClient,
    session: AsyncSession,
    media_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await setup(client)
    token = await csrf(client)
    first = (await put(client, token)).json()["plan"]

    async def fail_commit() -> None:
        raise RuntimeError("synthetic commit failure")

    with monkeypatch.context() as patch:
        patch.setattr(session, "commit", fail_commit)
        assert (await put(client, token)).status_code == 500
    assert (await client.get("/api/v1/meal-plan")).json()["plan"]["id"] == first["id"]
    assert (await client.get(first["imageUrl"])).status_code == 200
    assert len(list((media_settings.media_root / "meal-plans").glob("*.webp"))) == 2


async def test_disk_failure_preserves_previous_plan_and_files(
    client: AsyncClient,
    media_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await setup(client)
    token = await csrf(client)
    first = (await put(client, token)).json()["plan"]

    def fail_replace(*args: object) -> None:
        raise OSError("synthetic full disk")

    with monkeypatch.context() as patch:
        patch.setattr("app.services.images.os.replace", fail_replace)
        assert (await put(client, token)).status_code == 507
    assert (await client.get("/api/v1/meal-plan")).json()["plan"] == first
    assert (await client.get(first["imageUrl"])).status_code == 200
    assert len(list((media_settings.media_root / "meal-plans").glob("*.webp"))) == 2
