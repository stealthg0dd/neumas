import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCanonicalAppUrl, isLegacyAppHost } from "@/lib/app-url";
import { NEUMAS_SESSION_COOKIE } from "@/lib/auth-session-cookie";

import { getSupabaseCookieOptions, getSupabasePublishableKey, getSupabaseUrl } from "./shared";

export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

/**
 * Email/password login and signup never establish a Supabase session (only Google OAuth does —
 * see src/app/auth/callback/route.ts) — they only produce a Neumas backend JWT stored in
 * localStorage, which middleware structurally cannot read. This cookie (set by
 * src/lib/store/auth.ts on saveAuth/clearAuth) is how that browser signals "I have an active
 * Neumas session" to middleware. It is not the security boundary — every API call is still
 * authorized by the backend via the real Bearer JWT — it only stops middleware from bouncing a
 * validly-authenticated email/password session back to /auth.
 */
export function hasNeumasSessionCookie(request: NextRequest): boolean {
  return request.cookies.get(NEUMAS_SESSION_COOKIE)?.value === "1";
}

/** The first, cheap protected-path gate in `updateSession` — extracted so it's unit-testable
 * without needing to mock the Supabase server client that the rest of the function constructs. */
export function isBlockedFromProtectedPath(request: NextRequest): boolean {
  const isProtectedPath =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/app") ||
    request.nextUrl.pathname.startsWith("/admin");
  if (!isProtectedPath) return false;

  const hasSupabaseSessionCookie = request.cookies.getAll().some(({ name }) => isSupabaseAuthCookie(name));
  return !hasSupabaseSessionCookie && !hasNeumasSessionCookie(request);
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const host = request.headers.get("host");
  if (host && isLegacyAppHost(host)) {
    const canonical = new URL(getCanonicalAppUrl());
    const redirectUrl = new URL(request.url);
    redirectUrl.protocol = canonical.protocol;
    redirectUrl.host = canonical.host;
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (isBlockedFromProtectedPath(request)) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl, 307);
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const cookieOptions = getSupabaseCookieOptions();
  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, {
              ...cookieOptions,
              ...options,
            });
          });

          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
      cookieOptions,
    }
  );

  // Keep auth cookies up to date and validate the session for protected routes.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requiresAuthenticatedUser =
    pathname.startsWith("/dashboard") || pathname.startsWith("/app") || pathname.startsWith("/admin");

  if (requiresAuthenticatedUser && !user && !hasNeumasSessionCookie(request)) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl, 307);
  }

  return response;
}
