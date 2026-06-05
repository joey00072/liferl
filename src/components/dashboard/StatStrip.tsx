import { Flame, Layers, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { State } from "../../types";

export function StatStrip({ state, progress }: { state: State; progress: number }) {
  const done = state.completedDay;
  const total = state.totalDay;

  return (
    <div className="flex items-center gap-4 border-b border-zinc-200 py-2 dark:border-zinc-800 sm:gap-6">
      {/* Inline micro-stats */}
      <Stat icon={<Trophy className="size-3" />} label="Total" value={state.totalReward.toLocaleString()} />
      <Stat
        icon={<Flame className="size-3" />}
        label="Day"
        value={`+${state.dayReward}`}
        accent={state.dayReward > 0}
      />
      <Stat icon={<Layers className="size-3" />} label="Done" value={`${done}/${total}`} />

      {/* Progress bar — takes remaining space */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span
          className={`shrink-0 text-[10px] font-semibold tabular-nums ${
            progress === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {progress}%
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      <span className="hidden text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500 sm:inline">
        {label}
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          accent ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
