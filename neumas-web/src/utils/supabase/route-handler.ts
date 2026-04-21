import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { getSupabaseCookieOptions, getSupabasePublishableKey, getSupabaseUrl } from "./shared";

export function createRouteHandlerClient(
  request: NextRequest,
  response: NextResponse
) {
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

  return { supabase, response };
}
