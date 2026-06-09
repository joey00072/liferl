# Development Guide

## Stack

- Bun for JavaScript scripts and package management.
- Next.js App Router for the frontend.
- React for UI.
- Tailwind CSS for styling.
- FastAPI for the backend.
- SQLite for primary persistence.
- Markdown export for Obsidian-readable cold storage.

## Important Files

- `backend/main.py`: FastAPI routes, SQLite schema, command application,
  Markdown import/export, SSE.
- `src/api.ts`: frontend API wrapper, offline queue, SSE subscription.
- `src/components/app/LifeRlApp.tsx`: top-level app state and layout.
- `src/components/dashboard/`: daily habit workflow.
- `src/components/analytics/`: charts, filters, metrics.
- `src/components/sidebar/`: secondary forms and panels.
- `src/lib/analytics.ts`: derived chart/stat calculations.
- `src/lib/chart.ts`: EMA and SVG path helpers.
- `src/lib/date.ts`: date helpers.
- `src/types.ts`: shared frontend state types.
- `next.config.ts`: `/api/*` rewrites to FastAPI.
- `scripts/dev.mjs`: starts FastAPI reload server and Next dev server.
- `scripts/start.mjs`: starts production FastAPI and Next servers.
- `cli.ts`: service setup, background run, systemd unit management.

## Commands

Install:

```sh
bun install
python3 -m pip install -r requirements.txt
```

Run dev:

```sh
bun run dev
```

Run checks:

```sh
python3 -m compileall backend
bun run test
bun run typecheck
bun run build
```

Capture screenshots:

```sh
bun run screenshots
```

## Data Safety During Development

The default dev server uses real local paths:

- `.liferl/liferl.db`
- `liferl.md`

For backend smoke tests, use temporary paths:

```sh
tmpdir=$(mktemp -d /tmp/liferl-dev.XXXXXX)
LIFERL_DB_PATH="$tmpdir/liferl.db" \
LIFERL_RECORDS_PATH="$tmpdir/liferl.md" \
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 5184
```

This avoids mutating the real Obsidian export while testing storage behavior.

## Frontend Data Flow

`LifeRlApp` loads `GET /api/state?date=...`, caches recent state in
`localStorage`, and renders from cached state while revalidating.

Mutations call `requestState()` in `src/api.ts`.

If a mutation fails due to network connectivity, `src/api.ts` converts the
request into an offline command and stores it in `localStorage`.

When the browser comes back online, queued commands are sent to
`POST /api/commands/batch`.

SSE events from `/api/events` increment a refresh token, causing the selected
date to reload from the server.

## Backend Data Flow

Every write becomes a command:

1. Normalize command shape.
2. Insert `pending` row into `command_log`.
3. Load SQLite state into the in-memory `Store` shape.
4. Apply command validation and mutation.
5. Rewrite SQLite domain tables from the updated store.
6. Increment `state_version`.
7. Mark command `succeeded` or `failed`.
8. Schedule Markdown export.
9. Publish `state_changed` over SSE.

The backend uses an async mutation lock to serialize writes inside the process.

## Adding A Mutation

1. Add a command type in `apply_command_to_store()` in `backend/main.py`.
2. Add or update an HTTP route if online clients need a convenience route.
3. Add offline conversion in `commandFromRequest()` in `src/api.ts`.
4. Update [api.md](api.md).
5. Add tests for derived behavior when possible.
6. Run the verification commands.

## Adding Pomodoro UI Later

The `pomodoro_sessions` table already exists, but no UI writes it yet.

Expected next steps:

1. Add API routes for start, stop, cancel, and list sessions.
2. Store server timestamps for session audit fields.
3. Let the browser display countdown locally, but reconcile with server time.
4. Emit SSE changes when sessions start or stop.
5. Decide whether Markdown export should include Pomodoro sessions or keep them
   SQLite-only.

## Review Checklist

Before finishing meaningful changes:

- No accidental `liferl.md` data rewrite unless the task intentionally used the
  live app.
- `python3 -m compileall backend` passes for backend changes.
- `bun run test` passes for shared calculations.
- `bun run typecheck` passes for TypeScript changes.
- `bun run build` passes for app/router changes.
- For visual changes, inspect the app in a browser or capture screenshots.
