import type { ChartEntry, ChartGranularity, ChartRange, DayPoint, LogEntry, Task, TaskStat } from "../types";
import { dateRange, formatMonth, formatShortDate } from "./date";

export type ChartIndexes = {
  entriesByDate: Map<string, ChartEntry[]>;
  entriesByTaskId: Map<string, ChartEntry[]>;
};

export function rangeLimit(range: ChartRange, customDays: number) {
  if (range === "7d") return 7;
  if (range === "15d") return 15;
  if (range === "30d") return 30;
  if (range === "90d") return 90;
  if (range === "1y") return 365;
  if (range === "custom") return Math.max(1, Math.min(5000, Math.round(customDays) || 30));
  return Infinity;
}

export function buildVisibleDates(
  firstDate: string,
  currentDate: string,
  range: ChartRange,
  focusDate = currentDate,
  customDays = 30,
) {
  const allDates = dateRange(firstDate, currentDate);
  if (range === "all") return allDates;

  const limit = rangeLimit(range, customDays);
  const trailingDates = allDates.slice(-limit);
  if (!trailingDates.length || focusDate >= trailingDates[0]) return trailingDates;

  const focusIndex = allDates.indexOf(focusDate);
  if (focusIndex === -1) return trailingDates;

  return allDates.slice(focusIndex, allDates.length);
}

export function resolveGranularity(granularity: ChartGranularity, dayCount: number) {
  if (granularity !== "auto") return granularity;
  if (dayCount > 365) return "month";
  if (dayCount > 90) return "week";
  return "day";
}

export function aggregateDayPoints(days: DayPoint[], granularity: Exclude<ChartGranularity, "auto">): DayPoint[] {
  if (granularity === "day") return days;

  const buckets = new Map<string, DayPoint[]>();
  for (const day of days) {
    const key = granularity === "week" ? weekKey(day.date) : day.date.slice(0, 7);
    buckets.set(key, [...(buckets.get(key) ?? []), day]);
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const completed = bucket.reduce((sum, day) => sum + day.completed, 0);
    const expected = bucket.reduce((sum, day) => sum + day.expected, 0);
    return {
      date: first.date,
      endDate: last.date,
      label: granularity === "week" ? formatWeekLabel(first.date, last.date) : formatMonth(first.date),
      reward: bucket.reduce((sum, day) => sum + day.reward, 0),
      complete: expected > 0 && completed === expected,
      expected,
      completed,
    };
  });
}

function weekKey(date: string) {
  const weekStart = new Date(`${date}T00:00:00`);
  const day = weekStart.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + offset);
  return weekStart.toLocaleDateString("en-CA");
}

function formatWeekLabel(start: string, end: string) {
  if (start === end) return formatShortDate(start);
  return `${formatShortDate(start)}-${formatShortDate(end)}`;
}

export function buildChartIndexes(entries: ChartEntry[] | undefined, logs: LogEntry[] = []): ChartIndexes {
  const sourceEntries =
    entries && entries.length > 0
      ? entries
      : logs.map((log) => ({
          date: log.date,
          taskId: log.taskId,
          score: log.reward,
          done: true,
        }));

  const entriesByDate = new Map<string, ChartEntry[]>();
  const entriesByTaskId = new Map<string, ChartEntry[]>();

  for (const entry of sourceEntries) {
    const dateEntries = entriesByDate.get(entry.date) ?? [];
    dateEntries.push(entry);
    entriesByDate.set(entry.date, dateEntries);

    const taskEntries = entriesByTaskId.get(entry.taskId) ?? [];
    taskEntries.push(entry);
    entriesByTaskId.set(entry.taskId, taskEntries);
  }

  return { entriesByDate, entriesByTaskId };
}

export function buildDailyData({
  dates,
  selectedTaskIds,
  entriesByDate,
}: {
  dates: string[];
  selectedTaskIds: string[];
  entriesByDate: Map<string, ChartEntry[]>;
}): DayPoint[] {
  const selectedSet = new Set(selectedTaskIds);

  return dates.map((date) => {
    const dayEntries = (entriesByDate.get(date) ?? []).filter((entry) => selectedSet.has(entry.taskId));
    const completed = dayEntries.filter((entry) => entry.done).length;

    return {
      date,
      reward: dayEntries.reduce((sum, entry) => sum + entry.score, 0),
      complete: dayEntries.length > 0 && completed === dayEntries.length,
      expected: dayEntries.length,
      completed,
    };
  });
}

export function buildTaskStats({
  dates,
  tasks,
  entriesByTaskId,
}: {
  dates: string[];
  tasks: Task[];
  entriesByTaskId: Map<string, ChartEntry[]>;
}): TaskStat[] {
  return tasks.map((task) => {
    const visibleDateSet = new Set(dates);
    const taskEntries = (entriesByTaskId.get(task.id) ?? []).filter((entry) => visibleDateSet.has(entry.date));
    const completedDates = new Set(taskEntries.filter((entry) => entry.done).map((entry) => entry.date));
    const totalDays = new Set(taskEntries.map((entry) => entry.date)).size;

    return {
      id: task.id,
      title: task.title,
      completed: completedDates.size,
      totalDays,
      rate: totalDays ? Math.round((completedDates.size / totalDays) * 100) : 0,
      rewardTotal: taskEntries.reduce((sum, entry) => sum + entry.score, 0),
    };
  });
}

export function linearSlope(values: number[]) {
  if (values.length < 2) return 0;
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;

  values.forEach((value, index) => {
    numerator += (index - meanX) * (value - meanY);
    denominator += (index - meanX) ** 2;
  });

  return denominator ? numerator / denominator : 0;
}

export function taskSlopeForDates(taskId: string, dates: string[], entriesByTaskId: Map<string, ChartEntry[]>) {
  const entriesByDate = new Map((entriesByTaskId.get(taskId) ?? []).map((entry) => [entry.date, entry.score]));
  return linearSlope(dates.map((date) => entriesByDate.get(date) ?? 0));
}
