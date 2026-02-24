"""
core/config.py — Application settings loaded from environment variables / .env file.

All settings are read by ``pydantic_settings.BaseSettings``, which first checks
actual environment variables (overriding .env values), making it easy to inject
production secrets via the container environment without modifying files on disk.

Sensitive defaults (JWT secret, Stripe keys) are intentional placeholders that
cause the app to work in development but should ALWAYS be overridden in any
deployed environment.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

from pydantic import ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Central configuration object.  One instance is created at module-import time
    (``settings = Settings()``) and shared across the application.
    """
    model_config = ConfigDict(env_file=".env", case_sensitive=False)
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/birthdaymessaging",
        alias="DATABASE_URL",
    )
    jwt_secret_key: str = Field(default="change-me-super-secret", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS")
    stripe_api_key: str = Field(default="sk_test_placeholder", alias="STRIPE_API_KEY")
    stripe_webhook_secret: str = Field(default="whsec_placeholder", alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_monthly: str = Field(default="price_monthly_placeholder", alias="STRIPE_PRICE_MONTHLY")
    stripe_price_yearly: str = Field(default="price_yearly_placeholder", alias="STRIPE_PRICE_YEARLY")
    cors_origins: list[str] = Field(default_factory=lambda: ["chrome-extension://*", "http://localhost:3000"])
    log_level: str = Field(default="INFO")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, value: Any) -> list[str]:
        # pydantic-settings may pass a pre-parsed list or a raw string
        if isinstance(value, list):
            return [str(o).strip() for o in value if str(o).strip()]
        if isinstance(value, str):
            stripped = value.strip()
            # JSON array format: ["origin1","origin2"]
            if stripped.startswith("["):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(o).strip() for o in parsed if str(o).strip()]
                except json.JSONDecodeError:
                    pass
            # Comma-separated fallback
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return list(value)  # type: ignore[arg-type]

settings = Settings()
