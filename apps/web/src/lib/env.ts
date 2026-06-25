/**
 * Public browser and server environment for Las Marías Experience web.
 * Set `NEXT_PUBLIC_*` in `.env.local` or deployment config — see `apps/web/.env.example`.
 */

export type AppMode = "development" | "production";

/**
 * Base URL of the Nest API (no trailing slash).
 * Must be set via `NEXT_PUBLIC_API_BASE_URL` (no code fallback).
 */
export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!raw) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local and set the API base URL."
    );
  }
  return raw.replace(/\/+$/, "");
}

/** Absolute API URL for a path beginning with `/`. */
export function publicApiUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Application mode for UI or diagnostics.
 * Uses `NEXT_PUBLIC_APP_MODE` when set; otherwise follows Next.js `NODE_ENV`.
 */
export function getAppMode(): AppMode {
  const m = process.env.NEXT_PUBLIC_APP_MODE?.trim().toLowerCase();
  if (m === "production") return "production";
  if (m === "development") return "development";
  return process.env.NODE_ENV === "production" ? "production" : "development";
}
