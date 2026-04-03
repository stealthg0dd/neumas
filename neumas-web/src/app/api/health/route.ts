/**
 * GET /api/health
 *
 * Returns the current operational status of neumas-web.
 *
 * Response shape:
 *  {
 *    status:             "ok"
 *    version:            string   (package.json version)
 *    environment:        string   (development | staging | production)
 *    supabase_connected: boolean  (live ping to Supabase REST API)
 *  }
 */

import { type NextRequest, NextResponse } from "next/server";
import { publicConfig, serverConfig } from "@/lib/config";
import { withLogger, withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";

/** Attempt a lightweight ping against the Supabase REST endpoint. */
async function checkSupabase(): Promise<boolean> {
  const { supabaseUrl, supabaseAnonKey } = publicConfig;
  if (!supabaseUrl || !supabaseAnonKey) return false;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      signal: AbortSignal.timeout(3_000),
    });
    // Supabase returns 200 or 400 (missing table param), or 401 (auth required
    // at root) — any of these mean the service is reachable and up.
    return res.status === 200 || res.status === 400 || res.status === 401;
  } catch {
    return false;
  }
}

async function handler(_req: NextRequest): Promise<NextResponse> {
  const [supabase_connected] = await Promise.all([checkSupabase()]);

  return NextResponse.json({
    status: "ok",
    version: process.env.npm_package_version ?? "0.1.0",
    environment: serverConfig.environment || publicConfig.environment,
    supabase_connected,
  });
}

export const GET = withErrorHandler(withLogger(handler));
