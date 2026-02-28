from __future__ import annotations

from typing import Iterable

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
    cors_origins: list[str] = Field(default_factory=lambda: ["chrome-extension://*", "http://localhost:3000"])
    log_level: str = Field(default="INFO")

    @field_validator("cors_origins", mode="before")
    def parse_cors(cls, value: Iterable[str] | str) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return list(value)

settings = Settings()
