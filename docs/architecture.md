# LifeRL Architecture

LifeRL is a single-user, multi-device app with a central FastAPI server. Devices
do not sync SQLite files directly. They talk to the server API, and the server
uses its own clock for audit timestamps and sync metadata.

## Data Ownership

SQLite is the primary database. The default path is `.liferl/liferl.db`, and it
can be overridden with `LIFERL_DB_PATH`.

`liferl.md` is exported from SQLite for Obsidian-readable cold storage. The
default export path is `liferl.md`, and it can be overridden with
`LIFERL_RECORDS_PATH`.

On first boot, if SQLite is empty and the Markdown file has a `<records>` block,
the backend imports that Markdown once. After that, app writes go through SQLite
and Markdown is export-only.

## Backend

`backend/main.py` owns persistence, validation, command idempotency, server time,
and realtime notifications.

Core tables:

- `tasks`: current task metadata and archive status.
- `day_entries`: day-level mood, energy, sleep, weight, and note.
- `task_day_entries`: per-day task snapshots, scores, metrics, and notes.
- `pomodoro_sessions`: reserved schema for future focus-session tracking.
- `command_log`: idempotent client command records for offline flushes.
- `schema_meta`: schema version, state version, and export metadata.

Every successful write increments `state_version`. Clients use this to know when
state changed.

## Sync

Realtime sync uses server-sent events at `GET /api/events`. When one device
writes successfully, the server emits `state_changed`, and other devices reload
`GET /api/state`.

Offline writes are queued in the browser as commands. When connectivity returns,
the client sends them to `POST /api/commands/batch`. Command IDs are stable, so
retries are idempotent.

Client-selected dates are accepted for habit/day operations because users may
edit a past or future day intentionally. Server timestamps are still used for
command audit fields and sync ordering.

## Time

The server clock is authoritative for:

- `serverTime` in state responses.
- command creation/application timestamps.
- Markdown export timestamps.
- realtime event timestamps.

Device clocks should only drive local UI display and user-selected dates.

## Markdown Export

Markdown export is debounced after mutations and also checked periodically by
the backend background task. Shutdown forces a final export when there are dirty
changes.

This keeps Obsidian useful without making Markdown edits race live app writes.

## Frontend

The frontend is a Next.js App Router app. `src/components/app/LifeRlApp.tsx`
owns top-level app state, selected date, theme state, offline indicators, and
SSE-triggered refreshes.

`src/api.ts` is the browser API wrapper. It handles:

- API URL construction.
- JSON request/response handling.
- offline command creation.
- local queued command storage.
- queue flush to `/api/commands/batch`.
- `EventSource` subscription to `/api/events`.

## Deployment Shape

Use one central LifeRL server for all devices. Put it on a laptop, home server,
or VPS, then connect phone and laptop browsers/PWAs to that same URL.

Do not sync `.liferl/liferl.db` through Dropbox, iCloud, Syncthing, or Obsidian
Sync while the server is running. SQLite is a server-side file. Device sync
happens through FastAPI.

## Related Docs

- [API](api.md)
- [Data model](data.md)
- [Deployment](deployment.md)
- [Development guide](development.md)
- [Markdown schema](schema.md)
