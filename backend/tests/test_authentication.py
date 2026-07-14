import asyncio
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, Request, Response
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.passwords import verify_password
from app.core.config import Settings
from app.core.time import utc_now
from app.database.base import Base
from app.database.models import (
    AuditEvent,
    AuthSession,
    Household,
    HouseholdMembership,
    LoginAttempt,
    User,
)
from app.services.authentication_service import initialize_setup, make_session, set_session_cookie

SETUP = {
    "householdName": "Familie",
    "displayName": "Max",
    "username": "Max.Admin",
    "password": "eine lange sichere Passphrase",
    "passwordConfirmation": "eine lange sichere Passphrase",
}


async def setup(client: AsyncClient) -> dict[str, object]:
    response = await client.post("/api/v1/setup/initialize", json=SETUP)
    assert response.status_code == 200, response.text
    return response.json()


async def csrf(client: AsyncClient) -> str:
    response = await client.get("/api/v1/auth/csrf")
    assert response.status_code == 200
    return str(response.json()["csrfToken"])


async def test_setup_status_and_atomic_initialization(
    client: AsyncClient, session: AsyncSession
) -> None:
    assert (await client.get("/api/v1/setup/status")).json() == {"setupRequired": True}
    payload = await setup(client)
    assert payload["role"] == "admin"
    assert payload["household"]["name"] == "Familie"  # type: ignore[index]
    assert "passwordHash" not in payload
    assert SETUP["password"] not in str(payload)
    assert (await client.get("/api/v1/setup/status")).json() == {"setupRequired": False}

    assert await session.scalar(select(func.count(User.id))) == 1
    assert await session.scalar(select(func.count(Household.id))) == 1
    membership = (await session.scalars(select(HouseholdMembership))).one()
    assert membership.role == "admin"
    auth_session = (await session.scalars(select(AuthSession))).one()
    assert len(auth_session.token_hash) == 64
    assert auth_session.token_hash not in client.cookies.values()
    user = (await session.scalars(select(User))).one()
    assert user.password_hash.startswith("$argon2id$")
    assert SETUP["password"] not in user.password_hash
    assert verify_password(str(SETUP["password"]), user.password_hash)
    assert (await session.scalars(select(AuditEvent))).one().event_type == "setup_completed"


async def test_setup_rejects_second_attempt_without_partial_data(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    second = await client.post(
        "/api/v1/setup/initialize",
        json={**SETUP, "username": "Jessica", "displayName": "Jessica"},
    )
    assert second.status_code == 409
    assert await session.scalar(select(func.count(User.id))) == 1
    assert await session.scalar(select(func.count(Household.id))) == 1


async def test_parallel_setup_creates_exactly_one_complete_household(tmp_path: Path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'parallel.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = Settings(app_env="test")

    async def attempt(username: str) -> object:
        async with factory() as database:
            request = Request(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/api/v1/setup/initialize",
                    "headers": [],
                    "query_string": b"",
                    "client": ("test", 1),
                    "server": ("test", 80),
                    "scheme": "http",
                }
            )
            try:
                return await initialize_setup(
                    database,
                    Response(),
                    request,
                    settings,
                    "Familie",
                    username,
                    username,
                    "eine sehr lange sichere Passphrase",
                )
            except HTTPException as exc:
                return exc

    results = await asyncio.gather(attempt("Max"), attempt("Jessica"))
    assert sum(not isinstance(result, HTTPException) for result in results) == 1
    async with factory() as database:
        assert await database.scalar(select(func.count(User.id))) == 1
        assert await database.scalar(select(func.count(Household.id))) == 1
        assert await database.scalar(select(func.count(HouseholdMembership.id))) == 1
        assert await database.scalar(select(func.count(AuthSession.id))) == 1
    await engine.dispose()


async def test_username_normalization_login_cookie_and_generic_errors(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": await csrf(client)})
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "MAX.ADMIN", "password": SETUP["password"], "rememberMe": True},
    )
    assert response.status_code == 200
    cookies = response.headers.get_list("set-cookie")
    assert any(
        "kitchen_session=" in value and "HttpOnly" in value and "SameSite=lax" in value
        for value in cookies
    )
    assert "token" not in response.text.lower()
    user = (await session.scalars(select(User))).one()
    assert user.username_normalized == "max.admin"

    wrong = await client.post(
        "/api/v1/auth/login",
        json={"username": "Max.Admin", "password": "falsches Passwort", "rememberMe": False},
    )
    missing = await client.post(
        "/api/v1/auth/login",
        json={"username": "Niemand", "password": "falsches Passwort", "rememberMe": False},
    )
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json()["detail"] == missing.json()["detail"]


async def test_protected_endpoints_health_and_csrf(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/health")).status_code == 200
    for path in ("/dashboard", "/weather", "/calendar/events", "/calendar/sources"):
        assert (await client.get(f"/api/v1{path}")).status_code == 401
    await setup(client)
    assert (await client.get("/api/v1/dashboard")).status_code == 200
    assert (await client.patch("/api/v1/account", json={"displayName": "Neu"})).status_code == 403
    token = await csrf(client)
    invalid_origin = await client.patch(
        "/api/v1/account",
        json={"displayName": "Neu"},
        headers={"X-CSRF-Token": token, "Origin": "https://evil.invalid"},
    )
    assert invalid_origin.status_code == 403
    valid = await client.patch(
        "/api/v1/account", json={"displayName": "Neu"}, headers={"X-CSRF-Token": token}
    )
    assert valid.status_code == 200


async def test_admin_member_password_and_last_admin_rules(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    token = await csrf(client)
    created = await client.post(
        "/api/v1/admin/users",
        headers={"X-CSRF-Token": token},
        json={
            "displayName": "Jessica",
            "username": "Jessica",
            "role": "member",
            "isActive": True,
            "password": "vorläufiges Passwort 123",
            "passwordConfirmation": "vorläufiges Passwort 123",
        },
    )
    assert created.status_code == 201, created.text
    member_id = created.json()["id"]
    assert created.json()["mustChangePassword"] is True
    admin_id = (await client.get("/api/v1/auth/me")).json()["id"]
    blocked = await client.patch(
        f"/api/v1/admin/users/{admin_id}",
        headers={"X-CSRF-Token": token},
        json={"role": "member"},
    )
    assert blocked.status_code == 409

    await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": token})
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "jEsSiCa", "password": "vorläufiges Passwort 123", "rememberMe": False},
    )
    assert login.status_code == 200
    assert login.json()["mustChangePassword"] is True
    assert (await client.get("/api/v1/dashboard")).status_code == 403
    member_csrf = await csrf(client)
    assert (await client.get("/api/v1/admin/users")).status_code == 403
    changed = await client.post(
        "/api/v1/account/change-password",
        headers={"X-CSRF-Token": member_csrf},
        json={
            "currentPassword": "vorläufiges Passwort 123",
            "newPassword": "Jessicas neue Passphrase 456",
            "passwordConfirmation": "Jessicas neue Passphrase 456",
        },
    )
    assert changed.status_code == 200
    assert changed.json()["mustChangePassword"] is False
    assert (await client.get("/api/v1/dashboard")).status_code == 200
    user = await session.get(User, member_id)
    assert user is not None and user.must_change_password is False


async def test_admin_update_reset_deactivate_and_case_insensitive_uniqueness(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    token = await csrf(client)
    create_payload = {
        "displayName": "Jessica",
        "username": "Jessica",
        "role": "member",
        "isActive": True,
        "password": "vorläufiges Passwort 123",
        "passwordConfirmation": "vorläufiges Passwort 123",
    }
    created = await client.post(
        "/api/v1/admin/users", headers={"X-CSRF-Token": token}, json=create_payload
    )
    assert created.status_code == 201
    user_id = created.json()["id"]
    duplicate = await client.post(
        "/api/v1/admin/users",
        headers={"X-CSRF-Token": token},
        json={**create_payload, "username": "JESSICA", "displayName": "Andere Jessica"},
    )
    assert duplicate.status_code == 409
    promoted = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers={"X-CSRF-Token": token},
        json={"role": "admin", "displayName": "Jessica Neu"},
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"

    database_user = await session.get(User, user_id)
    assert database_user is not None
    extra_session, _, _ = make_session(user_id, False, None, Settings(app_env="test"))
    session.add(extra_session)
    await session.commit()
    reset = await client.post(
        f"/api/v1/admin/users/{user_id}/reset-password",
        headers={"X-CSRF-Token": token},
        json={
            "password": "neues vorläufiges Passwort",
            "passwordConfirmation": "neues vorläufiges Passwort",
        },
    )
    assert reset.status_code == 200
    await session.refresh(database_user)
    await session.refresh(extra_session)
    assert database_user.must_change_password is True
    assert extra_session.revoked_at is not None

    deactivated = await client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers={"X-CSRF-Token": token},
        json={"isActive": False},
    )
    assert deactivated.status_code == 200
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"username": "Jessica", "password": "neues vorläufiges Passwort", "rememberMe": False},
    )
    assert login_response.status_code == 401


async def test_logout_revokes_session_and_security_headers(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    response = await client.get("/api/v1/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    auth_session = (await session.scalars(select(AuthSession))).one()
    result = await client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": await csrf(client)})
    assert result.status_code == 200
    await session.refresh(auth_session)
    assert auth_session.revoked_at is not None
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_expired_revoked_and_deactivated_sessions_are_rejected(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    auth_session = (await session.scalars(select(AuthSession))).one()
    auth_session.expires_at = utc_now() - timedelta(seconds=1)
    await session.commit()
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_login_limit_is_persistent_and_expires(
    client: AsyncClient, session: AsyncSession
) -> None:
    await setup(client)
    client.cookies.clear()
    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "Max.Admin", "password": "falsch", "rememberMe": False},
        )
        assert response.status_code == 401
    limited = await client.post(
        "/api/v1/auth/login",
        json={"username": "Max.Admin", "password": SETUP["password"], "rememberMe": False},
    )
    assert limited.status_code == 429
    attempts = (await session.scalars(select(LoginAttempt))).all()
    for attempt in attempts:
        attempt.attempted_at = utc_now() - timedelta(minutes=16)
    await session.commit()
    accepted = await client.post(
        "/api/v1/auth/login",
        json={"username": "Max.Admin", "password": SETUP["password"], "rememberMe": False},
    )
    assert accepted.status_code == 200


def test_production_cookie_is_secure_and_configuration_rejects_insecure() -> None:
    settings = Settings(app_env="production", auth_cookie_secure=True)
    from fastapi import Response

    response = Response()
    set_session_cookie(response, "opaque", settings, False)
    value = response.headers["set-cookie"]
    assert "Secure" in value and "HttpOnly" in value and "SameSite=lax" in value
