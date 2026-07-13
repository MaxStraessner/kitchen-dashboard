from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.database.session import get_session
from app.schemas.auth import CurrentUser, SetupInitialize, SetupStatus
from app.services.authentication_service import initialize_setup, setup_required

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/status", response_model=SetupStatus)
async def status(database: AsyncSession = Depends(get_session)) -> SetupStatus:
    return SetupStatus(setup_required=await setup_required(database))


@router.post("/initialize", response_model=CurrentUser)
async def initialize(
    payload: SetupInitialize,
    request: Request,
    response: Response,
    database: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    return await initialize_setup(
        database,
        response,
        request,
        settings,
        payload.household_name,
        payload.display_name,
        payload.username,
        payload.password,
    )
