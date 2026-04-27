"""LLM service for interacting with OpenAI and Gemini."""

import asyncio
import logging
import re
from typing import Literal

import google.generativeai as genai

try:
    from openai import APIError, APITimeoutError, OpenAI, RateLimitError

    OPENAI_RETRYABLE_API_ERRORS = (RateLimitError, APITimeoutError, APIError)
except ImportError:
    OpenAI = None
    OPENAI_RETRYABLE_API_ERRORS = ()

logger = logging.getLogger(__name__)
from app.config import settings
from app.models.chat import MessageRole
from app.utils.teacher_policy import TeacherCommandInterpretation, TeacherPolicyState

try:
    from google.api_core.exceptions import ResourceExhausted, TooManyRequests

    RETRYABLE_API_ERRORS = (ResourceExhausted, TooManyRequests)
except ImportError:
    RETRYABLE_API_ERRORS = ()


TEACHER_COMMAND_INTERPRETER_PROMPT = """Ets un classificador intern del backend. La teva feina NO és respondre a l'alumne ni al professor.

Has de llegir una ordre del professor i retornar NOMES un JSON valid amb aquesta forma exacta:
{
    "one_shot_instruction": string|null,
    "policy_patch": {
        "response_language": "inherit"|"ca"|"es"|"en"|null,
        "help_style": "inherit"|"socratic"|"guided"|"direct"|null,
        "solution_policy": "inherit"|"hidden"|"partial"|"full"|null,
        "teacher_alignment": "inherit"|"default"|"prefer_teacher"|"defend_teacher"|null,
        "orthography_strictness": "inherit"|"off"|"light"|"normal"|"strict"|"very_strict"|null,
        "orthography_affects_verdict": true|false|null,
        "interaction_firmness": "inherit"|"normal"|"firm"|"very_firm"|null,
        "respect_enforcement": "inherit"|"normal"|"strict"|"zero_tolerance"|null,
        "participation_enforcement": "inherit"|"normal"|"strict"|null,
        "warning_budget": 0|1|2|3|4|5|null
    },
    "reset_fields": [
        "response_language",
        "help_style",
        "solution_policy",
        "teacher_alignment",
        "orthography_strictness",
        "orthography_affects_verdict",
        "interaction_firmness",
        "respect_enforcement",
        "participation_enforcement",
        "warning_budget"
    ],
    "reset_all": boolean
}

Regles d'interpretacio:
- `one_shot_instruction` nomes s'aplica a la resposta actual.
- `policy_patch` nomes s'ha d'emplenar amb canvis persistents que s'han de mantenir a partir d'ara en aquesta conversa.
- `reset_all=true` nomes quan el professor vulgui reiniciar tota la politica persistent.
- `reset_fields` nomes per reinicis parcials de camps persistents.
- Una ordre pot ser alhora puntual i persistent.
- Si hi ha dubte o ambiguitat, prefereix posar el contingut a `one_shot_instruction` i deixa `policy_patch` buit.
- No inventis canvis persistents si l'ordre no els expressa clarament.
- No retornis cap text addicional fora del JSON.
"""


# Mapping from our roles to canonical LLM history roles.
ROLE_MAP = {
    MessageRole.user: "user",
    MessageRole.assistant: "model",
    MessageRole.teacher: "user",  # teacher messages are sent as user context
    MessageRole.system: "user",  # system prompt is handled separately
}


def format_message_for_llm(content: str, sender_role: MessageRole) -> str:
    if sender_role == MessageRole.teacher:
        return f"[PROFESSOR: {content}]"
    if sender_role == MessageRole.user:
        return f"<<ALUMNE: {content}>>"
    return content


class LLMService:
    def __init__(self):
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)

        self.primary_provider = (settings.LLM_PROVIDER or "openai").strip().lower()
        self.openai_model_name = settings.OPENAI_MODEL
        self.gemini_model_name = settings.GEMINI_MODEL
        self.openai_client = None

        if OpenAI and settings.OPENAI_API_KEY:
            self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

    async def chat(
        self,
        system_prompt: str,
        history: list[dict],
        user_message: str,
        user_message_role: MessageRole = MessageRole.user,
        code_snapshot: str | None = None,
        execution_info: str | None = None,
    ) -> str:
        """Send a message to the configured LLM provider.

        Args:
            system_prompt: The system instruction.
            history: Previous messages as [{"role": "user"|"model", "content": str}].
            user_message: The new user message.
            user_message_role: Who sent the new message.
            code_snapshot: Optional current code from the student.
            execution_info: Optional execution/compilation status for current code.
        """
        # Build the full message
        full_message = ""
        if execution_info:
            full_message += f"{execution_info}\n\n"
        if code_snapshot:
            full_message += f"Codi actual de l'alumne:\n```python\n{code_snapshot}\n```\n\n"
        full_message += format_message_for_llm(user_message, user_message_role)

        last_error: Exception | None = None
        provider_attempts = self._provider_attempt_order()

        for provider in provider_attempts:
            try:
                return await self._chat_with_provider(
                    provider=provider,
                    system_prompt=system_prompt,
                    history=history,
                    full_message=full_message,
                )
            except Exception as exc:
                last_error = exc
                logger.warning("LLM provider '%s' failed: %s", provider, exc)

        if last_error:
            raise last_error
        raise RuntimeError("No LLM provider available")

    async def interpret_teacher_command(
        self,
        teacher_command: str,
        current_policy_state: TeacherPolicyState,
    ) -> TeacherCommandInterpretation:
        command = teacher_command.strip()
        if not command:
            return TeacherCommandInterpretation()

        user_prompt = (
            "Politica persistent actual en JSON:\n"
            f"{current_policy_state.model_dump_json()}\n\n"
            "Ordre nova del professor:\n"
            f"{command}\n"
        )

        provider_attempts = self._provider_attempt_order()
        for provider in provider_attempts:
            try:
                raw_response = await self._interpret_with_provider(
                    provider=provider,
                    user_prompt=user_prompt,
                )
                interpretation = self._parse_teacher_command_interpretation(raw_response)
                logger.debug("Teacher command interpretation: %s", interpretation.model_dump())
                return interpretation
            except Exception as exc:
                logger.warning("Teacher-command interpreter failed with '%s': %s", provider, exc)

        return TeacherCommandInterpretation(one_shot_instruction=command)

    def _provider_attempt_order(self) -> list[str]:
        provider = self.primary_provider
        if provider == "openai":
            return ["openai", "gemini"]
        if provider == "gemini":
            return ["gemini"]
        logger.warning("Unknown LLM_PROVIDER '%s', defaulting to openai->gemini", provider)
        return ["openai", "gemini"]

    async def _chat_with_provider(
        self,
        provider: str,
        system_prompt: str,
        history: list[dict],
        full_message: str,
    ) -> str:
        max_retries = max(0, settings.GEMINI_MAX_RETRIES)
        for attempt in range(max_retries + 1):
            try:
                if provider == "openai":
                    return self._generate_openai_response_text(system_prompt, history, full_message)
                return self._generate_gemini_response_text(system_prompt, history, full_message)
            except Exception as exc:
                is_last_attempt = attempt == max_retries
                if is_last_attempt or not self._is_retryable_error(exc):
                    raise
                await asyncio.sleep(self._get_retry_delay(attempt + 1))

        raise RuntimeError(f"{provider} request failed without returning or raising")

    async def _interpret_with_provider(self, provider: str, user_prompt: str) -> str:
        max_retries = max(0, settings.GEMINI_MAX_RETRIES)
        for attempt in range(max_retries + 1):
            try:
                if provider == "openai":
                    return self._generate_openai_json_response_text(
                        system_prompt=TEACHER_COMMAND_INTERPRETER_PROMPT,
                        user_prompt=user_prompt,
                    )
                return self._generate_gemini_json_response_text(
                    system_prompt=TEACHER_COMMAND_INTERPRETER_PROMPT,
                    user_prompt=user_prompt,
                )
            except Exception as exc:
                is_last_attempt = attempt == max_retries
                if is_last_attempt or not self._is_retryable_error(exc):
                    raise
                await asyncio.sleep(self._get_retry_delay(attempt + 1))

        raise RuntimeError(f"{provider} JSON request failed without returning or raising")

    def _generate_openai_response_text(
        self,
        system_prompt: str,
        history: list[dict],
        full_message: str,
    ) -> str:
        if not self.openai_client:
            raise RuntimeError("OPENAI_API_KEY missing or OpenAI package unavailable")

        logger.debug("=== OPENAI REQUEST ===")
        logger.debug("System prompt:\n%s", system_prompt)

        messages = self._build_openai_messages(system_prompt, history, full_message)
        response = self.openai_client.chat.completions.create(
            model=self.openai_model_name,
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
        )

        text = (response.choices[0].message.content or "").strip()
        logger.debug("=== OPENAI RESPONSE ===")
        logger.debug("%s", text)
        return text

    def _generate_gemini_response_text(
        self,
        system_prompt: str,
        history: list[dict],
        full_message: str,
    ) -> str:
        logger.debug("=== GEMINI REQUEST ===")
        logger.debug("System prompt:\n%s", system_prompt)

        gemini_history = [
            {"role": msg["role"], "parts": [msg["content"]]}
            for msg in history
        ]
        for i, msg in enumerate(gemini_history):
            logger.debug("History[%d] role=%s:\n%s", i, msg["role"], msg["parts"])
        logger.debug("User message:\n%s", full_message)

        model = genai.GenerativeModel(
            self.gemini_model_name,
            system_instruction=system_prompt if system_prompt else None,
        )
        chat_session = model.start_chat(history=gemini_history)

        response = chat_session.send_message(
            full_message,
            generation_config=genai.GenerationConfig(
                temperature=0.7,
                max_output_tokens=2048,
            ),
        )

        logger.debug("=== GEMINI RESPONSE ===")
        logger.debug("%s", response.text)
        return response.text

    def _generate_openai_json_response_text(self, system_prompt: str, user_prompt: str) -> str:
        if not self.openai_client:
            raise RuntimeError("OPENAI_API_KEY missing or OpenAI package unavailable")

        logger.debug("=== OPENAI TEACHER COMMAND REQUEST ===")
        logger.debug("System prompt:\n%s", system_prompt)
        logger.debug("User prompt:\n%s", user_prompt)

        response = self.openai_client.chat.completions.create(
            model=self.openai_model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        text = (response.choices[0].message.content or "").strip()
        logger.debug("=== OPENAI TEACHER COMMAND RESPONSE ===")
        logger.debug("%s", text)
        return text

    def _generate_gemini_json_response_text(self, system_prompt: str, user_prompt: str) -> str:
        logger.debug("=== GEMINI TEACHER COMMAND REQUEST ===")
        logger.debug("System prompt:\n%s", system_prompt)
        logger.debug("User prompt:\n%s", user_prompt)

        model = genai.GenerativeModel(
            self.gemini_model_name,
            system_instruction=system_prompt if system_prompt else None,
        )
        response = model.generate_content(
            user_prompt,
            generation_config=genai.GenerationConfig(
                temperature=0,
                max_output_tokens=1024,
                response_mime_type="application/json",
            ),
        )

        logger.debug("=== GEMINI TEACHER COMMAND RESPONSE ===")
        logger.debug("%s", response.text)

        return response.text

    def _build_openai_messages(
        self,
        system_prompt: str,
        history: list[dict],
        full_message: str,
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        for msg in history:
            role = self._to_openai_history_role(msg.get("role", "user"))
            messages.append({"role": role, "content": msg.get("content", "")})

        messages.append({"role": "user", "content": full_message})
        return messages

    def _to_openai_history_role(self, role: str) -> Literal["user", "assistant"]:
        if role == "model":
            return "assistant"
        return "user"

    def _parse_teacher_command_interpretation(
        self,
        raw_response: str,
    ) -> TeacherCommandInterpretation:
        cleaned = raw_response.strip()
        try:
            return TeacherCommandInterpretation.model_validate_json(cleaned)
        except Exception:
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            if not match:
                raise
            return TeacherCommandInterpretation.model_validate_json(match.group(0))

    def _is_retryable_error(self, error: Exception) -> bool:
        if RETRYABLE_API_ERRORS and isinstance(error, RETRYABLE_API_ERRORS):
            return True
        if OPENAI_RETRYABLE_API_ERRORS and isinstance(error, OPENAI_RETRYABLE_API_ERRORS):
            return True

        error_message = str(error).lower()
        return any(fragment in error_message for fragment in (
            "429",
            "resource exhausted",
            "too many requests",
            "rate limit",
            "timeout",
            "overloaded",
            "service unavailable",
            "502",
            "503",
            "504",
        ))

    def _get_retry_delay(self, attempt_number: int) -> float:
        delay = settings.GEMINI_RETRY_INITIAL_DELAY_SECONDS * (
            settings.GEMINI_RETRY_BACKOFF_MULTIPLIER ** max(0, attempt_number - 1)
        )
        return min(delay, settings.GEMINI_RETRY_MAX_DELAY_SECONDS)

    def parse_result(self, response: str) -> str | None:
        """Check if the LLM marked the exercise as correct or incorrect.

        Returns 'correct', 'incorrect', or None if no marker found.
        """
        if "[EXERCICI_CORRECTE]" in response:
            return "correct"
        if "[EXERCICI_INCORRECTE]" in response:
            return "incorrect"
        return None

    def has_chat_ended(self, response: str) -> bool:
        """Check if the LLM ended the chat with [XAT_FINALITZAT]."""
        return "[XAT_FINALITZAT]" in response

    def strip_result_markers(self, response: str) -> str:
        """Remove internal control markers before rendering chat text to users."""
        cleaned = response.replace("[EXERCICI_CORRECTE]", "")
        cleaned = cleaned.replace("[EXERCICI_INCORRECTE]", "")
        cleaned = cleaned.replace("[XAT_FINALITZAT]", "")
        # Hide teacher-only steering directives that should never appear to students.
        cleaned = re.sub(r"\[\s*PROFESSOR\s*:\s*[^\]]*\]", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\[\s*PROFESSOR\s*\]\s*:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\[\s*PROFESSOR\s*:\s*\]\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(
            r"<<\s*ALUMNE\s*:\s*(.*?)\s*>>",
            r"\1",
            cleaned,
            flags=re.IGNORECASE | re.DOTALL,
        )
        return cleaned.strip()


llm_service = LLMService()
