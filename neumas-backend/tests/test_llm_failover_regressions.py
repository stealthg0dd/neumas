from __future__ import annotations

import builtins

import pytest

from app.core.config import Settings
from app.services.llm_failover import (
    ProviderFailure,
    _call_google,
    get_completion_with_failover,
)


@pytest.mark.anyio
async def test_google_provider_missing_dependency_is_failover_error(monkeypatch):
    monkeypatch.setattr("app.services.llm_failover.settings.GOOGLE_API_KEY", "fake-key")

    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "google.generativeai":
            raise ImportError("No module named google.generativeai")
        if name == "google" and "genai" in fromlist:
            raise ImportError("No module named google.genai")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(ProviderFailure, match="dependency missing"):
        await _call_google(
            model="gemini-1.5-flash",
            system_prompt="Extract receipt",
            user_content="hello",
            is_vision=False,
            image_data=None,
        )


@pytest.mark.anyio
async def test_failover_chain_reports_google_dependency_issue_cleanly(monkeypatch):
    monkeypatch.setattr("app.services.llm_failover.settings.ANTHROPIC_API_KEY", "x")
    monkeypatch.setattr("app.services.llm_failover.settings.OPENAI_API_KEY", "x")
    monkeypatch.setattr("app.services.llm_failover.settings.GOOGLE_API_KEY", "x")

    async def fail_anthropic(*args, **kwargs):
        raise ProviderFailure("anthropic quota")

    async def fail_openai(*args, **kwargs):
        raise ProviderFailure("openai quota")

    monkeypatch.setattr("app.services.llm_failover._call_anthropic", fail_anthropic)
    monkeypatch.setattr("app.services.llm_failover._call_openai", fail_openai)

    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "google.generativeai":
            raise ImportError("No module named google.generativeai")
        if name == "google" and "genai" in fromlist:
            raise ImportError("No module named google.genai")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(RuntimeError) as exc_info:
        await get_completion_with_failover(
            system_prompt="Extract receipt",
            user_content="hello",
            is_vision=False,
        )

    message = str(exc_info.value)
    assert "anthropic: anthropic quota" in message
    assert "openai: openai quota" in message
    assert "google: Google GenAI dependency missing" in message


def test_gemini_api_key_alias_populates_google_api_key(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-key")

    settings = Settings()

    assert settings.GOOGLE_API_KEY == "gemini-key"


def test_gemini_model_defaults_to_current_flash_model(monkeypatch):
    monkeypatch.delenv("GEMINI_MODEL", raising=False)

    settings = Settings()

    assert settings.GEMINI_MODEL == "gemini-2.5-flash-lite"


def test_password_only_redis_url_is_not_forced_to_default_user(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("REDISHOST", raising=False)
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://:secret@redis.railway.internal:6379/0")

    settings = Settings()

    assert settings.celery_broker == "redis://:secret@redis.railway.internal:6379/0"
