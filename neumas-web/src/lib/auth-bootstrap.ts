import type { ProfileResponse } from "@/lib/api/types";

export const AUTH_BOOTSTRAP_COOKIE = "neumas_auth_bootstrap";

export interface PendingAuthSession {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  profile: ProfileResponse;
}

function isBrowser(): boolean {
  return typeof document !== "undefined";
}

export function encodePendingAuthSession(session: PendingAuthSession): string {
  return encodeURIComponent(JSON.stringify(session));
}

export function decodePendingAuthSession(value: string | null | undefined): PendingAuthSession | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as PendingAuthSession;
    if (!parsed?.access_token || !parsed?.profile) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function readPendingAuthSessionCookie(): PendingAuthSession | null {
  if (!isBrowser()) return null;

  const encodedCookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${AUTH_BOOTSTRAP_COOKIE}=`))
    ?.slice(`${AUTH_BOOTSTRAP_COOKIE}=`.length);

  return decodePendingAuthSession(encodedCookie);
}

export function clearPendingAuthSessionCookie(): void {
  if (!isBrowser()) return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${AUTH_BOOTSTRAP_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

export function consumePendingAuthSessionCookie(): PendingAuthSession | null {
  const session = readPendingAuthSessionCookie();
  if (session) {
    clearPendingAuthSessionCookie();
  }
  return session;
}
