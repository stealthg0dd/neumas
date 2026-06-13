import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

function loadServiceWorker(env: {
  self: Record<string, unknown>;
  caches: Record<string, unknown>;
  fetch: (...args: unknown[]) => unknown;
  clients: Record<string, unknown>;
}) {
  const code = fs.readFileSync(path.join(__dirname, "../../public/sw.js"), "utf-8");
  const runner = new Function("self", "caches", "fetch", "clients", code);
  runner(env.self, env.caches, env.fetch, env.clients);
}

describe("service worker /dashboard navigation", () => {
  it("bypasses the cache and goes straight to the network for /dashboard navigations", async () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const self: Record<string, unknown> = {
      addEventListener: (name: string, cb: (event: unknown) => void) => {
        listeners[name] = cb;
      },
      skipWaiting: vi.fn(),
    };

    const cachesMatch = vi.fn().mockResolvedValue(new Response("stale-shell"));
    const caches = {
      open: vi.fn().mockResolvedValue({ addAll: vi.fn(), put: vi.fn() }),
      match: cachesMatch,
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    };

    const networkResponse = new Response("live-dashboard");
    const fetchMock = vi.fn().mockResolvedValue(networkResponse);

    loadServiceWorker({ self, caches, fetch: fetchMock, clients: {} });

    const respondWith = vi.fn();
    const event = {
      request: {
        method: "GET",
        url: "https://www.neumas.cc/dashboard",
        mode: "navigate",
      },
      respondWith,
    };

    (listeners.fetch as (event: unknown) => void)(event);

    expect(respondWith).toHaveBeenCalledTimes(1);
    const result = await respondWith.mock.calls[0][0];

    expect(result).toBe(networkResponse);
    expect(fetchMock).toHaveBeenCalledWith(event.request);
    expect(cachesMatch).not.toHaveBeenCalled();
  });

  it("still serves cached assets for non-dashboard GET requests", async () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const self: Record<string, unknown> = {
      addEventListener: (name: string, cb: (event: unknown) => void) => {
        listeners[name] = cb;
      },
      skipWaiting: vi.fn(),
    };

    const cachedResponse = new Response("cached-icon");
    const cachesMatch = vi.fn().mockResolvedValue(cachedResponse);
    const caches = {
      open: vi.fn().mockResolvedValue({ addAll: vi.fn(), put: vi.fn() }),
      match: cachesMatch,
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    };

    const fetchMock = vi.fn();

    loadServiceWorker({ self, caches, fetch: fetchMock, clients: {} });

    const respondWith = vi.fn();
    const event = {
      request: {
        method: "GET",
        url: "https://www.neumas.cc/icon-192.png",
        mode: "navigate",
      },
      respondWith,
    };

    (listeners.fetch as (event: unknown) => void)(event);

    const result = await respondWith.mock.calls[0][0];

    expect(result).toBe(cachedResponse);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
