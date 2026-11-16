# Architecture

## Guiding decisions

This foundation is a modular monorepo without premature service distribution. React owns presentation; FastAPI owns all data access and normalization; PostgreSQL provides restart-safe caches. Redis, queues, WebSockets, Graph, and automation platforms are deliberately absent.

## Frontend

`src/app` configures routes, `auth` owns the single authentication provider, API client, and route guards, `pages` composes the kiosk and account screens, `features` owns domain UI, `services` is the network boundary, `hooks` manages clock and refresh lifecycles, `types` mirrors stable API contracts, and `styles` contains tokens plus layout rules.

The portrait kiosk (at least 900 CSS pixels wide and 1500 high) has five viewport-bound grid bands: top cards 16%, calendar 42%, meal plan 18%, tasks/shopping 14%, and information 10%, after padding and gaps. The primary target is 1440 × 2560 at 100% browser zoom. Content never increases a band's height, including long shopping lists. Smaller or landscape viewports use natural document scrolling. Dialogs are portalled outside the grid.

The agenda shows seven consecutive, equal-height days with bounded previews, measured using ResizeObserver. All events remain available in day dialogs and subsequent seven-day pages. Navigation covers at least five weeks and any additional returned event dates. Existing Berlin-local dates, source colors, all-day sorting and recurrence normalization are retained. Task previews link to existing management; the full shopping dialog shares the original Bring hook and mutations. Camera mode replaces the three lower bands while keeping their state mounted.

On initial load, local fallback content preserves the composition. A successful API request atomically replaces it. On failure, the UI retains the composed view and adds one quiet offline status.

## Backend

- `api/v1`: versioned HTTP endpoints and dependency wiring
- `schemas`: public Pydantic contracts
- `services`: orchestration, cache policy, graceful degradation
- `providers/weather`: Open-Meteo transport and weather-code mapping
- `providers/calendar`: private ICS transport, recurrence expansion, normalization
- `database`: SQLAlchemy session and cache models
- `core`: validated environment settings and time helpers
- `auth`: Argon2id, opaque session tokens, CSRF, and request dependencies
- `services/authentication_service`: setup, login, session rotation, and audit orchestration
- `api/v1`: separate setup, authentication, account, and administration routers

Providers never serialize their configuration. Services return normalized schemas only. One ICS fetch failure updates only that source to stale and leaves other results available.

## Data model

`weather_cache` stores a single last-known-good normalized response and expiry. `calendar_source_status` stores public display metadata, priority, timestamps, stale state, and a sanitized error category. `calendar_events` stores only the bounded normalized event window.

Authentication adds `users`, `households`, `household_memberships`, `auth_sessions`, `login_attempts`, and `audit_events`. Roles belong to memberships. Session and CSRF bearer values are never persisted; only hashes are stored. Shared tasks and Bring cache data use their own household-aware tables.

`photos` stores the household, uploader, safe generated filenames, original display name, detected source MIME type, optimized MIME type, original/optimized size, dimensions, and upload timestamp. Image bytes never enter PostgreSQL. Optimized WebP images and 480-pixel previews live under `/data/media/photos` in the dedicated Compose media volume.

Alembic owns the schema. The application container runs `alembic upgrade head` before starting the API, gated on PostgreSQL health.

## Data flow and caches

```text
Dashboard request
  ├─ Weather service
  │    ├─ fresh DB cache → response
  │    ├─ provider success → replace cache
  │    └─ provider failure → stale cache / safe placeholder
  └─ Calendar service
       ├─ no configured sources → demo response, no persistence mixing
       ├─ fresh source attempts → bounded DB query
       └─ refresh due → fetch sources concurrently
            ├─ success → atomically replace that source window
            └─ failure → retain that source cache as stale
```

Defaults are 15 minutes. Calendar processing is limited to a three-hour lookback and five weeks plus one day ahead. This supports currently running and multiday events without unbounded history.

## Calendar normalization

`recurring-ical-events` expands recurrence rules and applies EXDATE/RECURRENCE-ID exceptions over the bounded window. `icalendar` decodes RFC data. Timed values become aware UTC instants internally; output retains explicit offsets and the frontend formats locally. All-day values remain `date` objects and never pass through UTC. The ICS end date remains exclusive, preserving multi-day semantics.

Event IDs are deterministic hashes of source, UID, recurrence identity, and occurrence start. Cancelled instances are omitted. Missing titles become “Ohne Titel”; missing timed ends receive one hour, while missing all-day ends receive one local day.

## Failure and security model

Raw provider exceptions are not sent to clients or stored. Cache status uses generic messages. Source URLs live only in validated backend settings and are absent from schemas, frontend code, health responses, and example configuration. CORS and state-changing request origins are restricted to configured origins. Dashboard/provider APIs require an active household membership, while health remains public. PostgreSQL belongs only to an internal Docker network. Production requires secure cookies and HTTPS.

Photo uploads use the same session, household, role, origin, and CSRF protections as other account mutations. The server validates decoded image content instead of trusting extensions, creates UUID-based storage names, and never returns internal paths. Members can delete only their own photos; administrators use the existing role to manage household photos. Image delivery is household-scoped and uses immutable private caching because stored filenames never change.

## Photo processing and persistence

The API reads at most 20 MB per upload, applies EXIF orientation, strips unneeded metadata by re-encoding, limits the long edge to 2560 pixels, and writes high-quality WebP output. JPEG, PNG, WebP, HEIC, and HEIF are supported; `pillow-heif` registers HEIC/HEIF decoding with Pillow. A separate 480-pixel preview keeps the mobile management gallery light.

Local and production Compose mount `kitchen-dashboard-media-data` at `/data/media`. Rebuilds and normal restarts preserve the volume. Deployment backups include both a PostgreSQL dump and a compressed snapshot of the existing media mount. Uploaded files, previews, local media directories, backups, and environment secrets are excluded from Git.

## Extension path

New domains should add a feature in React and schema/service/provider or repository modules in FastAPI. Authentication and household scoping can later wrap API dependencies without changing provider boundaries. A realtime transport can later publish normalized domain events without making WebSockets a cache dependency.

## Current meal plan

`meal_plans` contains at most one current image per household, enforced by a unique household key. Metadata is in PostgreSQL and optimized lossless WebP plus a thumbnail are in `/data/media/meal-plans` in the existing persistent media volume. Meal plans are excluded from the photo gallery. The shared image service preserves existing photo processing and separately allows only decoded JPEG, PNG and WebP for meal plans. Existing PHOTO settings govern the 20 MiB/50 megapixel/2560-pixel defaults; no original upload is retained.

All routes require an active household member with a completed required password change. PUT/DELETE additionally require the existing CSRF and origin checks. Every active member may replace or delete the shared plan. Metadata uses no-store; image URLs contain a new UUID after each replacement and use private immutable caching.

Uploads finish decoding and writing new unique files before taking a PostgreSQL row lock on the household. This also serializes first uploads and deletes across API workers. Only after a successful metadata commit are old files removed; a failed commit rolls back and removes new files. A crash between filesystem and database steps may leave unreachable orphan files. Cleanup failures are logged and do not invalidate the committed plan.

Visible clients refresh metadata every eight seconds and on focus/visibility restoration, retaining the last successful image during outages. An in-flight older read cannot overwrite a completed local mutation. Database and media backups already cover the new feature without changing Compose or deployment infrastructure.

## Meal-plan settings and adaptive agenda follow-up

The protected frontend route `/settings/meal-plan` reuses the existing `useMealPlan`, API and image dialog. Settings menu and overview contain its own entry next to photos. Only that page owns upload/replacement/deletion controls; the dashboard card is read-only. No API, persistence, permission or database migration changes are required.

Calendar-specific `calculateAgendaLayout` and `useAgendaPreviewLayout` choose the largest fitting density from 17/16/14 px based on measured content size and event count. Returned CSS variables set the same row height and column count used by capacity calculation. The shared task/shopping preview hook is unchanged. Removing the fixed 700 px child height prevents clipping of late days inside shorter computer calendars. Docker-only polling keeps the existing Windows bind mount current.
