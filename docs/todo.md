# LifeRL Todo

This file tracks remaining work only. The app already uses the `liferl.v1`
day-based Markdown format as the main record format.

## Current Bottlenecks

`liferl.md` is still fine as the source of truth. The main remaining risks are:

- full `<records>` rewrites on every save
- limited correctness tests around parser and write/edit behavior
- no weekly/monthly aggregation for very long history yet

## Done

- `liferl.v1` day-based Markdown parsing/rendering
- legacy table migration into `liferl.v1`
- chart source data emitted by the server from day blocks
- chart range controls: `30d`, `90d`, `1y`, `all`
- indexed chart aggregation instead of repeated `logs.filter(...)`
- chart calculations include all `0..100` scores, not only completed tasks
- focused tests for EMA and chart-derived stats
- `.liferl/cache.json` app cache
- source-hash cache invalidation
- in-process mutation serialization
- write-time external-change detection before saving

## Priority 1: More Correctness Tests

Add tests before write optimization gets more complex.

Test cases:

- parsing `liferl.v1` day blocks
- rendering `liferl.v1` without losing day/task fields
- multiline day notes
- multiline task notes
- toggling today changes today's score only
- editing a past day does not mutate other days
- changing a task title today does not rewrite old day snapshots
- deleting a task today does not delete old records
- empty days count correctly in streaks
- editing a past day recomputes streak from that day forward
- editing a past day recomputes EMA from that day forward

Correctness tests should use small Markdown fixtures that are easy to read.

## Priority 2: Efficient Recompute

Raw Markdown records are truth. Derived stats are disposable.

When a day changes, recompute:

- that day total
- that day completion flags
- affected task totals
- affected task completion counts
- streaks from that day forward
- EMA from that day forward

Reason: daily totals are local, but streaks and EMA depend on previous days and
can affect later days.

When a task definition changes, recompute:

- today state
- task labels/categories in chart filters
- task stats for that task

Past days already keep snapshots in `liferl.v1`, so changing today's title,
target, icon, or category should not change old days unless the user edits those
old days directly.

## Priority 3: Partial Day Writes

Current writes still replace the whole `<records>` block.

Later, update only the affected day block:

- find `📅 YYYY-MM-DD`
- replace only that day block
- preserve unrelated days exactly
- preserve unknown fields where possible
- preserve manual Obsidian edits outside `<records>`

This reduces write size and makes manual edits safer.

## Priority 4: Long History Aggregates

Do not delete old raw records, but the UI does not need to process all old detail
for every view.

Future strategy:

- keep raw daily records in `liferl.md`
- precompute monthly summaries in cache
- show exact daily detail for recent ranges
- show weekly/monthly aggregates for long ranges

## Storage Decision

Stay with Markdown until one of these becomes true:

- the file is above 10-20 MB and edits feel slow in Obsidian
- writes become noticeably slow
- conflict handling becomes painful
- queries become complex enough that cache/index code feels like a database

Until then, optimize write size and long-history aggregation first.

## Implementation Order

1. Add parser/render/write correctness tests.
2. Implement efficient recompute from the changed day forward.
3. Implement day-block partial writes.
4. Add weekly/monthly aggregation for long chart ranges.
