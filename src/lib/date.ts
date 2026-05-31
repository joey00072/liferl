export function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`));
}

export function formatMonth(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(new Date(`${date}T00:00:00`));
}

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toLocaleDateString("en-CA");
}

export function dateRange(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}
