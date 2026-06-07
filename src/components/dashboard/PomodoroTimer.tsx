"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Play, Square, X, Timer, History, Pause, Brain, Coffee, BatteryCharging, Settings } from "lucide-react";
import { startPomodoro, stopPomodoro, cancelPomodoro, pausePomodoro, resumePomodoro } from "../../api";
import type { State } from "../../types";
import { Button } from "../ui/button";
import { AnimatePresence, motion } from "framer-motion";

// playChime has been replaced with customized sound audio controls

const MIN_TIMER_SECONDS = 60;
const MAX_TIMER_SECONDS = 8 * 60 * 60;

function clampTimerSeconds(value: number) {
  if (!Number.isFinite(value)) return 1500;
  return Math.max(MIN_TIMER_SECONDS, Math.min(MAX_TIMER_SECONDS, Math.round(value)));
}

function secondsToMinutesInput(seconds: number) {
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

export function PomodoroTimer({
  state,
  onStateChange,
}: {
  state: State;
  onStateChange: (next: State) => void;
}) {
  const activeSession = state.activeSession;
  const pomodoroSessions = state.pomodoroSessions || [];

  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [activeMode, setActiveMode] = useState<"focus" | "short_break" | "long_break">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("liferl:pomodoro-mode");
      if (saved === "focus" || saved === "short_break" || saved === "long_break") {
        return saved;
      }
    }
    return "focus";
  });
  const [durationPreset, setDurationPreset] = useState<number>(1500); // 25 min default
  const [customMinutes, setCustomMinutes] = useState(() => secondsToMinutesInput(1500));
  const [remaining, setRemaining] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chimePlayed, setChimePlayed] = useState(false);
  const [shakeTrigger, setShakeTrigger] = useState<number>(0);
  const [showWarning, setShowWarning] = useState<boolean>(false);

  // Audio settings state
  const [alarmSound, setAlarmSound] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("liferl:pomo-alarm-sound") || "kitchen";
    }
    return "kitchen";
  });
  const [alarmVolume, setAlarmVolume] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("liferl:pomo-alarm-volume");
      return saved !== null ? parseFloat(saved) : 0.5;
    }
    return 0.5;
  });
  const [tickingSound, setTickingSound] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("liferl:pomo-ticking-sound") || "none";
    }
    return "none";
  });
  const [tickingVolume, setTickingVolume] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("liferl:pomo-ticking-volume");
      return saved !== null ? parseFloat(saved) : 0.3;
    }
    return 0.3;
  });
  const [clickSoundEnabled, setClickSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("liferl:pomo-click-sound-enabled");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });
  const [showAudioSettings, setShowAudioSettings] = useState<boolean>(false);

  const tickingAudioRef = useRef<HTMLAudioElement | null>(null);
  const completionHandledRef = useRef(false);

  // Sync audio settings to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("liferl:pomo-alarm-sound", alarmSound);
    }
  }, [alarmSound]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("liferl:pomo-alarm-volume", String(alarmVolume));
    }
  }, [alarmVolume]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("liferl:pomo-ticking-sound", tickingSound);
    }
  }, [tickingSound]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("liferl:pomo-ticking-volume", String(tickingVolume));
    }
  }, [tickingVolume]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("liferl:pomo-click-sound-enabled", String(clickSoundEnabled));
    }
  }, [clickSoundEnabled]);

  // Audio helpers
  const playAlarmSound = useCallback(() => {
    if (alarmSound === "none") return;
    try {
      const audio = new Audio(`/sounds/alarm-${alarmSound}.mp3`);
      audio.volume = alarmVolume;
      audio.play().catch((err) => console.warn("Alarm playback blocked:", err));
    } catch (e) {
      console.warn("Alarm playback failed:", e);
    }
  }, [alarmSound, alarmVolume]);

  const playClickSound = () => {
    if (!clickSoundEnabled) return;
    try {
      const audio = new Audio("/sounds/button.wav");
      audio.volume = alarmVolume;
      audio.play().catch((err) => console.warn("Click playback blocked:", err));
    } catch (e) {
      console.warn("Click playback failed:", e);
    }
  };

  const playPopSound = (isModeChange = false) => {
    if (!clickSoundEnabled) return;
    try {
      const audio = new Audio(isModeChange ? "/sounds/pop04.mp3" : "/sounds/pop05.mp3");
      audio.volume = alarmVolume;
      audio.play().catch((err) => console.warn("Pop playback blocked:", err));
    } catch (e) {
      console.warn("Pop playback failed:", e);
    }
  };

  // Manage background focus sound loop
  useEffect(() => {
    if (tickingAudioRef.current) {
      tickingAudioRef.current.pause();
      tickingAudioRef.current = null;
    }

    if (activeSession && activeSession.status === "running" && tickingSound !== "none") {
      const audio = new Audio(`/sounds/ticking-${tickingSound}.mp3`);
      audio.loop = true;
      audio.volume = tickingVolume;
      tickingAudioRef.current = audio;
      audio.play().catch((err) => {
        console.warn("Autoplay of ticking sound was blocked:", err);
      });
    }

    return () => {
      if (tickingAudioRef.current) {
        tickingAudioRef.current.pause();
        tickingAudioRef.current = null;
      }
    };
  }, [activeSession?.status, tickingSound, tickingVolume]);

  // Clear warning after 2.5 seconds
  useEffect(() => {
    if (showWarning) {
      const timer = setTimeout(() => setShowWarning(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showWarning]);

  function handleTabClick(mode: "focus" | "short_break" | "long_break") {
    if (activeSession) {
      setShakeTrigger((prev) => prev + 1);
      setShowWarning(true);
      return;
    }
    playPopSound(true);
    setActiveMode(mode);
  }


  // Auto-detect mode from running session on load/change
  useEffect(() => {
    if (activeSession) {
      if (activeSession.mode) {
        setActiveMode(activeSession.mode);
      } else if (activeSession.plannedSeconds === 300) {
        setActiveMode("short_break");
      } else if (activeSession.plannedSeconds === 900) {
        setActiveMode("long_break");
      } else {
        setActiveMode("focus");
      }
    }
  }, [activeSession]);

  // Sync mode to localStorage whenever activeMode changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("liferl:pomodoro-mode", activeMode);
    }
  }, [activeMode]);

  useEffect(() => {
    if (!activeSession) {
      setCustomMinutes(secondsToMinutesInput(durationPreset));
    }
  }, [activeSession, durationPreset]);

  // Calculate clock offset between server and client to reconcile time discrepancies
  const serverOffsetMs = useMemo(() => {
    if (!state.serverTime) return 0;
    return new Date(state.serverTime).getTime() - Date.now();
  }, [state.serverTime]);

  // Handle active session timer tick
  useEffect(() => {
    completionHandledRef.current = false;
    setChimePlayed(false);
    if (!activeSession) {
      setRemaining(0);
    }
  }, [activeSession?.id]);

  const completeExpiredSession = useCallback(() => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    setChimePlayed(true);
    playAlarmSound();
    setIsSubmitting(true);
    stopPomodoro(state.date)
      .then(onStateChange)
      .catch(console.error)
      .finally(() => setIsSubmitting(false));
  }, [onStateChange, playAlarmSound, state.date]);

  // Handle active session timer tick
  useEffect(() => {
    if (!activeSession) {
      setRemaining(0);
      return;
    }

    if (activeSession.status === "paused") {
      const totalElapsed = activeSession.actualSeconds || 0;
      setRemaining(Math.max(0, activeSession.plannedSeconds - totalElapsed));
      return;
    }

    const interval = setInterval(() => {
      const serverNowMs = Date.now() + serverOffsetMs;
      const startedMs = new Date(activeSession.startedAt).getTime();
      const elapsedInSegment = Math.max(0, (serverNowMs - startedMs) / 1000);
      const totalElapsed = (activeSession.actualSeconds || 0) + elapsedInSegment;
      const rem = Math.max(0, activeSession.plannedSeconds - totalElapsed);
      setRemaining(rem);

      // Trigger automatic completion and chime when timer runs out
      if (rem <= 0 && !chimePlayed) {
        completeExpiredSession();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [activeSession, serverOffsetMs, chimePlayed, completeExpiredSession]);

  // Clean up completed/elapsed active sessions that were finished while offline/tab closed
  useEffect(() => {
    if (!activeSession || activeSession.status === "paused") return;
    const serverNowMs = Date.now() + serverOffsetMs;
    const startedMs = new Date(activeSession.startedAt).getTime();
    const elapsedInSegment = Math.max(0, (serverNowMs - startedMs) / 1000);
    const totalElapsed = (activeSession.actualSeconds || 0) + elapsedInSegment;
    if (totalElapsed >= activeSession.plannedSeconds) {
      completeExpiredSession();
    }
  }, [activeSession, completeExpiredSession, serverOffsetMs]);

  // Duration presets helper depending on selected mode
  const presets = useMemo(() => {
    if (activeMode === "short_break") {
      return [
        { label: "3m", value: 180 },
        { label: "5m", value: 300 },
        { label: "8m", value: 480 },
      ];
    }
    if (activeMode === "long_break") {
      return [
        { label: "10m", value: 600 },
        { label: "15m", value: 900 },
        { label: "20m", value: 1200 },
      ];
    }
    return [
      { label: "15m", value: 900 },
      { label: "25m", value: 1500 },
      { label: "50m", value: 3000 },
    ];
  }, [activeMode]);
  const isPresetDuration = useMemo(
    () => presets.some((preset) => preset.value === durationPreset),
    [durationPreset, presets],
  );

  // Auto-set duration preset when mode changes
  useEffect(() => {
    if (!activeSession) {
      if (activeMode === "focus") {
        setDurationPreset(1500);
      } else if (activeMode === "short_break") {
        setDurationPreset(300);
      } else if (activeMode === "long_break") {
        setDurationPreset(900);
      }
    }
  }, [activeMode, activeSession]);

  function handlePresetSelect(seconds: number) {
    setDurationPreset(clampTimerSeconds(seconds));
  }

  function handleCustomMinutesChange(value: string) {
    setCustomMinutes(value);
    const minutes = Number(value);
    if (Number.isFinite(minutes) && minutes > 0) {
      setDurationPreset(clampTimerSeconds(minutes * 60));
    }
  }

  function handleCustomMinutesBlur() {
    setDurationPreset((current) => {
      const clamped = clampTimerSeconds(current);
      setCustomMinutes(secondsToMinutesInput(clamped));
      return clamped;
    });
  }

  // Start focus timer
  async function handleStart() {
    setIsSubmitting(true);
    playClickSound();
    try {
      completionHandledRef.current = false;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("liferl:pomodoro-mode", activeMode);
      }
      const taskId = activeMode === "focus" ? (selectedTaskId || null) : null;
      const next = await startPomodoro(
        taskId,
        clampTimerSeconds(durationPreset),
        state.date,
        activeMode
      );
      onStateChange(next);
      setChimePlayed(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Complete early
  async function handleStop() {
    setIsSubmitting(true);
    playPopSound(false); // Play success pop
    try {
      const next = await stopPomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cancel early
  async function handleCancel() {
    setIsSubmitting(true);
    playClickSound();
    try {
      const next = await cancelPomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Pause session
  async function handlePause() {
    setIsSubmitting(true);
    playClickSound();
    try {
      const next = await pausePomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Resume session
  async function handleResume() {
    setIsSubmitting(true);
    playClickSound();
    try {
      const next = await resumePomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Format time (MM:SS)
  const formattedTime = useMemo(() => {
    const total = activeSession ? Math.ceil(remaining) : durationPreset;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [activeSession, remaining, durationPreset]);

  // Circular progress calculations
  const progressPercent = useMemo(() => {
    if (!activeSession) return 100;
    return (remaining / activeSession.plannedSeconds) * 100;
  }, [activeSession, remaining]);

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (progressPercent / 100) * circumference;

  // Active task title helper
  const activeTaskTitle = useMemo(() => {
    if (!activeSession?.taskId) return "General Focus";
    const found = state.tasks.find((t) => t.id === activeSession.taskId);
    return found ? found.title : "Focus Task";
  }, [activeSession, state.tasks]);

  // Statistics helper: completed sessions today and total duration
  const completedToday = useMemo(() => {
    return pomodoroSessions.filter((s) => s.status === "completed");
  }, [pomodoroSessions]);

  const totalFocusMinutes = useMemo(() => {
    const totalSec = completedToday.reduce((sum, s) => sum + (s.actualSeconds || 0), 0);
    return Math.round(totalSec / 60);
  }, [completedToday]);

  // Dynamic colors and layout classes based on activeMode
  const modeColorClass = useMemo(() => {
    if (activeMode === "short_break") return "text-sky-500";
    if (activeMode === "long_break") return "text-indigo-500";
    return "text-emerald-500";
  }, [activeMode]);

  const progressColorClass = useMemo(() => {
    if (activeMode === "short_break") return "stroke-sky-500";
    if (activeMode === "long_break") return "stroke-indigo-500";
    return "stroke-emerald-500";
  }, [activeMode]);

  const buttonColorClass = useMemo(() => {
    if (activeMode === "short_break") return "bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700";
    if (activeMode === "long_break") return "bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700";
    return "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700";
  }, [activeMode]);

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Timer className={`size-4 ${modeColorClass}`} />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Focus Pomodoro
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {activeSession && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <span className="size-1 animate-pulse rounded-full bg-red-500" />
              Active
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowAudioSettings(!showAudioSettings)}
            className={`rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-all dark:hover:bg-zinc-800 dark:hover:text-zinc-300 ${
              showAudioSettings ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" : ""
            }`}
            title="Sound Settings"
          >
            <Settings className="size-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAudioSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginBottom: 0 }}
            animate={{ height: "auto", opacity: 1, marginBottom: 12 }}
            exit={{ height: 0, opacity: 0, marginBottom: 0 }}
            className="overflow-hidden border-b border-zinc-100 pb-3 dark:border-zinc-800"
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Sound Settings
                </span>
                <button
                  type="button"
                  onClick={() => setShowAudioSettings(false)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Alarm Sound Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Alarm Sound
                  </label>
                  <select
                    value={alarmSound}
                    onChange={(e) => {
                      setAlarmSound(e.target.value);
                      if (e.target.value !== "none") {
                        const audio = new Audio(`/sounds/alarm-${e.target.value}.mp3`);
                        audio.volume = alarmVolume;
                        audio.play().catch(() => {});
                      }
                    }}
                    className="h-8 w-full rounded-md border border-zinc-200 bg-transparent px-2 text-xs text-zinc-800 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:text-zinc-200"
                  >
                    <option value="kitchen" className="dark:bg-zinc-900">Kitchen Timer</option>
                    <option value="bell" className="dark:bg-zinc-900">Bell</option>
                    <option value="bird" className="dark:bg-zinc-900">Bird Chirp</option>
                    <option value="digital" className="dark:bg-zinc-900">Digital Beep</option>
                    <option value="wood" className="dark:bg-zinc-900">Wood Block</option>
                    <option value="none" className="dark:bg-zinc-900">None (Mute)</option>
                  </select>
                </div>

                {/* Focus Sound Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Background Sound
                  </label>
                  <select
                    value={tickingSound}
                    onChange={(e) => {
                      setTickingSound(e.target.value);
                      if (e.target.value !== "none") {
                        const audio = new Audio(`/sounds/ticking-${e.target.value}.mp3`);
                        audio.volume = tickingVolume;
                        audio.play().then(() => {
                          setTimeout(() => {
                            audio.pause();
                          }, 1500);
                        }).catch(() => {});
                      }
                    }}
                    className="h-8 w-full rounded-md border border-zinc-200 bg-transparent px-2 text-xs text-zinc-800 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:text-zinc-200"
                  >
                    <option value="none" className="dark:bg-zinc-900">None</option>
                    <option value="slow" className="dark:bg-zinc-900">Ticking Slow</option>
                    <option value="fast" className="dark:bg-zinc-900">Ticking Fast</option>
                    <option value="white" className="dark:bg-zinc-900">White Noise</option>
                    <option value="brown" className="dark:bg-zinc-900">Brown Noise</option>
                  </select>
                </div>
              </div>

              {/* Volumes and checkboxes */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Alarm Volume */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Alarm Volume
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500">
                      {Math.round(alarmVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={alarmVolume}
                    onChange={(e) => setAlarmVolume(parseFloat(e.target.value))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-500 dark:bg-zinc-700"
                  />
                </div>

                {/* Focus Volume */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Background Volume
                    </label>
                    <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500">
                      {Math.round(tickingVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={tickingVolume}
                    disabled={tickingSound === "none"}
                    className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-emerald-500 dark:bg-zinc-700 disabled:opacity-50"
                    onChange={(e) => setTickingVolume(parseFloat(e.target.value))}
                  />
                </div>
              </div>

              {/* Click Sound Enabled Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="click-sound-toggle"
                  checked={clickSoundEnabled}
                  onChange={(e) => setClickSoundEnabled(e.target.checked)}
                  className="rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800"
                />
                <label
                  htmlFor="click-sound-toggle"
                  className="cursor-pointer text-[10px] font-medium text-zinc-600 dark:text-zinc-400 select-none"
                >
                  Enable tactile clicks and transition sound effects
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center justify-center gap-5 py-4 w-full">
        {/* Mode Selector Tabs */}
        <motion.div
          animate={shakeTrigger > 0 ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex w-full max-w-[280px] rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/60 relative"
        >
          {(["focus", "short_break", "long_break"] as const).map((mode) => {
            const isActive = activeMode === mode;
            const label = mode === "focus" ? "Focus" : mode === "short_break" ? "Short" : "Long";
            const Icon = mode === "focus" ? Brain : mode === "short_break" ? Coffee : BatteryCharging;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => handleTabClick(mode)}
                className={`relative z-10 flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-center text-[10px] font-bold uppercase tracking-wide transition-all duration-200 outline-none ${
                  isActive
                    ? "text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                } ${activeSession && !isActive ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-mode-pill"
                    className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-zinc-900 -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon className="size-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </motion.div>

        {/* Locked Mode Warning */}
        <AnimatePresence>
          {showWarning && (
            <motion.p
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="text-[10px] font-semibold text-red-500 dark:text-red-400 text-center tracking-wide uppercase"
            >
              Cancel or complete active session to change mode
            </motion.p>
          )}
        </AnimatePresence>

        {/* Timer Visualization */}
        <div className="relative mx-auto flex size-40 shrink-0 items-center justify-center">
          <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 160 160">
            {/* Background ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              className="fill-none stroke-zinc-100 dark:stroke-zinc-800"
              strokeWidth="6"
            />
            {/* Progress ring */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              className={`fill-none ${progressColorClass} transition-[stroke-dashoffset] ${
                activeSession && activeSession.status === "running"
                  ? "duration-100 ease-linear"
                  : "duration-300 ease-out"
              }`}
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="text-center z-10">
            <div className="font-mono text-3xl font-bold tracking-wider text-zinc-900 dark:text-zinc-50">
              {formattedTime}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              {activeSession ? "Remaining" : "Planned"}
            </div>
          </div>
        </div>

        {/* Configurations and Controls */}
        <div className="flex flex-col justify-center space-y-4 w-full">
          <AnimatePresence mode="wait">
            {activeSession ? (
              // Active session display and controls
              <motion.div
                key="active-controls"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-4 text-center w-full"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {activeMode === "focus" ? "Focusing on:" : "Break session:"}
                  </p>
                  <h3 className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {activeMode === "focus" ? activeTaskTitle : activeMode === "short_break" ? "Short Break" : "Long Break"}
                  </h3>
                </div>

                <motion.div layout className="flex flex-wrap justify-center gap-2 items-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {activeSession.status === "running" ? (
                      <motion.button
                        key="pause-btn"
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        onClick={handlePause}
                        disabled={isSubmitting}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Pause className="size-3.5 fill-current" />
                        Pause
                      </motion.button>
                    ) : (
                      <motion.button
                        key="resume-btn"
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        onClick={handleResume}
                        disabled={isSubmitting}
                        className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium ${buttonColorClass} text-white disabled:pointer-events-none disabled:opacity-50`}
                      >
                        <Play className="size-3.5 fill-white" strokeWidth={3} />
                        Resume
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <motion.button
                    layout
                    key="complete-btn"
                    onClick={handleStop}
                    disabled={isSubmitting}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Square className="size-3.5 fill-current" />
                    Complete
                  </motion.button>
                  <motion.button
                    layout
                    key="cancel-btn"
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-950/20 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                    Cancel
                  </motion.button>
                </motion.div>
              </motion.div>
            ) : (
              // Configuration controls
              <motion.div
                key="config-controls"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-4 w-full"
              >
                {/* Task association selection */}
                {activeMode === "focus" && (
                  <div className="grid gap-1.5 w-full">
                    <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Associate Habit
                    </label>
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value)}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-transparent px-2 text-xs text-zinc-800 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:text-zinc-200"
                    >
                      <option value="" className="dark:bg-zinc-900">General Focus</option>
                      {state.tasks.map((task) => (
                        <option key={task.id} value={task.id} className="dark:bg-zinc-900">
                          {task.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Presets and Custom timing */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <div className="flex max-w-full flex-wrap rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
                    {presets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => handlePresetSelect(preset.value)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                          durationPreset === preset.value
                            ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                            : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <label
                      className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-all focus-within:ring-2 focus-within:ring-emerald-500 ${
                        isPresetDuration
                          ? "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      }`}
                    >
                      <span className="hidden sm:inline">Custom</span>
                      <input
                        type="number"
                        aria-label="Custom timer minutes"
                        min="1"
                        max="480"
                        step="0.5"
                        value={customMinutes}
                        onChange={(event) => handleCustomMinutesChange(event.target.value)}
                        onBlur={handleCustomMinutesBlur}
                        className="h-6 w-11 bg-transparent text-right text-xs tabular-nums outline-none"
                      />
                      <span>m</span>
                    </label>
                  </div>
                  <Button
                    onClick={handleStart}
                    disabled={isSubmitting}
                    className={`h-8 px-3 text-xs ${buttonColorClass} text-white`}
                  >
                    <Play className="mr-1.5 size-3.5 fill-white" />
                    Start Timer
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* History log section */}
      <AnimatePresence>
        {completedToday.length > 0 && (
          <motion.div
            key="history-log"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800 overflow-hidden"
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1">
                <History className="size-3" />
                Today: {completedToday.length} {completedToday.length === 1 ? "session" : "sessions"}
              </span>
              <span>{totalFocusMinutes} min total</span>
            </div>
            <div className="mt-2 max-h-24 overflow-y-auto space-y-1.5 pr-1 text-xs text-zinc-500 dark:text-zinc-400">
              {completedToday.map((session) => {
                const taskTitle = session.taskId
                  ? state.tasks.find((t) => t.id === session.taskId)?.title || "Focus Task"
                  : "General Focus";
                const minutes = Math.round((session.actualSeconds || 0) / 60);
                const timestamp = new Date(session.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div key={session.id} className="flex justify-between items-center bg-zinc-50/50 p-1.5 rounded dark:bg-zinc-900/30">
                    <span className="font-medium truncate max-w-[70%]">{taskTitle}</span>
                    <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                      {timestamp} · {minutes}m
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
