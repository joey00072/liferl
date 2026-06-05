import type { State } from "./types";

export async function requestState(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
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
  return (await response.json()) as State;
}
