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
import logging
from typing import Any, Iterable

from pydantic import ConfigDict, Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(
    env_file=".env", 
    case_sensitive=False,
    extra="ignore"
    )
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

    @field_validator("stripe_api_key", mode="after")
    @classmethod
    def validate_stripe_api_key(cls, v: str) -> str:
        if v in {"sk_test_placeholder", ""}:
            raise ValueError(
                "STRIPE_API_KEY is a placeholder. Set a real Stripe key (live or test) before starting. "
                "The app cannot start in a silently degraded billing state."
            )
        return v

    stripe_redirect_allowed_domains: list[str] = Field(
        default_factory=lambda: ["localhost"],
        alias="STRIPE_REDIRECT_ALLOWED_DOMAINS",
    )
    cors_origins: list[str] = Field(default_factory=lambda: ["chrome-extension://cpobkmncaokclgimgcefglokgigjlcoj"])
    log_level: str = Field(default="INFO")
    smtp_encryption_key: str = Field(default="generate-with-fernet", alias="SMTP_ENCRYPTION_KEY")
    sendgrid_api_key: str = Field(default="", alias="SENDGRID_API_KEY")
    email_from_address: str = Field(default="", alias="EMAIL_FROM_ADDRESS")
    password_reset_url_base: str = Field(default="", alias="PASSWORD_RESET_URL_BASE")
    email_verification_url_base: str = Field(default="", alias="EMAIL_VERIFICATION_URL_BASE")

    @field_validator("jwt_secret_key", mode="after")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        _INSECURE_DEFAULTS = {"change-me-super-secret", "secret", "changeme", ""}
        
        # Raise error if using a known default placeholder
        if v in _INSECURE_DEFAULTS:
            raise ValueError(
                f"JWT_SECRET_KEY cannot be a default placeholder. "
                f"Generate a secure random value (>= 32 chars) with: python -c \"import secrets; print(secrets.token_hex(16))\""
            )
        
        # Reject if too short — a short key is exploitable
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET_KEY is too short (< 32 chars). "
                "Generate a secure random value with: python -c \"import secrets; print(secrets.token_hex(16))\""
            )
        
        return v

    @field_validator("smtp_encryption_key", mode="after")
    @classmethod
    def validate_smtp_encryption_key(cls, v: str) -> str:
        if v == "generate-with-fernet":
            raise ValueError(
                "SMTP_ENCRYPTION_KEY cannot be the default placeholder. "
                "Generate a valid Fernet key with: "
                'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        return v

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

# Warn if a Stripe test key is used in a production-like environment
if settings.stripe_api_key.startswith("sk_test_") and settings.log_level.upper() in {
    "WARNING",
    "ERROR",
    "CRITICAL",
}:
    logging.getLogger(__name__).warning(
        "STRIPE_API_KEY is a test key (sk_test_*) but LOG_LEVEL=%s suggests a "
        "production environment. Set a live Stripe key before accepting real payments.",
        settings.log_level,
    )
