// API client for Passaroo backend.
import { storage } from "@/src/utils/storage";
import { getDeviceId } from "@/src/utils/deviceId";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
const SESSION_KEY = "passaroo_session_token";

export async function getToken(): Promise<string | null> {
  return await storage.secureGet(SESSION_KEY, null as string | null);
}
export async function setToken(token: string): Promise<void> {
  await storage.secureSet(SESSION_KEY, token);
}
export async function clearToken(): Promise<void> {
  await storage.secureRemove(SESSION_KEY);
}

export type ApiOptions = {
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  body?: any;
  auth?: boolean;
};

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Device id — always sent (used for anti-abuse, single-device session, guest gating)
  try {
    headers["X-Device-Id"] = await getDeviceId();
  } catch {
    // best-effort, do not block the call
  }
  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    // Detail can be a structured object (e.g. {code, message}) — surface message preferentially
    let msg: string;
    const d = data?.detail;
    if (typeof d === "string") msg = d;
    else if (d && typeof d === "object") msg = d.message || d.reason || JSON.stringify(d);
    else msg = `Request failed (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.detail = d;
    throw err;
  }
  return data as T;
}
