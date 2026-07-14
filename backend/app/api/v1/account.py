from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext, current_auth, valid_csrf
from app.core.config import Settings, get_settings
from app.database.session import get_session
from app.schemas.auth import AccountUpdate, ChangePasswordRequest, CurrentUser, MessageResponse
from app.services.authentication_service import (
    add_audit,
    change_own_password,
    current_user,
    revoke_sessions,
)

router = APIRouter(prefix="/account", tags=["account"])


@router.get("", response_model=CurrentUser)
async def get_account(auth: AuthContext = Depends(current_auth)) -> CurrentUser:
    return current_user(auth)


@router.patch("", response_model=CurrentUser)
async def update_account(
    payload: AccountUpdate,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> CurrentUser:
    auth.user.display_name = payload.display_name.strip()
    add_audit(database, "user_updated", auth.household.id, auth.user.id, auth.user.id)
    await database.commit()
    return current_user(auth)


@router.post("/change-password", response_model=CurrentUser)
async def account_change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    return await change_own_password(
        database, response, request, settings, auth, payload.current_password, payload.new_password
    )


@router.post("/revoke-other-sessions", response_model=MessageResponse)
async def revoke_other_sessions(
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
) -> MessageResponse:
    await revoke_sessions(database, auth.user.id, auth.auth_session.id)
    add_audit(database, "sessions_revoked", auth.household.id, auth.user.id, auth.user.id)
    await database.commit()
    return MessageResponse(message="Andere Sitzungen wurden abgemeldet.")
