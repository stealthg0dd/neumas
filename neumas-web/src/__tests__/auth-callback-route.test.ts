import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSessionMock, cookieSetMock } = vi.hoisted(() => ({
  exchangeCodeForSessionMock: vi.fn(),
  cookieSetMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: cookieSetMock,
  }),
}));

vi.mock("@/utils/supabase/route-handler", () => ({
  createRouteHandlerClient: () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { GET } from "@/app/auth/callback/route";

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("redirects to /dashboard with the bootstrap cookie set on the success path", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "access-token-123",
          refresh_token: "refresh-token-456",
          expires_in: 3600,
        },
      },
      error: null,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "user-1",
          email: "user@example.com",
          full_name: "Test User",
          org_id: "org-1",
          org_name: "Org",
          property_id: "prop-1",
          property_name: "Property",
          role: "owner",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const request = new Request("https://www.neumas.cc/auth/callback?code=abc123", {
      headers: { "x-forwarded-host": "www.neumas.cc" },
    });

    const response = await GET(request as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.neumas.cc/dashboard");

    const setCookie = response.cookies.get("neumas_auth_bootstrap");
    expect(setCookie).toBeDefined();
    expect(setCookie?.value).toBeTruthy();
  });

  it("redirects to /auth with an error when the code exchange fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({
      data: { session: null },
      error: new Error("invalid code"),
    });

    const request = new Request("https://www.neumas.cc/auth/callback?code=bad", {
      headers: { "x-forwarded-host": "www.neumas.cc" },
    });

    const response = await GET(request as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.neumas.cc/auth?error=oauth_complete_failed"
    );
  });
});
