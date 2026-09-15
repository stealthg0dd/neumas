/**
 * Name of a lightweight, non-sensitive marker cookie that signals "this browser has an active
 * Neumas session" to server-side middleware.
 *
 * Root cause context: email/password login and signup only ever produce a Neumas backend JWT,
 * stored in localStorage (see src/lib/store/auth.ts) — they never establish a Supabase session,
 * so no `sb-*-auth-token` cookie exists for that path. Middleware (src/utils/supabase/proxy.ts)
 * previously only checked for that Supabase cookie, so it could never see a valid
 * email/password-authenticated browser and permanently bounced it back to
 * `/auth?next=%2Fdashboard`. This cookie closes that gap without middleware needing to read
 * localStorage (which it structurally cannot — middleware runs server-side).
 *
 * This cookie carries no token material, only presence ("1"), and is not the security boundary:
 * every actual API call is still authorized by the backend via the Bearer JWT, and the client-side
 * dashboard guard (src/app/dashboard/layout.tsx) independently verifies real session state on
 * mount. This cookie only prevents middleware from bouncing an otherwise-valid session.
 */
export const NEUMAS_SESSION_COOKIE = "neumas_session";
