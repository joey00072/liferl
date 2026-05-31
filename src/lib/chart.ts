export function streaks(days: { complete: boolean }[]) {
  let current = 0;
  let best = 0;
  for (const day of days) {
    current = day.complete ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
}

export function linePath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  return points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      const prev = points[index - 1];
      const midX = (prev.x + point.x) / 2;
      return `C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    })
    .join(" ");
}

export function emaBySmoothing(values: number[], smoothing: number) {
  const alpha = Math.max(0.01, Math.min(0.9, 1 - smoothing));
  return values.reduce<number[]>((series, value, index) => {
    const previous = index === 0 ? 0 : series[index - 1];
    series.push(alpha * value + (1 - alpha) * previous);
    return series;
  }, []);
}
