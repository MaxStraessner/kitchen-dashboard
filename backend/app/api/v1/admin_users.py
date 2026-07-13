from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext, administrator, valid_csrf
from app.auth.passwords import hash_password
from app.core.time import utc_now
from app.database.models import HouseholdMembership, User
from app.database.session import get_session
from app.schemas.auth import (
    AdminUserCreate,
    AdminUserResponse,
    AdminUserUpdate,
    MessageResponse,
    ResetPasswordRequest,
)
from app.services.authentication_service import add_audit, normalize_username, revoke_sessions

router = APIRouter(prefix="/admin/users", tags=["admin users"])


def present(user: User, membership: HouseholdMembership) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        role=membership.role,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


async def load_user(
    database: AsyncSession, household_id: str, user_id: str
) -> tuple[User, HouseholdMembership]:
    row = (
        await database.execute(
            select(User, HouseholdMembership)
            .join(HouseholdMembership, HouseholdMembership.user_id == User.id)
            .where(User.id == user_id, HouseholdMembership.household_id == household_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Benutzer nicht gefunden.")
    return row[0], row[1]


async def ensure_not_last_admin(
    database: AsyncSession,
    household_id: str,
    user: User,
    membership: HouseholdMembership,
    new_role: str | None = None,
    new_active: bool | None = None,
) -> None:
    removes_admin = membership.role == "admin" and (
        new_role == "member" or (new_active is False and user.is_active)
    )
    if not removes_admin:
        return
    active_admins = await database.scalar(
        select(func.count(HouseholdMembership.id))
        .join(User, User.id == HouseholdMembership.user_id)
        .where(
            HouseholdMembership.household_id == household_id,
            HouseholdMembership.role == "admin",
            User.is_active.is_(True),
        )
    )
    if (active_admins or 0) <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Der letzte aktive Administrator kann nicht deaktiviert "
            "oder zum Mitglied herabgestuft werden.",
        )


@router.get("", response_model=list[AdminUserResponse])
async def list_users(
    auth: AuthContext = Depends(administrator),
    database: AsyncSession = Depends(get_session),
) -> list[AdminUserResponse]:
    rows = (
        await database.execute(
            select(User, HouseholdMembership)
            .join(HouseholdMembership, HouseholdMembership.user_id == User.id)
            .where(HouseholdMembership.household_id == auth.household.id)
            .order_by(User.display_name)
        )
    ).all()
    return [present(user, membership) for user, membership in rows]


@router.post("", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> AdminUserResponse:
    if auth.membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administratorrechte erforderlich.")
    now = utc_now()
    user = User(
        id=str(uuid4()),
        username=payload.username.strip(),
        username_normalized=normalize_username(payload.username),
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
        must_change_password=True,
        created_at=now,
        updated_at=now,
        last_login_at=None,
        password_changed_at=now,
    )
    membership = HouseholdMembership(
        id=str(uuid4()),
        household_id=auth.household.id,
        user_id=user.id,
        role=payload.role,
        created_at=now,
        updated_at=now,
    )
    try:
        database.add(user)
        await database.flush()
        database.add(membership)
        await database.flush()
        add_audit(database, "user_created", auth.household.id, auth.user.id, user.id)
        await database.commit()
    except IntegrityError as exc:
        await database.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Dieser Benutzername ist bereits vergeben."
        ) from exc
    return present(user, membership)


@router.get("/{user_id}", response_model=AdminUserResponse)
async def get_user(
    user_id: str,
    auth: AuthContext = Depends(administrator),
    database: AsyncSession = Depends(get_session),
) -> AdminUserResponse:
    return present(*(await load_user(database, auth.household.id, user_id)))


@router.patch("/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> AdminUserResponse:
    if auth.membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administratorrechte erforderlich.")
    user, membership = await load_user(database, auth.household.id, user_id)
    await ensure_not_last_admin(
        database, auth.household.id, user, membership, payload.role, payload.is_active
    )
    if payload.username is not None:
        user.username = payload.username.strip()
        user.username_normalized = normalize_username(payload.username)
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.role is not None and payload.role != membership.role:
        membership.role = payload.role
        add_audit(database, "role_changed", auth.household.id, auth.user.id, user.id)
    if payload.is_active is not None and payload.is_active != user.is_active:
        user.is_active = payload.is_active
        await revoke_sessions(database, user.id)
        add_audit(
            database,
            "user_activated" if payload.is_active else "user_deactivated",
            auth.household.id,
            auth.user.id,
            user.id,
        )
    user.updated_at = utc_now()
    membership.updated_at = utc_now()
    add_audit(database, "user_updated", auth.household.id, auth.user.id, user.id)
    try:
        await database.commit()
    except IntegrityError as exc:
        await database.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Dieser Benutzername ist bereits vergeben."
        ) from exc
    return present(user, membership)


@router.post("/{user_id}/reset-password", response_model=MessageResponse)
async def reset_password(
    user_id: str,
    payload: ResetPasswordRequest,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> MessageResponse:
    if auth.membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administratorrechte erforderlich.")
    user, _ = await load_user(database, auth.household.id, user_id)
    user.password_hash = hash_password(payload.password)
    user.must_change_password = True
    user.password_changed_at = utc_now()
    user.updated_at = utc_now()
    await revoke_sessions(database, user.id)
    add_audit(database, "password_reset", auth.household.id, auth.user.id, user.id)
    await database.commit()
    return MessageResponse(message="Das vorläufige Passwort wurde gesetzt.")


@router.post("/{user_id}/revoke-sessions", response_model=MessageResponse)
async def admin_revoke_sessions(
    user_id: str,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> MessageResponse:
    if auth.membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administratorrechte erforderlich.")
    await load_user(database, auth.household.id, user_id)
    await revoke_sessions(database, user_id)
    add_audit(database, "sessions_revoked", auth.household.id, auth.user.id, user_id)
    await database.commit()
    return MessageResponse(message="Die Sitzungen wurden widerrufen.")
