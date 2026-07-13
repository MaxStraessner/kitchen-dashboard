from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.sessions import token_hash
from app.core.config import Settings, get_settings
from app.core.time import ensure_utc, utc_now
from app.database.models import AuthSession, Household, HouseholdMembership, User
from app.database.session import get_session


@dataclass
class AuthContext:
    user: User
    membership: HouseholdMembership
    household: Household
    auth_session: AuthSession


async def current_auth(
    request: Request,
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    raw_token = request.cookies.get(settings.auth_cookie_name)
    if not raw_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Anmeldung erforderlich.")
    row = (
        await database.execute(
            select(AuthSession, User, HouseholdMembership, Household)
            .join(User, User.id == AuthSession.user_id)
            .join(HouseholdMembership, HouseholdMembership.user_id == User.id)
            .join(Household, Household.id == HouseholdMembership.household_id)
            .where(AuthSession.token_hash == token_hash(raw_token))
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Anmeldung erforderlich.")
    auth_session, user, membership, household = row
    if (
        auth_session.revoked_at is not None
        or ensure_utc(auth_session.expires_at) <= utc_now()
        or not user.is_active
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Anmeldung erforderlich.")
    auth_session.last_seen_at = utc_now()
    return AuthContext(user, membership, household, auth_session)


async def active_member(auth: AuthContext = Depends(current_auth)) -> AuthContext:
    if auth.user.must_change_password:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Passwortänderung erforderlich.")
    return auth


async def administrator(auth: AuthContext = Depends(active_member)) -> AuthContext:
    if auth.membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administratorrechte erforderlich.")
    return auth


async def valid_csrf(
    request: Request,
    auth: AuthContext = Depends(current_auth),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") not in settings.auth_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ungültige Anfrageherkunft.")
    csrf = request.headers.get("X-CSRF-Token")
    if not csrf or token_hash(csrf) != auth.auth_session.csrf_token_hash:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ungültiger CSRF-Token.")
    return auth
