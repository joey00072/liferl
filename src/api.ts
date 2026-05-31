import type { State } from "./types";

export async function requestState(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as State;
}
