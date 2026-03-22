import type { ApiResponse } from "@/types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = `${BASE_URL}${path}`;
  if (!params) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  }
  const qs = searchParams.toString();
  return qs ? `${url}?${qs}` : url;
}

function networkError(message: string): ApiResponse<never> {
  return {
    data: null,
    error: { code: "NETWORK_ERROR", message },
  };
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  try {
    const options: RequestInit = {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    const contentType = res.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      return networkError(`Unexpected response format (${res.status})`);
    }

    return (await res.json()) as ApiResponse<T>;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    return networkError(message);
  }
}

export const api = {
  get<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    return request<T>("GET", buildUrl(path, params));
  },

  post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return request<T>("POST", buildUrl(path), body);
  },

  patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return request<T>("PATCH", buildUrl(path), body);
  },

  delete<T>(path: string): Promise<ApiResponse<T>> {
    return request<T>("DELETE", buildUrl(path));
  },
};
