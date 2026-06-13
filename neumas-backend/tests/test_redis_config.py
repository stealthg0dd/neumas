from __future__ import annotations

from unittest.mock import PropertyMock, patch

import pytest
from fastapi import status
from httpx import AsyncClient

from app.core.config import Settings


def test_redis_resolver_falls_back_to_redis_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("REDIS_PRIVATE_URL", "${{Redis.REDIS_PRIVATE_URL}}")
    monkeypatch.setenv("REDIS_URL", "redis://redis.internal:6379/0")
    monkeypatch.setenv("CELERY_BROKER_URL", "")
    monkeypatch.delenv("REDISHOST", raising=False)
    settings = Settings()

    assert settings.celery_broker == "redis://redis.internal:6379/0"
    assert settings.redis_source_name == "REDIS_URL"


def test_redis_resolver_ignores_unresolved_private_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("REDIS_PRIVATE_URL", "${{Redis.REDIS_PRIVATE_URL}}")
    monkeypatch.setenv("REDIS_URL", "rediss://redis.internal:6380/0")
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://broker.internal:6379/0")
    monkeypatch.delenv("REDISHOST", raising=False)
    settings = Settings()

    assert settings.celery_broker == "redis://redis.internal:6380/0"
    assert settings.redis_source_name == "REDIS_URL"


def test_redis_resolver_builds_from_parts(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("REDIS_PRIVATE_URL", "")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setenv("CELERY_BROKER_URL", "")
    monkeypatch.setenv("REDISHOST", "redis-host")
    monkeypatch.setenv("REDISPORT", "6381")
    monkeypatch.setenv("REDISUSER", "default")
    monkeypatch.setenv("REDISPASSWORD", "secret-value")
    settings = Settings()

    assert settings.celery_broker == "redis://default:secret-value@redis-host:6381/0"
    assert settings.redis_source_name == "individual-vars"


def test_redis_connection_metadata_redacts_password(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("REDIS_PRIVATE_URL", "")
    monkeypatch.setenv("REDIS_URL", "redis://default:top-secret@redis.internal:6379/0")
    monkeypatch.setenv("CELERY_BROKER_URL", "")
    monkeypatch.delenv("REDISHOST", raising=False)
    settings = Settings()

    assert settings.celery_broker == settings.celery_backend
    assert settings.redis_connection_metadata == {
        "selected_env": "REDIS_URL",
        "scheme": "redis",
        "host": "redis.internal",
        "port": 6379,
        "password_present": True,
    }
    assert "top-secret" not in settings.redis_url_redacted


@pytest.mark.asyncio
async def test_readiness_redis_failure_metadata_is_sanitized(client: AsyncClient):
    import app.main as app_main

    redis_meta = {
        "selected_env": "REDIS_URL",
        "scheme": "redis",
        "host": "redis.internal",
        "port": 6379,
        "password_present": True,
    }

    with (
        patch.object(app_main.settings, "ENV", "prod"),
        patch.object(app_main.settings, "CELERY_TASK_ALWAYS_EAGER", False),
        patch.object(app_main.settings, "DEV_MODE", False),
        patch.object(app_main.settings, "OPENAI_API_KEY", "set"),
        patch.object(app_main.settings, "ANTHROPIC_API_KEY", ""),
        patch.object(app_main.settings, "GOOGLE_API_KEY", ""),
        patch.object(app_main.settings, "SUPABASE_URL", ""),
        patch.object(app_main.settings, "SUPABASE_SERVICE_ROLE_KEY", ""),
        patch.object(app_main.settings, "REDIS_PRIVATE_URL", ""),
        patch.object(app_main.settings, "REDIS_URL", "redis://default:top-secret@redis.internal:6379/0"),
        patch.object(app_main.settings, "CELERY_BROKER_URL", ""),
        patch.object(type(app_main.settings), "redis_connection_metadata", new_callable=PropertyMock, return_value=redis_meta),
        patch("app.main.redis_lib.from_url", side_effect=ConnectionError("boom")),
    ):
        response = await client.get("/ready")

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    detail = response.json()["detail"]
    assert detail["metadata"]["redis"] == {
        "selected_env": "REDIS_URL",
        "scheme": "redis",
        "host": "redis.internal",
        "port": 6379,
        "password_present": True,
        "error_type": "ConnectionError",
    }
    assert "top-secret" not in str(detail["metadata"]["redis"])
