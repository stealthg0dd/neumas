"""
Neumas Health Agent

A lightweight FastAPI service that:
  1. Exposes its own /health endpoint for Railway health checks.
  2. Periodically checks the neumas-backend /health endpoint.
  3. Sends heartbeats to the ctech router-system registry.
  4. Logs any degraded state so Railway surfaces it in logs.
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI

# ---------------------------------------------------------------------------
# Configuration (all from environment variables)
# ---------------------------------------------------------------------------
NEUMAS_BACKEND_URL: str = os.environ.get(
    "NEUMAS_BACKEND_URL", "https://neumas-production.up.railway.app"
)
AGENT_OS_URL: str = os.environ.get("AGENT_OS_URL", "")
AGENT_OS_API_KEY: str = os.environ.get("AGENT_OS_API_KEY", "")
# Lets the heartbeat be turned off without a redeploy if AGENT_OS_URL ever
# points at an endpoint that 404s again (see the 404 backoff below).
AGENT_OS_HEARTBEAT_ENABLED: bool = os.environ.get("AGENT_OS_HEARTBEAT_ENABLED", "true").lower() == "true"
HEARTBEAT_INTERVAL: int = int(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "300"))  # 5 min
HEARTBEAT_404_BACKOFF_SECONDS: int = 300  # don't retry a 404'd heartbeat for 5 minutes
VERSION: str = os.environ.get("APP_VERSION", "0.1.0")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("neumas-health-agent")

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
_start_time: float = time.monotonic()
_backend_status: dict = {"healthy": None, "last_checked": None, "latency_ms": None}
_heartbeat_skip_until: float = 0.0  # monotonic time; suppress heartbeat attempts until then
_heartbeat_404_logged: bool = False


# ---------------------------------------------------------------------------
# Background task: check neumas-backend and send heartbeats
# ---------------------------------------------------------------------------
async def _monitor_loop() -> None:
    """Run forever: check backend health, then post heartbeat to router-system."""
    global _heartbeat_skip_until, _heartbeat_404_logged
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            # --- 1. Check neumas-backend ---
            try:
                t0 = time.monotonic()
                resp = await client.get(f"{NEUMAS_BACKEND_URL}/health")
                latency_ms = (time.monotonic() - t0) * 1000
                healthy = resp.status_code == 200
                _backend_status["healthy"] = healthy
                _backend_status["last_checked"] = time.time()
                _backend_status["latency_ms"] = round(latency_ms, 1)
                if healthy:
                    logger.info(
                        "neumas-backend healthy",
                        extra={"latency_ms": latency_ms},
                    )
                else:
                    logger.warning(
                        "neumas-backend unhealthy",
                        extra={"status_code": resp.status_code},
                    )
            except Exception as exc:
                _backend_status["healthy"] = False
                _backend_status["last_checked"] = time.time()
                logger.error("neumas-backend health check failed: %s", exc)

            # --- 2. Send heartbeat to router-system ---
            if not AGENT_OS_HEARTBEAT_ENABLED:
                pass  # disabled at startup; see lifespan log
            elif not AGENT_OS_URL:
                logger.warning("AGENT_OS_URL not set — skipping heartbeat")
            elif time.monotonic() < _heartbeat_skip_until:
                pass  # backing off after a 404
            else:
                try:
                    uptime = round(time.monotonic() - _start_time)
                    headers = {"Content-Type": "application/json"}
                    if AGENT_OS_API_KEY:
                        headers["X-API-Key"] = AGENT_OS_API_KEY
                    hb_resp = await client.post(
                        f"{AGENT_OS_URL}/api/heartbeat/neumas-health-agent",
                        json={
                            "status": "ok" if _backend_status["healthy"] else "degraded",
                            "uptime_seconds": uptime,
                            "active_connections": 0,
                            "memory_mb": 0,
                            "version": VERSION,
                        },
                        headers=headers,
                    )
                    if hb_resp.status_code == 404:
                        _heartbeat_skip_until = time.monotonic() + HEARTBEAT_404_BACKOFF_SECONDS
                        if not _heartbeat_404_logged:
                            logger.warning(
                                "Agent OS heartbeat endpoint not yet configured — skipping"
                            )
                            _heartbeat_404_logged = True
                    else:
                        hb_resp.raise_for_status()
                        logger.info("Heartbeat sent to router-system")
                except Exception as exc:
                    logger.warning("Heartbeat failed (non-fatal): %s", exc)

            await asyncio.sleep(HEARTBEAT_INTERVAL)


# ---------------------------------------------------------------------------
# FastAPI lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _start_time
    _start_time = time.monotonic()
    logger.info(
        "Starting neumas-health-agent v%s — monitoring %s every %ds",
        VERSION,
        NEUMAS_BACKEND_URL,
        HEARTBEAT_INTERVAL,
    )

    if not AGENT_OS_HEARTBEAT_ENABLED:
        logger.info("Agent OS heartbeat disabled via AGENT_OS_HEARTBEAT_ENABLED=false.")

    # Register self with router-system on startup
    if AGENT_OS_URL:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"Content-Type": "application/json"}
                if AGENT_OS_API_KEY:
                    headers["X-API-Key"] = AGENT_OS_API_KEY
                r = await client.post(
                    f"{AGENT_OS_URL}/api/register",
                    json={
                        "repo_id": "neumas-health-agent",
                        "service_name": "neumas-health-agent",
                        "health_url": f"{os.environ.get('BASE_URL', 'http://localhost:8001')}/health",
                        "base_url": os.environ.get("BASE_URL", "http://localhost:8001"),
                        "version": VERSION,
                        "environment": os.environ.get("ENVIRONMENT", "production"),
                    },
                    headers=headers,
                )
                r.raise_for_status()
                logger.info("Registered with router-system")
        except Exception as exc:
            logger.warning("Registration failed (non-fatal): %s", exc)

    # Start background monitoring loop
    task = asyncio.create_task(_monitor_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("neumas-health-agent shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Neumas Health Agent",
    description="Monitors neumas-backend and reports to the router-system registry.",
    version=VERSION,
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)


@app.get("/health")
async def health() -> dict:
    """Health check — always 200 so Railway keeps the container alive."""
    return {
        "status": "ok",
        "service": "neumas-health-agent",
        "version": VERSION,
        "uptime_seconds": round(time.monotonic() - _start_time),
        "monitored_backend": {
            "url": NEUMAS_BACKEND_URL,
            **_backend_status,
        },
    }
