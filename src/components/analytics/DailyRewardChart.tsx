import { motion } from "framer-motion";
import { emaBySmoothing, linePath } from "../../lib/chart";
import { formatShortDate } from "../../lib/date";
import type { ChartGranularity, DayPoint } from "../../types";

export function DailyRewardChart({
  data,
  showBars,
  showEma,
  smoothing,
  granularity,
}: {
  data: DayPoint[];
  showBars: boolean;
  showEma: boolean;
  smoothing: number;
  granularity: Exclude<ChartGranularity, "auto">;
}) {
  const width = 760;
  const height = 270;
  const padX = 34;
  const padTop = 28;
  const padBottom = 40;
  const innerHeight = height - padTop - padBottom;
  const maxReward = Math.max(1, ...data.map((day) => day.reward));
  const emaValues = emaBySmoothing(data.map((day) => day.reward), smoothing);
  const maxValue = Math.max(showBars ? maxReward : 0, showEma ? Math.max(...emaValues, 0) : 0, 1);
  const gap = data.length > 120 ? 1 : data.length > 60 ? 3 : 9;
  const barWidth = data.length ? Math.max(1, (width - padX * 2 - gap * (data.length - 1)) / data.length) : 0;
  const step = data.length ? barWidth + gap : 0;
  const xFor = (index: number) => padX + index * step + barWidth / 2;
  const yFor = (value: number) => height - padBottom - (value / maxValue) * innerHeight;
  const emaPoints = emaValues.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
  const rawPoints = data.map((day, index) => ({ x: xFor(index), y: yFor(day.reward) }));
  const emaPath = linePath(emaPoints);
  const rawPath = linePath(rawPoints);
  const labelFor = (day: DayPoint) => day.label ?? formatShortDate(day.date);
  const showEveryLabel = data.length <= 12;
  const showQuarterLabel = data.length <= 48;

  return (
    <div className="mt-6">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full overflow-visible" role="img" aria-label={`${granularity} reward chart with optional bars and EMA`}>
        {[0, 1, 2, 3].map((line) => {
          const y = padTop + line * (innerHeight / 3);
          return <line key={line} x1={padX} x2={width - padX} y1={y} y2={y} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />;
        })}
        {showBars
          ? data.map((day, index) => {
              const barHeight = Math.round((day.reward / maxValue) * innerHeight);
              const x = padX + index * step;
              const y = height - padBottom - barHeight;
              return (
                <motion.rect
                  key={day.date}
                  initial={{ y: height - padBottom, height: 0 }}
                  animate={{ y, height: barHeight }}
                  transition={{ type: "spring", stiffness: 100, damping: 18, delay: Math.min(index * 0.008, 0.25) }}
                  x={x}
                  width={barWidth}
                  rx="5"
                  fill="currentColor"
                  className={day.reward > 0 ? "text-emerald-500/35 dark:text-emerald-400/30" : "text-zinc-200 dark:text-zinc-800"}
                />
              );
            })
          : null}
        {!showBars && rawPath ? (
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            d={rawPath}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            className="text-emerald-500"
          />
        ) : null}
        {showEma && emaPath ? (
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            d={emaPath}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="4"
            className="text-zinc-950 dark:text-zinc-50"
          />
        ) : null}
        {showEma && data.length <= 120
          ? emaPoints.map((point, index) => (
              <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={index === emaPoints.length - 1 ? "5" : "2.5"} className="fill-zinc-950 dark:fill-zinc-50" />
            ))
          : null}
        {data.map((day, index) => (
          <g key={`${day.date}-marker`}>
            {data.length <= 180 ? (
              <circle
                cx={xFor(index)}
                cy={height - 20}
                r="4"
                className={day.complete ? "fill-emerald-500" : day.completed > 0 ? "fill-amber-500" : "fill-zinc-300 dark:fill-zinc-700"}
              />
            ) : null}
            <text x={xFor(index)} y={height - 4} textAnchor="middle" className="fill-zinc-500 text-[12px] dark:fill-zinc-400">
              {showEveryLabel || index === 0 || index === data.length - 1 || (showQuarterLabel && index % Math.ceil(data.length / 4) === 0)
                ? labelFor(day)
                : ""}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <LegendDot className="bg-emerald-500" label="complete" />
        <LegendDot className="bg-amber-500" label="partial" />
        <LegendDot className="bg-zinc-300 dark:bg-zinc-700" label="missed" />
        {showBars ? <LegendDot className="rounded-sm bg-emerald-500/35 dark:bg-emerald-400/30" label={`${granularity} reward`} /> : null}
        {showEma ? <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-zinc-950 dark:bg-zinc-50" /> EMA trend</span> : null}
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}
