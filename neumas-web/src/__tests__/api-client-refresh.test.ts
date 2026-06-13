// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";

vi.mock("@/lib/auth-session", () => ({
  attemptRefresh: vi.fn().mockResolvedValue(true),
  getAccessToken: vi.fn().mockReturnValue("new-token"),
  clearTokens: vi.fn(),
}));

describe("api client refresh behavior", () => {
  it("attempts refresh once and retries the original request", async () => {
    const { apiClient } = await import("@/lib/api/client");
    const handlers = (apiClient.interceptors.response as unknown as {
      handlers: Array<{ rejected: (error: unknown) => Promise<unknown> }>;
    }).handlers;
    const rejected = handlers[0].rejected;

    const config = {
      url: "/api/ping",
      headers: {},
      adapter: async (requestConfig: InternalAxiosRequestConfig) => ({
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config: requestConfig,
      }),
    } as InternalAxiosRequestConfig;

    const result = (await rejected({
      config,
      response: {
        status: 401,
        data: { detail: "expired" },
      },
    })) as { status: number; data: { ok: boolean } };

    expect(result.status).toBe(200);
    expect(result.data.ok).toBe(true);
  });
});
