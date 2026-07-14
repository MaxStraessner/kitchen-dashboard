from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext, current_auth, valid_csrf
from app.auth.sessions import token_hash
from app.core.config import Settings, get_settings
from app.core.time import utc_now
from app.database.session import get_session
from app.schemas.auth import (
    ChangePasswordRequest,
    CsrfResponse,
    CurrentUser,
    LoginRequest,
    MessageResponse,
)
from app.services.authentication_service import (
    add_audit,
    change_own_password,
    clear_session_cookie,
    current_user,
    login,
    revoke_sessions,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=CurrentUser)
async def login_endpoint(
    payload: LoginRequest,
    request: Request,
    response: Response,
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    return await login(
        database,
        response,
        request,
        settings,
        payload.username,
        payload.password,
        payload.remember_me,
    )


@router.get("/me", response_model=CurrentUser)
async def me(auth: AuthContext = Depends(current_auth)) -> CurrentUser:
    return current_user(auth)


@router.get("/csrf", response_model=CsrfResponse)
async def csrf(
    request: Request,
    auth: AuthContext = Depends(current_auth),
    settings: Settings = Depends(get_settings),
) -> CsrfResponse:
    name = "__Host-kitchen_csrf" if settings.app_env == "production" else "kitchen_csrf"
    value = request.cookies.get(name)
    if not value or token_hash(value) != auth.auth_session.csrf_token_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Anmeldung erforderlich.")
    return CsrfResponse(csrf_token=value)


@router.post("/change-password", response_model=CurrentUser)
async def change_password(
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


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    auth.auth_session.revoked_at = utc_now()
    add_audit(database, "logout", auth.household.id, auth.user.id, auth.user.id)
    await database.commit()
    clear_session_cookie(response, settings)
    return MessageResponse(message="Abgemeldet.")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(
    response: Response,
    auth: AuthContext = Depends(valid_csrf),
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    await revoke_sessions(database, auth.user.id)
    add_audit(database, "sessions_revoked", auth.household.id, auth.user.id, auth.user.id)
    await database.commit()
    clear_session_cookie(response, settings)
    return MessageResponse(message="Alle Sitzungen wurden abgemeldet.")
