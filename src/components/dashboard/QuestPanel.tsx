import { AnimatePresence, motion } from "framer-motion";
import { Archive, Check, NotebookPen, Pencil, RotateCcw, X } from "lucide-react";
import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import type { Task } from "../../types";

const DELETE_GRACE_MS = 12000;

export function QuestPanel({
  date,
  tasks,
  archivedTasks,
  progress,
  onToggleTask,
  onUpdateTask,
  onRemoveTask,
  onRestoreTask,
}: {
  date: string;
  tasks: Task[];
  archivedTasks: Task[];
  progress: number;
  onToggleTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, title: string, score: number, note: string) => Promise<void> | void;
  onRemoveTask: (taskId: string) => void;
  onRestoreTask: (taskId: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editScore, setEditScore] = useState(10);
  const [editNote, setEditNote] = useState("");
  const [lastSynced, setLastSynced] = useState({ title: "", score: 10, note: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [pendingArchive, setPendingArchive] = useState<{ task: Task; requestedAt: number; expiresAt: number } | null>(null);
  const [archiveNowTime, setArchiveNowTime] = useState(() => Date.now());
  const editingTask = useMemo(() => tasks.find((task) => task.id === editingId), [editingId, tasks]);
  const localKey = editingId ? `liferl:task-edit:${date}:${editingId}` : "";

  function startEdit(task: Task, event: MouseEvent) {
    event.stopPropagation();
    setEditingId(task.id);
    const serverDraft = { title: task.title, score: task.score ?? task.reward, note: task.note ?? "" };
    const localDraft = readLocalTaskDraft(`liferl:task-edit:${date}:${task.id}`);
    const nextDraft = localDraft ?? serverDraft;
    setEditTitle(nextDraft.title);
    setEditScore(nextDraft.score);
    setEditNote(nextDraft.note);
    setLastSynced(serverDraft);
    setSyncError("");
  }

  const isDirty =
    editTitle !== lastSynced.title ||
    editScore !== lastSynced.score ||
    editNote !== lastSynced.note;

  useEffect(() => {
    if (!editingId || !localKey) return;
    if (typeof window === "undefined") return;
    if (!isDirty) {
      window.localStorage.removeItem(localKey);
    } else {
      window.localStorage.setItem(localKey, JSON.stringify({ title: editTitle, score: editScore, note: editNote }));
    }
  }, [editNote, editScore, editTitle, editingId, isDirty, localKey]);

  const syncNow = useCallback(async () => {
    if (!editingId || !isDirty || isSaving) return;
    setIsSaving(true);
    setSyncError("");
    try {
      await onUpdateTask(editingId, editTitle, editScore, editNote);
      setLastSynced({ title: editTitle, score: editScore, note: editNote });
      if (typeof window !== "undefined" && localKey) window.localStorage.removeItem(localKey);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not sync task.");
    } finally {
      setIsSaving(false);
    }
  }, [editNote, editScore, editTitle, editingId, isDirty, isSaving, localKey, onUpdateTask]);

  useEffect(() => {
    if (!editingId || !isDirty || isSaving) return;
    const timeout = window.setTimeout(() => {
      syncNow().catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [editNote, editScore, editTitle, editingId, isDirty, isSaving, syncNow]);

  useEffect(() => {
    if (!editingId || !isDirty || isSaving) return;
    const interval = window.setInterval(() => {
      syncNow().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [editingId, isDirty, isSaving, syncNow]);

  useEffect(() => {
    if (!editingId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setEditingId(null);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        syncNow().catch(() => undefined);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId, syncNow]);

  useEffect(() => {
    if (!pendingArchive) return;
    const remaining = Math.max(0, pendingArchive.expiresAt - Date.now());
    const timeout = window.setTimeout(() => {
      onRemoveTask(pendingArchive.task.id);
      setPendingArchive(null);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [onRemoveTask, pendingArchive]);

  useEffect(() => {
    if (!pendingArchive) return;
    setArchiveNowTime(Date.now());
    const interval = window.setInterval(() => setArchiveNowTime(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [pendingArchive]);

  useEffect(() => {
    if (!pendingArchive) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setPendingArchive(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingArchive]);

  function requestArchive(task: Task, event: MouseEvent) {
    event.stopPropagation();
    const requestedAt = Date.now();
    setPendingArchive({ task, requestedAt, expiresAt: requestedAt + DELETE_GRACE_MS });
  }

  function archiveNow() {
    if (!pendingArchive) return;
    onRemoveTask(pendingArchive.task.id);
    setPendingArchive(null);
  }

  const doneCount = tasks.filter((t) => t.doneOnDate).length;
  const remaining = tasks.length - doneCount;
  const archiveRemainingMs = pendingArchive ? Math.max(0, pendingArchive.expiresAt - archiveNowTime) : 0;
  const archiveProgress = pendingArchive
    ? Math.min(100, Math.max(0, ((archiveNowTime - pendingArchive.requestedAt) / DELETE_GRACE_MS) * 100))
    : 0;
  const archiveRemainingSeconds = Math.ceil(archiveRemainingMs / 1000);

  return (
    <div className="space-y-0">
      {/* Section label — quiet, not a marketing headline */}
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Habits
        </h2>
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
          <span>{date}</span>
          <span>{remaining > 0 ? `${remaining} left` : "All done ✓"}</span>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {tasks.map((task) => (
          <motion.article
            key={task.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b py-3.5 transition-colors last:border-b-0 sm:-mx-2 sm:rounded-lg sm:border-b-0 sm:px-2 sm:py-3 ${
              task.doneOnDate
                ? "border-zinc-100 dark:border-zinc-900 sm:hover:bg-zinc-100/50 dark:sm:hover:bg-zinc-900/30"
                : "border-zinc-200 dark:border-zinc-800 sm:hover:bg-zinc-100/70 dark:sm:hover:bg-zinc-900/50"
            }`}
          >
            {/* Check button — large tap target */}
            <button
              aria-label={task.doneOnDate ? "Mark task not done" : "Mark task done"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleTask(task.id);
              }}
              className={`grid size-10 shrink-0 place-items-center rounded-lg transition-all ${
                task.doneOnDate
                  ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200 dark:shadow-emerald-900/40"
                  : "border border-zinc-300 bg-white text-zinc-300 hover:border-emerald-500 hover:text-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600 dark:hover:border-emerald-500 dark:hover:text-emerald-500"
              }`}
            >
              <Check className="size-4" strokeWidth={task.doneOnDate ? 2.5 : 2} />
            </button>

            <button
              type="button"
              onClick={(event) => startEdit(task, event)}
              className="min-w-0 text-left"
            >
              <h3
                className={`truncate text-sm font-medium leading-snug transition-colors ${
                  task.doneOnDate
                    ? "text-zinc-400 line-through dark:text-zinc-600"
                    : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {task.title}
              </h3>
              <p className={`mt-0.5 text-xs transition-colors ${task.doneOnDate ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-500 dark:text-zinc-400"}`}>
                {task.score ?? task.reward}%
              </p>
              {task.note ? (
                <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-600">{task.note}</p>
              ) : null}
            </button>

            {/* Edit / archive controls — quiet until hover */}
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                aria-label="Edit task"
                title="Edit task"
                variant="ghost"
                size="icon"
                onClick={(event) => startEdit(task, event)}
                className="size-8 text-zinc-400 transition-opacity hover:text-zinc-950 sm:opacity-0 sm:group-hover:opacity-100 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                aria-label="Archive task"
                title="Archive task"
                variant="ghost"
                size="icon"
                onClick={(event) => {
                  event.stopPropagation();
                  requestArchive(task, event);
                }}
                className="size-8 text-zinc-400 transition-opacity hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-red-400"
              >
                <Archive className="size-3.5" />
              </Button>
            </div>
          </motion.article>
        ))}
      </AnimatePresence>

      {tasks.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-600">
          No habits yet — add one below.
        </p>
      )}

      {archivedTasks.length > 0 ? (
        <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            Archived
          </div>
          <div className="space-y-1">
            {archivedTasks.map((task) => (
              <div
                key={task.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md py-1.5 text-sm text-zinc-400 dark:text-zinc-600"
              >
                <div className="min-w-0 truncate">{task.title}</div>
                <Button
                  type="button"
                  aria-label={`Restore ${task.title}`}
                  title="Restore"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRestoreTask(task.id)}
                  className="size-8 text-zinc-400 hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-zinc-50"
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {pendingArchive ? (
          <motion.div
            key="pending-archive"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-3 left-1/2 z-50 w-[min(94vw,560px)] -translate-x-1/2 overflow-hidden rounded-lg border border-zinc-200 bg-white/92 text-sm shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/92 sm:bottom-4"
          >
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                  Archiving {pendingArchive.task.title}
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500">
                  Archived in {archiveRemainingSeconds}s · Undo with Ctrl+Z / Cmd+Z
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 sm:flex sm:shrink-0 sm:items-center">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPendingArchive(null)}
                  className="h-8 px-2 text-xs text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={archiveNow}
                  className="h-8 px-2 text-xs text-red-500 hover:text-red-600 dark:text-red-400"
                >
                  Archive now
                </Button>
              </div>
            </div>
            <div className="h-1 bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-red-500 transition-[width] duration-100 linear"
                style={{ width: `${archiveProgress}%` }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingTask ? (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-white/70 p-4 backdrop-blur-md dark:bg-zinc-950/76"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEditingId(null);
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <motion.div
              onMouseDown={(event) => event.stopPropagation()}
              className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col rounded-lg border border-zinc-200/70 bg-white/70 p-4 shadow-2xl backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/58 sm:h-[80vh] sm:w-[80vw] sm:max-w-5xl sm:p-5"
              initial={{ y: 18, scale: 0.985, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 12, scale: 0.985, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 pb-3 dark:border-zinc-800/80">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    <NotebookPen className="size-3.5" />
                    Task note
                  </div>
                  <div className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {date} · {editingTask.title}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`hidden text-xs sm:inline ${
                      syncError
                        ? "text-red-500"
                        : isSaving
                          ? "text-zinc-500 dark:text-zinc-400"
                          : isDirty
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {syncError ? "Sync failed" : isSaving ? "Syncing" : isDirty ? "Saved locally" : "Synced"}
                  </span>
                  <Button
                    type="button"
                    aria-label="Close task editor"
                    title="Close"
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingId(null)}
                    className="size-8 text-zinc-400 hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-zinc-50"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-5">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Habit
                  </span>
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="h-10 border-b border-zinc-200/80 bg-transparent text-base text-zinc-900 outline-none transition focus:border-emerald-500 dark:border-zinc-800 dark:text-zinc-100"
                  />
                </label>

                <label className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Completion
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={editScore}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "");
                          setEditScore(Math.max(0, Math.min(100, Number(digits) || 0)));
                        }}
                        className="h-8 w-12 bg-transparent text-right text-sm tabular-nums text-zinc-700 outline-none dark:text-zinc-300"
                      />
                      <span className="text-xs text-zinc-400">%</span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={editScore}
                      onChange={(event) => setEditScore(Math.max(0, Math.min(100, Number(event.target.value))))}
                      className="w-full max-w-xs accent-emerald-600"
                    />
                  </div>
                </label>

                <label className="grid min-h-0 flex-1 gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Short note
                  </span>
                  <textarea
                    value={editNote}
                    onChange={(event) => setEditNote(event.target.value)}
                    placeholder="Short note"
                    className="min-h-40 resize-none bg-transparent text-base leading-7 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                  />
                </label>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function readLocalTaskDraft(key: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { title?: unknown; score?: unknown; note?: unknown };
    return {
      title: String(parsed.title ?? ""),
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      note: String(parsed.note ?? ""),
    };
  } catch {
    return null;
  }
}
