"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseCookieOptions, getSupabasePublishableKey, getSupabaseUrl } from "./shared";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookieOptions: getSupabaseCookieOptions(),
    }
  );

  return browserClient;
}
