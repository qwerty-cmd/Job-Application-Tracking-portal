import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ApiError } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an API error for display in a toast, including field-level details. */
export function formatApiError(
  error: ApiError | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback;
  const base = error.message || fallback;
  if (!error.details?.length) return base;
  const fieldErrors = error.details
    .map((d) => `${d.field}: ${d.message}`)
    .join("; ");
  return `${base} — ${fieldErrors}`;
}
