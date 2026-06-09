# LifeRL Todo

This file tracks remaining product and engineering work. SQLite is now primary;
Markdown is export-only cold storage.

## Done

- Split frontend/backend into Next.js and FastAPI.
- SQLite primary database at `.liferl/liferl.db`.
- First-boot Markdown import from `liferl.md`.
- Debounced Markdown export back to `liferl.md`.
- Server-authoritative time metadata.
- Server-sent events at `/api/events`.
- Offline command queue in the browser.
- Idempotent command batch endpoint.
- Day-based `liferl.v1` Markdown parsing/rendering.
- Legacy table import into `liferl.v1`.
- Chart source data emitted by the server from day snapshots.
- Chart range controls: `30d`, `90d`, `1y`, `all`.
- Indexed chart aggregation instead of repeated `logs.filter(...)`.
- Chart calculations include all `0..100` scores, not only completed tasks.
- Focused tests for EMA and chart-derived stats.
- Pomodoro SQLite table reserved for future UI.

## Priority 1: Storage Correctness Tests

Add focused backend tests around persistence and command behavior.

Test cases:

- import `liferl.v1` Markdown into SQLite.
- import legacy table Markdown into SQLite.
- export SQLite state back to Markdown.
- preserve text outside `<records>` during export.
- repeated command ID does not apply twice.
- failed command is logged as failed.
- toggling a past date changes only that date.
- editing a task snapshot does not mutate older day snapshots.
- archiving a task preserves historical rows.
- `state_version` increments exactly once per successful new command.

## Priority 2: Real Pomodoro

The schema exists, but the app needs API and UI.

Needed:

- start session route.
- stop session route.
- cancel session route.
- list sessions for day/task.
- active session state in `GET /api/state`.
- server-time reconciliation for devices with wrong clocks.
- SSE event when sessions start/stop.
- clear UX for work/break/session history.

## Priority 3: Sync Hardening

The current sync model is good enough for a single-user app, but needs more
edge-case handling before relying on it heavily across devices.

Needed:

- visible offline queue count.
- retry/backoff status.
- conflict notes for commands that fail after reconnect.
- optional `since_version` catch-up behavior for SSE reconnects.
- CORS/deployment docs for non-same-origin API setups.
- basic auth or private-network assumptions made explicit in UI/docs.

## Priority 4: Backend Query Efficiency

Current writes load and rewrite the domain store from SQLite. This is simple and
works for small personal data, but later the backend should mutate affected rows
directly.

Future direction:

- command handlers update only affected `day_entries` and `task_day_entries`.
- chart responses query only the needed date range.
- long-history summaries use weekly/monthly aggregation.
- Markdown export can still render from all rows when needed.

## Priority 5: More UI Polish

- expose mood, energy, sleep, and weight controls.
- improve archived task management.
- show server sync status and last sync time.
- show server date/time if device date looks wrong.
- add keyboard-friendly fast habit toggling.
- add richer mobile install/onboarding hints.
