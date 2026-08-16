import type { ApiResponse } from "@yta/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

/**
 * Server-side fetch helper. Returns null when the backend is unreachable or
 * responds with an error, so pages can render a friendly offline state
 * instead of crashing.
 */
export async function fetchApi<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(apiUrl(path), { cache: "no-store" });
    if (!response.ok) return null;
    const json = (await response.json()) as ApiResponse<T>;
    return json.ok ? json.data : null;
  } catch {
    return null;
  }
}
