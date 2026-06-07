"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Square, X, Timer, Pause } from "lucide-react";
import { stopPomodoro, cancelPomodoro, pausePomodoro, resumePomodoro } from "../../api";
import type { State } from "../../types";
import { AnimatePresence, motion } from "framer-motion";

export function MiniPomodoroBanner({
  state,
  onStateChange,
  onFocusTab,
}: {
  state: State;
  onStateChange: (next: State) => void;
  onFocusTab: () => void;
}) {
  const activeSession = state.activeSession;
  const [remaining, setRemaining] = useState(0);

  const serverOffsetMs = useMemo(() => {
    if (!state.serverTime) return 0;
    return new Date(state.serverTime).getTime() - Date.now();
  }, [state.serverTime]);

  useEffect(() => {
    if (!activeSession) return;

    if (activeSession.status === "paused") {
      const totalElapsed = activeSession.actualSeconds || 0;
      setRemaining(Math.max(0, activeSession.plannedSeconds - totalElapsed));
      return;
    }

    const interval = setInterval(() => {
      const serverNowMs = Date.now() + serverOffsetMs;
      const startedMs = new Date(activeSession.startedAt).getTime();
      const elapsedSeconds = Math.max(0, (serverNowMs - startedMs) / 1000);
      const totalElapsed = (activeSession.actualSeconds || 0) + elapsedSeconds;
      const rem = Math.max(0, activeSession.plannedSeconds - totalElapsed);
      setRemaining(rem);
    }, 100);

    return () => clearInterval(interval);
  }, [activeSession, serverOffsetMs]);

  const formattedTime = useMemo(() => {
    const total = Math.ceil(remaining);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remaining]);

  const activeTaskTitle = useMemo(() => {
    if (!activeSession?.taskId) return "General Focus";
    const found = state.tasks.find((t) => t.id === activeSession.taskId);
    return found ? found.title : "Focus Task";
  }, [activeSession, state.tasks]);

  const isPaused = activeSession ? activeSession.status === "paused" : false;

  const bannerMode = useMemo(() => {
    if (!activeSession) return "focus";
    if (activeSession.mode) return activeSession.mode;
    if (activeSession.plannedSeconds === 300) return "short_break";
    if (activeSession.plannedSeconds === 900) return "long_break";
    return "focus";
  }, [activeSession]);

  const bannerBgClass = useMemo(() => {
    if (isPaused) {
      return "border-zinc-500/30 bg-zinc-800/40 hover:bg-zinc-800/60 dark:border-zinc-700/30 dark:bg-zinc-950/40 dark:hover:bg-zinc-950/60";
    }
    if (bannerMode === "short_break") {
      return "border-sky-500/30 bg-sky-500/40 hover:bg-sky-500/60 dark:border-sky-600/30 dark:bg-sky-600/40 dark:hover:bg-sky-600/60";
    }
    if (bannerMode === "long_break") {
      return "border-indigo-500/30 bg-indigo-500/40 hover:bg-indigo-500/60 dark:border-indigo-600/30 dark:bg-indigo-600/40 dark:hover:bg-indigo-600/60";
    }
    return "border-emerald-500/30 bg-emerald-500/40 hover:bg-emerald-500/60 dark:border-emerald-600/30 dark:bg-emerald-600/40 dark:hover:bg-emerald-600/60";
  }, [isPaused, bannerMode]);

  const bannerTitle = useMemo(() => {
    if (bannerMode === "short_break") return "Short Break";
    if (bannerMode === "long_break") return "Long Break";
    return activeTaskTitle;
  }, [bannerMode, activeTaskTitle]);

  if (!activeSession) return null;

  async function handlePause(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const next = await pausePomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleResume(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const next = await resumePomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleStop(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const next = await stopPomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCancel(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const next = await cancelPomodoro(state.date);
      onStateChange(next);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={onFocusTab}
        className={`fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 cursor-pointer items-center justify-between gap-4 rounded-full border px-4 py-2 text-white shadow-xl backdrop-blur-md transition-all sm:bottom-22 lg:bottom-6 ${bannerBgClass}`}
      >
        <div className="flex items-center gap-2">
          {isPaused ? (
            <span className="flex size-2 shrink-0 rounded-full bg-zinc-300"></span>
          ) : (
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-white"></span>
            </span>
          )}
          <div className="max-w-[145px] truncate text-xs font-semibold tracking-wide sm:max-w-[200px]">
            {isPaused ? `Paused: ${bannerTitle}` : bannerTitle}
          </div>
          <div className="font-mono text-sm font-bold tracking-wider tabular-nums">
            {formattedTime}
          </div>
        </div>

        <div className="flex items-center gap-1.5 border-l border-white/20 pl-2">
          <button
            onClick={isPaused ? handleResume : handlePause}
            title={isPaused ? "Resume Focus Session" : "Pause Focus Session"}
            className="flex size-7 items-center justify-center rounded-full bg-white/25 hover:bg-white/35 active:scale-95 transition-all"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isPaused ? (
                <motion.div
                  key="play"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.12 }}
                  className="flex items-center justify-center"
                >
                  <Play className="size-3 fill-white text-white translate-x-[0.5px]" />
                </motion.div>
              ) : (
                <motion.div
                  key="pause"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.12 }}
                  className="flex items-center justify-center"
                >
                  <Pause className="size-3 fill-white text-white" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={handleStop}
            title="Complete Focus Session"
            className="flex size-7 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 active:scale-95 transition-all"
          >
            <Square className="size-3 fill-white text-white" />
          </button>
          <button
            onClick={handleCancel}
            title="Cancel Timer"
            className="flex size-7 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 active:scale-95 transition-all"
          >
            <X className="size-3 text-white" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
