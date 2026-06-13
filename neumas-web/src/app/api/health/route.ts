/**
 * GET /api/health
 *
 * Returns backend liveness + readiness from the web surface so production checks
 * hit the same origin as the browser while still proving the Railway API path.
 *
 * Response shape:
 *  {
 *    status:      "healthy" | "unhealthy" | "degraded"
 *    liveness:    "ok" | "error"
 *    readiness:   "ok" | "error"
 *    backend:     "ok" | "error"  // compatibility alias for readiness
 *    supabase:    "ok" | "error" | "not_configured"
 *    redis:       "ok" | "error" | "not_configured"
 *    version:     string
 *    environment: string
 *  }
 */

import { NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-url";
import { publicConfig, serverConfig } from "@/lib/config";
import { withLogger, withErrorHandler } from "@/lib/api-handler";

export const runtime = "nodejs";

type BackendHealthPayload = {
  status?: string;
  service?: string;
  version?: string;
  environment?: string;
  supabase?: string | boolean | null;
  redis?: string | boolean | null;
  checks?: {
    supabase?: boolean | null;
    redis?: boolean | null;
  };
};

function extractHealthPayload(raw: unknown): BackendHealthPayload {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  if ("detail" in raw) {
    const detail = (raw as { detail?: unknown }).detail;
    if (detail && typeof detail === "object") {
      return detail as BackendHealthPayload;
    }
  }

  return raw as BackendHealthPayload;
}

function normalizeCheckStatus(value: unknown): "ok" | "error" | "not_configured" {
  if (value === true || value === "ok" || value === "healthy") {
    return "ok";
  }
  if (value === false || value === "error" || value === "unhealthy") {
    return "error";
  }
  return "not_configured";
}

async function handler(): Promise<NextResponse> {
  try {
    const livenessResponse = await fetch(`${BACKEND_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const readinessResponse = await fetch(`${BACKEND_URL}/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    const livenessRaw = await livenessResponse.json().catch(() => ({}));
    const readinessRaw = await readinessResponse.json().catch(() => ({}));
    const livenessPayload = extractHealthPayload(livenessRaw);
    const readinessPayload = extractHealthPayload(readinessRaw);

    const supabase = normalizeCheckStatus(readinessPayload.supabase ?? readinessPayload.checks?.supabase);
    const redis = normalizeCheckStatus(readinessPayload.redis ?? readinessPayload.checks?.redis);
    const isLive = livenessResponse.ok;
    const isReady = readinessResponse.ok;
    const overallStatus = isLive && isReady ? "healthy" : isLive ? "degraded" : "unhealthy";

    return NextResponse.json(
      {
        status: overallStatus,
        service: readinessPayload.service ?? livenessPayload.service ?? "neumas-api",
        liveness: isLive ? "ok" : "error",
        readiness: isReady ? "ok" : "error",
        backend: isReady ? "ok" : "error",
        version: readinessPayload.version ?? livenessPayload.version ?? process.env.npm_package_version ?? "0.1.0",
        environment: readinessPayload.environment ?? livenessPayload.environment ?? (serverConfig.environment || publicConfig.environment),
        supabase,
        redis,
      },
      { status: overallStatus === "healthy" ? 200 : 503 }
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        service: "neumas-api",
        backend: "error",
        version: process.env.npm_package_version ?? "0.1.0",
        environment: serverConfig.environment || publicConfig.environment,
        supabase: "error",
        redis: "error",
      },
      { status: 503 }
    );
  }
}

export const GET = withErrorHandler(withLogger(handler));
