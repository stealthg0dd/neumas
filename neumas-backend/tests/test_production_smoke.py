"""
Production smoke tests.

Two kinds of tests live here:

- Non-live tests (default): exercise the FastAPI app in-process via
  ASGITransport. These run in standard CI (no auth tokens, no network
  access) and gate that the app boots, /health and /ready report healthy,
  and protected endpoints reject unauthenticated requests with 401 (not
  500).
- Live tests: marked with @pytest.mark.skipif and only run when
  NEUMAS_SMOKE_LIVE=true, hitting real production URLs
  (NEUMAS_BACKEND_URL / NEUMAS_WEB_URL).
"""

from __future__ import annotations

import os

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

NEUMAS_BACKEND_URL = os.environ.get("NEUMAS_BACKEND_URL", "http://localhost:8000")
NEUMAS_WEB_URL = os.environ.get("NEUMAS_WEB_URL", "http://localhost:3000")

live_only = pytest.mark.skipif(
    not os.getenv("NEUMAS_SMOKE_LIVE"), reason="live smoke only"
)


@pytest.fixture
async def smoke_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.anyio
async def test_backend_health(smoke_client: AsyncClient):
    response = await smoke_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.anyio
async def test_backend_ready(smoke_client: AsyncClient):
    response = await smoke_client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["checks"]["redis"] is True
    assert body["checks"]["supabase"] is True


@live_only
@pytest.mark.anyio
async def test_web_health():
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{NEUMAS_WEB_URL}/api/health")
    assert response.status_code == 200


@live_only
@pytest.mark.anyio
async def test_dashboard_unauthenticated_redirects():
    async with httpx.AsyncClient(follow_redirects=False) as client:
        response = await client.get(f"{NEUMAS_WEB_URL}/dashboard")
    assert response.status_code == 307
    assert response.headers["location"] == "/auth?next=/dashboard"


@pytest.mark.anyio
async def test_scan_upload_requires_auth(smoke_client: AsyncClient):
    files = {"file": ("test.jpg", b"\xff\xd8\xff\xe0fake-jpeg-bytes", "image/jpeg")}
    response = await smoke_client.post("/api/scan/upload", files=files)
    assert response.status_code == 401


@pytest.mark.anyio
async def test_scan_status_requires_auth(smoke_client: AsyncClient):
    response = await smoke_client.get("/api/scan/fake-id/status")
    assert response.status_code == 401
