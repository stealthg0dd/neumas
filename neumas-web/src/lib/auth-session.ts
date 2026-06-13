/**
 * Neumas Auth Session Orchestrator
 *
 * This is the SINGLE module responsible for:
 * - Storing and reading access/refresh tokens
 * - Token refresh lifecycle (retry on 401 before logout)
 * - Reconciling Supabase client session with backend JWT
 * - Logout (only after refresh failure or explicit user action)
 *
 * No other module should directly read/write tokens from localStorage.
 * Use the exported helpers below instead.
 */

import type { ProfileResponse } from "@/lib/api/types";
import { clearPendingAuthSessionCookie } from "@/lib/auth-bootstrap";
import { useAuthStore } from "@/lib/store/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = "neumas_access_token";
// Number of seconds before expiry to proactively refresh
const REFRESH_BUFFER_SECONDS = 60;

// ── Token storage ─────────────────────────────────────────────────────────────

/** Read the current access token from localStorage. Null if not logged in or SSR. */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Persist access token. Called by saveAuth — do not call directly. */
export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

/** Remove all tokens and clear Zustand store. */
export function clearTokens(): void {
  if (typeof window === "undefined") return;

  // Best-effort cookie/session cleanup for canonical Supabase session.
  import("@/utils/supabase/client")
    .then(({ createClient }) => createClient().auth.signOut())
    .catch(() => {});

  clearPendingAuthSessionCookie();
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem("neumas_access_token");
  sessionStorage.removeItem("neumas-auth");
  useAuthStore.getState().clearAuth();
}

async function fetchProfile(accessToken: string): Promise<ProfileResponse | null> {
  try {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as ProfileResponse;
  } catch {
    return null;
  }
}

async function syncFromSupabaseSession(options?: {
  forceRefresh?: boolean;
}): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const { createClient } = await import("@/utils/supabase/client");
  const supabase = createClient();

  let session = (
    await supabase.auth.getSession()
  ).data.session;

  if (options?.forceRefresh || !session?.access_token) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  if (!session?.access_token) {
    return false;
  }

  const profile = await fetchProfile(session.access_token);
  if (!profile) {
    return false;
  }

  const expiresIn =
    typeof session.expires_in === "number" && session.expires_in > 0
      ? session.expires_in
      : typeof session.expires_at === "number" && session.expires_at > 0
        ? Math.max(1, session.expires_at - Math.floor(Date.now() / 1000))
        : 3600;

  saveSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? null,
    expires_in: expiresIn,
    profile,
  });

  return true;
}

// ── Save after login/signup ────────────────────────────────────────────────────

/** Called after a successful login or signup response. */
export function saveSession(data: {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  profile: ProfileResponse;
}): void {
  setAccessToken(data.access_token);
  useAuthStore.getState().saveAuth(data);
}

// ── Token expiry check ────────────────────────────────────────────────────────

/** Returns true if the stored access token is expired (or about to expire). */
export function isTokenExpired(): boolean {
  const expiresAt = useAuthStore.getState().expiresAt;
  if (expiresAt == null) return true;
  return Date.now() / 1000 >= expiresAt - REFRESH_BUFFER_SECONDS;
}

// ── Refresh lifecycle ─────────────────────────────────────────────────────────

let _refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the session using the stored refresh token.
 * Returns true if successful, false if the refresh failed (requires logout).
 *
 * Concurrent callers during an in-flight refresh share the same promise
 * to avoid duplicate refresh requests.
 */
export async function attemptRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = _doRefresh().finally(() => {
    _refreshPromise = null;
  });

  return _refreshPromise;
}

async function _doRefresh(): Promise<boolean> {
  return syncFromSupabaseSession({ forceRefresh: true });
}

// ── Rehydration reconciliation ────────────────────────────────────────────────

/**
 * Called on app startup (client side) to reconcile stored auth state.
 * - If token is expired and refresh token exists, attempt silent refresh.
 * - If refresh fails, clear state (user will see login screen).
 * - If no token at all, clear state cleanly.
 */
export async function rehydrateSession(): Promise<void> {
  const store = useAuthStore.getState();

  if (!store.token) {
    // No local token yet — attempt bootstrap from canonical Supabase session.
    await syncFromSupabaseSession();
    return;
  }

  if (isTokenExpired()) {
    const refreshed = await attemptRefresh();
    if (!refreshed) {
      clearTokens();
    }
  }
}

// ── Explicit logout ────────────────────────────────────────────────────────────

/**
 * Log the user out. Calls the backend logout endpoint (best effort),
 * then clears all local state.
 */
export async function logout(): Promise<void> {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();

    const token = getAccessToken();
    if (token) {
      // Best-effort backend audit logout (token already validated by backend).
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    await supabase.auth.signOut();
  } catch {
    // Continue with local cleanup even if signOut fails.
  }
  clearTokens();
}
