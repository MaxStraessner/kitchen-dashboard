# Kitchen Dashboard

A portrait-first family and kitchen dashboard for a 27-inch, 1440 × 2560 display driven by Chromium in Raspberry Pi kiosk mode. This foundation delivers the clock, real weather for Unna, a five-week multi-ICS calendar, and high-fidelity static previews for media, tasks, shopping, and household information.

The visual system is purpose-built for this display: restrained dark materials, a strong typographic hierarchy, large readable cards, a dominant calendar, and no scrolling at the target viewport. It intentionally avoids an admin-dashboard aesthetic.

## Scope

Implemented now:

- Berlin-local minute clock, German date, and time-aware greeting
- Backend-only Open-Meteo forecast for configurable coordinates (Unna defaults)
- Persistent last-known-good weather cache with a 15-minute default TTL
- Multiple private ICS sources, recurrence expansion, exceptions, time zones, cancellations, all-day and multiday events
- PostgreSQL-backed normalized event cache and independent source health
- Five-week agenda, current-month calendar, and source-derived legend
- Explicit, realistic demo calendar when no ICS sources exist
- Static replaceable media, task, shopping, and information features
- React component tests, FastAPI tests, and Playwright kiosk checks
- Development and production-oriented Docker Compose definitions

Not implemented: accounts, authentication, households, roles, a mobile app, editable tasks or shopping, Bring, Spotify API, Microsoft Graph/Azure, WebSockets, devices, Home Assistant, cameras, N8N, deployment, reverse proxy, or domains.

## Architecture

```text
Chromium / React
       │ same-origin /api/v1
       ▼
FastAPI ── Open-Meteo
   │    └─ private ICS feeds
   ▼
PostgreSQL (weather cache, normalized events, source status)
```

The monorepo contains `frontend`, `backend`, `deploy`, and `docs`. Frontend features only use the central API client. Backend API, services, providers, schemas, configuration, and persistence are separate modules. See [architecture](docs/architecture.md).

## Requirements

- Node.js 22 and npm 10+
- Python 3.12
- Docker Engine with Docker Compose v2 for the container workflow
- Chromium installed by Playwright for visual tests

## Local development

```powershell
Copy-Item .env.example .env
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:8000`.

## Docker

```powershell
Copy-Item .env.example .env
docker compose -f deploy/compose.yaml up --build
```

Open `http://localhost:8080`. PostgreSQL has no published host port. Stop with:

```powershell
docker compose -f deploy/compose.yaml down
```

The production-oriented topology can be validated locally but is not deployed:

```powershell
docker compose -f deploy/compose.prod.yaml config
```

Set strong non-example database credentials before starting it.

## Environment variables

| Variable | Default / purpose |
| --- | --- |
| `APP_TIMEZONE` | `Europe/Berlin` |
| `APP_HTTP_PORT` | Public frontend port, default `8080` |
| `BACKEND_PORT` | Local-only development API port, default `8000` |
| `DATABASE_URL` | Async SQLAlchemy PostgreSQL connection |
| `WEATHER_LOCATION_NAME` | `Unna` |
| `WEATHER_LATITUDE` / `WEATHER_LONGITUDE` | `51.537` / `7.689` |
| `WEATHER_CACHE_TTL_SECONDS` | `900` |
| `CALENDAR_CACHE_TTL_SECONDS` | `900` |
| `CALENDAR_SOURCES_JSON` | JSON array of private sources; `[]` enables demo mode |

The Unna coordinates identify the city center area and are configurable for a more precise household location.

## ICS configuration

Put private ICS URLs only in the ignored `.env` file. Never commit, log, paste into the frontend, or expose them through an API. Example shape using a deliberately invalid URL:

```json
[
  {
    "id": "family",
    "name": "Familie",
    "url": "https://example.invalid/calendar.ics",
    "color": "#62D68B",
    "enabled": true,
    "showLocation": true,
    "priority": 10,
    "category": "family"
  }
]
```

Encode it as one JSON value for `CALENDAR_SOURCES_JSON`. With any enabled real source, demo events are fully disabled; they are never mixed. See [calendar integration](docs/calendar-integration.md).

## Quality commands

```powershell
cd backend
ruff format --check .
ruff check .
mypy app
pytest --cov=app

cd ..\frontend
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright writes the 1440 × 2560 screenshot to `frontend/tests/artifacts/dashboard-1440x2560.png`.

## API

- `GET /api/v1/health`
- `GET /api/v1/weather`
- `GET /api/v1/calendar/events`
- `GET /api/v1/calendar/sources`
- `GET /api/v1/dashboard`

Responses expose update, stale, and demo metadata but never source URLs or raw internal errors.

## Known limitations

- Week and month navigation are intentionally disabled visual preparations; agenda is the working view.
- Static preview controls do not mutate data.
- A cold-start provider outage has no historical weather cache, so a quiet placeholder is returned.
- The written visual specification was available during implementation, but no separate reference image file was attached for pixel-level comparison.
- Deployment remains a documented future operation only.

The next module sequence is documented in [future modules](docs/future-modules.md).

