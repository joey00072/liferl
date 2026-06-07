import { motion } from "framer-motion";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import {
  aggregateDayPoints,
  buildChartIndexes,
  buildDailyData,
  buildTaskStats,
  buildVisibleDates,
  recentEmaSlope,
  resolveGranularity,
  taskEmaSlopeForDates,
} from "../../lib/analytics";
import { streaks } from "../../lib/chart";
import type { ChartGranularity, ChartRange, ChartsState, LogEntry, Task } from "../../types";
import { HabitChip, ToggleButton } from "./Controls";
import { DailyRewardChart } from "./DailyRewardChart";
import { formatSlope, MiniMetric, slopeTone, TaskConsistencyBar } from "./Metrics";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function ChartsPanel({
  charts,
  logs,
  tasks,
  currentDate,
  focusDate,
  selectedTaskIds,
  onSelectedTaskIdsChange,
}: {
  charts?: ChartsState;
  logs: LogEntry[];
  tasks: Task[];
  currentDate: string;
  focusDate: string;
  selectedTaskIds: string[];
  onSelectedTaskIdsChange: (taskIds: string[]) => void;
}) {
  const [showBars, setShowBars] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [smoothing, setSmoothing] = useState(0.82);
  const [range, setRange] = useState<ChartRange>("15d");
  const [customDays, setCustomDays] = useState(45);
  const [granularity, setGranularity] = useState<ChartGranularity>("auto");
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const chartIndexes = useMemo(() => buildChartIndexes(charts?.entries, logs), [charts?.entries, logs]);
  const taskOptions = useMemo(() => {
    const options = new Map<string, Task>();

    for (const stat of charts?.taskStats ?? []) {
      options.set(stat.id, {
        id: stat.id,
        title: stat.title,
        reward: 100,
        createdAt: charts?.firstDate ?? currentDate,
        active: true,
        doneOnDate: false,
        doneToday: false,
      });
    }

    for (const task of tasks) {
      options.set(task.id, task);
    }

    for (const entry of charts?.entries ?? []) {
      if (!options.has(entry.taskId)) {
        options.set(entry.taskId, {
          id: entry.taskId,
          title: entry.taskId,
          reward: 100,
          createdAt: entry.date,
          active: true,
          doneOnDate: false,
          doneToday: false,
        });
      }
    }

    return Array.from(options.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [charts?.entries, charts?.firstDate, charts?.taskStats, currentDate, tasks]);
  const allTaskIds = useMemo(() => taskOptions.map((task) => task.id), [taskOptions]);
  const selectedSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const allSelected = taskOptions.length > 0 && allTaskIds.every((id) => selectedSet.has(id));
  const firstDate = useMemo(() => {
    const candidates = [
      charts?.firstDate,
      ...taskOptions.map((task) => task.createdAt),
      ...logs.map((log) => log.date),
      ...(charts?.entries ?? []).map((entry) => entry.date),
      currentDate,
    ].filter(Boolean);
    return candidates.sort()[0] ?? currentDate;
  }, [charts?.entries, charts?.firstDate, currentDate, logs, taskOptions]);
  const dates = useMemo(
    () => buildVisibleDates(firstDate, currentDate, range, focusDate, customDays),
    [currentDate, customDays, firstDate, focusDate, range],
  );
  const slopeDates = useMemo(
    () => buildVisibleDates(firstDate, currentDate, "all"),
    [currentDate, firstDate],
  );
  const dailyData = useMemo(
    () =>
      buildDailyData({
        dates,
        selectedTaskIds,
        entriesByDate: chartIndexes.entriesByDate,
      }),
    [chartIndexes.entriesByDate, dates, selectedTaskIds],
  );
  const slopeDailyData = useMemo(
    () =>
      buildDailyData({
        dates: slopeDates,
        selectedTaskIds,
        entriesByDate: chartIndexes.entriesByDate,
      }),
    [chartIndexes.entriesByDate, selectedTaskIds, slopeDates],
  );
  const consistency = useMemo(
    () =>
      buildTaskStats({
        dates,
        tasks: taskOptions,
        entriesByTaskId: chartIndexes.entriesByTaskId,
      }),
    [chartIndexes.entriesByTaskId, dates, taskOptions],
  );
  const totalSlope = useMemo(
    () => recentEmaSlope(slopeDailyData.map((day) => day.reward), smoothing),
    [slopeDailyData, smoothing],
  );
  const taskSlopes = useMemo(() => {
    const slopes = new Map<string, number>();

    for (const task of taskOptions) {
      slopes.set(task.id, taskEmaSlopeForDates(task.id, slopeDates, chartIndexes.entriesByTaskId, smoothing));
    }

    return slopes;
  }, [chartIndexes.entriesByTaskId, slopeDates, smoothing, taskOptions]);

  const completeDays = dailyData.filter((day) => day.complete).length;
  const attemptedDays = dailyData.filter((day) => day.expected > 0).length;
  const completionRate = attemptedDays ? Math.round((completeDays / attemptedDays) * 100) : 0;
  const selectedStreaks = streaks(dailyData);
  const resolvedGranularity = useMemo(
    () => resolveGranularity(granularity, dailyData.length),
    [dailyData.length, granularity],
  );
  const chartData = useMemo(
    () => aggregateDayPoints(dailyData, resolvedGranularity),
    [dailyData, resolvedGranularity],
  );

  function toggleTask(taskId: string) {
    onSelectedTaskIdsChange(
      selectedSet.has(taskId) ? selectedTaskIds.filter((id) => id !== taskId) : [...selectedTaskIds, taskId],
    );
  }

  function toggleAll() {
    onSelectedTaskIdsChange(allSelected ? [] : allTaskIds);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* Label row + Chart options dropdown */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Behavior trend
        </h2>
        <Popover open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <SlidersHorizontal className="size-3.5" />
              Options
              <ChevronDown className={`size-3 transition-transform ${isOptionsOpen ? "rotate-180" : ""}`} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(320px,calc(100vw-2rem))] p-4">
            <div className="flex flex-wrap gap-1.5">
              <ToggleButton active={showBars} onClick={() => setShowBars((v) => !v)}>Bars</ToggleButton>
              <ToggleButton active={showEma} onClick={() => setShowEma((v) => !v)}>EMA</ToggleButton>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">Range</div>
              <div className="grid grid-cols-4 gap-1">
                {(["7d", "15d", "30d", "90d", "custom", "all"] as ChartRange[]).map((item) => (
                  <ToggleButton key={item} active={range === item} onClick={() => setRange(item)}>
                    {item === "custom" ? "Custom" : item}
                  </ToggleButton>
                ))}
              </div>
              {range === "custom" ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    value={customDays}
                    onChange={(event) => setCustomDays(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))}
                    className="h-8 w-24 rounded-md border border-zinc-200 bg-white px-2 text-sm tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-emerald-950"
                  />
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">days ending today</span>
                </div>
              ) : null}
            </div>
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">View</div>
              <div className="grid grid-cols-4 gap-1">
                {(["auto", "day", "week", "month"] as ChartGranularity[]).map((item) => (
                  <ToggleButton key={item} active={granularity === item} onClick={() => setGranularity(item)}>
                    {item}
                  </ToggleButton>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-600">
                Current: {resolvedGranularity}. {dailyData.length} days, {chartData.length} points.
              </p>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label htmlFor="smoothing" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Smoothing
                </label>
                <span className="text-xs tabular-nums text-zinc-400">{smoothing.toFixed(2)}</span>
              </div>
              <input
                id="smoothing"
                type="range"
                min="0.1"
                max="0.99"
                step="0.01"
                value={smoothing}
                disabled={!showEma}
                onChange={(e) => setSmoothing(Number(e.target.value))}
                className="mt-1.5 w-full accent-emerald-600 disabled:opacity-40"
              />
              <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-600">Higher = smoother.</p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-4 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:border-zinc-200 dark:[&>*:nth-child(even)]:border-zinc-800 sm:[&>*+*]:border-l sm:[&>*+*]:border-zinc-200 dark:sm:[&>*+*]:border-zinc-800">
        <MiniMetric label="Full days" value={`${completeDays}/${attemptedDays}`} />
        <MiniMetric label="Rate" value={`${completionRate}%`} />
        <MiniMetric label="Streak" value={`${selectedStreaks.current}d`} />
        <MiniMetric label="7d slope" value={formatSlope(totalSlope)} tone={slopeTone(totalSlope)} />
      </div>

      {/* Chart — full width */}
      <div>
        <DailyRewardChart
          data={chartData}
          showBars={showBars && chartData.length <= 365}
          showEma={showEma}
          smoothing={smoothing}
          granularity={resolvedGranularity}
        />
      </div>

      {/* Filter chips — always below the chart */}
      <div className="flex flex-wrap gap-1.5">
        <HabitChip active={allSelected} onClick={toggleAll}>All</HabitChip>
        {taskOptions.map((task) => (
          <HabitChip key={task.id} active={selectedSet.has(task.id)} onClick={() => toggleTask(task.id)}>
            {task.title}
          </HabitChip>
        ))}
      </div>

      {/* Consistency section */}
      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Consistency
          </h2>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Best {selectedStreaks.best}d streak</span>
        </div>
        <div className="hidden border-b border-zinc-200 pb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-500 sm:grid sm:grid-cols-[minmax(110px,170px)_minmax(140px,1fr)_76px_92px] sm:gap-4">
          <span>Habit</span>
          <span>Progress</span>
          <span className="border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">Done</span>
          <span className="border-l border-zinc-200 pl-4 text-right dark:border-zinc-800">Rate / 7d</span>
        </div>
        <div>
          {consistency.map((task) => (
            <TaskConsistencyBar
              key={task.id}
              title={task.title}
              completed={task.completed}
              totalDays={task.totalDays}
              rate={task.rate}
              rewardTotal={task.rewardTotal}
              slope={taskSlopes.get(task.id) ?? 0}
            />
          ))}
          {consistency.length === 0 && (
            <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-600">No data yet.</p>
          )}
        </div>
      </div>

    </motion.div>
  );
}
