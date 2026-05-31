import { describe, expect, test } from "bun:test";
import {
  aggregateDayPoints,
  buildChartIndexes,
  buildDailyData,
  buildTaskStats,
  buildVisibleDates,
  linearSlope,
  resolveGranularity,
  taskSlopeForDates,
} from "./analytics";
import type { ChartEntry, Task } from "../types";

const tasks: Task[] = [
  { id: "guitar", title: "Guitar", reward: 100, createdAt: "2026-01-01", active: true, doneOnDate: false, doneToday: false },
  { id: "gym", title: "Gym", reward: 100, createdAt: "2026-01-02", active: true, doneOnDate: false, doneToday: false },
];

const entries: ChartEntry[] = [
  { date: "2026-01-01", taskId: "guitar", score: 50, done: false },
  { date: "2026-01-02", taskId: "guitar", score: 70, done: true },
  { date: "2026-01-02", taskId: "gym", score: 100, done: true },
  { date: "2026-01-03", taskId: "guitar", score: 100, done: true },
  { date: "2026-01-03", taskId: "gym", score: 20, done: false },
];

describe("analytics derived data", () => {
  test("uses all 0..100 scores for reward but only score >= 70 for completion", () => {
    const indexes = buildChartIndexes(entries);
    const daily = buildDailyData({
      dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
      selectedTaskIds: ["guitar", "gym"],
      entriesByDate: indexes.entriesByDate,
    });

    expect(daily).toEqual([
      { date: "2026-01-01", reward: 50, complete: false, expected: 1, completed: 0 },
      { date: "2026-01-02", reward: 170, complete: true, expected: 2, completed: 2 },
      { date: "2026-01-03", reward: 120, complete: false, expected: 2, completed: 1 },
    ]);
  });

  test("filters selected habits without rescanning every log for every day", () => {
    const indexes = buildChartIndexes(entries);
    const daily = buildDailyData({
      dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
      selectedTaskIds: ["gym"],
      entriesByDate: indexes.entriesByDate,
    });

    expect(daily).toEqual([
      { date: "2026-01-01", reward: 0, complete: false, expected: 0, completed: 0 },
      { date: "2026-01-02", reward: 100, complete: true, expected: 1, completed: 1 },
      { date: "2026-01-03", reward: 20, complete: false, expected: 1, completed: 0 },
    ]);
  });

  test("builds task stats over the visible date range", () => {
    const indexes = buildChartIndexes(entries);
    const stats = buildTaskStats({
      dates: ["2026-01-02", "2026-01-03"],
      tasks,
      entriesByTaskId: indexes.entriesByTaskId,
    });

    expect(stats).toEqual([
      { id: "guitar", title: "Guitar", completed: 2, totalDays: 2, rate: 100, rewardTotal: 170 },
      { id: "gym", title: "Gym", completed: 1, totalDays: 2, rate: 50, rewardTotal: 120 },
    ]);
  });

  test("updates historical daily reward from changed chart entries", () => {
    const changedEntries = entries.map((entry) =>
      entry.date === "2026-01-02" && entry.taskId === "guitar" ? { ...entry, score: 20, done: false } : entry,
    );
    const indexes = buildChartIndexes(changedEntries);
    const daily = buildDailyData({
      dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
      selectedTaskIds: ["guitar", "gym"],
      entriesByDate: indexes.entriesByDate,
    });

    expect(daily[1]).toEqual({ date: "2026-01-02", reward: 120, complete: false, expected: 2, completed: 1 });
  });

  test("limits visible date ranges from the end", () => {
    const dates = buildVisibleDates("2026-01-01", "2026-02-09", "30d");

    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-01-11");
    expect(dates[29]).toBe("2026-02-09");
  });

  test("supports short presets and custom day ranges", () => {
    expect(buildVisibleDates("2026-01-01", "2026-02-09", "7d")).toHaveLength(7);
    expect(buildVisibleDates("2026-01-01", "2026-02-09", "15d")).toHaveLength(15);
    expect(buildVisibleDates("2026-01-01", "2026-02-09", "custom", "2026-02-09", 12)).toHaveLength(12);
  });

  test("expands range only when selected past date falls outside trailing window", () => {
    const oldFocus = buildVisibleDates("2026-01-01", "2026-05-31", "30d", "2026-01-10");
    const nearFocus = buildVisibleDates("2026-01-01", "2026-05-31", "30d", "2026-05-28");

    expect(oldFocus[0]).toBe("2026-01-10");
    expect(oldFocus.at(-1)).toBe("2026-05-31");
    expect(nearFocus).toHaveLength(30);
    expect(nearFocus[0]).toBe("2026-05-02");
    expect(nearFocus.at(-1)).toBe("2026-05-31");
  });

  test("shrinks back after a day-one focus inside the same month", () => {
    const dayOneFocus = buildVisibleDates("2026-05-01", "2026-05-31", "30d", "2026-05-01");
    const nearTodayFocus = buildVisibleDates("2026-05-01", "2026-05-31", "30d", "2026-05-29");

    expect(dayOneFocus[0]).toBe("2026-05-01");
    expect(dayOneFocus.at(-1)).toBe("2026-05-31");
    expect(nearTodayFocus).toHaveLength(30);
    expect(nearTodayFocus[0]).toBe("2026-05-02");
    expect(nearTodayFocus).not.toContain("2026-05-01");
  });

  test("keeps all range unbounded by selected focus date", () => {
    const dates = buildVisibleDates("2026-01-01", "2026-05-31", "all", "2026-05-28");

    expect(dates[0]).toBe("2026-01-01");
    expect(dates.at(-1)).toBe("2026-05-31");
  });

  test("auto granularity switches from day to week to month", () => {
    expect(resolveGranularity("auto", 30)).toBe("day");
    expect(resolveGranularity("auto", 120)).toBe("week");
    expect(resolveGranularity("auto", 500)).toBe("month");
    expect(resolveGranularity("week", 10)).toBe("week");
  });

  test("aggregates daily points into weekly and monthly chart points", () => {
    const points = [
      { date: "2026-05-01", reward: 10, complete: false, expected: 1, completed: 0 },
      { date: "2026-05-02", reward: 20, complete: true, expected: 1, completed: 1 },
      { date: "2026-05-08", reward: 30, complete: true, expected: 1, completed: 1 },
    ];

    expect(aggregateDayPoints(points, "week").map((point) => point.reward)).toEqual([30, 30]);
    expect(aggregateDayPoints(points, "month")).toMatchObject([
      { date: "2026-05-01", endDate: "2026-05-08", reward: 60, expected: 3, completed: 2, complete: false },
    ]);
  });

  test("calculates signed linear slope", () => {
    expect(linearSlope([0, 10, 20])).toBe(10);
    expect(linearSlope([20, 10, 0])).toBe(-10);
    expect(linearSlope([5, 5, 5])).toBe(0);
  });

  test("calculates task slope over provided dates with missing entries as zero", () => {
    const indexes = buildChartIndexes(entries);

    expect(
      taskSlopeForDates("guitar", ["2026-01-01", "2026-01-02", "2026-01-03"], indexes.entriesByTaskId),
    ).toBe(25);
    expect(taskSlopeForDates("gym", ["2026-01-01", "2026-01-02", "2026-01-03"], indexes.entriesByTaskId)).toBe(10);
  });
});
