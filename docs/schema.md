# LifeRL Schema v1

Schema id: `liferl.v1`

This schema is for the exported Markdown content stored inside the `<records>`
block in [liferl.md](../liferl.md). It is designed to be human-readable in
Obsidian and simple for the app parser to import on first boot.

## Example

```md
<records>
schema: liferl.v1

📅 2026-05-31
  mood: 7
  energy: 6
  sleep: 6.5h
  weight: 78.4kg
  📝 Felt decent. Good momentum.

  🎯 guitar
    icon: 🎸
    title: Guitar practice
    category: skill
    target: 20 min
    score: 70
    metric: 15 min
    tags: music, practice
    note: Timing was rough.

  🎯 gym
    icon: 🏋️
    title: Gym
    category: health
    target: full workout
    score: 100
    metric: push day

  🎯 work
    icon: 💼
    title: Work
    category: career
    target: focused work
    score: 50
    archived: true
    metric: 1 focused block
    note: Focus was uneven.

  🎯 walk-10k
    icon: 🚶
    title: Walk 10k steps
    category: health
    target: 10000 steps
    score: 80
    metric: 10300 steps
</records>
```

## Top Level

The exported record file should contain exactly one `<records>` block.

The first non-empty line inside `<records>` should be:

```md
schema: liferl.v1
```

The schema line is versioned so future parser changes can be handled without
guessing the file format.

## Day Block

A day starts with a calendar marker at the root indentation level:

```md
📅 2026-05-31
```

Date format is `YYYY-MM-DD`.

Everything for that day lives under the day block.

Supported day fields:

- `mood`: optional number, recommended `0..10`
- `energy`: optional number, recommended `0..10`
- `sleep`: optional free text, for example `6.5h`
- `weight`: optional free text, for example `78.4kg`
- `📝`: optional day note

Day fields use two spaces of indentation:

```md
📅 2026-05-31
  mood: 7
  energy: 6
  📝 Felt focused in the morning.
```

For longer day notes, use `📝` on its own line and indent note lines by four
spaces:

```md
📅 2026-05-31
  📝
    Morning was slow.
    Felt better after walking.
```

## Task Block

A task starts with a target marker inside a day:

```md
  🎯 guitar
```

The value after `🎯` is the task id.

Task ids should be stable and parser-friendly:

- lowercase letters
- numbers
- hyphens
- no spaces

Good ids:

```md
guitar
gym
work
walk-10k
```

## Task Fields

Task fields use four spaces of indentation.

Required task fields:

- `title`: human-readable task name
- `score`: integer from `0` to `100`

Recommended task fields:

- `icon`: display emoji for the habit
- `category`: broad area such as `health`, `career`, `skill`, `social`
- `target`: what you intended to do
- `metric`: what actually happened
- `tags`: comma-separated labels
- `note`: task-specific note
- `archived`: optional `true`, hides the task from active daily habits while
  preserving the record for restore/history

Example:

```md
  🎯 guitar
    icon: 🎸
    title: Guitar practice
    category: skill
    target: 20 min
    score: 70
    metric: 15 min
    tags: music, practice
    note: Timing was rough.
```

For longer task notes:

```md
  🎯 guitar
    note:
      Practiced chord changes.
      Need to slow down next time.
```

## Score Meaning

`score` is the main reward input.

- `0` means nothing happened.
- `50` means partial effort.
- `70` means good enough to count as done.
- `100` means the target was fully completed.

The default done rule is:

```txt
done = score >= 70
```

Rewards and charts should be calculated from scores, not random values.

## Target And Metric

`target` is the plan.

Examples:

```md
target: 20 min
target: 10000 steps
target: focused work
```

`metric` is the reality.

Examples:

```md
metric: 15 min
metric: 10300 steps
metric: 1 focused block
```

Keeping both makes old records honest: you can see what you wanted and what
actually happened.

## Parser Rules

- Use two spaces per indentation level.
- Do not use tabs.
- Blank lines are allowed and ignored.
- Parser-controlled block lines start with `📅`, `🎯`, or `📝`.
- Field lines use `key: value`.
- Unknown fields should be preserved when possible and ignored by older app
  versions.
- Habit-specific emoji belong in `icon`; the parser should not depend on them.

## Editing History

Each day is a snapshot. A task can have a different title, target, category, or
icon on a later day without changing old days.

SQLite is the primary data source. Editing exported Markdown is useful for
manual archive review, but live app writes should go through the FastAPI API.

To create a new day, copy the latest day block, change the date, reset scores
and metrics, then edit targets if needed.
