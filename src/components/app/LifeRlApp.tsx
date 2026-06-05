"use client";

import { RotateCcw } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { requestState } from "../../api";
import { ChartsPanel } from "../analytics/ChartsPanel";
import { DayNotePanel } from "../dashboard/DayNotePanel";
import { QuestPanel } from "../dashboard/QuestPanel";
import { StatStrip } from "../dashboard/StatStrip";
import { NewQuestForm } from "../sidebar/NewQuestForm";
import { getTodayString, latestDate } from "../../lib/date";
import { applyCustomTheme, clearCustomTheme, type ColorMode } from "../../lib/theme";
import type { State } from "../../types";
import { MobileNav } from "./MobileNav";
import { TopBar } from "./TopBar";
import type { MobilePanel } from "./types";

export default function LifeRlApp() {
  const [state, setState] = useState<State | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => getTodayString());
  const stateRequestId = useRef(0);
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState(10);
  const [error, setError] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [didSeedSelection, setDidSeedSelection] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("habits");
  const [theme, setTheme] = useState<ColorMode>(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("liferl-theme") === "dark" ? "dark" : "light";
  });
  const [themePreset, setThemePreset] = useState<string>(() => {
    if (typeof window === "undefined") return "rose";
    return localStorage.getItem("liferl-theme-preset") || "rose";
  });
  const [customSeedColor, setCustomSeedColor] = useState<string>(() => {
    if (typeof window === "undefined") return "#10b981";
    return localStorage.getItem("liferl-custom-seed") || "#10b981";
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const requestId = ++stateRequestId.current;
    requestState(`/api/state?date=${selectedDate}`)
      .then((next) => {
        if (requestId === stateRequestId.current) {
          setState(next);
        }
      })
      .catch((err) => {
        if (requestId === stateRequestId.current) {
          setError(err.message);
        }
      });
  }, [selectedDate]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("liferl-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (themePreset === "slate") {
      document.documentElement.removeAttribute("data-theme");
      clearCustomTheme();
    } else if (themePreset === "custom") {
      document.documentElement.removeAttribute("data-theme");
      applyCustomTheme(customSeedColor, theme === "dark");
      localStorage.setItem("liferl-custom-seed", customSeedColor);
    } else {
      document.documentElement.setAttribute("data-theme", themePreset);
      clearCustomTheme();
    }
    localStorage.setItem("liferl-theme-preset", themePreset);
  }, [themePreset, theme, customSeedColor]);

  useEffect(() => {
    if (state && !didSeedSelection) {
      const allIds = new Set([
        ...state.tasks.map((task) => task.id),
        ...state.charts.entries.map((entry) => entry.taskId),
      ]);
      setSelectedTaskIds(Array.from(allIds));
      setDidSeedSelection(true);
    }
  }, [didSeedSelection, state]);

  useEffect(() => {
    if (!state || !didSeedSelection) return;
    const allIds = new Set([
      ...state.tasks.map((task) => task.id),
      ...state.charts.entries.map((entry) => entry.taskId),
    ]);
    setSelectedTaskIds((current) => {
      const merged = new Set(current);
      let changed = false;
      for (const id of allIds) {
        if (!merged.has(id)) {
          merged.add(id);
          changed = true;
        }
      }
      return changed ? Array.from(merged) : current;
    });
  }, [didSeedSelection, state]);

  const progress = useMemo(() => {
    if (!state?.possibleDayReward) return 0;
    return Math.round((state.dayReward / state.possibleDayReward) * 100);
  }, [state]);

  const chartEndDate = useMemo(() => {
    if (!state) return getTodayString();
    return latestDate([
      getTodayString(),
      state.date,
      state.charts.currentDate,
      ...state.charts.daily.map((day) => day.date),
      ...state.charts.entries.map((entry) => entry.date),
    ]) ?? getTodayString();
  }, [state]);


  async function addTask(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!state) return;
    try {
      const next = await requestState(`/api/tasks?date=${state.date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, reward }),
      });
      setState(next);
      setTitle("");
      setReward(10);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add task.");
    }
  }

  async function toggleTask(taskId: string) {
    setError("");
    if (!state) return;
    try {
      setState(await requestState(`/api/tasks/${taskId}/toggle?date=${state.date}`, { method: "POST" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task.");
    }
  }

  async function removeTask(taskId: string) {
    setError("");
    if (!state) return;
    try {
      setState(await requestState(`/api/tasks/${taskId}?date=${state.date}`, { method: "DELETE" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive task.");
    }
  }

  async function restoreTask(taskId: string) {
    setError("");
    if (!state) return;
    try {
      setState(await requestState(`/api/tasks/${taskId}/restore?date=${state.date}`, { method: "POST" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore task.");
    }
  }

  async function updateTask(taskId: string, nextTitle: string, nextScore: number, nextNote: string) {
    setError("");
    if (!state) return;
    try {
      setState(
        await requestState(`/api/tasks/${taskId}?date=${state.date}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, score: nextScore, note: nextNote }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task.");
    }
  }

  async function updateDayNote(nextNote: string) {
    setError("");
    if (!state) return;
    try {
      setState(
        await requestState("/api/day", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: state.date, note: nextNote.trim() || null }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save note.");
    }
  }

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <RotateCcw className="size-4 animate-spin" />
          Loading
        </div>
      </main>
    );
  }

  const habitsSection = (
    <section className="min-w-0 space-y-6">
      <QuestPanel
        date={state.date}
        tasks={state.tasks}
        archivedTasks={state.archivedTasks}
        progress={progress}
        onToggleTask={toggleTask}
        onUpdateTask={updateTask}
        onRemoveTask={removeTask}
        onRestoreTask={restoreTask}
      />
      <DayNotePanel date={state.date} note={state.dayNote} onSave={updateDayNote} />
      <NewQuestForm
        title={title}
        reward={reward}
        error={error}
        onTitleChange={setTitle}
        onRewardChange={setReward}
        onSubmit={addTask}
      />
    </section>
  );

  const trendsSection = (
    <section className="min-w-0">
      <ChartsPanel
        charts={state.charts}
        logs={state.logs}
        tasks={state.tasks}
        currentDate={chartEndDate}
        focusDate={state.date}
        selectedTaskIds={selectedTaskIds}
        onSelectedTaskIdsChange={setSelectedTaskIds}
      />
    </section>
  );

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 transition-colors dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-0 px-4 sm:px-6">

        <TopBar
          currentDate={state.date}
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          theme={theme}
          onThemeChange={setTheme}
          themePreset={themePreset}
          onThemePresetChange={setThemePreset}
          customSeedColor={customSeedColor}
          onCustomSeedColorChange={setCustomSeedColor}
        />

        {/* Stat strip — always visible */}
        <StatStrip state={state} progress={progress} />

        {/* ── Desktop layout (lg+): chart left, habits right ── */}
        <div className="hidden gap-6 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
          {trendsSection}
          {habitsSection}
        </div>

        {/* ── Mobile layout: single panel, with bottom nav ── */}
        <div className="pb-20 pt-4 lg:hidden">
          {mobilePanel === "habits" ? habitsSection : trendsSection}
        </div>

      </div>

      <MobileNav activePanel={mobilePanel} onPanelChange={setMobilePanel} />
    </main>
  );
}
