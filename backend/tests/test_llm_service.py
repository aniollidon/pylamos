import pytest

from app.config import settings
from app.models.chat import MessageRole
from app.services.llm_service import LLMService, format_message_for_llm
from app.utils.teacher_policy import TeacherPolicyState


def test_format_message_for_llm_marks_sender_role():
    assert format_message_for_llm("revisa aquest codi", MessageRole.teacher) == (
        "[PROFESSOR: revisa aquest codi]"
    )
    assert format_message_for_llm("necessito ajuda", MessageRole.user) == (
        "<<ALUMNE: necessito ajuda>>"
    )


@pytest.mark.asyncio
async def test_chat_retries_retryable_errors(monkeypatch):
    service = object.__new__(LLMService)
    attempts = {"count": 0}
    sleep_calls = []

    def fake_generate_gemini_response_text(system_prompt, history, full_message):
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
    monkeypatch.setattr(service, "primary_provider", "gemini", raising=False)
    monkeypatch.setattr(service, "_generate_gemini_response_text", fake_generate_gemini_response_text)
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

    def fake_generate_gemini_response_text(system_prompt, history, full_message):
        raise RuntimeError("model misconfigured")

    async def fake_sleep(delay):
        sleep_calls.append(delay)

    monkeypatch.setattr(settings, "GEMINI_MAX_RETRIES", 3)
    monkeypatch.setattr(service, "primary_provider", "gemini", raising=False)
    monkeypatch.setattr(service, "_generate_gemini_response_text", fake_generate_gemini_response_text)
    monkeypatch.setattr("app.services.llm_service.asyncio.sleep", fake_sleep)

    with pytest.raises(RuntimeError, match="model misconfigured"):
        await service.chat(
            system_prompt="sistema",
            history=[],
            user_message="hola",
        )

    assert sleep_calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sender_role", "message", "expected_message"),
    [
        (MessageRole.teacher, "No és correcte", "[PROFESSOR: No és correcte]"),
        (MessageRole.user, "Em pots ajudar?", "<<ALUMNE: Em pots ajudar?>>"),
    ],
)
async def test_chat_formats_current_message_by_sender_role(
    monkeypatch,
    sender_role,
    message,
    expected_message,
):
    service = object.__new__(LLMService)
    captured = {}

    async def fake_chat_with_provider(*, provider, system_prompt, history, full_message):
        captured["full_message"] = full_message
        return "Resposta"

    monkeypatch.setattr(service, "primary_provider", "openai", raising=False)
    monkeypatch.setattr(service, "_chat_with_provider", fake_chat_with_provider)

    response = await service.chat(
        system_prompt="sistema",
        history=[],
        user_message=message,
        user_message_role=sender_role,
    )

    assert response == "Resposta"
    assert captured["full_message"] == expected_message


@pytest.mark.asyncio
async def test_chat_falls_back_to_gemini_when_openai_fails(monkeypatch):
    service = object.__new__(LLMService)
    calls = []

    async def fake_chat_with_provider(*, provider, system_prompt, history, full_message):
        calls.append(provider)
        if provider == "openai":
            raise RuntimeError("OpenAI unavailable")
        return "Resposta Gemini"

    monkeypatch.setattr(service, "primary_provider", "openai", raising=False)
    monkeypatch.setattr(service, "_chat_with_provider", fake_chat_with_provider)

    response = await service.chat(
        system_prompt="sistema",
        history=[],
        user_message="hola",
    )

    assert response == "Resposta Gemini"
    assert calls == ["openai", "gemini"]


@pytest.mark.asyncio
async def test_interpret_teacher_command_returns_structured_result(monkeypatch):
    service = object.__new__(LLMService)

    async def fake_interpret_with_provider(*, provider, user_prompt):
        return """{
            "one_shot_instruction": "explica com es fa una potència",
            "policy_patch": {
                "response_language": "es",
                "help_style": "direct"
            },
            "reset_fields": [],
            "reset_all": false
        }"""

    monkeypatch.setattr(service, "primary_provider", "openai", raising=False)
    monkeypatch.setattr(service, "_interpret_with_provider", fake_interpret_with_provider)

    interpretation = await service.interpret_teacher_command(
        "contesta en castellà a partir d'ara i explica com es fa una potència",
        TeacherPolicyState(),
    )

    assert interpretation.one_shot_instruction == "explica com es fa una potència"
    assert interpretation.policy_patch.response_language == "es"
    assert interpretation.policy_patch.help_style == "direct"


@pytest.mark.asyncio
async def test_interpret_teacher_command_falls_back_to_one_shot(monkeypatch):
    service = object.__new__(LLMService)

    async def fake_interpret_with_provider(*, provider, user_prompt):
        return "no és json"

    monkeypatch.setattr(service, "primary_provider", "openai", raising=False)
    monkeypatch.setattr(service, "_interpret_with_provider", fake_interpret_with_provider)

    interpretation = await service.interpret_teacher_command(
        "mostra la solució",
        TeacherPolicyState(response_language="ca"),
    )

    assert interpretation.one_shot_instruction == "mostra la solució"
    assert interpretation.policy_patch.model_dump(exclude_none=True) == {}
    assert interpretation.reset_fields == []
    assert interpretation.reset_all is False