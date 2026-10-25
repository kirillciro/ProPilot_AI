import * as SecureStore from "expo-secure-store";
import type { SessionResponse } from "@propilot/shared";
import { API_URL } from "./config";

const REFRESH_KEY = "propilot.refresh";
const keychain = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Access token lives in memory only; the rotating refresh token lives in the iOS Keychain.
let access: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;
let onExpired: (() => void) | undefined;

export function setOnSessionExpired(fn: () => void) {
  onExpired = fn;
}

export async function storeSession(s: SessionResponse) {
  access = { token: s.accessToken, expiresAt: Date.now() + s.expiresIn * 1000 };
  await SecureStore.setItemAsync(REFRESH_KEY, s.refreshToken, keychain);
}

export async function hasStoredSession() {
  return (await SecureStore.getItemAsync(REFRESH_KEY, keychain)) != null;
}

export async function clearSession() {
  access = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY, keychain);
}

export async function signOutRemote() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY, keychain);
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  await clearSession();
}

async function refresh(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY, keychain);
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (res.status === 401) {
    await clearSession();
    onExpired?.();
    return null;
  }
  if (!res.ok) throw new Error("Could not reach the server");
  await storeSession((await res.json()) as SessionResponse);
  return access?.token ?? null;
}

export function getAccessToken(): Promise<string | null> {
  if (access && access.expiresAt - Date.now() > 30_000) {
    return Promise.resolve(access.token);
  }
  inflight ??= refresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function invalidateAccessToken() {
  access = null;
}
