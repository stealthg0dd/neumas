const DEFAULT_APP_URL = "https://neumas-web.vercel.app";
const LEGACY_APP_HOSTS = new Set(["neumasfinal.vercel.app"]);

function normalizeAbsoluteUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^https?:\/\//.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

export function getCanonicalAppUrl(): string {
  return (
    normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    DEFAULT_APP_URL
  );
}

export function getOAuthRedirectUrl(): string {
  if (typeof window === "undefined") {
    return `${getCanonicalAppUrl()}/auth/callback`;
  }

  const canonical = getCanonicalAppUrl();
  const host = window.location.host;

  if (LEGACY_APP_HOSTS.has(host)) {
    return `${canonical}/auth/callback`;
  }

  return `${window.location.origin}/auth/callback`;
}

export function isLegacyAppHost(host: string): boolean {
  return LEGACY_APP_HOSTS.has(host);
}
