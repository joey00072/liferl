from __future__ import annotations

import asyncio
import copy
import json
import os
import re
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

CALENDAR = "\U0001F4C5"
TARGET = "\U0001F3AF"
NOTE = "\U0001F4DD"
DB_SCHEMA_VERSION = 1

PROJECT_ROOT = Path.cwd()
STATE_DIR = PROJECT_ROOT / ".liferl"
CONFIG_PATH = STATE_DIR / "config.json"


@dataclass
class TaskSnapshot:
    id: str
    title: str
    score: int
    icon: str | None = None
    category: str | None = None
    target: str | None = None
    metric: str | None = None
    tags: list[str] | None = None
    note: str | None = None
    archived: bool | None = None


@dataclass
class DayBlock:
    date: str
    tasks: list[TaskSnapshot] = field(default_factory=list)
    mood: float | None = None
    energy: float | None = None
    sleep: str | None = None
    weight: str | None = None
    note: str | None = None


@dataclass
class Store:
    schema: str
    days: list[DayBlock]


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def now_dt() -> datetime:
    return datetime.now().astimezone()


def now_iso() -> str:
    return now_dt().isoformat()


def today() -> str:
    return now_dt().date().isoformat()


def resolve_records_path() -> Path:
    env_path = os.getenv("LIFERL_RECORDS_PATH", "").strip()
    if env_path:
        return Path(env_path).expanduser().resolve()

    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        records_path = str(config.get("recordsPath", "")).strip()
        if records_path:
            return Path(records_path).expanduser().resolve()
    except Exception:
        pass

    return PROJECT_ROOT / "liferl.md"


def resolve_database_path() -> Path:
    env_path = os.getenv("LIFERL_DB_PATH", "").strip()
    if env_path:
        return Path(env_path).expanduser().resolve()

    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        db_path = str(config.get("databasePath", "") or config.get("dbPath", "")).strip()
        if db_path:
            return Path(db_path).expanduser().resolve()
    except Exception:
        pass

    return STATE_DIR / "liferl.db"


RECORDS_PATH = resolve_records_path()
DATABASE_PATH = resolve_database_path()

STARTER_TASKS = [
    TaskSnapshot("guitar", "Guitar practice", 0, icon="\U0001F3B8", category="skill"),
    TaskSnapshot("gym", "Gym", 0, icon="\U0001F3CB\ufe0f", category="health"),
    TaskSnapshot("work", "Work", 0, icon="\U0001F4BC", category="career"),
    TaskSnapshot("walk-10k-steps", "Walk 10k steps", 0, icon="\U0001F6B6", category="health", target="10000 steps"),
]

mutation_lock = asyncio.Lock()
event_subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
markdown_dirty = False
markdown_dirty_since = 0.0
markdown_export_task: asyncio.Task[None] | None = None


def default_markdown() -> str:
    return "[[life]] [[rl]] [[habit]]\n\n"


def assert_date(value: str) -> str:
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        raise ApiError("Date must be YYYY-MM-DD.", 400)
    return value


def clamp_score(value: Any) -> int:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0
    if score != score:
        return 0
    return max(0, min(100, round(score)))


def slugify(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower().strip())
    base = re.sub(r"^-+|-+$", "", base)[:42]
    return base or f"task-{int(time.time() * 1000)}"


def clone_store(store: Store) -> Store:
    return copy.deepcopy(store)


def pomodoro_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if not row:
        return None
    mode = row["note"] if row["note"] in ("focus", "short_break", "long_break") else None
    if mode is None:
        if row["planned_seconds"] == 300:
            mode = "short_break"
        elif row["planned_seconds"] == 900:
            mode = "long_break"
        else:
            mode = "focus"
    return {
        "id": row["id"],
        "taskId": row["task_id"],
        "mode": mode,
        "startedAt": row["started_at"],
        "endedAt": row["ended_at"],
        "plannedSeconds": row["planned_seconds"],
        "actualSeconds": row["actual_seconds"],
        "status": row["status"],
        "timingSource": row["timing_source"],
        "note": None if row["note"] in ("focus", "short_break", "long_break") else row["note"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def task_to_dict(task: TaskSnapshot) -> dict[str, Any]:
    data = {
        "id": task.id,
        "title": task.title,
        "score": task.score,
        "icon": task.icon,
        "category": task.category,
        "target": task.target,
        "metric": task.metric,
        "tags": task.tags,
        "note": task.note,
        "archived": task.archived,
    }
    return {key: value for key, value in data.items() if value is not None}


def day_to_dict(day: DayBlock) -> dict[str, Any]:
    data = {
        "date": day.date,
        "mood": day.mood,
        "energy": day.energy,
        "sleep": day.sleep,
        "weight": day.weight,
        "note": day.note,
        "tasks": [task_to_dict(task) for task in day.tasks],
    }
    return {key: value for key, value in data.items() if value is not None}


def table_rows(block: str, heading: str) -> list[list[str]]:
    match = re.search(rf"## {re.escape(heading)}\n([\s\S]*?)(?=\n## |$)", block)
    if not match:
        return []

    rows = []
    for line in match.group(1).splitlines():
        line = line.strip()
        if line.startswith("|") and "---" not in line:
            rows.append([cell.strip() for cell in line.split("|")[1:-1]])
    return rows[1:]


def migrate_legacy_store(legacy_tasks: list[dict[str, Any]], legacy_logs: list[dict[str, Any]]) -> Store:
    days = []
    dates = sorted({log["date"] for log in legacy_logs})
    today_str = today()
    if today_str not in dates:
        dates.append(today_str)

    for date_value in dates:
        day_logs = [log for log in legacy_logs if log["date"] == date_value]
        day_log_task_ids = {log["taskId"] for log in day_logs}
        day_tasks = []

        for task in legacy_tasks:
            if task["createdAt"] > date_value:
                continue
            if not task["active"] and task["id"] not in day_log_task_ids:
                continue
            log = next((item for item in day_logs if item["taskId"] == task["id"]), None)
            task_id = task["id"]
            day_tasks.append(
                TaskSnapshot(
                    id=task_id,
                    title=task["title"],
                    score=100 if log else 0,
                    icon={
                        "guitar": "\U0001F3B8",
                        "gym": "\U0001F3CB\ufe0f",
                        "work": "\U0001F4BC",
                        "walk-10k-steps": "\U0001F6B6",
                    }.get(task_id),
                    category="health"
                    if task_id in {"gym", "walk-10k-steps"}
                    else "skill"
                    if task_id == "guitar"
                    else "career"
                    if task_id == "work"
                    else None,
                    target="10000 steps" if task_id == "walk-10k-steps" else None,
                )
            )
        days.append(DayBlock(date=date_value, tasks=day_tasks))

    return Store(schema="liferl.v1", days=sorted(days, key=lambda day: day.date))


def parse_store_v1(block: str) -> Store:
    days: list[DayBlock] = []
    current_day: DayBlock | None = None
    current_task: TaskSnapshot | None = None
    multiline_target: dict[str, Any] | None = None

    for line in block.splitlines():
        trimmed = line.strip()
        if not trimmed:
            if multiline_target:
                if multiline_target["type"] == "day" and current_day:
                    current_day.note = (current_day.note or "") + "\n"
                elif multiline_target["type"] == "task" and current_task:
                    current_task.note = (current_task.note or "") + "\n"
            continue

        leading_spaces = len(line) - len(line.lstrip(" "))

        if multiline_target:
            if leading_spaces > multiline_target["indent"]:
                if multiline_target["type"] == "day" and current_day:
                    current_day.note = ((current_day.note or "") + "\n" + trimmed).strip()
                elif multiline_target["type"] == "task" and current_task:
                    current_task.note = ((current_task.note or "") + "\n" + trimmed).strip()
                continue
            multiline_target = None

        if trimmed.startswith(CALENDAR):
            current_day = DayBlock(date=trimmed.replace(CALENDAR, "", 1).strip())
            days.append(current_day)
            current_task = None
            continue

        if not current_day:
            continue

        if trimmed.startswith(TARGET) and leading_spaces == 2:
            task_id = trimmed.replace(TARGET, "", 1).strip()
            current_task = TaskSnapshot(id=task_id, title=task_id, score=0)
            current_day.tasks.append(current_task)
            continue

        if current_task and leading_spaces == 4:
            colon_index = trimmed.find(":")
            if colon_index > 0:
                key = trimmed[:colon_index].strip()
                value = trimmed[colon_index + 1 :].strip()
                if key == "note" and value == "":
                    multiline_target = {"type": "task", "indent": 4}
                elif key == "title":
                    current_task.title = value
                elif key == "score":
                    current_task.score = clamp_score(value)
                elif key == "icon":
                    current_task.icon = value
                elif key == "category":
                    current_task.category = value
                elif key == "target":
                    current_task.target = value
                elif key == "metric":
                    current_task.metric = value
                elif key == "note":
                    current_task.note = value
                elif key == "archived":
                    current_task.archived = value == "true"
                elif key == "tags":
                    current_task.tags = [tag.strip() for tag in value.split(",") if tag.strip()]
            continue

        if leading_spaces == 2:
            colon_index = trimmed.find(":")
            if trimmed == NOTE:
                multiline_target = {"type": "day", "indent": 2}
            elif colon_index > 0:
                key = trimmed[:colon_index].strip()
                value = trimmed[colon_index + 1 :].strip()
                if key == "mood":
                    current_day.mood = float(value) if value else None
                elif key == "energy":
                    current_day.energy = float(value) if value else None
                elif key == "sleep":
                    current_day.sleep = value
                elif key == "weight":
                    current_day.weight = value
                elif key == NOTE:
                    current_day.note = value

    return Store(schema="liferl.v1", days=days)


def parse_markdown_store(markdown: str) -> Store:
    match = re.search(r"<records>\n?([\s\S]*?)\n?</records>", markdown)
    block = match.group(1) if match else ""

    if "schema: liferl.v1" in block:
        return parse_store_v1(block)

    legacy_tasks = [
        {
            "id": id_value,
            "title": title,
            "reward": float(reward or 0),
            "createdAt": created_at,
            "active": active != "false",
        }
        for id_value, title, reward, created_at, active in table_rows(block, "Tasks")
    ]
    legacy_logs = [
        {
            "date": date_value,
            "taskId": task_id,
            "reward": float(reward or 0),
            "completedAt": completed_at,
        }
        for date_value, task_id, reward, completed_at in table_rows(block, "Daily Log")
    ]
    if not legacy_tasks:
        legacy_tasks = [
            {"id": "guitar", "title": "Guitar practice", "reward": 15, "createdAt": today(), "active": True},
            {"id": "gym", "title": "Gym", "reward": 25, "createdAt": today(), "active": True},
            {"id": "work", "title": "Work", "reward": 30, "createdAt": today(), "active": True},
            {"id": "walk-10k-steps", "title": "Walk 10k steps", "reward": 20, "createdAt": today(), "active": True},
        ]
    return migrate_legacy_store(legacy_tasks, legacy_logs)


def render_store_v1(store: Store) -> str:
    lines = ["schema: liferl.v1", ""]

    for day in store.days:
        lines.append(f"{CALENDAR} {day.date}")
        if day.mood is not None:
            lines.append(f"  mood: {day.mood:g}")
        if day.energy is not None:
            lines.append(f"  energy: {day.energy:g}")
        if day.sleep:
            lines.append(f"  sleep: {day.sleep}")
        if day.weight:
            lines.append(f"  weight: {day.weight}")
        if day.note:
            if "\n" in day.note:
                lines.append(f"  {NOTE}")
                lines.extend(f"    {part}" for part in day.note.split("\n"))
            else:
                lines.append(f"  {NOTE} {day.note}")

        for task in day.tasks:
            lines.append(f"  {TARGET} {task.id}")
            if task.icon:
                lines.append(f"    icon: {task.icon}")
            lines.append(f"    title: {task.title}")
            if task.category:
                lines.append(f"    category: {task.category}")
            if task.target:
                lines.append(f"    target: {task.target}")
            lines.append(f"    score: {task.score}")
            if task.archived:
                lines.append("    archived: true")
            if task.metric:
                lines.append(f"    metric: {task.metric}")
            if task.tags:
                lines.append(f"    tags: {', '.join(task.tags)}")
            if task.note:
                if "\n" in task.note:
                    lines.append("    note:")
                    lines.extend(f"      {part}" for part in task.note.split("\n"))
                else:
                    lines.append(f"    note: {task.note}")
        lines.append("")

    return f"<records>\n{chr(10).join(lines).strip()}\n</records>"


def replace_records(markdown: str, rendered: str) -> str:
    if re.search(r"<records>[\s\S]*?</records>", markdown):
        return re.sub(r"<records>[\s\S]*?</records>", rendered, markdown, count=1)
    if "</records>" in markdown:
        return markdown.replace("</records>", rendered)
    return f"{markdown.rstrip()}\n\n{rendered}\n"


def clone_tasks_for_new_day(tasks: list[TaskSnapshot]) -> list[TaskSnapshot]:
    cloned = copy.deepcopy(tasks)
    for task in cloned:
        task.score = 0
        task.metric = None
        task.note = None
    return cloned


def create_day_block_from_history(store: Store, date_value: str) -> DayBlock:
    normalized_date = assert_date(date_value)
    older_days = sorted((day for day in store.days if day.date < normalized_date), key=lambda day: day.date, reverse=True)
    latest_day = older_days[0] if older_days else (sorted(store.days, key=lambda day: day.date, reverse=True)[0] if store.days else None)
    initial_tasks = clone_tasks_for_new_day(latest_day.tasks) if latest_day else copy.deepcopy(STARTER_TASKS)
    return DayBlock(date=normalized_date, tasks=initial_tasks)


def ensure_day_block(store: Store, date_value: str) -> DayBlock:
    normalized_date = assert_date(date_value)
    for day in store.days:
        if day.date == normalized_date:
            return day

    day_block = create_day_block_from_history(store, normalized_date)
    store.days.append(day_block)
    store.days.sort(key=lambda day: day.date)
    return day_block


def get_db_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_meta(conn: sqlite3.Connection, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM schema_meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_meta(conn: sqlite3.Connection, key: str, value: Any) -> None:
    conn.execute(
        "INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def current_state_version(conn: sqlite3.Connection) -> int:
    return int(get_meta(conn, "state_version", "0") or "0")


def bump_state_version(conn: sqlite3.Connection) -> int:
    version = current_state_version(conn) + 1
    set_meta(conn, "state_version", version)
    return version


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            icon TEXT,
            category TEXT,
            target TEXT,
            created_at TEXT NOT NULL,
            archived_at TEXT
        );

        CREATE TABLE IF NOT EXISTS day_entries (
            date TEXT PRIMARY KEY,
            mood REAL,
            energy REAL,
            sleep TEXT,
            weight TEXT,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS task_day_entries (
            date TEXT NOT NULL,
            task_id TEXT NOT NULL,
            title TEXT NOT NULL,
            icon TEXT,
            category TEXT,
            target TEXT,
            score INTEGER NOT NULL DEFAULT 0,
            metric TEXT,
            note TEXT,
            tags_json TEXT,
            archived INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (date, task_id),
            FOREIGN KEY (date) REFERENCES day_entries(date) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pomodoro_sessions (
            id TEXT PRIMARY KEY,
            task_id TEXT,
            started_at TEXT,
            ended_at TEXT,
            planned_seconds INTEGER,
            actual_seconds INTEGER,
            status TEXT NOT NULL,
            timing_source TEXT NOT NULL DEFAULT 'server',
            note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS command_log (
            id TEXT PRIMARY KEY,
            device_id TEXT,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            client_selected_date TEXT,
            client_observed_at TEXT,
            server_received_at TEXT NOT NULL,
            server_applied_at TEXT,
            status TEXT NOT NULL,
            error TEXT,
            state_version INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_task_day_entries_date ON task_day_entries(date);
        CREATE INDEX IF NOT EXISTS idx_command_log_device_id ON command_log(device_id);
        """
    )
    set_meta(conn, "schema_version", DB_SCHEMA_VERSION)
    if get_meta(conn, "state_version") is None:
        set_meta(conn, "state_version", 0)


def reset_domain_tables(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM command_log")
    conn.execute("DELETE FROM pomodoro_sessions")
    conn.execute("DELETE FROM task_day_entries")
    conn.execute("DELETE FROM day_entries")
    conn.execute("DELETE FROM tasks")


def has_valid_schema(conn: sqlite3.Connection) -> bool:
    try:
        row = conn.execute("SELECT value FROM schema_meta WHERE key = 'schema_version'").fetchone()
        return bool(row and int(row["value"]) == DB_SCHEMA_VERSION)
    except sqlite3.Error:
        return False


def bootstrap_schema() -> None:
    with get_db_connection() as conn:
        if not has_valid_schema(conn):
            conn.executescript(
                """
                DROP TABLE IF EXISTS command_log;
                DROP TABLE IF EXISTS pomodoro_sessions;
                DROP TABLE IF EXISTS task_day_entries;
                DROP TABLE IF EXISTS day_entries;
                DROP TABLE IF EXISTS tasks;
                DROP TABLE IF EXISTS schema_meta;
                """
            )
            create_schema(conn)
        else:
            create_schema(conn)


def store_is_empty(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT COUNT(*) AS count FROM day_entries").fetchone()
    return int(row["count"]) == 0


def import_store_to_db(conn: sqlite3.Connection, store: Store) -> None:
    reset_domain_tables(conn)
    save_store_to_db(conn, store)
    set_meta(conn, "markdown_imported", "true")
    set_meta(conn, "markdown_imported_at", now_iso())
    bump_state_version(conn)


def save_store_to_db(conn: sqlite3.Connection, store: Store) -> None:
    conn.execute("DELETE FROM task_day_entries")
    conn.execute("DELETE FROM day_entries")
    conn.execute("DELETE FROM tasks")

    task_first_seen: dict[str, str] = {}
    task_latest_seen: dict[str, tuple[str, TaskSnapshot]] = {}
    for day in sorted(store.days, key=lambda item: item.date):
        for task in day.tasks:
            task_first_seen.setdefault(task.id, day.date)
            task_latest_seen[task.id] = (day.date, task)

    for task_id, (last_seen_date, task) in task_latest_seen.items():
        conn.execute(
            """
            INSERT INTO tasks (id, title, icon, category, target, created_at, archived_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task_id,
                task.title,
                task.icon,
                task.category,
                task.target,
                task_first_seen[task_id],
                last_seen_date if task.archived else None,
            ),
        )

    for day in sorted(store.days, key=lambda item: item.date):
        conn.execute(
            "INSERT INTO day_entries (date, mood, energy, sleep, weight, note) VALUES (?, ?, ?, ?, ?, ?)",
            (day.date, day.mood, day.energy, day.sleep, day.weight, day.note),
        )
        for task in day.tasks:
            conn.execute(
                """
                INSERT INTO task_day_entries
                    (date, task_id, title, icon, category, target, score, metric, note, tags_json, archived)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    day.date,
                    task.id,
                    task.title,
                    task.icon,
                    task.category,
                    task.target,
                    task.score,
                    task.metric,
                    task.note,
                    json.dumps(task.tags) if task.tags else None,
                    1 if task.archived else 0,
                ),
            )


def load_store_from_db(conn: sqlite3.Connection) -> Store:
    day_rows = conn.execute("SELECT * FROM day_entries ORDER BY date ASC").fetchall()
    task_rows = conn.execute("SELECT * FROM task_day_entries ORDER BY date ASC, task_id ASC").fetchall()

    tasks_by_date: dict[str, list[TaskSnapshot]] = {}
    for row in task_rows:
        tags = json.loads(row["tags_json"]) if row["tags_json"] else None
        task = TaskSnapshot(
            id=row["task_id"],
            title=row["title"],
            score=int(row["score"]),
            icon=row["icon"],
            category=row["category"],
            target=row["target"],
            metric=row["metric"],
            note=row["note"],
            tags=tags,
            archived=True if row["archived"] else None,
        )
        tasks_by_date.setdefault(row["date"], []).append(task)

    days = [
        DayBlock(
            date=row["date"],
            mood=row["mood"],
            energy=row["energy"],
            sleep=row["sleep"],
            weight=row["weight"],
            note=row["note"],
            tasks=tasks_by_date.get(row["date"], []),
        )
        for row in day_rows
    ]
    return Store(schema="liferl.v1", days=days)


def summarize(
    store: Store,
    target_date: str | None = None,
    version: int | None = None,
    conn: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    date_value = assert_date(target_date or today())
    
    if conn is None:
        with get_db_connection() as temp_conn:
            active_row = temp_conn.execute("SELECT * FROM pomodoro_sessions WHERE status IN ('running', 'paused') LIMIT 1").fetchone()
            day_rows = temp_conn.execute("SELECT * FROM pomodoro_sessions WHERE started_at LIKE ? ORDER BY started_at DESC", (f"{date_value}%",)).fetchall()
    else:
        active_row = conn.execute("SELECT * FROM pomodoro_sessions WHERE status IN ('running', 'paused') LIMIT 1").fetchone()
        day_rows = conn.execute("SELECT * FROM pomodoro_sessions WHERE started_at LIKE ? ORDER BY started_at DESC", (f"{date_value}%",)).fetchall()

    active_session = pomodoro_to_dict(active_row)
    pomodoro_sessions = [pomodoro_to_dict(r) for r in day_rows]
    existing_day = next((day for day in store.days if day.date == date_value), None)
    day_block = existing_day or create_day_block_from_history(store, date_value)
    active_tasks = [task for task in day_block.tasks if not task.archived]
    archived_tasks = [task for task in day_block.tasks if task.archived]
    logs = []
    chart_entries = []
    sorted_days = sorted(store.days if existing_day else [*store.days, day_block], key=lambda day: day.date)

    for day in sorted_days:
        for task in day.tasks:
            if task.archived:
                continue
            chart_entries.append({"date": day.date, "taskId": task.id, "score": task.score, "done": task.score >= 70})
            if task.score >= 70:
                logs.append({"date": day.date, "taskId": task.id, "reward": task.score, "completedAt": f"{day.date}T12:00:00.000Z"})

    day_logs = [log for log in logs if log["date"] == date_value]
    done_ids = {log["taskId"] for log in day_logs}
    total_reward = sum(task.score for day in store.days for task in day.tasks if not task.archived)
    day_reward = sum(task.score for task in active_tasks)
    possible_day_reward = len(active_tasks) * 100

    task_created_dates: dict[str, str] = {}
    for day in sorted_days:
        for task in day.tasks:
            if not task.archived and task.id not in task_created_dates:
                task_created_dates[task.id] = day.date

    daily = []
    for day in sorted_days:
        day_active_tasks = [task for task in day.tasks if not task.archived]
        completed = len([task for task in day_active_tasks if task.score >= 70])
        daily.append(
            {
                "date": day.date,
                "reward": sum(task.score for task in day_active_tasks),
                "complete": bool(day_active_tasks) and completed == len(day_active_tasks),
                "expected": len(day_active_tasks),
                "completed": completed,
            }
        )

    task_stats_map: dict[str, dict[str, Any]] = {}
    for day in sorted_days:
        for task in day.tasks:
            if task.archived:
                continue
            stat = task_stats_map.get(
                task.id,
                {"id": task.id, "title": task.title, "completed": 0, "totalDays": 0, "rewardTotal": 0},
            )
            stat["title"] = task.title
            stat["totalDays"] += 1
            stat["rewardTotal"] += task.score
            if task.score >= 70:
                stat["completed"] += 1
            task_stats_map[task.id] = stat

    task_stats = [
        {**stat, "rate": round((stat["completed"] / stat["totalDays"]) * 100) if stat["totalDays"] else 0}
        for stat in task_stats_map.values()
    ]

    def task_summary(task: TaskSnapshot, active: bool) -> dict[str, Any]:
        return {
            "id": task.id,
            "title": task.title,
            "reward": 100,
            "createdAt": task_created_dates.get(task.id, date_value),
            "active": active,
            "doneOnDate": task.id in done_ids,
            "doneToday": task.id in done_ids,
            "icon": task.icon,
            "category": task.category,
            "target": task.target,
            "score": task.score,
            "metric": task.metric,
            "note": task.note,
            "archived": task.archived if active else True,
        }

    state = {
        "date": date_value,
        "version": version,
        "serverTime": now_iso(),
        "dayNote": day_block.note,
        "mood": day_block.mood,
        "energy": day_block.energy,
        "sleep": day_block.sleep,
        "weight": day_block.weight,
        "totalReward": total_reward,
        "dayReward": day_reward,
        "possibleDayReward": possible_day_reward,
        "completedDay": len(done_ids),
        "totalDay": len(active_tasks),
        "todayReward": day_reward,
        "possibleTodayReward": possible_day_reward,
        "completedToday": len(done_ids),
        "totalToday": len(active_tasks),
        "tasks": [task_summary(task, True) for task in active_tasks],
        "archivedTasks": [task_summary(task, False) for task in archived_tasks],
        "logs": logs,
        "charts": {
            "firstDate": sorted_days[0].date if sorted_days else date_value,
            "currentDate": date_value,
            "entries": chart_entries,
            "daily": daily,
            "taskStats": task_stats,
        },
        "activeSession": active_session,
        "pomodoroSessions": pomodoro_sessions,
    }
    return {key: value for key, value in state.items() if value is not None}


def schedule_markdown_export() -> None:
    global markdown_dirty, markdown_dirty_since
    markdown_dirty = True
    markdown_dirty_since = time.monotonic()


def export_markdown_snapshot() -> None:
    with get_db_connection() as conn:
        store = load_store_from_db(conn)
        rendered = render_store_v1(store)
        markdown = RECORDS_PATH.read_text(encoding="utf-8") if RECORDS_PATH.exists() else default_markdown()
        next_markdown = replace_records(markdown, rendered)
        if next_markdown != markdown:
            RECORDS_PATH.parent.mkdir(parents=True, exist_ok=True)
            temp_path = RECORDS_PATH.with_name(f"{RECORDS_PATH.name}.{int(time.time() * 1000)}.tmp")
            temp_path.write_text(next_markdown, encoding="utf-8")
            temp_path.replace(RECORDS_PATH)
        set_meta(conn, "last_markdown_export_at", now_iso())


async def export_markdown_if_dirty(force: bool = False) -> None:
    global markdown_dirty
    if not markdown_dirty and not force:
        return
    async with mutation_lock:
        if not markdown_dirty and not force:
            return
        export_markdown_snapshot()
        markdown_dirty = False


async def markdown_export_loop() -> None:
    debounce_seconds = float(os.getenv("LIFERL_MARKDOWN_EXPORT_DEBOUNCE_SECONDS", "1.5"))
    periodic_seconds = float(os.getenv("LIFERL_MARKDOWN_EXPORT_INTERVAL_SECONDS", "60"))
    last_periodic = time.monotonic()
    while True:
        await asyncio.sleep(1.0)
        now = time.monotonic()
        if markdown_dirty and (now - markdown_dirty_since >= debounce_seconds or now - last_periodic >= periodic_seconds):
            await export_markdown_if_dirty()
            last_periodic = now


async def publish_event(event: dict[str, Any]) -> None:
    for queue in list(event_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            event_subscribers.discard(queue)


async def publish_state_changed(version: int, changed_date: str | None) -> None:
    await publish_event(
        {
            "type": "state_changed",
            "version": version,
            "serverTime": now_iso(),
            "changedDate": changed_date,
        }
    )


def command_record(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "deviceId": row["device_id"],
        "type": row["type"],
        "clientSelectedDate": row["client_selected_date"],
        "clientObservedAt": row["client_observed_at"],
        "serverReceivedAt": row["server_received_at"],
        "serverAppliedAt": row["server_applied_at"],
        "status": row["status"],
        "error": row["error"],
        "stateVersion": row["state_version"],
    }


def normalize_command(raw: dict[str, Any], fallback_device_id: str = "unknown") -> dict[str, Any]:
    command_id = str(raw.get("id") or raw.get("commandId") or uuid.uuid4())
    payload = raw.get("payload") if isinstance(raw.get("payload"), dict) else {}
    return {
        "id": command_id,
        "device_id": str(raw.get("deviceId") or raw.get("device_id") or fallback_device_id),
        "type": str(raw.get("type") or ""),
        "payload": payload,
        "client_selected_date": raw.get("clientSelectedDate") or raw.get("client_selected_date") or payload.get("date"),
        "client_observed_at": raw.get("clientObservedAt") or raw.get("client_observed_at"),
    }


def apply_command_to_store(store: Store, command_type: str, payload: dict[str, Any], client_selected_date: str | None) -> str:
    target_date = str(client_selected_date or payload.get("date") or today())

    if command_type == "create_task":
        title = str(payload.get("title", "")).strip()
        if not title:
            raise ApiError("Task title is required.", 400)
        day_block = ensure_day_block(store, target_date)
        id_base = slugify(title)
        task_id = id_base
        suffix = 2
        all_task_ids = {task.id for day in store.days for task in day.tasks}
        while task_id in all_task_ids:
            task_id = f"{id_base}-{suffix}"
            suffix += 1
        day_block.tasks.append(
            TaskSnapshot(
                id=task_id,
                title=title,
                score=clamp_score(payload.get("score", payload.get("reward", 0))),
                icon=str(payload.get("icon")).strip() if payload.get("icon") else None,
                category=str(payload.get("category")).strip() if payload.get("category") else None,
                target=str(payload.get("target")).strip() if payload.get("target") else None,
            )
        )
        return target_date

    if command_type == "update_day":
        day_block = ensure_day_block(store, target_date)
        if "mood" in payload:
            day_block.mood = None if payload["mood"] is None else float(payload["mood"])
        if "energy" in payload:
            day_block.energy = None if payload["energy"] is None else float(payload["energy"])
        if "sleep" in payload:
            day_block.sleep = None if payload["sleep"] is None else str(payload["sleep"]).strip()
        if "weight" in payload:
            day_block.weight = None if payload["weight"] is None else str(payload["weight"]).strip()
        if "note" in payload:
            day_block.note = None if payload["note"] is None else str(payload["note"]).strip()
        return target_date

    task_id = str(payload.get("taskId") or payload.get("task_id") or "").strip()
    if not task_id:
        raise ApiError("Task id is required.", 400)
    day_block = ensure_day_block(store, target_date)
    task = next((item for item in day_block.tasks if item.id == task_id), None)
    if not task:
        raise ApiError("Task not found.", 404)

    if command_type == "toggle_task":
        task.score = 0 if task.score >= 70 else 100
    elif command_type == "update_task":
        if "title" in payload:
            task.title = str(payload["title"]).strip()
        if "score" in payload:
            task.score = clamp_score(payload["score"])
        if "icon" in payload:
            task.icon = str(payload["icon"]).strip() or None
        if "category" in payload:
            task.category = str(payload["category"]).strip() or None
        if "target" in payload:
            task.target = str(payload["target"]).strip() or None
        if "metric" in payload:
            task.metric = str(payload["metric"]).strip() or None
        if "note" in payload:
            task.note = str(payload["note"]).strip() or None
        if "tags" in payload:
            task.tags = [str(tag) for tag in payload["tags"]] if isinstance(payload["tags"], list) else []
    elif command_type == "archive_task":
        task.archived = True
    elif command_type == "restore_task":
        task.archived = None
    else:
        raise ApiError(f"Unsupported command type: {command_type}", 400)

    return target_date


def apply_pomodoro_command(conn: sqlite3.Connection, command_type: str, payload: dict[str, Any], client_selected_date: str | None) -> str:
    target_date = str(client_selected_date or today())
    now = now_iso()

    if command_type == "start_pomodoro":
        # 1. Cancel any currently running or paused sessions
        active = conn.execute("SELECT id, started_at, status, actual_seconds FROM pomodoro_sessions WHERE status IN ('running', 'paused')").fetchall()
        for row in active:
            accumulated = row["actual_seconds"] or 0
            if row["status"] == "running":
                started_dt = datetime.fromisoformat(row["started_at"])
                elapsed = int((now_dt() - started_dt).total_seconds())
                accumulated += elapsed
            conn.execute(
                "UPDATE pomodoro_sessions SET status = 'canceled', ended_at = ?, actual_seconds = ?, updated_at = ? WHERE id = ?",
                (now, max(0, accumulated), now, row["id"])
            )
        
        # 2. Insert new session
        task_id = payload.get("taskId")
        try:
            planned_seconds = int(payload.get("plannedSeconds") or 1500)
        except (TypeError, ValueError):
            planned_seconds = 1500
        planned_seconds = max(60, min(8 * 60 * 60, planned_seconds))
        mode = payload.get("mode")
        if mode not in ("focus", "short_break", "long_break"):
            mode = "focus"
        session_id = str(payload.get("sessionId") or uuid.uuid4())
        conn.execute(
            """
            INSERT INTO pomodoro_sessions (id, task_id, started_at, planned_seconds, status, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'running', ?, ?, ?)
            """,
            (session_id, task_id, now, planned_seconds, mode, now, now)
        )
    
    elif command_type == "stop_pomodoro":
        # Stop active session (could be running or paused)
        active_row = conn.execute("SELECT id, started_at, status, actual_seconds, planned_seconds FROM pomodoro_sessions WHERE status IN ('running', 'paused') LIMIT 1").fetchone()
        if not active_row:
            raise ApiError("No active Pomodoro session to stop.", 404)
        
        accumulated = active_row["actual_seconds"] or 0
        if active_row["status"] == "running":
            started_dt = datetime.fromisoformat(active_row["started_at"])
            elapsed = int((now_dt() - started_dt).total_seconds())
            accumulated += elapsed
        
        actual = min(active_row["planned_seconds"], max(0, accumulated))
        
        conn.execute(
            "UPDATE pomodoro_sessions SET status = 'completed', ended_at = ?, actual_seconds = ?, updated_at = ? WHERE id = ?",
            (now, actual, now, active_row["id"])
        )
    
    elif command_type == "cancel_pomodoro":
        # Cancel active session (could be running or paused)
        active_row = conn.execute("SELECT id, started_at, status, actual_seconds FROM pomodoro_sessions WHERE status IN ('running', 'paused') LIMIT 1").fetchone()
        if not active_row:
            raise ApiError("No active Pomodoro session to cancel.", 404)
        
        accumulated = active_row["actual_seconds"] or 0
        if active_row["status"] == "running":
            started_dt = datetime.fromisoformat(active_row["started_at"])
            elapsed = int((now_dt() - started_dt).total_seconds())
            accumulated += elapsed
        
        conn.execute(
            "UPDATE pomodoro_sessions SET status = 'canceled', ended_at = ?, actual_seconds = ?, updated_at = ? WHERE id = ?",
            (now, max(0, accumulated), now, active_row["id"])
        )
        
    elif command_type == "pause_pomodoro":
        # Pause running session
        active_row = conn.execute("SELECT id, started_at, actual_seconds FROM pomodoro_sessions WHERE status = 'running' LIMIT 1").fetchone()
        if not active_row:
            raise ApiError("No running Pomodoro session to pause.", 404)
        
        started_dt = datetime.fromisoformat(active_row["started_at"])
        elapsed = int((now_dt() - started_dt).total_seconds())
        accumulated = (active_row["actual_seconds"] or 0) + elapsed
        
        conn.execute(
            "UPDATE pomodoro_sessions SET status = 'paused', actual_seconds = ?, updated_at = ? WHERE id = ?",
            (accumulated, now, active_row["id"])
        )
        
    elif command_type == "resume_pomodoro":
        # Resume paused session
        active_row = conn.execute("SELECT id FROM pomodoro_sessions WHERE status = 'paused' LIMIT 1").fetchone()
        if not active_row:
            raise ApiError("No paused Pomodoro session to resume.", 404)
        
        conn.execute(
            "UPDATE pomodoro_sessions SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?",
            (now, now, active_row["id"])
        )
    
    else:
        raise ApiError(f"Unsupported command type: {command_type}", 400)
    
    return target_date


async def apply_logged_command(raw_command: dict[str, Any], *, raise_errors: bool = False) -> dict[str, Any]:
    command = normalize_command(raw_command)
    changed_date: str | None = command["client_selected_date"]
    version: int | None = None
    status = "succeeded"
    error_message: str | None = None
    state: dict[str, Any] | None = None

    async with mutation_lock:
        with get_db_connection() as conn:
            existing = conn.execute("SELECT * FROM command_log WHERE id = ?", (command["id"],)).fetchone()
            if existing:
                record = command_record(existing)
                store = load_store_from_db(conn)
                record["state"] = summarize(store, command["client_selected_date"] or today(), current_state_version(conn), conn)
                return record

            server_received_at = now_iso()
            conn.execute(
                """
                INSERT INTO command_log
                    (id, device_id, type, payload_json, client_selected_date, client_observed_at, server_received_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    command["id"],
                    command["device_id"],
                    command["type"],
                    json.dumps(command["payload"]),
                    command["client_selected_date"],
                    command["client_observed_at"],
                    server_received_at,
                ),
            )

            try:
                store = load_store_from_db(conn)
                if command["type"] in ("start_pomodoro", "stop_pomodoro", "cancel_pomodoro", "pause_pomodoro", "resume_pomodoro"):
                    changed_date = apply_pomodoro_command(conn, command["type"], command["payload"], command["client_selected_date"])
                else:
                    changed_date = apply_command_to_store(store, command["type"], command["payload"], command["client_selected_date"])
                    save_store_to_db(conn, store)
                version = bump_state_version(conn)
                state = summarize(store, changed_date, version, conn)
                conn.execute(
                    """
                    UPDATE command_log
                    SET status = 'succeeded', server_applied_at = ?, state_version = ?
                    WHERE id = ?
                    """,
                    (now_iso(), version, command["id"]),
                )
                if command["type"] not in ("start_pomodoro", "stop_pomodoro", "cancel_pomodoro", "pause_pomodoro", "resume_pomodoro"):
                    schedule_markdown_export()
            except Exception as error:
                status = "failed"
                error_message = str(error)
                conn.execute(
                    "UPDATE command_log SET status = 'failed', error = ?, server_applied_at = ? WHERE id = ?",
                    (error_message, now_iso(), command["id"]),
                )
                if raise_errors:
                    raise
            finally:
                saved = conn.execute("SELECT * FROM command_log WHERE id = ?", (command["id"],)).fetchone()

    if status == "succeeded" and version is not None:
        await publish_state_changed(version, changed_date)
    if raise_errors and status == "failed":
        raise ApiError(error_message or "Command failed.", 400)

    result = command_record(saved)
    if state is not None:
        result["state"] = state
    return result


async def read_state(target_date: str | None = None) -> dict[str, Any]:
    async with mutation_lock:
        with get_db_connection() as conn:
            store = load_store_from_db(conn)
            return summarize(store, target_date or today(), current_state_version(conn), conn)


def initialize_database() -> None:
    bootstrap_schema()
    with get_db_connection() as conn:
        if store_is_empty(conn):
            markdown = RECORDS_PATH.read_text(encoding="utf-8") if RECORDS_PATH.exists() else default_markdown()
            import_store_to_db(conn, parse_markdown_store(markdown))


app = FastAPI(title="LifeRL API")

cors_origins = [
    origin.strip()
    for origin in os.getenv("LIFERL_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    global markdown_export_task
    initialize_database()
    markdown_export_task = asyncio.create_task(markdown_export_loop())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    if markdown_export_task:
        markdown_export_task.cancel()
    await export_markdown_if_dirty(force=True)


@app.exception_handler(Exception)
async def exception_handler(_request: Request, error: Exception) -> JSONResponse:
    if isinstance(error, ApiError):
        return JSONResponse({"error": str(error)}, status_code=error.status)
    if isinstance(error, HTTPException):
        return JSONResponse({"error": str(error.detail)}, status_code=error.status_code)
    return JSONResponse({"error": str(error) or "Unexpected server error."}, status_code=500)


@app.get("/api/health")
def get_health() -> dict[str, Any]:
    with get_db_connection() as conn:
        version = current_state_version(conn)
    return {
        "ok": True,
        "recordsPath": str(RECORDS_PATH),
        "databasePath": str(DATABASE_PATH),
        "schema": "liferl.v1",
        "databaseSchema": DB_SCHEMA_VERSION,
        "version": version,
        "time": now_iso(),
    }


@app.get("/api/time")
def get_time() -> dict[str, Any]:
    current = now_dt()
    return {
        "serverTime": current.isoformat(),
        "serverDate": current.date().isoformat(),
        "timezone": current.tzname(),
        "utcOffsetSeconds": int(current.utcoffset().total_seconds()) if current.utcoffset() else 0,
    }


@app.get("/api/state")
async def get_state(date: str | None = None) -> dict[str, Any]:
    return await read_state(date or today())


@app.post("/api/tasks")
async def create_task(request: Request, date: str | None = None) -> dict[str, Any]:
    body = await request.json()
    result = await apply_logged_command(
        {
            "type": "create_task",
            "payload": body,
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/tasks/{task_id}/toggle")
async def toggle_task(task_id: str, date: str | None = None) -> dict[str, Any]:
    result = await apply_logged_command(
        {
            "type": "toggle_task",
            "payload": {"taskId": task_id},
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, request: Request, date: str | None = None) -> dict[str, Any]:
    payload = await request.json()
    payload["taskId"] = task_id
    result = await apply_logged_command(
        {
            "type": "update_task",
            "payload": payload,
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.delete("/api/tasks/{task_id}")
async def archive_task(task_id: str, date: str | None = None) -> dict[str, Any]:
    result = await apply_logged_command(
        {
            "type": "archive_task",
            "payload": {"taskId": task_id},
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/tasks/{task_id}/restore")
async def restore_task(task_id: str, date: str | None = None) -> dict[str, Any]:
    result = await apply_logged_command(
        {
            "type": "restore_task",
            "payload": {"taskId": task_id},
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/pomodoro/start")
async def start_pomodoro_route(request: Request, date: str | None = None) -> dict[str, Any]:
    body = await request.json()
    result = await apply_logged_command(
        {
            "type": "start_pomodoro",
            "payload": body,
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/pomodoro/stop")
async def stop_pomodoro_route(date: str | None = None) -> dict[str, Any]:
    result = await apply_logged_command(
        {
            "type": "stop_pomodoro",
            "payload": {},
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/pomodoro/cancel")
async def cancel_pomodoro_route(date: str | None = None) -> dict[str, Any]:
    result = await apply_logged_command(
        {
            "type": "cancel_pomodoro",
            "payload": {},
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/pomodoro/pause")
async def pause_pomodoro_route(date: str | None = None) -> dict[str, Any]:
    result = await apply_logged_command(
        {
            "type": "pause_pomodoro",
            "payload": {},
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/pomodoro/resume")
async def resume_pomodoro_route(date: str | None = None) -> dict[str, Any]:
    result = await apply_logged_command(
        {
            "type": "resume_pomodoro",
            "payload": {},
            "clientSelectedDate": date or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.patch("/api/day")
async def update_day(request: Request) -> dict[str, Any]:
    payload = await request.json()
    result = await apply_logged_command(
        {
            "type": "update_day",
            "payload": payload,
            "clientSelectedDate": payload.get("date") or today(),
            "deviceId": "online",
        },
        raise_errors=True,
    )
    return result["state"]


@app.post("/api/commands/batch")
async def apply_command_batch(request: Request) -> dict[str, Any]:
    body = await request.json()
    fallback_device_id = str(body.get("deviceId") or body.get("device_id") or "unknown")
    raw_commands = body.get("commands", [])
    if not isinstance(raw_commands, list):
        raise ApiError("commands must be a list.", 400)

    results = []
    for raw in raw_commands:
        if not isinstance(raw, dict):
            results.append({"status": "failed", "error": "Command must be an object."})
            continue
        normalized = normalize_command(raw, fallback_device_id)
        results.append(await apply_logged_command(normalized, raise_errors=False))

    async with mutation_lock:
        with get_db_connection() as conn:
            version = current_state_version(conn)
    return {"results": results, "version": version, "serverTime": now_iso()}


@app.get("/api/commands/{command_id}")
def get_command(command_id: str) -> dict[str, Any]:
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM command_log WHERE id = ?", (command_id,)).fetchone()
        if not row:
            raise ApiError("Command not found.", 404)
        return command_record(row)


@app.get("/api/events")
async def get_events(request: Request, since_version: int | None = None) -> StreamingResponse:
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
    event_subscribers.add(queue)

    async def event_stream() -> Any:
        try:
            with get_db_connection() as conn:
                version = current_state_version(conn)
            yield f"event: connected\ndata: {json.dumps({'version': version, 'serverTime': now_iso(), 'sinceVersion': since_version})}\n\n"

            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"event: heartbeat\ndata: {json.dumps({'serverTime': now_iso()})}\n\n"
        finally:
            event_subscribers.discard(queue)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
