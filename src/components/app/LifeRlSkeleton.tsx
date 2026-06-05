import { Calendar as CalendarIcon, Check, Flame, Layers, Moon, Palette, Trophy } from "lucide-react";

export function LifeRlSkeleton() {
  const habitsSkeleton = (
    <div className="space-y-6">
      {/* Title / Info Row */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="h-4 w-16 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
        <div className="h-3.5 w-24 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
      </div>

      {/* Habits List */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-zinc-100 py-3.5 dark:border-zinc-900 last:border-b-0 sm:-mx-2 sm:rounded-lg sm:border-b-0 sm:px-2 sm:py-3 sm:hover:bg-zinc-100/50 dark:sm:hover:bg-zinc-900/30"
          >
            {/* Checkbox Placeholder */}
            <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/50 animate-pulse">
              <Check className="size-4 text-zinc-300 dark:text-zinc-700" />
            </div>

            {/* Title / Reward Placeholder */}
            <div className="min-w-0 space-y-1.5">
              <div className="h-4 w-[45%] rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
              <div className="h-3 w-10 rounded bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
            </div>

            {/* Buttons Placeholder */}
            <div className="flex gap-1">
              <div className="size-8 rounded bg-zinc-200/50 dark:bg-zinc-800/50 animate-pulse" />
              <div className="size-8 rounded bg-zinc-200/50 dark:bg-zinc-800/50 animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Day Note Panel Placeholder */}
      <div className="rounded-lg border border-zinc-200/80 p-4 dark:border-zinc-800/80 space-y-3">
        <div className="h-4 w-24 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
        <div className="h-16 w-full rounded bg-zinc-200/40 dark:bg-zinc-800/40 animate-pulse" />
      </div>

      {/* New Quest Form Placeholder */}
      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
          <div className="size-4 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
        </div>
      </div>
    </div>
  );

  const trendsSkeleton = (
    <div className="space-y-6">
      {/* Title / Options Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-28 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
        <div className="h-8 w-20 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-4 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:border-zinc-200 dark:[&>*:nth-child(even)]:border-zinc-800 sm:[&>*+*]:border-l sm:[&>*+*]:border-zinc-200 dark:sm:[&>*+*]:border-zinc-800">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center justify-center p-3 space-y-1.5">
            <div className="h-3 w-16 rounded bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
            <div className="h-6 w-12 rounded bg-zinc-200/90 dark:bg-zinc-800/90 animate-pulse" />
          </div>
        ))}
      </div>

      {/* SVG Chart Placeholder */}
      <div className="h-64 rounded-lg border border-zinc-200/80 bg-white/50 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/50 flex flex-col justify-end space-y-4">
        {/* Fake Grid lines */}
        <div className="flex-1 flex flex-col justify-between py-2 border-l border-zinc-100 dark:border-zinc-800">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-full border-t border-zinc-100/70 dark:border-zinc-800/50" />
          ))}
        </div>
        {/* Fake Bars inside Chart */}
        <div className="flex items-end justify-between px-2 h-24 gap-1.5">
          {[30, 45, 60, 40, 55, 75, 90, 65, 50, 70, 85, 95, 60, 40, 55].map((h, idx) => (
            <div
              key={idx}
              className="flex-1 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-t animate-pulse"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      {/* Habit Chips Placeholder */}
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-6 w-16 rounded-full bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
        ))}
      </div>

      {/* Consistency Block Placeholder */}
      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800 space-y-4">
        <div className="flex justify-between items-baseline">
          <div className="h-4 w-24 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
          <div className="h-3 w-32 rounded bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_1fr] items-center gap-4 py-2 border-b border-zinc-100 dark:border-zinc-900 last:border-b-0">
              <div className="h-3.5 w-20 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
              <div className="h-2 w-full rounded bg-zinc-200/40 dark:bg-zinc-800/40 animate-pulse" />
              <div className="h-3.5 w-12 ml-auto rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 transition-colors dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-0 px-4 sm:px-6">
        
        {/* TopBar skeleton */}
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 py-3 dark:border-zinc-800">
          <span className="text-sm font-semibold tracking-tight">LifeRL</span>
          <div className="relative flex items-center gap-1.5">
            {/* Choose Date Pill */}
            <div className="flex h-8 items-center gap-1.5 rounded-md px-2 bg-zinc-200/50 dark:bg-zinc-800/50 animate-pulse">
              <CalendarIcon className="size-4 text-zinc-300 dark:text-zinc-700" />
              <div className="hidden h-3 w-16 rounded bg-zinc-300/80 dark:bg-zinc-700/80 sm:block" />
            </div>
            {/* Palette Trigger */}
            <div className="size-8 rounded-md bg-zinc-200/50 dark:bg-zinc-800/50 flex items-center justify-center animate-pulse">
              <Palette className="size-4 text-zinc-300 dark:text-zinc-700" />
            </div>
            {/* Sun/Moon Toggle */}
            <div className="size-8 rounded-md bg-zinc-200/50 dark:bg-zinc-800/50 flex items-center justify-center animate-pulse">
              <Moon className="size-4 text-zinc-300 dark:text-zinc-700" />
            </div>
          </div>
        </header>

        {/* StatStrip skeleton */}
        <div className="flex items-center gap-4 border-b border-zinc-200 py-2 dark:border-zinc-800 sm:gap-6">
          <div className="flex items-center gap-1.5">
            <Trophy className="size-3 text-zinc-300 dark:text-zinc-700" />
            <div className="h-4 w-12 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5">
            <Flame className="size-3 text-zinc-300 dark:text-zinc-700" />
            <div className="h-4 w-8 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5">
            <Layers className="size-3 text-zinc-300 dark:text-zinc-700" />
            <div className="h-4 w-10 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full w-[30%] rounded-full bg-zinc-300 dark:bg-zinc-700 animate-pulse" />
            </div>
            <div className="h-3 w-6 rounded bg-zinc-200/80 dark:bg-zinc-800/80 animate-pulse" />
          </div>
        </div>

        {/* Desktop Layout grid */}
        <div className="hidden gap-6 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
          {trendsSkeleton}
          {habitsSkeleton}
        </div>

        {/* Mobile Layout stack */}
        <div className="pb-20 pt-4 lg:hidden">
          {habitsSkeleton}
        </div>

      </div>
    </main>
  );
}
