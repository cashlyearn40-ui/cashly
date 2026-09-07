import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Module-level user session token — set after login/signup, cleared on logout.
 * All apiRequest calls and React Query fetches automatically inject this as
 * the x-user-token header so the server can identify the caller without
 * trusting a client-supplied email.
 */
let _userToken: string | null = null;
export function setUserToken(token: string | null) {
  _userToken = token;
}

/**
 * Gets the base URL for the Express API server (e.g., "https://xyz.replit.dev/")
 */
export function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (!host) throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  return new URL(`https://${host}`).href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  // Automatically attach the user session token so the server can verify
  // identity without trusting any email the client sends in the body.
  if (_userToken) headers["x-user-token"] = _userToken;
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const headers: Record<string, string> = {};
    if (_userToken) headers["x-user-token"] = _userToken;

    const res = await fetch(url.toString(), {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
