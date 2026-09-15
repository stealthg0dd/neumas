import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/lib/store/auth";
import type { ProfileResponse } from "@/lib/api/types";

const profile: ProfileResponse = {
  user_id: "user-1",
  email: "chef@example.com",
  full_name: "Test Chef",
  org_id: "org-1",
  org_name: "Neumas Test",
  property_id: "property-1",
  property_name: "Main Kitchen",
  role: "admin",
};

function clearCookieJar() {
  document.cookie = "neumas_session=; Path=/; Max-Age=0";
}

function resetAuthStore() {
  useAuthStore.setState({
    token: null,
    refreshToken: null,
    expiresAt: null,
    profile: null,
    orgId: null,
    propertyId: null,
    _hasHydrated: false,
  });
}

describe("auth store neumas_session cookie lifecycle (AUTH-001 fix)", () => {
  beforeEach(() => {
    clearCookieJar();
    localStorage.clear();
    resetAuthStore();
  });

  afterEach(() => {
    clearCookieJar();
    localStorage.clear();
    resetAuthStore();
  });

  it("saveAuth sets the neumas_session marker cookie middleware relies on", () => {
    expect(document.cookie).not.toContain("neumas_session=1");

    useAuthStore.getState().saveAuth({
      access_token: "not-a-real-jwt",
      refresh_token: "refresh-token",
      expires_in: 3600,
      profile,
    });

    expect(document.cookie).toContain("neumas_session=1");
  });

  it("clearAuth (logout) removes the neumas_session marker cookie", () => {
    useAuthStore.getState().saveAuth({
      access_token: "not-a-real-jwt",
      refresh_token: "refresh-token",
      expires_in: 3600,
      profile,
    });
    expect(document.cookie).toContain("neumas_session=1");

    useAuthStore.getState().clearAuth();

    // Regression: if this cookie survives logout, middleware would let the signed-out browser
    // straight back into /dashboard on the next request instead of bouncing it to /auth.
    expect(document.cookie).not.toContain("neumas_session=1");
  });
});
