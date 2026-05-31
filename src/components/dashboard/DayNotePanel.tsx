import { FormEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NotebookPen, X } from "lucide-react";
import { Button } from "../ui/button";

export function DayNotePanel({
  date,
  note,
  onSave,
}: {
  date: string;
  note?: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(note ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [lastSynced, setLastSynced] = useState(note ?? "");
  const [syncError, setSyncError] = useState("");
  const localKey = useMemo(() => `liferl:day-note:${date}`, [date]);

  useEffect(() => {
    const serverNote = note ?? "";
    const localDraft = typeof window === "undefined" ? null : window.localStorage.getItem(localKey);
    setDraft(localDraft ?? serverNote);
    setLastSynced(serverNote);
    setSyncError("");
  }, [date, localKey, note]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draft === (note ?? "")) {
      window.localStorage.removeItem(localKey);
    } else {
      window.localStorage.setItem(localKey, draft);
    }
  }, [draft, localKey, note]);

  const isDirty = draft !== lastSynced;

  const syncNow = useCallback(async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    setSyncError("");
    try {
      await onSave(draft);
      setLastSynced(draft);
      if (typeof window !== "undefined") window.localStorage.removeItem(localKey);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not sync note.");
    } finally {
      setIsSaving(false);
    }
  }, [draft, isDirty, isSaving, localKey, onSave]);

  useEffect(() => {
    if (!isDirty || isSaving) return;
    const timeout = window.setTimeout(() => {
      syncNow().catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [draft, isDirty, isSaving, syncNow]);

  useEffect(() => {
    if (!isDirty || isSaving) return;
    const interval = window.setInterval(() => {
      syncNow().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [isDirty, isSaving, syncNow]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await syncNow();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) setIsOpen(false);
  }

  return (
    <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center gap-2 rounded-md py-1.5 text-left text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        <NotebookPen className="size-3.5 shrink-0" />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide">Day note</span>
        {note?.trim() ? (
          <span className="min-w-0 flex-1 truncate normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
            {note}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-white/70 p-4 backdrop-blur-md dark:bg-zinc-950/76"
            onMouseDown={closeFromBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <motion.form
              onSubmit={submit}
              onMouseDown={(event) => event.stopPropagation()}
              className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col rounded-lg border border-zinc-200/70 bg-white/70 p-4 shadow-2xl backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/58 sm:h-[80vh] sm:w-[80vw] sm:max-w-6xl sm:p-5"
              initial={{ y: 18, scale: 0.985, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, scale: 0.985, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 pb-3 dark:border-zinc-800/80">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    <NotebookPen className="size-3.5" />
                    Day note
                  </div>
                  <div className="mt-0.5 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{date}</div>
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
                    aria-label="Close note editor"
                    title="Close"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="size-8 text-zinc-400 hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-zinc-50"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>

              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="What happened today?"
                className="mt-4 min-h-0 flex-1 resize-none bg-transparent text-base leading-7 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600 sm:text-lg sm:leading-8"
              />
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
