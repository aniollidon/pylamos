"""LLM service for interacting with Google Gemini Flash."""

import asyncio
import logging
import re
import google.generativeai as genai

logger = logging.getLogger(__name__)
from app.config import settings
from app.models.chat import MessageRole

try:
    from google.api_core.exceptions import ResourceExhausted, TooManyRequests

    RETRYABLE_API_ERRORS = (ResourceExhausted, TooManyRequests)
except ImportError:
    RETRYABLE_API_ERRORS = ()


# Mapping from our roles to Gemini roles
ROLE_MAP = {
    MessageRole.user: "user",
    MessageRole.assistant: "model",
    MessageRole.teacher: "user",  # teacher messages are sent as user context
    MessageRole.system: "user",  # system prompt is handled separately
}


class LLMService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model_name = "gemini-2.0-flash"

    async def chat(
        self,
        system_prompt: str,
        history: list[dict],
        user_message: str,
        code_snapshot: str | None = None,
        execution_info: str | None = None,
    ) -> str:
        """Send a message to Gemini and get a response.

        Args:
            system_prompt: The system instruction.
            history: Previous messages as [{"role": "user"|"model", "content": str}].
            user_message: The new user message.
            code_snapshot: Optional current code from the student.
            execution_info: Optional execution/compilation status for current code.
        """
        # Build the full message
        full_message = ""
        if execution_info:
            full_message += f"{execution_info}\n\n"
        if code_snapshot:
            full_message += f"Codi actual de l'alumne:\n```python\n{code_snapshot}\n```\n\n"
        full_message += f"<<{user_message}>>"

        # Build Gemini history
        gemini_history = []
        for msg in history:
            gemini_history.append({
                "role": msg["role"],
                "parts": [msg["content"]],
            })

        max_retries = max(0, settings.GEMINI_MAX_RETRIES)
        for attempt in range(max_retries + 1):
            try:
                return self._generate_response_text(
                    system_prompt=system_prompt,
                    gemini_history=gemini_history,
                    full_message=full_message,
                )
            except Exception as exc:
                is_last_attempt = attempt == max_retries
                if is_last_attempt or not self._is_retryable_error(exc):
                    raise

                await asyncio.sleep(self._get_retry_delay(attempt + 1))

        raise RuntimeError("Gemini request failed without returning or raising")

    def _generate_response_text(
        self,
        system_prompt: str,
        gemini_history: list[dict],
        full_message: str,
    ) -> str:
        logger.debug("=== GEMINI REQUEST ===")
        logger.debug("System prompt:\n%s", system_prompt)
        for i, msg in enumerate(gemini_history):
            logger.debug("History[%d] role=%s:\n%s", i, msg["role"], msg["parts"])
        logger.debug("User message:\n%s", full_message)

        model = genai.GenerativeModel(
            self.model_name,
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

    def _is_retryable_error(self, error: Exception) -> bool:
        if RETRYABLE_API_ERRORS and isinstance(error, RETRYABLE_API_ERRORS):
            return True

        error_message = str(error).lower()
        return any(fragment in error_message for fragment in (
            "429",
            "resource exhausted",
            "too many requests",
            "rate limit",
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
        return cleaned.strip()


llm_service = LLMService()
