import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCanonicalAppUrl, isLegacyAppHost } from "@/lib/app-url";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host || !isLegacyAppHost(host)) {
    return NextResponse.next();
  }

  const canonical = new URL(getCanonicalAppUrl());
  const redirectUrl = new URL(request.url);
  redirectUrl.protocol = canonical.protocol;
  redirectUrl.host = canonical.host;

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|icon-192.png|icon-512.png).*)"],
};
