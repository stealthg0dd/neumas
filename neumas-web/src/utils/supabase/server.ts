import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseCookieOptions, getSupabasePublishableKey, getSupabaseUrl } from "./shared";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...getSupabaseCookieOptions(),
                ...options,
              });
            });
          } catch {
            // Server Components cannot always write cookies. The proxy/route
            // handler path is responsible for persisting refreshed auth tokens.
          }
        },
      },
      cookieOptions: getSupabaseCookieOptions(),
    }
  );
}
