from datetime import timedelta
from uuid import uuid4

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext
from app.auth.passwords import DUMMY_PASSWORD_HASH, hash_password, verify_password
from app.auth.sessions import new_token, token_hash
from app.core.config import Settings
from app.core.time import utc_now
from app.database.models import (
    AuditEvent,
    AuthSession,
    Household,
    HouseholdMembership,
    LoginAttempt,
    User,
)
from app.schemas.auth import CurrentUser, HouseholdSummary

LOGIN_ERROR = "Benutzername oder Passwort ist nicht korrekt."


def normalize_username(username: str) -> str:
    return username.strip().casefold()


def add_audit(
    database: AsyncSession,
    event_type: str,
    household_id: str | None,
    actor_user_id: str | None,
    target_user_id: str | None = None,
) -> None:
    database.add(
        AuditEvent(
            id=str(uuid4()),
            event_type=event_type,
            household_id=household_id,
            actor_user_id=actor_user_id,
            target_user_id=target_user_id,
            created_at=utc_now(),
            metadata_json={},
        )
    )


def current_user(auth: AuthContext) -> CurrentUser:
    return CurrentUser(
        id=auth.user.id,
        username=auth.user.username,
        display_name=auth.user.display_name,
        household=HouseholdSummary(id=auth.household.id, name=auth.household.name),
        role=auth.membership.role,
        must_change_password=auth.user.must_change_password,
        last_login_at=auth.user.last_login_at,
    )


def set_session_cookie(response: Response, token: str, settings: Settings, remember: bool) -> None:
    max_age = (
        settings.auth_remember_ttl_days * 86400
        if remember
        else settings.auth_session_ttl_hours * 3600
    )
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def set_csrf_cookie(response: Response, csrf: str, settings: Settings, remember: bool) -> None:
    max_age = (
        settings.auth_remember_ttl_days * 86400
        if remember
        else settings.auth_session_ttl_hours * 3600
    )
    name = "__Host-kitchen_csrf" if settings.app_env == "production" else "kitchen_csrf"
    response.set_cookie(
        key=name,
        value=csrf,
        max_age=max_age,
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        settings.auth_cookie_name,
        path="/",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite="lax",
    )
    csrf_name = "__Host-kitchen_csrf" if settings.app_env == "production" else "kitchen_csrf"
    response.delete_cookie(csrf_name, path="/", secure=settings.auth_cookie_secure, samesite="lax")


def make_session(
    user_id: str, remember: bool, user_agent: str | None, settings: Settings
) -> tuple[AuthSession, str, str]:
    now = utc_now()
    raw_token = new_token()
    csrf = new_token()
    lifetime = (
        timedelta(days=settings.auth_remember_ttl_days)
        if remember
        else timedelta(hours=settings.auth_session_ttl_hours)
    )
    return (
        AuthSession(
            id=str(uuid4()),
            user_id=user_id,
            token_hash=token_hash(raw_token),
            csrf_token_hash=token_hash(csrf),
            created_at=now,
            last_seen_at=now,
            expires_at=now + lifetime,
            revoked_at=None,
            remember_me=remember,
            user_agent=(user_agent or "")[:300] or None,
        ),
        raw_token,
        csrf,
    )


async def setup_required(database: AsyncSession) -> bool:
    return (await database.scalar(select(func.count(User.id)))) == 0


async def initialize_setup(
    database: AsyncSession,
    response: Response,
    request: Request,
    settings: Settings,
    household_name: str,
    display_name: str,
    username: str,
    password: str,
) -> CurrentUser:
    try:
        if database.get_bind().dialect.name == "postgresql":
            await database.execute(text("SELECT pg_advisory_xact_lock(1262838841)"))
        if not await setup_required(database):
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Die Ersteinrichtung ist bereits abgeschlossen."
            )
        now = utc_now()
        user = User(
            id=str(uuid4()),
            username=username.strip(),
            username_normalized=normalize_username(username),
            display_name=display_name.strip(),
            password_hash=hash_password(password),
            is_active=True,
            must_change_password=False,
            created_at=now,
            updated_at=now,
            last_login_at=now,
            password_changed_at=now,
        )
        household = Household(
            id=str(uuid4()),
            name=household_name.strip(),
            setup_guard="primary",
            created_at=now,
            updated_at=now,
        )
        membership = HouseholdMembership(
            id=str(uuid4()),
            household_id=household.id,
            user_id=user.id,
            role="admin",
            created_at=now,
            updated_at=now,
        )
        auth_session, raw_token, csrf = make_session(
            user.id, False, request.headers.get("user-agent"), settings
        )
        database.add_all([user, household])
        await database.flush()
        database.add_all([membership, auth_session])
        await database.flush()
        add_audit(database, "setup_completed", household.id, user.id, user.id)
        await database.commit()
    except HTTPException:
        await database.rollback()
        raise
    except IntegrityError as exc:
        await database.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Die Ersteinrichtung ist bereits abgeschlossen."
        ) from exc
    set_session_cookie(response, raw_token, settings, False)
    set_csrf_cookie(response, csrf, settings, False)
    return CurrentUser(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        household=HouseholdSummary(id=household.id, name=household.name),
        role="admin",
        must_change_password=False,
        last_login_at=user.last_login_at,
    )


async def login(
    database: AsyncSession,
    response: Response,
    request: Request,
    settings: Settings,
    username: str,
    password: str,
    remember: bool,
) -> CurrentUser:
    normalized = normalize_username(username)
    origin = request.client.host if request.client else "unknown"
    window_start = utc_now() - timedelta(minutes=settings.auth_login_window_minutes)
    failures = await database.scalar(
        select(func.count(LoginAttempt.id)).where(
            LoginAttempt.username_normalized == normalized,
            LoginAttempt.client_origin == origin,
            LoginAttempt.attempted_at >= window_start,
            LoginAttempt.succeeded.is_(False),
        )
    )
    if (failures or 0) >= settings.auth_login_max_attempts:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, LOGIN_ERROR)
    row = (
        await database.execute(
            select(User, HouseholdMembership, Household)
            .join(HouseholdMembership, HouseholdMembership.user_id == User.id)
            .join(Household, Household.id == HouseholdMembership.household_id)
            .where(User.username_normalized == normalized)
        )
    ).first()
    valid = verify_password(password, row[0].password_hash if row else DUMMY_PASSWORD_HASH)
    success = bool(row and valid and row[0].is_active)
    database.add(
        LoginAttempt(
            id=str(uuid4()),
            username_normalized=normalized,
            client_origin=origin,
            attempted_at=utc_now(),
            succeeded=success,
        )
    )
    if not success or row is None:
        add_audit(database, "login_failed", row[2].id if row else None, row[0].id if row else None)
        await database.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, LOGIN_ERROR)
    user, membership, household = row
    user.last_login_at = utc_now()
    user.updated_at = utc_now()
    auth_session, raw_token, csrf = make_session(
        user.id, remember, request.headers.get("user-agent"), settings
    )
    database.add(auth_session)
    add_audit(database, "login_succeeded", household.id, user.id, user.id)
    await database.commit()
    set_session_cookie(response, raw_token, settings, remember)
    set_csrf_cookie(response, csrf, settings, remember)
    return CurrentUser(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        household=HouseholdSummary(id=household.id, name=household.name),
        role=membership.role,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
    )


async def revoke_sessions(
    database: AsyncSession, user_id: str, except_id: str | None = None
) -> None:
    query = update(AuthSession).where(
        AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)
    )
    if except_id is not None:
        query = query.where(AuthSession.id != except_id)
    await database.execute(query.values(revoked_at=utc_now()))


async def change_own_password(
    database: AsyncSession,
    response: Response,
    request: Request,
    settings: Settings,
    auth: AuthContext,
    current_password: str,
    new_password: str,
) -> CurrentUser:
    if not verify_password(current_password, auth.user.password_hash):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Das aktuelle Passwort ist nicht korrekt."
        )
    if verify_password(new_password, auth.user.password_hash):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Das neue Passwort muss sich vom bisherigen unterscheiden.",
        )
    auth.user.password_hash = hash_password(new_password)
    auth.user.must_change_password = False
    auth.user.password_changed_at = utc_now()
    auth.user.updated_at = utc_now()
    await revoke_sessions(database, auth.user.id)
    replacement, raw_token, csrf = make_session(
        auth.user.id, auth.auth_session.remember_me, request.headers.get("user-agent"), settings
    )
    database.add(replacement)
    add_audit(database, "password_changed", auth.household.id, auth.user.id, auth.user.id)
    await database.commit()
    set_session_cookie(response, raw_token, settings, replacement.remember_me)
    set_csrf_cookie(response, csrf, settings, replacement.remember_me)
    auth.auth_session = replacement
    return current_user(auth)
