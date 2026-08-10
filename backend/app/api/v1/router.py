from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.account import router as account_router
from app.api.v1.admin_users import router as admin_users_router
from app.api.v1.auth import router as auth_router
from app.api.v1.bring import router as bring_router
from app.api.v1.setup import router as setup_router
from app.api.v1.tasks import router as tasks_router
from app.auth.dependencies import AuthContext, active_member
from app.core.config import Settings, get_settings
from app.core.time import utc_now
from app.database.session import get_session
from app.schemas.calendar import CalendarEventsResponse, CalendarSourcesResponse
from app.schemas.common import ProviderMeta
from app.schemas.dashboard import DashboardResponse
from app.schemas.health import ComponentHealth, HealthResponse
from app.schemas.weather import WeatherResponse
from app.services.calendar import CalendarService
from app.services.weather import WeatherService

router = APIRouter()
router.include_router(setup_router)
router.include_router(auth_router)
router.include_router(account_router)
router.include_router(admin_users_router)
router.include_router(tasks_router)
router.include_router(bring_router)


def weather_service(settings: Settings = Depends(get_settings)) -> WeatherService:
    return WeatherService(settings)


def calendar_service(settings: Settings = Depends(get_settings)) -> CalendarService:
    return CalendarService(settings)


@router.get("/health", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_session)) -> HealthResponse:
    database_status = "healthy"
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        database_status = "unavailable"
    status = "healthy" if database_status == "healthy" else "degraded"
    return HealthResponse(
        status=status,
        checked_at=utc_now(),
        components={
            "backend": ComponentHealth(status="healthy"),
            "database": ComponentHealth(status=database_status),
            "weather_provider": ComponentHealth(status="healthy"),
            "calendar_provider": ComponentHealth(status="healthy"),
        },
    )


@router.get("/weather", response_model=WeatherResponse)
async def weather(
    _: AuthContext = Depends(active_member),
    session: AsyncSession = Depends(get_session),
    service: WeatherService = Depends(weather_service),
) -> WeatherResponse:
    return await service.get_weather(session)


@router.get("/calendar/events", response_model=CalendarEventsResponse)
async def calendar_events(
    _: AuthContext = Depends(active_member),
    session: AsyncSession = Depends(get_session),
    service: CalendarService = Depends(calendar_service),
) -> CalendarEventsResponse:
    return await service.get_events(session)


@router.get("/calendar/sources", response_model=CalendarSourcesResponse)
async def calendar_sources(
    _: AuthContext = Depends(active_member),
    session: AsyncSession = Depends(get_session),
    service: CalendarService = Depends(calendar_service),
) -> CalendarSourcesResponse:
    return await service.get_sources(session)


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(
    _: AuthContext = Depends(active_member),
    session: AsyncSession = Depends(get_session),
    weather_provider: WeatherService = Depends(weather_service),
    calendar_provider: CalendarService = Depends(calendar_service),
) -> DashboardResponse:
    weather_data = await weather_provider.get_weather(session)
    calendar_data = await calendar_provider.get_events(session)
    updated_at = max(weather_data.meta.updated_at, calendar_data.meta.updated_at)
    return DashboardResponse(
        weather=weather_data,
        calendar=calendar_data,
        meta=ProviderMeta(
            updated_at=updated_at,
            stale=weather_data.meta.stale or calendar_data.meta.stale,
            demo_mode=calendar_data.meta.demo_mode,
        ),
    )
