# LifeRL

LifeRL is a personal management dashboard backed by a plain Markdown record file.
The goal is to keep the data readable in Obsidian while still being easy for the
app parser to load and update.

## Files

- [liferl.md](../liferl.md) is the main record file.
- [schema.md](schema.md) defines the `liferl.v1` record format.
- [todo.md](todo.md) tracks implementation and optimization work.
- [AGENTS.md](../AGENTS.md) contains implementation notes for coding agents.

## Format Direction

The intended `liferl.v1` format is:

- grouped by day
- all daily data inside that day
- indentation-based, similar to Python
- emoji markers for major blocks
- habit scores in a `0..100` range
- past days kept as snapshots, so old history stays readable even if habits
  change later

See [schema.md](schema.md) for the full v1 schema.
