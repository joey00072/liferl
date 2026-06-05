import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

type TaskSnapshot = {
  id: string;
  title: string;
  score: number;
  icon?: string;
  category?: string;
  target?: string;
  metric?: string;
  tags?: string[];
  note?: string;
  archived?: boolean;
};

type DayBlock = {
  date: string;
  mood?: number;
  energy?: number;
  sleep?: string;
  weight?: string;
  note?: string;
  tasks: TaskSnapshot[];
};

type Store = {
  schema: "liferl.v1";
  days: DayBlock[];
};

type StoreRead = {
  store: Store;
  sourceHash: string;
};

type CacheFile = {
  schema: "liferl.cache.v1";
  sourceSchema: "liferl.v1";
  sourceHash: string;
  generatedAt: string;
  store: Store;
};

type LogEntry = {
  date: string;
  taskId: string;
  reward: number;
  completedAt: string;
};

type ChartEntry = {
  date: string;
  taskId: string;
  score: number;
  done: boolean;
};

type LegacyTask = {
  id: string;
  title: string;
  reward: number;
  createdAt: string;
  active: boolean;
};

const projectRoot = process.cwd();
const cacheDir = path.join(projectRoot, ".liferl");
const cachePath = path.join(cacheDir, "cache.json");
const configPath = path.join(cacheDir, "config.json");
export const recordsPath = resolveRecordsPath();
export const today = () => new Date().toLocaleDateString("en-CA");

let memoryCache: { sourceHash: string; store: Store } | null = null;
let mutationQueue = Promise.resolve();

const starterTasks: TaskSnapshot[] = [
  { id: "guitar", title: "Guitar practice", score: 0, icon: "🎸", category: "skill" },
  { id: "gym", title: "Gym", score: 0, icon: "🏋️", category: "health" },
  { id: "work", title: "Work", score: 0, icon: "💼", category: "career" },
  { id: "walk-10k-steps", title: "Walk 10k steps", score: 0, icon: "🚶", category: "health", target: "10000 steps" },
];

function resolveRecordsPath() {
  const envPath = process.env.LIFERL_RECORDS_PATH?.trim();
  if (envPath) return path.resolve(envPath);

  try {
    const config = JSON.parse(fsSync.readFileSync(configPath, "utf8")) as { recordsPath?: string };
    if (config.recordsPath) return path.resolve(config.recordsPath);
  } catch {
    // No local service config yet; fall back to the repo sample record file.
  }

  return path.join(projectRoot, "liferl.md");
}

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return base || `task-${Date.now()}`;
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error("Date must be YYYY-MM-DD.");
    Object.assign(error, { status: 400 });
    throw error;
  }
  return value;
}

function clampScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function cleanCell(input: string) {
  return String(input).replace(/\|/g, "/").replace(/\n/g, " ").trim();
}

function cloneStore(store: Store): Store {
  return structuredClone(store);
}

function cloneTasksForNewDay(tasks: TaskSnapshot[]) {
  return tasks.map((task) => ({
    ...task,
    score: 0,
    metric: undefined,
    note: undefined,
  }));
}

function createDayBlockFromHistory(store: Store, date: string): DayBlock {
  const normalizedDate = assertDate(date);
  const olderDays = store.days.filter((d) => d.date < normalizedDate).sort((a, b) => b.date.localeCompare(a.date));
  const latestDay = olderDays[0] || [...store.days].sort((a, b) => b.date.localeCompare(a.date))[0];
  const initialTasks = latestDay ? cloneTasksForNewDay(latestDay.tasks) : starterTasks.map((task) => ({ ...task }));

  return { date: normalizedDate, tasks: initialTasks };
}

function ensureDayBlock(store: Store, date: string) {
  const normalizedDate = assertDate(date);
  let dayBlock = store.days.find((d) => d.date === normalizedDate);
  if (dayBlock) return dayBlock;

  dayBlock = createDayBlockFromHistory(store, normalizedDate);
  store.days.push(dayBlock);
  store.days.sort((a, b) => a.date.localeCompare(b.date));
  return dayBlock;
}

function hashMarkdown(markdown: string) {
  return crypto.createHash("sha256").update(markdown).digest("hex");
}

function defaultMarkdown() {
  return "[[life]] [[rl]] [[habit]]\n\n";
}

class SourceChangedError extends Error {
  status = 409;

  constructor() {
    super("liferl.md changed before the app could save. Reload and try again.");
  }
}

function tableRows(block: string, heading: string) {
  const match = block.match(new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`));
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .slice(1)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function migrateLegacyStore(legacyTasks: LegacyTask[], legacyLogs: LogEntry[]): Store {
  const daysMap = new Map<string, DayBlock>();
  const dates = Array.from(new Set(legacyLogs.map((l) => l.date))).sort();
  const todayStr = today();
  if (!dates.includes(todayStr)) {
    dates.push(todayStr);
  }

  for (const date of dates) {
    const dayTasks: TaskSnapshot[] = [];
    const dayLogs = legacyLogs.filter((l) => l.date === date);
    const dayLogTaskIds = new Set(dayLogs.map((l) => l.taskId));

    const activeTasksForDay = legacyTasks.filter((t) => {
      if (t.createdAt > date) return false;
      return t.active || dayLogTaskIds.has(t.id);
    });

    for (const task of activeTasksForDay) {
      const log = dayLogs.find((l) => l.taskId === task.id);
      dayTasks.push({
        id: task.id,
        title: task.title,
        score: log ? 100 : 0,
        icon: task.id === "guitar" ? "🎸" : task.id === "gym" ? "🏋️" : task.id === "work" ? "💼" : task.id === "walk-10k-steps" ? "🚶" : undefined,
        category: task.id === "gym" || task.id === "walk-10k-steps" ? "health" : task.id === "guitar" ? "skill" : task.id === "work" ? "career" : undefined,
        target: task.id === "walk-10k-steps" ? "10000 steps" : undefined,
      });
    }

    daysMap.set(date, {
      date,
      tasks: dayTasks,
    });
  }

  const days = Array.from(daysMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  return { schema: "liferl.v1", days };
}

function parseStoreV1(block: string): Store {
  const lines = block.split("\n");
  const days: DayBlock[] = [];
  let currentDay: DayBlock | null = null;
  let currentTask: TaskSnapshot | null = null;
  let multilineTarget: { type: "day" | "task"; field: string; indent: number } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (multilineTarget) {
        if (multilineTarget.type === "day" && currentDay) {
          currentDay.note = (currentDay.note ?? "") + "\n";
        } else if (multilineTarget.type === "task" && currentTask) {
          currentTask.note = (currentTask.note ?? "") + "\n";
        }
      }
      continue;
    }

    const leadingSpaces = line.match(/^ */)?.[0].length ?? 0;

    if (multilineTarget) {
      if (leadingSpaces > multilineTarget.indent) {
        if (multilineTarget.type === "day" && currentDay) {
          currentDay.note = ((currentDay.note ?? "") + "\n" + trimmed).trim();
        } else if (multilineTarget.type === "task" && currentTask) {
          currentTask.note = ((currentTask.note ?? "") + "\n" + trimmed).trim();
        }
        continue;
      } else {
        multilineTarget = null;
      }
    }

    if (trimmed.startsWith("📅")) {
      const date = trimmed.replace("📅", "").trim();
      currentDay = { date, tasks: [] };
      days.push(currentDay);
      currentTask = null;
      continue;
    }

    if (currentDay) {
      if (trimmed.startsWith("🎯") && leadingSpaces === 2) {
        const id = trimmed.replace("🎯", "").trim();
        currentTask = { id, title: id, score: 0 };
        currentDay.tasks.push(currentTask);
        continue;
      }

      if (currentTask && leadingSpaces === 4) {
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex > 0) {
          const key = trimmed.slice(0, colonIndex).trim();
          const val = trimmed.slice(colonIndex + 1).trim();

          if (key === "note" && val === "") {
            multilineTarget = { type: "task", field: "note", indent: 4 };
          } else if (key === "title") currentTask.title = val;
          else if (key === "score") currentTask.score = clampScore(val);
          else if (key === "icon") currentTask.icon = val;
          else if (key === "category") currentTask.category = val;
          else if (key === "target") currentTask.target = val;
          else if (key === "metric") currentTask.metric = val;
          else if (key === "note") currentTask.note = val;
          else if (key === "archived") currentTask.archived = val === "true";
          else if (key === "tags") {
            currentTask.tags = val.split(",").map((t) => t.trim()).filter(Boolean);
          }
        }
        continue;
      }

      if (leadingSpaces === 2) {
        const colonIndex = trimmed.indexOf(":");
        if (trimmed === "📝") {
          multilineTarget = { type: "day", field: "note", indent: 2 };
        } else if (colonIndex > 0) {
          const key = trimmed.slice(0, colonIndex).trim();
          const val = trimmed.slice(colonIndex + 1).trim();
          if (key === "mood") currentDay.mood = Number(val) || undefined;
          else if (key === "energy") currentDay.energy = Number(val) || undefined;
          else if (key === "sleep") currentDay.sleep = val;
          else if (key === "weight") currentDay.weight = val;
          else if (key === "📝") currentDay.note = val;
        }
      }
    }
  }

  return { schema: "liferl.v1", days };
}

function renderStoreV1(store: Store): string {
  const lines = ["schema: liferl.v1", ""];

  for (const day of store.days) {
    lines.push(`📅 ${day.date}`);
    if (day.mood !== undefined) lines.push(`  mood: ${day.mood}`);
    if (day.energy !== undefined) lines.push(`  energy: ${day.energy}`);
    if (day.sleep) lines.push(`  sleep: ${day.sleep}`);
    if (day.weight) lines.push(`  weight: ${day.weight}`);
    if (day.note) {
      if (day.note.includes("\n")) {
        lines.push("  📝");
        lines.push(...day.note.split("\n").map((l) => `    ${l}`));
      } else {
        lines.push(`  📝 ${day.note}`);
      }
    }

    for (const task of day.tasks) {
      lines.push(`  🎯 ${task.id}`);
      if (task.icon) lines.push(`    icon: ${task.icon}`);
      lines.push(`    title: ${task.title}`);
      if (task.category) lines.push(`    category: ${task.category}`);
      if (task.target) lines.push(`    target: ${task.target}`);
      lines.push(`    score: ${task.score}`);
      if (task.archived) lines.push("    archived: true");
      if (task.metric) lines.push(`    metric: ${task.metric}`);
      if (task.tags && task.tags.length > 0) lines.push(`    tags: ${task.tags.join(", ")}`);
      if (task.note) {
        if (task.note.includes("\n")) {
          lines.push("    note:");
          lines.push(...task.note.split("\n").map((l) => `      ${l}`));
        } else {
          lines.push(`    note: ${task.note}`);
        }
      }
    }
    lines.push("");
  }

  return `<records>\n${lines.join("\n").trim()}\n</records>`;
}

function parseMarkdownStore(markdown: string): Store {
  const block = markdown.match(/<records>\n?([\s\S]*?)\n?<\/records>/)?.[1] ?? "";

  if (block.includes("schema: liferl.v1")) {
    return parseStoreV1(block);
  }

  const legacyTasks = tableRows(block, "Tasks").map(([id, title, reward, createdAt, active]) => ({
    id,
    title,
    reward: Number(reward) || 0,
    createdAt,
    active: active !== "false",
  }));
  const legacyLogs = tableRows(block, "Daily Log").map(([date, taskId, reward, completedAt]) => ({
    date,
    taskId,
    reward: Number(reward) || 0,
    completedAt,
  }));

  const tasks = legacyTasks.length ? legacyTasks : [
    { id: "guitar", title: "Guitar practice", reward: 15, createdAt: today(), active: true },
    { id: "gym", title: "Gym", reward: 25, createdAt: today(), active: true },
    { id: "work", title: "Work", reward: 30, createdAt: today(), active: true },
    { id: "walk-10k-steps", title: "Walk 10k steps", reward: 20, createdAt: today(), active: true },
  ];
  return migrateLegacyStore(tasks, legacyLogs);
}

async function readCacheFile(sourceHash: string): Promise<Store | null> {
  const raw = await fs.readFile(cachePath, "utf8").catch(() => "");
  if (!raw) return null;

  try {
    const cache = JSON.parse(raw) as CacheFile;
    if (
      cache.schema === "liferl.cache.v1" &&
      cache.sourceSchema === "liferl.v1" &&
      cache.sourceHash === sourceHash &&
      cache.store?.schema === "liferl.v1" &&
      Array.isArray(cache.store.days)
    ) {
      return cloneStore(cache.store);
    }
  } catch {
    return null;
  }

  return null;
}

async function writeCacheFile(sourceHash: string, store: Store) {
  const cache: CacheFile = {
    schema: "liferl.cache.v1",
    sourceSchema: "liferl.v1",
    sourceHash,
    generatedAt: new Date().toISOString(),
    store: cloneStore(store),
  };
  await fs.mkdir(cacheDir, { recursive: true });
  const tempPath = `${cachePath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(tempPath, cachePath);
}

async function readStoreState(): Promise<StoreRead> {
  const markdown = await fs.readFile(recordsPath, "utf8").catch(defaultMarkdown);
  const sourceHash = hashMarkdown(markdown);

  if (memoryCache?.sourceHash === sourceHash) {
    return { sourceHash, store: cloneStore(memoryCache.store) };
  }

  const cachedStore = await readCacheFile(sourceHash);
  if (cachedStore) {
    memoryCache = { sourceHash, store: cloneStore(cachedStore) };
    return { sourceHash, store: cachedStore };
  }

  const store = parseMarkdownStore(markdown);
  memoryCache = { sourceHash, store: cloneStore(store) };
  await writeCacheFile(sourceHash, store).catch(() => undefined);
  return { sourceHash, store: cloneStore(store) };
}

function replaceRecords(markdown: string, rendered: string) {
  let nextMarkdown = markdown;

  if (/<records>[\s\S]*?<\/records>/.test(markdown)) {
    nextMarkdown = markdown.replace(/<records>[\s\S]*?<\/records>/, rendered);
  } else if (markdown.includes("</records>")) {
    nextMarkdown = markdown.replace("</records>", rendered);
  } else {
    nextMarkdown = `${markdown.trimEnd()}\n\n${rendered}\n`;
  }

  return nextMarkdown;
}

async function writeStoreState(store: Store, expectedSourceHash?: string) {
  const markdown = await fs.readFile(recordsPath, "utf8").catch(defaultMarkdown);
  const currentHash = hashMarkdown(markdown);
  if (expectedSourceHash && currentHash !== expectedSourceHash) {
    memoryCache = null;
    throw new SourceChangedError();
  }

  const rendered = renderStoreV1(store);
  const nextMarkdown = replaceRecords(markdown, rendered);

  if (nextMarkdown !== markdown) {
    await fs.writeFile(recordsPath, nextMarkdown, "utf8");
    const nextHash = hashMarkdown(nextMarkdown);
    memoryCache = { sourceHash: nextHash, store: cloneStore(store) };
    await writeCacheFile(nextHash, store).catch(() => undefined);
    return nextHash;
  }

  memoryCache = { sourceHash: currentHash, store: cloneStore(store) };
  return currentHash;
}

function withMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation, operation);
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function mutateStore(mutator: (store: Store) => void | Promise<void>, targetDate?: string) {
  return withMutation(async () => {
    const { store, sourceHash } = await readStoreState();
    await mutator(store);
    const summary = summarize(store, targetDate);
    await writeStoreState(store, sourceHash);
    return summary;
  });
}

async function readAndNormalizeStore(targetDate?: string) {
  return withMutation(async () => {
    const { store } = await readStoreState();
    return summarize(store, targetDate);
  });
}

export function getErrorResponse(error: unknown) {
  return {
    status:
      error instanceof SourceChangedError
        ? error.status
        : typeof error === "object" && error && "status" in error
          ? Number(error.status) || 500
          : 500,
    message: error instanceof Error ? error.message : "Unexpected server error.",
  };
}

function summarize(store: Store, targetDate: string = today()) {
  const date = assertDate(targetDate);
  const existingDayBlock = store.days.find((d) => d.date === date);
  const dayBlock = existingDayBlock ?? createDayBlockFromHistory(store, date);
  const activeTasks = dayBlock.tasks.filter((task) => !task.archived);
  const archivedTasks = dayBlock.tasks.filter((task) => task.archived);
  const logs: LogEntry[] = [];
  const chartEntries: ChartEntry[] = [];
  const sortedDays = existingDayBlock
    ? [...store.days].sort((a, b) => a.date.localeCompare(b.date))
    : [...store.days, dayBlock].sort((a, b) => a.date.localeCompare(b.date));

  for (const day of sortedDays) {
    for (const task of day.tasks) {
      if (task.archived) continue;
      chartEntries.push({
        date: day.date,
        taskId: task.id,
        score: task.score,
        done: task.score >= 70,
      });

      if (task.score >= 70) {
        logs.push({
          date: day.date,
          taskId: task.id,
          reward: task.score,
          completedAt: day.date + "T12:00:00.000Z",
        });
      }
    }
  }

  const dayLogs = logs.filter((l) => l.date === date);
  const doneIds = new Set(dayLogs.map((l) => l.taskId));

  let totalReward = 0;
  for (const day of store.days) {
    for (const task of day.tasks) {
      if (task.archived) continue;
      totalReward += task.score;
    }
  }

  const dayReward = activeTasks.reduce((sum, t) => sum + t.score, 0);
  const possibleDayReward = activeTasks.length * 100;

  // Find earliest occurrence of each task ID to use as its createdAt date
  const taskCreatedDates = new Map<string, string>();
  for (const day of sortedDays) {
    for (const task of day.tasks) {
      if (task.archived) continue;
      if (!taskCreatedDates.has(task.id)) {
        taskCreatedDates.set(task.id, day.date);
      }
    }
  }

  const daily = sortedDays.map((day) => {
    const dayActiveTasks = day.tasks.filter((task) => !task.archived);
    const completed = dayActiveTasks.filter((task) => task.score >= 70).length;
    return {
      date: day.date,
      reward: dayActiveTasks.reduce((sum, task) => sum + task.score, 0),
      complete: dayActiveTasks.length > 0 && completed === dayActiveTasks.length,
      expected: dayActiveTasks.length,
      completed,
    };
  });

  const taskStatsMap = new Map<string, { id: string; title: string; completed: number; totalDays: number; rewardTotal: number }>();
  for (const day of sortedDays) {
    for (const task of day.tasks) {
      if (task.archived) continue;
      const stat = taskStatsMap.get(task.id) ?? {
        id: task.id,
        title: task.title,
        completed: 0,
        totalDays: 0,
        rewardTotal: 0,
      };
      stat.title = task.title;
      stat.totalDays += 1;
      stat.rewardTotal += task.score;
      if (task.score >= 70) stat.completed += 1;
      taskStatsMap.set(task.id, stat);
    }
  }

  const taskStats = Array.from(taskStatsMap.values()).map((stat) => ({
    ...stat,
    rate: stat.totalDays ? Math.round((stat.completed / stat.totalDays) * 100) : 0,
  }));

  return {
    date,
    dayNote: dayBlock.note,
    mood: dayBlock.mood,
    energy: dayBlock.energy,
    sleep: dayBlock.sleep,
    weight: dayBlock.weight,
    totalReward,
    dayReward,
    possibleDayReward,
    completedDay: doneIds.size,
    totalDay: activeTasks.length,
    todayReward: dayReward,
    possibleTodayReward: possibleDayReward,
    completedToday: doneIds.size,
    totalToday: activeTasks.length,
    tasks: activeTasks.map((t) => ({
      id: t.id,
      title: t.title,
      reward: 100,
      createdAt: taskCreatedDates.get(t.id) || date,
      active: true,
      doneOnDate: doneIds.has(t.id),
      doneToday: doneIds.has(t.id),
      icon: t.icon,
      category: t.category,
      target: t.target,
      score: t.score,
      metric: t.metric,
      note: t.note,
      archived: t.archived,
    })),
    archivedTasks: archivedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      reward: 100,
      createdAt: taskCreatedDates.get(t.id) || date,
      active: false,
      doneOnDate: doneIds.has(t.id),
      doneToday: doneIds.has(t.id),
      icon: t.icon,
      category: t.category,
      target: t.target,
      score: t.score,
      metric: t.metric,
      note: t.note,
      archived: true,
    })),
    logs,
    charts: {
      firstDate: sortedDays[0]?.date ?? date,
      currentDate: date,
      entries: chartEntries,
      daily,
      taskStats,
    },
  };
}

export function getHealth() {
  return {
    ok: true,
    recordsPath,
    schema: "liferl.v1",
    time: new Date().toISOString(),
  };
}

export async function getState(date: string = today()) {
  return readAndNormalizeStore(date);
}

export async function createTask(date: string = today(), body: Record<string, unknown>) {
  const title = String(body.title ?? "").trim();
  if (!title) {
    const error = new Error("Task title is required.");
    Object.assign(error, { status: 400 });
    throw error;
  }

  return mutateStore((store) => {
    const dayBlock = ensureDayBlock(store, date);

    const idBase = slugify(title);
    let id = idBase;
    let i = 2;

    const allTaskIds = new Set<string>();
    for (const day of store.days) {
      for (const t of day.tasks) {
        allTaskIds.add(t.id);
      }
    }
    while (allTaskIds.has(id)) id = `${idBase}-${i++}`;

    dayBlock.tasks.push({
      id,
      title,
      score: clampScore(body.score ?? body.reward ?? 0),
      icon: body.icon ? String(body.icon).trim() : undefined,
      category: body.category ? String(body.category).trim() : undefined,
      target: body.target ? String(body.target).trim() : undefined,
    });
  }, date);
}

export async function toggleTask(date: string = today(), id: string) {
  return mutateStore((store) => {
    const dayBlock = ensureDayBlock(store, date);
    const task = dayBlock.tasks.find((t) => t.id === id);
    if (!task) {
      const error = new Error("Task not found.");
      Object.assign(error, { status: 404 });
      throw error;
    }

    task.score = task.score >= 70 ? 0 : 100;
  }, date);
}

export async function updateTask(date: string = today(), id: string, body: Record<string, unknown>) {
  return mutateStore((store) => {
    const dayBlock = ensureDayBlock(store, date);

    const task = dayBlock.tasks.find((t) => t.id === id);
    if (!task) {
      const error = new Error("Task not found.");
      Object.assign(error, { status: 404 });
      throw error;
    }

    if (body.title !== undefined) task.title = String(body.title).trim();
    if (body.score !== undefined) task.score = clampScore(body.score);
    if (body.icon !== undefined) task.icon = String(body.icon).trim() || undefined;
    if (body.category !== undefined) task.category = String(body.category).trim() || undefined;
    if (body.target !== undefined) task.target = String(body.target).trim() || undefined;
    if (body.metric !== undefined) task.metric = String(body.metric).trim() || undefined;
    if (body.note !== undefined) task.note = String(body.note).trim() || undefined;
    if (body.tags !== undefined) {
      task.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    }
  }, date);
}

export async function archiveTask(date: string = today(), id: string) {
  return mutateStore((store) => {
    const dayBlock = ensureDayBlock(store, date);
    const task = dayBlock.tasks.find((t) => t.id === id);
    if (!task) {
      const error = new Error("Task not found.");
      Object.assign(error, { status: 404 });
      throw error;
    }

    task.archived = true;
  }, date);
}

export async function restoreTask(date: string = today(), id: string) {
  return mutateStore((store) => {
    const dayBlock = ensureDayBlock(store, date);
    const task = dayBlock.tasks.find((t) => t.id === id);
    if (!task) {
      const error = new Error("Task not found.");
      Object.assign(error, { status: 404 });
      throw error;
    }

    task.archived = undefined;
  }, date);
}

export async function updateDay(body: Record<string, unknown>) {
  const date = String(body.date ?? today());

  return mutateStore((store) => {
    const dayBlock = ensureDayBlock(store, date);

    if (body.mood !== undefined) dayBlock.mood = body.mood === null ? undefined : Number(body.mood);
    if (body.energy !== undefined) dayBlock.energy = body.energy === null ? undefined : Number(body.energy);
    if (body.sleep !== undefined) dayBlock.sleep = body.sleep === null ? undefined : String(body.sleep).trim();
    if (body.weight !== undefined) dayBlock.weight = body.weight === null ? undefined : String(body.weight).trim();
    if (body.note !== undefined) dayBlock.note = body.note === null ? undefined : String(body.note).trim();

  }, date);
}
