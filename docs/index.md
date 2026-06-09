# LifeRL

LifeRL is a personal management dashboard backed by SQLite and exported to a
plain Markdown record file. The goal is to keep the data readable in Obsidian
while the app gets reliable API-backed sync.

## Files

- `.liferl/liferl.db` is the default primary database.
- [liferl.md](../liferl.md) is the exported Obsidian cold-storage file.
- [architecture.md](architecture.md) describes sync, server time, and storage.
- [api.md](api.md) documents FastAPI routes and client command payloads.
- [data.md](data.md) documents SQLite tables, import/export, and backups.
- [deployment.md](deployment.md) documents local, service, systemd, and VPS run modes.
- [development.md](development.md) documents the development workflow.
- [schema.md](schema.md) defines the exported `liferl.v1` record format.
- [todo.md](todo.md) tracks implementation and optimization work.
- [AGENTS.md](../AGENTS.md) contains implementation notes for coding agents.

## Format Direction

The exported `liferl.v1` format is:

- grouped by day
- all daily data inside that day
- indentation-based, similar to Python
- emoji markers for major blocks
- habit scores in a `0..100` range
- past days kept as snapshots, so old history stays readable even if habits
  change later

See [schema.md](schema.md) for the full v1 schema.

## Quick Architecture Summary

- SQLite is primary.
- FastAPI owns writes, server time, SSE, and Markdown export.
- Next.js renders the app and proxies `/api/*`.
- Browser offline writes are queued as commands.
- `liferl.md` is for Obsidian and backup readability, not live sync.
