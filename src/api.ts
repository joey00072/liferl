import type { State } from "./types";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

function apiUrl(url: string) {
  if (!apiBaseUrl || /^https?:\/\//.test(url)) return url;
  return `${apiBaseUrl}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function requestState(url: string, options?: RequestInit) {
  const response = await fetch(apiUrl(url), options);
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
