# LifeRL Agent Notes

## Project

LifeRL is a split Next.js + FastAPI dashboard for daily habits. The source of truth is SQLite, with `liferl.md` exported from the database as Obsidian-readable cold storage.

## Commands

- Install frontend dependencies: `bun install`
- Install backend dependencies: `python3 -m pip install -r requirements.txt`
- Start dev servers: `bun run dev`
- Run tests: `bun run test`
- Typecheck: `bun run typecheck`
- Production build: `bun run build`

The local app runs at `http://localhost:5173` by default. FastAPI runs at `http://localhost:5174`, and Next proxies `/api/*` to it through `next.config.ts`.

## Data Contract

`backend/main.py` owns all persistence. The frontend should only call the FastAPI routes and should not write `liferl.md` or the SQLite database directly from the browser.

SQLite is primary:

- Default DB path: `.liferl/liferl.db`
- Override DB path: `LIFERL_DB_PATH=/path/to/liferl.db`
- Markdown export path: `LIFERL_RECORDS_PATH=/path/to/liferl.md`
- On first boot with an empty DB, the backend imports existing `liferl.md`.
- After mutations, the backend periodically exports a Markdown snapshot.
- Markdown is export/cold storage, not live bidirectional sync.

Inside exported `liferl.md`, keep this shape:

```md
<records>
schema: liferl.v1

📅 2026-05-31
  mood: 7
  energy: 6
  📝 Day note

  🎯 guitar
    icon: 🎸
    title: Guitar practice
    category: skill
    target: 20 min
    score: 70
    metric: 15 min
</records>
```

Rules:

- Day blocks define daily snapshots.
- Task blocks define that day's habit state.
- Archiving a task marks future/current snapshots archived without removing history.
- Editing a task changes the selected day's snapshot; old day snapshots remain historical.
- `liferl.md` is ignored by Next webpack watch in `next.config.ts` to prevent reload loops where supported.
- Server time is authoritative for audit timestamps and sync metadata.
- Browser offline writes are queued as commands and flushed back to FastAPI when connectivity returns.

## API

Current local endpoints:

- `GET /api/state`
- `GET /api/time`
- `GET /api/events`
- `POST /api/commands/batch`
- `GET /api/commands/:id`
- `POST /api/tasks`
- `POST /api/tasks/:id/toggle`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`

## UX Principles

This app is for daily use. Optimize for repeated action, not setup.

Priority order:

1. Mark today's habits done.
2. See reward, completion rate, streak, and trend.
3. Filter/select habits for diagnosis.
4. Edit/add/tune settings only when needed.

Do not put low-frequency controls in primary space. Adding habits, editing goals, and tuning EMA belong near the relevant object or behind secondary disclosure.

Avoid:

- Large marketing-style headers.
- Decorative cards everywhere.
- Sidebars that waste horizontal space.
- Chart bars dominating the EMA/trend.
- Hiding primary actions behind tabs.

Prefer:

- Single-page workflow.
- Large click targets.
- Clicking a habit row toggles completion.
- Visible edit affordances on habit rows.
- Quiet dividers and whitespace over stacked boxes.
- Bars as context, EMA as trend.

## Frontend Structure

- `backend/main.py`: FastAPI routes, markdown parser, persistence, and server-side mutations.
- `src/app/`: Next.js App Router pages.
- `src/components/app/`: app state, top bar, mobile navigation, page layout.
- `src/components/dashboard/`: daily habit workflow and top stats.
- `src/components/analytics/`: chart, metrics, habit filters, chart options.
- `src/components/sidebar/`: secondary management panels.
- `src/lib/chart.ts`: EMA, streaks, SVG path helpers.
- `src/lib/date.ts`: date helpers.
- `src/types.ts`: shared app types.
- `src/api.ts`: frontend API wrapper.
- `next.config.ts`: proxies `/api/*` requests to FastAPI.

## Docs

- `docs/index.md`: documentation map.
- `docs/architecture.md`: storage, sync, frontend/backend responsibilities.
- `docs/api.md`: FastAPI routes, command payloads, SSE events.
- `docs/data.md`: SQLite tables, Markdown import/export, backup notes.
- `docs/deployment.md`: local, service, systemd, VPS, PWA setup.
- `docs/development.md`: workflow, file map, verification, mutation checklist.
- `docs/schema.md`: exported `liferl.v1` Markdown format.
- `docs/todo.md`: current roadmap and remaining work.

## EMA Semantics

`emaBySmoothing(values, smoothing)` uses smoothing as a human-facing control:

- `0.10` reacts fast.
- `0.99` is very smooth and reacts slowly.
- EMA starts from `0`.

Keep `src/lib/chart.test.ts` passing if this math changes.

## Verification

Before finishing meaningful changes, run:

```bash
bun run test
bun run typecheck
bun run build
```

For visual changes, capture or inspect the app in a browser. A headless Chrome screenshot is acceptable when browser automation is unavailable.
