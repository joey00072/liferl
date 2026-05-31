# LifeRL Agent Notes

## Project

LifeRL is a Bun + React + Vite dashboard for daily habits. The source of truth is plain markdown in `liferl.md`, inside the `<records>...</records>` block, so the data remains usable from Obsidian.

## Commands

- Install dependencies: `bun install`
- Start dev server: `bun run dev`
- Run tests: `bun run test`
- Typecheck: `bun run typecheck`
- Production build: `bun run build`

The local app runs at `http://localhost:5173` by default.

## Data Contract

`server.ts` owns all markdown persistence. The app should not write `liferl.md` directly from the browser.

Inside `liferl.md`, keep this shape:

```md
<records>
## Tasks
| id | title | reward | createdAt | active |
| --- | --- | ---: | --- | --- |

## Daily Log
| date | taskId | reward | completedAt |
| --- | --- | ---: | --- |
</records>
```

Rules:

- `Tasks` rows define habits/goals.
- `Daily Log` rows define completions.
- Deleting a task means setting `active` to `false`, not removing history.
- Editing a task should update the task title/reward only; old log rows remain historical.
- `liferl.md` is ignored by Vite watch in `server.ts` to prevent reload loops.

## API

Current local endpoints:

- `GET /api/state`
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

- `src/App.tsx`: app state, API actions, page layout.
- `src/components/dashboard/`: daily habit workflow and top stats.
- `src/components/analytics/`: chart, metrics, habit filters, chart options.
- `src/components/sidebar/`: secondary management panels.
- `src/lib/chart.ts`: EMA, streaks, SVG path helpers.
- `src/lib/date.ts`: date helpers.
- `src/types.ts`: shared app types.
- `src/api.ts`: frontend API wrapper.

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
