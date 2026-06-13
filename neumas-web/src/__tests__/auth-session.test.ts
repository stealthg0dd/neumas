import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/lib/store/auth";

const getSessionMock = vi.fn().mockResolvedValue({
  data: { session: null },
  error: null,
});
const refreshSessionMock = vi.fn();

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
      signOut: vi.fn(),
    },
  }),
}));

describe("auth-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      token: null,
      refreshToken: null,
      expiresAt: null,
      profile: null,
      orgId: null,
      propertyId: null,
      _hasHydrated: true,
    });
  });

  it("bootstraps and saves session from Supabase canonical session", async () => {
    const now = Math.floor(Date.now() / 1000);
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "fresh-access-token",
          refresh_token: "fresh-refresh-token",
          expires_in: 3600,
          expires_at: now + 3600,
        },
      },
    });
    refreshSessionMock.mockResolvedValue({ data: { session: null } });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user_id: "user-1",
          email: "chef@example.com",
          full_name: "Chef",
          org_id: "org-1",
          org_name: "Org",
          property_id: "prop-1",
          property_name: "Main Kitchen",
          role: "admin",
        }),
      })
    );

    const { rehydrateSession } = await import("@/lib/auth-session");
    await rehydrateSession();

    const state = useAuthStore.getState();
    expect(state.token).toBe("fresh-access-token");
    expect(state.refreshToken).toBe("fresh-refresh-token");
    expect(state.profile?.email).toBe("chef@example.com");
  });
});
