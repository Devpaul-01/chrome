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
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", case_sensitive=False, extra="ignore"
    )
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/birthdaymessaging",
        alias="DATABASE_URL",
    )
    jwt_secret_key: str = Field(
        default="change-me-super-secret", alias="JWT_SECRET_KEY"
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(
        default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    refresh_token_expire_days: int = Field(
        default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS"
    )
    stripe_api_key: str = Field(default="sk_test_placeholder", alias="STRIPE_API_KEY")
    stripe_webhook_secret: str = Field(
        default="whsec_placeholder", alias="STRIPE_WEBHOOK_SECRET"
    )
    stripe_price_monthly: str = Field(
        default="price_monthly_placeholder", alias="STRIPE_PRICE_MONTHLY"
    )
    stripe_price_yearly: str = Field(
        default="price_yearly_placeholder", alias="STRIPE_PRICE_YEARLY"
    )

    # Rapyd Payments - credentials remain server-side only.
    rapyd_base_url: str = Field(
        default="https://sandboxapi.rapyd.net",
        alias="RAPYD_BASE_URL",
    )
    rapyd_access_key: str = Field(default="", alias="RAPYD_ACCESS_KEY")
    rapyd_secret_key: str = Field(default="", alias="RAPYD_SECRET_KEY")
    rapyd_connect_timeout_seconds: float = Field(
        default=5.0, ge=1.0, le=30.0, alias="RAPYD_CONNECT_TIMEOUT_SECONDS"
    )
    rapyd_read_timeout_seconds: float = Field(
        default=20.0, ge=1.0, le=120.0, alias="RAPYD_READ_TIMEOUT_SECONDS"
    )
    rapyd_webhook_url: str = Field(default="", alias="RAPYD_WEBHOOK_URL")
    rapyd_webhook_max_age_seconds: int = Field(
        default=60, ge=30, le=300, alias="RAPYD_WEBHOOK_MAX_AGE_SECONDS"
    )
    rapyd_webhook_max_future_seconds: int = Field(
        default=5, ge=0, le=30, alias="RAPYD_WEBHOOK_MAX_FUTURE_SECONDS"
    )
    rapyd_webhook_max_body_bytes: int = Field(
        default=262144, ge=16384, le=1048576, alias="RAPYD_WEBHOOK_MAX_BODY_BYTES"
    )

    # PayPal Checkout - credentials remain server-side only.
    paypal_environment: str = Field(default="sandbox", alias="PAYPAL_ENVIRONMENT")
    paypal_client_id: str = Field(default="", alias="PAYPAL_CLIENT_ID")
    paypal_client_secret: str = Field(default="", alias="PAYPAL_CLIENT_SECRET")
    paypal_webhook_id: str = Field(default="", alias="PAYPAL_WEBHOOK_ID")
    paypal_return_url: str = Field(default="https://birthdaymessaging.com/payment/paypal/return", alias="PAYPAL_RETURN_URL")
    paypal_cancel_url: str = Field(default="https://birthdaymessaging.com/payment/paypal/cancel", alias="PAYPAL_CANCEL_URL")
    paypal_connect_timeout_seconds: float = Field(default=5.0, ge=1.0, le=30.0, alias="PAYPAL_CONNECT_TIMEOUT_SECONDS")
    paypal_read_timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0, alias="PAYPAL_READ_TIMEOUT_SECONDS")
    paypal_webhook_max_body_bytes: int = Field(default=262144, ge=16384, le=1048576, alias="PAYPAL_WEBHOOK_MAX_BODY_BYTES")

    # BTCPay Server
    btcpay_url: str = Field(
        default="https://btcpay.birthdaymessaging.io",
        alias="BTCPAY_URL",
    )
    btcpay_public_url: str = Field(
        default="https://btcpay.birthdaymessaging.io",
        alias="BTCPAY_PUBLIC_URL",
    )
    btcpay_store_id: str = Field(
        default="",
        alias="BTCPAY_STORE_ID",
    )
    btcpay_api_key: str = Field(
        default="",
        alias="BTCPAY_API_KEY",
    )
    btcpay_webhook_secret: str = Field(
    default="",
    alias="BTCPAY_WEBHOOK_SECRET",
    )

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
    cors_origins: list[str] = Field(
        default_factory=lambda: ["chrome-extension://cpobkmncaokclgimgcefglokgigjlcoj"]
    )
    log_level: str = Field(default="INFO")
    smtp_encryption_key: str = Field(
        default="generate-with-fernet", alias="SMTP_ENCRYPTION_KEY"
    )
    sendgrid_api_key: str = Field(default="", alias="SENDGRID_API_KEY")
    notification_provider: str = Field(default="cloudflare_smtp", alias="NOTIFICATION_PROVIDER")
    email_from_name: str = Field(default="BirthdayMessaging", alias="EMAIL_FROM_NAME")
    cloudflare_smtp_host: str = Field(default="smtp.mx.cloudflare.net", alias="CLOUDFLARE_SMTP_HOST")
    cloudflare_smtp_port: int = Field(default=465, alias="CLOUDFLARE_SMTP_PORT")
    cloudflare_smtp_username: str = Field(default="api_token", alias="CLOUDFLARE_SMTP_USERNAME")
    cloudflare_email_api_token: str = Field(default="", alias="CLOUDFLARE_EMAIL_API_TOKEN")
    cloudflare_smtp_timeout_seconds: int = Field(default=30, ge=5, le=120, alias="CLOUDFLARE_SMTP_TIMEOUT_SECONDS")
    account_url: str = Field(default="https://birthdaymessaging.com", alias="ACCOUNT_URL")
    support_email: str = Field(default="support@birthdaymessaging.com", alias="SUPPORT_EMAIL")
    notification_worker_batch_size: int = Field(default=50, ge=1, le=500, alias="NOTIFICATION_WORKER_BATCH_SIZE")
    notification_worker_interval_seconds: int = Field(default=30, ge=1, le=3600, alias="NOTIFICATION_WORKER_INTERVAL_SECONDS")
    rapyd_reconciliation_worker_batch_size: int = Field(default=50, ge=1, le=500, alias="RAPYD_RECONCILIATION_WORKER_BATCH_SIZE")
    rapyd_reconciliation_worker_interval_seconds: int = Field(default=60, ge=1, le=3600, alias="RAPYD_RECONCILIATION_WORKER_INTERVAL_SECONDS")
    notification_processing_lease_seconds: int = Field(default=900, ge=30, le=86400, alias="NOTIFICATION_PROCESSING_LEASE_SECONDS")
    notification_max_attempts: int = Field(default=5, ge=1, le=50, alias="NOTIFICATION_MAX_ATTEMPTS")
    notification_shutdown_grace_seconds: int = Field(default=30, ge=1, le=300, alias="NOTIFICATION_SHUTDOWN_GRACE_SECONDS")
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN")
    sentry_environment: str = Field(default="production", alias="SENTRY_ENVIRONMENT")
    email_from_address: str = Field(default="", alias="EMAIL_FROM_ADDRESS")
    password_reset_url_base: str = Field(default="", alias="PASSWORD_RESET_URL_BASE")
    email_verification_url_base: str = Field(
        default="", alias="EMAIL_VERIFICATION_URL_BASE"
    )

    @field_validator("jwt_secret_key", mode="after")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        _INSECURE_DEFAULTS = {"change-me-super-secret", "secret", "changeme", ""}

        # Raise error if using a known default placeholder
        if v in _INSECURE_DEFAULTS:
            raise ValueError(
                "JWT_SECRET_KEY cannot be a default placeholder. "
                'Generate a secure random value (>= 32 chars) with: python -c "import secrets; print(secrets.token_hex(16))"'
            )

        # Reject if too short — a short key is exploitable
        if len(v) < 32:
            raise ValueError(
                "JWT_SECRET_KEY is too short (< 32 chars). "
                'Generate a secure random value with: python -c "import secrets; print(secrets.token_hex(16))"'
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
