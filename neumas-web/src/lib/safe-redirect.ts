/**
 * Validates a `next` redirect target so it can only ever point somewhere inside this app —
 * never to an external host (open redirect protection). Used by both the client-side /auth page
 * and the server-side OAuth callback route, so both paths reject the same shapes of input.
 */
const DEFAULT_SAFE_NEXT = "/dashboard";

export function resolveSafeNextPath(
  rawNext: string | null | undefined,
  fallback: string = DEFAULT_SAFE_NEXT
): string {
  if (!rawNext) return fallback;

  // Must be a single, relative, same-origin path: starts with exactly one "/", never "//"
  // (protocol-relative — browsers treat "//evil.com" as "https://evil.com"), never contains
  // "://" (an absolute URL smuggled into a path-shaped string), and never a backslash (browsers
  // normalize leading "\" to "/", enabling "/\evil.com"-style bypasses of the "//" check).
  if (
    !rawNext.startsWith("/") ||
    rawNext.startsWith("//") ||
    rawNext.includes("://") ||
    rawNext.includes("\\")
  ) {
    return fallback;
  }

  return rawNext;
}
