import { Calendar as CalendarIcon, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { requestState } from "./api";
import { ChartsPanel } from "./components/analytics/ChartsPanel";

import { DayNotePanel } from "./components/dashboard/DayNotePanel";
import { QuestPanel } from "./components/dashboard/QuestPanel";
import { StatStrip } from "./components/dashboard/StatStrip";
import { NewQuestForm } from "./components/sidebar/NewQuestForm";
import { Button } from "./components/ui/button";
import { Calendar } from "./components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import type { State } from "./types";
import "./styles.css";

const getTodayStr = () => new Date().toLocaleDateString("en-CA");
const parseDateString = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const formatDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const latestDate = (dates: string[]) => dates.filter(Boolean).sort().at(-1);

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {/* dev mode may fail */});
  });
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  if (!result) return { h: 0, s: 0, l: 0 };
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function applyCustomTheme(hex: string, isDark: boolean) {
  const { h, s } = hexToHsl(hex);
  
  const sNeutralLight = Math.min(12, Math.round(s * 0.12 + 3));
  const sNeutralDark = Math.min(18, Math.round(s * 0.18 + 5));

  const root = document.documentElement;

  if (isDark) {
    root.style.setProperty("--zinc-50", `hsl(${h}, ${sNeutralDark}%, 98%)`);
    root.style.setProperty("--zinc-100", `hsl(${h}, ${sNeutralDark}%, 95%)`);
    root.style.setProperty("--zinc-200", `hsl(${h}, ${sNeutralDark}%, 88%)`);
    root.style.setProperty("--zinc-300", `hsl(${h}, ${sNeutralDark}%, 78%)`);
    root.style.setProperty("--zinc-400", `hsl(${h}, ${sNeutralDark}%, 60%)`);
    root.style.setProperty("--zinc-500", `hsl(${h}, ${sNeutralDark}%, 47%)`);
    root.style.setProperty("--zinc-600", `hsl(${h}, ${sNeutralDark}%, 35%)`);
    root.style.setProperty("--zinc-700", `hsl(${h}, ${sNeutralDark}%, 23%)`);
    root.style.setProperty("--zinc-800", `hsl(${h}, ${sNeutralDark}%, 14%)`);
    root.style.setProperty("--zinc-900", `hsl(${h}, ${sNeutralDark}%, 9%)`);
    root.style.setProperty("--zinc-950", `hsl(${h}, ${sNeutralDark}%, 5%)`);
  } else {
    root.style.setProperty("--zinc-50", `hsl(${h}, ${sNeutralLight}%, 96.5%)`);
    root.style.setProperty("--zinc-100", `hsl(${h}, ${sNeutralLight}%, 93%)`);
    root.style.setProperty("--zinc-200", `hsl(${h}, ${sNeutralLight}%, 87%)`);
    root.style.setProperty("--zinc-300", `hsl(${h}, ${sNeutralLight}%, 78%)`);
    root.style.setProperty("--zinc-400", `hsl(${h}, ${sNeutralLight}%, 62%)`);
    root.style.setProperty("--zinc-500", `hsl(${h}, ${sNeutralLight}%, 48%)`);
    root.style.setProperty("--zinc-600", `hsl(${h}, ${sNeutralLight}%, 37%)`);
    root.style.setProperty("--zinc-700", `hsl(${h}, ${sNeutralLight}%, 28%)`);
    root.style.setProperty("--zinc-800", `hsl(${h}, ${sNeutralLight}%, 21%)`);
    root.style.setProperty("--zinc-900", `hsl(${h}, ${sNeutralLight}%, 15%)`);
    root.style.setProperty("--zinc-950", `hsl(${h}, ${sNeutralLight}%, 11%)`);
  }

  const baseS = Math.max(40, Math.min(95, s));
  root.style.setProperty("--accent-100", `hsl(${h}, ${baseS}%, 94%)`);
  root.style.setProperty("--accent-200", `hsl(${h}, ${baseS}%, 86%)`);
  root.style.setProperty("--accent-300", `hsl(${h}, ${baseS}%, 70%)`);
  root.style.setProperty("--accent-400", `hsl(${h}, ${baseS}%, 56%)`);
  root.style.setProperty("--accent-500", `hsl(${h}, ${baseS}%, 46%)`);
  root.style.setProperty("--accent-600", `hsl(${h}, ${baseS}%, 36%)`);
  root.style.setProperty("--accent-800", `hsl(${h}, ${baseS}%, 20%)`);
  root.style.setProperty("--accent-900", `hsl(${h}, ${baseS}%, 12%)`);
}

function clearCustomTheme() {
  const root = document.documentElement;
  const vars = [
    "--zinc-50", "--zinc-100", "--zinc-200", "--zinc-300", "--zinc-400",
    "--zinc-500", "--zinc-600", "--zinc-700", "--zinc-800", "--zinc-900", "--zinc-950",
    "--accent-100", "--accent-200", "--accent-300", "--accent-400",
    "--accent-500", "--accent-600", "--accent-800", "--accent-900"
  ];
  vars.forEach((v) => root.style.removeProperty(v));
}

type MobilePanel = "habits" | "trends";

function App() {
  const [state, setState] = useState<State | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => getTodayStr());
  const stateRequestId = useRef(0);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState(10);
  const [error, setError] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [didSeedSelection, setDidSeedSelection] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("habits");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("liferl-theme") === "dark" ? "dark" : "light";
  });
  const [themePreset, setThemePreset] = useState<string>(() => {
    if (typeof window === "undefined") return "rose";
    return localStorage.getItem("liferl-theme-preset") || "rose";
  });
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [customSeedColor, setCustomSeedColor] = useState<string>(() => {
    if (typeof window === "undefined") return "#10b981";
    return localStorage.getItem("liferl-custom-seed") || "#10b981";
  });

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
    if (!state) return getTodayStr();
    return latestDate([
      getTodayStr(),
      state.date,
      state.charts.currentDate,
      ...state.charts.daily.map((day) => day.date),
      ...state.charts.entries.map((entry) => entry.date),
    ]) ?? getTodayStr();
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

        {/* Topbar */}
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">LifeRL</span>
          </div>
          <div className="relative flex items-center gap-1.5">
            <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                  aria-label="Choose date"
                  title="Choose date"
                >
                  <CalendarIcon className="size-4" />
                  <span className="hidden tabular-nums sm:inline">{state.date}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={parseDateString(selectedDate)}
                  defaultMonth={parseDateString(selectedDate)}
                  onSelect={(date) => {
                    if (!date) return;
                    setSelectedDate(formatDateString(date));
                    setIsDateOpen(false);
                  }}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
            {selectedDate !== getTodayStr() && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedDate(getTodayStr())}
                className="h-8 px-2 text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Today
              </Button>
            )}
            <Button
              aria-label="Select theme preset"
              data-testid="theme-menu-trigger"
              variant="ghost"
              size="icon"
              onClick={() => setIsThemeOpen(!isThemeOpen)}
              className="size-8 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              <Palette className="size-4" />
            </Button>

            {isThemeOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsThemeOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Select Theme
                  </div>
                  {[
                    { id: "slate", name: "Slate", accent: "#10b981", dot: "#6b7280" },
                    { id: "amethyst", name: "Amethyst", accent: "#a855f7", dot: "#c084fc" },
                    { id: "rose", name: "Rose", accent: "#db2777", dot: "#f472b6" },
                    { id: "sage", name: "Sage", accent: "#059669", dot: "#78716c" },
                    { id: "amber", name: "Amber", accent: "#f59e0b", dot: "#fdba74" },
                    { id: "catppuccin", name: "Catppuccin", accent: "#7287fd", dot: "#a6adc8" },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setThemePreset(preset.id);
                        setIsThemeOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                        themePreset === preset.id
                          ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                      }`}
                    >
                      <span>{preset.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: preset.accent }} />
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: preset.dot }} />
                      </div>
                    </button>
                  ))}

                  <div className="border-t border-zinc-100 my-1.5 dark:border-zinc-800" />
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    Custom Theme
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1">
                    <input
                      type="color"
                      value={customSeedColor}
                      onChange={(e) => {
                        setCustomSeedColor(e.target.value);
                        setThemePreset("custom");
                      }}
                      className="size-6 cursor-pointer rounded border border-zinc-200 bg-transparent p-0 outline-none dark:border-zinc-800"
                      title="Choose custom seed color"
                    />
                    <button
                      onClick={() => {
                        setThemePreset("custom");
                        setIsThemeOpen(false);
                      }}
                      className={`flex-1 rounded py-1 text-center text-[10px] font-bold uppercase border transition ${
                        themePreset === "custom"
                          ? "bg-zinc-950 text-white border-zinc-950 dark:bg-zinc-50 dark:text-zinc-950 dark:border-zinc-50"
                          : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                </div>
              </>
            )}

            <Button
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="size-8 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </header>

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

      {/* Mobile bottom nav — fixed, safe area aware */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-zinc-200 bg-zinc-50/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <MobileNavTab
          active={mobilePanel === "habits"}
          label="Habits"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-5">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          }
          onClick={() => setMobilePanel("habits")}
        />
        <MobileNavTab
          active={mobilePanel === "trends"}
          label="Trends"
          icon={
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className="size-5">
              <polyline points="2,14 7,9 11,12 18,5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          onClick={() => setMobilePanel("trends")}
        />
      </nav>
    </main>
  );
}

function MobileNavTab({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Show ${label}`}
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
        active
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
