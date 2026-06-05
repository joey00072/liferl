export function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`));
}

export function getTodayString() {
  return new Date().toLocaleDateString("en-CA");
}

export function parseDateString(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function latestDate(dates: string[]) {
  return dates.filter(Boolean).sort().at(-1);
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
