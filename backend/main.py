from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

CALENDAR = "\U0001F4C5"
TARGET = "\U0001F3AF"
NOTE = "\U0001F4DD"

PROJECT_ROOT = Path.cwd()
CACHE_DIR = PROJECT_ROOT / ".liferl"
CACHE_PATH = CACHE_DIR / "cache.json"
CONFIG_PATH = CACHE_DIR / "config.json"


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


class SourceChangedError(Exception):
    status = 409

    def __init__(self) -> None:
        super().__init__("liferl.md changed before the app could save. Reload and try again.")


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def today() -> str:
    return datetime.now().astimezone().date().isoformat()


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


RECORDS_PATH = resolve_records_path()

STARTER_TASKS = [
    TaskSnapshot("guitar", "Guitar practice", 0, icon="\U0001F3B8", category="skill"),
    TaskSnapshot("gym", "Gym", 0, icon="\U0001F3CB\ufe0f", category="health"),
    TaskSnapshot("work", "Work", 0, icon="\U0001F4BC", category="career"),
    TaskSnapshot("walk-10k-steps", "Walk 10k steps", 0, icon="\U0001F6B6", category="health", target="10000 steps"),
]

memory_cache: dict[str, Any] | None = None
mutation_lock = asyncio.Lock()


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


def store_to_dict(store: Store) -> dict[str, Any]:
    return {"schema": store.schema, "days": [day_to_dict(day) for day in store.days]}


def dict_to_task(data: dict[str, Any]) -> TaskSnapshot:
    return TaskSnapshot(
        id=str(data.get("id", "")),
        title=str(data.get("title", data.get("id", ""))),
        score=clamp_score(data.get("score", 0)),
        icon=data.get("icon"),
        category=data.get("category"),
        target=data.get("target"),
        metric=data.get("metric"),
        tags=data.get("tags"),
        note=data.get("note"),
        archived=data.get("archived"),
    )


def dict_to_day(data: dict[str, Any]) -> DayBlock:
    return DayBlock(
        date=str(data.get("date", "")),
        mood=data.get("mood"),
        energy=data.get("energy"),
        sleep=data.get("sleep"),
        weight=data.get("weight"),
        note=data.get("note"),
        tasks=[dict_to_task(task) for task in data.get("tasks", [])],
    )


def dict_to_store(data: dict[str, Any]) -> Store:
    return Store(schema=str(data.get("schema", "liferl.v1")), days=[dict_to_day(day) for day in data.get("days", [])])


def clone_store(store: Store) -> Store:
    return copy.deepcopy(store)


def slugify(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower().strip())
    base = re.sub(r"^-+|-+$", "", base)[:42]
    return base or f"task-{int(time.time() * 1000)}"


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


def clone_tasks_for_new_day(tasks: list[TaskSnapshot]) -> list[TaskSnapshot]:
    cloned = clone_store(Store("liferl.v1", [DayBlock(date="clone", tasks=tasks)])).days[0].tasks
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


def hash_markdown(markdown: str) -> str:
    return hashlib.sha256(markdown.encode("utf-8")).hexdigest()


def default_markdown() -> str:
    return "[[life]] [[rl]] [[habit]]\n\n"


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
                    multiline_target = {"type": "task", "field": "note", "indent": 4}
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
                multiline_target = {"type": "day", "field": "note", "indent": 2}
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


def read_cache_file(source_hash: str) -> Store | None:
    try:
        cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        if (
            cache.get("schema") == "liferl.cache.v1"
            and cache.get("sourceSchema") == "liferl.v1"
            and cache.get("sourceHash") == source_hash
            and cache.get("store", {}).get("schema") == "liferl.v1"
            and isinstance(cache.get("store", {}).get("days"), list)
        ):
            return dict_to_store(cache["store"])
    except Exception:
        return None
    return None


def write_cache_file(source_hash: str, store: Store) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = CACHE_PATH.with_name(f"{CACHE_PATH.name}.{int(time.time() * 1000)}.tmp")
    temp_path.write_text(
        json.dumps(
            {
                "schema": "liferl.cache.v1",
                "sourceSchema": "liferl.v1",
                "sourceHash": source_hash,
                "generatedAt": datetime.now().astimezone().isoformat(),
                "store": store_to_dict(store),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    temp_path.replace(CACHE_PATH)


def read_store_state() -> tuple[Store, str]:
    global memory_cache
    markdown = RECORDS_PATH.read_text(encoding="utf-8") if RECORDS_PATH.exists() else default_markdown()
    source_hash = hash_markdown(markdown)

    if memory_cache and memory_cache.get("sourceHash") == source_hash:
        return clone_store(memory_cache["store"]), source_hash

    cached_store = read_cache_file(source_hash)
    if cached_store:
        memory_cache = {"sourceHash": source_hash, "store": clone_store(cached_store)}
        return cached_store, source_hash

    store = parse_markdown_store(markdown)
    memory_cache = {"sourceHash": source_hash, "store": clone_store(store)}
    try:
        write_cache_file(source_hash, store)
    except Exception:
        pass
    return clone_store(store), source_hash


def replace_records(markdown: str, rendered: str) -> str:
    if re.search(r"<records>[\s\S]*?</records>", markdown):
        return re.sub(r"<records>[\s\S]*?</records>", rendered, markdown, count=1)
    if "</records>" in markdown:
        return markdown.replace("</records>", rendered)
    return f"{markdown.rstrip()}\n\n{rendered}\n"


def write_store_state(store: Store, expected_source_hash: str | None = None) -> str:
    global memory_cache
    markdown = RECORDS_PATH.read_text(encoding="utf-8") if RECORDS_PATH.exists() else default_markdown()
    current_hash = hash_markdown(markdown)
    if expected_source_hash and current_hash != expected_source_hash:
        memory_cache = None
        raise SourceChangedError()

    rendered = render_store_v1(store)
    next_markdown = replace_records(markdown, rendered)

    if next_markdown != markdown:
        RECORDS_PATH.parent.mkdir(parents=True, exist_ok=True)
        RECORDS_PATH.write_text(next_markdown, encoding="utf-8")
        next_hash = hash_markdown(next_markdown)
        memory_cache = {"sourceHash": next_hash, "store": clone_store(store)}
        try:
            write_cache_file(next_hash, store)
        except Exception:
            pass
        return next_hash

    memory_cache = {"sourceHash": current_hash, "store": clone_store(store)}
    return current_hash


def summarize(store: Store, target_date: str | None = None) -> dict[str, Any]:
    date_value = assert_date(target_date or today())
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

    return {
        "date": date_value,
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
    }


async def mutate_store(mutator: Any, target_date: str | None = None) -> dict[str, Any]:
    async with mutation_lock:
        store, source_hash = read_store_state()
        mutator(store)
        summary = summarize(store, target_date)
        write_store_state(store, source_hash)
        return summary


async def read_and_normalize_store(target_date: str | None = None) -> dict[str, Any]:
    async with mutation_lock:
        store, _source_hash = read_store_state()
        return summarize(store, target_date)


def get_error_response(error: Exception) -> tuple[int, str]:
    if isinstance(error, SourceChangedError):
        return error.status, str(error)
    if isinstance(error, ApiError):
        return error.status, str(error)
    if isinstance(error, HTTPException):
        return error.status_code, str(error.detail)
    status = getattr(error, "status", 500)
    return int(status) if status else 500, str(error) or "Unexpected server error."


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


@app.exception_handler(Exception)
async def exception_handler(_request: Request, error: Exception) -> JSONResponse:
    status, message = get_error_response(error)
    return JSONResponse({"error": message}, status_code=status)


@app.get("/api/health")
def get_health() -> dict[str, Any]:
    return {"ok": True, "recordsPath": str(RECORDS_PATH), "schema": "liferl.v1", "time": datetime.now().astimezone().isoformat()}


@app.get("/api/state")
async def get_state(date: str | None = None) -> dict[str, Any]:
    return await read_and_normalize_store(date or today())


@app.post("/api/tasks")
async def create_task(request: Request, date: str | None = None) -> dict[str, Any]:
    body = await request.json()
    title = str(body.get("title", "")).strip()
    if not title:
        raise ApiError("Task title is required.", 400)
    target_date = date or today()

    def mutate(store: Store) -> None:
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
                score=clamp_score(body.get("score", body.get("reward", 0))),
                icon=str(body.get("icon")).strip() if body.get("icon") else None,
                category=str(body.get("category")).strip() if body.get("category") else None,
                target=str(body.get("target")).strip() if body.get("target") else None,
            )
        )

    return await mutate_store(mutate, target_date)


@app.post("/api/tasks/{task_id}/toggle")
async def toggle_task(task_id: str, date: str | None = None) -> dict[str, Any]:
    target_date = date or today()

    def mutate(store: Store) -> None:
        day_block = ensure_day_block(store, target_date)
        task = next((item for item in day_block.tasks if item.id == task_id), None)
        if not task:
            raise ApiError("Task not found.", 404)
        task.score = 0 if task.score >= 70 else 100

    return await mutate_store(mutate, target_date)


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, request: Request, date: str | None = None) -> dict[str, Any]:
    body = await request.json()
    target_date = date or today()

    def mutate(store: Store) -> None:
        day_block = ensure_day_block(store, target_date)
        task = next((item for item in day_block.tasks if item.id == task_id), None)
        if not task:
            raise ApiError("Task not found.", 404)
        if "title" in body:
            task.title = str(body["title"]).strip()
        if "score" in body:
            task.score = clamp_score(body["score"])
        if "icon" in body:
            task.icon = str(body["icon"]).strip() or None
        if "category" in body:
            task.category = str(body["category"]).strip() or None
        if "target" in body:
            task.target = str(body["target"]).strip() or None
        if "metric" in body:
            task.metric = str(body["metric"]).strip() or None
        if "note" in body:
            task.note = str(body["note"]).strip() or None
        if "tags" in body:
            task.tags = [str(tag) for tag in body["tags"]] if isinstance(body["tags"], list) else []

    return await mutate_store(mutate, target_date)


@app.delete("/api/tasks/{task_id}")
async def archive_task(task_id: str, date: str | None = None) -> dict[str, Any]:
    target_date = date or today()

    def mutate(store: Store) -> None:
        day_block = ensure_day_block(store, target_date)
        task = next((item for item in day_block.tasks if item.id == task_id), None)
        if not task:
            raise ApiError("Task not found.", 404)
        task.archived = True

    return await mutate_store(mutate, target_date)


@app.post("/api/tasks/{task_id}/restore")
async def restore_task(task_id: str, date: str | None = None) -> dict[str, Any]:
    target_date = date or today()

    def mutate(store: Store) -> None:
        day_block = ensure_day_block(store, target_date)
        task = next((item for item in day_block.tasks if item.id == task_id), None)
        if not task:
            raise ApiError("Task not found.", 404)
        task.archived = None

    return await mutate_store(mutate, target_date)


@app.patch("/api/day")
async def update_day(request: Request) -> dict[str, Any]:
    body = await request.json()
    target_date = str(body.get("date", today()))

    def mutate(store: Store) -> None:
        day_block = ensure_day_block(store, target_date)
        if "mood" in body:
            day_block.mood = None if body["mood"] is None else float(body["mood"])
        if "energy" in body:
            day_block.energy = None if body["energy"] is None else float(body["energy"])
        if "sleep" in body:
            day_block.sleep = None if body["sleep"] is None else str(body["sleep"]).strip()
        if "weight" in body:
            day_block.weight = None if body["weight"] is None else str(body["weight"]).strip()
        if "note" in body:
            day_block.note = None if body["note"] is None else str(body["note"]).strip()

    return await mutate_store(mutate, target_date)
