import { getOAuthRedirectUrl } from "@/lib/app-url";
import { createClient } from "@/utils/supabase/client";

export const supabase = createClient();

/** Initiate Google OAuth sign-in via Supabase. */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = getOAuthRedirectUrl();
  const supabase = createClient();

  // Supabase dashboard reminder:
  // In Supabase Dashboard -> Auth -> URL Configuration: add
  // https://neumasfinal.vercel.app/** and https://*.vercel.app/** and
  // http://localhost:3000/** as redirect URLs (use ** wildcard). Also add
  // the same in Google Cloud Console OAuth redirect URIs.
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    console.error("[Supabase] OAuth initiation error:", error.message);
    throw error;
  }
}
