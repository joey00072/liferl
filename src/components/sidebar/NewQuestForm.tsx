"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { AnimatePresence, motion } from "framer-motion";

export function NewQuestForm({
  title,
  reward,
  error,
  onTitleChange,
  onRewardChange,
  onSubmit,
}: {
  title: string;
  reward: number;
  error: string;
  onTitleChange: (title: string) => void;
  onRewardChange: (reward: number) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 outline-none"
      >
        <Plus className={`size-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`} />
        Add habit
        <ChevronDown className={`ml-auto size-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="new-quest-form-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <form onSubmit={onSubmit} className="mt-4 space-y-3 pb-1">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor="new-habit-title">
                  Habit name
                </label>
                <input
                  id="new-habit-title"
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder="Read, stretch, meditate…"
                  className="mt-1.5 h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-emerald-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor="new-habit-reward">
                  Starting score
                </label>
                <input
                  id="new-habit-reward"
                  type="number"
                  min="0"
                  max="100"
                  value={reward}
                  onChange={(event) => onRewardChange(Math.max(0, Math.min(100, Number(event.target.value))))}
                  className="mt-1.5 h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-emerald-950"
                />
              </div>
              <Button className="mt-1 w-full" type="submit">
                <Plus className="size-3.5" />
                Add habit
              </Button>
              {error ? <p className="text-xs text-red-500">{error}</p> : null}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
