# LifeRL API

FastAPI owns every write. Browser, PWA, phone, and future native clients should
use these routes instead of touching SQLite or `liferl.md` directly.

Default local API URL:

```txt
http://localhost:5174
```

The Next.js app proxies `/api/*` to FastAPI through `next.config.ts`.

## Response Conventions

Errors return JSON:

```json
{ "error": "Task not found." }
```

Most app-state responses include:

- `version`: server-side state version.
- `serverTime`: server clock timestamp.
- `date`: selected app date.
- `tasks`: active tasks for that date.
- `archivedTasks`: archived task snapshots for that date.
- `logs`: score-based completion log projection.
- `charts`: chart-ready daily and per-task data.

The server clock is authoritative for audit and sync metadata. Client-selected
dates are accepted for day/task editing because users can intentionally edit
past or future days.

## Health And Time

### `GET /api/health`

Returns backend status, file paths, schema versions, current state version, and
server time.

Example:

```json
{
  "ok": true,
  "recordsPath": "/srv/liferl/liferl.md",
  "databasePath": "/srv/liferl/liferl.db",
  "schema": "liferl.v1",
  "databaseSchema": 1,
  "version": 12,
  "time": "2026-06-06T02:38:18.763333+05:30"
}
```

### `GET /api/time`

Returns the server clock details.

```json
{
  "serverTime": "2026-06-06T02:38:18.763333+05:30",
  "serverDate": "2026-06-06",
  "timezone": "IST",
  "utcOffsetSeconds": 19800
}
```

## State

### `GET /api/state?date=YYYY-MM-DD`

Returns the dashboard state for the selected date. If `date` is omitted, the
server date is used.

The returned state is a projection from SQLite. It is not the raw database row
shape.

## Task Routes

These routes are convenient online mutations. Internally, they are converted to
idempotent commands and written through `command_log`.

### `POST /api/tasks?date=YYYY-MM-DD`

Creates a task snapshot on the selected date.

Body:

```json
{
  "title": "Read",
  "reward": 0,
  "icon": "📚",
  "category": "skill",
  "target": "20 min"
}
```

### `POST /api/tasks/{task_id}/toggle?date=YYYY-MM-DD`

Toggles a task score between `0` and `100` on the selected date.

### `PATCH /api/tasks/{task_id}?date=YYYY-MM-DD`

Updates the selected day's task snapshot.

Body fields:

- `title`
- `score`
- `icon`
- `category`
- `target`
- `metric`
- `note`
- `tags`

### `DELETE /api/tasks/{task_id}?date=YYYY-MM-DD`

Archives the selected day's task snapshot.

### `POST /api/tasks/{task_id}/restore?date=YYYY-MM-DD`

Restores an archived task snapshot on the selected date.

## Day Route

### `PATCH /api/day`

Updates day-level metadata.

Body:

```json
{
  "date": "2026-06-06",
  "mood": 7,
  "energy": 6,
  "sleep": "7h",
  "weight": "78.4kg",
  "note": "Good momentum."
}
```

Any supplied field is updated. Use `null` to clear a field.

## Offline Command Routes

Offline clients should queue commands locally and flush them when the server is
reachable.

### `POST /api/commands/batch`

Applies a list of commands. Command IDs are idempotency keys. Re-sending the
same command ID returns the original command result instead of applying the
mutation again.

Body:

```json
{
  "deviceId": "phone-uuid",
  "commands": [
    {
      "id": "stable-command-uuid",
      "type": "toggle_task",
      "payload": { "taskId": "guitar" },
      "clientSelectedDate": "2026-06-06",
      "clientObservedAt": "2026-06-06T02:40:00.000+05:30"
    }
  ]
}
```

Supported command types:

- `create_task`
- `toggle_task`
- `update_task`
- `archive_task`
- `restore_task`
- `update_day`

Command result fields:

- `id`
- `deviceId`
- `type`
- `clientSelectedDate`
- `clientObservedAt`
- `serverReceivedAt`
- `serverAppliedAt`
- `status`
- `error`
- `stateVersion`
- `state` when available

### `GET /api/commands/{command_id}`

Returns a command log record by ID.

## Realtime Events

### `GET /api/events`

Server-sent events stream.

Event types:

- `connected`: sent immediately with current version.
- `state_changed`: sent after successful writes.
- `heartbeat`: sent periodically while idle.

Example event:

```txt
event: state_changed
data: {"type":"state_changed","version":13,"serverTime":"2026-06-06T02:41:00+05:30","changedDate":"2026-06-06"}
```

Clients should reload `GET /api/state` when they receive `state_changed`.
