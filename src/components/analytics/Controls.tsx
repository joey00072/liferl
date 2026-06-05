import type { ReactNode } from "react";

export function ToggleButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-md border px-3 text-sm font-medium transition ${
        active
          ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500"
      }`}
    >
      {children}
    </button>
  );
}

export function HabitChip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
