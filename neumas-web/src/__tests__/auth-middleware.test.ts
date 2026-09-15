import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { isBlockedFromProtectedPath } from "@/utils/supabase/proxy";

function requestFor(path: string, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(new URL(path, "https://app.neumas.cc"));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("isBlockedFromProtectedPath (AUTH-001 root cause fix)", () => {
  it("blocks an unauthenticated visit to a protected path", () => {
    expect(isBlockedFromProtectedPath(requestFor("/dashboard"))).toBe(true);
  });

  it("does NOT block a non-protected path even with no cookies", () => {
    expect(isBlockedFromProtectedPath(requestFor("/pricing"))).toBe(false);
    expect(isBlockedFromProtectedPath(requestFor("/auth"))).toBe(false);
  });

  it("allows a Google-OAuth session (Supabase cookie) through — regression guard", () => {
    expect(
      isBlockedFromProtectedPath(
        requestFor("/dashboard", { "sb-xyz-auth-token": "some-supabase-session-value" })
      )
    ).toBe(false);
  });

  it("allows an email/password session (neumas_session cookie) through — the actual fix", () => {
    expect(isBlockedFromProtectedPath(requestFor("/dashboard", { neumas_session: "1" }))).toBe(false);
  });

  it("still blocks if neumas_session cookie exists but is not exactly '1'", () => {
    expect(isBlockedFromProtectedPath(requestFor("/dashboard", { neumas_session: "0" }))).toBe(true);
    expect(isBlockedFromProtectedPath(requestFor("/dashboard", { neumas_session: "" }))).toBe(true);
  });

  it("blocks /app and /admin the same way as /dashboard", () => {
    expect(isBlockedFromProtectedPath(requestFor("/app/foo"))).toBe(true);
    expect(isBlockedFromProtectedPath(requestFor("/admin"))).toBe(true);
    expect(isBlockedFromProtectedPath(requestFor("/app", { neumas_session: "1" }))).toBe(false);
  });
});
