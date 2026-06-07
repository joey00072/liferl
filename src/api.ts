import type { State } from "./types";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const offlineQueueKey = "liferl-offline-commands";
const deviceIdKey = "liferl-device-id";

type OfflineCommand = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  clientSelectedDate?: string;
  clientObservedAt: string;
};

function apiUrl(url: string) {
  if (!apiBaseUrl || /^https?:\/\//.test(url)) return url;
  return `${apiBaseUrl}${url.startsWith("/") ? url : `/${url}`}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function getDeviceId() {
  if (!isBrowser()) return "server";
  let deviceId = localStorage.getItem(deviceIdKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(deviceIdKey, deviceId);
  }
  return deviceId;
}

function readOfflineQueue() {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(offlineQueueKey) || "[]") as OfflineCommand[];
  } catch {
    return [];
  }
}

function writeOfflineQueue(commands: OfflineCommand[]) {
  if (!isBrowser()) return;
  localStorage.setItem(offlineQueueKey, JSON.stringify(commands));
}

function parseBody(options?: RequestInit) {
  if (!options?.body || typeof options.body !== "string") return {};
  try {
    return JSON.parse(options.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function commandFromRequest(url: string, options?: RequestInit): OfflineCommand | null {
  if (!isBrowser()) return null;
  const method = String(options?.method || "GET").toUpperCase();
  if (method === "GET") return null;

  const parsedUrl = new URL(url, window.location.origin);
  const path = parsedUrl.pathname;
  const body = parseBody(options);
  const clientSelectedDate = parsedUrl.searchParams.get("date") || (typeof body.date === "string" ? body.date : undefined);
  const observedAt = new Date().toISOString();

  if (method === "POST" && path === "/api/tasks") {
    return { id: crypto.randomUUID(), type: "create_task", payload: body, clientSelectedDate, clientObservedAt: observedAt };
  }

  if (method === "PATCH" && path === "/api/day") {
    return { id: crypto.randomUUID(), type: "update_day", payload: body, clientSelectedDate, clientObservedAt: observedAt };
  }

  if (method === "POST" && path === "/api/pomodoro/start") {
    return { id: crypto.randomUUID(), type: "start_pomodoro", payload: body, clientSelectedDate, clientObservedAt: observedAt };
  }

  if (method === "POST" && path === "/api/pomodoro/stop") {
    return { id: crypto.randomUUID(), type: "stop_pomodoro", payload: {}, clientSelectedDate, clientObservedAt: observedAt };
  }

  if (method === "POST" && path === "/api/pomodoro/cancel") {
    return { id: crypto.randomUUID(), type: "cancel_pomodoro", payload: {}, clientSelectedDate, clientObservedAt: observedAt };
  }

  if (method === "POST" && path === "/api/pomodoro/pause") {
    return { id: crypto.randomUUID(), type: "pause_pomodoro", payload: {}, clientSelectedDate, clientObservedAt: observedAt };
  }

  if (method === "POST" && path === "/api/pomodoro/resume") {
    return { id: crypto.randomUUID(), type: "resume_pomodoro", payload: {}, clientSelectedDate, clientObservedAt: observedAt };
  }

  const taskMatch = path.match(/^\/api\/tasks\/([^/]+)(?:\/(toggle|restore))?$/);
  if (!taskMatch) return null;

  const taskId = decodeURIComponent(taskMatch[1]);
  const action = taskMatch[2];
  if (method === "POST" && action === "toggle") {
    return { id: crypto.randomUUID(), type: "toggle_task", payload: { taskId }, clientSelectedDate, clientObservedAt: observedAt };
  }
  if (method === "POST" && action === "restore") {
    return { id: crypto.randomUUID(), type: "restore_task", payload: { taskId }, clientSelectedDate, clientObservedAt: observedAt };
  }
  if (method === "PATCH" && !action) {
    return { id: crypto.randomUUID(), type: "update_task", payload: { ...body, taskId }, clientSelectedDate, clientObservedAt: observedAt };
  }
  if (method === "DELETE" && !action) {
    return { id: crypto.randomUUID(), type: "archive_task", payload: { taskId }, clientSelectedDate, clientObservedAt: observedAt };
  }

  return null;
}

function enqueueOfflineCommand(command: OfflineCommand) {
  const queue = readOfflineQueue();
  queue.push(command);
  writeOfflineQueue(queue);
}

export async function flushOfflineCommands() {
  const queue = readOfflineQueue();
  if (queue.length === 0) return;

  const response = await fetch(apiUrl("/api/commands/batch"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId(), commands: queue }),
  });
  if (!response.ok) throw new Error("Could not sync offline changes.");

  const payload = (await response.json()) as { results?: Array<{ id?: string; status?: string }> };
  const completedIds = new Set((payload.results || []).filter((result) => result.id).map((result) => result.id));
  writeOfflineQueue(queue.filter((command) => !completedIds.has(command.id)));
}

export async function requestState(url: string, options?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), options);
  } catch (error) {
    const command = commandFromRequest(url, options);
    if (command) {
      enqueueOfflineCommand(command);
      throw new Error("Saved offline. It will sync when the server reconnects.");
    }
    throw error;
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const payload = JSON.parse(text) as { error?: string };
      message = payload.error || text;
    } catch {
      message = text;
    }
    throw new Error(message || "Request failed.");
  }

  if (String(options?.method || "GET").toUpperCase() === "GET") {
    flushOfflineCommands().catch(() => undefined);
  }

  return (await response.json()) as State;
}

export function subscribeToStateEvents(onStateChanged: () => void) {
  if (!isBrowser()) return () => undefined;

  const events = new EventSource(apiUrl("/api/events"));
  events.addEventListener("state_changed", () => onStateChanged());
  events.onerror = () => undefined;

  return () => events.close();
}

export async function startPomodoro(
  taskId: string | null,
  plannedSeconds: number,
  date?: string,
  mode?: "focus" | "short_break" | "long_break",
) {
  return requestState(`/api/pomodoro/start${date ? `?date=${date}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId, plannedSeconds, mode }),
  });
}

export async function stopPomodoro(date?: string) {
  return requestState(`/api/pomodoro/stop${date ? `?date=${date}` : ""}`, {
    method: "POST",
  });
}

export async function cancelPomodoro(date?: string) {
  return requestState(`/api/pomodoro/cancel${date ? `?date=${date}` : ""}`, {
    method: "POST",
  });
}

export async function pausePomodoro(date?: string) {
  return requestState(`/api/pomodoro/pause${date ? `?date=${date}` : ""}`, {
    method: "POST",
  });
}

export async function resumePomodoro(date?: string) {
  return requestState(`/api/pomodoro/resume${date ? `?date=${date}` : ""}`, {
    method: "POST",
  });
}
