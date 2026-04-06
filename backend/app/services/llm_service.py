"""LLM service for interacting with Google Gemini Flash."""

import re
import google.generativeai as genai
from app.config import settings
from app.models.chat import MessageRole


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
        self.model = genai.GenerativeModel("gemini-2.0-flash")

    async def chat(
        self,
        system_prompt: str,
        history: list[dict],
        user_message: str,
        code_snapshot: str | None = None,
    ) -> str:
        """Send a message to Gemini and get a response.

        Args:
            system_prompt: The system instruction.
            history: Previous messages as [{"role": "user"|"model", "content": str}].
            user_message: The new user message.
            code_snapshot: Optional current code from the student.
        """
        # Build the full message
        full_message = ""
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

        # Create model with system instruction per request
        model = genai.GenerativeModel(
            "gemini-2.0-flash",
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
        return response.text

    def parse_result(self, response: str) -> str | None:
        """Check if the LLM marked the exercise as correct or incorrect.

        Returns 'correct', 'incorrect', or None if no marker found.
        """
        if "[EXERCICI_CORRECTE]" in response:
            return "correct"
        if "[EXERCICI_INCORRECTE]" in response:
            return "incorrect"
        return None

    def strip_result_markers(self, response: str) -> str:
        """Remove internal control markers before rendering chat text to users."""
        cleaned = response.replace("[EXERCICI_CORRECTE]", "")
        cleaned = cleaned.replace("[EXERCICI_INCORRECTE]", "")
        # Hide teacher-only steering directives that should never appear to students.
        cleaned = re.sub(r"\[\s*PROFESSOR\s*:\s*[^\]]*\]", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\[\s*PROFESSOR\s*\]\s*:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\[\s*PROFESSOR\s*:\s*\]\s*", "", cleaned, flags=re.IGNORECASE)
        return cleaned.strip()


llm_service = LLMService()
