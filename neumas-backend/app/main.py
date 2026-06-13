"""
Neumas FastAPI application entry point.

Production-hardened with:
- Request ID tracking and structured logging
- CORS configuration from settings
- Docs disabled in production (/docs, /redoc)
- /openapi.json protected behind admin auth in production
- Global exception handling
"""

import os
import sys


def sanitize_env() -> None:
    """
    Replace Unicode smart quotes and curly apostrophes in every environment
    variable value before any other code runs.

    Railway (and similar PaaS platforms) sometimes inject smart-quote
    characters into env-var values when users paste strings from word
    processors or documentation sites.  CPython's ascii codec cannot
    encode these characters, which causes UnicodeEncodeError deep inside
    libraries that call str.encode('ascii') on env values (e.g. psycopg2
    DSN parsing, httpx header injection, Celery broker URLs).

    Must be called before any import that reads os.environ.
    """
    REPLACEMENTS = {
        "\u201c": '"',   # left double quote  "
        "\u201d": '"',   # right double quote "
        "\u2018": "'",   # left single quote  '
        "\u2019": "'",   # right single quote '
        "\u2013": "-",   # en dash  -
        "\u2014": "--",  # em dash  --
        "\u00a0": " ",   # non-breaking space
    }
    for key, value in list(os.environ.items()):
        sanitized = value
        for bad, good in REPLACEMENTS.items():
            if bad in sanitized:
                sanitized = sanitized.replace(bad, good)
        if sanitized != value:
            os.environ[key] = sanitized


sanitize_env()

# Force UTF-8 for all I/O before any other imports.
# Railway (and many Docker environments) default to ASCII.
os.environ.setdefault("PYTHONUTF8", "1")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis as redis_lib
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import JSONResponse

from app.core.config import settings

# ---------------------------------------------------------------------------
# Sentry — initialise as early as possible so all subsequent exceptions are
# captured, including those that occur during startup/import.
# ---------------------------------------------------------------------------
try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    if settings.SENTRY_DSN:
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENV,
            release=settings.APP_VERSION,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
            send_default_pii=False,
        )
except ImportError:
    pass  # sentry-sdk not installed — safe to continue

# Import routers explicitly at the top - errors will be visible in logs
from app.api.routes import (
    admin,
    alerts,
    analytics,
    auth,
    documents,
    insights,
    inventory,
    predictions,
    reports,
    scans,
    shopping,
    vendor_analytics,
    vendors,
)

# Safe import for logging module
try:
    from app.core.logging import (
        RequestLoggingMiddleware,
        configure_logging,
        get_logger,
        set_user_context,
    )
    configure_logging()
    logger = get_logger(__name__)
except ImportError as e:
    # Fallback to standard logging if custom logging fails
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    logger.warning(f"Failed to import custom logging: {e}")
    RequestLoggingMiddleware = None
    set_user_context = None

# Safe import for security module
try:
    from app.core.security import is_admin
except ImportError as e:
    logger.warning(f"Failed to import security module: {e}")
    def is_admin(x):
        return False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Application lifespan context manager.

    Handles startup and shutdown events for:
    - Database connections
    - Cache connections
    - Background worker initialization

    Handles missing dependencies gracefully for degraded mode.
    """
    # Startup
    logger.info(
        "Starting Neumas backend",
        extra={"environment": settings.ENV, "debug": settings.DEBUG}
        if isinstance(logger, logging.Logger) else None,
    )
    if hasattr(logger, 'info') and not isinstance(logger, logging.Logger):
        logger.info(
            "Starting Neumas backend",
            environment=settings.ENV,
            debug=settings.DEBUG,
        )

    # Initialize Supabase client (if configured)
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            from app.db.supabase_client import get_supabase_client, health_check

            client = get_supabase_client()
            is_healthy = await health_check()
            logger.info("Supabase client initialized", healthy=is_healthy)
        except Exception as e:
            logger.error("Failed to initialize Supabase client", error=str(e))
    else:
        logger.warning("Supabase not configured - running in degraded mode")

    # Initialize Celery app (best-effort broker check) - only if Redis is configured.
    # Avoid `celery_app.control.ping()` here because a broker auth/DNS issue can
    # block startup long enough for Railway to fail the deployment health check.
    if settings.REDIS_URL:
        try:
            broker = settings.celery_broker
            redis_client = redis_lib.from_url(
                broker,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            redis_client.ping()
            logger.info("Celery/Redis broker connection verified", redis_url=settings.redis_url_redacted)
        except Exception as e:
            logger.warning("Celery connection check failed", error=str(e))
    else:
        logger.warning("Redis not configured - Celery tasks disabled")

    # Register with the agent OS router-system (non-blocking)
    if settings.AGENT_OS_URL:
        try:
            import httpx

            headers: dict[str, str] = {"Content-Type": "application/json"}
            if settings.AGENT_OS_API_KEY:
                headers["X-API-Key"] = settings.AGENT_OS_API_KEY
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{settings.AGENT_OS_URL}/api/register",
                    json={
                        "repo_id": "neumas-backend",
                        "service_name": "neumas-backend",
                        "health_url": f"{settings.BASE_URL}/health",
                        "base_url": settings.BASE_URL,
                        "version": settings.APP_VERSION,
                        "environment": settings.ENV,
                    },
                    headers=headers,
                )
                resp.raise_for_status()
            logger.info("Registered with agent OS router-system", repo_id="neumas-backend")
        except Exception as e:
            logger.warning("Agent OS registration failed (non-fatal)", error=str(e))
    else:
        logger.warning("AGENT_OS_URL not configured - skipping router-system registration")

    yield

    # Shutdown
    logger.info("Shutting down Neumas backend")


# Create FastAPI application
# In production: disable /docs and /redoc, protect /openapi.json
app = FastAPI(
    title="Neumas API",
    description="Intelligent inventory management for hospitality",
    version="1.0.0",
    docs_url=None,  # We'll add custom docs route
    redoc_url=None,  # We'll add custom redoc route
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
    redirect_slashes=False,  # Prevent 307 redirect loops on trailing-slash requests
)

# Configure CORS — applied first so it covers every route including /api/auth/*
#
# Strategy: combine an explicit origin allowlist (production domain + localhost)
# with allow_origin_regex to cover all Vercel preview deployment URLs, which
# use unpredictable subdomains (neumasfinal-<hash>-<team>.vercel.app).
# allow_credentials=True is compatible here because we are NOT using "*".

_EXPLICIT_ORIGINS = [
    "https://neumas-web.vercel.app",           # production Vercel (canonical)
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
]
# Merge any additional origins from the Railway env var (e.g. custom domain)
_env_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]
_cors_origins = list({*_EXPLICIT_ORIGINS, *_env_origins})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Regex covers every Vercel preview URL for the canonical neumas-web project.
    allow_origin_regex=r"https://neumas-web(-[a-z0-9]+)*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Add request logging middleware (generates request_id, logs req/res)
if RequestLoggingMiddleware:
    app.add_middleware(RequestLoggingMiddleware)

# Add idempotency middleware (Redis-backed replay for POST/PATCH)
try:
    from app.core.idempotency import IdempotencyMiddleware
    _redis_url = settings.celery_broker or getattr(settings, "REDIS_PRIVATE_URL", None) or getattr(settings, "REDIS_URL", None)
    if _redis_url and _redis_url != "redis://":
        app.add_middleware(IdempotencyMiddleware, redis_url=_redis_url)
except Exception as _idem_err:
    logger.warning("Idempotency middleware not loaded", error=str(_idem_err))


# ============================================================================
# OpenAPI/Docs - Protected in Production
# ============================================================================


async def verify_admin_for_docs(request: Request) -> None:
    """
    Verify admin access for OpenAPI docs in production.

    In development, docs are publicly accessible.
    In production, requires admin authentication.
    """
    if not settings.is_production:
        return

    # Get token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required for API docs in production",
        )

    token = auth_header.split(" ")[1]

    try:
        from app.core.security import decode_jwt as decode_token

        payload = decode_token(token)
        if not is_admin(payload):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required for API docs",
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


@app.get("/openapi.json", include_in_schema=False)
async def get_openapi_schema(request: Request):
    """
    OpenAPI schema endpoint.

    In production, requires admin authentication.
    """
    await verify_admin_for_docs(request)
    return app.openapi()


@app.get("/docs", include_in_schema=False)
async def get_docs(request: Request):
    """Swagger UI -- disabled in production."""
    if settings.is_production:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    await verify_admin_for_docs(request)
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=f"{app.title} - Swagger UI",
    )


@app.get("/redoc", include_in_schema=False)
async def get_redoc(request: Request):
    """ReDoc -- disabled in production."""
    if settings.is_production:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    await verify_admin_for_docs(request)
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=f"{app.title} - ReDoc",
    )


# ============================================================================
# Health Check Endpoints (no auth required)
# ============================================================================


@app.get(
    "/health",
    tags=["Health"],
    summary="Health check",
    response_model=dict,
)
async def health_check() -> dict:
    """
    Liveness probe.

    This endpoint only confirms the API process is running and able to serve
    requests. It intentionally does not depend on external services.
    """
    return {
        "status": "healthy",
        "service": "neumas-api",
        "version": settings.APP_VERSION,
        "environment": settings.ENV,
        "checks": {"app_boot": True},
    }


@app.get(
    "/ready",
    tags=["Health"],
    summary="Readiness check",
    response_model=dict,
)
async def readiness_check() -> dict:
    """
    Readiness check endpoint.

    Verifies dependency readiness used for production traffic acceptance.

    Checks:
    - app boot status
    - Supabase reachability when configured
    - Redis reachability when worker queue is required
    - OCR provider configuration presence when DEV_MODE is disabled
    """
    checks: dict[str, bool] = {
        "app_boot": True,
        "supabase": True,
        "redis": True,
        "ocr_provider_configured": True,
    }
    metadata = {
        "queue_required": not settings.celery_always_eager,
        "dev_mode": settings.DEV_MODE,
    }
    failures: list[str] = []

    # Provider keys are required in non-DEV_MODE deployments.
    ocr_provider_configured = bool(
        settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY or settings.GOOGLE_API_KEY
    )
    if not settings.DEV_MODE and metadata["queue_required"] and not ocr_provider_configured:
        checks["ocr_provider_configured"] = False
        failures.append("ocr_provider_config")

    # Check Supabase only when configured.
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        try:
            from app.db.supabase_client import health_check as db_health

            checks["supabase"] = await db_health()
        except Exception as e:
            logger.warning("Readiness: Supabase check failed", error=str(e))
            checks["supabase"] = False
        if not checks["supabase"]:
            failures.append("supabase")

    # Check Redis when queue-backed processing is required.
    redis_url = settings.celery_broker or settings.REDIS_PRIVATE_URL or settings.REDIS_URL
    if metadata["queue_required"]:
        if not redis_url or redis_url == "redis://":
            checks["redis"] = False
            failures.append("redis")
        else:
            try:
                r = redis_lib.from_url(
                    redis_url,
                    socket_connect_timeout=2,
                    socket_timeout=2,
                )
                r.ping()
                checks["redis"] = True
            except Exception as e:
                logger.warning(
                    "Readiness: Redis check failed",
                    error=str(e),
                    redis_url=settings.redis_url_redacted,
                )
                checks["redis"] = False
                failures.append("redis")
    else:
        checks["redis"] = True

    if failures:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "not_ready",
                "service": "neumas-api",
                "failed": failures,
                "checks": checks,
                "metadata": metadata,
            },
        )

    return {
        "status": "ready",
        "service": "neumas-api",
        "checks": checks,
        "metadata": metadata,
        "version": settings.APP_VERSION,
        "environment": settings.ENV,
    }


# ============================================================================
# API Routers - Explicitly registered
# ============================================================================

# Authentication routes
app.include_router(
    auth.router,
    prefix="/api/auth",
    tags=["Authentication"],
)

# Scan routes
app.include_router(
    scans.router,
    prefix="/api/scan",
    tags=["Scans"],
)

# Inventory routes
app.include_router(
    inventory.router,
    prefix="/api/inventory",
    tags=["Inventory"],
)

# Prediction routes
app.include_router(
    predictions.router,
    prefix="/api/predictions",
    tags=["Predictions"],
)

# Shopping routes
app.include_router(
    shopping.router,
    prefix="/api/shopping-list",
    tags=["Shopping"],
)

app.include_router(
    analytics.router,
    prefix="/api/analytics",
    tags=["Analytics"],
)

app.include_router(
    insights.router,
    prefix="/api/insights",
    tags=["Insights"],
)

# Admin routes
app.include_router(
    admin.router,
    prefix="/api/admin",
    tags=["Admin"],
)

# Documents routes
app.include_router(
    documents.router,
    prefix="/api/documents",
    tags=["Documents"],
)

# Vendors routes
app.include_router(
    vendors.router,
    prefix="/api/vendors",
    tags=["Vendors"],
)

# Vendor Analytics routes
app.include_router(
    vendor_analytics.router,
    prefix="/api/vendor-analytics",
    tags=["Vendor Analytics"],
)

# Alerts routes
app.include_router(
    alerts.router,
    prefix="/api/alerts",
    tags=["Alerts"],
)

# Reports routes
app.include_router(
    reports.router,
    prefix="/api/reports",
    tags=["Reports"],
)


# ============================================================================
# Exception Handlers
# ============================================================================


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global exception handler for unhandled errors.

    Logs error with full context and returns safe response.
    """
    # Try to get request_id safely
    request_id = "unknown"
    try:
        from app.core.logging import get_request_id
        request_id = get_request_id() or getattr(request.state, "request_id", "unknown")
    except ImportError:
        request_id = getattr(request.state, "request_id", "unknown")

    # Get error message
    error_msg = str(exc)

    logger.error("Unhandled exception", error=error_msg, exc_type=type(exc).__name__, path=request.url.path)

    # Don't expose internal errors in production
    detail = "Internal server error" if settings.is_production else error_msg

    return JSONResponse(
        status_code=500,
        content={
            "detail": detail,
            "request_id": request_id,
        },
        headers={"X-Request-ID": request_id},
    )


# ============================================================================
# Development Server
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )
