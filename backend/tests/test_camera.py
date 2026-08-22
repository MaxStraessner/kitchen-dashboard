from datetime import timedelta

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from test_authentication import csrf, setup

from app.api.v1.camera import camera_event_stream, service_dependency
from app.core.config import Settings
from app.core.time import utc_now
from app.database.models import CameraModeState
from app.main import app
from app.services.camera_mode import CameraModeService


class ConnectedRequest:
    async def is_disconnected(self) -> bool:
        return False


def test_camera_stream_url_cannot_expose_rtsp_credentials() -> None:
    with pytest.raises(ValidationError):
        Settings(camera_stream_url="rtsp://camera-user:secret@192.168.178.72/stream1")


async def test_camera_status_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/camera/status")).status_code == 401
    assert (await client.post("/api/v1/camera/activate")).status_code == 401
    assert (await client.post("/api/v1/camera/deactivate")).status_code == 401
    assert (await client.get("/api/v1/camera/events")).status_code == 401


async def test_camera_mode_defaults_to_inactive_and_can_be_toggled(
    client: AsyncClient, session: AsyncSession
) -> None:
    service = CameraModeService(
        Settings(
            camera_mode_timeout_minutes=15,
            camera_stream_url="/camera-stream/api/stream.mp4?src=tapo",
        )
    )
    app.dependency_overrides[service_dependency] = lambda: service
    await setup(client)

    assert (await client.get("/api/v1/camera/status")).json() == {
        "active": False,
        "expiresAt": None,
        "streamUrl": "/camera-stream/api/stream.mp4?src=tapo",
        "revision": 0,
    }
    assert (await client.post("/api/v1/camera/activate")).status_code == 403

    token = await csrf(client)
    activated = await client.post("/api/v1/camera/activate", headers={"X-CSRF-Token": token})
    assert activated.status_code == 200
    assert activated.json()["active"] is True
    assert activated.json()["expiresAt"] is not None
    assert activated.json()["revision"] == 1

    deactivated = await client.post("/api/v1/camera/deactivate", headers={"X-CSRF-Token": token})
    assert deactivated.status_code == 200
    assert deactivated.json()["active"] is False
    assert deactivated.json()["expiresAt"] is None
    assert deactivated.json()["revision"] == 2
    assert (await session.get(CameraModeState, 1)) is not None


async def test_camera_timeout_and_reactivation_reset(
    client: AsyncClient, session: AsyncSession
) -> None:
    service = CameraModeService(Settings(camera_mode_timeout_minutes=15))
    app.dependency_overrides[service_dependency] = lambda: service
    await setup(client)
    token = await csrf(client)

    first = (await client.post("/api/v1/camera/activate", headers={"X-CSRF-Token": token})).json()
    state = await session.get(CameraModeState, 1)
    assert state is not None
    state.expires_at = utc_now() + timedelta(seconds=1)
    await session.commit()

    second = (await client.post("/api/v1/camera/activate", headers={"X-CSRF-Token": token})).json()
    assert second["revision"] == first["revision"] + 1
    assert state.expires_at is not None
    assert state.expires_at > utc_now() + timedelta(minutes=14)

    state.expires_at = utc_now() - timedelta(seconds=1)
    await session.commit()
    expired = (await client.get("/api/v1/camera/status")).json()
    assert expired["active"] is False
    assert expired["expiresAt"] is None
    assert expired["revision"] == second["revision"] + 1


async def test_camera_reset_and_sse_notification(session: AsyncSession) -> None:
    service = CameraModeService(Settings(camera_mode_timeout_minutes=15))
    activated = await service.activate(session)
    assert activated.active is True

    stream = camera_event_stream(
        ConnectedRequest(),
        service,
        session_factory=lambda: session,
        poll_interval=0,
    )
    event = await anext(stream)
    await stream.aclose()
    assert "event: camera_mode_changed" in event
    assert '"type":"camera_mode_changed"' in event
    assert '"active":true' in event

    reset = await service.reset(session)
    assert reset.active is False
    assert reset.expires_at is None
