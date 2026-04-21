import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AUTH_BOOTSTRAP_COOKIE, encodePendingAuthSession } from "@/lib/auth-bootstrap";
import { getCanonicalAppUrl } from "@/lib/app-url";
import { createRouteHandlerClient } from "@/utils/supabase/route-handler";

const DEFAULT_BACKEND_URL = "https://neumas-production.up.railway.app";

type GoogleCompleteResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  profile: {
    user_id: string;
    email: string;
    full_name?: string | null;
    org_id: string;
    org_name: string;
    property_id: string;
    property_name: string;
    role: string;
  };
};

function getBackendUrl(): string {
  const configured =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/+$/, "");
  }

  return DEFAULT_BACKEND_URL;
}

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) {
    const protocol = request.nextUrl.protocol.replace(/:$/, "") || "https";
    return `${protocol}://${host}`;
  }

  return getCanonicalAppUrl();
}

function buildRedirectUrl(request: NextRequest, pathname: string, params?: Record<string, string>) {
  const url = new URL(pathname, getRequestOrigin(request));
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url;
}

function redirectWithLocation(response: NextResponse, location: URL) {
  response.headers.set("location", location.toString());
  return response;
}

function extractDetailMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "error" in detail) {
    return String((detail as { error: unknown }).error);
  }
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "msg" in first) {
      return String((first as { msg: unknown }).msg);
    }
  }
  return null;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const oauthError =
    request.nextUrl.searchParams.get("error_description") ??
    request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      buildRedirectUrl(request, "/login", {
        error: "oauth_complete_failed",
        message: oauthError,
      })
    );
  }

  if (!code) {
    return NextResponse.redirect(
      buildRedirectUrl(request, "/login", {
        error: "oauth_complete_failed",
        message: "Missing OAuth code.",
      })
    );
  }

  const response = NextResponse.redirect(buildRedirectUrl(request, "/dashboard"));
  const { supabase } = createRouteHandlerClient(request, response);

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return redirectWithLocation(
      response,
      buildRedirectUrl(request, "/login", {
        error: "oauth_complete_failed",
        message: exchangeError.message,
      })
    );
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return redirectWithLocation(
      response,
      buildRedirectUrl(request, "/login", {
        error: "oauth_complete_failed",
        message: sessionError?.message ?? "No Supabase session found after OAuth.",
      })
    );
  }

  const backendResponse = await fetch(`${getBackendUrl()}/api/auth/google/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });

  const backendPayload = await readJsonSafely(backendResponse);
  const detail =
    backendPayload && typeof backendPayload === "object" && "detail" in backendPayload
      ? (backendPayload as { detail?: unknown }).detail
      : null;
  const detailMessage = extractDetailMessage(detail);

  if (
    backendResponse.status === 422 &&
    ["onboarding_required", "onboarding_incomplete", "setup_incomplete"].includes(
      detailMessage ?? ""
    )
  ) {
    return redirectWithLocation(
      response,
      buildRedirectUrl(request, "/onboard", {
        supabase_jwt: session.access_token,
      })
    );
  }

  if (!backendResponse.ok || !backendPayload) {
    return redirectWithLocation(
      response,
      buildRedirectUrl(request, "/login", {
        error: "oauth_complete_failed",
        message:
          detailMessage ??
          `OAuth completion failed with status ${backendResponse.status}.`,
      })
    );
  }

  const loginResponse = backendPayload as GoogleCompleteResponse;

  response.cookies.set(
    AUTH_BOOTSTRAP_COOKIE,
    encodePendingAuthSession({
      access_token: loginResponse.access_token,
      refresh_token: loginResponse.refresh_token ?? session.refresh_token ?? null,
      expires_in: loginResponse.expires_in,
      profile: {
        ...loginResponse.profile,
        full_name: loginResponse.profile.full_name ?? null,
      },
    }),
    {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 5,
    }
  );

  return response;
}
