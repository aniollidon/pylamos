import pytest

from app.config import settings
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_chat_retries_retryable_errors(monkeypatch):
    service = object.__new__(LLMService)
    attempts = {"count": 0}
    sleep_calls = []

    def fake_generate_response_text(*, system_prompt, gemini_history, full_message):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise RuntimeError("429 Resource exhausted")
        return "Resposta final"

    async def fake_sleep(delay):
        sleep_calls.append(delay)

    monkeypatch.setattr(settings, "GEMINI_MAX_RETRIES", 3)
    monkeypatch.setattr(settings, "GEMINI_RETRY_INITIAL_DELAY_SECONDS", 0.5)
    monkeypatch.setattr(settings, "GEMINI_RETRY_BACKOFF_MULTIPLIER", 2.0)
    monkeypatch.setattr(settings, "GEMINI_RETRY_MAX_DELAY_SECONDS", 5.0)
    monkeypatch.setattr(service, "_generate_response_text", fake_generate_response_text)
    monkeypatch.setattr("app.services.llm_service.asyncio.sleep", fake_sleep)

    response = await service.chat(
        system_prompt="sistema",
        history=[],
        user_message="hola",
    )

    assert response == "Resposta final"
    assert attempts["count"] == 3
    assert sleep_calls == [0.5, 1.0]


@pytest.mark.asyncio
async def test_chat_does_not_retry_non_retryable_errors(monkeypatch):
    service = object.__new__(LLMService)
    sleep_calls = []

    def fake_generate_response_text(*, system_prompt, gemini_history, full_message):
        raise RuntimeError("model misconfigured")

    async def fake_sleep(delay):
        sleep_calls.append(delay)

    monkeypatch.setattr(settings, "GEMINI_MAX_RETRIES", 3)
    monkeypatch.setattr(service, "_generate_response_text", fake_generate_response_text)
    monkeypatch.setattr("app.services.llm_service.asyncio.sleep", fake_sleep)

    with pytest.raises(RuntimeError, match="model misconfigured"):
        await service.chat(
            system_prompt="sistema",
            history=[],
            user_message="hola",
        )

    assert sleep_calls == []