export function MiniMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-500 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-3 py-2.5 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

export function TaskConsistencyBar({
  title,
  completed,
  totalDays,
  rate,
  rewardTotal,
  slope,
}: {
  title: string;
  completed: number;
  totalDays: number;
  rate: number;
  rewardTotal: number;
  slope: number;
}) {
  const width = Math.max(rate > 0 ? 3 : 0, rate);
  const slopeTone =
    slope > 0.004
      ? "text-emerald-600 dark:text-emerald-400"
      : slope < -0.004
        ? "text-red-500 dark:text-red-400"
        : "text-zinc-400 dark:text-zinc-500";
  return (
    <div className="grid gap-2 border-b border-zinc-200 py-3 last:border-b-0 dark:border-zinc-800 sm:grid-cols-[minmax(110px,170px)_minmax(140px,1fr)_76px_92px] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</div>
        <div className="text-xs text-zinc-400 dark:text-zinc-500">{rewardTotal.toLocaleString()} xp</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-zinc-400 dark:text-zinc-500 sm:block sm:border-l sm:border-zinc-200 sm:pl-4 sm:text-right dark:sm:border-zinc-800">
        <span className="sm:hidden">Done</span>
        <span>
          {completed}/{totalDays}d
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-zinc-400 dark:text-zinc-500 sm:block sm:border-l sm:border-zinc-200 sm:pl-4 sm:text-right dark:sm:border-zinc-800">
        <span className="sm:hidden">7d slope</span>
        <span>
          {rate}% <span className={slopeTone}>{formatSlope(slope)}</span>
        </span>
      </div>
    </div>
  );
}

export function formatSlope(slope: number) {
  const normalized = Math.abs(slope) < 0.004 ? 0 : slope;
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

export function slopeTone(slope: number): "positive" | "negative" | "neutral" {
  if (slope > 0.004) return "positive";
  if (slope < -0.004) return "negative";
  return "neutral";
}
