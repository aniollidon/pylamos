from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./pylamos.db"
    JWT_SECRET_KEY: str = "CHANGE-ME"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    LLM_PROVIDER: str = "openai"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4.1-mini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GEMINI_MAX_RETRIES: int = 3
    GEMINI_RETRY_INITIAL_DELAY_SECONDS: float = 1.0
    GEMINI_RETRY_BACKOFF_MULTIPLIER: float = 2.0
    GEMINI_RETRY_MAX_DELAY_SECONDS: float = 8.0
    CORS_ORIGINS: str = '["http://localhost:5173", "http://127.0.0.1:5173", "http://192.168.19:5173"]'

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
