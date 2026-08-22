# Kitchen Dashboard

A portrait-first family and kitchen dashboard for a 27-inch, 1440 × 2560 display driven by Chromium in Raspberry Pi kiosk mode. It delivers the clock, real weather for Unna, a five-week multi-ICS calendar, shared tasks and shopping, household information, and a private family photo gallery.

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
- Shared household tasks and a private family photo slideshow
- Mobile photo upload and management with optimized previews
- Bidirectional shared Bring shopping list with safe server-side credentials
- React component tests, FastAPI tests, and Playwright kiosk checks
- Development and production-oriented Docker Compose definitions

Also implemented: one-time household setup, username/password accounts, administrator and member roles, Argon2id password hashing, server-side sessions, CSRF protection, personal account settings, and administrator user management.

Not implemented: public registration, email login or recovery, OAuth, passkeys, two-factor authentication, a separate mobile app, WebSockets, devices, Home Assistant, cameras, N8N, reverse proxy, or domain configuration.

## Architecture

```text
Chromium / React
       │ same-origin /api/v1
       ▼
FastAPI ── Open-Meteo
   │    └─ private ICS feeds
   ▼
PostgreSQL (application data and photo metadata)
   │
   └── persistent media volume (optimized WebP files)
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

Open `http://localhost:8081`. PostgreSQL has no published host port. Stop with:

```powershell
docker compose -f deploy/compose.yaml down
```

The production-oriented topology can be validated locally but is not deployed:

```powershell
docker compose -f deploy/compose.prod.yaml config
```

Set strong non-example database credentials before starting it.

For the established GitHub workflow, VPS deployment command, health checks, and non-destructive production safeguards, see [DEPLOYMENT.md](DEPLOYMENT.md).

### First setup and accounts

With an empty database, the application opens `/setup`. Enter the household name, display name, username, and a password of 12–128 characters. There is no setup code, default account, or default password. The first account becomes an administrator and is signed in automatically; setup is permanently closed after that transaction succeeds.

Administrators open the quiet settings button in the upper-right corner, then **Benutzerverwaltung**, to add members, change roles, activate or deactivate accounts, reset temporary passwords, or revoke sessions. A temporary password must be changed before the dashboard becomes available. Members can use **Mein Konto** to change their display name or password and revoke their other sessions.

Normal sessions last up to 24 hours. **Angemeldet bleiben** extends the maximum to 30 days. Both values are configurable. Stopping Compose without `--volumes` preserves the PostgreSQL and media volumes. Never use `docker compose down -v`, volume pruning, or a database reset for a normal restart, build, or deployment.

### Family photos

Authenticated users manage photos under **Einstellungen → Fotos**; the dashboard tile is display-only. Members see and delete their own uploads. Administrators can manage all photos in their household. The dashboard slideshow combines all household uploads and changes every 12 seconds without controls.

Uploads accept JPEG/JPG, PNG, WebP, HEIC, and HEIF up to 20 MB. Pillow and `pillow-heif` validate the actual image, apply EXIF orientation, remove unneeded metadata, constrain the long edge to 2560 pixels, and write a high-quality WebP plus a 480-pixel WebP preview. Original smartphone files are not retained.

PostgreSQL stores photo metadata and ownership only. Files live in the named Docker volume `kitchen-dashboard-media-data` at `/data/media`; local directories named `media` are ignored by Git. Both Compose definitions mount this volume into the API container. Normal `docker compose up`, rebuilds, restarts, and `down` without `-v` retain it.

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
| `AUTH_COOKIE_SECURE` | Defaults to `false` in development and `true` in production Compose; set explicitly to `false` only for the approved direct-HTTP deployment |
| `AUTH_SESSION_TTL_HOURS` | Normal session maximum, default `24` |
| `AUTH_REMEMBER_TTL_DAYS` | Remembered session maximum, default `30` |
| `AUTH_LOGIN_MAX_ATTEMPTS` | Failed attempts in the window, default `5` |
| `AUTH_LOGIN_WINDOW_MINUTES` | Login limiting window, default `15` |
| `AUTH_ALLOWED_ORIGINS` | Exact trusted browser origins for state-changing requests |
| `BRING_ENABLED` | Enables the server-side Bring adapter; disabled by default |
| `BRING_EMAIL` | Bring account email; protected host secret, never commit it |
| `BRING_PASSWORD` | Bring account password; protected host secret, never commit it |
| `BRING_LIST_UUID` | UUID of the shared list; keep it in host configuration |
| `PHOTO_MAX_UPLOAD_BYTES` | Original upload limit, default `20971520` (20 MB) |
| `PHOTO_MAX_DIMENSION` | Maximum long edge for dashboard images, default `2560` |
| `PHOTO_THUMBNAIL_MAX_DIMENSION` | Maximum long edge for previews, default `480` |
| `PHOTO_WEBP_QUALITY` | WebP quality, default `88` |

The Unna coordinates identify the city center area and are configurable for a more precise household location.

## Bring shopping list

Bring is connected only by the FastAPI backend through the unofficial `bring-api` package. The browser never receives Bring credentials, tokens, list UUIDs, or raw provider responses. Dashboard accounts and the existing CSRF protection remain the only user-facing authentication.

Before production activation, change any Bring password that was previously shared in a chat. Enter the replacement only in the protected VPS/Hostinger configuration together with `BRING_EMAIL` and `BRING_LIST_UUID`; never paste those values into chat, source files, tests, logs, screenshots, or pull requests. Set `BRING_ENABLED=true` only after all three values are present. Set it to `false` to disable the integration without affecting the rest of the dashboard.

To identify the list UUID safely on the server, first set `BRING_ENABLED`, `BRING_EMAIL`, and `BRING_PASSWORD` in the protected environment, then run:

```powershell
cd backend
python -m app.cli.bring_lists
```

The command prints only list names and UUIDs. It never prints credentials, tokens, headers, or full responses. If exactly one list exists, the adapter can temporarily select it automatically; multiple lists require `BRING_LIST_UUID`.

Changes made in a dashboard are written to Bring and distributed to connected dashboards immediately over Server-Sent Events. While a visible dashboard is connected, external Bring changes are checked at most once per 90 seconds. With no visible client, polling pauses; a returning client refreshes if the last attempt is old enough. This is not a realtime guarantee because Bring provides no public webhook API. The last successful list is stored in PostgreSQL and is shown as stale during a temporary outage. Bring failures do not affect the general healthcheck or other dashboard features.

For diagnosis, inspect only `/api/v1/bring/status` and sanitized application messages. A healthy configured connection reports `configured`, `available`, `stale`, and `last_successful_sync_at`. Never enable HTTP-client debug logging in production and never copy raw Bring exceptions into tickets.

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
- `GET/POST /api/v1/bring/items`, `POST /api/v1/bring/items/{id}/complete`
- `GET /api/v1/bring/status`, `GET /api/v1/bring/events`
- `GET /api/v1/photos`, `POST /api/v1/photos`, `DELETE /api/v1/photos/{id}`
- `GET /api/v1/photos/gallery`, authenticated image and thumbnail delivery
- `GET /api/v1/setup/status`, `POST /api/v1/setup/initialize`
- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`, `GET /api/v1/auth/csrf`, `POST /api/v1/auth/change-password`
- `GET/PATCH /api/v1/account`, account password and session operations
- `GET/POST/PATCH /api/v1/admin/users` plus reset-password and revoke-session operations

Public endpoints are limited to setup status/initialization while setup is open, login, and health. Dashboard, weather, calendar, photos, account, and administration endpoints require a valid household session. Photo mutations additionally require the existing CSRF token. See [authentication](docs/authentication.md) and [authorization](docs/authorization.md).

## Production security

Production defaults to secure `__Host-` session and CSRF cookies. The current direct-IP deployment is an explicit HTTP exception configured only in the protected VPS environment with `AUTH_COOKIE_SECURE=false`; in that mode the application uses unprefixed cookies without the Secure flag. Restore `AUTH_COOKIE_SECURE=true` when moving to HTTPS. There are no standard credentials.

Responses expose update, stale, and demo metadata but never source URLs or raw internal errors.

## Known limitations

- Week and month navigation are intentionally disabled visual preparations; agenda is the working view.
- Bring is an unofficial interface and external app changes can take up to 90 seconds to appear.
- A cold-start provider outage has no historical weather cache, so a quiet placeholder is returned.
- The written visual specification was available during implementation, but no separate reference image file was attached for pixel-level comparison.
- Deployment remains a documented future operation only.

The next module sequence is documented in [future modules](docs/future-modules.md).
