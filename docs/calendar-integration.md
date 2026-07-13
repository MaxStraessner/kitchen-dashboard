# Calendar integration

## Add an Outlook ICS feed

In Outlook’s calendar publishing or sharing settings, obtain a private ICS subscription link. Treat that link as a password: anyone possessing it may be able to read calendar content. Do not paste it into source code, screenshots, browser configuration, Git issues, or logs.

Copy `.env.example` to the ignored `.env` file and set `CALENDAR_SOURCES_JSON` to a compact JSON array. Each entry supports:

- `id`: stable lowercase internal key
- `name`: public dashboard label
- `url`: private HTTPS ICS subscription
- `color`: six-digit display color
- `enabled`: source switch
- `showLocation`: suppresses sensitive locations when false
- `priority`: lower values appear first
- `category`: optional future grouping label

Multiple Outlook, public holiday, school, birthday, or sports feeds can coexist. Restart the API after changing environment configuration.

## Security boundary

Only FastAPI downloads feeds. URLs are never returned by `/calendar/events`, `/calendar/sources`, `/dashboard`, or `/health`; the browser bundle has no source configuration. Provider errors are reduced to generic per-source states, so query tokens and paths are not logged or persisted.

## Refresh and failure behavior

Each configured source is refreshed at most once per cache interval (15 minutes by default). Refreshes run independently. A successful refresh replaces only that source’s bounded normalized window. A failed refresh keeps its last successful rows, marks them stale, and does not block other sources. PostgreSQL persistence makes cached events available after process restarts.

## Recurrence, dates, and zones

Recurring rules are expanded only for the relevant display window. EXDATE omissions and RECURRENCE-ID moved exceptions are applied. Cancelled instances are excluded. Timed events are normalized as aware instants and shown in `Europe/Berlin`, including summer/winter transitions. All-day events remain local dates, so they cannot move to the previous day through UTC conversion. ICS exclusive end dates preserve multi-day spans.

## Demo mode

`CALENDAR_SOURCES_JSON=[]` activates a complete, clearly marked demo calendar. As soon as one enabled source is configured, demo generation is disabled entirely; real and demo events are never mixed.

## Limits versus Microsoft Graph

ICS is read-only and refresh-based. This foundation cannot create, edit, delete, RSVP, access rich attendee status, or guarantee immediate updates. Those capabilities would require a later authenticated provider such as Microsoft Graph and are intentionally outside this goal.

