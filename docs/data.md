# Data Model

SQLite is the primary store. Markdown is a periodically exported snapshot for
Obsidian-readable cold storage.

## Files

Default paths:

- SQLite: `.liferl/liferl.db`
- Markdown export: `liferl.md`
- Service config: `.liferl/config.json`
- Service logs: `.liferl/server.out.log` and `.liferl/server.err.log`

Environment overrides:

- `LIFERL_DB_PATH=/path/to/liferl.db`
- `LIFERL_RECORDS_PATH=/path/to/liferl.md`

## Startup Import

On backend startup:

1. The SQLite schema is created if needed.
2. If SQLite has no day rows, the backend reads `liferl.md`.
3. Existing `<records>` data is imported into SQLite.
4. If Markdown is empty or has no legacy table rows, starter tasks are created.

After SQLite has data, Markdown is not watched as a live source.

## Markdown Export

Successful writes mark Markdown export as dirty. A background task debounces the
export and rewrites the `<records>` block from SQLite. Backend shutdown forces a
final export when dirty.

The exporter preserves text outside `<records>...</records>`.

Current export format is `liferl.v1`, documented in [schema.md](schema.md).

## SQLite Tables

### `schema_meta`

Small key/value table for schema and sync metadata.

Important keys:

- `schema_version`
- `state_version`
- `markdown_imported`
- `markdown_imported_at`
- `last_markdown_export_at`

### `tasks`

Current task identity and latest metadata.

Columns:

- `id`
- `title`
- `icon`
- `category`
- `target`
- `created_at`
- `archived_at`

The app still treats day rows as historical snapshots. This table is useful for
identity and latest task metadata.

### `day_entries`

One row per date.

Columns:

- `date`
- `mood`
- `energy`
- `sleep`
- `weight`
- `note`

### `task_day_entries`

One task snapshot per day.

Columns:

- `date`
- `task_id`
- `title`
- `icon`
- `category`
- `target`
- `score`
- `metric`
- `note`
- `tags_json`
- `archived`

Scores use `0..100`. The current done rule is `score >= 70`.

### `pomodoro_sessions`

Reserved table for focus-session tracking.

Columns:

- `id`
- `task_id`
- `started_at`
- `ended_at`
- `planned_seconds`
- `actual_seconds`
- `status`
- `timing_source`
- `note`
- `created_at`
- `updated_at`

No UI writes this table yet.

### `command_log`

Idempotency and audit table for online and offline writes.

Columns:

- `id`
- `device_id`
- `type`
- `payload_json`
- `client_selected_date`
- `client_observed_at`
- `server_received_at`
- `server_applied_at`
- `status`
- `error`
- `state_version`

## Sync Rules

- Devices do not copy or sync SQLite files directly.
- Every device talks to the same FastAPI server.
- Server time is authoritative for audit timestamps and event ordering.
- Client-selected dates decide which habit day is edited.
- Offline writes are queued as commands and flushed to `/api/commands/batch`.
- Replayed command IDs do not apply twice.

## Backup

Back up both files:

- `.liferl/liferl.db` for complete primary state.
- `liferl.md` for human-readable archive state.

For a consistent SQLite backup while the server is running, prefer SQLite's
backup command:

```sh
sqlite3 .liferl/liferl.db ".backup '/path/to/liferl.backup.db'"
```

If `sqlite3` is unavailable, stop the service first and copy the DB file.
