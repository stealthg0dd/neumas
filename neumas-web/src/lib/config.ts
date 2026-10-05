/**
 * Environment variable configuration and validation for neumas-web.
 *
 * Usage:
 *  - publicConfig  — safe to import anywhere (SSR + browser)
 *  - serverConfig  — import ONLY in Server Components, API routes, or instrumentation.ts
 *  - validateServerConfig() — call once from instrumentation.ts on startup;
 *    logs FATAL and exits(1) if any required server-side var is absent
 */

// ── Public (client-safe) vars ─────────────────────────────────────────────────
// These carry the NEXT_PUBLIC_ prefix and are inlined by the Next.js bundler.

export const publicConfig = {
  /** Browser-safe API base. Keep this as /api so requests flow through Next.js. */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "/api",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  postHogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  postHogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
  /** "development" | "staging" | "production" */
  environment:
    process.env.NEXT_PUBLIC_ENVIRONMENT ??
    process.env.ENVIRONMENT ??
    "development",
} as const;

// ── Server-only vars ──────────────────────────────────────────────────────────
// Never access these in browser-side code. They are NOT prefixed NEXT_PUBLIC_.

export const serverConfig = {
  supabaseServiceKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    "",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  agentOsUrl: process.env.AGENT_OS_URL ?? "",
  agentOsApiKey: process.env.AGENT_OS_API_KEY ?? "",
  /** Public URL of this neumas-web deployment (no trailing slash). */
  appUrl: process.env.APP_URL
    ?? (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : "http://localhost:3000"),
  /** App version — set to git SHA or semver in CI/CD. */
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
  /** "development" | "staging" | "production" */
  environment: process.env.ENVIRONMENT ?? "development",
} as const;

// ── Env-var name mapping (for error messages) ─────────────────────────────────

const SERVER_VAR_NAMES: Record<keyof typeof serverConfig, string> = {
  supabaseServiceKey: "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY",
  sentryDsn: "SENTRY_DSN",
  agentOsUrl: "AGENT_OS_URL",
  agentOsApiKey: "AGENT_OS_API_KEY",
  appUrl: "APP_URL / RAILWAY_PUBLIC_DOMAIN",
  appVersion: "NEXT_PUBLIC_APP_VERSION",
  environment: "ENVIRONMENT",
};

const PUBLIC_VAR_NAMES: Record<keyof typeof publicConfig, string> = {
  apiUrl: "NEXT_PUBLIC_API_URL",
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  supabaseAnonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  sentryDsn: "NEXT_PUBLIC_SENTRY_DSN",
  postHogKey: "NEXT_PUBLIC_POSTHOG_KEY",
  postHogHost: "NEXT_PUBLIC_POSTHOG_HOST",
  environment: "NEXT_PUBLIC_ENVIRONMENT",
};

// ── Required var lists ────────────────────────────────────────────────────────

/** Server-side vars required in staging/production. */
const REQUIRED_SERVER_PRODUCTION: ReadonlyArray<keyof typeof serverConfig> = [
  "supabaseServiceKey",
  "agentOsUrl",
  "agentOsApiKey",
  "environment",
];

/** Server-side vars always required (even in local development). */
const REQUIRED_SERVER_ALWAYS: ReadonlyArray<keyof typeof serverConfig> = [
  "environment",
];

/** Client-side vars required in staging/production. */
const REQUIRED_PUBLIC_PRODUCTION: ReadonlyArray<keyof typeof publicConfig> = [
  "supabaseUrl",
  "supabaseAnonKey",
];

function isLocalDevelopment(): boolean {
  const env = serverConfig.environment.toLowerCase();
  return (
    env === "development" ||
    env === "dev" ||
    env === "local" ||
    env === "test" ||
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  );
}

function isPlaceholderValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return (
    v.includes("your-project.supabase.co") ||
    v.includes("placeholder.supabase.co") ||
    v.startsWith("your-") ||
    v.startsWith("placeholder") ||
    v.startsWith("test-")
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate all required environment variables.
 *
 * Called from `instrumentation.ts` (Node.js runtime only) at startup.
 * Logs a FATAL message and terminates the process if any required variable
 * is missing, preventing the app from silently running in a broken state.
 *
 * Local development may boot with placeholder Supabase / missing Agent OS
 * values so UI work is possible without production secrets. Staging and
 * production still fail closed.
 */
export function validateServerConfig(): void {
  const missing: string[] = [];
  const local = isLocalDevelopment();
  const requiredServer = local ? REQUIRED_SERVER_ALWAYS : REQUIRED_SERVER_PRODUCTION;
  const requiredPublic = local ? [] : REQUIRED_PUBLIC_PRODUCTION;

  for (const key of requiredServer) {
    if (!serverConfig[key]) {
      missing.push(SERVER_VAR_NAMES[key]);
    }
  }

  for (const key of requiredPublic) {
    if (!publicConfig[key] || isPlaceholderValue(String(publicConfig[key]))) {
      missing.push(PUBLIC_VAR_NAMES[key]);
    }
  }

  if (!local) {
    if (!serverConfig.supabaseServiceKey || isPlaceholderValue(serverConfig.supabaseServiceKey)) {
      missing.push(SERVER_VAR_NAMES.supabaseServiceKey);
    }
  }

  if (missing.length > 0) {
    // Use stderr directly — logger may not be initialised yet at this point
    process.stderr.write(
      `[FATAL] neumas-web: Missing required environment variables: ${[...new Set(missing)].join(", ")}. ` +
        "The application cannot start safely. Set the missing variables and restart.\n"
    );
    process.exit(1);
  }

  if (local && (!publicConfig.supabaseUrl || isPlaceholderValue(publicConfig.supabaseUrl))) {
    process.stderr.write(
      "[WARN] neumas-web: Supabase credentials look like placeholders — auth/data calls will be degraded until real local credentials are set.\n"
    );
  }
}
