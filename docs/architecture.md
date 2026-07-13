# Architecture

## Guiding decisions

This foundation is a modular monorepo without premature service distribution. React owns presentation; FastAPI owns all data access and normalization; PostgreSQL provides restart-safe caches. Redis, queues, WebSockets, Graph, and automation platforms are deliberately absent.

## Frontend

`src/app` configures routes, `pages` composes the kiosk screen, `features` owns domain UI, `services` is the single network boundary, `hooks` manages clock and refresh lifecycles, `types` mirrors stable API contracts, and `styles` contains tokens plus layout rules. Feature placeholders include a code comment marking their replacement boundary.

The dashboard has four grid rows. At 1440 × 2560, the document is viewport-bound and overflow is disabled; the calendar row is more than twice the top-row allocation. At smaller viewports, media and supporting cards reflow and document scrolling becomes available.

On initial load, local fallback content preserves the composition. A successful API request atomically replaces it. On failure, the UI retains the composed view and adds one quiet offline status.

## Backend

- `api/v1`: versioned HTTP endpoints and dependency wiring
- `schemas`: public Pydantic contracts
- `services`: orchestration, cache policy, graceful degradation
- `providers/weather`: Open-Meteo transport and weather-code mapping
- `providers/calendar`: private ICS transport, recurrence expansion, normalization
- `database`: SQLAlchemy session and cache models
- `core`: validated environment settings and time helpers

Providers never serialize their configuration. Services return normalized schemas only. One ICS fetch failure updates only that source to stale and leaves other results available.

## Data model

`weather_cache` stores a single last-known-good normalized response and expiry. `calendar_source_status` stores public display metadata, priority, timestamps, stale state, and a sanitized error category. `calendar_events` stores only the bounded normalized event window. There are intentionally no user, household, role, task, or shopping tables.

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

Raw provider exceptions are not sent to clients or stored. Cache status uses generic messages. Source URLs live only in validated backend settings and are absent from schemas, frontend code, health responses, and example configuration. CORS is restricted to local development origins. PostgreSQL belongs only to an internal Docker network.

## Extension path

New domains should add a feature in React and schema/service/provider or repository modules in FastAPI. Authentication and household scoping can later wrap API dependencies without changing provider boundaries. A realtime transport can later publish normalized domain events without making WebSockets a cache dependency.

