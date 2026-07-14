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

Also implemented: one-time household setup, username/password accounts, administrator and member roles, Argon2id password hashing, server-side sessions, CSRF protection, personal account settings, and administrator user management.

Not implemented: public registration, email login or recovery, OAuth, passkeys, two-factor authentication, a mobile app, editable tasks or shopping, Bring, Spotify API, Microsoft Graph/Azure, WebSockets, devices, Home Assistant, cameras, N8N, reverse proxy, or domain configuration.

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

### First setup and accounts

With an empty database, the application opens `/setup`. Enter the household name, display name, username, and a password of 12–128 characters. There is no setup code, default account, or default password. The first account becomes an administrator and is signed in automatically; setup is permanently closed after that transaction succeeds.

Administrators open the quiet settings button in the upper-right corner, then **Benutzerverwaltung**, to add members, change roles, activate or deactivate accounts, reset temporary passwords, or revoke sessions. A temporary password must be changed before the dashboard becomes available. Members can use **Mein Konto** to change their display name or password and revoke their other sessions.

Normal sessions last up to 24 hours. **Angemeldet bleiben** extends the maximum to 30 days. Both values are configurable. Stopping Compose without `--volumes` preserves the PostgreSQL volume. For a completely fresh local setup, intentionally remove only this project's database volume after stopping it:

```powershell
docker compose -f deploy/compose.yaml down
docker volume rm kitchen-dashboard_kitchen-dashboard-postgres-data
docker compose -f deploy/compose.yaml up --build
```

This deletion is only for an explicit empty-database test and destroys local Kitchen Dashboard account data.

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
| `AUTH_COOKIE_SECURE` | `false` in development; must be `true` in production |
| `AUTH_SESSION_TTL_HOURS` | Normal session maximum, default `24` |
| `AUTH_REMEMBER_TTL_DAYS` | Remembered session maximum, default `30` |
| `AUTH_LOGIN_MAX_ATTEMPTS` | Failed attempts in the window, default `5` |
| `AUTH_LOGIN_WINDOW_MINUTES` | Login limiting window, default `15` |
| `AUTH_ALLOWED_ORIGINS` | Exact trusted browser origins for state-changing requests |

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
- `GET /api/v1/setup/status`, `POST /api/v1/setup/initialize`
- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`, `GET /api/v1/auth/csrf`, `POST /api/v1/auth/change-password`
- `GET/PATCH /api/v1/account`, account password and session operations
- `GET/POST/PATCH /api/v1/admin/users` plus reset-password and revoke-session operations

Public endpoints are limited to setup status/initialization while setup is open, login, and health. Dashboard, weather, calendar, account, and administration endpoints require a valid household session. See [authentication](docs/authentication.md) and [authorization](docs/authorization.md).

## Production security

Password entry and the one-time setup must only be exposed over HTTPS. Production refuses insecure session-cookie configuration and uses the `__Host-kitchen_session` cookie. Never enter credentials over a raw HTTP test port such as `18080`; complete setup immediately after a protected HTTPS deployment. There are no standard credentials.

Responses expose update, stale, and demo metadata but never source URLs or raw internal errors.

## Known limitations

- Week and month navigation are intentionally disabled visual preparations; agenda is the working view.
- Static preview controls do not mutate data.
- A cold-start provider outage has no historical weather cache, so a quiet placeholder is returned.
- The written visual specification was available during implementation, but no separate reference image file was attached for pixel-level comparison.
- Deployment remains a documented future operation only.

The next module sequence is documented in [future modules](docs/future-modules.md).
